// 직업 스킬 시스템 (V2.7)
// - 직업 승급 단계(jobs.js)마다 "전용 도구"가 있고, 그 도구를 들면 그 단계 스킬 3개를 쓴다.
//     ① 클릭(사용 / 모바일: 길게 누르기)   ② 쉬프트+클릭   ③ 쉬프트+점프
// - 효과는 ms.js (자바 MagicSpells 를 옮긴 엔진) + spellbook.js (새로 만든 스펠) 로 연출한다.
// - 무기 분류(WCLASS)는 일반 공격력 설정(제작자 도구 > 무기)용으로 남겨 둔다.
import { world, system, MolangVariableMap } from "@minecraft/server";
import { getJSON, setJSON } from "./db.js";
import { data, save, stat, notify, maxMp, isAdmin } from "./player.js";
import { weaponInfo, inv } from "./itemdb.js";
import * as J from "./jobs.js";
import * as M from "./ms.js";
import * as SB from "./spellbook.js";
import * as MSR from "./msrun.js";
import { WEAPON_SKILLS as CR_SKILLS } from "./cheongryong.js";
import { WEAPON_SKILLS as BH_SKILLS } from "./baekho.js";
import { WEAPON_SKILLS as JJ_SKILLS, releaseAim as jjRelease } from "./jujak.js";
import * as HM from "./hyeonmu.js";
import { WEAPON_SKILLS as FD_SKILLS } from "./fiends.js";
import { WEAPON_SKILLS as HR_SKILLS } from "./heukryong.js";
import { WR } from "./warrior.js";
import { MG } from "./mage.js";
import { RP } from "./reaper.js";
import { HJ } from "./hidden_jobs.js";
const RUN = { ...WR, ...MG, ...RP, ...HJ }; // 직업 스킬 (전사 · 마법사 계열 · 히든 영혼 수확자)
import { isSkillLocked } from "./skill_lock.js";
import * as WRULES from "./world_rules.js";
import { combatStats, powOf, powOfR } from "./combat.js";
import { heldEnhMul } from "./enhance.js";
const WEAPON_SKILLS = { ...CR_SKILLS, ...BH_SKILLS, ...JJ_SKILLS, ...HM.WEAPON_SKILLS, ...FD_SKILLS, ...HR_SKILLS };

// ───────── 밸런스 (V12.109) ─────────
// 사신수 · 사흉수 스킬: [재사용 대기(초), 마나]
const WEAPON_TUNE = { // V12.112: ③ 쉬프트+점프 · ④ 쉬프트 두 번 은 청룡 강림(③ 120초) 기준으로 위력에 맞춰, ② 는 짧게
  w_cr_1: [4, 40], w_cr_2: [20, 120], w_cr_3: [120, 320], w_cr_4: [90, 260],     // 강림 · 천룡추
  w_bh_1: [3, 35], w_bh_2: [16, 100], w_bh_3: [75, 200], w_bh_4: [110, 300],     // 습격 · 천붕
  w_jj_1: [0.35, 15], w_jj_2: [18, 110], w_jj_3: [80, 210], w_jj_4: [110, 300],  // 비상 · 홍련군무
  w_hm_1: [0.35, 12], w_hm_2: [22, 100], w_hm_3: [90, 240], w_hm_4: [120, 320],  // 붕지 · 천수진(방어 결계)
  w_hd_1: [2.5, 25], w_hd_2: [18, 90], w_hd_4: [100, 280],    // 사신 강하 (천쇄는 V12.146 흑룡으로)
  w_hr_1: [0.35, 8], w_hr_2: [20, 120], w_hr_3: [25, 160], w_hr_4: [120, 300],     // 흑룡: 용조 연참 · 비행 · 천쇄 · 결계 「용린옥」
  w_qq_1: [0.35, 15], w_qq_2: [14, 70], w_qq_3: [60, 140], w_qq_4: [110, 300],   // 표식 도약 · 흉익 강림
  w_tw_1: [0.45, 15], w_tw_2: [15, 75], w_tw_3: [60, 140], w_tw_4: [110, 300],   // 망치 투척 · 폭주
  w_tt_1: [0.4, 15], w_tt_2: [15, 75], w_tt_3: [60, 140], w_tt_4: [110, 300],    // 탐식 도약 · 현신
};
for (const list of Object.values(WEAPON_SKILLS)) for (const sk of list) { const t = WEAPON_TUNE[sk.id]; if (t) { sk.cd = t[0]; sk.mp = t[1]; } }
// 직업 스킬: 마나 ×4 · 재사용 대기 ② ×1.25 ③ ×1.3 ④ ×1.4 (① 연타는 그대로)
const JOB_CD = { 1: 1, 2: 1.25, 3: 1.3, 4: 1.4 };
const tunedJob = new WeakSet();
function tuneJob(s) { if (!s || tunedJob.has(s)) return s; tunedJob.add(s); s.mp = Math.round(s.mp * 4); s.cd = Math.round(s.cd * (JOB_CD[s.key] ?? 1) * 10) / 10; return s; }
/** 레벨이 낮으면 마나 소모도 낮게 (Lv.1 40% → Lv.100 100%) */
for (const sk of J.JOB_SKILLS) tuneJob(sk); // 메뉴 표시도 같은 값
/** 메뉴 표시용: 지금 레벨에서 실제 마나 소모 */
export const mpCost = (p, base) => Math.max(1, Math.round(base * (0.4 + 0.6 * Math.min(1, data(p).lv / 100))));
const crBusy = new Map(); // 청룡 강림(③) 중: 같은 청룡 ③ · ④ 막음

