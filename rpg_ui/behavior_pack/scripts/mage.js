// ═══════════════════════════════════════════════════════════════════════
// 마법사 계열 직업 스킬 (V11.2) — 마법진 캐스터(magic.js) + 계열 전용 파티클(gen_mage.py)
//   승급할수록 마법진이 복잡해짐: 1차 원·룬 → 2차 별·작은 원 → 3차 사진 같은 대형 마법진(astral · trinity · hexa · seal)
//   1차 마법사(비전)     ① 마력탄 3연 · ② 비전 폭발 · ③ 순간이동
//   2차 원소술사(불·얼음) ① 원소 연탄 3타 · ② 원소 폭발진 · ③ 화염 운석
//   3차 대마법사(성좌)    ① 성좌 탄막 4타 · ② 삼위 마법진 · ③ 시간 결계 · ④ 천체 붕괴
//   2차 뇌전술사(번개)    ① 뇌창 3연 · ② 뇌전 결계 · ③ 연쇄 번개
//   3차 폭풍의 군주(폭풍)  ① 천뢰창 4타 · ② 폭풍 영역 · ③ 뇌신포 · ④ 만뢰
//   ① 콤보는 마지막 타 뒤 8초 대기. 피해: 사신수 대비 1차 30% · 2차 45% · 3차 60% (3차 ×1.25)
//   탄은 한 번만 뿌리면 스스로 날아가고(조준한 곳까지 걸리는 시간만큼), 판정만 2틱마다
// ═══════════════════════════════════════════════════════════════════════
import { system, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
import * as M from "./ms.js";
import { spend } from "./pbudget.js";
import { drawMagic, PRESET } from "./magic.js";
import { skillLock } from "./skill_lock.js";

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
const crs = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const UP = { x: 0, y: 1, z: 0 }, DOWN = { x: 0, y: -1, z: 0 };
const center = (e) => up(e.location, 0.9);
const snd = (p, id, vol = 1, pitch = 1) => M.sound(p, id, pitch, vol);
const eyeOf = (p) => { try { return p.getHeadLocation(); } catch { return up(p.location, 1.6); } };
const viewOf = (p) => { try { return p.getViewDirection(); } catch { return fwdOf(yawOf(p)); } };
const perp = (u) => { const w = norm(Math.abs(u.y) > 0.9 ? crs(u, { x: 1, y: 0, z: 0 }) : crs(u, UP)); return { v: norm(crs(w, u)), w }; };

const DEF = { n: 10, r: 0.3, spd: 2, life: 0.6, size: 1, tone: 0, vs: 0, thick: 0.3, h: 0.5, seed: 0 };
function pt(dim, name, loc, o = {}, prio = 1) {
  if (!spend(o.n ?? 10, o.life ?? 0.6, prio)) return;
  try {
    const m = new MolangVariableMap();
    for (const k of Object.keys(DEF)) m.setFloat(`variable.${k}`, o[k] ?? DEF[k]);
    for (const k of ["u", "v", "w", "vd"]) m.setVector3(`variable.${k}`, o[k] ?? UP);
    dim.spawnParticle(`rpg:${name}`, loc, m);
  } catch {}
}
/** 기둥: from 에서 dir 방향 길이 L (불기둥 · 얼음 가시 · 빛줄기) */
const column = (dim, name, from, dir, L, thick, o = {}) => { const u = norm(dir), b = perp(u); pt(dim, name, from, { u, v: b.v, w: b.w, r: L, thick, n: o.n ?? Math.round(L * thick * 60 + 20), life: o.life ?? 0.8, size: o.size ?? 1, tone: o.tone ?? 0 }, o.prio ?? 0); };
/** 번개 줄기 a → b */
const bolt = (dim, a, b, o = {}) => { const d = sub(b, a), L = len(d) || 0.1, u = norm(d), q = perp(u); pt(dim, "lt_bolt", a, { u, v: q.v, w: q.w, r: L, h: o.h ?? Math.min(1.2, 0.25 + L * 0.06), seed: Math.random() * 100, n: o.n ?? Math.round(L * 12 + 10), life: o.life ?? 0.28, size: o.size ?? 1.2, tone: o.tone ?? 0 }, o.prio ?? 0); };

// ───────── 판정 · 조준 ─────────
function hitter(ctx) {
  const last = new Map();
  return (e, mul, cd = 4) => {
    if (!e?.isValid() || e.id === ctx.p.id) return false;
    const now = system.currentTick;
    if (now - (last.get(e.id) ?? -99) < cd) return false;
    last.set(e.id, now);
    M.skillHit.set(e.id, now);
    try { e.applyDamage(Math.max(1, Math.round(ctx.dmg * mul)), { cause: EntityDamageCause.magic, damagingEntity: ctx.p }); } catch { try { e.applyDamage(Math.max(1, Math.round(ctx.dmg * mul)), { cause: EntityDamageCause.entityAttack, damagingEntity: ctx.p }); } catch {} }
    return true;
  };
}
const foes = (dim, at, r) => M.around(dim, at, r).filter((e) => e.isValid());
/** 조준: 시선에 걸린 적 → 시선이 닿는 블록 → 앞 maxD */
function aim(p, maxD = 26) {
  try { const h = p.getEntitiesFromViewDirection({ maxDistance: maxD }).map((x) => x.entity).find((e) => e?.isValid() && e.id !== p.id && e.typeId !== "minecraft:item"); if (h) return { at: center(h), ent: h }; } catch {}
  try { const b = p.getBlockFromViewDirection({ maxDistance: maxD }); if (b) return { at: add(b.block.location, { x: 0.5 + (b.faceLocation?.x ?? 0.5) - 0.5, y: 1, z: 0.5 }), ground: true }; } catch {}
  return { at: add(eyeOf(p), viewOf(p), maxD) };
}
const groundAt = (dim, at) => { try { const t = dim.getTopmostBlock({ x: Math.floor(at.x), z: Math.floor(at.z) }); if (t && t.location.y + 1 <= at.y + 2 && t.location.y + 1 > at.y - 12) return { x: at.x, y: t.location.y + 1, z: at.z }; } catch {} return at; };
/** 탄: 파티클은 한 번만(스스로 날아감), 판정은 2틱마다. 맞으면 onHit(위치, 적), 끝까지 가면 onEnd(위치) */
function shoot(ctx, hit, name, from, to, o = {}) {
  const dim = ctx.p.dimension, d = sub(to, from), L = Math.max(0.5, len(d)), u = norm(d), spd = o.spd ?? 28, life = L / spd;
  pt(dim, name, from, { vd: u, vs: spd, life, n: o.n ?? 40, r: o.r ?? 0.22, size: o.size ?? 1, tone: o.tone ?? 0 }, 0);
  let done = false;
  const ticks = Math.ceil(life * 20);
  for (let t = 1; t <= ticks; t++) later(t, () => {
    if (done) return;
    const c = add(from, u, Math.min(L, (t / 20) * spd));
    for (const e of foes(dim, c, o.hitR ?? 1.3)) {
      if (len(sub(center(e), c)) > (o.hitR ?? 1.3) + 0.6) continue;
      if (hit(e, o.mul ?? 0.5)) { if (!o.pierce) done = true; o.onHit?.(c, e); if (done) return; }
    }
    if (t === ticks && !done) { done = true; o.onEnd?.(to); }
  });
}
const shake = (p, pw, sec) => { try { p.runCommand(`camerashake add @s ${pw} ${sec} positional`); } catch {} };
const flash = (p, r, g, b, t = 0.3) => { try { p.camera.fade({ fadeTime: { fadeInTime: 0.03, holdTime: 0.03, fadeOutTime: t }, fadeColor: { red: r, green: g, blue: b } }); } catch {} };

// ───────── 콤보 ─────────
const combo = new Map();
function step(p, key, max, gap = 30) {
  const k = `${p.id}|${key}`, now = system.currentTick, c = combo.get(k);
  const n = c && now - c.t <= gap ? (c.n + 1) % max : 0;
  combo.set(k, { n, t: now });
  return n;
}
/** 손끝(앞 1.2, 오른쪽 0.35)에 세운 작은 마법진 */
const handCircle = (p, layers, col, R = 0.7, life = 0.7) => {
  const v = viewOf(p), at = add(add(eyeOf(p), v, 1.3), rightOf(yawOf(p)), -0.35);
  drawMagic(p.dimension, up(at, -0.25), v, layers, { R, color: col, life, draw: 0.15, size: 0.9, spin: 2.5 });
  return up(at, -0.25);
};
const SIMPLE = [{ t: "ring", r: 1, w: 0.04 }, { t: "rune", r: 0.8, m: 12, spin: 40 }, { t: "ring", r: 0.66 }, { t: "poly", r: 0.66, m: 3, k: 1, spin: -60 }];
const C = { arc: [0.55, 0.8, 1], fire: [1, 0.55, 0.22], ice: [0.6, 0.92, 1], star: [1, 0.88, 0.55], violet: [0.62, 0.52, 1], volt: [0.35, 1, 1] };

// ═════════════ 1차 마법사 (비전) ═════════════
function mg_bolt(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), n = step(p, "mg1", 3), big = n === 2;
  M.anim(p, "cast");
  const from = handCircle(p, SIMPLE, C.arc, big ? 1.1 : 0.7);
  const tgt = aim(p).at;
  if (big) ctx.setCd?.(8);
  shoot(ctx, hit, "ar_proj", from, tgt, { n: big ? 90 : 40, r: big ? 0.35 : 0.2, size: big ? 1.6 : 1, spd: big ? 24 : 30, mul: big ? 0.8 : [0.45, 0.5][n],
    onHit: (c) => { pt(dim, "ar_burst", c, { n: big ? 40 : 14, r: 0.2, spd: big ? 6 : 3, life: 0.6 }, 1); pt(dim, "ar_spark", c, { n: 8, r: 0.6, spd: 1, life: 0.7 }, 2); if (big) for (const e of foes(dim, c, 2.6)) hit(e, 0.5, 1); },
    onEnd: (c) => pt(dim, "ar_burst", c, { n: 10, r: 0.2, spd: 2, life: 0.5 }, 2) });
  snd(p, "mob.evocation_illager.cast_spell", 0.5, big ? 1 : 1.5);
}
function mg_burst(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), g = { ...p.location };
  M.anim(p, "raise");
  drawMagic(dim, up(g, 0.1), UP, [{ t: "ring", r: 1, w: 0.04 }, { t: "rune", r: 0.86, m: 20, spin: 30 }, { t: "ring", r: 0.74 }, { t: "poly", r: 0.74, m: 6, k: 2, spin: -40 }, { t: "ring", r: 0.25 }], { R: 3.6, color: C.arc, life: 1.1, draw: 0.35, yaw: yawOf(p) });
  snd(p, "beacon.power_select", 0.6, 1.5);
  later(12, () => {
    pt(dim, "ar_burst", up(g, 1), { n: 80, r: 0.5, spd: 9, life: 0.8, size: 1.3 }, 0);
    pt(dim, "ar_spark", up(g, 1), { n: 30, r: 3, spd: 1, life: 1 }, 2);
    for (const e of foes(dim, g, 4)) if (hit(e, 1.0, 1)) M.toss(g, e, 7, 3);
    shake(p, 0.3, 0.3);
    snd(p, "random.explode", 0.5, 1.6);
    snd(p, "mob.evocation_illager.cast_spell", 0.8, 0.8);
  });
}
function mg_blink(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), o = { ...p.location }, v = viewOf(p), f = fwdOf(yawOf(p));
  let D = 8;
  try { const b = p.getBlockFromViewDirection({ maxDistance: 9 }); if (b) D = Math.max(1, len(sub(b.block.location, eyeOf(p))) - 1.5); } catch {}
  const to = add(o, { x: v.x, y: Math.max(0, v.y), z: v.z }, D);
  const ring = [{ t: "ring", r: 1, w: 0.05 }, { t: "rune", r: 0.78, m: 10, spin: 60 }, { t: "poly", r: 0.62, m: 4, k: 1, spin: -80, rot: 45 }];
  drawMagic(dim, up(o, 0.1), UP, ring, { R: 1.6, color: C.arc, life: 1, draw: 0.1, yaw: yawOf(p) });
  pt(dim, "ar_spark", up(o, 1), { n: 20, r: 0.6, spd: 2, life: 0.8 }, 1);
  try { p.teleport(to, { keepVelocity: false }); } catch {}
  later(1, () => {
    const g = { ...p.location };
    drawMagic(dim, up(g, 0.1), UP, ring, { R: 1.8, color: C.arc, life: 1.1, draw: 0.1, yaw: yawOf(p) });
    pt(dim, "ar_burst", up(g, 1), { n: 30, r: 0.3, spd: 4, life: 0.6 }, 1);
    for (const e of foes(dim, g, 2.5)) if (hit(e, 0.35, 1)) M.toss(g, e, 5, 2);
  });
  snd(p, "mob.endermen.portal", 0.8, 1.3);
  void f;
}

