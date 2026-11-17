"""백호의 도끼 (V4.8~) — 흑백 파티클 + 무기 아이템
  bh_claw     할퀴기 자국: 옆에서 보면 ")" 로 휜 발톱 줄 dots 개, 한 번 호출로 획 순서대로 그어지는 애니메이션
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


def boom_texture():
    """폭발 뭉게 플립북 8프레임 (16x16씩, 가로로): 둥근 덩어리 → 위는 밝고 아래 오른쪽은 어두운 반달 그늘 → 점점 구멍 나며 사라짐"""
    import random, math
    rnd = random.Random(11)
    noise = [[rnd.random() for _ in range(16)] for _ in range(16)]
    im = Image.new("RGBA", (128, 16), (0, 0, 0, 0))
    for f in range(8):
        r = 7.6 - f * 0.25
        ero = max(0, f - 2) / 6.5          # 처음 3프레임은 꽉 찬 덩어리
        for y in range(16):
            for x in range(16):
                dx, dy = x - 7.5, y - 9.5      # 중심을 아래로 → 반구(돔)
                d = math.hypot(dx, dy * (1.25 if dy < 0 else 1.0))
                if d > r or dy > 3.5 or noise[y][x] < ero * (0.55 + d / r * 0.6):
                    continue
                lit = 1 - max(0, (dy + 4 + dx * 0.35) / (r + 4)) * 0.7 - f * 0.035
                if dy > 0.5 and d > r * 0.45:      # 아래쪽 반달 그늘
                    lit -= 0.25
                if -3 < dy < 1 and -4 < dx < 1 and d < r * 0.55 and f < 5:  # 안쪽 깊은 그늘 (사진의 어두운 반달)
                    lit -= 0.35
                v = max(0, min(255, int(255 * lit)))
                im.putpixel((f * 16 + x, y), (v, v, v, 255))
    im.save(ROOT / "resource_pack" / "textures" / "particle" / "rpg_bh_boom.png")


def main():
    boom_texture()
    # 1) 발톱 자국
    q = R1                                    # 획 위치 0 → 1 (그어지는 순서)
    i = f"math.floor({R2} * variable.dots)"   # 몇 번째 발톱
    mid = f"math.sin({q} * 180)"              # 가운데 1, 양 끝 0 → 뾰족
    lane = f"(({i} - (variable.dots - 1) / 2) * variable.thick)"
    wid = f"(({R3} - 0.5) * 0.3 * variable.size * (0.2 + {mid} * 0.8))"
    stag = f"({i} * 0.05 - variable.dots * 0.025)"  # 발톱마다 살짝 어긋나게
    # 발톱 줄 = 옆에서 보면 ")" — 가운데가 앞으로 나가고 양 끝이 플레이어 쪽으로 감기는 원호 (u·w 면)
    #   정면에서는 나란한 발톱 줄 (v 방향으로 간격), h = 호가 휘는 각도(도)
    span = "math.max(10, variable.h)"
    Rb = f"(variable.r / ({span} * 0.01745))"
    th = f"(({q} - 0.5 + {stag}) * {span})"
    along = f"({Rb} * math.sin({th}))"
    perp = f"({lane} + {wid})"
    bulge = f"({Rb} * (math.cos({th}) - 1))"
    delay = f"({q} * variable.dur + {i} * 0.012)"
    live = f"math.clamp((variable.particle_age - {delay}) / variable.life, 0, 1)"
    part("bh_claw", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {
            "offset": [f"variable.u.{c} * {along} + variable.v.{c} * {perp} + variable.w.{c} * {bulge}" for c in "xyz"],
            "direction": ["variable.w.x", f"variable.w.y + 0.3", "variable.w.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"{delay} + variable.life * (0.7 + {R4} * 0.45)"},
        "minecraft:particle_initial_speed": f"{R4} > 0.72 ? 0.8 + {R4} : 0",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, f"{R4} > 0.72 ? -7 : 0", 0], "linear_drag_coefficient": 3},
        "minecraft:particle_appearance_billboard": pix(
            f"variable.particle_age < {delay} ? 0 : variable.size * (0.07 + {mid} * 0.09) * (1 - {live} * 0.8)"),
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
    # 4) 그림 점 찍기 (백호 머리 · 도끼): 텍스처 rpg_bh_art 의 (x0,y0,iw,ih) 영역을 픽셀마다 점으로
    #   u = 그림 가로, v = 그림 세로(위), w = 그림 앞(볼록하게 튀어나옴 depth → 입체), 기준점 (cx, cy), scale = 픽셀당 블록
    CELL = 4
    _art = Image.open(ROOT / "resource_pack" / "textures" / "particle" / "rpg_bh_art.png")
    AWT, AHT = _art.size[0] // CELL, _art.size[1] // CELL
    bx, by = f"math.floor({R1} * variable.iw)", f"math.floor({R2} * variable.ih)"
    fx_ = f"({R1} * variable.iw - {bx} - 0.5)"
    lx = f"((variable.x0 + {bx} - variable.cx + {fx_} * 0.4) * variable.scale)"
    ly = f"((variable.cy - variable.y0 - {by}) * variable.scale)"
    d2 = f"(math.pow(({bx} - variable.iw / 2) / (variable.iw / 2), 2) + math.pow(({by} - variable.ih / 2) / (variable.ih / 2), 2))"
    lz = f"(math.sqrt(math.max(0, 1 - {d2})) * variable.depth + ({R3} - 0.5) * variable.scale * 1.5)"
    part("bh_art", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {lx} + variable.v.{c} * {ly} + variable.w.{c} * {lz}" for c in "xyz"], "direction": [f"({R3} - 0.5)", "1", f"({R4} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.4)"},
        "minecraft:particle_initial_speed": 0,
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": {
            "size": [f"variable.scale * 0.8 * variable.size"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": AWT * CELL, "texture_height": AHT * CELL,
                   "uv": [f"(variable.x0 + {bx}) * {CELL}", f"(variable.y0 + {by}) * {CELL}"], "uv_size": [CELL, CELL]}},
    }, tex="textures/particle/rpg_bh_art")
    # 5) 땅이 갈라지며 퍼지는 파문: 반지름이 시간에 따라 커지는 고리에서 흙덩이·먼지가 튀어 오름
    ra = f"({R1} * 360)"
    rr_ = "(variable.r + variable.emitter_age * variable.spd)"
    part("bh_ripple", {
        "minecraft:emitter_rate_steady": {"spawn_rate": "variable.n", "max_particles": 900},
        "minecraft:emitter_lifetime_once": {"active_time": "variable.life"},
        "minecraft:emitter_shape_point": {"offset": [f"math.cos({ra}) * {rr_}", f"{R2} * 0.3", f"math.sin({ra}) * {rr_}"],
                                          "direction": [f"math.cos({ra}) * 0.4", "1", f"math.sin({ra}) * 0.4"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"0.4 + {R4} * 0.5"},
        "minecraft:particle_initial_speed": f"2.5 + {R3} * 4",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, -16, 0], "linear_drag_coefficient": 0.8},
        "minecraft:particle_motion_collision": {"collision_radius": 0.1, "expire_on_contact": True},
        "minecraft:particle_appearance_billboard": pix(f"variable.size * (0.12 + {R3} * 0.14) * (1 - {AGE} * 0.4)"),
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": f"math.clamp(0.55 + {R2} * 0.45 - ({R4} > 0.8 ? 0.6 : 0), 0, 1)", "gradient": BW}},
    })
    # 6) 선 (땅 갈라짐 · 잔상 줄): u 방향 길이 r, 들쭉날쭉, tone 0 흰 ~ 1 검정
    part("bh_line", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {R1} * variable.r + variable.v.{c} * math.sin({R1} * 900 + variable.thick * 77) * 0.18 * variable.h" for c in "xyz"], "direction": ["variable.vd.x", "variable.vd.y", "variable.vd.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.8 + {R4} * 0.4)"},
        "minecraft:particle_initial_speed": "variable.vs",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": pix(f"variable.size * (0.1 + {R3} * 0.06) * (1 - {R1} * 0.6) * (1 - {AGE} * 0.5)"),
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": f"math.clamp(variable.tone + ({R2} - 0.5) * 0.3, 0, 1)", "gradient": BW}},
    })
    # 7) 검은 연기 (잔상 · 폭발 연기)
    part("bh_smoke", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": "variable.r", "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.7 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.3 + {R1} * 0.7)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.6, 0], "linear_drag_coefficient": 2.5},
        "minecraft:particle_appearance_billboard": {
            "size": [f"variable.size * (0.5 + {R3} * 0.5) * (0.6 + {AGE} * 0.9)"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 16, "texture_height": 16, "uv": [f"math.floor({R2} * 2) + 6", 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": [f"0.05 + {R1} * 0.12", f"0.05 + {R1} * 0.12", f"0.07 + {R1} * 0.12", f"0.85 - {AGE} * 0.8"]},
    }, material="particles_blend")
    # 8) 3D 백호 몸 덩어리: 타원체 겉면 (u 긴 축, v 위, w 옆 — 벡터 길이 = 반지름)
    #    흰 털 + 위에서 빛 받는 음영 + 검은 줄무늬(thick = 줄 빈도, 0 이면 없음, 배 쪽은 줄 없음), tone 1 = 검정 부위
    FUR = {"0.0": "#FFF6F6F8", "0.12": "#FFE6E7EB", "0.25": "#FFCDCFD5", "0.38": "#FFAEB1BA", "0.52": "#FF868A94", "0.66": "#FF5B5E67", "0.8": "#FF2E3036", "0.9": "#FF141417", "1.0": "#FF050505"}
    zz_ = f"({R1} * 2 - 1)"
    rr2 = f"math.sqrt(math.max(0, 1 - {zz_} * {zz_}))"
    yy_ = f"({rr2} * math.cos({R2} * 360))"
    ss_ = f"({rr2} * math.sin({R2} * 360))"
    kk_ = f"(0.97 + {R4} * 0.03)"  # 겉면에만 얇게 (속은 비움)
    # 줄무늬: 긴 축을 따라 세로 띠, 등에서 굵고 배 쪽으로 갈수록 가늘어져 끊김, 가장자리 들쭉날쭉
    sv = f"(math.sin({zz_} * variable.thick * 180 + {ss_} * 30 * {yy_} + {yy_} * 25 + math.sin({yy_} * 260 + {zz_} * 150) * 9 + variable.h) - (0.72 + (0.5 - {yy_} * 0.5) * 0.24))"
    stripe = f"(variable.thick != 0 && {yy_} > -0.45 && {sv} > 0)"
    stripe_edge = f"(variable.thick != 0 && {yy_} > -0.45 && {sv} > -0.05)"  # 줄무늬 가장자리는 회색으로 번짐
    # 명암: 겉면 법선(대략 중심→점 방향)과 빛 방향(위·약간 앞옆)의 내적. 1 = 밝음, -1 = 그늘
    nvec = [f"(variable.u.{c} * {zz_} + variable.v.{c} * {yy_} + variable.w.{c} * {ss_})" for c in "xyz"]
    nlen = f"math.sqrt({nvec[0]} * {nvec[0]} + {nvec[1]} * {nvec[1]} + {nvec[2]} * {nvec[2]} + 0.0001)"
    light = f"(({nvec[0]} * 0.35 + {nvec[1]} * 0.85 + {nvec[2]} * 0.4) / {nlen})"
    # 명암 합치기: 빛(밝은 면 0 ~ 그늘 0.62) + 맞닿는 곳·배 쪽 그늘(AO) + 부위 그늘(depth) + 털결 + 윗면 반사광
    ao = f"(math.pow(math.abs({zz_}), 6) * 0.2 + math.max(0, -{yy_}) * 0.16 + variable.depth * 0.18)"
    fur = f"(({R3} - 0.5) * 0.07 + math.sin({zz_} * 1100 + {ss_} * 420) * 0.035)"
    rim = f"({light} > 0.82 ? -0.12 : 0)"
    shade = f"(variable.tone + (1 - variable.tone) * (0.31 - {light} * 0.31 + {ao} + {fur} + {rim}))"
    part("bh_blob", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": [f"(variable.u.{c} * {zz_} + variable.v.{c} * {yy_} + variable.w.{c} * {ss_}) * {kk_}" for c in "xyz"], "direction": ["variable.vd.x", "variable.vd.y", "variable.vd.z"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.85 + {R3} * 0.3)"},
        "minecraft:particle_initial_speed": "variable.vs",
        "minecraft:particle_motion_dynamic": {},
        "minecraft:particle_appearance_billboard": {
            "size": [f"variable.size * (0.1 + {R3} * 0.05) * (1 - {AGE} * 0.25)"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 16, "texture_height": 16, "uv": [f"math.floor({R3} * 2) + 5", 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": {
            "interpolant": f"{stripe} ? 0.94 + {R4} * 0.06 : math.clamp({stripe_edge} ? 0.62 + {R4} * 0.1 : ({shade}), 0, 1)", "gradient": FUR}},
    })
    # 9) 폭발 뭉게: 플립북 (둥글게 부풀었다 구멍 나며 사라짐), tone 0 흰 ~ 1 검정
    flip = {"texture_width": 128, "texture_height": 16, "uv": [0, 0], "uv_size": [16, 16],
            "flipbook": {"base_UV": [0, 0], "size_UV": [16, 16], "step_UV": [16, 0], "max_frame": 8, "stretch_to_lifetime": True}}
    boom_col = f"(1 - math.clamp(variable.tone + ({R4} - 0.5) * 0.25, 0, 1) * 0.86)"
    part("bh_boom", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": "variable.r", "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R2} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.3 + {R1} * 0.7)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.8, 0], "linear_drag_coefficient": 3.5},
        "minecraft:particle_appearance_billboard": {"size": [f"variable.size * (0.55 + {R3} * 0.6) * (0.75 + {AGE} * 0.4)"] * 2, "facing_camera_mode": "lookat_xyz", "uv": flip},
        "minecraft:particle_appearance_tinting": {"color": [boom_col, boom_col, f"{boom_col} * 1.02", 1]},
    }, tex="textures/particle/rpg_bh_boom")
    # 10) 퍼지는 폭발: 반지름이 커지는 고리를 따라 폭발 뭉게가 연달아 터짐 (땅을 타고 번지는 폭발)
    wa = f"({R1} * 360)"
    wr = "(variable.r + variable.emitter_age * variable.spd)"
    part("bh_boomwave", {
        "minecraft:emitter_rate_steady": {"spawn_rate": "variable.n", "max_particles": 600},
        "minecraft:emitter_lifetime_once": {"active_time": "variable.dur"},
        "minecraft:emitter_shape_point": {"offset": [f"math.cos({wa}) * {wr}", f"{R2} * 0.6 * variable.size", f"math.sin({wa}) * {wr}"],
                                          "direction": [f"math.cos({wa}) * 0.3", "1", f"math.sin({wa}) * 0.3"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R2} * 0.6)"},
        "minecraft:particle_initial_speed": f"0.8 + {R1} * 1.5",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 1, 0], "linear_drag_coefficient": 3},
        "minecraft:particle_appearance_billboard": {"size": [f"variable.size * (0.6 + {R3} * 0.7) * (0.75 + {AGE} * 0.4)"] * 2, "facing_camera_mode": "lookat_xyz", "uv": flip},
        "minecraft:particle_appearance_tinting": {"color": [boom_col, boom_col, f"{boom_col} * 1.02", 1]},
    }, tex="textures/particle/rpg_bh_boom")
    # 11) 폭발 고리: 폭발 뭉게를 원 위에 한꺼번에 놓고 바깥으로 밀어 → 작은 원이 점점 커지는 강타 이펙트
    ra2 = f"({R1} * 360)"
    part("bh_boomring", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": [f"math.cos({ra2}) * variable.r", f"{R2} * 0.3", f"math.sin({ra2}) * variable.r"],
                                          "direction": [f"math.cos({ra2})", f"0.06 + {R3} * 0.08", f"math.sin({ra2})"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.85 + {R2} * 0.3)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.94 + {R4} * 0.12)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.6, 0], "linear_drag_coefficient": 0.9},
        "minecraft:particle_appearance_billboard": {"size": [f"variable.size * (0.8 + {R3} * 0.5) * (0.8 + {AGE} * 0.5)"] * 2, "facing_camera_mode": "lookat_xyz", "uv": flip},
        "minecraft:particle_appearance_tinting": {"color": [boom_col, boom_col, f"{boom_col} * 1.02", 1]},
    }, tex="textures/particle/rpg_bh_boom")
    item()
    print("baekho particles + item ok")


def item():
    """백호의 도끼 아이템 JSON + 아이콘 등록"""
    # 아이콘은 gen_baekho_art.py 가 사용자 그림으로 만듦 (textures/items/rpg/baekho_axe.png)
    atlas_p = ROOT / "resource_pack" / "textures" / "item_texture.json"
    atlas = json.loads(atlas_p.read_text())
    atlas["texture_data"].pop("rpg_baekho_claw", None)
    atlas["texture_data"]["rpg_baekho_axe"] = {"textures": "textures/items/rpg/baekho_axe"}
    atlas_p.write_text(json.dumps(atlas, ensure_ascii=False, indent=2))
    data = {"format_version": "1.21.40", "minecraft:item": {
        "description": {"identifier": "rpg:baekho_axe", "menu_category": {"category": "equipment", "group": "itemGroup.name.axe"}},
        "components": {
            "minecraft:icon": "rpg_baekho_axe",
            "minecraft:display_name": {"value": "§f§l백호의 도끼 §r§7[스킬 무기 · 모든 직업]"},
            "minecraft:max_stack_size": 1, "minecraft:hand_equipped": True, "minecraft:damage": 12,
            "minecraft:enchantable": {"slot": "sword", "value": 22}, "minecraft:glint": True,
            "minecraft:can_destroy_in_creative": False,
            "minecraft:use_modifiers": {"use_duration": 0.05, "movement_modifier": 1.0}}}}
    (ROOT / "behavior_pack" / "items" / "baekho_axe.json").write_text(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
