"""사흉수 무기 (V11.7) — 혼돈의 구슬 · 궁기의 쌍발톱 · 도올의 대망치 · 도철의 아가리
  파티클(무기마다 전용 텍스처), 아이템 JSON, 32x32 아이콘
  효율: 모든 움직임은 파티클 스스로 (속도 / particle_motion_parametric) → 스크립트는 한 번 뿌리고 끝
  hd_orb 색이 계속 바뀌는 혼돈탄 · hd_rift 일렁이는 차원 균열(스스로 맥동·회전) · hd_burst 무지갯빛 폭발 · hd_ghost 흐려진 잔상
  qq_claw 세 줄 발톱 호 · qq_feather 스스로 날아가는 깃털 · qq_wing 스스로 퍼덕이는 날개(깃털 부채) · qq_burst 핏빛 깃털 폭발
  tw_spin 회전하며 날아가는 망치(모양째 스스로 돌며 이동) · tw_ring 땅을 타고 퍼지는 지진 고리 · tw_rock 바위 파편 · tw_crack 용암빛 균열
  tt_jaw 위아래 턱이 스스로 닫히는 아가리(이빨) · tt_mask 도철 가면(그림) · tt_vortex 빨려 드는 소용돌이 · tt_burst 청동 파편
"""
import json, math, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).parent
TEXD = ROOT / "resource_pack" / "textures" / "particle"
OUT = ROOT / "resource_pack" / "particles"
AGE = "(variable.particle_age / variable.particle_lifetime)"
A = "variable.particle_age"
R1, R2, R3, R4 = (f"variable.particle_random_{i}" for i in (1, 2, 3, 4))
SPR = 8


def part(name, tex, comps, material="particles_blend"):
    d = {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": f"rpg:{name}", "basic_render_parameters": {"material": material, "texture": f"textures/particle/{tex}"}},
        "components": comps}}
    (OUT / f"rpg_{name}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1))


def once():
    return {"minecraft:emitter_rate_instant": {"num_particles": "variable.n"}, "minecraft:emitter_lifetime_once": {"active_time": 0.05}}


def bb(size, sprite, mode="lookat_xyz", extra=None, w=None):
    d = {"size": [w or size, size], "facing_camera_mode": mode,
         "uv": {"texture_width": 32, "texture_height": 8, "uv": [sprite if isinstance(sprite, str) else sprite * SPR, 0], "uv_size": [SPR, SPR]}}
    if extra: d.update(extra)
    return d


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


def soft(d, s, c):
    for r in range(int(c), 0, -1):
        d.ellipse([c - r, c - r, c + r, c + r], fill=(255, 255, 255, int(255 * min(1, (1 - r / c) ** 1.3 * 1.5))))
def disc(d, s, c): d.ellipse([8, 8, 56, 56], fill=(255, 255, 255, 255))
def star4(d, s, c):
    d.polygon([(c, 0), (c + 5, c - 5), (64, c), (c + 5, c + 5), (c, 64), (c - 5, c + 5), (0, c), (c - 5, c - 5)], fill=(255, 255, 255, 255))
def shard(d, s, c): d.polygon([(c, 2), (c + 10, c), (c, 62), (c - 10, c)], fill=(255, 255, 255, 255))
def feather(d, s, c):
    d.polygon([(c, 2), (c + 9, 20), (c + 7, 46), (c, 62), (c - 7, 46), (c - 9, 20)], fill=(255, 255, 255, 255))
    d.line([(c, 6), (c, 60)], fill=(150, 150, 150, 255), width=3)
def rock(d, s, c):
    rnd = random.Random(5)
    pts = [(c + math.cos(k / 6 * 6.283) * rnd.uniform(18, 28), c + math.sin(k / 6 * 6.283) * rnd.uniform(18, 28)) for k in range(6)]
    d.polygon(pts, fill=(150, 150, 150, 255)); d.polygon(pts[:3] + [(c, c)], fill=(215, 215, 215, 255))
def tooth(d, s, c): d.polygon([(c - 12, 6), (c + 12, 6), (c, 60)], fill=(255, 255, 255, 255))


def burst(name, tex, grad, sprite, up="0.3", grav=0, cycle=False):
    interp = f"{frac(f'{R4} + {A} * 2.2')}" if cycle else f"math.clamp({AGE} * 0.7 + {R4} * 0.2 + variable.tone, 0, 1)"
    part(name, tex, {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": [f"({R1} - 0.5)", f"({R2} - 0.5) + {up}", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.4 + {R4} * 0.8)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, grav, 0], "linear_drag_coefficient": 2.4},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.14 + {R4} * 0.12) * (1 - {AGE} * 0.8)", sprite),
        **tint(grad, interp)})


