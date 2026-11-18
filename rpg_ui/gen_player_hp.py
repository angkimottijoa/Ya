"""플레이어 최대 체력 (V12.115): 바닐라 player.json(1.26.60 샘플)에 최대 체력 단계를 넣음
   rpg:hp_K (K = 1..100) → 최대 체력 K × 100 (최대 1만). 스크립트(combat.js)가 레벨 · 체력 스탯에 맞는 단계를 고름
   (바닐라 '체력 강화' 효과는 최대 약 1000 까지라 대신 씀 · 효과 아이콘도 사라짐)"""
import json
from pathlib import Path
ROOT = Path(__file__).parent
STEP, N = 100, 100
d = json.loads((ROOT / "art" / "vanilla_player_bp.json").read_text())
e = d["minecraft:entity"]
groups = e.setdefault("component_groups", {})
events = e.setdefault("events", {})
names = [f"rpg:hp_{k}" for k in range(1, N + 1)]
for k, g in enumerate(names, 1):
    groups[g] = {"minecraft:health": {"value": k * STEP, "max": k * STEP}}
for k, g in enumerate(names, 1):
    events[g] = {"add": {"component_groups": [g]}, "remove": {"component_groups": [x for x in names if x != g]}}
out = ROOT / "behavior_pack" / "entities" / "player.json"
out.write_text(json.dumps(d, ensure_ascii=False, indent=1))
print("player.json:", len(names), "hp steps")
