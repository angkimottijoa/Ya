# 연성소 화면 (V12.135): 기존 메뉴 틀(레일 · 위 막대 · 칩) 안에, 기존 카드 · 칸 · 액션 버튼 텍스처로 그림
#   새 텍스처는 같은 색(남색 + 금테 + 크림)으로 3가지만: + 표시 · 아이템 뒤 은은한 빛 · 확률 막대 21단계
import json, math, os
from PIL import Image
D = "resource_pack/textures/ui/rpg/forge"
os.makedirs(D, exist_ok=True)
NAVY, NAVY2, GOLD, GOLD_D, CREAM = (30, 34, 51), (22, 25, 38), (201, 160, 74), (140, 104, 44), (244, 236, 214)
def px(c, a=255): return tuple(c) + (a,)
def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

# + 표시 (남색 원 · 금테 · 크림 +)
P = Image.new("RGBA", (12, 12), (0, 0, 0, 0)); p = P.load()
for y in range(12):
    for x in range(12):
        r = math.hypot(x - 5.5, y - 5.5)
        if r <= 5.7: p[x, y] = px(GOLD if r > 4.6 else NAVY)
for i in range(3, 9): p[i, 5] = p[i, 6] = p[5, i] = p[6, i] = px(CREAM)
P.save(f"{D}/plus.png")

# 아이템 뒤 빛 (금빛, 아주 옅게)
G = Image.new("RGBA", (48, 48), (0, 0, 0, 0)); p = G.load()
for y in range(48):
    for x in range(48):
        r = math.hypot(x - 23.5, y - 23.5) / 23.5
        if r < 1: p[x, y] = px(lerp((255, 214, 120), (201, 160, 74), r), int(120 * (1 - r) ** 1.6))
G.save(f"{D}/halo.png")

# 확률 막대 160x8 × 21 (0, 5, … 100%) — 남색 홈 · 금테 · 금색 마디
for k in range(21):
    B = Image.new("RGBA", (160, 8), (0, 0, 0, 0)); p = B.load()
    for y in range(8):
        for x in range(160):
            if x in (0, 159) and y in (0, 7): continue
            p[x, y] = px(GOLD_D if (x in (0, 159) or y in (0, 7)) else NAVY2)
    fill = round(156 * k / 20)
    for x in range(2, 2 + fill):
        if (x - 2) % 13 == 12: continue  # 마디 사이 틈
        for y in range(2, 6):
            p[x, y] = px((255, 236, 170) if y == 2 else (232, 186, 88) if y <= 4 else (178, 128, 52))
    B.save(f"{D}/bar_{k * 5}.png")


# 강화 단계 구슬 0~15 (90x7): 채운 칸은 단계 색(크림 · 초록 · 하늘 · 보라), 빈 칸은 남색 + 옅은 금테
TIERC = [(244, 236, 214), (120, 220, 130), (110, 200, 255), (215, 140, 255)]
for L in range(16):
    B = Image.new("RGBA", (90, 7), (0, 0, 0, 0)); p = B.load()
    for i in range(15):
        ox = i * 6; t = 0 if i < 4 else 1 if i < 8 else 2 if i < 12 else 3
        for y in range(7):
            for x in range(5):
                r = abs(x - 2) + abs(y - 3)
                if r > 3: continue
                if i < L: c = px((255, 255, 255)) if (x, y) == (2, 1) else px(TIERC[t] if r < 3 else lerp(TIERC[t], (40, 40, 60), 0.45))
                else: c = px(GOLD_D, 200) if r == 3 else px(NAVY2)
                p[ox + x, y] = c
    B.save(f"{D}/pips_{L}.png")

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

# ═════════ 화면 JSON (ui/rpg_forge.json) ═════════
#  제목 [RPG:F] — 기존 책 화면(레일 · 위 막대 · 칩)은 그대로, 가운데만 이 레이아웃으로 바뀜
#  버튼 마커: [FL] 왼쪽 칸(주문서) [FR] 오른쪽 칸(방지석) [FC] 가운데 아이템 [FV] 큰 +단계 [FS] 작은 설명
#  [FK]/[FW] 수치 줄 왼쪽/오른쪽 [FB] 확률 막대(아이콘 = 막대 그림) [FN] 막대 아래 작은 줄 [FM] 재료 [FG] 큰 강화 버튼 [FA] 작은 버튼
MARKS = ["[FL]", "[FR]", "[FC]", "[FV]", "[FS]", "[FK]", "[FW]", "[FB]", "[FN]", "[FM]", "[FG]", "[FA]", "[FP]", "[FT]", "[ON]", "[I]", "[Q0]", "[Q1]", "[Q2]", "[Q3]", "[Q4]", "[QF]", "[QE]", "[QG]"]
T, U = "textures/ui/rpg/forge/", "textures/ui/rpg/"
strip = "#form_button_text"
for m in MARKS: strip = f"({strip} - '{m}')"
def coll(): return {"binding_name": "#form_button_text", "binding_type": "collection", "binding_collection_name": "form_buttons"}
A = lambda a, b=None: {"anchor_from": a, "anchor_to": b or a}
def label(size, align="left", scale=None, color=(0.96, 0.94, 0.9), **kw):
    d = {"type": "label", "text": "#display", "localize": False, "shadow": True, "layer": 7, "size": size, "text_alignment": align, "color": list(color),
         "bindings": [coll(), {"binding_type": "view", "source_property_name": strip, "target_property_name": "#display"}]}
    if scale: d["font_scale_factor"] = scale
    d.update(kw); return d
