# 새 틀 화면 JSON (V12.136): [RPG:F] 연성소 · [RPG:Q] 퀘스트 — 그림은 tools/forge_art.py (4배 해상도)
#   기존 책 화면을 쓰지 않는 독립 화면 (router 에 붙음). 버튼 글자 앞 마커로 칸을 고름.
import json
T = "textures/ui/rpg/forge/"
MARKS = ["[I]", "[T]", "[C]", "[S]", "[P]", "[A]", "[ON]", "[R1]", "[R2]", "[R3]", "[R4]", "[R5]",
         "[FL]", "[FR]", "[FC]", "[FV]", "[FS]", "[FU]", "[FK]", "[FW]", "[FB]", "[FP]", "[FM]", "[FG]", "[FA]", "[FZ]", "[FX]",
         "[Q0]", "[Q1]", "[Q2]", "[Q3]", "[Q4]", "[QF]", "[QE]", "[QG]"]
strip = "#form_button_text"
for m in MARKS: strip = f"({strip} - '{m}')"
A = lambda a, b=None: {"anchor_from": a, "anchor_to": b or a}
def coll(): return {"binding_name": "#form_button_text", "binding_type": "collection", "binding_collection_name": "form_buttons"}
def has(m): return f"(not ((#form_button_text - '{m}') = #form_button_text))"
def hasnt(m): return f"((#form_button_text - '{m}') = #form_button_text)"
def vis(expr): return [coll(), {"binding_type": "view", "source_property_name": expr, "target_property_name": "#visible"}]
def label(size, align="left", scale=None, color=(0.96, 0.94, 0.9), **kw):
    d = {"type": "label", "text": "#display", "localize": False, "shadow": True, "layer": 8, "size": size, "text_alignment": align, "color": list(color),
         "bindings": [coll(), {"binding_type": "view", "source_property_name": strip, "target_property_name": "#display"}]}
    if scale: d["font_scale_factor"] = scale
    d.update(kw); return d
def static(text, size, color=(0.65, 0.66, 0.72), **kw):
    d = {"type": "label", "text": text, "localize": False, "shadow": True, "layer": 8, "size": size, "color": list(color)}
    d.update(kw); return d
def icon(size, **kw):
    d = {"type": "image", "size": size, "layer": 7, "bindings": [
        {"binding_name": "#form_button_texture", "binding_name_override": "#texture", "binding_type": "collection", "binding_collection_name": "form_buttons"},
        {"binding_name": "#form_button_texture_file_system", "binding_name_override": "#texture_file_system", "binding_type": "collection", "binding_collection_name": "form_buttons"},
        {"binding_type": "view", "source_property_name": "(not ((#texture = '') or (#texture = 'loading')))", "target_property_name": "#visible"}]}
    d.update(kw); return d
def img(tex, size, layer=2, **kw):
    d = {"type": "image", "texture": T + tex, "size": size, "layer": layer}
    d.update(kw); return d
def entry(marker, size, controls):
    return {"type": "panel", "size": size, "controls": controls, "bindings": vis(has(marker))}
def factory(name, ctrl, size, orient="vertical", **kw):
    d = {"type": "stack_panel", "orientation": orient, "size": size, "factory": {"name": "buttons", "control_ids": {"button": f"@rpg_forge.{ctrl}"}},
         "collection_name": "form_buttons", "bindings": [{"binding_name": "#form_button_contents", "binding_name_override": "#collection_length"}]}
    d.update(kw); return {name: d}
def button(faces):
    return {"controls": [{"default@rpg_forge." + faces[0]: {}}, {"hover@rpg_forge." + faces[1]: {}}, {"pressed@rpg_forge." + faces[2]: {}}]}
def marked_img(tex, expr, size=("100%", "100%"), layer=1):
    return {"type": "image", "texture": T + tex, "size": list(size), "layer": layer, "bindings": vis(expr)}
def title_label(flag, y, scale, color):
    return {"type": "label", "text": "#t", "localize": False, "shadow": True, "size": ["100%", 14], "text_alignment": "center", "font_scale_factor": scale, "color": color,
            "layer": 8, **A("top_middle"), "offset": [0, y],
            "bindings": [{"binding_name": "#title_text"}, {"binding_type": "view", "source_property_name": f"(#title_text - '{flag}')", "target_property_name": "#t"}]}

