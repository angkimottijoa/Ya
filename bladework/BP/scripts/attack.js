import { world, EntityDamageCause } from "@minecraft/server";
import { CFG, UNSTOPPABLE, SWEEP_SAFE } from "./config.js";
import { CLASSES } from "./moves.js";
import { classify } from "./weapons.js";
import { getState, flash } from "./state.js";
import { now, alive, flat, facing, knock, sfx, fx, effect, play, shake, health, after } from "./util.js";

// Damage dealt by this script is remembered so the hurt event it causes is not mistaken for a normal hit.
const internal = new Map();
function markInternal(id) {
  if (internal.size > 256) internal.clear();
  internal.set(id, now());
}
export const isInternal = id => (internal.get(id) ?? -99) >= now() - 1;

function scriptDamage(player, target, amount) {
  markInternal(target.id);
  try { return target.applyDamage(amount, { cause: EntityDamageCause.entityAttack, damagingEntity: player }); }
  catch { return false; }
}

/** Extra damage on top of a normal hit that has already landed this tick. */
function bonusDamage(player, target, bonus) {
  const hc = health(target);
  if (!hc || bonus <= 0) return;
  const left = hc.currentValue - bonus;
  if (left > 0.01) {
    markInternal(target.id);
    try { hc.setCurrentValue(left); } catch { /* not settable */ }
    return;
  }
  scriptDamage(player, target, 10000);          // lethal: try to keep kill credit
  after(1, () => {
    const h2 = alive(target) ? health(target) : undefined;
    if (h2 && h2.currentValue > 0) { try { target.kill(); } catch { /* already gone */ } }
  });
}

function pvpAllowed() {
  try { return world.gameRules.pvp !== false; } catch { return true; }
}
function isTamed(e) {
  try { return !!e.getComponent("minecraft:is_tamed") || !!e.getComponent("minecraft:tameable")?.isTamed; }
  catch { return false; }
}

function findTargets(player, hit) {
  const loc = player.location, dir = facing(player);
  const cos = Math.cos((hit.arc / 2) * Math.PI / 180);
  let found;
  try { found = player.dimension.getEntities({ location: loc, maxDistance: hit.range + 2 }); } catch { return []; }
  const pvp = pvpAllowed();
  return found.filter(e => {
    if (e.id === player.id || !alive(e) || !health(e)) return false;
    if (e.typeId === "minecraft:player" && !pvp) return false;
    if (SWEEP_SAFE.has(e.typeId) || isTamed(e)) return false;
    const dx = e.location.x - loc.x, dz = e.location.z - loc.z, dy = e.location.y - loc.y;
    if (dy > 3 || dy < -2.5) return false;
    const d = Math.hypot(dx, dz);
    if (d - 0.5 > hit.range) return false;
    if (hit.arc < 360 && d > 1 && (dx * dir.x + dz * dir.z) / d < cos) return false;
    return true;
  });
}

function hitEffects(player, hit, target) {
  const to = flat({ x: target.location.x - player.location.x, z: target.location.z - player.location.z }) ?? facing(player);
  if (!UNSTOPPABLE.has(target.typeId)) {
    if (hit.kb > 0 || hit.lift > 0) knock(target, to, hit.kb, hit.lift);
    if (hit.stun > 0) {
      effect(target, "slowness", hit.stun, 6);
      if (target.typeId !== "minecraft:player") effect(target, "weakness", hit.stun, 20);
    }
  }
  const l = target.location;
  fx(target.dimension, "minecraft:critical_hit_emitter", { x: l.x, y: l.y + 1, z: l.z });
}

function addGauge(st, cur, count) {
  if (cur.isSkill || count <= 0) return;
  st.gauge = Math.min(CFG.GAUGE_MAX, st.gauge + CLASSES[cur.w.cls].gain * Math.min(count, 3));
}

function quake(player, range) {
  const l = player.location, dim = player.dimension;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, r = range * 0.6;
    fx(dim, "minecraft:large_explosion", { x: l.x + Math.cos(a) * r, y: l.y + 0.2, z: l.z + Math.sin(a) * r });
  }
  fx(dim, "minecraft:knockback_roar_particle", { x: l.x, y: l.y + 0.3, z: l.z });
  sfx(player, "random.explode", 0.7, 0.8);
  shake(player, 0.35, 0.25);
}

function resolve(player, st, cur, hit, index) {
  if (!alive(player) || st.cur !== cur) return;
  let targets;
  if (hit.detonate) {
    targets = [...cur.marked.values()].filter(alive);
  } else {
    targets = findTargets(player, hit);
    if (index === 0) targets = targets.filter(e => !cur.vanilla.has(e.id));
    if (hit.mark) {
      targets = targets.filter(e => !cur.marked.has(e.id));
      for (const e of targets) cur.marked.set(e.id, e);
    }
  }
  for (const e of targets) {
    scriptDamage(player, e, cur.w.dmg * hit.mult);
    if (alive(e)) hitEffects(player, hit, e);
  }
  if (hit.quake) quake(player, hit.range);
  if (targets.length) {
    sfx(player, "game.player.attack.strong", 0.9, cur.move.heavy ? 0.8 : 1.15);
    if (cur.move.heavy || hit.detonate) shake(player, 0.12, 0.1);
    if (hit.detonate) sfx(player, "item.trident.return", 1, 1.6);
    addGauge(st, cur, targets.length);
    st.lastCombat = now();
  }
}

