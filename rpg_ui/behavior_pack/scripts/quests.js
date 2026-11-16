// 퀘스트 엔진: 정의 저장(월드), 진행(플레이어), 목표 판정, 보상
import { world } from "@minecraft/server";
import { getJSON, setJSON } from "./db.js";
import { data, save, addXp, addGold, msg } from "./player.js";
import { CLASSES } from "./classes.js";
import { itemName, entityName, countItem, removeItem, giveItem } from "./itemdb.js";
import { rt } from "./ui.js";

export const OBJ_TYPES = [
  { id: "kill", name: "처치" },
  { id: "collect", name: "수집" },
  { id: "visit", name: "방문" },
  { id: "talk", name: "대화" },
];

export const MAX_ACTIVE = 5;

// ───────── 정의 저장 ─────────
let defs = null;

function load() {
  if (defs) return defs;
  defs = new Map();
  for (const id of getJSON(world, "rpg:qidx", [])) {
    const q = getJSON(world, `rpg:q:${id}`, null);
    if (q) defs.set(id, q);
  }
  if (!defs.size && !world.getDynamicProperty("rpg:seeded")) {
    world.setDynamicProperty("rpg:seeded", true);
    seedDemo();
  }
  return defs;
}

export function allQuests() {
  return [...load().values()];
}

export function getQuest(id) {
  return load().get(id);
}

export function saveQuest(q) {
  load().set(q.id, q);
  setJSON(world, `rpg:q:${q.id}`, q);
  setJSON(world, "rpg:qidx", [...defs.keys()]);
}

export function deleteQuest(id) {
  load().delete(id);
  world.setDynamicProperty(`rpg:q:${id}`, undefined);
  setJSON(world, "rpg:qidx", [...defs.keys()]);
}

