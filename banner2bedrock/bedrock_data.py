"""
Java -> Bedrock Edition mapping tables for banners and filler blocks.

The banner pattern short-codes and the Base/Color integer formula are taken
from GeyserMC's protocol translation layer (GeyserMC/Geyser, MIT License):
  - core/.../inventory/item/BannerPattern.java   (pattern -> short code)
  - core/.../inventory/item/DyeColor.java         (dye ordering)
  - core/.../translator/level/block/entity/BannerBlockEntityTranslator.java
    (`Base = 15 - dyeColor.ordinal()`, i.e. the well known "banner color id"
    inversion that both Java's pre-1.20.5 raw NBT and Bedrock's current
    format use)
These are the exact values Geyser uses to show a Java-placed banner
correctly to Bedrock players, so they are as close to "ground truth" as is
available outside of decompiling the game itself.
"""

# Order matches Mojang's canonical DyeColor enum, and the `colors` dict in
# image_to_banners.py. Bedrock's Base/Color NBT int is `15 - index`.
DYE_COLOR_ORDER = [
    "white", "orange", "magenta", "light_blue", "yellow", "lime", "pink",
    "gray", "light_gray", "cyan", "purple", "blue", "brown", "green", "red", "black",
]


def dye_color_to_bedrock_int(color_name):
    return 15 - DYE_COLOR_ORDER.index(color_name)


# Java banner_pattern registry id -> Bedrock short pattern code.
BANNER_PATTERN_CODES = {
    "base": "b",
    "square_bottom_left": "bl",
    "square_bottom_right": "br",
    "square_top_left": "tl",
    "square_top_right": "tr",
    "stripe_bottom": "bs",
    "stripe_top": "ts",
    "stripe_left": "ls",
    "stripe_right": "rs",
    "stripe_center": "cs",
    "stripe_middle": "ms",
    "stripe_downright": "drs",
    "stripe_downleft": "dls",
    "small_stripes": "ss",
    "cross": "cr",
    "straight_cross": "sc",
    "triangle_bottom": "bt",
    "triangle_top": "tt",
    "triangles_bottom": "bts",
    "triangles_top": "tts",
    "diagonal_left": "ld",
    "diagonal_up_right": "rd",
    "diagonal_up_left": "lud",
    "diagonal_right": "rud",
    "circle": "mc",
    "rhombus": "mr",
    "half_vertical": "vh",
    "half_horizontal": "hh",
    "half_vertical_right": "vhr",
    "half_horizontal_bottom": "hhb",
    "border": "bo",
    "curly_border": "cbo",
    "gradient": "gra",
    "gradient_up": "gru",
    "bricks": "bri",
    "globe": "glb",
    "creeper": "cre",
    "skull": "sku",
    "flower": "flo",
    "mojang": "moj",
    "piglin": "pig",
    "flow": "flw",
    "guster": "gus",
}


def banner_pattern_to_bedrock_code(pattern_id):
    """`pattern_id` is the bit after '#', e.g. "curly_border" from
    "white#curly_border". Falls back to the id itself if unknown so a
    mismatch is at least visible instead of silently dropped."""
    return BANNER_PATTERN_CODES.get(pattern_id, pattern_id)


# Bedrock filler-block translation.
#
# Java and Bedrock share the same `minecraft:<name>` ids for the large
# majority of plain, state-less blocks (wool/concrete/terracotta/stone
# family/logs/planks/etc.), so the default is a direct pass-through.
#
# A handful of blocks used as filler need a Bedrock block *state* to render
# the same face image2banners picked them for (e.g. a log's end-grain
# texture on top). Those are best-effort: Bedrock's state names for less
# common blocks (crafter orientation, mushroom block face bits, beehive fill
# level) aren't confidently known without decompiling the game, so those
# fall back to the block's default orientation instead of guessing wrong.
# Getting a filler block's facing slightly off is a cosmetic-only issue (the
# block is still valid and still gives the intended texture/color on most
# faces) -- it never breaks structure loading.
_PILLAR_BLOCKS_ANY_SUFFIX = True  # any "<name>-top" block uses pillar_axis


def bedrock_block_name_and_states(java_block_name):
    """Returns (bedrock_block_id, states_dict) for a filler block name as
    produced by image_to_banners.generate_blocks (e.g. "furnace-side",
    "birch_trapdoor", "smooth_stone_slab", "polished_andesite")."""
    if "-" in java_block_name:
        base, component = java_block_name.split("-", 1)
    else:
        base, component = java_block_name, None

    states = {}

    if base == "smooth_stone_slab":
        # image2banners only ever places this as a full block via the
        # (Java-only) "type: double" state; Bedrock already has a real,
        # state-less full block with the identical texture/look.
        return "minecraft:smooth_stone", states

    if component == "top" and _PILLAR_BLOCKS_ANY_SUFFIX:
        # Rotated so the log/pillar end-grain (top) texture faces the
        # viewer, matching what banners_to_nbt.py does for Java's `axis`.
        states["pillar_axis"] = "z"

    if "trapdoor" in base:
        # Java places these facing=south, open=true.
        states["direction"] = 0  # 0=south in Bedrock's 4-way door/trapdoor convention
        states["open_bit"] = 1
        states["upside_down_bit"] = 0
    elif "shulker_box" in base:
        # Java places these facing=north.
        states["facing_direction"] = 2  # 0-5 = down/up/north/south/west/east

    return f"minecraft:{base}", states
