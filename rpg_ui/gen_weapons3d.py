"""손에 드는 3D 무기 (V12.14): 무기 그림 → 배경 제거 → 자루가 세로가 되게 돌림 → 픽셀마다 입체 블록(가운데일수록 두껍게)
  attachable(손에 들었을 때 모양) + geometry + 텍스처 + 1·3인칭 들기 애니. 인벤토리 아이콘은 그대로.
  혼돈의 낫 · 청룡의 창 · 백호의 도끼 · 주작의 활 · 현무의 방패(그림 없음 → 거북 등껍질 돔을 직접 만듦)
  들기 각도·위치는 아래 W 의 tp(3인칭) · fp(1인칭) 에서 조절
"""
import json, math
from collections import deque
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).parent
RP = ROOT / "resource_pack"
W = {
    # id, 그림, 긴 쪽 픽셀 수, 실제 길이(블록), 쥐는 곳(아래에서 비율), 날 쪽(위로 갈 쪽: "mass" = 무거운 끝), 1·3인칭
    "hundun_scythe": dict(item="rpg:hundun_scythe", src="hundun_scythe_ref.jpg", px=56, len=2.7, grip=0.28, kind="reap",
                          tp=dict(rot=[0, 0, 65], pos=[0, 0, 0], yaw=-90), fp=dict(rot=[0, 0, 0], pos=[0, 0, 0], scale=0.45)),
    "cheongryong_lance": dict(item="rpg:cheongryong_sword", src="cheongryong_lance_ref.png", px=84, len=3.4, grip=0.3, kind="thrust",
                          tp=dict(rot=[0, 0, 65], pos=[0, 0, 0], yaw=-90), fp=dict(rot=[0, 0, 0], pos=[0, 0, 0], scale=0.45)),
    "baekho_axe": dict(item="rpg:baekho_axe", src="baekho_axe3d_ref.jpg", px=64, len=2.4, grip=0.22, kind="chop",
                       tp=dict(rot=[0, 0, 65], pos=[0, 0, 0], yaw=-90), fp=dict(rot=[0, 0, 0], pos=[0, 0, 0], scale=0.45)),
    "jujak_bow": dict(item="rpg:jujak_bow", src="jujak_bow_ref.png", px=48, len=1.8, grip=0.5, kind="bow",
                      tp=dict(rot=[0, 0, 0], pos=[0, 0, 0]), fp=dict(rot=[0, 0, 0], pos=[0, 0, 0], scale=0.55)),
    "hyeonmu_shield": dict(item="rpg:hyeonmu_shield", src=None, px=24, len=1.3, grip=0.5, kind="bash",
                           tp=dict(rot=[0, 90, 0], pos=[0, 0, 0]), fp=dict(rot=[0, 90, 0], pos=[0, 0, 0], scale=0.6)),
}


def cutout(im):
    """흰 배경(가장자리에서 이어진 밝고 무채색) 제거 + 작은 떨어진 조각 제거"""
    im = im.convert("RGBA")
    Wd, Ht = im.size
    px = im.load()
    bg = lambda c: min(c[:3]) > 212 and max(c[:3]) - min(c[:3]) < 36
    seen = bytearray(Wd * Ht)
    q = deque([(x, 0) for x in range(Wd)] + [(x, Ht - 1) for x in range(Wd)] + [(0, y) for y in range(Ht)] + [(Wd - 1, y) for y in range(Ht)])
    while q:
        x, y = q.popleft()
        i = y * Wd + x
        if seen[i]: continue
        seen[i] = 1
        if not bg(px[x, y]) and px[x, y][3] > 20: continue
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < Wd and 0 <= ny < Ht and not seen[ny * Wd + nx]: q.append((nx, ny))
    # 안쪽에 갇힌 큰 흰 배경(활과 시위 사이 등)도 제거
    seen = bytearray(Wd * Ht)
    for y0 in range(Ht):
        for x0 in range(Wd):
            if seen[y0 * Wd + x0] or not (px[x0, y0][3] and bg(px[x0, y0])): continue
            pts = []; q = deque([(x0, y0)]); seen[y0 * Wd + x0] = 1
            while q:
                x, y = q.popleft(); pts.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < Wd and 0 <= ny < Ht and not seen[ny * Wd + nx] and px[nx, ny][3] and bg(px[nx, ny]):
                        seen[ny * Wd + nx] = 1; q.append((nx, ny))
            if len(pts) > Wd * Ht * 0.002:
                for x, y in pts: px[x, y] = (0, 0, 0, 0)
    return im.crop(im.getbbox())