export function newQuestId(base = "quest") {
  load();
  let i = defs.size + 1;
  while (defs.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function blankQuest(id) {
  return {
    id, title: "새 퀘스트", desc: "", giver: "board", minLv: 1, cls: "", prereq: "",
    repeat: false, enabled: true, turnIn: "auto", obj: [], rw: { xp: 50, gold: 20, items: [] },
  };
}

function seedDemo() {
  const demo = [
    {
      ...blankQuest("main_1"), title: "마을의 위기", giver: "board",
      desc: "밤마다 마을을 습격하는 언데드를 처치해 달라는 의뢰가 게시판에 붙어 있다.",
      obj: [{ t: "kill", id: "minecraft:zombie", n: 5 }, { t: "kill", id: "minecraft:skeleton", n: 3 }],
      rw: { xp: 120, gold: 60, items: [{ id: "minecraft:iron_sword", n: 1 }] },
    },
    {
      ...blankQuest("sub_bread"), title: "제빵사의 부탁", giver: "board",
      desc: "밀이 부족하다며 제빵사가 도움을 청했다. 밀을 모아 오자.",
      obj: [{ t: "collect", id: "minecraft:wheat", n: 16 }],
      rw: { xp: 60, gold: 40, items: [{ id: "minecraft:bread", n: 8 }] }, repeat: true,
    },
    {
      ...blankQuest("main_2"), title: "어둠 속의 거미", giver: "board", prereq: "main_1", minLv: 3,
      desc: "숲 속 거미 떼가 늘고 있다. 거미를 처치하고 거미줄을 가져오자.",
      obj: [{ t: "kill", id: "minecraft:spider", n: 6 }, { t: "collect", id: "minecraft:string", n: 4 }],
      rw: { xp: 250, gold: 120, items: [] },
    },
  ];
  for (const q of demo) saveQuest(q);
}

// ───────── 판정 ─────────
export function objTarget(o) {
  if (o.label) return { text: o.label };
  if (o.t === "kill") return entityName(o.id);
  if (o.t === "collect") return itemName(o.id);
  if (o.t === "visit") return { text: o.name || `${o.x}, ${o.y}, ${o.z}` };
  if (o.t === "talk") return { text: o.npcName || o.npc };
  return { text: "?" };
}

export function objNeed(o) {
  return o.t === "kill" || o.t === "collect" ? o.n : 1;
}

export function objProgress(p, q, i) {
  const o = q.obj[i];
  if (o.t === "collect") return Math.min(o.n, countItem(p, o.id));
  return data(p).q.a[q.id]?.p?.[i] ?? 0;
}

/** RawMessage: "좀비 처치 (3/5)" */
export function objLine(p, q, i, withProgress = true) {
  const o = q.obj[i];
  const verb = { kill: "처치", collect: "수집", visit: "방문", talk: "대화" }[o.t];
  const cur = withProgress ? objProgress(p, q, i) : 0;
  const need = objNeed(o);
  const done = cur >= need;
  return rt(done ? "§a✔ " : "§7- ", objTarget(o), ` ${verb}`, withProgress ? ` §f(${cur}/${need})` : need > 1 ? ` §f×${need}` : "");
}

export function isComplete(p, q) {
  return q.obj.every((_, i) => objProgress(p, q, i) >= objNeed(q.obj[i]));
}

export function state(p, q) {
  const d = data(p);
  if (d.q.a[q.id]) return isComplete(p, q) ? "ready" : "active";
  if (d.q.d[q.id] && !q.repeat) return "done";
  if (!q.enabled) return "locked";
  if (d.lv < (q.minLv ?? 1)) return "locked";
  if (q.cls && q.cls !== d.cls) return "locked";
  if (q.prereq && !d.q.d[q.prereq]) return "locked";
  return "available";
}

export function lockReason(p, q) {
  const d = data(p);
  if (!q.enabled) return "비활성화된 퀘스트";
  if (d.lv < (q.minLv ?? 1)) return `레벨 ${q.minLv} 이상 필요`;
  if (q.cls && q.cls !== d.cls) return `${CLASSES[q.cls]?.name ?? q.cls} 전용`;
  if (q.prereq && !d.q.d[q.prereq]) return `선행: ${getQuest(q.prereq)?.title ?? q.prereq}`;
  return "";
}

export function rewardLines(q) {
  const out = [];
  if (q.rw.xp) out.push(rt(`§2경험치 §f+${q.rw.xp}`));
  if (q.rw.gold) out.push(rt(`§6골드 §f+${q.rw.gold}`));
  for (const it of q.rw.items ?? []) out.push(rt("§3", itemName(it.id), ` §f×${it.n}`));
  return out;
}

// ───────── 행동 ─────────
export function accept(p, id) {
  const d = data(p);
  const q = getQuest(id);
  if (!q || state(p, q) !== "available") return false;
  if (Object.keys(d.q.a).length >= MAX_ACTIVE) {
    msg(p, `§c진행 중인 퀘스트는 최대 ${MAX_ACTIVE}개입니다.`);
    return false;
  }
  d.q.a[id] = { p: q.obj.map(() => 0) };
  if (!d.q.track.includes(id)) d.q.track.unshift(id);
  d.q.track = d.q.track.slice(0, 3);
  save(p);
  p.playSound("random.pop", { pitch: 0.8 });
  p.onScreenDisplay.setTitle("§e퀘스트 수락", { subtitle: q.title, fadeInDuration: 5, stayDuration: 30, fadeOutDuration: 10 });
  checkAutoComplete(p, q);
  return true;
}

export function abandon(p, id) {
  const d = data(p);
  delete d.q.a[id];
  d.q.track = d.q.track.filter((t) => t !== id);
  save(p);
}

export function toggleTrack(p, id) {
  const d = data(p);
  if (d.q.track.includes(id)) d.q.track = d.q.track.filter((t) => t !== id);
  else d.q.track = [id, ...d.q.track].slice(0, 3);
  save(p);
}

export function turnIn(p, id) {
  const d = data(p);
  const q = getQuest(id);
  if (!q || !d.q.a[id] || !isComplete(p, q)) return false;
  for (const o of q.obj) if (o.t === "collect") removeItem(p, o.id, o.n);
  delete d.q.a[id];
  d.q.d[id] = (d.q.d[id] ?? 0) + 1;
  d.q.track = d.q.track.filter((t) => t !== id);
  save(p);
  addGold(p, q.rw.gold ?? 0);
  for (const it of q.rw.items ?? []) giveItem(p, it.id, it.n);
  addXp(p, q.rw.xp ?? 0, true);
  p.playSound("random.levelup", { pitch: 1.2 });
  p.onScreenDisplay.setTitle("§6§l퀘스트 완료", { subtitle: q.title, fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 });
  p.sendMessage(rt("§6[Arcania]§r 보상: ", ...rewardLines(q).flatMap((l, i) => (i ? [" §7| ", l] : [l]))));
  return true;
}

function checkAutoComplete(p, q) {
  if (!data(p).q.a[q.id]) return;
  if (q.turnIn === "auto" && data(p).q.a[q.id] && isComplete(p, q) && !q.obj.some((o) => o.t === "collect")) {
    turnIn(p, q.id);
  } else if (isComplete(p, q) && !data(p).q.a[q.id]?.notified) {
    data(p).q.a[q.id].notified = true;
    save(p);
    p.playSound("note.pling", { pitch: 1.5 });
    p.onScreenDisplay.setTitle("§a목표 달성", {
      subtitle: `${q.title} §7- ${q.turnIn === "auto" ? "메뉴에서 완료하세요" : "의뢰자에게 보고하세요"}`,
      fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10,
    });
  }
}

function bump(p, pred) {
  const d = data(p);
  let changed = false;
  for (const [id, st] of Object.entries(d.q.a)) {
    const q = getQuest(id);
    if (!q) continue;
    q.obj.forEach((o, i) => {
      if (!pred(o)) return;
      const need = objNeed(o);
      if ((st.p[i] ?? 0) < need) {
        st.p[i] = (st.p[i] ?? 0) + 1;
        changed = true;
      }
    });
    if (changed) checkAutoComplete(p, q);
  }
  if (changed) save(p);
  return changed;
}

export function onKill(p, typeId, monster) {
  bump(p, (o) => o.t === "kill" && (o.id === typeId || (o.id === "*" && monster)));
}

export function onTalk(p, npcId) {
  return bump(p, (o) => o.t === "talk" && o.npc === npcId);
}

/** 1초마다: 방문 목표 + 수집 목표 달성 알림 */
export function tick(p) {
  const d = data(p);
  const loc = p.location;
  bump(p, (o) => o.t === "visit" && (o.dim ?? "minecraft:overworld") === p.dimension.id &&
    Math.hypot(loc.x - o.x, loc.y - o.y, loc.z - o.z) <= (o.r ?? 5));
  for (const id of Object.keys(d.q.a)) {
    const q = getQuest(id);
    if (q && q.obj.some((o) => o.t === "collect")) checkAutoComplete(p, q);
  }
}
