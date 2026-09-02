"""
The conversion itself, independent of how it was asked for.

Split out of `cli.py` so the desktop app can drive the same code path: the
GUI needs progress as it happens, a way to stop a run that will take
minutes, and results as values rather than as lines on stdout. Reporting
goes through a callback and a cancel flag instead of `print`, and the CLI
becomes one more caller that happens to print what it is told.
"""
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .anvil import DEFAULT_DATA_VERSION, ChunkBuilder, RegionWriter
from .citygml import read_buildings
from .heightfit import MODE_NONE, HeightFit
from .jgd2011 import PlaneRectangular, guess_zone
from .meshcity import CLASS_PRIORITY, MeshCity, block_for, close_pinholes, despeckle
from .meshvoxel import VoxelAccumulator, surface_voxels
from .surfaces import read_surfaces
from .voxel import CityVoxelizer, Materials, TerrainField, project_footprints

GEOMETRY_LOD1 = "lod1"
GEOMETRY_LOD2 = "lod2"
GEOMETRIES = (GEOMETRY_LOD1, GEOMETRY_LOD2)


class Cancelled(Exception):
    """Raised out of a run that the caller asked to stop."""


@dataclass
class Options:
    source: list = field(default_factory=list)
    world: str = ""
    center: tuple = (35.690921, 139.700258)
    radius: int = 800
    zone: int = None
    sea_level: int = 62
    min_y: int = -64
    max_y: int = 319
    max_building_height: float = None
    fit: str = MODE_NONE
    knee: float = 60.0
    solid: bool = False
    terrain: bool = True
    terrain_cell: int = 32
    data_version: int = DEFAULT_DATA_VERSION
    dry_run: bool = False
    geometry: str = GEOMETRY_LOD1
    features: tuple = ("bldg",)
    clean: bool = True
    despeckle_neighbours: int = 2
    pinhole_neighbours: int = 4
    map_path: str = None
    map_scale: int = 1


@dataclass
class Result:
    buildings_kept: int = 0
    buildings_scanned: int = 0
    chunk_count: int = 0
    chunks_written: int = 0
    region_files: list = field(default_factory=list)
    tallest_metres: float = 0.0
    highest_block_y: int = 0
    overflow_count: int = 0
    overflow_needs_y: int = 0
    clipped_buildings: int = 0
    height_description: str = ""
    spawn_y: int = 0
    zone: int = 0
    epsg: int = 0
    seconds: float = 0.0
    dry_run: bool = False
    geometry: str = GEOMETRY_LOD1
    surfaces_read: int = 0
    voxels: int = 0
    voxels_removed: int = 0
    voxels_patched: int = 0
    bounds: tuple = ()
    map_files: list = field(default_factory=list)


class _Reporter:
    """Progress callback plus cancellation, in one object.

    `fraction` is None while the run is doing work whose length is not known
    up front (reading GML), and 0..1 once it is placing chunks -- which is
    what lets the GUI switch its progress bar from indeterminate to a real
    percentage at the right moment.
    """

    def __init__(self, on_progress=None, should_cancel=None):
        self._on_progress = on_progress
        self._should_cancel = should_cancel

    def check(self):
        """Cancellation only. Cheap enough to call on every unit of work.

        Kept separate from reporting so Stop stays responsive: progress
        messages are deliberately infrequent (one per 100 chunks), and
        tying cancellation to them would leave the button dead for seconds
        at a time.
        """
        if self._should_cancel is not None and self._should_cancel():
            raise Cancelled()

    def __call__(self, message, fraction=None):
        self.check()
        if self._on_progress is not None:
            self._on_progress(message, fraction)