// ═════════════ 2차 원소술사 (불·얼음) ═════════════
function el_combo(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), n = step(p, "el1", 3);
  M.anim(p, "cast");
  const tgt = aim(p).at;
  const fire = (from, o = {}) => shoot(ctx, hit, "el_fire", from, tgt, { n: o.n ?? 50, r: o.r ?? 0.25, size: o.size ?? 1.2, spd: 26, mul: o.mul ?? 0.5,
    onHit: (c, e) => { try { e.setOnFire(3, true); } catch {} pt(dim, "el_burst", c, { n: o.big ? 40 : 16, r: 0.2, spd: o.big ? 6 : 3, life: 0.7 }, 1); if (o.big) for (const x of foes(dim, c, 3)) hit(x, 0.45, 1); } });
  const ice = (from, o = {}) => shoot(ctx, hit, "el_ice", from, tgt, { n: o.n ?? 40, r: o.r ?? 0.2, size: o.size ?? 1.2, spd: 32, mul: o.mul ?? 0.55,
    onHit: (c, e) => { M.potion(e, "slowness", 2, 2); pt(dim, "el_frost", c, { n: o.big ? 40 : 16, r: 0.2, spd: o.big ? 6 : 3, life: 0.8 }, 1); if (o.big) for (const x of foes(dim, c, 3)) { hit(x, 0.45, 1); M.potion(x, "slowness", 3, 2); } } });
  if (n === 0) { fire(handCircle(p, [...SIMPLE, { t: "poly", r: 0.5, m: 6, k: 2, spin: 70 }], C.fire)); snd(p, "mob.blaze.shoot", 0.6, 1.2); }
  else if (n === 1) { ice(handCircle(p, [...SIMPLE, { t: "poly", r: 0.5, m: 6, k: 2, spin: 70 }], C.ice)); snd(p, "random.glass", 0.5, 1.6); }
  else {
    ctx.setCd?.(8);
    const r = rightOf(yawOf(p)), a = handCircle(p, PRESET.triseal(), C.fire, 1.1), b = add(a, r, 1.2);
    drawMagic(dim, b, viewOf(p), PRESET.triseal(), { R: 1.1, color: C.ice, life: 0.7, draw: 0.15, size: 0.9, spin: -2.5 });
    fire(a, { n: 80, r: 0.35, size: 1.7, mul: 0.55, big: true });
    ice(b, { n: 70, r: 0.3, size: 1.6, mul: 0.55, big: true });
    snd(p, "mob.blaze.shoot", 0.8, 0.8); snd(p, "random.glass", 0.6, 1.2);
  }
}
function el_erupt(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), g = groundAt(dim, aim(p, 18).at), yw = yawOf(p);
  M.anim(p, "raise");
  drawMagic(dim, up(g, 0.1), UP, "cyan", { R: 4, color: C.fire, life: 1.6, draw: 0.4, yaw: yw });
  drawMagic(dim, up(g, 0.14), UP, [{ t: "ring", r: 1, w: 0.04 }, { t: "poly", r: 1, m: 6, k: 2, spin: 30 }, { t: "rune", r: 0.7, m: 16, spin: -25 }], { R: 2.4, color: C.ice, life: 1.6, draw: 0.4, yaw: -yw });
  snd(p, "mob.evocation_illager.prepare_attack", 0.7, 1.1);
  later(14, () => {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, rr = k % 2 ? 3 : 1.8, q = { x: g.x + Math.cos(a) * rr, y: g.y, z: g.z + Math.sin(a) * rr };
      if (k % 2) column(dim, "el_spike", up(q, -0.3), { x: Math.cos(a) * 0.5, y: 1, z: Math.sin(a) * 0.5 }, 2.2 + Math.random(), 0.35, { life: 2, prio: 1 });
      else column(dim, "el_flame", q, UP, 3.5, 0.5, { life: 0.9, prio: 1 });
    }
    column(dim, "el_flame", g, UP, 5, 0.9, { life: 1 });
    pt(dim, "el_burst", up(g, 0.5), { n: 50, r: 0.8, spd: 7, life: 0.9, size: 1.3 }, 0);
    pt(dim, "el_frost", up(g, 0.5), { n: 40, r: 1.5, spd: 4, life: 1 }, 1);
    for (const e of foes(dim, g, 4.5)) if (hit(e, 1.1, 1)) { M.potion(e, "slowness", 2, 2.5); try { e.setOnFire(3, true); e.applyKnockback(0, 0, 0, 0.5); } catch {} }
    shake(p, 0.35, 0.3);
    snd(p, "random.explode", 0.7, 1.1); snd(p, "random.glass", 0.6, 0.8);
  });
}
function el_meteor(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), g = groundAt(dim, aim(p, 22).at), sky = up(g, 14), yw = yawOf(p);
  M.anim(p, "raise");
  drawMagic(dim, sky, UP, "seal", { R: 3.6, color: C.fire, life: 1.8, draw: 0.35, yaw: yw });
  drawMagic(dim, up(g, 0.1), UP, [{ t: "ring", r: 1, w: 0.05 }, { t: "ring", r: 0.85, seg: 6, gap: 0.3, spin: 40 }], { R: 3, color: C.fire, life: 1.6, draw: 0.3 }); // 떨어질 곳 표시
  snd(p, "mob.blaze.breathe", 0.8, 0.6);
  later(16, () => {
    shoot(ctx, hit, "el_fire", sky, g, { n: 180, r: 0.9, size: 2.6, spd: 24, mul: 0, hitR: 0.1, onEnd: () => {} });
    snd(p, "mob.ghast.fireball", 0.8, 0.6);
  });
  later(16 + Math.ceil((14 / 24) * 20), () => {
    pt(dim, "el_burst", up(g, 0.5), { n: 90, r: 1, spd: 10, life: 1, size: 1.6 }, 0);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; column(dim, "el_flame", { x: g.x + Math.cos(a) * 2.6, y: g.y, z: g.z + Math.sin(a) * 2.6 }, UP, 3, 0.45, { life: 0.9, prio: 1 }); }
    try { dim.spawnParticle("minecraft:huge_explosion_emitter", up(g, 1)); } catch {}
    for (const e of foes(dim, g, 4.5)) if (hit(e, 1.4, 1)) { M.toss(g, e, 8, 4); try { e.setOnFire(4, true); } catch {} }
    shake(p, 0.6, 0.5);
    snd(p, "random.explode", 1, 0.7);
  });
}

