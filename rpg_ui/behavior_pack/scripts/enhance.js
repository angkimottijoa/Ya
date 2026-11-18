// 강화 (V12.131) — 대장장이 NPC 에게서만. 모바일 게임식: +1 ~ +15, 실패하면 단계만 내려감 (사라지지 않음)
//   강화석 4등급: 하급(+1~4) · 중급(+5~8) · 상급(+9~12) · 최상급(+13~15) + 골드
//   +1~+5 실패: 그대로 / +6~ 실패: 1단계 하락 — 파괴방지석으로 막을 수 있음 (+8 까지, 단계가 높을수록 더 많이)
//   실패할 때마다 그 아이템의 다음 확률 +2% (성공하면 초기화)
//   무기: 평타 · 스킬 위력 +4%/단계 (+11 부터 +8%) → +15 = +80%
//   방어구: 방어력 +6/단계 (+11 부터 +12) → +15 = 120 (부위마다) · 받는 피해 감소 = 방어력 / (방어력 + 800)
//          (바닐라 갑옷 수치는 게임이 따로 막음 — 정보 창엔 갑옷 수치 × 10 을 '기본 방어력'으로 같이 보여 줌)
import { world, system, ItemStack } from "@minecraft/server";
import { Screen, rt } from "./ui.js";
import { data, save, notify, msg } from "./player.js";
import { ICON, iconOf, itemName, weaponInfo, armorSlot, inv, countItem, removeItem } from "./itemdb.js";

export const MAX_ENH = 15;
export const STONES = [
  { id: "rpg:enh_stone_1", name: "하급 강화석", color: "§f" },
  { id: "rpg:enh_stone_2", name: "중급 강화석", color: "§a" },
  { id: "rpg:enh_stone_3", name: "상급 강화석", color: "§b" },
  { id: "rpg:enh_stone_4", name: "최상급 강화석", color: "§d" },
];
export const PROTECT = { id: "rpg:enh_protect", name: "파괴방지석", color: "§6" };
const RATE = [0, 95, 90, 85, 80, 70, 60, 50, 40, 30, 25, 20, 15, 10, 7, 5]; // 목표 단계별 성공 확률 %
const COUNT = [0, 1, 1, 2, 2, 1, 2, 2, 3, 1, 2, 2, 3, 1, 2, 3];
const tierOf = (L) => (L <= 4 ? 0 : L <= 8 ? 1 : L <= 12 ? 2 : 3);
const goldOf = (L) => 200 * L * L;
const SAFE_TO = 5; // 여기까지는 실패해도 그대로
const PROTECT_TO = 8; // 파괴방지석은 +8 까지
const protectNeed = (L) => (L > SAFE_TO && L <= PROTECT_TO ? L - SAFE_TO : 0); // +6:1 · +7:2 · +8:3

const RPG_WEAPONS = new Set(["rpg:cheongryong_sword", "rpg:baekho_axe", "rpg:jujak_bow", "rpg:hyeonmu_shield", "rpg:hundun_scythe", "rpg:qiongqi_claws", "rpg:taowu_hammer", "rpg:taotie_maw"]);
/** "weapon" | "armor" | null */
export function enhKind(it) {
  if (!it || it.maxAmount > 1) return null;
  const id = it.typeId;
  if (RPG_WEAPONS.has(id) || id.startsWith("rpg:jt_")) return "weapon";
  const slot = armorSlot(id);
  if (slot && slot !== "Offhand" && !/_head$|_skull$|carved_pumpkin|elytra/.test(id)) return "armor";
  const w = weaponInfo(id);
  if (w?.atk) return "weapon";
  return null;
}
export function getEnh(it) { try { return Number(it?.getDynamicProperty("rpg:enh") ?? 0) || 0; } catch { return 0; } }
const getFail = (it) => { try { return Number(it?.getDynamicProperty("rpg:enh_fail") ?? 0) || 0; } catch { return 0; } };
export const weaponBonus = (L) => 0.04 * Math.min(L, 10) + 0.08 * Math.max(0, L - 10);
export const armorDef = (L) => 6 * Math.min(L, 10) + 12 * Math.max(0, L - 10);
const pct = (x) => `${Math.round(x * 100)}%`;
const baseName = (it) => itemName(it); // 번역 이름(RawMessage) — 화면 · 메시지는 rt 로 이어 붙임
export const ENH_LORE = "§6§l강화 +"; // 아이템 설명 첫 줄 (이름은 바꾸지 않음: 이름표는 글자만 되어 번역 이름이 깨짐)

