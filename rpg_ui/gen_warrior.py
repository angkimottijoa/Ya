"""전사 계열 직업 스킬 파티클 (V10.3) — 직업마다 전용 텍스처 · 전용 파티클 (공유 없음)
  전사(강철)   wr_arc 강철 호 · wr_spark 쇳불똥 · wr_dust 흙먼지 · wr_ring 땅 고리
  검성·검황(달빛) mn_arc 초승달 호(가운데 두껍고 끝이 뾰족) · mn_wave 날아가는 달빛 검기 · mn_star 반짝이는 별가루
               mn_glyph 바닥 달 문양(만월 / 월식) · mn_line 잔상 선
  광전사(핏빛)  bl_arc 거친 핏빛 호(피가 튐) · bl_drop 핏방울(땅에 닿으면 사라짐) · bl_mist 피 안개 · bl_crack 피 균열
  파괴자(용염)  dr_arc 불씨 호 · dr_ember 솟는 불씨 · dr_rock 바위 조각 · dr_crack 용암 균열 · dr_burst 불꽃 분출
  최적화: 모든 움직임은 파티클 스스로(속도 · 가속), 스크립트는 한 번 뿌리고 끝 / 바닥 문양 · 균열은 한 번만 그려 오래 남김
"""
import json, math, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).parent
TEXD = ROOT / "resource_pack" / "textures" / "particle"
OUT = ROOT / "resource_pack" / "particles"
AGE = "(variable.particle_age / variable.particle_lifetime)"
R1, R2, R3, R4 = (f"variable.particle_random_{i}" for i in (1, 2, 3, 4))
SPR = 8


def part(name, tex, comps, material="particles_alpha"):
    d = {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": f"rpg:{name}", "basic_render_parameters": {"material": material, "texture": f"textures/particle/{tex}"}},
        "components": comps}}
    (OUT / f"rpg_{name}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1))


def once():
    return {"minecraft:emitter_rate_instant": {"num_particles": "variable.n"}, "minecraft:emitter_lifetime_once": {"active_time": 0.05}}


def bb(size, sprite, mode="lookat_xyz", w=None):
    sx = size if w is None else w
    return {"size": [sx, size], "facing_camera_mode": mode,
            "uv": {"texture_width": 32, "texture_height": 8, "uv": [sprite if isinstance(sprite, str) else sprite * SPR, 0], "uv_size": [SPR, SPR]}}


def tint(grad, interp):
    return {"minecraft:particle_appearance_tinting": {"color": {"interpolant": interp, "gradient": grad}}}


def sheet(fname, fns):
    big = 64
    im = Image.new("RGBA", (32, 8), (0, 0, 0, 0))
    for i, fn in enumerate(fns):
        s = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        fn(ImageDraw.Draw(s), s, big / 2)
        im.paste(s.resize((SPR, SPR), Image.LANCZOS), (i * SPR, 0))
    im.save(TEXD / f"{fname}.png")


# ── 스프라이트 그리는 함수들 ──
def soft(d, s, c):
    for r in range(int(c), 0, -1):
        d.ellipse([c - r, c - r, c + r, c + r], fill=(255, 255, 255, int(255 * (1 - r / c) ** 1.5)))
def disc(d, s, c): d.ellipse([8, 8, 56, 56], fill=(255, 255, 255, 255))
def streak(d, s, c):  # 쇳불똥: 가는 마름모 줄기
    d.polygon([(c, 2), (c + 5, c), (c, 62), (c - 5, c)], fill=(255, 255, 255, 255))
def puff(d, s, c):
    rnd = random.Random(3)
    for _ in range(8):
        x, y, r = c + rnd.uniform(-12, 12), c + rnd.uniform(-10, 10), rnd.uniform(10, 17)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, 140))
    s.paste(s.filter(ImageFilter.GaussianBlur(3)))
def glint(d, s, c):  # 칼날 반짝임: 가로로 긴 마름모
    d.polygon([(2, c), (c, c - 6), (62, c), (c, c + 6)], fill=(255, 255, 255, 255))
