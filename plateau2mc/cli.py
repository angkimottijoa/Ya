#!/usr/bin/env python3
"""
Build a Minecraft Java Edition map from PLATEAU CityGML.

    python -m plateau2mc PLATEAU/udx/bldg --center 35.6595,139.7005 \
        --radius 800 --world ~/.minecraft/saves/Tokyo

Writes Anvil region files straight into an existing world's `region/`
directory. It deliberately does not create the world for you: the world's
height range, dimension type and generator belong to whatever datapack or
mod you are using to extend build height, and a generated `level.dat` would
only fight with it. Make an empty/superflat world with your own setup first,
then point this at it.

Scale is fixed at one block per metre, using the Japan Plane Rectangular
zone the data falls in, so nothing is stretched the way a Web Mercator
export would be.
"""
import argparse
import sys
import time

from .anvil import DEFAULT_DATA_VERSION
from .heightfit import MODE_NONE, MODES
from .jgd2011 import TOKYO_ZONE
from .pipeline import (GEOMETRIES, GEOMETRY_LOD1, Options, build_world,
                       _format_duration)
from .surfaces import FEATURE_TYPES

# A few well known anchors, so a first run does not need coordinate hunting.
LANDMARKS = {
    "shibuya": (35.659515, 139.700501),      # Scramble Crossing
    "shinjuku": (35.690921, 139.700258),     # Shinjuku station
    "tokyo-station": (35.681236, 139.767125),
    "skytree": (35.710063, 139.810700),
    "tokyo-tower": (35.658581, 139.745433),
    "ginza": (35.671989, 139.765089),
    "akihabara": (35.698353, 139.773114),
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
        prog="python -m plateau2mc", description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", nargs="+",
                        help="PLATEAU CityGML file(s), or a directory searched for *.gml "
                             "(point it at the extracted udx/bldg folder)")
    parser.add_argument("--world", required=True,
                        help="existing Minecraft save directory; region files are written "
                             "into its region/ subfolder")
    parser.add_argument("--center", type=parse_center, default=None,
                        help="map origin as 'lat,lon' or a landmark name "
                             "(" + ", ".join(sorted(LANDMARKS)) + "). Omit it and the "
                             "centre of whatever CityGML you pointed at is used, so an "
                             "unzipped download works with no coordinates to look up")
    parser.add_argument("--radius", type=int, default=800,
                        help="half-width of the square area to build, in metres/blocks "
                             "(default: 800, i.e. a 1.6 km square)")
    parser.add_argument("--zone", type=int, default=None,
                        help="Japan Plane Rectangular zone 1-19 (default: inferred from "
                             f"--center; Tokyo is {TOKYO_ZONE})")
    parser.add_argument("--sea-level", type=int, default=62,
                        help="block y that altitude 0 m (Tokyo Peil) maps to (default: 62)")
    parser.add_argument("--min-y", type=int, default=-64,
                        help="world floor; must be a multiple of 16 (default: -64)")
    parser.add_argument("--max-y", type=int, default=319,
                        help="world ceiling; max_y+1 must be a multiple of 16. Raise this to "
                             "match a height-extending datapack, e.g. --max-y 1023 "
                             "(default: 319, vanilla)")
    parser.add_argument("--max-building-height", type=float, default=None,
                        help="clamp building heights, in metres (default: none, i.e. keep the "
                             "data exactly as PLATEAU has it)")
    parser.add_argument("--fit", choices=list(MODES), default=MODE_NONE,
                        help="how to deal with buildings taller than the world. 'none' (the "
                             "default) keeps every height 1:1 and touches nothing; "
                             "'compress' keeps buildings below --knee at 1:1 and squashes only "
                             "what rises above it, so nothing is lost off the top; 'scale' "
                             "shrinks everything by one factor")
    parser.add_argument("--knee", type=float, default=60.0,
                        help="with --fit compress, the height below which buildings stay "
                             "exactly 1:1 (default: 60 m)")
    parser.add_argument("--solid", action="store_true",
                        help="fill buildings solid instead of leaving them hollow shells "
                             "(far more blocks, much larger world)")
    parser.add_argument("--no-terrain", dest="terrain", action="store_false",
                        help="skip the ground surface and place buildings only")
    parser.add_argument("--terrain-cell", type=int, default=32,
                        help="terrain interpolation cell size in blocks (default: 32)")
    parser.add_argument("--data-version", type=int, default=DEFAULT_DATA_VERSION,
                        help=f"chunk DataVersion to stamp (default: {DEFAULT_DATA_VERSION}, "
                             "which is 1.21.4; use your target version's value)")
    parser.add_argument("--geometry", choices=list(GEOMETRIES), default=GEOMETRY_LOD1,
                        help="'lod1' extrudes each building's footprint to its measured "
                             "height (fast, tidy). 'lod2' voxelizes the real LOD2 surfaces "
                             "instead -- pitched roofs, setbacks, balconies -- falling back "
                             "to LOD1 per building where LOD2 is absent, as PLATEAU's own "
                             f"converter does (default: {GEOMETRY_LOD1})")
    parser.add_argument("--features", nargs="+", default=["bldg"],
                        choices=[f for f in FEATURE_TYPES if f != "dem"],
                        help="which PLATEAU packages to convert, with --geometry lod2 "
                             "(default: bldg). tran/frn/veg carry no elevation of their own, "
                             "so they sit at altitude 0")
    parser.add_argument("--no-clean", dest="clean", action="store_false",
                        help="skip the mesh clean-up passes (loose-voxel removal and seam "
                             "patching) that --geometry lod2 applies by default")
    parser.add_argument("--map", dest="map_path", default=None,
                        help="also write a top-down block plan to this .html path, labelled "
                             "in Minecraft coordinates, with a .png beside it")
    parser.add_argument("--map-scale", type=int, default=1,
                        help="blocks per map pixel (default: 1; raise it for a whole ward)")
    parser.add_argument("--textures", action="store_true",
                        help="colour blocks from the LOD2 texture images instead of using "
                             "one block per surface type. Needs --geometry lod2")
    parser.add_argument("--simplify-colors", type=int, default=12, metavar="N",
                        help="flatten each texture to N colours before matching, which "
                             "turns JPEG noise into the flat panels a facade actually has "
                             "(default: 12; 0 disables)")
    parser.add_argument("--texture-downscale", type=int, default=4, metavar="N",
                        help="shrink each texture by this factor before sampling "
                             "(default: 4; blocks are 1 m, so full resolution is wasted)")
    parser.add_argument("--no-glass", dest="glass", action="store_false",
                        help="never use glass blocks; glazing becomes concrete like "
                             "everything else")
    parser.add_argument("--glass-threshold", type=float, default=0.35, metavar="F",
                        help="fraction of a wall's pixels that must read as glazing before "
                             "the whole wall becomes glass (default: 0.35). The decision is "
                             "per wall, never per pixel, so a window never comes out speckled "
                             "with concrete")
    parser.add_argument("--smooth", type=int, default=0, metavar="N",
                        help="take the stair-stepping off curved surfaces, N passes "
                             "(default: 0). Each pass drops single-voxel spurs and fills "
                             "notches, and is abandoned if it would change more than 6%% of "
                             "the model, so a spire or a railing is never dissolved")
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would be built without writing region files")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    options = Options(
        source=args.source, world=args.world, center=args.center, radius=args.radius,
        zone=args.zone, sea_level=args.sea_level, min_y=args.min_y, max_y=args.max_y,
        max_building_height=args.max_building_height, fit=args.fit, knee=args.knee,
        solid=args.solid, terrain=args.terrain, terrain_cell=args.terrain_cell,
        data_version=args.data_version, dry_run=args.dry_run,
        geometry=args.geometry, features=tuple(args.features), clean=args.clean,
        map_path=args.map_path, map_scale=args.map_scale,
        textures=args.textures, simplify_colors=args.simplify_colors,
        texture_downscale=args.texture_downscale, glass=args.glass,
        glass_threshold=args.glass_threshold, smooth=args.smooth)

    started = time.time()

    def show(message, fraction=None):
        if fraction is None:
            print(message)
            return
        elapsed = time.time() - started
        remaining = (elapsed * (1 - fraction) / fraction
                     if fraction > 0.02 and elapsed > 2 else None)
        print(f"  [{fraction * 100:5.1f}%] {message}"
              f"  ({_format_duration(elapsed)} elapsed"
              + (f", ~{_format_duration(remaining)} left)" if remaining else ")"))

    try:
        result = build_world(options, on_progress=show)
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1

    if result.overflow_count:
        print(f"  warning: {result.overflow_count} building(s) rise above --max-y "
              f"{args.max_y} (highest would need y={result.overflow_needs_y}) and "
              f"will lose their tops.", file=sys.stderr)
        print("  to keep them whole: raise --max-y (Java, with a height datapack), "
              "or use --fit compress.", file=sys.stderr)

    if result.auto_centered:
        print(f"  centred on the data: {options.center[0]:.6f}, {options.center[1]:.6f}")
    if result.voxels:
        print(f"  {result.voxels:,} voxels (removed {result.voxels_removed:,} loose, "
              f"patched {result.voxels_patched:,} seams, "
              f"smoothed {result.voxels_smoothed:,})")
    if result.textured_surfaces:
        print(f"  {result.textured_surfaces:,} surfaces textured, "
              f"{result.glazed_surfaces:,} of them glazed")
        for name, count in list(result.block_counts.items())[:8]:
            print(f"      {count:>8,}  {name}")

    if result.dry_run:
        return 0

    for path in result.map_files:
        print(f"  map: {path}")

    if result.clipped_buildings:
        print(f"  {result.clipped_buildings} building(s) had their tops cut to fit "
              f"y<={args.max_y}", file=sys.stderr)
    else:
        print("  no building was cut: every height went in whole")
    print(f"spawn on the centre point: /tp 0 {result.spawn_y} 0")
    print(f"done in {result.seconds:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
