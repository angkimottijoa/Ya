# 새 틀 화면 JSON (V12.138): [RPG:F] 무기 강화 · [RPG:Q] 퀘스트 — 그림: tools/forge_art.py (4배) · tools/quest_nodes_px.py
#   가벼움: 칸마다 자기 마커만 지움 · 목록(factory) 수 최소 · 목록 길이는 그 화면이 보일 때만 갱신 (다른 메뉴에서 숨은 칸을 만들지 않음)
import json
T, U = "textures/ui/rpg/forge/", "textures/ui/rpg/"
A = lambda a, b=None: {"anchor_from": a, "anchor_to": b or a}
def coll(): return {"binding_name": "#form_button_text", "binding_type": "collection", "binding_collection_name": "form_buttons"}
def has(m): return f"(not ((#form_button_text - '{m}') = #form_button_text))"
def hasnt(m): return f"((#form_button_text - '{m}') = #form_button_text)"
def vis(expr): return [coll(), {"binding_type": "view", "source_property_name": expr, "target_property_name": "#visible"}]
def strip(marks):
    e = "#form_button_text"
    for m in marks: e = f"({e} - '{m}')"
    return e
def label(marks, size, align="left", scale=None, color=(0.96, 0.94, 0.9), **kw):
    d = {"type": "label", "text": "#display", "localize": False, "shadow": True, "layer": 8, "size": size, "text_alignment": align, "color": list(color),
         "bindings": [coll(), {"binding_type": "view", "source_property_name": strip(marks), "target_property_name": "#display"}]}
    if scale: d["font_scale_factor"] = scale
    d.update(kw); return d
def static(text, size, color=(0.68, 0.69, 0.75), **kw):
    d = {"type": "label", "text": text, "localize": False, "shadow": True, "layer": 8, "size": size, "color": list(color)}
    d.update(kw); return d
def icon(size, **kw):
    d = {"type": "image", "size": size, "layer": 7, "bindings": [
        {"binding_name": "#form_button_texture", "binding_name_override": "#texture", "binding_type": "collection", "binding_collection_name": "form_buttons"},
        {"binding_name": "#form_button_texture_file_system", "binding_name_override": "#texture_file_system", "binding_type": "collection", "binding_collection_name": "form_buttons"},
        {"binding_type": "view", "source_property_name": "(not ((#texture = '') or (#texture = 'loading')))", "target_property_name": "#visible"}]}
    d.update(kw); return d
def img(tex, size, layer=2, **kw):
    d = {"type": "image", "texture": tex if tex.startswith("textures/") else T + tex, "size": size, "layer": layer}
    d.update(kw); return d
def entry(marker, size, controls, typ="panel"):
    return {"type": typ, "size": size, "controls": controls, "bindings": vis(has(marker))}
def factory(name, ctrl, size, orient="vertical", **kw):
    d = {"type": "stack_panel", "orientation": orient, "size": size, "factory": {"name": "buttons", "control_ids": {"button": f"@rpg_forge.{ctrl}"}},
         "collection_name": "form_buttons", "bindings": [{"binding_name": "#form_button_contents", "binding_name_override": "#collection_length"}]}
    d.update(kw); return {name: d}
def button(faces):
    return {"controls": [{"default@rpg_forge." + faces[0]: {}}, {"hover@rpg_forge." + faces[1]: {}}, {"pressed@rpg_forge." + faces[2]: {}}]}
def marked_img(tex, expr, size=("100%", "100%"), layer=1):
    return {"type": "image", "texture": tex if tex.startswith("textures/") else T + tex, "size": list(size), "layer": layer, "bindings": vis(expr)}
def title_label(flag, y, scale, color):
    return {"type": "label", "text": "#t", "localize": False, "shadow": True, "size": ["100%", 14], "text_alignment": "center", "font_scale_factor": scale, "color": color,
            "layer": 8, **A("top_middle"), "offset": [0, y],
            "bindings": [{"binding_name": "#title_text"}, {"binding_type": "view", "source_property_name": f"(#title_text - '{flag}')", "target_property_name": "#t"}]}
def stack(name, orient, size, controls, **kw):
    return {name: {"type": "stack_panel", "orientation": orient, "size": size, "controls": controls, **kw}}
pad = lambda n, w, h: {n: {"type": "panel", "size": [w, h]}}

