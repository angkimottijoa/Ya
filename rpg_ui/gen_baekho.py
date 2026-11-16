"""백호의 발톱 (V4.8) — 흑백 파티클 + 무기 아이템
  bh_claw     할퀴기 자국: 평행한 발톱 줄 dots 개, 한 번 호출로 획 순서대로 그어지는 애니메이션
              줄 가운데 흰색 → 가장자리 검정 (호랑이 줄무늬 느낌), 끝은 뾰족, 일부 조각은 떨어짐
  bh_cluster  흑백 먼지 뭉치 (타격·물보라)
  bh_shock    바닥에서 퍼지는 흑백 충격파
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).parent
OUT = ROOT / "resource_pack" / "particles"
AGE = "(variable.particle_age / variable.particle_lifetime)"
R1, R2, R3, R4 = (f"variable.particle_random_{i}" for i in (1, 2, 3, 4))
BW = {"0.0": "#FFFFFFFF", "0.42": "#FFF2F2F2", "0.55": "#FF3A3A3A", "0.75": "#FF141414", "1.0": "#FF000000"}


def part(name, comps, tex="textures/particle/particles", material="particles_alpha"):
    d = {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": f"rpg:{name}", "basic_render_parameters": {"material": material, "texture": tex}},
        "components": comps}}
    (OUT / f"rpg_{name}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1))


def pix(size):
    return {"size": [size] * 2, "facing_camera_mode": "rotate_xyz",
            "uv": {"texture_width": 16, "texture_height": 16, "uv": [f"math.floor({R3} * 4) + 3", 0], "uv_size": [1, 1]}}


def main():
    # 1) 발톱 자국
    q = R1                                    # 획 위치 0 → 1 (그어지는 순서)
    i = f"math.floor({R2} * variable.dots)"   # 몇 번째 발톱
    mid = f"math.sin({q} * 180)"              # 가운데 1, 양 끝 0 → 뾰족
    lane = f"(({i} - (variable.dots - 1) / 2) * variable.thick)"
    wid = f"(({R3} - 0.5) * 0.2 * variable.size * (0.25 + {mid} * 0.75))"
    stag = f"({i} * 0.06 - variable.dots * 0.03)"  # 발톱마다 살짝 어긋나게
    along = f"(({q} - 0.5 + {stag}) * variable.r)"
    bulge = f"({mid} * 0.45)"
    bend = f"({mid} * variable.h)"  # 발톱 줄이 활처럼 휘어짐
    delay = f"({q} * variable.dur + {i} * 0.012)"
    live = f"math.clamp((variable.particle_age - {delay}) / variable.life, 0, 1)"
    part("bh_claw", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {
            "offset": [f"variable.u.{c} * {along} + variable.v.{c} * ({lane} + {wid} + {mid} * {lane} * 0.18 + {bend}) + variable.w.{c} * {bulge}" for c in "xyz"],
            "direction": ["variable.w.x", f"variable.w.y + 0.3", "variable.w.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"{delay} + variable.life * (0.7 + {R4} * 0.45)"},
        "minecraft:particle_initial_speed": f"{R4} > 0.72 ? 0.8 + {R4} : 0",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, f"{R4} > 0.72 ? -7 : 0", 0], "linear_drag_coefficient": 3},
        "minecraft:particle_appearance_billboard": pix(
            f"variable.particle_age < {delay} ? 0 : variable.size * (0.065 + {mid} * 0.075) * (1 - {live} * 0.8)"),
        # 줄 가운데 흰색 → 가장자리 검정, 시간이 지나면 어두워짐
        "minecraft:particle_appearance_tinting": {"color": {
            "interpolant": f"math.clamp(math.abs({R3} - 0.5) * 2 + {live} * 0.3 + variable.tone, 0, 1)", "gradient": BW}},
    })
    # 2) 흑백 먼지 뭉치
    part("bh_cluster", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": "variable.r", "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"0.45 + {R2} * 0.5"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.3 + {R1})",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, f"{R4} > 0.65 ? -8 : 0.4", 0], "linear_drag_coefficient": 4.5},
        "minecraft:particle_appearance_billboard": pix(f"variable.size * (0.09 + {R3} * 0.07) * (1 - {AGE} * 0.8)"),
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": f"math.clamp(variable.tone + ({R1} - 0.5) * 0.5 + {AGE} * 0.25, 0, 1)", "gradient": BW}},
    })
    # 3) 흑백 충격파
    part("bh_shock", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_disc": {"radius": 0.4, "plane_normal": "y", "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"0.5 + {R2} * 0.3"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.9 + {R1} * 0.2)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, f"{R4} * 1.5", 0], "linear_drag_coefficient": 2.2},
        "minecraft:particle_appearance_billboard": pix(f"variable.size * (0.12 + {R3} * 0.08) * (1 - {AGE} * 0.7)"),
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": f"math.clamp({R2} + {AGE} * 0.2, 0, 1)", "gradient": BW}},
    })
    item()
    print("baekho particles + item ok")


def item():
    """백호의 발톱: 흰 발톱 세 개 + 검은 줄무늬 손잡이 아이콘"""
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    white, grey, black = (245, 245, 245, 255), (170, 170, 175, 255), (20, 20, 22, 255)
    for k, (x0, y0) in enumerate([(5, 1), (8, 0), (11, 2)]):
        d.line([(x0, y0), (x0 - 2, y0 + 7)], fill=white, width=2)
        d.point((x0 - 1, y0 + 1), fill=grey)
    d.rectangle([(1, 9), (9, 14)], fill=white)
    for x in (2, 5, 8):
        d.line([(x, 9), (x - 1, 14)], fill=black)
    d.rectangle([(1, 9), (9, 14)], outline=black)
    out = ROOT / "resource_pack" / "textures" / "items" / "rpg"
    im.save(out / "baekho_claw.png")
    atlas_p = ROOT / "resource_pack" / "textures" / "item_texture.json"
    atlas = json.loads(atlas_p.read_text())
    atlas["texture_data"]["rpg_baekho_claw"] = {"textures": "textures/items/rpg/baekho_claw"}
    atlas_p.write_text(json.dumps(atlas, ensure_ascii=False, indent=2))
    data = {"format_version": "1.21.40", "minecraft:item": {
        "description": {"identifier": "rpg:baekho_claw", "menu_category": {"category": "equipment", "group": "itemGroup.name.sword"}},
        "components": {
            "minecraft:icon": "rpg_baekho_claw",
            "minecraft:display_name": {"value": "§f§l백호의 발톱 §r§7[스킬 무기 · 모든 직업]"},
            "minecraft:max_stack_size": 1, "minecraft:hand_equipped": True, "minecraft:damage": 12,
            "minecraft:enchantable": {"slot": "sword", "value": 22}, "minecraft:glint": True,
            "minecraft:can_destroy_in_creative": False,
            "minecraft:use_modifiers": {"use_duration": 0.05, "movement_modifier": 1.0}}}}
    (ROOT / "behavior_pack" / "items" / "baekho_claw.json").write_text(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
