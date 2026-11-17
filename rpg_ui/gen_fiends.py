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


VAN_SMK = f"(math.floor({R3} * 4) + 3)"
VAN_DOT = f"(math.floor({R3} * 2) + 6)"


def vanillaize(comps):
    """rpg_hd 시트 → 마크 기본 파티클 시트 (사신수처럼 픽셀 연기 먼지): 0 부드러운 빛 → 연기, 8·16 별·조각 → 작은 점, 24 연기 뭉치 → 연기"""
    import re
    bbd = comps.get("minecraft:particle_appearance_billboard")
    if not bbd or "uv" not in bbd: return comps
    uv = bbd["uv"]
    if uv.get("texture_width") != 32: return comps
    mp = lambda v: {"0": VAN_SMK, "8": VAN_DOT, "16": VAN_DOT, "24": VAN_SMK}.get(str(v).strip(), VAN_SMK)
    u = uv["uv"][0]
    if isinstance(u, str):
        m = re.fullmatch(r"\((.*) \? (\d+) : (\d+)\)", u.strip())
        u = f"({m.group(1)} ? {mp(m.group(2))} : {mp(m.group(3))})" if m else VAN_SMK
    else: u = mp(u)
    bbd["uv"] = {"texture_width": 16, "texture_height": 16, "uv": [u, 0], "uv_size": [1, 1]}
    bbd["size"] = [f"({x}) * 0.6" for x in bbd["size"]]
    return comps


def part(name, tex, comps, material="particles_blend"):
    if tex == "rpg_hd":
        comps = vanillaize(comps); tex = "particles"; material = "particles_alpha"
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
def puff(d, s, c):  # 연기 뭉치 (사신수처럼 연기 위주)
    rnd = random.Random(9)
    for _ in range(10):
        x, y, r = c + rnd.uniform(-13, 13), c + rnd.uniform(-11, 11), rnd.uniform(10, 18)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, 120))
    s.paste(s.filter(ImageFilter.GaussianBlur(4)))
def tooth(d, s, c): d.polygon([(c - 12, 6), (c + 12, 6), (c, 60)], fill=(255, 255, 255, 255))


def burst(name, tex, grad, sprite, up="0.3", grav=0, cycle=False):
    interp = f"{frac(f'{R4} + {A} * 2.2')}" if cycle else f"math.clamp({AGE} * 0.7 + {R4} * 0.2 + variable.tone, 0, 1)"
    part(name, tex, {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": [f"({R1} - 0.5)", f"({R2} - 0.5) + {up}", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.4 + {R4} * 0.8)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, grav, 0], "linear_drag_coefficient": 2.4},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.18 + {R4} * 0.22) * (0.8 + {AGE} * 0.4) * (1 - {AGE} * 0.6)", sprite),
        **tint(grad, interp)})


def frac(x):
    return f"(({x}) - math.floor({x}))"