export const WCLASS = {
  sword: { name: "검", icon: "class" },
  axe: { name: "도끼", icon: "axe" },
  bow: { name: "활", icon: "archer" },
  crossbow: { name: "쇠뇌", icon: "crossbow" },
  spear: { name: "창", icon: "spear" },
  mace: { name: "둔기", icon: "mace" },
  staff: { name: "지팡이", icon: "mage" },
  fist: { name: "맨손", icon: "profile" },
};

// ───────── 스킬 효과 목록 (직업 스킬의 fx, 제작자 도구에서 고를 수 있음) ─────────
export const FX = SB.SPELL_LIST; // V2.9: spellbook.js 의 스펠 목록
export const getSkill = (id) => tuneJob(J.getJobSkill(id));

// ───────── 무기 분류 판별 + 자동 등록 ─────────
let overrides = null; // 제작자 지정 { typeId: wclass }
let known = null; // 자동 등록 { typeId: wclass }
const ov = () => (overrides ??= getJSON(world, "rpg:wclass", {}));
export const knownWeapons = () => (known ??= getJSON(world, "rpg:weapons", {}));

export function setWeaponClass(typeId, w) {
  if (w) ov()[typeId] = w;
  else delete ov()[typeId];
  setJSON(world, "rpg:wclass", ov());
  if (w) registerWeapon(typeId, w);
}

function registerWeapon(typeId, w) {
  const k = knownWeapons();
  if (k[typeId] === w) return;
  k[typeId] = w;
  setJSON(world, "rpg:weapons", k);
}

const TAGS = [
  ["minecraft:is_sword", "sword"], ["minecraft:is_axe", "axe"], ["minecraft:is_trident", "spear"],
  ["minecraft:is_mace", "mace"], ["minecraft:is_spear", "spear"],
];
const NAMES = [
  [/crossbow|arbalest/, "crossbow"], [/(^|_)bow($|_)|longbow|shortbow/, "bow"],
  [/staff|wand|scepter|rod_of|tome|grimoire|blaze_rod/, "staff"],
  [/sword|blade|katana|saber|sabre|dagger|knife|rapier|claymore/, "sword"],
  [/(^|_)axe($|_)|hatchet|halberd|cleaver/, "axe"],
  [/trident|spear|lance|pike|glaive|javelin/, "spear"],
  [/mace|hammer|club|maul|flail|morningstar/, "mace"],
];

/** 아이템 → 무기 분류 (무기가 아니면 null) */
export function weaponClassOf(stack) {
  if (!stack) return null;
  const id = stack.typeId;
  if (ov()[id]) return ov()[id];
  for (const [tag, w] of TAGS) {
    try {
      if (stack.hasTag(tag)) return w;
    } catch {}
  }
  const name = id.split(":")[1] ?? id;
  for (const [re, w] of NAMES) if (re.test(name)) return w;
  return null;
}

export function heldStack(p) {
  return inv(p).getItem(p.selectedSlotIndex);
}

/** 손에 든 무기 분류 (없으면 맨손). 새 무기면 자동 등록 */
export function heldClass(p) {
  const st = heldStack(p);
  const w = weaponClassOf(st);
  if (st && w) registerWeapon(st.typeId, w);
  return w ?? "fist";
}

// ───────── 무기별 설정 (제작자 도구 > 무기·스킬): 분류 / 공격력 / 배율 ─────────
let wcfg = null;
export const weaponCfg = () => (wcfg ??= getJSON(world, "rpg:wcfg", {}));
export function setWeaponCfg(typeId, cfg) {
  if (cfg) weaponCfg()[typeId] = cfg;
  else delete weaponCfg()[typeId];
  setJSON(world, "rpg:wcfg", wcfg);
}