def frac(x):
    return f"(({x}) - math.floor({x}))"


def main():
    # ═════ 혼돈: 색이 계속 바뀜 (빨 → 주 → 노 → 초 → 파 → 보 → 빨) ═════
    PRISM = {"0.0": "#FFFF3A6A", "0.17": "#FFFF9A2A", "0.33": "#FFF6F04A", "0.5": "#FF4AF09A", "0.67": "#FF3A9AFF", "0.83": "#FFB04AFF", "1.0": "#FFFF3A6A"}
    sheet("rpg_hd", [soft, star4, shard, disc])
    lag = f"({R4} * {R4} * 0.5)"
    part("hd_orb", "rpg_hd", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": ["variable.vd.x", "variable.vd.y", "variable.vd.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_initial_speed": f"variable.vs * (1 - {lag})",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.24 - {lag} * 0.28)", f"({R4} < 0.2 ? {SPR} : 0)"),
        **tint(PRISM, frac(f"variable.tone + {R1} * 0.15 + {A} * 1.5"))})
    # 차원 균열: 세로로 선 일렁이는 타원 테두리(맥동) + 안쪽 소용돌이
    ang = f"({R1} * 360)"
    wob = f"(1 + math.sin({ang} * 5 + {A} * 400) * 0.12 + math.sin({ang} * 11 - {A} * 700) * 0.06)"
    inner = f"({R2} < 0.3 ? {frac(f'{R3} + {A} * 0.9')} : 1)"
    sw = f"({ang} + ({R2} < 0.3 ? {A} * 300 + (1 - {inner}) * 200 : 0))"
    part("hd_rift", "rpg_hd", {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_motion_parametric": {"relative_position": [f"variable.u.{c} * math.cos({sw}) * variable.r * 0.55 * {wob} * {inner} + variable.v.{c} * math.sin({sw}) * variable.r * {wob} * {inner}" for c in "xyz"]},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * ({R2} < 0.3 ? 0.1 : 0.15) * (1 - math.pow({AGE}, 4)) * math.min(1, {A} * 6)", f"({R4} > 0.85 ? {2 * SPR} : 0)"),
        **tint(PRISM, frac(f"{R1} + {A} * 0.8"))})
    burst("hd_burst", "rpg_hd", PRISM, f"({R4} > 0.6 ? {SPR} : 0)", cycle=True)
    part("hd_ghost", "rpg_hd", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 0.7", f"{R2} * 1.8", f"({R3} - 0.5) * 0.7"], "direction": [f"({R1} - 0.5)", 0.2, f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"0.3 * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * 0.16 * (1 - {AGE})", 0),
        **tint(PRISM, frac(f"{R2} * 0.5 + {A} * 2"))})

    # ═════ 궁기: 핏빛 · 검정 깃털 ═════
    CRIM = {"0.0": "#FFFFE0E0", "0.18": "#FFFF6A6A", "0.4": "#FFD01A2A", "0.65": "#FF6A0A18", "0.85": "#FF200408", "1.0": "#E0000000"}
    sheet("rpg_qq", [soft, feather, shard, disc])
    # 세 줄 발톱: 호 세 개(반지름 r, r-0.35, r-0.7)를 같이
    q = R1
    lane = f"(math.floor({R3} * 3) * 0.38)"
    th = f"(variable.a0 + (variable.a1 - variable.a0) * {q})"
    delay = f"({q} * variable.dur)"
    live = f"math.clamp(({A} - {delay}) / variable.life, 0, 1)"
    part("qq_claw", "rpg_qq", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"(variable.u.{c} * math.cos({th}) + variable.v.{c} * math.sin({th})) * (variable.r - {lane} + ({R2} - 0.5) * 0.08 * math.sin({q} * 180))" for c in "xyz"],
                                          "direction": [f"(variable.u.{c} * math.cos({th}) + variable.v.{c} * math.sin({th}))" for c in "xyz"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"{delay} + variable.life * (0.6 + {R4} * 0.4)"},
        "minecraft:particle_initial_speed": f"variable.spd * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 3},
        "minecraft:particle_appearance_billboard": bb(f"{A} < {delay} ? 0 : variable.size * (0.06 + math.sin({q} * 180) * 0.1) * (1 - {live} * 0.85)", 0),
        **tint(CRIM, f"math.clamp({R2} * 0.4 + {live} * 0.4 + variable.tone, 0, 1)")})
    part("qq_feather", "rpg_qq", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"],
                                          "direction": [f"variable.vd.x + ({R1} - 0.5) * variable.h", f"variable.vd.y + ({R2} - 0.5) * variable.h", f"variable.vd.z + ({R3} - 0.5) * variable.h"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.85 + {R4} * 0.3)"},
        "minecraft:particle_initial_speed": f"variable.vs * (0.85 + {R4} * 0.3)",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": bb("variable.size * 0.32", 1, "lookat_direction", {"direction": {"mode": "derive_from_velocity", "min_speed_threshold": 0.05}}, "variable.size * 0.13"),
        **tint(CRIM, f"math.clamp(0.45 + {R4} * 0.4 + {AGE} * 0.15, 0, 1)")})
    # 날개: 어깨(원점)에서 깃털 n 줄이 부채꼴로, 부채 전체가 스스로 퍼덕임 (u = 바깥, v = 위)
    fi = f"math.floor({R1} * 7)"
    spread = f"(20 - {fi} * 14 + math.sin({A} * variable.spin) * 28)"
    rr = f"({R2} * variable.r * (1 - {fi} * 0.05))"
    part("qq_wing", "rpg_qq", {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_motion_parametric": {"relative_position": [f"(variable.u.{c} * math.cos({spread}) + variable.v.{c} * math.sin({spread})) * {rr} + variable.w.{c} * {R2} * {R2} * -0.6" for c in "xyz"]},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.1 + {R2} * 0.14) * (1 - math.pow({AGE}, 4))", f"({R2} > 0.7 ? {SPR} : 0)"),
        **tint(CRIM, f"math.clamp(0.75 - {R2} * 0.5 + {R3} * 0.1, 0, 1)")})
    burst("qq_burst", "rpg_qq", CRIM, f"({R4} > 0.5 ? {SPR} : 0)", grav=-2)

    # ═════ 도올: 녹슨 청동 · 용암빛 ═════
    BRONZE = {"0.0": "#FFFFE8B0", "0.2": "#FFFFA040", "0.4": "#FFC0602A", "0.6": "#FF7A4A2A", "0.8": "#FF3A2A22", "1.0": "#FF141010"}
    sheet("rpg_tw", [soft, rock, shard, disc])
    # 회전하며 날아가는 망치: 자루(선) + 머리(네모) 모양이 스스로 돌면서 vd 방향으로 이동
    seg = f"({R1} < 0.55 ? 0 : 1)"  # 0 = 자루, 1 = 머리
    lx = f"({R1} < 0.55 ? ({R2} - 0.5) * variable.r * 1.6 : variable.r * 0.8 + ({R3} - 0.5) * variable.r * 0.5)"
    ly = f"({R1} < 0.55 ? ({R3} - 0.5) * 0.1 : ({R2} - 0.5) * variable.r * 0.9)"
    B = f"({A} * variable.spin)"
    move = [f"variable.vd.{c} * variable.vs * {A}" for c in "xyz"]
    part("tw_spin", "rpg_tw", {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_motion_parametric": {"relative_position": [f"{move[i]} + variable.u.{c} * ({lx} * math.cos({B}) - {ly} * math.sin({B})) + variable.v.{c} * ({lx} * math.sin({B}) + {ly} * math.cos({B}))" for i, c in enumerate("xyz")]},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * ({seg} > 0 ? 0.16 : 0.1)", f"({seg} > 0 ? {3 * SPR} : 0)"),
        **tint(BRONZE, f"math.clamp(({seg} > 0 ? 0.3 : 0.55) + {R4} * 0.2, 0, 1)")})
    a = f"({R1} * 360)"
    part("tw_ring", "rpg_tw", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"math.cos({a}) * variable.r", 0.1, f"math.sin({a}) * variable.r"], "direction": [f"math.cos({a})", f"{R3} * 0.4", f"math.sin({a})"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.3)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.85 + {R2} * 0.3)",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 1.8},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.18 + {R4} * 0.14) * (1 - {AGE} * 0.6)", f"({R4} > 0.6 ? {SPR} : 0)"),
        **tint(BRONZE, f"math.clamp(0.25 + {R4} * 0.4 + {AGE} * 0.3, 0, 1)")}, material="particles_alpha")
    part("tw_rock", "rpg_tw", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", 0.1, f"({R2} - 0.5) * 2 * variable.r"], "direction": [f"({R3} - 0.5) * 0.7", 1, f"({R4} - 0.5) * 0.7"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.5 + {R1} * 0.7)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -22, 0]},
        "minecraft:particle_motion_collision": {"collision_radius": 0.12, "coefficient_of_restitution": 0.25, "collision_drag": 6},
        "minecraft:particle_initial_spin": {"rotation": f"{R1} * 360", "rotation_rate": f"({R2} - 0.5) * 600"},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.16 + {R4} * 0.22)", 1),
        **tint(BRONZE, f"math.clamp(0.55 + {R3} * 0.4, 0, 1)")}, material="particles_alpha")
    jag = f"((math.sin({R1} * variable.r * 120 + variable.h * 41) * 0.6 + math.sin({R1} * variable.r * 290 + variable.h * 7) * 0.4) * 0.35)"
    part("tw_crack", "rpg_tw", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {R1} * variable.r + variable.v.{c} * ({jag} + ({R2} - 0.5) * 0.2)" for c in "xyz"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.4)"},
        "minecraft:particle_initial_speed": f"{R3} * 0.3",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * 0.15 * (1 - {AGE} * 0.5)", 0, "lookat_y"),
        **tint(BRONZE, f"math.clamp(math.abs({R2} - 0.5) * 1.2 + {AGE} * 0.4, 0, 1)")})

    # ═════ 도철: 청동 녹 · 금 · 짙은 초록 ═════
    TT = {"0.0": "#FFFFF6C8", "0.2": "#FFF0C860", "0.42": "#FFB08A3A", "0.6": "#FF4A7A5A", "0.8": "#FF1E3A2A", "1.0": "#E0080E0A"}
    sheet("rpg_tt", [soft, tooth, shard, disc])
    # 아가리: 위턱(호)과 아래턱이 스스로 닫힘 (u = 앞, v = 위). 이빨은 턱 가장자리에
    jaw = f"({R1} < 0.5 ? 1 : -1)"
    close = f"math.min(1, {A} / math.max(0.05, variable.dur))"
    open_ = f"(variable.h * (1 - {close} * {close}))"  # 벌어진 각(도)
    t2 = R2
    arcA = f"({jaw} * ({open_} + 8) * (1 - {t2}))"  # 턱끝(앞)으로 갈수록 0
    px = f"({t2} * variable.r)"
    py = f"({jaw} * (math.sin({arcA} + 4) * {t2} * variable.r * 0.9 + 0.12))"
    part("tt_jaw", "rpg_tt", {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_motion_parametric": {"relative_position": [f"variable.u.{c} * {px} + variable.v.{c} * {py} + variable.w.{c} * ({R3} - 0.5) * variable.r * 0.7 * math.sin({t2} * 180)" for c in "xyz"]},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * ({R4} > 0.75 ? 0.22 : 0.12) * (1 - math.pow({AGE}, 4))", f"({R4} > 0.75 ? {SPR} : 0)"),
        **tint(TT, f"math.clamp(({R4} > 0.75 ? 0.05 : 0.35) + {t2} * 0.25, 0, 1)")})
    mask_art()
    bx, by = f"math.floor({R1} * variable.iw)", f"math.floor({R2} * variable.ih)"
    part("tt_mask", "rpg_tt_mask", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * ({bx} - variable.iw / 2) * variable.scale + variable.v.{c} * (variable.ih / 2 - {by}) * variable.scale" for c in "xyz"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": {"size": [f"variable.scale * 1.4 * math.min(1, {A} * 4) * (1 - math.pow({AGE}, 6))"] * 2, "facing_camera_mode": "lookat_xyz",
                                                    "uv": {"texture_width": 48, "texture_height": 32, "uv": [bx, by], "uv_size": [1, 1]}},
    }, material="particles_alpha")
    fr = frac(f"{R2} + {A} * variable.spd")
    aa = f"({R1} * 360 + {A} * 260 + {fr} * 240)"
    part("tt_vortex", "rpg_tt", {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_motion_parametric": {"relative_position": [f"math.cos({aa}) * variable.r * (1 - {fr})", f"{R3} * 1.5 * (1 - {fr})", f"math.sin({aa}) * variable.r * (1 - {fr})"]},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.1 + (1 - {fr}) * 0.12) * (1 - math.pow({AGE}, 4))", 0),
        **tint(TT, f"math.clamp(0.3 + {fr} * 0.6, 0, 1)")})
    burst("tt_burst", "rpg_tt", TT, f"({R4} > 0.6 ? {2 * SPR} : 0)")
    items()
    print("fiends particles + items ok")


