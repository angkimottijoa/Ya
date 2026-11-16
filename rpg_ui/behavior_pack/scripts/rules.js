// 조건 / 행동 (NPC 대화 노드·선택지, 퀘스트 고급 옵션에서 공통 사용)
//   조건 cond = { t, k, v }   행동 act = { t, k, v }
import { world, ItemStack } from "@minecraft/server";
import { data, save, addXp, addGold, notify, msg } from "./player.js";
import { countItem, removeItem, giveItem } from "./itemdb.js";
import { partyOf } from "./party.js";
import { CLASSES } from "./classes.js";

// k: 문자열 값 설명, v: 숫자 값 설명 (null 이면 안 씀)
export const COND_DEFS = [
  { id: "", name: "조건 없음" },
  { id: "lv", name: "레벨 이상", v: "레벨" },
  { id: "lvmax", name: "레벨 이하", v: "레벨" },
  { id: "qdone", name: "퀘스트 완료함", k: "퀘스트 ID" },
  { id: "qactive", name: "퀘스트 진행 중", k: "퀘스트 ID" },
  { id: "qready", name: "퀘스트 완료 가능", k: "퀘스트 ID" },
  { id: "qnot", name: "퀘스트 안 받음", k: "퀘스트 ID" },
  { id: "flag", name: "플래그 있음", k: "플래그 이름" },
  { id: "noflag", name: "플래그 없음", k: "플래그 이름" },
  { id: "item", name: "아이템 보유", k: "아이템 ID", v: "개수" },
  { id: "gold", name: "골드 이상", v: "골드" },
  { id: "cls", name: "직업", k: "warrior/archer/mage/cleric/novice" },
  { id: "day", name: "낮일 때" },
  { id: "night", name: "밤일 때" },
  { id: "chance", name: "확률", v: "%" },
  { id: "met", name: "만난 적 있음" },
  { id: "notmet", name: "처음 만남" },
  { id: "party", name: "파티 있음" },
];

export const ACT_DEFS = [
  { id: "", name: "없음" },
  { id: "flag", name: "플래그 켜기", k: "플래그 이름" },
  { id: "unflag", name: "플래그 끄기", k: "플래그 이름" },
  { id: "give", name: "아이템 주기", k: "아이템 ID", v: "개수" },
  { id: "take", name: "아이템 가져가기 (없으면 실패)", k: "아이템 ID", v: "개수" },
  { id: "xp", name: "경험치 주기", v: "양" },
  { id: "gold", name: "골드 (+주기 / -가져가기)", v: "양" },
  { id: "quest", name: "퀘스트 수락시키기", k: "퀘스트 ID" },
  { id: "cmd", name: "명령어 실행", k: "명령어 (/ 없이)" },
  { id: "tp", name: "순간이동", k: "x y z" },
  { id: "anim", name: "NPC 동작 바꾸기", v: "동작 번호 0~9" },
  { id: "heal", name: "체력 회복" },
  { id: "shop", name: "상점 열기" },
  { id: "end", name: "대화 종료" },
];

const isNight = () => {
  const t = world.getTimeOfDay();
  return t >= 13000 && t < 23000;
};

/** ctx = { npcId } */
export function check(p, c, ctx = {}) {
  if (!c?.t) return true;
  const d = data(p);
  const k = String(c.k ?? "");
  const v = Number(c.v ?? 0);
  switch (c.t) {
    case "lv": return d.lv >= v;
    case "lvmax": return d.lv <= v;
    case "qdone": return !!d.q.d[k];
    case "qactive": return !!d.q.a[k];
    case "qready": return !!d.q.a[k] && ctx.isComplete?.(k);
    case "qnot": return !d.q.a[k] && !d.q.d[k];
    case "flag": return !!d.flags?.[k];
    case "noflag": return !d.flags?.[k];
    case "item": return countItem(p, k.includes(":") ? k : `minecraft:${k}`) >= Math.max(1, v);
    case "gold": return d.gold >= v;
    case "cls": return d.cls === k;
    case "day": return !isNight();
    case "night": return isNight();
    case "chance": return Math.random() * 100 < v;
    case "met": return (d.met?.[ctx.npcId] ?? 0) > 0;
    case "notmet": return !(d.met?.[ctx.npcId] > 0);
    case "party": return !!partyOf(p.id);
  }
  return true;
}

export const checkAll = (p, list, ctx) => (list ?? []).every((c) => check(p, c, ctx));

export function describe(c) {
  const def = COND_DEFS.find((x) => x.id === c?.t);
  if (!def || !def.id) return "";
  return `${def.name}${c.k ? ` ${c.k}` : ""}${def.v && c.v !== undefined && c.v !== "" ? ` ${c.v}` : ""}`;
}
export function describeAct(a) {
  const def = ACT_DEFS.find((x) => x.id === a?.t);
  if (!def || !def.id) return "";
  return `${def.name}${a.k ? ` ${a.k}` : ""}${def.v && a.v !== undefined && a.v !== "" ? ` ${a.v}` : ""}`;
}

/**
 * 행동 실행. ctx = { npc, acceptQuest(id), openShop() }
 * 반환: { ok, end, shop }  (take/gold 부족이면 ok=false 로 중단)
 */
export function run(p, acts, ctx = {}) {
  const d = data(p);
  const res = { ok: true, end: false, shop: false };
  // 먼저 가져가기 계열이 가능한지 확인 (부족하면 아무것도 실행 안 함)
  for (const a of acts ?? []) {
    const id = String(a.k ?? "").includes(":") ? a.k : `minecraft:${a.k}`;
    if (a.t === "take" && countItem(p, id) < Math.max(1, Number(a.v || 1))) {
      notify(p, `§c필요한 아이템이 부족합니다`);
      return { ...res, ok: false };
    }
    if (a.t === "gold" && Number(a.v) < 0 && d.gold < -Number(a.v)) {
      notify(p, `§c골드가 부족합니다 (${-Number(a.v)}G)`);
      return { ...res, ok: false };
    }
  }
  for (const a of acts ?? []) {
    const k = String(a.k ?? "");
    const v = Number(a.v ?? 0);
    const id = k.includes(":") ? k : `minecraft:${k}`;
    try {
      switch (a.t) {
        case "flag": (d.flags = d.flags ?? {})[k] = true; break;
        case "unflag": delete d.flags?.[k]; break;
        case "give": try { new ItemStack(id, 1); giveItem(p, id, Math.max(1, v || 1)); } catch { msg(p, `§c없는 아이템: ${k}`); } break;
        case "take": removeItem(p, id, Math.max(1, v || 1)); break;
        case "xp": addXp(p, v); break;
        case "gold": addGold(p, v); break;
        case "quest": ctx.acceptQuest?.(k); break;
        case "cmd": p.runCommand(k.replace(/^\//, "")); break;
        case "tp": {
          const [x, y, z] = k.split(/[ ,]+/).map(Number);
          if ([x, y, z].every(Number.isFinite)) p.teleport({ x, y, z });
          break;
        }
        case "anim": try { ctx.npc?.setProperty("rpg:anim", Math.max(0, Math.min(9, v))); } catch {} break;
        case "heal": {
          const hp = p.getComponent("minecraft:health");
          hp.setCurrentValue(hp.effectiveMax);
          break;
        }
        case "shop": res.shop = true; break;
        case "end": res.end = true; break;
      }
    } catch (e) {
      msg(p, `§c행동 실패(${a.t}): ${e}`);
    }
  }
  save(p);
  return res;
}

export const CLASS_IDS = Object.keys(CLASSES);