// ───────── 발동 키 / 쿨다운 ─────────
const cd = new Map();
export function readyIn(p, id) {
  return Math.max(0, ((cd.get(`${p.id}|${id}`) ?? 0) - system.currentTick) / 20);
}

/** 손에 든 직업 도구의 단계 (없으면 null) */
export const heldPath = (p) => J.pathOfTool(heldStack(p)?.typeId);
/** 직업과 상관없는 스킬 무기 (청룡의 검 등) */
export const heldWeaponSkills = (p) => WEAPON_SKILLS[heldStack(p)?.typeId] ?? null;

/** HUD 표시용: 든 도구(없으면 현재 직업)의 ①②③ 스킬과 남은 쿨다운 */
export function currentSkillInfo(p) {
  const d = data(p);
  const ws = heldWeaponSkills(p);
  if (ws) return { path: null, holding: true, list: [...ws].sort((a, b) => a.key - b.key).map((s) => ({ key: s.key, s, left: readyIn(p, s.id), ok: true })) };
  const held = heldPath(p);
  const path = held ?? J.currentPath(d);
  const keys = J.skillAt(path, 4) ? [1, 2, 3, 4] : [1, 2, 3];
  const list = keys.map((key) => {
    const s = J.skillAt(path, key);
    return { key, s, left: s ? readyIn(p, s.id) : 0, ok: s ? d.lv >= s.lv : false };
  });
  return { path, holding: !!held, list };
}

// ───────── 연출 도구 ─────────
/** 파티클: MolangVariableMap 으로 색·방향·크기를 넘긴다 */
export function fx(dim, name, loc, o = {}) {
  try {
    const m = new MolangVariableMap();
    const c = o.color ?? [1, 1, 1];
    m.setColorRGBA("variable.color", { red: c[0], green: c[1], blue: c[2], alpha: c[3] ?? 1 });
    m.setFloat("variable.yaw", o.yaw ?? 0);
    m.setFloat("variable.radius", o.radius ?? 2);
    m.setFloat("variable.len", o.len ?? 8);
    m.setFloat("variable.tilt", o.tilt ?? 0);
    m.setFloat("variable.size", o.size ?? 1);
    m.setVector3("variable.dir", o.dir ?? { x: 0, y: 0, z: 1 });
    dim.spawnParticle(`rpg:${name}`, loc, m);
  } catch {}
}
/** 플레이어 모션 (resource_pack/animations/rpg_player.animation.json) */
// 3D 무기(사신수 · 혼돈)를 들고 있으면 스킬 동작을 무기에 맞는 것으로 바꿈 (gen_anims.py w3d_moves)
const W3D_MAP = {
  "rpg:jujak_bow": { reload: "w3d_bow_nock", shoot: "w3d_bow_shot", shoot_up: "w3d_bow_up", bow_draw: "w3d_bow_shot", bow_hold: "w3d_bow_hold", cast: "w3d_bow_shot", raise: "w3d_bow_up" },
  melee: { shoot: "w3d_m_thrust", cast: "w3d_m_thrust", shoot_up: "w3d_m_upslash", raise: "w3d_m_raise" },
};
const W3D_MELEE = new Set(["rpg:heukryong_sword", "rpg:hundun_scythe", "rpg:cheongryong_sword", "rpg:baekho_axe", "rpg:hyeonmu_shield", "rpg:jt_warrior", "rpg:jt_mage", "rpg:jt_cleric", "rpg:jt_swordmaster", "rpg:jt_berserker", "rpg:jt_elementalist", "rpg:jt_stormcaller", "rpg:jt_paladin", "rpg:jt_priest", "rpg:jt_sword_emperor", "rpg:jt_abyss_knight", "rpg:jt_destroyer", "rpg:jt_soul_reaper"]);
function w3dName(p, name) {
  let id; try { id = p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex)?.typeId; } catch {}
  const m = ["rpg:jujak_bow", "rpg:jt_archer", "rpg:jt_hunter", "rpg:jt_sniper", "rpg:jt_beastlord", "rpg:jt_hawkeye"].includes(id) ? W3D_MAP["rpg:jujak_bow"] : W3D_MELEE.has(id) ? W3D_MAP.melee : null;
  return (m && m[name]) || name;
}
export function anim(p, name) {
  name = w3dName(p, name);
  try {
    p.playAnimation(`animation.rpg.${name}`, { blendOutTime: 0.15 });
  } catch {
    try { p.runCommand(`playanimation @s animation.rpg.${name} default 0.15`); } catch {}
  }
}
// ───────── 판정 (ms.js 엔진으로 이동) ─────────
export const skillHit = M.skillHit;

