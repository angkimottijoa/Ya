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
/** 강화 주문서 (V12.134): 한 번 강화할 때 1장 써서 성공 확률을 더함 */
export const SCROLLS = [
  { id: "rpg:enh_scroll_1", name: "하급 강화 주문서", bonus: 5, color: "§a" },
  { id: "rpg:enh_scroll_2", name: "중급 강화 주문서", bonus: 10, color: "§9" },
  { id: "rpg:enh_scroll_3", name: "상급 강화 주문서", bonus: 20, color: "§d" },
];
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

/** 설명 · 배낭에 쓰는 공격력 글자: 강화되면 「100 (+10)」처럼 강화 반영 값 + 늘어난 만큼 (V12.136) */
export function atkLine(base, it) {
  const L = enhKind(it) === "weapon" ? getEnh(it) : 0;
  if (!L || !base) return `${base}`;
  const v = Math.round(base * (1 + weaponBonus(L)));
  return `${v} §a(+${v - base})`;
}
/** 방어구 방어력 글자: 기본(갑옷 수치 × 10) + 강화 */
export function defLine(baseDef, it) {
  const L = enhKind(it) === "armor" ? getEnh(it) : 0, b = baseDef * 10;
  return L ? `${b + armorDef(L)} §a(+${armorDef(L)})` : `${b}`;
}

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

/** 한 번 강화 (재료 확인 · 소모 · 결과 적용). scroll: SCROLLS 번호 (-1 = 안 씀). 반환: { ok, NL, msg } 또는 { err } */
function enhanceOnce(p, key, typeId, useProtect, scroll = -1) {
  const d = data(p);
  const cur = candidates(p).find((x) => x.key === key && x.it.typeId === typeId);
  if (!cur) return { err: "§c장비를 찾을 수 없습니다" };
  const it = cur.it, L = getEnh(it), fail = getFail(it);
  if (L >= MAX_ENH) return { err: "§6이미 최대 강화입니다" };
  const T = L + 1, n = needOf(T), sc = SCROLLS[scroll], rate = rateOf(T, fail, scroll);
  if (countItem(p, n.stone.id) < n.count) return { err: `§c${n.stone.name}이(가) 부족합니다` };
  if (d.gold < n.gold) return { err: "§c골드가 부족합니다" };
  if (sc && countItem(p, sc.id) < 1) return { err: `§c${sc.name}이(가) 없습니다` };
  const prot = useProtect && n.protect > 0;
  if (prot && countItem(p, PROTECT.id) < n.protect) return { err: "§c파괴방지석이 부족합니다" };
  removeItem(p, n.stone.id, n.count);
  d.gold -= n.gold;
  if (prot) removeItem(p, PROTECT.id, n.protect);
  if (sc) removeItem(p, sc.id, 1);
  save(p);
  // 재료를 빼며 칸이 바뀌었을 수 있어 다시 찾음
  const again = candidates(p).find((x) => x.key === key && x.it.typeId === typeId && getEnh(x.it) === L) ?? cur;
  const ok = Math.random() * 100 < rate;
  const NL = ok ? T : T > SAFE_TO && !prot ? L - 1 : L;
  again.put(applyLook(again.it, NL, ok ? 0 : fail + 1));
  return { ok, L, NL, rate, prot: prot && !ok && T > SAFE_TO, it: again.it };
}

/** 성공 확률 = 기본 + 실패 보정(+2%/회) + 주문서 (최대 100) */
const rateOf = (T, fail, scroll = -1) => Math.min(100, RATE[T] + fail * 2 + (SCROLLS[scroll]?.bonus ?? 0));

