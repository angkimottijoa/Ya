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
from .voxel import CityVoxelizer, Materials, TerrainField, project_footprints


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
    result = Result(dry_run=options.dry_run)

    lat, lon = options.center
    zone = options.zone or guess_zone(lat, lon)
    projector = PlaneRectangular(zone)
    origin_east, origin_north = projector(lat, lon)
    result.zone, result.epsg = zone, projector.epsg
    report(f"origin {lat:.6f},{lon:.6f} -> zone {zone} (EPSG:{projector.epsg})")

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
