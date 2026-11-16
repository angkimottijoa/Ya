// HUD 갱신: title = "quest:<퀘스트창>", subtitle = "[CARD]<캐릭터 카드>"
// 리소스팩이 quest: 로 시작하는 title 을 화면 중앙에선 숨기고 HUD 패널에 표시한다.
// 알림은 액션바(player.notify)로만 보낸다.
import { data, xpNeed, MAX_LV, byId } from "./player.js";
import { CLASSES } from "./classes.js";
import { getQuest, objLine } from "./quests.js";
import { partyOf, memberIds } from "./party.js";
import { skillReadyIn } from "./combat.js";
import { unreadCount } from "./chat.js";
import { rt } from "./ui.js";

const last = new Map();

function bar(cur, max, len = 18) {
  const n = max > 0 ? Math.round((cur / max) * len) : len;
  return "§a" + "|".repeat(n) + "§8" + "|".repeat(len - n);
}

export function card(p) {
  const d = data(p);
  if (!d.set.card) return "[CARD]";
  const c = CLASSES[d.cls] ?? CLASSES.novice;
  const need = xpNeed(d.lv);
  const cd = skillReadyIn(p);
  const unread = unreadCount(p);
  const lines = [
    `§l§f${p.name}§r  §e§lLv.${d.lv}§r ${c.color}§l${c.name}`,
    d.lv >= MAX_LV ? "§6§lMAX LEVEL" : `${bar(d.xp, need)} §r§f${Math.floor((d.xp / need) * 100)}%`,
    `§6§lG§r §f§l${d.gold}§r   ${cd > 0 ? `§7스킬 §f${Math.ceil(cd)}s` : "§b§l스킬 준비"}${d.pts ? `   §e§l+${d.pts}P` : ""}${unread ? `   §d§l✉${unread}` : ""}`,
  ];
  const party = partyOf(p.id);
  if (party) {
    lines.push(`§d§l${party.name}`);
    for (const id of memberIds(party)) {
      if (id === p.id) continue;
      const m = byId(id);
      const hp = m?.getComponent("minecraft:health");
      lines.push(m ? `§f ${m.name} §c§l${Math.ceil(hp?.currentValue ?? 0)}♥` : `§7 ${party.names[id] ?? "?"} (오프라인)`);
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
    parts.push(`§e§l${q.title}§r`);
    q.obj.forEach((_, i) => parts.push("\n", objLine(p, q, i)));
  }
  return rt("quest:", ...parts);
}

export function update(p) {
  const qt = questText(p);
  const cd = card(p);
  const key = JSON.stringify(qt) + cd;
  if (last.get(p.id) === key) return;
  last.set(p.id, key);
  p.onScreenDisplay.setTitle(qt, { subtitle: cd, fadeInDuration: 0, stayDuration: 2, fadeOutDuration: 0 });
}

export function resetHud(p) {
  last.delete(p.id);
}
