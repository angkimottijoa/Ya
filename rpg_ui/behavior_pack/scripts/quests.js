// 퀘스트 엔진: 정의 저장(월드), 진행(플레이어), 목표 판정, 보상
import { world, system } from "@minecraft/server";
import { getJSON, setJSON } from "./db.js";
import { data, save, addXp, addGold, msg, notify } from "./player.js";
import { CLASSES } from "./classes.js";
import { itemName, entityName, countItem, removeItem, giveItem } from "./itemdb.js";
import { rt } from "./ui.js";
import { npcLocation } from "./npcdb.js";

export const OBJ_TYPES = [
  { id: "kill", name: "처치" },
  { id: "collect", name: "수집" },
  { id: "visit", name: "방문" },
  { id: "talk", name: "대화" },
];

export const MAX_ACTIVE = 8;

// 퀘스트 종류 (원신식 분류 + 색)
export const QTYPES = {
  main: { name: "메인", color: "§6", icon: "star" },
  sub: { name: "서브", color: "§b", icon: "quest" },
  daily: { name: "일일", color: "§a", icon: "daily" },
  repeat: { name: "반복", color: "§d", icon: "repeat" },
  event: { name: "이벤트", color: "§c", icon: "skill" },
};
export const qtype = (q) => QTYPES[q.type] ?? QTYPES.sub;
const today = () => new Date().toISOString().slice(0, 10);

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
    type: "sub", region: "",
    adv: {},
  };
}

function seedDemo() {
  const demo = [
    {
      ...blankQuest("main_1"), title: "마을의 위기", giver: "board", type: "main", region: "시작의 마을",
      desc: "밤마다 마을을 습격하는 언데드를 처치해 달라는 의뢰가 게시판에 붙어 있다.",
      obj: [{ t: "kill", id: "minecraft:zombie", n: 5 }, { t: "kill", id: "minecraft:skeleton", n: 3 }],
      rw: { xp: 120, gold: 60, items: [{ id: "minecraft:iron_sword", n: 1 }] },
    },
    {
      ...blankQuest("sub_bread"), title: "제빵사의 부탁", giver: "board", type: "daily", region: "시작의 마을",
      desc: "밀이 부족하다며 제빵사가 도움을 청했다. 밀을 모아 오자.",
      obj: [{ t: "collect", id: "minecraft:wheat", n: 16 }],
      rw: { xp: 60, gold: 40, items: [{ id: "minecraft:bread", n: 8 }] }, repeat: true,
    },
    {
      ...blankQuest("main_2"), title: "어둠 속의 거미", giver: "board", prereq: "main_1", minLv: 3, type: "main", region: "검은 숲",
      desc: "숲 속 거미 떼가 늘고 있다. 거미를 처치하고 거미줄을 가져오자.",
      obj: [{ t: "kill", id: "minecraft:spider", n: 6 }, { t: "collect", id: "minecraft:string", n: 4 }],
      rw: { xp: 250, gold: 120, items: [] },
    },
  ];
  for (const q of demo) saveQuest(q);
}

