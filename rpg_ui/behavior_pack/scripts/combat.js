// 전투: 스탯 보너스(힘/민첩), 킬 보상, 파티 경험치 공유, 직업 스킬, 지속 스탯 효과
import { world, system, EntityDamageCause } from "@minecraft/server";
import { data, save, stat, addXp, addGold, msg, notify, maxMp } from "./player.js";
import { CLASSES } from "./classes.js";
import { nearbyMembers } from "./party.js";
import * as Q from "./quests.js";
import { skillHit as weaponSkillHit, buffMul } from "./skills.js";
import { HP_STEPS } from "./hp_steps.js";
import * as WRULES from "./world_rules.js";

// 처치 보상 [경험치, 골드]
const MOB_REWARD = {
  zombie: [10, 4], husk: [12, 5], drowned: [12, 5], zombie_villager: [10, 4], skeleton: [12, 5],
  stray: [12, 5], bogged: [12, 5], spider: [10, 4], cave_spider: [10, 4], creeper: [15, 6],
  enderman: [30, 12], witch: [25, 15], slime: [4, 1], magma_cube: [5, 2], phantom: [15, 6],
  silverfish: [3, 1], endermite: [3, 1], blaze: [30, 12], ghast: [40, 15], wither_skeleton: [40, 18],
  piglin: [15, 6], piglin_brute: [60, 30], zombified_piglin: [15, 6], hoglin: [30, 12],
  zoglin: [30, 12], guardian: [25, 10], elder_guardian: [300, 150], shulker: [25, 10],
  pillager: [20, 10], vindicator: [40, 20], evoker: [80, 50], vex: [10, 3], ravager: [120, 60],
  breeze: [40, 18], creaking: [30, 10], warden: [500, 250], wither: [1500, 800], ender_dragon: [2000, 1000],
};
const PASSIVE_XP = 1;

const lastHit = new Map(); // victimId -> { pid, t }
const skillHit = new Map(); // victimId -> tick (스킬 피해엔 스탯 보너스 중복 적용 X)
const cooldown = new Map(); // pid -> ready tick

// 직업 스킬 마나 소모량
const MP_COST = { novice: 5, warrior: 15, archer: 10, mage: 20, cleric: 25 };

// ═════════ 스탯 → 전투 수치 (V12.123 밸런스 V3) ═════════
//  네 스탯이 하나씩만 맡음 (부가 혜택 없음) · 공격 스탯 셋은 같은 곡선 (100에 +100% · 200에 +150% · 400에 +200%, 상한 없음)
//   힘 = 근접 물리 위력 · 민첩 = 원거리 물리 위력 · 지능 = 마법 위력 · 체력 = 최대 체력 +40
//   치명타는 스탯과 상관없이 모두 5% · 1.5배
const soft = (x, k, max) => (max * Math.max(0, x)) / (Math.max(0, x) + k); // x 가 k 일 때 max 의 절반
export function combatStats(p) {
  const str = stat(p, "str"), dex = stat(p, "dex"), int = stat(p, "int"), vit = stat(p, "vit");
  const melee = Math.round(soft(str, 200, 300)), ranged = Math.round(soft(dex, 200, 300)), magic = Math.round(soft(int, 200, 300));
  return {
    str, dex, int, vit, melee, ranged, magic,
    atk: melee, crit: 5, critDmg: 150,
    spd: 0, dodge: 0, def: 0, mres: 0, cdr: 0, healIn: 0, hpCut: 0, frail: 0, dull: 0, heavy: 0, // 예전 부가 효과 (모두 없앰)
  };
}
/** 공격 스탯 → 위력 배율 (힘 · 민첩 · 지능 공통 곡선) */
export const powOf = (x) => 1 + soft(x, 200, 300) / 100;
export function dealMul(p, s = combatStats(p)) { return (1 + s.atk / 100) * buffMul(p) * (1 - s.dull / 100); }
/** 치명타 굴림: 맞으면 배율, 아니면 1 */
export function rollCrit(p, s = combatStats(p)) { return Math.random() * 100 < s.crit ? s.critDmg / 100 : 1; }

