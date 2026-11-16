// HUD 갱신
//   title    = "quest:<길 안내 + 퀘스트창>"
//   subtitle = "[CARD]<정보 카드>" 와 "[BAR]<하단 상태바>" 를 번갈아 보냄 (리소스팩이 접두어로 구분해 보존)
// 리소스팩이 quest: 로 시작하는 title/subtitle 을 화면 중앙에선 숨긴다. 알림은 액션바(player.notify).
import { data, xpNeed, MAX_LV, byId, stat, maxMp } from "./player.js";
import { CLASSES } from "./classes.js";
import { getQuest, objLine, priority, navTarget, navText, qtype } from "./quests.js";
import { partyOf, memberIds } from "./party.js";
import { combatStats } from "./combat.js";
import { currentSkillInfo } from "./skills.js";
import { unreadCount } from "./chat.js";
import { rt } from "./ui.js";
import { manualTarget } from "./waypoints.js";

const sent = new Map(); // pid -> { q, card, bar, flip }

function bar(cur, max, len, on, off = "§8") {
  const n = max > 0 ? Math.max(0, Math.min(len, Math.round((cur / max) * len))) : 0;
  return on + "|".repeat(n) + off + "|".repeat(len - n);
}

export function card(p) {
  const d = data(p);
  if (!d.set.card) return "[CARD]";
  const c = CLASSES[d.cls] ?? CLASSES.novice;
  const { skill, left, sub, left2 } = currentSkillInfo(p);
  const sk = (s, l, key) => (s ? (l > 0 ? `§7${key} ${s.name} §f${Math.ceil(l)}s` : `§b${key} §l${s.name}`) : "");
  const unread = unreadCount(p);
  const s = combatStats(p);
  const lines = [
    `§l§f${p.name}§r  §e§lLv.${d.lv}§r ${c.color}§l${c.name}`,
    `§6§lG§r §f§l${d.gold}§r${d.pts ? `  §e§l+${d.pts}P` : ""}${unread ? `  §d§l✉${unread}` : ""}`,
    [sk(skill, left, "스킬"), sk(sub, left2, "⇧")].filter(Boolean).join("§r  "),
    `§7힘 §f${stat(p, "str")} §7민첩 §f${stat(p, "dex")} §7지능 §f${stat(p, "int")} §7체력 §f${stat(p, "vit")}`,
    `§7공격 §f+${s.atk}% §7치명 §f${s.crit}% §7방어 §f${s.def}%`,
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

export function statusBar(p) {
  const d = data(p);
  if (d.set.status === false) return "[BAR]";
  const hpc = p.getComponent("minecraft:health");
  const hp = Math.ceil(hpc?.currentValue ?? 0);
  const hpMax = Math.round(hpc?.effectiveMax ?? 20);
  const mpMax = maxMp(p);
  const mp = Math.floor(d.mp ?? mpMax);
  const need = xpNeed(d.lv);
  const pct = d.lv >= MAX_LV ? 100 : Math.floor((d.xp / need) * 100);
  const s = combatStats(p);
  const armor = (() => {
    try {
      return Math.round(p.getComponent("minecraft:equippable") ? combatStats(p).def : 0);
    } catch {
      return 0;
    }
  })();
  return "[BAR]" +
    `§c§lHP ${bar(hp, hpMax, 70, "§c")} §r§f§l${hp}§r§7/${hpMax}\n` +
    `§9§lMP ${bar(mp, mpMax, 70, "§9")} §r§f§l${mp}§r§7/${mpMax}\n` +
    `§e§lLv.${d.lv} ${bar(pct, 100, 66, "§a")} §r§f§l${pct}%`;
}

export function questText(p) {
  const d = data(p);
  if (!d.set.quest) return rt("quest:");
  if (d.customQuestText) return rt("quest:", d.customQuestText);
  const parts = [];
  const man = d.set.nav !== false ? manualTarget(p) : null;
  if (man) parts.push("§d§l[길찾기] §r", navText(p, man), "\n");
  const list = priority(p).filter((id) => !d.q.hide?.[id]).slice(0, 3);
  list.forEach((id, n) => {
    const q = getQuest(id);
    if (n === 0 && d.set.nav !== false && !man) {
      const nav = navText(p, navTarget(p, q));
      if (nav) parts.push(nav, "\n");
    }
    if (n) parts.push("\n");
    const t = qtype(q);
    parts.push(`${n === 0 ? "§e§l▶ " : "§7"}${t.color}[${t.name}] §r${n === 0 ? "§f§l" : "§f"}${q.title}§r`);
    q.obj.forEach((_, i) => parts.push("\n", objLine(p, q, i)));
  });
  return rt("quest:", ...parts);
}

/** 4틱마다 호출: 바뀐 것만, 카드/상태바는 번갈아 전송 */
export function update(p) {
  const st = sent.get(p.id) ?? { flip: false };
  const q = JSON.stringify(questText(p));
  const cd = card(p);
  const br = statusBar(p);
  const qObj = JSON.parse(q);
  st.flip = !st.flip;
  let sub = null;
  if (st.flip && cd !== st.card) sub = "card";
  else if (!st.flip && br !== st.bar) sub = "bar";
  else if (cd !== st.card) sub = "card";
  else if (br !== st.bar) sub = "bar";
  if (!sub && q === st.q) return sent.set(p.id, st);
  const subtitle = sub === "bar" ? br : cd;
  p.onScreenDisplay.setTitle(qObj, { subtitle, fadeInDuration: 0, stayDuration: 2, fadeOutDuration: 0 });
  st.q = q;
  if (sub === "bar") st.bar = br;
  else st.card = cd;
  sent.set(p.id, st);
}

export function resetHud(p) {
  sent.delete(p.id);
}

/** 길 안내 파티클 (1초마다) – 목표 방향으로 점선 */
export function navParticles(p) {
  const d = data(p);
  if (d.set.nav === false || d.set.navFx === false) return;
  const id = priority(p).find((x) => !d.q.hide?.[x]);
  const t = manualTarget(p) ?? (id ? navTarget(p, getQuest(id)) : null);
  if (!t || t.dim !== p.dimension.id) return;
  const dx = t.x - p.location.x, dy = t.y - p.location.y, dz = t.z - p.location.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 4) return;
  for (let i = 1.5; i < Math.min(9, dist); i += 1.5) {
    const k = i / dist;
    const pos = { x: p.location.x + dx * k, y: p.location.y + 0.3 + Math.min(2, Math.max(-2, dy * k)), z: p.location.z + dz * k };
    try {
      p.spawnParticle ? p.spawnParticle("minecraft:villager_happy", pos) : p.dimension.spawnParticle("minecraft:villager_happy", pos);
    } catch {}
  }
}