/** 손에 든 무기의 강화 배율 (평타 · 스킬) */
export function heldEnhMul(p) {
  try { const it = inv(p).getItem(p.selectedSlotIndex); return enhKind(it) === "weapon" ? 1 + weaponBonus(getEnh(it)) : 1; } catch { return 1; }
}
/** 방어력: { base(바닐라 갑옷 수치 × 10), enh(강화), red(강화 방어의 피해 감소 0~1) } */
export function defenseOf(p) {
  let base = 0, enh = 0;
  try { const eq = p.getComponent("minecraft:equippable"); for (const s of ["Head", "Chest", "Legs", "Feet"]) { const it = eq.getEquipment(s); if (!it) continue; base += (weaponInfo(it.typeId)?.def ?? 0) * 10; if (enhKind(it) === "armor") enh += armorDef(getEnh(it)); } } catch {}
  return { base, enh, total: base + enh, red: enh / (enh + 800) };
}

function applyLook(it, L, fail) {
  try { it.setDynamicProperty("rpg:enh", L); it.setDynamicProperty("rpg:enh_fail", fail); } catch {}
  try {
    const kind = enhKind(it);
    const lore = it.getLore().filter((l) => !l.startsWith(ENH_LORE));
    if (L > 0) lore.unshift(`${ENH_LORE}${L}§r §7(${kind === "weapon" ? `위력 +${pct(weaponBonus(L))}` : `방어력 +${armorDef(L)}`})`);
    it.setLore(lore);
  } catch {}
  return it;
}

/** 강화 대상: 가방 · 장착 중 */
function candidates(p) {
  const out = [];
  try { const c = inv(p); for (let i = 0; i < c.size; i++) { const it = c.getItem(i); if (enhKind(it)) out.push({ key: `i${i}`, it, put: (x) => c.setItem(i, x) }); } } catch {}
  try { const eq = p.getComponent("minecraft:equippable"); for (const s of ["Head", "Chest", "Legs", "Feet", "Offhand"]) { const it = eq.getEquipment(s); if (enhKind(it)) out.push({ key: `e${s}`, it, put: (x) => eq.setEquipment(s, x), eq: true }); } } catch {}
  return out;
}

function needOf(L) { return { stone: STONES[tierOf(L)], count: COUNT[L], gold: goldOf(L), protect: protectNeed(L) }; }

/** 대장장이 강화 창 (V12.131)
 *  왼쪽: 장비 목록 (장착 중 → 단계 높은 순) · 레일: 전체 / 무기 / 방어구 · 위: 골드 · 강화석 4종 · 파괴방지석 보유 수
 *  오른쪽: 단계 막대 · 효과 변화 · 확률 막대 · 실패 시 결과 · 재료 (있음 ✔ / 없음 ✘ · 얻는 곳) · 최근 결과 5개
 *  버튼: 강화 / 방지석 쓰고 강화 / 성공할 때까지 연속 강화 (최대 10회, 재료가 모자라면 멈춤) */
const TIER_COL = ["§f", "§a", "§b", "§d"];
const history = new Map(); // pid -> [문자열] 최근 결과
const pushHist = (p, line) => { const h = history.get(p.id) ?? []; h.unshift(line); history.set(p.id, h.slice(0, 5)); };
const levelBar = (L) => { let b = ""; for (let i = 1; i <= MAX_ENH; i++) b += i <= L ? `${TIER_COL[tierOf(i)]}■` : "§8■"; return `${b}§r`; };
const rateBar = (r) => { const n = Math.round(r / 5); return `${r >= 70 ? "§a" : r >= 40 ? "§e" : r >= 20 ? "§6" : "§c"}${"|".repeat(n)}§8${"|".repeat(20 - n)}§r`; };

