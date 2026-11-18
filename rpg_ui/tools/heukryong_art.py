# 흑룡의 검 아이콘 (V12.147): 사용자 그림 art/heukryong_sword_ref.png (흰 바탕, 칼끝 왼쪽 아래) → 32x32 아이콘 (칼끝 오른쪽 위)
#   3D 모델은 gen_weapons3d.py 가 같은 그림으로 만듦
from PIL import Image
src = Image.open("art/heukryong_sword_clean.png").convert("RGBA")
px = src.load()
for y in range(src.height):
    for x in range(src.width):
        r, g, b, a = px[x, y]
        if min(r, g, b) > 200: px[x, y] = (0, 0, 0, 0)  # 흰 바탕 · 옅은 보랏빛 번짐 제거
src = src.crop(src.getbbox()).rotate(180)
src = src.crop(src.getbbox())
k = 31 / max(src.size)
ic = src.resize((max(1, round(src.width * k)), max(1, round(src.height * k))), Image.LANCZOS)
q = ic.load()
for y in range(ic.height):
    for x in range(ic.width):
        r, g, b, a = q[x, y]
        # 작게 줄이면 탁해져서 조금 밝고 진하게
        q[x, y] = (min(255, int(r * 1.15)), min(255, int(g * 1.05)), min(255, int(b * 1.25)), 255) if a > 100 else (0, 0, 0, 0)
icon = Image.new("RGBA", (32, 32), (0, 0, 0, 0)); icon.paste(ic, ((32 - ic.width) // 2, (32 - ic.height) // 2), ic)
o = icon.copy(); op = o.load(); ip = icon.load()
for y in range(32):
    for x in range(32):
        if ip[x, y][3] == 0 and any(0 <= x + dx < 32 and 0 <= y + dy < 32 and ip[x + dx, y + dy][3] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            op[x, y] = (14, 8, 20, 255)
o.save("resource_pack/textures/items/rpg/heukryong_sword.png")
print("icon ok")