// ═════════════ 3차 대마법사 (성좌) ═════════════
function am_combo(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), n = step(p, "am1", 4), yw = yawOf(p), f = fwdOf(yw), r = rightOf(yw);
  M.anim(p, "cast");
  const tgt = aim(p).at, eye = eyeOf(p);
  // 등 뒤 세 자리(왼쪽 · 위 · 오른쪽)에 작은 마법진
  const spots = [add(add(eye, r, 1.4), f, -0.6), up(add(eye, f, -0.8), 1.1), add(add(eye, r, -1.4), f, -0.6)];
  const use = n === 3 ? [0, 1, 2] : [[0], [2], [1]][n];
  if (n === 3) ctx.setCd?.(8);
  use.forEach((i, j) => later(j * 2, () => {
    const s = spots[i];
    drawMagic(dim, s, viewOf(p), [{ t: "ring", r: 1, w: 0.05 }, { t: "rune", r: 0.8, m: 12, spin: 50 }, { t: "poly", r: 0.7, m: 8, k: 3, spin: -40 }, { t: "ring", r: 0.25 }], { R: n === 3 ? 0.9 : 0.7, color: i === 1 ? C.violet : C.star, life: 0.8, draw: 0.12, size: 0.9 });
    const big = n === 3;
    shoot(ctx, hit, "as_proj", s, tgt, { n: big ? 70 : 40, r: big ? 0.3 : 0.2, size: big ? 1.5 : 1.1, spd: 30, mul: big ? 0.7 : 0.5,
      onHit: (c) => { pt(dim, "as_burst", c, { n: big ? 30 : 14, r: 0.2, spd: big ? 5 : 3, life: 0.7 }, 1); pt(dim, "as_dust", c, { n: 8, r: 0.5, spd: 1, life: 1 }, 2); } });
  }));
  snd(p, "random.orb", 0.5, 1.5 + n * 0.1);
  snd(p, "mob.evocation_illager.cast_spell", 0.4, 1.6);
}
function am_trinity(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), g = groundAt(dim, aim(p, 22).at), yw = yawOf(p), R = 3;
  M.anim(p, "raise");
  const sky = up(g, 12);
  drawMagic(dim, sky, UP, "trinity", { R, color: C.violet, life: 2.6, draw: 0.5, yaw: -yw + 90 });
  snd(p, "beacon.activate", 0.8, 1.4);
  // 세 원의 중심(마법진 면 좌표) → 하늘에서 땅으로 빛줄기
  const ang = rad(-yw + 90), u = { x: Math.cos(ang), y: 0, z: Math.sin(ang) }, v = norm(crs(UP, u));
  const P = (x, y) => add(add(sky, u, x * R), v, y * R);
  const centers = [P(0, 0.75), P(-1.6, 1.05), P(1.6, 1.05), P(0, -1.25)];
  centers.forEach((c, i) => later(14 + i * 5, () => {
    const gd = groundAt(dim, { x: c.x, y: g.y + 1, z: c.z });
    column(dim, "as_beam", c, DOWN, c.y - gd.y, i === 0 ? 1.2 : 0.8, { life: 0.7, n: 260 });
    pt(dim, "as_burst", up(gd, 0.4), { n: 40, r: 0.4, spd: 6, life: 0.8 }, 1);
    pt(dim, "as_dust", up(gd, 2), { n: 16, r: 1.5, spd: 1, life: 1.2 }, 2);
    for (const e of foes(dim, gd, i === 0 ? 3.2 : 2.6)) hit(e, 0.95, 1);
    snd(p, "random.explode", 0.5, 1.5 - i * 0.1);
    snd(p, "beacon.deactivate", 0.6, 1.6);
  }));
}
function am_time(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), g = { ...p.location }, R = 5;
  M.anim(p, "raise");
  drawMagic(dim, up(g, 0.1), UP, "astral", { R, color: C.star, life: 4, draw: 0.5, spin: 0.6, yaw: yawOf(p) });
  snd(p, "beacon.power_select", 0.8, 0.5);
  const inside = () => foes(dim, g, R);
  later(8, () => { for (const e of inside()) { hit(e, 0.6, 1); M.potion(e, "slowness", 3, 1.6); } });
  later(40, () => { for (const e of inside()) { M.potion(e, "slowness", 255, 1.5); M.potion(e, "weakness", 3, 1.5); try { e.clearVelocity?.(); } catch {} pt(dim, "as_dust", center(e), { n: 10, r: 0.5, spd: 0.3, life: 1.4 }, 2); } snd(p, "block.bell.hit", 0.8, 0.5); });
  for (let t = 10; t < 70; t += 10) later(t, () => pt(dim, "as_dust", up(g, 3), { n: 14, r: R * 0.8, spd: 0.2, life: 1.4 }, 2));
  later(72, () => { // 시간이 다시 흐르며 터짐
    pt(dim, "as_burst", up(g, 1), { n: 90, r: 2, spd: 8, life: 0.9, size: 1.3 }, 0);
    for (const e of inside()) if (hit(e, 0.9, 1)) M.toss(g, e, 6, 3);
    shake(p, 0.4, 0.3);
    snd(p, "random.explode", 0.6, 1.4);
  });
}
function am_ult(ctx) { // 천체 붕괴
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), g = groundAt(dim, aim(p, 24).at), yw = yawOf(p), R = 10, sky = up(g, 15);
  skillLock.add(p.id);
  later(14, () => skillLock.delete(p.id));
  M.anim(p, "raise");
  M.potion(p, "resistance", 3, 4);
  flash(p, 0.05, 0.03, 0.15, 0.8);
  drawMagic(dim, sky, UP, "astral", { R, color: C.star, life: 4.2, draw: 0.8, spin: 0.7, yaw: -yw });
  drawMagic(dim, up(sky, -0.6), UP, [{ t: "ring", r: 1.12, seg: 4, gap: 0.4, spin: 10 }, { t: "ring", r: 1.2, seg: 6, gap: 0.5, spin: -8 }], { R, color: C.violet, life: 4.2, draw: 0.8 });
  drawMagic(dim, up(g, 0.1), UP, [{ t: "ring", r: 1, w: 0.04 }, { t: "rune", r: 0.9, m: 40, spin: -6 }, { t: "poly", r: 0.82, m: 7, k: 3, spin: 6 }], { R: 6, color: C.violet, life: 4.2, draw: 0.6 });
  snd(p, "ambient.weather.thunder", 0.5, 1.6); snd(p, "beacon.activate", 1, 0.6);
  // 별 운석 열네 개
  for (let k = 0; k < 14; k++) later(22 + k * 3, () => {
    const a = Math.random() * Math.PI * 2, rr = Math.random() * R * 0.8, from = { x: sky.x + Math.cos(a) * rr, y: sky.y, z: sky.z + Math.sin(a) * rr };
    const b = Math.random() * Math.PI * 2, br = Math.random() * 7, to = groundAt(dim, { x: g.x + Math.cos(b) * br, y: g.y + 1, z: g.z + Math.sin(b) * br });
    shoot(ctx, hit, "as_proj", from, to, { n: 50, r: 0.35, size: 1.6, spd: 30, mul: 0, hitR: 0.1 });
    later(Math.ceil((len(sub(to, from)) / 30) * 20), () => { pt(dim, "as_burst", up(to, 0.3), { n: 26, r: 0.3, spd: 5, life: 0.7 }, 1); for (const e of foes(dim, to, 2.3)) hit(e, 0.45, 6); if (k % 3 === 0) snd(p, "random.explode", 0.4, 1.5); });
  });
  // 마지막: 하늘의 마법진 한가운데서 거대한 빛기둥
  later(72, () => {
    column(dim, "as_beam", sky, DOWN, sky.y - g.y, 3, { life: 1, n: 700, size: 1.6 });
    column(dim, "as_beam", sky, DOWN, sky.y - g.y, 1.4, { life: 1.1, n: 300, size: 1.2, tone: 0 });
    pt(dim, "as_burst", up(g, 1), { n: 140, r: 2, spd: 11, life: 1.1, size: 1.6 }, 0);
    pt(dim, "as_dust", up(g, 3), { n: 50, r: 6, spd: 1, life: 1.6 }, 2);
    try { dim.spawnParticle("minecraft:huge_explosion_emitter", up(g, 1)); } catch {}
    for (const e of foes(dim, g, 7)) if (hit(e, 1.8, 1)) M.toss(g, e, 9, 5);
    flash(p, 1, 0.95, 0.8, 0.6);
    shake(p, 0.8, 0.7);
    snd(p, "random.explode", 1.3, 0.6); snd(p, "beacon.deactivate", 1, 0.5);
  });
  later(120, () => skillLock.delete(p.id));
}