ui = {"namespace": "rpg_forge"}

# ───────── 공통 틀: 바탕 · 테두리 띠 · 모서리 · 룬 · 위 문장 ─────────
ui["frame_parts"] = {"type": "panel", "size": ["100%", "100%"], "controls": [
    {"panel": img("panel", ["100% - 16px", "100% - 16px"], 1, **A("center"))},
    {"et": img("edge_t", ["100% - 60px", 12], 2, **A("top_middle"))},
    {"eb": img("edge_b", ["100% - 60px", 12], 2, **A("bottom_middle"))},
    {"el": img("edge_l", [12, "100% - 60px"], 2, **A("left_middle"))},
    {"er": img("edge_r", [12, "100% - 60px"], 2, **A("right_middle"))},
    {"c1": img("corner_tl", [30, 30], 3, **A("top_left"))},
    {"c2": img("corner_tr", [30, 30], 3, **A("top_right"))},
    {"c3": img("corner_bl", [30, 30], 3, **A("bottom_left"))},
    {"c4": img("corner_br", [30, 30], 3, **A("bottom_right"))},
    {"rl": img("runes_v", [8, 120], 3, **A("left_middle"), offset=[13, 0], alpha=0.85)},
    {"rr": img("runes_v2", [8, 120], 3, **A("right_middle"), offset=[-13, 0], alpha=0.85)},
    {"rh1": img("runes_h", [84, 8], 3, **A("top_middle"), offset=[-82, 13], alpha=0.85)},
    {"rh2": img("runes_h2", [84, 8], 3, **A("top_middle"), offset=[82, 13], alpha=0.85)},
    {"crest": img("crest", [72, 30], 4, **A("top_middle"), offset=[0, -11])},
]}

# ═════════ 연성소 [RPG:F] ═════════
for nm, tex in (("slot_face", "slot_idle"), ("slot_face_h", "slot_hover")):
    ui[nm] = {"type": "panel", "size": ["100%", "100%"], "controls": [
        {"off": marked_img(tex, hasnt("[ON]"))}, {"on": marked_img("slot_on", has("[ON]"))},
        {"icon": icon([22, 22], **A("center"))}]}
ui["slot_btn@rpg_form.form_btn"] = button(("slot_face", "slot_face_h", "slot_face_h"))
def slot_entry(m):
    return entry(m, [72, 64], [
        {"btn@rpg_forge.slot_btn": {"size": [34, 34], **A("top_middle"), "offset": [0, 4]}},
        {"plus": img("plus", [12, 12], 9, **A("top_middle"), offset=[16, 0])},
        {"name": label([100, 20], "center", 0.85, (0.95, 0.84, 0.62), **A("top_middle"), offset=[0, 41])}])
ui["fl_entry"] = slot_entry("[FL]")
ui["fr_entry"] = slot_entry("[FR]")
ui["fc_entry"] = entry("[FC]", ["100%", 47], [
    {"halo": img("halo", [52, 52], 2, **A("top_middle"), offset=[0, -7])},
    {"fr": img("item_frame", [36, 36], 3, **A("top_middle"), offset=[0, 1])},
    {"item": icon([26, 26], **A("top_middle"), offset=[0, 6])},
    {"name": label(["100%", 10], "center", None, **A("bottom_middle"))}])
ui["fv_entry"] = entry("[FV]", ["100%", 14], [{"t": label(["100%", 14], "center", 1.6, (0.96, 0.87, 0.59), **A("center"))}])
ui["fs_entry"] = entry("[FS]", ["100%", 9], [{"t": label(["100%", 9], "center", 0.75, (0.62, 0.63, 0.68), **A("center"))}])
ui["fu_entry"] = entry("[FU]", ["100%", 9], [{"t": label(["100%", 9], "center", 0.75, (0.74, 0.69, 0.57), **A("center"))}])
ui["fk_entry"] = entry("[FK]", ["100%", 10], [{"t": label(["100%", 10], "left", None, (0.66, 0.67, 0.72), **A("left_middle"), offset=[4, 0])}])
ui["fw_entry"] = entry("[FW]", ["100%", 10], [{"t": label(["100%", 10], "right", **A("right_middle"), offset=[-4, 0])}])
ui["fb_entry"] = entry("[FB]", ["100%", 13], [
    {"k": static("성공 확률", [56, 10], **A("left_middle"), offset=[4, 1])},
    {"bar": icon([150, 9], **A("left_middle"), offset=[62, 0])},
    {"v": label([50, 12], "right", 1.15, (0.94, 0.84, 0.63), **A("right_middle"), offset=[-4, 0])}])
