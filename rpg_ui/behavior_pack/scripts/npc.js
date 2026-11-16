// NPC 대화 (화면 아래 이름+대사, 오른쪽 선택지 – 레이아웃 [RPG:D])
//
// 대화 트리 rpg:dlg = { nodes: { [id]: node } }
//   node = {
//     text: "1페이지|2페이지",
//     anim: -1(유지) | 0~9      이 노드에서 NPC 동작
//     cond: [조건...], lockedText   조건이 안 맞으면 lockedText 를 보여주고 진행 불가
//     enter: [행동...]           노드에 들어올 때 실행 (플래그, 아이템, 경험치 …)
//     next: 노드ID               선택지가 없을 때 '다음'으로 자동 연결
//     choices: [{ label, goto, cond: [...], show: "hide" | "gray", once, acts: [...] }]
//   }
//   특수 노드: "first" = 처음 만났을 때 시작 노드 (없으면 start)
//
// NPC 반응 (엔티티 동적 프로퍼티)
//   rpg:base_anim   평소 동작          rpg:approach  { r, anim, line }  가까이 오면 동작/한마디
//   rpg:after       { anim, sec }  대화 끝난 뒤 잠깐 할 동작
//   rpg:cam / rpg:cam_ease / rpg:hud_hide   카메라 연출
import { system, world } from "@minecraft/server";
import { Screen, rt } from "./ui.js";
import { getJSON, setJSON } from "./db.js";
import { msg, data, save, notify } from "./player.js";
import * as Q from "./quests.js";
import * as R from "./rules.js";
import { ICON } from "./itemdb.js";
import { openShop, questDetailBody } from "./menu.js";
import { npcIdOf, registerNpcEntity } from "./npcdb.js";

export const SKINS = ["스티브", "알렉스", "기사", "상인", "마법사", "성직자", "대장장이", "경비병", "사용자 스킨 1", "사용자 스킨 2", "사용자 스킨 3", "사용자 스킨 4"];
export const ANIMS = ["기본", "손 흔들기", "팔짱", "앉기", "가리키기", "생각하기", "환호", "경계 자세", "인사(꾸벅)", "춤"];
export const CAMS = ["없음 (그대로)", "NPC 클로즈업", "어깨 너머", "측면 투샷", "위에서 보기"];
export const COND_TYPES = R.COND_DEFS;

export const npcId = npcIdOf;
export const npcHasShop = (e) => e.getDynamicProperty("rpg:shop") === true || e.getDynamicProperty("rpg:role") === "shop";
export const npcShopList = (e) => getJSON(e, "rpg:shop_list", []);
export const baseAnim = (e) => Number(e.getDynamicProperty("rpg:base_anim") ?? (() => { try { return e.getProperty("rpg:anim") ?? 0; } catch { return 0; } })());
export function setBaseAnim(e, i) {
  e.setDynamicProperty("rpg:base_anim", i);
  try { e.setProperty("rpg:anim", i); } catch {}
}
const setAnim = (e, i) => { try { if (e.isValid()) e.setProperty("rpg:anim", i); } catch {} };

/** 대화 트리 (구버전 데이터 자동 변환, 구버전 단일 조건 → 배열) */
export function npcDialog(e) {
  let dlg = getJSON(e, "rpg:dlg", null);
  if (!dlg?.nodes?.start) {
    const greet = String(e.getDynamicProperty("rpg:greet") ?? "안녕하신가, 모험가.");
    const opts = getJSON(e, "rpg:opts", []);
    dlg = { nodes: { start: { text: greet, choices: [] } } };
    opts.forEach((o, i) => {
      const nid = `opt${i + 1}`;
      dlg.nodes[nid] = { text: o.reply || "...", choices: [] };
      dlg.nodes.start.choices.push({ label: o.label, goto: o.reply ? nid : "", acts: o.cmd ? [{ t: "cmd", k: o.cmd }] : [] });
    });
  }
  for (const n of Object.values(dlg.nodes)) {
    n.choices = n.choices ?? [];
    for (const c of n.choices) {
      if (c.cond && !Array.isArray(c.cond)) c.cond = [{ t: c.cond.t, k: c.cond.v, v: c.cond.v }];
      if (c.cmd) { c.acts = [...(c.acts ?? []), { t: "cmd", k: c.cmd }]; delete c.cmd; }
    }
  }
  return dlg;
}
export function saveDialog(e, dlg) {
  setJSON(e, "rpg:dlg", dlg);
}
export const npcGreet = (e) => npcDialog(e).nodes.start.text;

const ctxOf = (p, npc) => ({
  npc,
  npcId: npcId(npc),
  isComplete: (qid) => { const q = Q.getQuest(qid); return q ? Q.isComplete(p, q) : false; },
  acceptQuest: (qid) => Q.accept(p, qid),
});

