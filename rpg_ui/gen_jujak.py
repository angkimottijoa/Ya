"""주작의 활 (V6.5) — 불 파티클 + 사용자 그림(활·큰 불화살) 점 찍기 + 무기 아이템
  jj_bow       활 그림 (시위는 지움 → 스크립트가 당기는 시위를 따로 그림)
  jj_bigarrow  큰 불화살 그림 (가로로 눕힘, 화살촉 = 오른쪽)
  jj_ember     불티 뭉치 (노랑 → 주황 → 빨강 → 검붉게, 위로 떠오름)
  jj_trail     불꽃 줄 (u 방향 길이 r, 앞쪽 밝게)
  jj_boom      불 폭발 뭉게 (백호 폭발 뭉게 플립북을 불색으로)
  jj_ring      불 폭발 원 (작게 시작해 점점 커짐)
"""
import json, math
from collections import deque
from pathlib import Path
from PIL import Image, ImageFilter

ROOT = Path(__file__).parent
TEXD = ROOT / "resource_pack" / "textures" / "particle"
OUT = ROOT / "resource_pack" / "particles"
AGE = "(variable.particle_age / variable.particle_lifetime)"
R1, R2, R3, R4 = (f"variable.particle_random_{i}" for i in (1, 2, 3, 4))
FIRE = {"0.0": "#FFFFF8D0", "0.2": "#FFFFDC50", "0.42": "#FFFF9A1E", "0.65": "#FFEB4410", "0.85": "#FFA0140A", "1.0": "#FF3C0804"}
CELL = 4