def main():
    # ═════ 혼돈: 색이 계속 바뀜 (빨 → 주 → 노 → 초 → 파 → 보 → 빨) ═════
    PRISM = {"0.0": "#FFFF3A6A", "0.17": "#FFFF9A2A", "0.33": "#FFF6F04A", "0.5": "#FF4AF09A", "0.67": "#FF3A9AFF", "0.83": "#FFB04AFF", "1.0": "#FFFF3A6A"}
    # (혼돈은 마크 기본 파티클 시트 사용 — vanillaize)
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
    burst("hd_burst", "rpg_hd", PRISM, f"({R4} > 0.6 ? {SPR} : {3 * SPR})", cycle=True)
    # 연기 낫: 조각(ox, oy, tw, th) 안의 그림 점 하나 = 그 색 연기 뭉치. 쥐는 곳(cx, cy) 축으로 rot(+spin·시간) 돌린 모양으로 u·v 면에 놓이고,
    #   연기처럼 살짝 흩어지며(제자리 흔들림 + 위로 떠오름) 부풀었다 옅어짐. vd·vs 로 통째로 이동. tone 1 = 보랏빛 잔상색
    global SC_W, SC_H
    _, SC_W, SC_H = scythe_art()
    sbx, sby = f"(variable.ox + math.floor({R1} * variable.tw))", f"(variable.oy + math.floor({R2} * variable.th))"
    slx, sly = f"(({sbx} + 0.5 - variable.cx) * variable.scale)", f"((variable.cy - {sby} - 0.5) * variable.scale)"
    SB = f"(variable.rot + variable.spin * {A})"
    drift = lambda c, k: f"({R3} - 0.5) * 0.5 * {AGE} * variable.scale * 12 * ({k})"
    part("hd_scythe", "rpg_hd_scythe_smoke", {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.75 + {R4} * 0.5)"},
        "minecraft:particle_motion_parametric": {"relative_position": [
            f"variable.vd.{c} * variable.vs * {A} + variable.u.{c} * ({slx} * math.cos({SB}) - {sly} * math.sin({SB})) + variable.v.{c} * ({slx} * math.sin({SB}) + {sly} * math.cos({SB}))"
            + f" + {drift(c, '1' if c != 'y' else '0.4')}" + (f" + {AGE} * {R4} * 0.5" if c == "y" else "") for c in "xyz"]},
        "minecraft:particle_appearance_billboard": {"size": [f"variable.scale * variable.size * (1.5 + {AGE} * 1.6) * (1 - math.pow({AGE}, 4))"] * 2, "facing_camera_mode": "lookat_xyz",
                                                    "uv": {"texture_width": SC_W * 8, "texture_height": SC_H * 8, "uv": [f"{sbx} * 8", f"{sby} * 8"], "uv_size": [8, 8]}},
        "minecraft:particle_appearance_tinting": {"color": [f"1 - variable.tone * 0.25", f"1 - variable.tone * 0.6", "1", f"variable.a * (1 - math.pow({AGE}, 2) * 0.8)"]},
    }, material="particles_blend")
    # 보랏빛 불꽃 (그림의 불길처럼: 흰 보라 → 보라 → 짙은 보라, 붉은 기 섞임), 위로 일렁이며 피어오름
    FLAME = {"0.0": "#FFF6E0FF", "0.2": "#FFC888FF", "0.42": "#FF9A3CF0", "0.6": "#FF6A1AB8", "0.75": "#FFB0204A", "0.88": "#FF3A0A5A", "1.0": "#A0100418"}
    part("hd_flame", "rpg_hd", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": [f"({R1} - 0.5) * 0.6 + variable.vd.x", f"0.8 + {R2} * 0.6 + variable.vd.y", f"({R3} - 0.5) * 0.6 + variable.vd.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.4 + {R4} * 0.7)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 1.6, 0], "linear_drag_coefficient": 1.8},
        # 60% 는 연기 뭉치(크게, 천천히 부풂), 나머지는 불티
        "minecraft:particle_appearance_billboard": bb(f"variable.size * ({R4} < 0.6 ? (0.42 + {R4} * 0.35) * (0.6 + {AGE} * 0.7) : (0.14 + {R4} * 0.1) * (1 - {AGE} * 0.8))", f"({R4} < 0.6 ? {3 * SPR} : 0)"),
        **tint(FLAME, f"math.clamp({AGE} * 0.75 + {R2} * 0.2 + ({R4} < 0.6 ? 0.18 : 0) + variable.tone, 0, 1)")})
    # 낫 줄(그네 · 감기): u 방향 길이 r, 보랏빛 연기 줄 + 일렁임
    part("hd_line", "rpg_hd", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {R1} * variable.r + ({R2} - 0.5) * 0.12" for c in "xyz"], "direction": [f"({R3} - 0.5)", 0.3, f"({R2} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"0.4 * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * ({R4} < 0.35 ? 0.26 : 0.1) * (1 - {AGE} * 0.6)", f"({R4} < 0.35 ? {3 * SPR} : 0)"),
        **tint(FLAME, f"math.clamp(0.25 + {R2} * 0.3 + {AGE} * 0.3, 0, 1)")})
    # 보랏빛 낫 호 (불꽃 잔영이 뒤로 흩날림)
    sq = R1
    sth = f"(variable.a0 + (variable.a1 - variable.a0) * {sq})"
    sdl = f"({sq} * variable.dur)"
    slive = f"math.clamp(({A} - {sdl}) / variable.life, 0, 1)"
    part("hd_arc", "rpg_hd", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"(variable.u.{c} * math.cos({sth}) + variable.v.{c} * math.sin({sth})) * (variable.r - variable.h * {R2} * math.sin({sq} * 180))" for c in "xyz"],
                                          "direction": [f"(variable.u.{c} * math.sin({sth}) - variable.v.{c} * math.cos({sth})) * (variable.a1 > variable.a0 ? 1 : -1)" for c in "xyz"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"{sdl} + variable.life * (0.6 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"variable.spd * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2.2, "linear_acceleration": [0, 1, 0]},
        "minecraft:particle_appearance_billboard": bb(f"{A} < {sdl} ? 0 : variable.size * ({R4} < 0.5 ? (0.3 + math.sin({sq} * 180) * 0.2) * (0.7 + {slive} * 0.6) : (0.12 + math.sin({sq} * 180) * 0.12) * (1 - {slive} * 0.85))", f"({R4} < 0.5 ? {3 * SPR} : 0)"),
        **tint(FLAME, f"math.clamp({R2} * 0.45 + {slive} * 0.35 + variable.tone, 0, 1)")})
    part("hd_ghost", "rpg_hd", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 0.7", f"{R2} * 1.8", f"({R3} - 0.5) * 0.7"], "direction": [f"({R1} - 0.5)", 0.2, f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"0.3 * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * 0.16 * (1 - {AGE})", 0),
        **tint(PRISM, frac(f"{R2} * 0.5 + {A} * 2"))})

    # ═════ 혼돈 입체 기동 (V12.2) — 마크 기본 파티클(픽셀 연기 먼지) 기반, 사신수처럼 ═════
    # 강철 줄 · 줄 불티 · 가스 분사 · 속도선 · 회오리 원반 · 회오리 기둥 · 낙뢰 · 충격파
    def vb(size, cell, mode="lookat_xyz", extra=None, w=None):
        d = {"size": [w or size, size], "facing_camera_mode": mode,
             "uv": {"texture_width": 16, "texture_height": 16, "uv": [cell, 0], "uv_size": [1, 1]}}
        if extra: d.update(extra)
        return d
    def vpart(name, comps): part(name, "particles", comps, material="particles_alpha")
    SMK = f"(math.floor({R3} * 4) + 3)"   # 기본 연기 먼지 (작은 칸들)
    DOT = f"(math.floor({R3} * 2) + 6)"   # 가장 작은 픽셀 점
    VEL = {"direction": {"mode": "derive_from_velocity", "min_speed_threshold": 0.01}}
    WIRE = {"0.0": "#FFFFFFFF", "0.4": "#FFE6D8FF", "0.75": "#FFB08AE0", "1.0": "#FF5A3A8A"}
    GAS = {"0.0": "#FFFFFFFF", "0.25": "#FFE0E6F0", "0.55": "#FFB4A8D8", "0.8": "#FF7A5AA8", "1.0": "#FF3A2A5A"}
    # 3D 쇠사슬: 길이 r 을 variable.h 개의 고리로 나눔, 고리는 u 방향으로 긴 타원, 짝수 고리는 v 평면 / 홀수 고리는 w 평면 (서로 90°)
    #   위쪽(밝음) → 아래쪽(어두움) 음영으로 입체감, 고리마다 살짝 겹침
    LK = f"math.floor({R1} * variable.h)"
    LT = f"(({LK} + 0.5) / variable.h * variable.r)"
    LA = f"({R2} * 360)"
    SIDE = lambda c: f"(math.mod({LK}, 2) < 1 ? variable.v.{c} : variable.w.{c})"
    LHL = "(variable.r / variable.h * 0.62)"
    CHAIN = {"0.0": "#FFFFFFFF", "0.3": "#FFD8D4E8", "0.55": "#FF9A92B8", "0.8": "#FF5A4A7A", "1.0": "#FF2A1E3A"}
    vpart("hd_wire", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * ({LT} + math.cos({LA}) * {LHL}) + {SIDE(c)} * math.sin({LA}) * {LHL} * 0.5 * variable.size" for c in "xyz"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_appearance_billboard": vb("variable.size * 0.055", DOT),
        **tint(CHAIN, f"math.clamp(0.5 - math.sin({LA}) * 0.45 * (math.mod({LK}, 2) < 1 ? 1 : 0.6) + {R3} * 0.1, 0, 1)")})
    # 줄을 타고 감겨 오는 불티 (u 방향으로 스스로 이동)
    vpart("hd_reelspark", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {R1} * variable.r * 0.5" for c in "xyz"], "direction": ["variable.u.x", "variable.u.y", "variable.u.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.7 + {R4} * 0.5)",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": vb("variable.size * 0.09", 7),
        **tint(FLAME, f"math.clamp({R2} * 0.3, 0, 1)")})
    # 가스 분사: 기본 연기 먼지가 뿜어진 뒤 빠르게 느려지며 부풀고 옅어짐
    vpart("hd_gas", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"],
                                          "direction": [f"variable.vd.x + ({R1} - 0.5) * 0.5", f"variable.vd.y + ({R2} - 0.5) * 0.5", f"variable.vd.z + ({R3} - 0.5) * 0.5"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.6 + {R4} * 0.6)",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 3.2, "linear_acceleration": [0, 0.5, 0]},
        "minecraft:particle_appearance_billboard": vb(f"variable.size * (0.1 + {R4} * 0.08) * (0.7 + math.sqrt({AGE}) * 1.2)", SMK),
        **tint(GAS, f"math.clamp({AGE} * 0.9 + {R2} * 0.1 + variable.tone, 0, 1)")})
    # 속도선: 몸 둘레에서 뒤로 스쳐 가는 가는 픽셀 선
    vpart("hd_speed", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"(variable.u.{c} * math.cos({R1} * 360) + variable.v.{c} * math.sin({R1} * 360)) * variable.r * (0.6 + {R2} * 0.6) + variable.vd.{c} * ({R3} - 0.3) * 3" for c in "xyz"],
                                          "direction": [f"-variable.vd.{c}" for c in "xyz"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": "variable.spd",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": vb(f"variable.size * (0.7 + {R4} * 0.8) * (1 - {AGE})", 7, "lookat_direction", VEL, "variable.size * 0.035"),
        **tint(WIRE, f"0.1 + {AGE} * 0.7")})
    # 회오리 원반: u·v 평면에 세 갈래 나선 팔(연기 먼지)이 빠르게 돌며 퍼짐 (vd 쪽으로 이동)
    arm = f"(math.floor({R2} * 3) * 120 + {R1} * 220 + {A} * variable.spin)"
    rr = f"(variable.r * (0.25 + {R1} * 0.75) * (0.55 + {AGE} * 0.7))"
    vpart("hd_swirl", {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.75 + {R4} * 0.35)"},
        "minecraft:particle_motion_parametric": {"relative_position": [f"(variable.u.{c} * math.cos({arm}) + variable.v.{c} * math.sin({arm})) * {rr} + variable.vd.{c} * variable.vs * {A}" for c in "xyz"]},
        "minecraft:particle_appearance_billboard": vb(f"variable.size * ({R4} < 0.55 ? 0.17 : 0.08) * (0.6 + {R1} * 0.6) * (1 - {AGE} * 0.6)", f"({R4} < 0.55 ? {SMK} : {DOT})"),
        **tint(GAS, f"math.clamp({R1} * 0.45 + {AGE} * 0.5, 0, 1)")})
    # 회오리 기둥: 세 갈래 나선이 축(vd)을 따라 감기며 돎 (부피감)
    arm2 = f"(math.floor({R2} * 3) * 120 + {R1} * 300 + {A} * variable.spin)"
    rad_ = f"(variable.r * (0.35 + {R1} * 0.65))"
    vpart("hd_vortex", {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.4)"},
        "minecraft:particle_motion_parametric": {"relative_position": [f"(variable.u.{c} * math.cos({arm2}) + variable.v.{c} * math.sin({arm2})) * {rad_} * (1 + {AGE} * 0.5) + variable.vd.{c} * ({R1} - 0.5) * variable.h" for c in "xyz"]},
        "minecraft:particle_appearance_billboard": vb(f"variable.size * ({R4} < 0.5 ? 0.15 : 0.07) * (1 - {AGE} * 0.7)", f"({R4} < 0.5 ? {SMK} : {DOT})"),
        **tint(GAS, f"math.clamp({AGE} * 0.8 + {R3} * 0.2, 0, 1)")})
    # 낙뢰: vd 방향 길이 r 의 지그재그 번개 (8마디, variable.tone = 모양 씨앗), 픽셀 점으로 깜빡임
    tt = R1
    k = f"math.floor({tt} * 8)"
    fr = f"({tt} * 8 - {k})"
    hz = lambda kk, sd: f"math.sin(({kk}) * 127.1 + variable.tone * 311.7 + {sd})"
    jag = lambda sd: f"({hz(k, sd)} * (1 - {fr}) + {hz(f'{k} + 1', sd)} * {fr}) * variable.h * math.sin({tt} * 180 + 20)"
    vpart("hd_bolt", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.vd.{c} * {tt} * variable.r + variable.u.{c} * {jag(0)} + variable.v.{c} * {jag(57)}" for c in "xyz"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.4)"},
        "minecraft:particle_appearance_billboard": vb(f"variable.size * ({R4} < 0.2 ? 0.16 : 0.08) * (math.sin({A} * 2400) > -0.3 ? 1 : 0.3) * (1 - {AGE} * 0.5)", f"({R4} < 0.2 ? {SMK} : {DOT})"),
        **tint({"0.0": "#FFFFFFFF", "0.35": "#FFE8C8FF", "0.7": "#FFA040FF", "1.0": "#FF4A1A9A"}, f"math.clamp({R4} * 0.5 + {AGE} * 0.6, 0, 1)")})
    # 땅 충격파: 바닥에 누운 연기 먼지 고리가 퍼지며 바깥 테가 밝음
    ang = f"({R1} * 360)"
    ring = f"(variable.r * (0.15 + math.sqrt({AGE}) * 0.85) * ({R2} < 0.6 ? 1 : 0.75 + {R3} * 0.2))"
    vpart("hd_shock", {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.3)"},
        "minecraft:particle_motion_parametric": {"relative_position": [f"math.cos({ang}) * {ring}", f"{AGE} * ({R4} * 0.6)", f"math.sin({ang}) * {ring}"]},
        "minecraft:particle_appearance_billboard": vb(f"variable.size * ({R2} < 0.6 ? 0.2 : 0.12) * (1 - {AGE} * 0.5)", SMK),
        **tint(GAS, f"math.clamp(({R2} < 0.6 ? 0 : 0.35) + {AGE} * 0.65, 0, 1)")})

    # ═════ 궁기: 핏빛 · 검정 깃털 ═════
    CRIM = {"0.0": "#FFFFE0E0", "0.18": "#FFFF6A6A", "0.4": "#FFD01A2A", "0.65": "#FF6A0A18", "0.85": "#FF200408", "1.0": "#E0000000"}
    sheet("rpg_qq", [soft, feather, shard, puff])
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
    burst("qq_burst", "rpg_qq", CRIM, f"({R4} > 0.5 ? {SPR} : {3 * SPR})", grav=-2)

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
    sheet("rpg_tt", [soft, tooth, shard, puff])
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
    burst("tt_burst", "rpg_tt", TT, f"({R4} > 0.6 ? {2 * SPR} : {3 * SPR})")
    items()
    print("fiends particles + items ok")


