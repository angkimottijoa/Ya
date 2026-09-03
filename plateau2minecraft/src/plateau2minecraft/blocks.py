"""
Choosing a Minecraft block for a colour, in two registers.

FORK: added. Upstream emits `Block("minecraft", "stone")` for every voxel.

Two palettes, because the two things people want from a converted city
pull in opposite directions:

* `RICH` is the whole block catalogue worth using -- concretes, terracottas,
  glazed and unglazed, coppers, woods, the full glass family. Facades come
  out close to their real colour and the city is as varied as its
  photographs. Best with little or no texture quantization.
* `SIMPLE` is a dozen neutrals plus glass. Individual buildings lose their
  exact shade, but the city reads cleanly from a distance, is far easier to
  build on top of, and does not shimmer with JPEG noise. Best with heavy
  quantization.

Matching is in CIE Lab with a Euclidean distance, not in RGB: RGB distance
puts a mid grey nearer a saturated blue than a slightly lighter grey, and
a city is mostly greys.

Glazing is a separate family and a separate decision. A curtain wall's
texture contains mullions, blinds and reflected cloud, so testing pixel by
pixel scatters concrete through a window; the caller judges a whole surface
and then matches it against glass alone.
"""
import numpy as np

RICH = "rich"
SIMPLE = "simple"
PALETTES = (RICH, SIMPLE)

# Representative sRGB for each block's dominant face in full light.
RICH_BLOCKS = {
    "minecraft:white_concrete": (207, 213, 214),
    "minecraft:light_gray_concrete": (125, 125, 115),
    "minecraft:gray_concrete": (54, 57, 61),
    "minecraft:black_concrete": (8, 10, 15),
    "minecraft:cyan_concrete": (21, 119, 136),
    "minecraft:blue_concrete": (44, 46, 143),
    "minecraft:light_blue_concrete": (35, 137, 198),
    "minecraft:brown_concrete": (96, 59, 31),
    "minecraft:red_concrete": (142, 32, 32),
    "minecraft:orange_concrete": (224, 97, 0),
    "minecraft:yellow_concrete": (240, 175, 21),
    "minecraft:lime_concrete": (94, 168, 24),
    "minecraft:green_concrete": (73, 91, 36),
    "minecraft:pink_concrete": (213, 101, 142),
    "minecraft:purple_concrete": (100, 31, 156),
    "minecraft:magenta_concrete": (169, 48, 159),
    "minecraft:white_terracotta": (209, 178, 161),
    "minecraft:light_gray_terracotta": (135, 106, 97),
    "minecraft:gray_terracotta": (57, 42, 35),
    "minecraft:brown_terracotta": (77, 51, 35),
    "minecraft:red_terracotta": (143, 61, 46),
    "minecraft:orange_terracotta": (161, 83, 37),
    "minecraft:yellow_terracotta": (186, 133, 35),
    "minecraft:green_terracotta": (76, 83, 42),
    "minecraft:blue_terracotta": (74, 60, 91),
    "minecraft:cyan_terracotta": (86, 91, 91),
    "minecraft:terracotta": (152, 94, 67),
    "minecraft:smooth_quartz": (235, 229, 222),
    "minecraft:quartz_bricks": (233, 228, 219),
    "minecraft:calcite": (223, 224, 220),
    "minecraft:diorite": (188, 188, 188),
    "minecraft:polished_diorite": (193, 194, 195),
    "minecraft:andesite": (136, 136, 137),
    "minecraft:polished_andesite": (132, 135, 133),
    "minecraft:stone": (125, 125, 125),
    "minecraft:smooth_stone": (158, 158, 158),
    "minecraft:deepslate": (77, 77, 82),
    "minecraft:deepslate_tiles": (54, 54, 57),
    "minecraft:polished_deepslate": (72, 72, 74),
    "minecraft:bricks": (150, 97, 83),
    "minecraft:mud_bricks": (137, 103, 78),
    "minecraft:sandstone": (216, 203, 155),
    "minecraft:smooth_sandstone": (215, 202, 156),
    "minecraft:red_sandstone": (186, 99, 29),
    "minecraft:copper_block": (192, 107, 79),
    "minecraft:exposed_copper": (161, 125, 103),
    "minecraft:weathered_copper": (108, 153, 117),
    "minecraft:oxidized_copper": (82, 162, 132),
    "minecraft:oak_planks": (162, 130, 78),
    "minecraft:spruce_planks": (114, 84, 48),
    "minecraft:dark_oak_planks": (66, 43, 20),
    "minecraft:prismarine": (99, 156, 145),
    "minecraft:oak_leaves": (61, 92, 35),
    "minecraft:moss_block": (89, 109, 45),
    "minecraft:mud": (60, 55, 57),
    "minecraft:iron_block": (220, 220, 220),
}