/** 스킬 위력 (도구/무기 공격력 × 계수 × 스탯·직업 보너스) */
function power(p, s) {
  const d = data(p);
  const held = heldStack(p);
  const tool = J.PATHS[J.pathOfTool(held?.typeId)]?.tool;
  const cfg = held ? weaponCfg()[held.typeId] : null;
  const atk = tool?.dmg ?? cfg?.atk ?? weaponInfo(held?.typeId ?? "")?.atk ?? 3;
  // V12.119: 아이템 공격력을 10배로 올린 것에 맞춰 스킬도 10배 · 직업 종류별 주 스탯 (근접 힘 · 원거리 힘+민첩 · 마법 지능)
  // V12.123: 직업 스킬 바탕 위력은 도구 공격력(직업마다 3~16 으로 들쭉날쭉) 대신 차수로 모든 직업 같게 · 지능은 아래 배율에서만
  const base = ({ 0: 40, 1: 60, 2: 95, 3: 135 }[J.PATHS[s.path]?.tier ?? 1] ?? 60) * ((cfg?.mul ?? 100) / 100);
  const cs = combatStats(p);
  const statMul = s.kind === "melee" ? powOf(cs.str) : s.kind === "ranged" ? powOfR(cs.dex) : powOf(cs.int); // V12.122: 근접 = 힘 · 원거리 = 민첩 · 마법 = 지능 (같은 곡선)
  const buff = (d.buffUntil ?? 0) > system.currentTick ? 1 + (d.buffAtk ?? 0) / 100 : 1;
  const cls = (1 + (J.PATHS[s.path]?.tier ?? 1) * 0.1) * (1 + data(p).lv * 0.015); // V12.120: 직업 스킬도 레벨 보정 (사신수 · 사흉수보다 약 20% 약하게)
  return base * s.pow * statMul * buff * cls * (JOB_K[s.id] ?? 1) * heldEnhMul(p);
}

/** 이 스킬을 지금 쓸 수 있나: 그 단계 전용 도구를 들고 있어야 함 */
export function weaponOk(p, s) {
  return heldStack(p)?.typeId === J.toolId(s.path);
}

export function castWeaponSkill(p, id) {
  const d = data(p);
  const s = getSkill(id);
  if (!s) return false;
  const god = skillMode(p);
  if (god) {
    if (!weaponOk(p, s)) { notify(p, `§7${s.name} §c- ${J.PATHS[s.path]?.tool?.name ?? "전용 도구"}를 들어야 사용 가능`); return false; }
    if (s.next && MSR.canCast(p, s.next)) { anim(p, "smash"); MSR.cast({ p, scale: Math.max(0.2, power(p, s) / 25), size: 1 }, s.next); }
    else WRULES.withCaster(p, () => runEffect(p, s, power(p, s)), s.kind === "magic" ? "magic" : "phys");
    notify(p, `§b§l${s.name}! §r§d(관리자 모드)`);
    return true;
  }
  if (!J.chain(d).includes(s.path)) {
    notify(p, `§7${s.name} §c- ${J.PATHS[s.path]?.name ?? "?"} 직업이 아닙니다 §f(메뉴 > 직업·스킬)`);
    return false;
  }
  if (d.lv < s.lv) {
    notify(p, `§7${s.name} §c- Lv.${s.lv} 필요`);
    return false;
  }
  if (!weaponOk(p, s)) {
    notify(p, `§7${s.name} §c- ${J.PATHS[s.path]?.tool?.name ?? "전용 도구"}를 들어야 사용 가능`);
    return false;
  }
  // 원본 콤보(buffactive castinstead)가 열려 있으면 쿨다운·마나 없이 다음 단계
  if (s.next && MSR.canCast(p, s.next)) {
    anim(p, "smash");
    MSR.cast({ p, scale: Math.max(0.2, power(p, s) / 25), size: 1 }, s.next);
    notify(p, `§b§l${s.name}! §r§7(연계)`);
    return true;
  }
  if (s.ms && MSR.comboReady(p, s.ms)) {
    WRULES.withCaster(p, () => runEffect(p, s, power(p, s)), s.kind === "magic" ? "magic" : "phys");
    notify(p, `§b§l${s.name}! §r§7(연계)`);
    return true;
  }
  const left = readyIn(p, s.id);
  if (left > 0) {
    notify(p, `§7${s.name} 재사용 대기 §f${Math.ceil(left)}초`);
    return false;
  }
  const mp = d.mp ?? maxMp(p), cost = mpCost(p, s.mp);
  if (mp < cost) {
    notify(p, `§9마나 부족 §f(${Math.floor(mp)}/${cost})`);
    p.playSound("note.bass");
    return false;
  }
  d.mp = mp - cost;
  const cdr = 1 - combatStats(p).cdr / 100; // 지능: 점점 덜 오르는 재사용 대기 감소
  cd.set(`${p.id}|${s.id}`, system.currentTick + Math.round(s.cd * cdr * 20));
  WRULES.withCaster(p, () => runEffect(p, s, power(p, s)), s.kind === "magic" ? "magic" : "phys");
  notify(p, `§b§l${s.name}! §r§9-${cost} MP`);
  return true;
}

