import { EntityDamageCause as C } from "@minecraft/server";
import { CFG, UNSTOPPABLE } from "./config.js";
import { CLASSES } from "./moves.js";
import { spend, flash } from "./state.js";
import { alive, flat, facing, knock, sfx, fx, effect, play, shake, health } from "./util.js";

const BLOCKABLE = new Set([C.entityAttack, C.projectile, C.entityExplosion, C.blockExplosion]);
// Damage types that the guard's resistance wrongly softens; the difference is given back.
const RESTORE = new Set([C.entityAttack, C.projectile, C.entityExplosion, C.blockExplosion, C.fall, C.fire,
  C.fireTick, C.lava, C.contact, C.anvil, C.fallingBlock, C.lightning, C.magma, C.freezing, C.flyIntoWall,
  C.stalactite, C.stalagmite, C.thorns, C.suffocation, C.drowning]);

function dodge(player, st, t) {
  if (st.stamina < CFG.DODGE_COST) { flash(st, "bw.msg.nostamina", t, 16); return; }
  spend(st, CFG.DODGE_COST, t);
  st.cur = null; st.combo = 0; st.guarding = false; st.lastCombat = t;
  st.busyUntil = t + CFG.DODGE_LOCK;
  st.iframeUntil = t + CFG.DODGE_IFRAMES;
  effect(player, "resistance", CFG.DODGE_IFRAMES, 4);
  const look = facing(player);
  let v = { x: 0, z: 0 };
  try { v = player.getVelocity(); } catch { /* keep zero */ }
  const move = Math.hypot(v.x, v.z) > 0.02 ? flat(v) : null;
  if (move && move.x * look.x + move.z * look.z > -0.5) {
    knock(player, move, CFG.DODGE_FORCE, 0.1);
    play(player, "roll");
  } else {
    knock(player, move ?? { x: -look.x, z: -look.z }, CFG.BACKSTEP_FORCE, 0.12);
    play(player, "backstep");
  }
  sfx(player, "armor.equip_leather", 1, 1.2);
}

/** Per-tick input handling: sneak taps (dodge), guard upkeep, stamina regeneration. */
export function tickDefense(player, st, w, t) {
  const sneaking = player.isSneaking;
  if (sneaking && !st.sneaking) {
    if (st.dodge && w && t - st.lastTap <= CFG.DOUBLE_TAP) { st.lastTap = -999; dodge(player, st, t); }
    else st.lastTap = t;
  }
  st.sneaking = sneaking;

  const guarding = sneaking && !!w && CLASSES[w.cls].guard && t >= st.brokenUntil && t >= st.iframeUntil && st.stamina > 0;
  if (guarding && !st.guarding) {
    st.guardStart = t;
    play(player, "guard", { controller: "bw.guard", stopExpression: "!query.is_sneaking", blendOutTime: 0.15 });
  }
  st.guarding = guarding;
  if (guarding) effect(player, "resistance", 3, CFG.GUARD_RESIST);
  else if (st.stamina < CFG.STAMINA_MAX && t - st.lastUse > CFG.STAMINA_REGEN_DELAY && t >= st.brokenUntil) {
    st.stamina = Math.min(CFG.STAMINA_MAX, st.stamina + CFG.STAMINA_REGEN * (t < st.busyUntil ? 0.5 : 1));
  }
  const hc = health(player);
  if (hc) st.lastHp = hc.currentValue;
}

export function onPlayerHurt(player, st, ev, t) {
  const hc = health(player);
  if (!hc) return;
  const cur = hc.currentValue;
  const loss = st.lastHp === undefined ? ev.damage : Math.max(0, st.lastHp - cur);
  st.lastHp = cur; st.lastCombat = t;
  if (!st.mode || !st.guarding || cur <= 0) return;

  const src = ev.damageSource;
  const origin = src.damagingProjectile ?? src.damagingEntity;
  let to = null;
  if (alive(origin)) to = flat({ x: origin.location.x - player.location.x, z: origin.location.z - player.location.z });
  const look = facing(player);
  const front = !to || to.x * look.x + to.z * look.z > 0.15;

  if (BLOCKABLE.has(src.cause) && front) {
    if (t - st.guardStart <= CFG.PARRY_WINDOW) {
      try { hc.setCurrentValue(Math.min(hc.effectiveMax, cur + loss)); st.lastHp = hc.currentValue; } catch { /* keep */ }
      st.gauge = Math.min(CFG.GAUGE_MAX, st.gauge + CFG.GAUGE_PARRY);
      st.stamina = Math.min(CFG.STAMINA_MAX, st.stamina + 2);
      flash(st, "bw.msg.parry", t);
      sfx(player, "random.anvil_land", 0.5, 1.7);
      play(player, "parry");
      shake(player, 0.1, 0.1);
      const l = player.location;
      fx(player.dimension, "minecraft:critical_hit_emitter", { x: l.x + look.x * 0.8, y: l.y + 1.2, z: l.z + look.z * 0.8 });
      const foe = src.damagingEntity;
      if (src.cause === C.entityAttack && alive(foe) && !UNSTOPPABLE.has(foe.typeId)) {
        effect(foe, "slowness", 30, 6);
        if (foe.typeId !== "minecraft:player") effect(foe, "weakness", 30, 20);
        knock(foe, to ?? look, 0.9, 0.2);
      }
      return;
    }
    const raw = loss > 0 ? loss / CFG.GUARD_FACTOR : ev.damage;
    spend(st, raw * CFG.GUARD_COST + CFG.GUARD_COST_FLAT, t);
    if (st.stamina <= 0) {
      st.brokenUntil = t + CFG.GUARD_BREAK_TICKS; st.guarding = false; st.cur = null;
      try { player.removeEffect("resistance"); } catch { /* none */ }
      effect(player, "slowness", CFG.GUARD_BREAK_TICKS, 3);
      flash(st, "bw.msg.break", t, 40);
      sfx(player, "random.break", 1, 0.7);
      play(player, "stagger");
      shake(player, 0.3, 0.2);
    } else {
      sfx(player, "item.shield.block", 0.9, 1);
      play(player, "guard_hit", { controller: "bw.react" });
    }
    return;
  }
  // Not something a guard should stop (hit from behind, fall, fire...): undo the reduction.
  if (!RESTORE.has(src.cause) || loss <= 0) return;
  const left = cur - loss * (1 / CFG.GUARD_FACTOR - 1);
  try {
    if (left > 0.01) { hc.setCurrentValue(left); st.lastHp = left; }
    else { player.removeEffect("resistance"); player.kill(); }
  } catch { /* leave as is */ }
}