// ───────── 체력 (V12.119): 100 + 레벨 × 50 + 체력 스탯 × 40, 민첩 대가만큼 줄임 · 상한 없음(시스템 10만) ─────────
//   behavior_pack/entities/player.json 의 체력 단계 (2%씩 커지는 단계, gen_player_hp.py) 중 가장 가까운 것
export const HP_CAP = 100000;
export function maxHpOf(p) { return Math.min(HP_CAP, 100 + data(p).lv * 50 + stat(p, "vit") * 40); }
const hpStep = new Map(); // pid -> 지금 단계
function applyMaxHp(p) {
  const want = maxHpOf(p);
  let k = 0; for (let i = 1; i < HP_STEPS.length; i++) if (Math.abs(HP_STEPS[i] - want) < Math.abs(HP_STEPS[k] - want)) k = i;
  if (hpStep.get(p.id) === k) return;
  const hc = p.getComponent("minecraft:health");
  const cur = hc?.currentValue ?? 20, oldMax = hc?.effectiveMax ?? 20;
  try { p.triggerEvent("rpg:hp_clear"); p.triggerEvent(`rpg:hp_${k}`); } catch { return; }
  hpStep.set(p.id, k);
  // 단계를 바꾸면 체력이 최대치로 채워지므로, 바로 다음 틱에 원래 비율로 되돌림 (처음 접속 · 레벨업 땐 그대로 가득)
  const first = !hpLoaded.has(p.id); hpLoaded.add(p.id);
  if (!first) system.runTimeout(() => { try { const h = p.getComponent("minecraft:health"); h.setCurrentValue(Math.max(1, Math.min(h.effectiveMax, (cur / Math.max(1, oldMax)) * h.effectiveMax))); } catch {} }, 1);
}
const hpLoaded = new Set();
/** 몹 · 환경 피해 배율 (V12.111: 레벨 비례 최대 7배 → 1.1배) */
export const incomingMul = (p) => 1.1;
/** 플레이어끼리 피해 배율 */
export const pvpMul = (atk) => 1; // V12.119: 배율 대신 아이템 공격력 · 스킬 위력 자체를 10배로
const lastHurt = new Map(); // pid -> tick (전투 밖 회복용)

export function skillReadyIn(p) {
  return Math.max(0, ((cooldown.get(p.id) ?? 0) - system.currentTick) / 20);
}

function isMonster(e) {
  try {
    return e.matches({ families: ["monster"] });
  } catch {
    return false;
  }
}

