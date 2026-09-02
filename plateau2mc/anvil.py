"""
Java Edition Anvil region writer.

Writes `r.<x>.<z>.mca` files directly, rather than going through structure
`.nbt` files. A city is far too large for the structure-block route: a 2 km
square is 15,000 chunks, and structure files would have to be placed by
hand or by command one at a time. Region files drop a finished world in
place instead.

Deliberately *not* tied to vanilla's -64..319 range. The section list is
built from whatever `min_y`/`max_y` the caller asks for, so a world whose
height has been extended by a datapack dimension type (or a mod) gets
chunks that fill it. Vanilla will simply ignore sections outside its own
range, so an over-tall export stays loadable either way.

Format references: the chunk NBT layout and the non-straddling long packing
introduced in 1.16 (`bits = max(4, ceil(log2(palette)))`, `64 // bits`
entries per long, no entry split across a long boundary) are as documented
on the Minecraft Wiki's Chunk format and Region file format pages.
"""
import math
import time
import zlib
from io import BytesIO
from pathlib import Path

import numpy as np
from pynbt import (NBTFile, TAG_Byte, TAG_Compound, TAG_Int, TAG_List, TAG_Long,
                   TAG_Long_Array, TAG_Short, TAG_String)

SECTOR_BYTES = 4096
_COMPRESSION_ZLIB = 2
# A chunk whose compressed payload exceeds this has to move to a sidecar
# `.mcc` file. City chunks are nowhere near it (a dense one lands around
# 30 KB), so this is a guard rail rather than a supported path.
_MAX_INLINE_CHUNK_BYTES = 1024 * 1024 - 5

# 1.20.2, the release that turned chunk generation statuses from bare names
# ("full") into namespaced ids ("minecraft:full").
_NAMESPACED_STATUS_SINCE = 3578

DEFAULT_DATA_VERSION = 4189  # 1.21.4


def _bits_needed(count):
    return max(1, (count - 1).bit_length())


def _pack_indices(values, bits):
    """Pack small ints into Minecraft's 1.16+ long array layout."""
    per_long = 64 // bits
    count = len(values)
    long_count = (count + per_long - 1) // per_long
    packed = np.zeros(long_count, dtype=np.uint64)

    positions = np.arange(count)
    target = positions // per_long
    shift = ((positions % per_long) * bits).astype(np.uint64)
    np.bitwise_or.at(packed, target, values.astype(np.uint64) << shift)

    # NBT longs are signed; reinterpret rather than clamp.
    return packed.view(np.int64).tolist()


def _palette_entry(block):
    """`block` is either "minecraft:stone" or (name, {state: value})."""
    if isinstance(block, str):
        name, properties = block, None
    else:
        name, properties = block
    entry = {"Name": TAG_String(name)}
    if properties:
        entry["Properties"] = TAG_Compound(
            {key: TAG_String(str(value)) for key, value in properties.items()})
    return TAG_Compound(entry)


