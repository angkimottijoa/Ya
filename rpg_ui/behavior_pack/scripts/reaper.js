// ═══════════════════════════════════════════════════════════════════════
// 히든 직업: 영혼 수확자 (V11.4) — 3차 대신 고를 수 있는 숨겨진 길
//   해금: 2차 이상 · Lv.40 이상으로 밤에 몬스터를 쓰러뜨리면 「떠도는 영혼」이 모임 → 300 이면 승급 목록에 나타남 (100 · 200 에서 속삭임)
//   승급: Lv.45 · 10000G (2차에서, 또는 이미 3차여도 이 길로 바꿀 수 있음) · 도구 「영혼 수확자의 낫」
//   자원 「영혼」(최대 10): 근처(10칸)에서 적이 죽으면 영혼불이 날아와 +1, 체력 3% 회복. 스킬이 영혼을 써서 강해짐
//   ① 사신의 낫질 3타: 크게 휘두르는 낫 → 반대로 → 한 바퀴 돌며 적을 끌어당겨 거둠(맞은 적마다 영혼 조각) · 마지막 뒤 8초
//   ② 영혼 사슬: 앞 14칸 최대 4명에게 사슬을 던져 묶고(2초) 끌어당김 + 「낙인」(④에서 피해 1.5배)
//   ③ 망령 행진: 망령이 되어(투명·무적에 가깝게) 주변 적 사이를 세 번 꿰뚫고 지나감, 영혼 3개마다 한 번 더
//   ④ 영혼 수확: 발밑에 죽음의 진, 등 뒤에 거대한 낫 → 범위 안 적에게서 영혼을 뽑아내 낫에 모은 뒤 크게 한 바퀴 베어 거둠
//      체력 15% 이하 · 최대 체력 80 이하 일반 몹은 처형(한 번에 3마리까지, 보스는 피해 1.5배만), 쌓인 영혼만큼 피해·회복 증가
// 파티클: gen_reaper.py (sr_slash · sr_wisp · sr_mist · sr_chain · sr_burst) + 마법진 캐스터(죽음의 진)
// ═══════════════════════════════════════════════════════════════════════
import { system, world, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
import * as M from "./ms.js";
import { spend } from "./pbudget.js";
import { drawMagic } from "./magic.js";
import { skillLock } from "./skill_lock.js";
import { data, save, notify } from "./player.js";

export const REAPER = "soul_reaper";
const NEED = 300;
const later = (t, fn) => system.runTimeout(() => { try { fn(); } catch {} }, Math.max(1, Math.round(t)));
const up = (l, y) => ({ x: l.x, y: l.y + y, z: l.z });
const yawOf = (p) => p.getRotation().y;
const rad = (d) => (d * Math.PI) / 180;
const fwdOf = (yaw) => ({ x: -Math.sin(rad(yaw)), y: 0, z: Math.cos(rad(yaw)) });
const rightOf = (yaw) => ({ x: -Math.cos(rad(yaw)), y: 0, z: -Math.sin(rad(yaw)) });
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (v) => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const UP = { x: 0, y: 1, z: 0 };
const center = (e) => up(e.location, 0.9);
const snd = (p, id, vol = 1, pitch = 1) => M.sound(p, id, pitch, vol);
const DEEP = [0.62, 0.32, 1], SOUL = [0.35, 1, 0.8];

const DEF = { n: 10, r: 0.3, thick: 0.5, a0: 0, a1: 0, dur: 0.1, life: 0.5, size: 1, tone: 0, spd: 1, vs: 0 };
function pt(dim, name, loc, o = {}, prio = 1) {
  if (!spend(o.n ?? 10, (o.life ?? 0.5) + (o.dur ?? 0), prio)) return;
  try {
    const m = new MolangVariableMap();
    for (const k of Object.keys(DEF)) m.setFloat(`variable.${k}`, o[k] ?? DEF[k]);
    for (const k of ["u", "v", "w", "vd"]) m.setVector3(`variable.${k}`, o[k] ?? UP);
    dim.spawnParticle(`rpg:${name}`, loc, m);
  } catch {}
}
/** 낫 호: yaw 기준 tilt 기울인 면, 오른쪽 → 왼쪽(dir -1 이면 반대) */
function scythe(dim, at, yaw, o = {}) {
  const f = fwdOf(yaw), r = rightOf(yaw), t = rad(o.tilt ?? 0), d = o.dir ?? 1, sw = o.sweep ?? 200;
  const v = add({ x: r.x * Math.cos(t), y: Math.sin(t), z: r.z * Math.cos(t) }, { x: 0, y: 0, z: 0 });
  const w = norm({ x: f.y * v.z - f.z * v.y, y: f.z * v.x - f.x * v.z, z: f.x * v.y - f.y * v.x });
  pt(dim, "sr_slash", at, { u: f, v, w, r: o.r ?? 3.4, thick: o.thick ?? 1.1, a0: (d * sw) / 2, a1: (-d * sw) / 2, dur: o.dur ?? 0.12, life: o.life ?? 0.5, n: o.n ?? 220, size: o.size ?? 1.2, spd: o.spd ?? 2.5, tone: o.tone ?? 0 }, o.prio ?? 0);
}
/** 영혼불: a → b 로 날아감 (life 동안) */
const wisp = (dim, a, b, o = {}) => { const d = sub(b, a), L = len(d) || 0.1; pt(dim, "sr_wisp", a, { vd: norm(d), vs: L / (o.life ?? 0.5), life: o.life ?? 0.5, n: o.n ?? 12, r: 0.15, size: o.size ?? 1 }, o.prio ?? 1); };
const chain = (dim, a, b, o = {}) => { const d = sub(b, a), L = len(d) || 0.1; pt(dim, "sr_chain", a, { u: norm(d), v: UP, r: L, n: Math.round(L * 3 * 1.3), life: o.life ?? 0.3, size: o.size ?? 1 }, 0); };

// ───────── 히든 해금: 밤에 몬스터를 쓰러뜨려 영혼을 모음 ─────────
const isNight = () => { try { const t = world.getTimeOfDay(); return t >= 13000 && t <= 23000; } catch { return false; } };
export const reaperUnlocked = (d) => !!d.reaperOpen;
world.afterEvents.entityDie.subscribe(({ deadEntity: e, damageSource }) => {
  let killer = damageSource?.damagingEntity;
  if (killer?.typeId !== "minecraft:player") { try { const pl = e.dimension.getPlayers({ location: e.location, maxDistance: 10 }); killer = pl[0]; } catch { killer = null; } }
  let isMob = false;
  try { isMob = e.matches({ families: ["monster"] }); } catch {}
  // 영혼 수확자: 근처에서 적이 죽으면 영혼불이 날아와 쌓임
  try {
    for (const p of e.dimension.getPlayers({ location: e.location, maxDistance: 10 })) {
      if (!isReaper(p)) continue;
      const at = up(e.location, 1);
      wisp(p.dimension, at, up(p.location, 1.2), { life: 0.45, n: 14 });
      later(9, () => { addSoul(p, 1); try { const hp = p.getComponent("minecraft:health"); hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + hp.effectiveMax * 0.03)); } catch {} });
    }
  } catch {}
  if (!isMob || killer?.typeId !== "minecraft:player" || !isNight()) return;
  const d = data(killer);
  if (d.reaperOpen || !d.adv2 || d.lv < 40 || d.adv3 === REAPER) return;
  d.reaperSouls = (d.reaperSouls ?? 0) + 1;
  const n = d.reaperSouls;
  if (n === 1) notify(killer, "§8…어디선가 영혼의 속삭임이 들린다");
  if (n === 100) { killer.sendMessage("§5§o「…거두어라. 떠도는 것들을.」"); snd(killer, "ambient.cave", 1, 0.6); }
  if (n === 200) { killer.sendMessage("§5§o「낫이 너를 기억한다. 조금만 더.」"); snd(killer, "mob.wither.ambient", 0.5, 0.6); }
  if (n % 25 === 0 && n < NEED) notify(killer, `§8떠도는 영혼 §5${n}§8/${NEED}`);
  if (n >= NEED) {
    d.reaperOpen = true;
    killer.sendMessage("§5§l「너를 영혼 수확자로 받아들이노라.」 §r§7(메뉴 > 직업·스킬 > 승급 에 숨겨진 길이 열렸다)");
    snd(killer, "mob.wither.spawn", 0.6, 0.7);
    try { drawMagic(killer.dimension, up(killer.location, 0.1), UP, deathSigil(), { R: 3, color: DEEP, life: 3, draw: 0.6 }); } catch {}
  }
  save(killer);
});

