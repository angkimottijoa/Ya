"""흑룡의 검 파티클 (V12.146) — 검정 · 진홍 (흑염 · 붉은 번개) / 마크 기본 파티클 시트(픽셀 연기 · 점) 기반
  hr_wire 3D 쇠사슬 · hr_reelspark 사슬 불티 · hr_speed 속도선 · hr_swirl 회오리 원반 · hr_flame 흑염
  hr_arc 베기 호 · hr_burst 폭발 · hr_slash 곧은 베기 자국(앞에서 뒤로 그어짐) · hr_wing 스스로 퍼덕이는 용 날개(뼈 + 막)
  hr_dragon 몸을 꿈틀대며 날아가는 흑룡 형상 · hr_shock 땅 충격파
"""
import json
from pathlib import Path
ROOT = Path(__file__).parent
OUT = ROOT / "resource_pack" / "particles"
AGE = "(variable.particle_age / variable.particle_lifetime)"
A = "variable.particle_age"
R1, R2, R3, R4 = (f"variable.particle_random_{i}" for i in (1, 2, 3, 4))
SMK = f"(math.floor({R3} * 4) + 3)"   # 기본 연기 먼지
DOT = f"(math.floor({R3} * 2) + 6)"   # 작은 픽셀 점
VEL = {"direction": {"mode": "derive_from_velocity", "min_speed_threshold": 0.01}}