def build_world(options, on_progress=None, should_cancel=None):
    """Run a conversion. Raises `Cancelled` if `should_cancel` turns true."""
    report = _Reporter(on_progress, should_cancel)
    started = time.time()
    result = Result(dry_run=options.dry_run, geometry=options.geometry)

    lat, lon = options.center
    zone = options.zone or guess_zone(lat, lon)
    projector = PlaneRectangular(zone)
    origin_east, origin_north = projector(lat, lon)
    result.zone, result.epsg = zone, projector.epsg
    report(f"origin {lat:.6f},{lon:.6f} -> zone {zone} (EPSG:{projector.epsg})")

    if options.geometry == GEOMETRY_LOD2:
        return _build_lod2(options, projector, origin_east, origin_north,
                           report, result, started)

    kept = []
    scanned = 0
    for building in read_buildings(options.source, progress=lambda msg: report(msg)):
        scanned += 1
        report.check()
        if scanned % 5000 == 0:
            report(f"scanned {scanned} buildings, kept {len(kept)}")
        centre = building.centroid()
        if centre is None:
            continue
        east, north = projector(*centre)
        if (abs(east - origin_east) <= options.radius
                and abs(north - origin_north) <= options.radius):
            kept.append(building)

    result.buildings_kept = len(kept)
    result.buildings_scanned = scanned
    report(f"{len(kept)} buildings within {options.radius} m (scanned {scanned})")
    if not kept:
        raise ValueError(
            "no buildings fell inside the requested area -- check that the centre "
            "point lies within the CityGML tiles you selected")

    footprints = project_footprints(kept, projector, origin_east, origin_north,
                                    max_height=options.max_building_height)
    terrain = TerrainField(footprints, cell_size=options.terrain_cell)

    samples = [(f.ground_alt, f.height) for f in footprints]
    height_fit = HeightFit(options.min_y, options.max_y, samples, mode=options.fit,
                           sea_level=options.sea_level, knee=options.knee)
    result.height_description = height_fit.describe()
    report(f"height: {result.height_description}")

    voxelizer = CityVoxelizer(
        footprints, terrain, height_fit, materials=Materials(),
        min_y=options.min_y, max_y=options.max_y, hollow=not options.solid,
        terrain_enabled=options.terrain)

    chunk_keys = _chunks_to_build(voxelizer, options.radius, options.terrain)
    result.chunk_count = len(chunk_keys)
    result.tallest_metres = max(f.height for f in footprints)
    result.highest_block_y = int(round(max(height_fit.top_y(a, h) for a, h in samples)))

    overflow = height_fit.overflow(samples)
    result.overflow_count = len(overflow)
    if overflow:
        result.overflow_needs_y = int(round(max(top for _, top in overflow)))

    origin_alt = float(terrain.sample(np.array([0.5]), np.array([0.5]))[0])
    result.spawn_y = int(round(height_fit.ground_y(origin_alt))) + 2

    report(f"{len(chunk_keys)} chunks; tallest {result.tallest_metres:.0f} m, "
           f"highest block y={result.highest_block_y}")

    if options.dry_run:
        result.seconds = time.time() - started
        return result

    region_dir = Path(options.world) / "region"
    writer = RegionWriter(region_dir, data_version=options.data_version)
    for done, (chunk_x, chunk_z) in enumerate(chunk_keys, 1):
        report.check()
        chunk = ChunkBuilder(chunk_x, chunk_z, options.min_y, options.max_y)
        voxelizer.fill(chunk)
        if not chunk.is_empty():
            writer.add(chunk)
        if done % 100 == 0 or done == len(chunk_keys):
            report(f"{done}/{len(chunk_keys)} chunks", done / len(chunk_keys))

    result.region_files = [str(path) for path in writer.flush()]
    result.chunks_written = writer.chunks_written
    result.clipped_buildings = voxelizer.clipped_buildings
    result.seconds = time.time() - started
    report(f"wrote {result.chunks_written} chunks in {len(result.region_files)} "
           f"region files", 1.0)
    return result


def _chunks_to_build(voxelizer, radius, terrain_enabled):
    """Chunks holding buildings, plus the full square if terrain is on."""
    keys = set(voxelizer.chunk_keys())
    if terrain_enabled:
        for chunk_x in range(-radius >> 4, (radius >> 4) + 1):
            for chunk_z in range(-radius >> 4, (radius >> 4) + 1):
                keys.add((chunk_x, chunk_z))
    return sorted(keys)


def _project_ring(ring, projector, origin_east, origin_north, sea_level):
    """lat/lon/alt -> block space (x east, z south, y up)."""
    out = np.empty((len(ring), 3), dtype=np.float64)
    for i, (lat, lon, alt) in enumerate(ring):
        east, north = projector(lat, lon)
        out[i, 0] = east - origin_east
        out[i, 1] = -(north - origin_north)
        out[i, 2] = alt + sea_level
    return out


