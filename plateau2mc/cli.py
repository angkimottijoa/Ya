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
from pathlib import Path

import numpy as np

from .anvil import DEFAULT_DATA_VERSION, ChunkBuilder, RegionWriter
from .citygml import read_buildings
from .heightfit import MODE_COMPRESS, MODE_NONE, MODES, HeightFit
from .jgd2011 import PlaneRectangular, TOKYO_ZONE, guess_zone
from .voxel import CityVoxelizer, Materials, TerrainField, project_footprints

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
    parser.add_argument("--center", type=parse_center, required=True,
                        help="map origin as 'lat,lon' or a landmark name "
                             "(" + ", ".join(sorted(LANDMARKS)) + ")")
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
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would be built without writing region files")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)

    lat, lon = args.center
    zone = args.zone or guess_zone(lat, lon)
    projector = PlaneRectangular(zone)
    origin_east, origin_north = projector(lat, lon)
    print(f"origin {lat:.6f},{lon:.6f} -> zone {zone} (EPSG:{projector.epsg}) "
          f"{origin_east:.1f} E {origin_north:.1f} N")

    radius = args.radius
    kept, seen = [], 0
    started = time.time()
    for building in read_buildings(args.source, progress=lambda msg: print(f"  {msg}")):
        seen += 1
        centre = building.centroid()
        if centre is None:
            continue
        east, north = projector(*centre)
        if abs(east - origin_east) <= radius and abs(north - origin_north) <= radius:
            kept.append(building)
    print(f"{len(kept)} buildings within {radius} m of the origin "
          f"(scanned {seen} in {time.time() - started:.1f}s)")

    if not kept:
        print("nothing to build -- check that --center falls inside the CityGML tiles given",
              file=sys.stderr)
        return 1

    footprints = project_footprints(kept, projector, origin_east, origin_north,
                                    max_height=args.max_building_height)
    terrain = TerrainField(footprints, cell_size=args.terrain_cell)

    samples = [(f.ground_alt, f.height) for f in footprints]
    height_fit = HeightFit(args.min_y, args.max_y, samples, mode=args.fit,
                           sea_level=args.sea_level, knee=args.knee)
    print(f"height: {height_fit.describe()}")

    voxelizer = CityVoxelizer(
        footprints, terrain, height_fit, materials=Materials(),
        min_y=args.min_y, max_y=args.max_y, hollow=not args.solid,
        terrain_enabled=args.terrain)

    chunk_keys = _chunks_to_build(voxelizer, radius, args.terrain)
    tallest = max(f.height for f in footprints)
    top_block = int(round(max(height_fit.top_y(alt, h) for alt, h in samples)))
    print(f"{len(chunk_keys)} chunks; tallest building {tallest:.0f} m, "
          f"highest block y={top_block}")

    overflow = height_fit.overflow(samples)
    if overflow:
        worst = max(top for _, top in overflow)
        print(f"  warning: {len(overflow)} building(s) rise above --max-y {args.max_y} "
              f"(highest would need y={worst:.0f}) and will lose their tops.",
              file=sys.stderr)
        print(f"  to keep them whole: raise --max-y (Java, with a height datapack), "
              f"or use --fit compress.", file=sys.stderr)

    if args.dry_run:
        return 0

    region_dir = Path(args.world) / "region"
    writer = RegionWriter(region_dir, data_version=args.data_version)
    for done, (chunk_x, chunk_z) in enumerate(chunk_keys, 1):
        chunk = ChunkBuilder(chunk_x, chunk_z, args.min_y, args.max_y)
        voxelizer.fill(chunk)
        if not chunk.is_empty():
            writer.add(chunk)
        if done % 200 == 0 or done == len(chunk_keys):
            print(f"  {done}/{len(chunk_keys)} chunks")

    files = writer.flush()
    print(f"wrote {writer.chunks_written} chunks across {len(files)} region files "
          f"in {region_dir}")
    if voxelizer.clipped_buildings:
        print(f"  {voxelizer.clipped_buildings} building(s) had their tops cut to fit "
              f"y<={args.max_y}", file=sys.stderr)
    else:
        print("  no building was cut: every height went in whole")
    # Where the ground actually ended up at the origin, which is not
    # sea level once a fit has shifted the datum.
    origin_alt = float(terrain.sample(np.array([0.5]), np.array([0.5]))[0])
    spawn_y = int(round(height_fit.ground_y(origin_alt))) + 2
    print(f"spawn on the centre point: /tp 0 {spawn_y} 0")
    return 0


def _chunks_to_build(voxelizer, radius, terrain_enabled):
    """Chunks holding buildings, plus the full square if terrain is on."""
    keys = set(voxelizer.chunk_keys())
    if terrain_enabled:
        for chunk_x in range(-radius >> 4, (radius >> 4) + 1):
            for chunk_z in range(-radius >> 4, (radius >> 4) + 1):
                keys.add((chunk_x, chunk_z))
    return sorted(keys)


if __name__ == "__main__":
    sys.exit(main())
