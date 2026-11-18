# 연성소 새 틀 그림 (V12.136) — 4배 해상도로 매끈하게 그림 (화면 단위 1 = 그림 4픽셀)
#   어두운 강철 테두리 · 모서리 푸른 보석 장식 · 위 문장 · 빛나는 룬 · 칸 · 아이템 뒤 번개 빛 · 마디 막대 · 끝이 뾰족한 큰 버튼
import math, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
K = 4          # 화면 1 = 4픽셀
SS = 2         # 계단 없애기용 2배로 그린 뒤 줄임
OUT = "resource_pack/textures/ui/rpg/forge"
os.makedirs(OUT, exist_ok=True)

STEEL_D, STEEL, STEEL_L, STEEL_H = (22, 24, 30), (54, 58, 70), (104, 110, 124), (176, 182, 196)
BRONZE = (120, 98, 70)
PANEL_T, PANEL_B = (30, 35, 48), (17, 20, 28)
BLUE, BLUE_L, BLUE_D = (64, 160, 255), (190, 230, 255), (24, 70, 150)
GOLD = (233, 204, 148)

def canvas(w, h):  # 화면 단위 크기 → 그릴 배열 (RGBA float 0~1)
    return np.zeros((h * K * SS, w * K * SS, 4), np.float32)
def grid(a):
    h, w = a.shape[:2]
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    s = K * SS
    return (x + 0.5) / s, (y + 0.5) / s  # 화면 단위 좌표
def over(a, rgb, alpha):  # 알파 합성
    alpha = np.clip(alpha, 0, 1)[..., None]
    col = np.empty_like(a[..., :3]); col[:] = np.array(rgb, np.float32) / 255 if not isinstance(rgb, np.ndarray) else rgb
    out_a = alpha[..., 0] + a[..., 3] * (1 - alpha[..., 0])
    a[..., :3] = (col * alpha + a[..., :3] * a[..., 3:4] * (1 - alpha)) / np.maximum(out_a[..., None], 1e-6)
    a[..., 3] = out_a
def add_glow(a, rgb, alpha):  # 빛 더하기 (밝게)
    alpha = np.clip(alpha, 0, 1)[..., None]
    a[..., :3] = np.clip(a[..., :3] + np.array(rgb, np.float32) / 255 * alpha, 0, 1)
    a[..., 3] = np.clip(np.maximum(a[..., 3], alpha[..., 0]), 0, 1)
def grad(t, c0, c1):
    t = np.clip(t, 0, 1)[..., None]
    return np.array(c0, np.float32) / 255 * (1 - t) + np.array(c1, np.float32) / 255 * t
def sd_rrect(x, y, cx, cy, hw, hh, r):
    qx, qy = np.abs(x - cx) - hw + r, np.abs(y - cy) - hh + r
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
def fill_sd(d, aa=0.35):  # 거리 → 덮음 (화면 단위 aa)
    return np.clip(0.5 - d / aa, 0, 1)
