"""
Turning LOD2 surfaces into voxels, without the artefacts.

Project PLATEAU's converter voxelizes by splitting a tile's triangles into
exactly 1000 arbitrary submeshes (`np.array_split` over the face index),
running each through trimesh's `voxelized(1).hollow()`, and concatenating
the point clouds. Two things go wrong with that, and both are visible in
the output:

* The split is by face index, not by connectivity, so a submesh is almost
  never a closed solid. `hollow()` on an open mesh keeps whatever the
  voxelizer's fill decided at the boundary, which leaves crusts and blobs
  where two submeshes met and nothing where a thin wall fell between them.
* Every submesh voxelizes on its own local grid, so shared boundaries get
  rasterized twice with different rounding and buildings fuse into lumps.

This module never triangulates and never splits. A PLATEAU surface is a
planar polygon, so it is rasterized *in its own plane* on one global voxel
grid: build an orthonormal basis in the plane, project the rings into 2D,
scanline-fill them with the same even-odd routine that draws footprints
(so holes -- windows, courtyards -- come out hollow), and lift the filled
samples back into 3D. Sampling at half a block guarantees a gap-free shell
for any orientation, and because every surface writes into the same grid,
adjacent surfaces agree by construction.
"""
import math

import numpy as np

# Half a block between samples: the largest step that cannot leave a hole
# in a shell of unit voxels at any surface orientation.
_SAMPLE_STEP = 0.5


