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

## plateau2mc — LOD2 conversion

The LOD2 path is a reimplementation of the approach taken by
[Project-PLATEAU/plateau2minecraft](https://github.com/Project-PLATEAU/plateau2minecraft)
(MIT, © 国土交通省 and MIERUNE Inc.), the Ministry of Land, Infrastructure,
Transport and Tourism's own CityGML → Minecraft converter, and of its user
manual `docs/Minecraftワールドデータ作成マニュアル.pdf`. What is taken from it
is the *approach* — prefer LOD2 geometry and fall back to LOD1 per feature,
convert bldg/tran/brid/frn/veg, treat `dem` tiles as out of scope because a
2nd-level mesh is ~100x the area, hollow the buildings, write Anvil region
files for an existing world. No code is reused; the geometry, projection
and region-writing here are this project's own, and differ deliberately:

- Upstream projects to EPSG:3857 (Web Mercator), which at Tokyo's latitude
  scales horizontal distance by 1/cos(35.7°) ≈ 1.23 while leaving heights
  in metres, so a building comes out about 23% too wide for its height.
  This project projects to the Japan Plane Rectangular zone instead, where
  the unit is already the metre.
- Upstream voxelizes by splitting a tile's triangles into 1000 arbitrary
  submeshes and running each through `trimesh.voxelized(1).hollow()`; the
  splits do not follow connectivity and each submesh rasterizes on its own
  grid, which is where the fused lumps and crusts come from. This project
  rasterizes each planar polygon in its own plane onto one shared grid.
- Upstream reduces region-local coordinates with `vertex % 512` applied to
  all three axes, so an altitude at or above 512 m wraps around and is
  drawn near the ground rather than being reported.

Surface-class and appearance element names follow the CityGML 2.0 schema as
modelled in [MIERUNE/plateau-gis-converter](https://github.com/MIERUNE/plateau-gis-converter)
(MIT), consulted as a reference for how PLATEAU nests `app:Appearance`,
`app:ParameterizedTexture` and `app:textureCoordinates`.
