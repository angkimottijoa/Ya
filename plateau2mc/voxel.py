"""
PLATEAU buildings -> Minecraft voxels.

Three jobs live here: turning geographic building outlines into block-space
footprints, guessing a terrain surface out of the altitudes those outlines
sit at, and extruding the result into a chunk.

The terrain guess is worth explaining. PLATEAU building geometry carries
absolute altitude (metres above Tokyo Peil), so the base ring of every
building is a free elevation sample. Scattering those samples onto a coarse
grid and smoothing recovers the real shape of the city -- the Yamanote
uplands standing ~20 m over the Shitamachi lowlands, the Arakawa flood
plain, the cut of the Kanda river valley. It is not a substitute for the
GSI's 5 m DEM, and it flattens out over parks, water and rail yards where
no buildings sample it, but it needs no second dataset and no GDAL.
"""
import math
from dataclasses import dataclass

import numpy as np


@dataclass
class Materials:
    """Block choices, keyed by how tall the building is.

    The tiers are a rough read of Tokyo's actual building stock: dense
    low-rise in concrete and tile, mid-rise offices in pale panelling, and
    glass towers above roughly the 25-storey mark.
    """

    bedrock: str = "minecraft:bedrock"
    deep: str = "minecraft:stone"
    subsoil: str = "minecraft:dirt"
    surface: str = "minecraft:grass_block"
    water: str = "minecraft:water"

    tiers: tuple = (
        # (max height in metres, wall block, roof block)
        (10.0, "minecraft:light_gray_concrete", "minecraft:gray_concrete"),
        (30.0, "minecraft:white_concrete", "minecraft:light_gray_concrete"),
        (80.0, "minecraft:smooth_quartz", "minecraft:gray_concrete"),
        (math.inf, "minecraft:light_blue_stained_glass", "minecraft:smooth_quartz"),
    )

    def for_height(self, height):
        for limit, wall, roof in self.tiers:
            if height <= limit:
                return wall, roof
        return self.tiers[-1][1], self.tiers[-1][2]


@dataclass
class Footprint:
    """One building outline in block space.

    `rings` is [(is_exterior, ndarray of shape (N, 2))] holding x/z block
    coordinates as floats -- kept sub-block so the rasterizer can sample
    cell centres rather than snapping outlines outward.
    """

    rings: list
    ground_alt: float
    height: float
    min_x: int = 0
    max_x: int = 0
    min_z: int = 0
    max_z: int = 0

    def compute_bounds(self):
        xs = np.concatenate([ring[:, 0] for _, ring in self.rings])
        zs = np.concatenate([ring[:, 1] for _, ring in self.rings])
        self.min_x, self.max_x = int(math.floor(xs.min())), int(math.ceil(xs.max()))
        self.min_z, self.max_z = int(math.floor(zs.min())), int(math.ceil(zs.max()))
        return self


def project_footprints(buildings, projector, origin_east, origin_north,
                       max_height=None):
    """Project `Building`s into block space around a chosen origin.

    Minecraft's +Z axis points south, so northings are negated: north on the
    map ends up as -Z in game, and the in-world compass agrees with a real
    one.
    """
    footprints = []
    for building in buildings:
        rings = []
        for is_exterior, ring in building.rings:
            points = np.empty((len(ring), 2), dtype=np.float64)
            for i, (lat, lon, _alt) in enumerate(ring):
                east, north = projector(lat, lon)
                points[i, 0] = east - origin_east
                points[i, 1] = -(north - origin_north)
            rings.append((is_exterior, points))
        if not rings:
            continue
        height = building.height
        if max_height is not None:
            height = min(height, max_height)
        footprints.append(Footprint(rings, building.base_alt, height).compute_bounds())
    return footprints


def _fill_ring(ring, x0, z0, width, depth, out):
    """Even-odd scanline fill of one ring into `out` (bool, [width, depth])."""
    x1 = ring[:, 0]
    z1 = ring[:, 1]
    x2 = np.roll(x1, -1)
    z2 = np.roll(z1, -1)

    for j in range(depth):
        z_centre = z0 + j + 0.5
        # Half-open crossing test: an edge counts when exactly one endpoint
        # is at or below the scanline, which makes shared vertices contribute
        # once instead of twice.
        crossing = (z1 <= z_centre) != (z2 <= z_centre)
        if not crossing.any():
            continue
        za, zb = z1[crossing], z2[crossing]
        xa, xb = x1[crossing], x2[crossing]
        hits = np.sort(xa + (z_centre - za) / (zb - za) * (xb - xa))
        for k in range(0, len(hits) - 1, 2):
            start = int(math.ceil(hits[k] - x0 - 0.5))
            end = int(math.floor(hits[k + 1] - x0 - 0.5))
            if end < 0 or start > width - 1:
                continue
            out[max(start, 0):min(end, width - 1) + 1, j] = True