/** 강화 창 1단계: 장비 고르기 (V12.134) — 누르면 바로 연성소로 */
export function openEnhance(p, selKey, npcName = "대장장이", filter = "all") {
  const d = data(p);
  const all = candidates(p).sort((a, b) => (b.eq ? 1 : 0) - (a.eq ? 1 : 0) || getEnh(b.it) - getEnh(a.it));
  const list = all.filter((x) => filter === "all" || enhKind(x.it) === filter);
  // 배낭과 같은 격자 (V12.135): 칸 색 = 강화 구간, 아래 숫자 = +단계 · 누르면 바로 연성소
  const scr = new Screen("G", `${npcName} / 강화`);
  for (const x of list.slice(0, 30)) {
    const L = getEnh(x.it);
    scr.item(L ? `${TIER_COL[tierOf(L)]}+${L}` : x.eq ? "§2장착" : "§7+0", iconOf(x.it.typeId), () => { lastRes.delete(p.id); return openForge(p, x.key, x.it.typeId, npcName, filter); },
      { rarity: L >= 13 ? 5 : L >= 9 ? 4 : L >= 5 ? 3 : L >= 1 ? 2 : 1 });
  }
  scr.tab("닫기", ICON("close"), () => {});
  for (const [id, name, icon] of [["all", "전체", "all"], ["weapon", "무기", "class"], ["armor", "방어구", "armor"]]) scr.tab(name, ICON(icon), () => openEnhance(p, undefined, npcName, id), filter === id);
  scr.chip(ICON("gold"), `${d.gold}G`);
  STONES.forEach((st, i) => scr.chip(`textures/items/rpg/enh_stone_${i + 1}`, `${countItem(p, st.id)}`));
  SCROLLS.forEach((sc, i) => scr.chip(`textures/items/rpg/enh_scroll_${i + 1}`, `${countItem(p, sc.id)}`));
  scr.chip("textures/items/rpg/enh_protect", `${countItem(p, PROTECT.id)}`);
  const hist = history.get(p.id) ?? [];
  const histTxt = hist.length ? `\n\n§e§l최근 결과§r\n${hist.join("\n")}` : "";
  const guide = `§e§l강화석§r\n§f하급 +1~4 · §a중급 +5~8 · §b상급 +9~12 · §d최상급 +13~15\n\n§e§l강화 주문서§r §7(한 번에 1장, 확률 더하기)\n${SCROLLS.map((s) => `${s.color}${s.name} §f+${s.bonus}%`).join("\n")}\n\n§7몹을 잡으면 떨어지고, 보스는 상급 재료를 줍니다.`;
  if (!list.length) {
    scr.select("강화할 장비 없음", ICON("class"));
    scr.body(`§7무기나 방어구를 가방에 넣거나 입고 오세요.\n\n${guide}${histTxt}`);
    return scr.show(p);
  }
  scr.select(`${npcName}의 연성소`, ICON("class"));
  scr.body(`§f강화할 장비를 누르면 §e§l연성소§r§f로 넘어갑니다.\n§7칸 색: 흰 +0 · 초록 +1~4 · 파랑 +5~8 · 보라 +9~12 · 주황 +13~\n\n${guide}${histTxt}`);
  scr.reopen = () => openEnhance(p, selKey, npcName, filter);
  return scr.show(p);
}

const pick = new Map(); // pid -> { scroll, protect } 연성소에서 고른 주문서 · 방지석 사용
const lastRes = new Map(); // pid -> 연성소 결과 띠 글자 (장비를 새로 고르면 지움)
const comma = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
let infoLookup = () => null; // itemlore.js 가 등록: id → { cat, atk } (사신수 · 사흉수 · 직업 도구)
export function setInfoLookup(fn) { infoLookup = fn; }
const baseAtk = (id) => infoLookup(id)?.atk || (weaponInfo(id)?.atk ?? 0);
const catOf = (id) => infoLookup(id)?.cat ?? weaponInfo(id)?.kind ?? "장비";
const FORGE = "textures/ui/rpg/forge/";
const STONE_TEX = (i) => `textures/items/rpg/enh_stone_${i + 1}`;
const SCROLL_TEX = (i) => `textures/items/rpg/enh_scroll_${i + 1}`;

