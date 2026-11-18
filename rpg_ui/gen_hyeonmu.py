"""현무의 방패 (V9.5) — 거북 등껍질 방패 그림 + 현무 파티클(먹빛 검정 · 짙은 초록 · 비취) + 무기 아이템
  hm_shield   방패 그림 점 찍기 (등껍질처럼 가운데가 앞으로 볼록)
  hm_hex      육각 등껍질 무늬 벽 (선)          hm_hexfill  벽 안쪽 반투명 비취 막
  hm_spike    흑요석빛 검정 → 비취 바위 기둥(끝이 뾰족, 면마다 밝기 다름)
  hm_scale    뱀 몸 한 토막 (등 짙은 초록 · 배 옅은 연두 · 띠 무늬)
  hm_rock     튀어 오르는 바위 조각 (중력 · 땅에 튕김)   hm_slab  줄 따라 솟구치는 큰 바위판
  hm_line     비취빛 균열 선    hm_ring  땅을 타고 번지는 고리    hm_glow  비취 불티
  hm_smoke    먹빛 연기          hm_flash 패링 번쩍임(별)
"""
import json, math, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).parent
TEXD = ROOT / "resource_pack" / "textures" / "particle"
OUT = ROOT / "resource_pack" / "particles"
AGE = "(variable.particle_age / variable.particle_lifetime)"
R1, R2, R3, R4 = (f"variable.particle_random_{i}" for i in (1, 2, 3, 4))
JADE = {"0.0": "#FFF0FFF4", "0.18": "#FFB4F5D2", "0.4": "#FF4FC488", "0.65": "#FF22744A", "0.85": "#FF0F3322", "1.0": "#FF050C08"}
ROCK = {"0.0": "#FF58665C", "0.35": "#FF333D37", "0.7": "#FF1A211D", "1.0": "#FF0A0D0B"}
SPIKE = {"0.0": "#FFD6FFE8", "0.18": "#FF7FE0AE", "0.4": "#FF2F8F5E", "0.62": "#FF17482F", "0.82": "#FF0B1A12", "1.0": "#FF030504"}
SNAKE = {"0.0": "#FFD2E6A4", "0.25": "#FF8DB65A", "0.5": "#FF3E7436", "0.75": "#FF1B3A1F", "1.0": "#FF07120A"}
RAIN = {"0.0": "#F0E4FFB8", "0.35": "#E09CF05A", "0.7": "#D04CC03A", "1.0": "#B0237A2A"}
POISON = {"0.0": "#9978C850", "0.4": "#7740862E", "1.0": "#00102A10"}
INK = {"0.0": "#CC33493B", "0.45": "#99162219", "1.0": "#00040705"}
FILL = {"0.0": "#702F8F5E", "0.6": "#401E5A3C", "1.0": "#000B1A12"}
SHEET = "textures/particle/rpg_hm"
SPR = 8  # 스프라이트 한 칸 (rpg_hm.png 64x64 = 8x8칸)