def save(a, name):
    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA")
    img = img.resize((img.width // SS, img.height // SS), Image.LANCZOS)
    img.save(f"{OUT}/{name}.png")
    return img
def blur_layer(a, radius_units):
    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA")
    img = img.filter(ImageFilter.GaussianBlur(radius_units * K * SS))
    return np.asarray(img).astype(np.float32) / 255
def draw_mask(w, h, fn):  # PIL 로 모양 그리기 (화면 단위 좌표를 받는 fn(draw, s))
    s = K * SS
    m = Image.new("L", (w * s, h * s), 0)
    fn(ImageDraw.Draw(m), s)
    return np.asarray(m).astype(np.float32) / 255
def noise(a, amt=0.025, seed=1):
    rng = np.random.default_rng(seed)
    n = rng.normal(0, amt, a.shape[:2]).astype(np.float32)
    img = Image.fromarray(((n + 0.5) * 255).clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    n = np.asarray(img).astype(np.float32) / 255 - 0.5
    a[..., :3] = np.clip(a[..., :3] + n[..., None] * a[..., 3:4], 0, 1)

# ───────── 룬 글자 (선 모양) ─────────
RUNES = [  # 옛 룬 모양 (가로 0~0.6, 세로 0~1 선분)
    [((0, 0), (0, 1)), ((0, 0.35), (0.6, 0)), ((0, 0.6), (0.6, 0.25))],
    [((0, 1), (0, 0)), ((0, 0), (0.6, 0.3)), ((0.6, 0.3), (0.6, 1))],
    [((0, 0), (0, 1)), ((0, 0.25), (0.5, 0.5)), ((0.5, 0.5), (0, 0.75))],
    [((0, 0), (0, 1)), ((0, 0), (0.6, 0.3)), ((0, 0.35), (0.6, 0.65))],
    [((0, 0), (0, 1)), ((0, 0), (0.55, 0.25)), ((0.55, 0.25), (0, 0.5)), ((0, 0.5), (0.55, 1))],
    [((0.5, 0.15), (0.05, 0.5)), ((0.05, 0.5), (0.5, 0.85))],
    [((0, 0.1), (0.6, 0.9)), ((0.6, 0.1), (0, 0.9))],
    [((0, 0), (0, 1)), ((0.6, 0), (0.6, 1)), ((0, 0.35), (0.6, 0.65))],
    [((0.3, 0), (0.3, 1)), ((0, 0.35), (0.6, 0.6))],
    [((0.3, 0), (0.3, 1)), ((0.3, 0.4), (0, 0)), ((0.3, 0.4), (0.6, 0))],
    [((0.55, 0), (0.05, 0.4)), ((0.05, 0.4), (0.55, 0.6)), ((0.55, 0.6), (0.05, 1))],
    [((0.3, 0), (0.3, 1)), ((0.3, 0), (0, 0.3)), ((0.3, 0), (0.6, 0.3))],
    [((0, 0), (0, 1)), ((0.6, 0), (0.6, 1)), ((0, 0), (0.3, 0.35)), ((0.3, 0.35), (0.6, 0))],
    [((0.3, 0.1), (0.6, 0.5)), ((0.6, 0.5), (0.3, 0.9)), ((0.3, 0.9), (0, 0.5)), ((0, 0.5), (0.3, 0.1))],
    [((0, 0), (0, 1)), ((0.6, 0), (0.6, 1)), ((0, 0), (0.6, 1)), ((0.6, 0), (0, 1))],
    [((0, 0), (0, 1)), ((0, 0), (0.5, 0.3))],
]
def rune_strip(w, h, vertical, seed):
    random.seed(seed)
    def fn(d, s):
        n = int((h if vertical else w) // 9)
        for i in range(n):
            g = RUNES[random.randrange(len(RUNES))]
            if vertical: ox, oy, gw, gh = w / 2 - 1.6, 2 + i * ((h - 4) / n), 3.2, 5.6
            else: ox, oy, gw, gh = 2 + i * ((w - 4) / n) + 1.4, h / 2 - 2.8, 3.2, 5.6
            for (x0, y0), (x1, y1) in g:
                d.line([((ox + x0 * gw / 0.6) * s, (oy + y0 * gh) * s), ((ox + x1 * gw / 0.6) * s, (oy + y1 * gh) * s)], fill=255, width=max(1, int(0.5 * s)))
    m = draw_mask(w, h, fn)
    a = canvas(w, h)
    glow = canvas(w, h); over(glow, BLUE, m); glow = blur_layer(glow, 1.1)
    add_glow(a, BLUE, glow[..., 3] * 0.75)
    over(a, BLUE_L, m * 0.9)
    return a
save(rune_strip(8, 120, True, 3), "runes_v")
save(rune_strip(8, 120, True, 7), "runes_v2")
save(rune_strip(84, 8, False, 11), "runes_h")
save(rune_strip(84, 8, False, 13), "runes_h2")
save(rune_strip(22, 8, False, 17), "runes_btn")

# ───────── 판 (가운데 바탕, 세로로 늘어남) ─────────
def panel():
    a = canvas(16, 64); x, y = grid(a)
    over(a, grad(y / 64, PANEL_T, PANEL_B), np.ones_like(x))
    noise(a, 0.02, 2)
    return a
save(panel(), "panel")

# ───────── 테두리 띠 (가로 · 세로) : 두께 12, 바깥 → 안: 검은 선 · 강철 경사면 · 홈 · 안쪽 푸른 선 ─────────
def edge_profile(t):  # t: 바깥에서 안으로 화면 단위 거리 → (색, 알파)
    pass
def edge(horizontal, top_side):
    L, T = (16, 12) if horizontal else (12, 16)
    a = canvas(L, T); x, y = grid(a)
    d = (y if top_side else (T - y)) if horizontal else (x if top_side else (T - x))  # 바깥에서 거리 (가로: T=12 / 세로: L=12)
    tot = 12
    col = np.zeros(d.shape + (3,), np.float32)
    def band(lo, hi, c0, c1=None):
        m = (d >= lo) & (d < hi)
        c = grad((d - lo) / (hi - lo), c0, c1 or c0)
        col[m] = c[m]
    band(0, 0.8, STEEL_D)
    band(0.8, 4.2, STEEL_H, STEEL)        # 바깥 경사면 (빛 받는 쪽 → 어두운 쪽)
    band(4.2, 5.2, STEEL_D)
    band(5.2, 7.6, STEEL_L, BRONZE)       # 가운데 띠 (청동빛 강철)
    band(7.6, 8.6, STEEL_D)
    band(8.6, 10.0, STEEL, STEEL_D)
    band(10.0, 12.01, PANEL_T, PANEL_T)
    over(a, col, (d < 10.0).astype(np.float32))
    # 안쪽 푸른 빛 선
    g = np.exp(-((d - 10.6) / 0.45) ** 2)
    add_glow(a, BLUE, g * 0.9)
    over(a, BLUE_L, np.exp(-((d - 10.6) / 0.18) ** 2) * 0.8)
    inner = d >= 10.0
    a[..., 3] = np.where(inner, np.maximum(a[..., 3], np.exp(-((d - 10.6) / 0.6) ** 2)), a[..., 3])
    # 바깥 쪽은 그림자 없이 불투명
    a[..., 3] = np.where(d < 10.0, 1.0, a[..., 3])
    noise(a, 0.03, 5)
    return a
save(edge(True, True), "edge_t"); save(edge(True, False), "edge_b")
save(edge(False, True), "edge_l"); save(edge(False, False), "edge_r")

# ───────── 모서리 (30x30, 왼쪽 위 기준 → 뒤집어서 넷) ─────────
def corner():
    S = 30
    a = canvas(S, S); x, y = grid(a)
    # 바탕: 두 테두리 띠가 만나는 L자 (띠 모양 그대로)
    for horizontal in (True, False):
        e = edge(horizontal, True)
        # edge 는 16x12 / 12x16 → 여기선 직접 계산
    d = np.minimum(x, y)
    col = np.zeros(d.shape + (3,), np.float32)
    def band(lo, hi, c0, c1=None):
        m = (d >= lo) & (d < hi); c = grad((d - lo) / (hi - lo), c0, c1 or c0); col[m] = c[m]
    band(0, 0.8, STEEL_D); band(0.8, 4.2, STEEL_H, STEEL); band(4.2, 5.2, STEEL_D); band(5.2, 7.6, STEEL_L, BRONZE)
    band(7.6, 8.6, STEEL_D); band(8.6, 10.0, STEEL, STEEL_D); band(10.0, 99, PANEL_T, PANEL_T)
    over(a, col, ((x < 10) | (y < 10)).astype(np.float32))
    g = np.exp(-((d - 10.6) / 0.45) ** 2) * ((x >= 10) & (y >= 10))
    add_glow(a, BLUE, g * 0.9)
    over(a, BLUE_L, np.exp(-((d - 10.6) / 0.18) ** 2) * 0.8 * ((x >= 10) & (y >= 10)))
    a[..., 3] = np.where((x >= 10) & (y >= 10), np.exp(-((d - 10.6) / 0.6) ** 2) * (d < 12), a[..., 3])
    # 장식판: 둥근 사각 + 안쪽 마름모 보석
    cx, cy = 9.5, 9.5
    plate = sd_rrect(x, y, cx, cy, 8.2, 8.2, 3.0)
    rot = (np.abs(x - cx) + np.abs(y - cy))
    over(a, (10, 11, 14), fill_sd(plate - 0.8))
    over(a, grad((x + y - 4) / 26, STEEL_H, STEEL_D), fill_sd(plate))
    over(a, STEEL_D, fill_sd(np.abs(plate + 1.6) - 0.35))
    # 꽃잎 같은 덩굴 장식 (대각선 방향으로 뻗음)
    for k, (dx, dy) in enumerate(((1, 0), (0, 1))):
        px_, py_ = cx + dx * 13, cy + dy * 13
        leaf = np.hypot((x - px_) * (1 if dx else 2.2), (y - py_) * (2.2 if dx else 1)) - 4.2
        over(a, (10, 11, 14), fill_sd(leaf - 0.7) * ((x < 28) & (y < 28)))
        over(a, grad((x + y) / 40, STEEL_L, STEEL), fill_sd(leaf))
        over(a, BLUE, fill_sd(np.hypot((x - px_) * (1 if dx else 2.2), (y - py_) * (2.2 if dx else 1)) - 1.2) * 0.9)
    # 보석
    gem = rot - 5.0
    glow = canvas(S, S); over(glow, BLUE, fill_sd(gem + 0.5)); glow = blur_layer(glow, 2.0)
    add_glow(a, BLUE, glow[..., 3] * 0.9)
    over(a, (8, 20, 50), fill_sd(gem))
    facet = np.where((x - cx) + (y - cy) < 0, 1.0, 0.55) * np.where((x - cx) - (y - cy) < 0, 1.0, 0.8)
    over(a, grad(facet, BLUE_D, BLUE), fill_sd(gem + 0.7))
    over(a, BLUE_L, fill_sd(np.hypot(x - (cx - 1.5), y - (cy - 1.8)) - 1.1) * 0.95)
    over(a, (255, 255, 255), fill_sd(np.hypot(x - (cx - 1.7), y - (cy - 2.0)) - 0.45))
    noise(a, 0.02, 9)
    return a
c = corner()
im = save(c, "corner_tl")
im.transpose(Image.FLIP_LEFT_RIGHT).save(f"{OUT}/corner_tr.png")
im.transpose(Image.FLIP_TOP_BOTTOM).save(f"{OUT}/corner_bl.png")
im.transpose(Image.ROTATE_180).save(f"{OUT}/corner_br.png")

# ───────── 위 문장 (72x30): 날개처럼 뻗은 강철 + 가운데 큰 푸른 보석 ─────────
def crest():
    W, H = 72, 30
    a = canvas(W, H); x, y = grid(a)
    cx = W / 2
    def shape(d, s):
        pts = [(cx, 1), (cx + 7, 6), (cx + 24, 9), (cx + 35, 14), (cx + 26, 15), (cx + 14, 20), (cx + 6, 28), (cx, 29.5),
               (cx - 6, 28), (cx - 14, 20), (cx - 26, 15), (cx - 35, 14), (cx - 24, 9), (cx - 7, 6)]
        d.polygon([(px_ * s, py_ * s) for px_, py_ in pts], fill=255)
    m = draw_mask(W, H, shape)
    sh = blur_layer(np.dstack([np.zeros_like(m)] * 3 + [m]), 0.8)
    over(a, (0, 0, 0), sh[..., 3] * 0.8)
    inner = blur_layer(np.dstack([np.zeros_like(m)] * 3 + [m]), 0.9)[..., 3]
    bevel = np.clip((inner - 0.5) * 2, 0, 1)
    over(a, grad(y / H, STEEL_H, STEEL_D), m)
    over(a, grad(y / H, STEEL_L, (36, 39, 48)), m * bevel)
    # 날개 결 (가는 홈)
    for k in range(3):
        groove = np.abs((y - 10 - k * 2.2) - np.abs(x - cx) * 0.18) - 0.25
        over(a, STEEL_D, fill_sd(groove) * m * (np.abs(x - cx) > 9))
    # 가운데 보석 (세로로 긴 마름모)
    gem = np.abs(x - cx) / 5.2 + np.abs(y - 15.5) / 10.5 - 1
    glow = canvas(W, H); over(glow, BLUE, np.clip(-gem * 6, 0, 1)); glow = blur_layer(glow, 2.6)
    add_glow(a, BLUE, glow[..., 3])
    over(a, (8, 20, 50), np.clip(-gem * 8 + 0.6, 0, 1))
    facet = np.where(x < cx, 1.0, 0.65) * np.where(y < 15.5, 1.0, 0.8)
    over(a, grad(facet, BLUE_D, (120, 200, 255)), np.clip(-gem * 8 - 1.0, 0, 1))
    over(a, (255, 255, 255), fill_sd(np.hypot(x - (cx - 1.5), y - 11.5) - 0.8))
    noise(a, 0.02, 12)
    return a
save(crest(), "crest")

# ───────── 안쪽 카드 (268x80) ─────────
def card(w, h, seed=4):
    a = canvas(w, h); x, y = grid(a)
    d = sd_rrect(x, y, w / 2, h / 2, w / 2 - 0.6, h / 2 - 0.6, 5)
    over(a, (0, 0, 0), fill_sd(d - 0.5) * 0.6)
    over(a, grad(y / h, (38, 44, 60), (24, 28, 39)), fill_sd(d))
    over(a, (96, 104, 124), fill_sd(np.abs(d + 0.5) - 0.3) * 0.9)
    over(a, (255, 255, 255), fill_sd(np.abs(d + 1.2) - 0.18) * 0.07 * (y < h / 2))
    # 위쪽 가운데에서 내려오는 아주 옅은 빛
    add_glow(a, (60, 120, 220), np.exp(-(((x - w / 2) / (w * 0.35)) ** 2 + ((y - h * 0.45) / (h * 0.6)) ** 2)) * 0.08 * fill_sd(d))
    noise(a, 0.015, seed)
    return a
save(card(268, 80), "card")

# ───────── 칸 (34x34) 기본 · 위에 올림 · 고름 ─────────
def slot(state):
    S = 34
    a = canvas(S, S); x, y = grid(a)
    d = sd_rrect(x, y, S / 2, S / 2, S / 2 - 0.5, S / 2 - 0.5, 3.2)
    over(a, (0, 0, 0), fill_sd(d - 0.6) * 0.7)
    over(a, grad(y / S, STEEL_H, STEEL_D), fill_sd(d))                       # 강철 테
    di = sd_rrect(x, y, S / 2, S / 2, S / 2 - 2.6, S / 2 - 2.6, 2.0)
    over(a, (8, 10, 14), fill_sd(di + 0.0))
    di2 = di + 0.7
    base = grad(np.hypot(x - S / 2, y - S * 0.38) / (S * 0.75), (44, 92, 170) if state != "idle" else (36, 72, 140), (12, 24, 52))
    over(a, base, fill_sd(di2))
    over(a, (0, 0, 0), fill_sd(np.abs(di2 + 1.2) - 1.2) * 0.35)              # 안쪽 그림자
    over(a, (255, 255, 255), fill_sd(np.abs(di2) - 0.18) * 0.12 * (y < S / 2))
    if state in ("hover", "on"):
        ring = np.exp(-((di + 0.4) / (0.5 if state == "hover" else 0.7)) ** 2)
        add_glow(a, BLUE_L if state == "on" else BLUE, ring * (1.0 if state == "on" else 0.7))
    if state == "on":
        add_glow(a, BLUE, np.clip(-di2 / 10, 0, 1) * 0.25)
    noise(a, 0.015, 21)
    return a
for st in ("idle", "hover", "on"): save(slot(st), f"slot_{st}")

# ───────── + 표시 (12) ─────────
def plus():
    S = 12
    a = canvas(S, S); x, y = grid(a)
    r = np.hypot(x - 6, y - 6)
    over(a, (0, 0, 0), fill_sd(r - 5.9) * 0.6)
    over(a, grad(y / S, STEEL_H, STEEL_D), fill_sd(r - 5.5))
    over(a, grad(y / S, (110, 190, 255), (20, 90, 200)), fill_sd(r - 4.4))
    over(a, (255, 255, 255), fill_sd(np.maximum(np.abs(x - 6) - 2.6, np.abs(y - 6) - 0.65)))
    over(a, (255, 255, 255), fill_sd(np.maximum(np.abs(y - 6) - 2.6, np.abs(x - 6) - 0.65)))
    over(a, (255, 255, 255), fill_sd(np.hypot(x - 4.2, y - 3.6) - 1.4) * 0.25)
    return a
save(plus(), "plus")

# ───────── 아이템 뒤 번개 빛 (56) + 아이템 틀 (40) ─────────
def halo():
    S = 56
    a = canvas(S, S); x, y = grid(a)
    r = np.hypot(x - S / 2, y - S / 2)
    add_glow(a, (30, 90, 200), np.exp(-(r / 20) ** 2) * 0.55)
    add_glow(a, BLUE, np.exp(-((r - 21) / 2.2) ** 2) * 0.85)
    add_glow(a, BLUE_L, np.exp(-((r - 21) / 0.7) ** 2) * 0.9)
    random.seed(5)
    def bolts(d, s):
        for _ in range(9):
            ang = random.random() * math.tau; rr = 20 + random.random() * 2
            px_, py_ = S / 2 + math.cos(ang) * rr, S / 2 + math.sin(ang) * rr
            pts = [(px_, py_)]
            for k in range(7):
                ang2 = ang + (random.random() - 0.5) * 1.4
                step = 1.6 + random.random()
                px_ -= math.cos(ang2) * step; py_ -= math.sin(ang2) * step
                pts.append((px_, py_))
            d.line([(p0 * s, p1 * s) for p0, p1 in pts], fill=255, width=max(1, int(0.35 * s)))
    m = draw_mask(S, S, bolts)
    gl = blur_layer(np.dstack([np.zeros_like(m)] * 3 + [m]), 0.8)[..., 3]
    add_glow(a, BLUE, gl * 0.9)
    add_glow(a, BLUE_L, m * 0.9)
    return a
save(halo(), "halo")
def item_frame():
    S = 40
    a = canvas(S, S); x, y = grid(a)
    d = sd_rrect(x, y, S / 2, S / 2, S / 2 - 0.6, S / 2 - 0.6, 4)
    over(a, (0, 0, 0), fill_sd(d - 0.6) * 0.5)
    over(a, (120, 170, 230), fill_sd(np.abs(d + 0.4) - 0.35) * 0.55)
    over(a, grad(y / S, (40, 70, 130), (10, 20, 46)), fill_sd(d + 1.0) * 0.55)
    over(a, (255, 255, 255), fill_sd(np.abs(d + 1.4) - 0.2) * 0.12 * (y < S / 2))
    return a
save(item_frame(), "item_frame")

# ───────── 나눔선 (268x3, 양끝이 흐려짐) ─────────
def divider(w=268):
    a = canvas(w, 3); x, y = grid(a)
    fade = np.clip(np.minimum(x, w - x) / 40, 0, 1)
    over(a, (8, 9, 12), fill_sd(np.abs(y - 1.0) - 0.4) * fade * 0.9)
    over(a, (92, 100, 120), fill_sd(np.abs(y - 1.9) - 0.35) * fade * 0.7)
    return a
save(divider(), "divider")

# ───────── 확률 막대 (150x9) × 21 ─────────
def bar(k):
    W, H = 150, 9
    a = canvas(W, H); x, y = grid(a)
    d = sd_rrect(x, y, W / 2, H / 2, W / 2 - 0.4, H / 2 - 0.4, H / 2 - 0.4)
    over(a, grad(y / H, STEEL_L, STEEL_D), fill_sd(d))
    di = d + 1.0
    over(a, (6, 8, 13), fill_sd(di))
    seg_n = 10; gap = 1.4; inner_w = W - 3.0
    fillw = inner_w * k / 20
    seg_w = (inner_w - gap * (seg_n - 1)) / seg_n
    lit = np.zeros_like(x)
    for i in range(seg_n):
        x0 = 1.5 + i * (seg_w + gap)
        x1 = min(x0 + seg_w, 1.5 + fillw)
        if x1 <= x0: break
        sd = sd_rrect(x, y, (x0 + x1) / 2, H / 2, (x1 - x0) / 2, H / 2 - 2.0, min(2.4, (x1 - x0) / 2))
        lit = np.maximum(lit, fill_sd(sd))
    gl = blur_layer(np.dstack([np.zeros_like(lit)] * 3 + [lit]), 1.0)[..., 3]
    add_glow(a, BLUE, gl * 0.8 * fill_sd(d))
    over(a, grad((y - 2) / (H - 4), BLUE_L, (40, 120, 230)), lit)
    over(a, (255, 255, 255), lit * fill_sd(np.abs(y - 3.0) - 0.35) * 0.55)
    return a
for k in range(21): save(bar(k), f"bar_{k * 5}")

# ───────── 단계 구슬 (110x8) 0~15 ─────────
TIER = [(230, 232, 240), (110, 230, 150), (100, 190, 255), (210, 140, 255)]
def pips(L):
    W, H = 110, 8
    a = canvas(W, H); x, y = grid(a)
    for i in range(15):
        cx = 4 + i * 7.3; t = 0 if i < 4 else 1 if i < 8 else 2 if i < 12 else 3
        dm = (np.abs(x - cx) + np.abs(y - H / 2)) - 3.3
        if i < L:
            gl = canvas(W, H); over(gl, TIER[t], fill_sd(dm)); gl = blur_layer(gl, 0.9)
            add_glow(a, TIER[t], gl[..., 3] * 0.6)
            over(a, (10, 12, 18), fill_sd(dm))
            over(a, grad((y - 1) / 6, (255, 255, 255), TIER[t]), fill_sd(dm + 0.6))
        else:
            over(a, (10, 12, 18), fill_sd(dm) * 0.9)
            over(a, (70, 76, 92), fill_sd(np.abs(dm + 0.5) - 0.3))
    return a
for L in range(16): save(pips(L), f"pips_{L}")

# ───────── 큰 버튼 (150x30): 양끝 뾰족 · 강철 테 · 푸른 판 · 위 광택 ─────────
def big_button(state):
    W, H = 150, 30
    a = canvas(W, H); x, y = grid(a)
    def hexd(inset):  # 끝이 뾰족한 육각 거리
        hw, hh, tip = W / 2 - inset, H / 2 - inset, 10
        qx, qy = np.abs(x - W / 2), np.abs(y - H / 2)
        d1 = qy - hh
        d2 = (qx - (hw - tip)) * (hh / math.hypot(hh, tip)) + qy * (tip / math.hypot(hh, tip)) - hh * (tip / math.hypot(hh, tip))
        return np.maximum(d1, np.maximum(d2, qx - hw))
    d0 = hexd(0.5)
    over(a, (0, 0, 0), fill_sd(d0 - 0.8) * 0.7)
    over(a, grad(y / H, STEEL_H, STEEL_D), fill_sd(d0))
    over(a, (10, 11, 15), fill_sd(hexd(2.3)))
    top, bot = {"idle": ((70, 140, 235), (16, 44, 100)), "hover": ((100, 175, 255), (26, 66, 140)), "down": ((20, 56, 120), (50, 110, 210))}[state]
    d3 = hexd(3.0)
    over(a, grad(y / H, top, bot), fill_sd(d3))
    add_glow(a, BLUE, np.exp(-((d3 + 0.3) / 0.6) ** 2) * (0.9 if state != "down" else 0.5))
    if state != "down":
        shine = fill_sd(hexd(4.2)) * np.clip((H * 0.48 - y) / 6, 0, 1) * 0.22
        over(a, (255, 255, 255), shine)
    # 끝의 작은 보석
    for sx in (-1, 1):
        cx = W / 2 + sx * (W / 2 - 6.5)
        gem = np.abs(x - cx) + np.abs(y - H / 2) - 3.0
        over(a, (8, 20, 50), fill_sd(gem + 0.0))
        over(a, BLUE_L, fill_sd(gem + 1.2))
    noise(a, 0.015, 31)
    return a
for st in ("idle", "hover", "down"): save(big_button(st), f"btn_{st}")

# ───────── 작은 버튼 (66x20) ─────────
def small_button(state):
    W, H = 66, 20
    a = canvas(W, H); x, y = grid(a)
    d = sd_rrect(x, y, W / 2, H / 2, W / 2 - 0.5, H / 2 - 0.5, 4)
    over(a, (0, 0, 0), fill_sd(d - 0.6) * 0.6)
    over(a, grad(y / H, STEEL_L, STEEL_D), fill_sd(d))
    di = d + 1.6
    top, bot = {"idle": ((44, 52, 70), (22, 26, 36)), "hover": ((56, 80, 120), (26, 36, 58)), "down": ((20, 24, 34), (40, 48, 66))}[state]
    over(a, grad(y / H, top, bot), fill_sd(di))
    if state == "hover": add_glow(a, BLUE, np.exp(-((di + 0.3) / 0.5) ** 2) * 0.8)
    over(a, (255, 255, 255), fill_sd(np.abs(di + 0.6) - 0.2) * 0.1 * (y < H / 2))
    return a
for st in ("idle", "hover", "down"): save(small_button(st), f"sbtn_{st}")

# ───────── 닫기 (16) ─────────
def close_btn(state):
    S = 16
    a = canvas(S, S); x, y = grid(a)
    r = np.hypot(x - 8, y - 8)
    over(a, (0, 0, 0), fill_sd(r - 7.8) * 0.6)
    over(a, grad(y / S, STEEL_H, STEEL_D), fill_sd(r - 7.4))
    over(a, grad(y / S, (40, 46, 62) if state == "idle" else (70, 40, 46), (16, 18, 26)), fill_sd(r - 5.8))
    u, v = (x - 8 + y - 8) / math.sqrt(2), (x - 8 - (y - 8)) / math.sqrt(2)
    xm = np.minimum(np.maximum(np.abs(u) - 3.0, np.abs(v) - 0.7), np.maximum(np.abs(v) - 3.0, np.abs(u) - 0.7))
    over(a, (230, 220, 200) if state == "idle" else (255, 200, 190), fill_sd(xm))
    return a
save(close_btn("idle"), "close"); save(close_btn("hover"), "close_hover")

# ───────── 화면 가장자리 어둡게 (전체 화면에 늘림) ─────────
def vignette():
    a = canvas(64, 64); x, y = grid(a)
    r = np.hypot((x - 32) / 32, (y - 32) / 32)
    over(a, (4, 6, 12), np.clip(0.55 + 0.4 * r ** 2, 0, 0.92))
    return a
save(vignette(), "vignette")

# ───────── 재료 칸 (20) ─────────
def mslot():
    S = 20
    a = canvas(S, S); x, y = grid(a)
    d = sd_rrect(x, y, S / 2, S / 2, S / 2 - 0.5, S / 2 - 0.5, 2.4)
    over(a, grad(y / S, STEEL_L, STEEL_D), fill_sd(d))
    over(a, grad(y / S, (36, 72, 140), (12, 24, 52)), fill_sd(d + 1.4))
    return a
save(mslot(), "mslot")
print("art ok")

# ═════════ 퀘스트 창 새 틀 조각 ═════════
def plate(W, H, state, r=4, tones=None):
    a = canvas(W, H); x, y = grid(a)
    d = sd_rrect(x, y, W / 2, H / 2, W / 2 - 0.5, H / 2 - 0.5, r)
    over(a, (0, 0, 0), fill_sd(d - 0.6) * 0.6)
    over(a, grad(y / H, STEEL_L if state != "on" else (150, 200, 255), STEEL_D), fill_sd(d))
    di = d + 1.4
    top, bot = tones or {"idle": ((40, 46, 62), (22, 26, 36)), "hover": ((52, 70, 104), (26, 34, 54)), "on": ((40, 88, 170), (16, 36, 80)), "down": ((20, 24, 34), (40, 48, 66))}[state]
    over(a, grad(y / H, top, bot), fill_sd(di))
    if state in ("hover", "on"): add_glow(a, BLUE if state == "hover" else BLUE_L, np.exp(-((di + 0.3) / 0.55) ** 2) * (0.7 if state == "hover" else 0.9))
    over(a, (255, 255, 255), fill_sd(np.abs(di + 0.6) - 0.2) * 0.09 * (y < H / 2))
    return a
for st in ("idle", "hover", "on"): save(plate(46, 18, st, 4), f"tab_{st}")
for st in ("idle", "hover", "down"): save(plate(180, 18, st, 4), f"wbtn_{st}")
for st in ("idle", "hover", "on"): save(plate(200, 26, st, 3, None), f"qrow_{st}")
save(card(190, 150, 8), "qcard")

def qnode(kind):
    S = 20
    a = canvas(S, S); x, y = grid(a)
    r = np.hypot(x - 10, y - 10)
    lit = kind in ("done", "ready", "active")
    if lit:
        gl = canvas(S, S); over(gl, GOLD if kind == "ready" else BLUE, fill_sd(r - 7)); gl = blur_layer(gl, 1.6)
        add_glow(a, GOLD if kind == "ready" else BLUE, gl[..., 3] * 0.8)
    over(a, (0, 0, 0), fill_sd(r - 8.6) * 0.8)
    over(a, grad(y / S, STEEL_H, STEEL_D), fill_sd(r - 8.0))
    inner = {"done": ((70, 150, 240), (20, 60, 140)), "ready": ((255, 226, 150), (190, 130, 50)), "active": ((30, 50, 90), (12, 20, 40)),
             "avail": ((26, 32, 46), (14, 17, 24)), "lock": ((34, 36, 44), (18, 19, 24))}[kind]
    over(a, grad(y / S, *inner), fill_sd(r - 6.3))
    ink = (255, 255, 255)
    if kind == "done":
        def chk(d, s): d.line([(6.0 * s, 10.2 * s), (8.8 * s, 13.0 * s), (14.2 * s, 7.2 * s)], fill=255, width=int(1.5 * s), joint="curve")
        over(a, ink, draw_mask(S, S, chk))
    if kind == "ready":
        def star(d, s):
            pts = [(10 + (4.6 if k % 2 == 0 else 2.0) * math.sin(k * math.pi / 5), 10.4 - (4.6 if k % 2 == 0 else 2.0) * math.cos(k * math.pi / 5)) for k in range(10)]
            d.polygon([(p0 * s, p1 * s) for p0, p1 in pts], fill=255)
        over(a, (255, 252, 235), draw_mask(S, S, star))
    if kind == "active":
        over(a, BLUE, np.exp(-((r - 5.6) / 0.6) ** 2))
        def tri(d, s): d.polygon([(8.4 * s, 6.6 * s), (13.6 * s, 10 * s), (8.4 * s, 13.4 * s)], fill=255)
        over(a, BLUE_L, draw_mask(S, S, tri))
    if kind == "avail":
        over(a, (150, 200, 255), fill_sd(np.abs(r - 4.2) - 0.45) * 0.9)
        over(a, (150, 200, 255), fill_sd(r - 1.4))
    if kind == "lock":
        body = sd_rrect(x, y, 10, 11.6, 3.4, 2.6, 0.8)
        over(a, (130, 134, 148), fill_sd(body))
        over(a, (130, 134, 148), fill_sd(np.abs(np.hypot(x - 10, y - 8.4) - 2.3) - 0.55) * (y < 9.2))
        over(a, (30, 32, 40), fill_sd(np.hypot(x - 10, y - 11.4) - 0.8))
    return a
for k in ("done", "ready", "active", "avail", "lock"): save(qnode(k), f"qn_{k}")
def qline(lit):
    a = canvas(4, 40); x, y = grid(a)
    if lit:
        add_glow(a, BLUE, np.exp(-((x - 2) / 1.0) ** 2) * 0.7)
        over(a, BLUE_L, fill_sd(np.abs(x - 2) - 0.45))
    else:
        over(a, (8, 9, 12), fill_sd(np.abs(x - 2) - 0.9))
        over(a, (70, 76, 92), fill_sd(np.abs(x - 2.4) - 0.3) * 0.8)
    return a
save(qline(True), "ql_lit"); save(qline(False), "ql_dim")
print("quest art ok")
