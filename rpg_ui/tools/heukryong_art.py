# 흑룡의 검 원본 그림 (V12.146): 흰 바탕 · 칼끝 위 → gen_weapons3d.py 가 3D 로, 여기서 32x32 아이콘도 만듦
import math, random
from PIL import Image, ImageDraw, ImageFilter
W, H = 360, 1040
S = 2
im = Image.new("RGBA", (W * S, H * S), (255, 255, 255, 255))
d = ImageDraw.Draw(im)
P = lambda pts: [(x * S, y * S) for x, y in pts]
cx = W / 2
# ── 칼날: 흑요석 (가장자리 어둡고 가운데 능선 밝음) + 진홍 핵 + 균열 ──
TIP, BASE, HW = 30, 700, 34
def half(y):  # 칼날 반폭
    t = (y - TIP) / (BASE - TIP)
    return max(1.5, HW * (0.12 + 0.88 * math.sqrt(t)))
left = [(cx - half(y), y) for y in range(TIP, BASE + 1, 4)]
right = [(cx + half(y), y) for y in range(BASE, TIP - 1, -4)]
# 밑동 쪽 용 이빨 톱니 (양쪽 4개)
def teeth(pts, sg):
    out = []
    for x, y in pts:
        if 520 < y < 690:
            ph = ((y - 520) % 42) / 42
            x += sg * (10 * max(0, 1 - abs(ph - 0.3) * 3.2))
        out.append((x, y))
    return out
d.polygon(P([(cx, TIP - 18)] + teeth(left, -1) + teeth(right, 1)), fill=(18, 16, 24, 255))
# 능선 쪽 밝은 면 (왼쪽 면)
for y in range(TIP, BASE, 2):
    h = half(y)
    for k in range(int(h)):
        t = k / max(1, h)
        c = (int(30 + 40 * (1 - t) ** 2), int(28 + 34 * (1 - t) ** 2), int(40 + 52 * (1 - t) ** 2))
        d.rectangle([(cx - k - 1) * S, y * S, (cx - k) * S, (y + 2) * S], fill=c + (255,))
    for k in range(int(h)):
        t = k / max(1, h)
        c = (int(16 + 14 * (1 - t)), int(14 + 12 * (1 - t)), int(22 + 18 * (1 - t)))
        d.rectangle([(cx + k) * S, y * S, (cx + k + 1) * S, (y + 2) * S], fill=c + (255,))
