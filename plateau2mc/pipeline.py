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
from .citygml import data_extent, read_buildings, total_bytes
from .heightfit import MODE_NONE, HeightFit
from .jgd2011 import PlaneRectangular, guess_zone
from .appearance import affine_uv, read_appearances
from .blockpalette import BlockMatcher
from .meshcity import (CLASS_PRIORITY, MeshCity, block_for, close_pinholes,
                       despeckle, smooth)
from .meshvoxel import VoxelAccumulator, surface_voxels
from .surfaces import OPENING, WALL, read_surfaces
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
    center: tuple = None          # None means 'work it out from the data'
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
    textures: bool = False
    simplify_colors: int = 12
    texture_downscale: int = 4
    glass: bool = True
    glass_threshold: float = 0.35
    smooth: int = 0


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
    textured_surfaces: int = 0
    glazed_surfaces: int = 0
    missing_textures: int = 0
    voxels_smoothed: int = 0
    auto_centered: bool = False
    block_counts: dict = field(default_factory=dict)
    map_files: list = field(default_factory=list)


class _Reporter:
    """Progress callback plus cancellation, in one object.

    A run has three phases with wildly different durations -- reading GML,
    voxelizing and cleaning, writing chunks -- and only the last one has a
    count known in advance. Reporting each phase's own 0..1 separately gave
    a bar that filled up three times, so instead each phase is given a
    share of the whole and its local progress is mapped into that share.
    The bar then moves once, from nothing to done.

    Elapsed time and an estimate of what is left ride along with it, which
    is the difference between a UI that looks stuck and one that does not.
    """

    def __init__(self, on_progress=None, should_cancel=None):
        self._on_progress = on_progress
        self._should_cancel = should_cancel
        self._started = time.time()
        self._offset = 0.0
        self._weight = 1.0
        self._last = 0.0
        self.stage_name = ""

    def stage(self, name, weight):
        """Begin a phase occupying `weight` of the overall bar."""
        self._offset = min(self._offset + self._weight, 1.0) if self.stage_name else 0.0
        self.stage_name = name
        self._weight = weight

    def check(self):
        """Cancellation only. Cheap enough to call on every unit of work.

        Kept separate from reporting so Stop stays responsive: progress
        messages are deliberately infrequent (one per 100 chunks), and
        tying cancellation to them would leave the button dead for seconds
        at a time.
        """
        if self._should_cancel is not None and self._should_cancel():
            raise Cancelled()

    @property
    def elapsed(self):
        return time.time() - self._started

    def eta(self, fraction):
        """Seconds remaining, or None while the estimate is meaningless."""
        if fraction <= 0.02 or self.elapsed < 2.0:
            return None
        return max(0.0, self.elapsed * (1.0 - fraction) / fraction)

    def __call__(self, message, local=None):
        self.check()
        if self._on_progress is None:
            return
        fraction = None
        if local is not None:
            # Never let a phase's estimate walk the bar backwards.
            fraction = min(1.0, self._offset + self._weight * min(max(local, 0.0), 1.0))
            fraction = max(fraction, self._last)
            self._last = fraction
        self._on_progress(message, fraction)


def _format_duration(seconds):
    if seconds is None:
        return "?"
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m {seconds % 60:02d}s"
    return f"{seconds // 3600}h {(seconds % 3600) // 60:02d}m"


