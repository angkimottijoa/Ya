# 연성소 새 틀 그림 (V12.136) — 4배 해상도로 매끈하게 그림 (화면 단위 1 = 그림 4픽셀)
#   어두운 강철 테두리 · 모서리 푸른 보석 장식 · 위 문장 · 빛나는 룬 · 칸 · 아이템 뒤 번개 빛 · 마디 막대 · 끝이 뾰족한 큰 버튼
import math, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
K = 4          # 화면 1 = 4픽셀
SS = 2         # 계단 없애기용 2배로 그린 뒤 줄임
OUT = "resource_pack/textures/ui/rpg/forge"
os.makedirs(OUT, exist_ok=True)

# 기존 메뉴 색: 남색 판(#141826 · #1e2234 · #282c44) · 금테(#785a28 · #d6ac52 · #f6de96) · 크림(#ece5d8)
STEEL_D, STEEL, STEEL_L, STEEL_H = (14, 16, 26), (120, 90, 40), (214, 172, 82), (246, 222, 150)   # 테두리 = 금
BRONZE = (92, 74, 36)
PANEL_T, PANEL_B = (34, 38, 60), (20, 24, 38)
BLUE, BLUE_L, BLUE_D = (214, 172, 82), (246, 222, 150), (120, 90, 40)                          # 빛 · 보석 = 금
GOLD = (236, 229, 216)
NAVY_L, NAVY, NAVY_D = (58, 64, 92), (40, 44, 68), (22, 25, 40)

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
def frame_cols(d):  # 바깥에서 거리 d → 색 · 덮음 (두께 8: 검은 선 · 금 테 · 틈 · 가는 금 선)
    col = np.zeros(d.shape + (3,), np.float32); cov = np.zeros(d.shape, np.float32)
    def band(lo, hi, c0, c1=None, alpha=1.0):
        m = (d >= lo) & (d < hi); c = grad((d - lo) / (hi - lo), c0, c1 or c0); col[m] = c[m]; cov[m] = alpha
    band(0, 0.7, (10, 11, 18))
    band(0.7, 2.9, (246, 222, 150), (150, 112, 50))   # 금 테 (위가 밝게)
    band(2.9, 3.6, (10, 11, 18))
    band(3.6, 5.4, (24, 27, 44))                      # 남색 틈
    band(5.4, 6.1, (186, 146, 66))                    # 안쪽 가는 금 선
    band(6.1, 8.01, PANEL_T, PANEL_T, 0.0)
    return col, cov
def edge(horizontal, top_side):
    L, T = (16, 8) if horizontal else (8, 16)
    a = canvas(L, T); x, y = grid(a)
    d = (y if top_side else (T - y)) if horizontal else (x if top_side else (L - x))
    col, cov = frame_cols(d)
    over(a, col, cov)
    return a
save(edge(True, True), "edge_t"); save(edge(True, False), "edge_b")
save(edge(False, True), "edge_l"); save(edge(False, False), "edge_r")

# ───────── 모서리 (30x30, 왼쪽 위 기준 → 뒤집어서 넷) ─────────
def corner():
    S = 16
    a = canvas(S, S); x, y = grid(a)
    cut = 4.0                              # 비스듬히 깎는 크기
    d = np.minimum(np.minimum(x, y), (x + y - cut) / math.sqrt(2))
    col, cov = frame_cols(d)
    over(a, col, cov * ((x + y) >= cut - 0.01))
    # 안쪽 작은 ㄱ자 장식 (금 선)
    br = np.minimum(np.maximum(np.abs(y - 9.2) - 0.35, np.abs(x - 12.0) - 2.8), np.maximum(np.abs(x - 9.2) - 0.35, np.abs(y - 12.0) - 2.8))
    over(a, (214, 172, 82), fill_sd(br) * 0.9)
    return a
c = corner()
im = save(c, "corner_tl")  # 16x16
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
    over(a, (60, 44, 18), np.clip(-gem * 8 + 0.6, 0, 1))
    facet = np.where(x < cx, 1.0, 0.65) * np.where(y < 15.5, 1.0, 0.8)
    over(a, grad(facet, BLUE_D, (255, 236, 170)), np.clip(-gem * 8 - 1.0, 0, 1))
    over(a, (255, 255, 255), fill_sd(np.hypot(x - (cx - 1.5), y - 11.5) - 0.8))
    noise(a, 0.02, 12)
    return a

