"""
Cleaning up voxelized LOD2 geometry.

FORK: added. Three passes, all optional, over a sparse voxel set held as
packed int64 keys (21 bits per axis, offset to stay non-negative) so that
"is this neighbour filled?" is a sorted-array lookup and a whole ward's
worth of voxels can be swept in seconds.

* `despeckle` drops the grit that degenerate LOD2 polygons leave floating
  beside a building -- zero-thickness plates, stray installation surfaces.
* `close_pinholes` patches the one-voxel seams where two surfaces meet at
  a shallow angle and the shell comes up short. It deliberately will not
  fill a window: an opening has too much air around it to look like a seam.
* `smooth` takes the stair-stepping off curved walls. A cylindrical tower
  voxelized at one metre is a staircase with single-voxel spurs and
  notches; each pass drops the spurs and fills the notches.

`smooth` is the one that needs a guard. A strong setting must not be
allowed to eat the building, so a pass that would change more than
`max_change` of the model is abandoned and the previous state kept -- a
smoother that quietly dissolves a spire is worse than no smoother.
"""
import numpy as np


# 21 bits per axis covers +-1,048,575 blocks, far past anything a city
# build reaches, and three of them fit in an int64 with a bit to spare.
_BITS = 21
_MASK = (1 << _BITS) - 1
_OFFSET = 1 << (_BITS - 1)

# Roofs are laid down before walls so that where a parapet is claimed by
# both, the roof line wins.
def pack(voxels):
    """(n, 3) int coordinates -> (n,) int64 keys."""
    x = (voxels[:, 0] + _OFFSET) & _MASK
    y = (voxels[:, 1] + _OFFSET) & _MASK
    z = (voxels[:, 2] + _OFFSET) & _MASK
    return (x << (2 * _BITS)) | (y << _BITS) | z


def unpack(keys):
    x = ((keys >> (2 * _BITS)) & _MASK) - _OFFSET
    y = ((keys >> _BITS) & _MASK) - _OFFSET
    z = (keys & _MASK) - _OFFSET
    return np.column_stack([x, y, z]).astype(np.int64)


_NEIGHBOURS_6 = np.array([[1, 0, 0], [-1, 0, 0], [0, 1, 0],
                          [0, -1, 0], [0, 0, 1], [0, 0, -1]])
_NEIGHBOURS_26 = np.array([[dx, dy, dz]
                           for dx in (-1, 0, 1) for dy in (-1, 0, 1) for dz in (-1, 0, 1)
                           if (dx, dy, dz) != (0, 0, 0)])


def _neighbour_counts(voxels, sorted_keys, offsets):
    counts = np.zeros(len(voxels), dtype=np.int16)
    for offset in offsets:
        probe = pack(voxels + offset)
        position = np.searchsorted(sorted_keys, probe)
        position = np.clip(position, 0, len(sorted_keys) - 1)
        counts += (sorted_keys[position] == probe).astype(np.int16)
    return counts


def despeckle(voxels, classes, min_neighbours=2):
    """Drop voxels barely attached to anything.

    LOD2 data carries slivers -- degenerate polygons, stray installation
    surfaces, a balcony railing modelled as a zero-thickness plate -- which
    voxelize into loose grit floating beside a building. Anything with
    fewer than `min_neighbours` of its 26 neighbours filled is grit.
    """
    if len(voxels) == 0:
        return voxels, classes
    # Measured both ways: the emitted-count trick that makes close_pinholes
    # ten times faster is a pessimisation here, because 26 offsets emit 26N
    # keys and sorting them costs more than the 26 sorted lookups it saves.
    keys = np.sort(pack(voxels))
    counts = _neighbour_counts(voxels, keys, _NEIGHBOURS_26)
    keep = counts >= min_neighbours
    return voxels[keep], classes[keep]


