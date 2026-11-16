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


def head_expr():
    n = len(HEAD)
    k = f"math.floor({R1} * {n})"
    f = f"({R1} * {n} - {k})"
    side = f"({R2} > 0.5 ? 1 : -1)"

    def sel(fn):
        e = "0"
        for i in reversed(range(n)):
            e = f"({k} < {i + 1} ? ({fn(HEAD[i])}) : {e})"
        return e
    lx = sel(lambda s: f"{s[0][0]} + ({s[1][0]} - {s[0][0]}) * {f}")
    ly = sel(lambda s: f"{s[0][1]} + ({s[1][1]} - {s[0][1]}) * {f}")
    lz = sel(lambda s: f"{s[2]}")
    jit = f"({R4} - 0.5) * 0.12"
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
