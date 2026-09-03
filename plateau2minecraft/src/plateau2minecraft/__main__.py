#!/usr/bin/env python3
"""
CityGML -> Minecraft Java Edition world.

FORK: upstream's entry point took only --target and --output and inlined
the whole pipeline. Everything the conversion can now do needs saying, and
the pipeline itself has moved to pipeline.py so a GUI can drive it too.

    python -m plateau2minecraft --target data/13100_tokyo23-ku_.../udx/bldg \
        --output data/output --textures --palette rich --smooth 1

--target also accepts the folder you unzipped: directories are searched for
*.gml, and with no --center the tiles' own gml:Envelope decides where the
map is centred, so no coordinates need looking up.
"""
import argparse
import logging
import sys
import time
from pathlib import Path

from plateau2minecraft.blocks import PALETTES, RICH
from plateau2minecraft.pipeline import (FEATURE_TYPES, Options, _format_duration,
                                        build)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

LANDMARKS = {
    "shinjuku": (35.690921, 139.700258),
    "shibuya": (35.659515, 139.700501),
    "tokyo-station": (35.681236, 139.767125),
    "ginza": (35.671989, 139.765089),
    "akihabara": (35.698353, 139.773114),
    "tokyo-tower": (35.658581, 139.745433),
    "skytree": (35.710063, 139.810700),
}


def parse_center(value):
    if value in LANDMARKS:
        return LANDMARKS[value]
    try:
        lat, lon = (float(part) for part in value.replace(" ", "").split(","))
    except ValueError:
        raise argparse.ArgumentTypeError(
            "--center takes 'lat,lon' or one of: " + ", ".join(sorted(LANDMARKS)))
    return lat, lon