def close_pinholes(voxels, classes, min_filled=4):
    """Fill empty cells that are all but surrounded.

    Where two LOD2 surfaces meet at a shallow angle the rasterized shell
    can come up one voxel short along the seam, which reads in game as a
    pinhole you can see daylight through. An empty cell with at least
    `min_filled` of its six face neighbours occupied is such a seam, never
    an interior and never an opening -- a window has far too much air
    around it to qualify.

    Everything here works on packed int64 keys rather than on (n, 3)
    arrays. `np.unique(..., axis=0)` over the six candidate copies of a
    city -- tens of millions of rows -- lexsorts a structured view and
    dominated the whole conversion; the same uniqueness over a flat int64
    array is roughly an order of magnitude quicker and allocates a third
    as much.
    """
    if len(voxels) == 0:
        return voxels, classes

    filled_keys = pack(voxels)
    order = np.argsort(filled_keys)
    filled_sorted = filled_keys[order]
    classes_sorted = classes[order]

    # Offsetting every filled voxel by each of the six face directions emits
    # one entry per (filled voxel, direction) pair, so a cell's neighbour
    # count *is* how many times its key was emitted. Counting the duplicates
    # therefore answers the question outright, and the separate neighbour
    # sweep that used to follow -- six searchsorted passes over every
    # candidate, the single most expensive thing in the conversion -- is not
    # needed at all.
    candidate_keys, neighbour_counts = np.unique(
        np.concatenate([pack(voxels + offset) for offset in _NEIGHBOURS_6]),
        return_counts=True)

    enclosed = neighbour_counts >= min_filled
    candidate_keys = candidate_keys[enclosed]
    if len(candidate_keys) == 0:
        return voxels, classes

    position = np.clip(np.searchsorted(filled_sorted, candidate_keys),
                       0, len(filled_sorted) - 1)
    candidate_keys = candidate_keys[filled_sorted[position] != candidate_keys]
    if len(candidate_keys) == 0:
        return voxels, classes

    added = unpack(candidate_keys)

    # A patched seam takes the class of the nearest filled voxel below it in
    # key order; seams almost always sit between two surfaces of one class.
    nearest = np.clip(np.searchsorted(filled_sorted, pack(added)) - 1,
                      0, len(filled_sorted) - 1)
    added_classes = classes_sorted[nearest]

    return np.vstack([voxels, added]), np.concatenate([classes, added_classes])


def smooth(voxels, classes, strength=1, max_change=0.06):
    """Take the stair-stepping off curved surfaces.

    A cylindrical tower voxelized at one metre comes out as a staircase
    with single-voxel spurs and notches along it, which is the roughness
    that shows up worst in game. Two morphological passes fix it: drop a
    voxel with almost nothing attached to it (a spur), then fill a cell
    that is nearly enclosed (a notch). `strength` repeats them.

    The point of `max_change` is that a strong setting must not be allowed
    to eat the building. If a pass would alter more than that fraction of
    the model, it is abandoned and the previous state is kept -- a smoother
    that quietly dissolves a spire is worse than no smoother at all. The
    caller is told how much actually changed.
    """
    if strength <= 0 or len(voxels) == 0:
        return voxels, classes, 0

    changed = 0
    for _ in range(int(strength)):
        before = len(voxels)

        keys = np.sort(pack(voxels))
        counts = _neighbour_counts(voxels, keys, _NEIGHBOURS_6)
        # A face voxel on a flat wall has 4 face neighbours; on an edge, 3;
        # a spur has 2 or fewer.
        keep = counts >= 3
        removed = int((~keep).sum())
        if removed and removed <= max_change * before:
            voxels, classes = voxels[keep], classes[keep]
            changed += removed
        elif removed:
            # Too much would go: the model is thin or filigree, not rough.
            break

        patched_voxels, patched_classes = close_pinholes(voxels, classes, min_filled=4)
        added = len(patched_voxels) - len(voxels)
        if added and added <= max_change * len(voxels):
            voxels, classes = patched_voxels, patched_classes
            changed += added
        elif added:
            break

    return voxels, classes, changed
