// 전투: 스탯 보너스(힘/민첩), 킬 보상, 파티 경험치 공유, 직업 스킬, 지속 스탯 효과
import { world, system, EntityDamageCause } from "@minecraft/server";
import { data, save, stat, addXp, addGold, msg, notify, maxMp } from "./player.js";
import { CLASSES } from "./classes.js";
import { nearbyMembers } from "./party.js";
import * as Q from "./quests.js";
import { skillHit as weaponSkillHit, buffMul } from "./skills.js";

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

/** 스탯 → 전투 수치 (%). effect 없이 스크립트가 직접 적용 */
export function combatStats(p) {
  const str = stat(p, "str"), dex = stat(p, "dex"), vit = stat(p, "vit");
  return {
    atk: str * 2,
    crit: Math.min(40, dex),
    spd: Math.min(40, Math.round(dex * 0.4)),
    def: Math.min(40, Math.round(vit * 0.8)),
  };
}

// ───────── 체력 (V12.115): 최대 1만 = 20 + 레벨 × 40 + 체력 스탯 × 30 (100 단위) ─────────
//   바닐라 '체력 강화' 효과 대신 behavior_pack/entities/player.json 의 체력 단계(rpg:hp_1 ~ rpg:hp_100)를 바꿈
export const HP_CAP = 10000, HP_STEP = 100;
export function maxHpOf(p) { return Math.min(HP_CAP, 20 + data(p).lv * 40 + stat(p, "vit") * 30); }
const hpStep = new Map(); // pid -> 지금 단계
function applyMaxHp(p) {
  const k = Math.max(1, Math.min(HP_CAP / HP_STEP, Math.round(maxHpOf(p) / HP_STEP)));
  if (hpStep.get(p.id) === k) return;
  const hc = p.getComponent("minecraft:health");
  const cur = hc?.currentValue ?? 20, oldMax = hc?.effectiveMax ?? 20;
  try { p.triggerEvent(`rpg:hp_${k}`); } catch { return; }
  hpStep.set(p.id, k);
  // 단계를 바꾸면 체력이 최대치로 채워지므로, 바로 다음 틱에 원래 비율로 되돌림 (처음 접속 · 레벨업 땐 그대로 가득)
  const first = !hpLoaded.has(p.id); hpLoaded.add(p.id);
  if (!first) system.runTimeout(() => { try { const h = p.getComponent("minecraft:health"); h.setCurrentValue(Math.max(1, Math.min(h.effectiveMax, (cur / Math.max(1, oldMax)) * h.effectiveMax))); } catch {} }, 1);
}
const hpLoaded = new Set();
/** 몹 · 환경 피해 배율 (V12.111: 레벨 비례 최대 7배 → 1.1배) */
export const incomingMul = (p) => 1.1;
/** 플레이어끼리 피해 배율: 최대 체력을 1000 → 1만으로 10배 늘린 만큼 */
export const PVP_MUL = 10;
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
  world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource, damage }) => {
    if (hurtEntity.typeId === "minecraft:player") {
      lastHurt.set(hurtEntity.id, system.currentTick);
      const hp = hurtEntity.getComponent("minecraft:health");
      const red = combatStats(hurtEntity).def / 100;
      // V12.109: 체력이 최대 1000까지 크므로 몹 · 환경 피해도 레벨에 맞춰 키움 (플레이어끼리는 그대로)
      const fromPlayer = damageSource.damagingEntity?.typeId === "minecraft:player";
      const mul = fromPlayer ? PVP_MUL : incomingMul(hurtEntity); // V12.117: 플레이어 공격(평타 · 스킬)은 체력 1만에 맞춰 10배
      const want = damage * mul * (1 - red); // 최종으로 잃을 양
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
    const str = stat(atk, "str");
    const dex = stat(atk, "dex");
    let extra = damage * (str * 0.02 + buffMul(atk) - 1);
    if (Math.random() < Math.min(0.4, dex * 0.01)) {
      extra += damage * 0.5;
      hurtEntity.dimension.spawnParticle("minecraft:critical_hit_emitter", { ...hurtEntity.location, y: hurtEntity.location.y + 1 });
      atk.playSound("random.anvil_land", { volume: 0.3, pitch: 2 });
    }
    if (extra < 0.5) return;
    const nv = hp.currentValue - extra;
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
          if (hc && hc.currentValue > 0 && hc.currentValue < hc.effectiveMax) hc.setCurrentValue(Math.min(hc.effectiveMax, hc.currentValue + hc.effectiveMax * 0.02));
        }
      } catch {}
      const d = data(p);
      const max = maxMp(p);
      const regen = 4 + stat(p, "int") * 0.12 + data(p).lv * 0.05;
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