def part(name, comps, tex=SHEET, material="particles_alpha"):
    d = {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": f"rpg:{name}", "basic_render_parameters": {"material": material, "texture": tex}},
        "components": comps}}
    (OUT / f"rpg_{name}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1))


def look(size, sprite, grad, interp):
    return {
        "minecraft:particle_appearance_billboard": {"size": [size, size], "facing_camera_mode": "lookat_xyz",
                                                    "uv": {"texture_width": 64, "texture_height": 64, "uv": [sprite if isinstance(sprite, str) else sprite * SPR, 0], "uv_size": [SPR, SPR]}},
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": interp, "gradient": grad}},
    }


def once(n="variable.n"):
    return {"minecraft:emitter_rate_instant": {"num_particles": n}, "minecraft:emitter_lifetime_once": {"active_time": 0.05}}


# ───────── 스프라이트 시트 ─────────
def sheet():
    im = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    big = 8 * 8  # 각 스프라이트를 8배로 그려서 줄임
    def put(i, draw_fn):
        s = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        draw_fn(ImageDraw.Draw(s), s)
        im.paste(s.resize((SPR, SPR), Image.LANCZOS), (i * SPR, 0))
    c = big / 2
    # 0 부드러운 빛
    def glow(d, s):
        for r in range(int(c), 0, -1):
            a = int(255 * (1 - r / c) ** 1.6)
            d.ellipse([c - r, c - r, c + r, c + r], fill=(255, 255, 255, a))
    # 1 단단한 점
    def dot(d, s): d.ellipse([6, 6, big - 6, big - 6], fill=(255, 255, 255, 255))
    # 2·3 바위 조각 (각진 다각형 + 윗면 밝게)
    def rock(seed):
        def f(d, s):
            rnd = random.Random(seed)
            pts = [(c + math.cos(a) * rr, c + math.sin(a) * rr) for a, rr in
                   [(k / 7 * 2 * math.pi + rnd.uniform(-0.3, 0.3), rnd.uniform(20, 30)) for k in range(7)]]
            d.polygon(pts, fill=(150, 150, 150, 255))
            top = [p for p in pts if p[1] < c + 4] + [(c + 10, c - 2), (c - 10, c + 2)]
            d.polygon(pts[:4], fill=(205, 205, 205, 255))
            d.line(pts + [pts[0]], fill=(70, 70, 70, 255), width=3)
        return f
    # 4 조각(길쭉한 마름모)
    def shard(d, s): d.polygon([(c, 4), (c + 12, c), (c, big - 4), (c - 12, c)], fill=(255, 255, 255, 255)); d.polygon([(c, 4), (c + 12, c), (c, c)], fill=(200, 200, 200, 255))
    # 5 연기 뭉치
    def puff(d, s):
        rnd = random.Random(5)
        for _ in range(9):
            x, y, r = c + rnd.uniform(-12, 12), c + rnd.uniform(-10, 10), rnd.uniform(10, 18)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, 120))
        s2 = s.filter(ImageFilter.GaussianBlur(4)); s.paste(s2)
    # 6 별 (패링 번쩍)
    def star(d, s):
        for w, a in ((6, 255), (14, 120)):
            d.polygon([(c, 0), (c + w / 2, c - w / 2), (big, c), (c + w / 2, c + w / 2), (c, big), (c - w / 2, c + w / 2), (0, c), (c - w / 2, c - w / 2)], fill=(255, 255, 255, a))
        d.ellipse([c - 8, c - 8, c + 8, c + 8], fill=(255, 255, 255, 255))
    # 7 비늘 (둥근 마름모 + 테두리)
    def scale_(d, s):
        d.ellipse([4, 4, big - 4, big - 4], fill=(110, 110, 110, 255))
        d.ellipse([10, 8, big - 10, big - 14], fill=(235, 235, 235, 255))
    for i, fn in enumerate([glow, dot, rock(2), rock(9), shard, puff, star, scale_]):
        put(i, fn)
    # 두 번째 줄 0번: 빗방울 줄기 (세로, 아래쪽 머리가 밝고 위로 갈수록 흐려지는 꼬리)
    drop = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    dd = ImageDraw.Draw(drop)
    for y in range(big):
        q = y / (big - 1)  # 0 = 위(꼬리) → 1 = 아래(머리)
        w = 2 + 5 * q ** 3
        a = int(255 * (0.15 + 0.85 * q ** 1.5))
        dd.line([(c - w / 2, y), (c + w / 2, y)], fill=(255, 255, 255, a))
    dd.ellipse([c - 6, big - 14, c + 6, big - 1], fill=(255, 255, 255, 255))
    im.paste(drop.resize((SPR, SPR), Image.LANCZOS), (0, SPR))
    im.save(TEXD / "rpg_hm.png")


