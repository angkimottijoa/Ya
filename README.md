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

## Install

```bash
pip install -r requirements.txt
```

## Usage

### Web UI (easiest)

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
