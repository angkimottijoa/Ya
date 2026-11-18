# 강화 주문서 3종 아이콘 + 아이템 · 퀘스트 잠금 아이콘 (V12.134)
import json, os
from PIL import Image
OUT = "resource_pack/textures/items/rpg"
SCROLLS = [  # id, 이름, 보너스%, 리본/봉인 색 (어두움, 밝음)
    (1, "하급 강화 주문서", 5, (60, 140, 60), (130, 220, 120)),
    (2, "중급 강화 주문서", 10, (40, 90, 170), (110, 180, 255)),
    (3, "상급 강화 주문서", 20, (120, 50, 160), (220, 140, 255)),
]
PAPER = [(150, 115, 70), (205, 170, 115), (232, 208, 160), (246, 232, 196)]
OUTL = (50, 32, 18)

def scroll(dark, light):
    im = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    px = im.load()
    def put(x, y, c):
        if 0 <= x < 32 and 0 <= y < 32: px[x, y] = c + (255,) if len(c) == 3 else c
    # 대각선으로 놓인 두루마리: 왼쪽 위 → 오른쪽 아래, 축(u)·폭(v)
    import math
    ang = math.radians(-35)
    ca, sa = math.cos(ang), math.sin(ang)
    for y in range(32):
        for x in range(32):
            dx, dy = x - 15.5, y - 15.5
            u = dx * ca - dy * sa  # 길이 방향
            v = dx * sa + dy * ca  # 폭 방향
            if abs(u) <= 12.5 and abs(v) <= 6.5:
                # 양 끝 말린 부분
                if abs(u) >= 10:
                    t = (abs(v) / 6.5)
                    c = PAPER[1] if t > 0.6 else PAPER[2]
                    if abs(u) >= 11.8: c = PAPER[0]
                else:
                    c = PAPER[3] if v < -2 else PAPER[2]
                    if v > 4.5: c = PAPER[1]
                    # 글자 줄
                    if -4 <= v <= 2 and abs(u) < 8 and int(round(v)) % 2 == 0 and (int(u * 1.7) % 5) != 0:
                        c = (150, 110, 70)
                put(x, y, c)
    # 외곽선
    src = im.copy(); sp = src.load()
    for y in range(32):
        for x in range(32):
            if sp[x, y][3] == 0 and any(0 <= x + a < 32 and 0 <= y + b < 32 and sp[x + a, y + b][3] for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = OUTL + (255,)
    # 리본 (가운데를 가로지름) + 봉인
    for y in range(32):
        for x in range(32):
            dx, dy = x - 15.5, y - 15.5
            u = dx * ca - dy * sa
            if abs(u) <= 1.2 and sp[x, y][3]:
                px[x, y] = (dark if u > 0.3 else light) + (255,)
    cx, cy = 18, 19
    for y in range(32):
        for x in range(32):
            r = math.hypot(x - cx, y - cy)
            if r <= 3.6: px[x, y] = (light if (x - cx) + (y - cy) < -1 else dark) + (255,)
            elif r <= 4.4: px[x, y] = tuple(int(c * 0.55) for c in dark) + (255,)
    px[cx - 1, cy - 1] = (255, 255, 255, 255)
    return im

for n, name, bonus, dark, light in SCROLLS:
    scroll(dark, light).save(f"{OUT}/enh_scroll_{n}.png")
    item = {"format_version": "1.21.40", "minecraft:item": {
        "description": {"identifier": f"rpg:enh_scroll_{n}", "menu_category": {"category": "items"}},
        "components": {"minecraft:icon": f"rpg_enh_scroll_{n}",
                       "minecraft:display_name": {"value": f"§l{name}§r §7[강화 확률 +{bonus}%]"},
                       "minecraft:max_stack_size": 64, "minecraft:glint": n == 3}}}
    json.dump(item, open(f"behavior_pack/items/enh_scroll_{n}.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)

tp = "resource_pack/textures/item_texture.json"
t = json.load(open(tp, encoding="utf-8"))
for n, *_ in SCROLLS:
    t["texture_data"][f"rpg_enh_scroll_{n}"] = {"textures": f"textures/items/rpg/enh_scroll_{n}"}
json.dump(t, open(tp, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

# 잠금 아이콘 12x12 (UI)
L = Image.new("RGBA", (12, 12), (0, 0, 0, 0)); q = L.load()
G, D, K = (200, 200, 210, 255), (120, 120, 135, 255), (40, 40, 50, 255)
for x in range(3, 9):
    for y in range(1, 6):
        if (x in (3, 4, 7, 8) and y >= 2) or (y in (1,) and 4 <= x <= 7) or (y == 2 and x in (4, 7)):
            q[x, y] = D if x in (3, 7) else G
for x in range(2, 10):
    for y in range(5, 11):
        q[x, y] = K if x in (2, 9) or y in (5, 10) else (G if y <= 7 else D)
q[5, 7] = q[6, 7] = K; q[5, 8] = q[6, 8] = K
L.save("resource_pack/textures/ui/rpg/icons/lock.png")
print("ok")