def static(text, size, **kw):
    d = {"type": "label", "text": text, "localize": False, "shadow": True, "layer": 7, "size": size, "color": [0.7, 0.71, 0.76]}
    d.update(kw); return d
def icon(size, **kw):
    d = {"type": "image", "size": size, "layer": 6, "bindings": [
        {"binding_name": "#form_button_texture", "binding_name_override": "#texture", "binding_type": "collection", "binding_collection_name": "form_buttons"},
        {"binding_name": "#form_button_texture_file_system", "binding_name_override": "#texture_file_system", "binding_type": "collection", "binding_collection_name": "form_buttons"},
        {"binding_type": "view", "source_property_name": "(not ((#texture = '') or (#texture = 'loading')))", "target_property_name": "#visible"}]}
    d.update(kw); return d
def has(marker): return f"(not ((#form_button_text - '{marker}') = #form_button_text))"
def entry(marker, size, controls):
    return {"type": "panel", "size": size, "controls": controls, "bindings": [coll(), {"binding_type": "view", "source_property_name": has(marker), "target_property_name": "#visible"}]}
def factory(name, ctrl, size, orient="vertical", **kw):
    d = {"type": "stack_panel", "orientation": orient, "size": size, "factory": {"name": "buttons", "control_ids": {"button": f"@rpg_forge.{ctrl}"}},
         "collection_name": "form_buttons", "bindings": [{"binding_name": "#form_button_contents", "binding_name_override": "#collection_length"}]}
    d.update(kw); return {name: d}
def button(faces):
    return {"controls": [{"default@rpg_forge." + faces[0]: {}}, {"hover@rpg_forge." + faces[1]: {}}, {"pressed@rpg_forge." + faces[2]: {}}]}
def on_img(tex, marker="[ON]", show=True):  # [ON] 이 있으면 / 없으면 보이는 그림
    src = has(marker) if show else f"((#form_button_text - '{marker}') = #form_button_text)"
    return {"type": "image", "texture": tex, "size": ["100%", "100%"], "bindings": [coll(), {"binding_type": "view", "source_property_name": src, "target_property_name": "#visible"}]}

ui = {"namespace": "rpg_forge"}
# ── 양옆 칸 (주문서 · 방지석): 배낭 칸과 같은 금테 타일, 고르면 금빛 테두리 ──
for nm, tex in (("slot_face", "tile_default"), ("slot_face_h", "tile_hover")):
    ui[nm] = {"type": "panel", "size": ["100%", "100%"], "controls": [
        {"off": on_img(U + tex, show=False)}, {"on": on_img(U + "tab_on")},
        {"icon": icon([20, 20], **A("center"))}]}
ui["slot_btn@rpg_form.form_btn"] = button(("slot_face", "slot_face_h", "slot_face_h"))
def slot_entry(marker):
    return entry(marker, [70, 56], [
        {"btn@rpg_forge.slot_btn": {"size": [32, 32], **A("top_middle"), "offset": [0, 2]}},
        {"plus": {"type": "image", "texture": T + "plus", "size": [10, 10], "layer": 9, **A("top_middle"), "offset": [15, -1]}},
        {"name": label([96, 20], "center", 0.85, (0.97, 0.88, 0.6), **A("top_middle"), offset=[0, 37])}])
ui["fl_entry"] = slot_entry("[FL]")
ui["fr_entry"] = slot_entry("[FR]")
# ── 가운데: 은은한 빛 + 큰 칸 + 이름 · 큰 +단계 · 작은 설명 ──
ui["fc_entry"] = entry("[FC]", ["100%", 50], [
    {"halo": {"type": "image", "texture": T + "halo", "size": [56, 56], "layer": 2, **A("top_middle"), "offset": [0, -8]}},
    {"cell": {"type": "image", "texture": U + "tile_hover", "size": [38, 38], "layer": 3, **A("top_middle")}},
    {"item": icon([26, 26], **A("top_middle"), offset=[0, 6])},
    {"name": label(["100%", 10], "center", None, (0.97, 0.95, 0.9), **A("bottom_middle"))}])
