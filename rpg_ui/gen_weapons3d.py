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
    "hundun_scythe": dict(item="rpg:hundun_scythe", src="hundun_scythe_ref.jpg", px=56, len=2.7, grip=0.35, kind="reap", flipup=True,
                          tp=dict(rot=[0, 0, 0], pos=[0, 0, 0]), fp=dict(rot=[-90, 0, 0], pos=[0, 0, 0], scale=0.45), vanilla=True),
    "cheongryong_lance": dict(item="rpg:cheongryong_sword", src="cheongryong_lance_ref.png", px=136, maxd=11, len=3.4, grip=0.3, kind="thrust",
                          tp=dict(rot=[0, 0, 0], pos=[0, 0, 0]), fp=dict(rot=[-90, 0, 0], pos=[0, 0, 0], scale=0.45), vanilla=True),
    "baekho_axe": dict(item="rpg:baekho_axe", src="baekho_axe3d_ref.jpg", px=104, maxd=11, len=2.4, grip=0.3, kind="chop",
                       tp=dict(rot=[0, 0, 0], pos=[0, 0, 0]), fp=dict(rot=[-90, 0, 0], pos=[0, 0, 0], scale=0.45), vanilla=True),
    "jujak_bow": dict(item="rpg:jujak_bow", src="jujak_bow_ref.png", px=78, maxd=11, len=1.8, grip=0.5, kind="bow", bowside=True,
                      tp=dict(rot=[0, 0, 0], pos=[0, 0, 0]), fp=dict(rot=[0, 0, 0], pos=[0, 0, 0], scale=0.55)),
    # 1차 직업 도구 (V12.91): 덜 화려하게 · 블록 적게
    "t1_warrior": dict(item="rpg:jt_warrior", src="t1_warrior.png", flip180=True, px=34, maxd=5, len=1.25, grip=0.13, kind="chop", vanilla=True,
                       tp=dict(rot=[0, 0, 0], pos=[0, 0, 0]), fp=dict(rot=[0, 0, 0], pos=[0, 0, 0], scale=0.5)),
    "t1_mage": dict(item="rpg:jt_mage", src="t1_mage.png", px=40, maxd=5, len=1.8, grip=0.3, kind="thrust", vanilla=True,
                    tp=dict(rot=[0, 0, 0], pos=[0, 0, 0]), fp=dict(rot=[0, 0, 0], pos=[0, 0, 0], scale=0.5)),
    "t1_archer": dict(item="rpg:jt_archer", src="t1_archer.png", mirror=True, string=(222, 206, 160), px=36, maxd=5, len=1.4, grip=0.5, kind="bow", bowside=True,
                      tp=dict(rot=[0, 0, 0], pos=[0, 0, 0]), fp=dict(rot=[0, 0, 0], pos=[0, 0, 0], scale=0.55)),
    "t1_cleric": dict(item="rpg:jt_cleric", src="t1_cleric.png", px=26, maxd=3, len=0.75, grip=0.5, kind="tome", noupright=True,
                      tp=dict(rot=[0, 0, 0], pos=[0, 0, 0]), fp=dict(rot=[0, 0, 0], pos=[0, 0, 0], scale=0.5)),
    # 2차 직업 도구 (V12.92): 1차보다 화려하게 · 블록 더 많이
    "t2_swordmaster": dict(item="rpg:jt_swordmaster", src="t2_swordmaster.png", px=56, maxd=7, len=1.55, grip=0.1, kind="chop", vanilla=True),
    "t2_berserker": dict(item="rpg:jt_berserker", src="t2_berserker.png", px=60, maxd=9, len=1.8, grip=0.1, kind="chop", vanilla=True),
    "t2_hunter": dict(item="rpg:jt_hunter", src="t2_hunter.png", mirror=True, string=(200, 190, 170), px=56, maxd=7, len=1.6, grip=0.5, kind="bow", bowside=True),
    "t2_sniper": dict(item="rpg:jt_sniper", src="t2_sniper.png", string=(230, 220, 160), px=56, maxd=7, len=1.6, grip=0.5, kind="bow", bowside=True),
    "t2_elementalist": dict(item="rpg:jt_elementalist", src="t2_elementalist.png", px=40, maxd=4, len=0.85, grip=0.5, kind="tome", noupright=True),
    "t2_stormcaller": dict(item="rpg:jt_stormcaller", src="t2_stormcaller.png", px=64, maxd=7, len=2.1, grip=0.3, kind="thrust", vanilla=True),
    "t2_paladin": dict(item="rpg:jt_paladin", src="t2_paladin.png", flip180=True, px=56, maxd=7, len=1.45, grip=0.12, kind="chop", vanilla=True),
    "t2_priest": dict(item="rpg:jt_priest", src="t2_priest.png", px=40, maxd=4, len=0.85, grip=0.5, kind="tome", noupright=True),
    "hyeonmu_shield": dict(item="rpg:hyeonmu_shield", src="hyeonmu_shield_v2.png", px=56, len=1.45, grip=0.5, kind="bash", dome=True, keep=0.002, noupright=True, stretch_y=1.35, dome_h=18, shell=True, handle=True,
                           tp=dict(rot=[0, 90, 0], pos=[0, 0, 0]), fp=dict(rot=[0, 90, 0], pos=[0, 0, 0], scale=0.6)),
}