/** 한 번 강화 (재료 확인 · 소모 · 결과 적용). 반환: { ok, NL, msg } 또는 { err } */
function enhanceOnce(p, key, typeId, useProtect) {
  const d = data(p);
  const cur = candidates(p).find((x) => x.key === key && x.it.typeId === typeId);
  if (!cur) return { err: "§c장비를 찾을 수 없습니다" };
  const it = cur.it, L = getEnh(it), fail = getFail(it);
  if (L >= MAX_ENH) return { err: "§6이미 최대 강화입니다" };
  const T = L + 1, n = needOf(T), rate = Math.min(100, RATE[T] + fail * 2);
  if (countItem(p, n.stone.id) < n.count) return { err: `§c${n.stone.name}이(가) 부족합니다` };
  if (d.gold < n.gold) return { err: "§c골드가 부족합니다" };
  const prot = useProtect && n.protect > 0;
  if (prot && countItem(p, PROTECT.id) < n.protect) return { err: "§c파괴방지석이 부족합니다" };
  removeItem(p, n.stone.id, n.count);
  d.gold -= n.gold;
  if (prot) removeItem(p, PROTECT.id, n.protect);
  save(p);
  // 재료를 빼며 칸이 바뀌었을 수 있어 다시 찾음
  const again = candidates(p).find((x) => x.key === key && x.it.typeId === typeId && getEnh(x.it) === L) ?? cur;
  const ok = Math.random() * 100 < rate;
  const NL = ok ? T : T > SAFE_TO && !prot ? L - 1 : L;
  again.put(applyLook(again.it, NL, ok ? 0 : fail + 1));
  return { ok, L, NL, rate, prot: prot && !ok && T > SAFE_TO, it: again.it };
}

