"""마법사 계열 직업 스킬 파티클 (V11.2) — 계열마다 전용 텍스처 · 전용 파티클
  비전(마법사)      ar_proj 마력탄 · ar_burst 마력 폭발 · ar_spark 반짝임
  원소(원소술사)    el_fire 화염탄 · el_ice 얼음탄 · el_flame 불기둥/불꽃 · el_spike 얼음 가시 · el_burst 원소 폭발
  성좌(대마법사)    as_proj 별탄 · as_beam 빛줄기 · as_burst 별 폭발 · as_dust 별가루
  번개(뇌전·폭풍)   lt_bolt 번개 줄기 · lt_proj 번개 창 · lt_burst 번개 폭발 · lt_spark 전기 불꽃
  탄(proj)은 스크립트가 한 번만 뿌리면 vd 방향 vs 속도로 스스로 날아가고, 느린 점이 뒤에 처져 꼬리가 됨 (life = 목표까지 걸리는 시간)
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


def part(name, tex, comps, material="particles_blend"):
    d = {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": f"rpg:{name}", "basic_render_parameters": {"material": material, "texture": f"textures/particle/{tex}"}},
        "components": comps}}
    (OUT / f"rpg_{name}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1))


def once():
    return {"minecraft:emitter_rate_instant": {"num_particles": "variable.n"}, "minecraft:emitter_lifetime_once": {"active_time": 0.05}}


def bb(size, sprite, mode="lookat_xyz", w=None, extra=None):
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
    d.ellipse([c - 7, c - 7, c + 7, c + 7], fill=(255, 255, 255, 255))
def hollow(d, s, c): d.ellipse([6, 6, 58, 58], outline=(255, 255, 255, 255), width=8)
def flame(d, s, c):
    d.polygon([(c - 16, c + 16), (c - 4, c - 8), (c, 2), (c + 6, c - 10), (c + 16, c + 16)], fill=(255, 255, 255, 255))
    d.ellipse([c - 16, c + 2, c + 16, c + 28], fill=(255, 255, 255, 255))
    s.paste(s.filter(ImageFilter.GaussianBlur(2)))
def shard(d, s, c):
    d.polygon([(c, 0), (c + 9, c), (c, 64), (c - 9, c)], fill=(255, 255, 255, 255))
    d.polygon([(c, 0), (c + 9, c), (c, c)], fill=(200, 200, 200, 255))
def flake(d, s, c):
    for a in range(0, 180, 60):
        r = math.radians(a)
        d.line([(c - math.cos(r) * 28, c - math.sin(r) * 28), (c + math.cos(r) * 28, c + math.sin(r) * 28)], fill=(255, 255, 255, 255), width=6)
    d.ellipse([c - 6, c - 6, c + 6, c + 6], fill=(255, 255, 255, 255))
def cross(d, s, c):
    d.line([(c, 4), (c, 60)], fill=(255, 255, 255, 255), width=6); d.line([(4, c), (60, c)], fill=(255, 255, 255, 255), width=6)
    s.paste(s.filter(ImageFilter.GaussianBlur(1.5)))
def bar(d, s, c):  # 번개 마디: 가운데 밝은 가는 막대
    d.rectangle([c - 4, 0, c + 4, 64], fill=(255, 255, 255, 255))
    s.paste(s.filter(ImageFilter.GaussianBlur(2)))


def proj(name, tex, grad, sprite, spread="variable.r", tail="0.45"):
    """날아가는 탄: 머리(빠른 점)는 크고 밝게, 느린 점은 뒤로 처져 꼬리"""
    lag = f"({R4} * {R4} * {tail})"
    part(name, tex, {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * {spread} * (1 - {lag})", f"({R2} - 0.5) * 2 * {spread} * (1 - {lag})", f"({R3} - 0.5) * 2 * {spread} * (1 - {lag})"],
                                          "direction": ["variable.vd.x", "variable.vd.y", "variable.vd.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_initial_speed": f"variable.vs * (1 - {lag})",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.22 - {lag} * 0.25) * (1 - math.pow({AGE}, 4) * 0.5)", sprite),
        **tint(grad, f"math.clamp({lag} * 1.6 + {R1} * 0.15 + variable.tone, 0, 1)")})


def burst(name, tex, grad, sprite, up="0.3", drag=2.4, grav=0):
    part(name, tex, {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"],
                                          "direction": [f"({R1} - 0.5)", f"({R2} - 0.5) + {up}", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.4 + {R4} * 0.8)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, grav, 0], "linear_drag_coefficient": drag},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.14 + {R4} * 0.12) * (1 - {AGE} * 0.8)", sprite),
        **tint(grad, f"math.clamp({AGE} * 0.7 + {R4} * 0.25 + variable.tone, 0, 1)")})


def column(name, tex, grad, sprite, rise=0.0, taper=True, flicker=False):
    """u 방향 기둥(길이 r, 굵기 thick): 불기둥 · 얼음 가시 · 빛줄기"""
    t = f"math.pow({R1}, 0.8)" if taper else R1
    rad = f"(variable.thick * {'math.pow(1 - ' + t + ', 0.85)' if taper else '1'} * math.sqrt({R2}))"
    ang = f"({R3} * 360)"
    size = f"variable.size * 0.13 * (0.6 + {R4} * 0.6) * (1 - {AGE} * 0.6)"
    if flicker: size = f"{size} * (0.7 + 0.3 * math.sin(variable.particle_age * 1400 + {R1} * 360))"
    part(name, tex, {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {t} * variable.r + (variable.v.{c} * math.cos({ang}) + variable.w.{c} * math.sin({ang})) * {rad}" for c in "xyz"],
                                          "direction": ["variable.u.x", "variable.u.y", "variable.u.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.3)"},
        "minecraft:particle_initial_speed": f"{rise} * (0.5 + {R4})",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 1.5},
        "minecraft:particle_appearance_billboard": bb(size, sprite),
        **tint(grad, f"math.clamp({t} * 0.6 + {AGE} * 0.35 + variable.tone, 0, 1)")})


def main():
    # 비전: 흰 → 하늘 → 남색 → 보라
    ARC = {"0.0": "#FFFFFFFF", "0.2": "#FFD6F0FF", "0.45": "#FF7AB6FF", "0.7": "#FF4A5CE0", "1.0": "#C0301E8A"}
    sheet("rpg_ar", [soft, star4, hollow, disc])
    proj("ar_proj", "rpg_ar", ARC, 0)
    burst("ar_burst", "rpg_ar", ARC, 0)
    part("ar_spark", "rpg_ar", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.5 + {R4} * 0.7)"},
        "minecraft:particle_initial_speed": f"variable.spd * {R4}",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2},
        "minecraft:particle_initial_spin": {"rotation": f"{R1} * 90"},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * 0.14 * (0.5 + 0.5 * math.sin(variable.particle_age * 800 + {R2} * 360)) * (1 - {AGE})", 1),
        **tint(ARC, f"math.clamp({R3} * 0.4 + variable.tone, 0, 1)")})
    # 원소: 불 / 얼음
    FIRE = {"0.0": "#FFFFF6D0", "0.2": "#FFFFC850", "0.45": "#FFFF7A1E", "0.7": "#FFD0301A", "0.88": "#E0601010", "1.0": "#80200606"}
    ICE = {"0.0": "#FFFFFFFF", "0.25": "#FFD8F6FF", "0.5": "#FF8ED4FF", "0.75": "#FF3E8CE0", "1.0": "#C01E3C8A"}
    sheet("rpg_el", [flame, shard, soft, flake])
    proj("el_fire", "rpg_el", FIRE, 0, tail="0.6")
    proj("el_ice", "rpg_el", ICE, f"({R4} > 0.5 ? {SPR} : {3 * SPR})", tail="0.4")
    column("el_flame", "rpg_el", FIRE, 0, rise=3, taper=False)
    column("el_spike", "rpg_el", ICE, f"({R4} > 0.3 ? {SPR} : {2 * SPR})", rise=0, taper=True)
    burst("el_burst", "rpg_el", FIRE, f"({R4} > 0.5 ? 0 : {2 * SPR})", up="0.5", grav=1)
    burst("el_frost", "rpg_el", ICE, f"({R4} > 0.5 ? {3 * SPR} : {SPR})", up="0.2", grav=-3)
    # 성좌: 금 → 흰 → 남보라
    STAR = {"0.0": "#FFFFFFFF", "0.2": "#FFFFF0B4", "0.42": "#FFFFC85A", "0.65": "#FF9A7AFF", "0.85": "#FF4A34B8", "1.0": "#A0201450"}
    sheet("rpg_as", [star4, soft, cross, disc])
    proj("as_proj", "rpg_as", STAR, f"({R4} < 0.2 ? 0 : {SPR})", tail="0.55")
    column("as_beam", "rpg_as", STAR, f"({R4} > 0.85 ? {2 * SPR} : {SPR})", rise=0, taper=False, flicker=True)
    burst("as_burst", "rpg_as", STAR, f"({R4} > 0.6 ? 0 : {SPR})", up="0.4")
    burst("as_dust", "rpg_as", STAR, f"({R4} > 0.5 ? {2 * SPR} : {SPR})", up="-0.4", drag=1.2, grav=-0.6)
    # 번개: 흰 심 → 청록 → 짙은 청록
    VOLT = {"0.0": "#FFFFFFFF", "0.2": "#FFE0FFFF", "0.45": "#FF6CF4FF", "0.7": "#FF1EB4D8", "1.0": "#A00A4A6A"}
    sheet("rpg_lt", [soft, bar, disc, star4])
    # 번개 줄기: u 방향 길이 r, 두 겹 사인 + seed 로 꺾임, 빠르게 깜빡임
    jag = f"((math.sin({R1} * variable.r * 95 + variable.seed * 61) * 0.6 + math.sin({R1} * variable.r * 260 + variable.seed * 17) * 0.4) * variable.h * math.sin({R1} * 180))"
    jag2 = jag.replace("* 61", "* 23").replace("* 17", "* 89")
    part("lt_bolt", "rpg_lt", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {R1} * variable.r + variable.v.{c} * ({jag} + ({R2} - 0.5) * 0.06) + variable.w.{c} * {jag2}" for c in "xyz"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * (0.1 + math.abs({R2} - 0.5) * 0.25) * (0.6 + 0.4 * math.sin(variable.particle_age * 2200 + {R3} * 360))", 0),
        **tint(VOLT, f"math.clamp(math.abs({R2} - 0.5) * 1.6 + {AGE} * 0.3 + variable.tone, 0, 1)")})
    proj("lt_proj", "rpg_lt", VOLT, 0, tail="0.5")
    burst("lt_burst", "rpg_lt", VOLT, f"({R4} > 0.7 ? {3 * SPR} : 0)", up="0.2", drag=3)
    part("lt_spark", "rpg_lt", {**once(),
        "minecraft:emitter_shape_point": {"offset": [f"({R1} - 0.5) * 2 * variable.r", f"({R2} - 0.5) * 2 * variable.r", f"({R3} - 0.5) * 2 * variable.r"], "direction": [f"({R1} - 0.5)", f"({R2} - 0.5)", f"({R3} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.4 + {R4} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.5 + {R4})",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 3},
        "minecraft:particle_appearance_billboard": bb(f"variable.size * 0.12", 1, "lookat_direction", "variable.size * 0.04", {"direction": {"mode": "derive_from_velocity", "min_speed_threshold": 0.05}}),
        **tint(VOLT, f"math.clamp({AGE} * 0.8 + variable.tone, 0, 1)")})
    print("mage particles ok")


if __name__ == "__main__":
    main()