ui["fp_entry"] = entry("[FP]", ["100%", 12], [
    {"k": static("강화 진행도", [70, 10], **A("left_middle"), offset=[4, 1])},
    {"pips": icon([110, 8], **A("left_middle"), offset=[80, 0])},
    {"v": label([50, 10], "right", **A("right_middle"), offset=[-4, 0])}])
ui["fm_entry"] = entry("[FM]", [66, 20], [
    {"bg": img("mslot", [20, 20], 3, **A("left_middle"))},
    {"i": icon([14, 14], **A("left_middle"), offset=[3, 0])},
    {"t": label([44, 10], "left", 0.8, **A("left_middle"), offset=[22, 1])}])
def faces(prefix, texs, scale, color, lw):
    for nm, tex in zip((prefix, prefix + "_h", prefix + "_p"), texs):
        ui[nm] = {"type": "image", "texture": T + tex, "size": ["100%", "100%"], "controls": [{"t": label([lw, 12], "center", scale, color, **A("center"), offset=[0, 1])}]}
faces("go_face", ("btn_idle", "btn_hover", "btn_down"), 1.35, (0.98, 0.93, 0.8), "100% - 30px")
faces("sm_face", ("sbtn_idle", "sbtn_hover", "sbtn_down"), 0.85, (0.92, 0.93, 0.97), "100% - 8px")
ui["go_btn@rpg_form.form_btn"] = button(("go_face", "go_face_h", "go_face_p"))
ui["sm_btn@rpg_form.form_btn"] = button(("sm_face", "sm_face_h", "sm_face_p"))
ui["fg_entry"] = entry("[FG]", [150, 30], [{"b@rpg_forge.go_btn": {"size": [150, 30]}}])
ui["fa_entry"] = entry("[FA]", [62, 20], [{"b@rpg_forge.sm_btn": {"size": [62, 20]}}])
ui["fz_entry"] = entry("[FZ]", [62, 20], [{"b@rpg_forge.sm_btn": {"size": [62, 20]}}])
for nm, tex in (("x_face", "close"), ("x_face_h", "close_hover")):
    ui[nm] = img(tex, ["100%", "100%"], 3)
ui["x_btn@rpg_form.form_btn"] = button(("x_face", "x_face_h", "x_face_h"))
ui["fx_entry"] = entry("[FX]", [14, 14], [{"b@rpg_forge.x_btn": {"size": [14, 14]}}])

