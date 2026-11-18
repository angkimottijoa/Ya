"""직업 전용 도구 (V2.7): 아이템 JSON + 16x16 픽셀 아이콘 생성
도구 데이터는 behavior_pack/scripts/jobs.js 의 PATHS[*].tool 과 같아야 한다.
"""
import json, re
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).parent
BP_ITEMS = ROOT / "behavior_pack" / "items"
ICONS = ROOT / "resource_pack" / "textures" / "items" / "rpg"
ATLAS = ROOT / "resource_pack" / "textures" / "item_texture.json"

# jobs.js 에서 도구 목록 읽기
src = (ROOT / "behavior_pack" / "scripts" / "jobs.js").read_text()
TOOLS = re.findall(r'\n  (\w+): \{ tool: \{ name: "([^"]+)", shape: "(\w+)", dmg: (\d+) \}, name: "([^"]+)", tier: (\d)', src)
BASE = dict(re.findall(r'\n  (\w+): \{ tool: .*?base: "(\w+)"', src))

# 계열 색: (주 금속, 밝은 금속, 손잡이, 보석)
PAL = {
    "warrior": ((176, 184, 196), (236, 240, 248), (96, 58, 32), (220, 50, 50)),
    "archer": ((120, 84, 44), (176, 132, 80), (70, 46, 24), (90, 210, 90)),
    "mage": ((70, 60, 120), (150, 130, 230), (60, 40, 30), (90, 200, 255)),
    "cleric": ((214, 178, 70), (255, 236, 150), (120, 90, 50), (255, 250, 220)),
    "hidden": ((70, 40, 96), (190, 150, 255), (34, 22, 40), (90, 255, 200)),
}
TIER_GEM = {1: None, 2: (170, 90, 255), 3: (255, 200, 40)}
STRING = (235, 235, 220)
OUT = (24, 20, 28)


def line(d, pts, c, w=1):
    d.line(pts, fill=c, width=w)


def draw(shape, pal, tier):
    m, hi, grip, gem = pal
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    tg = TIER_GEM[tier] or gem
    if shape in ("sword", "greatsword"):
        top = 1 if shape == "greatsword" else 2
        # 칼날 (대각선, 아래 왼쪽 → 위 오른쪽)
        line(d, [(4, 11), (14 - (top - 1), top)], m, 2 if shape == "greatsword" else 1)
        line(d, [(5, 11), (14, top + 1)], hi)
        line(d, [(4, 10), (13, top)], hi)
        # 코등이
        line(d, [(2, 9), (6, 13)], tg if tier > 1 else (110, 110, 120), 1)
        line(d, [(3, 9), (6, 12)], OUT)
        # 손잡이 + 끝
        line(d, [(1, 14), (4, 11)], grip, 1)
        d.point((1, 15), fill=tg)
        d.point((0, 15), fill=tg)
    elif shape in ("axe", "hammer", "mace"):
        line(d, [(2, 14), (11, 5)], grip, 1)
        line(d, [(3, 14), (11, 6)], (grip[0] - 20, grip[1] - 15, grip[2] - 10))
        if shape == "axe":
            d.polygon([(9, 1), (14, 3), (15, 8), (12, 8), (10, 5)], fill=m, outline=OUT)
            line(d, [(14, 3), (15, 8)], hi)
        elif shape == "hammer":
            d.polygon([(8, 3), (12, 0), (15, 4), (12, 8)], fill=m, outline=OUT)
            line(d, [(12, 1), (14, 4)], hi)
        else:  # mace
            d.ellipse([9, 1, 15, 7], fill=m, outline=OUT)
            for x, y in [(12, 0), (15, 4), (9, 4), (12, 7)]:
                d.point((x, y), fill=hi)
        d.point((12, 4), fill=tg)
    elif shape in ("bow", "longbow"):
        r = 13 if shape == "longbow" else 11
        d.arc([2 - (r - 11), 2 - (r - 11), 2 + r, 2 + r], 270, 360 + 90 - 90, fill=m)
        d.arc([1, 1, 15, 15], 180 + 90, 360, fill=m) if False else None
        # 활대
        pts = [(3, 1), (7, 2), (11, 5), (13, 9), (14, 13)]
        line(d, pts, m, 2 if shape == "longbow" else 1)
        line(d, [(4, 1), (8, 3), (11, 6)], hi)
        line(d, [(3, 1), (14, 13)], STRING)  # 시위
        d.point((9, 4), fill=tg)
        d.point((12, 10), fill=tg)
        im2 = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        im2.paste(im)
        im = im2
    elif shape == "crossbow":
        line(d, [(3, 13), (12, 4)], grip, 2)
        line(d, [(6, 3), (2, 7)], m, 1)
        line(d, [(6, 3), (13, 10)], m, 1)
        line(d, [(2, 7), (9, 14)], m, 1)
        line(d, [(13, 10), (9, 14)], STRING)
        line(d, [(7, 9), (14, 2)], hi)
        d.point((14, 1), fill=tg)
    elif shape in ("spear", "trident"):
        line(d, [(1, 15), (11, 5)], grip, 1)
        if shape == "spear":
            d.polygon([(10, 4), (15, 0), (12, 6)], fill=hi, outline=m)
        else:
            line(d, [(11, 5), (15, 1)], m)
            line(d, [(9, 4), (12, 1)], m)
            line(d, [(12, 7), (15, 4)], m)
            line(d, [(9, 4), (12, 7)], hi)
        d.point((10, 6), fill=tg)
    elif shape == "scythe":  # 낫: 긴 자루 + 위에서 왼쪽으로 크게 휜 날 + 영혼빛 보석
        line(d, [(3, 15), (11, 2)], grip, 1)
        line(d, [(4, 15), (12, 2)], (grip[0] + 25, grip[1] + 20, grip[2] + 30))
        d.arc([1, 0, 15, 10], 190, 290, fill=m, width=2)
        d.arc([2, 1, 14, 9], 200, 280, fill=hi, width=1)
        d.point((11, 3), fill=gem); d.point((12, 3), fill=gem)
        d.point((3, 15), fill=gem)
    else:  # staff / orbstaff / scepter
        line(d, [(2, 15), (11, 6)], grip, 1)
        line(d, [(3, 15), (11, 7)], (grip[0] + 20, grip[1] + 15, grip[2] + 10))
        if shape == "staff":
            d.arc([9, 1, 15, 7], 180, 90, fill=m)
            d.point((12, 4), fill=gem)
        elif shape == "orbstaff":
            line(d, [(10, 6), (9, 3)], m)
            line(d, [(10, 6), (13, 7)], m)
            d.ellipse([10, 1, 15, 6], fill=gem, outline=OUT)
            d.point((12, 2), fill=(255, 255, 255))
        else:  # scepter
            d.polygon([(12, 0), (15, 3), (12, 6), (9, 3)], fill=hi, outline=m)
            d.point((12, 3), fill=tg)
            line(d, [(9, 7), (12, 10)], m)
    # 3차는 아이템 자체에 인챈트 광택(glint)을 켠다
    return im


