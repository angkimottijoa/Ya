"""
LOD2 voxels -> chunks, with the artefact clean-up applied on the way.

Holds one sparse voxel set for the whole build rather than a dense grid: a
2 km square of LOD2 surfaces is a few million voxels, which is nothing as
coordinate triples and would be 1.5 billion cells dense.

Voxel identity is a packed int64 key (21 bits per axis, offset to keep it
non-negative), which makes "is this neighbour filled?" a sorted-array
lookup instead of a Python set membership test, and so makes the clean-up
passes run over millions of voxels in seconds.
"""
import numpy as np

from .surfaces import CLOSURE, GROUND, OPENING, OTHER, ROOF, WALL

# 21 bits per axis covers +-1,048,575 blocks, far past anything a city
# build reaches, and three of them fit in an int64 with a bit to spare.
_BITS = 21
_MASK = (1 << _BITS) - 1
_OFFSET = 1 << (_BITS - 1)

# Roofs are laid down before walls so that where a parapet is claimed by
# both, the roof line wins.
CLASS_PRIORITY = (ROOF, WALL, GROUND, CLOSURE, OPENING, OTHER)

# Per surface class, per feature package. Chosen so a converted city reads
# at a glance rather than being the single grey mass the upstream converter
# produces.
DEFAULT_BLOCKS = {
    ("bldg", ROOF): "minecraft:deepslate_tiles",
    ("bldg", WALL): "minecraft:light_gray_concrete",
    ("bldg", GROUND): "minecraft:stone",
    ("bldg", CLOSURE): "minecraft:light_gray_concrete",
    ("bldg", OPENING): "minecraft:glass",
    ("bldg", OTHER): "minecraft:light_gray_concrete",
    ("tran", GROUND): "minecraft:gray_concrete_powder",
    ("tran", OTHER): "minecraft:gray_concrete_powder",
    ("brid", OTHER): "minecraft:stone_bricks",
    ("brid", GROUND): "minecraft:stone_bricks",
    ("frn", OTHER): "minecraft:polished_andesite",
    ("veg", OTHER): "minecraft:oak_leaves",
}
FALLBACK_BLOCK = "minecraft:stone"


def block_for(feature, surface_class, overrides=None):
    table = dict(DEFAULT_BLOCKS)
    if overrides:
        table.update(overrides)
    return (table.get((feature, surface_class))
            or table.get((feature, OTHER))
            or FALLBACK_BLOCK)


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
    keys = np.sort(pack(voxels))
    counts = _neighbour_counts(voxels, keys, _NEIGHBOURS_26)
    keep = counts >= min_neighbours
    return voxels[keep], classes[keep]


def close_pinholes(voxels, classes, min_filled=4):
    """Fill empty cells that are all but surrounded.

    Where two LOD2 surfaces meet at a shallow angle the rasterized shell
    can be one voxel short along the seam, which reads in game as a
    pinhole you can see daylight through. An empty cell with at least
    `min_filled` of its 6 face neighbours occupied is such a seam, never an
    interior or an opening.
    """
    if len(voxels) == 0:
        return voxels, classes

    filled = np.sort(pack(voxels))
    candidates = []
    for offset in _NEIGHBOURS_6:
        candidates.append(voxels + offset)
    candidate_voxels = np.unique(np.vstack(candidates), axis=0)

    candidate_keys = pack(candidate_voxels)
    position = np.clip(np.searchsorted(filled, candidate_keys), 0, len(filled) - 1)
    empty = filled[position] != candidate_keys
    candidate_voxels = candidate_voxels[empty]
    if len(candidate_voxels) == 0:
        return voxels, classes

    counts = _neighbour_counts(candidate_voxels, filled, _NEIGHBOURS_6)
    added = candidate_voxels[counts >= min_filled]
    if len(added) == 0:
        return voxels, classes

    # A patched seam takes the class of whichever neighbour is most common,
    # approximated by the nearest filled voxel below it -- seams almost
    # always sit between two surfaces of the same class.
    nearest = np.clip(np.searchsorted(filled, pack(added)) - 1, 0, len(voxels) - 1)
    order = np.argsort(pack(voxels))
    added_classes = classes[order][nearest]

    return np.vstack([voxels, added]), np.concatenate([classes, added_classes])


class MeshCity:
    """Sparse LOD2 voxels, indexed by chunk and ready to write."""

    def __init__(self, voxels, classes, palette, min_y, max_y):
        self.min_y = min_y
        self.max_y = max_y
        self.palette = palette          # class index -> block name
        self.clipped = 0

        if len(voxels):
            inside = (voxels[:, 2] >= min_y) & (voxels[:, 2] <= max_y)
            self.clipped = int((~inside).sum())
            voxels = voxels[inside]
            classes = classes[inside]

        self.voxels = voxels
        self.classes = classes
        self._index = self._build_index()

    def _build_index(self):
        index = {}
        if len(self.voxels) == 0:
            return index
        chunk_x = self.voxels[:, 0] >> 4
        chunk_z = self.voxels[:, 1] >> 4
        order = np.lexsort((chunk_z, chunk_x))
        self.voxels = self.voxels[order]
        self.classes = self.classes[order]
        chunk_x, chunk_z = chunk_x[order], chunk_z[order]

        boundaries = np.flatnonzero(
            (chunk_x[1:] != chunk_x[:-1]) | (chunk_z[1:] != chunk_z[:-1])) + 1
        starts = np.concatenate([[0], boundaries])
        ends = np.concatenate([boundaries, [len(self.voxels)]])
        for start, end in zip(starts, ends):
            index[(int(chunk_x[start]), int(chunk_z[start]))] = (int(start), int(end))
        return index

    def chunk_keys(self):
        return sorted(self._index)

    def fill(self, chunk):
        """Write this chunk's voxels into an `anvil.ChunkBuilder`."""
        span = self._index.get((chunk.chunk_x, chunk.chunk_z))
        if span is None:
            return
        start, end = span
        voxels = self.voxels[start:end]
        classes = self.classes[start:end]

        ids = {}
        for class_index in np.unique(classes):
            ids[int(class_index)] = chunk.block_id(self.palette[int(class_index)])

        local_x = (voxels[:, 0] & 15).astype(np.int64)
        local_z = (voxels[:, 1] & 15).astype(np.int64)
        local_y = (voxels[:, 2] - self.min_y).astype(np.int64)
        for class_index, block_id in ids.items():
            picked = classes == class_index
            chunk.blocks[local_x[picked], local_y[picked], local_z[picked]] = block_id
