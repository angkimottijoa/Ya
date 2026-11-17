"""히든 직업 파티클 (V11.6) — 시간술사(tm_) · 심연의 기사(ab_) · 혼령 인도자(sp_), 직업마다 전용 텍스처
  효율: 움직임은 모두 파티클 스스로 (particle_motion_parametric / 속도), 스크립트는 한 번 뿌리고 끝
  tm_hand  시곗바늘: 중심에서 뻗은 바늘이 스스로 돎        tm_gear  톱니바퀴: 스스로 돎
  tm_sand  금빛 모래 낙하                                  tm_shard 시간 조각 탄(꼬리)        tm_burst 시간 파편
  ab_tendril 촉수: 끝으로 가늘고, 스스로 꿈틀대며 자라남   ab_void  블랙홀: 점이 스스로 소용돌이치며 빨려 들어감
  ab_arc   심연 베기 호                                    ab_mist  검은 안개                  ab_burst 심연 파편
  sp_beast 혼령 짐승(늑대 · 까마귀 · 사슴 · 곰 그림): 그림째로 vd 방향으로 달려감(잔상 꼬리)
  sp_wisp  혼령빛 꼬리                                     sp_heal  치유 빛                    sp_burst 혼령 폭발
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


def bb(size, sprite, tw=32, th=8):
    return {"size": [size, size], "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": tw, "texture_height": th, "uv": [sprite if isinstance(sprite, str) else sprite * SPR, 0], "uv_size": [SPR, SPR]}}


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
def diamond(d, s, c): d.polygon([(c, 2), (c + 12, c), (c, 62), (c - 12, c)], fill=(255, 255, 255, 255))
def eye(d, s, c):
    d.ellipse([4, c - 14, 60, c + 14], fill=(255, 255, 255, 255)); d.ellipse([c - 5, c - 12, c + 5, c + 12], fill=(40, 40, 40, 255))
def star4(d, s, c):
    d.polygon([(c, 0), (c + 5, c - 5), (64, c), (c + 5, c + 5), (c, 64), (c - 5, c + 5), (0, c), (c - 5, c - 5)], fill=(255, 255, 255, 255))


def burst(name, tex, grad, sprite, up="0.3", grav=0):
    part(name, tex, {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": [f"({R1} - 0.5)", f"({R2} - 0.5) + {up}", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.4 + {R4} * 0.8)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, grav, 0], "linear_drag_coefficient": 2.4},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.14 + {R4} * 0.12) * (1 - {AGE} * 0.8)", sprite),
        **tint(grad, f"math.clamp({AGE} * 0.7 + {R4} * 0.2 + variable.tone, 0, 1)")})


def proj(name, tex, grad, sprite, tail="0.5"):
    lag = f"({R4} * {R4} * {tail})"
    part(name, tex, {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": ["variable.vd.x", "variable.vd.y", "variable.vd.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_initial_speed": f"variable.vs * (1 - {lag})",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.22 - {lag} * 0.25)", sprite),
        **tint(grad, f"math.clamp({lag} * 1.6 + variable.tone, 0, 1)")})


def rotate(X, Y):
    B = f"(variable.rot + variable.spin * {A})"
    return f"(({X}) * math.cos({B}) - ({Y}) * math.sin({B}))", f"(({X}) * math.sin({B}) + ({Y}) * math.cos({B}))"


def planar(name, tex, grad, sprite, X, Y, size, interp, life="variable.life"):
    """u·v 면 위의 모양을 스스로 돌리는 파티클 (매 프레임 위치를 식으로)"""
    Xr, Yr = rotate(X, Y)
    part(name, tex, {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": life},
        "minecraft:particle_motion_parametric": {"relative_position": [f"variable.u.{c} * {Xr} + variable.v.{c} * {Yr}" for c in "xyz"]},
        "minecraft:particle_appearance_billboard": bb(size, sprite),
        **tint(grad, interp)})


def main():
    # ═════ 시간술사: 황동 · 금 · 하늘빛 ═════
    TIME = {"0.0": "#FFFFFFF0", "0.2": "#FFFFE8A0", "0.45": "#FFE8B04A", "0.65": "#FFB0782A", "0.82": "#FF7AC8FF", "1.0": "#C02A5AA0"}
    sheet("rpg_tm", [soft, diamond, star4, disc])
    fade = f"(1 - math.pow({AGE}, 4))"
    planar("tm_hand", "rpg_tm", TIME, 3, f"{R1} * variable.r", f"({R2} - 0.5) * variable.w * (1 - {R1} * 0.75)",
           f"variable.size * (0.13 - {R1} * 0.05) * {fade}", f"math.clamp({R1} * 0.45 + variable.tone, 0, 1)")
    ang = f"({R1} * 360)"
    tooth = f"(math.mod(math.floor({R1} * variable.m * 2), 2) * variable.w)"
    gr = f"({R2} < 0.22 ? variable.r * 0.5 : variable.r + {tooth})"
    planar("tm_gear", "rpg_tm", TIME, 3, f"math.cos({ang}) * {gr}", f"math.sin({ang}) * {gr}",
           f"variable.size * 0.12 * {fade}", f"math.clamp(0.35 + {R3} * 0.3 + variable.tone, 0, 1)")
    part("tm_sand", "rpg_tm", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"{R2} * 0.5", f"({R3} - 0.5) * 2 * variable.r"], "direction": [0, -1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.5 + {R4} * 0.6)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -6, 0]},
        "minecraft:particle_motion_collision": {"collision_radius": 0.03, "expire_on_contact": True},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * 0.07", 3),
        **tint(TIME, f"math.clamp(0.25 + {R4} * 0.3, 0, 1)")})
    proj("tm_shard", "rpg_tm", TIME, f"({R4} < 0.3 ? {SPR} : 0)")
    burst("tm_burst", "rpg_tm", TIME, f"({R4} > 0.6 ? {SPR} : {2 * SPR})")

    # ═════ 심연의 기사: 칠흑 · 짙은 자주 · 핏빛 ═════
    ABYSS = {"0.0": "#FFFF6A8A", "0.15": "#FFB01E5A", "0.35": "#FF5A1478", "0.6": "#FF240A3A", "0.85": "#FF0A0412", "1.0": "#E0000000"}
    sheet("rpg_ab", [soft, disc, eye, diamond])
    # 촉수: u 방향 길이 r, 뿌리 → 끝으로 가늘어짐, 꿈틀(시간에 따라 물결), 자라남(grow 초)
    t = f"math.pow({R1}, 0.85)"
    phase = f"({t} * 260 - {A} * variable.spd * 60 + variable.seed * 40)"
    sway_v = f"(math.sin({phase}) * variable.h * {t})"
    sway_w = f"(math.cos({phase} * 0.7) * variable.h * 0.6 * {t})"
    th = f"(variable.thick * (1 - {t} * 0.85) * ({R2} - 0.5) * 2)"
    th2 = f"(variable.thick * (1 - {t} * 0.85) * ({R3} - 0.5) * 2)"
    grow = f"({A} < variable.dur * {t} ? 0 : 1)"
    part("ab_tendril", "rpg_ab", {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_motion_parametric": {"relative_position": [f"variable.u.{c} * {t} * variable.r + variable.v.{c} * ({sway_v} + {th}) + variable.w.{c} * ({sway_w} + {th2})" for c in "xyz"]},
        "minecraft:particle_appearance_billboard": bb(f"{grow} * variable.size * (0.2 - {t} * 0.12) * (1 - math.pow({AGE}, 3))", f"({R4} > 0.93 ? {2 * SPR} : {SPR})"),
        **tint(ABYSS, f"math.clamp(0.55 + math.abs({R2} - 0.5) * 0.6 - {t} * 0.35 + variable.tone, 0, 1)")})
    # 블랙홀: 바깥에서 소용돌이치며 빨려 들어가기를 되풀이 (u·v 면)
    fr = f"(({R2} + {A} * variable.spd) - math.floor({R2} + {A} * variable.spd))"
    rr = f"(variable.r * (1 - {fr}))"
    aa = f"({R1} * 360 + {A} * variable.spin + {fr} * 300)"
    part("ab_void", "rpg_ab", {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_motion_parametric": {"relative_position": [f"(variable.u.{c} * math.cos({aa}) + variable.v.{c} * math.sin({aa})) * {rr}" for c in "xyz"]},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.1 + (1 - {fr}) * 0.12) * (1 - math.pow({AGE}, 4))", 1),
        **tint(ABYSS, f"math.clamp(0.2 + {fr} * 0.75, 0, 1)")})
    q = R1
    tha = f"(variable.a0 + (variable.a1 - variable.a0) * {q})"
    delay = f"({q} * variable.dur)"
    live = f"math.clamp(({A} - {delay}) / variable.life, 0, 1)"
    part("ab_arc", "rpg_ab", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"(variable.u.{c} * math.cos({tha}) + variable.v.{c} * math.sin({tha})) * (variable.r - variable.thick * {R2} * math.sin({q} * 180))" for c in "xyz"],
                                          "direction": [f"(variable.u.{c} * math.cos({tha}) + variable.v.{c} * math.sin({tha}))" for c in "xyz"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"{delay} + variable.life * (0.6 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"variable.spd * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2.5},
        "minecraft:particle_appearance_billboard": bb(f"{A} < {delay} ? 0 : variable.size * (0.12 + math.sin({q} * 180) * 0.1) * (1 - {live} * 0.85)", f"({R4} > 0.9 ? {2 * SPR} : 0)"),
        **tint(ABYSS, f"math.clamp({R2} * 0.6 + {live} * 0.3 + variable.tone, 0, 1)")})
    part("ab_mist", "rpg_ab", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.4) * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": [f"({R1} - 0.5) * 0.4", f"0.3 + {R2} * 0.5", f"({R3} - 0.5) * 0.4"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.3 + {R4} * 0.5)",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 1.6, "linear_acceleration": [0, 0.3, 0]},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.5 + {R4} * 0.4) * (0.6 + {AGE} * 0.6)", 0),
        **tint(ABYSS, f"math.clamp(0.7 + {AGE} * 0.3, 0, 1)")})
    burst("ab_burst", "rpg_ab", ABYSS, f"({R4} > 0.8 ? {2 * SPR} : {SPR})")

    # ═════ 혼령 인도자: 은빛 · 연두 영혼빛 ═════
    SPIRIT = {"0.0": "#F0FFFFFF", "0.25": "#E0D8FFF0", "0.5": "#D08CF0C8", "0.75": "#B046B494", "1.0": "#60145040"}
    sheet("rpg_sp", [soft, star4, disc, diamond])
    beasts()
    # 짐승 그림: 그림 가로 = u(달리는 방향), 세로 = v(위). 모든 점이 vd 방향 vs 속도로 함께 → 그림째로 달려감, 느린 점은 잔상
    bx, by = f"math.floor({R1} * variable.iw)", f"math.floor({R2} * variable.ih)"
    lx = f"((variable.cx - {bx}) * variable.scale)"  # 그림의 머리(왼쪽)가 앞(u)
    ly = f"((variable.cy - {by}) * variable.scale)"
    lag = f"({R4} * {R4} * {R4} * 0.25)"
    part("sp_beast", "rpg_sp_beasts", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {lx} + variable.v.{c} * {ly} + variable.w.{c} * ({R3} - 0.5) * variable.scale * 3" for c in "xyz"], "direction": ["variable.vd.x", "variable.vd.y", "variable.vd.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_initial_speed": f"variable.vs * (1 - {lag})",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": {"size": [f"variable.scale * 1.5 * variable.size * (1 - math.pow({AGE}, 5))"] * 2, "facing_camera_mode": "lookat_xyz",
                                                    "uv": {"texture_width": 128, "texture_height": 24, "uv": [f"variable.x0 + {bx}", by], "uv_size": [1, 1]}},
        **tint(SPIRIT, f"math.clamp({lag} * 3 + {R4} * 0.15 + variable.tone, 0, 1)")}, material="particles_alpha")
    proj("sp_wisp", "rpg_sp", SPIRIT, 0, tail="0.6")
    part("sp_heal", "rpg_sp", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"{R2} * 0.4", f"({R3} - 0.5) * 2 * variable.r"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.5 + {R4} * 0.5)",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 0.8},
        "minecraft:particle_initial_spin": {"rotation": f"{R1} * 90"},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * 0.13 * (1 - {AGE})", 1),
        **tint(SPIRIT, f"math.clamp(0.2 + {AGE} * 0.5, 0, 1)")})
    burst("sp_burst", "rpg_sp", SPIRIT, f"({R4} > 0.6 ? {SPR} : 0)")
    print("hidden particles ok")


def beasts():
    """혼령 짐승 실루엣 4개 (각 32x24 칸, 왼쪽을 봄): 늑대 · 까마귀 · 사슴 · 곰 → rpg_sp_beasts.png + 메타"""
    W, H, S = 32, 24, 8  # 8배로 그려 줄임
    im = Image.new("RGBA", (W * 4, H), (0, 0, 0, 0))
    def make(i, draw):
        big = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
        d = ImageDraw.Draw(big)
        draw(d, lambda pts: [(x * S, y * S) for x, y in pts])
        small = big.resize((W, H), Image.LANCZOS)
        px = small.load()
        for y in range(H):
            for x in range(W):
                r, g, b, a = px[x, y]
                px[x, y] = (r, g, b, 255) if a > 100 else (0, 0, 0, 0)
        im.paste(small, (i * W, 0))
    WHITE, SH = (255, 255, 255, 255), (170, 190, 185, 255)
    def wolf(d, P):
        d.polygon(P([(2, 9), (5, 6), (7, 3), (8, 6), (11, 7), (22, 7), (27, 9), (31, 7), (30, 11), (26, 12), (26, 18), (27, 22), (24, 22), (23, 15), (14, 15), (13, 22), (10, 22), (11, 15), (8, 13), (4, 12), (1, 11)]), fill=WHITE)
        d.polygon(P([(12, 9), (22, 9), (23, 13), (13, 13)]), fill=SH)
        d.ellipse(P([(4.2, 7.4), (5.4, 8.6)]), fill=(60, 80, 80, 255))
    def crow(d, P):
        d.polygon(P([(1, 12), (5, 10), (9, 10), (14, 4), (24, 1), (18, 8), (22, 10), (31, 11), (24, 14), (16, 14), (12, 18), (10, 14), (5, 13)]), fill=WHITE)
        d.polygon(P([(14, 6), (22, 3), (17, 9)]), fill=SH)
        d.ellipse(P([(5, 10.6), (6.2, 11.8)]), fill=(60, 80, 80, 255))
    def deer(d, P):
        d.line(P([(6, 7), (4, 2), (2, 1)]), fill=WHITE, width=S); d.line(P([(4, 3), (7, 1)]), fill=WHITE, width=S); d.line(P([(7, 7), (9, 2), (11, 1)]), fill=WHITE, width=S)
        d.polygon(P([(2, 10), (5, 7), (8, 8), (10, 10), (24, 9), (28, 10), (28, 15), (27, 23), (25, 23), (24, 16), (13, 16), (12, 23), (10, 23), (10, 15), (8, 12), (3, 12)]), fill=WHITE)
        d.polygon(P([(13, 11), (24, 11), (24, 14), (13, 14)]), fill=SH)
    def bear(d, P):
        d.polygon(P([(1, 12), (3, 8), (6, 6), (7, 4), (9, 6), (14, 4), (24, 4), (30, 8), (31, 14), (30, 23), (26, 23), (25, 17), (14, 17), (13, 23), (8, 23), (9, 15), (5, 14)]), fill=WHITE)
        d.polygon(P([(14, 7), (26, 7), (28, 13), (15, 13)]), fill=SH)
        d.ellipse(P([(3.6, 9), (4.8, 10.2)]), fill=(60, 80, 80, 255))
    for i, fn in enumerate([wolf, crow, deer, bear]):
        make(i, fn)
    im.save(TEXD / "rpg_sp_beasts.png")
    meta = {}
    for i, n in enumerate(["wolf", "crow", "deer", "bear"]):
        cell = im.crop((i * W, 0, i * W + W, H))
        filled = sum(1 for y in range(H) for x in range(W) if cell.getpixel((x, y))[3])
        meta[n] = {"x0": i * W, "iw": W, "ih": H, "cx": W / 2, "cy": H / 2, "filled": filled}
    (ROOT / "behavior_pack" / "scripts" / "sp_meta.js").write_text("// gen_hidden.py 가 만듦: 혼령 짐승 그림 자리\nexport const BEAST = " + json.dumps(meta) + ";\n")


if __name__ == "__main__":
    main()