def star4(d, s, c):
    d.polygon([(c, 0), (c + 5, c - 5), (64, c), (c + 5, c + 5), (c, 64), (c - 5, c + 5), (0, c), (c - 5, c - 5)], fill=(255, 255, 255, 255))
    d.ellipse([c - 7, c - 7, c + 7, c + 7], fill=(255, 255, 255, 255))
def crescent(d, s, c):
    d.ellipse([6, 6, 58, 58], fill=(255, 255, 255, 255))
    d.ellipse([18, 2, 66, 50], fill=(0, 0, 0, 0))
def droplet(d, s, c):
    d.ellipse([c - 14, c - 4, c + 14, c + 24], fill=(255, 255, 255, 255))
    d.polygon([(c - 12, c + 4), (c, 4), (c + 12, c + 4)], fill=(255, 255, 255, 255))
    d.ellipse([c - 6, c + 2, c + 1, c + 9], fill=(255, 255, 255, 120))
def splat(d, s, c):
    rnd = random.Random(7)
    d.ellipse([c - 16, c - 16, c + 16, c + 16], fill=(255, 255, 255, 255))
    for _ in range(9):
        a, rr = rnd.uniform(0, 6.28), rnd.uniform(16, 28)
        x, y = c + math.cos(a) * rr, c + math.sin(a) * rr
        d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(255, 255, 255, 255))
def flame(d, s, c):  # 불꽃 혀: 아래 둥글고 위로 뾰족
    d.polygon([(c - 16, c + 16), (c - 4, c - 8), (c, 2), (c + 6, c - 10), (c + 16, c + 16)], fill=(255, 255, 255, 255))
    d.ellipse([c - 16, c + 2, c + 16, c + 28], fill=(255, 255, 255, 255))
    s.paste(s.filter(ImageFilter.GaussianBlur(2)))
def rock(d, s, c):
    rnd = random.Random(11)
    pts = [(c + math.cos(k / 6 * 6.283 + rnd.uniform(-0.3, 0.3)) * rnd.uniform(18, 28), c + math.sin(k / 6 * 6.283) * rnd.uniform(18, 28)) for k in range(6)]
    d.polygon(pts, fill=(150, 150, 150, 255)); d.polygon(pts[:3] + [(c, c)], fill=(215, 215, 215, 255))
    d.line(pts + [pts[0]], fill=(60, 60, 60, 255), width=4)


# ── 공통 모양 식 (각 직업 파티클이 자기 식·자기 텍스처로 씀) ──
def arc_shape(profile):
    """호 위의 점: a0 → a1 을 dur 동안 그리며 나타남. profile = 두께 모양(0~1)"""
    q = R1
    th = f"(variable.a0 + (variable.a1 - variable.a0) * {q})"
    rr = f"(variable.r - variable.thick * {R2} * ({profile}))"
    off = [f"(variable.u.{c} * math.cos({th}) + variable.v.{c} * math.sin({th})) * {rr} + variable.w.{c} * ({R3} - 0.5) * variable.h" for c in "xyz"]
    out = [f"(variable.u.{c} * math.cos({th}) + variable.v.{c} * math.sin({th}))" for c in "xyz"]
    delay = f"({q} * variable.dur)"
    live = f"math.clamp((variable.particle_age - {delay}) / variable.life, 0, 1)"
    return off, out, delay, live


