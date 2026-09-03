"""
The conversion, end to end.

FORK: added. Upstream's `__main__.py` is the pipeline -- parse, voxelize,
colour, write -- inlined into an argparse block with `print` for progress.
Pulling it into a function with a progress callback and a cancel flag is
what lets a GUI drive exactly the same code path, and what lets the CLI
report a percentage instead of going quiet for minutes.
"""
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from plateau2minecraft.appearance import Appearances, affine_uv
from plateau2minecraft.blocks import RICH, BlockMatcher
from plateau2minecraft.converter import Minecraft
from plateau2minecraft.parser import (GROUND, OPENING, OTHER, ROOF, WALL,
                                      get_surfaces, set_projection_from)
from plateau2minecraft.planar_voxels import surface_voxels
from plateau2minecraft.smoothing import close_pinholes, despeckle, smooth

# Used when a surface has neither a texture nor a material, and when
# --no-textures is asked for. Upstream's single stone for everything is
# still available as --blocks stone.
CLASS_BLOCKS = {
    ROOF: "minecraft:deepslate_tiles",
    WALL: "minecraft:light_gray_concrete",
    GROUND: "minecraft:stone",
    OPENING: "minecraft:glass",
    OTHER: "minecraft:light_gray_concrete",
}

FEATURE_TYPES = ("bldg", "tran", "brid", "frn", "veg")


class Cancelled(Exception):
    """Raised out of a run the caller asked to stop."""


@dataclass
class Options:
    source: list = field(default_factory=list)
    output: str = ""
    center: tuple = None
    zone: int = None
    radius: int = 0                 # 0 means "everything in the files"
    sea_level: int = 62
    min_y: int = -64
    max_y: int = 511
    data_version: int = 4189
    features: tuple = ("bldg",)
    textures: bool = True
    palette: str = RICH
    simplify_colors: int = 0
    texture_downscale: int = 4
    glass: bool = True
    glass_threshold: float = 0.35
    clean: bool = True
    smooth: int = 0
    map_path: str = None
    map_scale: int = 1
    dry_run: bool = False


@dataclass
class Result:
    surfaces: int = 0
    textured: int = 0
    glazed: int = 0
    materials_used: int = 0
    missing_images: int = 0
    voxels: int = 0
    removed: int = 0
    patched: int = 0
    smoothed: int = 0
    clipped: int = 0
    highest_y: int = 0
    spawn_y: int = 0
    bounds: tuple = ()
    zone: int = 0
    epsg: int = 0
    block_counts: dict = field(default_factory=dict)
    region_files: list = field(default_factory=list)
    map_files: list = field(default_factory=list)
    seconds: float = 0.0
    auto_centered: bool = False


def _format_duration(seconds):
    if seconds is None:
        return "?"
    seconds = int(seconds)
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m {seconds % 60:02d}s"
    return f"{seconds // 3600}h {(seconds % 3600) // 60:02d}m"


class Progress:
    """One bar across phases of very different lengths."""

    def __init__(self, on_progress=None, should_cancel=None):
        self._on_progress = on_progress
        self._should_cancel = should_cancel
        self.started = time.time()
        self._offset = 0.0
        self._weight = 1.0
        self._last = 0.0
        self._named = False

    def stage(self, weight):
        self._offset = min(self._offset + self._weight, 1.0) if self._named else 0.0
        self._named = True
        self._weight = weight

    def check(self):
        if self._should_cancel is not None and self._should_cancel():
            raise Cancelled()

    def __call__(self, message, local=None):
        self.check()
        if self._on_progress is None:
            return
        fraction = None
        if local is not None:
            fraction = min(1.0, self._offset + self._weight * min(max(local, 0.0), 1.0))
            fraction = self._last = max(fraction, self._last)
        self._on_progress(message, fraction)


def _feature_of(path):
    for part in Path(path).stem.split("_")[1:]:
        if part in FEATURE_TYPES:
            return part
        if part == "dem":
            return "dem"
    return None


def expand_sources(sources):
    """Every CityGML file under the given files or directories."""
    found = []
    for entry in sources:
        entry = Path(entry)
        if entry.is_dir():
            found.extend(sorted(entry.rglob("*.gml")))
        elif entry.suffix.lower() == ".gml":
            found.append(entry)
    return found


