"""④ 청룡 · 천룡추 의 큰 청룡 그림 → 파티클 점 그림 텍스처
원본: art/cheongryong_ref.png (사용자 제공 그림, 왼쪽을 봄, 흰 배경)
  1) 테두리에서 시작해 '거의 흰색' 픽셀만 지움 (파란 외곽선이 경계라 안쪽 흰 물거품은 남음)
  2) 좌우 뒤집기 (머리가 앞=오른쪽), 그림 부분만 잘라 축소
  3) 파티클이 픽셀마다 그 색 그대로 점을 찍음 (gen_cheongryong.py 의 cr_bighead)
"""
from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent
SRC = ROOT / "art" / "cheongryong_ref.png"
OUT = ROOT / "resource_pack" / "textures" / "particle" / "rpg_cr_dragonhead.png"
TARGET_W = 240
CELL = 8
# ✱ 눈꽃 모양 (8x8): 예전 눈꽃 파티클과 같은 모양을 픽셀마다 찍음
FLAKE = [
    "X..X..X.",
    ".X.X.X..",
    "..XXX...",
    "XXXXXXX.",
    "..XXX...",
    ".X.X.X..",
    "X..X..X.",
    "........",
]


def main():
    im = Image.open(SRC).convert("RGBA")
    W, H = im.size
    px = im.load()
    white = lambda c: c[0] > 228 and c[1] > 228 and c[2] > 228
    seen = bytearray(W * H)
    q = deque()
    for x in range(W):
        q.append((x, 0)); q.append((x, H - 1))
    for y in range(H):
        q.append((0, y)); q.append((W - 1, y))
    while q:
        x, y = q.popleft()
        i = y * W + x
        if seen[i]:
            continue
        seen[i] = 1
        if not white(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]:
                q.append((nx, ny))
    im = im.transpose(Image.FLIP_LEFT_RIGHT)
    im = im.crop(im.getbbox())
    w, h = im.size
    small = im.resize((TARGET_W, round(h * TARGET_W / w)), Image.LANCZOS)
    sp = small.load()
    n = 0
    for y in range(small.size[1]):
        for x in range(small.size[0]):
            r, g, b, a = sp[x, y]
            if a < 120:
                sp[x, y] = (0, 0, 0, 0)
            else:
                sp[x, y] = (r, g, b, 255)
                n += 1
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # 픽셀 하나 = CELLxCELL 칸의 ✱ 눈꽃 (나머지 투명) → 그림이 눈꽃 파티클로 찍힘
    big = Image.new("RGBA", (small.size[0] * CELL, small.size[1] * CELL), (0, 0, 0, 0))
    bp = big.load()
    disc = [(i, j) for j, row in enumerate(FLAKE) for i, ch in enumerate(row) if ch == "X"]
    for y in range(small.size[1]):
        for x in range(small.size[0]):
            col = sp[x, y]
            if col[3]:
                for i, j in disc:
                    bp[x * CELL + i, y * CELL + j] = col
    big.save(OUT)
    bg = Image.new("RGBA", small.size, (70, 100, 150, 255))
    bg.alpha_composite(small)
    bg.resize((small.size[0] * 3, small.size[1] * 3), Image.NEAREST).save(ROOT / "docs" / "dragonhead_preview.png")
    print("dragon image", small.size, "filled px:", n)


if __name__ == "__main__":
    main()
