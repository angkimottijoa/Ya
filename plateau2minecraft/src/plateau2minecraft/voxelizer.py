"""
Voxelizing PLATEAU geometry.

FORK: rewritten. Upstream did this:

    num_submeshes = 1000
    submeshs = triangle_mesh.submesh(np.array_split(
        np.arange(len(triangle_mesh.faces)), num_submeshes))
    with Pool() as p:
        point_list = p.map(_sampling, submeshs)
    all_points = np.concatenate(point_list)

where `_sampling` ran `subdivide_to_size(..., 5.0)` then
`mesh.voxelized(1).hollow()` on each submesh. Three things go wrong, and
all three are visible in the output:

* The split is `np.array_split` over the *face index*, so a submesh is an
  arbitrary bag of triangles rather than a connected piece. `hollow()`
  fills from the outside of whatever it is handed, so on an open bag it
  keeps crusts where the bag ends -- the fused lumps between neighbouring
  buildings.
* Each submesh is voxelized on its own local grid, so two surfaces that
  meet get rasterized twice with different rounding and disagree along the
  seam.
* `num_submeshes` is fixed at 1000 regardless of size, so a small tile is
  split into mostly-empty pieces and a large one into pieces too big to
  help.

None of it is necessary, because a PLATEAU surface is a *planar polygon*.
Rasterizing it in its own plane onto one shared grid gives an exact,
gap-free shell with holes (windows, courtyards) preserved, needs no
triangulation, and cannot disagree with its neighbours because there is
only one grid. That also drops trimesh and open3d from the dependency
list, which between them are most of the install.
"""
import numpy as np

from plateau2minecraft.planar_voxels import surface_voxels
from plateau2minecraft.types import TriangleMesh


class PointCloud:
    """Minimal stand-in for trimesh's PointCloud.

    Only `.vertices` and `.colors` are ever used downstream, and carrying
    trimesh for two attributes is not worth the install.
    """

    def __init__(self, vertices, colors=None):
        self.vertices = np.asarray(vertices)
        self.colors = colors


def voxelize(mesh: TriangleMesh) -> PointCloud:
    """Voxelize a triangulated mesh, one triangle at a time, on one grid.

    Kept for callers that still hand over triangles. `voxelize_surfaces` is
    the better entry point: it never triangulates, so it never has to
    reassemble a polygon from its pieces.
    """
    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    triangles = np.asarray(mesh.triangles, dtype=np.int64)
    if len(triangles) == 0:
        return PointCloud(np.empty((0, 3)))

    chunks = []
    for face in triangles:
        chunks.append(surface_voxels([vertices[face]]))
    if not chunks:
        return PointCloud(np.empty((0, 3)))
    return PointCloud(np.unique(np.vstack(chunks), axis=0).astype(np.float64))


def voxelize_surfaces(surfaces) -> PointCloud:
    """Voxelize planar rings directly.

    `surfaces` yields lists of rings, [exterior, hole...], each an (n, 3)
    array in metres.
    """
    chunks = []
    for rings in surfaces:
        voxels = surface_voxels(rings)
        if len(voxels):
            chunks.append(voxels)
    if not chunks:
        return PointCloud(np.empty((0, 3)))
    return PointCloud(np.unique(np.vstack(chunks), axis=0).astype(np.float64))