ui = {"namespace": "rpg_forge"}
# ───────── 공통 틀: 남색 판 · 얇은 금 두 줄 테두리 · 비스듬히 깎은 모서리 · 제목 양옆 가는 금선 ─────────
ui["frame_parts"] = {"type": "panel", "size": ["100%", "100%"], "controls": [
    {"panel": img("panel", ["100% - 8px", "100% - 8px"], 1, **A("center"))},
    {"et": img("edge_t", ["100% - 32px", 8], 2, **A("top_middle"))},
    {"eb": img("edge_b", ["100% - 32px", 8], 2, **A("bottom_middle"))},
    {"el": img("edge_l", [8, "100% - 32px"], 2, **A("left_middle"))},
    {"er": img("edge_r", [8, "100% - 32px"], 2, **A("right_middle"))},
    {"c1": img("corner_tl", [16, 16], 3, **A("top_left"))},
    {"c2": img("corner_tr", [16, 16], 3, **A("top_right"))},
    {"c3": img("corner_bl", [16, 16], 3, **A("bottom_left"))},
    {"c4": img("corner_br", [16, 16], 3, **A("bottom_right"))},
    {"rule_l": img("divider", [70, 3], 3, **A("top_middle"), offset=[-92, 18])},
    {"rule_r": img("divider", [70, 3], 3, **A("top_middle"), offset=[92, 18])},
]}

# ═════════ 무기 강화 [RPG:F] ═════════
for nm, tex in (("slot_face", "slot_idle"), ("slot_face_h", "slot_hover")):
    ui[nm] = {"type": "panel", "size": ["100%", "100%"], "controls": [
        {"off": marked_img(tex, hasnt("[ON]"))}, {"on": marked_img("slot_on", has("[ON]"))},
        {"icon": icon([22, 22], **A("center"))}]}
ui["slot_btn@rpg_form.form_btn"] = button(("slot_face", "slot_face_h", "slot_face_h"))
def slot_entry(m):
    return entry(m, [72, 64], [
        {"btn@rpg_forge.slot_btn": {"size": [34, 34], **A("top_middle"), "offset": [0, 4]}},
        {"plus": img("plus", [12, 12], 9, **A("top_middle"), offset=[16, 0])},
        {"name": label([m, "[ON]"], [100, 20], "center", 0.85, (0.96, 0.87, 0.59), **A("top_middle"), offset=[0, 41])}])
ui["fl_entry"] = slot_entry("[FL]")
ui["fr_entry"] = slot_entry("[FR]")
# 가운데: 한 목록 안에서 [FC] 아이템 · [FV] +단계 · [FS] 분류 중 맞는 것만 보임
ui["fcen_entry"] = {"type": "stack_panel", "orientation": "vertical", "size": ["100%", "100%c"], "controls": [
    {"c": entry("[FC]", ["100%", 47], [
        {"halo": img("halo", [52, 52], 2, **A("top_middle"), offset=[0, -7])},
        {"fr": img("item_frame", [36, 36], 3, **A("top_middle"), offset=[0, 1])},
        {"item": icon([26, 26], **A("top_middle"), offset=[0, 6])},
        {"name": label(["[FC]"], ["100%", 10], "center", None, **A("bottom_middle"))}])},
    {"v": entry("[FV]", ["100%", 14], [{"t": label(["[FV]"], ["100%", 14], "center", 1.6, (0.96, 0.87, 0.59), **A("center"))}])},
    {"s": entry("[FS]", ["100%", 9], [{"t": label(["[FS]"], ["100%", 9], "center", 0.75, (0.62, 0.63, 0.68), **A("center"))}])}]}
ui["fu_entry"] = entry("[FU]", ["100%", 9], [{"t": label(["[FU]"], ["100%", 9], "center", 0.75, (0.74, 0.69, 0.57), **A("center"))}])
ui["fk_entry"] = entry("[FK]", ["100%", 10], [{"t": label(["[FK]"], ["100%", 10], "left", None, (0.66, 0.67, 0.72), **A("left_middle"), offset=[4, 0])}])
ui["fw_entry"] = entry("[FW]", ["100%", 10], [{"t": label(["[FW]"], ["100%", 10], "right", **A("right_middle"), offset=[-4, 0])}])
# 아래 줄: [FB] 확률 막대 · [FP] 진행도
ui["frow_entry"] = {"type": "stack_panel", "orientation": "vertical", "size": ["100%", "100%c"], "controls": [
    {"b": entry("[FB]", ["100%", 13], [
        {"k": static("성공 확률", [56, 10], **A("left_middle"), offset=[4, 1])},
        {"bar": icon([150, 9], **A("left_middle"), offset=[62, 0])},
        {"v": label(["[FB]"], [50, 12], "right", 1.15, (0.96, 0.87, 0.59), **A("right_middle"), offset=[-4, 0])}])},
    {"p": entry("[FP]", ["100%", 12], [
        {"k": static("강화 진행도", [70, 10], **A("left_middle"), offset=[4, 1])},
        {"pips": icon([110, 8], **A("left_middle"), offset=[80, 0])},
        {"v": label(["[FP]"], [50, 10], "right", **A("right_middle"), offset=[-4, 0])}])}]}