// ───────── 영혼 자원 ─────────
const SOULS = new Map();
const isReaper = (p) => { try { return data(p).adv3 === REAPER && heldScythe(p); } catch { return false; } };
export const heldScythe = (p) => { try { return p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex)?.typeId === "rpg:jt_soul_reaper"; } catch { return false; } };
function addSoul(p, n) { SOULS.set(p.id, Math.min(10, (SOULS.get(p.id) ?? 0) + n)); }
const souls = (p) => SOULS.get(p.id) ?? 0;
function takeSouls(p, max = 10) { const s = Math.min(max, souls(p)); SOULS.set(p.id, souls(p) - s); return s; }
export function soulLine(p) { const s = souls(p); return `§5영혼 §d${"●".repeat(s)}§8${"○".repeat(10 - s)} §7${s}/10`; }

// ───────── 판정 ─────────
const BRAND = new Map(); // 적 id → 낙인 끝 틱
function hitter(ctx) {
  const last = new Map();
  return (e, mul, cd = 4) => {
    if (!e?.isValid() || e.id === ctx.p.id) return false;
    const now = system.currentTick;
    if (now - (last.get(e.id) ?? -99) < cd) return false;
    last.set(e.id, now);
    M.skillHit.set(e.id, now);
    try { e.applyDamage(Math.max(1, Math.round(ctx.dmg * mul)), { cause: EntityDamageCause.entityAttack, damagingEntity: ctx.p }); } catch {}
    return true;
  };
}
const foes = (dim, at, r) => M.around(dim, at, r).filter((e) => e.isValid());
const shake = (p, pw, sec) => { try { p.runCommand(`camerashake add @s ${pw} ${sec} positional`); } catch {} };
const combo = new Map();
function step(p, key, max, gap = 28) { const k = `${p.id}|${key}`, now = system.currentTick, c = combo.get(k), n = c && now - c.t <= gap ? (c.n + 1) % max : 0; combo.set(k, { n, t: now }); return n; }
/** 죽음의 진: 테두리 + 룬 + 낫 모양 초승달 넷 + 거꾸로 된 삼각 + 해골 눈 */
export const deathSigil = () => [
  { t: "ring", r: 1, w: 0.05 }, { t: "rune", r: 0.9, m: 30, spin: -8 }, { t: "ring", r: 0.81 },
  { t: "poly", r: 0.81, m: 3, k: 1, rot: 180, spin: 6 }, { t: "poly", r: 0.81, m: 6, k: 2, spin: -6 },
  ...[0, 90, 180, 270].map((a) => ({ t: "sub", at: [Math.cos(rad(a)) * 0.6, Math.sin(rad(a)) * 0.6], layers: [{ t: "ring", r: 0.16, a0: a + 40, a1: a + 320 }, { t: "ring", r: 0.12, at: [Math.cos(rad(a)) * 0.05, Math.sin(rad(a)) * 0.05], a0: a + 70, a1: a + 290 }] })),
  { t: "ring", r: 0.3 }, { t: "sub", at: [-0.1, 0.03], layers: [{ t: "ring", r: 0.06, w: 0.06 }] }, { t: "sub", at: [0.1, 0.03], layers: [{ t: "ring", r: 0.06, w: 0.06 }] },
];