# ───────── 거북 등껍질 방패 그림 ─────────
def shield_art():
    W, H = 240, 280
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = im.load()
    cx, cy, ax, ay = W / 2, H / 2 + 6, W * 0.46, H * 0.46
    rim = 0.13  # 테두리(뱀 띠) 두께 비율
    # 등껍질 판: 가운데 척추판 3 + 양옆 늑판 4쌍 + 테두리판 → 보로노이 씨앗
    seeds = [(0, -0.42), (0, 0.0), (0, 0.42)]
    for sx in (-1, 1):
        seeds += [(sx * 0.42, -0.5), (sx * 0.5, -0.08), (sx * 0.45, 0.33), (sx * 0.22, 0.7), (sx * 0.22, -0.82)]
    seeds += [(0, 0.86), (0, -0.92)]
    S = [(cx + x * ax * 0.86, cy + y * ay * 0.86) for x, y in seeds]
    for y in range(H):
        for x in range(W):
            ex, ey = (x - cx) / ax, (y - cy) / (ay * (1.0 + 0.08 * max(0, (y - cy) / ay)))  # 아래가 살짝 길쭉
            e = math.hypot(ex, ey)
            if e > 1:
                continue
            light = 0.75 + 0.35 * (-(ex * 0.55) - ey * 0.6) * 0.5 + 0.25 * (1 - e)  # 왼쪽 위에서 빛 + 가운데 볼록
            if e > 1 - rim:  # 뱀 테두리: 비늘 띠
                q = (e - (1 - rim)) / rim
                ang = math.atan2(ey, ex)
                band = (math.sin(ang * 46) * 0.5 + 0.5)
                g = 0.55 + 0.45 * math.sin(q * math.pi)
                base = (40 + 50 * band, 92 + 60 * band, 46 + 34 * band)
                if q < 0.12 or q > 0.9:
                    base = (10, 18, 12)
                col = tuple(int(min(255, v * g * light)) for v in base)
                px[x, y] = (*col, 255)
                continue
            # 등껍질 판
            ds = sorted((math.hypot(x - sx, y - sy), i) for i, (sx, sy) in enumerate(S))
            d1, i1 = ds[0]
            d2 = ds[1][0]
            if d2 - d1 < 5.0:  # 판 사이 검은 홈
                px[x, y] = (8, 12, 10, 255)
                continue
            rings = (math.sin(d1 * 0.32) * 0.5 + 0.5)
            inner = max(0.0, 1 - d1 / 34)  # 판 가운데 밝은 마디
            k = (0.42 + 0.22 * rings + 0.35 * inner) * light
            base = (22, 58, 38) if i1 % 2 == 0 else (28, 70, 44)
            col = (int(min(255, base[0] * k + 18 * inner)), int(min(255, base[1] * k + 62 * inner)), int(min(255, base[2] * k + 40 * inner)))
            px[x, y] = (*col, 255)
    d = ImageDraw.Draw(im)
    # 뱀 머리 (위 가운데, 테두리를 물고 있음) + 비취 눈
    hx, hy = cx, cy - ay + 6
    d.polygon([(hx - 20, hy + 6), (hx, hy - 22), (hx + 20, hy + 6), (hx, hy + 22)], fill=(44, 98, 48, 255), outline=(8, 16, 10, 255))
    d.polygon([(hx - 12, hy + 4), (hx, hy - 12), (hx + 12, hy + 4), (hx, hy + 12)], fill=(70, 130, 64, 255))
    for ex in (-8, 8):
        d.ellipse([hx + ex - 4, hy - 4, hx + ex + 4, hy + 4], fill=(190, 255, 140, 255))
    # 가운데 비취 보석 (현무의 기운)
    d.ellipse([cx - 13, cy - 13, cx + 13, cy + 13], fill=(10, 20, 14, 255))
    d.ellipse([cx - 9, cy - 9, cx + 9, cy + 9], fill=(70, 200, 130, 255))
    d.ellipse([cx - 5, cy - 7, cx + 1, cy - 2], fill=(210, 255, 230, 255))
    return im


def shrink_alpha(im, w):
    h = round(im.size[1] * w / im.size[0])
    s = im.resize((w, h), Image.LANCZOS)
    p = s.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = p[x, y]
            p[x, y] = (r, g, b, 255) if a > 110 else (0, 0, 0, 0)
    return s