pad = lambda n, h: {n: {"type": "panel", "size": ["100%", h]}}
ui["forge_screen@rpg_form.mode_panel"] = {"$flag": "[RPG:F]", "layer": 2, "controls": [
    {"dim": img("vignette", ["100%", "100%"], 0)},
    {"frame": {"type": "panel", "size": [320, "100% - 6px"], "layer": 1, **A("center"), "controls": [
        {"parts@rpg_forge.frame_parts": {}},
        {"title": title_label("[RPG:F]", 13, 1.5, [0.96, 0.87, 0.59])},
        {"sub_wrap": {"type": "panel", "size": [268, 9], "layer": 8, **A("top_middle"), "offset": [0, 29], "controls": [factory("s", "fu_entry", ["100%", "100%c"])]}},
        factory("close", "fx_entry", [14, 14], layer=9, **A("top_right"), offset=[-15, 14]),
        {"content": {"type": "stack_panel", "orientation": "vertical", "size": [268, "100% - 50px"], "layer": 5, **A("top_middle"), "offset": [0, 40], "controls": [
            {"card": {"type": "image", "texture": T + "card", "size": [268, 74], "controls": [
                factory("left", "fl_entry", [72, 64], **A("left_middle"), offset=[12, 1], layer=2),
                factory("right", "fr_entry", [72, 64], **A("right_middle"), offset=[-12, 1], layer=2),
                {"center": {"type": "stack_panel", "orientation": "vertical", "size": [140, "100%c"], **A("top_middle"), "offset": [0, 3], "layer": 2, "controls": [
                    factory("a", "fc_entry", ["100%", "100%c"]), factory("b", "fv_entry", ["100%", "100%c"]), factory("c", "fs_entry", ["100%", "100%c"])]}}]}},
            pad("g1", 3),
            {"stats": {"type": "panel", "size": ["100%", "100%c"], "controls": [
                factory("k", "fk_entry", ["100%", "100%c"], **A("top_left")), factory("v", "fw_entry", ["100%", "100%c"], **A("top_left"))]}},
            pad("g2", 2),
            {"div": img("divider", [268, 3], 2)},
            pad("g3", 2),
            factory("bar", "fb_entry", ["100%", "100%c"]),
            factory("prog", "fp_entry", ["100%", "100%c"]),
            pad("g4", 2),
            {"mats": {"type": "panel", "size": ["100%", 20], "controls": [factory("l", "fm_entry", ["100%c", 20], "horizontal", **A("top_middle"))]}},
            {"fill": {"type": "panel", "size": ["100%", "fill"]}},
            {"btns": {"type": "panel", "size": ["100%", 30], "controls": [
                factory("l", "fa_entry", [62, "100%c"], **A("left_middle")),
                factory("m", "fg_entry", [150, "100%c"], **A("center")),
                factory("r", "fz_entry", [62, "100%c"], **A("right_middle"))]}},
        ]}},
    ]}},
]}

# ═════════ 퀘스트 [RPG:Q] ═════════
# 탭 [T] (위 줄) · 목록 [I] + 상태 [Q0~4] · 연결 [QF] 첫 [QE] 끝 [QG] 윗줄 빛남 · 오른쪽 상세: [S] 이름 · 본문 · [A] 버튼 · 칩 [C]
for nm, tex in (("tab_face", "tab_idle"), ("tab_face_h", "tab_hover")):
    ui[nm] = {"type": "panel", "size": ["100%", "100%"], "controls": [
        {"off": marked_img(tex, hasnt("[ON]"))}, {"on": marked_img("tab_on", has("[ON]"))},
        {"t": label(["100% - 4px", 10], "center", 0.8, **A("center"), offset=[0, 1])}]}
ui["tab_btn@rpg_form.form_btn"] = button(("tab_face", "tab_face_h", "tab_face_h"))
ui["qt_entry"] = entry("[T]", [40, 18], [{"b@rpg_forge.tab_btn": {"size": [39, 18], **A("left_middle")}}])
ui["qc_entry"] = entry("[C]", ["100%c", 12], [{"st": {"type": "stack_panel", "orientation": "horizontal", "size": ["100%c", 12], "controls": [
    {"i": icon([10, 10])}, {"g": {"type": "panel", "size": [2, 10]}}, {"t": label(["default", 10], "left", 0.85, (0.95, 0.84, 0.62))}, {"g2": {"type": "panel", "size": [8, 10]}}]}}])
for nm, tex in (("qrow_face", "qrow_idle"), ("qrow_face_h", "qrow_hover")):
    ui[nm] = {"type": "panel", "size": ["100%", "100%"], "controls": [
        {"off": marked_img(tex, hasnt("[ON]"))}, {"on": marked_img("qrow_on", has("[ON]"))},
        {"t": label(["100% - 12px", "default"], "left", None, **A("left_middle"), offset=[7, 0], max_size=["100% - 12px", 22])}]}
ui["qrow_btn@rpg_form.form_btn"] = button(("qrow_face", "qrow_face_h", "qrow_face_h"))
def qline(name, tex, top, expr):
    return {name: {"type": "image", "texture": T + tex, "size": [4, "50%"], "layer": 2, **A("top_left" if top else "bottom_left"), "offset": [13, 0], "bindings": vis(expr)}}