def data_center(paths):
    """Middle of the tiles' own gml:Envelope, so no coordinates are needed."""
    from xml.etree import ElementTree

    bounds = None
    for path in paths:
        lower = upper = None
        try:
            for _event, element in ElementTree.iterparse(str(path), events=("end",)):
                tag = element.tag.rsplit("}", 1)[-1]
                if tag == "lowerCorner":
                    lower = [float(v) for v in (element.text or "").split()]
                elif tag == "upperCorner":
                    upper = [float(v) for v in (element.text or "").split()]
                elif tag == "Envelope":
                    break
        except Exception:
            continue
        if not lower or not upper:
            continue
        box = (lower[0], lower[1], upper[0], upper[1])
        bounds = list(box) if bounds is None else [
            min(bounds[0], box[0]), min(bounds[1], box[1]),
            max(bounds[2], box[2]), max(bounds[3], box[3])]
    if bounds is None:
        return None
    return ((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)


def build(options, on_progress=None, should_cancel=None):
    report = Progress(on_progress, should_cancel)
    result = Result()
    started = time.time()

    files = expand_sources(options.source)
    if not files:
        raise ValueError("no .gml files found -- point --target at an extracted "
                         "CityGML folder (the one containing udx/)")

    if options.center is None:
        report("no centre given -- reading the tiles' own extent")
        options.center = data_center(files)
        if options.center is None:
            raise ValueError("could not read a bounding envelope from any of those files")
        result.auto_centered = True
    projector = set_projection_from(*options.center, zone=options.zone)
    origin_east, origin_north = projector(*options.center)
    result.zone, result.epsg = projector.zone, projector.epsg
    report(f"zone {projector.zone} (EPSG:{projector.epsg}); "
           f"centre {options.center[0]:.6f}, {options.center[1]:.6f}")

    matcher = BlockMatcher(options.palette)
    by_block = {}
    report.stage(0.6)

    for index, path in enumerate(files):
        report.check()
        feature = _feature_of(path)
        if feature is None or feature == "dem" or feature not in options.features:
            report(f"skipping {path.name}", (index + 1) / len(files))
            continue

        report(f"reading {path.name}", index / len(files))
        surfaces = get_surfaces(path, feature)
        appearances = None
        if options.textures:
            appearances = Appearances(path.parent, options.simplify_colors,
                                      options.texture_downscale).read(path)

        for position, surface in enumerate(surfaces):
            if position % 500 == 0:
                report.check()
            _add_surface(surface, appearances, matcher, options, by_block, result,
                         origin_east, origin_north)
        result.surfaces += len(surfaces)
        if appearances:
            result.missing_images += appearances.missing_images
        # result.voxels is only totalled after the per-block lists are
        # flattened, so report the running total from the lists themselves
        # rather than printing 0 for the whole of the longest phase.
        so_far = sum(len(chunk) for chunks in by_block.values() for chunk in chunks)
        report(f"{result.surfaces:,} surfaces, {so_far:,} voxels",
               (index + 1) / len(files))

    if not by_block:
        raise ValueError("nothing was voxelized -- check the centre point and radius")

    report.stage(0.12)
    voxels, classes, palette = _flatten(by_block)
    result.voxels = len(voxels)

    if options.clean:
        before = len(voxels)
        voxels, classes = despeckle(voxels, classes)
        result.removed = before - len(voxels)
        report("removing loose voxels", 0.35)
        before = len(voxels)
        voxels, classes = close_pinholes(voxels, classes)
        result.patched = len(voxels) - before
        report(f"cleaned: -{result.removed:,} loose, +{result.patched:,} seams", 0.6)

    if options.smooth:
        voxels, classes, result.smoothed = smooth(voxels, classes, options.smooth)
        report(f"smoothed {result.smoothed:,} voxels on curves", 0.9)

    result.voxels = len(voxels)
    counts = np.bincount(classes, minlength=len(palette))
    result.block_counts = {palette[i]: int(counts[i])
                           for i in np.argsort(counts)[::-1] if counts[i]}
    if len(voxels):
        result.highest_y = int(voxels[:, 2].max()) + options.sea_level
        result.bounds = (int(voxels[:, 0].min()), int(voxels[:, 0].max()),
                         int(voxels[:, 1].min()), int(voxels[:, 1].max()))
    report(f"{len(voxels):,} voxels in {len(palette)} block types", 1.0)

    if options.dry_run:
        result.seconds = time.time() - started
        return result

    report.stage(0.28)
    result.region_files, result.clipped, result.spawn_y = _write(
        voxels, classes, palette, options, report)
    _write_map(options, result, projector, origin_east, origin_north, voxels, report)
    result.seconds = time.time() - started
    return result


def _add_surface(surface, appearances, matcher, options, by_block, result,
                 origin_east, origin_north):
    rings = []
    for _ring_id, points in surface.rings:
        local = np.empty_like(points)
        local[:, 0] = points[:, 0] - origin_east
        # Minecraft's +Z points south, so northings are negated.
        local[:, 1] = -(points[:, 1] - origin_north)
        local[:, 2] = points[:, 2] + options.sea_level
        rings.append(local)

    if options.radius:
        exterior = rings[0]
        if (exterior[:, 0].min() > options.radius or exterior[:, 0].max() < -options.radius
                or exterior[:, 1].min() > options.radius
                or exterior[:, 1].max() < -options.radius):
            return

    voxels, plane, basis = surface_voxels(rings, return_plane=True)
    if len(voxels) == 0:
        return

    fallback = CLASS_BLOCKS.get(surface.surface_class, CLASS_BLOCKS[OTHER])
    colours = None

    if appearances is not None and basis is not None:
        target = appearances.texture_for(surface.rings[0][0], surface.polygon_id)
        if target is not None:
            image_uri, ring_uv = target
            origin, u, v = basis
            ring_plane = np.column_stack([(rings[0] - origin) @ u, (rings[0] - origin) @ v])
            transform = affine_uv(ring_plane, ring_uv)
            if transform is not None:
                uv = np.column_stack([plane, np.ones(len(plane))]) @ transform
                colours = appearances.sample(image_uri, uv)

        if colours is None:
            material = appearances.surface_to_material.get(surface.polygon_id)
            if material is not None:
                # No texture, but the surface carries an X3DMaterial. Its
                # diffuse colour beats falling back to a class default.
                colours = np.tile(np.array(material), (len(voxels), 1))
                result.materials_used += 1

    if colours is None:
        by_block.setdefault(fallback, []).append(voxels)
        return

    result.textured += 1
    glazed = None
    if options.glass and surface.surface_class in (WALL, OPENING):
        glazed = matcher.surface_is_glazed(colours, options.glass_threshold)
        if glazed:
            result.glazed += 1
    names = matcher.match(colours, glazed=glazed, allow_glass=options.glass)
    for name in np.unique(names):
        by_block.setdefault(str(name), []).append(voxels[names == name])


def _flatten(by_block):
    palette = sorted(by_block)
    chunks, labels = [], []
    for index, name in enumerate(palette):
        block = np.vstack(by_block[name])
        chunks.append(block)
        labels.append(np.full(len(block), index, dtype=np.int16))
    voxels = np.vstack(chunks)
    classes = np.concatenate(labels)

    order = np.lexsort((classes, voxels[:, 2], voxels[:, 1], voxels[:, 0]))
    voxels, classes = voxels[order], classes[order]
    keep = np.ones(len(voxels), dtype=bool)
    keep[1:] = np.any(voxels[1:] != voxels[:-1], axis=1)
    return voxels[keep], classes[keep], palette


def _write(voxels, classes, palette, options, report):
    """Write everything in one pass, with a block name per voxel."""
    from plateau2minecraft.voxelizer import PointCloud

    names = np.array(palette, dtype=object)[classes]
    cloud = PointCloud(voxels.astype(np.float64))
    minecraft = Minecraft(cloud, min_y=options.min_y, max_y=options.max_y,
                          data_version=options.data_version, block_names=names)
    report("writing region files", 0.1)
    files = minecraft.build_region(options.output)
    report(f"wrote {len(files)} region files", 1.0)

    spawn_y = int(voxels[:, 2].max()) + 3 if len(voxels) else options.sea_level
    return sorted(files), minecraft.clipped, spawn_y


def _write_map(options, result, projector, origin_east, origin_north, voxels, report):
    if not options.map_path:
        return
    from plateau2minecraft.mapexport import write_map

    report("drawing the block plan")
    shim = type("MapResult", (), {
        "bounds": result.bounds, "chunks_written": 0,
        "chunk_count": len(result.region_files), "voxels": result.voxels,
        "buildings_kept": 0, "highest_block_y": result.highest_y,
        "spawn_y": result.spawn_y, "zone": result.zone, "epsg": result.epsg})()
    result.map_files = list(write_map(options.map_path, shim, options, projector,
                                      origin_east, origin_north, voxels=voxels,
                                      scale=options.map_scale))
