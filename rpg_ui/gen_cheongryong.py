"""청룡의 검 (V3.1) — 물빛 픽셀 먼지 + ✱ 눈꽃 파티클 / 청룡 머리 점 찍기
참고: yu_skills 의 blood_cluster (작은 픽셀 먼지가 흩어지며 그라데이션으로 짙어지고 일부는 떨어짐)
  cr_cluster  물방울 덩어리: 짧게 튀고 흘러내림. variable.tone (0 = 흰 심 … 1 = 짙은 남색)
  cr_snow     ✱ 눈꽃 반짝이 (커스텀 픽셀 텍스처)
  cr_arc      물살 곡선 획: yaw 기준 호를 빠르게 그음 (반지름 r, 각도 span, 기울기 tilt, 높이 h)
  cr_ring     점선 고리: 기울어진 원 위에 같은 간격으로 점 (dots 개)
  cr_tube     용 몸통 단면: 진행 방향(dir)에 수직인 원판에 층층이 (바깥 짙은 파랑 → 안쪽 흰색)
  cr_head     청룡 머리: 옆모습 윤곽선(선분) 양쪽 + 뿔·수염, 진행 방향(yaw, pitch)으로 회전
"""
import json, math
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent
TEX = ROOT / "resource_pack" / "textures" / "particle"
OUT = ROOT / "resource_pack" / "particles"
AGE = "(variable.particle_age / variable.particle_lifetime)"
R1, R2, R3, R4 = (f"variable.particle_random_{i}" for i in (1, 2, 3, 4))
GRAD = {"0.0": "#FFFFFFFF", "0.22": "#FFA6F0FF", "0.45": "#FF45C8FF", "0.7": "#FF1F8BFF", "0.88": "#FF1A3CFF", "1.0": "#FF0B1FB0"}


def textures():
    TEX.mkdir(parents=True, exist_ok=True)
    # ✱ 눈꽃: 16x16 픽셀아트 (가로·세로·대각 + 끝 갈래)
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    W = (255, 255, 255, 255)
    for i in range(3, 13):
        im.putpixel((7, i), W); im.putpixel((8, i), W)
        im.putpixel((i, 7), W); im.putpixel((i, 8), W)
    for i in range(4, 12):
        im.putpixel((i, i), W); im.putpixel((15 - i, i), W)
    for x, y in [(6, 3), (9, 3), (6, 12), (9, 12), (3, 6), (3, 9), (12, 6), (12, 9)]:
        im.putpixel((x, y), W)
    im.save(TEX / "rpg_cr_snow.png")