def build_parser():
    parser = argparse.ArgumentParser(
        prog="python -m plateau2minecraft", description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--target", required=True, type=Path, nargs="+",
                        help="CityGML file(s), or a folder searched for *.gml")
    parser.add_argument("--output", required=True, type=Path,
                        help="output folder; region files land in "
                             "<output>/world_data/region")

    where = parser.add_argument_group("area")
    where.add_argument("--center", type=parse_center, default=None,
                       help="map origin as 'lat,lon' or a landmark name "
                            "(" + ", ".join(sorted(LANDMARKS)) + "). Omit it and the "
                            "centre of the tiles you gave is used")
    where.add_argument("--radius", type=int, default=0, metavar="M",
                       help="half-width of the square to build, in metres. 0, the "
                            "default, converts everything in the files")
    where.add_argument("--zone", type=int, default=None,
                       help="Japan Plane Rectangular zone 1-19 (default: inferred; "
                            "Tokyo is 9)")
    where.add_argument("--features", nargs="+", default=["bldg"], choices=list(FEATURE_TYPES),
                       help="which PLATEAU packages to convert (default: bldg). "
                            "tran/frn/veg carry no elevation, so they sit at altitude 0")

    height = parser.add_argument_group("height")
    height.add_argument("--sea-level", type=int, default=62, metavar="Y",
                        help="block y that altitude 0 m maps to (default: 62)")
    height.add_argument("--min-y", type=int, default=-64,
                        help="world floor, a multiple of 16 (default: -64)")
    height.add_argument("--max-y", type=int, default=511,
                        help="world ceiling; max_y + 1 must be a multiple of 16 "
                             "(default: 511, i.e. a -512..511 world). Anvil's own "
                             "ceiling is 2047")
    height.add_argument("--data-version", type=int, default=4189,
                        help="chunk DataVersion (default: 4189, which is 1.21.4; "
                             "upstream targeted 3337 / 1.19.4)")

    look = parser.add_argument_group("materials")
    look.add_argument("--no-textures", dest="textures", action="store_false",
                      help="ignore the LOD2 imagery and use one block per surface type")
    look.add_argument("--palette", choices=list(PALETTES), default=RICH,
                      help="'rich' matches against the full block catalogue, so facades "
                           "come out close to their real colour; 'simple' uses a dozen "
                           "neutrals plus glass, which reads more cleanly from a "
                           f"distance (default: {RICH})")
    look.add_argument("--simplify-colors", type=int, default=0, metavar="N",
                      help="flatten each texture to N colours before matching, turning "
                           "JPEG noise into flat panels (default: 0, off; try 8-16 with "
                           "--palette simple)")
    look.add_argument("--texture-downscale", type=int, default=4, metavar="N",
                      help="shrink each texture before sampling (default: 4)")
    look.add_argument("--no-glass", dest="glass", action="store_false",
                      help="never use glass; glazing becomes concrete like everything else")
    look.add_argument("--glass-threshold", type=float, default=0.35, metavar="F",
                      help="share of a wall's pixels that must read as glazing before the "
                           "whole wall becomes glass (default: 0.35). The decision is per "
                           "wall, never per pixel")

    shape = parser.add_argument_group("geometry clean-up")
    shape.add_argument("--no-clean", dest="clean", action="store_false",
                       help="skip loose-voxel removal and seam patching")
    shape.add_argument("--smooth", type=int, default=0, metavar="N",
                       help="take the stair-stepping off curved surfaces, N passes "
                            "(default: 0). A pass that would change more than 6%% of the "
                            "model is abandoned, so a spire is never dissolved")

    extra = parser.add_argument_group("output")
    extra.add_argument("--map", dest="map_path", default=None,
                       help="also write a top-down block plan to this .html path")
    extra.add_argument("--map-scale", type=int, default=1, metavar="N",
                       help="blocks per map pixel (default: 1)")
    extra.add_argument("--dry-run", action="store_true",
                       help="report what would be built without writing anything")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    options = Options(
        source=args.target, output=args.output, center=args.center, zone=args.zone,
        radius=args.radius, sea_level=args.sea_level, min_y=args.min_y, max_y=args.max_y,
        data_version=args.data_version, features=tuple(args.features),
        textures=args.textures, palette=args.palette,
        simplify_colors=args.simplify_colors, texture_downscale=args.texture_downscale,
        glass=args.glass, glass_threshold=args.glass_threshold, clean=args.clean,
        smooth=args.smooth, map_path=args.map_path, map_scale=args.map_scale,
        dry_run=args.dry_run)

    started = time.time()

    def show(message, fraction=None):
        if fraction is None:
            print(message)
            return
        elapsed = time.time() - started
        remaining = (elapsed * (1 - fraction) / fraction
                     if fraction > 0.02 and elapsed > 2 else None)
        print(f"  [{fraction * 100:5.1f}%] {message}  ({_format_duration(elapsed)} elapsed"
              + (f", ~{_format_duration(remaining)} left)" if remaining else ")"))

    try:
        result = build(options, on_progress=show)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1

    if result.auto_centered:
        print(f"  centred on the data: {options.center[0]:.6f}, {options.center[1]:.6f}")
    print(f"  {result.surfaces:,} surfaces -> {result.voxels:,} voxels "
          f"(-{result.removed:,} loose, +{result.patched:,} seams, "
          f"{result.smoothed:,} smoothed)")
    if result.textured:
        print(f"  {result.textured:,} surfaces textured, {result.glazed:,} glazed, "
              f"{result.materials_used:,} coloured from X3DMaterial")
        if result.missing_images:
            print(f"  {result.missing_images:,} texture images could not be read",
                  file=sys.stderr)
        for name, count in list(result.block_counts.items())[:8]:
            print(f"      {count:>8,}  {name}")
    if result.dry_run if hasattr(result, "dry_run") else options.dry_run:
        return 0
    print(f"  {len(result.region_files)} region files in "
          f"{Path(options.output) / 'world_data' / 'region'}")
    print("  nothing was cut" if not result.clipped
          else f"  {result.clipped:,} voxels fell outside y {args.min_y}..{args.max_y}")
    for path in result.map_files:
        print(f"  map: {path}")
    print(f"  spawn: /tp 0 {result.spawn_y} 0")
    print(f"done in {_format_duration(result.seconds)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