SHELL_POLY = [(470, 140), (570, 175), (665, 245), (660, 430), (625, 620), (540, 770), (340, 860), (235, 760), (212, 560), (218, 360), (262, 220), (330, 170)]


def shell_only(src):
    """방패 그림에서 둘레의 청록 기운을 빼고 등껍질만 (원본 그림 좌표의 등껍질 윤곽 다각형 안쪽만 남김)"""
    mask = Image.new("L", src.size, 0); ImageDraw.Draw(mask).polygon(SHELL_POLY, fill=255)
    out = Image.new("RGBA", src.size, (0, 0, 0, 0)); out.paste(src.convert("RGBA"), (0, 0), mask)
    return out


def keep_big(im, frac=0.004):
    """작게 떨어져 떠 있는 조각(물방울 · 불티) 제거 → 손에 든 모델에 떠다니는 블록이 안 생기게"""
    Wd, Ht = im.size; px = im.load(); lab = [0] * (Wd * Ht); comps = []
    for y in range(Ht):
        for x in range(Wd):
            if px[x, y][3] < 128 or lab[y * Wd + x]: continue
            cid = len(comps) + 1; pts = []; q = deque([(x, y)]); lab[y * Wd + x] = cid
            while q:
                cx, cy = q.popleft(); pts.append((cx, cy))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < Wd and 0 <= ny < Ht and not lab[ny * Wd + nx] and px[nx, ny][3] >= 128:
                        lab[ny * Wd + nx] = cid; q.append((nx, ny))
            comps.append(pts)
    total = sum(len(c) for c in comps)
    for c in comps:
        if len(c) < total * frac:
            for x, y in c: px[x, y] = (0, 0, 0, 0)
    return im.crop(im.getbbox())


def upright(im):
    """주축(가장 긴 방향)이 세로가 되게 돌리고, 무거운 끝(날·창날)이 위로"""
    px = im.load(); Wd, Ht = im.size
    pts = [(x, y) for y in range(0, Ht, 2) for x in range(0, Wd, 2) if px[x, y][3] > 128]
    mx = sum(p[0] for p in pts) / len(pts); my = sum(p[1] for p in pts) / len(pts)
    sxx = sum((p[0] - mx) ** 2 for p in pts); syy = sum((p[1] - my) ** 2 for p in pts); sxy = sum((p[0] - mx) * (p[1] - my) for p in pts)
    ang = 0.5 * math.degrees(math.atan2(2 * sxy, sxx - syy))  # 주축 각도 (이미지 좌표)
    im = im.rotate(ang + 90, resample=Image.BICUBIC, expand=True)  # 주축 → 세로
    im = im.crop(im.getbbox())
    px = im.load(); Wd, Ht = im.size
    def mass(y0, y1): return sum(1 for y in range(y0, y1) for x in range(Wd) if px[x, y][3] > 128)
    if mass(0, Ht // 3) < mass(Ht - Ht // 3, Ht): im = im.rotate(180)
    return im


def shrink(im, long_px):
    Wd, Ht = im.size; k = long_px / max(Wd, Ht)
    sm = im.resize((max(1, round(Wd * k)), max(1, round(Ht * k))), Image.LANCZOS)
    p = sm.load()
    for y in range(sm.size[1]):
        for x in range(sm.size[0]):
            r, g, b, a = p[x, y]
            p[x, y] = (r, g, b, 255) if a > 80 else (0, 0, 0, 0)
    return sm


def shell_art(n=24):
    """현무의 방패: 거북 등껍질 (가운데 육각 판 + 둘레 판, 짙은 초록 · 검정 테 · 금빛 가장자리)"""
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0)); d = ImageDraw.Draw(im); c = (n - 1) / 2
    d.ellipse([0, 1, n - 1, n - 2], fill=(26, 58, 34, 255), outline=(196, 160, 70, 255))
    hexp = lambda cx, cy, r: [(cx + r * math.cos(math.radians(60 * k + 30)), cy + r * math.sin(math.radians(60 * k + 30))) for k in range(6)]
    d.polygon(hexp(c, c, n * 0.17), fill=(52, 104, 58, 255), outline=(12, 20, 14, 255))
    for k in range(6):
        a = math.radians(60 * k)
        d.polygon(hexp(c + math.cos(a) * n * 0.3, c + math.sin(a) * n * 0.3, n * 0.13), fill=(40, 86, 48, 255), outline=(12, 20, 14, 255))
    d.point([(c, c)], fill=(150, 220, 120, 255))
    return im


