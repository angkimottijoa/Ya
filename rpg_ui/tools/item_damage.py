# 이 애드온 무기 · 직업 도구의 공격력 표 (V12.141)
#   아이템 JSON 의 minecraft:damage 는 툴팁에 「+N 공격 피해」 줄을 만들어서 지우고, 스크립트(combat.js)가 이 표로 평타 피해를 줌
#   gen_*.py 를 다시 돌린 뒤엔 이 파일도 다시 돌릴 것 (표 갱신 + damage 제거)
import json, glob
# 사신수 · 사흉수: 직업 도구(최대 240)보다 확실히 세게 (주작은 활 — 근접 평타는 절반)
OVERRIDE = {"rpg:cheongryong_sword": 300, "rpg:baekho_axe": 300, "rpg:heukryong_sword": 360, "rpg:hyeonmu_shield": 260, "rpg:jujak_bow": 150,
            "rpg:hundun_scythe": 280, "rpg:qiongqi_claws": 270, "rpg:taowu_hammer": 300, "rpg:taotie_maw": 260}
table = {}
try:
    for line in open("behavior_pack/scripts/item_atk.js", encoding="utf-8"):
        if line.startswith('  "rpg:'): k, v = line.strip().rstrip(",").split(": "); table[json.loads(k)] = int(v)
except FileNotFoundError: pass
for f in sorted(glob.glob("behavior_pack/items/*.json")):
    d = json.load(open(f, encoding="utf-8")); it = d["minecraft:item"]; c = it["components"]
    if "minecraft:damage" in c:
        table[it["description"]["identifier"]] = c.pop("minecraft:damage")
        json.dump(d, open(f, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
table.update(OVERRIDE)
with open("behavior_pack/scripts/item_atk.js", "w", encoding="utf-8") as o:
    o.write("// 이 애드온 무기 · 직업 도구 공격력 (tools/item_damage.py 가 만듦) — 근접 평타 피해 · 설명 · 강화 화면이 같이 씀\nexport const ITEM_ATK = {\n")
    for k in sorted(table): o.write(f'  "{k}": {table[k]},\n')
    o.write("};\n")
print(len(table), "items")
