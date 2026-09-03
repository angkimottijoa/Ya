# Fork notes

A fork of [Project-PLATEAU/plateau2minecraft](https://github.com/Project-PLATEAU/plateau2minecraft)
(MIT, © 2024 MLIT Japan and MIERUNE Inc.), vendored unchanged at upstream
commit `501e82e5eff981073aa9138dfc95dbf14e0ca4a4` (2024-05-31) in this
repository's commit `82e309a`, so that everything since shows as a diff
against the Ministry's own converter.

Upstream's `LICENSE` is kept, as are the separate licences of the
`anvil-parser` and `earcut-py` it vendors.

## Bugs fixed

| Where | What was wrong |
|---|---|
| `parser.py` | Projected to EPSG:3857. At Tokyo's latitude Web Mercator scales ground distance by 1/cos(35.7) ≈ 1.23 while heights stay in metres, so a city came out ~23% too wide for its own height — despite the README promising 生成されるブロックは一辺1m. Now projects to the Japan Plane Rectangular zone, whose unit is the metre. |
| `voxelizer.py` | Split a tile's triangles into exactly 1000 submeshes with `np.array_split` over the face index and ran each through `trimesh.voxelized(1).hollow()`. The split follows no connectivity, so no submesh is a closed solid and `hollow()` leaves crusts at each arbitrary boundary; each submesh also rasterizes on its own grid, so neighbours disagree along seams. Together, the fused lumps between buildings. Now rasterizes each planar polygon in its own plane onto one shared grid. |
| `converter.py` | `vertex % block_size` was applied to all three axes, and a vertex is (x, y, altitude). Anything at 512 m or above wrapped: Skytree's 634 m tip landed at y=122. 320–511 was swallowed by the `OutOfBoundsCoordinates` handler. This is what the manual's warning about buildings over 300 m actually is. |
| `converter.py` | Cleared and created the literal path `data/output/world_data/region` while saving to `{output}/world_data/region`, so any other `--output` wiped an unrelated folder and then crashed. |
| `converter.py` | `from click import Path` shadowed the `pathlib.Path` imported one line above. |
| `converter.py` | Every region was built as `EmptyRegion(0, 0)` regardless of where its file sat. |
| `parser.py` | `_XPATH_LIST` names both `bldg:Building` and the `bldg:*Surface` elements nested inside it, so every polygon was found twice. |
| `anvil/empty_chunk.py` | 24 sections with the offset baked in as `section.y + 4`, pinning every world to vanilla's -64..319. |
| `anvil/empty_chunk.py` | `isLightOn` written as 1 while no light data is written, so imported chunks load black. |
| `anvil/empty_chunk.py` | `Status` was the bare `"full"`; namespaced ids since 1.20.2. |

## Added

- **Height range** — `--min-y` / `--max-y`, default -512..511. Anvil's own
  ceiling (a section's Y index is a signed byte) is enforced with a clear error.
- **Textures** — `app:ParameterizedTexture` keyed by ring id, with a polygon-id
  fallback, and `app:X3DMaterial` diffuse colours for untextured surfaces.
  Structure follows [MIERUNE/plateau-gis-converter](https://github.com/MIERUNE/plateau-gis-converter).
- **Two palettes** — `--palette rich` (56 blocks, close to real colour) and
  `--palette simple` (12 neutrals plus glass, clean at distance).
- **Glass** — decided per surface, never per pixel, then matched against the
  glass family alone. Roofs are excluded from the decision.
- **`--simplify-colors`** — median-cut each texture before matching.
- **`--smooth`** — takes stair-stepping off curved walls, abandoning any pass
  that would change more than 6% of the model.
- **`--map`** — top-down plan labelled in block coordinates.
- **Auto-centring** — `--center` optional; the tiles' `gml:Envelope` decides.
- **`app.py`** — desktop UI, built into `Plateau2Minecraft.exe` by CI.

## Dependencies dropped

`trimesh`, `open3d`, `geopandas`, `pyproj`, `scipy`, `networkx`, `pyglet`,
`click`. What remains is numpy, lxml, nbt, frozendict and Pillow.
