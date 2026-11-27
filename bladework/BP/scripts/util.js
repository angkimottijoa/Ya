import { system } from "@minecraft/server";

export const now = () => system.currentTick;
export const alive = e => { try { return !!e && e.isValid; } catch { return false; } };

export function flat(v) {
  const l = Math.hypot(v.x, v.z);
  return l < 1e-4 ? null : { x: v.x / l, z: v.z / l };
}
export function facing(player) {
  return flat(player.getViewDirection()) ?? { x: 0, z: 1 };
}
export function knock(entity, dir, force, up = 0) {
  try { entity.applyKnockback({ x: dir.x * force, z: dir.z * force }, up); }
  catch {
    try { entity.applyKnockback(dir.x, dir.z, force, up); } catch { /* immune to knockback */ }
  }
}
export function sfx(entity, id, volume = 1, pitch = 1) {
  try { entity.dimension.playSound(id, entity.location, { volume, pitch }); } catch { /* unknown sound */ }
}
export function fx(dimension, id, loc) {
  try { dimension.spawnParticle(id, loc); } catch { /* unloaded chunk or unknown particle */ }
}
export function effect(entity, id, ticks, amplifier = 0) {
  try { entity.addEffect(id, Math.max(1, Math.round(ticks)), { amplifier, showParticles: false }); } catch { /* immune */ }
}
export function play(player, name, opts = {}) {
  try { player.playAnimation("animation.bw." + name, { blendOutTime: 0.12, controller: "bw.main", ...opts }); }
  catch { /* animation missing */ }
}
export function shake(player, intensity, seconds) {
  try { player.runCommand(`camerashake add @s ${intensity} ${seconds} positional`); } catch { /* no permission */ }
}
export function health(entity) {
  try { return entity.getComponent("minecraft:health"); } catch { return undefined; }
}
export const after = (ticks, fn) => system.runTimeout(fn, Math.max(1, ticks));