ui["fv_entry"] = entry("[FV]", ["100%", 15], [{"lv": label(["100%", 15], "center", 1.6, (1.0, 0.86, 0.45), **A("center"))}])
ui["fp_entry"] = entry("[FP]", ["100%", 9], [{"pips": icon([90, 7], **A("center"))}])
ui["ft_entry"] = entry("[FT]", ["100%", 16], [
    {"bg": {"type": "image", "texture": U + "card_title", "size": ["100%", 14], "layer": 2, **A("top_middle")}},
    {"t": label(["100%", 10], "center", None, **A("top_middle"), offset=[0, 3])}])
ui["fs_entry"] = entry("[FS]", ["100%", 9], [{"t": label(["100%", 9], "center", 0.8, (0.66, 0.67, 0.72), **A("center"))}])
# ── 수치 줄 (왼쪽 회색 이름 · 오른쪽 크림 값) ──
ui["fk_entry"] = entry("[FK]", ["100%", 12], [{"t": label(["100%", 10], "left", None, (0.7, 0.71, 0.76), **A("left_middle"))}])
ui["fw_entry"] = entry("[FW]", ["100%", 12], [{"t": label(["100%", 10], "right", **A("right_middle"))}])
ui["fb_entry"] = entry("[FB]", ["100%", 14], [
    {"k": static("성공 확률", [52, 10], **A("left_middle"))},
    {"bar": icon(["100% - 100px", 7], **A("left_middle"), offset=[54, 0])},
    {"v": label([42, 12], "right", 1.15, **A("right_middle"))}])
ui["fn_entry"] = entry("[FN]", ["100%", 9], [{"t": label(["100%", 9], "right", 0.75, (0.55, 0.56, 0.62), **A("right_middle"))}])
ui["fm_entry"] = entry("[FM]", [70, 18], [
    {"bg": {"type": "image", "texture": U + "chip", "size": ["100% - 4px", 16], "layer": 3, **A("left_middle")}},
    {"i": icon([12, 12], **A("left_middle"), offset=[4, 0])},
    {"t": label([52, 10], "left", 0.85, **A("left_middle"), offset=[18, 1])}])
# ── 버튼: 기존 액션 버튼 그대로 (금 점 + 남색 + 금선), 강화 버튼만 크게 ──
def act_faces(prefix, scale, dot):
    for nm, tex in ((prefix, "action_default"), (prefix + "_h", "action_hover"), (prefix + "_p", "action_pressed")):
        c = [{"t": label(["100% - 20px", 12], "center", scale, **A("center"), offset=[4, 1])}]
        if dot: c.insert(0, {"dot": {"type": "image", "texture": U + "action_dot", "size": [dot, dot], "layer": 5, **A("left_middle"), "offset": [6, 0]}})
        ui[nm] = {"type": "image", "texture": U + tex, "size": ["100%", "100%"], "controls": c}
act_faces("go_face", 1.35, 11)
act_faces("sm_face", 0.9, 7)
ui["go_btn@rpg_form.form_btn"] = button(("go_face", "go_face_h", "go_face_p"))
ui["sm_btn@rpg_form.form_btn"] = button(("sm_face", "sm_face_h", "sm_face_p"))
ui["fg_entry"] = entry("[FG]", ["100%", 25], [{"btn@rpg_forge.go_btn": {"size": ["100%", 23], **A("top_middle")}}])
ui["fa_entry"] = entry("[FA]", ["50%", 17], [{"btn@rpg_forge.sm_btn": {"size": ["100% - 3px", 16], **A("center")}}])

