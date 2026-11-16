"""원소 스킬용 빛 VFX (V3.0): 커스텀 텍스처 + 가산(빛나는) 파티클
  텍스처: rpg_glow(부드러운 빛 점), rpg_spark(4갈래 별빛)
  파티클 (모두 particles_add, 색은 스크립트가 variable.color 로):
    vfx_ring    빛나는 고리 (지속 중 은은하게 깜빡이며 천천히 회전)
    vfx_fill    고리 안을 채우는 옅은 빛 안개
    vfx_line    빛의 선 (시작점에서 dir 방향으로 len 만큼, 빠르게 그어짐)
    vfx_bolt    지그재그 번개 (dir 방향 len, 옆 방향 perp 로 흔들림)
    vfx_sigil   회전하는 마법진 (원 3겹 + 육망성 + 룬 눈금 + 바깥 가시)
    vfx_fountain 솟구치는 물기둥과 물보라
    vfx_swirl   회전하며 퍼지는 곡선 베기(소용돌이)
    vfx_ember   튀어 오르는 불티
    vfx_flash   큰 섬광
"""
import json, math
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent
TEX = ROOT / "resource_pack" / "textures" / "particle"
OUT = ROOT / "resource_pack" / "particles"
AGE = "(variable.particle_age / variable.particle_lifetime)"
R1, R2, R3, R4 = (f"variable.particle_random_{i}" for i in (1, 2, 3, 4))


def textures():
    TEX.mkdir(parents=True, exist_ok=True)
    n = 32
    im = Image.new("RGBA", (n, n))
    for y in range(n):
        for x in range(n):
            r = math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2)
            a = max(0.0, 1 - r) ** 2.2
            core = max(0.0, 1 - r * 3) ** 2
            im.putpixel((x, y), (255, 255, 255, int(255 * min(1, a + core))))
    im.save(TEX / "rpg_glow.png")
    im = Image.new("RGBA", (n, n))
    for y in range(n):
        for x in range(n):
            dx, dy = abs(x - n / 2 + 0.5) / (n / 2), abs(y - n / 2 + 0.5) / (n / 2)
            a = max(0.0, 1 - dx) ** 6 * max(0.0, 1 - dy * 8) + max(0.0, 1 - dy) ** 6 * max(0.0, 1 - dx * 8)
            a += max(0.0, 1 - math.hypot(dx, dy) * 2.2) ** 2
            im.putpixel((x, y), (255, 255, 255, int(255 * min(1, a))))
    im.save(TEX / "rpg_spark.png")