def part(name, comps):
    d = {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": f"rpg:{name}", "basic_render_parameters": {"material": "particles_alpha", "texture": "textures/particle/particles"}},
        "components": comps}}
    (OUT / f"rpg_{name}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1))
def once(): return {"minecraft:emitter_rate_instant": {"num_particles": "variable.n"}, "minecraft:emitter_lifetime_once": {"active_time": 0.05}}
def vb(size, cell, mode="lookat_xyz", extra=None, w=None):
    d = {"size": [w or size, size], "facing_camera_mode": mode, "uv": {"texture_width": 16, "texture_height": 16, "uv": [cell, 0], "uv_size": [1, 1]}}
    if extra: d.update(extra)
    return d
def tint(grad, interp): return {"minecraft:particle_appearance_tinting": {"color": {"interpolant": interp, "gradient": grad}}}

FIRE = {"0.0": "#FFFFE6D8", "0.15": "#FFFF7A5A", "0.33": "#FFE0202E", "0.52": "#FF7A0A16", "0.72": "#FF22060A", "0.88": "#FF0A0204", "1.0": "#C0000000"}  # 흑염: 흰 → 진홍 → 검정
EMBER = {"0.0": "#FFFFF0E0", "0.3": "#FFFF6A50", "0.6": "#FFC01020", "1.0": "#FF300408"}
CHAIN = {"0.0": "#FFF0D8DC", "0.3": "#FFA88A92", "0.55": "#FF5E3A44", "0.8": "#FF2E1218", "1.0": "#FF100406"}
BOLT = {"0.0": "#FFFFFFFF", "0.3": "#FFFFB0A0", "0.65": "#FFFF2A2A", "1.0": "#FF5A0410"}

def main():
    # 3D 쇠사슬 (hd_wire 와 같은 모양, 검은 강철 · 진홍 음영)
    LK = f"math.floor({R1} * variable.h)"; LT = f"(({LK} + 0.5) / variable.h * variable.r)"; LA = f"({R2} * 360)"
    SIDE = lambda c: f"(math.mod({LK}, 2) < 1 ? variable.v.{c} : variable.w.{c})"; LHL = "(variable.r / variable.h * 0.62)"
    part("hr_wire", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * ({LT} + math.cos({LA}) * {LHL}) + {SIDE(c)} * math.sin({LA}) * {LHL} * 0.5 * variable.size" for c in "xyz"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_appearance_billboard": vb("variable.size * 0.058", DOT),
        **tint(CHAIN, f"math.clamp(0.5 - math.sin({LA}) * 0.45 * (math.mod({LK}, 2) < 1 ? 1 : 0.6) + {R3} * 0.1, 0, 1)")})
    part("hr_reelspark", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {R1} * variable.r * 0.5" for c in "xyz"], "direction": ["variable.u.x", "variable.u.y", "variable.u.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.7 + {R4} * 0.5)",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": vb("variable.size * 0.09", 7),
        **tint(EMBER, f"math.clamp({R2} * 0.4, 0, 1)")})
    part("hr_speed", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"(variable.u.{c} * math.cos({R1} * 360) + variable.v.{c} * math.sin({R1} * 360)) * variable.r * (0.6 + {R2} * 0.6) + variable.vd.{c} * ({R3} - 0.3) * 3" for c in "xyz"],
                                          "direction": [f"-variable.vd.{c}" for c in "xyz"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": "variable.spd",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": vb(f"variable.size * (0.7 + {R4} * 0.8) * (1 - {AGE})", 7, "lookat_direction", VEL, "variable.size * 0.035"),
        **tint(BOLT, f"0.15 + {AGE} * 0.8")})
    arm = f"(math.floor({R2} * 3) * 120 + {R1} * 220 + {A} * variable.spin)"
    rr = f"(variable.r * (0.25 + {R1} * 0.75) * (0.55 + {AGE} * 0.7))"
    part("hr_swirl", {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.75 + {R4} * 0.35)"},
        "minecraft:particle_motion_parametric": {"relative_position": [f"(variable.u.{c} * math.cos({arm}) + variable.v.{c} * math.sin({arm})) * {rr} + variable.vd.{c} * variable.vs * {A}" for c in "xyz"]},
        "minecraft:particle_appearance_billboard": vb(f"variable.size * ({R4} < 0.55 ? 0.17 : 0.08) * (0.6 + {R1} * 0.6) * (1 - {AGE} * 0.6)", f"({R4} < 0.55 ? {SMK} : {DOT})"),
        **tint(FIRE, f"math.clamp(0.2 + {R1} * 0.35 + {AGE} * 0.45, 0, 1)")})
    # 흑염: 위로 일렁이며 피어오르는 검은 불 (불티는 진홍)
    part("hr_flame", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": [f"({R1} - 0.5) * 0.6 + variable.vd.x", f"0.8 + {R2} * 0.6 + variable.vd.y", f"({R3} - 0.5) * 0.6 + variable.vd.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.4 + {R4} * 0.7)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 1.6, 0], "linear_drag_coefficient": 1.8},
        "minecraft:particle_appearance_billboard": vb(f"variable.size * ({R4} < 0.6 ? (0.2 + {R4} * 0.16) * (0.6 + {AGE} * 0.7) : (0.07 + {R4} * 0.05) * (1 - {AGE} * 0.8))", f"({R4} < 0.6 ? {SMK} : {DOT})"),
        **tint(FIRE, f"math.clamp({AGE} * 0.6 + {R2} * 0.15 + ({R4} < 0.6 ? 0.35 : 0.05) + variable.tone, 0, 1)")})
    # 베기 호 (앞쪽 끝이 밝고 잔영은 검게 흩날림)
    sq = R1; sth = f"(variable.a0 + (variable.a1 - variable.a0) * {sq})"; sdl = f"({sq} * variable.dur)"; slive = f"math.clamp(({A} - {sdl}) / variable.life, 0, 1)"
    part("hr_arc", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"(variable.u.{c} * math.cos({sth}) + variable.v.{c} * math.sin({sth})) * (variable.r - variable.h * {R2} * math.sin({sq} * 180))" for c in "xyz"],
                                          "direction": [f"(variable.u.{c} * math.sin({sth}) - variable.v.{c} * math.cos({sth})) * (variable.a1 > variable.a0 ? 1 : -1)" for c in "xyz"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"{sdl} + variable.life * (0.6 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"variable.spd * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2.2, "linear_acceleration": [0, 0.6, 0]},
        "minecraft:particle_appearance_billboard": vb(f"{A} < {sdl} ? 0 : variable.size * ({R4} < 0.5 ? (0.16 + math.sin({sq} * 180) * 0.1) * (0.7 + {slive} * 0.6) : (0.06 + math.sin({sq} * 180) * 0.06) * (1 - {slive} * 0.85))", f"({R4} < 0.5 ? {SMK} : {DOT})"),
        **tint(FIRE, f"math.clamp({R2} * 0.3 + {slive} * 0.55 + variable.tone, 0, 1)")})
    part("hr_burst", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": [f"({R1} - 0.5)", f"({R2} - 0.5) + 0.3", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.4 + {R4} * 0.8)",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2.4},
        "minecraft:particle_appearance_billboard": vb(f"variable.size * ({R4} < 0.5 ? 0.18 : 0.08) * (1 - {AGE} * 0.6)", f"({R4} < 0.5 ? {SMK} : {DOT})"),
        **tint(FIRE, f"math.clamp({AGE} * 0.7 + {R4} * 0.2 + variable.tone, 0, 1)")})
    # 곧은 베기 자국: u 방향 길이 r, 앞(0)에서 뒤(r)로 dur 초 동안 그어지고 v 방향 얇은 폭, 가운데 흰 심
    ls = f"({R1} * variable.r)"; ldl = f"({R1} * variable.dur)"; llive = f"math.clamp(({A} - {ldl}) / variable.life, 0, 1)"
    part("hr_slash", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {ls} + variable.v.{c} * ({R2} - 0.5) * variable.h * math.sin({R1} * 180)" for c in "xyz"],
                                          "direction": [f"variable.v.{c} * ({R2} - 0.5) + variable.w.{c} * ({R3} - 0.5)" for c in "xyz"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"{ldl} + variable.life * (0.6 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"variable.spd * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 3},
        "minecraft:particle_appearance_billboard": vb(f"{A} < {ldl} ? 0 : variable.size * (math.abs({R2} - 0.5) < 0.12 ? 0.1 : 0.15) * (1 - {llive} * 0.8)", f"(math.abs({R2} - 0.5) < 0.12 ? {DOT} : {SMK})"),
        **tint(FIRE, f"math.clamp((math.abs({R2} - 0.5) < 0.12 ? 0 : 0.3) + {llive} * 0.6, 0, 1)")})
    # 용 날개 (박쥐형): 어깨 S → 손목 Wr 팔뼈, 손목에서 손가락 뼈 넷이 부채꼴, 손가락 사이 막(가장자리는 물결 모양으로 파임) + 몸 쪽 막
    #   u = 바깥, v = 위, w = 뒤 / 날개 전체가 어깨를 축으로 퍼덕임(spin, a0 = 위상) / 끝으로 갈수록 살짝 뒤로 젖힘
    import math as _m
    Wr = (0.55, 0.45)
    tips = [(Wr[0] + L * _m.cos(_m.radians(t)), Wr[1] + L * _m.sin(_m.radians(t))) for t, L in ((20, 0.8), (-15, 0.85), (-50, 0.72), (-88, 0.6))]
    Bp, Sp = (0.12, -0.42), (0.0, 0.0)
    def sel(idx, vals):
        e = f"{vals[-1]}"
        for k in range(len(vals) - 2, -1, -1): e = f"({idx} < {k + 1} ? {vals[k]} : {e})"
        return e
    bi = f"math.floor({R1} * 5)"   # 뼈 0 = 팔, 1~4 = 손가락
    BA = [Sp] + [Wr] * 4; BB = [Wr] + tips
    bx = f"({sel(bi, [p[0] for p in BA])} + ({sel(bi, [p[0] for p in BB])} - {sel(bi, [p[0] for p in BA])}) * {R3})"
    by = f"({sel(bi, [p[1] for p in BA])} + ({sel(bi, [p[1] for p in BB])} - {sel(bi, [p[1] for p in BA])}) * {R3})"
    mi = f"math.floor({R1} * 5)"   # 막 0~3 = 손가락 사이 / 손목-끝-몸, 4 = 손목-몸-어깨
    P1 = tips + [Bp]; P2 = tips[1:] + [Bp, Sp]
    sc = f"({mi} < 4 ? (1 - math.sin({R4} * 180) * 0.24) : 1)"
    tt = f"math.sqrt({R3})"
    mx = f"({Wr[0]} + ({sel(mi, [p[0] for p in P1])} * (1 - {R4}) + {sel(mi, [p[0] for p in P2])} * {R4} - {Wr[0]}) * {tt} * {sc})"
    my = f"({Wr[1]} + ({sel(mi, [p[1] for p in P1])} * (1 - {R4}) + {sel(mi, [p[1] for p in P2])} * {R4} - {Wr[1]}) * {tt} * {sc})"
    isb = f"({R2} < 0.26)"
    X0, Y0 = f"({isb} ? {bx} : {mx})", f"({isb} ? {by} : {my})"
    fl = f"(math.sin({A} * variable.spin + variable.a0) * 24)"
    X = f"(({X0} * math.cos({fl}) - {Y0} * math.sin({fl})) * variable.r)"
    Y = f"(({X0} * math.sin({fl}) + {Y0} * math.cos({fl})) * variable.r)"
    part("hr_wing", {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_motion_parametric": {"relative_position": [f"variable.u.{c} * {X} + variable.v.{c} * {Y} + variable.w.{c} * {X0} * {X0} * 0.28 * variable.r" for c in "xyz"]},
        "minecraft:particle_appearance_billboard": vb(f"variable.size * ({isb} ? 0.085 : 0.115) * (1 - math.pow({AGE}, 4))", f"({isb} ? {DOT} : {SMK})"),
        **tint({"0.0": "#FF8A7A86", "0.2": "#FF2A1E26", "0.45": "#FF3A0610", "0.75": "#FF9A1020", "1.0": "#FFFF4A40"},
               f"({isb} ? 0.1 + {R3} * 0.12 : math.clamp(0.4 + {tt} * 0.45 + ({tt} > 0.92 ? 0.15 : 0), 0, 1))")})
    # 흑룡 형상: 머리(s=0)에서 꼬리(s=1)까지 꿈틀대는 몸 (vd 방향으로 길이 r, u·v 로 물결), 통째로 vd 쪽으로 vs 속도로 날아감
    s = R1
    wav = lambda ph: f"math.sin({s} * 540 - {A} * variable.spin + {ph})"
    thick = f"(variable.h * (1 - {s} * 0.8) * ({s} < 0.06 ? 1.6 : 1))"
    ring = f"({R2} * 360)"
    pos = [f"variable.vd.{c} * ({s} * variable.r * -1 + variable.vs * {A}) + variable.u.{c} * ({wav(0)} * variable.r * 0.09 + math.cos({ring}) * {thick} * {R3}) + variable.v.{c} * ({wav(90)} * variable.r * 0.05 + math.sin({ring}) * {thick} * {R3})" for c in "xyz"]
    part("hr_dragon", {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.85 + {R4} * 0.3)"},
        "minecraft:particle_motion_parametric": {"relative_position": pos},
        "minecraft:particle_appearance_billboard": vb(f"variable.size * ({s} < 0.05 && {R3} > 0.75 ? 0.14 : ({R3} > 0.8 ? 0.16 : 0.12)) * (1 - math.pow({AGE}, 3)) * math.min(1, {A} * 8)", f"({R3} > 0.8 ? {DOT} : {SMK})"),
        **tint({"0.0": "#FFFF3A2A", "0.3": "#FFB01020", "0.55": "#FF2A060C", "0.8": "#FF0E0306", "1.0": "#FF040102"},
               f"({s} < 0.05 && {R3} > 0.75 ? 0 : math.clamp(0.4 + (1 - {R3}) * 0.5 - ({R3} > 0.8 ? 0.35 : 0), 0, 1))")})
    a = f"({R1} * 360)"; rg = f"(variable.r * (0.15 + math.sqrt({AGE}) * 0.85) * ({R2} < 0.6 ? 1 : 0.75 + {R3} * 0.2))"
    part("hr_shock", {**once(),
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.3)"},
        "minecraft:particle_motion_parametric": {"relative_position": [f"math.cos({a}) * {rg}", f"{AGE} * ({R4} * 0.6)", f"math.sin({a}) * {rg}"]},
        "minecraft:particle_appearance_billboard": vb(f"variable.size * ({R2} < 0.6 ? 0.2 : 0.12) * (1 - {AGE} * 0.5)", SMK),
        **tint(FIRE, f"math.clamp(({R2} < 0.6 ? 0.25 : 0.05) + {AGE} * 0.65, 0, 1)")})
    print("hr particles ok")

if __name__ == "__main__":
    main()
