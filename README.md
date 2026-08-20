# banner2bedrock

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

## Credits & licensing

See [`CREDITS.md`](CREDITS.md) and [`LICENSE`](LICENSE).
