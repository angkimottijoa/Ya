// 플레이어 RPG 데이터 (레벨/경험치/골드/직업/스탯/퀘스트 진행/설정)
import { world, system } from "@minecraft/server";
import { getJSON, setJSON, clone } from "./db.js";
import { CLASSES } from "./classes.js";
import { pathBonus } from "./jobs.js";

const DEFAULT = {
  lv: 1, xp: 0, gold: 0, cls: "novice", pts: 0,
  stat: { str: 0, dex: 0, int: 0, vit: 0 },
  q: { a: {}, d: {}, track: [] },
  set: { quest: true, card: true, invite: true, status: true, nav: true, navFx: true, slots: true },
  mp: null,
  bag: { sort: "rarity" },
  joined: false,
  flags: {}, // 대화/퀘스트 플래그
  met: {}, // NPC 만난 횟수
  once: {}, // 한 번만 쓰는 대화 선택지
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
  return (d.stat[k] ?? 0) + (c.base[k] ?? 0) + Math.floor((d.lv - 1) * (c.grow[k] ?? 0)) + pathBonus(d, k);
}

/** 최대 마나: 지능과 레벨에 비례 */
export function maxMp(p) {
  return 200 + data(p).lv * 10; // V12.123: 레벨만 (Lv.100 = 1200)
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
    notify(p, `§6§lLEVEL UP! §r§fLv.${d.lv} §7· 스탯 포인트 +${up * 3}`);
    p.playSound("random.levelup");
    p.dimension.spawnParticle("minecraft:totem_particle", p.location);
  } else if (!silent) {
    p.playSound("random.orb", { volume: 0.4, pitch: 1.4 });
  }
}

/** 레벨 직접 설정 (제작자 도구 / scriptevent). 스탯 포인트는 레벨에 맞게 다시 계산 (이미 찍은 스탯은 유지) */
export function setLevel(p, lv) {
  const d = data(p);
  lv = Math.max(1, Math.min(MAX_LV, Math.floor(Number(lv) || 1)));
  const spent = Object.values(d.stat ?? {}).reduce((a, b) => a + b, 0);
  d.lv = lv;
  d.xp = 0;
  d.pts = Math.max(0, (lv - 1) * 3 - spent);
  save(p);
  notify(p, `§6§l레벨 설정 §r§fLv.${lv} §7· 남은 스탯 포인트 ${d.pts}`);
  p.playSound("random.levelup");
}

export function addGold(p, n) {
  const d = data(p);
  d.gold = Math.max(0, d.gold + Math.round(n));
  save(p);
}

/** 알림: 액션바 (title 은 HUD 데이터 전용이라 쓰지 않음) */
export function notify(p, text) {
  p.onScreenDisplay.setActionBar(text);
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
