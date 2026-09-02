"""
Minimal Anvil *reader*, for verifying what the writer produced.

Written against the region/chunk format description rather than against
`plateau2mc.anvil`, so a bug shared between the two would have to be a bug
in both readings of the spec. It exists because the third-party readers
available here stop at vanilla's height range and do not implement the
single-entry-palette section, which are exactly the two cases this project
needs to get right.
"""
import io
import zlib
from pathlib import Path

from pynbt import NBTFile


def read_chunk(region_dir, chunk_x, chunk_z):
    path = Path(region_dir) / f"r.{chunk_x >> 5}.{chunk_z >> 5}.mca"
    data = path.read_bytes()
    slot = 4 * ((chunk_x & 31) + (chunk_z & 31) * 32)
    offset = int.from_bytes(data[slot:slot + 3], "big")
    if offset < 2:
        return None
    start = offset * 4096
    length = int.from_bytes(data[start:start + 4], "big")
    assert data[start + 4] == 2, "expected zlib compression"
    raw = zlib.decompress(data[start + 5:start + 4 + length])
    return NBTFile(io.BytesIO(raw))


def _unpack(longs, bits, count):
    per_long = 64 // bits
    mask = (1 << bits) - 1
    values = []
    for value in longs:
        word = value & 0xFFFFFFFFFFFFFFFF
        for slot in range(per_long):
            if len(values) == count:
                return values
            values.append((word >> (slot * bits)) & mask)
    return values


def section_blocks(section):
    """[4096] block names for one section, in YZX order."""
    states = section["block_states"]
    palette = [entry["Name"].value for entry in states["palette"].value]
    if "data" not in states.value:
        return palette * 4096 if len(palette) == 1 else None
    bits = max(4, max(1, (len(palette) - 1).bit_length()))
    return [palette[i] for i in _unpack(states["data"].value, bits, 4096)]


class World:
    """Random access to block names by absolute coordinates."""

    def __init__(self, region_dir):
        self.region_dir = Path(region_dir)
        self._cache = {}

    def _sections(self, chunk_x, chunk_z):
        key = (chunk_x, chunk_z)
        if key not in self._cache:
            chunk = read_chunk(self.region_dir, chunk_x, chunk_z)
            sections = {}
            if chunk is not None:
                for section in chunk["sections"].value:
                    sections[section["Y"].value] = section_blocks(section)
            self._cache[key] = sections
        return self._cache[key]

    def block(self, x, y, z):
        sections = self._sections(x >> 4, z >> 4)
        blocks = sections.get(y >> 4)
        if blocks is None:
            return "minecraft:air"
        return blocks[((y & 15) * 16 + (z & 15)) * 16 + (x & 15)]

    def column(self, x, z, low, high):
        """Run-length summary of a column, as [(y_from, y_to, block)]."""
        runs = []
        for y in range(low, high):
            name = self.block(x, y, z)
            if runs and runs[-1][2] == name:
                runs[-1][1] = y
            else:
                runs.append([y, y, name])
        return [tuple(run) for run in runs]