# ───────── 안쪽 카드 (268x80) ─────────
def card(w, h, seed=4):
    a = canvas(w, h); x, y = grid(a)
    d = sd_rrect(x, y, w / 2, h / 2, w / 2 - 0.6, h / 2 - 0.6, 5)
    over(a, (0, 0, 0), fill_sd(d - 0.5) * 0.6)
    over(a, grad(y / h, (30, 34, 54), (20, 23, 38)), fill_sd(d))
    over(a, (120, 90, 40), fill_sd(np.abs(d + 0.5) - 0.3) * 0.95)
    over(a, (255, 255, 255), fill_sd(np.abs(d + 1.2) - 0.18) * 0.07 * (y < h / 2))
    # 위쪽 가운데에서 내려오는 아주 옅은 빛
    add_glow(a, (120, 96, 50), np.exp(-(((x - w / 2) / (w * 0.35)) ** 2 + ((y - h * 0.45) / (h * 0.6)) ** 2)) * 0.08 * fill_sd(d))
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
    base = grad(np.hypot(x - S / 2, y - S * 0.38) / (S * 0.75), (74, 60, 30) if state == "on" else (64, 70, 100) if state == "hover" else (52, 58, 84), (18, 21, 34))
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
    over(a, grad(y / S, (120, 90, 40), (40, 30, 14)), fill_sd(r - 5.5))
    over(a, grad(y / S, (246, 222, 150), (190, 146, 62)), fill_sd(r - 4.4))
    over(a, (40, 30, 14), fill_sd(np.maximum(np.abs(x - 6) - 2.6, np.abs(y - 6) - 0.65)))
    over(a, (40, 30, 14), fill_sd(np.maximum(np.abs(y - 6) - 2.6, np.abs(x - 6) - 0.65)))
    over(a, (255, 255, 255), fill_sd(np.hypot(x - 4.2, y - 3.6) - 1.4) * 0.25)
    return a
save(plus(), "plus")

# ───────── 아이템 뒤 번개 빛 (56) + 아이템 틀 (40) ─────────
def halo():
    S = 56
    a = canvas(S, S); x, y = grid(a)
    r = np.hypot(x - S / 2, y - S / 2)
    add_glow(a, (110, 84, 36), np.exp(-(r / 20) ** 2) * 0.5)
    add_glow(a, BLUE, np.exp(-((r - 21) / 2.2) ** 2) * 0.85)
    add_glow(a, BLUE_L, np.exp(-((r - 21) / 0.7) ** 2) * 0.9)
    return a
save(halo(), "halo")
def item_frame():
    S = 40
    a = canvas(S, S); x, y = grid(a)
    d = sd_rrect(x, y, S / 2, S / 2, S / 2 - 0.6, S / 2 - 0.6, 4)
    over(a, (0, 0, 0), fill_sd(d - 0.6) * 0.5)
    over(a, (214, 172, 82), fill_sd(np.abs(d + 0.4) - 0.35) * 0.6)
    over(a, grad(y / S, (52, 58, 86), (16, 19, 32)), fill_sd(d + 1.0) * 0.7)
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
    over(a, (12, 14, 24), fill_sd(di))
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
    over(a, grad((y - 2) / (H - 4), BLUE_L, (190, 140, 56)), lit)
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
            over(a, (120, 90, 40), fill_sd(np.abs(dm + 0.5) - 0.3))
    return a
for L in range(16): save(pips(L), f"pips_{L}")

# ───────── 큰 버튼 (150x30): 양끝 뾰족 · 강철 테 · 푸른 판 · 위 광택 ─────────
def big_button(state):
    W, H = 150, 26
    a = canvas(W, H); x, y = grid(a)
    d = sd_rrect(x, y, W / 2, H / 2, W / 2 - 0.5, H / 2 - 0.5, 5)
    over(a, (0, 0, 0), fill_sd(d - 0.8) * 0.6)
    over(a, grad(y / H, (246, 222, 150), (120, 90, 40)), fill_sd(d))
    di = d + 1.3
    top, bot = {"idle": ((112, 88, 42), (62, 48, 24)), "hover": ((146, 116, 56), (80, 62, 30)), "down": ((52, 40, 20), (96, 74, 36))}[state]
    over(a, grad(y / H, top, bot), fill_sd(di))
    if state != "down": over(a, (255, 240, 200), fill_sd(di + 1.0) * np.clip((H * 0.45 - y) / 5, 0, 1) * 0.16)
    over(a, (255, 240, 200), fill_sd(np.abs(di + 0.5) - 0.18) * 0.25 * (y < H / 2))
    return a
for st in ("idle", "hover", "down"): save(big_button(st), f"btn_{st}")

# ───────── 작은 버튼 (66x20) ─────────
def small_button(state):
    W, H = 56, 20
    a = canvas(W, H); x, y = grid(a)
    d = sd_rrect(x, y, W / 2, H / 2, W / 2 - 0.5, H / 2 - 0.5, 4)
    over(a, (0, 0, 0), fill_sd(d - 0.6) * 0.6)
    over(a, grad(y / H, STEEL_L, STEEL_D), fill_sd(d))
    di = d + 1.6
    top, bot = {"idle": ((40, 44, 68), (26, 29, 46)), "hover": ((92, 74, 36), (60, 54, 34)), "down": ((26, 29, 46), (40, 44, 68))}[state]
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
    over(a, grad(y / S, (40, 44, 68) if state == "idle" else (92, 74, 36), (20, 23, 38)), fill_sd(r - 5.8))
    u, v = (x - 8 + y - 8) / math.sqrt(2), (x - 8 - (y - 8)) / math.sqrt(2)
    xm = np.minimum(np.maximum(np.abs(u) - 3.0, np.abs(v) - 0.7), np.maximum(np.abs(v) - 3.0, np.abs(u) - 0.7))
    over(a, (230, 220, 200) if state == "idle" else (255, 200, 190), fill_sd(xm))
    return a
