# RPG 체력 HUD v2 (V12.156) — 상자 없이 떠 있는 날렵한 막대 (비스듬히 기운 평행사변형) · 액체 광택 · 얇은 금테 · 왼쪽 장식 문장
import math, sys
import numpy as np
from PIL import Image, ImageFilter
K = 4
OUT = sys.argv[1] if len(sys.argv) > 1 else "resource_pack/textures/ui/rpg/hp"
def grid(w, h):
    y, x = np.mgrid[0:h * K, 0:w * K].astype(np.float32); return (x + 0.5) / K, (y + 0.5) / K
def blank(w, h): return np.zeros((h * K, w * K, 4), np.float32)
cov = lambda d, aa=0.3: np.clip(0.5 - d / aa, 0, 1)
def over(a, rgb, al):
    al = np.clip(al, 0, 1)[..., None]; c = np.array(rgb, np.float32) / 255 if not isinstance(rgb, np.ndarray) else rgb
    oa = al[..., 0] + a[..., 3] * (1 - al[..., 0])
    a[..., :3] = (c * al + a[..., :3] * a[..., 3:4] * (1 - al)) / np.maximum(oa[..., None], 1e-6); a[..., 3] = oa
def add(a, rgb, al): al = np.clip(al, 0, 1)[..., None]; a[..., :3] = np.clip(a[..., :3] + np.array(rgb, np.float32) / 255 * al, 0, 1); a[..., 3] = np.maximum(a[..., 3], al[..., 0])
def grad(t, *cs):
    t = np.clip(t, 0, 1); n = len(cs) - 1; i = np.minimum((t * n).astype(int), n - 1); f = (t * n - i)[..., None]
    C = np.array(cs, np.float32) / 255; return C[i] * (1 - f) + C[i + 1] * f
def blur(al, r): im = Image.fromarray((np.clip(al, 0, 1) * 255).astype(np.uint8)); return np.asarray(im.filter(ImageFilter.GaussianBlur(r * K))).astype(np.float32) / 255
def save(a, name): Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA").save(f"{OUT}/{name}.png")
SK = math.tan(math.radians(14))
def para(x, y, x0, w, y0, h, r=1.2):
    """비스듬한 평행사변형(오른쪽으로 기움) 거리"""
    xs = x + (y - (y0 + h / 2)) * SK
    qx, qy = np.abs(xs - (x0 + w / 2)) - w / 2 + r, np.abs(y - (y0 + h / 2)) - h / 2 + r
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
W, H = 200, 28
HPB = (27, 150, 5, 10)   # x, w, y, h
MPB = (31, 128, 16.5, 5.5)
XPB = (34, 104, 24, 2.2)
GOLD = [(255, 236, 170), (214, 172, 82), (120, 86, 36)]

def track():
    a = blank(W, H); x, y = grid(W, H)
    for (bx, bw, by, bh) in (HPB, MPB, XPB):
        d = para(x, y, bx, bw, by, bh, min(1.2, bh / 2))
        sh = blur(cov(d - 0.5), 1.2); over(a, (0, 0, 0), sh * 0.55)                               # 그림자
        over(a, grad((y - by) / bh, (6, 6, 12), (22, 20, 32)), cov(d))                              # 홈 (안쪽 그림자)
        over(a, grad((y - by + 1) / (bh + 2), *GOLD), cov(np.abs(d + 0.1) - 0.35))                   # 얇은 금테
    # 왼쪽 장식 문장: 세로로 긴 마름모 방패 + 금 테두리 + 붉은 보석 + 양옆 작은 날개 장식
    cx, cy = 13, 14
    dm = np.abs(x - cx) / 10 + np.abs(y - cy) / 13.5 - 1
    over(a, (0, 0, 0), blur(cov(dm * 10 - 0.5), 1.0) * 0.6)
    for sg in (-1, 1):
        wing = np.abs((x - (cx + sg * 9.5)) / 3.2) + np.abs((y - (cy - 3)) / 1.6) - 1
        over(a, grad((y - cy + 6) / 8, *GOLD), cov(wing * 3))
    over(a, grad((y - cy + 13) / 26, *GOLD), cov(dm * 10))
    dm2 = np.abs(x - cx) / 8 + np.abs(y - cy) / 11.3 - 1
    over(a, grad((y - cy + 11) / 22, (44, 20, 34), (14, 8, 14)), cov(dm2 * 8))
    gem = np.abs(x - cx) / 4.6 + np.abs(y - cy) / 6.4 - 1
    glow = blur(cov(gem * 4.6 + 1), 1.4); add(a, (255, 60, 60), glow * 0.5)
    facet = np.where(x < cx, 1.0, 0.6) * np.where(y < cy, 1.0, 0.75)
    over(a, grad(1 - facet, (255, 110, 110), (150, 10, 30)), cov(gem * 4.6))
    over(a, (255, 235, 235), cov(np.hypot(x - (cx - 1.4), y - (cy - 2.6)) - 0.9) * 0.9)
    return a