ui["fm_entry"] = entry("[FM]", [66, 20], [
    {"bg": img("mslot", [20, 20], 3, **A("left_middle"))},
    {"i": icon([14, 14], **A("left_middle"), offset=[3, 0])},
    {"t": label(["[FM]"], [44, 10], "left", 0.8, **A("left_middle"), offset=[22, 1])}])
def faces(prefix, texs, marks, scale, color, lw):
    for nm, tex in zip((prefix, prefix + "_h", prefix + "_p"), texs):
        ui[nm] = {"type": "image", "texture": tex if tex.startswith("textures/") else T + tex, "size": ["100%", "100%"], "controls": [{"t": label(marks, [lw, 12], "center", scale, color, **A("center"), offset=[0, 1])}]}
faces("go_face", ("btn_idle", "btn_hover", "btn_down"), ["[FG]"], 1.3, (0.98, 0.93, 0.8), "100% - 12px")
faces("sa_face", ("sbtn_idle", "sbtn_hover", "sbtn_down"), ["[FA]"], 0.85, (0.92, 0.93, 0.97), "100% - 6px")
faces("sz_face", ("sbtn_idle", "sbtn_hover", "sbtn_down"), ["[FZ]"], 0.85, (0.92, 0.93, 0.97), "100% - 6px")
ui["go_btn@rpg_form.form_btn"] = button(("go_face", "go_face_h", "go_face_p"))
ui["sa_btn@rpg_form.form_btn"] = button(("sa_face", "sa_face_h", "sa_face_p"))
ui["sz_btn@rpg_form.form_btn"] = button(("sz_face", "sz_face_h", "sz_face_p"))
# 버튼 줄: [FA] 연속 · [FG] 강화 · [FZ] 돌아가기 — 한 가로 목록
ui["fbtn_entry"] = {"type": "stack_panel", "orientation": "horizontal", "size": ["100%c", 26], "controls": [
    {"a": entry("[FA]", [59, 26], [{"b@rpg_forge.sa_btn": {"size": [56, 20], **A("left_middle")}}])},
    {"g": entry("[FG]", [150, 26], [{"b@rpg_forge.go_btn": {"size": [150, 26]}}])},
    {"z": entry("[FZ]", [59, 26], [{"b@rpg_forge.sz_btn": {"size": [56, 20], **A("right_middle")}}])}]}
for nm, tex in (("x_face", "close"), ("x_face_h", "close_hover")):
    ui[nm] = img(tex, ["100%", "100%"], 3)
ui["x_btn@rpg_form.form_btn"] = button(("x_face", "x_face_h", "x_face_h"))
ui["fx_entry"] = entry("[FX]", [14, 14], [{"b@rpg_forge.x_btn": {"size": [14, 14]}}])