def cutout(im, thr=212, sat=36):
    """흰 배경(가장자리에서 이어진 밝고 무채색) 제거 + 작은 떨어진 조각 제거 (thr·sat: 밝은 칼날은 더 엄격하게)"""
    im = im.convert("RGBA")
    Wd, Ht = im.size
    px = im.load()
    bg = lambda c: min(c[:3]) > thr and max(c[:3]) - min(c[:3]) < sat
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


def depth_map(im, dome=False, dome_h=10, shell=False, maxd=7):
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
            if shell:  # 껍데기: 앞은 둥글게 튀어나오고 뒤는 같은 곡면으로 움푹 (속이 빈 등껍질)
                r = math.hypot((x - (Wd - 1) / 2) / (Wd / 2), (y - (Ht - 1) / 2) / (Ht / 2))
                H = dome_h * max(0, 1 - r * r) ** 0.7  # 가운데가 가장 앞
                cr, cg, cb2, _ = p[x, y]; lum = (cr + cg + cb2) / 3
                rel = 1.5 if lum > 150 else -1 if lum < 45 else 0  # 판 하나하나 솟고 홈은 파임
                zf = -round(H + rel + 1.5)                         # 앞면 (-Z 가 앞)
                zb = -round(H) + (3 if d[y][x] <= 2 else 1)         # 뒷면: 얇은 껍데기, 가장자리 테두리는 두껍게
                sh = round(dome_h * 0.4)                         # 손 쪽으로 당겨 가운데가 너무 멀리 뜨지 않게
                out[y][x] = (zf + sh, max(zb, zf + 1) + sh)
            elif dome:
                r = math.hypot((x - (Wd - 1) / 2) / (Wd / 2), (y - (Ht - 1) / 2) / (Ht / 2))
                h = 1 + round(dome_h * math.sqrt(max(0, 1 - r * r)))  # 등껍질: 높은 둥근 돔
                cr, cg, cb2, _ = p[x, y]; lum = (cr + cg + cb2) / 3
                if lum > 150: h += 2      # 밝은 테두리 · 하이라이트는 도드라지게
                elif lum < 45: h -= 2     # 판 사이 어두운 홈은 파이게 → 등껍질 판이 하나하나 솟아 보임
                out[y][x] = max(1, h)
            else:
                out[y][x] = min(maxd, 2 * d[y][x] - 1)  # 둥근 단면: 그 자리 폭만큼 두껍게 (자루는 원통, 날은 가운데 볼록)
    return out


