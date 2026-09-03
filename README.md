# banner2bedrock / plateau2mc

Three Minecraft converters live here:

- **`banner2bedrock`** - an image into banner pixel-art, exported as a Bedrock
  Edition `.mcstructure`.
- **`plateau2mc`** - Japan's PLATEAU 3D city model into a Java Edition world at
  1 block = 1 metre. [Jump to it](#plateau---minecraft-java-map-plateau2mc).
- **`plateau2minecraft/`** - a fork of [Project PLATEAU's own
  converter](https://github.com/Project-PLATEAU/plateau2minecraft) (MIT), vendored
  unchanged at `82e309a` and then fixed and extended on top, so every change shows
  as a diff against the Ministry's code. See
  [`plateau2minecraft/FORK.md`](plateau2minecraft/FORK.md).

## banner2bedrock

Converts an image into Minecraft banner pixel-art and exports it as a
**Bedrock Edition `.mcstructure` file** — ready to drop straight into a
Bedrock world and load with a Structure Block. No Java-only structure block
or add-on required.

This builds on the algorithm from [Image2Banners](https://github.com/MARSTeamMC/Image2Banners)
(color/pattern matching via CIEDE2000 + SSIM), which only ever exported
Java Edition's structure `.nbt` format. The gap this project fills is the
Bedrock side: Bedrock banners are a single generic block colored entirely by
block-entity NBT (rather than one block id per color like Java), and use
short pattern codes instead of Java's `minecraft:<pattern>` ids — so a
straight copy of a Java `.nbt` structure will not load correctly on
Bedrock. See `banner2bedrock/bedrock_data.py` and `CREDITS.md` for exactly
where those mappings come from.

## Getting more detail without a bigger grid

Raising `--resolution` (more banner cells) is one way to add detail, but
each individual banner cell can also be pushed further on its own via
"고품질 모드" / High Quality mode in the UIs (or `--gen-layering --gen-big
--use-pattern-items` on the CLI):
- `gen_big` lifts the usual 6-pattern-layer cap a real loom enforces
  (structure/command placement isn't bound by that UI limit)
- `gen_layering` mounts a second, slightly recessed banner in the same cell
  for extra combined detail
- `use_pattern_items` unlocks the patterns that need a banner pattern item
  (creeper/skull/flower/mojang/globe/piglin/flow/guster) instead of just
  loom+dye shapes

All three trade speed for fidelity at a *fixed* grid size. Separately, the
initial image resize now uses Lanczos resampling rather than PIL's default
filter, which noticeably reduces aliasing on edges/gradients before any
color matching even starts.

## Install

```bash
pip install -r requirements.txt
```

## Usage

### Windows app (.exe)

A native Tkinter desktop app (`desktop_app.py`) is auto-built into a
single-file `Banner2Bedrock.exe` by
[`.github/workflows/build-windows.yml`](.github/workflows/build-windows.yml)
on every push. Grab the latest build from this repo's **Actions** tab ->
pick the newest "Build Windows app" run -> download the
`Banner2Bedrock-windows-exe` artifact. No Python install needed on the
Windows machine that runs it. To build it yourself on Windows instead:

```powershell
pip install -r requirements-desktop.txt
pyinstaller --onefile --windowed --name Banner2Bedrock --add-data "assets;assets" --collect-submodules skimage --collect-data skimage --collect-submodules cv2 --collect-submodules PIL --hidden-import pynbt --hidden-import mutf8 desktop_app.py
```
The exe ends up in `dist\Banner2Bedrock.exe`.

### Web UI

```bash
python app.py
```

Then open the printed link (default `http://127.0.0.1:7860`) in a browser:
upload an image, set the grid size, tweak options if you want, click
**변환 시작 (Convert)**, and download the resulting `.mcstructure`/`.nbt`
file plus a preview of the result.

### CLI

```bash
python cli.py path/to/image.png --resolution 8x8
```

This writes, under `generated/`:
- `<name>_preview.png` — what the banner grid will look like
- `<name>.json` — the intermediate banner/block layout
- `mcstructure/<name>_WxH.mcstructure` — the Bedrock structure file

Copy the `.mcstructure` file into your world's `structures/` folder (or a
behavior pack's `structures/` folder), then in-game: place a **Structure
Block** in Load mode, set its structure name to match the filename (minus
extension), and hit Load.

### Options

| Flag | Meaning |
|---|---|
| `--resolution WxH` | grid size in banner units (required) |
| `--format bedrock\|java\|both` | which structure format(s) to write (default `bedrock`) |
| `--no-gen-blocks` | skip filling in extra full blocks above/below each banner |
| `--gen-layering` | allow a second overlapping banner layer for extra detail |
| `--gen-big` | allow more than 6 pattern layers per banner (slower) |
| `--use-pattern-items` | allow patterns needing special items (creeper/skull/flower/mojang/globe/piglin/flow/guster) |
| `--threads N` | worker processes (default 4) |
| `--compare-method 0.0-1.0` | color-delta vs. structural-similarity weighting |
| `--output-dir DIR` | base output directory (default `./generated`) |

`--format java` reproduces Image2Banners' original Java structure `.nbt`
output, for comparison.

## How the Bedrock export differs from Java's

- **One banner block, not sixteen.** Java has a separate block id per
  banner color (`white_wall_banner`, `red_wall_banner`, ...); Bedrock has
  just `minecraft:wall_banner`, colored via the block entity's `Base` tag.
- **Pattern ids vs. short codes.** Java 1.20.5+ patterns are registry ids
  like `minecraft:curly_border`; Bedrock still uses two/three-letter codes
  (`cbo`, `sku`, `moj`, ...).
- **Color encoding.** Both editions' banner NBT number colors as `15 -
  <dye color's index in white/orange/magenta/.../black order>` — this
  project relies on that being consistent rather than re-deriving it.
- **No 32-block size cap.** Image2Banners' Java `.nbt` writer caps
  structure size at 32 (mirroring the old Structure Block UI limit). The
  `.mcstructure` *file format* has no such limit — it only applies to the
  in-game Structure Block widget — so this exporter doesn't cap width/height
  and can be loaded directly with `/structure load` regardless of size.
- **Filler blocks.** A handful of block types Image2Banners uses for the
  optional `--no-gen-blocks`-off filler layer (trapdoors, shulker boxes,
  log end-grain faces) need a Bedrock block *state*, not just a name match.
  The common ones are translated (see `bedrock_data.py`); a few rarer ones
  (crafter orientation, mushroom block faces, beehive fill level) fall back
  to the block's default orientation rather than guess — cosmetic-only, the
  structure still loads fine either way.

## What's not (yet) ported

The original project's Electron desktop GUI (`index.html`/`main.js`) isn't
part of this port — instead there's a browser-based UI (`app.py`, built with
[Gradio](https://gradio.app)) plus the CLI. The image-to-banner algorithm
and asset files are unchanged from upstream.

## PLATEAU -> Minecraft Java map (`plateau2mc`)

A second converter lives in this repo: `plateau2mc` turns Japan's
[Project PLATEAU](https://www.mlit.go.jp/plateau/) 3D city model into a
Minecraft **Java Edition** world at 1 block = 1 metre. It shares nothing
with the banner converter except the repo — different input, different
output, no shared code path.

### Why PLATEAU and not Google Earth

Google Earth's 3D city is a proprietary photogrammetric mesh, and its terms
forbid extraction. It would also be the wrong input even if it were
available: buildings, trees, cars and their shadows are fused into one
untextured-once mesh with no per-building identity, so voxelizing it gives
melted clay rather than a city.

PLATEAU is the opposite: open data (CC BY 4.0) from the Ministry of Land,
Infrastructure, Transport and Tourism, covering all 23 Tokyo wards, with
every building carried as its own polygon plus a `measuredHeight`. That is
exactly the shape a voxelizer wants.

### Getting the data

From the [G-space Information Center's Tokyo 23-ward
dataset](https://www.geospatial.jp/ckan/dataset/plateau-tokyo23ku), download
**CityGML** — not 3D Tiles, not GeoTIFF, neither of which carries per-building
geometry. The archive is several GB because it covers all 23 wards; inside
it, the only thing this tool reads is:

```
udx/bldg/<mesh code>_bldg_6697_*.gml
```

Each of those files is one 2nd-level mesh (a few km across), so for a single
district you only need to extract one or two of them. Point the tool at a
directory and it picks up every `.gml` inside, skipping the non-building
packages (`_tran_`, `_luse_`, ...) on its own.

### The app

`plateau_desktop_app.py` is a native Tkinter UI over the same converter,
packaged into `Plateau2MC.exe` by
[`.github/workflows/build-windows.yml`](.github/workflows/build-windows.yml)
on every push. Grab it from this repo's **Actions** tab → newest "Build
Windows app" run → the `Plateau2MC-windows-exe` artifact. No Python install
needed on the machine that runs it.

Pick the PLATEAU folder and the world folder, choose a district and a
radius, and press **미리 확인** to see how many buildings and chunks you are
about to get — and whether anything would hit the ceiling — before pressing
**변환 시작**.

A conversion takes minutes, so it runs on a worker thread with a Stop button
that leaves already-written region files intact. Progress covers the whole
run rather than just the last phase: parsing reports by bytes consumed (file
sizes are known up front, and `iterparse` offers no progress of its own),
clean-up and chunk writing take the remaining share, and the bar is
determinate from the first frame. Elapsed time and an estimate of what is
left sit under it.

To run it from source instead:

```bash
pip install -r requirements-desktop.txt
python plateau_desktop_app.py
```

### LOD2, textures and glass

`--geometry lod2` voxelizes PLATEAU's actual LOD2 surfaces rather than
extruding footprints — pitched roofs, setbacks, balconies — falling back to
LOD1 per building where LOD2 is absent, as Project PLATEAU's own converter
does. `--textures` then colours the blocks from the LOD2 texture images
instead of using one block per surface type.

Glazing is decided **per surface, never per pixel**. A curtain wall's
texture has mullions, blinds and reflected cloud in it, so a per-pixel test
scatters concrete through a window; instead each wall is judged as a whole
(by the share of glazing-coloured pixels and by its mean colour) and then
matched against the glass family alone, so a glass tower comes out as glass
and an ordinary wall stays concrete. Roofs are never treated as glazing —
a flat grey roof photographs bluish enough to trip the colour test, and
guessing wrong on every rooftop is the worse trade. `--no-glass` turns the
whole thing off.

`--simplify-colors N` flattens each texture to N colours before matching,
which turns JPEG noise into the flat panels a facade actually has.

### Smoothing curved surfaces

A cylindrical tower voxelized at one metre comes out as a staircase with
single-voxel spurs and notches. `--smooth N` runs N passes that drop the
spurs and fill the notches. Each pass is abandoned if it would change more
than 6% of the model, so a spire, a railing or any thin filigree is never
dissolved — the test suite pins that a one-voxel-wide structure survives
the strongest setting untouched.

### Just point it at the download

`--center` is optional. Left off, the tool reads the `gml:boundedBy`
envelope of the tiles you gave it and centres on their middle, so an
unzipped CityGML folder needs no coordinates looked up first:

```bash
python -m plateau2mc ~/Downloads/13100_tokyo23-ku_2022_citygml_1_2_op \
    --world ~/.minecraft/saves/Tokyo \
    --geometry lod2 --textures --smooth 1 --min-y -512 --max-y 511 \
    --map ~/Desktop/tokyo_plan.html
```

Directories are searched recursively for `*.gml`, and packages the
converter does not handle are skipped rather than failing the run. Per the
manual, `dem` tiles are skipped on purpose: they are distributed per
2nd-level mesh, roughly a hundred times the area of everything else.

### Which files to download

From the manual: inside an extracted CityGML package, `udx/bldg` holds the
building tiles and `indexmap_op.pdf` shows which 8-digit mesh number covers
which area. A filename with an **8-digit** prefix
(`53394535_bldg_6697_2_op.gml`) is a 3rd-level mesh — a few km across, and
what you want. A **6-digit** prefix (`533945_dem_6697_op.gml`) is a
2nd-level mesh covering ~100× the area.

### The block plan

`--map plan.html` writes a top-down plan of what was built: a shaded height
raster with the grid drawn in Minecraft block coordinates, every region
file named where it falls, and the latitude/longitude → block-coordinate
conversion spelled out, as a self-contained page plus a PNG.

### Building a map from the command line

The tool writes region files into an **existing** world — it does not create
one. That is deliberate: world height, dimension type and generator belong
to whatever datapack or mod you use, and a generated `level.dat` would only
fight with it. Make an empty superflat (or void) world first, then:

```bash
pip install -r requirements.txt

python -m plateau2mc path/to/udx/bldg \
    --center shinjuku --radius 1000 \
    --world ~/.minecraft/saves/Tokyo \
    --max-y 1023
```

`--center` takes `lat,lon` or one of the built-in anchors: `shibuya`,
`shinjuku`, `tokyo-station`, `skytree`, `tokyo-tower`, `ginza`,
`akihabara`. The map is centred on block 0, 0, so `/tp 0 70 0` lands you on
the spot you named. Add `--dry-run` first to see the chunk count and the
height the tallest building will reach before committing to a build.

### Options

| Flag | Meaning |
|---|---|
| `--center LAT,LON` \| `NAME` | map origin (required) |
| `--radius M` | half-width of the square to build, in metres/blocks (default 800) |
| `--world DIR` | existing save directory to write `region/` into (required) |
| `--min-y` / `--max-y` | world height range; must stay section-aligned (default `-64` / `319`) |
| `--sea-level Y` | block y that altitude 0 m maps to (default 62) |
| `--fit none\|compress\|scale` | what to do with buildings taller than the world (default `none`: keep every height 1:1) |
| `--knee M` | with `--fit compress`, the height below which buildings stay exactly 1:1 (default 60) |
| `--max-building-height M` | hard clamp on building heights (default: none) |
| `--solid` | fill buildings solid instead of hollow shells |
| `--no-terrain` | place buildings only, no ground |
| `--terrain-cell N` | terrain interpolation cell size in blocks (default 32) |
| `--data-version N` | chunk `DataVersion` to stamp (default 4189 = 1.21.4) |
| `--zone N` | Japan Plane Rectangular zone 1-19 (default: inferred) |

### Height

**Heights go in exactly as PLATEAU has them.** No rescaling, no clamping,
nothing quietly trimmed — `--fit none` is the default and it is a true
identity. Altitude 0 m (Tokyo Peil) lands on `--sea-level` (62 by default),
and a 634 m tower is 634 blocks tall.

That does not always fit. With sea level at 62, Tokyo Tower's roof lands at
y=401 and Skytree's at about y=696, both past vanilla's 320. The tool
checks before writing, names how many buildings overflow and how high they
would need to go, and reports afterwards whether anything was actually cut.

To keep them whole:

- **Raise the ceiling.** `--max-y 1023` with a datapack dimension type that
  declares the same height. This is the intended route on Java, and why the
  tool will not write `level.dat` for you — the height range is the
  datapack's business. Anvil's own hard ceiling is y=2047, because a
  section's index is a signed byte and sections only run -128..127.
- **`--fit compress`.** For Bedrock, whose -64..319 no add-on extends, this
  keeps every building under `--knee` (60 m by default) at exact 1:1 and
  compresses only what rises above it, by the smallest factor that makes
  the tallest thing in the dataset fit. Nothing is lost off the top; in the
  23 wards it leaves well over 99% of buildings at true scale. Opt-in, never
  automatic.
- **`--fit scale`** shrinks everything by one factor, if you would rather
  keep proportions than keep street level true.

A district on its own often needs none of this: Shinjuku's tallest is the
243 m Metropolitan Government Building, which fits under vanilla at 1:1.

### Coordinates

Everything is projected into the [Japan Plane Rectangular
system](https://www.gsi.go.jp/sokuchikijun/jpc.html) — zone IX (EPSG:6677)
for Tokyo — where the unit is already the metre, so a projected coordinate
rounded to an integer *is* a block coordinate. This matters: Web Mercator,
the obvious default, stretches east-west by `1/cos(35.66°)` at Tokyo's
latitude, making the city 23% too wide. `plateau2mc/jgd2011.py` implements
the projection directly (no pyproj/PROJ dependency, which keeps the frozen
Windows build lean) and the test suite pins it against pyproj across all 19
zones.

### Terrain

PLATEAU building geometry carries absolute altitude, so the base of every
building is a free elevation sample. Those samples are scattered onto a
coarse grid, grown into the gaps and smoothed, which recovers the real
shape of the city — the Yamanote uplands standing over the Shitamachi
lowlands, river valleys, the Arakawa flood plain. It is not the GSI's 5 m
DEM and it flattens across parks, water and rail yards where nothing
samples it, but it needs no second dataset. `--no-terrain` turns it off.

### What it does not do

Roads, railways, rivers, land use and vegetation are all absent — those live
in OpenStreetMap or PLATEAU's `_tran_`/`_luse_` packages, and nothing here
reads them yet. Buildings are extruded from their footprint at LOD1, so LOD2
roof shapes are flattened. Interiors are empty shells (`--solid` fills
them).

### Tests

```bash
python -m unittest discover -s tests
```

The suite generates its own PLATEAU-shaped CityGML rather than shipping a
sample of the real dataset, and reads the produced world back with an
independent Anvil decoder (`tests/read_world.py`) to check block placement,
wall continuity across chunk boundaries, and that tall towers survive at
their true height.

### Credits

The 3D city model is Project PLATEAU by Japan's Ministry of Land,
Infrastructure, Transport and Tourism, used under CC BY 4.0. A world built
with this tool inherits that attribution requirement.

## Credits & licensing

See [`CREDITS.md`](CREDITS.md) and [`LICENSE`](LICENSE).
