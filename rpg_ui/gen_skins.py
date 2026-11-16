"""NPC 스킨 생성: 바닐라 steve/alex 옷 색만 바꿔 직업별 변형을 만든다.
custom_1~4.png 는 원하는 64x64 스킨으로 그대로 덮어써도 된다 (와이드 팔 모델).
"""
import colorsys
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

OUT = Path(__file__).parent / "resource_pack" / "textures" / "entity" / "rpg_npc"
BASE = "https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/textures/entity/"

# (파일명, 표시 이름, 베이스, 상의색, 하의색)
VARIANTS = [
    ("knight", "기사", "steve", (170, 176, 190), (70, 74, 88)),
    ("merchant", "상인", "alex", (60, 130, 80), (110, 75, 45)),
    ("mage", "마법사", "steve", (100, 60, 160), (50, 30, 90)),
    ("cleric", "성직자", "alex", (235, 230, 215), (200, 170, 90)),
    ("smith", "대장장이", "steve", (120, 80, 50), (50, 45, 45)),
    ("guard", "경비병", "steve", (170, 50, 45), (35, 40, 70)),
]
# 옷 영역 (머리 제외): 몸통/팔/다리 + 겉옷 레이어
CLOTH = [(16, 16, 40, 32), (40, 16, 56, 32), (0, 16, 16, 32), (16, 48, 32, 64), (32, 48, 48, 64),
         (16, 32, 40, 48), (40, 32, 56, 48), (0, 32, 16, 48), (0, 48, 16, 64), (48, 48, 64, 64)]
LEGS = [(0, 16, 16, 32), (16, 48, 32, 64), (0, 32, 16, 48), (0, 48, 16, 64)]


def is_skin(r, g, b):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return 0.02 <= h <= 0.11 and 0.2 <= s <= 0.65 and v >= 0.35


def in_box(x, y, boxes):
    return any(x0 <= x < x1 and y0 <= y < y1 for x0, y0, x1, y1 in boxes)


def recolor(img, top, bottom):
    img = img.copy()
    px = img.load()
    for y in range(64):
        for x in range(64):
            if not in_box(x, y, CLOTH):
                continue
            r, g, b, a = px[x, y]
            if a == 0 or is_skin(r, g, b):
                continue
            lum = (0.3 * r + 0.59 * g + 0.11 * b) / 128
            t = bottom if in_box(x, y, LEGS) else top
            px[x, y] = tuple(min(255, int(c * lum)) for c in t) + (a,)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    bases = {n: Image.open(BytesIO(urllib.request.urlopen(BASE + n + ".png").read())).convert("RGBA") for n in ("steve", "alex")}
    for fname, _, base, top, bottom in VARIANTS:
        recolor(bases[base], top, bottom).save(OUT / f"{fname}.png")
    for i in range(1, 5):
        p = OUT / f"custom_{i}.png"
        if not p.exists():
            bases["steve"].save(p)
    print("skins ->", OUT)


if __name__ == "__main__":
    main()
