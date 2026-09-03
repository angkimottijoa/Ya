from pathlib import Path

import numpy as np

# FORK: upstream imported `Path` from `click`, immediately shadowing the
# pathlib.Path it had imported on the line above, and pulled PointCloud from
# trimesh purely for a type hint. Both are gone; the voxelizer's own
# PointCloud is used instead.
from plateau2minecraft.voxelizer import PointCloud

from .anvil import Block, EmptyRegion
from .anvil.errors import OutOfBoundsCoordinates


class Minecraft:
    def __init__(self, point_cloud: PointCloud, min_y: int = -64, max_y: int = 319,
                 data_version: int = 3337, block_names=None) -> None:
        """FORK: three changes to what upstream took.

        * The world height range and target version are the caller's to
          choose, rather than whatever the vendored anvil had hardcoded.
        * `block_names` gives a block per point. Upstream placed
          `Block("minecraft", "stone")` for every voxel in the city; a
          per-point name is what lets a texture or a material decide.
        * `clipped` counts what still did not fit, so "nothing was cut" can
          be stated as a fact rather than hoped for.
        """
        self.point_cloud = point_cloud
        self.min_y = min_y
        self.max_y = max_y
        self.data_version = data_version
        self.block_names = block_names
        self.clipped = 0

    def _point_shift(self, points: np.ndarray, x: float, y: float, z: float) -> np.ndarray:
        points += np.array([x, y, z])
        return points

    def _get_world_origin(self, vertices):
        min_x, max_x = min(vertices[:, 0]), max(vertices[:, 0])
        min_y, max_y = min(vertices[:, 1]), max(vertices[:, 1])
        # Centre, then half a metre right and down so a voxel's centre sits
        # on the origin rather than its corner.
        return ((max_x + min_x) / 2 + 0.5, (max_y + min_y) / 2 + 0.5)

    def build_region(self, output, origin=None, return_origin=False):
        """Write the point cloud out as Anvil region files.

        FORK: rewritten around a dict of regions keyed by file name.
        Upstream built a fresh `EmptyRegion(0, 0)` per file inside the loop
        and saved it immediately, which is fine when every block is stone
        and each file is visited once. With a block per point, and with
        several block types landing in the same region, a region has to
        stay open until every point that belongs in it has been placed --
        otherwise each save overwrites the last.
        """
        points = np.asarray(self.point_cloud.vertices, dtype=np.float64).copy()
        names = self.block_names
        if names is None:
            names = np.full(len(points), "minecraft:stone", dtype=object)

        origin_point = self._get_world_origin(points) if origin is None else origin
        points = self._point_shift(points, -origin_point[0], -origin_point[1], 0)
        # Voxel centres, then flip Y so north on the map is north in game.
        points = self._point_shift(points, 0.5, 0.5, 0)
        points[:, 1] *= -1

        region_dir = Path(output) / "world_data" / "region"
        region_dir.mkdir(parents=True, exist_ok=True)

        blocks = {}
        for name in set(names):
            namespace, _, block_name = str(name).partition(":")
            blocks[name] = Block(namespace or "minecraft", block_name or "stone")

        integers = np.floor(points).astype(int)
        region_x = np.floor_divide(integers[:, 0], 512)
        region_z = np.floor_divide(integers[:, 1], 512)

        regions = {}
        for i in range(len(integers)):
            x, y, z = integers[i]
            key = (int(region_x[i]), int(region_z[i]))
            region = regions.get(key)
            if region is None:
                region = regions[key] = EmptyRegion(
                    key[0], key[1], min_y=self.min_y, max_y=self.max_y,
                    version=self.data_version)
            try:
                # Minecraft is Y-up right-handed, hence the swap: the
                # cloud's z is altitude.
                region.set_block(blocks[names[i]], int(x), int(z), int(y))
            except OutOfBoundsCoordinates:
                self.clipped += 1

        written = []
        for (rx, rz), region in regions.items():
            path = region_dir / f"r.{rx}.{rz}.mca"
            region.save(str(path))
            written.append(str(path))

        return (written, origin_point) if return_origin else written