def main():
    sheet()
    art = shield_art()
    # 아이콘 32x32
    icon = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    ic = shrink_alpha(art, 27)
    icon.paste(ic, ((32 - ic.size[0]) // 2, (32 - ic.size[1]) // 2), ic)
    (ROOT / "resource_pack" / "textures" / "items" / "rpg").mkdir(parents=True, exist_ok=True)
    icon.save(ROOT / "resource_pack" / "textures" / "items" / "rpg" / "hyeonmu_shield.png")
    # 파티클용 그림: 40칸 폭, 한 칸 = 텍스처 4픽셀
    small = shrink_alpha(art, 40)
    iw, ih = small.size
    small.resize((iw * 4, ih * 4), Image.NEAREST).save(TEXD / "rpg_hm_shield.png")
    filled = sum(1 for y in range(ih) for x in range(iw) if small.getpixel((x, y))[3])
    (ROOT / "behavior_pack" / "scripts" / "hm_meta.js").write_text(
        f"// gen_hyeonmu.py 가 만듦: 방패 그림 크기\nexport const SHIELD = {{ iw: {iw}, ih: {ih}, cx: {iw / 2}, cy: {ih / 2}, filled: {filled}, fill: {filled / (iw * ih):.3f} }};\n")

    global SW, SH
    SW, SH = iw, ih
    # hm_shield: 그림 점 찍기 (u = 그림 가로, v = 그림 세로(위), w = 앞, 가운데가 depth 만큼 볼록)
    bx, by = f"math.floor({R1} * variable.iw)", f"math.floor({R2} * variable.ih)"
    lx = f"(({bx} - variable.cx + 0.5) * variable.scale)"
    ly = f"((variable.cy - {by} - 0.5) * variable.scale)"
    d2 = f"(math.pow(({bx} - variable.iw / 2) / (variable.iw / 2), 2) + math.pow(({by} - variable.ih / 2) / (variable.ih / 2), 2))"
    lz = f"(math.sqrt(math.max(0, 1 - {d2})) * variable.h + ({R3} - 0.5) * variable.scale)"
    part("hm_shield", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {lx} + variable.v.{c} * {ly} + variable.w.{c} * {lz}" for c in "xyz"], "direction": ["variable.vd.x", "variable.vd.y", "variable.vd.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_initial_speed": "variable.spd",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": {"size": ["variable.scale * 1.45 * variable.size"] * 2, "facing_camera_mode": "lookat_xyz",
                                                    "uv": {"texture_width": SW * 4, "texture_height": SH * 4, "uv": [f"{bx} * 4", f"{by} * 4"], "uv_size": [4, 4]}},
    }, tex="textures/particle/rpg_hm_shield")

    # hm_hex: 육각 무늬 선 (r = 열 수, h = 행 수, scale = 육각 한 변, thick = 휘어짐)
    s = "variable.scale"
    i_ = f"(math.floor({R1} * variable.r) - math.floor(variable.r / 2))"
    j_ = f"(math.floor({R2} * variable.h) - math.floor(variable.h / 2))"
    hcx = f"({i_} * 1.5 * {s})"
    hcy = f"(({j_} + math.mod(math.abs({i_}), 2) * 0.5) * 1.732 * {s})"
    a0 = f"(math.floor({R3} * 3) * 60)"
    X = f"({hcx} + {s} * (math.cos({a0}) * (1 - {R4}) + math.cos({a0} + 60) * {R4}))"
    Y = f"({hcy} + {s} * (math.sin({a0}) * (1 - {R4}) + math.sin({a0} + 60) * {R4}))"
    Wz = f"(-variable.thick * {X} * {X})"
    part("hm_hex", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {X} + variable.v.{c} * {Y} + variable.w.{c} * {Wz}" for c in "xyz"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.85 + {R3} * 0.3)"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        **look(f"variable.size * 0.075 * (1 - {AGE} * 0.4)", 0, JADE, f"math.clamp(variable.tone + {R3} * 0.2 + {AGE} * 0.35, 0, 1)"),
    }, material="particles_blend")
    FX = f"(({R1} - 0.5) * variable.r * 1.5 * {s})"
    FY = f"(({R2} - 0.5) * variable.h * 1.732 * {s})"
    part("hm_hexfill", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {FX} + variable.v.{c} * {FY} + variable.w.{c} * (-variable.thick * {FX} * {FX} - 0.05)" for c in "xyz"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.4)"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        **look(f"variable.size * (0.35 + {R3} * 0.25)", 0, FILL, f"math.clamp({AGE} * 0.7 + {R4} * 0.3, 0, 1)"),
    }, material="particles_blend")

    # hm_spike: u = 기둥 방향, r = 길이, thick = 밑동 반지름 (v·w = 둘레)
    t = f"math.pow({R1}, 0.8)"
    rad = f"(variable.thick * math.pow(1 - {t}, 0.85) * ({R2} > 0.3 ? 1 : 0.4 + {R2} * 2))"
    ang = f"({R3} * 360)"
    part("hm_spike", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {t} * variable.r + (variable.v.{c} * math.cos({ang}) + variable.w.{c} * math.sin({ang})) * {rad}" for c in "xyz"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.9 + {R4} * 0.2)"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        **look(f"variable.size * 0.11 * (0.6 + {R4} * 0.6)", 1, SPIKE,
               f"math.clamp(0.92 - {t} * 0.72 - (math.mod(math.floor({R3} * 6), 2) * 0.16) - math.cos({ang} - 40) * 0.1 + variable.tone, 0, 1)"),
    })

    # hm_scale: 뱀 몸 한 토막 (u = 몸 방향, v = 등 쪽, r = 길이, thick = 굵기)
    ang = f"({R2} * 360)"
    pat = f"(math.mod(math.floor({R1} * variable.r * 3.5 + math.cos({ang}) * 1.2), 2) * 0.14)"
    part("hm_scale", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {R1} * variable.r + (variable.v.{c} * math.cos({ang}) + variable.w.{c} * math.sin({ang})) * variable.thick * (0.85 + {R3} * 0.15)" for c in "xyz"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        **look(f"variable.size * 0.1 * (0.8 + {R4} * 0.4)", 7, SNAKE, f"math.clamp(0.42 + math.cos({ang}) * 0.38 + {pat} + variable.tone, 0, 1)"),
    })

    # hm_rock: 바위 조각이 튀어 오름 (중력, 땅에 튕김)
    rock_common = {
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.5)"},
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -22, 0], "linear_drag_coefficient": 0.4},
        "minecraft:particle_motion_collision": {"collision_radius": 0.12, "coefficient_of_restitution": 0.25, "collision_drag": 6},
        "minecraft:particle_initial_spin": {"rotation": f"{R1} * 360", "rotation_rate": f"({R2} - 0.5) * 720"},
    }
    part("hm_rock", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", 0.1, f"({R2} - 0.5) * 2 * variable.r"], "direction": [f"({R3} - 0.5) * 0.7", 1, f"({R4} - 0.5) * 0.7"]},
        "minecraft:particle_initial_speed": f"variable.spd * (0.55 + {R1} * 0.7)",
        **rock_common,
        **look(f"variable.size * (0.12 + {R4} * 0.2)", f"math.floor({R2} * 2) * {SPR} + {2 * SPR}", ROCK, f"math.clamp({R3} * 0.7 + variable.tone, 0, 1)"),
    })
    part("hm_slab", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {R1} * variable.r + variable.v.{c} * ({R2} - 0.5) * 2 * variable.h" for c in "xyz"],
                                          "direction": [f"variable.v.x * ({R2} - 0.5) * 0.9", 1, f"variable.v.z * ({R2} - 0.5) * 0.9"]},
        "minecraft:particle_initial_speed": f"variable.spd * (0.7 + {R3} * 0.6)",
        **rock_common,
        **look(f"variable.size * (0.28 + {R4} * 0.32)", f"math.floor({R3} * 2) * {SPR} + {2 * SPR}", ROCK, f"math.clamp({R4} * 0.6 + variable.tone, 0, 1)"),
    })

    # hm_line: 비취빛 균열 (u 방향 길이 r, 지그재그 폭 h, thick = 모양 씨앗)
    jag = f"((math.sin({R1} * variable.r * 140 + variable.thick * 57) * 0.6 + math.sin({R1} * variable.r * 330 + variable.thick * 13) * 0.4) * variable.h + ({R2} - 0.5) * 0.12)"
    part("hm_line", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {R1} * variable.r + variable.v.{c} * {jag}" for c in "xyz"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.4)"},
        "minecraft:particle_initial_speed": f"{R3} * 0.3",
        "minecraft:particle_motion_dynamic": {},
        **look(f"variable.size * 0.13 * (1 - {AGE} * 0.5)", 0, JADE, f"math.clamp(variable.tone + math.abs({R2} - 0.5) * 1.3 + {AGE} * 0.35, 0, 1)"),
    }, material="particles_blend")

    # hm_ring: 땅을 타고 번지는 고리
    a = f"({R1} * 360)"
    part("hm_ring", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [f"math.cos({a}) * variable.r", f"{R3} * 0.15", f"math.sin({a}) * variable.r"], "direction": [f"math.cos({a})", f"{R4} * 0.15", f"math.sin({a})"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.4)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.85 + {R2} * 0.3)",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 1.6},
        **look(f"variable.size * 0.14 * (1 - {AGE} * 0.6)", 0, JADE, f"math.clamp(variable.tone + {R2} * 0.3 + {AGE} * 0.5, 0, 1)"),
    }, material="particles_blend")

    # hm_glow: 비취 불티 터짐
    part("hm_glow", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"],
                                          "direction": [f"({R1} - 0.5)", f"({R2} - 0.4)", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.4 + {R4} * 0.8)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.8, 0], "linear_drag_coefficient": 2.2},
        **look(f"variable.size * 0.12 * (1 - {AGE} * 0.8)", 0, JADE, f"math.clamp(variable.tone + {R4} * 0.3 + {AGE} * 0.5, 0, 1)"),
    }, material="particles_blend")

    # hm_smoke: 먹빛 연기
    part("hm_smoke", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * variable.r", f"({R3} - 0.5) * 2 * variable.r"],
                                          "direction": [f"({R1} - 0.5)", f"0.5 + {R2} * 0.6", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.3 + {R4} * 0.5)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.7, 0], "linear_drag_coefficient": 1.6},
        **look(f"variable.size * (0.4 + {R4} * 0.35) * (0.7 + {AGE} * 0.8)", 5, INK, AGE),
    }, material="particles_blend")

    # hm_dome: 반구 등껍질 돔 (반지름 r, 육각 한 변 scale) — 육각 무늬를 (둘레 길이, 높이 길이) 면에 그려 반구로 감쌈
    i2 = f"math.floor({R1} * variable.r * 4.19 / {s})"  # 열: 둘레 2πr / 1.5s
    j2 = f"math.floor({R2} * variable.r * 0.907 / {s})"  # 행: (π/2 r) / 1.732s
    hx = f"({i2} * 1.5 * {s} + {s} * (math.cos({a0}) * (1 - {R4}) + math.cos({a0} + 60) * {R4}))"
    hy = f"((({j2} + math.mod({i2}, 2) * 0.5) * 1.732 * {s}) + {s} * (math.sin({a0}) * (1 - {R4}) + math.sin({a0} + 60) * {R4}))"
    az, el = f"({hx} / variable.r * 57.2958)", f"math.clamp({hy} / variable.r * 57.2958, 0, 90)"
    part("hm_dome", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [f"math.cos({el}) * math.cos({az}) * variable.r", f"math.sin({el}) * variable.r", f"math.cos({el}) * math.sin({az}) * variable.r"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.85 + {R3} * 0.3)"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        **look(f"variable.size * 0.13 * (1 - {AGE} * 0.4)", 0, JADE, f"math.clamp(variable.tone + {R3} * 0.2 + {AGE} * 0.3, 0, 1)"),
    }, material="particles_blend")
    az2, el2 = f"({R1} * 360)", f"(math.asin({R2}) )"
    part("hm_domefill", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [f"math.cos({el2}) * math.cos({az2}) * variable.r", f"math.sin({el2}) * variable.r", f"math.cos({el2}) * math.sin({az2}) * variable.r"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.4)"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        **look(f"variable.size * (0.6 + {R3} * 0.4)", 0, FILL, f"math.clamp({AGE} * 0.7 + {R4} * 0.3, 0, 1)"),
    }, material="particles_blend")

    # hm_rain: 독비 (안쪽 반지름 r ~ 바깥 반지름 thick 고리 위, 높이 h 에서 떨어지는 빗줄기, 땅에 닿으면 사라짐)
    ra = f"({R1} * 360)"
    rr = f"math.sqrt(variable.r * variable.r + {R2} * (variable.thick * variable.thick - variable.r * variable.r))"
    part("hm_rain", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [f"math.cos({ra}) * {rr}", f"variable.h + {R3} * 4", f"math.sin({ra}) * {rr}"], "direction": [0, -1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.85 + {R4} * 0.3)",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_motion_collision": {"collision_radius": 0.05, "expire_on_contact": True},
        # 세로로 선 빗줄기 (Y축만 돌아 항상 똑바로 섬)
        "minecraft:particle_appearance_billboard": {"size": [f"variable.size * (0.07 + {R4} * 0.04)", f"variable.size * (0.45 + {R4} * 0.3)"], "facing_camera_mode": "rotate_y",
                                                    "uv": {"texture_width": 64, "texture_height": 64, "uv": [0, SPR], "uv_size": [SPR, SPR]}},
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": f"{R3}", "gradient": RAIN}},
    }, material="particles_blend")
    # hm_rune: 땅에 그리는 진(陣): 바깥 원 · 안쪽 원 · 12개 눈금 · 육각형, h = 돌아간 각도(도), r = 반지름
    sel = R1
    q = R2
    ox = (f"({sel} < 0.4 ? math.cos({q} * 360 + variable.h) * variable.r : "
          f"({sel} < 0.62 ? math.cos({q} * 360 - variable.h) * variable.r * 0.82 : "
          f"({sel} < 0.8 ? math.cos(math.floor({R3} * 12) * 30 + variable.h) * variable.r * (0.82 + {q} * 0.18) : "
          f"math.cos(math.floor({R3} * 6) * 60 - variable.h) * variable.r * 0.82 * (1 - {q}) + math.cos(math.floor({R3} * 6) * 60 + 60 - variable.h) * variable.r * 0.82 * {q})))")
    oz = ox.replace("math.cos", "math.sin")
    part("hm_rune", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [ox, f"{R4} * 0.06", oz], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.85 + {R4} * 0.3)"},
        "minecraft:particle_initial_speed": f"{R4} * 0.15",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.4, 0]},
        **look(f"variable.size * 0.12 * (1 - {AGE} * 0.5)", 0, JADE, f"math.clamp(variable.tone + {R4} * 0.25 + {AGE} * 0.3, 0, 1)"),
    }, material="particles_blend")

    # hm_fog: 낮게 깔리는 짙은 초록 독 안개
    part("hm_fog", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"{R2} * 0.4", f"({R3} - 0.5) * 2 * variable.r"],
                                          "direction": [f"({R1} - 0.5)", f"0.1 + {R2} * 0.25", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.2 + {R4} * 0.4)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.15, 0], "linear_drag_coefficient": 1.2},
        **look(f"variable.size * (0.5 + {R4} * 0.4) * (0.6 + {AGE} * 0.7)", 5, POISON, AGE),
    }, material="particles_blend")

    # hm_flash: 패링 번쩍임
    part("hm_flash", {
        **once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0], "direction": [f"({R1} - 0.5)", f"({R2} - 0.5)", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"variable.spd * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 4},
        "minecraft:particle_initial_spin": {"rotation": f"{R1} * 90"},
        **look(f"variable.size * (0.5 + {R2} * 0.6) * (1 - {AGE})", 6, JADE, f"math.clamp({AGE} * 0.6 + {R3} * 0.15, 0, 1)"),
    }, material="particles_blend")

    item()
    print("hyeonmu particles + shield + item ok", iw, ih, filled)