/** 강화 결과 연출 (제목 · 소리 · 기록) */
function showResult(p, r) {
  if (r.err) { notify(p, r.err); p.playSound("note.bass"); return false; }
  const at = { ...p.location, y: p.location.y + 1 };
  if (r.ok) {
    p.playSound("random.totem", { volume: 0.6, pitch: 1.4 });
    try { p.dimension.spawnParticle("minecraft:totem_particle", at); } catch {}
    p.onScreenDisplay.setTitle(`§e§l+${r.NL} 성공!`, { subtitle: rt("§f", baseName(r.it)), fadeInDuration: 2, stayDuration: 30, fadeOutDuration: 8 });
    pushHist(p, `§a성공 §f+${r.L} → +${r.NL} §7(${r.rate}%)`);
    lastRes.set(p.id, `§a§l강화 성공!  §r§f+${r.L} → §a§l+${r.NL}`);
    if (r.NL >= 12) world.sendMessage(rt(`§6§l[강화] §r§f${p.name} 님이 §e§l+${r.NL} `, baseName(r.it), "§r§f 강화에 성공했습니다!"));
  } else {
    p.playSound("random.anvil_land", { volume: 0.6, pitch: 0.7 });
    try { p.dimension.spawnParticle("minecraft:large_smoke_particle", at); } catch {}
    const sub = r.NL < r.L ? `§c+${r.L} → +${r.NL}` : r.prot ? "§6파괴방지석이 하락을 막았습니다" : "§7단계 유지";
    p.onScreenDisplay.setTitle("§c§l강화 실패", { subtitle: sub, fadeInDuration: 2, stayDuration: 30, fadeOutDuration: 8 });
    pushHist(p, `§c실패 §f+${r.L} → +${r.NL} §7(${r.rate}%)${r.prot ? " §6방지" : ""}`);
    lastRes.set(p.id, `§c§l강화 실패  §r${r.NL < r.L ? `§f+${r.L} → §c+${r.NL}` : r.prot ? "§6방지석이 단계를 지켰습니다" : "§7단계 유지"}`);
  }
  return true;
}

/** 주문서 고르기 (대화창 모양) */
function openScrollPick(p, back) {
  const ch = pick.get(p.id) ?? { scroll: -1, protect: false };
  pick.set(p.id, ch);
  const scr = new Screen("D", "강화 주문서");
  scr.body("§f강화할 때마다 §e1장§f 써서 성공 확률을 더합니다.\n§7다 쓰면 저절로 「안 씀」으로 돌아갑니다.");
  scr.item(`${ch.scroll < 0 ? "§a▶ " : ""}§f안 씀`, ICON("close"), () => { ch.scroll = -1; return back(); });
  SCROLLS.forEach((sc, i) => {
    const have = countItem(p, sc.id);
    scr.item(`${ch.scroll === i ? "§a▶ " : ""}${sc.color}${sc.name} §f+${sc.bonus}% §7(보유 ${have})`, SCROLL_TEX(i), () => {
      if (have < 1) { notify(p, `§c${sc.name}이(가) 없습니다 §7(몹 · 보스에게서)`); p.playSound("note.bass"); } else ch.scroll = i;
      return back();
    });
  });
  scr.reopen = back;
  return scr.show(p);
}

/** 강화 창 2단계: 연성소 (V12.135) — 기존 메뉴 틀 안에 [RPG:F] 레이아웃
 *  위: 주문서 칸 · 가운데 아이템(큰 +단계) · 파괴방지석 칸 / 아래: 현재 수치 → 성공 시 · 확률 막대 · 재료 / 큰 강화 버튼 */
