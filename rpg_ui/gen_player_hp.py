"""플레이어 최대 체력 (V12.119): 바닐라 player.json(1.26.60 샘플)에 최대 체력 단계를 넣음
   2%씩 커지는 단계 (100 → 10만, 약 350개) · rpg:hp_clear 로 모두 지우고 rpg:hp_K 로 하나를 붙임
   스크립트(combat.js)가 레벨 · 스탯으로 계산한 최대 체력과 가장 가까운 단계를 고름 (hp_steps.js)"""
import json
from pathlib import Path
ROOT = Path(__file__).parent
steps, v = [], 100.0
while v <= 100000:
    r = int(round(v / 10) * 10)
    if not steps or r != steps[-1]: steps.append(r)
    v *= 1.02
if steps[-1] != 100000: steps.append(100000)
d = json.loads((ROOT / "art" / "vanilla_player_bp.json").read_text())
e = d["minecraft:entity"]
groups = {k: v for k, v in e.get("component_groups", {}).items() if not k.startswith("rpg:hp_")}
events = {k: v for k, v in e.get("events", {}).items() if not k.startswith("rpg:hp_")}
names = [f"rpg:hp_{k}" for k in range(len(steps))]
for g, hp in zip(names, steps):
    groups[g] = {"minecraft:health": {"value": hp, "max": hp}}
    events[g] = {"add": {"component_groups": [g]}}
events["rpg:hp_clear"] = {"remove": {"component_groups": names}}
e["component_groups"], e["events"] = groups, events
(ROOT / "behavior_pack" / "entities" / "player.json").write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
(ROOT / "behavior_pack" / "scripts" / "hp_steps.js").write_text("// gen_player_hp.py 가 만듦: 최대 체력 단계 (rpg:hp_K)\nexport const HP_STEPS = " + json.dumps(steps) + ";\n")
print("hp steps:", len(steps), steps[:3], steps[-3:])
