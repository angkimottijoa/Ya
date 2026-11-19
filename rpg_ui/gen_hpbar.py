"""RPG 체력 · 마나 HUD (V12.155 · V12.156 새 그림 tools/hpbar_v2.py): 상자 없이 떠 있는 비스듬한 막대 + 장식 문장, HP · MP · 경험치 막대, 오른쪽 숫자
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
# ── 그림: tools/hpbar_v2.py (V12.156: 상자 없이 떠 있는 비스듬한 막대 · 액체 광택 · 얇은 금테 · 장식 문장) ──
import subprocess, sys
subprocess.run([sys.executable, str(ROOT / "tools" / "hpbar_v2.py"), str(OUT)], check=True)
W, H = 200, 28
# ───────── HUD JSON ─────────
f = RP / "ui" / "rpg_hud.json"
u = json.loads(f.read_text(encoding="utf-8"))
root = u["root"]; root["$brv_prefix"] = "[BRV]"
if not any("rpg_brv_data@rpg_hud.data_control" in c for c in root["controls"]):
    root["controls"].insert(3, {"rpg_brv_data@rpg_hud.data_control": {"$src": "#hud_subtitle_text_string", "$pre": "[BRV]"}})
T = "textures/ui/rpg/hp/"
def has(m): return f"(not ((#preserved_text - '{m}') = #preserved_text))"
def marked(name, tex, m, size=None, off=(0, 0), layer=3):
    size = size or [W, H]
    return {name: {"type": "image", "texture": T + tex, "size": size, "anchor_from": "top_left", "anchor_to": "top_left", "offset": off, "layer": layer,
                   "bindings": [{"binding_type": "view", "source_control_name": "rpg_brv_data", "source_property_name": has(m), "target_property_name": "#visible"}]}}
ctr = [{"frame": {"type": "image", "texture": T + "frame", "size": [W, H], "layer": 1}}, marked("low", "low", "[LOW]", layer=7)]
for k in range(41):
    ctr.append(marked(f"t{k}", f"t{k:02d}", f"[T{k:02d}]", layer=3))
    ctr.append(marked(f"h{k}", f"h{k:02d}", f"[H{k:02d}]", layer=4))
for k in range(21):
    ctr.append(marked(f"m{k}", f"m{k:02d}", f"[M{k:02d}]", layer=4))
    ctr.append(marked(f"x{k}", f"x{k:02d}", f"[X{k:02d}]", layer=4))
ctr.append(marked("hit", "hit", "[HIT]", layer=5))
ctr.append(marked("heal", "heal", "[HEAL]", layer=5))
ctr.append({"nums": {"type": "label", "anchor_from": "top_left", "anchor_to": "top_left", "offset": [W - 16, 3], "size": [56, 28], "layer": 6,
                     "font_scale_factor": 0.75, "color": [1, 1, 1], "shadow": True, "localize": False, "text": "#text",
                     "bindings": [{"binding_type": "view", "source_control_name": "rpg_bar_data", "source_property_name": "(#preserved_text - $bar_prefix)", "target_property_name": "#text"}]}})
u["status_bar"] = {"type": "panel", "anchor_from": "bottom_middle", "anchor_to": "bottom_middle", "offset": [-20, -44], "size": [W + 40, H], "layer": 3, "controls": ctr,
                   "bindings": [{"binding_type": "view", "source_control_name": "rpg_bar_data", "source_property_name": "(not ((#preserved_text - $bar_prefix) = ''))", "target_property_name": "#visible"}]}
f.write_text(json.dumps(u, ensure_ascii=False, indent=2), encoding="utf-8")
print("hp hud ok")