def build_world(options, on_progress=None, should_cancel=None):
    """Run a conversion. Raises `Cancelled` if `should_cancel` turns true."""
    report = _Reporter(on_progress, should_cancel)
    started = time.time()
    result = Result(dry_run=options.dry_run, geometry=options.geometry)

    if options.center is None:
        report("no centre given -- reading the tiles' own extent")
        extent = data_extent(options.source, progress=lambda msg: report(msg))
        if extent is None:
            raise ValueError(
                "could not read a bounding envelope from any of those files -- "
                "point --source at an extracted CityGML folder (the one holding udx/)")
        options.center = ((extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2)
        result.auto_centered = True
        report(f"centred on {options.center[0]:.6f}, {options.center[1]:.6f}")

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
    report(f"{len(kept)} buildings within {options.radius} m (scanned {scanned})", 1.0)
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

    report.stage("plan", 0.10)
    report(f"{len(chunk_keys)} chunks; tallest {result.tallest_metres:.0f} m, "
           f"highest block y={result.highest_block_y}", 1.0)

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
    matcher = BlockMatcher() if options.textures else None
    atlases = {}

    input_bytes = total_bytes(options.source)
    consumed = [0]
    report.stage("read", 0.55)

    def on_bytes(count):
        consumed[0] += count

    kept = 0
    for surface in read_surfaces(options.source, progress=lambda msg: report(msg),
                                 feature_filter=set(options.features),
                                 with_source=True, on_bytes=on_bytes):
        report.check()
        result.surfaces_read += 1
        if result.surfaces_read % 500 == 0:
            share = consumed[0] / input_bytes if input_bytes else None
            report(f"read {result.surfaces_read:,} surfaces, kept {kept:,}", share)

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

        if matcher is None:
            accumulator.add((surface.feature, surface.surface_class),
                            surface_voxels(rings))
            continue

        _add_textured(accumulator, matcher, atlases, surface, rings, options, result)

    if kept == 0:
        raise ValueError(
            "no LOD2 surfaces fell inside the requested area -- check that the centre "
            "point lies within the CityGML tiles you selected")

    report(f"{kept} surfaces inside the area; voxelizing", 1.0)
    if matcher is not None:
        report(f"{result.textured_surfaces} surfaces textured"
               + (f", {result.missing_textures} images missing"
                  if result.missing_textures else ""))

    voxels, classes, keys = accumulator.finish(order=CLASS_PRIORITY)
    palette = [key if isinstance(key, str) else block_for(key[0], key[1]) for key in keys]
    result.voxels = len(voxels)
    report(f"{len(voxels):,} voxels")

    report.stage("clean", 0.10)
    if options.clean:
        before = len(voxels)
        voxels, classes = despeckle(voxels, classes, options.despeckle_neighbours)
        result.voxels_removed = before - len(voxels)
        report("removing loose voxels", 0.4)
        before = len(voxels)
        voxels, classes = close_pinholes(voxels, classes, options.pinhole_neighbours)
        result.voxels_patched = len(voxels) - before
        report(f"cleaned: removed {result.voxels_removed:,} loose voxels, "
               f"patched {result.voxels_patched:,} seam holes", 0.7)
        result.voxels = len(voxels)

    if options.smooth:
        voxels, classes, result.voxels_smoothed = smooth(voxels, classes, options.smooth)
        report(f"smoothed: {result.voxels_smoothed:,} voxels changed on curves and edges", 1.0)
        result.voxels = len(voxels)
    report("preparing chunks", 1.0)

    if len(classes):
        counts = np.bincount(classes, minlength=len(palette))
        result.block_counts = {palette[i]: int(counts[i])
                               for i in np.argsort(counts)[::-1] if counts[i]}

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

    report.stage("write", 0.35)
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


def _atlas_for(atlases, source_path, options):
    if source_path not in atlases:
        atlases[source_path] = read_appearances(
            source_path, simplify_colors=options.simplify_colors,
            downscale=options.texture_downscale)
    return atlases[source_path]


def _add_textured(accumulator, matcher, atlases, surface, rings, options, result):
    """Voxelize one surface and colour it from its texture image."""
    voxels, plane, basis = surface_voxels(rings, return_plane=True)
    if len(voxels) == 0:
        return

    fallback = block_for(surface.feature, surface.surface_class)
    target = None
    if surface.source_path is not None and surface.polygon_id:
        atlas = _atlas_for(atlases, surface.source_path, options)
        target = atlas.uv_for(surface.polygon_id)

    colours = None
    if target is not None and basis is not None:
        image_uri, ring_uv = target
        origin, u, v = basis
        ring_plane = np.column_stack([(rings[0] - origin) @ u, (rings[0] - origin) @ v])
        transform = affine_uv(ring_plane, ring_uv)
        if transform is not None:
            uv = np.column_stack([plane, np.ones(len(plane))]) @ transform
            colours = atlas.sample(image_uri, uv)
            if colours is None:
                result.missing_textures += 1

    if colours is None:
        accumulator.add(fallback, voxels)
        return

    result.textured_surfaces += 1
    glazed = None
    if options.glass:
        # Only walls and openings are ever considered glazing. A flat grey
        # roof photographs bluish enough to trip the colour test, and a
        # glass roof is rare enough that guessing wrong on every rooftop in
        # the city is the worse trade.
        if surface.surface_class in (WALL, OPENING):
            glazed = matcher.surface_is_glazed(colours, options.glass_threshold)
        else:
            glazed = False
        if glazed:
            result.glazed_surfaces += 1
    names = matcher.match(colours, allow_glass=options.glass, glazed=glazed)
    for name in np.unique(names):
        accumulator.add(str(name), voxels[names == name])
def _write_map(options, result, projector, origin_east, origin_north, voxels, report):
    if not options.map_path:
        return
    from .mapexport import write_map
    report("drawing the block plan")
    result.map_files = list(write_map(options.map_path, result, options, projector,
                                      origin_east, origin_north, voxels=voxels,
                                      scale=options.map_scale))
    report(f"map: {result.map_files[0]}")
