// HUD 갱신: 캐릭터 카드(액션바 [CARD]) + 퀘스트창(title quest:)
import { data, xpNeed, MAX_LV, byId } from "./player.js";
import { CLASSES } from "./classes.js";
import { getQuest, objLine } from "./quests.js";
import { partyOf, memberIds } from "./party.js";
import { skillReadyIn } from "./combat.js";
import { rt } from "./ui.js";

const lastQuest = new Map();

function bar(cur, max, len = 20) {
  const n = max > 0 ? Math.round((cur / max) * len) : len;
  return "§a" + "|".repeat(n) + "§8" + "|".repeat(len - n);
}

export function card(p) {
  const d = data(p);
  const c = CLASSES[d.cls] ?? CLASSES.novice;
  const need = xpNeed(d.lv);
  const cd = skillReadyIn(p);
  const lines = [
    `§l${p.name}§r  §7Lv.§f${d.lv} ${c.color}${c.name}`,
    d.lv >= MAX_LV ? "§6MAX LEVEL" : `${bar(d.xp, need)} §7${Math.floor((d.xp / need) * 100)}%`,
    `§6G §f${d.gold}   ${cd > 0 ? `§7스킬 ${Math.ceil(cd)}s` : `§b스킬 준비`}${d.pts ? `   §e+${d.pts}P` : ""}`,
  ];
  const party = partyOf(p.id);
  if (party) {
    lines.push(`§d[${party.name}]`);
    for (const id of memberIds(party)) {
      if (id === p.id) continue;
      const m = byId(id);
      const hp = m?.getComponent("minecraft:health");
      lines.push(m ? `§7 ${m.name} §c${Math.ceil(hp?.currentValue ?? 0)}♥` : `§8 ${party.names[id] ?? "?"} (오프라인)`);
    }
  }
  return "[CARD]" + lines.join("\n");
}

export function questText(p) {
  const d = data(p);
  if (!d.set.quest) return rt("quest:");
  if (d.customQuestText) return rt("quest:", d.customQuestText);
  const parts = [];
  for (const id of d.q.track) {
    const q = getQuest(id);
    if (!q || !d.q.a[id]) continue;
    if (parts.length) parts.push("\n");
    parts.push(`§e${q.title}`);
    q.obj.forEach((_, i) => parts.push("\n", objLine(p, q, i)));
  }
  return rt("quest:", ...parts);
}

export function update(p) {
  const d = data(p);
  if (d.set.card) p.onScreenDisplay.setActionBar(card(p));
  else p.onScreenDisplay.setActionBar("[CARD]");
  const qt = questText(p);
  const key = JSON.stringify(qt);
  if (lastQuest.get(p.id) !== key) {
    lastQuest.set(p.id, key);
    p.onScreenDisplay.setTitle(qt, { fadeInDuration: 0, stayDuration: 1, fadeOutDuration: 0 });
  }
}

export function resetHud(p) {
  lastQuest.delete(p.id);
}
