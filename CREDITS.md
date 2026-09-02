# Credits

- **[Image2Banners](https://github.com/MARSTeamMC/Image2Banners)** by MARSTeamMC
  (BSD 2-Clause License) — the image-to-banner pixel-art algorithm
  (`banner2bedrock/image_to_banners.py`), the banner pattern and block
  texture assets (`assets/`), and the reference Java structure exporter
  (`banner2bedrock/java_nbt_writer.py`, ported from `banners_to_nbt.py`) all
  originate here. This project exists to add a Bedrock Edition-compatible
  export path on top of that algorithm.

- **[GeyserMC/Geyser](https://github.com/GeyserMC/Geyser)** (MIT License) —
  the Bedrock banner pattern short-codes and the `Base`/`Color = 15 -
  dyeColor.ordinal()` formula in `banner2bedrock/bedrock_data.py` were
  cross-checked against Geyser's `BannerPattern.java`, `DyeColor.java`, and
  `BannerBlockEntityTranslator.java`, since Geyser has to get this translation
  exactly right for cross-play between Java and Bedrock players.

- **[JaylyDev/nbt-to-mcstructure](https://github.com/JaylyDev/nbt-to-mcstructure)**
  (MIT License) — used as a working reference to confirm the shape of the
  `.mcstructure` NBT tree (`format_version`/`size`/`structure_world_origin`/
  `structure.block_indices`/`palette.default.block_palette`/
  `block_position_data`). No code from this project was copied; our writer
  (`banner2bedrock/mcstructure_writer.py`) builds the tree directly from this
  project's own `banner_json`, using the [`pynbt`](https://pypi.org/project/pynbt/)
  library for little-endian NBT serialization.

- **[Bedrock Wiki](https://wiki.bedrock.dev/nbt/mcstructure)** — general
  `.mcstructure` format documentation.

## plateau2mc

- **3D city model**: [Project PLATEAU](https://www.mlit.go.jp/plateau/),
  Ministry of Land, Infrastructure, Transport and Tourism of Japan,
  licensed CC BY 4.0. A world built from it inherits that attribution
  requirement.
- **Projection**: the Gauss-Kruger series in `plateau2mc/jgd2011.py` follows
  the formulation published by the Geospatial Information Authority of Japan
  for the plane rectangular coordinate systems. No code is reused; the
  implementation is checked against pyproj in the test suite.
- **Formats**: the Anvil region/chunk layout and its 1.16+ long packing are
  as documented on the Minecraft Wiki. No game or tool code is reused.
