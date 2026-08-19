"""
Writes a banner_json (as produced by image_to_banners.banner_gen) out as a
Bedrock Edition `.mcstructure` file, loadable in-game with a Structure Block
(Creative, "Load" mode) or via `/structure load`.

File format: an uncompressed, little-endian NBT compound. Verified against:
  - the Bedrock community wiki's .mcstructure page (root/structure/palette
    layout, block_indices index formula, block_position_data semantics)
  - GeyserMC/Geyser (MIT License) for the exact Banner block-entity shape
    and the Base/Color/Pattern value formulas (see bedrock_data.py)
  - JaylyDev/nbt-to-mcstructure (MIT License) as a working, in-the-wild
    reference implementation of a Java structure -> .mcstructure converter,
    used here to cross-check the NBT tree shape (this module does not reuse
    its code, since our input is our own banner_json rather than an
    arbitrary Java structure file).

Unlike the Java `.nbt` structure files this format has no baked-in 32/48
block size ceiling (that limit belongs to the in-game Structure Block UI,
not the file format), so this writer does not cap width/height the way
Image2Banners' `banners_to_nbt.py` does.
"""
import re
from pathlib import Path

from pynbt import NBTFile, TAG_Compound, TAG_Int, TAG_List, TAG_String, TAG_Byte

from .bedrock_data import banner_pattern_to_bedrock_code, bedrock_block_name_and_states, dye_color_to_bedrock_int

# A fixed, recent Bedrock format version stamped on every palette entry so
# the game treats our states as already-current and skips its block-state
# auto-upgrade pass. The exact number only needs to be "recent enough"; this
# is the value used by JaylyDev/nbt-to-mcstructure, a tool with real-world
# mileage converting structures Bedrock actually loads correctly.
_MC_VERSION = "1.21.70.03"


def _get_hex(n):
    out = hex(int(n))[2:]
    if len(out) < 2:
        out = "0" + out
    return out


def _get_version_int(version_string):
    return int("".join(_get_hex(part) for part in version_string.split(".")), 16)


_VERSION_INT = _get_version_int(_MC_VERSION)


def _states_to_nbt(states):
    compound = {}
    for key, value in states.items():
        if isinstance(value, bool):
            compound[key] = TAG_Byte(1 if value else 0)
        elif isinstance(value, str):
            compound[key] = TAG_String(value)
        else:
            compound[key] = TAG_Int(int(value))
    return TAG_Compound(compound)


class _Palette:
    def __init__(self):
        self._entries = []
        self._index_by_key = {}

    def get_index(self, name, states):
        key = (name, tuple(sorted(states.items())))
        if key in self._index_by_key:
            return self._index_by_key[key]
        index = len(self._entries)
        self._entries.append(TAG_Compound({
            "name": TAG_String(name),
            "states": _states_to_nbt(states),
            "version": TAG_Int(_VERSION_INT),
        }))
        self._index_by_key[key] = index
        return index

    @property
    def entries(self):
        return self._entries


def _banner_block_entity(color_name, pattern_layers, x, y, z):
    patterns = []
    for pattern in pattern_layers:
        pattern_color, pattern_id = pattern.split("#", 1)
        patterns.append(TAG_Compound({
            "Color": TAG_Int(dye_color_to_bedrock_int(pattern_color)),
            "Pattern": TAG_String(banner_pattern_to_bedrock_code(pattern_id)),
        }))

    return TAG_Compound({
        "block_entity_data": TAG_Compound({
            "id": TAG_String("Banner"),
            "isMovable": TAG_Byte(1),
            "Base": TAG_Int(dye_color_to_bedrock_int(color_name)),
            "Patterns": TAG_List(TAG_Compound, patterns),
            "Type": TAG_Int(0),
            "x": TAG_Int(x),
            "y": TAG_Int(y),
            "z": TAG_Int(z),
        }),
        "tick_queue_data": TAG_List(TAG_Compound, []),
    })


def mcstructure_gen(file_name, banners_blocks, output_dir="generated/mcstructure"):
    """Mirrors banners_to_nbt.process_data + nbt_gen, but emits Bedrock's
    .mcstructure format instead of a Java structure .nbt file."""
    coords = list(banners_blocks.keys())[:-1]
    resolution = banners_blocks["resolution"]
    width = int(resolution[0])
    height = int(resolution[1])
    size_z = 2

    Path(output_dir).mkdir(parents=True, exist_ok=True)
    if f"{width}x{height}" in file_name:
        out_path = Path(output_dir) / f"{file_name}.mcstructure"
    else:
        out_path = Path(output_dir) / f"{file_name}_{width}x{height}.mcstructure"
    out_path = Path(str(out_path).replace(" ", "_"))

    palette = _Palette()
    air_index = palette.get_index("minecraft:air", {})
    wall_banner_index = palette.get_index("minecraft:wall_banner", {"facing_direction": 2})

    total_cells = width * height * size_z
    layer0 = [air_index] * total_cells
    layer1 = [-1] * total_cells
    block_position_data = {}

    def flat_index(x, y, z):
        return x * (height * size_z) + y * size_z + z

    for coord in coords:
        cx, cy = (int(v) for v in re.findall(r"\d+", coord))
        cell = banners_blocks[coord]
        x = width - cx - 1
        y = height - cy - 1

        if "block" in cell:
            block_name, states = bedrock_block_name_and_states(cell["block"])
            idx = flat_index(x, y, 1)
            layer0[idx] = palette.get_index(block_name, states)

        if "banner" in cell:
            pattern_layers = cell["banner"]
            color_name = pattern_layers[0].split("#", 1)[0]
            idx = flat_index(x, y, 0)
            layer0[idx] = wall_banner_index
            block_position_data[str(idx)] = _banner_block_entity(color_name, pattern_layers[1:], x, y, 0)

    structure_tag = TAG_Compound({
        "format_version": TAG_Int(1),
        "size": TAG_List(TAG_Int, [width, height, size_z]),
        "structure_world_origin": TAG_List(TAG_Int, [0, 0, 0]),
        "structure": TAG_Compound({
            "block_indices": TAG_List(TAG_List, [
                TAG_List(TAG_Int, layer0),
                TAG_List(TAG_Int, layer1),
            ]),
            "entities": TAG_List(TAG_Compound, []),
            "palette": TAG_Compound({
                "default": TAG_Compound({
                    "block_palette": TAG_List(TAG_Compound, palette.entries),
                    "block_position_data": TAG_Compound(block_position_data),
                }),
            }),
        }),
    })

    nbt_file = NBTFile(value=structure_tag, name="")
    with open(out_path, "wb") as f:
        nbt_file.save(f, little_endian=True)

    return str(out_path)