def mask_art():
    """도철 가면(좌우 대칭): 큰 눈 · 소용돌이 뿔 · 코 능선 · 이빨 → rpg_tt_mask.png (48x32)"""
    W, H, S = 48, 32, 8
    big = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    P = lambda pts: [(x * S, y * S) for x, y in pts]
    BR, GD, DK = (170, 120, 60, 255), (240, 200, 110, 255), (40, 60, 45, 255)
    d.polygon(P([(4, 6), (24, 2), (44, 6), (46, 18), (38, 28), (24, 31), (10, 28), (2, 18)]), fill=BR)
    for sx in (-1, 1):
        cx = 24 + sx * 11
        d.ellipse(P([(cx - 6, 9), (cx + 6, 19)]), fill=GD); d.ellipse(P([(cx - 3, 11), (cx + 3, 17)]), fill=DK)
        for k in range(3):  # 뿔 소용돌이
            r = 6 - k * 1.8
            d.arc(P([(24 + sx * 16 - r, 2 - r * 0.3), (24 + sx * 16 + r, 2 + r * 1.4)]), 0, 360, fill=GD, width=S)
        d.line(P([(24 + sx * 4, 21), (24 + sx * 18, 24)]), fill=GD, width=S)  # 수염 무늬
    d.polygon(P([(22, 6), (26, 6), (27, 22), (21, 22)]), fill=GD)  # 코 능선
    for k in range(6):  # 이빨
        x = 13 + k * 4.4
        d.polygon(P([(x, 25), (x + 3.6, 25), (x + 1.8, 30)]), fill=(255, 245, 220, 255))
    small = big.resize((W, H), Image.LANCZOS)
    px = small.load()
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a > 110 else (0, 0, 0, 0)
    small.save(TEXD / "rpg_tt_mask.png")
    filled = sum(1 for y in range(H) for x in range(W) if small.getpixel((x, y))[3])
    (ROOT / "behavior_pack" / "scripts" / "tt_meta.js").write_text(f"// gen_fiends.py 가 만듦\nexport const MASK = {{ iw: {W}, ih: {H}, filled: {filled} }};\n")