def part(name, comps, tex="textures/particle/particles", material="particles_alpha"):
    d = {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": f"rpg:{name}", "basic_render_parameters": {"material": material, "texture": tex}},
        "components": comps}}
    (OUT / f"rpg_{name}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1))


def dust_look(size="0.11", tone="variable.tone"):
    sz = f"variable.size * ({size} + {R3} * 0.07) * (1 - {AGE} * 0.8)"
    return {
        "minecraft:particle_appearance_billboard": {"size": [sz, sz], "facing_camera_mode": "rotate_xyz",
                                                    "uv": {"texture_width": 16, "texture_height": 16, "uv": [f"math.floor({R3} * 4) + 3", 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": f"math.clamp({tone} * 0.72 + {AGE} * 0.15 + ({R1} - 0.5) * 0.2, 0, 1)", "gradient": GRAD}},
    }


def steady(rate, active, life, maxp):
    return {"minecraft:emitter_rate_steady": {"spawn_rate": rate, "max_particles": maxp},
            "minecraft:emitter_lifetime_once": {"active_time": active},
            "minecraft:particle_lifetime_expression": {"max_lifetime": life}}


# 청룡 머리 옆모습 (x = 앞, y = 위), 단위 블록. (선분 시작, 끝, 옆으로 벌림 z)
HEAD = [
    # 윗턱 윗선 → 코끝
    ((0.0, 0.42), (0.7, 0.5), 0.38), ((0.7, 0.5), (1.5, 0.36), 0.32), ((1.5, 0.36), (2.2, 0.2), 0.26), ((2.2, 0.2), (2.5, 0.06), 0.2),
    # 윗턱 아랫선 (이빨 줄)
    ((2.5, 0.06), (1.7, -0.02), 0.22), ((1.7, -0.02), (0.8, 0.04), 0.28),
    # 벌린 아래턱
    ((0.7, -0.08), (1.5, -0.36), 0.26), ((1.5, -0.36), (2.2, -0.62), 0.2), ((2.2, -0.62), (2.3, -0.5), 0.16), ((2.3, -0.5), (1.4, -0.22), 0.2),
    # 눈두덩 / 눈
    ((0.55, 0.48), (0.9, 0.66), 0.4), ((0.9, 0.66), (1.25, 0.52), 0.38),
    # 뿔 두 쌍 (뒤로 길게)
    ((0.3, 0.55), (-0.5, 1.15), 0.42), ((-0.5, 1.15), (-1.4, 1.55), 0.5), ((0.1, 0.5), (-0.7, 0.95), 0.3), ((-0.7, 0.95), (-1.6, 1.05), 0.36),
    # 수염 (아래로 늘어졌다 뒤로)
    ((2.3, 0.1), (1.7, -0.5), 0.3), ((1.7, -0.5), (0.7, -0.95), 0.5), ((0.7, -0.95), (-0.5, -1.05), 0.65),
    ((2.1, 0.25), (1.6, 0.85), 0.3), ((1.6, 0.85), (0.6, 1.25), 0.45),
    # 갈기 / 뒷머리
    ((0.0, 0.42), (-0.4, 0.05), 0.42), ((-0.4, 0.05), (-0.1, -0.35), 0.4), ((-0.1, -0.35), (0.7, -0.08), 0.35),
    ((-0.4, 0.3), (-1.1, 0.5), 0.45), ((-0.3, -0.1), (-1.2, -0.3), 0.45),
]


# 큰 청룡 머리 (④ 스킬): 길이 약 6블록. 물 갈기는 들쭉날쭉한 가시, 아래턱을 크게 벌림.
#  (선분 시작, 끝, 두께 w) — 두께 안을 무작위로 채워 덩어리감
def _zig(pts, w, top=None, bottom=None):
    # top/bottom: 갈기 가시 높이를 기준선 쪽으로 줄이는 비율
    if top:
        pts = [(x, 1.2 + (y - 1.2) * top if y > 1.2 else y) for x, y in pts]
    if bottom:
        pts = [(x, -0.3 + (y + 0.3) * bottom if y < -0.3 else y) for x, y in pts]
    return [(pts[i], pts[i + 1], w) for i in range(len(pts) - 1)]
HEAD2 = (
    # 윗주둥이 윗선 + 코끝 혹
    _zig([(0.0, 1.2), (1.2, 1.15), (2.4, 1.0), (3.6, 0.72), (4.6, 0.46), (5.2, 0.3), (5.45, 0.55), (5.05, 0.75), (4.5, 0.62)], 0.55)
    # 윗턱 이빨 (지그재그)
    + _zig([(5.2, 0.22), (4.8, -0.08), (4.6, 0.14), (4.3, -0.12), (4.1, 0.12), (3.75, -0.12), (3.5, 0.08), (3.1, -0.1), (2.7, 0.06), (2.1, 0.1)], 0.45)
    # 크게 벌린 아래턱 바깥선
    + _zig([(1.9, -0.25), (2.8, -0.95), (3.8, -1.6), (4.5, -2.05), (4.75, -1.85), (4.4, -1.6)], 0.45)
    # 아래턱 안쪽 이빨
    + _zig([(4.4, -1.6), (4.0, -1.25), (3.85, -1.45), (3.5, -1.05), (3.3, -1.2), (2.9, -0.8), (2.6, -0.85), (2.2, -0.45)], 0.35)
    # 눈 (마름모) + 눈썹
    + _zig([(2.15, 0.72), (2.6, 0.98), (3.05, 0.74), (2.6, 0.56), (2.15, 0.72)], 0.62)
    + _zig([(1.7, 1.02), (2.5, 1.32), (3.3, 1.02)], 0.6)
    # 볼 / 얼굴 안쪽 결
    + _zig([(1.0, 0.65), (2.0, 0.45), (3.9, 0.36)], 0.5) + _zig([(0.8, 0.15), (1.9, 0.12), (3.0, 0.22)], 0.5)
    # 물 갈기: 머리 위·뒤로 들쭉날쭉 (흰 물보라)
    + _zig([(1.4, 1.2), (0.9, 2.1), (0.6, 1.35), (-0.1, 2.75), (-0.2, 1.5), (-1.0, 3.0), (-0.9, 1.6), (-1.9, 2.8), (-1.7, 1.45),
            (-2.7, 2.35), (-2.4, 1.15), (-3.5, 1.75), (-3.0, 0.85), (-4.2, 1.1), (-3.6, 0.5)], 0.32, top=0.65)
    # 턱 아래 갈기
    + _zig([(1.8, -0.35), (1.1, -1.5), (0.8, -0.6), (0.0, -1.9), (-0.1, -0.7), (-1.0, -1.7), (-1.0, -0.4), (-2.0, -1.3), (-1.9, -0.2)], 0.3, bottom=0.65)
    # 뒤로 흐르는 목 물결 + 수염
    + _zig([(-3.6, 0.5), (-5.0, 0.25), (-6.6, 0.1)], 0.45) + _zig([(-1.9, -0.2), (-3.6, -0.55), (-5.6, -0.4)], 0.45)
    + _zig([(5.0, 0.35), (5.7, -0.35), (5.5, -1.2), (5.0, -1.6)], 0.15)
)


def head_expr(H=None, fill=False):
    H = H or HEAD
    n = len(H)
    k = f"math.floor({R1} * {n})"
    f = f"({R1} * {n} - {k})"
    side = f"({R2} > 0.5 ? 1 : -1)"

    def sel(fn):
        e = "0"
        # 이분 탐색 형태로 중첩 (깊이 log n)
        def rec(lo, hi):
            if hi - lo == 1:
                return f"({fn(H[lo])})"
            mid = (lo + hi) // 2
            return f"({k} < {mid} ? {rec(lo, mid)} : {rec(mid, hi)})"
        e = rec(0, n)
        return e
    lx = sel(lambda s: f"{s[0][0]} + ({s[1][0]} - {s[0][0]}) * {f}")
    ly = sel(lambda s: f"{s[0][1]} + ({s[1][1]} - {s[0][1]}) * {f}")
    lz = sel(lambda s: f"{s[2]}")
    jit = f"({R4} - 0.5) * 0.12"
    if fill:
        side = f"({R2} * 2 - 1)"
    lx, ly, lz = f"(({lx}) * variable.scale + {jit})", f"(({ly}) * variable.scale + {jit})", f"(({lz}) * {side} * variable.scale)"
    # pitch 회전 (위아래 기울기) → yaw 회전. 로컬 x = 진행 방향
    cp, sp = "math.cos(variable.pitch)", "math.sin(variable.pitch)"
    fx = f"({lx} * {cp} - {ly} * {sp})"
    fy = f"({lx} * {sp} + {ly} * {cp})"
    # 진행 방향 (yaw: 마크 기준, 앞 = (-sin, cos)), 옆 = (cos, sin)
    X = f"(-{fx} * math.sin(variable.yaw) + {lz} * math.cos(variable.yaw))"
    Z = f"({fx} * math.cos(variable.yaw) + {lz} * math.sin(variable.yaw))"
    return [X, fy, Z]


def main():
    textures()
    U = "math.clamp(variable.emitter_age / math.max(0.04, variable.dur), 0, 1)"
    # 1) 물방울 덩어리
    part("cr_cluster", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": "variable.r", "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"0.45 + {R2} * 0.5"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.3 + {R1})",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, f"{R4} > 0.65 ? -8 : 0.4", 0], "linear_drag_coefficient": 4.5},
        **dust_look(),
    })
    # 2) ✱ 눈꽃
    part("cr_snow", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": "variable.r", "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"0.7 + {R2} * 0.6"},
        "minecraft:particle_initial_speed": f"0.4 + {R1} * 0.8",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -0.6, 0], "linear_drag_coefficient": 2},
        "minecraft:particle_appearance_billboard": {
            "size": [f"variable.size * (0.16 + {R3} * 0.1) * (1 - {AGE} * 0.5)"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 1, "texture_height": 1, "uv": [0, 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": f"{R1} * 0.35", "gradient": {"0.0": "#FFFFFFFF", "1.0": "#FF9FEAFF"}}},
    }, tex="textures/particle/rpg_cr_snow")
    # 3) 물살 곡선 획: 시작각 → 끝각을 dur 동안 긋기, 두께는 random_2 로 층(tone)
    a = f"(variable.yaw + variable.a0 + (variable.a1 - variable.a0) * {U})"
    th = f"(({R2} - 0.5) * variable.thick)"
    rad = f"(variable.r + {th})"
    part("cr_arc", {
        **steady("variable.n / math.max(0.04, variable.dur)", "math.max(0.04, variable.dur)", f"0.35 + {R4} * 0.35", 900),
        "minecraft:emitter_shape_point": {
            "offset": [f"-math.sin({a}) * {rad}", f"variable.h + math.sin(({a}) - variable.yaw) * variable.tilt + {th} * 0.5", f"math.cos({a}) * {rad}"],
            "direction": [f"-math.cos({a})", f"({R1} - 0.3)", f"-math.sin({a})"]},
        "minecraft:particle_initial_speed": f"0.8 + {R1} * 1.2",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, f"{R4} > 0.6 ? -7 : 0", 0], "linear_drag_coefficient": 4},
        **dust_look(tone=f"math.abs({R2} - 0.5) * 2"),
    })
    # 4) 점선 고리: 기울어진 원 (축 기울기 tiltx, tiltz), 같은 간격 점
    ang = f"(math.floor({R1} * variable.dots) / variable.dots * 360 + variable.spin * variable.emitter_age)"
    cx, sz_ = f"math.cos({ang}) * variable.r", f"math.sin({ang}) * variable.r"
    part("cr_ring", {
        **steady("variable.dots * 6", "math.max(0.05, variable.life)", f"0.25 + {R4} * 0.15", 600),
        "minecraft:emitter_shape_point": {"offset": [cx, f"variable.h + {cx} * math.sin(variable.tiltx) + {sz_} * math.sin(variable.tiltz)", sz_]},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        **dust_look("0.12", tone="variable.tone"),
    })
    # 5) 용 몸통 단면: dir 에 수직인 원판 (u, v 기저는 스크립트가 넘김)
    rr = f"(variable.r * math.sqrt({R2}))"
    an = f"({R1} * 360)"
    part("cr_tube", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {
            "offset": [f"(variable.u.x * math.cos({an}) + variable.v.x * math.sin({an})) * {rr}",
                       f"(variable.u.y * math.cos({an}) + variable.v.y * math.sin({an})) * {rr}",
                       f"(variable.u.z * math.cos({an}) + variable.v.z * math.sin({an})) * {rr}"],
            "direction": [f"(variable.u.x * math.cos({an}) + variable.v.x * math.sin({an}))", f"(variable.u.y * math.cos({an}) + variable.v.y * math.sin({an})) + 0.2", f"(variable.u.z * math.cos({an}) + variable.v.z * math.sin({an}))"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"0.3 + {R3} * 0.8",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, f"{R4} > 0.8 ? -5 : 0", 0], "linear_drag_coefficient": 3},
        # 가운데(흰) → 바깥(짙은 파랑)
        **dust_look("0.12", tone=f"math.sqrt({R2})"),
    })
    # 6) 청룡 머리 (윤곽선 점 찍기)
    part("cr_head", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": head_expr(), "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        **dust_look("0.13", tone=f"{R3} * 0.35"),
    })
    part("cr_headfill", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": head_expr(fill=True), "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        **dust_look("0.15", tone=f"0.55 + {R3} * 0.35"),
    })
    # 7) 큰 청룡 (④): gen_dragonhead.py 가 만든 사용자 그림(200x101)을 픽셀마다 점으로. 투명 픽셀은 안 그려짐 → 색 영역이 그대로
    IW, IH, CX, CY, CELL = 240, 121, 180, 50, 6
    px, py = f"math.floor({R1} * {IW})", f"math.floor({R2} * {IH})"
    S = "(variable.scale * 0.048)"
    # 픽셀 안 소수부로 살짝 흩뜨림 → 격자 느낌 제거
    jx, jy = f"(({R1} * {IW} - {px}) - 0.5)", f"(({R2} * {IH} - {py}) - 0.5)"
    lx, ly, lz = f"(({px} - {CX} + {jx} * 0.9) * {S})", f"(({CY} - {py} - {jy} * 0.9) * {S})", f"(({R3} - 0.5) * 0.4 * variable.scale)"
    cp, sp = "math.cos(variable.pitch)", "math.sin(variable.pitch)"
    fx, fy = f"({lx} * {cp} - {ly} * {sp})", f"({lx} * {sp} + {ly} * {cp})"
    part("cr_bighead", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": [f"(-{fx} * math.sin(variable.yaw) + {lz} * math.cos(variable.yaw))", fy,
                                                     f"({fx} * math.cos(variable.yaw) + {lz} * math.sin(variable.yaw))"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.4)"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": {
            "size": [f"{S} * (1.5 + {R4} * 0.7) * (1 - {AGE} * {AGE} * 0.4)"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": IW * CELL, "texture_height": IH * CELL, "uv": [f"{px} * {CELL}", f"{py} * {CELL}"], "uv_size": [CELL, CELL]}},
    }, tex="textures/particle/rpg_cr_dragonhead")
    # 9) 큰 세로 초승달 획 (유수): 면은 u·v 기저(스크립트가 넘김), a0 → a1 을 dur 동안 그음
    #    cr_varc = 하늘색 물 띠(가운데 진하고 바깥 밝게), cr_varc_snow = 가장자리를 따라 ✱ 반짝이
    ang = f"(variable.a0 + (variable.a1 - variable.a0) * {U})"
    def varc(rad_expr):
        return [f"(variable.u.x * math.cos({ang}) + variable.v.x * math.sin({ang})) * {rad_expr}",
                f"(variable.u.y * math.cos({ang}) + variable.v.y * math.sin({ang})) * {rad_expr}",
                f"(variable.u.z * math.cos({ang}) + variable.v.z * math.sin({ang})) * {rad_expr}"]
    band = f"(variable.r + ({R2} - 0.5) * variable.thick)"
    part("cr_varc", {
        **steady("variable.n / math.max(0.04, variable.dur)", "math.max(0.04, variable.dur)", f"0.55 + {R4} * 0.4", 1200),
        "minecraft:emitter_shape_point": {"offset": varc(band), "direction": [0, 1, 0]},
        "minecraft:particle_initial_speed": f"{R1} * 0.4",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, f"{R4} > 0.8 ? -4 : 0", 0], "linear_drag_coefficient": 3},
        "minecraft:particle_appearance_billboard": {
            "size": [f"variable.size * (0.14 + {R3} * 0.08) * (1 - {AGE} * 0.7)"] * 2, "facing_camera_mode": "rotate_xyz",
            "uv": {"texture_width": 16, "texture_height": 16, "uv": [f"math.floor({R3} * 2) + 6", 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": f"math.clamp(math.abs({R2} - 0.5) * 1.4 + {AGE} * 0.2, 0, 1)",
                                                            "gradient": {"0.0": "#FF45C8FF", "0.35": "#FF7FE3FF", "0.7": "#FFC8FAFF", "1.0": "#FFFFFFFF"}}},
    })
    edge = f"(variable.r + ({R2} > 0.5 ? 1 : -1) * variable.thick * (0.55 + {R1} * 0.25))"
    part("cr_varc_snow", {
        **steady("variable.n / math.max(0.04, variable.dur)", "math.max(0.04, variable.dur)", f"0.6 + {R4} * 0.5", 800),
        "minecraft:emitter_shape_point": {"offset": varc(edge), "direction": [0, 1, 0]},
        "minecraft:particle_initial_speed": f"{R1} * 0.3",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -0.5, 0], "linear_drag_coefficient": 2},
        "minecraft:particle_appearance_billboard": {
            "size": [f"variable.size * (0.13 + {R3} * 0.08) * (1 - {AGE} * 0.5)"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 1, "texture_height": 1, "uv": [0, 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": f"{R1} * 0.4", "gradient": {"0.0": "#FFFFFFFF", "1.0": "#FFB8F4FF"}}},
    }, tex="textures/particle/rpg_cr_snow")
    # ───── V3.7: 실감나는 3D 청룡 (③ 강림) ─────
    # 등(짙은 남색) → 옆구리(파랑, 비늘 줄무늬) → 배(밝은 하늘·흰색) 색 구분
    BODY = {"0.0": "#FFF2FBFF", "0.12": "#FFC4EEFA", "0.3": "#FF7FD4F5", "0.5": "#FF3C9CEB", "0.7": "#FF2266D2", "0.86": "#FF143FA6", "1.0": "#FF0A2068"}
    # 10) 비늘 몸통: 속이 빈 원통 껍질. 오래될수록 안쪽으로 오므라들어 꼬리로 갈수록 가늘어짐
    an = f"({R1} * 360)"
    radial = [f"(variable.u.{c} * math.cos({an}) + variable.v.{c} * math.sin({an}))" for c in "xyz"]
    shell = f"(variable.r * (0.8 + {R2} * 0.2))"
    belly = f"(math.sin({an}) < -0.4)"
    scl = f"math.mod(math.floor({an} / 36) + variable.seg, 2)"
    part("cr_body", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": [f"{radial[i]} * {shell}" for i in range(3)],
                                          "direction": [f"-{radial[i]}" for i in range(3)]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.88 + {R4} * 0.24)"},
        "minecraft:particle_initial_speed": "variable.r * 0.55 / variable.life",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": {
            "size": [f"variable.size * (0.13 + {R3} * 0.05) * (1 - {AGE} * 0.45)"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 16, "texture_height": 16, "uv": [f"math.floor({R3} * 2) + 6", 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": {
            "interpolant": f"math.clamp({belly} ? (0.04 + {R3} * 0.14) : (0.5 + math.sin({an}) * 0.32 + {scl} * 0.14 - math.pow(math.abs(math.cos({an})), 6) * 0.25 + {R3} * 0.06 + {AGE} * 0.1), 0, 1)",
            "gradient": BODY}},
    })
    # 11) 선(가시·뿔·수염·발톱·갈기): 원점에서 u 방향으로 길이 r, v 쪽으로 h 만큼 휨, 끝으로 갈수록 가늘게
    tt = R1
    part("cr_line", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {tt} * variable.r + variable.v.{c} * math.sin({tt} * 180) * variable.h" for c in "xyz"],
                                          "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.85 + {R4} * 0.3)"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": {
            "size": [f"variable.size * 0.11 * (1 - {tt} * variable.thick) * (1 - {AGE} * 0.4)"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 16, "texture_height": 16, "uv": [f"math.floor({R3} * 2) + 6", 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": f"math.clamp(variable.tone + {tt} * variable.spd + ({R2} - 0.5) * 0.12, 0, 1)", "gradient": BODY}},
    })
    # 12) 빛나는 눈 / 기운 (반투명 겹침)
    part("cr_glow", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": "variable.r", "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.4)"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": {
            "size": [f"variable.size * (0.8 + {R3} * 0.4) * (1 - {AGE} * 0.6)"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 16, "texture_height": 16, "uv": [7, 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": "variable.tone", "gradient": {"0.0": "#FFFFFDE0", "0.5": "#FFFFE680", "1.0": "#9070C8FF"}}},
    }, material="particles_blend")
    # 13) 먹구름 비: 구름 아래 원판에서 빗줄기 (진행 방향으로 늘어진 선)
    part("cr_rain", {
        **steady("variable.n", "variable.life", f"0.9 + {R4} * 0.4", 1400),
        "minecraft:emitter_shape_disc": {"radius": "variable.r", "plane_normal": "y", "direction": [0, -1, 0]},
        "minecraft:particle_initial_speed": f"18 + {R1} * 6",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_motion_collision": {"collision_radius": 0.05, "expire_on_contact": True},
        "minecraft:particle_appearance_billboard": {"size": [0.025, f"0.45 + {R2} * 0.3"], "facing_camera_mode": "lookat_direction",
                                                    "uv": {"texture_width": 16, "texture_height": 16, "uv": [7, 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": [f"0.62 + {R3} * 0.15", f"0.78 + {R3} * 0.1", 1, 0.55]},
    }, material="particles_blend")
    # 14) 회오리 물살: 세 갈래 나선이 돌며 솟음 (h 높이, spin 회전 속도)
    ha = f"({R2} * variable.h * 40 + variable.emitter_age * variable.spin + math.floor({R1} * 3) * 120)"
    hr = f"(variable.r * (0.55 + {R2} * 0.45))"
    part("cr_spiral", {
        **steady("variable.n", "variable.life", f"0.35 + {R4} * 0.25", 1200),
        "minecraft:emitter_shape_point": {"offset": [f"math.cos({ha}) * {hr}", f"{R2} * variable.h", f"math.sin({ha}) * {hr}"], "direction": [0, 1, 0]},
        "minecraft:particle_initial_speed": f"0.5 + {R3}",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 1},
        **dust_look("0.12", tone=f"{R2} * 0.4 + {R3} * 0.3"),
    })
    # 15) 충격파: 바닥에서 바깥으로 퍼지는 고리
    part("cr_shock", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_disc": {"radius": 0.4, "plane_normal": "y", "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"0.55 + {R2} * 0.3"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.92 + {R1} * 0.16)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, f"{R4} * 1.5", 0], "linear_drag_coefficient": 2.2},
        **dust_look("0.16", tone=f"variable.tone + {R3} * 0.3"),
    })
    # 16) 물기둥: 위로 솟구쳤다 떨어지는 물
    part("cr_column", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_disc": {"radius": "variable.r", "plane_normal": "y", "direction": [f"({R1} - 0.5) * 0.35", 1, f"({R3} - 0.5) * 0.35"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"0.9 + {R2} * 0.7"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.45 + {R2} * 0.55)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -14, 0], "linear_drag_coefficient": 0.6},
        "minecraft:particle_motion_collision": {"collision_radius": 0.1, "expire_on_contact": True},
        **dust_look("0.15", tone=f"{R2} * 0.6"),
    })
    # 17) 파란 가로 검기 (① 유수): cr_varc 과 같은 u·v 면, 굵은 파란 띠 (가운데 짙고 가장자리 밝음), 점이 크고 흩날림
    part("cr_bslash", {
        **steady("variable.n / math.max(0.04, variable.dur)", "math.max(0.04, variable.dur)", f"0.45 + {R4} * 0.45", 1600),
        "minecraft:emitter_shape_point": {"offset": varc(f"(variable.r + ({R2} - 0.5) * variable.thick * (1 - math.pow(math.abs({U} * 2 - 1), 3) * 0.75))"), "direction": varc("1")},
        "minecraft:particle_initial_speed": f"{R1} * 1.6",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, f"{R4} > 0.7 ? -5 : 0.3", 0], "linear_drag_coefficient": 3},
        "minecraft:particle_appearance_billboard": {
            "size": [f"variable.size * (0.19 + {R3} * 0.11) * (1 - {AGE} * 0.65)"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 16, "texture_height": 16, "uv": [f"math.floor({R3} * 2) + 6", 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": f"math.clamp(math.abs({R2} - 0.5) * 1.5 + {AGE} * 0.25 + ({R1} - 0.5) * 0.15, 0, 1)",
                                                            "gradient": {"0.0": "#FF0F3FD8", "0.3": "#FF1F6BFF", "0.55": "#FF3C9CFF", "0.8": "#FF8FD6FF", "1.0": "#FFE6F8FF"}}},
    })
    # 18) 큰 ✱ 눈꽃 눈보라: 원판에서 천천히 흩날리며 내려옴
    part("cr_snowfall", {
        **steady("variable.n", "variable.life", f"2.2 + {R4} * 1.5", 900),
        "minecraft:emitter_shape_disc": {"radius": "variable.r", "plane_normal": "y", "direction": [f"({R1} - 0.5)", -1, f"({R3} - 0.5)"]},
        "minecraft:particle_initial_speed": f"2.5 + {R2} * 2",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [f"math.sin(variable.particle_age * 200 + {R1} * 360) * 2", -1.2, f"math.cos(variable.particle_age * 170 + {R3} * 360) * 2"], "linear_drag_coefficient": 0.5},
        "minecraft:particle_motion_collision": {"collision_radius": 0.1, "expire_on_contact": True},
        "minecraft:particle_appearance_billboard": {
            "size": [f"(0.22 + {R3} * 0.3) * (1 - {AGE} * 0.3)"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 1, "texture_height": 1, "uv": [0, 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": f"{R1} * 0.5", "gradient": {"0.0": "#FFFFFFFF", "1.0": "#FFA8E4FF"}}},
    }, tex="textures/particle/rpg_cr_snow")
    # 19) 빛기둥: 바닥에서 하늘로 솟는 흰·하늘색 기둥 (가운데 진하고 바깥 흐림)
    pr = f"(variable.r * math.pow({R2}, 1.6))"
    part("cr_pillar", {
        **steady("variable.n", "variable.life", f"0.35 + {R4} * 0.3", 1800),
        "minecraft:emitter_shape_point": {"offset": [f"math.cos({R1} * 360) * {pr}", f"{R3} * variable.h", f"math.sin({R1} * 360) * {pr}"], "direction": [0, 1, 0]},
        "minecraft:particle_initial_speed": f"3 + {R4} * 4",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": {
            "size": [f"(0.35 + (1 - {R2}) * 0.5) * (1 - {AGE} * 0.5)"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 16, "texture_height": 16, "uv": [7, 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": [f"0.75 + (1 - {R2}) * 0.25", f"0.9 + (1 - {R2}) * 0.1", 1, f"(0.25 + (1 - {R2}) * 0.6) * (1 - {AGE})"]},
    }, material="particles_blend")
    # 8) 먹구름: 크고 어두운 연기 덩어리가 원판 모양으로 뭉쳐 천천히 꿈틀
    part("cr_cloud", {
        **steady("variable.r * 55", "variable.life", f"2.2 + {R4} * 1.6", 2600),
        "minecraft:emitter_shape_disc": {"radius": "variable.r", "plane_normal": "y", "offset": [0, f"({R3} - 0.5) * 2.6", 0],
                                         "direction": [f"({R1} - 0.5)", f"({R2} - 0.5) * 0.4", f"({R3} - 0.5)"]},
        "minecraft:particle_initial_speed": f"0.2 + {R1} * 0.4",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 0.6},
        "minecraft:particle_appearance_billboard": {
            "size": [f"(2.6 + {R3} * 3.2) * (0.6 + math.sin({AGE} * 180) * 0.5)"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 16, "texture_height": 16, "uv": [f"math.floor({R2} * 2) + 6", 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": [f"0.2 + {R1} * 0.14", f"0.22 + {R1} * 0.15", f"0.3 + {R1} * 0.16", f"math.sin({AGE} * 180) * 0.9"]},
    }, material="particles_blend")
    item()
    print("cheongryong particles + item ok")


def item():
    """청룡의 검: 푸른 칼날 + 용이 감긴 코등이 아이콘, 아이템 JSON"""
    from PIL import ImageDraw
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    blade, edge, core = (40, 110, 255), (170, 235, 255), (255, 255, 255)
    d.line([(5, 10), (14, 1)], fill=blade, width=2)
    d.line([(6, 10), (14, 2)], fill=edge)
    d.line([(9, 6), (13, 2)], fill=core)
    for x, y, c in [(3, 9, (30, 60, 220)), (4, 8, (60, 200, 255)), (5, 9, (30, 60, 220)), (6, 12, (60, 200, 255)), (7, 11, (30, 60, 220)),
                    (2, 10, (166, 240, 255)), (7, 13, (166, 240, 255)), (4, 12, (255, 255, 255))]:
        im.putpixel((x, y), (*c, 255))
    d.line([(1, 14), (4, 11)], fill=(20, 30, 70), width=1)
    im.putpixel((0, 15), (166, 240, 255, 255))
    out = ROOT / "resource_pack" / "textures" / "items" / "rpg"
    im.save(out / "cheongryong_sword.png")
    atlas_p = ROOT / "resource_pack" / "textures" / "item_texture.json"
    atlas = json.loads(atlas_p.read_text())
    atlas["texture_data"]["rpg_cheongryong_sword"] = {"textures": "textures/items/rpg/cheongryong_sword"}
    atlas_p.write_text(json.dumps(atlas, ensure_ascii=False, indent=2))
    data = {"format_version": "1.21.40", "minecraft:item": {
        "description": {"identifier": "rpg:cheongryong_sword", "menu_category": {"category": "equipment", "group": "itemGroup.name.sword"}},
        "components": {
            "minecraft:icon": "rpg_cheongryong_sword",
            "minecraft:display_name": {"value": "§b§l청룡의 검 §r§7[스킬 검 · 모든 직업]"},
            "minecraft:max_stack_size": 1, "minecraft:hand_equipped": True, "minecraft:damage": 12,
            "minecraft:enchantable": {"slot": "sword", "value": 22}, "minecraft:glint": True,
            "minecraft:can_destroy_in_creative": False,
            "minecraft:use_modifiers": {"use_duration": 0.05, "movement_modifier": 1.0}}}}
    (ROOT / "behavior_pack" / "items" / "cheongryong_sword.json").write_text(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