// ───────── 카메라 ─────────
function camPose(p, npc, preset) {
  const N = npc.location;
  const P = p.location;
  const head = { x: N.x, y: N.y + 1.6, z: N.z };
  let vx = N.x - P.x, vz = N.z - P.z;
  const len = Math.hypot(vx, vz) || 1;
  vx /= len; vz /= len;
  const px = -vz, pz = vx;
  const mid = { x: (N.x + P.x) / 2, y: (N.y + P.y) / 2, z: (N.z + P.z) / 2 };
  switch (preset) {
    case 1: return { location: { x: N.x - vx * 2.3 + px * 0.4, y: N.y + 1.75, z: N.z - vz * 2.3 + pz * 0.4 }, facing: head };
    case 2: return { location: { x: P.x - vx * 1.7 + px * 0.8, y: P.y + 2.1, z: P.z - vz * 1.7 + pz * 0.8 }, facing: head };
    case 3: return { location: { x: mid.x + px * 4.2, y: mid.y + 1.8, z: mid.z + pz * 4.2 }, facing: { ...mid, y: mid.y + 1.5 } };
    case 4: return { location: { x: mid.x + px * 2, y: mid.y + 7, z: mid.z + pz * 2 }, facing: mid };
  }
  return null;
}

const sessions = new Map(); // pid -> npc
function begin(p, npc) {
  sessions.set(p.id, npc);
  if (npc.getDynamicProperty("rpg:no_gesture") !== true) try { npc.setProperty("rpg:talk", true); } catch {}
  const preset = Number(npc.getDynamicProperty("rpg:cam") ?? 0);
  const pose = camPose(p, npc, preset);
  const ease = Number(npc.getDynamicProperty("rpg:cam_ease") ?? 0.6);
  if (pose) {
    try {
      p.camera.setCamera("minecraft:free", { location: pose.location, facingLocation: pose.facing, easeOptions: { easeTime: ease, easeType: "InOutSine" } });
    } catch {
      const f = (v) => v.toFixed(2);
      try { p.runCommand(`camera @s set minecraft:free ease ${ease} in_out_sine pos ${f(pose.location.x)} ${f(pose.location.y)} ${f(pose.location.z)} facing ${f(pose.facing.x)} ${f(pose.facing.y)} ${f(pose.facing.z)}`); } catch {}
    }
  }
  if (npc.getDynamicProperty("rpg:hud_hide") === true) try { p.runCommand("hud @s hide all"); } catch {}
}

export function endDialog(p) {
  const npc = sessions.get(p.id);
  if (!npc) return;
  sessions.delete(p.id);
  if (!npc.isValid()) return;
  try { npc.setProperty("rpg:talk", false); } catch {}
  if (Number(npc.getDynamicProperty("rpg:cam") ?? 0) > 0) {
    try { p.camera.clear(); } catch { try { p.runCommand("camera @s clear"); } catch {} }
  }
  if (npc.getDynamicProperty("rpg:hud_hide") === true) try { p.runCommand("hud @s reset all"); } catch {}
  // 대화 후 동작 → 일정 시간 뒤 평소 동작
  const after = getJSON(npc, "rpg:after", null);
  if (after && after.anim > 0 && after.sec > 0) {
    setAnim(npc, after.anim);
    system.runTimeout(() => setAnim(npc, baseAnim(npc)), Math.round(after.sec * 20));
  } else setAnim(npc, baseAnim(npc));
}

// ───────── 대화 ─────────
const STATE_LABEL = { available: "§e[퀘스트]", active: "§6[진행 중]", ready: "§a[완료 보고]" };

export async function openNpc(p, npc) {
  if (!npc.isValid()) return;
  registerNpcEntity(npc);
  const id = npcId(npc);
  Q.onTalk(p, id);
  const d = data(p);
  const firstTime = !(d.met?.[id] > 0);
  const dlg = npcDialog(npc);
  begin(p, npc);
  try {
    await showNode(p, npc, firstTime && dlg.nodes.first ? "first" : "start", 0, true);
  } finally {
    (d.met = d.met ?? {})[id] = (d.met[id] ?? 0) + 1;
    save(p);
    endDialog(p);
  }
}

