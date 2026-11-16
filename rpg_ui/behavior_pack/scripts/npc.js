// NPC 대화 (화면 아래 이름+대사, 오른쪽 선택지 – 레이아웃 [RPG:D])
// NPC 데이터(엔티티 동적 프로퍼티):
//   rpg:npc_id    퀘스트 연결용 ID
//   rpg:greet     대사. "|" 로 페이지 구분
//   rpg:shop      상점 사용 여부 (bool)
//   rpg:shop_list NPC 전용 상품 JSON (비어 있으면 공용 상점)
//   rpg:opts      추가 선택지 JSON [{ label, reply, cmd }]
import { Screen, rt } from "./ui.js";
import { getJSON } from "./db.js";
import { msg } from "./player.js";
import * as Q from "./quests.js";
import { ICON } from "./itemdb.js";
import { openShop, questDetailBody } from "./menu.js";

export const SKINS = ["스티브", "알렉스", "기사", "상인", "마법사", "성직자", "대장장이", "경비병", "사용자 스킨 1", "사용자 스킨 2", "사용자 스킨 3", "사용자 스킨 4"];

export const npcId = (e) => String(e.getDynamicProperty("rpg:npc_id") ?? "npc");
export const npcGreet = (e) => String(e.getDynamicProperty("rpg:greet") ?? "안녕하신가, 모험가.");
export const npcHasShop = (e) => e.getDynamicProperty("rpg:shop") === true || e.getDynamicProperty("rpg:role") === "shop";
export const npcShopList = (e) => getJSON(e, "rpg:shop_list", []);
export const npcOpts = (e) => getJSON(e, "rpg:opts", []);

const STATE_LABEL = { available: "§e[퀘스트]", active: "§6[진행 중]", ready: "§a[완료 보고]" };

export function openNpc(p, npc, page = 0) {
  if (!npc.isValid()) return;
  const name = npc.nameTag || "NPC";
  const id = npcId(npc);
  if (page === 0) Q.onTalk(p, id);
  const lines = npcGreet(npc).split("|").map((s) => s.trim()).filter(Boolean);
  page = Math.max(0, Math.min(page, lines.length - 1));
  const last = page >= lines.length - 1;

  const scr = new Screen("D", name);
  scr.body(lines[page] ?? "");
  if (!last) {
    scr.item("§f다음 ▶", ICON("chat"), () => openNpc(p, npc, page + 1));
  } else {
    for (const q of Q.allQuests().filter((x) => x.giver === id)) {
      const st = Q.state(p, q);
      if (!STATE_LABEL[st]) continue;
      scr.item(`${STATE_LABEL[st]} §r§f${q.title}`, ICON("quest"), () => npcQuest(p, npc, q.id));
    }
    if (npcHasShop(npc)) {
      const own = npcShopList(npc);
      scr.item("§f상점 보기", ICON("shop"), () => openShop(p, 0, `${name} / 상점`, own.length ? { list: own, npc } : null));
    }
    npcOpts(npc).forEach((o, i) => scr.item(`§f${o.label}`, ICON("chat"), () => npcOption(p, npc, i)));
  }
  scr.item("§7대화 종료", ICON("close"), () => {});
  scr.reopen = () => openNpc(p, npc, page);
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
    return openNpc(p, npc);
  });
  if (st === "ready") scr.item("§a완료 보고", ICON("star"), () => {
    Q.turnIn(p, qid);
    return openNpc(p, npc);
  });
  scr.item("§f다른 이야기", ICON("chat"), () => openNpc(p, npc, 999));
  scr.item("§7대화 종료", ICON("close"), () => {});
  return scr.show(p);
}

function npcOption(p, npc, i) {
  const o = npcOpts(npc)[i];
  if (!o) return openNpc(p, npc);
  if (o.cmd) {
    try {
      p.runCommand(o.cmd.replace(/^\//, ""));
    } catch (e) {
      msg(p, `§c명령 실행 실패: ${e}`);
    }
  }
  if (!o.reply) return openNpc(p, npc, 999);
  const scr = new Screen("D", npc.nameTag || "NPC");
  scr.body(rt(o.reply));
  scr.item("§f다른 이야기", ICON("chat"), () => openNpc(p, npc, 999));
  scr.item("§7대화 종료", ICON("close"), () => {});
  return scr.show(p);
}