// ───────── 효과: spellbook.js (MagicSpells 이식 엔진) ─────────
function runEffect(p, s, dmg) {
  const d = data(p);
  if (s.wr && RUN[s.wr]) { // 전사 계열 (warrior.js) · setCd = 콤보가 끝나면 긴 대기시간
    RUN[s.wr]({ p, dmg, data: d, s, setCd: (sec) => { if (!skillMode(p)) cd.set(`${p.id}|${s.id}`, system.currentTick + Math.round(sec * 20)); } });
    return;
  }
  if (s.ms) {
    // 자바 MagicSpells 원본 실행: 원본 피해 수치 × (스킬 위력 / 25)
    anim(p, s.anim ?? "slash");
    MSR.cast({ p, scale: Math.max(0.2, dmg / 25), size: 1 }, s.ms);
    // 원본에선 패시브가 주던 피해: 시전 뒤 바라본 적에게 마무리 일격
    if (s.hit) {
      const t = p.getEntitiesFromViewDirection({ maxDistance: 20, excludeTypes: ["minecraft:player", "rpg:npc"] })[0]?.entity;
      if (t) system.runTimeout(() => { try { if (t.isValid()) { M.skillHit.set(t.id, system.currentTick); t.applyDamage(Math.round(dmg * s.hit), { cause: "entityAttack", damagingEntity: p }); } } catch {} }, 20);
    }
    return;
  }
  const pal = (M.PAL[s.pal] ?? M.PAL[J.PATH_PAL[s.path]] ?? M.PAL.cloud).map(M.hex);
  const ctx = {
    p, dim: p.dimension, s, dmg, pal, data: d, tick: system.currentTick,
    tier: J.PATHS[s.path]?.tier ?? 1, stat: (k) => stat(p, k),
  };
  if (!SB.cast(ctx, s.fx, s.o ?? {})) SB.cast(ctx, "crescent", {});
}

/** 공격력 버프 배율 (combat.js 일반 공격에도 적용) */
export function buffMul(p) {
  const d = data(p);
  return (d.buffUntil ?? 0) > system.currentTick ? 1 + (d.buffAtk ?? 0) / 100 : 1;
}

// ───────── 발동: ① 클릭 / ② 쉬프트+클릭 / ③ 쉬프트+점프 (직업 도구를 들고) ─────────
/** 관리자 스킬 모드: 쿨다운·마나 없음, 모든 직업 스킬 사용 가능 (제작자 도구 > 플레이어) */
export const skillMode = (p) => !!data(p).set?.adminSkill && isAdmin(p);
/** 이 플레이어의 모든 스킬 재사용 대기 초기화 (관리자 도구 > 스킬 도움) */
export function resetCooldowns(p) { for (const k of [...cd.keys()]) if (k.startsWith(`${p.id}|`)) cd.delete(k); }

