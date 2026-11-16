"""직업 스킬 파티클 생성기 (V2.7)

이미지(그림 텍스처)를 새로 그리지 않고, 바닐라 파티클 텍스처의 기본 점(generic)만 쓴다.
모양은 전부 Molang 수식으로 만든다 (Snowstorm 방식):
  - 원/고리: math.cos / math.sin 으로 원 위의 점
  - 베기 궤적: 시간(variable.emitter_age)에 따라 각도를 쓸어서 초승달을 그림
  - 나선: 각도 = 시간 * 속도, 높이 = 시간
  - 별(마법진): 오각별 꼭짓점 사이를 직선 보간
스크립트(skills.js)가 MolangVariableMap 으로 색/방향/크기를 넘긴다:
  variable.color (RGBA), variable.yaw (도), variable.radius, variable.len, variable.tilt, variable.size, variable.dir (xyz)
"""
import json
from pathlib import Path

OUT = Path(__file__).parent / "resource_pack" / "particles"
TEX = "textures/particle/particles"  # 바닐라 파티클 텍스처 (128x128)

AGE = "(variable.particle_age / variable.particle_lifetime)"
FADE = f"variable.color.a * (1 - {AGE})"


def billboard(size, uv=None, shrink=0.6, facing="rotate_xyz", env=False, hot=2.5):
    """size: 크기, env=True 면 sin 포락선(작게→크게→작게), 아니면 점점 줄어듦.
    색: 처음엔 흰 심(뜨거운 빛) → hot 배속으로 스킬 색에 섞임. 텍스처: 바닐라 atlas 0행 점 (frame 3~6)"""
    grow = f"math.sin({AGE} * 180)" if env else f"(1 - {shrink} * {AGE})"
    sz = f"({size} + variable.particle_random_3 * {size} * 0.5) * variable.size * {grow}"
    mix = f"math.min(1, {AGE} * {hot})"
    col = lambda c: f"1 - (1 - variable.color.{c}) * {mix}"
    return {
        "minecraft:particle_appearance_billboard": {
            "size": [sz, sz],
            "facing_camera_mode": facing,
            "uv": {"texture_width": 16, "texture_height": 16,
                   "uv": list(uv) if uv else ["math.floor(variable.particle_random_3 * 4) + 3", 0], "uv_size": [1, 1]},
        },
        "minecraft:particle_appearance_tinting": {"color": [col("r"), col("g"), col("b"), FADE]},
    }