def item():
    atlas_p = ROOT / "resource_pack" / "textures" / "item_texture.json"
    atlas = json.loads(atlas_p.read_text())
    atlas["texture_data"]["rpg_hyeonmu_shield"] = {"textures": "textures/items/rpg/hyeonmu_shield"}
    atlas_p.write_text(json.dumps(atlas, ensure_ascii=False, indent=2))
    data = {"format_version": "1.21.40", "minecraft:item": {
        "description": {"identifier": "rpg:hyeonmu_shield", "menu_category": {"category": "equipment", "group": "itemGroup.name.sword"}},
        "components": {
            "minecraft:icon": "rpg_hyeonmu_shield",
            "minecraft:display_name": {"value": "§2§l현무의 방패"},
            "minecraft:max_stack_size": 1, "minecraft:hand_equipped": True, "minecraft:damage": 100,
            "minecraft:enchantable": {"slot": "sword", "value": 18}, "minecraft:glint": True,
            "minecraft:can_destroy_in_creative": False,
            # 꾹 누르는 동안 '방패를 든' 상태 (시작·끝 이벤트로 패링·막기 판정), 막는 동안 느려짐
            "minecraft:use_modifiers": {"use_duration": 600, "movement_modifier": 0.4}}}}
    (ROOT / "behavior_pack" / "items" / "hyeonmu_shield.json").write_text(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
