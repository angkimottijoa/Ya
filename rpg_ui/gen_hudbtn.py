"""HUD 버튼 (V12.157 시험판): 항상 열려 있는 투명 서버 폼 [RPG:B] 에 버튼만 그림 → 누르면 스크립트(hudbtn.js)가 실행 후 다시 엶
  server_form.json 의 화면 설정: 입력을 막지 않음 · 뒤에 게임 그림 · 맞아도 안 닫힘 (모든 메뉴 창에 같이 적용됨)
  버튼: 화면 왼쪽 가운데 세로 — ☰ 메뉴 · ① ② ③ ④ 스킬
"""
import json, math
from pathlib import Path
import numpy as np
from PIL import Image
ROOT = Path(__file__).parent; RP = ROOT / "resource_pack"
D = RP / "textures" / "ui" / "rpg" / "hudbtn"; D.mkdir(parents=True, exist_ok=True)
K = 4
def btn(state, S=28):
    y, x = np.mgrid[0:S * K, 0:S * K].astype(np.float32); x = (x + 0.5) / K; y = (y + 0.5) / K
    a = np.zeros((S * K, S * K, 4), np.float32)
    def over(rgb, al):
        al = np.clip(al, 0, 1)[..., None]; c = np.array(rgb, np.float32) / 255 if not isinstance(rgb, np.ndarray) else rgb
        oa = al[..., 0] + a[..., 3] * (1 - al[..., 0]); a[..., :3] = (c * al + a[..., :3] * a[..., 3:4] * (1 - al)) / np.maximum(oa[..., None], 1e-6); a[..., 3] = oa
    g = lambda t, c0, c1: np.array(c0, np.float32) / 255 * (1 - np.clip(t, 0, 1)[..., None]) + np.array(c1, np.float32) / 255 * np.clip(t, 0, 1)[..., None]
    cov = lambda d: np.clip(0.5 - d / 0.3, 0, 1)
    r = np.hypot(x - S / 2, y - S / 2)
    over((0, 0, 0), cov(r - S / 2 + 0.2) * 0.45)
    over(g(y / S, (246, 222, 150), (130, 96, 42)), cov(r - S / 2 + 1.2))
    top, bot = {"idle": ((44, 50, 78), (16, 18, 30)), "press": ((120, 96, 46), (60, 46, 22))}[state]
    over(g(y / S, top, bot), cov(r - S / 2 + 2.6) * (0.82 if state == "idle" else 0.95))
    over((255, 255, 255), cov(np.abs(r - (S / 2 - 3.4)) - 0.2) * 0.12 * (y < S / 2))
    Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), "RGBA").save(D / f"{state}.png")
btn("idle"); btn("press")

# ── 화면 설정: 입력을 막지 않음 (걷기 · 시점 · 공격 그대로) ──
sf = RP / "ui" / "server_form.json"
s = sf.read_text(encoding="utf-8")
old = '''  "third_party_server_screen": {
    "$screen_animations": []
  },'''
new = '''  "third_party_server_screen": {
    "$screen_animations": [],
    // V12.157 HUD 버튼: 폼이 떠 있어도 걷기 · 시점 · 공격이 되게 (모든 메뉴 창에 같이 적용)
    "absorbs_input": false,
    "render_game_behind": true,
    "is_showing_menu": false,
    "should_steal_mouse": false,
    "close_on_player_hurt": false,
    "force_render_below": true
  },'''
if old in s: sf.write_text(s.replace(old, new), encoding="utf-8")
else: assert "absorbs_input" in s

# ── HUD 버튼 화면 [RPG:B] ──
T = "textures/ui/rpg/hudbtn/"
coll = lambda: {"binding_name": "#form_button_text", "binding_type": "collection", "binding_collection_name": "form_buttons"}
face = lambda tex: {"type": "image", "texture": T + tex, "size": ["100%", "100%"], "controls": [{"t": {"type": "label", "text": "#display", "localize": False, "shadow": True, "layer": 3,
    "size": ["100%", "default"], "text_alignment": "center", "font_scale_factor": 0.8, "anchor_from": "center", "anchor_to": "center", "offset": [0, 1], "color": [0.98, 0.93, 0.8],
    "bindings": [coll(), {"binding_type": "view", "source_property_name": "(#form_button_text - '[HB]')", "target_property_name": "#display"}]}}]}
ui = {"namespace": "rpg_hudbtn",
      "f_idle": face("idle"), "f_press": face("press"),
      "btn@rpg_form.form_btn": {"controls": [{"default@rpg_hudbtn.f_idle": {}}, {"hover@rpg_hudbtn.f_idle": {}}, {"pressed@rpg_hudbtn.f_press": {}}]},
      "entry": {"type": "panel", "size": [30, 31], "controls": [{"b@rpg_hudbtn.btn": {"size": [28, 28], "anchor_from": "top_middle", "anchor_to": "top_middle"}}],
                "bindings": [coll(), {"binding_type": "view", "source_property_name": "(not ((#form_button_text - '[HB]') = #form_button_text))", "target_property_name": "#visible"}]},
      "hud_screen@rpg_form.mode_panel": {"$flag": "[RPG:B]", "layer": 2, "controls": [
          {"col": {"type": "stack_panel", "orientation": "vertical", "size": [30, "100%c"], "anchor_from": "left_middle", "anchor_to": "left_middle", "offset": [8, -22],
                   "factory": {"name": "buttons", "control_ids": {"button": "@rpg_hudbtn.entry"}}, "collection_name": "form_buttons",
                   "bindings": [{"binding_name": "#form_button_contents", "binding_name_override": "#collection_length"}]}}]}}
(RP / "ui" / "rpg_hudbtn.json").write_text(json.dumps(ui, ensure_ascii=False, indent=1), encoding="utf-8")
dfs = json.loads((RP / "ui" / "_ui_defs.json").read_text())
if "ui/rpg_hudbtn.json" not in dfs["ui_defs"]: dfs["ui_defs"].append("ui/rpg_hudbtn.json")
(RP / "ui" / "_ui_defs.json").write_text(json.dumps(dfs, indent=2))
# 라우터에 붙이고 책 화면에서 빼기
rf = RP / "ui" / "rpg_form.json"; r = rf.read_text(encoding="utf-8")
if "rpg_hudbtn.hud_screen" not in r:
    r = r.replace('''      {
        "quest@rpg_forge.quest_screen": {}
      }''', '''      {
        "quest@rpg_forge.quest_screen": {}
      },
      {
        "hudbtn@rpg_hudbtn.hud_screen": {}
      }''')
    r = r.replace("and ((#title_text - '[RPG:Q]') = #title_text))\"", "and ((#title_text - '[RPG:Q]') = #title_text) and ((#title_text - '[RPG:B]') = #title_text))\"")
    rf.write_text(r, encoding="utf-8")
assert "rpg_hudbtn.hud_screen" in rf.read_text(encoding="utf-8") and "[RPG:B]') = #title_text))" in rf.read_text(encoding="utf-8")
print("hudbtn ui ok")
