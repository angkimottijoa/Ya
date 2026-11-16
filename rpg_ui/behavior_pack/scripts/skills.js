// 직업 스킬 시스템 (V2.6)
// - 스킬은 직업 승급 단계(jobs.js)마다 정해지고, 그 단계의 "사용 무기"를 들고 있어야 쓸 수 있다.
// - 무기 분류는 자동 판별(태그 → 이름 → 제작자 지정)하고, 처음 보는 무기는 자동 등록한다.
// - 장착 칸 2개: 스킬 1 = 쉬프트+공격, 스킬 2 = 쉬프트+공중 공격 (활/쇠뇌는 쉬프트+발사, 공중이면 스킬 2)
import { world, system, EntityDamageCause } from "@minecraft/server";
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

// ───────── 스킬 효과 목록 (직업 스킬의 fx 로 사용) ─────────
export const FX = [
  { id: "sword_spin", name: "주변 베기 (원형 범위)" }, { id: "sword_dash", name: "돌진 + 범위" },
  { id: "sword_judge", name: "단일 강타 + 구속" }, { id: "axe_slam", name: "내려찍기 + 띄우기" },
  { id: "mace_quake", name: "지진 (넓은 범위)" }, { id: "axe_rage", name: "공격력 버프" },
  { id: "bow_pierce", name: "관통 직선 (3명)" }, { id: "spear_thrust", name: "짧은 직선 관통" },
  { id: "bow_rain", name: "범위 3연타" }, { id: "xbow_burst", name: "지점 폭발" },
  { id: "staff_fire", name: "화염 폭발 + 화상" }, { id: "xbow_volley", name: "부채꼴 3발" },
  { id: "spear_storm", name: "번개" }, { id: "staff_frost", name: "냉기 범위 + 구속" },
  { id: "staff_heal", name: "파티 회복" }, { id: "fist_breath", name: "자기 회복" }, { id: "fist_combo", name: "3연타" },
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

// ───────── 장착 (스킬 1 / 스킬 2) / 쿨다운 ─────────
/** slot: "main" = 스킬 1, "sub" = 스킬 2 */
export function equippedJob(p, slot = "main") {
  const d = data(p);
  const learned = J.learned(d);
  const id = slot === "sub" ? d.jsk?.s2 : d.jsk?.s1;
  const s = learned.find((x) => x.id === id);
  if (s) return s;
  if (slot === "sub") return null;
  return learned[0] ?? null;
}

export function equipJob(p, id, slot = "main") {
  const d = data(p);
  d.jsk = d.jsk ?? {};
  const key = slot === "sub" ? "s2" : "s1";
  const other = slot === "sub" ? "s1" : "s2";
  d.jsk[key] = id;
  if (d.jsk[other] === id) delete d.jsk[other];
  save(p);
}
export function unequipJob(p, slot) {
  const d = data(p);
  if (d.jsk) delete d.jsk[slot === "sub" ? "s2" : "s1"];
  save(p);
}

/** 스킬을 지금 무기로 쓸 수 있나 */
export function weaponOk(p, s) {
  const w = heldClass(p);
  return (J.PATHS[s.path]?.weapons ?? []).includes(w);
}

const cd = new Map();
export function readyIn(p, id) {
  return Math.max(0, ((cd.get(`${p.id}|${id}`) ?? 0) - system.currentTick) / 20);
}

/** HUD 표시용 */
export function currentSkillInfo(p) {
  const s = equippedJob(p, "main");
  const s2 = equippedJob(p, "sub");
  return { skill: s, left: s ? readyIn(p, s.id) : 0, sub: s2, left2: s2 ? readyIn(p, s2.id) : 0 };
}


// ───────── 발동 ─────────
const EXCLUDE = { excludeTypes: ["minecraft:player", "minecraft:item", "minecraft:xp_orb", "rpg:npc", "minecraft:armor_stand"], excludeFamilies: ["inanimate"] };
export const skillHit = new Map(); // victimId -> tick (스탯 보너스 중복 방지용, combat.js 가 참조)

function hit(p, e, amount) {
  skillHit.set(e.id, system.currentTick);
  try {
    e.applyDamage(Math.max(1, amount), { cause: EntityDamageCause.entityAttack, damagingEntity: p });
  } catch {}
}
function around(dim, loc, r) {
  return dim.getEntities({ location: loc, maxDistance: r, ...EXCLUDE });
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
function ring(dim, c, r, particle = "minecraft:critical_hit_emitter") {
  for (let a = 0; a < 14; a++) {
    const t = (a / 14) * Math.PI * 2;
    try { dim.spawnParticle(particle, { x: c.x + Math.cos(t) * r, y: c.y + 0.3, z: c.z + Math.sin(t) * r }); } catch {}
  }
}
function line(p, len, step, particle) {
  const v = p.getViewDirection();
  const h = p.getHeadLocation();
  for (let i = 1; i < len; i += step) {
    try { p.dimension.spawnParticle(particle, { x: h.x + v.x * i, y: h.y + v.y * i, z: h.z + v.z * i }); } catch {}
  }
}

/** 스킬 위력 (기본 공격력 × 계수 × 스탯/직업 보너스) */
function power(p, s) {
  const d = data(p);
  const held = heldStack(p);
  const cfg = held ? weaponCfg()[held.typeId] : null;
  const base = (s.kind === "magic" ? 5 + stat(p, "int") * 0.6 : (cfg?.atk ?? weaponInfo(held?.typeId ?? "")?.atk ?? 3)) * ((cfg?.mul ?? 100) / 100);
  const statMul = s.kind === "melee" ? 1 + stat(p, "str") * 0.02 : s.kind === "ranged" ? 1 + stat(p, "dex") * 0.02 : 1;
  const buff = (d.buffUntil ?? 0) > system.currentTick ? 1 + (d.buffAtk ?? 0) / 100 : 1;
  const cls = 1 + (J.PATHS[s.path]?.tier ?? 1) * 0.1;
  return base * s.pow * statMul * buff * cls;
}

export function castWeaponSkill(p, id, slot = "main") {
  const d = data(p);
  const s = id ? getSkill(id) : equippedJob(p, slot);
  if (!s) {
    notify(p, J.chain(d).length ? `§7스킬 ${slot === "sub" ? 2 : 1} 칸이 비어 있습니다 §f(메뉴 > 직업·스킬)` : "§7직업을 먼저 정하세요 §f(메뉴 > 직업·스킬)");
    return false;
  }
  if (d.lv < s.lv) {
    notify(p, `§7${s.name} §c- Lv.${s.lv} 필요`);
    return false;
  }
  if (!weaponOk(p, s)) {
    notify(p, `§7${s.name} §c- ${(J.PATHS[s.path]?.weapons ?? []).map((w) => WCLASS[w]?.name).join("·")} 중 하나를 들어야 사용 가능`);
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
  const dim = p.dimension;
  const loc = p.location;
  const dmg = power(p, s);

  switch (s.fx ?? s.id) {
    case "sword_spin":
      for (const e of around(dim, loc, 3.5)) hit(p, e, dmg);
      ring(dim, loc, 2.5);
      p.playSound("item.trident.riptide_1", { pitch: 1.4 });
      break;
    case "sword_dash": {
      const v = p.getViewDirection();
      try { p.applyKnockback(v.x, v.z, 2.6, 0.25); } catch {}
      system.runTimeout(() => {
        if (!p.isValid()) return;
        for (const e of around(dim, p.location, 3)) hit(p, e, dmg);
        ring(dim, p.location, 1.5, "minecraft:basic_crit_particle");
      }, 5);
      p.playSound("mob.irongolem.throw");
      break;
    }
    case "sword_judge": {
      const t = p.getEntitiesFromViewDirection({ maxDistance: 6, ...EXCLUDE })[0]?.entity;
      if (t) {
        hit(p, t, dmg);
        try { t.addEffect("slowness", 60, { amplifier: 4 }); } catch {}
        dim.spawnParticle("minecraft:large_explosion", t.location);
      }
      p.playSound("random.anvil_land", { pitch: 0.6 });
      break;
    }
    case "axe_slam":
    case "mace_quake": {
      const r = s.fx === "mace_quake" ? 5 : 4;
      for (const e of around(dim, loc, r)) {
        hit(p, e, dmg);
        const dx = e.location.x - loc.x, dz = e.location.z - loc.z, len = Math.hypot(dx, dz) || 1;
        try { e.applyKnockback(dx / len, dz / len, 0.6, s.fx === "mace_quake" ? 0.9 : 0.6); } catch {}
      }
      ring(dim, loc, r - 1, "minecraft:huge_explosion_emitter");
      p.playSound("random.explode", { volume: 0.6, pitch: 0.8 });
      break;
    }
    case "axe_rage":
      d.buffAtk = s.pow;
      d.buffUntil = system.currentTick + 200;
      dim.spawnParticle("minecraft:villager_angry", { ...loc, y: loc.y + 2 });
      p.playSound("mob.ravager.roar", { volume: 0.5 });
      break;
    case "bow_pierce":
    case "spear_thrust": {
      const range = s.fx === "spear_thrust" ? 6 : 32;
      const hits = p.getEntitiesFromViewDirection({ maxDistance: range, ...EXCLUDE });
      for (const h of s.fx === "bow_pierce" ? hits.slice(0, 3) : hits) hit(p, h.entity, dmg);
      line(p, range, 1.2, "minecraft:basic_crit_particle");
      p.playSound(s.fx === "bow_pierce" ? "random.bow" : "item.trident.throw", { pitch: 1.5 });
      break;
    }
    case "bow_rain": {
      const c = lookTargetPoint(p, 32);
      for (let i = 0; i < 3; i++) system.runTimeout(() => {
        for (const e of around(dim, c, 4)) hit(p, e, dmg);
        for (let k = 0; k < 10; k++) try { dim.spawnParticle("minecraft:basic_crit_particle", { x: c.x + Math.random() * 8 - 4, y: c.y + 3, z: c.z + Math.random() * 8 - 4 }); } catch {}
        p.playSound("random.bowhit");
      }, i * 10);
      break;
    }
    case "xbow_burst":
    case "staff_fire": {
      const c = lookTargetPoint(p, 28);
      for (const e of around(dim, c, 3)) {
        hit(p, e, dmg);
        if (s.fx === "staff_fire") try { e.setOnFire(4, true); } catch {}
      }
      dim.spawnParticle("minecraft:large_explosion", c);
      p.playSound(s.fx === "staff_fire" ? "mob.blaze.shoot" : "random.explode", { volume: 0.6 });
      break;
    }
    case "xbow_volley": {
      const v = p.getViewDirection();
      const h = p.getHeadLocation();
      for (const ang of [-0.25, 0, 0.25]) {
        const dx = v.x * Math.cos(ang) - v.z * Math.sin(ang), dz = v.x * Math.sin(ang) + v.z * Math.cos(ang);
        for (let i = 1; i < 24; i += 1) {
          const pt = { x: h.x + dx * i, y: h.y + v.y * i, z: h.z + dz * i };
          for (const e of around(dim, pt, 1)) if (system.currentTick - (skillHit.get(e.id) ?? -9) > 0) hit(p, e, dmg);
          if (i % 2 === 0) try { dim.spawnParticle("minecraft:basic_crit_particle", pt); } catch {}
        }
      }
      p.playSound("crossbow.shoot");
      break;
    }
    case "spear_storm": {
      const c = lookTargetPoint(p, 32);
      try { dim.spawnEntity("minecraft:lightning_bolt", c); } catch {}
      for (const e of around(dim, c, 3)) hit(p, e, dmg);
      break;
    }
    case "staff_frost":
      for (const e of around(dim, loc, 5)) {
        hit(p, e, dmg);
        try { e.addEffect("slowness", 80, { amplifier: 2 }); } catch {}
      }
      ring(dim, loc, 4, "minecraft:snowflake_particle");
      p.playSound("random.glass", { pitch: 1.3 });
      break;
    case "staff_heal":
    case "fist_breath": {
      const amt = (s.fx === "staff_heal" ? 6 + stat(p, "vit") * 0.3 + stat(p, "int") * 0.3 : 4) * s.pow;
      const bonus = 1 + (J.PATHS[s.path]?.tier ?? 1) * 0.15;
      const targets = s.fx === "staff_heal" ? [p, ...nearbyMembers(p, 8)] : [p];
      for (const t of targets) {
        const hp = t.getComponent("minecraft:health");
        hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + amt * bonus));
        try { t.dimension.spawnParticle("minecraft:heart_particle", { ...t.location, y: t.location.y + 2 }); } catch {}
      }
      p.playSound("random.orb", { pitch: 0.7 });
      break;
    }
    case "fist_combo": {
      const t = p.getEntitiesFromViewDirection({ maxDistance: 4, ...EXCLUDE })[0]?.entity;
      if (t) for (let i = 0; i < 3; i++) system.runTimeout(() => t.isValid() && hit(p, t, dmg), i * 6);
      p.playSound("game.player.attack.strong");
      break;
    }
  }
  notify(p, `§b§l${s.name}! §r§9-${s.mp} MP`);
  return true;
}

/** 공격력 버프 배율 (combat.js 일반 공격에도 적용) */
export function buffMul(p) {
  const d = data(p);
  return (d.buffUntil ?? 0) > system.currentTick ? 1 + (d.buffAtk ?? 0) / 100 : 1;
}

/** 발동: 쉬프트+공격 = 스킬 1, 쉬프트+공중(점프 중) 공격 = 스킬 2. 활/쇠뇌는 쉬프트+발사 */
const slotOf = (p) => {
  let air = false;
  try { air = !p.isOnGround; } catch {}
  return air ? "sub" : "main";
};
export function initSkillTriggers() {
  world.afterEvents.entityHitEntity?.subscribe(({ damagingEntity: p }) => {
    if (p?.typeId !== "minecraft:player" || !p.isSneaking) return;
    if (data(p).set.shiftAttack === false) return;
    const w = heldClass(p);
    if (w === "bow" || w === "crossbow") return;
    castWeaponSkill(p, undefined, slotOf(p));
  });
  world.afterEvents.itemReleaseUse?.subscribe(({ itemStack, source: p }) => {
    if (!p.isSneaking || !itemStack) return;
    const w = weaponClassOf(itemStack);
    if (w === "bow" || w === "spear" || w === "crossbow") castWeaponSkill(p, undefined, slotOf(p));
  });
  world.afterEvents.itemUse.subscribe(({ itemStack, source: p }) => {
    if (!p.isSneaking) return;
    const w = weaponClassOf(itemStack);
    if (w === "staff" || w === "crossbow") castWeaponSkill(p, undefined, slotOf(p));
  });
}