// ① 사신의 낫질 (3타)
function rp_combo(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), yw = yawOf(p), n = step(p, "rp1", 3), c = up(p.location, 1.1);
  if (n < 2) {
    M.anim(p, "slash");
    scythe(dim, c, yw, n ? { tilt: 25, dir: -1, r: 3.6 } : { tilt: -15, r: 3.5 });
    later(1, () => scythe(dim, c, yw, { ...(n ? { tilt: 25, dir: -1 } : { tilt: -15 }), r: 3.1, thick: 0.5, n: 80, life: 0.6, tone: 0.8, prio: 1 })); // 영혼빛 잔영
    pt(dim, "sr_mist", up(p.location, 0.5), { n: 4, r: 1, spd: 0.6, life: 1.2, size: 1.2 }, 2);
    later(2, () => {
      const f = fwdOf(yw);
      for (const e of foes(dim, add(p.location, f, 1.8), 3.6)) { const d = sub(e.location, p.location), L = Math.hypot(d.x, d.z); if (L < 4 && (L < 1.3 || (d.x * f.x + d.z * f.z) / L > 0.1)) if (hit(e, n ? 0.62 : 0.55)) pt(dim, "sr_burst", center(e), { n: 8, r: 0.2, spd: 3, life: 0.5, tone: 1 }, 2); }
      snd(p, "game.player.attack.sweep", 0.9, 0.6 + n * 0.1); snd(p, "mob.phantom.swoop", 0.4, 0.6);
    });
    return;
  }
  // 3타: 한 바퀴 돌며 끌어당겨 거둠
  ctx.setCd?.(8);
  M.anim(p, "spin");
  scythe(dim, c, yw, { sweep: 380, r: 4, thick: 1.3, dur: 0.22, n: 360, life: 0.6 });
  later(2, () => scythe(dim, up(c, -0.3), yw + 30, { sweep: 380, r: 3.4, thick: 0.6, dur: 0.22, n: 120, life: 0.6, tone: 0.8, prio: 1 }));
  pt(dim, "sr_mist", up(p.location, 0.4), { n: 10, r: 2.5, spd: 1, life: 1.4, size: 1.3 }, 2);
  later(4, () => {
    for (const e of foes(dim, p.location, 4.6)) {
      if (!hit(e, 0.85, 1)) continue;
      const d = sub(p.location, e.location), l = Math.hypot(d.x, d.z) || 1;
      try { e.applyKnockback(d.x / l, d.z / l, 0.6, 0.15); } catch {}
      wisp(dim, center(e), up(p.location, 1.2), { life: 0.4, n: 8, size: 0.8 });
      if (Math.random() < 0.35) later(8, () => addSoul(p, 1));
    }
    snd(p, "mob.wither.shoot", 0.4, 1.4); snd(p, "game.player.attack.sweep", 1, 0.5);
  });
}
// ② 영혼 사슬
function rp_chain(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), yw = yawOf(p), f = fwdOf(yw), o = { ...p.location };
  M.anim(p, "shoot");
  const hand = add(up(o, 1.2), f, 0.5);
  const tg = foes(dim, add(o, f, 7), 9).filter((e) => { const d = sub(e.location, o), L = Math.hypot(d.x, d.z); return L < 14.5 && (d.x * f.x + d.z * f.z) / (L || 1) > 0.5; })
    .sort((a, b) => len(sub(a.location, o)) - len(sub(b.location, o))).slice(0, 4);
  snd(p, "random.chestopen", 0.6, 0.5); snd(p, "mob.phantom.swoop", 0.6, 0.8);
  if (!tg.length) { chain(dim, hand, add(hand, f, 12), { life: 0.4 }); return; }
  for (const e of tg) {
    hit(e, 0.8, 1);
    M.potion(e, "slowness", 6, 2); M.potion(e, "weakness", 2, 2);
    BRAND.set(e.id, system.currentTick + 200);
    drawMagic(dim, up(e.location, 0.1), UP, [{ t: "ring", r: 1, w: 0.06 }, { t: "poly", r: 1, m: 3, k: 1, rot: 180, spin: 40 }], { R: 0.9, color: DEEP, life: 2.2, draw: 0.15, size: 0.9 });
  }
  for (let t = 0; t < 40; t += 3) later(t, () => { for (const e of tg) if (e.isValid()) chain(dim, add(up(p.location, 1.2), fwdOf(yawOf(p)), 0.5), center(e), { life: 0.17 }); });
  later(40, () => { // 끌어당김
    for (const e of tg) {
      if (!e.isValid()) continue;
      const d = sub(p.location, e.location), L = Math.hypot(d.x, d.z);
      if (L > 2) try { e.applyKnockback(d.x / L, d.z / L, Math.min(3.2, (L - 1.5) * 0.36), 0.35); } catch {}
      hit(e, 0.6, 1);
      pt(dim, "sr_burst", center(e), { n: 14, r: 0.3, spd: 3, life: 0.6 }, 1);
    }
    snd(p, "random.chestclosed", 0.8, 0.5); snd(p, "mob.wither.shoot", 0.4, 1.2);
  });
}
// ③ 망령 행진
function rp_wraith(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), o = { ...p.location };
  const extra = Math.floor(takeSouls(p, 6) / 3), passes = 3 + extra;
  skillLock.add(p.id);
  M.potion(p, "invisibility", 1, passes * 0.4 + 0.6); M.potion(p, "resistance", 4, passes * 0.4 + 0.6);
  pt(dim, "sr_mist", up(o, 0.5), { n: 14, r: 1, spd: 1, life: 1.4, size: 1.3 }, 1);
  snd(p, "mob.wither.ambient", 0.6, 1.5);
  let list = foes(dim, o, 9);
  for (let k = 0; k < passes; k++) later(2 + k * 7, () => {
    list = list.filter((e) => e.isValid());
    const e = list.length ? list[k % list.length] : null;
    const from = { ...p.location };
    const yw = yawOf(p), dir = e ? norm({ x: e.location.x - from.x, y: 0, z: e.location.z - from.z }) : fwdOf(yw + k * 120);
    const to = e ? add(e.location, dir, 2.2) : add(from, dir, 6);
    try { p.teleport(to, { facingLocation: e ? center(e) : add(to, dir, 2), keepVelocity: false }); } catch {}
    // 지나간 길: 망령 잔상(영혼빛 낫 호 + 안개 + 영혼불)
    pt(dim, "sr_wisp", up(from, 1), { vd: dir, vs: len(sub(to, from)) / 0.25, life: 0.25, n: 26, r: 0.4, size: 1.3 }, 0);
    pt(dim, "sr_mist", up(from, 0.6), { n: 6, r: 0.6, spd: 0.6, life: 1.2 }, 2);
    if (e) { scythe(dim, center(e), yawOf(p) + 180, { r: 2, thick: 0.6, n: 120, sweep: 160, tone: k % 2 ? 0.8 : 0, tilt: k % 2 ? 40 : -40 }); hit(e, 0.7, 1); }
    snd(p, "mob.phantom.swoop", 0.8, 1.2 + k * 0.05);
  });
  later(4 + passes * 7, () => { skillLock.delete(p.id); pt(dim, "sr_burst", up(p.location, 1), { n: 20, r: 0.4, spd: 4, life: 0.6, tone: 1 }, 1); });
  later(80, () => skillLock.delete(p.id));
}
// ④ 영혼 수확 (궁극기)
function rp_ult(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), o = { ...p.location }, yw = yawOf(p), f = fwdOf(yw), R = 8;
  const s = takeSouls(p, 10), mul = 1 + s * 0.06;
  skillLock.add(p.id);
  M.potion(p, "resistance", 4, 3); M.potion(p, "slowness", 3, 1.6);
  M.anim(p, "raise");
  try { p.camera.fade({ fadeTime: { fadeInTime: 0.3, holdTime: 0.6, fadeOutTime: 0.6 }, fadeColor: { red: 0.08, green: 0.02, blue: 0.12 } }); } catch {}
  drawMagic(dim, up(o, 0.1), UP, deathSigil(), { R, color: DEEP, life: 3.4, draw: 0.5, yaw: -yw });
  snd(p, "mob.wither.spawn", 0.6, 0.8); snd(p, "ambient.cave", 1, 0.5);
  // 등 뒤의 거대한 낫: 자루(사슬빛 선) + 날(굳은 낫 호), 1.6초 동안
  const base = add(o, f, -2.2), top = up(base, 8.5);
  for (let t = 0; t < 32; t += 8) later(t, () => {
    chain(dim, base, top, { life: 0.42, size: 1.4 });
    scythe(dim, top, yw + 90, { r: 4, thick: 1.2, sweep: 130, tilt: 90, dur: t ? 0.01 : 0.2, life: 0.42, n: 200, spd: 0.3, prio: t ? 1 : 0 });
  });
  // 영혼을 뽑아냄: 범위 안 적에게서 영혼불이 낫으로
  const victims = foes(dim, o, R).slice(0, 12);
  for (const e of victims) { M.potion(e, "slowness", 4, 1.8); }
  for (let k = 0; k < 3; k++) later(8 + k * 6, () => {
    for (const e of victims) if (e.isValid()) { wisp(dim, center(e), top, { life: 0.5, n: 10, size: 1.1 }); pt(dim, "sr_burst", center(e), { n: 6, r: 0.2, spd: 1.5, life: 0.5, tone: 1 }, 2); }
    snd(p, "mob.vex.charge", 0.6, 0.8 + k * 0.2);
  });
  later(26, () => pt(dim, "sr_burst", top, { n: 40, r: 1, spd: -3, life: 0.6, tone: 1 }, 1));
  // 크게 한 바퀴 베어 거둠
  later(32, () => {
    skillLock.delete(p.id);
    M.anim(p, "spin");
    const c = up(p.location, 1.2);
    scythe(dim, c, yw, { sweep: 380, r: R, thick: 2.2, dur: 0.25, n: 600, life: 0.7, size: 1.6, spd: 4 });
    later(2, () => scythe(dim, up(c, 0.4), yw + 20, { sweep: 380, r: R - 1.5, thick: 1, dur: 0.25, n: 220, life: 0.7, size: 1.3, tone: 0.8, prio: 1 }));
    later(4, () => {
      let executed = 0;
      for (const e of foes(dim, o, R + 0.5)) {
        let m = 2.2 * mul * (BRAND.get(e.id) > system.currentTick ? 1.5 : 1);
        // 처형: 체력 15% 이하 · 최대 체력 80 이하 일반 몹만, 한 번에 3마리까지. 큰 몹(보스)은 체력 15% 이하면 피해 1.5배만
        let execute = false;
        try {
          const hp = e.getComponent("minecraft:health");
          if (hp && e.typeId !== "minecraft:player" && hp.currentValue <= hp.effectiveMax * 0.15) {
            if (hp.effectiveMax <= 80 && executed < 3) execute = true; else m *= 1.5;
          }
        } catch {}
        if (execute) executed++;
        if (execute) { try { e.applyDamage(99999, { cause: EntityDamageCause.entityAttack, damagingEntity: p }); } catch {} pt(dim, "sr_burst", center(e), { n: 24, r: 0.3, spd: 5, life: 0.8, tone: 1 }, 1); continue; }
        if (hit(e, m, 1)) { M.toss(o, e, 7, 3); pt(dim, "sr_burst", center(e), { n: 12, r: 0.3, spd: 4, life: 0.6 }, 2); }
      }
      try { const hp = p.getComponent("minecraft:health"); hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + hp.effectiveMax * (0.05 + s * 0.02))); } catch {}
      pt(dim, "sr_mist", up(o, 0.5), { n: 24, r: R * 0.7, spd: 1.5, life: 1.6, size: 1.6 }, 2);
      shake(p, 0.7, 0.6);
      snd(p, "mob.wither.break_block", 0.8, 0.7); snd(p, "game.player.attack.sweep", 1.2, 0.4);
      if (s) notify(p, `§5§l영혼 ${s}개를 거두었다`);
    });
  });
  later(80, () => skillLock.delete(p.id));
}

const RAW = { rp_combo, rp_chain, rp_wraith, rp_ult };
/** 3차 수준 피해 (×1.25) */
export const RP = Object.fromEntries(Object.entries(RAW).map(([k, fn]) => [k, (ctx) => fn({ ...ctx, dmg: ctx.dmg * 1.25 })]));