def plane_basis(points):
    """An orthonormal (origin, u, v, normal) for a nearly planar ring.

    Uses Newell's method for the normal, which averages over every edge and
    so tolerates the small non-planarity real CityGML polygons carry --
    picking three vertices instead would pivot the whole plane whenever the
    three chosen happened to be nearly collinear.
    """
    normal = np.zeros(3)
    rolled = np.roll(points, -1, axis=0)
    normal[0] = np.sum((points[:, 1] - rolled[:, 1]) * (points[:, 2] + rolled[:, 2]))
    normal[1] = np.sum((points[:, 2] - rolled[:, 2]) * (points[:, 0] + rolled[:, 0]))
    normal[2] = np.sum((points[:, 0] - rolled[:, 0]) * (points[:, 1] + rolled[:, 1]))

    length = np.linalg.norm(normal)
    if length < 1e-9:
        return None
    normal = normal / length

    # Any axis not nearly parallel to the normal seeds the in-plane basis.
    seed = np.array([1.0, 0.0, 0.0]) if abs(normal[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    u = np.cross(normal, seed)
    u = u / np.linalg.norm(u)
    v = np.cross(normal, u)
    return points[0].copy(), u, v, normal


def _fill_scanlines(rings_2d, step):
    """Even-odd fill of projected rings, as (n, 2) sample coordinates.

    Exterior rings are unioned and interior rings subtracted, matching how
    `voxel.rasterize` treats footprints: a building split into parts must
    not XOR itself away, and a window must actually be a hole.
    """
    all_points = np.vstack(rings_2d)
    lo = all_points.min(axis=0)
    hi = all_points.max(axis=0)

    rows = np.arange(lo[1], hi[1] + step, step)
    columns = np.arange(lo[0], hi[0] + step, step)
    if len(rows) == 0 or len(columns) == 0:
        return np.empty((0, 2))

    samples = []
    for row_v in rows:
        exterior = np.zeros(len(columns), dtype=bool)
        interior = np.zeros(len(columns), dtype=bool)
        for index, ring in enumerate(rings_2d):
            spans = _row_spans(ring, row_v)
            if spans is None:
                continue
            mask = np.zeros(len(columns), dtype=bool)
            for start, end in spans:
                mask |= (columns >= start) & (columns <= end)
            if index == 0:
                exterior |= mask
            else:
                interior |= mask

        keep = exterior & ~interior
        if not keep.any():
            continue
        kept = columns[keep]
        samples.append(np.column_stack([kept, np.full(len(kept), row_v)]))

    if not samples:
        return np.empty((0, 2))
    return np.vstack(samples)


def _row_spans(ring, row_v):
    """Inside intervals where a scanline crosses one ring, or None."""
    a = ring
    b = np.roll(ring, -1, axis=0)
    # Half-open crossing test, so a vertex sitting exactly on the scanline
    # contributes once rather than twice.
    crossing = (a[:, 1] <= row_v) != (b[:, 1] <= row_v)
    if not crossing.any():
        return None
    ay, by = a[crossing, 1], b[crossing, 1]
    ax, bx = a[crossing, 0], b[crossing, 0]
    hits = np.sort(ax + (row_v - ay) / (by - ay) * (bx - ax))
    return list(zip(hits[0::2], hits[1::2]))


def surface_voxels(rings_3d, step=_SAMPLE_STEP):
    """Integer voxel coordinates covering one planar polygon.

    `rings_3d` is [exterior, hole...] as (n, 3) arrays already in block
    space (metres, one unit per block).
    """
    exterior = np.asarray(rings_3d[0], dtype=np.float64)
    if len(exterior) < 3:
        return np.empty((0, 3), dtype=np.int64)

    basis = plane_basis(exterior)
    if basis is None:
        return np.empty((0, 3), dtype=np.int64)
    origin, u, v, _normal = basis

    rings_2d = []
    for ring in rings_3d:
        ring = np.asarray(ring, dtype=np.float64) - origin
        rings_2d.append(np.column_stack([ring @ u, ring @ v]))

    filled = _fill_scanlines(rings_2d, step)
    if len(filled) == 0:
        # A polygon thinner than the sample step still has to leave a mark,
        # or a parapet or a railing silently disappears. Fall back to
        # walking its outline.
        return _edge_voxels(rings_2d[0], origin, u, v, step)

    points = origin + np.outer(filled[:, 0], u) + np.outer(filled[:, 1], v)
    edges = _edge_points(rings_2d, origin, u, v, step)
    if len(edges):
        points = np.vstack([points, edges])
    # Half-block sampling means roughly four samples land in every voxel;
    # dropping the duplicates here keeps a whole ward's worth of surfaces
    # from carrying 4x the memory it needs all the way to the accumulator.
    return np.unique(np.floor(points).astype(np.int64), axis=0)


def _edge_points(rings_2d, origin, u, v, step):
    """Samples along every ring edge, so borders are never a half-block short."""
    out = []
    for ring in rings_2d:
        a = ring
        b = np.roll(ring, -1, axis=0)
        lengths = np.linalg.norm(b - a, axis=1)
        for start, end, length in zip(a, b, lengths):
            if length < 1e-9:
                continue
            count = int(math.ceil(length / step)) + 1
            t = np.linspace(0.0, 1.0, count)[:, None]
            out.append(start + t * (end - start))
    if not out:
        return np.empty((0, 3))
    flat = np.vstack(out)
    return origin + np.outer(flat[:, 0], u) + np.outer(flat[:, 1], v)


def _edge_voxels(ring_2d, origin, u, v, step):
    points = _edge_points([ring_2d], origin, u, v, step)
    if len(points) == 0:
        return np.empty((0, 3), dtype=np.int64)
    return np.floor(points).astype(np.int64)


class VoxelAccumulator:
    """Collects voxels per surface class, on one shared integer grid."""

    def __init__(self):
        self._by_class = {}

    def add(self, surface_class, voxels):
        if len(voxels) == 0:
            return
        bucket = self._by_class.setdefault(surface_class, [])
        bucket.append(voxels)

    def classes(self):
        return sorted(self._by_class)

    def finish(self, order=None):
        """(voxels, class_index, class_keys) with duplicates removed.

        Where two classes claim the same voxel the earlier one in `order`
        wins: a parapet belongs to the roof line, not to the wall below it.
        """
        names = self.classes()
        if order:
            rank = {name: i for i, name in enumerate(order)}
            names.sort(key=lambda key: rank.get(
                key[1] if isinstance(key, tuple) else key, len(rank)))
        if not names:
            return (np.empty((0, 3), dtype=np.int64), np.empty(0, dtype=np.int16), [])

        chunks = []
        labels = []
        for index, name in enumerate(names):
            block = np.vstack(self._by_class[name])
            chunks.append(block)
            labels.append(np.full(len(block), index, dtype=np.int16))

        voxels = np.vstack(chunks)
        classes = np.concatenate(labels)

        order = np.lexsort((classes, voxels[:, 2], voxels[:, 1], voxels[:, 0]))
        voxels = voxels[order]
        classes = classes[order]

        keep = np.ones(len(voxels), dtype=bool)
        keep[1:] = np.any(voxels[1:] != voxels[:-1], axis=1)
        return voxels[keep], classes[keep], names