/** 사신수 · 사흉수 스킬 기본 위력: 16 × 힘 × 버프 × 레벨 (V12.109: 12 → 16) */
// V12.123: 스킬마다 피해 비율 [근접 물리, 원거리 물리, 마법] — 설명 · 연출을 보고 정함. 비율대로 힘 · 민첩 · 지능 배율을 섞음
export const WEAPON_MIX = {
  w_cr_1: [0.7, 0, 0.3], w_cr_2: [0.5, 0, 0.5], w_cr_3: [0.1, 0, 0.9], w_cr_4: [0.5, 0, 0.5],   // 청룡: 창술 + 물 · 번개 · 용
  w_bh_1: [1, 0, 0], w_bh_2: [1, 0, 0], w_bh_3: [1, 0, 0], w_bh_4: [0.7, 0, 0.3],               // 백호: 할퀴기 · 도끼 (천붕은 백호 영체)
  w_jj_1: [0, 0.7, 0.3], w_jj_2: [0, 0.6, 0.4], w_jj_3: [0, 0.4, 0.6], w_jj_4: [0, 0.4, 0.6],   // 주작: 화살 + 불 · 주작 소환
  w_hm_1: [0.9, 0, 0.1], w_hm_2: [0.5, 0, 0.5], w_hm_3: [0.6, 0, 0.4], w_hm_4: [0.3, 0, 0.7],   // 현무: 방패 + 뱀 독 · 대지 · 결계
  w_hd_1: [0.8, 0, 0.2], w_hd_2: [0.3, 0, 0.7], w_hd_4: [0.6, 0, 0.4],   // 혼돈: 낫 + 혼돈 연기 · 사슬 · 불기둥
  w_hr_1: [1, 0, 0], w_hr_2: [1, 0, 0], w_hr_3: [0.9, 0, 0.1], w_hr_4: [0.8, 0, 0.2],   // 흑룡: 검술 + 흑염
  w_qq_1: [1, 0, 0], w_qq_2: [1, 0, 0], w_qq_3: [1, 0, 0], w_qq_4: [0.5, 0.5, 0],               // 궁기: 발톱 (흉익은 깃털 탄막)
  w_tw_1: [1, 0, 0], w_tw_2: [1, 0, 0], w_tw_3: [0.5, 0.5, 0], w_tw_4: [1, 0, 0],               // 도올: 망치 (투척은 반쯤 원거리)
  w_tt_1: [0.8, 0, 0.2], w_tt_2: [0.7, 0, 0.3], w_tt_3: [1, 0, 0], w_tt_4: [0.3, 0, 0.7],       // 도철: 물어뜯기 + 아가리 · 가면 소용돌이
};
const mixPow = (cs, m) => m[0] * powOf(cs.str) + m[1] * powOfR(cs.dex) + m[2] * powOf(cs.int);
const weaponDmg = (p, s) => 200 * mixPow(combatStats(p), WEAPON_MIX[s?.id] ?? [1, 0, 0]) * buffMul(p) * (1 + data(p).lv * 0.025) * heldEnhMul(p); // 강화 포함
/** V12.129 스킬 위력 보정: 가짜 표적 1마리에 스킬을 시뮬레이션해 '한 번 쓸 때 총 피해'를 재고,
 *  목표 = ① 0.9 + 0.8 × 대기초 / ②~④ (2 + 10 × 대기/120 + 3 × 마나/300) × 성격(장판 · 광역 0.85, 지속 · 방어 · 구속 · 이동기 0.6~0.75)
 *  에 맞도록 곱함. 클릭 연타 · 재입력 · 착지처럼 시뮬레이션에서 안 도는 단계가 있는 스킬은 따로 낮게 정함 */