export function openEnhance(p, selKey, npcName = "대장장이", filter = "all") {
  const d = data(p);
  const all = candidates(p).sort((a, b) => (b.eq ? 1 : 0) - (a.eq ? 1 : 0) || getEnh(b.it) - getEnh(a.it));
  const list = all.filter((x) => filter === "all" || enhKind(x.it) === filter);
  const sel = list.find((x) => x.key === selKey) ?? list[0];
  const scr = new Screen("L", `${npcName} / 강화`);
  const reopen = (k = sel?.key) => openEnhance(p, k, npcName, filter);
  for (const x of list) {
    const L = getEnh(x.it), r = L >= MAX_ENH ? 0 : Math.min(100, RATE[L + 1] + getFail(x.it) * 2);
    scr.item([`${L ? `${TIER_COL[tierOf(Math.max(1, L))]}§l+${L} ` : ""}§r§f`, baseName(x.it), `${x.eq ? " §2[장착]" : ""}\n§7${enhKind(x.it) === "weapon" ? "무기" : "방어구"} · ${L >= MAX_ENH ? "§6최대 강화" : `다음 +${L + 1} §f${r}%`}`],
      iconOf(x.it.typeId), () => reopen(x.key), { on: x === sel, rarity: Math.min(5, Math.ceil(L / 3)) || undefined });
  }
  scr.tab("닫기", ICON("close"), () => {});
  for (const [id, name, icon] of [["all", "전체", "all"], ["weapon", "무기", "class"], ["armor", "방어구", "armor"]]) scr.tab(name, ICON(icon), () => openEnhance(p, undefined, npcName, id), filter === id);
  scr.chip(ICON("gold"), `${d.gold}G`);
  STONES.forEach((st, i) => scr.chip(`textures/items/rpg/enh_stone_${i + 1}`, `${countItem(p, st.id)}`));
  scr.chip("textures/items/rpg/enh_protect", `${countItem(p, PROTECT.id)}`);
  const hist = history.get(p.id) ?? [];
  const histTxt = hist.length ? `\n\n§e§l최근 결과§r\n${hist.join("\n")}` : "";
  if (!sel) {
    scr.select("강화할 장비 없음", ICON("class"));
    scr.body(`§7무기나 방어구를 가방에 넣거나 입고 오세요.\n\n§e§l강화석§r\n§f하급 +1~4 · §a중급 +5~8 · §b상급 +9~12 · §d최상급 +13~15\n§7몹을 잡으면 떨어지고, 보스는 상급 · 최상급을 줍니다.${histTxt}`);
    return scr.show(p);
  }
  const it = sel.it, L = getEnh(it), kind = enhKind(it), fail = getFail(it);
  const fmt = kind === "weapon" ? (l) => `+${pct(weaponBonus(l))}` : (l) => `+${armorDef(l)}`, what = kind === "weapon" ? "위력" : "방어력";
  const lines = [`§l${L ? `${TIER_COL[tierOf(Math.max(1, L))]}+${L} ` : ""}§f`, baseName(it), `§r\n§7${kind === "weapon" ? "무기 · 평타와 스킬 위력" : "방어구 · 방어력 (받는 피해 감소)"}\n\n${levelBar(L)} §f§l${L}§r§7/${MAX_ENH}\n\n`];
  scr.select(rt(baseName(it)), iconOf(it.typeId));
  if (L >= MAX_ENH) {
    lines.push(`§6§l최대 강화 달성§r\n§7${what} §f${fmt(L)}${histTxt}`);
    scr.body(rt(lines));
    scr.reopen = () => reopen();
    return scr.show(p);
  }
  const T = L + 1, n = needOf(T), rate = Math.min(100, RATE[T] + fail * 2);
  const have = countItem(p, n.stone.id), haveP = countItem(p, PROTECT.id);
  const can = have >= n.count && d.gold >= n.gold;
  lines.push(`§7${what} §f${fmt(L)} §7▶ §a§l${fmt(T)}§r\n\n`);
  lines.push(`§7성공 확률 §e§l${rate}%§r${fail ? ` §7(기본 ${RATE[T]}% + 실패 보정 ${fail * 2}%)` : ""}\n${rateBar(rate)}\n`);
  lines.push(`§7실패하면 ${T <= SAFE_TO ? "§a단계 유지" : `§c+${L - 1} 로 하락`}§r${n.protect ? `§7 · 파괴방지석 ${n.protect}개면 유지` : T > PROTECT_TO ? "§7 · 방지석으로 못 막는 구간" : ""}\n\n`);
  lines.push(`§e§l필요 재료§r\n${n.stone.color}${n.stone.name} §f${have}§7/${n.count} ${have >= n.count ? "§a✔" : "§c✘ 몹 · 보스에게서"}\n§6골드 §f${d.gold}§7/${n.gold} ${d.gold >= n.gold ? "§a✔" : "§c✘"}\n`);
  if (n.protect) lines.push(`${PROTECT.color}파괴방지석 §f${haveP}§7/${n.protect} §7(선택) ${haveP >= n.protect ? "§a✔" : "§8✘"}\n`);
  // 다음 몇 단계 미리 보기
  const peek = []; for (let t = T + 1; t <= Math.min(MAX_ENH, T + 3); t++) { const m = needOf(t); peek.push(`§7+${t} ${RATE[t]}% · ${m.stone.color}${m.stone.name.replace(" 강화석", "")} ${m.count}§7 · ${m.gold}G${m.protect ? ` · 방지 ${m.protect}` : ""}`); }
  if (peek.length) lines.push(`\n§e§l다음 단계§r\n${peek.join("\n")}`);
  lines.push(histTxt);
  scr.body(rt(lines));
  const result = (r) => {
    if (r.err) { notify(p, r.err); p.playSound("note.bass"); return false; }
    const at = { ...p.location, y: p.location.y + 1 };
    if (r.ok) {
      p.playSound("random.totem", { volume: 0.6, pitch: 1.4 });
      try { p.dimension.spawnParticle("minecraft:totem_particle", at); } catch {}
      p.onScreenDisplay.setTitle(`§e§l+${r.NL} 성공!`, { subtitle: rt("§f", baseName(r.it)), fadeInDuration: 2, stayDuration: 30, fadeOutDuration: 8 });
      pushHist(p, `§a성공 §f+${r.L} → +${r.NL} §7(${r.rate}%)`);
      if (r.NL >= 12) world.sendMessage(rt(`§6§l[강화] §r§f${p.name} 님이 §e§l+${r.NL} `, baseName(r.it), "§r§f 강화에 성공했습니다!"));
    } else {
      p.playSound("random.anvil_land", { volume: 0.6, pitch: 0.7 });
      try { p.dimension.spawnParticle("minecraft:large_smoke_particle", at); } catch {}
      const sub = r.NL < r.L ? `§c+${r.L} → +${r.NL}` : r.prot ? "§6파괴방지석이 하락을 막았습니다" : "§7단계 유지";
      p.onScreenDisplay.setTitle("§c§l강화 실패", { subtitle: sub, fadeInDuration: 2, stayDuration: 30, fadeOutDuration: 8 });
      pushHist(p, `§c실패 §f+${r.L} → +${r.NL} §7(${r.rate}%)${r.prot ? " §6방지" : ""}`);
    }
    return true;
  };
  scr.action(can ? `§a§l강화하기 §r§7(${rate}%)` : "§7강화하기 (재료 부족)", () => { result(enhanceOnce(p, sel.key, it.typeId, false)); return reopen(); });
  if (n.protect) scr.action(haveP >= n.protect ? `§6방지석 ${n.protect}개 쓰고 강화` : `§8방지석 쓰고 강화 (방지석 부족)`, () => { result(enhanceOnce(p, sel.key, it.typeId, true)); return reopen(); });
  const chain = (auto) => () => {
    let tries = 0, done = false;
    const step = () => {
      if (done || tries >= 10) return reopen();
      tries++;
      const r = enhanceOnce(p, sel.key, it.typeId, auto); // 방지석은 「방지석 쓰며 연속」을 고른 때만
      if (!result(r) || r.ok) { done = true; return reopen(); }
      system.runTimeout(step, 8); // 0.4초 간격 (결과 연출이 보이게)
    };
    step();
  };
  scr.action("§b성공할 때까지 연속 강화 §7(최대 10회 · 재료 모자라면 멈춤)", chain(false));
  if (n.protect) scr.action("§6방지석 쓰며 연속 강화 §7(최대 10회)", chain(true));
  scr.reopen = () => reopen();
  return scr.show(p);
}