def scythe_art():
    """혼돈의 낫 (사용자 그림 art/hundun_scythe_ref.jpg): 흰 배경 제거 → 아이콘 32x32 + 파티클용 그림(rpg_hd_scythe) + 메타"""
    from collections import deque
    im = Image.open(ROOT / "art" / "hundun_scythe_ref.jpg").convert("RGBA")
    im = im.crop((8, 8, im.size[0] - 8, im.size[1] - 8))
    W, H = im.size
    px = im.load()
    seen = bytearray(W * H)
    q = deque([(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] + [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)])
    while q:
        x, y = q.popleft()
        i = y * W + x
        if seen[i]:
            continue
        seen[i] = 1
        r, g, b, a = px[x, y]
        if min(r, g, b) < 225:
            continue
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]:
                q.append((nx, ny))
    # 둘러싸인 안쪽 흰 구멍(자루와 불길 사이)도 지움: 그림엔 흰색이 거의 없음
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a and min(r, g, b) > 200 and max(r, g, b) - min(r, g, b) < 30:
                px[x, y] = (0, 0, 0, 0)
    bbox = im.getbbox(); im = im.crop(bbox)
    def shrink(w):
        h = round(im.size[1] * w / im.size[0])
        sm = im.resize((w, h), Image.LANCZOS)
        p2 = sm.load()
        for y in range(h):
            for x in range(w):
                r, g, b, a = p2[x, y]
                p2[x, y] = (r, g, b, 255) if a > 120 else (0, 0, 0, 0)
        return sm
    ic = shrink(30)
    icon = Image.new("RGBA", (32, 32), (0, 0, 0, 0)); icon.paste(ic, ((32 - ic.size[0]) // 2, (32 - ic.size[1]) // 2), ic)
    art = shrink(52)
    art.save(TEXD / "rpg_hd_scythe.png")
    # 연기 낫: 그림 한 점(픽셀) = 그 색의 작은 연기 뭉치(8x8, 가장자리 투명 · 위쪽 밝게) → rpg_hd_scythe_smoke.png
    aw, ah = art.size
    sm = Image.new("RGBA", (aw * 8, ah * 8), (0, 0, 0, 0)); ps = sm.load(); pa = art.load()
    PUFF = ["..####..", ".######.", "########", "########", "########", "########", ".######.", "..####.."]
    for y in range(ah):
        for x in range(aw):
            r, g, b2, a2 = pa[x, y]
            if not a2: continue
            for j in range(8):
                for i in range(8):
                    if PUFF[j][i] != "#": continue
                    k = 1.18 - j * 0.05 - (0.08 if (i + j) % 3 == 0 else 0)  # 위 밝고 아래 어둡게 + 점무늬
                    ps[x * 8 + i, y * 8 + j] = (min(255, int(r * k)), min(255, int(g * k)), min(255, int(b2 * k)), 255)
    sm.save(TEXD / "rpg_hd_scythe_smoke.png")
    iw, ih = art.size
    filled = sum(1 for y in range(ih) for x in range(iw) if art.getpixel((x, y))[3])
    # 돌리는 중심: 자루 가운데쯤 (그림 비율 0.45, 0.58)
    # 빈칸 낭비를 줄이려고 그림을 10x10 조각으로 나눠, 칠해진 조각만 [ox, oy, w, h, 칠한 수] 로 기록 → 조각마다 따로 뿌림
    tiles = []
    for oy in range(0, ih, 10):
        for ox in range(0, iw, 10):
            w, h = min(10, iw - ox), min(10, ih - oy)
            cnt = sum(1 for y in range(oy, oy + h) for x in range(ox, ox + w) if art.getpixel((x, y))[3])
            if cnt: tiles.append([ox, oy, w, h, cnt])
    (ROOT / "behavior_pack" / "scripts" / "hd_meta.js").write_text(f"// gen_fiends.py 가 만듦: 혼돈의 낫 그림 (연기 낫 조각)\nexport const SCYTHE = {{ iw: {iw}, ih: {ih}, cx: {iw * 0.45:.1f}, cy: {ih * 0.58:.1f}, filled: {filled}, tiles: {json.dumps(tiles)} }};\n")
    return icon, iw, ih


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
    for iid, kind, name, dmg in [("hundun_scythe", "scythe", "§5§l혼돈의 낫", 9), ("qiongqi_claws", "claws", "§c§l궁기의 쌍발톱", 9), ("taowu_hammer", "hammer", "§6§l도올의 대망치", 10), ("taotie_maw", "maw", "§2§l도철의 아가리", 8)]:
        (scythe_art()[0] if kind == "scythe" else icon(kind)).save(ROOT / "resource_pack" / "textures" / "items" / "rpg" / f"{iid}.png")
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