def fill(b, frac, cols, hi=True, alpha=1.0, shine=True):
    bx, bw, by, bh = b
    a = blank(W, H); x, y = grid(W, H)
    if frac <= 0: return a
    d = para(x, y, bx, bw, by, bh, min(1.2, bh / 2)) + 0.45
    xs = x + (y - (by + bh / 2)) * SK
    m = cov(d) * cov(xs - (bx + bw * frac))
    over(a, grad((y - by) / bh, *cols), m * alpha)
    if hi: over(a, (255, 255, 255), m * cov(np.abs(y - (by + bh * 0.28)) - bh * 0.1) * 0.35 * alpha)  # 윗 광택 줄
    if shine:  # 비스듬한 빛 반사 (액체 느낌)
        band = np.abs(((xs - bx) * 0.9 + (y - by) * 2.2) % 22 - 11) < 1.1
        over(a, (255, 255, 255), m * band * 0.08 * alpha)
    edge = cov(np.abs(xs - (bx + bw * frac - 0.5)) - 0.35) * cov(d)                                    # 채움 끝 밝은 선
    if frac < 0.999: over(a, (255, 255, 255), edge * 0.5 * alpha)
    return a

if __name__ == "__main__":
    import os; os.makedirs(OUT, exist_ok=True)
    save(track(), "frame")
    HPC = [(255, 140, 120), (226, 40, 52), (130, 8, 30)]
    TRC = [(255, 248, 224), (246, 214, 150), (200, 150, 90)]
    MPC = [(150, 210, 255), (50, 120, 240), (20, 40, 130)]
    XPC = [(255, 240, 160), (230, 180, 60)]
    for k in range(41):
        save(fill(HPB, k / 40, HPC), f"h{k:02d}")
        save(fill(HPB, k / 40, TRC, hi=False, alpha=0.85, shine=False), f"t{k:02d}")
    for k in range(21):
        save(fill(MPB, k / 20, MPC), f"m{k:02d}")
        save(fill(XPB, k / 20, XPC, hi=False, shine=False), f"x{k:02d}")
    a = blank(W, H); x, y = grid(W, H)
    d = para(x, y, *HPB[:1], HPB[1], HPB[2], HPB[3]) + 0.45
    b = a.copy(); add(b, (255, 90, 90), np.exp(-((d - 0.3) / 0.9) ** 2) * 0.9); add(b, (255, 255, 255), cov(d) * 0.12); save(b, "hit")  # 맞음: 테두리 붉은 빛 + 아주 옅은 흰빛
    c = a.copy(); add(c, (120, 255, 150), cov(d) * 0.35); save(c, "heal")
    lo = a.copy(); x, y = grid(W, H)
    for bb in (HPB,):
        dd = para(x, y, bb[0], bb[1], bb[2], bb[3])
        add(lo, (255, 30, 30), np.exp(-((dd) / 1.6) ** 2) * 0.9)
    dm = np.abs(x - 13) / 10 + np.abs(y - 14) / 13.5 - 1; add(lo, (255, 30, 30), np.exp(-((dm * 10) / 1.8) ** 2) * 0.9)
    save(lo, "low")
    print("v2 ok")
