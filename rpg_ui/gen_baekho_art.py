"""백호의 도끼 그림 (V5.0): 사용자 제공 그림(art/baekho_axe_ref.png)을 파티클 점 그림 텍스처로
  1) 테두리에서 시작해 '거의 흰색' 배경만 지움 (회색 불꽃 테두리는 남음)
  2) 사진 그대로 45도 (날 = 왼쪽 아래, 자루 끝 = 오른쪽 위), 쥐는 곳 좌표는 bh_art_meta.js 로
  3) 축소 → 픽셀마다 CELL 칸 꽉 찬 점, 아이템 아이콘(32x32)도 같은 그림으로
"""
from collections import deque
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).parent
SRC = ROOT / "art" / "baekho_axe_ref.png"
OUT = ROOT / "resource_pack" / "textures" / "particle" / "rpg_bh_art.png"
ICON = ROOT / "resource_pack" / "textures" / "items" / "rpg" / "baekho_axe.png"
CELL = 8
TARGET_W = 150


def cutout():
    im = Image.open(SRC).convert("RGBA")
    W, H = im.size
    px = im.load()
    bg = lambda c: min(c[0], c[1], c[2]) > 236
    seen = bytearray(W * H)
    q = deque([(x, 0) for x in range(W)] + [(x, H - 1) for x in range(W)] + [(0, y) for y in range(H)] + [(W - 1, y) for y in range(H)])
    while q:
        x, y = q.popleft()
        i = y * W + x
        if seen[i]:
            continue
        seen[i] = 1
        if not bg(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not seen[ny * W + nx]:
                q.append((nx, ny))
    return im.crop(im.getbbox())


def clean(im):
    p = im.load()
    n = 0
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            r, g, b, a = p[x, y]
            if a < 110:
                p[x, y] = (0, 0, 0, 0)
            else:
                p[x, y] = (r, g, b, 255)
                n += 1
    return n


def main():
    axe = cutout()
    # 아이콘: 날이 오른쪽 위로 가게 180도 돌려 32x32
    ic = axe.rotate(180, expand=True)
    ic.thumbnail((32, 32), Image.LANCZOS)
    icon = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    icon.paste(ic, ((32 - ic.size[0]) // 2, (32 - ic.size[1]) // 2))
    clean(icon)
    icon.save(ICON)
    # 파티클용: 사진 그대로 45도 (날 = 왼쪽 아래, 자루 끝 = 오른쪽 위) → 내리찍어 박힌 모습이 사진과 같게
    w, h = axe.size
    small = axe.resize((TARGET_W, max(1, round(h * TARGET_W / w))), Image.LANCZOS)
    n = clean(small)
    # 연기 점: 픽셀마다 듬성듬성한 연기 뭉치(4종), 색은 사진 그대로
    import random
    rnd = random.Random(5)
    clumps = []
    for _ in range(4):
        m = []
        for j in range(CELL):
            for i in range(CELL):
                d = ((i - 3.5) ** 2 + (j - 3.5) ** 2) ** 0.5
                if rnd.random() < max(0.0, 1.0 - d * 0.2):
                    m.append((i, j))
        clumps.append(m)
    big = Image.new("RGBA", (small.size[0] * CELL, small.size[1] * CELL), (0, 0, 0, 0))
    bp, sp0 = big.load(), small.load()
    for y in range(small.size[1]):
        for x in range(small.size[0]):
            r, g, b, a = sp0[x, y]
            if not a:
                continue
            col = (r, g, b)  # 사진 색 그대로 (검정·흰 불꽃·금빛)
            for i, j in clumps[(x * 7 + y * 13) % 4]:
                bp[x * CELL + i, y * CELL + j] = col + (255,)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    big.save(OUT)
    # 선명한 점용: 같은 그림, 픽셀마다 꽉 찬 4x4 칸
    small.resize((small.size[0] * 4, small.size[1] * 4), Image.NEAREST).save(OUT.with_name("rpg_bh_art_solid.png"))
    bg = Image.new("RGBA", small.size, (90, 120, 80, 255))
    bg.alpha_composite(small)
    bg.resize((small.size[0] * 4, small.size[1] * 4), Image.NEAREST).save(ROOT / "docs" / "baekho_art_preview.png")
    # 쥐는 곳: 오른쪽 위 자루 끝에서 대각선으로 22% 들어간 곳에 가장 가까운 불투명 픽셀
    sp = small.load()
    W2, H2 = small.size
    tx, ty = W2 * 0.78, H2 * 0.22
    best = min(((x - tx) ** 2 + (y - ty) ** 2, x, y) for y in range(H2) for x in range(W2) if sp[x, y][3])
    gx, gy = best[1], best[2]
    meta = ROOT / "behavior_pack" / "scripts" / "bh_art_meta.js"
    meta.write_text(f"// gen_baekho_art.py 가 만듦: 도끼 점 그림 크기와 쥐는 곳\nexport const AXE_ART = {{ x0: 0, y0: 0, iw: {W2}, ih: {H2}, cx: {gx}, cy: {gy} }};\n")
    print(f"axe art {small.size} filled {n} grip=({gx},{gy})")


if __name__ == "__main__":
    main()