export function initCombat() {
  WRULES.setCritHook((p) => rollCrit(p));
  world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource, damage }) => {
    if (hurtEntity.typeId === "minecraft:player") {
      lastHurt.set(hurtEntity.id, system.currentTick);
      const hp = hurtEntity.getComponent("minecraft:health");
      // 피해 종류: 마법 = 마법 직업 스킬 · 몹 마법(마녀 등) / 물리 = 나머지 (평타 · 사신수 · 사흉수 · 근접 · 원거리 · 몹 공격 · 환경)
      const lk = WRULES.lastKind.get(hurtEntity.id);
      const magic = (lk && system.currentTick - lk.t <= 1 ? lk.kind === "magic" : damageSource.cause === "magic");
      const cs0 = combatStats(hurtEntity);
      const red = (magic ? Math.min(75, cs0.mres) : cs0.def) / 100;
      // V12.109: 체력이 최대 1000까지 크므로 몹 · 환경 피해도 레벨에 맞춰 키움 (플레이어끼리는 그대로)
      const fromPlayer = damageSource.damagingEntity?.typeId === "minecraft:player";
      const cs = combatStats(hurtEntity);
      const mul = (fromPlayer ? pvpMul(damageSource.damagingEntity) : incomingMul(hurtEntity)) * (magic ? 1 : 1 + cs.frail / 100);
      // 회피 (민첩): 이번 피해를 통째로 무름
      const dodged = damageSource.cause !== "override" && damageSource.cause !== "void" && Math.random() * 100 < cs.dodge;
      const want = dodged ? 0 : damage * mul * (1 - red); // 최종으로 잃을 양
      if (dodged) { try { hurtEntity.onScreenDisplay.setActionBar("§b§l회피!"); } catch {} }
      if (hp && hp.currentValue > 0 && Math.abs(want - damage) > 0.01) {
        const nv = hp.currentValue - (want - damage);
        if (nv <= 0) hurtEntity.kill();
        else hp.setCurrentValue(Math.min(hp.effectiveMax, nv));
      }
    }
    const atk = damageSource.damagingEntity;
    if (atk?.typeId !== "minecraft:player" || hurtEntity.typeId === "rpg:npc") return;
    lastHit.set(hurtEntity.id, { pid: atk.id, t: system.currentTick });
    if (system.currentTick - (skillHit.get(hurtEntity.id) ?? -99) <= 1) return;
    if (system.currentTick - (weaponSkillHit.get(hurtEntity.id) ?? -99) <= 1) return;
    const hp = hurtEntity.getComponent("minecraft:health");
    if (!hp || hp.currentValue <= 0) return;
    const as = combatStats(atk);
    const crit = rollCrit(atk, as);
    let extra = damage * (dealMul(atk, as) * crit - 1); // 평타: 힘 · 버프 · 둔함 · 치명
    if (crit > 1) {
      hurtEntity.dimension.spawnParticle("minecraft:critical_hit_emitter", { ...hurtEntity.location, y: hurtEntity.location.y + 1 });
      atk.playSound("random.anvil_land", { volume: 0.3, pitch: 2 });
    }
    if (Math.abs(extra) < 0.5) return; // 둔함이면 음수 (피해를 조금 되돌림)
    const nv = Math.min(hp.effectiveMax, hp.currentValue - extra);
    if (nv <= 0) hurtEntity.kill();
    else hp.setCurrentValue(nv);
  });

  world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
    let id, typeId, monster;
    try {
      id = deadEntity.id;
      typeId = deadEntity.typeId;
      monster = isMonster(deadEntity);
    } catch {
      return;
    }
    let killer = damageSource.damagingEntity;
    if (killer?.typeId !== "minecraft:player") {
      const lh = lastHit.get(id);
      if (lh && system.currentTick - lh.t < 200) killer = world.getEntity(lh.pid);
    }
    lastHit.delete(id);
    skillHit.delete(id);
    if (typeId === "minecraft:player") {
      try { Q.onDeath(deadEntity); } catch {}
      return;
    }
    if (killer?.typeId !== "minecraft:player") return;
    const [xp, gold] = MOB_REWARD[typeId.replace("minecraft:", "")] ?? (monster ? [8, 3] : [PASSIVE_XP, 0]);
    addXp(killer, xp);
    if (gold) addGold(killer, Math.round(gold * (0.7 + Math.random() * 0.6)));
    Q.onKill(killer, typeId, monster);
    // 파티: 근처 파티원에게 경험치 40% + 처치 퀘스트 진행 공유
    for (const m of nearbyMembers(killer)) {
      addXp(m, xp * 0.4, true);
      Q.onKill(m, typeId, monster);
    }
  });

  // 지속 스탯: 이동속도는 이동 속성을 직접 변경, 최대 체력만 health_boost(입자 숨김) 사용, 마나 회복
  system.runInterval(() => {
    for (const p of world.getAllPlayers()) {
      applySpeed(p);
      applyStatEffect(p, "health_boost", -1); // 예전 '체력 강화' 효과 정리
      applyMaxHp(p);
      // 전투 밖(6초 동안 안 맞음): 초당 최대 체력의 2% 회복
      try {
        if (system.currentTick - (lastHurt.get(p.id) ?? -999) > 120) {
          const hc = p.getComponent("minecraft:health");
          if (hc && hc.currentValue > 0 && hc.currentValue < hc.effectiveMax) hc.setCurrentValue(Math.min(hc.effectiveMax, hc.currentValue + hc.effectiveMax * 0.02 * (1 + combatStats(p).healIn / 100)));
        }
      } catch {}
      const d = data(p);
      const max = maxMp(p);
      const regen = 4 + data(p).lv * 0.1; // V12.123: 마나는 레벨만 (지능 혜택 없앰)
      const cur = d.mp ?? max;
      const next = Math.min(max, cur + regen);
      if (next !== d.mp) d.mp = next;
    }
  }, 20);
}

const BASE_SPEED = 0.1;
const appliedSpeed = new Map();
function applySpeed(p) {
  const target = BASE_SPEED * (1 + combatStats(p).spd / 100);
  if (Math.abs((appliedSpeed.get(p.id) ?? -1) - target) < 1e-6) return;
  try {
    p.getComponent("minecraft:movement").setCurrentValue(target);
    appliedSpeed.set(p.id, target);
    if (p.getEffect("speed")?.duration > 1000000) p.removeEffect("speed"); // 구버전 effect 제거
  } catch {}
}
export function resetSpeed(p) {
  appliedSpeed.delete(p.id);
}

function applyStatEffect(p, effect, amp) {
  const cur = p.getEffect(effect);
  if (amp < 0) {
    if (cur && cur.duration > 1000000) p.removeEffect(effect);
    return;
  }
  amp = Math.min(amp, 244); // 체력 최대 1000
  if (cur && cur.amplifier === amp && cur.duration > 1000000) return;
  p.addEffect(effect, 19999999, { amplifier: amp, showParticles: false });
}

// ───────── 직업 스킬 ─────────
const EXCLUDE = { excludeTypes: ["minecraft:player", "minecraft:item", "minecraft:xp_orb", "rpg:npc", "minecraft:armor_stand"], excludeFamilies: ["inanimate"] };

function hit(p, target, amount) {
  skillHit.set(target.id, system.currentTick);
  try {
    target.applyDamage(amount, { cause: EntityDamageCause.entityAttack, damagingEntity: p });
  } catch {}
}

