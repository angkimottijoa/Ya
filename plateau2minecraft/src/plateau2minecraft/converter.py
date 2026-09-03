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
                 data_version: int = 3337) -> None:
        """FORK: the world height range and target version are now the
        caller's to choose, rather than whatever the vendored anvil had
        hardcoded. `clipped` counts what still did not fit, so "nothing was
        cut" can be stated as a fact instead of hoped for."""
        self.point_cloud = point_cloud
        self.min_y = min_y
        self.max_y = max_y
        self.data_version = data_version
        self.clipped = 0

    def _point_shift(self, points: np.ndarray, x: float, y: float, z: float) -> np.ndarray:
        points += np.array([x, y, z])
        return points

    def _split_point_cloud(self, vertices: np.ndarray, block_size: int = 512) -> dict[str, np.ndarray]:
        # XYZ座標の取得
        x = vertices[:, 0]
        y = vertices[:, 1]

        # XY座標をブロックサイズで割って、整数値に丸めることでブロックIDを作成
        block_id_x = np.floor(x / block_size).astype(int)
        block_id_y = np.floor(y / block_size).astype(int)

        # ブロックIDを一意の文字列として結合
        block_ids = [f"r.{id_x}.{id_y}.mca" for id_x, id_y in zip(block_id_x, block_id_y)]

        # 各ブロックIDとそのブロックに含まれる座標を格納する辞書を作成
        blocks = {}
        for i, block_id in enumerate(block_ids):
            if block_id not in blocks:
                blocks[block_id] = []
            blocks[block_id].append(vertices[i])

        # ブロックIDと座標を含む辞書を返す
        return blocks

    def _standardize_vertices(self, blocks: dict[str, np.ndarray], block_size: int = 512):
        """FORK: `vertex % block_size` used to be applied to the whole vertex.

        A vertex is (x, y, altitude), so the modulo hit the altitude too.
        Anything at or above 512 m wrapped around and was drawn near the
        ground instead: Skytree's 634 m tip came out at y=122, buried
        inside whatever stood there. Between 320 and 511 it was silently
        swallowed by the OutOfBoundsCoordinates handler. That is what the
        manual's "高度300mを超えるような建物の場合...ブロックが生成されない
        可能性があります" actually is.

        Only the two horizontal axes belong in a region-local coordinate;
        altitude is absolute and is passed through untouched.
        """
        standardized_blocks = {}
        for block_id, vertices in blocks.items():
            standardized = []
            for vertex in vertices:
                local = np.array(vertex, dtype=np.float64)
                local[0] %= block_size
                local[1] %= block_size
                standardized.append(local)
            standardized_blocks[block_id] = standardized
        return standardized_blocks

    def build_region(self, output: Path, origin: tuple[float, float, float] | None = None) -> None:
        points = np.asarray(self.point_cloud.vertices)

        origin_point = self._get_world_origin(points) if origin is None else origin
        print(f"origin_point: {origin_point}")

        # 点群の中心を原点に移動
        points = self._point_shift(points, -origin_point[0], -origin_point[1], 0)
        # ボクセル中心を原点とする。ボクセルは1m間隔なので、原点を右に0.5m、下に0.5mずらす
        points = self._point_shift(points, 0.5, 0.5, 0)
        # Y軸を反転させて、Minecraftの南北とあわせる
        points[:, 1] *= -1

        # 原点を中心として、x軸方向に512m、y軸方向に512mの領域を作成する
        # 領域ごとに、ボクセルの点群を分割する
        # 分割した点群を、領域ごとに保存する
        blocks = self._split_point_cloud(points)
        standardized_blocks = self._standardize_vertices(blocks)

        stone = Block("minecraft", "stone")

        # FORK: this used to clear and create the *literal* path
        # "data/output/world_data/region" relative to the working directory,
        # while saving to `{output}/world_data/region`. Passing any --output
        # other than data/output therefore wiped an unrelated folder and then
        # crashed, because the folder actually being written to had never
        # been created.
        region_dir = Path(output) / "world_data" / "region"
        if region_dir.exists():
            for file in region_dir.iterdir():
                if file.is_file():
                    file.unlink()
        else:
            region_dir.mkdir(parents=True, exist_ok=True)

        for block_id, points in standardized_blocks.items():
            region = EmptyRegion(0, 0, min_y=self.min_y, max_y=self.max_y,
                                 version=self.data_version)
            points = np.asarray(points).astype(int)
            for row in points:
                x, y, z = row
                try:
                    # Minecraft is Y-up right-handed, hence the swap.
                    region.set_block(stone, x, z, y)
                except OutOfBoundsCoordinates:
                    self.clipped += 1
                    continue
            print(f"save: {block_id}")
            region.save(str(region_dir / block_id))

    def _get_world_origin(self, vertices):
        min_x = min(vertices[:, 0])
        max_x = max(vertices[:, 0])

        min_y = min(vertices[:, 1])
        max_y = max(vertices[:, 1])

        # 中心座標を求める
        center_x = (max_x + min_x) / 2
        center_y = (max_y + min_y) / 2

        # 中心座標を右に0.5m、下に0.5mずらす
        origin_point = (center_x + 0.5, center_y + 0.5)

        return origin_point
