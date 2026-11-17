"""히든 직업 영혼 수확자 파티클 (V11.4) — 전용 텍스처 · 전용 파티클 (보라 · 검정 + 청록 영혼빛)
  sr_slash  낫 호: 끝으로 갈수록 가늘고 날카로운 큰 호, 지나간 뒤 뒤로 흩날리는 잔영
  sr_wisp   영혼: 스스로 날아가는 청록 영혼불(꼬리), 적 → 플레이어로 빨려 옴
  sr_mist   망령 안개 (짙은 보라, 천천히 피어오름)
  sr_chain  영혼 사슬: u 방향 길이 r, 고리 모양 마디
  sr_burst  영혼 폭발
"""
import json, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).parent
TEXD = ROOT / "resource_pack" / "textures" / "particle"
OUT = ROOT / "resource_pack" / "particles"
AGE = "(variable.particle_age / variable.particle_lifetime)"
R1, R2, R3, R4 = (f"variable.particle_random_{i}" for i in (1, 2, 3, 4))
SPR = 8
TEX = "rpg_sr"
# 0~0.55 낫·사슬(흰 보라 → 보라 → 검정), 0.6~1 영혼빛(흰 청록 → 청록 → 짙은 녹색)
GR = {"0.0": "#FFF4EAFF", "0.15": "#FFC9A6FF", "0.3": "#FF8A4CE8", "0.45": "#FF4A1A9A", "0.55": "#FF120618",
      "0.6": "#FFE8FFF6", "0.72": "#FF8CFFE0", "0.86": "#FF2EC8A0", "1.0": "#C00A4A3A"}