function showNode(p, npc, nodeId, page, entering = false) {
  if (!npc.isValid()) return;
  const dlg = npcDialog(npc);
  const node = dlg.nodes[nodeId] ?? dlg.nodes.start;
  const ctx = ctxOf(p, npc);
  const name = npc.nameTag || "NPC";
  const scr = new Screen("D", name);

  // 잠긴 노드
  if (!R.checkAll(p, node.cond, ctx)) {
    scr.body(`§l§7${node.lockedText || "(아직 들을 수 없는 이야기다)"}`);
    scr.item("§f돌아가기", ICON("back"), () => showNode(p, npc, "start", 999));
    scr.item("§7대화 종료", ICON("close"), () => {});
    return scr.show(p);
  }
  if (entering) {
    if (node.anim >= 0) setAnim(npc, node.anim);
    if (node.enter?.length) {
      const r = R.run(p, node.enter, ctx);
      if (r.shop) return openNodeShop(p, npc);
      if (r.end) return;
    }
  }
  const pages = String(node.text ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  page = Math.max(0, Math.min(page, pages.length - 1));
  const last = page >= pages.length - 1;
  // 대사는 굵은 흰 글씨 (이후 §색 코드를 써도 굵기 유지되도록 각 줄 앞에 §l)
  scr.body((pages[page] ?? "").split("\n").map((l) => `§l§f${l}`).join("\n"));
  if (!last) {
    scr.item("§f다음 ▶", ICON("chat"), () => showNode(p, npc, nodeId, page + 1));
  } else {
    const d = data(p);
    node.choices.forEach((c, i) => {
      const onceKey = `${npcId(npc)}|${nodeId}|${i}`;
      if (c.once && d.once?.[onceKey]) return;
      const ok = R.checkAll(p, c.cond, ctx);
      if (!ok && c.show !== "gray") return;
      if (!ok) {
        scr.item(`§8${c.label} §7(${(c.cond ?? []).map(R.describe).join(", ")})`, ICON("close"), () => showNode(p, npc, nodeId, page));
        return;
      }
      scr.item(`§f${c.label}`, ICON(c.goto ? "chat" : "close"), () => {
        const r = R.run(p, c.acts, ctx);
        if (!r.ok) return showNode(p, npc, nodeId, page);
        if (c.once) { (d.once = d.once ?? {})[onceKey] = true; save(p); }
        if (r.shop) return openNodeShop(p, npc);
        if (r.end) return;
        return c.goto ? showNode(p, npc, c.goto, 0, true) : undefined;
      });
    });
    if (node.next && dlg.nodes[node.next] && !node.choices.length) {
      scr.item("§f다음 ▶", ICON("chat"), () => showNode(p, npc, node.next, 0, true));
    }
    if (nodeId === "start" || nodeId === "first") {
      const id = npcId(npc);
      for (const q of Q.allQuests().filter((x) => x.giver === id)) {
        const st = Q.state(p, q);
        if (STATE_LABEL[st]) scr.item(`${STATE_LABEL[st]} §r§f${q.title}`, ICON("quest"), () => npcQuest(p, npc, q.id));
      }
      if (npcHasShop(npc)) scr.item("§f상점 보기", ICON("shop"), () => openNodeShop(p, npc));
    } else if (!node.next) {
      scr.item("§f처음으로", ICON("back"), () => showNode(p, npc, "start", 999));
    }
  }
  scr.item("§7대화 종료", ICON("close"), () => {});
  scr.reopen = () => showNode(p, npc, nodeId, page);
  return scr.show(p);
}

function openNodeShop(p, npc) {
  endDialog(p);
  const own = npcShopList(npc);
  return openShop(p, 0, `${npc.nameTag || "NPC"} / 상점`, own.length ? { list: own, npc } : null);
}

function npcQuest(p, npc, qid) {
  const q = Q.getQuest(qid);
  const id = npcId(npc);
  const scr = new Screen("D", `${npc.nameTag || "NPC"} · ${q.title}`);
  scr.body(questDetailBody(p, q));
  const st = Q.state(p, q);
  if (st === "available") scr.item("§a수락한다", ICON("quest"), () => {
    if (Q.accept(p, qid)) Q.onTalk(p, id);
    return showNode(p, npc, "start", 999);
  });
  if (st === "ready") scr.item("§a완료 보고", ICON("star"), () => Promise.resolve(Q.turnIn(p, qid)).then(() => showNode(p, npc, "start", 999)));
  scr.item("§f다른 이야기", ICON("chat"), () => showNode(p, npc, "start", 999));
  scr.item("§7대화 종료", ICON("close"), () => {});
  return scr.show(p);
}

// ───────── 가까이 오면 반응 (동작 + 한마디) ─────────
const near = new Set(); // `${npcEntityId}|${pid}`
system.runInterval(() => {
  const players = world.getAllPlayers();
  const dims = new Set(players.map((p) => p.dimension));
  for (const dim of dims) {
    for (const e of dim.getEntities({ type: "rpg:npc" })) {
      const ap = getJSON(e, "rpg:approach", null);
      if (!ap || !(ap.r > 0)) continue;
      for (const p of players) {
        if (p.dimension.id !== dim.id) continue;
        const key = `${e.id}|${p.id}`;
        const inside = Math.hypot(p.location.x - e.location.x, p.location.y - e.location.y, p.location.z - e.location.z) <= ap.r;
        if (inside && !near.has(key)) {
          near.add(key);
          if (sessions.get(p.id) === e) continue;
          if (ap.anim > 0) {
            setAnim(e, ap.anim);
            system.runTimeout(() => { if (![...sessions.values()].includes(e)) setAnim(e, baseAnim(e)); }, 60);
          }
          if (ap.line) notify(p, `§e${e.nameTag || "NPC"}§f: ${ap.line}`);
        } else if (!inside && near.has(key)) {
          near.delete(key);
        }
      }
    }
  }
}, 10);
