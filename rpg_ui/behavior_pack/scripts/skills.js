// 직업 스킬 시스템 (V2.7)
// - 직업 승급 단계(jobs.js)마다 "전용 도구"가 있고, 그 도구를 들면 그 단계 스킬 3개를 쓴다.
//     ① 클릭(사용 / 모바일: 길게 누르기)   ② 쉬프트+클릭   ③ 쉬프트+점프
// - 효과는 Molang 수식 파티클(gen_particles.py)과 플레이어 모션(gen_anims.py)으로 연출한다.
// - 무기 분류(WCLASS)는 일반 공격력 설정(제작자 도구 > 무기)용으로 남겨 둔다.
import { world, system, EntityDamageCause, MolangVariableMap } from "@minecraft/server";
import { getJSON, setJSON } from "./db.js";
import { data, save, stat, notify, maxMp } from "./player.js";
import { nearbyMembers } from "./party.js";
import { weaponInfo, inv } from "./itemdb.js";
import * as J from "./jobs.js";

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
export const FX = [
  { id: "sword_spin", name: "주변 베기 (원형 범위)" }, { id: "sword_dash", name: "돌진 + 범위" },
  { id: "sword_judge", name: "단일 강타 + 구속" }, { id: "axe_slam", name: "내려찍기 + 띄우기" },
  { id: "mace_quake", name: "지진 (넓은 범위)" }, { id: "axe_rage", name: "공격력 버프" },
  { id: "bow_pierce", name: "관통 직선 (3명)" }, { id: "spear_thrust", name: "짧은 직선 관통" },
  { id: "bow_rain", name: "범위 3연타" }, { id: "xbow_burst", name: "지점 폭발" },
  { id: "staff_fire", name: "화염 폭발 + 화상" }, { id: "xbow_volley", name: "부채꼴 3발" },
  { id: "spear_storm", name: "번개" }, { id: "staff_frost", name: "냉기 범위 + 구속" },
  { id: "staff_heal", name: "파티 회복" }, { id: "fist_breath", name: "자기 회복" }, { id: "fist_combo", name: "3연타" },
  { id: "sword_wave", name: "검기 날리기 (직선 이동)" }, { id: "blade_storm", name: "회전 베기 4연속" },
  { id: "leap_slam", name: "도약 후 내려찍기" }, { id: "backstep", name: "뒤로 뛰며 관통 사격" },
  { id: "arrow_storm", name: "사방 화살 + 화살비" }, { id: "roar", name: "포효 (범위 + 약화)" },
  { id: "blink", name: "순간 이동" }, { id: "meteor", name: "운석 낙하" },
  { id: "chain_lightning", name: "연쇄 번개" }, { id: "holy_nova", name: "빛의 파동 (회복 + 피해)" },
  { id: "guard", name: "보호막 (피해 감소 + 흡수)" },
];
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

/** HUD 표시용: 든 도구(없으면 현재 직업)의 ①②③ 스킬과 남은 쿨다운 */
export function currentSkillInfo(p) {
  const d = data(p);
  const held = heldPath(p);
  const path = held ?? J.currentPath(d);
  const list = [1, 2, 3].map((key) => {
    const s = J.skillAt(path, key);
    return { key, s, left: s ? readyIn(p, s.id) : 0, ok: s ? d.lv >= s.lv : false };
  });
  return { path, holding: !!held, list };
}