def depth_map(im, dome=False):
    """두께(픽셀): 가장자리 1, 안쪽으로 갈수록 2·3 (돔이면 가운데가 볼록)"""
    Wd, Ht = im.size; p = im.load(); INF = 99
    d = [[0 if p[x, y][3] == 0 else INF for x in range(Wd)] for y in range(Ht)]
    for _ in range(2):
        for y in range(Ht):
            for x in range(Wd):
                if d[y][x]:
                    best = d[y][x]
                    for dx, dy in ((-1, 0), (0, -1), (1, 0), (0, 1)):
                        nx, ny = x + dx, y + dy
                        v = d[ny][nx] if 0 <= nx < Wd and 0 <= ny < Ht else 0
                        best = min(best, v + 1)
                    d[y][x] = best
        for y in range(Ht - 1, -1, -1):
            for x in range(Wd - 1, -1, -1):
                if d[y][x]:
                    best = d[y][x]
                    for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                        nx, ny = x + dx, y + dy
                        v = d[ny][nx] if 0 <= nx < Wd and 0 <= ny < Ht else 0
                        best = min(best, v + 1)
                    d[y][x] = best
    out = [[0] * Wd for _ in range(Ht)]
    for y in range(Ht):
        for x in range(Wd):
            if not d[y][x]: continue
            if dome:
                r = math.hypot((x - (Wd - 1) / 2) / (Wd / 2), (y - (Ht - 1) / 2) / (Ht / 2))
                h = 1 + round(10 * math.sqrt(max(0, 1 - r * r)))  # 등껍질: 높은 둥근 돔
                cr, cg, cb2, _ = p[x, y]; lum = (cr + cg + cb2) / 3
                if lum > 150: h += 2      # 밝은 테두리 · 하이라이트는 도드라지게
                elif lum < 45: h -= 2     # 판 사이 어두운 홈은 파이게 → 등껍질 판이 하나하나 솟아 보임
                out[y][x] = max(1, h)
            else:
                out[y][x] = min(7, 2 * d[y][x] - 1)  # 둥근 단면: 그 자리 폭만큼 두껍게 (자루는 원통, 날은 가운데 볼록)
    return out