class ChunkBuilder:
    """A single 16 x height x 16 chunk as palette indices.

    `blocks` is indexed [x, y, z] with y already relative to `min_y`, which
    keeps the caller in plain world coordinates and confines the section
    arithmetic to this class.
    """

    def __init__(self, chunk_x, chunk_z, min_y, max_y, air="minecraft:air"):
        if (min_y % 16) or ((max_y + 1) % 16):
            raise ValueError("min_y and max_y+1 must be multiples of 16 (section-aligned)")
        # A section's Y index is stored as a *signed byte*, and that is still
        # true on 1.21. It is the real ceiling on an extended-height world,
        # datapack or mod regardless: sections -128..127, so y -2048..2047.
        if not (-2048 <= min_y and max_y <= 2047):
            raise ValueError(
                f"world height must stay within y -2048..2047 (section Y is a signed byte); "
                f"got {min_y}..{max_y}")
        self.chunk_x = chunk_x
        self.chunk_z = chunk_z
        self.min_y = min_y
        self.max_y = max_y
        self.height = max_y - min_y + 1
        self.palette = [air]
        self._index_of = {air: 0}
        self.blocks = np.zeros((16, self.height, 16), dtype=np.uint16)

    def block_id(self, block):
        key = block if isinstance(block, str) else (block[0], tuple(sorted(block[1].items())))
        index = self._index_of.get(key)
        if index is None:
            index = len(self.palette)
            self.palette.append(block)
            self._index_of[key] = index
        return index

    def is_empty(self):
        return not self.blocks.any()

    def _heightmap(self, mask):
        """Highest occupied block per column, as Java stores it.

        The stored value is the count of blocks above `min_y`, i.e. one more
        than the top block's relative y, and 0 for an empty column. Bit
        width follows world height rather than vanilla's fixed 9, so an
        extended-height world still round-trips.
        """
        bits = max(1, math.ceil(math.log2(self.height + 1)))
        # argmax over a reversed axis gives the topmost set voxel.
        reversed_mask = mask[:, ::-1, :]
        any_set = reversed_mask.any(axis=1)
        top_from_end = reversed_mask.argmax(axis=1)
        heights = np.where(any_set, self.height - top_from_end, 0).astype(np.uint64)
        # Java's heightmap is indexed z-major, x-minor.
        values = heights.T.reshape(-1)
        return TAG_Long_Array(_pack_indices(values, bits))

    def _sections(self):
        sections = []
        for section_index in range(self.height // 16):
            section_y = (self.min_y // 16) + section_index
            chunk_slice = self.blocks[:, section_index * 16:(section_index + 1) * 16, :]

            used = np.unique(chunk_slice)
            local_palette = [self.palette[i] for i in used]
            remap = np.zeros(len(self.palette), dtype=np.uint16)
            remap[used] = np.arange(len(used), dtype=np.uint16)

            block_states = {
                "palette": TAG_List(TAG_Compound, [_palette_entry(b) for b in local_palette]),
            }
            # The format allows `data` to be dropped when the palette holds a
            # single block, and vanilla both writes and reads that form. Some
            # third-party readers do not implement it for blocks, though, and
            # silently show such a section as air -- which turns a solid slab
            # of stone invisible in an external editor. Emitting the array for
            # a uniform *non-air* section costs ~140 bytes compressed and
            # removes that failure mode; uniform air sections, which are the
            # bulk of a city's volume, keep the compact form.
            uniform_air = len(local_palette) == 1 and local_palette[0] == self.palette[0]
            if not uniform_air:
                bits = max(4, _bits_needed(len(local_palette)))
                # Section order is YZX.
                ordered = remap[chunk_slice].transpose(1, 2, 0).reshape(-1)
                block_states["data"] = TAG_Long_Array(_pack_indices(ordered, bits))

            sections.append(TAG_Compound({
                "Y": TAG_Byte(section_y),
                "block_states": TAG_Compound(block_states),
                "biomes": TAG_Compound({
                    "palette": TAG_List(TAG_String, [TAG_String("minecraft:plains")]),
                }),
            }))
        return sections

    def to_nbt(self, data_version=DEFAULT_DATA_VERSION):
        status = "minecraft:full" if data_version >= _NAMESPACED_STATUS_SINCE else "full"
        solid = self.blocks != 0

        root = TAG_Compound({
            "DataVersion": TAG_Int(data_version),
            "xPos": TAG_Int(self.chunk_x),
            "zPos": TAG_Int(self.chunk_z),
            "yPos": TAG_Int(self.min_y // 16),
            "Status": TAG_String(status),
            "LastUpdate": TAG_Long(0),
            "InhabitedTime": TAG_Long(0),
            # Leaving this off makes the client relight the chunk on load,
            # which is exactly what we want: computing correct sky/block
            # light for a whole city here would be a second project.
            "isLightOn": TAG_Byte(0),
            "sections": TAG_List(TAG_Compound, self._sections()),
            "block_entities": TAG_List(TAG_Compound, []),
            "block_ticks": TAG_List(TAG_Compound, []),
            "fluid_ticks": TAG_List(TAG_Compound, []),
            # One empty list per section: the game expects the outer list to
            # match the section count, and empty means "nothing to revisit".
            "PostProcessing": TAG_List(
                TAG_List, [TAG_List(TAG_Short, []) for _ in range(self.height // 16)]),
            "Heightmaps": TAG_Compound({
                "MOTION_BLOCKING": self._heightmap(solid),
                "WORLD_SURFACE": self._heightmap(solid),
            }),
            "structures": TAG_Compound({
                "starts": TAG_Compound({}),
                "References": TAG_Compound({}),
            }),
        })
        return root


class RegionWriter:
    """Accumulates chunks and flushes one `r.x.z.mca` per region."""

    def __init__(self, region_dir, data_version=DEFAULT_DATA_VERSION):
        self.region_dir = Path(region_dir)
        self.region_dir.mkdir(parents=True, exist_ok=True)
        self.data_version = data_version
        self._regions = {}
        self.chunks_written = 0

    def add(self, chunk):
        payload = self._encode(chunk)
        if payload is None:
            return
        region = (chunk.chunk_x >> 5, chunk.chunk_z >> 5)
        self._regions.setdefault(region, {})[(chunk.chunk_x & 31, chunk.chunk_z & 31)] = payload
        self.chunks_written += 1

    def _encode(self, chunk):
        buffer = BytesIO()
        NBTFile(value=chunk.to_nbt(self.data_version), name="").save(buffer)
        compressed = zlib.compress(buffer.getvalue(), 6)
        if len(compressed) > _MAX_INLINE_CHUNK_BYTES:
            raise ValueError(
                f"chunk {chunk.chunk_x},{chunk.chunk_z} compresses to "
                f"{len(compressed)} bytes, past the 1 MiB inline limit")
        return compressed

    def flush(self):
        written = []
        for (region_x, region_z), chunks in self._regions.items():
            path = self.region_dir / f"r.{region_x}.{region_z}.mca"
            _write_region(path, chunks)
            written.append(path)
        self._regions.clear()
        return written


def _write_region(path, chunks):
    """Merge `chunks` into `path`, preserving chunks already in the file."""
    existing = _read_region(path) if path.exists() else {}
    existing.update(chunks)

    locations = bytearray(SECTOR_BYTES)
    timestamps = bytearray(SECTOR_BYTES)
    body = bytearray()
    next_sector = 2  # the two header sectors
    now = int(time.time())

    for (local_x, local_z), compressed in sorted(existing.items()):
        block = bytearray()
        block += (len(compressed) + 1).to_bytes(4, "big")
        block += bytes([_COMPRESSION_ZLIB])
        block += compressed
        padding = (-len(block)) % SECTOR_BYTES
        block += bytes(padding)
        sectors = len(block) // SECTOR_BYTES
        if sectors > 255:
            raise ValueError(f"chunk {local_x},{local_z} needs {sectors} sectors, max is 255")

        slot = 4 * (local_x + local_z * 32)
        locations[slot:slot + 3] = next_sector.to_bytes(3, "big")
        locations[slot + 3] = sectors
        timestamps[slot:slot + 4] = now.to_bytes(4, "big")

        body += block
        next_sector += sectors

    with open(path, "wb") as handle:
        handle.write(locations)
        handle.write(timestamps)
        handle.write(body)


def _read_region(path):
    """Existing chunk payloads, so a second run doesn't drop the first's."""
    with open(path, "rb") as handle:
        data = handle.read()
    if len(data) < SECTOR_BYTES * 2:
        return {}

    chunks = {}
    for local_z in range(32):
        for local_x in range(32):
            slot = 4 * (local_x + local_z * 32)
            offset = int.from_bytes(data[slot:slot + 3], "big")
            sectors = data[slot + 3]
            if offset < 2 or sectors == 0:
                continue
            start = offset * SECTOR_BYTES
            if start + 5 > len(data):
                continue
            length = int.from_bytes(data[start:start + 4], "big")
            payload = data[start + 5:start + 4 + length]
            if data[start + 4] == _COMPRESSION_ZLIB and payload:
                chunks[(local_x, local_z)] = payload
    return chunks
