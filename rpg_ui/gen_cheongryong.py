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
    # 7) 큰 청룡 (④): gen_dragonhead.py 가 만든 사용자 그림(200x101)을 픽셀마다 점으로. 투명 픽셀은 안 그려짐 → 색 영역이 그대로
    IW, IH, CX, CY = 200, 101, 150, 42
    px, py = f"math.floor({R1} * {IW})", f"math.floor({R2} * {IH})"
    S = "(variable.scale * 0.055)"
    lx, ly, lz = f"(({px} - {CX}) * {S})", f"(({CY} - {py}) * {S})", f"(({R3} - 0.5) * 0.4 * variable.scale)"
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
            "size": [f"{S} * 0.75", f"{S} * 0.75"], "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": IW, "texture_height": IH, "uv": [px, py], "uv_size": [1, 1]}},
    }, tex="textures/particle/rpg_cr_dragonhead")
    # 8) 먹구름: 크고 어두운 연기 덩어리가 원판 모양으로 뭉쳐 천천히 꿈틀
    part("cr_cloud", {
        **steady("variable.r * 40", "variable.life", f"1.6 + {R4} * 1.2", 900),
        "minecraft:emitter_shape_disc": {"radius": "variable.r", "plane_normal": "y", "offset": [0, f"({R3} - 0.5) * 1.4", 0],
                                         "direction": [f"({R1} - 0.5)", f"({R2} - 0.5) * 0.4", f"({R3} - 0.5)"]},
        "minecraft:particle_initial_speed": f"0.2 + {R1} * 0.4",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 0.6},
        "minecraft:particle_appearance_billboard": {
            "size": [f"(1.4 + {R3} * 1.6) * (0.6 + math.sin({AGE} * 180) * 0.5)"] * 2, "facing_camera_mode": "lookat_xyz",
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
