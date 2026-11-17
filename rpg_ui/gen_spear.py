"""청룡 와선창 창 그림 (V6.4): 사용자 그림(art/cheongryong_spear_ref.png)을 파티클 점 그림으로
  1) 테두리에서 시작해 흰 배경 지움  2) 창을 가로로 눕힘 (창날 = 오른쪽)  3) 축소 → 픽셀마다 꽉 찬 칸
  파티클 rpg:cr_spear — 스크립트가 u(창 방향)·v(창에 수직, 보는 사람 쪽으로 펼친 면)를 넘김
"""
import json, math
from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent
SRC = ROOT / "art" / "cheongryong_spear_ref.png"
TEX = ROOT / "resource_pack" / "textures" / "particle" / "rpg_cr_spear.png"
CELL, TARGET_W = 4, 130


def main():
    im = Image.open(SRC).convert("RGBA")
    W, H = im.size
    px = im.load()
    bg = lambda c: min(c[0], c[1], c[2]) > 236
    seen = bytearray(W * H)
    q = deque([(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] + [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)])
    while q:
        x, y = q.popleft()
        i = y * W + x
        if seen[i]:
            continue
        seen[i] = 1
        if not bg(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]:
                q.append((nx, ny))
    # 창 방향(주축) 구해서 가로로 눕힘
    pts = [(x, y) for y in range(0, H, 3) for x in range(0, W, 3) if px[x, y][3]]
    mx = sum(p[0] for p in pts) / len(pts); my = sum(p[1] for p in pts) / len(pts)
    sxx = sum((p[0] - mx) ** 2 for p in pts); syy = sum((p[1] - my) ** 2 for p in pts); sxy = sum((p[0] - mx) * (p[1] - my) for p in pts)
    ang = 0.5 * math.degrees(math.atan2(2 * sxy, sxx - syy))
    im = im.rotate(ang, expand=True, resample=Image.BICUBIC)
    im = im.crop(im.getbbox())
    w, h = im.size
    small = im.resize((TARGET_W, max(1, round(h * TARGET_W / w))), Image.LANCZOS)
    sp = small.load()
    n = 0
    for y in range(small.size[1]):
        for x in range(small.size[0]):
            r, g, b, a = sp[x, y]
            if a < 110:
                sp[x, y] = (0, 0, 0, 0)
            else:
                sp[x, y] = (r, g, b, 255); n += 1
    # 창날이 오른쪽인지 확인: 오른쪽 끝 20% 열의 픽셀이 더 넓게 퍼져 있으면 창날
    def spread(x0, x1):
        ys = [y for x in range(x0, x1) for y in range(small.size[1]) if sp[x, y][3]]
        return (max(ys) - min(ys)) if ys else 0
    Wd = small.size[0]
    if spread(0, Wd // 5) > spread(Wd * 4 // 5, Wd):
        small = small.transpose(Image.FLIP_LEFT_RIGHT); sp = small.load()
    small.resize((small.size[0] * CELL, small.size[1] * CELL), Image.NEAREST).save(TEX)
    prev = Image.new("RGBA", small.size, (90, 120, 80, 255)); prev.alpha_composite(small)
    prev.resize((small.size[0] * 6, small.size[1] * 6), Image.NEAREST).save(ROOT / "docs" / "spear_preview.png")
    IW, IH = small.size
    gx, gy = round(IW * 0.36), IH // 2  # 쥐는 곳: 자루 끝에서 36%
    # 파티클
    R1, R2, R3 = (f"variable.particle_random_{i}" for i in (1, 2, 3))
    bx, by = f"math.floor({R1} * {IW})", f"math.floor({R2} * {IH})"
    lx, ly = f"(({bx} - {gx}) * variable.scale)", f"(({gy} - {by}) * variable.scale)"
    d = {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": "rpg:cr_spear", "basic_render_parameters": {"material": "particles_alpha", "texture": "textures/particle/rpg_cr_spear"}},
        "components": {
            "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
            "minecraft:emitter_lifetime_once": {"active_time": 0.05},
            "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {lx} + variable.v.{c} * {ly}" for c in "xyz"], "direction": [0, 1, 0]},
            "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
            "minecraft:particle_initial_speed": 0,
            "minecraft:particle_motion_dynamic": {},
            "minecraft:particle_appearance_billboard": {"size": ["variable.scale * 0.85", "variable.scale * 0.85"], "facing_camera_mode": "lookat_xyz",
                "uv": {"texture_width": IW * CELL, "texture_height": IH * CELL, "uv": [f"{bx} * {CELL}", f"{by} * {CELL}"], "uv_size": [CELL, CELL]}},
        }}}
    (ROOT / "resource_pack" / "particles" / "rpg_cr_spear.json").write_text(json.dumps(d, indent=1))
    fill = n / (IW * IH)
    (ROOT / "behavior_pack" / "scripts" / "cr_spear_meta.js").write_text(
        f"// gen_spear.py 가 만듦: 창 그림 크기·쥐는 곳·채워진 비율\nexport const SPEAR = {{ iw: {IW}, ih: {IH}, gx: {gx}, gy: {gy}, filled: {n}, fill: {fill:.3f} }};\n")
    print("spear", small.size, "filled", n, f"fill {fill:.2f}", "angle", round(ang, 1))


if __name__ == "__main__":
    main()
