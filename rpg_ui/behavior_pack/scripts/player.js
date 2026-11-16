// 플레이어 RPG 데이터 (레벨/경험치/골드/직업/스탯/퀘스트 진행/설정)
import { world, system } from "@minecraft/server";
import { getJSON, setJSON, clone } from "./db.js";
import { CLASSES } from "./classes.js";

const DEFAULT = {
  lv: 1, xp: 0, gold: 0, cls: "novice", pts: 0,
  stat: { str: 0, dex: 0, int: 0, vit: 0 },
  q: { a: {}, d: {}, track: [] },
  set: { quest: true, card: true, invite: true },
  bag: { sort: "rarity" },
  joined: false,
};

const cache = new Map();

export function data(p) {
  let d = cache.get(p.id);
  if (!d) {
    const saved = getJSON(p, "rpg:data", {});
    d = Object.assign(clone(DEFAULT), saved);
    for (const k of ["stat", "q", "set", "bag"]) d[k] = Object.assign(clone(DEFAULT[k]), saved[k] ?? {});
    cache.set(p.id, d);
  }
  return d;
}

export function save(p) {
  const d = cache.get(p.id);
  if (d) setJSON(p, "rpg:data", d);
}

export function forget(id) {
  cache.delete(id);
}

export const MAX_LV = 100;
export const xpNeed = (lv) => Math.floor(30 * Math.pow(lv, 1.5)) + 20;

export function stat(p, k) {
  const d = data(p);
  const c = CLASSES[d.cls] ?? CLASSES.novice;
  return (d.stat[k] ?? 0) + (c.base[k] ?? 0) + Math.floor((d.lv - 1) * (c.grow[k] ?? 0));
}

export function addXp(p, amount, silent = false) {
  const d = data(p);
  if (d.lv >= MAX_LV || amount <= 0) return;
  d.xp += Math.round(amount);
  let up = 0;
  while (d.lv < MAX_LV && d.xp >= xpNeed(d.lv)) {
    d.xp -= xpNeed(d.lv);
    d.lv++;
    d.pts += 3;
    up++;
  }
  save(p);
  if (up) {
    p.onScreenDisplay.setTitle(`§6§lLEVEL UP`, {
      subtitle: `§fLv.${d.lv} §7· 스탯 포인트 +${up * 3}`,
      fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10,
    });
    p.playSound("random.levelup");
    p.dimension.spawnParticle("minecraft:totem_particle", p.location);
  } else if (!silent) {
    p.playSound("random.orb", { volume: 0.4, pitch: 1.4 });
  }
}

export function addGold(p, n) {
  const d = data(p);
  d.gold = Math.max(0, d.gold + Math.round(n));
  save(p);
}

export function msg(p, text) {
  p.sendMessage(`§6[Arcania]§r ${text}`);
}

export function isAdmin(p) {
  return p.hasTag("rpg_admin");
}

export function onlinePlayers() {
  return world.getAllPlayers();
}

export function byId(id) {
  return world.getAllPlayers().find((p) => p.id === id);
}

export function later(fn, ticks = 1) {
  system.runTimeout(fn, ticks);
}
