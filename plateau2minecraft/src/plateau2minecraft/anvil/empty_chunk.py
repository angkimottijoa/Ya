from nbt import nbt

from .biome import Biome
from .block import Block
from .empty_section import EmptySection
from .errors import EmptySectionAlreadyExists, OutOfBoundsCoordinates


def check_height_range(min_y: int, max_y: int) -> None:
    """FORK: the rules a world height has to satisfy to be writable.

    Shared by EmptyChunk and EmptyRegion so a bad range is refused when it
    is configured, not later when the first block happens to be placed.
    """
    if min_y % 16 or (max_y + 1) % 16:
        raise ValueError(
            f"min_y and max_y + 1 must be multiples of 16; got {min_y}..{max_y}")
    if not (-2048 <= min_y and max_y <= 2047):
        raise ValueError(
            f"world height must stay within y -2048..2047 (a section's Y index is a "
            f"signed byte); got {min_y}..{max_y}")
    if min_y >= max_y:
        raise ValueError(f"min_y must be below max_y; got {min_y}..{max_y}")
from .legacy import LEGACY_BIOMES_ID_MAP


def _get_legacy_biome_id(biome: Biome) -> int:
    for k, v in LEGACY_BIOMES_ID_MAP.items():
        if v == biome.id:
            return k
    raise ValueError(f'Biome id "{biome.id}" has no legacy equivalent')