// ───────── 연출 도구 ─────────
const BASE_COL = { warrior: [1, 0.38, 0.22], archer: [0.45, 1, 0.4], mage: [0.7, 0.45, 1], cleric: [1, 0.86, 0.38], novice: [1, 1, 1] };
const FX_COL = {
  staff_fire: [1, 0.45, 0.1], meteor: [1, 0.42, 0.08], staff_frost: [0.55, 0.9, 1],
  spear_storm: [0.6, 0.78, 1], chain_lightning: [0.6, 0.78, 1],
  staff_heal: [0.6, 1, 0.6], holy_nova: [1, 0.92, 0.5], guard: [1, 0.92, 0.5], axe_rage: [1, 0.25, 0.15], roar: [1, 0.55, 0.2],
};
const colorOf = (s) => FX_COL[s.fx] ?? BASE_COL[J.PATHS[s.path]?.base ?? "novice"] ?? [1, 1, 1];

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
const yawOf = (p) => p.getRotation().y;
function flatDir(p) {
  const v = p.getViewDirection();
  const l = Math.hypot(v.x, v.z) || 1;
  return { x: v.x / l, y: 0, z: v.z / l };
}
function ahead(p, dist, dy = 0) {
  const f = flatDir(p);
  return { x: p.location.x + f.x * dist, y: p.location.y + dy, z: p.location.z + f.z * dist };
}
const later = (t, fn) => system.runTimeout(() => { try { fn(); } catch {} }, t);

// ───────── 판정 ─────────
const EXCLUDE = { excludeTypes: ["minecraft:player", "minecraft:item", "minecraft:xp_orb", "rpg:npc", "minecraft:armor_stand"], excludeFamilies: ["inanimate"] };
export const skillHit = new Map(); // victimId -> tick (스탯 보너스 중복 방지용, combat.js 가 참조)

function hit(p, e, amount, col) {
  skillHit.set(e.id, system.currentTick);
  try {
    e.applyDamage(Math.max(1, amount), { cause: EntityDamageCause.entityAttack, damagingEntity: p });
    if (col) fx(e.dimension, "fx_spark", { ...e.location, y: e.location.y + 1 }, { color: col });
  } catch {}
}
function around(dim, loc, r) {
  try { return dim.getEntities({ location: loc, maxDistance: r, ...EXCLUDE }); } catch { return []; }
}
function lookTargetPoint(p, max = 24) {
  const e = p.getEntitiesFromViewDirection({ maxDistance: max, ...EXCLUDE })[0]?.entity;
  if (e) return e.location;
  const b = p.getBlockFromViewDirection({ maxDistance: max });
  if (b) return { x: b.block.location.x + 0.5, y: b.block.location.y + 1, z: b.block.location.z + 0.5 };
  const v = p.getViewDirection();
  const h = p.getHeadLocation();
  return { x: h.x + v.x * 12, y: h.y + v.y * 12, z: h.z + v.z * 12 };
}
function knock(from, e, h, v) {
  const dx = e.location.x - from.x, dz = e.location.z - from.z, l = Math.hypot(dx, dz) || 1;
  try { e.applyKnockback(dx / l, dz / l, h, v); } catch {}
}
/** 시선 방향 관통 판정 + 광선 */
function pierce(p, range, max, dmg, col, onHit) {
  const v = p.getViewDirection();
  const h = p.getHeadLocation();
  fx(p.dimension, "fx_beam", { x: h.x + v.x * 0.6, y: h.y - 0.2 + v.y * 0.6, z: h.z + v.z * 0.6 }, { dir: v, len: range, color: col });
  const hits = p.getEntitiesFromViewDirection({ maxDistance: range, ...EXCLUDE }).slice(0, max);
  for (const x of hits) {
    hit(p, x.entity, dmg, col);
    onHit?.(x.entity);
  }
}

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
  runEffect(p, s, power(p, s), colorOf(s));
  notify(p, `§b§l${s.name}! §r§9-${s.mp} MP`);
  return true;
}

