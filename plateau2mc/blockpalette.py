"""
Choosing a block for a colour.

PLATEAU's own converter emits stone for everything -- "テクスチャデータの有無
にかかわらず、全てのブロックが石（Stone）として生成されます" -- which throws away
the LOD2 texture imagery entirely. This is the table that lets it be used.

Matching is done in CIE Lab with a plain Euclidean distance rather than in
RGB, because RGB distance ranks a mid grey closer to a saturated blue than
to a slightly lighter grey, and a city's facades are mostly greys.

Glazing is handled separately from the rest. A curtain-wall texture reads
as a fairly dark, desaturated, distinctly blue patch, and matching that on
colour alone lands on a dark concrete: correct in hue, wrong in what the
building *is*. `is_glassy` recognises that band, and glass-family blocks
are then preferred for it, so a glass tower comes out as a glass tower.
"""
import numpy as np

# Representative sRGB for each block's dominant face, as it appears in game
# under full light. Deliberately a small palette: a city rendered against
# 200 blocks looks like noise, and these are the families whose colours a
# facade actually falls into.
OPAQUE_BLOCKS = {
    "minecraft:white_concrete": (207, 213, 214),
    "minecraft:light_gray_concrete": (125, 125, 115),
    "minecraft:gray_concrete": (54, 57, 61),
    "minecraft:black_concrete": (8, 10, 15),
    "minecraft:smooth_quartz": (235, 229, 222),
    "minecraft:white_terracotta": (209, 178, 161),
    "minecraft:light_gray_terracotta": (135, 106, 97),
    "minecraft:gray_terracotta": (57, 42, 35),
    "minecraft:brown_terracotta": (77, 51, 35),
    "minecraft:red_terracotta": (143, 61, 46),
    "minecraft:orange_terracotta": (161, 83, 37),
    "minecraft:yellow_terracotta": (186, 133, 35),
    "minecraft:stone": (125, 125, 125),
    "minecraft:smooth_stone": (158, 158, 158),
    "minecraft:deepslate_tiles": (54, 54, 57),
    "minecraft:polished_andesite": (132, 135, 133),
    "minecraft:polished_diorite": (193, 194, 195),
    "minecraft:bricks": (150, 97, 83),
    "minecraft:sandstone": (216, 203, 155),
    "minecraft:copper_block": (192, 107, 79),
    "minecraft:oxidized_copper": (82, 162, 132),
    "minecraft:green_terracotta": (76, 83, 42),
    "minecraft:blue_terracotta": (74, 60, 91),
    "minecraft:prismarine": (99, 156, 145),
    "minecraft:oak_leaves": (61, 92, 35),
    "minecraft:moss_block": (89, 109, 45),
}

# The glazing family, in the tints curtain walls actually come in.
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


def _srgb_to_lab(rgb):
    """sRGB (0-255) -> CIE Lab, D65. Vectorized over a trailing axis of 3."""
    rgb = np.asarray(rgb, dtype=np.float64) / 255.0
    linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)

    matrix = np.array([[0.4124564, 0.3575761, 0.1804375],
                       [0.2126729, 0.7151522, 0.0721750],
                       [0.0193339, 0.1191920, 0.9503041]])
    xyz = linear @ matrix.T
    white = np.array([0.95047, 1.00000, 1.08883])
    ratio = xyz / white

    epsilon = 216 / 24389
    kappa = 24389 / 27
    f = np.where(ratio > epsilon, np.cbrt(ratio), (kappa * ratio + 16) / 116)

    return np.stack([116 * f[..., 1] - 16,
                     500 * (f[..., 0] - f[..., 1]),
                     200 * (f[..., 1] - f[..., 2])], axis=-1)


def is_glassy(rgb):
    """Does this colour read as glazing rather than as a solid facade?

    Curtain walls photograph as mid-to-dark, weakly saturated and cooler
    than neutral -- the sky reflected in them. The test is deliberately
    narrow: a beige wall in shade must not become a window.
    """
    rgb = np.atleast_2d(np.asarray(rgb, dtype=np.float64))
    red, green, blue = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    largest = rgb.max(axis=1)
    smallest = rgb.min(axis=1)
    value = largest / 255.0
    saturation = np.where(largest > 0, (largest - smallest) / np.maximum(largest, 1), 0.0)

    cool = blue >= green - 4
    bluish = blue > red + 6
    muted = saturation < 0.45
    # Up to 0.92 rather than 0.80: a curtain wall reflecting open sky is
    # one of the brightest things on a building, and cutting it out was
    # sending pale blue glazing to smooth stone.
    mid = (value > 0.10) & (value < 0.92)
    return cool & bluish & muted & mid


class BlockMatcher:
    """Nearest block by Lab distance, with a separate glazing family."""

    def __init__(self, opaque=None, glass=None, glass_bias=1.0):
        self.opaque_names = list((opaque or OPAQUE_BLOCKS).keys())
        self.glass_names = list((glass or GLASS_BLOCKS).keys())
        self._opaque_lab = _srgb_to_lab(np.array(list((opaque or OPAQUE_BLOCKS).values())))
        self._glass_lab = _srgb_to_lab(np.array(list((glass or GLASS_BLOCKS).values())))
        # Below 1.0 the glass family wins ties, which is what "prefer glass
        # where it looks like glass" means in practice.
        self.glass_bias = glass_bias

    def match(self, colours, allow_glass=True, glazed=None):
        """(n, 3) sRGB -> (n,) block names.

        `glazed` forces the whole batch into one family. Deciding per pixel
        looks right on paper and is wrong in practice: a curtain wall's
        texture has mullions, blinds and reflected cloud in it, so a
        per-pixel test scatters concrete and terracotta through a window.
        Callers pass a per-surface verdict instead, which is what keeps
        glazing reading as glazing and leaves ordinary walls in concrete.
        """
        colours = np.atleast_2d(np.asarray(colours))
        if len(colours) == 0:
            return np.empty(0, dtype=object)
        lab = _srgb_to_lab(colours)

        if glazed is True and allow_glass:
            index = np.argmin(
                ((lab[:, None, :] - self._glass_lab[None, :, :]) ** 2).sum(axis=2), axis=1)
            return np.array(self.glass_names, dtype=object)[index]

        opaque_index = np.argmin(
            ((lab[:, None, :] - self._opaque_lab[None, :, :]) ** 2).sum(axis=2), axis=1)
        names = np.array(self.opaque_names, dtype=object)[opaque_index]

        if not allow_glass or glazed is False:
            return names

        glassy = is_glassy(colours)
        if glassy.any():
            glass_lab = lab[glassy]
            glass_index = np.argmin(
                ((glass_lab[:, None, :] - self._glass_lab[None, :, :]) ** 2).sum(axis=2) * self.glass_bias,
                axis=1)
            names[glassy] = np.array(self.glass_names, dtype=object)[glass_index]
        return names

    def surface_is_glazed(self, colours, threshold=0.35):
        """Is this whole surface a window, judged over all of its pixels?

        Two signals, because either alone misfires. The share of pixels
        that read as glazing catches a wall that is mostly window but
        partly mullion; the surface's mean colour catches a wall whose
        pixels are individually noisy -- compression and per-pixel shading
        push individual samples across the hue test, but their average sits
        squarely where it belongs.
        """
        colours = np.atleast_2d(np.asarray(colours))
        if len(colours) == 0:
            return False
        share = float(is_glassy(colours).mean())
        if share >= threshold:
            return True
        mean_is_glassy = bool(is_glassy(colours.mean(axis=0))[0])
        return mean_is_glassy and share >= threshold / 2