const SKILL_K = {
  w_cr_1: 1.46, w_cr_2: 1.33, w_cr_3: 6.15, w_cr_4: 5.5,
  w_bh_1: 1.38, w_bh_2: 3.61, w_bh_3: 2.18, w_bh_4: 2.08,
  w_jj_1: 1.18, w_jj_2: 0.25, w_jj_3: 1.02, w_jj_4: 0.6,
  w_hm_1: 1.57, w_hm_2: 0.91, w_hm_3: 1.71, w_hm_4: 1.39,
  w_hd_1: 5.18, w_hd_2: 2, w_hd_4: 6,
  w_hr_1: 2.6, w_hr_2: 1.7, w_hr_3: 1.1, w_hr_4: 3.9,   // V12.151 흑룡(사신수 목표 × 1.2): ①은 한 번 누를 때 · ②는 실제로 맞힐 때(몸 2 · 숨결 3 · 급강하) · ④는 붕괴 + 추격 물기 약 6
  w_qq_1: 3.11, w_qq_2: 1.5, w_qq_3: 2, w_qq_4: 4,
  w_tw_1: 2.8, w_tw_2: 2.65, w_tw_3: 5, w_tw_4: 4,
  w_tt_1: 2.71, w_tt_2: 2.93, w_tt_3: 7.84, w_tt_4: 4,
};
const cdPow = (s) => SKILL_K[s.id] ?? 1;
/** 직업 스킬도 같은 방식 (V12.129): 측정한 총 피해 → 대기 · 마나 기준 목표에 맞춤 (회복 · 강화 스킬은 그대로) */
const JOB_K = {
  jw_warrior_1: 2.36, jw_warrior_2: 2.29, jw_warrior_3: 4.05, jw_swordmaster_1: 2.6,
  jw_swordmaster_2: 3.01, jw_swordmaster_3: 4.66, jw_sword_emperor_1: 1.67, jw_sword_emperor_2: 1.69,
  jw_sword_emperor_3: 1.42, jw_sword_emperor_4: 2.52, jw_berserker_1: 2.76, jw_berserker_3: 4.46,
  jw_destroyer_1: 2.0, jw_destroyer_3: 2.72, jw_destroyer_4: 6.8, j_sniper_1: 4.56,
  j_sniper_2: 2.99, j_sniper_3: 0.95, j_hawkeye_1: 5.21, j_hawkeye_2: 0.54,
  j_hawkeye_3: 2.99, j_hunter_1: 1.74, j_hunter_2: 4.84, j_hunter_3: 1.33,
  j_beastlord_1: 4.94, j_beastlord_2: 2.08, j_beastlord_3: 1.01, jr_soul_reaper_1: 1.88,
  jr_soul_reaper_2: 2.17, jr_soul_reaper_3: 1.62, jr_soul_reaper_4: 3.16, jh_chrono_1: 1.88,
  jh_chrono_2: 2.75, jh_chrono_4: 2.29, jh_abyss_1: 1.88, jh_abyss_2: 4.77,
  jh_abyss_3: 2.27, jh_abyss_4: 3.59, jh_spirit_1: 1.73, jh_spirit_2: 4.77,
  jh_spirit_3: 4.3, jh_spirit_4: 5.95, jm_mage_1: 2.89, jm_mage_2: 3.31,
  jm_mage_3: 1, jm_elementalist_1: 2.6, jm_elementalist_2: 3.44, jm_elementalist_3: 3.1,
  jm_archmage_1: 2.06, jm_archmage_2: 1.76, jm_archmage_3: 2.5, jm_archmage_4: 1.72,
  jm_stormcaller_1: 2.6, jm_stormcaller_2: 1.0, jm_stormcaller_3: 4.2, jm_stormlord_1: 2.06,
  jm_stormlord_2: 2.8, jm_stormlord_3: 2.29, jm_stormlord_4: 2.3, j_priest_1: 8,
  j_priest_2: 8, j_priest_3: 8, j_paladin_1: 1.88, j_paladin_2: 0.62,
  j_paladin_3: 1.34, j_archer_1: 4.9, j_archer_2: 1.3, j_archer_3: 1.33,
  j_cleric_2: 3.09, j_archbishop_2: 4.12, j_archbishop_3: 3.21, j_crusader_1: 7.3,
  j_crusader_2: 4.19, j_crusader_3: 4.1,
};
/** 스킬 무기 발동 (직업 조건 없음) */
function castWeaponSpecial(p, s) {
  const d = data(p);
  // 재입력 · 모드 중 입력 (사흉수): 쿨타임 · 마나 없이 처리
  try { if (s.pre?.(p)) return true; } catch {}
  const cdOf = (sec) => cd.set(`${p.id}|${s.id}`, system.currentTick + Math.round(sec * 20));
  const extra = { setCd: (sec) => { if (!skillMode(p)) cdOf(sec); }, resetCd: () => cd.delete(`${p.id}|${s.id}`) };
  if ((s.id === "w_cr_3" || s.id === "w_cr_4") && (crBusy.get(p.id) ?? 0) > system.currentTick) { notify(p, `§7청룡 강림 중에는 §f${s.short ?? s.name}§7 을(를) 쓸 수 없습니다`); return false; }
  const busy = () => { if (s.id === "w_cr_3") crBusy.set(p.id, system.currentTick + 170); }; // 강림 연출 약 8.5초
  if (skillMode(p)) {
    busy();
    s.run({ p, dmg: weaponDmg(p, s) * cdPow(s), data: d, ...extra });
    notify(p, `§b§l${s.name}! §r§d(관리자 모드)`);
    return true;
  }
  const left = readyIn(p, s.id);
  if (left > 0) {
    notify(p, `§7${s.name} 재사용 대기 §f${Math.ceil(left)}초`);
    return false;
  }
  const mp = d.mp ?? maxMp(p), cost = mpCost(p, s.mp);
  if (mp < cost) {
    notify(p, `§9마나 부족 §f(${Math.floor(mp)}/${cost})`);
    p.playSound("note.bass");
    return false;
  }
  d.mp = mp - cost;
  const cdr = 1 - combatStats(p).cdr / 100; // 지능: 점점 덜 오르는 재사용 대기 감소
  cd.set(`${p.id}|${s.id}`, system.currentTick + Math.round(s.cd * cdr * 20));
  busy();
  s.run({ p, dmg: weaponDmg(p, s) * cdPow(s), data: d, ...extra });
  notify(p, `§b§l${s.name}! §r§9-${cost} MP`);
  return true;
}