# The distance read: neutrals, two warms, one green. Nothing that draws the
# eye to an individual building.
SIMPLE_BLOCKS = {
    "minecraft:white_concrete": (207, 213, 214),
    "minecraft:light_gray_concrete": (125, 125, 115),
    "minecraft:gray_concrete": (54, 57, 61),
    "minecraft:black_concrete": (8, 10, 15),
    "minecraft:smooth_quartz": (235, 229, 222),
    "minecraft:smooth_stone": (158, 158, 158),
    "minecraft:stone": (125, 125, 125),
    "minecraft:deepslate_tiles": (54, 54, 57),
    "minecraft:white_terracotta": (209, 178, 161),
    "minecraft:brown_terracotta": (77, 51, 35),
    "minecraft:bricks": (150, 97, 83),
    "minecraft:oak_leaves": (61, 92, 35),
}

GLASS_BLOCKS = {
    "minecraft:glass": (204, 224, 230),
    "minecraft:white_stained_glass": (233, 236, 236),
    "minecraft:light_gray_stained_glass": (154, 161, 161),
    "minecraft:gray_stained_glass": (76, 76, 76),
    "minecraft:light_blue_stained_glass": (102, 153, 216),
    "minecraft:blue_stained_glass": (51, 76, 178),
    "minecraft:cyan_stained_glass": (76, 127, 153),
    "minecraft:green_stained_glass": (102, 127, 51),
    "minecraft:black_stained_glass": (25, 25, 25),
    "minecraft:tinted_glass": (44, 40, 45),
}

SIMPLE_GLASS = {
    "minecraft:glass": (204, 224, 230),
    "minecraft:light_blue_stained_glass": (102, 153, 216),
    "minecraft:gray_stained_glass": (76, 76, 76),
    "minecraft:tinted_glass": (44, 40, 45),
}


def srgb_to_lab(rgb):
    """sRGB (0-255) -> CIE Lab, D65, vectorized over a trailing axis of 3."""
    rgb = np.asarray(rgb, dtype=np.float64) / 255.0
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    matrix = np.array([[0.4124564, 0.3575761, 0.1804375],
                       [0.2126729, 0.7151522, 0.0721750],
                       [0.0193339, 0.1191920, 0.9503041]])
    xyz = linear @ matrix.T
    ratio = xyz / np.array([0.95047, 1.00000, 1.08883])
    epsilon = 216 / 24389
    kappa = 24389 / 27
    f = np.where(ratio > epsilon, np.cbrt(ratio), (kappa * ratio + 16) / 116)
    return np.stack([116 * f[..., 1] - 16,
                     500 * (f[..., 0] - f[..., 1]),
                     200 * (f[..., 1] - f[..., 2])], axis=-1)


def is_glassy(rgb):
    """Does this colour read as glazing rather than as a solid facade?

    Curtain walls photograph cooler than neutral, weakly saturated, and
    anywhere from dark to sky-bright. The test is deliberately narrow so a
    beige wall in shade does not become a window.
    """
    rgb = np.atleast_2d(np.asarray(rgb, dtype=np.float64))
    red, green, blue = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    largest, smallest = rgb.max(axis=1), rgb.min(axis=1)
    value = largest / 255.0
    saturation = np.where(largest > 0, (largest - smallest) / np.maximum(largest, 1), 0.0)
    return ((blue >= green - 4) & (blue > red + 6) & (saturation < 0.45)
            & (value > 0.10) & (value < 0.92))


class BlockMatcher:
    def __init__(self, palette=RICH):
        if palette not in PALETTES:
            raise ValueError(f"palette must be one of {PALETTES}, got {palette!r}")
        self.palette = palette
        opaque = RICH_BLOCKS if palette == RICH else SIMPLE_BLOCKS
        glass = GLASS_BLOCKS if palette == RICH else SIMPLE_GLASS
        self.opaque_names = list(opaque)
        self.glass_names = list(glass)
        self._opaque_lab = srgb_to_lab(np.array(list(opaque.values())))
        self._glass_lab = srgb_to_lab(np.array(list(glass.values())))

    def surface_is_glazed(self, colours, threshold=0.35):
        """Judge a whole surface, never a pixel.

        Two signals: the share of pixels reading as glazing catches a wall
        that is mostly window but partly mullion, and the mean colour
        catches a noisy texture whose individual samples stray across the
        hue test while their average does not.
        """
        colours = np.atleast_2d(np.asarray(colours))
        if len(colours) == 0:
            return False
        share = float(is_glassy(colours).mean())
        if share >= threshold:
            return True
        return bool(is_glassy(colours.mean(axis=0))[0]) and share >= threshold / 2

    def match(self, colours, glazed=None, allow_glass=True):
        colours = np.atleast_2d(np.asarray(colours))
        if len(colours) == 0:
            return np.empty(0, dtype=object)
        lab = srgb_to_lab(colours)

        if glazed and allow_glass:
            index = np.argmin(
                ((lab[:, None, :] - self._glass_lab[None, :, :]) ** 2).sum(axis=2), axis=1)
            return np.array(self.glass_names, dtype=object)[index]

        index = np.argmin(
            ((lab[:, None, :] - self._opaque_lab[None, :, :]) ** 2).sum(axis=2), axis=1)
        return np.array(self.opaque_names, dtype=object)[index]