// ═════════════ 2차 뇌전술사 / 3차 폭풍의 군주 (번개) ═════════════
function lt_combo(ctx, lord) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), max = lord ? 4 : 3, n = step(p, lord ? "sl1" : "sc1", max), last = n === max - 1;
  M.anim(p, last ? "shoot" : "cast");
  const v = viewOf(p), tgt = aim(p, 28).at, r = rightOf(yawOf(p));
  const from = handCircle(p, last ? PRESET.cyan() : SIMPLE, C.volt, last ? (lord ? 1.6 : 1.2) : 0.75);
  if (last) ctx.setCd?.(8);
  const fan = last ? (lord ? [-2, -1, 0, 1, 2] : [-1, 0, 1]) : [0];
  fan.forEach((k) => {
    const to = add(tgt, r, k * 1.6);
    shoot(ctx, hit, "lt_proj", from, to, { n: last ? 60 : 36, r: 0.18, size: last ? 1.4 : 1.1, spd: 42, mul: last ? (lord ? 0.62 : 0.6) : [0.5, 0.55, 0.6][n],
      onHit: (c, e) => { pt(dim, "lt_burst", c, { n: 16, r: 0.2, spd: 4, life: 0.4 }, 1); pt(dim, "lt_spark", c, { n: 10, r: 0.2, spd: 6, life: 0.4 }, 2); M.potion(e, "slowness", 1, 0.6); } });
    bolt(dim, from, to, { life: 0.22, size: last ? 1.3 : 1, prio: 1 });
  });
  snd(p, "ambient.weather.lightning.impact", 0.4, 1.8);
  if (last) snd(p, "ambient.weather.thunder", 0.5, 1.6);
  void v;
}
function sc_field(ctx) { // 뇌전 결계
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), g = groundAt(dim, aim(p, 16).at), R = 4.5;
  M.anim(p, "raise");
  drawMagic(dim, up(g, 0.1), UP, "seal", { R, color: C.volt, life: 4.2, draw: 0.4, yaw: yawOf(p) });
  snd(p, "beacon.power_select", 0.6, 1.8);
  for (let t = 10; t < 82; t += 8) later(t, () => {
    const inside = foes(dim, g, R);
    const at = inside.length && Math.random() < 0.75 ? { ...inside[Math.floor(Math.random() * inside.length)].location } : (() => { const a = Math.random() * Math.PI * 2, rr = Math.random() * R; return { x: g.x + Math.cos(a) * rr, y: g.y, z: g.z + Math.sin(a) * rr }; })();
    bolt(dim, up(at, 10), at, { size: 1.3, life: 0.3 });
    pt(dim, "lt_burst", up(at, 0.3), { n: 20, r: 0.3, spd: 5, life: 0.5 }, 1);
    for (const e of foes(dim, at, 1.9)) hit(e, 0.45, 6);
    for (const e of inside) M.potion(e, "slowness", 1, 0.6);
    snd(p, "ambient.weather.lightning.impact", 0.4, 1.4);
  });
}
function sc_chain(ctx) { // 연쇄 번개
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.anim(p, "shoot");
  const first = aim(p, 22);
  let cur = first.ent ?? foes(dim, first.at, 4)[0];
  const from = handCircle(p, SIMPLE, C.volt, 0.8);
  if (!cur) { bolt(dim, from, first.at, { size: 1.2 }); return; }
  const seen = new Set();
  let prev = from;
  for (let k = 0; k < 6 && cur; k++) {
    const e = cur, a = prev, mul = 0.85 - k * 0.08;
    seen.add(e.id);
    later(k * 2, () => {
      if (!e.isValid()) return;
      const c = center(e);
      bolt(dim, a, c, { size: 1.2, life: 0.3 });
      hit(e, mul, 1);
      drawMagic(dim, up(e.location, 0.1), UP, "triseal", { R: 1, color: C.volt, life: 0.9, draw: 0.1, size: 0.8 });
      pt(dim, "lt_spark", c, { n: 12, r: 0.3, spd: 6, life: 0.4 }, 2);
      snd(p, "ambient.weather.lightning.impact", 0.35, 1.6 + k * 0.05);
    });
    prev = center(e);
    cur = foes(dim, e.location, 6).filter((x) => !seen.has(x.id)).sort((x, y) => len(sub(x.location, e.location)) - len(sub(y.location, e.location)))[0];
  }
}
function sl_storm(ctx) { // 폭풍 영역: 여러 마법진이 흩어져 돌며 각자 낙뢰
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), g = groundAt(dim, aim(p, 16).at);
  M.anim(p, "raise");
  const kinds = ["seal", "triseal", "cyan", "triseal", "seal"];
  const spots = kinds.map((k, i) => { const a = (i / kinds.length) * Math.PI * 2 + 0.3, rr = i === 0 ? 0 : 5; return { k, at: groundAt(dim, { x: g.x + Math.cos(a) * rr, y: g.y + 1, z: g.z + Math.sin(a) * rr }), R: i === 0 ? 3.2 : 2.2 }; });
  spots.forEach((s, i) => later(i * 3, () => drawMagic(dim, up(s.at, 0.1), UP, s.k, { R: s.R, color: C.volt, life: 4.2 - i * 0.15, draw: 0.3, yaw: i * 40, spin: i % 2 ? -1 : 1 })));
  snd(p, "ambient.weather.thunder", 0.6, 1.4);
  for (let t = 14; t < 86; t += 6) later(t, () => {
    const s = spots[Math.floor(Math.random() * spots.length)];
    const inside = foes(dim, s.at, s.R + 0.5);
    const at = inside.length ? { ...inside[0].location } : { x: s.at.x + (Math.random() - 0.5) * s.R, y: s.at.y, z: s.at.z + (Math.random() - 0.5) * s.R };
    bolt(dim, up(at, 12), at, { size: 1.4, life: 0.3 });
    pt(dim, "lt_burst", up(at, 0.3), { n: 22, r: 0.3, spd: 5, life: 0.5 }, 1);
    for (const e of foes(dim, at, 2)) hit(e, 0.42, 6);
    if (t % 12 === 2) snd(p, "ambient.weather.lightning.impact", 0.5, 1.2);
  });
}
function sl_cannon(ctx) { // 뇌신포
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), v = viewOf(p), eye = eyeOf(p);
  M.anim(p, "shoot");
  M.potion(p, "slowness", 3, 0.9);
  const at = add(eye, v, 2.2);
  drawMagic(dim, at, v, "hexa", { R: 2.6, color: C.volt, life: 1.4, draw: 0.25, spin: 2 });
  for (let t = 0; t < 14; t += 3) later(t, () => pt(dim, "lt_spark", at, { n: 14, r: 2.4, spd: -6, life: 0.4 }, 2));
  snd(p, "beacon.power_select", 0.8, 1.8);
  later(14, () => {
    const vv = viewOf(p), L = 22, end = add(at, vv, L);
    for (let k = 0; k < 6; k++) bolt(dim, at, end, { size: 1.6, life: 0.35, h: 0.6 + k * 0.15, prio: k < 2 ? 0 : 1 });
    for (let d = 2; d < L; d += 2.5) pt(dim, "lt_burst", add(at, vv, d), { n: 10, r: 0.5, spd: 3, life: 0.4 }, 2);
    for (const e of foes(dim, add(at, vv, L / 2), L / 2 + 2)) { const q = sub(center(e), at), al = q.x * vv.x + q.y * vv.y + q.z * vv.z; if (al < -0.5 || al > L) continue; const off = len(sub(q, { x: vv.x * al, y: vv.y * al, z: vv.z * al })); if (off < 2.2 && hit(e, 1.6, 1)) { try { e.applyKnockback(vv.x, vv.z, 1.2, 0.3); } catch {} } }
    flash(p, 0.7, 1, 1, 0.3);
    shake(p, 0.5, 0.4);
    snd(p, "ambient.weather.thunder", 1, 1.2); snd(p, "random.explode", 0.7, 1.6);
  });
}
function sl_ult(ctx) { // 만뢰
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), g = groundAt(dim, aim(p, 24).at), R = 11, sky = up(g, 14);
  skillLock.add(p.id);
  later(16, () => skillLock.delete(p.id));
  M.anim(p, "raise");
  M.potion(p, "resistance", 3, 4);
  flash(p, 0.02, 0.06, 0.1, 0.8);
  drawMagic(dim, sky, UP, "hexa", { R, color: C.volt, life: 4.4, draw: 0.8, spin: 0.7, yaw: yawOf(p) });
  drawMagic(dim, up(sky, 0.6), UP, [{ t: "ring", r: 1.1, seg: 5, gap: 0.35, spin: 14 }, { t: "ring", r: 1.18, seg: 3, gap: 0.5, spin: -10 }], { R, color: C.volt, life: 4.4, draw: 0.8 });
  drawMagic(dim, up(g, 0.1), UP, "seal", { R: 6, color: C.volt, life: 4.4, draw: 0.6 });
  snd(p, "ambient.weather.thunder", 1, 0.8);
  for (let t = 20; t < 66; t++) later(t, () => { // 번개 비
    const a = Math.random() * Math.PI * 2, rr = Math.random() * (R - 1), at = groundAt(dim, { x: g.x + Math.cos(a) * rr, y: g.y + 1, z: g.z + Math.sin(a) * rr });
    bolt(dim, { x: at.x, y: sky.y, z: at.z }, at, { size: 1.2, life: 0.25, prio: t % 2 ? 1 : 0 });
    if (t % 2 === 0) pt(dim, "lt_burst", up(at, 0.3), { n: 12, r: 0.2, spd: 4, life: 0.4 }, 2);
    for (const e of foes(dim, at, 1.8)) hit(e, 0.25, 10);
    if (t % 8 === 0) snd(p, "ambient.weather.lightning.impact", 0.6, 1 + Math.random() * 0.4);
  });
  later(72, () => { // 마지막 일격
    for (let k = 0; k < 4; k++) bolt(dim, sky, g, { size: 2.2, life: 0.45, h: 1 + k * 0.3 });
    try { dim.spawnEntity("minecraft:lightning_bolt", g); } catch {}
    pt(dim, "lt_burst", up(g, 1), { n: 140, r: 1.5, spd: 12, life: 0.9, size: 1.6 }, 0);
    pt(dim, "lt_spark", up(g, 1), { n: 60, r: 2, spd: 10, life: 0.6 }, 2);
    for (const e of foes(dim, g, 6.5)) if (hit(e, 1.8, 1)) M.toss(g, e, 8, 5);
    flash(p, 0.8, 1, 1, 0.5);
    shake(p, 0.9, 0.7);
    snd(p, "ambient.weather.thunder", 1.4, 0.6); snd(p, "random.explode", 1, 1);
  });
  later(120, () => skillLock.delete(p.id));
}

/** 직업 스킬 실행표 (jobs.js 의 wr 필드). 3차 피해 ×1.25 */
const T3 = new Set(["archmage", "stormlord"]);
const RAW = {
  mg_bolt, mg_burst, mg_blink,
  el_combo, el_erupt, el_meteor,
  am_combo, am_trinity, am_time, am_ult,
  sc_combo: (c) => lt_combo(c, false), sc_field, sc_chain,
  sl_combo: (c) => lt_combo(c, true), sl_storm, sl_cannon, sl_ult,
};
export const MG = Object.fromEntries(Object.entries(RAW).map(([k, fn]) => [k, (ctx) => fn({ ...ctx, dmg: ctx.dmg * (T3.has(ctx.s?.path) ? 1.25 : 1) })]));
