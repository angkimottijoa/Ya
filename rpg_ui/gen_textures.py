"""Arcania RPG UI 텍스처 생성기.

색을 바꾸고 싶으면 PALETTE 값만 수정한 뒤 다시 실행:
    python gen_textures.py

- resource_pack/textures/ui/rpg/       : RPG 전용 UI (HUD, 메뉴 화면, 아이콘)
- resource_pack/textures/ui/ (덮어쓰기) : 바닐라 인벤토리/상자/폼 등의 배경, 슬롯, 핫바를
                                          같은 테마로 교체 → 마크 기본 UI 느낌 제거
- resource_pack/textures/items/rpg/    : 커스텀 아이템 아이콘
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).parent / "resource_pack" / "textures"
RPG = ROOT / "ui" / "rpg"
VAN = ROOT / "ui"
ITEMS = ROOT / "items" / "rpg"

PALETTE = {
    # 남색 + 금색 (HUD, 레일, 헤더)
    "navy": (24, 28, 46, 235),
    "navy_light": (46, 52, 82, 245),
    "navy_dark": (12, 14, 26, 245),
    "gold": (214, 172, 82, 255),
    "gold_light": (246, 222, 150, 255),
    "gold_dark": (120, 90, 40, 255),
    # 양피지 (상세 카드, 바닐라 창 배경)
    "cream": (236, 229, 216, 255),
    "cream_dark": (214, 204, 186, 255),
    "cream_line": (176, 162, 138, 255),
    "ink": (60, 64, 84, 255),
    # 희귀도 1~5
    "r1": ((112, 116, 128), (150, 152, 162)),
    "r2": ((60, 110, 90), (98, 160, 120)),
    "r3": ((60, 90, 150), (100, 140, 200)),
    "r4": ((100, 70, 150), (150, 110, 200)),
    "r5": ((170, 110, 50), (222, 168, 88)),
    "dim": (10, 12, 22, 200),
    "white": (255, 255, 255, 255),
    "red": (200, 70, 60, 255),
    "green": (110, 190, 110, 255),
    "blue": (110, 160, 230, 255),
    "silver": (200, 205, 215, 255),
}
P = PALETTE


# ───────────────────────── helpers ─────────────────────────
def save(img, path, nineslice=None, base=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)
    js = path.with_suffix(".json")
    if nineslice is not None:
        js.write_text(json.dumps({"nineslice_size": nineslice,
                                  "base_size": list(base or img.size)}, indent=2) + "\n")
    elif js.exists():
        js.unlink()


def frame(size, fill, border=None, inner=None, notch=True, radius=0):
    """테두리 + 안쪽선 + 모서리 깎인 패널."""
    w, h = size
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        for x in range(w):
            edge = min(x, y, w - 1 - x, h - 1 - y)
            # 모서리 둥글게(깎기)
            dx = min(x, w - 1 - x)
            dy = min(y, h - 1 - y)
            if notch and dx + dy < radius + 1:
                continue
            if border and edge == 0:
                px[x, y] = border
            elif inner and edge == 1:
                px[x, y] = inner
            else:
                px[x, y] = fill
    return img


def vgrad(size, top, bottom, alpha=255):
    w, h = size
    img = Image.new("RGBA", size)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (alpha,)
        for x in range(w):
            px[x, y] = c
    return img


def ascii_icon(rows, colors, size=None):
    h = len(rows)
    w = max(len(r) for r in rows)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in colors:
                px[x, y] = colors[ch]
    if size:
        img = img.resize(size, Image.NEAREST)
    return img


IC = {
    "g": P["gold"], "G": P["gold_light"], "d": P["gold_dark"], "c": P["cream"],
    "k": P["navy_dark"], "w": P["white"], "s": P["silver"], "r": P["red"],
    "e": P["green"], "b": P["blue"], "i": P["ink"], "n": P["navy_light"],
}

# 12x12 아이콘 (레일/타일/카테고리)
ICONS = {
    "home": [
        ".....gg.....",
        "....gGGg....",
        "...gGGGGg...",
        "..gGGGGGGg..",
        ".gGGGGGGGGg.",
        "gggggggggggg",
        ".gccccccccg.",
        ".gccckkcccg.",
        ".gccckkcccg.",
        ".gccckkcccg.",
        ".gccckkcccg.",
        ".gggggggggg.",
    ],
    "profile": [
        "....gggg....",
        "...gccccg...",
        "..gccccccg..",
        "..gccccccg..",
        "..gccccccg..",
        "...gccccg...",
        "....gggg....",
        "..gggggggg..",
        ".gccccccccg.",
        "gccccccccccg",
        "gccccccccccg",
        "gggggggggggg",
    ],
    "class": [
        "..........ss",
        ".........sws",
        "........sws.",
        ".......sws..",
        "......sws...",
        ".....sws....",
        "..g.sws.....",
        "...gws......",
        "...dgg......",
        "..d..gg.....",
        ".d....g.....",
        "dd..........",
    ],
    "party": [
        "..gg....gg..",
        ".gccg..gccg.",
        ".gccg..gccg.",
        "..gg....gg..",
        ".gggg..gggg.",
        "gccccggccccg",
        "gcccc..ccccg",
        "gggggggggggg",
        "....gggg....",
        "...gccccg...",
        "..gccccccg..",
        "..gggggggg..",
    ],
    "quest": [
        ".dggggggggd.",
        "dgccccccccgd",
        ".gcccrrcccg.",
        ".gcccrrcccg.",
        ".gcccrrcccg.",
        ".gcccrrcccg.",
        ".gcccrrcccg.",
        ".gcccccccсg.".replace("с", "c"),
        ".gcccrrcccg.",
        ".gccccccccg.",
        "dgccccccccgd",
        ".dggggggggd.",
    ],
    "bag": [
        "....gggg....",
        "...g....g...",
        "..gggggggg..",
        ".gccccccccg.",
        "gccccccccccg",
        "gcccggggcccg",
        "gcccgGGgcccg",
        "gcccggggcccg",
        "gccccccccccg",
        "gccccccccccg",
        ".gccccccccg.",
        "..gggggggg..",
    ],
    "shop": [
        "....gggg....",
        "..ggGGGGgg..",
        ".gGGddddGGg.",
        "gGGd.GG.dGGg",
        "gGGd.GG....g",
        "gGGGddddGGGg",
        "gGGGGG.dGGGg",
        "gG...G.dGGGg",
        "gGGd.GG.dGGg",
        ".gGGddddGGg.",
        "..ggGGGGgg..",
        "....gggg....",
    ],
    "settings": [
        ".....gg.....",
        "..g.gGGg.g..",
        ".gGgGGGGgGg.",
        "..gGGddGGg..",
        ".gGGd..dGGg.",
        "gGGd....dGGg",
        "gGGd....dGGg",
        ".gGGd..dGGg.",
        "..gGGddGGg..",
        ".gGgGGGGgGg.",
        "..g.gGGg.g..",
        ".....gg.....",
    ],
    "admin": [
        ".ssssss.....",
        "sswwwwss....",
        "ssssssss....",
        ".sss.ss.....",
        "......dd....",
        ".......dd...",
        "........dd..",
        ".........dd.",
        "..........dd",
        "...........d",
        "............",
        "............",
    ],
    "back": [
        "............",
        ".....g......",
        "....gg......",
        "...gGgggggg.",
        "..gGGGGGGGg.",
        ".gGGGGGGGGg.",
        "..gGGGGGGGg.",
        "...gGgggggg.",
        "....gg......",
        ".....g......",
        "............",
        "............",
    ],
    "all": [
        "gggg..gggg..",
        "gccg..gccg..",
        "gccg..gccg..",
        "gggg..gggg..",
        "............",
        "............",
        "gggg..gggg..",
        "gccg..gccg..",
        "gccg..gccg..",
        "gggg..gggg..",
        "............",
        "............",
    ],
    "armor": [
        "..gg....gg..",
        ".gssgggggsg.",
        "gsssssssssg.",
        "gsswsssssg..",
        ".gssssssssg.",
        ".gswsssssg..",
        ".gssssssssg.",
        ".gssssssssg.",
        ".gssssssssg.",
        "..gssssssg..",
        "...gggggg...",
        "............",
    ],
    "food": [
        "......d.....",
        ".....d......",
        "...rrdrr....",
        "..rrrrrrr...",
        ".rrwrrrrrr..",
        ".rwrrrrrrr..",
        ".rrrrrrrrr..",
        ".rrrrrrrrr..",
        "..rrrrrrr...",
        "...rrrrr....",
        "....r.r.....",
        "............",
    ],
    "material": [
        "............",
        ".....bb.....",
        "....bwbb....",
        "...bwbbbb...",
        "..bbbbbbbb..",
        ".bbbbbbbbbb.",
        "..bbbbbbbb..",
        "...bbbbbb...",
        "....bbbb....",
        ".....bb.....",
        "............",
        "............",
    ],
    "misc": [
        "............",
        "....gggg....",
        "...g....g...",
        "........g...",
        ".......g....",
        "......g.....",
        ".....g......",
        ".....g......",
        "............",
        ".....g......",
        "............",
        "............",
    ],
    "gold": [
        "...gggggg...",
        "..gGGGGGGg..",
        ".gGGddddGGg.",
        "gGGdGGGGdGGg",
        "gGGdGGGGGGGg",
        "gGGdGGGGGGGg",
        "gGGdGGGGGGGg",
        "gGGdGGGGdGGg",
        ".gGGddddGGg.",
        "..gGGGGGGg..",
        "...gggggg...",
        "............",
    ],
    "level": [
        ".....gg.....",
        "....gGGg....",
        "...gGGGGg...",
        "..gGGGGGGg..",
        ".gggGGGGggg.",
        "...gGGGGg...",
        "...gGGGGg...",
        "...gGGGGg...",
        "...gGGGGg...",
        "...gggggg...",
        "............",
        "............",
    ],
    "skill": [
        "......gg....",
        ".....gGg....",
        "....gGg.....",
        "...gGGg.....",
        "..gGGGgggg..",
        ".ggggGGGg...",
        ".....gGg....",
        "....gGg.....",
        "....gg......",
        "...gg.......",
        "...g........",
        "............",
    ],
    "npc": [
        "....gggg....",
        "...gccccg...",
        "..gckcckcg..",
        "..gccccccg..",
        "...gcrrcg...",
        "....gggg....",
        "..gbbbbbbg..",
        ".gbbbbbbbbg.",
        ".gbbggggbbg.",
        ".gbbbbbbbbg.",
        "..gbbbbbbg..",
        "...gg..gg...",
    ],
    "star": [
        ".....gg.....",
        ".....GG.....",
        "....gGGg....",
        "gggggGGggggg",
        ".gGGGGGGGGg.",
        "..gGGGGGGg..",
        "...gGGGGg...",
        "..gGGggGGg..",
        "..gGg..gGg..",
        ".gGg....gGg.",
        ".gg......gg.",
        "............",
    ],
    "close": [
        "............",
        ".gg......gg.",
        ".gGg....gGg.",
        "..gGg..gGg..",
        "...gGggGg...",
        "....gGGg....",
        "....gGGg....",
        "...gGggGg...",
        "..gGg..gGg..",
        ".gGg....gGg.",
        ".gg......gg.",
        "............",
    ],
    "plus": [
        "............",
        ".....gg.....",
        ".....GG.....",
        ".....GG.....",
        ".....GG.....",
        ".gGGGGGGGGg.",
        ".gGGGGGGGGg.",
        ".....GG.....",
        ".....GG.....",
        ".....GG.....",
        ".....gg.....",
        "............",
    ],
}

# 직업 아이콘
ICONS["warrior"] = ICONS["class"]
ICONS["archer"] = [
    "...ddd......",
    "..d...d.....",
    ".d.....d....",
    ".d......d...",
    "d.......d..s",
    "d.....wwwws.",
    "d.......d..s",
    ".d......d...",
    ".d.....d....",
    "..d...d.....",
    "...ddd......",
    "............",
]
ICONS["mage"] = [
    "........bb..",
    ".......bwwb.",
    ".......bwwb.",
    "........bb..",
    ".......d....",
    "......d.....",
    ".....d......",
    "....d.......",
    "...d........",
    "..d.........",
    ".d..........",
    "............",
]
ICONS["cleric"] = [
    "....gggg....",
    "....gGGg....",
    "....gGGg....",
    "gggggGGggggg",
    "gGGGGGGGGGGg",
    "gGGGGGGGGGGg",
    "gggggGGggggg",
    "....gGGg....",
    "....gGGg....",
    "....gGGg....",
    "....gGGg....",
    "....gggg....",
]
ICONS["novice"] = ICONS["profile"]


# ───────────────────────── RPG 전용 ─────────────────────────
def rpg_textures():
    # HUD (남색 반투명 + 금테)
    save(frame((16, 16), P["navy"], P["gold"], P["gold_dark"], radius=1), RPG / "bar.png", 4)
    save(frame((16, 16), P["navy"], P["gold"], P["gold_dark"], radius=1), RPG / "panel.png", 4)
    save(frame((16, 16), P["navy_light"], P["gold_dark"], None, notch=False), RPG / "header.png", 2)
    save(frame((16, 16), P["navy_light"], P["gold"], P["gold_dark"], radius=1), RPG / "button_default.png", 4)
    save(frame((16, 16), (90, 78, 140, 245), P["gold_light"], P["gold"], radius=1), RPG / "button_hover.png", 4)
    save(frame((16, 16), P["navy_dark"], P["gold_dark"], None, radius=1), RPG / "button_pressed.png", 4)
    save(Image.new("RGBA", (16, 1), P["gold_dark"]), RPG / "divider.png")

    # XP 바
    save(frame((8, 6), (20, 20, 30, 220), P["gold_dark"], None, notch=False), RPG / "xp_bg.png", 2)
    save(vgrad((4, 4), (130, 220, 120), (60, 150, 70)), RPG / "xp_fill.png")

    # 메뉴 화면 공통
    save(Image.new("RGBA", (1, 1), P["dim"]), RPG / "screen_bg.png")
    rail = frame((16, 16), P["navy"], None, None, notch=False)
    d = ImageDraw.Draw(rail)
    d.line([(15, 0), (15, 15)], fill=P["gold_dark"])
    save(rail, RPG / "rail.png", 4)

    # 레일 탭: 기본(어두운 원) / 호버 / 선택(양피지 알약 – 오른쪽으로 튀어나옴)
    save(frame((24, 24), (34, 38, 60, 230), P["gold_dark"], None, radius=6), RPG / "tab_default.png", 8)
    save(frame((24, 24), (60, 64, 96, 240), P["gold"], None, radius=6), RPG / "tab_hover.png", 8)
    save(frame((24, 24), P["cream"], P["gold"], None, radius=6), RPG / "tab_on.png", 8)

    # 상단 칩(재화 표시) / 닫기 버튼
    save(frame((16, 12), (12, 14, 26, 200), (70, 74, 100, 255), None, radius=3), RPG / "chip.png", 5)
    save(frame((20, 20), P["cream"], P["gold"], None, radius=5), RPG / "close_default.png", 6)
    save(frame((20, 20), (255, 245, 220, 255), P["gold_light"], None, radius=5), RPG / "close_hover.png", 6)

    # 아이템 칸: 희귀도 그라데이션 + 아래쪽 양피지 띠 (26x30)
    for i in range(1, 6):
        top, bot = P[f"r{i}"]
        cell = Image.new("RGBA", (26, 30), (0, 0, 0, 0))
        g = vgrad((26, 22), top, bot)
        cell.paste(g, (0, 0))
        cell.paste(Image.new("RGBA", (26, 8), P["cream"]), (0, 22))
        px = cell.load()
        # 오른쪽 아래 모서리 둥글게(원신식 X, 단순 깎기)
        for (x, y) in [(0, 0), (25, 0), (0, 29), (25, 29)]:
            px[x, y] = (0, 0, 0, 0)
        save(cell, RPG / f"cell_r{i}.png")
    sel = Image.new("RGBA", (26, 30), (0, 0, 0, 0))
    d = ImageDraw.Draw(sel)
    d.rectangle([0, 0, 25, 29], outline=P["white"])
    d.rectangle([1, 1, 24, 28], outline=P["gold_light"])
    save(sel, RPG / "cell_on.png")
    hov = Image.new("RGBA", (26, 30), (0, 0, 0, 0))
    ImageDraw.Draw(hov).rectangle([0, 0, 25, 29], outline=(255, 255, 255, 150))
    save(hov, RPG / "cell_hover.png")

    # 홈 타일
    save(frame((24, 24), (34, 38, 60, 225), P["gold_dark"], None, radius=2), RPG / "tile_default.png", 6)
    save(frame((24, 24), (64, 60, 100, 240), P["gold"], P["gold_dark"], radius=2), RPG / "tile_hover.png", 6)
    save(frame((24, 24), (20, 22, 36, 245), P["gold_dark"], None, radius=2), RPG / "tile_pressed.png", 6)

    # 리스트 행
    save(frame((16, 16), (34, 38, 60, 215), (60, 64, 92, 255), None, radius=1), RPG / "row_default.png", 4)
    save(frame((16, 16), (60, 60, 96, 235), P["gold"], None, radius=1), RPG / "row_hover.png", 4)
    save(frame((16, 16), P["cream"], P["gold"], None, radius=1), RPG / "row_on.png", 4)

    # 상세 카드: 헤더(남색 그라데이션) / 본문(양피지)
    head = vgrad((16, 16), (74, 80, 110), (44, 48, 72), 245)
    d = ImageDraw.Draw(head)
    d.line([(0, 0), (15, 0)], fill=(150, 156, 186, 255))
    save(head, RPG / "card_head.png", 4)
    save(frame((16, 16), P["cream"], None, None, notch=False), RPG / "card_body.png", 4)
    save(frame((16, 12), P["navy_light"], P["gold_dark"], None, notch=False), RPG / "card_title.png", 3)

    # 액션 버튼 (양피지 알약, 원형 아이콘 자리)
    save(frame((24, 16), P["cream"], P["cream_line"], None, radius=4), RPG / "action_default.png", 6)
    save(frame((24, 16), (255, 248, 230, 255), P["gold"], None, radius=4), RPG / "action_hover.png", 6)
    save(frame((24, 16), P["cream_dark"], P["cream_line"], None, radius=4), RPG / "action_pressed.png", 6)
    dot = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    d = ImageDraw.Draw(dot)
    d.ellipse([0, 0, 9, 9], fill=P["ink"])
    d.ellipse([2, 2, 7, 7], outline=P["gold"])
    save(dot, RPG / "action_dot.png")

    # 아이콘
    for name, rows in ICONS.items():
        save(ascii_icon(rows, IC), RPG / "icons" / f"{name}.png")
    # HUD 구버전 이름 호환
    save(ascii_icon(ICONS["settings"], IC), RPG / "icon_menu.png")
    save(ascii_icon(ICONS["quest"], IC), RPG / "icon_quest.png")


# ─────────────────── 바닐라 UI 텍스처 덮어쓰기 ───────────────────
def vanilla_overrides():
    # 창 배경: 양피지 + 금테 (바닐라의 어두운 글자색이 그대로 읽히도록 밝은 톤)
    win = frame((16, 16), P["cream"], P["gold_dark"], P["gold"], radius=1)
    save(win, VAN / "dialog_background_opaque.png", 4)
    save(win, VAN / "dialog_background_opaque_overlap_bottom.png", 4)
    save(frame((16, 16), P["cream_dark"], P["cream_line"], None, radius=1), VAN / "recipe_back_panel.png", 4)

    # 슬롯
    cell = frame((10, 10), P["cream_dark"], P["cream_line"], None, notch=False)
    save(cell, VAN / "cell_image.png", 1, [5, 5])
    save(frame((5, 5), P["cream_dark"], P["cream_line"], None, notch=False), VAN / "cell_image_normal.png", 1)
    save(Image.new("RGBA", (1, 1), (246, 222, 150, 110)), VAN / "highlight_slot.png", 1)
    hl = frame((24, 24), (0, 0, 0, 0), P["gold"], P["gold_light"], notch=False)
    save(hl, VAN / "pocket_ui_highlight_slot.png", 4)
    save(frame((16, 16), (0, 0, 0, 0), P["gold_light"], P["gold"], notch=False), VAN / "pocket_ui_highlight_selected_slot.png", 5)

    # 버튼 (폼 버튼, 포켓 UI 탭 등)
    save(frame((4, 4), P["cream"], P["cream_line"], None, notch=False), VAN / "button_borderless_light.png", 1)
    save(frame((4, 4), (255, 246, 222, 255), P["gold"], None, notch=False), VAN / "button_borderless_lighthover.png", 1)
    save(frame((4, 4), P["cream_dark"], P["gold_dark"], None, notch=False), VAN / "button_borderless_lightpressed.png", 1)

    # 탭 (포켓 인벤토리 오른쪽 탭, 클래식 상단 탭)
    for name, size in [("TabRightBackTopMost", (11, 12)), ("TabTopBackLeftMost", (12, 11))]:
        save(frame(size, P["navy_light"], P["gold_dark"], None, notch=False), VAN / f"{name}.png", 4)
    for name, size in [("TabRightFrontTopMost", (11, 12)), ("TabTopFrontLeftMost", (12, 11))]:
        save(frame(size, P["cream"], P["gold"], None, notch=False), VAN / f"{name}.png", 4)

    # 화면 뒤 배경 (인벤토리 열었을 때 깔리는 어둡기)
    save(Image.new("RGBA", (1, 1), (12, 14, 26, 150)), VAN / "screen_background.png", 0)

    # 핫바: 남색 칸 + 금색 구분선 / 선택 칸 금테
    for i in range(9):
        hb = Image.new("RGBA", (20, 22), (0, 0, 0, 0))
        d = ImageDraw.Draw(hb)
        d.rectangle([0, 0, 19, 21], fill=(20, 24, 40, 200))
        d.line([(0, 0), (19, 0)], fill=P["gold_dark"])
        d.line([(0, 21), (19, 21)], fill=P["gold_dark"])
        d.line([(19, 1), (19, 20)], fill=(70, 70, 100, 255))
        d.rectangle([2, 2, 17, 19], outline=(40, 44, 66, 255))
        save(hb, VAN / f"hotbar_{i}.png")
    cap = Image.new("RGBA", (1, 22), P["gold_dark"])
    save(cap, VAN / "hotbar_start_cap.png", [1, 1, 1, 1])
    save(cap, VAN / "hotbar_end_cap.png", [1, 1, 1, 1])
    sel = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(sel)
    d.rectangle([0, 0, 23, 23], outline=P["gold"])
    d.rectangle([1, 1, 22, 22], outline=P["gold_light"])
    d.rectangle([2, 2, 21, 21], outline=(120, 90, 40, 160))
    save(sel, VAN / "selected_hotbar_slot.png")

    # 툴팁/HUD 문구 배경
    save(frame((6, 6), (12, 14, 26, 210), P["gold_dark"], None, notch=False), VAN / "hud_tip_text_background.png", [2, 2, 2, 2])


# ─────────────────── 커스텀 아이템 아이콘 ───────────────────
def item_icons():
    big = {k: v for k, v in IC.items()}
    book = [
        "................",
        "..dddddddddddd..",
        ".dnnnnnnnnnnnnd.",
        ".dnggggggggggnd.",
        ".dngnnnnnnnngnd.",
        ".dngnnGGGnnngnd.",
        ".dngnGnnnGnngnd.",
        ".dngnGnGnGnngnd.",
        ".dngnGnnnGnngnd.",
        ".dngnnGGGnnngnd.",
        ".dngnnnnnnnngnd.",
        ".dnggggggggggnd.",
        ".dnnnnnnnnnnnnd.",
        ".dcccccccccccccd",
        "..dddddddddddd..",
        "................",
    ]
    save(ascii_icon(book, big), ITEMS / "menu.png")
    tool = [
        "................",
        "..ssssss........",
        ".sswwwwss.......",
        ".ssssssss.......",
        "..sss.sss.......",
        "......dd........",
        ".......dd.......",
        "........dd......",
        ".........dd.....",
        "..........dd..g.",
        "...........dggG.",
        "............gGg.",
        "...........gGg..",
        "..........gGg...",
        "...........g....",
        "................",
    ]
    save(ascii_icon(tool, big), ITEMS / "quest_tool.png")


def main():
    rpg_textures()
    vanilla_overrides()
    item_icons()
    print("textures ->", ROOT)


if __name__ == "__main__":
    main()