def part(name, comps, tex="textures/particle/particles", material="particles_alpha"):
    d = {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": f"rpg:{name}", "basic_render_parameters": {"material": material, "texture": tex}},
        "components": comps}}
    (OUT / f"rpg_{name}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1))


def cutout(path):
    im = Image.open(path).convert("RGBA")
    W, H = im.size
    px = im.load()
    bg = lambda c: min(c[0], c[1], c[2]) > 232
    seen = bytearray(W * H)
    q = deque([(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] + [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)])
    while q:
        x, y = q.popleft()
        i = y * W + x
        if seen[i]:
            continue
        seen[i] = 1
        if not bg(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]:
                q.append((nx, ny))
    return im


def shrink(im, target_w):
    w, h = im.size
    small = im.resize((target_w, max(1, round(h * target_w / w))), Image.LANCZOS)
    sp = small.load()
    n = 0
    for y in range(small.size[1]):
        for x in range(small.size[0]):
            r, g, b, a = sp[x, y]
            if a < 110:
                sp[x, y] = (0, 0, 0, 0)
            else:
                sp[x, y] = (r, g, b, 255); n += 1
    return small, n


def save_tex(small, name, smoke=False):
    if smoke:  # 연기 점: 픽셀마다 듬성듬성한 뭉치(4종), 칸 8
        import random
        rnd = random.Random(9)
        clumps = []
        for _ in range(4):
            clumps.append([(i, j) for j in range(8) for i in range(8) if rnd.random() < max(0.0, 1.0 - (((i - 3.5) ** 2 + (j - 3.5) ** 2) ** 0.5) * 0.2)])
        big = Image.new("RGBA", (small.size[0] * 8, small.size[1] * 8), (0, 0, 0, 0))
        bp, sp = big.load(), small.load()
        for y in range(small.size[1]):
            for x in range(small.size[0]):
                c = sp[x, y]
                if c[3]:
                    for i, j in clumps[(x * 7 + y * 13) % 4]:
                        bp[x * 8 + i, y * 8 + j] = c
        big.save(TEXD / f"{name}.png")
    else:
        small.resize((small.size[0] * CELL, small.size[1] * CELL), Image.NEAREST).save(TEXD / f"{name}.png")
    prev = Image.new("RGBA", small.size, (60, 70, 90, 255)); prev.alpha_composite(small)
    prev.resize((small.size[0] * 5, small.size[1] * 5), Image.NEAREST).save(ROOT / "docs" / f"{name}_preview.png")


def img_part(name, tex, IW, IH, smoke=False):
    C = 8 if smoke else CELL
    bx, by = f"math.floor({R1} * {IW})", f"math.floor({R2} * {IH})"
    lx, ly = f"(({bx} - variable.cx) * variable.scale)", f"((variable.cy - {by}) * variable.scale)"
    part(name, {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {lx} + variable.v.{c} * {ly}" for c in "xyz"], "direction": [f"({R3} - 0.5)", 1, f"({R1} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
        # 연기 점이면 천천히 피어오르며 커짐
        "minecraft:particle_initial_speed": f"0.05 + {R3} * 0.15" if smoke else 0,
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.35, 0], "linear_drag_coefficient": 1.5} if smoke else {},
        "minecraft:particle_appearance_billboard": {"size": [f"variable.scale * (1.9 if smoke else 1.5) * variable.size * (0.9 + {AGE} * 0.3)".replace("(1.9 if smoke else 1.5)", "1.9" if smoke else "1.5")] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": IW * C, "texture_height": IH * C, "uv": [f"{bx} * {C}", f"{by} * {C}"], "uv_size": [C, C]}},
    }, tex=f"textures/particle/{tex}")


def main():
    meta = {}
    # ── 큰 불화살: 주축을 가로로, 화살촉 오른쪽
    im = cutout(ROOT / "art" / "jujak_arrow_ref.png")
    px = im.load(); W, H = im.size
    pts = [(x, y) for y in range(0, H, 3) for x in range(0, W, 3) if px[x, y][3]]
    mx = sum(p[0] for p in pts) / len(pts); my = sum(p[1] for p in pts) / len(pts)
    sxx = sum((p[0] - mx) ** 2 for p in pts); syy = sum((p[1] - my) ** 2 for p in pts); sxy = sum((p[0] - mx) * (p[1] - my) for p in pts)
    ang = 0.5 * math.degrees(math.atan2(2 * sxy, sxx - syy))
    im = im.rotate(ang, expand=True, resample=Image.BICUBIC); im = im.crop(im.getbbox())
    small, n = shrink(im, 120)
    sp = small.load(); Wd = small.size[0]
    def far(x0, x1):  # 오른쪽 끝이 뾰족(화살촉): 맨 끝 열들의 높이가 좁음
        ys = [y for x in range(x0, x1) for y in range(small.size[1]) if sp[x, y][3]]
        return (max(ys) - min(ys)) if ys else 0
    if far(Wd - 4, Wd) > far(0, 4):
        small = small.transpose(Image.FLIP_LEFT_RIGHT); sp = small.load()
    save_tex(small, "rpg_jj_bigarrow", smoke=True)
    IW, IH = small.size
    meta["ARROW"] = {"iw": IW, "ih": IH, "cx": 0, "cy": IH // 2, "filled": n, "fill": round(n / (IW * IH), 3)}
    img_part("jj_bigarrow", "rpg_jj_bigarrow", IW, IH, smoke=True)
    # ── 활: 시위(가는 선)와 화살은 지우고 활 몸만
    im = cutout(ROOT / "art" / "jujak_bow_ref.png")
    # 시위로 둘러싸인 안쪽 흰 배경도 지움: 큰 흰 덩어리(1500픽셀 이상)는 배경
    px = im.load(); W, H = im.size
    seen = bytearray(W * H)
    for y0 in range(H):
        for x0 in range(W):
            c = px[x0, y0]
            if seen[y0 * W + x0] or not c[3] or min(c[:3]) <= 232:
                continue
            comp, dq = [], deque([(x0, y0)]); seen[y0 * W + x0] = 1
            while dq:
                a, b = dq.popleft(); comp.append((a, b))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = a + dx, b + dy
                    if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]:
                        cc = px[nx, ny]
                        if cc[3] and min(cc[:3]) > 232:
                            seen[ny * W + nx] = 1; dq.append((nx, ny))
            if len(comp) > 1500:
                for a, b in comp:
                    px[a, b] = (0, 0, 0, 0)
    alpha = im.split()[3]
    opened = alpha.filter(ImageFilter.MinFilter(11)).filter(ImageFilter.MaxFilter(17))  # 가는 선은 사라지고 굵은 몸은 남음
    a2, op = alpha.load(), opened.load()
    px = im.load(); W, H = im.size
    for y in range(H):
        for x in range(W):
            if px[x, y][3] and op[x, y] < 128:
                px[x, y] = (0, 0, 0, 0)
    # 왼쪽의 작은 화살(시위에 걸린 것) 제거: 활 몸에서 떨어진 덩어리 → 가장 큰 덩어리만 남김
    W, H = im.size
    lab = [[0] * W for _ in range(H)]
    best, best_id, cur = 0, 0, 0
    sizes = {}
    for y in range(H):
        for x in range(W):
            if px[x, y][3] and not lab[y][x]:
                cur += 1; cnt = 0; dq = deque([(x, y)]); lab[y][x] = cur
                while dq:
                    a, b = dq.popleft(); cnt += 1
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = a + dx, b + dy
                        if 0 <= nx < W and 0 <= ny < H and px[nx, ny][3] and not lab[ny][nx]:
                            lab[ny][nx] = cur; dq.append((nx, ny))
                sizes[cur] = cnt
    keep = max(sizes, key=sizes.get)
    for y in range(H):
        for x in range(W):
            if px[x, y][3] and lab[y][x] != keep:
                px[x, y] = (0, 0, 0, 0)
    im = im.crop(im.getbbox())
    small, n = shrink(im, 72)
    save_tex(small, "rpg_jj_bow", smoke=True)
    sp = small.load(); IW, IH = small.size
    op_ = [(x, y) for y in range(IH) for x in range(IW) if sp[x, y][3]]
    top = min(op_, key=lambda p: (p[1], p[0])); bot = max(op_, key=lambda p: (p[1], -p[0]))
    # 활 끝: 위·아래 끝 중 왼쪽(시위 쪽)에 가까운 점
    top = min([p for p in op_ if p[1] < IH * 0.18], key=lambda p: p[0])
    bot = min([p for p in op_ if p[1] > IH * 0.82], key=lambda p: p[0])
    mid = [p for p in op_ if abs(p[1] - IH / 2) < IH * 0.06]
    hx = sum(p[0] for p in mid) / len(mid)
    meta["BOW"] = {"iw": IW, "ih": IH, "cx": round(hx), "cy": IH // 2, "filled": n, "fill": round(n / (IW * IH), 3),
                   "top": list(top), "bot": list(bot)}
    img_part("jj_bow", "rpg_jj_bow", IW, IH, smoke=True)
    # 아이콘 (32x32): 활 그림
    ic = small.copy(); ic.thumbnail((32, 32), Image.LANCZOS)
    icon = Image.new("RGBA", (32, 32), (0, 0, 0, 0)); icon.paste(ic, ((32 - ic.size[0]) // 2, (32 - ic.size[1]) // 2))
    ip = icon.load()
    for y in range(32):
        for x in range(32):
            r, g, b, a = ip[x, y]; ip[x, y] = (r, g, b, 255) if a >= 110 else (0, 0, 0, 0)
    icon.save(ROOT / "resource_pack" / "textures" / "items" / "rpg" / "jujak_bow.png")
    (ROOT / "behavior_pack" / "scripts" / "jujak_meta.js").write_text("// gen_jujak.py 가 만듦\nexport const JJ = " + json.dumps(meta) + ";\n")
    print("arrow", meta["ARROW"], "\nbow", meta["BOW"])
    # ── 불 파티클들
    part("jj_ember", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": "variable.r", "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.5 + {R2} * 0.7)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.3 + {R1} * 0.7)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 1.8, 0], "linear_drag_coefficient": 3},
        "minecraft:particle_appearance_billboard": {"size": [f"variable.size * (0.07 + {R3} * 0.07) * (1 - {AGE} * 0.7)"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 16, "texture_height": 16, "uv": [f"math.floor({R3} * 4) + 3", 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": f"math.clamp(variable.tone + {AGE} * 0.8 + ({R4} - 0.5) * 0.2, 0, 1)", "gradient": FIRE}},
    })
    part("jj_trail", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {R1} * variable.r + ({R2} - 0.5) * 0.08 * variable.size" for c in "xyz"], "direction": [0, 1, 0]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R4} * 0.5)"},
        "minecraft:particle_initial_speed": f"{R3} * 0.4",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 1.2, 0], "linear_drag_coefficient": 2},
        "minecraft:particle_appearance_billboard": {"size": [f"variable.size * (0.05 + {R1} * 0.07) * (1 - {AGE} * 0.6)"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 16, "texture_height": 16, "uv": [f"math.floor({R3} * 2) + 6", 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": f"math.clamp((1 - {R1}) * 0.75 + {AGE} * 0.5 + variable.tone, 0, 1)", "gradient": FIRE}},
    })
    flip = {"texture_width": 128, "texture_height": 16, "uv": [0, 0], "uv_size": [16, 16],
            "flipbook": {"base_UV": [0, 0], "size_UV": [16, 16], "step_UV": [16, 0], "max_frame": 8, "stretch_to_lifetime": True}}
    fire_tint = {"color": {"interpolant": f"math.clamp({AGE} * 0.9 + {R4} * 0.2 + variable.tone, 0, 1)", "gradient": FIRE}}
    part("jj_boom", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_sphere": {"radius": "variable.r", "direction": "outwards"},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.6 + {R2} * 0.6)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.3 + {R1} * 0.7)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 1.5, 0], "linear_drag_coefficient": 3.5},
        "minecraft:particle_appearance_billboard": {"size": [f"variable.size * (0.55 + {R3} * 0.6) * (0.75 + {AGE} * 0.4)"] * 2, "facing_camera_mode": "lookat_xyz", "uv": flip},
        "minecraft:particle_appearance_tinting": fire_tint,
    }, tex="textures/particle/rpg_bh_boom")
    ra = f"({R1} * 360)"
    part("jj_ring", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": [f"math.cos({ra}) * variable.r", f"{R2} * 0.3", f"math.sin({ra}) * variable.r"],
                                          "direction": [f"math.cos({ra})", f"0.08 + {R3} * 0.1", f"math.sin({ra})"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.85 + {R2} * 0.3)"},
        "minecraft:particle_initial_speed": f"variable.spd * (0.94 + {R4} * 0.12)",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 1, 0], "linear_drag_coefficient": 0.9},
        "minecraft:particle_appearance_billboard": {"size": [f"variable.size * (0.8 + {R3} * 0.5) * (0.8 + {AGE} * 0.5)"] * 2, "facing_camera_mode": "lookat_xyz", "uv": flip},
        "minecraft:particle_appearance_tinting": fire_tint,
    }, tex="textures/particle/rpg_bh_boom")
    # 깃털 칼날 (연기 점): u 방향 길이 r, v 쪽으로 h 만큼 휨, 가운데 두껍고 끝 뾰족, 뿌리 노랑 → 끝 빨강
    q = R1
    mid = f"math.sin({q} * 180)"
    smoke_look = lambda col: {
        "minecraft:particle_initial_speed": f"0.05 + {R4} * 0.2",
        "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, 0.5, 0], "linear_drag_coefficient": 1.5},
        "minecraft:particle_appearance_billboard": {"size": [f"variable.size * (0.07 + {R3} * 0.06) * (1 + {AGE} * 0.5)"] * 2, "facing_camera_mode": "lookat_xyz",
            "uv": {"texture_width": 16, "texture_height": 16, "uv": [f"math.floor({R3} * 2) + 6", 0], "uv_size": [1, 1]}},
        "minecraft:particle_appearance_tinting": {"color": {"interpolant": col, "gradient": FIRE}},
    }
    part("jj_feather", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": [f"variable.u.{c} * {q} * variable.r + variable.v.{c} * ({mid} * variable.h * variable.r + ({R2} - 0.5) * variable.thick * math.pow({mid}, 0.7))" for c in "xyz"],
                                          "direction": [f"({R3} - 0.5)", 1, f"({R2} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.75 + {R4} * 0.4)"},
        **smoke_look(f"math.clamp(variable.tone + {q} * 0.55 + math.abs({R2} - 0.5) * 0.35 + {AGE} * 0.3, 0, 1)"),
    })
    # 불 고리 (연기 점): u·v 면 위 반지름 r 원
    ang = f"({R1} * 360)"
    part("jj_circle", {
        "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
        "minecraft:emitter_lifetime_once": {"active_time": 0.05},
        "minecraft:emitter_shape_point": {"offset": [f"(variable.u.{c} * math.cos({ang}) + variable.v.{c} * math.sin({ang})) * (variable.r + ({R2} - 0.5) * variable.thick)" for c in "xyz"],
                                          "direction": [f"({R3} - 0.5)", 1, f"({R2} - 0.5)"]},
        "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.75 + {R4} * 0.4)"},
        **smoke_look(f"math.clamp(variable.tone + math.abs({R2} - 0.5) * 0.6 + {AGE} * 0.3, 0, 1)"),
    })
    item()
    print("jujak particles + item ok")


def item():
    atlas_p = ROOT / "resource_pack" / "textures" / "item_texture.json"
    atlas = json.loads(atlas_p.read_text())
    atlas["texture_data"]["rpg_jujak_bow"] = {"textures": "textures/items/rpg/jujak_bow"}
    atlas_p.write_text(json.dumps(atlas, ensure_ascii=False, indent=2))
    data = {"format_version": "1.21.40", "minecraft:item": {
        "description": {"identifier": "rpg:jujak_bow", "menu_category": {"category": "equipment", "group": "itemGroup.name.bow"}},
        "components": {
            "minecraft:icon": "rpg_jujak_bow",
            "minecraft:display_name": {"value": "§6§l주작의 활 §r§7[스킬 무기 · 모든 직업]"},
            "minecraft:max_stack_size": 1, "minecraft:hand_equipped": True, "minecraft:damage": 120,
            "minecraft:enchantable": {"slot": "bow", "value": 22}, "minecraft:glint": True,
            "minecraft:can_destroy_in_creative": False,
            "minecraft:use_modifiers": {"use_duration": 0.05, "movement_modifier": 1.0}}}}
    (ROOT / "behavior_pack" / "items" / "jujak_bow.json").write_text(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
