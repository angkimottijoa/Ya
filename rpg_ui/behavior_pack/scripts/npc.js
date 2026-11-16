// NPC 대화 (화면 아래 이름+대사, 오른쪽 선택지 – 레이아웃 [RPG:D])
//
// NPC 데이터 (엔티티 동적 프로퍼티)
//   rpg:npc_id     퀘스트 연결용 ID          rpg:kind   "civil" | "combat"
//   rpg:dlg        대화 트리 JSON { nodes: { start: { text: "1페이지|2페이지", choices: [...] }, ... } }
//                  choice = { label, goto: 노드ID | "" (종료), cmd, cond: { t: "lv"|"qdone"|"qactive", v } }
//   rpg:shop       상점 사용 / rpg:shop_list 전용 상품
//   rpg:cam        카메라 연출 0~4 / rpg:cam_ease 전환 시간 / rpg:hud_hide 대화 중 HUD 숨김
//   (구버전 rpg:greet, rpg:opts 는 자동으로 start 노드로 변환)
import { system } from "@minecraft/server";
import { Screen, rt } from "./ui.js";
import { getJSON, setJSON } from "./db.js";
import { msg, data } from "./player.js";
import * as Q from "./quests.js";
import { ICON } from "./itemdb.js";
import { openShop, questDetailBody } from "./menu.js";
import { npcIdOf, registerNpcEntity } from "./npcdb.js";

export const SKINS = ["스티브", "알렉스", "기사", "상인", "마법사", "성직자", "대장장이", "경비병", "사용자 스킨 1", "사용자 스킨 2", "사용자 스킨 3", "사용자 스킨 4"];
export const ANIMS = ["기본", "손 흔들기", "팔짱", "앉기", "가리키기", "생각하기", "환호", "경계 자세", "인사(꾸벅)", "춤"];
export const CAMS = ["없음 (그대로)", "NPC 클로즈업", "어깨 너머", "측면 투샷", "위에서 보기"];
export const COND_TYPES = [
  { id: "", name: "조건 없음" },
  { id: "lv", name: "레벨 이상" },
  { id: "qdone", name: "퀘스트 완료함" },
  { id: "qactive", name: "퀘스트 진행 중" },
  { id: "qnot", name: "퀘스트 안 받음" },
];

export const npcId = npcIdOf;
export const npcHasShop = (e) => e.getDynamicProperty("rpg:shop") === true || e.getDynamicProperty("rpg:role") === "shop";
export const npcShopList = (e) => getJSON(e, "rpg:shop_list", []);

/** 대화 트리 (구버전 데이터 자동 변환) */
export function npcDialog(e) {
  const dlg = getJSON(e, "rpg:dlg", null);
  if (dlg?.nodes?.start) return dlg;
  const greet = String(e.getDynamicProperty("rpg:greet") ?? "안녕하신가, 모험가.");
  const opts = getJSON(e, "rpg:opts", []);
  const nodes = { start: { text: greet, choices: [] } };
  opts.forEach((o, i) => {
    const nid = `opt${i + 1}`;
    nodes[nid] = { text: o.reply || "...", choices: [] };
    nodes.start.choices.push({ label: o.label, goto: o.reply ? nid : "", cmd: o.cmd || "" });
  });
  return { nodes };
}
export function saveDialog(e, dlg) {
  setJSON(e, "rpg:dlg", dlg);
}
export const npcGreet = (e) => npcDialog(e).nodes.start.text;

function condOk(p, c) {
  if (!c?.t) return true;
  const d = data(p);
  if (c.t === "lv") return d.lv >= Number(c.v || 0);
  if (c.t === "qdone") return !!d.q.d[c.v];
  if (c.t === "qactive") return !!d.q.a[c.v];
  if (c.t === "qnot") return !d.q.a[c.v] && !d.q.d[c.v];
  return true;
}