def part(name, comps, tex="rpg_glow"):
    d = {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": f"rpg:{name}", "basic_render_parameters": {"material": "particles_add", "texture": f"textures/particle/{tex}"}},
        "components": comps}}
    (OUT / f"rpg_{name}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1))


def look(size, flicker=False, fade_in=0.15):
    a = f"variable.color.a * math.min(1, {AGE} / {fade_in}) * math.clamp((1 - {AGE}) * 3, 0, 1)"
    if flicker:
        a += f" * (0.7 + 0.3 * math.sin(variable.particle_age * 900 + {R3} * 360))"
    sz = f"variable.size * {size} * (0.8 + {R3} * 0.4)"
    return {
        "minecraft:particle_appearance_billboard": {"size": [sz, sz], "facing_camera_mode": "lookat_xyz",
                                                    "uv": {"texture_width": 1, "texture_height": 1, "uv": [0, 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": ["variable.color.r", "variable.color.g", "variable.color.b", a]},
    }


def steady(rate, active, life, maxp):
    return {
        "minecraft:emitter_rate_steady": {"spawn_rate": rate, "max_particles": maxp},
        "minecraft:emitter_lifetime_once": {"active_time": active},
        "minecraft:particle_lifetime_expression": {"max_lifetime": life},
    }


def main():
    textures()
    OUT.mkdir(parents=True, exist_ok=True)
    U = "math.clamp(variable.emitter_age / math.max(0.04, variable.dur), 0, 1)"

    # 고리: 지속시간(variable.life) 동안 계속 다시 그려져 깜빡이며 천천히 돎
    ang = f"({R1} * 360 + variable.emitter_age * 25)"
    part("vfx_ring", {
        **steady("variable.r * 60", "variable.life", f"0.35 + {R4} * 0.2", 900),
        "minecraft:emitter_shape_point": {"offset": [f"math.cos({ang}) * variable.r * (1 + ({R2} - 0.5) * 0.015)", f"0.08 + {R2} * 0.12", f"math.sin({ang}) * variable.r * (1 + ({R2} - 0.5) * 0.015)"]},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        **look("0.45", flicker=True, fade_in=0.2),
    })
    part("vfx_fill", {
        **steady("variable.r * 8", "variable.life", f"0.8 + {R4} * 0.6", 400),
        "minecraft:emitter_shape_disc": {"radius": "variable.r", "plane_normal": "y", "offset": [0, 0.1, 0], "direction": [0, 1, 0]},
        "minecraft:particle_initial_speed": f"0.1 + {R3} * 0.3",
        "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 1},
        **look("0.9", fade_in=0.4),
    })
    # 빛의 선: 0→len 을 dur 동안 긋고, 점들은 life 동안 남음
    t = f"({U} + ({R1} - 0.5) * 0.03)"
    part("vfx_line", {
        **steady("variable.len * 14 / math.max(0.04, variable.dur)", "math.max(0.04, variable.dur)", "variable.life * (0.85 + {} * 0.3)".format(R4), 1000),
        "minecraft:emitter_shape_point": {"offset": [f"variable.dir.x * variable.len * {t}", f"variable.dir.y * variable.len * {t}", f"variable.dir.z * variable.len * {t}"]},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        **look("variable.w", fade_in=0.05),
    })
    # 번개: 옆(perp)과 위로 흔들리는 지그재그
    zig = f"(math.sin({U} * 2600 + variable.seed) * 0.6 + math.sin({U} * 7100 + variable.seed * 3) * 0.25)"
    part("vfx_bolt", {
        **steady("variable.len * 16 / 0.06", 0.06, f"0.25 + {R4} * 0.15", 700),
        "minecraft:emitter_shape_point": {"offset": [f"variable.dir.x * variable.len * {U} + variable.perp.x * {zig} * variable.amp",
                                                     f"variable.dir.y * variable.len * {U} + {zig} * 0.3 * variable.amp",
                                                     f"variable.dir.z * variable.len * {U} + variable.perp.z * {zig} * variable.amp"]},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        **look("variable.w", fade_in=0.02),
    })
    # 마법진: 파티클마다 random_4 로 어느 선에 속할지 (원 3겹 / 육망성 / 룬 눈금 / 바깥 가시)
    rot = "(variable.emitter_age * 20 + variable.yaw)"
    rr = "variable.r"
    k3 = f"math.floor({R1} * 3)"
    fr3 = f"({R1} * 3 - {k3})"

    def tri(fn, off):
        a1 = f"({rot} + {off} + {k3} * 120)"
        return f"({fn}({a1}) * (1 - {fr3}) + {fn}({a1} + 120) * {fr3}) * {rr} * 0.8"
    k12 = f"math.floor({R1} * 12)"
    k3b = f"math.floor({R1} * 3)"

    def shape(fn):
        return (f"({R4} < 0.30 ? {fn}({R1} * 360 + {rot}) * {rr} : "
                f"({R4} < 0.45 ? {fn}({R1} * 360 - {rot}) * {rr} * 0.86 : "
                f"({R4} < 0.55 ? {fn}({R1} * 360 + {rot}) * {rr} * 0.32 : "
                f"({R4} < 0.68 ? {tri(fn, 90)} : "
                f"({R4} < 0.81 ? {tri(fn, 270)} : "
                f"({R4} < 0.93 ? {fn}({k12} * 30 + {rot}) * {rr} * (0.87 + {R2} * 0.1) : "
                f"{fn}({k3b} * 120 + {rot} * -1) * {rr} * (1 + {R2} * 0.25)))))))")
    part("vfx_sigil", {
        **steady(2400, "variable.life", f"0.3 + {R3} * 0.15", 1100),
        "minecraft:emitter_shape_point": {"offset": [shape("math.cos"), "0.12", shape("math.sin")]},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        **look("0.22", flicker=True, fade_in=0.1),
    })
    # 물기둥: 6개 기둥 + 물보라
    kc = f"math.floor({R2} * 6)"
    col = f"({R4} < 0.6)"
    part("vfx_fountain", {
        **steady(500, "variable.life", f"0.6 + {R3} * 0.5", 800),
        "minecraft:emitter_shape_point": {
            "offset": [f"({col} ? math.cos({kc} * 60 + variable.yaw) * variable.r * 0.55 : math.cos({R1} * 360) * variable.r * {R2})", 0.1,
                       f"({col} ? math.sin({kc} * 60 + variable.yaw) * variable.r * 0.55 : math.sin({R1} * 360) * variable.r * {R2})"],
            "direction": [f"({R1} - 0.5) * 0.15", 1, f"({R3} - 0.5) * 0.15"]},
        "minecraft:particle_initial_speed": f"{col} ? 9 + {R3} * 4 : 3 + {R3} * 3",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -9, 0], "linear_drag_coefficient": 0.4},
        **look("0.32", fade_in=0.05),
    })
    # 소용돌이 곡선 베기: 3갈래 호가 돌며 바깥으로 번짐
    ka = f"math.floor({R2} * 3)"
    sw = f"(variable.emitter_age * variable.spin + {ka} * 120 + {R1} * 70)"
    rad = f"(variable.r * (0.45 + 0.55 * {U}) * (0.9 + {R1} * 0.15))"
    part("vfx_swirl", {
        **steady(1400, "math.max(0.1, variable.dur)", f"0.28 + {R3} * 0.12", 900),
        "minecraft:emitter_shape_point": {"offset": [f"math.cos({sw}) * {rad}", f"0.25 + {R3} * 0.5 * variable.h", f"math.sin({sw}) * {rad}"]},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        **look("0.3", fade_in=0.05),
    })
    # 불티
    part("vfx_ember", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": "variable.r", "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"0.6 + {R4} * 0.8"},
        "minecraft:particle_initial_speed": f"1 + {R3} * 3",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 3, 0], "linear_drag_coefficient": 1.5},
        **look("0.16", flicker=True, fade_in=0.05),
    }, tex="rpg_spark")
    part("vfx_flash", {
        "minecraft:emitter_rate_instant": {"num_particles": 2},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        **look("3", fade_in=0.05),
    })
    print("vfx ok")


if __name__ == "__main__":
    main()