def main():
    # ═════ 전사: 강철 (은회색 + 주황 불똥) ═════
    STEEL = {"0.0": "#FFFFFFFF", "0.2": "#FFE4ECF2", "0.5": "#FF9AA6B2", "0.8": "#FF56606C", "1.0": "#FF2A3038"}
    SPARK = {"0.0": "#FFFFF6C8", "0.35": "#FFFFC060", "0.7": "#FFF0701C", "1.0": "#FF601808"}
    DUST = {"0.0": "#C0A89A86", "0.6": "#80786A58", "1.0": "#00433A30"}
    sheet("rpg_wr", [disc, streak, puff, glint])
    off, out, delay, live = arc_shape("1")
    part("wr_arc", "rpg_wr", {**once(),
        "minecraft:emitter_shape_point": {"offset": off, "direction": out},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"{delay} + variable.life * (0.7 + {R4} * 0.3)"},
        "minecraft:particle_initial_speed": f"variable.spd * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 3},
        "minecraft:particle_appearance_billboard": bb(f"variable.particle_age < {delay} ? 0 : variable.size * (0.12 + (1 - {R2}) * 0.08) * (1 - {live})", 0),
        **tint(STEEL, f"math.clamp({R2} * 0.85 + {live} * 0.3 + variable.tone, 0, 1)")})
    part("wr_spark", "rpg_wr", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * variable.r", f"({R2} - 0.5) * variable.r", f"({R3} - 0.5) * variable.r"], "direction": [f"({R1} - 0.5)", f"{R2} * 0.8", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.5 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.5 + {R4})",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -14, 0], "linear_drag_coefficient": 0.8},
        "minecraft:particle_appearance_billboard": {**bb("variable.size * 0.14", 1, "lookat_direction", "variable.size * 0.05"), "direction": {"mode": "derive_from_velocity", "min_speed_threshold": 0.05}},
        **tint(SPARK, f"math.clamp({AGE} + {R4} * 0.2, 0, 1)")})
    part("wr_dust", "rpg_wr", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", 0.1, f"({R3} - 0.5) * 2 * variable.r"], "direction": [f"({R1} - 0.5)", f"0.2 + {R2} * 0.5", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.4 + {R4} * 0.6)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.3, 0], "linear_drag_coefficient": 2},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.4 + {R4} * 0.3) * (0.7 + {AGE} * 0.6)", 2),
        **tint(DUST, AGE)}, material="particles_blend")
    a = f"({R1} * 360)"
    part("wr_ring", "rpg_wr", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"math.cos({a}) * variable.r", 0.1, f"math.sin({a}) * variable.r"], "direction": [f"math.cos({a})", 0.05, f"math.sin({a})"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.3)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.9 + {R2} * 0.2)",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2.2},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * 0.16 * (1 - {AGE} * 0.7)", 3, "lookat_y"),
        **tint(STEEL, f"math.clamp(0.15 + {R2} * 0.4 + {AGE} * 0.4, 0, 1)")})

    # ═════ 검성·검황: 달빛 (은백 · 하늘 · 남색, 월식 = 검정 + 붉은 테) ═════
    MOON = {"0.0": "#FFFFFFFF", "0.15": "#FFE6F2FF", "0.35": "#FFA8CCFF", "0.55": "#FF5E7FD8", "0.7": "#FF2C3A86",
            "0.78": "#FF120A1E", "0.88": "#FF8A1422", "1.0": "#FFFF4A3A"}  # 0~0.7 달빛, 0.78~1 월식(검정 → 붉은 테)
    sheet("rpg_mn", [soft, star4, crescent, disc])
    off, out, delay, live = arc_shape(f"math.pow(math.sin({R1} * 180), 0.7)")  # 초승달: 가운데 두껍고 끝 뾰족
    part("mn_arc", "rpg_mn", {**once(),
        "minecraft:emitter_shape_point": {"offset": off, "direction": out},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"{delay} + variable.life * (0.7 + {R4} * 0.3)"},
        "minecraft:particle_initial_speed": f"variable.spd * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 3.5},
        "minecraft:particle_appearance_billboard": bb(f"variable.particle_age < {delay} ? 0 : variable.size * (0.1 + math.sin({R1} * 180) * 0.1) * (1 - {live} * 0.85)", 0),
        **tint(MOON, f"variable.tone > 0.75 ? math.clamp(0.78 + (1 - {R2}) * 0.22 - {live} * 0.1, 0.78, 1) : math.clamp({R2} * 0.6 + {live} * 0.25 + variable.tone, 0, 0.7)")}, material="particles_blend")
    # 날아가는 검기: a0~a1 호(반지름 r) 모양 점들이 다 같이 vd 방향 vs 속도로 날아감 (스크립트는 한 번만 뿌림)
    th = f"(variable.a0 + (variable.a1 - variable.a0) * {R1})"
    prof = f"math.pow(math.sin({R1} * 180), 0.7)"
    rr = f"(variable.r - variable.thick * {R2} * {prof})"
    part("mn_wave", "rpg_mn", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"(variable.u.{c} * (math.cos({th}) - 1) + variable.v.{c} * math.sin({th})) * {rr}" for c in "xyz"], "direction": ["variable.vd.x", "variable.vd.y", "variable.vd.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.92 + {R4} * 0.08)"},
        "minecraft:particle_initial_speed": "variable.vs",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.12 + {prof} * 0.12) * (1 - math.pow({AGE}, 3))", 0),
        **tint(MOON, f"variable.tone > 0.75 ? math.clamp(0.78 + (1 - {R2}) * 0.22, 0.78, 1) : math.clamp({R2} * 0.55 + variable.tone, 0, 0.7)")}, material="particles_blend")
    part("mn_star", "rpg_mn", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": [f"({R1} - 0.5)", f"({R2} - 0.3)", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.5, 0], "linear_drag_coefficient": 2.5},
        "minecraft:particle_initial_spin": {"rotation": f"{R1} * 90"},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * 0.13 * (0.55 + 0.45 * math.sin(variable.particle_age * 900 + {R1} * 360)) * (1 - {AGE})", 1),
        **tint(MOON, f"variable.tone > 0.75 ? 0.95 : math.clamp({R3} * 0.4 + variable.tone, 0, 0.7)")}, material="particles_blend")
    # 바닥 달 문양: u·v = 바닥(또는 세운 면), h = 0 만월 / 1 월식. 바깥 원 · 안쪽 원 · 초승달 채움
    sel, q = R1, R2
    ang = f"({q} * 360)"
    cx = f"({sel} < 0.45 ? math.cos({ang}) * variable.r : ({sel} < 0.65 ? math.cos({ang}) * variable.r * 0.72 : math.cos({ang}) * variable.r * 0.6 * math.sqrt({R3}) - variable.r * 0.18 * math.cos({R4} * 360) * 0))"
    cy = cx.replace("math.cos", "math.sin")
    # 초승달 채움: 원(0.6r) 안의 점 중 오른쪽으로 0.3r 비켜난 원(0.55r) 밖인 점만 (안이면 크기 0)
    fx_, fy_ = f"(math.cos({ang}) * variable.r * 0.6 * math.sqrt({R3}))", f"(math.sin({ang}) * variable.r * 0.6 * math.sqrt({R3}))"
    inside_bite = f"(math.pow({fx_} - variable.r * 0.3, 2) + math.pow({fy_}, 2) < math.pow(variable.r * 0.52, 2))"
    show = f"({sel} < 0.65 ? 1 : (variable.h > 0.5 ? 1 : ({inside_bite} ? 0 : 1)))"
    part("mn_glyph", "rpg_mn", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {cx} + variable.v.{c} * {cy}" for c in "xyz"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.85 + {R4} * 0.3)"},
        "minecraft:particle_initial_speed": f"{R4} * 0.1",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.15, 0]},
        "minecraft:particle_appearance_billboard": bb(f"{show} * variable.size * ({sel} < 0.65 ? 0.12 : 0.17) * (1 - {AGE} * 0.5)", 0),
        **tint(MOON, f"variable.h > 0.5 ? ({sel} < 0.45 ? math.clamp(0.9 + {R4} * 0.1, 0.78, 1) : 0.78) : math.clamp(({sel} < 0.65 ? 0.05 : 0.25) + {R4} * 0.2 + {AGE} * 0.2, 0, 0.7)")}, material="particles_blend")
    part("mn_line", "rpg_mn", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {R1} * variable.r + variable.v.{c} * ({R2} - 0.5) * 0.25 + variable.w.{c} * ({R3} - 0.5) * 0.25" for c in "xyz"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.4 + {R1} * 0.6)"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * 0.13 * (1 - {AGE})", 0),
        **tint(MOON, f"variable.tone > 0.75 ? math.clamp(0.8 + {R2} * 0.2, 0.78, 1) : math.clamp(0.1 + {R2} * 0.45 + {AGE} * 0.2, 0, 0.7)")}, material="particles_blend")

    # ═════ 광전사: 핏빛 (검붉은 · 검정) ═════
    BLOOD = {"0.0": "#FFFF6A5A", "0.25": "#FFD01E28", "0.55": "#FF8A0A16", "0.8": "#FF46040A", "1.0": "#FF140104"}
    MIST = {"0.0": "#B0A0101C", "0.6": "#70500810", "1.0": "#00200206"}
    sheet("rpg_bl", [disc, droplet, puff, splat])
    off, out, delay, live = arc_shape(f"(0.55 + 0.45 * math.sin({R1} * 2200 + {R3} * 90))")  # 거칠고 들쭉날쭉
    part("bl_arc", "rpg_bl", {**once(),
        "minecraft:emitter_shape_point": {"offset": off, "direction": [f"{out[0]}", f"{out[1]} + 0.3", f"{out[2]}"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"{delay} + variable.life * (0.7 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"variable.spd * {R4} * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -7, 0], "linear_drag_coefficient": 1.2},  # 피가 튀어 떨어짐
        "minecraft:particle_appearance_billboard": bb(f"variable.particle_age < {delay} ? 0 : variable.size * (0.11 + {R2} * 0.1) * (1 - {live} * 0.7)", f"({R4} > 0.8 ? {SPR} : 0)"),
        **tint(BLOOD, f"math.clamp({R2} * 0.6 + {live} * 0.35 + variable.tone, 0, 1)")})
    part("bl_drop", "rpg_bl", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * variable.r", f"({R2} - 0.5) * variable.r", f"({R3} - 0.5) * variable.r"], "direction": [f"({R1} - 0.5)", f"0.4 + {R2} * 0.8", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.5 + {R4})",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -16, 0]},
        "minecraft:particle_motion_collision": {"collision_radius": 0.05, "expire_on_contact": True},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.08 + {R4} * 0.07)", 1),
        **tint(BLOOD, f"math.clamp(0.2 + {R4} * 0.4 + variable.tone, 0, 1)")})
    part("bl_mist", "rpg_bl", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.3) * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": [f"({R1} - 0.5)", f"0.3 + {R2} * 0.4", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.3 + {R4} * 0.5)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.4, 0], "linear_drag_coefficient": 1.8},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.45 + {R4} * 0.3) * (0.7 + {AGE} * 0.6)", 2),
        **tint(MIST, AGE)}, material="particles_blend")
    jag = f"((math.sin({R1} * variable.r * 160 + variable.thick * 37) * 0.6 + math.sin({R1} * variable.r * 410 + variable.thick * 11) * 0.4) * variable.h)"
    part("bl_crack", "rpg_bl", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {R1} * variable.r + variable.v.{c} * ({jag} + ({R2} - 0.5) * 0.18 * (1 - {R1}))" for c in "xyz"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.4)"},
        "minecraft:particle_initial_speed": f"{R3} * 0.25",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.12 + (1 - {R1}) * 0.08) * (1 - {AGE} * 0.4)", f"({R3} > 0.85 ? {3 * SPR} : 0)", "lookat_y"),
        **tint(BLOOD, f"math.clamp(math.abs({R2} - 0.5) * 1.4 + {AGE} * 0.3 + variable.tone, 0, 1)")})

    # ═════ 파괴자: 용염 (흰 노랑 심지 → 주황 → 진홍 → 숯) ═════
    FIRE = {"0.0": "#FFFFF8D8", "0.18": "#FFFFD25A", "0.4": "#FFFF8A1E", "0.62": "#FFD2361A", "0.82": "#FF6A0E0E", "1.0": "#FF1E0606"}
    ROCK = {"0.0": "#FF7A5A4E", "0.4": "#FF4A3430", "0.75": "#FF2A1C1A", "1.0": "#FF100A0A"}
    sheet("rpg_dr", [soft, flame, rock, disc])
    off, out, delay, live = arc_shape("1")
    part("dr_arc", "rpg_dr", {**once(),
        "minecraft:emitter_shape_point": {"offset": off, "direction": [f"{out[0]} * 0.4", "1", f"{out[2]} * 0.4"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"{delay} + variable.life * (0.7 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 2.5, 0], "linear_drag_coefficient": 1.5},  # 불씨가 솟아오름
        "minecraft:particle_appearance_billboard": bb(f"variable.particle_age < {delay} ? 0 : variable.size * (0.13 + {R2} * 0.09) * (1 - {live} * 0.8)", f"({R4} > 0.6 ? {SPR} : 0)"),
        **tint(FIRE, f"math.clamp({R2} * 0.55 + {live} * 0.45 + variable.tone, 0, 1)")}, material="particles_blend")
    part("dr_ember", "rpg_dr", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": [f"({R1} - 0.5) * 0.6", f"0.6 + {R2} * 0.6", f"({R3} - 0.5) * 0.6"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.7)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.4 + {R4} * 0.8)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 1.5, 0], "linear_drag_coefficient": 1.4},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * 0.1 * (1 - {AGE})", 3),
        **tint(FIRE, f"math.clamp({AGE} * 0.8 + {R4} * 0.2 + variable.tone, 0, 1)")}, material="particles_blend")
    part("dr_rock", "rpg_dr", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", 0.1, f"({R2} - 0.5) * 2 * variable.r"], "direction": [f"({R3} - 0.5) * 0.7", 1, f"({R4} - 0.5) * 0.7"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.5 + {R1} * 0.7)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -22, 0]},
        "minecraft:particle_motion_collision": {"collision_radius": 0.12, "coefficient_of_restitution": 0.25, "collision_drag": 6},
        "minecraft:particle_initial_spin": {"rotation": f"{R1} * 360", "rotation_rate": f"({R2} - 0.5) * 600"},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.14 + {R4} * 0.22)", 2),
        **tint(ROCK, f"math.clamp({R3} * 0.8 + variable.tone, 0, 1)")})
    jag2 = f"((math.sin({R1} * variable.r * 120 + variable.thick * 41) * 0.6 + math.sin({R1} * variable.r * 290 + variable.thick * 7) * 0.4) * variable.h)"
    part("dr_crack", "rpg_dr", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {R1} * variable.r + variable.v.{c} * ({jag2} + ({R2} - 0.5) * 0.2)" for c in "xyz"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.4)"},
        "minecraft:particle_initial_speed": f"{R3} * 0.4",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.6, 0]},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.14 + (1 - math.abs({R2} - 0.5) * 2) * 0.08) * (1 - {AGE} * 0.5)", 0, "lookat_y"),
        **tint(FIRE, f"math.clamp(math.abs({R2} - 0.5) * 1.3 + {AGE} * 0.45 + variable.tone, 0, 1)")}, material="particles_blend")
    a = f"({R1} * 360)"
    part("dr_burst", "rpg_dr", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"math.cos({a}) * variable.r * {R2}", f"{R3} * 0.3", f"math.sin({a}) * variable.r * {R2}"],
                                          "direction": [f"math.cos({a}) * (1 - variable.h)", f"0.35 + variable.h * 1.6 + {R3} * 0.5", f"math.sin({a}) * (1 - variable.h)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.5 + {R4} * 0.7)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 3, 0], "linear_drag_coefficient": 2},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.4 + {R4} * 0.35) * (1 - {AGE} * 0.6)", 1),
        **tint(FIRE, f"math.clamp({AGE} * 0.85 + {R2} * 0.15 + variable.tone, 0, 1)")}, material="particles_blend")
    print("warrior particles ok")


if __name__ == "__main__":
    main()
