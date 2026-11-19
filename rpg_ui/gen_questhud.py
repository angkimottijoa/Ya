"""퀘스트 HUD 그림 · 3D 길안내 화살표 (V12.153)
  textures/ui/rpg/quest/q_main · q_sub · q_daily · q_repeat · q_event · q_none (24x24 픽셀 그림, 메뉴 색: 남색 · 금 · 크림)
  rpg:nav_arrow 엔티티: 굵은 3D 화살표 (초록 몸 · 밝은 윗면 · 짙은 테두리), 둥실 · 반짝 애니메이션
"""
import json, math
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).parent; BP = ROOT / "behavior_pack"; RP = ROOT / "resource_pack"
QD = RP / "textures" / "ui" / "rpg" / "quest"; QD.mkdir(parents=True, exist_ok=True)
GOLD, GOLD_D, GOLD_L, CREAM, NAVY, INK = (214, 172, 82), (120, 90, 40), (246, 222, 150), (236, 229, 216), (30, 34, 54), (24, 20, 16)
def canvas(): return Image.new("RGBA", (24, 24), (0, 0, 0, 0))
def outline(im):
    o = im.copy(); p = im.load(); q = o.load()
    for y in range(24):
        for x in range(24):
            if p[x, y][3] == 0 and any(0 <= x + a < 24 and 0 <= y + b < 24 and p[x + a, y + b][3] for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))): q[x, y] = INK + (255,)
    return o
# 메인: 왕관 위 검
im = canvas(); d = ImageDraw.Draw(im)
d.polygon([(4, 10), (7, 5), (10, 9), (12, 3), (14, 9), (17, 5), (20, 10), (19, 14), (5, 14)], fill=GOLD); d.line([(5, 13), (19, 13)], fill=GOLD_D)
for x in (7, 12, 17): d.point((x, 6 if x != 12 else 4), fill=(220, 60, 60))
d.rectangle([11, 14, 13, 21], fill=(200, 205, 215)); d.line([(12, 14), (12, 20)], fill=(240, 240, 250)); d.rectangle([8, 15, 16, 16], fill=GOLD_D); d.rectangle([11, 21, 13, 22], fill=GOLD)
outline(im).save(QD / "q_main.png")
# 서브: 두루마리 + 봉인
im = canvas(); d = ImageDraw.Draw(im)
d.rectangle([5, 6, 18, 18], fill=CREAM); d.rectangle([4, 4, 19, 6], fill=(196, 170, 120)); d.rectangle([4, 18, 19, 20], fill=(196, 170, 120))
for y in (9, 11, 13): d.line([(7, y), (16, y)], fill=(150, 120, 80))
d.ellipse([12, 13, 18, 19], fill=(180, 40, 40)); d.point((14, 15), fill=(230, 120, 110))
outline(im).save(QD / "q_sub.png")
# 일일: 해
im = canvas(); d = ImageDraw.Draw(im)
for k in range(8):
    a = k * math.pi / 4; d.line([(12 + math.cos(a) * 6, 12 + math.sin(a) * 6), (12 + math.cos(a) * 10, 12 + math.sin(a) * 10)], fill=GOLD, width=2)
d.ellipse([7, 7, 17, 17], fill=GOLD_L); d.ellipse([9, 9, 15, 15], fill=(255, 236, 170))
outline(im).save(QD / "q_daily.png")
# 반복: 순환 화살표
im = canvas(); d = ImageDraw.Draw(im)
d.arc([4, 4, 20, 20], 200, 340, fill=(110, 200, 140), width=3); d.arc([4, 4, 20, 20], 20, 160, fill=(110, 200, 140), width=3)
d.polygon([(18, 4), (21, 9), (15, 9)], fill=(110, 200, 140)); d.polygon([(6, 20), (3, 15), (9, 15)], fill=(110, 200, 140))
outline(im).save(QD / "q_repeat.png")
# 이벤트: 불꽃
im = canvas(); d = ImageDraw.Draw(im)
d.polygon([(12, 2), (17, 9), (19, 15), (16, 21), (8, 21), (5, 15), (8, 10), (10, 13)], fill=(230, 90, 50)); d.polygon([(12, 9), (15, 15), (13, 20), (10, 20), (9, 16)], fill=(255, 200, 90))
outline(im).save(QD / "q_event.png")
# 없음: 빈 지도
im = canvas(); d = ImageDraw.Draw(im)
d.polygon([(4, 6), (9, 4), (15, 6), (20, 4), (20, 18), (15, 20), (9, 18), (4, 20)], fill=(200, 184, 150)); d.line([(9, 4), (9, 18)], fill=(160, 140, 110)); d.line([(15, 6), (15, 20)], fill=(160, 140, 110))
d.line([(6, 14), (8, 11), (11, 13), (13, 9)], fill=(170, 60, 60)); d.text((15, 8), "x", fill=(170, 60, 60))
outline(im).save(QD / "q_none.png")