def _build_lod2(options, projector, origin_east, origin_north, report, result, started):
    """Voxelize LOD2 semantic surfaces rather than extruding footprints."""
    radius = options.radius
    accumulator = VoxelAccumulator()
    palette_names = []
    class_index = {}

    kept = 0
    for surface in read_surfaces(options.source, progress=lambda msg: report(msg),
                                 feature_filter=set(options.features)):
        report.check()
        result.surfaces_read += 1
        if result.surfaces_read % 20000 == 0:
            report(f"read {result.surfaces_read} surfaces, kept {kept}")

        rings = [_project_ring(ring, projector, origin_east, origin_north,
                               options.sea_level) for ring in surface.rings]
        exterior = rings[0]
        # Reject by the surface's own extent rather than its centroid: a
        # long road or a big roof plane should be kept if any part of it
        # falls inside the requested square.
        if (exterior[:, 0].min() > radius or exterior[:, 0].max() < -radius
                or exterior[:, 1].min() > radius or exterior[:, 1].max() < -radius):
            continue
        kept += 1

        key = (surface.feature, surface.surface_class)
        if key not in class_index:
            class_index[key] = len(palette_names)
            palette_names.append(block_for(surface.feature, surface.surface_class))
        accumulator.add(key, surface_voxels(rings))

    if kept == 0:
        raise ValueError(
            "no LOD2 surfaces fell inside the requested area -- check that the centre "
            "point lies within the CityGML tiles you selected")

    report(f"{kept} surfaces inside the area; voxelizing")
    voxels, classes, keys = accumulator.finish(order=CLASS_PRIORITY)
    palette = [block_for(feature, surface_class) for feature, surface_class in keys]
    result.voxels = len(voxels)
    report(f"{len(voxels):,} voxels")

    if options.clean:
        before = len(voxels)
        voxels, classes = despeckle(voxels, classes, options.despeckle_neighbours)
        result.voxels_removed = before - len(voxels)
        before = len(voxels)
        voxels, classes = close_pinholes(voxels, classes, options.pinhole_neighbours)
        result.voxels_patched = len(voxels) - before
        report(f"cleaned: removed {result.voxels_removed:,} loose voxels, "
               f"patched {result.voxels_patched:,} seam holes")
        result.voxels = len(voxels)

    city = MeshCity(voxels, classes, palette, options.min_y, options.max_y)
    result.clipped_buildings = 0
    if city.clipped:
        report(f"warning: {city.clipped:,} voxels fell outside y "
               f"{options.min_y}..{options.max_y}")
        result.overflow_count = city.clipped

    if len(city.voxels):
        result.highest_block_y = int(city.voxels[:, 2].max())
        result.bounds = (int(city.voxels[:, 0].min()), int(city.voxels[:, 0].max()),
                         int(city.voxels[:, 1].min()), int(city.voxels[:, 1].max()))
        result.spawn_y = int(city.voxels[:, 2].max()) + 3
    chunk_keys = city.chunk_keys()
    result.chunk_count = len(chunk_keys)
    result.height_description = (
        f"LOD2 geometry placed 1:1, altitude 0 m at y={options.sea_level}")
    report(f"{len(chunk_keys)} chunks")

    if options.dry_run:
        result.seconds = time.time() - started
        return result

    region_dir = Path(options.world) / "region"
    writer = RegionWriter(region_dir, data_version=options.data_version)
    for done, (chunk_x, chunk_z) in enumerate(chunk_keys, 1):
        report.check()
        chunk = ChunkBuilder(chunk_x, chunk_z, options.min_y, options.max_y)
        city.fill(chunk)
        if not chunk.is_empty():
            writer.add(chunk)
        if done % 100 == 0 or done == len(chunk_keys):
            report(f"{done}/{len(chunk_keys)} chunks", done / len(chunk_keys))

    result.region_files = [str(path) for path in writer.flush()]
    result.chunks_written = writer.chunks_written
    _write_map(options, result, projector, origin_east, origin_north,
               city.voxels, report)
    result.seconds = time.time() - started
    report(f"wrote {result.chunks_written} chunks in {len(result.region_files)} "
           f"region files", 1.0)
    return result


def _write_map(options, result, projector, origin_east, origin_north, voxels, report):
    if not options.map_path:
        return
    from .mapexport import write_map
    report("drawing the block plan")
    result.map_files = list(write_map(options.map_path, result, options, projector,
                                      origin_east, origin_north, voxels=voxels,
                                      scale=options.map_scale))
    report(f"map: {result.map_files[0]}")