export function castKey(p, key) {
  return WRULES.withCaster(p, () => castKeyIn(p, key), "phys"); // 사신수 · 사흉수 · 근접 · 원거리 = 물리, 마법 직업 스킬은 안에서 "magic" // 스킬이 나중에 예약하는 동작까지 시전자를 이어 줌 (PvP 대상 · 피해 규칙)
}
function castKeyIn(p, key) {
  if (isSkillLocked(p)) return false; // 주작 3단 조준 중: 다른 스킬은 모두 무시
  const ws = heldWeaponSkills(p);
  if (ws) {
    const s = ws.find((x) => x.key === key);
    return s ? castWeaponSpecial(p, s) : false;
  }
  const path = heldPath(p);
  if (!path) return false;
  const d = data(p);
  if (!skillMode(p) && !J.chain(d).includes(path)) {
    notify(p, `§c${J.PATHS[path]?.name ?? "?"} 전용 도구입니다 §7(메뉴 > 직업·스킬에서 승급)`);
    return false;
  }
  const s = J.skillAt(path, key);
  if (!s) {
    notify(p, `§7이 도구에는 ${J.KEY_NAMES[key]} 스킬이 없습니다`);
    return false;
  }
  return castWeaponSkill(p, s.id);
}

const jumpWas = new Map();
const sneakWas = new Map();
const sneakEdge = new Map(); // pid -> 마지막으로 쉬프트를 누른 틱
/** 스킬 무기: 0.8초 안에 쉬프트를 두 번 누르면 ④ */
function doubleSneakTick(p, sneak) {
  const was = sneakWas.get(p.id) ?? false;
  sneakWas.set(p.id, sneak);
  if (!sneak || was) return;
  const now = system.currentTick, last = sneakEdge.get(p.id) ?? -99;
  sneakEdge.set(p.id, now);
  if (now - last <= 16) { // 0.8초 안에 두 번
    sneakEdge.set(p.id, -99);
    const ws = heldWeaponSkills(p);
    if (ws?.some((s) => s.key === 4)) castKey(p, 4);
    else { const path = heldPath(p); if (path && J.skillAt(path, 4)) castKey(p, 4); } // 3차 직업 궁극기
  }
}
/** 매 틱: 직업 도구를 들고 쉬프트 중 점프를 '새로' 누르면 ③ */
export function skillJumpTick(p) {
  let jumping = false, sneak = false;
  try {
    jumping = p.isJumping;
    sneak = p.isSneaking;
  } catch {
    return;
  }
  const was = jumpWas.get(p.id) ?? false;
  jumpWas.set(p.id, jumping);
  if (jumping && !was && sneak && (heldPath(p) || heldWeaponSkills(p))) castKey(p, 3);
  doubleSneakTick(p, sneak);
}

export function initSkillTriggers() {
  HM.setShieldCaster(castKey); // 현무의 방패: 짧게 눌렀다 떼면 ①/② (누른 순간은 패링 판정)
  world.afterEvents.itemUse.subscribe(({ itemStack, source: p }) => {
    if (p?.typeId !== "minecraft:player" || !(J.pathOfTool(itemStack?.typeId) || WEAPON_SKILLS[itemStack?.typeId])) return;
    if (itemStack?.typeId === HM.SHIELD_ID && HM.HANDLES_USE) { HM.useEvent(p); return; } // 방패는 누름·뗌 이벤트로 처리 (안 오면 클릭으로)
    if (itemStack?.typeId === "rpg:jujak_bow" && jjRelease(p)) return; // 주작 3단 조준 중 클릭 = 발사 (쿨타임·MP 없이)
    castKey(p, p.isSneaking ? 2 : 1);
  });
}


// ───────── 더보기 정보 (V12.130, menu.js) ─────────
export const WEAPON_NAMES = { "rpg:cheongryong_sword": "청룡의 검", "rpg:baekho_axe": "백호의 도끼", "rpg:jujak_bow": "주작의 활", "rpg:hyeonmu_shield": "현무의 방패",
  "rpg:heukryong_sword": "흑룡의 검", "rpg:hundun_scythe": "혼돈의 낫", "rpg:qiongqi_claws": "궁기의 쌍발톱", "rpg:taowu_hammer": "도올의 대망치", "rpg:taotie_maw": "도철의 아가리" };
/** 사신수 · 사흉수 무기의 스킬 목록 + 지금 이 플레이어 기준 위력 */
export function weaponSkillInfo(p, itemId) {
  return (WEAPON_SKILLS[itemId] ?? []).map((s) => ({ s, mp: mpCost(p, s.mp), mix: WEAPON_MIX[s.id] ?? [1, 0, 0], pow: Math.round(weaponDmg(p, s) * cdPow(s)) }));
}
/** 직업 스킬 지금 기준 위력 (회복 · 강화는 null) */
export const jobSkillPower = (p, s) => (s.kind === "heal" || s.kind === "buff" ? null : Math.round(power(p, s)));