function pickMove(player, st, w, t) {
  const cls = CLASSES[w.cls];
  if (player.isSneaking && cls.skill && st.gauge >= cls.cost) {
    st.gauge -= cls.cost; st.combo = 0;
    flash(st, "bw.skill." + w.cls, t, 30);
    return { move: cls.skill, isSkill: true };
  }
  let falling = false;
  try { falling = !player.isOnGround && player.isFalling && !player.isInWater && !player.isGliding && !player.isFlying; } catch { /* keep false */ }
  if (falling && cls.air) { st.combo = 0; return { move: cls.air }; }
  if (player.isSprinting && cls.dash) { st.combo = 0; return { move: cls.dash }; }
  if (t > st.comboUntil) st.combo = 0;
  const move = cls.combo[st.combo % cls.combo.length];
  st.combo = (st.combo + 1) % cls.combo.length;
  st.comboShown = st.combo === 0 ? cls.combo.length : st.combo;
  return { move };
}

/** Starts a move if the player is free to act. Returns the running move when one started this tick. */
export function startAttack(player, st, w) {
  const t = now();
  if (st.attackTick === t) return st.cur;
  if (t < st.brokenUntil) return null;
  if (t < st.busyUntil) {
    const wait = st.busyUntil - t;
    if (wait <= CFG.INPUT_BUFFER && !st.buffered) {
      st.buffered = true;
      after(wait, () => {
        st.buffered = false;
        if (!alive(player) || !st.mode) return;
        const w2 = classify(player);
        if (w2) startAttack(player, st, w2);
      });
    }
    return null;
  }
  const { move, isSkill } = pickMove(player, st, w, t);
  const cur = { move, w, start: t, isSkill: !!isSkill, vanilla: new Set(), marked: new Map() };
  st.cur = cur; st.attackTick = t; st.lastCombat = t;
  st.busyUntil = t + move.dur;
  st.comboUntil = t + move.dur + CFG.COMBO_WINDOW;
  play(player, move.anim);
  sfx(player, isSkill ? "item.trident.riptide_1" : "item.trident.throw", isSkill ? 0.8 : 0.5, move.heavy ? 0.7 : 1.3);
  if (move.iframes) {
    st.iframeUntil = Math.max(st.iframeUntil, t + move.iframes);
    effect(player, "resistance", move.iframes, 4);
  }
  if (move.lunge) {
    const l = move.lunge;
    after(l.t, () => { if (alive(player) && st.cur === cur) knock(player, facing(player), l.f, l.up ?? 0); });
  } else {
    effect(player, "slowness", move.dur, 1);
  }
  move.hits.forEach((hit, i) => after(hit.t, () => resolve(player, st, cur, hit, i)));
  return cur;
}

export function onSwing(player) {
  const st = getState(player);
  if (!st.mode) return;
  const w = classify(player);
  if (w) startAttack(player, st, w);
}

/** A normal melee hit landed: fold it into the current move (bonus damage, stagger, gauge). */
export function onVanillaHit(player, target, damage) {
  const st = getState(player);
  if (!st.mode) return;
  const w = classify(player);
  if (!w) return;
  startAttack(player, st, w);
  const cur = st.cur, t = now();
  if (w.item?.typeId.startsWith("bw:")) wear(player, w.item);
  if (!cur || t - cur.start > 1 || cur.vanilla.has(target.id)) return;
  cur.vanilla.add(target.id);
  const hit = cur.move.hits[0];
  if (hit.mark) cur.marked.set(target.id, target);
  if (hit.mult > 1 && alive(target)) bonusDamage(player, target, damage * (hit.mult - 1));
  if (alive(target)) hitEffects(player, hit, target);
  addGauge(st, cur, 1);
}

/** Custom weapons lose durability on hit; applied here only if the game did not already do it. */
function wear(player, item) {
  let before, slot, creative = false;
  try {
    before = item.getComponent("minecraft:durability")?.damage;
    slot = player.selectedSlotIndex;
    creative = String(player.getGameMode()).toLowerCase() === "creative";
  } catch { return; }
  if (before === undefined || creative) return;
  after(1, () => {
    try {
      if (!alive(player)) return;
      const box = player.getComponent("minecraft:inventory").container;
      const it = box.getItem(slot);
      const dc = it?.typeId === item.typeId ? it.getComponent("minecraft:durability") : undefined;
      if (!dc || dc.damage !== before) return;
      const unbreaking = it.getComponent("minecraft:enchantable")?.getEnchantment("unbreaking")?.level ?? 0;
      if (Math.random() >= 1 / (unbreaking + 1)) return;
      if (dc.damage + 1 > dc.maxDurability) { box.setItem(slot, undefined); sfx(player, "random.break"); }
      else { dc.damage = dc.damage + 1; box.setItem(slot, it); }
    } catch { /* inventory changed underneath us */ }
  });
}