ui["forge_screen@rpg_form.mode_panel"] = {"$flag": "[RPG:F]", "layer": 2, "controls": [
    {"dim": img("vignette", ["100%", "100%"], 0)},
    {"frame": {"type": "panel", "size": [312, "100% - 6px"], "layer": 1, **A("center"), "controls": [
        {"parts@rpg_forge.frame_parts": {}},
        {"title": title_label("[RPG:F]", 13, 1.45, [0.96, 0.87, 0.59])},
        {"sub": {"type": "panel", "size": [268, 9], "layer": 8, **A("top_middle"), "offset": [0, 27], "controls": [factory("s", "fu_entry", ["100%", "100%c"])]}},
        stack("content", "vertical", [268, "100% - 46px"], [
            {"card": {"type": "image", "texture": T + "card", "size": [268, 74], "controls": [
                factory("left", "fl_entry", [72, 64], **A("left_middle"), offset=[12, 1], layer=2),
                factory("right", "fr_entry", [72, 64], **A("right_middle"), offset=[-12, 1], layer=2),
                factory("center", "fcen_entry", [140, "100%c"], **A("top_middle"), offset=[0, 3], layer=2)]}},
            pad("g1", "100%", 3),
            {"stats": {"type": "panel", "size": ["100%", "100%c"], "controls": [
                factory("k", "fk_entry", ["100%", "100%c"], **A("top_left")), factory("v", "fw_entry", ["100%", "100%c"], **A("top_left"))]}},
            pad("g2", "100%", 2),
            {"div": img("divider", [268, 3], 2)},
            pad("g3", "100%", 2),
            factory("rows", "frow_entry", ["100%", "100%c"]),
            pad("g4", "100%", 2),
            {"mats": {"type": "panel", "size": ["100%", 20], "controls": [factory("l", "fm_entry", ["100%c", 20], "horizontal", **A("top_middle"))]}},
            {"fill": {"type": "panel", "size": ["100%", "fill"]}},
            {"btns": {"type": "panel", "size": ["100%", 26], "controls": [factory("l", "fbtn_entry", ["100%c", 26], "horizontal", **A("center"))]}},
        ], layer=5, **A("top_middle"), offset=[0, 38]),
    ]}},
]}

# ═════════ 퀘스트 [RPG:Q] — 새 틀 + 안쪽은 예전 메뉴 디자인 (탭 · 줄 · 카드 · 액션 버튼 · 픽셀 마디) ═════════
QMK = ["[I]", "[ON]", "[Q0]", "[Q1]", "[Q2]", "[Q3]", "[Q4]", "[QF]", "[QE]", "[QG]"]
for nm, tex in (("tab_face", "row_default"), ("tab_face_h", "row_hover")):
    ui[nm] = {"type": "panel", "size": ["100%", "100%"], "controls": [
        {"off": marked_img(U + tex, hasnt("[ON]"))}, {"on": marked_img(U + "row_on", has("[ON]"))},
        {"t": label(["[T]", "[ON]"], ["100% - 4px", 10], "center", 0.8, **A("center"), offset=[0, 1])}]}
ui["tab_btn@rpg_form.form_btn"] = button(("tab_face", "tab_face_h", "tab_face_h"))
ui["qt_entry"] = entry("[T]", [40, 18], [{"b@rpg_forge.tab_btn": {"size": [39, 18], **A("left_middle")}}])
ui["qc_entry"] = entry("[C]", ["100%c", 12], [{"st": {"type": "stack_panel", "orientation": "horizontal", "size": ["100%c", 12], "controls": [
    {"i": icon([10, 10])}, {"g": {"type": "panel", "size": [2, 10]}}, {"t": label(["[C]"], ["default", 10], "left", 0.85, (0.96, 0.87, 0.59))}, {"g2": {"type": "panel", "size": [8, 10]}}]}}])
for nm, tex in (("qrow_face", "row_default"), ("qrow_face_h", "row_hover")):
    ui[nm] = {"type": "panel", "size": ["100%", "100%"], "controls": [
        {"off": marked_img(U + tex, hasnt("[ON]"))}, {"on": marked_img(U + "row_on", has("[ON]"))},
        {"t": label(QMK, ["100% - 12px", "default"], "left", None, **A("left_middle"), offset=[7, 0], max_size=["100% - 12px", 22])}]}
ui["qrow_btn@rpg_form.form_btn"] = button(("qrow_face", "qrow_face_h", "qrow_face_h"))
def qline(name, tex, top, expr):
    return {name: {"type": "image", "texture": T + tex, "size": [3, "50%"], "layer": 2, **A("top_left" if top else "bottom_left"), "offset": [14, 0], "bindings": vis(expr)}}
QN = [("[Q0]", "done"), ("[Q1]", "ready"), ("[Q2]", "active"), ("[Q3]", "avail"), ("[Q4]", "lock")]
ui["qi_entry"] = entry("[I]", ["100%", 27], [
    qline("tl", "line_gold", True, f"({hasnt('[QF]')} and {has('[QG]')})"),
    qline("td", "line_dim", True, f"({hasnt('[QF]')} and {hasnt('[QG]')})"),
    qline("bl", "line_gold", False, f"({hasnt('[QE]')} and {has('[Q0]')})"),
    qline("bd", "line_dim", False, f"({hasnt('[QE]')} and {hasnt('[Q0]')})"),
    {"node": icon([18, 18], **A("left_middle"), offset=[6, 0])},  # 마디 그림 = 버튼 아이콘 (스크립트가 상태별 그림을 줌)
    {"b@rpg_forge.qrow_btn": {"size": ["100% - 30px", 25], **A("right_middle")}}])