def build(name, cfg):
    if cfg["src"]:
        src = Image.open(ROOT / "art" / cfg["src"])
        if cfg.get("shell_only"): base = shell_only(src).crop(shell_only(src).getbbox())  # 윤곽으로만 자름 (밝은 테두리·하이라이트가 배경으로 지워지지 않게)
        else: base = keep_big(cutout(src), cfg.get("keep", 0.004))
        im = shrink(upright(base), cfg["px"])
        dm = depth_map(im, dome=cfg.get("dome", False))
    else:
        im = shell_art(cfg["px"]); dm = depth_map(im, dome=True)
    Wd, Ht = im.size
    aura = cfg.get("aura")
    if aura:  # 기운 색을 텍스처 오른쪽에 한 줄씩 덧붙임
        big = Image.new("RGBA", (Wd + len(aura["cols"]), Ht), (0, 0, 0, 0)); big.paste(im, (0, 0))
        for i, c in enumerate(aura["cols"]):
            for y in range(Ht): big.putpixel((Wd + i, y), (*c, 255))
        im_tex = big
    else: im_tex = im
    tex = f"textures/models/rpg_w3d_{name}"
    (RP / "textures" / "models").mkdir(parents=True, exist_ok=True)
    im_tex.save(RP / f"{tex}.png")
    u = cfg["len"] * 16 / max(Wd, Ht)  # 픽셀 하나 = u 단위 (16 단위 = 1블록)
    gx, gy = Wd / 2, Ht * (1 - cfg["grip"])  # 쥐는 곳 (그림 좌표)
    cubes = []
    for y in range(Ht):
        x = 0
        while x < Wd:
            t = dm[y][x]
            if not t: x += 1; continue
            x0 = x
            while x < Wd and dm[y][x] == t: x += 1
            w = x - x0
            T = t * u * (0.9 if cfg["src"] else 0.6)
            cubes.append({"origin": [round((x0 - gx) * u, 4), round((gy - y - 1) * u, 4), round(-T / 2, 4)], "size": [round(w * u, 4), round(u, 4), round(T, 4)],
                          "uv": {"north": {"uv": [x0, y], "uv_size": [w, 1]}, "south": {"uv": [x0 + w, y], "uv_size": [-w, 1]},
                                 "east": {"uv": [x0 + w - 1, y], "uv_size": [1, 1]}, "west": {"uv": [x0, y], "uv_size": [1, 1]},
                                 "up": {"uv": [x0, y], "uv_size": [w, 1]}, "down": {"uv": [x0, y], "uv_size": [w, 1]}}})
    if aura:  # 머리 둘레를 휘감는 기운 띠 (그림 면 밖으로 입체적으로 돎): 띠마다 나선 호, 가운데 굵고 끝 가늘게
        head_y = Ht * 0.18
        for rb in range(aura["ribbons"]):
            off = rb * 360 / aura["ribbons"]
            N = 64
            for k in range(N):
                sk = k / (N - 1)
                th = math.radians(off + sk * 250)
                rad = Wd * (0.55 + 0.25 * math.sin(sk * math.pi))
                yy = head_y + (sk - 0.5) * Ht * 0.42
                X, Z = rad * math.cos(th), rad * math.sin(th) * 0.9
                w = 2.6 * math.sin(sk * math.pi) + 0.6
                col = Wd + (2 if k % 9 == 0 else 0 if sk > 0.5 else 1 if sk > 0.2 else 3)
                cubes.append({"origin": [round((X - gx + Wd / 2) * u - w * u / 2, 4) if False else round((X) * u - w * u / 2, 4), round((gy - yy) * u, 4), round(Z * u - w * u / 2, 4)],
                              "size": [round(w * u, 4), round(u * 1.1, 4), round(w * u, 4)],
                              "uv": {f: {"uv": [col, int(yy) % Ht], "uv_size": [1, 1]} for f in ("north", "south", "east", "west", "up", "down")}})
    geo = {"format_version": "1.16.0", "minecraft:geometry": [{
        "description": {"identifier": f"geometry.rpg_w3d_{name}", "texture_width": im_tex.size[0], "texture_height": Ht,
                        "visible_bounds_width": 6, "visible_bounds_height": 6, "visible_bounds_offset": [0, 1, 0]},
        "bones": [{"name": "rpg_w3d", "pivot": [0, 0, 0], "binding": "q.item_slot_to_bone_name(context.item_slot)"},
                  {"name": "turn", "parent": "rpg_w3d", "pivot": [0, 0, 0]},  # 옆으로(수평) 돌리기 전용
                  {"name": "body", "parent": "turn", "pivot": [0, 0, 0], "cubes": cubes}]}]}
    (RP / "models" / "entity").mkdir(parents=True, exist_ok=True)
    (RP / "models" / "entity" / f"rpg_w3d_{name}.geo.json").write_text(json.dumps(geo, separators=(",", ":")))
    att = {"format_version": "1.10.0", "minecraft:attachable": {"description": {
        "identifier": cfg["item"],
        "materials": {"default": "entity_alphatest", "enchanted": "entity_alphatest_glint"},
        "textures": {"default": tex, "enchanted": "textures/misc/enchanted_item_glint"},
        "geometry": {"default": f"geometry.rpg_w3d_{name}"},
        "animations": {"fp": f"animation.rpg_w3d.{name}.fp", "tp": f"animation.rpg_w3d.{name}.tp"},
        "scripts": {"pre_animation": ["v.atk = c.owning_entity->v.attack_time ?? 0;", "v.a = math.clamp(v.atk, 0, 1);", "v.up = math.clamp(v.a / 0.3, 0, 1);", "v.dn = math.clamp((v.a - 0.3) / 0.4, 0, 1);", "v.rec = math.clamp((v.a - 0.7) / 0.3, 0, 1);"],
                    "animate": [{"fp": "c.is_first_person"}, {"tp": "!c.is_first_person"}]},
        "render_controllers": ["controller.render.item_default"]}}}
    (RP / "attachables").mkdir(parents=True, exist_ok=True)
    (RP / "attachables" / f"{name}.json").write_text(json.dumps(att, ensure_ascii=False, indent=1))
    anims = {}
    for k in ("fp", "tp"):
        c = cfg[k]; m = 1 if k == "fp" else 0.6
        # 때리기 3단: 준비(0~0.3 뒤로 젖힘) → 내려침(0.3~0.7) → 되돌림(0.7~1) · v.up / v.dn / v.rec (0→1)
        # 손 슬롯 축 (스크린샷 V12.20·V12.21 로 확인): 로컬 Z + 회전 = 끝이 몸 왼쪽으로 눕음, turn 뼈 Y + = 몸 뒤쪽으로 → 앞은 -.
        # 3인칭 기본 = Z 65 (수평보다 25° 위) + turn -90 (왼쪽 → 앞) = 마크 기본 검·도끼처럼 앞을 향해 듦
        rx, ry, rz = c["rot"]; px_, py_, pz_ = c["pos"]
        idle_r = "math.sin(q.life_time * 110) * 2.5"
        idle_p = "math.sin(q.life_time * 170) * 0.25"
        kind = cfg.get("kind", "chop")
        if kind == "reap":   # 낫: 뒤로 크게 젖혔다가 수평으로 크게 베어 넘김
            rot = [f"{rx}", f"{ry} + (v.up * 70 - v.dn * 170 + v.rec * 100) * {m}", f"{rz} + {idle_r} + (-v.up * 35 + v.dn * 60 - v.rec * 25) * {m}"]; pos = [f"{px_}", f"{py_} + {idle_p}", f"{pz_}"]
        elif kind == "thrust":  # 창: 뒤로 당겼다가 앞으로 쭉 찌르고 돌아옴
            rot = [f"{rx}", f"{ry} + (v.up * 10 - v.dn * 10) * {m}", f"{rz} + {idle_r} + (-v.up * 20 + v.dn * 35 - v.rec * 15) * {m}"]; pos = [f"{px_} + (v.up * 3 - v.dn * 10 + v.rec * 7) * {m}", f"{py_} + {idle_p}", f"{pz_}"]
        elif kind == "chop":    # 도끼: 머리 위로 크게 들었다가 아래로 내려찍음
            rot = [f"{rx} + (v.dn * 15 - v.rec * 15) * {m}", f"{ry}", f"{rz} + {idle_r} + (-v.up * 80 + v.dn * 160 - v.rec * 80) * {m}"]; pos = [f"{px_}", f"{py_} + {idle_p} + (v.up * 2 - v.dn * 3 + v.rec * 1) * {m}", f"{pz_}"]
        elif kind == "bow":     # 활: 쏘면 반동으로 살짝 튐
            rot = [f"{rx}", f"{ry}", f"{rz} + {idle_r} + (-v.dn * 12 + v.rec * 12) * {m}"]; pos = [f"{px_} + (v.dn * 1.5 - v.rec * 1.5) * {m}", f"{py_} + {idle_p}", f"{pz_}"]
        else:                   # 방패: 앞으로 밀쳐 침
            rot = [f"{rx}", f"{ry} + (v.dn * 12 - v.rec * 12) * {m}", f"{rz} + {idle_r}"]; pos = [f"{px_} + (v.up * 2 - v.dn * 7 + v.rec * 5) * {m}", f"{py_} + {idle_p}", f"{pz_}"]
        b = {"rotation": rot, "position": pos}
        if "scale" in c: b["scale"] = c["scale"]
        bones = {"body": b}
        if c.get("yaw"): bones["turn"] = {"rotation": [0, c["yaw"], 0]}  # 눕힌 무기를 옆으로 90° → 바라보는 쪽
        anims[f"animation.rpg_w3d.{name}.{k}"] = {"loop": True, "bones": bones}
    return anims, len(cubes), (Wd, Ht)


def main():
    allan = {}
    for name, cfg in W.items():
        an, n, sz = build(name, cfg); allan.update(an)
        print(f"{name}: {sz[0]}x{sz[1]} px, {n} cubes")
    (RP / "animations" / "rpg_w3d.animation.json").write_text(json.dumps({"format_version": "1.8.0", "animations": allan}, indent=1))


if __name__ == "__main__":
    main()
