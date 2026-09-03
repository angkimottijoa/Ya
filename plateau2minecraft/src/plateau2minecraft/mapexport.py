"""
A plan of the converted area, labelled in Minecraft coordinates.

FORK: added.

Once a city is in a world it is genuinely hard to find anything: the game
gives you an F3 readout and nothing else, and a converted ward is a few
thousand identical-looking blocks across. This writes a top-down map of
what was actually built, with the grid drawn in block coordinates, the
region files named where they fall, and the conversion back to latitude
and longitude spelled out -- so a place found on a real map can be walked
to in game.

The image is a shaded height plan rendered with Pillow and embedded in a
self-contained HTML page, so it opens in a browser with no server and no
loose files beside it.
"""
import base64
import html
import io
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

# Grid spacing in blocks. 16 is a chunk, 512 a region file; 100 is what a
# person actually navigates by.
_MINOR_GRID = 100
_REGION_GRID = 512

_SHADE_LOW = (34, 42, 53)
_SHADE_HIGH = (232, 238, 245)
_GROUND = (18, 22, 28)


def _height_raster(voxels, bounds, scale):
    """Top-down maximum height, one pixel per `scale` blocks."""
    min_x, max_x, min_z, max_z = bounds
    width = max(1, (max_x - min_x) // scale + 1)
    depth = max(1, (max_z - min_z) // scale + 1)

    heights = np.full((depth, width), np.nan, dtype=np.float32)
    px = ((voxels[:, 0] - min_x) // scale).astype(np.int64)
    pz = ((voxels[:, 1] - min_z) // scale).astype(np.int64)
    np.clip(px, 0, width - 1, out=px)
    np.clip(pz, 0, depth - 1, out=pz)

    flat = pz * width + px
    order = np.argsort(flat)
    flat = flat[order]
    tops = voxels[order][:, 2].astype(np.float32)
    # maximum.at is the sparse "highest block in this column" reduction.
    grid = np.full(width * depth, np.nan, dtype=np.float32)
    np.fmax.at(grid, flat, tops)
    return grid.reshape(depth, width)


def _shade(heights):
    known = ~np.isnan(heights)
    if not known.any():
        return Image.new("RGB", (heights.shape[1], heights.shape[0]), _GROUND)

    low = float(np.nanmin(heights))
    high = float(np.nanmax(heights))
    span = max(high - low, 1.0)
    normalised = np.clip((heights - low) / span, 0.0, 1.0)

    image = np.zeros(heights.shape + (3,), dtype=np.uint8)
    for channel in range(3):
        ramp = _SHADE_LOW[channel] + normalised * (_SHADE_HIGH[channel] - _SHADE_LOW[channel])
        image[:, :, channel] = np.where(known, ramp, _GROUND[channel]).astype(np.uint8)

    # A cheap hillshade: brighten where the column is taller than the one
    # to its north-west, which makes rooflines and street canyons legible.
    shifted = np.roll(np.roll(heights, 1, axis=0), 1, axis=1)
    relief = np.nan_to_num(heights - shifted, nan=0.0)
    highlight = np.clip(relief * 6.0, -60, 60).astype(np.int16)
    image = np.clip(image.astype(np.int16) + highlight[:, :, None], 0, 255).astype(np.uint8)
    return Image.fromarray(image, "RGB")


def render_plan(voxels, bounds, scale=1):
    image = _shade(_height_raster(voxels, bounds, scale))
    return image


def _grid_overlay(draw, bounds, scale, size):
    min_x, max_x, min_z, max_z = bounds
    width, depth = size

    def to_pixel(block_x, block_z):
        return ((block_x - min_x) / scale, (block_z - min_z) / scale)

    for spacing, colour in ((_MINOR_GRID, (255, 255, 255, 40)),
                            (_REGION_GRID, (120, 200, 255, 110))):
        start_x = int(math.floor(min_x / spacing)) * spacing
        for block_x in range(start_x, max_x + spacing, spacing):
            x, _ = to_pixel(block_x, min_z)
            if 0 <= x <= width:
                draw.line([(x, 0), (x, depth)], fill=colour, width=1)
        start_z = int(math.floor(min_z / spacing)) * spacing
        for block_z in range(start_z, max_z + spacing, spacing):
            _, z = to_pixel(min_x, block_z)
            if 0 <= z <= depth:
                draw.line([(0, z), (width, z)], fill=colour, width=1)

    # The world origin, which is the point the user asked to centre on.
    if min_x <= 0 <= max_x and min_z <= 0 <= max_z:
        x, z = to_pixel(0, 0)
        draw.line([(x - 12, z), (x + 12, z)], fill=(255, 92, 92, 255), width=2)
        draw.line([(x, z - 12), (x, z + 12)], fill=(255, 92, 92, 255), width=2)


def write_map(path, result, options, projector, origin_east, origin_north,
              voxels=None, scale=1):
    """Write `<path>` as a self-contained HTML plan of the build."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    if voxels is None or len(voxels) == 0:
        bounds = (-options.radius, options.radius, -options.radius, options.radius)
        image = Image.new("RGB", (1, 1), _GROUND)
    else:
        bounds = result.bounds or (int(voxels[:, 0].min()), int(voxels[:, 0].max()),
                                   int(voxels[:, 1].min()), int(voxels[:, 1].max()))
        image = render_plan(voxels, bounds, scale)

    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    _grid_overlay(ImageDraw.Draw(overlay), bounds, scale, image.size)
    image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")

    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")

    png_path = path.with_suffix(".png")
    png_path.write_bytes(buffer.getvalue())

    path.write_text(_page(encoded, bounds, result, options, projector,
                          origin_east, origin_north, scale, image.size),
                    encoding="utf-8")
    return str(path), str(png_path)


def _region_rows(bounds):
    min_x, max_x, min_z, max_z = bounds
    rows = []
    for region_x in range(min_x >> 9, (max_x >> 9) + 1):
        for region_z in range(min_z >> 9, (max_z >> 9) + 1):
            rows.append((f"r.{region_x}.{region_z}.mca",
                         region_x * 512, region_x * 512 + 511,
                         region_z * 512, region_z * 512 + 511))
    return rows


def _page(encoded, bounds, result, options, projector, origin_east, origin_north,
          scale, size):
    min_x, max_x, min_z, max_z = bounds
    lat, lon = options.center
    width, depth = size

    regions = "".join(
        f"<tr><td><code>{name}</code></td><td>{x1} … {x2}</td><td>{z1} … {z2}</td></tr>"
        for name, x1, x2, z1, z2 in _region_rows(bounds))

    ticks_x = "".join(
        f'<div class="tick" style="left:{(bx - min_x) / scale / width * 100:.4f}%">{bx}</div>'
        for bx in range(int(math.floor(min_x / _MINOR_GRID)) * _MINOR_GRID,
                        max_x + _MINOR_GRID, _MINOR_GRID)
        if min_x <= bx <= max_x)
    ticks_z = "".join(
        f'<div class="tick" style="top:{(bz - min_z) / scale / depth * 100:.4f}%">{bz}</div>'
        for bz in range(int(math.floor(min_z / _MINOR_GRID)) * _MINOR_GRID,
                        max_z + _MINOR_GRID, _MINOR_GRID)
        if min_z <= bz <= max_z)

    return f"""<!doctype html>
<meta charset="utf-8">
<title>{html.escape(str(getattr(options, 'output', None) or getattr(options, 'world', '') or 'PLATEAU'))} — block plan</title>
<style>
  :root {{ color-scheme: dark; --ink:#e8eef5; --dim:#8b98a8; --line:#2a3441; --bg:#12161c; }}
  body {{ margin:0; background:var(--bg); color:var(--ink);
         font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }}
  main {{ max-width:1180px; margin:0 auto; padding:28px 20px 60px; }}
  h1 {{ font-size:20px; margin:0 0 4px; }}
  .sub {{ color:var(--dim); margin:0 0 24px; }}
  .facts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
            gap:12px; margin:0 0 24px; }}
  .fact {{ background:#182029; border:1px solid var(--line); border-radius:8px; padding:10px 12px; }}
  .fact b {{ display:block; font-size:19px; font-weight:600; }}
  .fact span {{ color:var(--dim); font-size:12px; }}
  .plan {{ position:relative; border:1px solid var(--line); border-radius:8px;
           overflow:hidden; margin:0 0 8px; }}
  .plan img {{ display:block; width:100%; image-rendering:pixelated; }}
  .axis-x, .axis-z {{ position:absolute; color:#9fb0c4; font:11px ui-monospace,monospace;
                      pointer-events:none; }}
  .axis-x {{ inset:0 0 auto 0; height:0; }}
  .axis-z {{ inset:0 auto 0 0; width:0; }}
  .axis-x .tick {{ position:absolute; top:3px; transform:translateX(3px); }}
  .axis-z .tick {{ position:absolute; left:4px; transform:translateY(-100%); }}
  table {{ border-collapse:collapse; width:100%; margin:8px 0 0; font-size:13px; }}
  th, td {{ text-align:left; padding:6px 10px; border-bottom:1px solid var(--line); }}
  th {{ color:var(--dim); font-weight:500; }}
  code {{ font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }}
  section {{ margin:32px 0 0; }}
  h2 {{ font-size:15px; margin:0 0 8px; }}
  .note {{ color:var(--dim); font-size:13px; }}
  .wrap {{ overflow-x:auto; }}
</style>
<main>
  <h1>Block plan</h1>
  <p class="sub">Centred on {lat:.6f}, {lon:.6f} — plane rectangular zone {result.zone}
     (EPSG:{result.epsg}), one block per metre. North is up; in game north is −Z.</p>

  <div class="facts">
    <div class="fact"><b>{result.chunks_written or result.chunk_count:,}</b><span>chunks</span></div>
    <div class="fact"><b>{max_x - min_x:,} × {max_z - min_z:,}</b><span>blocks covered</span></div>
    <div class="fact"><b>{result.voxels or result.buildings_kept:,}</b><span>{'voxels' if result.voxels else 'buildings'}</span></div>
    <div class="fact"><b>y {result.highest_block_y:,}</b><span>highest block</span></div>
    <div class="fact"><b>/tp 0 {result.spawn_y} 0</b><span>centre point</span></div>
  </div>

  <div class="plan">
    <img src="data:image/png;base64,{encoded}" alt="Top-down plan of the converted area">
    <div class="axis-x">{ticks_x}</div>
    <div class="axis-z">{ticks_z}</div>
  </div>
  <p class="note">Faint white lines every {_MINOR_GRID} blocks; blue lines are region-file
     boundaries every {_REGION_GRID}. The red cross is block 0, 0. Brightness is height.</p>

  <section>
    <h2>Where each region file sits</h2>
    <p class="note">Drop these into <code>&lt;save&gt;/region/</code>. If you only want part of
       the city, you only need the files whose ranges you care about.</p>
    <div class="wrap"><table>
      <tr><th>File</th><th>X range</th><th>Z range</th></tr>
      {regions}
    </table></div>
  </section>

  <section>
    <h2>Turning a real coordinate into a block coordinate</h2>
    <p class="note">Project the latitude and longitude into the same zone, then subtract the
       origin. Northings are negated because Minecraft's +Z points south.</p>
    <div class="wrap"><table>
      <tr><th>Quantity</th><th>Value</th></tr>
      <tr><td>Projection</td><td>JGD2011 plane rectangular zone {result.zone} (EPSG:{result.epsg})</td></tr>
      <tr><td>Origin easting</td><td><code>{origin_east:.3f} m</code></td></tr>
      <tr><td>Origin northing</td><td><code>{origin_north:.3f} m</code></td></tr>
      <tr><td>Block X</td><td><code>easting − {origin_east:.3f}</code></td></tr>
      <tr><td>Block Z</td><td><code>−(northing − {origin_north:.3f})</code></td></tr>
      <tr><td>Block Y</td><td><code>altitude (m) + {options.sea_level}</code></td></tr>
    </table></div>
  </section>
</main>
"""