def rasterize(footprint, x0, z0, width, depth):
    """Boolean [width, depth] mask of a footprint over a block window.

    Exterior rings are unioned rather than XOR-ed so that a building split
    into overlapping `BuildingPart`s does not punch itself out; interior
    rings are then subtracted, which is what makes courtyards hollow.
    """
    exterior = np.zeros((width, depth), dtype=bool)
    interior = np.zeros((width, depth), dtype=bool)
    for is_exterior, ring in footprint.rings:
        target = np.zeros((width, depth), dtype=bool)
        _fill_ring(ring, x0, z0, width, depth, target)
        if is_exterior:
            exterior |= target
        else:
            interior |= target
    return exterior & ~interior


def _shell(mask):
    """Cells of `mask` that touch the outside -- the building's walls.

    Whether a cell is a wall depends on its four neighbours, so callers must
    hand in a mask with a one-cell margin of real data around the region
    they care about and crop afterwards. Guessing at the margin instead
    punches a hole in every wall that runs along a chunk boundary.
    """
    eroded = mask.copy()
    eroded[1:, :] &= mask[:-1, :]
    eroded[:-1, :] &= mask[1:, :]
    eroded[:, 1:] &= mask[:, :-1]
    eroded[:, :-1] &= mask[:, 1:]
    return mask & ~eroded


class TerrainField:
    """Coarse elevation surface interpolated from building base altitudes."""

    def __init__(self, footprints, cell_size=32, default_alt=0.0, smoothing=2):
        self.cell_size = cell_size
        self.default_alt = default_alt
        if not footprints:
            self._grid = None
            return

        min_x = min(f.min_x for f in footprints)
        max_x = max(f.max_x for f in footprints)
        min_z = min(f.min_z for f in footprints)
        max_z = max(f.max_z for f in footprints)
        self.origin_x = math.floor(min_x / cell_size) - 1
        self.origin_z = math.floor(min_z / cell_size) - 1
        width = math.ceil(max_x / cell_size) - self.origin_x + 2
        depth = math.ceil(max_z / cell_size) - self.origin_z + 2

        total = np.zeros((width, depth))
        count = np.zeros((width, depth))
        for footprint in footprints:
            cx = int((footprint.min_x + footprint.max_x) / 2 / cell_size) - self.origin_x
            cz = int((footprint.min_z + footprint.max_z) / 2 / cell_size) - self.origin_z
            cx = min(max(cx, 0), width - 1)
            cz = min(max(cz, 0), depth - 1)
            total[cx, cz] += footprint.ground_alt
            count[cx, cz] += 1

        grid = np.where(count > 0, total / np.maximum(count, 1), np.nan)
        self._grid = _fill_and_smooth(grid, default_alt, smoothing)

    def sample(self, x, z):
        """Bilinearly sampled altitude at block-space arrays x, z."""
        if self._grid is None:
            return np.full(np.shape(x), self.default_alt, dtype=np.float64)

        gx = np.asarray(x, dtype=np.float64) / self.cell_size - self.origin_x - 0.5
        gz = np.asarray(z, dtype=np.float64) / self.cell_size - self.origin_z - 0.5
        width, depth = self._grid.shape
        gx = np.clip(gx, 0, width - 1.001)
        gz = np.clip(gz, 0, depth - 1.001)

        x_lo = gx.astype(int)
        z_lo = gz.astype(int)
        fx = gx - x_lo
        fz = gz - z_lo
        g = self._grid
        return (g[x_lo, z_lo] * (1 - fx) * (1 - fz)
                + g[x_lo + 1, z_lo] * fx * (1 - fz)
                + g[x_lo, z_lo + 1] * (1 - fx) * fz
                + g[x_lo + 1, z_lo + 1] * fx * fz)


def _fill_and_smooth(grid, default_alt, smoothing):
    """Grow known cells into empty ones, then blur the whole field."""
    filled = grid.copy()
    for _ in range(max(grid.shape)):
        holes = np.isnan(filled)
        if not holes.any():
            break
        neighbours = np.stack([
            np.roll(filled, 1, 0), np.roll(filled, -1, 0),
            np.roll(filled, 1, 1), np.roll(filled, -1, 1),
        ])
        known = ~np.isnan(neighbours)
        # Mean over the known neighbours only, done by hand rather than with
        # nanmean so an all-unknown cell stays NaN quietly instead of
        # warning on every pass.
        count = known.sum(axis=0)
        total = np.where(known, neighbours, 0.0).sum(axis=0)
        grown = np.where(count > 0, total / np.maximum(count, 1), np.nan)
        filled = np.where(holes, grown, filled)
    filled = np.where(np.isnan(filled), default_alt, filled)

    for _ in range(smoothing):
        filled = (filled
                  + np.roll(filled, 1, 0) + np.roll(filled, -1, 0)
                  + np.roll(filled, 1, 1) + np.roll(filled, -1, 1)) / 5.0
    return filled