# ───────── 3D 화살표 (앞 = -Z) ─────────
T = Image.new("RGBA", (16, 16), (0, 0, 0, 0)); tp = T.load()
for y in range(16):
    for x in range(16):
        tp[x, y] = ((150, 230, 90, 255) if y < 5 else (100, 196, 60, 255) if y < 10 else (52, 120, 34, 255))  # 윗면 밝음 · 옆 · 아래 짙음
        if x in (0, 15) or y in (0, 15): tp[x, y] = (28, 70, 22, 255)
T.save(RP / "textures" / "entity" / "rpg_nav_arrow.png") if (RP / "textures" / "entity").exists() else ((RP / "textures" / "entity").mkdir(parents=True), T.save(RP / "textures" / "entity" / "rpg_nav_arrow.png"))
def uv(face): return {"uv": [0, 0 if face == "up" else 5 if face in ("north", "south", "east", "west") else 10], "uv_size": [16, 5]}
def cube(o, s): return {"origin": o, "size": s, "uv": {f: uv(f) for f in ("north", "south", "east", "west", "up", "down")}}
cubes = [cube([-2, 0, 0], [4, 3, 9])]                                     # 몸통 (뒤)
for k, w in enumerate((12, 10, 8, 6, 4, 2)): cubes.append(cube([-w / 2, 0, -1 - k], [w, 3, 1]))  # 머리 (앞으로 좁아짐)
geo = {"format_version": "1.12.0", "minecraft:geometry": [{"description": {"identifier": "geometry.rpg_nav_arrow", "texture_width": 16, "texture_height": 16,
       "visible_bounds_width": 3, "visible_bounds_height": 2, "visible_bounds_offset": [0, 0.5, 0]},
       "bones": [{"name": "root", "pivot": [0, 0, 0]}, {"name": "arrow", "parent": "root", "pivot": [0, 1.5, 0], "cubes": cubes}]}]}
(RP / "models" / "entity" / "rpg_nav_arrow.geo.json").write_text(json.dumps(geo, indent=1))
anim = {"format_version": "1.10.0", "animations": {"animation.rpg_nav_arrow.idle": {"loop": True, "bones": {
    "arrow": {"position": [0, "math.sin(q.life_time * 240) * 1.2 + 1.5", "math.sin(q.life_time * 240 + 90) * -0.8"],
              "scale": "1 + math.sin(q.life_time * 480) * 0.04"}}}}}
(RP / "animations" / "rpg_nav_arrow.animation.json").write_text(json.dumps(anim, indent=1))
(RP / "entity" / "nav_arrow.entity.json").write_text(json.dumps({"format_version": "1.10.0", "minecraft:client_entity": {"description": {
    "identifier": "rpg:nav_arrow", "materials": {"default": "entity_alphatest"}, "textures": {"default": "textures/entity/rpg_nav_arrow"},
    "geometry": {"default": "geometry.rpg_nav_arrow"}, "animations": {"idle": "animation.rpg_nav_arrow.idle"}, "scripts": {"animate": ["idle"]},
    "render_controllers": ["controller.render.default"], "enable_attachables": False}}}, indent=1))
(BP / "entities" / "nav_arrow.json").write_text(json.dumps({"format_version": "1.21.40", "minecraft:entity": {
    "description": {"identifier": "rpg:nav_arrow", "is_spawnable": False, "is_summonable": True},
    "components": {"minecraft:type_family": {"family": ["inanimate", "rpg_fx"]}, "minecraft:health": {"value": 1, "max": 1},
                   "minecraft:collision_box": {"width": 0.01, "height": 0.01}, "minecraft:physics": {"has_gravity": False, "has_collision": False},
                   "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False}, "minecraft:knockback_resistance": {"value": 1},
                   "minecraft:damage_sensor": {"triggers": {"cause": "all", "deals_damage": "no"}}, "minecraft:fire_immune": {}}}}, indent=1))
print("quest hud art ok")