export function castSkill(p) {
  const d = data(p);
  const c = CLASSES[d.cls] ?? CLASSES.novice;
  const left = skillReadyIn(p);
  if (left > 0) {
    notify(p, `§7${c.skill.name} 재사용 대기 §f${Math.ceil(left)}초`);
    return;
  }
  const int = stat(p, "int");
  const cost = MP_COST[d.cls] ?? 10;
  const mp = d.mp ?? maxMp(p);
  if (mp < cost) {
    notify(p, `§9마나가 부족합니다 §f(${Math.floor(mp)}/${cost})`);
    p.playSound("note.bass");
    return;
  }
  d.mp = mp - cost;
  const cd = c.skill.cd * (1 - Math.min(0.4, int * 0.01));
  cooldown.set(p.id, system.currentTick + Math.round(cd * 20));
  const dim = p.dimension;
  const loc = p.location;
  const str = stat(p, "str");
  const dex = stat(p, "dex");
  const vit = stat(p, "vit");

  switch (d.cls) {
    case "warrior": {
      const dmg = 6 + str * 0.4;
      for (const e of dim.getEntities({ location: loc, maxDistance: 4, ...EXCLUDE })) {
        hit(p, e, dmg);
        const dx = e.location.x - loc.x, dz = e.location.z - loc.z, len = Math.hypot(dx, dz) || 1;
        try { e.applyKnockback(dx / len, dz / len, 1.2, 0.4); } catch {}
      }
      for (let a = 0; a < 16; a++) {
        const r = (a / 16) * Math.PI * 2;
        dim.spawnParticle("minecraft:critical_hit_emitter", { x: loc.x + Math.cos(r) * 3, y: loc.y + 0.3, z: loc.z + Math.sin(r) * 3 });
      }
      p.playSound("random.explode", { volume: 0.5, pitch: 1.4 });
      break;
    }
    case "archer": {
      const dmg = 7 + dex * 0.5;
      const hits = p.getEntitiesFromViewDirection({ maxDistance: 32, ...EXCLUDE }).slice(0, 3);
      for (const h of hits) hit(p, h.entity, dmg);
      const v = p.getViewDirection();
      const head = p.getHeadLocation();
      for (let i = 1; i < 32; i += 1.5) {
        dim.spawnParticle("minecraft:basic_crit_particle", { x: head.x + v.x * i, y: head.y + v.y * i, z: head.z + v.z * i });
      }
      p.playSound("random.bow", { pitch: 1.6 });
      break;
    }
    case "mage": {
      const dmg = 8 + int * 0.6;
      let center = p.getEntitiesFromViewDirection({ maxDistance: 24, ...EXCLUDE })[0]?.entity?.location;
      if (!center) {
        const b = p.getBlockFromViewDirection({ maxDistance: 24 });
        center = b ? { x: b.block.location.x + 0.5, y: b.block.location.y + 1, z: b.block.location.z + 0.5 } : null;
      }
      if (!center) {
        const v = p.getViewDirection();
        center = { x: loc.x + v.x * 12, y: loc.y + 1.5 + v.y * 12, z: loc.z + v.z * 12 };
      }
      for (const e of dim.getEntities({ location: center, maxDistance: 3, ...EXCLUDE })) {
        hit(p, e, dmg);
        try { e.setOnFire(4, true); } catch {}
      }
      dim.spawnParticle("minecraft:large_explosion", center);
      for (let i = 0; i < 6; i++) dim.spawnParticle("minecraft:basic_flame_particle", { x: center.x + Math.random() * 2 - 1, y: center.y + Math.random(), z: center.z + Math.random() * 2 - 1 });
      p.playSound("mob.blaze.shoot");
      break;
    }
    case "cleric": {
      const amt = 6 + vit * 0.3 + int * 0.3;
      for (const t of [p, ...nearbyMembers(p, 8)]) {
        const hp = t.getComponent("minecraft:health");
        hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + amt * Math.max(1, hp.effectiveMax / 60)));  // V12.109: 체력 최대 1000 → 고정 회복량도 비례
        t.addEffect("regeneration", 100, { amplifier: 0, showParticles: true });
        t.dimension.spawnParticle("minecraft:heart_particle", { ...t.location, y: t.location.y + 2 });
        if (t !== p) msg(t, `§e${p.name}§r 님의 치유의 빛 (+${Math.round(amt)})`);
      }
      p.playSound("random.orb", { pitch: 0.6 });
      break;
    }
    default: {
      const hp = p.getComponent("minecraft:health");
      hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + 4 * Math.max(1, hp.effectiveMax / 60)));  // V12.109: 체력 최대 1000 → 고정 회복량도 비례
      dim.spawnParticle("minecraft:heart_particle", { ...loc, y: loc.y + 2 });
      p.playSound("random.orb");
    }
  }
  notify(p, `${c.color}§l${c.skill.name}!`);
}
