// 아이템 설명 (V12.132): 사신수 · 사흉수 · 직업 도구에 짧은 설명줄을 붙임 (이름엔 군더더기 없이)
//   첫 줄 강화 (enhance.js) · 분류 · 한 줄 설정 · 공격력 · 「자세히: 배낭」 — 긴 설명은 배낭 > 자세히 보기
import { system, world } from "@minecraft/server";
import * as J from "./jobs.js";
import { ENH_LORE, STONES, PROTECT, SCROLLS, setInfoLookup, atkLine } from "./enhance.js";
import { setRpgName, setToolRarity } from "./itemdb.js";
import { ITEM_ATK } from "./item_atk.js";

export const LORE_INFO = {
  "rpg:cheongryong_sword": { cat: "사신수 무기 · 창", atk: 180, flavor: "동방을 지키는 푸른 용, 청룡의 창. 물살과 번개를 다스린다." },
  "rpg:baekho_axe": { cat: "사신수 무기 · 도끼", atk: 180, flavor: "서방을 지키는 흰 범, 백호의 도끼. 바람처럼 달려 적을 찢는다." },
  "rpg:jujak_bow": { cat: "사신수 무기 · 활", atk: 90, flavor: "남방을 지키는 붉은 새, 주작의 활. 시위에 불꽃이 깃든다." },
  "rpg:hyeonmu_shield": { cat: "사신수 무기 · 방패", atk: 100, flavor: "북방을 지키는 거북과 뱀, 현무의 방패. 대지와 독으로 지킨다." },
  "rpg:heukryong_sword": { cat: "흑룡 무기 · 곡도", atk: 360, flavor: "사신수마저 굽어보는 검은 용, 흑룡의 검. 보랏빛 용맥이 흐르고 사슬과 날개로 하늘을 누빈다." },
  "rpg:hundun_scythe": { cat: "사흉수 무기 · 낫", atk: 140, flavor: "사흉 혼돈의 낫. 형체 없는 연기와 사슬로 모든 것을 옭아맨다." },
  "rpg:qiongqi_claws": { cat: "사흉수 무기 · 쌍발톱", atk: 140, flavor: "사흉 궁기의 발톱. 날개 달린 범은 표식한 먹잇감을 놓치지 않는다." },
  "rpg:taowu_hammer": { cat: "사흉수 무기 · 대망치", atk: 150, flavor: "사흉 도올의 망치. 멈출 줄 모르는 폭주로 대지를 뒤흔든다." },
  "rpg:taotie_maw": { cat: "사흉수 무기 · 아가리", atk: 120, flavor: "사흉 도철의 아가리. 끝없는 허기로 무엇이든 삼킨다." },
};
const TIER_TXT = ["", "1차", "2차", "3차"];
/** 이 아이템의 정보 { cat, atk, flavor } (없으면 null) */
export function loreInfo(typeId) {
  if (LORE_INFO[typeId]) return { ...LORE_INFO[typeId], atk: ITEM_ATK[typeId] ?? LORE_INFO[typeId].atk };
  const path = J.pathOfTool(typeId), pt = path && J.PATHS[path];
  if (!pt) return null;
  return { cat: `${TIER_TXT[pt.tier] ?? ""} ${pt.name} 전용 도구`, atk: ITEM_ATK[typeId] ?? Math.round((pt.tool?.dmg ?? 0) * 1.5) * 10, flavor: pt.desc ?? "" };
}
function wantLore(it) {
  const i = loreInfo(it.typeId);
  if (!i) return null;
  return [`§7${i.cat}`, `§b● 공격력 §f${atkLine(i.atk, it)}`, "§8자세히: 배낭 > 자세히 보기"]; // 한 줄 설정은 배낭 > 자세히 보기에만
}
/** 2초마다: 가방의 무기 설명줄이 다르면 고침 (강화 줄은 그대로 맨 위) */
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    let c; try { c = p.getComponent("minecraft:inventory").container; } catch { continue; }
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      const want = it && wantLore(it);
      if (!want) continue;
      try {
        const cur = it.getLore(), enh = cur.filter((l) => l.startsWith(ENH_LORE));
        const next = [...enh, ...want];
        if (cur.length === next.length && cur.every((l, k) => l === next[k])) continue;
        it.setLore(next);
        c.setItem(i, it);
      } catch {}
    }
  }
}, 40);

// 이름 등록 (배낭 · 강화 창 · 자세히 보기에서 번역 키 대신)
const NAMES = { "rpg:cheongryong_sword": "§b청룡의 검", "rpg:baekho_axe": "§f백호의 도끼", "rpg:jujak_bow": "§6주작의 활", "rpg:hyeonmu_shield": "§2현무의 방패",
  "rpg:heukryong_sword": "§5흑룡의 검", "rpg:hundun_scythe": "§5혼돈의 낫", "rpg:qiongqi_claws": "§c궁기의 쌍발톱", "rpg:taowu_hammer": "§6도올의 대망치", "rpg:taotie_maw": "§2도철의 아가리" };
for (const [id, n] of Object.entries(NAMES)) setRpgName(id, n);
for (const [path, pt] of Object.entries(J.PATHS)) if (pt.tool?.name) { setRpgName(`rpg:jt_${path}`, pt.tool.name); setToolRarity(`rpg:jt_${path}`, Math.min(5, (pt.tier ?? 1) + 2)); }
for (const st of [...STONES, ...SCROLLS, PROTECT]) setRpgName(st.id, `${st.color}${st.name}`);
setInfoLookup(loreInfo); // 연성소의 「현재 공격력」 · 분류