def icon(kind):
    im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    OUTL = (20, 14, 22, 255)
    if kind == "orb":
        for r in range(12, 0, -1):
            t = r / 12
            col = [(255, 70, 110), (255, 170, 60), (90, 240, 160), (80, 150, 255), (190, 90, 255)][int((1 - t) * 4.99)]
            d.ellipse([16 - r, 16 - r, 16 + r, 16 + r], fill=col + (255,))
        d.ellipse([4, 4, 28, 28], outline=OUTL, width=2); d.ellipse([10, 8, 15, 13], fill=(255, 255, 255, 230))
        d.arc([1, 1, 31, 31], 200, 340, fill=(30, 20, 40, 255), width=2)
    elif kind == "claws":
        for off in (0, 7):
            d.polygon([(4 + off, 28), (8 + off, 26), (20 + off, 6), (17 + off, 3), (12 + off, 10)], fill=(150, 20, 34, 255), outline=OUTL)
            d.line([(8 + off, 24), (18 + off, 7)], fill=(255, 120, 120, 255), width=1)
        d.rectangle([2, 26, 22, 30], fill=(40, 26, 30, 255), outline=OUTL)
    elif kind == "hammer":
        d.line([(6, 28), (20, 12)], fill=(70, 48, 30, 255), width=3)
        d.polygon([(14, 4), (26, 2), (30, 12), (18, 16)], fill=(150, 92, 50, 255), outline=OUTL)
        d.line([(16, 6), (26, 4)], fill=(240, 180, 90, 255), width=1); d.point((22, 9), fill=(255, 120, 40, 255))
    else:  # maw
        d.rounded_rectangle([5, 8, 27, 28], 5, fill=(150, 112, 60, 255), outline=OUTL, width=2)
        for x in range(8, 26, 4):
            d.polygon([(x, 8), (x + 3, 8), (x + 1.5, 13)], fill=(250, 240, 210, 255))
            d.polygon([(x, 28), (x + 3, 28), (x + 1.5, 23)], fill=(250, 240, 210, 255))
        d.ellipse([10, 15, 14, 19], fill=(60, 200, 120, 255)); d.ellipse([18, 15, 22, 19], fill=(60, 200, 120, 255))
    return im