def row(name, h, ctrls): return {name: {"type": "panel", "size": ["100%", h], "controls": ctrls}}
pad = lambda n, h: {n: {"type": "panel", "size": ["100%", h]}}
ui["forge_body@rpg_form.mode_panel"] = {"$flag": "[RPG:F]", "layer": 1, "controls": [
    {"card": {"type": "stack_panel", "orientation": "vertical", "size": [300, "100%"], **A("top_middle"), "controls": [
        # 위 카드: 주문서 · 아이템 · 방지석 (기존 상세 카드 머리와 같은 금테 남색)
        {"head": {"type": "image", "texture": U + "card_head", "size": ["100%", 92], "controls": [
            factory("left", "fl_entry", [70, 56], **A("left_middle"), offset=[10, 0], layer=2),
            factory("right", "fr_entry", [70, 56], **A("right_middle"), offset=[-10, 0], layer=2),
            {"center": {"type": "stack_panel", "orientation": "vertical", "size": [140, "100%c"], **A("top_middle"), "offset": [0, 5], "layer": 2, "controls": [
                factory("item", "fc_entry", ["100%", "100%c"]), factory("lv", "fv_entry", ["100%", "100%c"]), factory("pips", "fp_entry", ["100%", "100%c"]), factory("sub", "fs_entry", ["100%", "100%c"])]}}]}},
        factory("result", "ft_entry", ["100%", "100%c"]),
        # 아래 카드: 수치 · 확률 · 재료
        {"body": {"type": "image", "texture": U + "card_body", "size": ["100%", "fill"], "controls": [
            {"in": {"type": "stack_panel", "orientation": "vertical", "size": ["100% - 20px", "100% - 8px"], **A("top_middle"), "offset": [0, 5], "layer": 2, "controls": [
                row("stats", "100%c", [factory("keys", "fk_entry", ["58%", "100%c"], **A("top_left")), factory("vals", "fw_entry", ["42%", "100%c"], **A("top_right"))]),
                pad("g1", 2),
                {"sep": {"type": "image", "texture": U + "divider", "size": ["100%", 1], "alpha": 0.7}},
                pad("g2", 3),
                factory("bar", "fb_entry", ["100%", "100%c"]),
                factory("note", "fn_entry", ["100%", "100%c"]),
                pad("g3", 2),
                row("mats", 18, [factory("list", "fm_entry", ["100%c", 18], "horizontal", **A("top_middle"))]),
            ]}}]}},
        pad("g4", 3),
        factory("go", "fg_entry", ["100%", "100%c"]),
        row("small", 17, [factory("list", "fa_entry", ["100%", 17], "horizontal", **A("top_left"))]),
    ]}},
]}

# ═════════ 퀘스트 연결 [RPG:Q] — 기존 책 화면의 가운데 칸 (오른쪽 상세 카드 · 레일 · 칩은 그대로) ═════════
#  [I] 항목 + 상태 [Q0] 완료 [Q1] 완료 보고 [Q2] 진행 [Q3] 수락 가능 [Q4] 잠김 · [QF] 첫 마디 [QE] 마지막 마디 [QG] 윗줄 금색(앞 장 완료)
def vis(expr): return [coll(), {"binding_type": "view", "source_property_name": expr, "target_property_name": "#visible"}]
nh = lambda m: f"((#form_button_text - '{m}') = #form_button_text)"
def line(name, tex, top, expr):
    return {name: {"type": "image", "texture": T + tex, "tiled": True, "size": [3, "50%"], "layer": 2, **A("top_left" if top else "bottom_left"), "offset": [13, 0], "bindings": vis(expr)}}
for nm, tex in (("q_face", "row_default"), ("q_face_h", "row_hover")):
    ui[nm] = {"type": "panel", "size": ["100%", "100%"], "controls": [
        {"off": on_img(U + tex, show=False)}, {"on": on_img(U + "row_on")},
        {"t": label(["100% - 12px", "default"], "left", None, **A("left_middle"), offset=[7, 0], max_size=["100% - 12px", 22])}]}
ui["q_btn@rpg_form.form_btn"] = button(("q_face", "q_face_h", "q_face_h"))
nodes = [("[Q0]", "done"), ("[Q1]", "ready"), ("[Q2]", "active"), ("[Q3]", "avail"), ("[Q4]", "lock")]
ui["q_entry"] = entry("[I]", ["100%", 29], [
    line("top_g", "line_gold", True, f"({nh('[QF]')} and (not {nh('[QG]')}))"),
    line("top_d", "line_dim", True, f"({nh('[QF]')} and {nh('[QG]')})"),
    line("bot_g", "line_gold", False, f"({nh('[QE]')} and (not {nh('[Q0]')}))"),
    line("bot_d", "line_dim", False, f"({nh('[QE]')} and {nh('[Q0]')})"),
    *[{f"n{i}": {"type": "image", "texture": T + f"node_{k}", "size": [20, 20], "layer": 4, **A("left_middle"), "offset": [5, 0], "bindings": vis(f"(not {nh(m)})")}} for i, (m, k) in enumerate(nodes)],
    {"btn@rpg_forge.q_btn": {"size": ["100% - 34px", 26], **A("right_middle")}}])
ui["chain_mode@rpg_form.mode_panel"] = {"$flag": "[RPG:Q]", "controls": [
    factory("list", "q_entry", ["100%", "100%c"], **A("top_left"))]}

json.dump(ui, open("resource_pack/ui/rpg_forge.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ok")
