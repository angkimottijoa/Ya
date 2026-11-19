"""RPG 체력 · 마나 HUD (V12.155): 남색 판 + 금테 + 왼쪽 붉은 수정 심장 문양, HP · MP · 경험치 막대, 오른쪽 숫자
  막대 그림은 2.5%(HP · 잔상) / 5%(MP · 경험치) 단위로 미리 그려 둠 → 스크립트가 [H32] 같은 표시로 고름
  역동: 잔상(맞기 전 자리, 흰금빛)이 천천히 따라 내려옴 · 맞으면 붉게 번쩍 · 회복은 초록 번쩍 · 25% 아래면 테두리가 붉게 빛남
  ui/rpg_hud.json 의 status_bar 를 이 그림으로 다시 만듦 (rpg_bar_data = 숫자, rpg_brv_data = 막대 표시)
"""
import json, math
import numpy as np
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).parent; RP = ROOT / "resource_pack"
OUT = RP / "textures" / "ui" / "rpg" / "hp"; OUT.mkdir(parents=True, exist_ok=True)
K = 4
def grid(w, h):
    y, x = np.mgrid[0:h * K, 0:w * K].astype(np.float32)
    return (x + 0.5) / K, (y + 0.5) / K
def rr(x, y, cx, cy, hw, hh, r):
    qx, qy = np.abs(x - cx) - hw + r, np.abs(y - cy) - hh + r
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r
cov = lambda d, aa=0.35: np.clip(0.5 - d / aa, 0, 1)
def blank(w, h): return np.zeros((h * K, w * K, 4), np.float32)
def over(a, rgb, al):
    al = np.clip(al, 0, 1)[..., None]; c = np.array(rgb, np.float32) / 255 if not isinstance(rgb, np.ndarray) else rgb
    oa = al[..., 0] + a[..., 3] * (1 - al[..., 0])
    a[..., :3] = (c * al + a[..., :3] * a[..., 3:4] * (1 - al)) / np.maximum(oa[..., None], 1e-6); a[..., 3] = oa
def grad(t, c0, c1): t = np.clip(t, 0, 1)[..., None]; return np.array(c0, np.float32) / 255 * (1 - t) + np.array(c1, np.float32) / 255 * t
def save(a, name): Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA").save(OUT / f"{name}.png")

W, H = 224, 30
BX, BW = 30, 132            # 막대 x · 폭
ROWS = {"hp": (3, 8), "mp": (12.5, 7), "xp": (21.5, 5)}  # y, 높이
# ── 틀 ──
a = blank(W, H); x, y = grid(W, H)
d = rr(x, y, W / 2, H / 2, W / 2 - 0.5, H / 2 - 0.5, 4)
over(a, (0, 0, 0), cov(d - 0.6) * 0.55)
over(a, grad(y / H, (40, 44, 68), (20, 23, 38)), cov(d))
over(a, grad(y / H, (246, 222, 150), (150, 112, 50)), cov(np.abs(d + 0.9) - 0.75))   # 금테
over(a, (120, 90, 40), cov(np.abs(d + 2.6) - 0.3) * 0.9)                              # 안쪽 가는 금선
for k, (yy, hh) in ROWS.items():                                                       # 막대 홈
    g = rr(x, y, BX + BW / 2, yy + hh / 2, BW / 2 + 0.8, hh / 2 + 0.8, hh / 2 + 0.8)
    over(a, (8, 9, 16), cov(g)); over(a, (120, 90, 40), cov(np.abs(g) - 0.25) * 0.8)
# 왼쪽 문양: 금테 원 + 붉은 수정 심장
cx, cy, R = 15, 15, 12
r = np.hypot(x - cx, y - cy)
over(a, (0, 0, 0), cov(r - R - 0.6) * 0.6)
over(a, grad((y - 3) / 24, (246, 222, 150), (120, 90, 40)), cov(r - R))
over(a, grad((y - 5) / 20, (52, 30, 46), (20, 12, 22)), cov(r - R + 1.6))
hx, hy = (x - cx) / 7.0, -(y - cy - 0.8) / 7.0
heart = (hx * hx + hy * hy - 1) ** 3 - hx * hx * hy ** 3
hm = (heart < 0).astype(np.float32)
over(a, grad((y - 9) / 12, (255, 120, 120), (150, 10, 30)), hm)
over(a, (255, 230, 230), cov(np.hypot(x - (cx - 2.2), y - (cy - 2.2)) - 1.2) * 0.9 * hm)
over(a, (255, 255, 255), cov(np.abs(d + 0.9) - 0.2) * 0.1 * (y < H / 2))
save(a, "frame")
# 낮은 체력: 테두리 붉은 빛
a = blank(W, H); over(a, (255, 40, 40), np.exp(-((d + 1.0) / 1.4) ** 2) * 0.9); save(a, "low")
# ── 막대 그림 ──
def fill(w, h, frac, top, bot, hi, ticks=True, alpha=1.0):
    a = blank(w, h); x, y = grid(w, h)
    fw = w * frac
    if fw > 0.2:
        d = rr(x, y, fw / 2, h / 2, fw / 2, h / 2, min(h / 2, fw / 2))
        over(a, grad(y / h, top, bot), cov(d) * alpha)
        over(a, hi, cov(np.abs(y - 1.3) - 0.45) * cov(d + 0.6) * 0.6 * alpha)           # 윗 광택
        over(a, (0, 0, 0), cov(np.abs(y - (h - 0.8)) - 0.4) * cov(d) * 0.25 * alpha)      # 아래 그림자
        if ticks:
            for t in range(1, 10):
                tx = w * t / 10
                if tx < fw - 0.5: over(a, (0, 0, 0), cov(np.abs(x - tx) - 0.22) * cov(d) * 0.35 * alpha)
    return a
