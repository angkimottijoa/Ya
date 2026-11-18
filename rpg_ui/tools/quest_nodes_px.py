# 퀘스트 마디 · 연결선 (예전 픽셀 디자인, V12.135 에서 가져옴) — 새 틀 안 퀘스트 목록에 씀
import math, os
from PIL import Image
D = "resource_pack/textures/ui/rpg/forge"
os.makedirs(D, exist_ok=True)
NAVY, NAVY2, GOLD, GOLD_D, CREAM = (30, 34, 51), (22, 25, 38), (201, 160, 74), (140, 104, 44), (244, 236, 214)
def px(c, a=255): return tuple(c) + (a,)
def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
# 퀘스트 마디 20x20: done(금 + 체크) · ready(금 + 별) · active(남색 + 굵은 금 고리 + ▶) · avail(남색 + 크림 고리 + 점) · lock(회색 + 자물쇠)
def node(kind):
    N = Image.new("RGBA", (20, 20), (0, 0, 0, 0)); p = N.load()
    for y in range(20):
        for x in range(20):
            r = math.hypot(x - 9.5, y - 9.5)
            if r > 9.6: continue
            edge = r > 8.4
            if kind in ("done", "ready"): c = (90, 64, 24) if edge else lerp((255, 222, 140), (196, 146, 60), y / 19) if r < 7.4 else GOLD
            elif kind == "active": c = (20, 22, 32) if edge else GOLD if r > 6.2 else lerp((52, 58, 86), (30, 34, 51), y / 19)
            elif kind == "avail": c = (20, 22, 32) if edge else CREAM if r > 7.2 else (30, 34, 51)
            else: c = (16, 17, 22) if edge else (78, 80, 92) if r > 7.2 else (40, 42, 52)
            p[x, y] = px(c)
    ink = px((70, 46, 14))
    if kind == "done":
        for x, y in ((5, 10), (6, 11), (7, 12), (8, 13), (9, 12), (10, 11), (11, 10), (12, 9), (13, 8), (14, 7), (6, 10), (7, 11), (8, 12), (9, 11), (10, 10), (11, 9), (12, 8), (13, 7)): p[x, y] = ink
    if kind == "ready":
        from PIL import ImageDraw
        pts = [(9.5 + (5.6 if k % 2 == 0 else 2.4) * math.sin(k * math.pi / 5), 10 - (5.6 if k % 2 == 0 else 2.4) * math.cos(k * math.pi / 5)) for k in range(10)]
        ImageDraw.Draw(N).polygon(pts, fill=(255, 250, 225, 255), outline=ink)
    if kind == "active":
        for y in range(5, 15):
            w = 5 - abs(y - 9.5)
            for x in range(8, 8 + int(w * 1.2) + 1): p[x, y] = px((255, 226, 150))
    if kind == "avail":
        for y in range(8, 12):
            for x in range(8, 12): p[x, y] = px(CREAM)
    if kind == "lock":
        for x in range(6, 14):
            for y in range(9, 15): p[x, y] = px((150, 152, 165) if y < 12 else (115, 117, 130))
        for x, y in ((7, 8), (7, 7), (8, 6), (9, 5), (10, 5), (11, 6), (12, 7), (12, 8)): p[x, y] = px((150, 152, 165))
        p[9, 11] = p[10, 11] = p[9, 12] = p[10, 12] = px((30, 32, 40))
    N.save(f"{D}/node_{kind}.png")
for k in ("done", "ready", "active", "avail", "lock"): node(k)
# 연결선 3x8 (세로 타일): 금색 · 옅은 남색
for nm, c in (("line_gold", GOLD), ("line_dim", (64, 68, 92))):
    Lg = Image.new("RGBA", (3, 8), (0, 0, 0, 0)); p = Lg.load()
    for y in range(8):
        p[0, y] = px(lerp(c, (0, 0, 0), 0.35)); p[1, y] = px(c); p[2, y] = px(lerp(c, (0, 0, 0), 0.35))
    Lg.save(f"{D}/{nm}.png")
