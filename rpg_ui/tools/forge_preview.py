# 연성소 · 퀘스트 새 틀 미리보기 (게임 화면 흉내, 화면 단위 × Z 픽셀)
import sys
from PIL import Image, ImageDraw, ImageFont
F = "resource_pack/textures/ui/rpg/forge/"
Z = 3
FONT = "/usr/share/fonts/opentype/unifont/unifont.otf"
def font(scale=1.0): return ImageFont.truetype(FONT, int(16 * Z / 2 * scale))
def img(name, w, h):
    return Image.open(F + name + ".png" if not name.startswith("/") else name).convert("RGBA").resize((int(w * Z), int(h * Z)), Image.LANCZOS)
class Scr:
    def __init__(s, W, H, bg="art/bg.png"):
        s.W, s.H = W, H
        s.c = Image.new("RGBA", (W * Z, H * Z), (40, 34, 30, 255))
        g = Image.new("RGBA", s.c.size); d = ImageDraw.Draw(g)
        for i in range(0, H * Z, 6): d.rectangle([0, i, W * Z, i + 6], fill=(70 + i // 30 % 10, 52, 40, 255))
        s.c.alpha_composite(g)
        s.put("vignette", 0, 0, W, H)
    def put(s, name, x, y, w, h): s.c.alpha_composite(img(name, w, h), (int(x * Z), int(y * Z)))
    def text(s, t, x, y, col=(240, 236, 226), scale=1.0, anchor="la", shadow=True):
        d = ImageDraw.Draw(s.c); f = font(scale)
        if shadow: d.text(((x + 0.8) * Z, (y + 0.8) * Z), t, font=f, fill=(20, 20, 24), anchor=anchor)
        d.text((x * Z, y * Z), t, font=f, fill=col, anchor=anchor)
    def frame(s, x, y, w, h, title, sub=None):
        s.put("panel", x + 4, y + 4, w - 8, h - 8)
        s.put("edge_t", x + 16, y, w - 32, 8); s.put("edge_b", x + 16, y + h - 8, w - 32, 8)
        s.put("edge_l", x, y + 16, 8, h - 32); s.put("edge_r", x + w - 8, y + 16, 8, h - 32)
        for n, cx, cy in (("corner_tl", x, y), ("corner_tr", x + w - 16, y), ("corner_bl", x, y + h - 16), ("corner_br", x + w - 16, y + h - 16)): s.put(n, cx, cy, 16, 16)
        s.put("divider", x + w / 2 - 92 - 35, y + 18, 70, 3); s.put("divider", x + w / 2 + 92 - 35, y + 18, 70, 3)
        s.text(title, x + w / 2, y + 12, (245, 222, 150), 1.45, "ma")
        if sub: s.text(sub, x + w / 2, y + 27, (190, 176, 146), 0.75, "ma")
    def nine(s, tex, x, y, w, h):
        import json as J
        im = Image.open(f"resource_pack/textures/ui/rpg/{tex}.png").convert("RGBA")
        n = J.load(open(f"resource_pack/textures/ui/rpg/{tex}.json"))["nineslice_size"] if __import__("os").path.exists(f"resource_pack/textures/ui/rpg/{tex}.json") else 0
        W, H = int(w * Z), int(h * Z); out = Image.new("RGBA", (W, H)); sw, sh = im.size; k = n * Z
        if not n: out = im.resize((W, H), Image.NEAREST)
        else:
            xs = [(0, n, 0, k), (n, sw - n, k, W - k), (sw - n, sw, W - k, W)]; ys = [(0, n, 0, k), (n, sh - n, k, H - k), (sh - n, sh, H - k, H)]
            for sx0, sx1, dx0, dx1 in xs:
                for sy0, sy1, dy0, dy1 in ys:
                    if dx1 > dx0 and dy1 > dy0: out.paste(im.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.NEAREST), (dx0, dy0))
        s.c.alpha_composite(out, (int(x * Z), int(y * Z)))
    def save(s, path): s.c.convert("RGB").save(path)

def forge(path):
    s = Scr(420, 250)
    X, Y, W, H = 54, 3, 312, 244
    s.frame(X, Y, W, H, "무기 강화")
    cx, cw = X + 22, 268
    chips = [("enh_stone_1", "12"), ("enh_stone_2", "30"), ("enh_stone_3", "4"), ("enh_stone_4", "0"), ("enh_scroll_1", "5"), ("enh_scroll_2", "3"), ("enh_scroll_3", "1"), ("enh_protect", "5"), ("/gold", "12,840")]
    widths = [11 + 2 + len(t) * 4.2 + 7 for _, t in chips]; xx = cx + cw / 2 - sum(widths) / 2
    for (ic, t), w in zip(chips, widths):
        ipath = "resource_pack/textures/ui/rpg/icons/gold.png" if ic == "/gold" else f"resource_pack/textures/items/rpg/{ic}.png"
        s.c.alpha_composite(Image.open(ipath).convert("RGBA").resize((11 * Z, 11 * Z), Image.NEAREST), (int(xx * Z), int((Y + 28) * Z)))
        s.text(t, xx + 13, Y + 29, (236, 232, 222), 0.8); xx += w
    s.put("ribbon_fail", cx + 14, Y + 41, 240, 15); s.text("강화 실패   +8 → +7", cx + cw / 2, Y + 44, (240, 110, 100), 1.0, "ma")
    y = Y + 57
    s.put("card", cx, y, cw, 74)
    # 양옆 칸
    for sx, icon, name, on in ((cx + 18, "resource_pack/textures/items/rpg/enh_scroll_2.png", "중급 주문서", True), (cx + cw - 52, "resource_pack/textures/items/rpg/enh_protect.png", "파괴방지석", False)):
        s.put("slot_on" if on else "slot_idle", sx, y + 10, 34, 34)
        s.c.alpha_composite(Image.open(icon).convert("RGBA").resize((22 * Z, 22 * Z), Image.NEAREST), (int((sx + 6) * Z), int((y + 16) * Z)))
        s.put("plus", sx + 26, y + 6, 12, 12)
        s.text(name, sx + 17, y + 47, (240, 214, 160), 0.85, "ma")
        s.text("확률 +10%" if on else "누르면 사용", sx + 17, y + 56, (120, 220, 140) if on else (150, 150, 160), 0.75, "ma")
    mx = cx + cw / 2
    s.put("halo", mx - 28, y - 4, 56, 56)
    s.put("item_frame", mx - 20, y + 4, 40, 40)
    s.c.alpha_composite(Image.open("resource_pack/textures/items/rpg/cheongryong_sword.png").convert("RGBA").resize((28 * Z, 28 * Z), Image.NEAREST), (int((mx - 14) * Z), int((y + 10) * Z)))
    s.text("청룡의 검", mx, y + 46, (240, 236, 226), 1.0, "ma")
    s.text("+8", mx, y + 54, (245, 222, 150), 1.6, "ma")
    s.put("pips_8", mx - 55, y + 64, 110, 8)
    y += 77
    for k, v, col in (("현재 공격력", "246", (240, 236, 226)), ("강화 성공 시", "246 → 259", (110, 220, 140)), ("실패 시", "+7 로 하락", (240, 110, 100))):
        s.text(k, cx + 4, y, (165, 168, 180)); s.text(v, cx + cw - 4, y, col, 1.0, "ra"); y += 10
    s.put("divider", cx, y + 1, cw, 3); y += 5
    s.text("성공 확률", cx + 4, y + 1, (165, 168, 180)); s.put("bar_55", cx + 60, y + 1, 150, 9); s.text("55%", cx + cw - 4, y - 1, (240, 214, 160), 1.15, "ra"); y += 13
    mats = [("enh_stone_2", "중급석 ×3"), ("/gold", "12,800G"), ("enh_scroll_2", "주문서 ×1")]
    tw = len(mats) * 74; mxs = cx + cw / 2 - tw / 2
    for i, (ic, t) in enumerate(mats):
        bx = mxs + i * 74
        s.put("mslot", bx, y, 20, 20)
        p = "resource_pack/textures/ui/rpg/icons/gold.png" if ic == "/gold" else f"resource_pack/textures/items/rpg/{ic}.png"
        s.c.alpha_composite(Image.open(p).convert("RGBA").resize((14 * Z, 14 * Z), Image.NEAREST), (int((bx + 3) * Z), int((y + 3) * Z)))
        s.text(t, bx + 23, y + 6, (240, 236, 226), 0.85)
    yb = Y + H - 34
    s.put("sbtn_idle", cx, yb + 3, 56, 20); s.text("연속 강화", cx + 28, yb + 9, (190, 220, 255), 0.85, "ma")
    s.put("btn_hover", mx - 75, yb, 150, 26); s.text("무기 강화", mx, yb + 7, (250, 236, 200), 1.3, "ma")
    s.put("sbtn_idle", cx + cw - 56, yb + 3, 56, 20); s.text("돌아가기", cx + cw - 28, yb + 9, (220, 220, 230), 0.85, "ma")
    s.put("close", X + W - 24, Y + 10, 14, 14)
    s.save(path)
forge(sys.argv[1])

def quest(path):
    s = Scr(420, 250)
    X, Y, W, H = 6, 3, 408, 244
    s.frame(X, Y, W, H, "메인 이야기")
    cx, cw = X + 14, W - 28
    tabs = ["메뉴", "진행 중", "전체", "메인", "서브", "일일", "반복", "완료"]
    for i, t in enumerate(tabs):
        s.nine("row_on" if t == "메인" else "tab_default", cx + i * 40, Y + 34, 39, 18); s.text(t, cx + i * 40 + 19.5, Y + 38, (240, 236, 226), 0.8, "ma")
    s.text("1,240G   2/5", X + W - 14, Y + 13, (245, 222, 150), 0.85, "ra")
    rows = [("done", "1장  마을의 위기", "완료", (110, 200, 120)), ("done", "2장  어둠 속의 거미", "완료", (110, 200, 120)), ("active", "3장  잊힌 광산", "진행 중", (240, 180, 80)),
            ("lock", "4장  붉은 달의 밤", "잠김 · 앞 장을 끝내면 열림", (120, 120, 130)), ("lock", "5장  용의 둥지", "잠김 · 앞 장을 끝내면 열림", (120, 120, 130))]
    lw = cw * 0.56; y0 = Y + 56
    for i, (k, t, sub, col) in enumerate(rows):
        y = y0 + i * 27
        if i > 0: s.put("line_gold" if rows[i - 1][0] == "done" else "line_dim", cx + 14, y, 3, 13.5)
        if i < len(rows) - 1: s.put("line_gold" if k == "done" else "line_dim", cx + 14, y + 13.5, 3, 13.5)
        s.c.alpha_composite(Image.open(F + f"node_{k}.png").convert("RGBA").resize((18 * Z, 18 * Z), Image.NEAREST), (int((cx + 6) * Z), int((y + 4.5) * Z)))
        s.nine("row_on" if i == 2 else "row_default", cx + 30, y + 1, lw - 30, 25)
        s.text(t, cx + 37, y + 4, (240, 236, 226) if k != "lock" else (130, 130, 140)); s.text(sub, cx + 37, y + 14, col, 1.0)
    dx, dw = cx + cw - cw * 0.42, cw * 0.42
    s.nine("card_head", dx, y0, dw, 28)
    s.c.alpha_composite(Image.open("resource_pack/textures/ui/rpg/icons/star.png").convert("RGBA").resize((14 * Z, 14 * Z), Image.NEAREST), (int((dx + 6) * Z), int((y0 + 7) * Z)))
    s.text("잊힌 광산", dx + 28, y0 + 8, (245, 222, 150), 1.1)
    s.nine("card_body", dx, y0 + 28, dw, 104)
    for i, l in enumerate(["메인 퀘스트  [진행 중]", "지역 북쪽 광산", "", "목표", "- 거미 처치 ×5   3/5", "", "보상", "골드 500 · 경험치 300"]):
        s.text(l, dx + 7, y0 + 32 + i * 11, (240, 236, 226) if i not in (3, 6) else (240, 214, 120), 0.9)
    for i, t in enumerate(["자세히 보기", "★ 길 안내 (최우선)", "포기"]):
        yy = y0 + 135 + i * 19
        s.nine("action_hover" if i == 0 else "action_default", dx, yy, dw, 17)
        s.c.alpha_composite(Image.open("resource_pack/textures/ui/rpg/action_dot.png").convert("RGBA").resize((8 * Z, 8 * Z), Image.NEAREST), (int((dx + 5) * Z), int((yy + 4.5) * Z)))
        s.text(t, dx + dw / 2 + 4, yy + 4, (240, 236, 226), 0.9, "ma")
    s.save(path)
if len(sys.argv) > 2: quest(sys.argv[2])
