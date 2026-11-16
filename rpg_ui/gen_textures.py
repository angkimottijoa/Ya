"""RPG UI 텍스처 생성기.

색을 바꾸고 싶으면 아래 PALETTE 값만 수정한 뒤 다시 실행:
    python gen_textures.py
결과는 resource_pack/textures/ui/rpg/ 에 PNG로 저장된다.
"""
import json
from pathlib import Path

from PIL import Image

OUT = Path(__file__).parent / "resource_pack" / "textures" / "ui" / "rpg"

PALETTE = {
    "bg": (18, 20, 34, 225),          # 패널 배경 (짙은 남색, 반투명)
    "bg_header": (34, 28, 52, 240),   # 퀘스트 헤더 배경 (보라빛)
    "gold": (214, 172, 82, 255),      # 테두리 금색
    "gold_dark": (120, 90, 40, 255),  # 테두리 안쪽 음영
    "btn": (44, 38, 70, 240),
    "btn_hover": (78, 64, 120, 245),
    "btn_pressed": (24, 20, 40, 250),
    "icon": (240, 214, 140, 255),
    "quest_mark": (255, 196, 64, 255),
}


def framed(size, fill, border, inner, notch=True):
    """금테 + 안쪽 음영선 + 모서리 깎인 프레임 (nineslice 4px 기준)."""
    w, h = size
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        for x in range(w):
            edge = min(x, y, w - 1 - x, h - 1 - y)
            corner = (x in (0, w - 1)) and (y in (0, h - 1))
            if notch and corner:
                continue  # 모서리 1px 깎기 → 마크 기본 UI 느낌 제거
            if edge == 0:
                px[x, y] = border
            elif edge == 1:
                px[x, y] = inner
            else:
                px[x, y] = fill
    # 모서리 금색 장식 점
    for cx, cy in ((1, 1), (w - 2, 1), (1, h - 2), (w - 2, h - 2)):
        px[cx, cy] = border
    return img


def nineslice(name, img, slice_px=4):
    img.save(OUT / f"{name}.png")
    (OUT / f"{name}.json").write_text(
        json.dumps({"nineslice_size": slice_px, "base_size": list(img.size)}, indent=2) + "\n"
    )


def icon_menu():
    """햄버거(≡) 메뉴 아이콘 10x10."""
    img = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    px = img.load()
    for y in (1, 4, 7):
        for x in range(1, 9):
            px[x, y] = PALETTE["icon"]
            px[x, y + 1] = PALETTE["gold_dark"]
    img.save(OUT / "icon_menu.png")


def icon_quest():
    """두루마리 + 느낌표 퀘스트 아이콘 10x10."""
    c, d, m = PALETTE["icon"], PALETTE["gold_dark"], PALETTE["quest_mark"]
    rows = [
        ".dccccccd.",
        "dcccccccd.",
        ".cccmmccc.",
        ".cccmmccc.",
        ".cccmmccc.",
        ".cccmmccc.",
        ".cccccccc.",
        ".cccmmccc.",
        "dcccccccd.",
        ".dccccccd.",
    ]
    img = Image.new("RGBA", (10, 10), (0, 0, 0, 0))
    px = img.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == "c":
                px[x, y] = c
            elif ch == "d":
                px[x, y] = d
            elif ch == "m":
                px[x, y] = m
    img.save(OUT / "icon_quest.png")


def divider():
    img = Image.new("RGBA", (16, 1), PALETTE["gold_dark"])
    img.save(OUT / "divider.png")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    P = PALETTE
    nineslice("bar", framed((16, 16), P["bg"], P["gold"], P["gold_dark"]))
    nineslice("panel", framed((16, 16), P["bg"], P["gold"], P["gold_dark"]))
    nineslice("header", framed((16, 16), P["bg_header"], P["gold_dark"], P["bg_header"], notch=False), 2)
    nineslice("button_default", framed((16, 16), P["btn"], P["gold"], P["gold_dark"]))
    nineslice("button_hover", framed((16, 16), P["btn_hover"], P["icon"], P["gold"]))
    nineslice("button_pressed", framed((16, 16), P["btn_pressed"], P["gold_dark"], P["btn_pressed"]))
    icon_menu()
    icon_quest()
    divider()
    print("textures ->", OUT)


if __name__ == "__main__":
    main()