save(close_btn("idle"), "close"); save(close_btn("hover"), "close_hover")

# ───────── 화면 가장자리 어둡게 (전체 화면에 늘림) ─────────
def vignette():
    a = canvas(64, 64); x, y = grid(a)
    r = np.hypot((x - 32) / 32, (y - 32) / 32)
    over(a, (8, 10, 20), np.clip(0.55 + 0.4 * r ** 2, 0, 0.92))
    return a
save(vignette(), "vignette")

# ───────── 재료 칸 (20) ─────────
def mslot():
    S = 20
    a = canvas(S, S); x, y = grid(a)
    d = sd_rrect(x, y, S / 2, S / 2, S / 2 - 0.5, S / 2 - 0.5, 2.4)
    over(a, grad(y / S, STEEL_L, STEEL_D), fill_sd(d))
    over(a, grad(y / S, (52, 58, 84), (18, 21, 34)), fill_sd(d + 1.4))
    return a
save(mslot(), "mslot")
print("art ok")

# ═════════ 퀘스트 창 새 틀 조각 ═════════
def plate(W, H, state, r=4, tones=None):
    a = canvas(W, H); x, y = grid(a)
    d = sd_rrect(x, y, W / 2, H / 2, W / 2 - 0.5, H / 2 - 0.5, r)
    over(a, (0, 0, 0), fill_sd(d - 0.6) * 0.6)
    over(a, grad(y / H, STEEL_L if state != "on" else STEEL_H, STEEL), fill_sd(d))
    di = d + 1.4
    top, bot = tones or {"idle": ((40, 44, 68), (26, 29, 46)), "hover": ((70, 58, 30), (48, 42, 28)), "on": ((96, 78, 38), (64, 52, 26)), "down": ((26, 29, 46), (40, 44, 68))}[state]
    over(a, grad(y / H, top, bot), fill_sd(di))
    if state in ("hover", "on"): add_glow(a, BLUE if state == "hover" else BLUE_L, np.exp(-((di + 0.3) / 0.55) ** 2) * (0.7 if state == "hover" else 0.9))
    over(a, (255, 255, 255), fill_sd(np.abs(di + 0.6) - 0.2) * 0.09 * (y < H / 2))
    return a

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
    inner = {"done": ((240, 210, 130), (170, 124, 48)), "ready": ((250, 244, 228), (214, 200, 170)), "active": ((40, 44, 68), (20, 23, 38)),
             "avail": ((34, 38, 60), (18, 21, 34)), "lock": ((30, 32, 46), (16, 17, 26))}[kind]
    over(a, grad(y / S, *inner), fill_sd(r - 6.3))
    ink = (60, 42, 16)
    if kind == "done":
        def chk(d, s): d.line([(6.0 * s, 10.2 * s), (8.8 * s, 13.0 * s), (14.2 * s, 7.2 * s)], fill=255, width=int(1.5 * s), joint="curve")
        over(a, ink, draw_mask(S, S, chk))
    if kind == "ready":
        def star(d, s):
            pts = [(10 + (4.6 if k % 2 == 0 else 2.0) * math.sin(k * math.pi / 5), 10.4 - (4.6 if k % 2 == 0 else 2.0) * math.cos(k * math.pi / 5)) for k in range(10)]
            d.polygon([(p0 * s, p1 * s) for p0, p1 in pts], fill=255)
        over(a, (200, 150, 60), draw_mask(S, S, star))
    if kind == "active":
        over(a, BLUE, np.exp(-((r - 5.6) / 0.6) ** 2))
        def tri(d, s): d.polygon([(8.4 * s, 6.6 * s), (13.6 * s, 10 * s), (8.4 * s, 13.4 * s)], fill=255)
        over(a, BLUE_L, draw_mask(S, S, tri))
    if kind == "avail":
        over(a, (236, 229, 216), fill_sd(np.abs(r - 4.2) - 0.45) * 0.9)
        over(a, (236, 229, 216), fill_sd(r - 1.4))
    if kind == "lock":
        body = sd_rrect(x, y, 10, 11.6, 3.4, 2.6, 0.8)
        over(a, (110, 110, 128), fill_sd(body))
        over(a, (110, 110, 128), fill_sd(np.abs(np.hypot(x - 10, y - 8.4) - 2.3) - 0.55) * (y < 9.2))
        over(a, (30, 32, 40), fill_sd(np.hypot(x - 10, y - 11.4) - 0.8))
    return a
def qline(lit):
    a = canvas(4, 40); x, y = grid(a)
    if lit:
        add_glow(a, BLUE, np.exp(-((x - 2) / 1.0) ** 2) * 0.7)
        over(a, BLUE_L, fill_sd(np.abs(x - 2) - 0.45))
    else:
        over(a, (8, 9, 12), fill_sd(np.abs(x - 2) - 0.9))
        over(a, (64, 70, 100), fill_sd(np.abs(x - 2.4) - 0.3) * 0.8)
    return a
print("quest art ok")