for k in range(41):
    f = k / 40
    save(fill(BW, 8, f, (255, 92, 92), (160, 16, 30), (255, 210, 210)), f"h{k:02d}")
    save(fill(BW, 8, f, (255, 246, 214), (220, 180, 110), (255, 255, 255), ticks=False, alpha=0.9), f"t{k:02d}")
for k in range(21):
    f = k / 20
    save(fill(BW, 7, f, (110, 170, 255), (30, 60, 170), (210, 230, 255)), f"m{k:02d}")
    save(fill(BW, 5, f, (190, 240, 110), (90, 170, 40), (240, 255, 200), ticks=False), f"x{k:02d}")
# 번쩍임 (HP 막대 위)
a = blank(BW, 8); x, y = grid(BW, 8); d = rr(x, y, BW / 2, 4, BW / 2, 4, 4)
b = a.copy(); over(b, (255, 255, 255), cov(d) * 0.55); save(b, "hit")
c = a.copy(); over(c, (120, 255, 140), cov(d) * 0.45); save(c, "heal")

# ───────── HUD JSON ─────────
f = RP / "ui" / "rpg_hud.json"
u = json.loads(f.read_text(encoding="utf-8"))
root = u["root"]; root["$brv_prefix"] = "[BRV]"
if not any("rpg_brv_data@rpg_hud.data_control" in c for c in root["controls"]):
    root["controls"].insert(3, {"rpg_brv_data@rpg_hud.data_control": {"$src": "#hud_subtitle_text_string", "$pre": "[BRV]"}})
T = "textures/ui/rpg/hp/"
def has(m): return f"(not ((#preserved_text - '{m}') = #preserved_text))"
def marked(name, tex, m, size, off, layer):
    return {name: {"type": "image", "texture": T + tex, "size": size, "anchor_from": "top_left", "anchor_to": "top_left", "offset": off, "layer": layer,
                   "bindings": [{"binding_type": "view", "source_control_name": "rpg_brv_data", "source_property_name": has(m), "target_property_name": "#visible"}]}}
ctr = [{"frame": {"type": "image", "texture": T + "frame", "size": [W, H], "layer": 1}}, marked("low", "low", "[LOW]", [W, H], [0, 0], 7)]
for k in range(41):
    ctr.append(marked(f"t{k}", f"t{k:02d}", f"[T{k:02d}]", [BW, 8], [BX, 3], 3))
    ctr.append(marked(f"h{k}", f"h{k:02d}", f"[H{k:02d}]", [BW, 8], [BX, 3], 4))
for k in range(21):
    ctr.append(marked(f"m{k}", f"m{k:02d}", f"[M{k:02d}]", [BW, 7], [BX, 12.5], 4))
    ctr.append(marked(f"x{k}", f"x{k:02d}", f"[X{k:02d}]", [BW, 5], [BX, 21.5], 4))
ctr.append(marked("hit", "hit", "[HIT]", [BW, 8], [BX, 3], 5))
ctr.append(marked("heal", "heal", "[HEAL]", [BW, 8], [BX, 3], 5))
ctr.append({"nums": {"type": "label", "anchor_from": "top_left", "anchor_to": "top_left", "offset": [BX + BW + 5, 2.5], "size": [W - BX - BW - 8, 30], "layer": 6,
                     "font_scale_factor": 0.9, "color": [1, 1, 1], "shadow": True, "localize": False, "text": "#text",
                     "bindings": [{"binding_type": "view", "source_control_name": "rpg_bar_data", "source_property_name": "(#preserved_text - $bar_prefix)", "target_property_name": "#text"}]}})
u["status_bar"] = {"type": "panel", "anchor_from": "bottom_middle", "anchor_to": "bottom_middle", "offset": [0, -44], "size": [W, H], "layer": 3, "controls": ctr,
                   "bindings": [{"binding_type": "view", "source_control_name": "rpg_bar_data", "source_property_name": "(not ((#preserved_text - $bar_prefix) = ''))", "target_property_name": "#visible"}]}
f.write_text(json.dumps(u, ensure_ascii=False, indent=2), encoding="utf-8")
print("hp hud ok")