def art_icon(path, n=32):
    src = Image.open(path).convert("RGBA")
    k = (n - 2) / max(src.size)
    sm = src.resize((max(1, round(src.width * k)), max(1, round(src.height * k))), Image.LANCZOS)
    px = sm.load()
    for y in range(sm.height):
        for x in range(sm.width):
            r, g, b, a = px[x, y]; px[x, y] = (r, g, b, 255) if a > 90 else (0, 0, 0, 0)
    out = Image.new("RGBA", (n, n), (0, 0, 0, 0)); out.paste(sm, ((n - sm.width) // 2, (n - sm.height) // 2))
    if path.name in ("t1_archer.png", "t2_hunter.png"):  # 작게 줄이면 사라지는 활시위: 왼쪽 끝 ↔ 위쪽 끝
        p = out.load(); pts = [(x, y) for y in range(n) for x in range(n) if p[x, y][3]]
        a = min(pts); b = min(pts, key=lambda q: q[1])
        ImageDraw.Draw(out).line([a, b], fill=(222, 206, 160, 255))
        for q in pts: p[q] = out.getpixel(q)
    return out


def main():
    atlas = json.loads(ATLAS.read_text())
    ICONS.mkdir(parents=True, exist_ok=True)
    for path, name, shape, dmg, job, tier in TOOLS:
        tier = int(tier)
        base = BASE.get(path, path)
        icon = f"rpg_jt_{path}"
        art = ROOT / "art" / f"t{tier}_{path}.png"  # 그림이 있으면 그 그림을 32x32 아이콘으로 (V12.91: 1차, V12.92: 2차)
        if art.exists(): art_icon(art).save(ICONS / f"jt_{path}.png")
        else: draw(shape, PAL[base], tier).save(ICONS / f"jt_{path}.png")
        atlas["texture_data"][icon] = {"textures": f"textures/items/rpg/jt_{path}"}
        color = {"warrior": "§c", "archer": "§a", "mage": "§b", "cleric": "§e", "hidden": "§5"}[base]
        item = {
            "format_version": "1.21.40",
            "minecraft:item": {
                "description": {"identifier": f"rpg:jt_{path}", "menu_category": {"category": "equipment", "group": "itemGroup.name.sword"}},
                "components": {
                    "minecraft:icon": icon,
                    "minecraft:display_name": {"value": f"{color}{name} §7[{['', '1차', '2차', '3차'][tier]} {job} 전용]"},
                    "minecraft:max_stack_size": 1,
                    "minecraft:hand_equipped": True,
                    "minecraft:damage": int(dmg),
                    "minecraft:enchantable": {"slot": "sword", "value": 10 + tier * 4},
                    "minecraft:glint": tier == 3,
                    "minecraft:can_destroy_in_creative": False,
                    "minecraft:use_modifiers": {"use_duration": 0.05, "movement_modifier": 1.0},
                },
            },
        }
        (BP_ITEMS / f"jt_{path}.json").write_text(json.dumps(item, ensure_ascii=False, indent=2))
    ATLAS.write_text(json.dumps(atlas, ensure_ascii=False, indent=2))
    print("tools:", len(TOOLS))


if __name__ == "__main__":
    main()