def items():
    atlas_p = ROOT / "resource_pack" / "textures" / "item_texture.json"
    atlas = json.loads(atlas_p.read_text())
    (ROOT / "resource_pack" / "textures" / "items" / "rpg").mkdir(parents=True, exist_ok=True)
    for iid, kind, name, dmg in [("hundun_orb", "orb", "§d§l혼돈의 구슬", 7), ("qiongqi_claws", "claws", "§c§l궁기의 쌍발톱", 9), ("taowu_hammer", "hammer", "§6§l도올의 대망치", 10), ("taotie_maw", "maw", "§2§l도철의 아가리", 8)]:
        icon(kind).save(ROOT / "resource_pack" / "textures" / "items" / "rpg" / f"{iid}.png")
        atlas["texture_data"][f"rpg_{iid}"] = {"textures": f"textures/items/rpg/{iid}"}
        data = {"format_version": "1.21.40", "minecraft:item": {
            "description": {"identifier": f"rpg:{iid}", "menu_category": {"category": "equipment", "group": "itemGroup.name.sword"}},
            "components": {"minecraft:icon": f"rpg_{iid}", "minecraft:display_name": {"value": f"{name} §r§7[사흉수 · 스킬 무기]"},
                           "minecraft:max_stack_size": 1, "minecraft:hand_equipped": True, "minecraft:damage": dmg,
                           "minecraft:enchantable": {"slot": "sword", "value": 18}, "minecraft:glint": True, "minecraft:can_destroy_in_creative": False,
                           "minecraft:use_modifiers": {"use_duration": 0.05, "movement_modifier": 1.0}}}}
        (ROOT / "behavior_pack" / "items" / f"{iid}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2))
    atlas_p.write_text(json.dumps(atlas, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
