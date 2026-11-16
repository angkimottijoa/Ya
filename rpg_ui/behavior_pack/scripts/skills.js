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
const WEAPON_SKILLS = { ...CR_SKILLS, ...BH_SKILLS };

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
export const getSkill = (id) => J.getJobSkill(id);

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
  if (ws) return { path: null, holding: true, list: ws.map((s) => ({ key: s.key, s, left: readyIn(p, s.id), ok: true })) };
  const held = heldPath(p);
  const path = held ?? J.currentPath(d);
  const list = [1, 2, 3].map((key) => {
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
export function anim(p, name) {
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
  const base = (s.kind === "magic" ? 5 + atk * 0.5 + stat(p, "int") * 0.6 : atk) * ((cfg?.mul ?? 100) / 100);
  const statMul = s.kind === "melee" ? 1 + stat(p, "str") * 0.02 : s.kind === "ranged" ? 1 + stat(p, "dex") * 0.02 : 1;
  const buff = (d.buffUntil ?? 0) > system.currentTick ? 1 + (d.buffAtk ?? 0) / 100 : 1;
  const cls = 1 + (J.PATHS[s.path]?.tier ?? 1) * 0.1;
  return base * s.pow * statMul * buff * cls;
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
    else runEffect(p, s, power(p, s));
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
    runEffect(p, s, power(p, s));
    notify(p, `§b§l${s.name}! §r§7(연계)`);
    return true;
  }
  const left = readyIn(p, s.id);
  if (left > 0) {
    notify(p, `§7${s.name} 재사용 대기 §f${Math.ceil(left)}초`);
    return false;
  }
  const mp = d.mp ?? maxMp(p);
  if (mp < s.mp) {
    notify(p, `§9마나 부족 §f(${Math.floor(mp)}/${s.mp})`);
    p.playSound("note.bass");
    return false;
  }
  d.mp = mp - s.mp;
  const cdr = 1 - Math.min(0.4, stat(p, "int") * 0.01);
  cd.set(`${p.id}|${s.id}`, system.currentTick + Math.round(s.cd * cdr * 20));
  runEffect(p, s, power(p, s));
  notify(p, `§b§l${s.name}! §r§9-${s.mp} MP`);
  return true;
}

// ───────── 효과: spellbook.js (MagicSpells 이식 엔진) ─────────
function runEffect(p, s, dmg) {
  const d = data(p);
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

/** 스킬 무기 발동 (직업 조건 없음) */
function castWeaponSpecial(p, s) {
  const d = data(p);
  if (skillMode(p)) {
    s.run({ p, dmg: 12 * (1 + stat(p, "str") * 0.02) * buffMul(p) * (1 + d.lv * 0.02), data: d });
    notify(p, `§b§l${s.name}! §r§d(관리자 모드)`);
    return true;
  }
  const left = readyIn(p, s.id);
  if (left > 0) {
    notify(p, `§7${s.name} 재사용 대기 §f${Math.ceil(left)}초`);
    return false;
  }
  const mp = d.mp ?? maxMp(p);
  if (mp < s.mp) {
    notify(p, `§9마나 부족 §f(${Math.floor(mp)}/${s.mp})`);
    p.playSound("note.bass");
    return false;
  }
  d.mp = mp - s.mp;
  const cdr = 1 - Math.min(0.4, stat(p, "int") * 0.01);
  cd.set(`${p.id}|${s.id}`, system.currentTick + Math.round(s.cd * cdr * 20));
  const dmg = 12 * (1 + stat(p, "str") * 0.02) * buffMul(p) * (1 + d.lv * 0.02);
  s.run({ p, dmg, data: d });
  notify(p, `§b§l${s.name}! §r§9-${s.mp} MP`);
  return true;
}

export function castKey(p, key) {
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
  world.afterEvents.itemUse.subscribe(({ itemStack, source: p }) => {
    if (p?.typeId !== "minecraft:player" || !(J.pathOfTool(itemStack?.typeId) || WEAPON_SKILLS[itemStack?.typeId])) return;
    castKey(p, p.isSneaking ? 2 : 1);
  });
}