# 오른쪽 상세: 예전 상세 카드 (머리 card_head · 몸 card_body · 금 점 액션 버튼)
ui["qs_entry"] = entry("[S]", ["100%", 24], [
    {"i": icon([18, 18], **A("left_middle"), offset=[4, 0])},
    {"t": label(["[S]", "[P]"], ["100% - 28px", 10], "left", 1.1, (0.96, 0.87, 0.59), **A("left_middle"), offset=[26, 1])}])
for nm, tex in (("qa_face", "action_default"), ("qa_face_h", "action_hover"), ("qa_face_p", "action_pressed")):
    ui[nm] = {"type": "image", "texture": U + tex, "size": ["100%", "100%"], "controls": [
        {"dot": {"type": "image", "texture": U + "action_dot", "size": [8, 8], "layer": 3, **A("left_middle"), "offset": [5, 0]}},
        {"t": label(["[A]"], ["100% - 20px", 10], "center", 0.9, **A("center"), offset=[4, 1])}]}
ui["qa_btn@rpg_form.form_btn"] = button(("qa_face", "qa_face_h", "qa_face_p"))
ui["qa_entry"] = entry("[A]", ["100%", 19], [{"b@rpg_forge.qa_btn": {"size": ["100%", 17], **A("top_middle")}}])
ui["q_text"] = {"type": "panel", "size": ["100%", "100%c + 4px"], "controls": [
    {"t": {"type": "label", "text": "#form_text", "localize": False, "shadow": True, "layer": 8, "size": ["100% - 6px", "default"], **A("top_left"), "offset": [4, 2], "color": [0.95, 0.94, 0.9]}}]}
ui["quest_screen@rpg_form.mode_panel"] = {"$flag": "[RPG:Q]", "layer": 2, "controls": [
    {"dim": img("vignette", ["100%", "100%"], 0)},
    {"frame": {"type": "panel", "size": ["100% - 12px", "100% - 6px"], "layer": 1, **A("center"), "controls": [
        {"parts@rpg_forge.frame_parts": {}},
        {"title": title_label("[RPG:Q]", 13, 1.4, [0.96, 0.87, 0.59])},
        factory("chips", "qc_entry", ["100%c", 12], "horizontal", layer=8, **A("top_right"), offset=[-14, 12]),
        {"tabs": {"type": "panel", "size": ["100% - 28px", 18], "layer": 6, **A("top_middle"), "offset": [0, 34], "controls": [
            factory("l", "qt_entry", ["100%c", 18], "horizontal", **A("top_left"))]}},
        {"body": {"type": "panel", "size": ["100% - 28px", "100% - 64px"], "layer": 5, **A("top_middle"), "offset": [0, 56], "controls": [
            factory("list", "qi_entry", ["56%", "100%c"], **A("top_left")),
            stack("detail", "vertical", ["42%", "100%"], [
                {"head": {"type": "image", "texture": U + "card_head", "size": ["100%", "100%c + 4px"], "controls": [
                    factory("h", "qs_entry", ["100%", "100%c"], **A("top_middle"), offset=[0, 2], layer=2)]}},
                {"body": {"type": "image", "texture": U + "card_body", "size": ["100%", "fill"], "controls": [
                    {"scroll@common.scrolling_panel": {"size": ["100% - 4px", "100% - 4px"], **A("center"), "layer": 2, "$show_background": False, "$scrolling_content": "rpg_forge.q_text",
                        "$scroll_size": [4, "100% - 4px"], "$scrolling_pane_size": ["100% - 4px", "100%"], "$scrolling_pane_offset": [0, 0], "$scroll_bar_right_padding_size": [0, 0]}}]}},
                pad("g", "100%", 3),
                factory("acts", "qa_entry", ["100%", "100%c"])], **A("top_right")),
        ]}},
    ]}},
]}
json.dump(ui, open("resource_pack/ui/rpg_forge.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ui ok")