// ───────── 통계 (퀘스트 일람용) ─────────
let stats = null;
export const questStats = () => (stats ??= getJSON(world, "rpg:qstats", {}));
function countStat(id, key) {
  const s = questStats();
  s[id] = s[id] ?? { acc: 0, done: 0, quit: 0 };
  s[id][key]++;
  setJSON(world, "rpg:qstats", s);
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

export const adv = (q) => q.adv ?? {};

/** 아직 안 끝난 첫 목표 번호 (모두 끝났으면 -1) */
export function firstOpen(p, q) {
  for (let i = 0; i < q.obj.length; i++) if (objProgress(p, q, i) < objNeed(q.obj[i])) return i;
  return -1;
}

export function objProgress(p, q, i) {
  const o = q.obj[i];
  if (o.t === "collect") return Math.min(o.n, countItem(p, o.id));
  return data(p).q.a[q.id]?.p?.[i] ?? 0;
}

/** RawMessage: "좀비 처치 (3/5)" */
export function objLine(p, q, i, withProgress = true) {
  const o = q.obj[i];
  if (withProgress && adv(q).hidden) {
    const f = firstOpen(p, q);
    if (f >= 0 && i > f) return rt("§8- ??? §7(앞 목표를 끝내면 공개)");
  }
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
  const a = adv(q);
  if (q.type === "daily") {
    if (d.q.dd?.[q.id] === today()) return "done";
  } else if (d.q.d[q.id] && !q.repeat && q.type !== "repeat") return "done";
  if (a.maxTimes > 0 && (d.q.d[q.id] ?? 0) >= a.maxTimes) return "done";
  if (a.cooldownH > 0 && d.q.last?.[q.id] && Date.now() - d.q.last[q.id] < a.cooldownH * 3600000) return "locked";
  if (a.lvMax > 0 && d.lv > a.lvMax) return "locked";
  if (a.reqFlag && !d.flags?.[a.reqFlag]) return "locked";
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
  const a = adv(q);
  if (a.cooldownH > 0 && d.q.last?.[q.id]) {
    const left = a.cooldownH * 3600000 - (Date.now() - d.q.last[q.id]);
    if (left > 0) return `다시 받을 수 있을 때까지 ${Math.ceil(left / 60000)}분`;
  }
  if (a.lvMax > 0 && d.lv > a.lvMax) return `레벨 ${a.lvMax} 이하 전용`;
  if (a.reqFlag && !d.flags?.[a.reqFlag]) return a.reqFlagText || "조건을 만족하지 않음";
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
  d.q.a[id] = { p: q.obj.map(() => 0), t0: Date.now() };
  if (adv(q).acceptMsg) p.sendMessage(`§e[${q.title}] §f${adv(q).acceptMsg}`);
  // 우선순위 목록: 메인 퀘스트는 맨 위, 나머지는 뒤에
  d.q.track = d.q.track.filter((t) => t !== id && d.q.a[t]);
  if (q.type === "main") d.q.track.unshift(id);
  else d.q.track.push(id);
  save(p);
  countStat(id, "acc");
  p.playSound("random.pop", { pitch: 0.8 });
  notify(p, `§e§l퀘스트 수락 §r§f${q.title}`);
  checkAutoComplete(p, q);
  return true;
}

export function abandon(p, id) {
  const d = data(p);
  if (d.q.a[id]) countStat(id, "quit");
  delete d.q.a[id];
  d.q.track = d.q.track.filter((t) => t !== id);
  save(p);
}

/** 진행 중 퀘스트 우선순위 (맨 앞 = 길 안내 대상). 누락된 진행 퀘스트도 뒤에 붙임 */
export function priority(p) {
  const d = data(p);
  const list = d.q.track.filter((t) => d.q.a[t] && getQuest(t));
  for (const id of Object.keys(d.q.a)) if (!list.includes(id) && getQuest(id)) list.push(id);
  d.q.track = list;
  return list;
}

export function movePriority(p, id, delta) {
  const list = priority(p);
  const i = list.indexOf(id);
  if (i < 0) return;
  const j = delta === "top" ? 0 : Math.max(0, Math.min(list.length - 1, i + delta));
  list.splice(i, 1);
  list.splice(j, 0, id);
  data(p).q.track = list;
  save(p);
}

export function toggleHidden(p, id) {
  const d = data(p);
  d.q.hide = d.q.hide ?? {};
  if (d.q.hide[id]) delete d.q.hide[id];
  else d.q.hide[id] = true;
  save(p);
}

// ───────── 길 안내 ─────────
/** 첫 번째로 남은 목표의 위치 { x, y, z, dim, label } (없으면 null) */
export function navTarget(p, q) {
  const st = data(p).q.a[q.id];
  if (!st) return null;
  for (let i = 0; i < q.obj.length; i++) {
    const o = q.obj[i];
    if (objProgress(p, q, i) >= objNeed(o)) continue;
    if (o.t === "visit") return { x: o.x + 0.5, y: o.y, z: o.z + 0.5, dim: o.dim ?? "minecraft:overworld", label: o.name || "목적지" };
    if (o.t === "talk") {
      const l = npcLocation(o.npc);
      if (l) return { ...l, label: l.name };
    }
    if (o.t === "kill") {
      try {
        const opt = { location: p.location, maxDistance: 64, closest: 1 };
        const near = o.id === "*" ? p.dimension.getEntities({ ...opt, families: ["monster"] }) : p.dimension.getEntities({ ...opt, type: o.id });
        if (near[0]) return { ...near[0].location, dim: p.dimension.id, label: o.label || "가장 가까운 대상" };
      } catch {}
    }
  }
  if (isComplete(p, q) && q.turnIn === "giver") {
    const l = npcLocation(q.giver);
    if (l) return { ...l, label: `${l.name}에게 보고` };
  }
  return null;
}

const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

/** 길 안내 문구 "↗ 23m 촌장" (다른 차원이면 안내) */
export function navText(p, t) {
  if (!t) return "";
  if (t.dim !== p.dimension.id) return `§7다른 차원 · ${t.label}`;
  const dx = t.x - p.location.x;
  const dz = t.z - p.location.z;
  const dy = t.y - p.location.y;
  const dist = Math.round(Math.hypot(dx, dy, dz));
  if (dist <= 3) return `§a§l도착 §r§f${t.label}`;
  const ang = (Math.atan2(-dx, dz) * 180) / Math.PI;
  let rel = ang - p.getRotation().y;
  rel = ((rel + 540) % 360) - 180;
  const arrow = ARROWS[(Math.round(rel / 45) + 8) % 8];
  const v = dy > 4 ? " ▲" : dy < -4 ? " ▼" : "";
  return `§b§l${arrow} ${dist}m${v} §r§f${t.label}`;
}

/** 완료 보고. 선택 보상이 있으면 고르는 화면을 띄우고 Promise 반환 */
export function turnIn(p, id) {
  const d = data(p);
  const q = getQuest(id);
  if (!q || !d.q.a[id] || !isComplete(p, q)) return false;
  const choices = adv(q).choice ?? [];
  if (choices.length) {
    return import("./ui.js").then(async ({ Screen }) => {
      const scr = new Screen("L", `${q.title} / 보상 선택`);
      let picked = null;
      choices.forEach((it, i) => scr.item(rt("§f", itemName(it.id), ` §7×${it.n}`), undefined, () => { picked = i; }));
      scr.select("보상 하나를 고르세요", undefined);
      scr.body("§7아래 보상 중 하나를 받을 수 있습니다.");
      await scr.show(p);
      if (picked === null) return false;
      return finishTurnIn(p, q, choices[picked]);
    });
  }
  return finishTurnIn(p, q, null);
}

function finishTurnIn(p, q, choiceItem) {
  const d = data(p);
  const id = q.id;
  if (!d.q.a[id] || !isComplete(p, q)) return false;
  const a = adv(q);
  if (!a.keepItems) for (const o of q.obj) if (o.t === "collect") removeItem(p, o.id, o.n);
  if (choiceItem) giveItem(p, choiceItem.id, choiceItem.n);
  (d.q.last = d.q.last ?? {})[id] = Date.now();
  for (const f of String(a.flags ?? "").split(",").map((x) => x.trim()).filter(Boolean)) (d.flags = d.flags ?? {})[f] = true;
  for (const c of String(a.cmds ?? "").split(";").map((x) => x.trim()).filter(Boolean)) {
    try { p.runCommand(c.replace(/^\//, "")); } catch {}
  }
  if (a.doneMsg) p.sendMessage(`§6[${q.title}] §f${a.doneMsg}`);
  delete d.q.a[id];
  d.q.d[id] = (d.q.d[id] ?? 0) + 1;
  if (q.type === "daily") (d.q.dd = d.q.dd ?? {})[id] = today();
  countStat(id, "done");
  d.q.track = d.q.track.filter((t) => t !== id);
  save(p);
  addGold(p, q.rw.gold ?? 0);
  for (const it of q.rw.items ?? []) giveItem(p, it.id, it.n);
  addXp(p, q.rw.xp ?? 0, true);
  p.playSound("random.levelup", { pitch: 1.2 });
  notify(p, `§6§l퀘스트 완료 §r§f${q.title}`);
  p.sendMessage(rt("§6[Arcania]§r 보상: ", ...rewardLines(q).flatMap((l, i) => (i ? [" §7| ", l] : [l]))));
  if (a.next && getQuest(a.next)) system.runTimeout(() => accept(p, a.next), 20);
  return true;
}

function checkAutoComplete(p, q) {
  if (!data(p).q.a[q.id]) return;
  if (q.turnIn === "auto" && data(p).q.a[q.id] && isComplete(p, q) && !q.obj.some((o) => o.t === "collect") && !(adv(q).choice ?? []).length) {
    turnIn(p, q.id);
  } else if (isComplete(p, q) && !data(p).q.a[q.id]?.notified) {
    data(p).q.a[q.id].notified = true;
    save(p);
    p.playSound("note.pling", { pitch: 1.5 });
    notify(p, `§a§l목표 달성 §r§f${q.title} §7- ${q.turnIn === "auto" ? "메뉴에서 완료하세요" : "의뢰자에게 보고하세요"}`);
  }
}

function bump(p, pred) {
  const d = data(p);
  let changed = false;
  for (const [id, st] of Object.entries(d.q.a)) {
    const q = getQuest(id);
    if (!q) continue;
    const seqIdx = adv(q).seq ? firstOpen(p, q) : -2;
    q.obj.forEach((o, i) => {
      if (!pred(o)) return;
      if (seqIdx !== -2 && i !== seqIdx) return;
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

export function failQuest(p, q, why) {
  const d = data(p);
  if (!d.q.a[q.id]) return;
  delete d.q.a[q.id];
  d.q.track = d.q.track.filter((t) => t !== q.id);
  save(p);
  countStat(q.id, "quit");
  p.playSound("note.bass", { pitch: 0.6 });
  notify(p, `§c§l퀘스트 실패 §r§f${q.title} §7(${why})`);
  if (adv(q).failMsg) p.sendMessage(`§c[${q.title}] §f${adv(q).failMsg}`);
}

/** 플레이어 사망 시 '죽으면 실패' 퀘스트 처리 */
export function onDeath(p) {
  for (const id of Object.keys(data(p).q.a)) {
    const q = getQuest(id);
    if (q && adv(q).failOnDeath) failQuest(p, q, "사망");
  }
}

// ───────── 선행/후속 묶음 정렬 ─────────
/** 퀘스트 목록을 선행 → 후속 순서로 묶어서 정렬. 각 원소에 depth(들여쓰기) 포함 */
export function chainSort(list) {
  const ids = new Set(list.map((q) => q.id));
  const kids = new Map();
  const roots = [];
  for (const q of list) {
    if (q.prereq && ids.has(q.prereq) && q.prereq !== q.id) {
      if (!kids.has(q.prereq)) kids.set(q.prereq, []);
      kids.get(q.prereq).push(q);
    } else roots.push(q);
  }
  const out = [];
  const seen = new Set();
  const walk = (q, depth) => {
    if (seen.has(q.id)) return;
    seen.add(q.id);
    out.push({ q, depth });
    for (const k of kids.get(q.id) ?? []) walk(k, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  for (const q of list) if (!seen.has(q.id)) walk(q, 0);
  return out;
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
  for (const [id, st] of Object.entries(d.q.a)) {
    const q = getQuest(id);
    const lim = q ? adv(q).timeLimit : 0;
    if (lim > 0 && st.t0 && Date.now() - st.t0 > lim * 60000) failQuest(p, q, "시간 초과");
  }
  if (system.currentTick % 100 < 20) {
    for (const q of allQuests()) {
      const al = adv(q).autoLv;
      if (al > 0 && d.lv >= al && state(p, q) === "available" && Object.keys(d.q.a).length < MAX_ACTIVE) accept(p, q.id);
    }
  }
  const loc = p.location;
  bump(p, (o) => o.t === "visit" && (o.dim ?? "minecraft:overworld") === p.dimension.id &&
    Math.hypot(loc.x - o.x, loc.y - o.y, loc.z - o.z) <= (o.r ?? 5));
  for (const id of Object.keys(d.q.a)) {
    const q = getQuest(id);
    if (q && q.obj.some((o) => o.t === "collect")) checkAutoComplete(p, q);
  }
}