def effect(name, comps, material="particles_add"):
    data = {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {
                "identifier": f"rpg:{name}",
                "basic_render_parameters": {"material": material, "texture": TEX},
            },
            "components": comps,
        },
    }
    (OUT / f"rpg_{name}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2))


def instant(n, life):
    return {
        "minecraft:emitter_rate_instant": {"num_particles": n},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:particle_lifetime_expression": {"max_lifetime": life},
    }


def sweep(rate, active, life, maxp=400):
    """active 초 동안 rate 개/초로 뿜으며 모양을 '그려 나간다'"""
    return {
        "minecraft:emitter_rate_steady": {"spawn_rate": rate, "max_particles": maxp},
        "minecraft:emitter_lifetime_once": {"active_time": active},
        "minecraft:particle_lifetime_expression": {"max_lifetime": life},
    }


def U(active):
    """0 → 1 진행도"""
    return f"math.clamp(variable.emitter_age / {active}, 0, 1)"


def motion(drag=0.0, acc=(0, 0, 0)):
    return {"minecraft:particle_motion_dynamic": {"linear_acceleration": list(acc), "linear_drag_coefficient": drag}}


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # 1) 충격파 고리: 원 둘레에서 바깥으로 퍼진다 (radius 만큼)
    effect("fx_ring", {
        **instant(72, 0.7),
        "minecraft:emitter_shape_disc": {"radius": 0.35, "surface_only": True, "plane_normal": "y", "direction": "outwards", "offset": [0, 0.15, 0]},
        "minecraft:particle_initial_speed": "variable.radius * 2.4",
        **motion(2.4),
        **billboard(0.11),
    })

    # 2) 바닥 마법진: 파티클마다 random_4 로 "어느 선"에 속할지 고른다 (yu 마법진 방식)
    #    바깥 원 2겹(시계) / 안쪽 원(반시계) / 육망성 = 삼각형 2개 / 룬 점(원 사이)
    #    v.d = 그려지는 진행도(0→1), v.a·v.b = 회전 각
    r1 = "variable.particle_random_1"
    r2 = "variable.particle_random_2"
    r4 = "variable.particle_random_4"
    jit = f"(1 + ({r2} - 0.5) * 0.04)"
    def tri(rot, rad, fn):
        k = f"math.floor({r1} * v.d * 3)"
        fr = f"({r1} * v.d * 3 - {k})"
        return f"({fn}(({rot}) + {k} * 120) * (1 - {fr}) + {fn}(({rot}) + {k} * 120 + 120) * {fr}) * {rad} * {jit}"
    def shape(fn):
        return (f"({r4} < 0.22 ? {fn}(v.a + {r1} * v.d * 360) * 1.0 * {jit} : "
                f"({r4} < 0.40 ? {fn}(v.a + {r1} * v.d * 360) * 0.9 * {jit} : "
                f"({r4} < 0.55 ? {fn}(v.b + {r1} * v.d * 360) * 0.55 * {jit} : "
                f"({r4} < 0.72 ? {tri('v.a + 90', '0.9', fn)} : "
                f"({r4} < 0.89 ? {tri('v.a + 270', '0.9', fn)} : "
                f"{fn}(math.floor({r1} * 12) * 30 + v.b) * 0.72 + {fn}({r2} * 360) * 0.03))))) * variable.radius")
    effect("fx_sigil", {
        "minecraft:emitter_initialization": {
            "creation_expression": "v.a = 0; v.b = 0; v.d = 0;",
            "per_update_expression": "v.a = variable.emitter_age * 40 + variable.yaw; v.b = -variable.emitter_age * 70; v.d = math.clamp(variable.emitter_age / 0.35, 0, 1);",
        },
        "minecraft:emitter_rate_steady": {"spawn_rate": 1800, "max_particles": 1200},
        "minecraft:emitter_lifetime_once": {"active_time": "math.max(0.6, variable.len)"},
        "minecraft:emitter_shape_point": {"offset": [shape("math.cos"), 0.06, shape("math.sin")], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.45 + variable.particle_random_3 * 0.2"},
        "minecraft:particle_initial_speed": 0.0,
        **motion(0, (0, f"{r4} > 0.89 ? 0.8 : 0", 0)),
        **billboard(0.07, env=True, hot=1.2),
    })

    # 2-b) 세워진 마법진 (시전 시 몸 앞): 같은 모양을 바라보는 방향(yaw)에 수직인 면에 그린다
    #      (참고 애드온은 방위별 파일 2개로 나눴지만, 여기선 yaw 로 회전시켜 하나로 처리)
    effect("fx_sigil_wall", {
        "minecraft:emitter_initialization": {
            "creation_expression": "v.a = 0; v.b = 0; v.d = 0;",
            "per_update_expression": "v.a = variable.emitter_age * 40; v.b = -variable.emitter_age * 70; v.d = math.clamp(variable.emitter_age / 0.35, 0, 1);",
        },
        "minecraft:emitter_rate_steady": {"spawn_rate": 1800, "max_particles": 1200},
        "minecraft:emitter_lifetime_once": {"active_time": "math.max(0.6, variable.len)"},
        "minecraft:emitter_shape_point": {"offset": [f"({shape('math.cos')}) * math.cos(variable.yaw)", f"{shape('math.sin')}", f"({shape('math.cos')}) * math.sin(variable.yaw)"], "direction": ["-math.sin(variable.yaw)", 0, "math.cos(variable.yaw)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "0.45 + variable.particle_random_3 * 0.2"},
        "minecraft:particle_initial_speed": 0.0,
        **motion(0, (0, f"{r4} > 0.89 ? 0.8 : 0", 0)),
        **billboard(0.07, env=True, hot=1.2),
    })

    # 4) 베기 궤적 (초승달): random_1 = 호 위의 위치, 진행도 u 까지만 그려져 "휘두르는" 느낌.
    #    두께는 가운데가 두껍고 양 끝이 얇게 (sin), tilt 로 대각선 베기
    a = 0.16
    u = U(a)
    t = f"(variable.particle_random_1 * {u})"
    ang = f"(variable.yaw + 85 - 170 * {t})"
    thick = f"(1 + (variable.particle_random_2 - 0.5) * 0.28 * math.sin({t} * 180))"
    effect("fx_slash", {
        **sweep(2600, a, 0.38, 600),
        "minecraft:emitter_shape_point": {
            "offset": [
                f"-math.sin({ang}) * variable.radius * {thick}",
                f"1.15 + math.sin(170 * {t} - 85) * variable.tilt + (variable.particle_random_2 - 0.5) * 0.1",
                f"math.cos({ang}) * variable.radius * {thick}",
            ],
            "direction": [f"-math.sin({ang})", 0.15, f"math.cos({ang})"],
        },
        "minecraft:particle_initial_speed": "0.6 + variable.particle_random_4 * 1.4",
        **motion(4, (0, -1.2, 0)),
        **billboard(0.09),
    })

    # 5) 직선 광선 (관통 사격 / 번개 창): dir 방향으로 len 만큼 그려 나간다
    a = 0.1
    u = U(a)
    effect("fx_beam", {
        **sweep(2400, a, 0.5, 300),
        "minecraft:emitter_shape_custom": {
            "offset": [
                f"variable.dir.x * variable.len * {u} + math.random(-0.06, 0.06)",
                f"variable.dir.y * variable.len * {u} + math.random(-0.06, 0.06)",
                f"variable.dir.z * variable.len * {u} + math.random(-0.06, 0.06)",
            ],
            "direction": ["math.random(-1, 1)", "math.random(-1, 1)", "math.random(-1, 1)"],
        },
        "minecraft:particle_initial_speed": 0.4,
        **motion(3),
        **billboard(0.07),
    })

    # 6) 나선 (버프 / 마나 집중): 두 가닥이 회전하며 올라감
    a = 0.6
    strand = "(math.mod(math.floor(variable.emitter_age * 400), 2) * 180)"
    ang = f"(variable.emitter_age * 1080 + {strand})"
    effect("fx_spiral", {
        **sweep(400, a, 0.7, 300),
        "minecraft:emitter_shape_custom": {
            "offset": [
                f"math.cos({ang}) * variable.radius",
                f"{U(a)} * 2.4",
                f"math.sin({ang}) * variable.radius",
            ],
            "direction": [0, 1, 0],
        },
        "minecraft:particle_initial_speed": 0.3,
        **motion(1),
        **billboard(0.08),
    })

    # 7) 빛기둥 (천벌 / 성역): 좁은 원 안에서 위로 솟구침
    effect("fx_pillar", {
        **sweep(260, 0.45, 0.8, 200),
        "minecraft:emitter_shape_disc": {"radius": "variable.radius * 0.35", "plane_normal": "y", "direction": [0, 1, 0]},
        "minecraft:particle_initial_speed": "5 + math.random(0, 5)",
        **motion(1.2),
        **billboard(0.1),
    })

    # 8) 상승 반짝임 (회복 / 버프 오라)
    effect("fx_rise", {
        **instant(36, 1.1),
        "minecraft:emitter_shape_disc": {"radius": "variable.radius", "plane_normal": "y", "direction": [0, 1, 0]},
        "minecraft:particle_initial_speed": "1 + math.random(0, 1.5)",
        **motion(1.5),
        **billboard(0.07, shrink=0.3),
    })

    # 9) 타격 불꽃: 사방으로 튀었다가 빠르게 멈춤
    effect("fx_spark", {
        **instant(26, 0.32),
        "minecraft:emitter_shape_sphere": {"radius": 0.2, "surface_only": True, "direction": "outwards"},
        "minecraft:particle_initial_speed": "6 + math.random(0, 4)",
        **motion(7),
        **billboard(0.05),
    })

    # 10) 구형 폭발 껍질
    effect("fx_sphere", {
        **instant(90, 0.6),
        "minecraft:emitter_shape_sphere": {"radius": 0.3, "surface_only": True, "direction": "outwards"},
        "minecraft:particle_initial_speed": "variable.radius * 3",
        **motion(3),
        **billboard(0.12),
    })

    # 11) 번개 (지그재그): 위에서 아래로 len 길이를 빠르게 그림, 좌우로 흔들림
    a = 0.08
    u = U(a)
    effect("fx_bolt", {
        **sweep(3000, a, 0.45, 300),
        "minecraft:emitter_shape_custom": {
            "offset": [
                f"math.sin({u} * 2200) * 0.35 + math.random(-0.08, 0.08)",
                f"variable.len * (1 - {u})",
                f"math.cos({u} * 1700) * 0.35 + math.random(-0.08, 0.08)",
            ],
            "direction": [0, 1, 0],
        },
        "minecraft:particle_initial_speed": 0.0,
        **motion(0),
        **billboard(0.1),
    })

    # 12) 파편 (지진 / 얼음): 위로 튀어 오른 뒤 중력으로 떨어짐
    effect("fx_shard", {
        **instant(34, 1.0),
        "minecraft:emitter_shape_disc": {"radius": "variable.radius", "plane_normal": "y", "direction": ["math.random(-0.4, 0.4)", 1, "math.random(-0.4, 0.4)"]},
        "minecraft:particle_initial_speed": "5 + math.random(0, 4)",
        **motion(0.5, (0, -22, 0)),
        "minecraft:particle_motion_collision": {"collision_radius": 0.05, "coefficient_of_restitution": 0.2, "collision_drag": 6},
        **billboard(0.08, shrink=0.3),
    }, material="particles_alpha")

    # 13) 잔상 연기 (대시 / 순간 이동)
    effect("fx_puff", {
        **instant(12, 0.55),
        "minecraft:emitter_shape_sphere": {"radius": 0.35, "direction": "outwards"},
        "minecraft:particle_initial_speed": 0.5,
        **motion(2),
        **billboard(0.22, shrink=-0.5, hot=0.6),
    }, material="particles_blend")

    print("particles ->", OUT)


if __name__ == "__main__":
    main()


# ═══════════════════════════════════════════════════════════════════════
# V2.9 MagicSpells(EffectLib) 이식용 파티클 — "redstone 먼지" 느낌 (작고 불투명, 색 그대로)
#   스크립트(ms.js)가 식의 계수를 MolangVariableMap 으로 넘기면 파티클이 그 식대로 점을 찍는다.
# ═══════════════════════════════════════════════════════════════════════
R1, R2, R3, R4 = (f"variable.particle_random_{i}" for i in (1, 2, 3, 4))


def dust(size=0.07):
    """레드스톤 먼지: 불투명, 색 그대로, 끝에서 작아지며 사라짐"""
    sz = f"variable.size * {size} * (0.75 + {R3} * 0.5) * (1 - math.pow({AGE}, 3))"
    return {
        "minecraft:particle_appearance_billboard": {
            "size": [sz, sz],
            "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 16, "texture_height": 16, "uv": [f"math.floor({R4} * 3) + 1", 0], "uv_size": [1, 1]},
        },
        "minecraft:particle_appearance_tinting": {"color": ["variable.color.r", "variable.color.g", "variable.color.b", 1]},
    }


def ms_common(shape, n="variable.n"):
    return {
        "minecraft:emitter_rate_steady": {"spawn_rate": f"{n} / math.max(0.05, variable.dur)", "max_particles": n},
        "minecraft:emitter_lifetime_once": {"active_time": "math.max(0.05, variable.dur)"},
        "minecraft:emitter_shape_point": shape,
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.4)"},
    }


def ms_effects():
    # t ∈ [0,1] : 그리기(draw)면 방출 시각 순서대로, 아니면 파티클마다 무작위 (한 번에 전체 모양)
    T = f"(variable.draw > 0.5 ? math.clamp(variable.emitter_age / math.max(0.05, variable.dur), 0, 1) : {R1})"

    def axis(k):
        trig = f"(variable.s{k} > 0.5 ? math.sin(variable.w{k} * {T} + variable.p{k}) : math.cos(variable.w{k} * {T} + variable.p{k}))"
        return f"((variable.a{k} + variable.g{k} * {T}) * {trig} + variable.b{k} * {T} + variable.c{k} + ({R2} - 0.5) * variable.jit)"

    lx, ly, lz = axis("x"), axis("y"), axis("z")
    # orient: 로컬 z = 바라보는 방향, 로컬 x = 오른쪽 (yaw 회전)
    X = f"(variable.ori > 0.5 ? (-{lx} * math.cos(variable.yaw) - {lz} * math.sin(variable.yaw)) : {lx})"
    Z = f"(variable.ori > 0.5 ? (-{lx} * math.sin(variable.yaw) + {lz} * math.cos(variable.yaw)) : {lz})"
    # 1) EquationEffect: x/y/z = (a + g·t)·sin|cos(w·t + p) + b·t + c
    effect("ms_curve", {
        **ms_common({"offset": [X, ly, Z], "direction": [0, 1, 0]}),
        "minecraft:particle_initial_speed": 0,
        **motion(0, (0, "variable.rise", 0)),
        **dust(),
    }, material="particles_alpha")

    # 2) Sphere / AnimatedBall / ModifiedEffect(radius = t·k): 타원체 껍질, grow 로 바깥으로 퍼짐
    th = f"({R1} * 360)"
    ph = f"(math.acos(1 - 2 * {R2}))"
    dx, dy, dz = f"(math.sin({ph}) * math.cos({th}))", f"math.cos({ph})", f"(math.sin({ph}) * math.sin({th}))"
    effect("ms_ball", {
        **ms_common({"offset": [f"{dx} * variable.r * variable.fx", f"{dy} * variable.r * variable.fy + variable.oy", f"{dz} * variable.r * variable.fz"],
                     "direction": [f"{dx} * variable.fx", f"{dy} * variable.fy", f"{dz} * variable.fz"]}),
        "minecraft:particle_initial_speed": "variable.grow",
        **motion(0, (0, "variable.rise", 0)),
        **dust(),
    }, material="particles_alpha")

    # 3) HelixEffect / VortexEffect: strands 가닥, 회전(twist)하며 올라가거나(h) 퍼짐(flare)
    k = f"math.floor({R2} * variable.strands)"
    ang = f"({k} * 360 / variable.strands + {T} * variable.twist + variable.yaw)"
    rad = f"(variable.r * (1 + variable.flare * {T}))"
    effect("ms_helix", {
        **ms_common({"offset": [f"{rad} * math.cos({ang})", f"variable.h * {T}", f"{rad} * math.sin({ang})"], "direction": [0, 1, 0]}),
        "minecraft:particle_initial_speed": 0,
        **motion(0, (0, "variable.rise", 0)),
        **dust(),
    }, material="particles_alpha")

    # 4) StarEffect: 가시(spike)들이 안쪽 반지름에서 바깥으로 뻗음 (방향은 황금각으로 고르게)
    k = f"math.floor({R2} * variable.spikes)"
    az = f"({k} * 137.508)"
    el = f"(math.mod({k} * 61.8, 160) - 80)"
    d = f"(variable.inner + {R1} * variable.h)"
    effect("ms_star", {
        **ms_common({"offset": [f"math.cos({el}) * math.cos({az}) * {d}", f"math.sin({el}) * {d}", f"math.cos({el}) * math.sin({az}) * {d}"], "direction": [0, 1, 0]}),
        "minecraft:particle_initial_speed": 0,
        **motion(0),
        **dust(),
    }, material="particles_alpha")


if __name__ == "__main__":
    ms_effects()
    print("ms particles ok")