def build(name, cfg):
    if cfg["src"]:
        src = Image.open(ROOT / "art" / cfg["src"])
        if cfg.get("shell_only"): base = shell_only(src).crop(shell_only(src).getbbox())  # 윤곽으로만 자름 (밝은 테두리·하이라이트가 배경으로 지워지지 않게)
        elif src.mode == "RGBA" and src.getpixel((0, 0))[3] == 0 and cfg["src"].startswith("t"): base = src  # 이미 배경을 지운 그림 (도구 그림: 다시 지우면 흰 칼날이 깎임)
        else: base = keep_big(cutout(src), cfg.get("keep", 0.004))
        if cfg.get("stretch_y"): base = base.resize((base.width, round(base.height * cfg["stretch_y"])), Image.LANCZOS)  # 세로로 더 긴 타원
        up = base if cfg.get("noupright") else upright(base)
        if cfg.get("flip180"): up = up.rotate(180)  # 무게 판정이 반대로 나온 그림 (칼끝이 위로)
        if cfg.get("mirror"): up = up.transpose(Image.FLIP_LEFT_RIGHT)  # 활: 활대 볼록한 쪽이 앞(그림 오른쪽)
        im = shrink(up, cfg["px"])
        if cfg.get("string"):  # 줄여서 사라진 활시위: 위·아래 끝을 잇는 1픽셀 선
            pp = im.load(); Wd0, Ht0 = im.size
            ys = [y for y in range(Ht0) if any(pp[x, y][3] for x in range(Wd0))]
            def edge_x(y): xs = [x for x in range(Wd0) if pp[x, y][3]]; return min(xs)
            y0, y1 = ys[0], ys[-1]; x0, x1 = edge_x(y0), edge_x(y1)
            for y in range(y0, y1 + 1):
                x = round(x0 + (x1 - x0) * (y - y0) / max(1, y1 - y0))
                if not pp[x, y][3]: pp[x, y] = (*cfg["string"], 255)  # 방패는 그림 그대로 (둥글어서 돌리면 엉뚱하게 눕음)
        dm = depth_map(im, dome=cfg.get("dome", False), dome_h=cfg.get("dome_h", 10), shell=cfg.get("shell", False), maxd=cfg.get("maxd", 7))
    else:
        im = shell_art(cfg["px"]); dm = depth_map(im, dome=True)
    Wd, Ht = im.size
    aura = cfg.get("aura")
    HCOL = [(96, 62, 34), (58, 36, 20)]  # 손잡이 (가죽 · 어두운 가죽)
    if cfg.get("handle"):  # 손잡이 색을 텍스처 오른쪽에 덧붙임
        big = Image.new("RGBA", (Wd + len(HCOL), Ht), (0, 0, 0, 0)); big.paste(im, (0, 0))
        for i, c in enumerate(HCOL):
            for y in range(Ht): big.putpixel((Wd + i, y), (*c, 255))
        im_tex = big
    elif aura:  # 기운 색을 텍스처 오른쪽에 한 줄씩 덧붙임
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
    HAND = [-6, 12.5, -1]  # 플레이어 모델 좌표의 오른손 (참고 팩 blades 처럼 rightItem 아래에 무기를 둠)
    GY = 0
    side = cfg.get("vanilla")  # 넓은 면이 옆을 보게: 그림 가로를 Z 로, 두께를 X 로 (석궁처럼 X +90° 로 앞을 향할 때 면이 세로로 섬)
    cubes = []
    for y in range(Ht):
        x = 0
        while x < Wd:
            t = dm[y][x]
            if not t: x += 1; continue
            x0 = x
            while x < Wd and dm[y][x] == t and not (cfg.get("vanilla") or cfg.get("bowside")): x += 1  # 옆으로 세운 무기는 합치지 않음 (합친 줄 그림이 90° 돌아 노이즈처럼 보였음)
            if x == x0: x += 1
            w = x - x0
            if isinstance(t, tuple): T = (t[1] - t[0]) * u; Z0 = t[0] * u  # 껍데기: 그 자리 앞·뒤 면
            else: T = t * u * (0.9 if cfg["src"] else 0.6); Z0 = -T / 2
            o3 = [round((x0 - gx) * u, 4), round((gy - y - 1) * u + GY, 4), round(Z0, 4)]; s3 = [round(w * u, 4), round(u, 4), round(T, 4)]
            face = {"north": {"uv": [x0, y], "uv_size": [w, 1]}, "south": {"uv": [x0 + w, y], "uv_size": [-w, 1]},
                    "east": {"uv": [x0 + w - 1, y], "uv_size": [1, 1]}, "west": {"uv": [x0, y], "uv_size": [1, 1]},
                    "up": {"uv": [x0, y], "uv_size": [w, 1]}, "down": {"uv": [x0, y], "uv_size": [w, 1]}}
            if cfg.get("bowside"):  # 활: 세로로 세우되 옆에서 보이게 — 그림 세로 → 위(Y), 그림 가로 → Z(그림 왼쪽 = 화살 쪽 = 앞 -Z), 두께 → X
                ox, oy, oz = o3; sx, sy, sz = s3
                o3 = [round(oz, 4), oy, round(-(ox + sx), 4)]; s3 = [sz, sy, sx]  # 그림 오른쪽 → 앞(-Z) (게임에서 확인: 반대였음)
                mid = {"uv": [x0 + w // 2, y], "uv_size": [1, 1]}  # 옆 테두리 면: 그 줄 가운데 색 한 칸 (줄을 세로로 늘려 노이즈처럼 보이던 것)
                face = {"east": {"uv": [x0, y], "uv_size": [w, 1]}, "west": {"uv": [x0 + w, y], "uv_size": [-w, 1]},
                        "north": {"uv": [x0, y], "uv_size": [1, 1]}, "south": {"uv": [x0 + w - 1, y], "uv_size": [1, 1]},
                        "up": mid, "down": mid}
            if side:  # 참고 팩(blades)처럼: 손에서 -Z(앞) 로 뻗은 모델 — 그림 세로(끝) → -Z, 그림 가로 → 위(Y, 그림 왼쪽이 위), 두께 → X
                ox, oy, oz = o3; sx, sy, sz = s3
                o3 = [round(oz, 4), round(ox if cfg.get("flipup") else -(ox + sx), 4), round(-(oy + sy), 4)]; s3 = [sz, sx, sy]  # flipup: 그림 왼쪽이 아래 (낫 날 끝이 바닥 쪽)
                mid = {"uv": [x0 + w // 2, y], "uv_size": [1, 1]}  # 줄 사이 계단 면: 가운데 색 한 칸 (줄을 두께 쪽으로 눌러 노이즈처럼 보이던 것)
                face = {"east": {"uv": [x0, y], "uv_size": [w, 1]}, "west": {"uv": [x0 + w, y], "uv_size": [-w, 1]},
                        "north": mid, "south": mid,
                        "up": {"uv": [x0, y], "uv_size": [1, 1]}, "down": {"uv": [x0 + w - 1, y], "uv_size": [1, 1]}}
            if cfg.get("kind") == "tome":  # 책: 그림(펼친 책장)이 플레이어 쪽(+Z)을 보게 앞뒤를 뒤집어 만듦 (손 회전 180° 없이)
                o3 = [o3[0], o3[1], round(-(o3[2] + s3[2]), 4)]
                face = dict(face); face["north"], face["south"] = face["south"], face["north"]
            cubes.append({"origin": o3, "size": s3, "uv": face})
    shield = not (side or cfg.get("bowside"))  # 방패: 앞면이 앞(-Z)
    zoff = -5.5 if shield else 0
    if cfg.get("handle"):  # 뒷면(움푹한 안쪽) 가운데 세로 손잡이 + 위아래 받침 → 손이 손잡이를 쥐게 방패를 옮김
        cx, cy = int(Wd // 2), int(Ht // 2)
        while not dm[cy][cx]: cy += 1
        zbar = dm[cy][cx][1] + 3; L = max(5, Ht // 9)
        hc = lambda col: {f: {"uv": [Wd + col, cy], "uv_size": [1, 1]} for f in ("north", "south", "east", "west", "up", "down")}
        cubes.append({"origin": [round((cx - 1 - gx) * u, 4), round((gy - cy - L) * u, 4), round(zbar * u, 4)],
                      "size": [round(2 * u, 4), round(2 * L * u, 4), round(1.6 * u, 4)], "uv": hc(0)})
        for yy in (cy - L, cy + L - 1):  # 받침: 뒷면 → 손잡이
            zb = dm[yy][cx][1] if dm[yy][cx] else zbar
            cubes.append({"origin": [round((cx - 1 - gx) * u, 4), round((gy - yy - 1) * u, 4), round(zb * u, 4)],
                          "size": [round(2 * u, 4), round(u, 4), round(max(u, (zbar - zb) * u), 4)], "uv": hc(1)})
        zoff = -(zbar + 0.8) * u  # 손잡이 한가운데가 손에
    for c in cubes:
        o = c["origin"]; c["origin"] = [round(o[0] + HAND[0], 4), round(o[1] + HAND[1], 4), round(o[2] + HAND[2] + zoff, 4)]
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
        "bones": [{"name": "root", "pivot": [0, 0, 0]},
                  {"name": "waist", "parent": "root", "pivot": [0, 12, 0]},
                  {"name": "body", "parent": "waist", "pivot": [0, 24, 0]},
                  {"name": "rightArm", "parent": "body", "pivot": [-5, 22, 0]},
                  {"name": "rightItem", "parent": "rightArm", "pivot": [-6, 15, 1]},
                  {"name": "rpg_w3d", "parent": "rightItem", "pivot": HAND},  # 1인칭 자리 · 크기 · 세우기
                  {"name": "rpg_w3d_tilt", "parent": "rpg_w3d", "pivot": HAND},  # 1인칭: 화면 가로축으로 앞뒤 기울이기
                  {"name": "rpg_w3d_spin", "parent": "rpg_w3d_tilt", "pivot": HAND, "cubes": cubes}]}]}  # 무기 긴 축(Z)으로만 돌리기
    (RP / "models" / "entity").mkdir(parents=True, exist_ok=True)
    (RP / "models" / "entity" / f"rpg_w3d_{name}.geo.json").write_text(json.dumps(geo, separators=(",", ":")))
    # 손에 든 납작한 아이템을 숨기는 빈 attachable (무기 모습은 플레이어 모델 쪽에서 그림)
    empty = {"format_version": "1.16.0", "minecraft:geometry": [{"description": {"identifier": "geometry.rpg_w3d_empty", "texture_width": 16, "texture_height": 16},
             "bones": [{"name": "rpg_w3d_empty", "pivot": [0, 0, 0], "binding": "q.item_slot_to_bone_name(context.item_slot)"}]}]}
    (RP / "models" / "entity" / "rpg_w3d_empty.geo.json").write_text(json.dumps(empty))
    att = {"format_version": "1.10.0", "minecraft:attachable": {"description": {
        "identifier": cfg["item"], "materials": {"default": "entity_alphatest"}, "textures": {"default": tex},
        "geometry": {"default": "geometry.rpg_w3d_empty"}, "render_controllers": ["controller.render.item_default"]}}}
    (RP / "attachables").mkdir(parents=True, exist_ok=True)
    (RP / "attachables" / f"{name}.json").write_text(json.dumps(att, ensure_ascii=False, indent=1))
    anims = {}
    return anims, len(cubes), (Wd, Ht)


def main():
    """플레이어 모델에 무기 모델을 붙임 (참고 팩 blades 방식): 마크 기본 player.entity.json 을 바탕으로
    무기마다 geometry · texture · render controller 를 더하고, 그 무기를 들고 있을 때만 그림. 팔 애니메이션이 같은 이름의 뼈(rightArm·rightItem)를 움직여 무기가 손을 따라감"""
    van = json.loads((ROOT / "art" / "vanilla_player.entity.json").read_text())
    de = van["minecraft:client_entity"]["description"]
    rcs = {}
    for name, cfg in W.items():
        _, n, sz = build(name, cfg)
        print(f"{name}: {sz[0]}x{sz[1]} px, {n} cubes")
        key = f"rpg_w3d_{name}"
        de["geometry"][key] = f"geometry.{key}"
        de["textures"][key] = f"textures/models/{key}"
        short = cfg["item"].split(":")[1]
        de["render_controllers"].append({f"controller.render.{key}": f"!variable.map_face_icon && query.get_equipped_item_name == '{short}'"})
        rcs[f"controller.render.{key}"] = {"geometry": f"Geometry.{key}", "textures": [f"Texture.{key}"], "materials": [{"*": "Material.default"}]}
    (RP / "entity").mkdir(parents=True, exist_ok=True)
    (RP / "entity" / "player.entity.json").write_text(json.dumps(van, indent=1))
    (RP / "render_controllers" / "rpg_w3d.render_controllers.json").write_text(json.dumps({"format_version": "1.8.0", "render_controllers": rcs}, indent=1))
    old = RP / "animations" / "rpg_w3d.animation.json"
    if old.exists(): old.unlink()
    import gen_weapon_moves; gen_weapon_moves.main()  # 무기 전용 동작(자세 · 걷기 · 3연타)도 플레이어 정의에 연결


if __name__ == "__main__":
    main()