export function openForge(p, key, typeId, npcName = "대장장이", filter = "all") {
  const d = data(p);
  const sel = candidates(p).find((x) => x.key === key && x.it.typeId === typeId) ?? candidates(p).find((x) => x.key === key);
  const back = () => openEnhance(p, undefined, npcName, filter);
  if (!sel) return back();
  const it = sel.it, L = getEnh(it), kind = enhKind(it), fail = getFail(it);
  const ch = pick.get(p.id) ?? { scroll: -1, protect: false };
  if (ch.scroll >= 0 && countItem(p, SCROLLS[ch.scroll].id) < 1) ch.scroll = -1; // 다 쓰면 자동으로 해제
  pick.set(p.id, ch);
  const reopen = () => openForge(p, sel.key, it.typeId, npcName, filter);
  const weapon = kind === "weapon";
  const scr = new Screen("F", `${weapon ? "무기" : "방어구"} 강화`);
  // 제목 아래 작은 줄: 방금 결과가 있으면 결과, 없으면 대장장이 이름
  scr.raw("[FU]", lastRes.get(p.id) ?? `§7${npcName}`, "", null);
  scr.raw("[FX]", "", "", () => {});
  scr.tab("돌아가기", ICON("back"), back);
  scr.tab("닫기", ICON("close"), () => {});
  scr.chip(ICON("gold"), `${comma(d.gold)}G`);
  STONES.forEach((st, i) => scr.chip(STONE_TEX(i), `${countItem(p, st.id)}`));
  scr.chip("textures/items/rpg/enh_protect", `${countItem(p, PROTECT.id)}`);

  const T = L + 1, n = L < MAX_ENH ? needOf(T) : null, sc = SCROLLS[ch.scroll];
  // 위 왼쪽: 주문서 칸
  scr.raw(`[FL]${sc ? "[ON]" : ""}`, sc ? `${sc.color}${sc.name.replace(" 강화", "")}\n§a확률 +${sc.bonus}%` : "§e강화 주문서\n§7비어 있음", SCROLL_TEX(sc ? ch.scroll : 0), () => openScrollPick(p, reopen));
  // 위 오른쪽: 파괴방지석 칸
  const useP = !!(ch.protect && n?.protect);
  if (n?.protect) {
    const haveP = countItem(p, PROTECT.id);
    scr.raw(`[FR]${useP ? "[ON]" : ""}`, `§e파괴방지석\n${useP ? `§a사용 · ${n.protect}개` : `§7${n.protect}개 · 누르면 사용`}${haveP < n.protect ? " §c(부족)" : ""}`, "textures/items/rpg/enh_protect", () => { ch.protect = !ch.protect; return reopen(); });
  } else {
    scr.raw("[FR]", `§7파괴방지석\n§8${!n ? "-" : T <= SAFE_TO ? "+6 부터 필요" : "+9 부터 못 씀"}`, "textures/items/rpg/enh_protect", () => { notify(p, !n ? "§6최대 강화입니다" : T <= SAFE_TO ? "§7+5 까지는 실패해도 단계가 떨어지지 않습니다" : "§c+9 부터는 파괴방지석을 쓸 수 없습니다"); return reopen(); });
  }
  // 가운데: 아이템 · 큰 +단계 · 분류
  scr.raw("[FC]", rt("§f", baseName(it)), iconOf(it.typeId), null);
  scr.raw("[FV]", `${L ? TIER_COL[tierOf(L)] : "§7"}+${L}`, "", null);
  scr.raw("[FS]", `${catOf(it.typeId)}`, "", null);
  // 아래: 수치
  const base = weapon ? baseAtk(it.typeId) : (weaponInfo(it.typeId)?.def ?? 0) * 10;
  const val = (l) => (weapon ? Math.round(base * (1 + weaponBonus(l))) : base + armorDef(l));
  const what = weapon ? "공격력" : "방어력";
  const row = (k, v) => { scr.raw("[FK]", k, "", null); scr.raw("[FW]", v, "", null); };
  row(`현재 ${what}`, `§f${comma(val(L))}`);
  if (!n) {
    row("강화 단계", "§6최대 강화 달성");
    scr.raw("[FB]", "§a완료", `${FORGE}bar_100`, null);
    scr.raw("[FP]", `§f${L} §7/ ${MAX_ENH}`, `${FORGE}pips_${L}`, null);
    scr.raw("[FG]", "§6최대 강화", "", reopen);
    scr.raw("[FZ]", "돌아가기", "", back);
    scr.reopen = reopen;
    return scr.show(p);
  }
  const rate = rateOf(T, fail, ch.scroll);
  const have = countItem(p, n.stone.id), haveP = countItem(p, PROTECT.id);
  const can = have >= n.count && d.gold >= n.gold && (!useP || haveP >= n.protect);
  row("강화 성공 시", `§f${comma(val(L))} §a→ §a§l${comma(val(T))}`);
  row("실패 시", T <= SAFE_TO ? "§a단계 유지" : useP ? "§6방지석으로 유지" : `§c+${L - 1} 로 하락`);
  const rc = rate >= 70 ? "§a" : rate >= 40 ? "§e" : rate >= 20 ? "§6" : "§c";
  scr.raw("[FB]", `${rc}${rate}%`, `${FORGE}bar_${Math.round(rate / 5) * 5}`, null);
  scr.raw("[FP]", `§f${L} §7/ ${MAX_ENH}`, `${FORGE}pips_${L}`, null);
  // 재료
  scr.raw("[FM]", `${have >= n.count ? "§f" : "§c"}${n.stone.name.replace(" 강화석", "석")} ×${n.count}`, STONE_TEX(tierOf(T)), null);
  scr.raw("[FM]", `${d.gold >= n.gold ? "§f" : "§c"}${comma(n.gold)}G`, ICON("gold"), null);
  if (sc) scr.raw("[FM]", "§f주문서 ×1", SCROLL_TEX(ch.scroll), null);
  if (useP) scr.raw("[FM]", `${haveP >= n.protect ? "§f" : "§c"}방지석 ×${n.protect}`, "textures/items/rpg/enh_protect", null);
  // 버튼
  scr.raw("[FA]", "§b연속 강화", "", () => {
    let tries = 0;
    const step = () => {
      if (tries >= 10) return reopen();
      tries++;
      const c = pick.get(p.id) ?? ch;
      if (c.scroll >= 0 && countItem(p, SCROLLS[c.scroll].id) < 1) { notify(p, "§e주문서를 다 써서 멈췄습니다"); return reopen(); }
      const r = enhanceOnce(p, sel.key, it.typeId, useP, c.scroll);
      if (!showResult(p, r) || r.ok) return reopen();
      system.runTimeout(step, 8); // 0.4초 간격 (결과 연출이 보이게)
    };
    step();
  });
  scr.raw("[FG]", can ? `${weapon ? "무기" : "방어구"} 강화` : "§7재료가 부족합니다", "", () => { showResult(p, enhanceOnce(p, sel.key, it.typeId, useP, ch.scroll)); return reopen(); });
  scr.raw("[FZ]", "돌아가기", "", back);
  scr.reopen = reopen;
  return scr.show(p);
}