QN = [("[Q0]", "done"), ("[Q1]", "ready"), ("[Q2]", "active"), ("[Q3]", "avail"), ("[Q4]", "lock")]
ui["qi_entry"] = entry("[I]", ["100%", 28], [
    qline("tl", "ql_lit", True, f"({hasnt('[QF]')} and {has('[QG]')})"),
    qline("td", "ql_dim", True, f"({hasnt('[QF]')} and {hasnt('[QG]')})"),
    qline("bl", "ql_lit", False, f"({hasnt('[QE]')} and {has('[Q0]')})"),
    qline("bd", "ql_dim", False, f"({hasnt('[QE]')} and {hasnt('[Q0]')})"),
    *[{f"n{i}": {"type": "image", "texture": T + f"qn_{k}", "size": [20, 20], "layer": 4, **A("left_middle"), "offset": [5, 0], "bindings": vis(has(m))}} for i, (m, k) in enumerate(QN)],
    {"b@rpg_forge.qrow_btn": {"size": ["100% - 32px", 25], **A("right_middle")}}])
ui["qs_entry"] = entry("[S]", ["100%", 24], [
    {"i": icon([18, 18], **A("left_middle"), offset=[2, 0])},
    {"t": label(["100% - 26px", 10], "left", 1.1, (0.95, 0.84, 0.62), **A("left_middle"), offset=[24, 1])}])
faces("wb_face", ("wbtn_idle", "wbtn_hover", "wbtn_down"), 0.9, (0.93, 0.94, 0.98), "100% - 8px")
ui["wb_btn@rpg_form.form_btn"] = button(("wb_face", "wb_face_h", "wb_face_p"))
ui["qa_entry"] = entry("[A]", ["100%", 19], [{"b@rpg_forge.wb_btn": {"size": ["100%", 17], **A("top_middle")}}])
ui["q_text"] = {"type": "panel", "size": ["100%", "100%c + 4px"], "controls": [
    {"t": {"type": "label", "text": "#form_text", "localize": False, "shadow": True, "layer": 8, "size": ["100% - 6px", "default"], **A("top_left"), "offset": [4, 2], "color": [0.94, 0.93, 0.9]}}]}
ui["quest_screen@rpg_form.mode_panel"] = {"$flag": "[RPG:Q]", "layer": 2, "controls": [
    {"dim": img("vignette", ["100%", "100%"], 0)},
    {"frame": {"type": "panel", "size": ["100% - 12px", "100% - 6px"], "layer": 1, **A("center"), "controls": [
        {"parts@rpg_forge.frame_parts": {}},
        {"title": title_label("[RPG:Q]", 13, 1.4, [0.96, 0.87, 0.59])},
        factory("chips", "qc_entry", ["100%c", 12], "horizontal", layer=8, **A("top_right"), offset=[-26, 30]),
        {"tabs": {"type": "panel", "size": ["100% - 52px", 18], "layer": 6, **A("top_middle"), "offset": [0, 44], "controls": [
            factory("l", "qt_entry", ["100%c", 18], "horizontal", **A("top_left"))]}},
        {"body": {"type": "panel", "size": ["100% - 52px", "100% - 78px"], "layer": 5, **A("top_middle"), "offset": [0, 66], "controls": [
            factory("list", "qi_entry", ["56%", "100%c"], **A("top_left")),
            {"detail": {"type": "stack_panel", "orientation": "vertical", "size": ["42%", "100%"], **A("top_right"), "controls": [
                {"card": {"type": "image", "texture": T + "qcard", "size": ["100%", "fill"], "controls": [
                    {"in": {"type": "stack_panel", "orientation": "vertical", "size": ["100% - 10px", "100% - 8px"], **A("top_middle"), "offset": [0, 4], "layer": 2, "controls": [
                        factory("head", "qs_entry", ["100%", "100%c"]),
                        {"div": img("divider", ["100%", 3], 2)},
                        {"scroll@common.scrolling_panel": {"size": ["100%", "fill"], "$show_background": False, "$scrolling_content": "rpg_forge.q_text",
                            "$scroll_size": [4, "100% - 4px"], "$scrolling_pane_size": ["100% - 4px", "100%"], "$scrolling_pane_offset": [0, 0], "$scroll_bar_right_padding_size": [0, 0]}}]}}]}},
                pad("g", 3),
                factory("acts", "qa_entry", ["100%", "100%c"])]}},
        ]}},
    ]}},
]}
json.dump(ui, open("resource_pack/ui/rpg_forge.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ui ok")