# 날 끝선 (가는 은빛)
d.line(P([(cx, TIP - 18)] + teeth(left, -1)), fill=(120, 116, 138, 255), width=2 * S)
# 가운데 진홍 핵 (빛) + 균열 가지
glow = Image.new("RGBA", im.size, (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
g.line(P([(cx, TIP + 40), (cx, BASE - 10)]), fill=(255, 40, 40, 255), width=10 * S)
glow = glow.filter(ImageFilter.GaussianBlur(7 * S))
im.alpha_composite(glow)
d = ImageDraw.Draw(im)
d.line(P([(cx, TIP + 50), (cx, BASE - 14)]), fill=(150, 10, 22, 255), width=6 * S)
d.line(P([(cx, TIP + 60), (cx, BASE - 20)]), fill=(255, 70, 60, 255), width=3 * S)
d.line(P([(cx, TIP + 90), (cx, BASE - 40)]), fill=(255, 190, 150, 255), width=1 * S)
rnd = random.Random(7)
for k in range(9):
    y0 = TIP + 120 + k * 62 + rnd.uniform(-10, 10); sg = 1 if k % 2 else -1
    pts = [(cx, y0)]
    x, y = cx, y0
    for s in range(4):
        x += sg * rnd.uniform(4, 7); y += rnd.uniform(4, 10)
        if abs(x - cx) > half(y) - 4: break
        pts.append((x, y))
    d.line(P(pts), fill=(220, 40, 40, 255), width=2 * S)
# ── 날밑: 펼친 용 날개 + 가운데 용 머리 (붉은 눈 · 보석) ──
GY = 712
for sg in (-1, 1):
    wing = [(cx, GY - 6), (cx + sg * 40, GY - 30), (cx + sg * 95, GY - 62), (cx + sg * 150, GY - 70), (cx + sg * 172, GY - 50),
            (cx + sg * 150, GY - 40), (cx + sg * 160, GY - 18), (cx + sg * 130, GY - 14), (cx + sg * 138, GY + 8), (cx + sg * 104, GY + 4),
            (cx + sg * 104, GY + 26), (cx + sg * 70, GY + 18), (cx + sg * 44, GY + 34), (cx, GY + 30)]
    d.polygon(P(wing), fill=(26, 20, 28, 255))
    # 날개 막 (진홍 그러데이션) 과 뼈대
    memb = [(cx + sg * 40, GY - 24), (cx + sg * 95, GY - 54), (cx + sg * 145, GY - 60), (cx + sg * 146, GY - 38), (cx + sg * 126, GY - 12), (cx + sg * 100, GY + 8), (cx + sg * 64, GY + 14)]
    d.polygon(P(memb), fill=(110, 14, 24, 255))
    d.polygon(P([(cx + sg * 60, GY - 20), (cx + sg * 100, GY - 46), (cx + sg * 132, GY - 46), (cx + sg * 110, GY - 14), (cx + sg * 76, GY + 4)]), fill=(170, 26, 34, 255))
    for (bx, by) in ((150, -70), (160, -18), (138, 8), (104, 26)):
        d.line(P([(cx + sg * 30, GY - 4), (cx + sg * bx, GY + by)]), fill=(60, 52, 66, 255), width=4 * S)
        d.line(P([(cx + sg * 30, GY - 6), (cx + sg * bx, GY + by - 2)]), fill=(120, 110, 132, 255), width=1 * S)
    d.ellipse(P([(cx + sg * 148 - 6, GY - 76), (cx + sg * 148 + 6, GY - 64)]), fill=(90, 80, 100, 255))
# 용 머리 (위를 향함: 칼날을 물고 있는 모양)
head = [(cx - 26, GY + 36), (cx - 30, GY + 8), (cx - 22, GY - 18), (cx - 12, GY - 34), (cx, GY - 40), (cx + 12, GY - 34), (cx + 22, GY - 18), (cx + 30, GY + 8), (cx + 26, GY + 36)]
d.polygon(P(head), fill=(34, 28, 38, 255))
for sg in (-1, 1):
    d.polygon(P([(cx + sg * 18, GY - 20), (cx + sg * 40, GY - 52), (cx + sg * 24, GY - 14)]), fill=(70, 62, 80, 255))  # 뿔
    d.ellipse(P([(cx + sg * 14 - 5, GY - 6), (cx + sg * 14 + 5, GY + 2)]), fill=(255, 40, 30, 255))  # 눈
    d.ellipse(P([(cx + sg * 14 - 2, GY - 4), (cx + sg * 14 + 2, GY)]), fill=(255, 210, 160, 255))
gemg = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(gemg).ellipse(P([(cx - 20, GY + 6), (cx + 20, GY + 46)]), fill=(255, 30, 30, 200))
im.alpha_composite(gemg.filter(ImageFilter.GaussianBlur(5 * S))); d = ImageDraw.Draw(im)
d.polygon(P([(cx, GY + 10), (cx + 12, GY + 26), (cx, GY + 42), (cx - 12, GY + 26)]), fill=(150, 8, 20, 255))
d.polygon(P([(cx, GY + 13), (cx + 7, GY + 24), (cx, GY + 26), (cx - 7, GY + 24)]), fill=(255, 90, 80, 255))
# ── 자루: 진홍 가죽 감기 (사선 띠) ──
G0, G1 = 762, 952
d.rectangle([(cx - 15) * S, G0 * S, (cx + 15) * S, G1 * S], fill=(40, 10, 14, 255))
for y in range(G0, G1, 16):
    d.polygon(P([(cx - 15, y), (cx + 15, y + 8), (cx + 15, y + 14), (cx - 15, y + 6)]), fill=(120, 22, 30, 255))
    d.line(P([(cx - 15, y), (cx + 15, y + 8)]), fill=(170, 50, 52, 255), width=1 * S)
d.rectangle([(cx - 18) * S, G0 * S, (cx + 18) * S, (G0 + 8) * S], fill=(60, 52, 66, 255))
d.rectangle([(cx - 18) * S, (G1 - 8) * S, (cx + 18) * S, G1 * S], fill=(60, 52, 66, 255))
# ── 자루 끝: 용 발톱이 붉은 구슬을 쥠 ──
PY = 984
og = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(og).ellipse(P([(cx - 26, PY - 26), (cx + 26, PY + 26)]), fill=(255, 30, 30, 170))
im.alpha_composite(og.filter(ImageFilter.GaussianBlur(5 * S))); d = ImageDraw.Draw(im)
d.ellipse(P([(cx - 18, PY - 18), (cx + 18, PY + 18)]), fill=(140, 10, 20, 255))
d.ellipse(P([(cx - 12, PY - 13), (cx + 6, PY + 4)]), fill=(230, 50, 50, 255))
d.ellipse(P([(cx - 8, PY - 10), (cx - 2, PY - 4)]), fill=(255, 200, 180, 255))
for a in (-60, 0, 60, 180):
    r = math.radians(a)
    d.line(P([(cx + math.sin(r) * 10, G1), (cx + math.sin(r) * 22, PY + math.cos(r) * 4), (cx + math.sin(r) * 16, PY + 22)]), fill=(70, 62, 80, 255), width=4 * S)
im = im.resize((W, H), Image.LANCZOS).convert("RGB")
im.save("art/heukryong_sword_ref.png")

# 아이콘 32x32: 대각선으로 눕힌 칼 + 검은 테두리
src = Image.open("art/heukryong_sword_ref.png").convert("RGBA")
dd = ImageDraw.Draw(src)  # 아이콘용: 진홍 핵을 굵게 (작게 줄여도 보이게)
dd.line([(cx, TIP + 70), (cx, BASE - 30)], fill=(90, 6, 14, 255), width=16)
dd.line([(cx, TIP + 80), (cx, BASE - 40)], fill=(255, 60, 50, 255), width=8)
dd.polygon([(cx - 60, GY - 40), (cx + 60, GY - 40), (cx + 60, GY + 30), (cx - 60, GY + 30)], fill=(110, 16, 26, 255))
dd.ellipse([cx - 22, GY - 10, cx + 22, GY + 34], fill=(255, 70, 60, 255))
px = src.load()
for y in range(src.height):
    for x in range(src.width):
        r, g, b, a = px[x, y]
        if min(r, g, b) > 236: px[x, y] = (0, 0, 0, 0)
src = src.crop(src.getbbox()).rotate(-45, resample=Image.BICUBIC, expand=True)
src = src.crop(src.getbbox())
k = 30 / max(src.size)
ic = src.resize((max(1, round(src.width * k)), max(1, round(src.height * k))), Image.LANCZOS)
q = ic.load()
for y in range(ic.height):
    for x in range(ic.width):
        r, g, b, a = q[x, y]; q[x, y] = (r, g, b, 255) if a > 90 else (0, 0, 0, 0)
icon = Image.new("RGBA", (32, 32), (0, 0, 0, 0)); icon.paste(ic, ((32 - ic.width) // 2, (32 - ic.height) // 2), ic)
o = icon.copy(); op = o.load(); ip = icon.load()
for y in range(32):
    for x in range(32):
        if ip[x, y][3] == 0 and any(0 <= x + dx < 32 and 0 <= y + dy < 32 and ip[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            op[x, y] = (10, 6, 10, 255)
o.save("resource_pack/textures/items/rpg/heukryong_sword.png")
print("art ok")