/** 아이템 창(배낭)에 붙일 강화 설명 */
export function enhLines(it) {
  const kind = enhKind(it);
  if (!kind) return "";
  const L = getEnh(it), fmt = kind === "weapon" ? (l) => `+${pct(weaponBonus(l))}` : (l) => `+${armorDef(l)}`, what = kind === "weapon" ? "위력" : "방어력";
  let s = `\n§6§l강화 +${L}§r §7/ ${MAX_ENH}\n§6${"■".repeat(L)}§8${"■".repeat(MAX_ENH - L)}\n§7${what} §f${fmt(L)}`;
  if (L < MAX_ENH) { const T = L + 1, n = needOf(T); s += `\n§7다음 +${T}: §f${what} ${fmt(T)} §7· 확률 ${rateOf(T, getFail(it))}% · ${n.stone.name} ${n.count} · ${n.gold}G`; }
  return s + "\n§8강화는 대장장이에게서\n";
}

// 강화석 떨어뜨리기: 적대 몹 · 보스
const BOSS = new Set(["minecraft:wither", "minecraft:ender_dragon", "minecraft:warden", "minecraft:elder_guardian"]);
world.afterEvents.entityDie.subscribe(({ deadEntity: e, damageSource }) => {
  try {
    if (damageSource?.damagingEntity?.typeId !== "minecraft:player") return;
    const loc = { ...e.location, y: e.location.y + 0.5 }, dim = e.dimension;
    const drop = (id, n = 1) => { try { dim.spawnItem(new ItemStack(id, n), loc); } catch {} };
    if (BOSS.has(e.typeId)) { drop(STONES[3].id, 2); drop(STONES[2].id, 4); drop(PROTECT.id, 3); drop(SCROLLS[2].id, 2); drop(SCROLLS[1].id, 3); return; }
    let monster = false; try { monster = e.matches({ families: ["monster"] }); } catch {}
    if (!monster) return;
    const r = Math.random() * 100;
    if (r < 0.15) drop(STONES[3].id); else if (r < 0.75) drop(STONES[2].id); else if (r < 2.75) drop(STONES[1].id); else if (r < 8.75) drop(STONES[0].id);
    if (Math.random() * 100 < 0.8) drop(PROTECT.id);
    const s = Math.random() * 100; // 주문서: 상급 0.05% · 중급 0.3% · 하급 1.2%
    if (s < 0.05) drop(SCROLLS[2].id); else if (s < 0.35) drop(SCROLLS[1].id); else if (s < 1.55) drop(SCROLLS[0].id);
  } catch {}
});
