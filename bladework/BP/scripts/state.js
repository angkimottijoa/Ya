import { CFG } from "./config.js";

const states = new Map();

export function getState(player) {
  let st = states.get(player.id);
  if (!st) {
    st = {
      stamina: CFG.STAMINA_MAX, gauge: 0, lastUse: -999,
      combo: 0, comboUntil: 0, busyUntil: 0, attackTick: -1, buffered: false, cur: null,
      sneaking: false, lastTap: -999, guarding: false, guardStart: 0, brokenUntil: 0, iframeUntil: 0,
      lastHp: undefined, flash: null, flashUntil: 0, hudWasShown: false,
      mode: readProp(player, "bw:mode", true), hud: readProp(player, "bw:hud", 1), dodge: readProp(player, "bw:dodge", true),
    };
    states.set(player.id, st);
  }
  return st;
}
export const dropState = id => states.delete(id);

function readProp(player, key, fallback) {
  try { const v = player.getDynamicProperty(key); return v === undefined ? fallback : v; } catch { return fallback; }
}
export function saveSetting(player, st, key, value) {
  st[key] = value;
  try { player.setDynamicProperty("bw:" + key, value); } catch { /* property storage unavailable */ }
}
export function spend(st, amount, tick) {
  st.stamina = Math.max(0, st.stamina - amount);
  st.lastUse = tick;
}
export function flash(st, key, tick, ticks = 24) {
  st.flash = key; st.flashUntil = tick + ticks;
}