// ───────── 효과 ─────────
function runEffect(p, s, dmg, col) {
  const dim = p.dimension;
  const loc = p.location;
  const yaw = yawOf(p);
  const tier = J.PATHS[s.path]?.tier ?? 1;
  switch (s.fx ?? s.id) {
    case "sword_spin":
      anim(p, "spin");
      fx(dim, "fx_slash", loc, { yaw, radius: 2.6, color: col });
      later(3, () => fx(dim, "fx_slash", p.location, { yaw: yaw + 180, radius: 2.6, color: col }));
      fx(dim, "fx_ring", loc, { radius: 3, color: col });
      for (const e of around(dim, loc, 3.5)) hit(p, e, dmg, col);
      p.playSound("item.trident.riptide_1", { pitch: 1.4 });
      break;
    case "sword_dash": {
      anim(p, "dash");
      const f = flatDir(p);
      try { p.applyKnockback(f.x, f.z, 2.8, 0.25); } catch {}
      for (let i = 0; i < 4; i++) later(i + 1, () => fx(dim, "fx_puff", p.location, { color: col }));
      later(5, () => {
        anim(p, "slash");
        fx(dim, "fx_slash", p.location, { yaw: yawOf(p), radius: 2.4, tilt: 0.4, color: col });
        for (const e of around(dim, p.location, 3)) hit(p, e, dmg, col);
      });
      p.playSound("mob.irongolem.throw");
      break;
    }
    case "sword_judge": {
      anim(p, "slash_down");
      fx(dim, "fx_slash", loc, { yaw, radius: 2, tilt: 1.3, color: col });
      const t = p.getEntitiesFromViewDirection({ maxDistance: 6, ...EXCLUDE })[0]?.entity;
      if (t) {
        later(4, () => {
          hit(p, t, dmg, col);
          try { t.addEffect("slowness", 60, { amplifier: 4 }); } catch {}
          fx(dim, "fx_pillar", t.location, { radius: 1, color: col });
          fx(dim, "fx_sphere", { ...t.location, y: t.location.y + 1 }, { radius: 1.2, color: col });
        });
      }
      p.playSound("random.anvil_land", { pitch: 0.6 });
      break;
    }
    case "axe_slam":
    case "mace_quake": {
      anim(p, "smash");
      const r = s.fx === "mace_quake" ? 5 : 4;
      later(6, () => {
        const c = p.location;
        fx(dim, "fx_ring", c, { radius: r, color: col });
        fx(dim, "fx_shard", c, { radius: r * 0.6, color: col });
        for (const e of around(dim, c, r)) {
          hit(p, e, dmg, col);
          knock(c, e, 0.6, s.fx === "mace_quake" ? 0.9 : 0.6);
        }
        p.playSound("random.explode", { volume: 0.6, pitch: 0.8 });
      });
      break;
    }
    case "axe_rage":
      anim(p, "raise");
      d0(p).buffAtk = s.pow;
      d0(p).buffUntil = system.currentTick + 200;
      fx(dim, "fx_spiral", loc, { radius: 0.9, color: col });
      fx(dim, "fx_rise", loc, { radius: 1, color: col });
      p.playSound("mob.ravager.roar", { volume: 0.5 });
      break;
    case "bow_pierce":
    case "spear_thrust": {
      anim(p, s.fx === "bow_pierce" ? "shoot" : "thrust");
      const range = s.fx === "spear_thrust" ? 6 : 32;
      later(s.fx === "bow_pierce" ? 5 : 2, () => pierce(p, range, s.fx === "bow_pierce" ? 3 : 99, dmg, col));
      p.playSound(s.fx === "bow_pierce" ? "random.bow" : "item.trident.throw", { pitch: 1.5 });
      break;
    }
    case "bow_rain": {
      anim(p, "shoot_up");
      const c = lookTargetPoint(p, 32);
      fx(dim, "fx_beam", p.getHeadLocation(), { dir: { x: 0, y: 1, z: 0 }, len: 6, color: col });
      fx(dim, "fx_sigil", c, { radius: 4, len: 1.6, color: col, yaw });
      for (let i = 0; i < 3; i++) later(8 + i * 10, () => {
        for (let k = 0; k < 6; k++) {
          const pt = { x: c.x + Math.random() * 8 - 4, y: c.y + 6, z: c.z + Math.random() * 8 - 4 };
          fx(dim, "fx_beam", pt, { dir: { x: 0, y: -1, z: 0 }, len: 6, color: col });
        }
        for (const e of around(dim, c, 4)) hit(p, e, dmg, col);
        p.playSound("random.bowhit");
      });
      break;
    }
    case "xbow_burst":
    case "staff_fire": {
      const magic = s.fx === "staff_fire" || s.kind === "magic";
      anim(p, magic ? "cast" : "shoot");
      if (magic) fx(dim, "fx_sigil_wall", ahead(p, 1.6, 1.2), { yaw, radius: 1.1, len: 0.6, color: col });
      const c = lookTargetPoint(p, 28);
      const h = p.getHeadLocation();
      const dx = c.x - h.x, dy = c.y + 0.5 - h.y, dz = c.z - h.z, l = Math.hypot(dx, dy, dz) || 1;
      later(5, () => {
        fx(dim, "fx_beam", h, { dir: { x: dx / l, y: dy / l, z: dz / l }, len: l, color: col });
        later(3, () => {
          fx(dim, "fx_sphere", { ...c, y: c.y + 0.5 }, { radius: 1.6, color: col });
          fx(dim, "fx_ring", c, { radius: 3, color: col });
          for (const e of around(dim, c, 3)) {
            hit(p, e, dmg, col);
            if (s.fx === "staff_fire") try { e.setOnFire(4, true); } catch {}
          }
          p.playSound(s.fx === "staff_fire" ? "mob.blaze.shoot" : "random.explode", { volume: 0.6 });
        });
      });
      break;
    }
    case "xbow_volley": {
      anim(p, "shoot");
      const v = p.getViewDirection();
      const h = p.getHeadLocation();
      for (const ang of [-0.25, 0, 0.25]) {
        const dx = v.x * Math.cos(ang) - v.z * Math.sin(ang), dz = v.x * Math.sin(ang) + v.z * Math.cos(ang);
        fx(dim, "fx_beam", h, { dir: { x: dx, y: v.y, z: dz }, len: 24, color: col });
        for (let i = 1; i < 24; i += 1) {
          const pt = { x: h.x + dx * i, y: h.y + v.y * i, z: h.z + dz * i };
          for (const e of around(dim, pt, 1)) if (system.currentTick - (skillHit.get(e.id) ?? -9) > 0) hit(p, e, dmg, col);
        }
      }
      p.playSound("crossbow.shoot");
      break;
    }
    case "spear_storm": {
      anim(p, "raise");
      const c = lookTargetPoint(p, 32);
      fx(dim, "fx_sigil", c, { radius: 2.5, len: 0.8, color: col, yaw });
      later(10, () => {
        fx(dim, "fx_bolt", c, { len: 14, color: col });
        fx(dim, "fx_ring", c, { radius: 3, color: col });
        for (const e of around(dim, c, 3)) hit(p, e, dmg, col);
        p.playSound("ambient.weather.thunder", { volume: 0.7, pitch: 1.2 });
      });
      break;
    }
    case "staff_frost":
      anim(p, "cast");
      fx(dim, "fx_sigil", loc, { radius: 4, len: 0.9, color: col, yaw });
      later(6, () => {
        fx(dim, "fx_ring", p.location, { radius: 5, color: col });
        fx(dim, "fx_shard", p.location, { radius: 3, color: col });
        for (const e of around(dim, p.location, 5)) {
          hit(p, e, dmg, col);
          try { e.addEffect("slowness", 80, { amplifier: 2 }); } catch {}
        }
        p.playSound("random.glass", { pitch: 1.3 });
      });
      break;
    case "staff_heal":
    case "fist_breath": {
      anim(p, "raise");
      fx(dim, "fx_sigil", loc, { radius: 2.5, len: 1, color: col, yaw });
      const amt = (s.fx === "staff_heal" ? 6 + stat(p, "vit") * 0.3 + stat(p, "int") * 0.3 : 4) * s.pow * (1 + tier * 0.15);
      const targets = s.fx === "staff_heal" ? [p, ...nearbyMembers(p, 8)] : [p];
      for (const t of targets) heal(t, amt, col);
      p.playSound("random.orb", { pitch: 0.7 });
      break;
    }
    case "fist_combo": {
      const t = p.getEntitiesFromViewDirection({ maxDistance: 4, ...EXCLUDE })[0]?.entity;
      for (let i = 0; i < 3; i++) later(i * 6, () => {
        anim(p, "slash");
        fx(dim, "fx_slash", p.location, { yaw: yawOf(p) + (i % 2 ? 180 : 0), radius: 1.6, tilt: i % 2 ? -0.5 : 0.5, color: col });
        if (t?.isValid()) hit(p, t, dmg, col);
      });
      p.playSound("game.player.attack.strong");
      break;
    }
    // ───── V2.7 새 효과 ─────
    case "sword_wave": {
      anim(p, "slash");
      const f = flatDir(p);
      const done = new Set();
      for (let i = 0; i < 7; i++) later(i * 2, () => {
        const c = { x: loc.x + f.x * i * 1.6, y: loc.y, z: loc.z + f.z * i * 1.6 };
        fx(dim, "fx_slash", c, { yaw, radius: 1.9, tilt: 0.25, color: col });
        const center = { x: c.x + f.x * 1.9, y: c.y + 1, z: c.z + f.z * 1.9 };
        for (const e of around(dim, center, 1.8)) if (!done.has(e.id)) {
          done.add(e.id);
          hit(p, e, dmg, col);
        }
      });
      p.playSound("item.trident.throw", { pitch: 0.7 });
      break;
    }
    case "blade_storm":
      for (let i = 0; i < 4; i++) later(i * 6, () => {
        anim(p, "spin");
        const y = yawOf(p) + i * 45;
        fx(dim, "fx_slash", p.location, { yaw: y, radius: 3, tilt: i % 2 ? 0.6 : -0.6, color: col });
        fx(dim, "fx_slash", p.location, { yaw: y + 180, radius: 3, tilt: i % 2 ? -0.6 : 0.6, color: col });
        for (const e of around(dim, p.location, 4)) hit(p, e, dmg, col);
        p.playSound("item.trident.riptide_1", { pitch: 1.2 + i * 0.1 });
      });
      fx(dim, "fx_ring", loc, { radius: 4, color: col });
      break;
    case "leap_slam": {
      anim(p, "raise");
      const f = flatDir(p);
      try { p.addEffect("resistance", 40, { amplifier: 4, showParticles: false }); } catch {}
      try { p.applyKnockback(f.x, f.z, 0.9, 0.95); } catch {}
      fx(dim, "fx_puff", loc, { color: col });
      p.playSound("mob.phantom.flap", { pitch: 0.7 });
      let t = 0;
      const job = system.runInterval(() => {
        t++;
        let ground = false;
        try { ground = p.isValid() && p.isOnGround; } catch {}
        if (!p.isValid() || (t > 6 && ground) || t > 40) {
          system.clearRun(job);
          if (!p.isValid()) return;
          anim(p, "smash");
          const c = p.location;
          const r = 4 + (s.pow >= 3 ? 1.5 : 0);
          fx(dim, "fx_ring", c, { radius: r, color: col });
          fx(dim, "fx_shard", c, { radius: r * 0.6, color: col });
          if (J.PATHS[s.path]?.base === "cleric") fx(dim, "fx_pillar", c, { radius: 1.5, color: col });
          for (const e of around(dim, c, r)) {
            hit(p, e, dmg, col);
            knock(c, e, 0.5, s.pow >= 3 ? 1.0 : 0.7);
          }
          p.playSound("random.explode", { volume: 0.7, pitch: 0.7 });
        } else if (t % 2 === 0) fx(dim, "fx_puff", p.location, { color: col, size: 0.6 });
      }, 1);
      break;
    }
    case "backstep": {
      anim(p, "shoot");
      const f = flatDir(p);
      try { p.applyKnockback(-f.x, -f.z, 1.6, 0.45); } catch {}
      fx(dim, "fx_puff", loc, { color: col });
      later(4, () => pierce(p, 28, 3, dmg, col, (e) => {
        if (s.path === "hunter" || s.path === "beastlord") try { e.addEffect("slowness", 60, { amplifier: 2 }); } catch {}
      }));
      p.playSound("random.bow", { pitch: 1.2 });
      break;
    }
    case "arrow_storm": {
      anim(p, "shoot_up");
      const h = { ...loc, y: loc.y + 1.2 };
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        fx(dim, "fx_beam", h, { dir: { x: Math.cos(a), y: 0, z: Math.sin(a) }, len: 8, color: col });
      }
      for (const e of around(dim, loc, 8)) hit(p, e, dmg, col);
      fx(dim, "fx_sigil", loc, { radius: 6, len: 1.6, color: col, yaw });
      for (let i = 0; i < 3; i++) later(10 + i * 8, () => {
        for (let k = 0; k < 8; k++) {
          const pt = { x: loc.x + Math.random() * 12 - 6, y: loc.y + 7, z: loc.z + Math.random() * 12 - 6 };
          fx(dim, "fx_beam", pt, { dir: { x: 0, y: -1, z: 0 }, len: 7, color: col });
        }
        for (const e of around(dim, loc, 6)) hit(p, e, dmg, col);
        p.playSound("random.bowhit");
      });
      p.playSound("random.bow", { pitch: 0.8 });
      break;
    }
    case "roar":
      anim(p, "raise");
      fx(dim, "fx_ring", loc, { radius: 6, color: col });
      later(4, () => fx(dim, "fx_ring", p.location, { radius: 4, color: col }));
      fx(dim, "fx_sphere", { ...loc, y: loc.y + 1 }, { radius: 1.5, color: col });
      for (const e of around(dim, loc, 6)) {
        hit(p, e, dmg, col);
        try { e.addEffect("slowness", 80, { amplifier: 2 }); e.addEffect("weakness", 100, { amplifier: 1 }); } catch {}
        knock(loc, e, 0.8, 0.3);
      }
      p.playSound("mob.ravager.roar", { volume: 0.9, pitch: 0.8 });
      break;
    case "blink": {
      anim(p, "cast");
      const v = p.getViewDirection();
      const h = p.getHeadLocation();
      const b = p.getBlockFromViewDirection({ maxDistance: 8 });
      const dist = b ? Math.max(0, Math.hypot(b.block.location.x + 0.5 - h.x, b.block.location.y + 0.5 - h.y, b.block.location.z + 0.5 - h.z) - 1.2) : 8;
      const to = { x: loc.x + v.x * dist, y: loc.y + Math.max(0, v.y * dist), z: loc.z + v.z * dist };
      fx(dim, "fx_puff", loc, { color: col });
      fx(dim, "fx_sphere", { ...loc, y: loc.y + 1 }, { radius: 0.6, color: col });
      fx(dim, "fx_beam", { ...loc, y: loc.y + 1 }, { dir: v, len: dist, color: col });
      try { p.teleport(to, { keepVelocity: false }); } catch {}
      later(1, () => {
        fx(dim, "fx_sphere", { ...p.location, y: p.location.y + 1 }, { radius: 0.8, color: col });
        fx(dim, "fx_ring", p.location, { radius: 1.5, color: col });
      });
      p.playSound("mob.endermen.portal", { pitch: 1.3 });
      break;
    }
    case "meteor": {
      anim(p, "raise");
      const c = lookTargetPoint(p, 32);
      const n = s.pow >= 2 ? 5 : 3;
      fx(dim, "fx_sigil", c, { radius: 4, len: 0.6 + n * 0.25, color: col, yaw });
      for (let i = 0; i < n; i++) later(8 + i * 7, () => {
        const pt = { x: c.x + (i ? Math.random() * 6 - 3 : 0), y: c.y, z: c.z + (i ? Math.random() * 6 - 3 : 0) };
        fx(dim, "fx_beam", { x: pt.x - 4, y: pt.y + 12, z: pt.z - 2 }, { dir: { x: 0.31, y: -0.94, z: 0.16 }, len: 12.5, color: col });
        later(3, () => {
          fx(dim, "fx_sphere", { ...pt, y: pt.y + 0.5 }, { radius: 2, color: col });
          fx(dim, "fx_ring", pt, { radius: 3, color: col });
          fx(dim, "fx_shard", pt, { radius: 1.5, color: col });
          for (const e of around(dim, pt, 3)) {
            hit(p, e, dmg, col);
            try { e.setOnFire(3, true); } catch {}
          }
          p.playSound("random.explode", { volume: 0.5, pitch: 0.9 });
        });
      });
      break;
    }
    case "chain_lightning": {
      anim(p, "cast");
      const max = s.pow >= 2.4 ? 7 : 4;
      const first = p.getEntitiesFromViewDirection({ maxDistance: 24, ...EXCLUDE })[0]?.entity;
      const chain = [];
      let cur = first;
      while (cur && chain.length < max) {
        chain.push(cur);
        const used = new Set(chain.map((e) => e.id));
        cur = around(dim, cur.location, 6).filter((e) => !used.has(e.id)).sort((a, b) => dist(a, cur) - dist(b, cur))[0];
      }
      let prev = { ...p.getHeadLocation() };
      chain.forEach((e, i) => {
        const from = prev;
        const to = { ...e.location, y: e.location.y + 1 };
        prev = to;
        later(i * 3, () => {
          const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, l = Math.hypot(dx, dy, dz) || 1;
          fx(dim, "fx_beam", from, { dir: { x: dx / l, y: dy / l, z: dz / l }, len: l, color: col });
          fx(dim, "fx_bolt", e.location, { len: 3, color: col });
          if (e.isValid()) hit(p, e, dmg * (1 - i * 0.08), col);
          p.playSound("ambient.weather.lightning.impact", { volume: 0.4, pitch: 1.6 });
        });
      });
      if (!chain.length) fx(dim, "fx_beam", p.getHeadLocation(), { dir: p.getViewDirection(), len: 12, color: col });
      break;
    }
    case "holy_nova": {
      anim(p, "raise");
      fx(dim, "fx_sigil", loc, { radius: 4, len: 1, color: col, yaw });
      later(8, () => {
        const c = p.location;
        fx(dim, "fx_ring", c, { radius: 6, color: col });
        fx(dim, "fx_pillar", c, { radius: 2, color: col });
        const amt = (6 + stat(p, "int") * 0.4 + stat(p, "vit") * 0.3) * s.pow;
        for (const t of [p, ...nearbyMembers(p, 8)]) heal(t, amt, col);
        for (const e of around(dim, c, 6)) hit(p, e, dmg, col);
        p.playSound("beacon.power", { pitch: 1.4 });
      });
      break;
    }
    case "guard": {
      anim(p, "raise");
      const lvl = s.pow >= 1.5 ? 2 : 1;
      for (const t of [p, ...nearbyMembers(p, 8)]) {
        try {
          t.addEffect("resistance", 160, { amplifier: lvl, showParticles: false });
          t.addEffect("absorption", 160, { amplifier: lvl, showParticles: false });
        } catch {}
        fx(t.dimension, "fx_spiral", t.location, { radius: 0.8, color: col });
        fx(t.dimension, "fx_rise", t.location, { radius: 0.8, color: col });
      }
      p.playSound("beacon.activate", { pitch: 1.3 });
      break;
    }
  }
}
const d0 = (p) => data(p);
const dist = (a, b) => Math.hypot(a.location.x - b.location.x, a.location.z - b.location.z);
function heal(t, amt, col) {
  try {
    const hp = t.getComponent("minecraft:health");
    hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + amt));
    fx(t.dimension, "fx_rise", t.location, { radius: 0.7, color: col });
  } catch {}
}

/** 공격력 버프 배율 (combat.js 일반 공격에도 적용) */
export function buffMul(p) {
  const d = data(p);
  return (d.buffUntil ?? 0) > system.currentTick ? 1 + (d.buffAtk ?? 0) / 100 : 1;
}

// ───────── 발동: ① 클릭 / ② 쉬프트+클릭 / ③ 쉬프트+점프 (직업 도구를 들고) ─────────
export function castKey(p, key) {
  const path = heldPath(p);
  if (!path) return false;
  const d = data(p);
  if (!J.chain(d).includes(path)) {
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
  if (jumping && !was && sneak && heldPath(p)) castKey(p, 3);
}

export function initSkillTriggers() {
  world.afterEvents.itemUse.subscribe(({ itemStack, source: p }) => {
    if (p?.typeId !== "minecraft:player" || !J.pathOfTool(itemStack?.typeId)) return;
    castKey(p, p.isSneaking ? 2 : 1);
  });
}