class CityVoxelizer:
    """Turns projected footprints plus a terrain field into chunks."""

    def __init__(self, footprints, terrain, materials=None, sea_level=62,
                 min_y=-64, max_y=319, hollow=True, terrain_enabled=True):
        self.footprints = footprints
        self.terrain = terrain
        self.materials = materials or Materials()
        self.sea_level = sea_level
        self.min_y = min_y
        self.max_y = max_y
        self.hollow = hollow
        self.terrain_enabled = terrain_enabled
        self.index = _index_by_chunk(footprints)

    def chunk_keys(self):
        return sorted(self.index)

    def fill(self, chunk):
        """Write one chunk's blocks. `chunk` is an anvil.ChunkBuilder."""
        x0 = chunk.chunk_x * 16
        z0 = chunk.chunk_z * 16

        surface_y = None
        if self.terrain_enabled:
            grid_x, grid_z = np.meshgrid(np.arange(16) + x0 + 0.5,
                                         np.arange(16) + z0 + 0.5, indexing="ij")
            altitude = self.terrain.sample(grid_x, grid_z)
            surface_y = np.clip(np.rint(altitude + self.sea_level).astype(int),
                                self.min_y + 1, self.max_y)
            self._fill_ground(chunk, surface_y)

        for index in self.index.get((chunk.chunk_x, chunk.chunk_z), ()):
            self._fill_building(chunk, self.footprints[index], x0, z0, surface_y)

    def _fill_ground(self, chunk, surface_y):
        materials = self.materials
        bedrock = chunk.block_id(materials.bedrock)
        stone = chunk.block_id(materials.deep)
        dirt = chunk.block_id(materials.subsoil)
        grass = chunk.block_id(materials.surface)

        chunk.blocks[:, 0, :] = bedrock
        # Vectorized over the whole 16 x height x 16 box: a per-column Python
        # loop here costs more than everything else in the pipeline combined
        # once the build is a few thousand chunks.
        relative = (surface_y - self.min_y)[:, None, :]
        levels = np.arange(chunk.height)[None, :, None]
        soil_floor = np.maximum(relative - 3, 1)
        chunk.blocks[(levels >= 1) & (levels < soil_floor)] = stone
        chunk.blocks[(levels >= soil_floor) & (levels < relative)] = dirt
        chunk.blocks[levels == relative] = grass

    def _fill_building(self, chunk, footprint, x0, z0, surface_y):
        # Rasterized with a one-block margin so wall detection sees the
        # building's real neighbours across the chunk boundary, then cropped
        # back to the chunk.
        padded = rasterize(footprint, x0 - 1, z0 - 1, 18, 18)
        mask = padded[1:17, 1:17]
        if not mask.any():
            return

        wall_block, roof_block = self.materials.for_height(footprint.height)
        wall = chunk.block_id(wall_block)
        roof = chunk.block_id(roof_block)

        base_y = int(round(footprint.ground_alt)) + self.sea_level
        top_y = base_y + max(int(round(footprint.height)), 1)
        base_y = max(base_y, self.min_y + 1)
        top_y = min(top_y, self.max_y)
        if top_y < base_y:
            return

        body = _shell(padded)[1:17, 1:17] if self.hollow else mask
        base_rel = base_y - self.min_y
        top_rel = top_y - self.min_y

        columns = np.argwhere(body)
        for x, z in columns:
            # Start walls a little below the footprint so a building on a
            # slope is not left standing on stilts.
            start = base_rel
            if surface_y is not None:
                start = min(start, int(surface_y[x, z]) - self.min_y)
            chunk.blocks[x, max(start, 1):top_rel, z] = wall

        for x, z in np.argwhere(mask):
            chunk.blocks[x, top_rel, z] = roof


def _index_by_chunk(footprints):
    index = {}
    for i, footprint in enumerate(footprints):
        for chunk_x in range(footprint.min_x >> 4, (footprint.max_x >> 4) + 1):
            for chunk_z in range(footprint.min_z >> 4, (footprint.max_z >> 4) + 1):
                index.setdefault((chunk_x, chunk_z), []).append(i)
    return index