def part(name, comps, material="particles_blend"):
    d = {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": f"rpg:{name}", "basic_render_parameters": {"material": material, "texture": f"textures/particle/{TEX}"}},
        "components": comps}}
    (OUT / f"rpg_{name}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1))


def once():
    return {"minecraft:emitter_rate_instant": {"num_particles": "variable.n"}, "minecraft:emitter_lifetime_once": {"active_time": 0.05}}


def bb(size, sprite):
    return {"size": [size, size], "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 32, "texture_height": 8, "uv": [sprite if isinstance(sprite, str) else sprite * SPR, 0], "uv_size": [SPR, SPR]}}


def tint(interp):
    return {"minecraft:particle_appearance_tinting": {"color": {"interpolant": interp, "gradient": GR}}}


def sheet():
    big = 64
    im = Image.new("RGBA", (32, 8), (0, 0, 0, 0))
    def soft(d, s, c):
        for r in range(int(c), 0, -1):
            d.ellipse([c - r, c - r, c + r, c + r], fill=(255, 255, 255, int(255 * min(1, (1 - r / c) ** 1.3 * 1.5))))
    def wisp(d, s, c):  # 영혼불: 아래 둥글고 위로 흔들리며 가늘어짐 + 두 눈 구멍
        d.ellipse([c - 15, c - 2, c + 15, c + 26], fill=(255, 255, 255, 255))
        d.polygon([(c - 14, c + 8), (c - 6, c - 14), (c + 2, 2), (c + 4, c - 18), (c + 14, c + 8)], fill=(255, 255, 255, 255))
        s.paste(s.filter(ImageFilter.GaussianBlur(2)))
        d.ellipse([c - 8, c + 6, c - 3, c + 12], fill=(0, 0, 0, 0)); d.ellipse([c + 3, c + 6, c + 8, c + 12], fill=(0, 0, 0, 0))
    def link(d, s, c): d.ellipse([10, 4, 54, 60], outline=(255, 255, 255, 255), width=9)
    def sliver(d, s, c):  # 낫 조각: 휘어진 가는 초승달
        d.ellipse([4, 4, 60, 60], fill=(255, 255, 255, 255)); d.ellipse([14, 0, 70, 52], fill=(0, 0, 0, 0))
    for i, fn in enumerate([soft, wisp, link, sliver]):
        s = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        fn(ImageDraw.Draw(s), s, big / 2)
        im.paste(s.resize((SPR, SPR), Image.LANCZOS), (i * SPR, 0))
    im.save(TEXD / f"{TEX}.png")


def main():
    sheet()
    # 낫 호: a0 → a1 을 dur 동안 그음, 두께는 칼등(시작)이 두껍고 끝으로 가며 날카롭게(낫 모양)
    q = R1
    th = f"(variable.a0 + (variable.a1 - variable.a0) * {q})"
    prof = f"math.pow(1 - {q}, 0.6) * math.sin(math.min(1, {q} * 6) * 90)"
    rr = f"(variable.r - variable.thick * {R2} * {prof})"
    delay = f"({q} * variable.dur)"
    live = f"math.clamp((variable.particle_age - {delay}) / variable.life, 0, 1)"
    part("sr_slash", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"(variable.u.{c} * math.cos({th}) + variable.v.{c} * math.sin({th})) * {rr} + variable.w.{c} * ({R3} - 0.5) * 0.15" for c in "xyz"],
                                          # 잔영: 호의 진행 반대쪽(접선 뒤)으로 흩날림
                                          "direction": [f"(variable.u.{c} * math.sin({th}) - variable.v.{c} * math.cos({th})) * (variable.a1 > variable.a0 ? 1 : -1)" for c in "xyz"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"{delay} + variable.life * (0.6 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"variable.spd * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2.5, "linear_acceleration": [0, 0.4, 0]},
        "minecraft:particle_appearance_billboard": bb(f"variable.particle_age < {delay} ? 0 : variable.size * (0.09 + {prof} * 0.14) * (1 - {live} * 0.85)", f"({R4} > 0.85 ? {3 * SPR} : 0)"),
        **tint(f"variable.tone > 0.5 ? math.clamp(0.6 + {R2} * 0.3 + {live} * 0.1, 0.6, 1) : math.clamp({R2} * 0.35 + {live} * 0.2 + variable.tone, 0, 0.55)")})
    # 영혼: vd 방향 vs 속도로 스스로 날아감, 느린 점은 꼬리
    lag = f"({R4} * {R4} * 0.5)"
    part("sr_wisp", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": ["variable.vd.x", "variable.vd.y", "variable.vd.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_initial_speed": f"variable.vs * (1 - {lag})",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.26 - {lag} * 0.35) * (0.8 + 0.2 * math.sin(variable.particle_age * 900 + {R1} * 360))", f"({R4} < 0.25 ? {SPR} : 0)"),
        **tint(f"math.clamp(0.62 + {lag} * 0.7 + variable.tone, 0.6, 1)")})
    part("sr_mist", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.4) * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": [f"({R1} - 0.5) * 0.5", f"0.4 + {R2} * 0.5", f"({R3} - 0.5) * 0.5"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.3 + {R4} * 0.5)",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 1.6, "linear_acceleration": [0, 0.3, 0]},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.5 + {R4} * 0.4) * (0.6 + {AGE} * 0.7) * (1 - {AGE} * 0.3)", 0),
        **tint(f"math.clamp(0.4 + {AGE} * 0.15 + {R4} * 0.05, 0, 0.55)")})
    # 사슬: 마디(고리)가 줄지어, 마디마다 크게·작게 번갈아
    part("sr_chain", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * math.floor({R1} * variable.r * 3) / 3 + variable.v.{c} * ({R2} - 0.5) * 0.05" for c in "xyz"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_initial_spin": {"rotation": f"math.mod(math.floor({R1} * variable.r * 3), 2) * 90 + 45"},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (math.mod(math.floor({R1} * variable.r * 3), 2) > 0 ? 0.26 : 0.2) * (1 - math.pow({AGE}, 3))", 2),
        **tint(f"math.clamp(0.12 + {R3} * 0.15 + variable.tone, 0, 1)")})
    part("sr_burst", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": [f"({R1} - 0.5)", f"({R2} - 0.3)", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.4 + {R4} * 0.8)",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2.4, "linear_acceleration": [0, 1, 0]},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.16 + {R4} * 0.12) * (1 - {AGE} * 0.8)", f"({R4} > 0.6 ? {SPR} : 0)"),
        **tint(f"variable.tone > 0.5 ? math.clamp(0.6 + {AGE} * 0.4, 0.6, 1) : math.clamp({AGE} * 0.5 + {R4} * 0.1, 0, 0.55)")})
    print("reaper particles ok")


if __name__ == "__main__":
    main()