// ───────── 카메라 / 제스처 ─────────
function camPose(p, npc, preset) {
  const N = npc.location;
  const P = p.location;
  const head = { x: N.x, y: N.y + 1.6, z: N.z };
  let vx = N.x - P.x, vz = N.z - P.z;
  const len = Math.hypot(vx, vz) || 1;
  vx /= len; vz /= len; // 플레이어 → NPC 방향
  const px = -vz, pz = vx; // 수직
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
  try { if (npc.isValid()) npc.setProperty("rpg:talk", false); } catch {}
  if (Number(npc.getDynamicProperty?.("rpg:cam") ?? 0) > 0) {
    try { p.camera.clear(); } catch { try { p.runCommand("camera @s clear"); } catch {} }
  }
  if (npc.getDynamicProperty?.("rpg:hud_hide") === true) try { p.runCommand("hud @s reset all"); } catch {}
}

// ───────── 대화 ─────────
const STATE_LABEL = { available: "§e[퀘스트]", active: "§6[진행 중]", ready: "§a[완료 보고]" };

export async function openNpc(p, npc) {
  if (!npc.isValid()) return;
  registerNpcEntity(npc);
  Q.onTalk(p, npcId(npc));
  begin(p, npc);
  try {
    await showNode(p, npc, "start", 0);
  } finally {
    endDialog(p);
  }
}

function showNode(p, npc, nodeId, page) {
  const dlg = npcDialog(npc);
  const node = dlg.nodes[nodeId] ?? dlg.nodes.start;
  const name = npc.nameTag || "NPC";
  const pages = String(node.text).split("|").map((s) => s.trim()).filter(Boolean);
  page = Math.max(0, Math.min(page, pages.length - 1));
  const last = page >= pages.length - 1;
  const scr = new Screen("D", name);
  scr.body(pages[page] ?? "");
  if (!last) {
    scr.item("§f다음 ▶", ICON("chat"), () => showNode(p, npc, nodeId, page + 1));
  } else {
    for (const c of node.choices ?? []) {
      if (!condOk(p, c.cond)) continue;
      scr.item(`§f${c.label}`, ICON(c.goto ? "chat" : "close"), () => {
        if (c.cmd) {
          try { p.runCommand(c.cmd.replace(/^\//, "")); } catch (e) { msg(p, `§c명령 실패: ${e}`); }
        }
        return c.goto ? showNode(p, npc, c.goto, 0) : undefined;
      });
    }
    if (nodeId === "start") {
      const id = npcId(npc);
      for (const q of Q.allQuests().filter((x) => x.giver === id)) {
        const st = Q.state(p, q);
        if (STATE_LABEL[st]) scr.item(`${STATE_LABEL[st]} §r§f${q.title}`, ICON("quest"), () => npcQuest(p, npc, q.id));
      }
      if (npcHasShop(npc)) {
        const own = npcShopList(npc);
        scr.item("§f상점 보기", ICON("shop"), () => {
          endDialog(p);
          return openShop(p, 0, `${name} / 상점`, own.length ? { list: own, npc } : null);
        });
      }
    } else {
      scr.item("§f처음으로", ICON("back"), () => showNode(p, npc, "start", 999));
    }
  }
  scr.item("§7대화 종료", ICON("close"), () => {});
  scr.reopen = () => showNode(p, npc, nodeId, page);
  return scr.show(p);
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
  if (st === "ready") scr.item("§a완료 보고", ICON("star"), () => {
    Q.turnIn(p, qid);
    return showNode(p, npc, "start", 999);
  });
  scr.item("§f다른 이야기", ICON("chat"), () => showNode(p, npc, "start", 999));
  scr.item("§7대화 종료", ICON("close"), () => {});
  return scr.show(p);
}

/** 플레이어가 대화 중 나가면 카메라 원상복구 (안전장치) */
system.runInterval(() => {
  for (const [pid, npc] of sessions) {
    if (!npc.isValid?.()) sessions.delete(pid);
  }
}, 200);