/** 아이템 창(배낭)에 붙일 강화 설명 */
export function enhLines(it) {
  const kind = enhKind(it);
  if (!kind) return "";
  const L = getEnh(it), fmt = kind === "weapon" ? (l) => `+${pct(weaponBonus(l))}` : (l) => `+${armorDef(l)}`, what = kind === "weapon" ? "위력" : "방어력";
  let s = `\n§6§l강화 +${L}§r §7/ ${MAX_ENH}\n§6${"■".repeat(L)}§8${"■".repeat(MAX_ENH - L)}\n§7${what} §f${fmt(L)}`;
  if (L < MAX_ENH) { const T = L + 1, n = needOf(T); s += `\n§7다음 +${T}: §f${what} ${fmt(T)} §7· 확률 ${Math.min(100, RATE[T] + getFail(it) * 2)}% · ${n.stone.name} ${n.count} · ${n.gold}G`; }
  return s + "\n§8강화는 대장장이에게서\n";
}

// 강화석 떨어뜨리기: 적대 몹 · 보스
const BOSS = new Set(["minecraft:wither", "minecraft:ender_dragon", "minecraft:warden", "minecraft:elder_guardian"]);
world.afterEvents.entityDie.subscribe(({ deadEntity: e, damageSource }) => {
  try {
    if (damageSource?.damagingEntity?.typeId !== "minecraft:player") return;
    const loc = { ...e.location, y: e.location.y + 0.5 }, dim = e.dimension;
    const drop = (id, n = 1) => { try { dim.spawnItem(new ItemStack(id, n), loc); } catch {} };
    if (BOSS.has(e.typeId)) { drop(STONES[3].id, 2); drop(STONES[2].id, 4); drop(PROTECT.id, 3); return; }
    let monster = false; try { monster = e.matches({ families: ["monster"] }); } catch {}
    if (!monster) return;
    const r = Math.random() * 100;
    if (r < 0.15) drop(STONES[3].id); else if (r < 0.75) drop(STONES[2].id); else if (r < 2.75) drop(STONES[1].id); else if (r < 8.75) drop(STONES[0].id);
    if (Math.random() * 100 < 0.8) drop(PROTECT.id);
  } catch {}
});
