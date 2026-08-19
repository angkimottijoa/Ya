#!/usr/bin/env python3
"""
Image -> Minecraft banner pixel-art converter, with a Bedrock Edition
`.mcstructure` exporter (and an optional Java `.nbt` structure exporter).

Usage:
    python cli.py path/to/image.png --resolution 8x8
    python cli.py path/to/image.png --resolution 16x12 --format both --no-gen-blocks
"""
import argparse
import sys

from banner2bedrock.image_to_banners import banner_gen
from banner2bedrock.mcstructure_writer import mcstructure_gen
from banner2bedrock.utils import print_with_flush


def parse_resolution(value):
    try:
        w, h = value.lower().split("x")
        return int(w), int(h)
    except ValueError:
        raise argparse.ArgumentTypeError("resolution must look like WIDTHxHEIGHT, e.g. 8x8")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("image", help="path to the source image")
    parser.add_argument("--resolution", "-r", type=parse_resolution, required=True,
                         help="banner grid size as WIDTHxHEIGHT, e.g. 8x8 (each unit is one banner column)")
    parser.add_argument("--format", choices=["bedrock", "java", "both"], default="bedrock",
                         help="output structure format (default: bedrock)")
    parser.add_argument("--output-dir", default="generated",
                         help="base output directory (default: ./generated)")
    parser.add_argument("--no-gen-blocks", dest="gen_blocks", action="store_false",
                         help="disable filling in extra full blocks above/below each banner for higher fidelity")
    parser.add_argument("--gen-layering", action="store_true",
                         help="allow a second overlapping banner layer for extra detail")
    parser.add_argument("--gen-big", action="store_true",
                         help="allow more than 6 pattern layers per banner (slower, more detail)")
    parser.add_argument("--use-pattern-items", action="store_true",
                         help="allow patterns that require special banner pattern items "
                              "(creeper/skull/flower/mojang/globe/piglin/flow/guster)")
    parser.add_argument("--threads", type=int, default=4, help="worker processes (default: 4)")
    parser.add_argument("--compare-method", type=float, default=0.5,
                         help="0.0-1.0 weight between color-delta (CIEDE2000) and structural (SSIM) "
                              "similarity when picking patterns/blocks (default: 0.5)")
    parser.set_defaults(gen_blocks=True)
    args = parser.parse_args()

    print_with_flush(f"Generating banners for {args.image} at {args.resolution[0]}x{args.resolution[1]}...")

    full_image, banner_json, file_name = banner_gen(
        args.image,
        args.resolution,
        args.gen_blocks,
        args.gen_layering,
        args.gen_big,
        args.use_pattern_items,
        args.threads,
        args.compare_method,
    )

    preview_path = f"{args.output_dir}/{file_name}_preview.png"
    import os
    os.makedirs(args.output_dir, exist_ok=True)
    full_image.save(preview_path)
    print_with_flush(f"Saved preview image: {preview_path}")

    json_path = f"{args.output_dir}/{file_name}.json"
    import json
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(banner_json, f)
    print_with_flush(f"Saved banner layout: {json_path}")

    if args.format in ("bedrock", "both"):
        out = mcstructure_gen(file_name, banner_json, output_dir=f"{args.output_dir}/mcstructure")
        print_with_flush(f"Saved Bedrock structure: {out}")
        print_with_flush("Copy this .mcstructure file into your world's `structures` folder "
                          "(or a behavior pack's structures/ folder) and load it with a Structure Block.")

    if args.format in ("java", "both"):
        from banner2bedrock.java_nbt_writer import process_data
        out = process_data(banner_json, file_name, output_dir=f"{args.output_dir}/nbt")
        print_with_flush(f"Saved Java structure: {out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