class EmptyChunk:
    """
    Used for making own chunks

    Attributes
    ----------
    x: :class:`int`
        Chunk's X position
    z: :class:`int`
        Chunk's Z position
    sections: List[:class:`anvil.EmptySection`]
        List of all the sections in this chunk
    version: :class:`int`
        Chunk's DataVersion
    """

    __slots__ = ("x", "z", "sections", "biome", "version", "min_y", "max_y")

    # 1.20.2 is where chunk generation statuses became namespaced ids
    # ("minecraft:full" rather than "full").
    NAMESPACED_STATUS_SINCE = 3578

    def __init__(self, x: int, z: int, min_y: int = -64, max_y: int = 319,
                 version: int = 3337):
        """
        FORK: the section list used to be a hardcoded 24 entries with the
        index offset baked in as ``section.y + 4``, which pinned every world
        to vanilla's -64..319. It is now built from ``min_y``/``max_y`` so a
        height-extending datapack can be matched. Anvil's own ceiling still
        applies: a section's Y index is a signed byte, so y stays inside
        -2048..2047.
        """
        check_height_range(min_y, max_y)
        self.x = x
        self.z = z
        self.min_y = min_y
        self.max_y = max_y
        self.sections: list[EmptySection] = [None] * ((max_y + 1 - min_y) // 16)
        self.biome = None
        self.version = version

    @property
    def _section_offset(self) -> int:
        return -(self.min_y // 16)

    def _section_at(self, y: int):
        """The section holding `y`, or None.

        FORK: get_block and set_block both indexed `self.sections[(y // 16)
        + 4]`, the same hardcoded vanilla offset the constructor used. With
        a deeper world that index is wrong, and for y below -64 it goes
        negative -- which Python happily reads from the end of the list
        rather than raising. The effect was silent and severe: set_block's
        lookup always missed, so every block built a *fresh* EmptySection
        that replaced the one before it, and only the last block written to
        each section survived the save.
        """
        return self.sections[(y // 16) + self._section_offset]

    def add_section(self, section: EmptySection, replace: bool = True):
        """
        Adds a section to the chunk

        Parameters
        ----------
        section
            Section to add
        replace
            Whether to replace section if one at same Y already exists

        Raises
        ------
        anvil.EmptySectionAlreadyExists
            If ``replace`` is ``False`` and section with same Y already exists in this chunk
        """
        index = section.y + self._section_offset
        if not 0 <= index < len(self.sections):
            raise OutOfBoundsCoordinates(
                f"EmptySection (Y={section.y}) is outside y {self.min_y}..{self.max_y}")
        if self.sections[index] and not replace:
            raise EmptySectionAlreadyExists(f"EmptySection (Y={section.y}) already exists in this chunk")
        self.sections[index] = section

    def get_block(self, x: int, y: int, z: int) -> Block:
        """
        Gets the block at given coordinates

        Parameters
        ----------
        int x, z
            In range of 0 to 15
        y
            In range of -64 to 319

        Raises
        ------
        anvil.OutOfBoundCoordidnates
            If X, Y or Z are not in the proper range

        Returns
        -------
        block : :class:`anvil.Block` or None
            Returns ``None`` if the section is empty, meaning the block
            is most likely an air block.
        """
        if x not in range(16):
            raise OutOfBoundsCoordinates(f"X ({x!r}) must be in range of 0 to 15")
        if z not in range(16):
            raise OutOfBoundsCoordinates(f"Z ({z!r}) must be in range of 0 to 15")
        if y not in range(self.min_y, self.max_y + 1):
            raise OutOfBoundsCoordinates(
                f"Y ({y!r}) must be in range of {self.min_y} to {self.max_y}")
        section = self._section_at(y)
        if section is None:
            return
        return section.get_block(x, y % 16, z)

    def set_block(self, block: Block, x: int, y: int, z: int):
        """
        Sets block at given coordinates

        Parameters
        ----------
        int x, z
            In range of 0 to 15
        y
            In range of -64 to 319

        Raises
        ------
        anvil.OutOfBoundCoordidnates
            If X, Y or Z are not in the proper range
        """
        if x not in range(16):
            raise OutOfBoundsCoordinates(f"X ({x!r}) must be in range of 0 to 15")
        if z not in range(16):
            raise OutOfBoundsCoordinates(f"Z ({z!r}) must be in range of 0 to 15")
        if y not in range(self.min_y, self.max_y + 1):
            raise OutOfBoundsCoordinates(
                f"Y ({y!r}) must be in range of {self.min_y} to {self.max_y}")
        section = self._section_at(y)
        if section is None:
            section = EmptySection(y // 16)
            self.add_section(section)
        section.set_block(block, x, y % 16, z)

    def set_biome(self, biome: Biome):
        for section in self.section:
            if section is not None:
                section.set_biome(biome)

    def save_old(self) -> nbt.NBTFile:
        """
        Saves the chunk data to a :class:`NBTFile`

        Notes
        -----
        Does not contain most data a regular chunk would have,
        but minecraft stills accept it.
        """
        root = nbt.NBTFile()
        root.tags.append(nbt.TAG_Int(name="DataVersion", value=self.version))
        level = nbt.TAG_Compound()
        # Needs to be in a separate line because it just gets
        # ignored if you pass it as a kwarg in the constructor
        level.name = "Level"
        level.tags.extend(
            [
                nbt.TAG_List(name="Entities", type=nbt.TAG_Compound),
                nbt.TAG_List(name="TileEntities", type=nbt.TAG_Compound),
                nbt.TAG_List(name="LiquidTicks", type=nbt.TAG_Compound),
                nbt.TAG_Int(name="xPos", value=self.x),
                nbt.TAG_Int(name="zPos", value=self.z),
                nbt.TAG_Long(name="LastUpdate", value=0),
                nbt.TAG_Long(name="InhabitedTime", value=0),
                # FORK: was 1, which tells the game the chunk's lighting is
                # already computed when no light data is written at all --
                # the cause of black, unlit imported chunks. 0 makes the
                # client relight on load.
                nbt.TAG_Byte(name="isLightOn", value=0),
                nbt.TAG_String(
                    name="Status",
                    value="minecraft:full" if self.version >= self.NAMESPACED_STATUS_SINCE
                    else "full"),
            ]
        )
        sections = nbt.TAG_List(name="Sections", type=nbt.TAG_Compound)
        biomes = nbt.TAG_Int_Array(name="Biomes")

        biomes.value = [_get_legacy_biome_id(Biome.from_name("minecraft:ocean")) for _ in range(16 * 16)]
        for s in self.sections:
            if s:
                p = s.palette()
                # Minecraft does not save sections that are just air
                # So we can just skip them
                if len(p) == 1 and p[0].name() == "minecraft:air":
                    continue
                sections.tags.append(s.save())
        level.tags.append(sections)
        level.tags.append(biomes)
        root.tags.append(level)
        return root

    def save(self) -> nbt.NBTFile:
        """
        Saves the chunk data to a :class:`NBTFile`, using new formatting

        Notes
        -----
        Does not contain most data a regular chunk would have,
        but minecraft stills accept it.
        """
        root = nbt.NBTFile()
        root.tags.append(nbt.TAG_Int(name="DataVersion", value=self.version))
        sections = nbt.TAG_Compound()
        # Needs to be in a separate line because it just gets
        # ignored if you pass it as a kwarg in the constructor
        sections = nbt.TAG_List(name="sections", type=nbt.TAG_Compound)

        for s in self.sections:
            if s:
                sections.tags.append(s.save())
        root.tags.append(sections)

        root.tags.extend(
            [
                nbt.TAG_List(name="block_entities", type=nbt.TAG_Compound),
                nbt.TAG_List(name="block_ticks", type=nbt.TAG_Compound),
                nbt.TAG_List(name="fluid_ticks", type=nbt.TAG_Compound),
                nbt.TAG_Long(name="LastUpdate", value=0),
                nbt.TAG_Long(name="InhabitedTime", value=0),
                # FORK: was 1, which tells the game the chunk's lighting is
                # already computed when no light data is written at all --
                # the cause of black, unlit imported chunks. 0 makes the
                # client relight on load.
                nbt.TAG_Byte(name="isLightOn", value=0),
                nbt.TAG_Int(name="xPos", value=self.x),
                nbt.TAG_Int(name="yPos", value=self.min_y // 16),
                nbt.TAG_Int(name="zPos", value=self.z),
                nbt.TAG_String(
                    name="Status",
                    value="minecraft:full" if self.version >= self.NAMESPACED_STATUS_SINCE
                    else "full"),
            ]
        )
        return root
