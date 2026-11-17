// ═══════════════════════════════════════════════════════════════════════
// 백호의 도끼 (V4.8~) — 직업과 상관없이 쓰는 스킬 무기, 흑백 파티클
//   ① 클릭        백호 · 할퀴기 : ↘ ↙ 엇갈려 X자로 할퀸 뒤, 앞으로 덮치며 거대한 가로 할퀴기 (발톱 줄은 옆에서 보면 ")")
//   ② 쉬프트+클릭 백호 · 질풍조 : 대시처럼 앞으로 질주하며 연속 할퀴기 → 마지막 X 할퀴기 폭발
//   ③ 쉬프트+점프 백호 · 습격   : 살짝 도약 → 바로 내리꽂기 → 주변 적마다 순간이동해 등 뒤에서 할퀴기 (폭발)
//   ④ 쉬프트 두 번 백호 · 천붕   : 주변 사람·몹과 함께 크게 솟구침 → 하늘에서 거대한 백호 앞발이 내리쳐 할큄
//                                → 함께 떨어지며 도끼(사용자 그림 점 찍기, 사진 그대로 45도로 박힘)를 내리찍음 → 땅이 갈라지는 파문 · 폭발
// 파티클: gen_baekho.py (bh_claw 발톱 자국 · bh_cluster 흑백 먼지 · bh_shock 충격파)
// ═══════════════════════════════════════════════════════════════════════
import { system, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
import * as M from "./ms.js";
import { AXE_ART } from "./bh_art_meta.js";

export const AXE_ID = "rpg:baekho_axe";
const later = (t, fn) => system.runTimeout(() => { try { fn(); } catch {} }, Math.max(1, Math.round(t)));
const up = (l, y) => ({ x: l.x, y: l.y + y, z: l.z });
const yawOf = (p) => p.getRotation().y;
const rad = (d) => (d * Math.PI) / 180;
const fwdOf = (yaw) => ({ x: -Math.sin(rad(yaw)), y: 0, z: Math.cos(rad(yaw)) });
const rightOf = (yaw) => ({ x: -Math.cos(rad(yaw)), y: 0, z: -Math.sin(rad(yaw)) });
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });

const DEF = { n: 10, r: 1, spd: 1, tone: 0, size: 1, thick: 0.5, h: 0, dur: 0.1, dots: 4, life: 0.5, x0: 0, y0: 0, iw: 1, ih: 1, cx: 0, cy: 0, scale: 0.05, depth: 0, vs: 0, va: 0 };
let SINK = null; // 설정되면 파티클을 뿌리지 않고 목록에 모음 (백호 다음 프레임 미리 계산용)
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const UP = { x: 0, y: 1, z: 0 };
const yawTo = (from, to) => (Math.atan2(-(to.x - from.x), to.z - from.z) * 180) / Math.PI;
const ease = (s) => s * s * (3 - 2 * s);
function pt(dim, name, loc, o = {}) {
  if (SINK) { SINK.push({ name, loc, o }); return; }
  try {
    const m = new MolangVariableMap();
    for (const k of Object.keys(DEF)) m.setFloat(`variable.${k}`, o[k] ?? DEF[k]);
    for (const k of ["u", "v", "w", "vd"]) m.setVector3(`variable.${k}`, o[k] ?? { x: 0, y: 1, z: 0 });
    dim.spawnParticle(`rpg:${name}`, loc, m);
  } catch {}
}
const dust = (dim, loc, o = {}) => pt(dim, "bh_cluster", loc, { n: 12, r: 0.3, spd: 2.5, tone: 0.3, ...o });

/** 같은 대상은 6틱에 한 번만 */
function hitter(ctx) {
  const last = new Map();
  return (e, mul) => {
    const t = system.currentTick;
    if (!e?.isValid() || t - (last.get(e.id) ?? -99) < 6) return;
    last.set(e.id, t);
    M.skillHit.set(e.id, t);
    try { e.applyDamage(Math.max(1, Math.round(ctx.dmg * mul)), { cause: EntityDamageCause.entityAttack, damagingEntity: ctx.p }); } catch {}
    dust(e.dimension, up(e.location, 1), { n: 16, tone: 0.75 }); // 검은 먼지
    dust(e.dimension, up(e.location, 1.2), { n: 8, tone: 0, spd: 3.5 }); // 흰 파편
  };
}
function shake(dim, at, power, sec) {
  try { for (const pl of dim.getPlayers({ location: at, maxDistance: 20 })) pl.runCommand(`camerashake add @s ${power} ${sec} positional`); } catch {}
}

/**
 * 할퀴기 자국: 플레이어 앞 dist 블록, 시선에 수직인 면 위에 roll(도) 방향으로 긋는다
 *  roll 0 = 오른쪽 → 왼쪽 가로, 90 = 위 → 아래 세로, -55 = ↘ 대각
 */
function claw(dim, p, o = {}) {
  const yw = o.yaw ?? yawOf(p), f = fwdOf(yw), rt = rightOf(yw), rr = rad(o.roll ?? 0);
  // 획 방향 u: 시작(오른쪽 위) → 끝, v: 발톱이 나란히 놓이는 방향, w: 앞쪽(옆에서 보면 ")")
  const u = { x: -rt.x * Math.cos(rr), y: -Math.sin(rr), z: -rt.z * Math.cos(rr) };
  const v = { x: -rt.x * Math.sin(rr), y: Math.cos(rr), z: -rt.z * Math.sin(rr) };
  const c = add(up(o.base ?? p.location, o.y ?? 1.25), f, o.dist ?? 2.2);
  clawAt(dim, c, u, v, f, o);
  return c;
}
/** 아무 방향으로나 할퀴기 (u 획 방향, v 발톱 간격, w 볼록한 쪽) */
function clawAt(dim, c, u, v, w, o = {}) {
  pt(dim, "bh_claw", c, { u, v, w, r: o.r ?? 4, dots: o.dots ?? 4, thick: o.thick ?? 0.62, h: o.h ?? 85, dur: o.dur ?? 0.09, life: o.life ?? 0.55, size: o.size ?? 1, n: o.n ?? 700, tone: 0 });
}
const smoke = (dim, at, o = {}) => pt(dim, "bh_smoke", at, { n: 6, r: 0.4, spd: 1.5, size: 1, life: 1.2, ...o });
function boom(dim, at, big = false) {
  try { dim.spawnParticle(big ? "minecraft:huge_explosion_emitter" : "minecraft:large_explosion", at); } catch {}
  pt(dim, "bh_boom", at, { n: big ? 18 : 10, r: big ? 1.3 : 0.5, spd: big ? 7 : 4, size: big ? 2.9 : 1.6, life: 0.9, tone: 0 });
  pt(dim, "bh_boom", at, { n: big ? 12 : 5, r: big ? 1 : 0.4, spd: big ? 5 : 3, size: big ? 2 : 1.2, life: 0.8, tone: 0.85 });
  dust(dim, at, { n: big ? 20 : 12, r: 0.6, spd: big ? 7 : 5, tone: 0.85 });
  dust(dim, at, { n: big ? 12 : 8, r: 0.5, spd: big ? 8 : 6, tone: 0 });
  smoke(dim, at, { n: big ? 14 : 5, r: big ? 1.2 : 0.6, spd: big ? 3 : 2, size: big ? 2 : 1.3 });
}
/** 균열 선: a → b 사이를 지그재그로 갈라진 금 (검은 줄 + 가장자리 흰 줄), 꼭짓점마다 작은 폭발 */
function crack(dim, a, b, o = {}) {
  const d = sub(b, a), L = Math.hypot(d.x, d.y, d.z) || 0.1, dir = scl(d, 1 / L);
  const side = norm(cross(dir, UP).x || cross(dir, UP).z ? cross(dir, UP) : { x: 1, y: 0, z: 0 });
  const segs = Math.max(3, Math.min(8, Math.round(L / 1.6)));
  let prev = a;
  for (let i = 1; i <= segs; i++) {
    const q = i / segs, j = i === segs ? 0 : (Math.random() - 0.5) * Math.min(1.6, L * 0.18);
    const cur = add(add(a, d, q), side, j);
    const sd = sub(cur, prev), sl = Math.hypot(sd.x, sd.y, sd.z) || 0.01, su = scl(sd, 1 / sl);
    pt(dim, "bh_line", prev, { u: su, v: side, r: sl, h: 0.6, n: Math.round(sl * 14), tone: 0.97, life: o.life ?? 1.4, size: 1.6, thick: i * 5.3 });
    pt(dim, "bh_line", add(prev, side, 0.12), { u: su, v: side, r: sl, h: 0.4, n: Math.round(sl * 7), tone: 0, life: (o.life ?? 1.4) * 0.6, size: 0.9, thick: i * 2.1 });
    if (i < segs && Math.random() < 0.5) { // 갈라져 나간 잔금
      const br = add(cur, norm(add(su, side, Math.random() < 0.5 ? 1.2 : -1.2)), 0.8 + Math.random());
      pt(dim, "bh_line", cur, { u: norm(sub(br, cur)), v: side, r: Math.hypot(...Object.values(sub(br, cur))), h: 0.5, n: 10, tone: 0.95, life: (o.life ?? 1.4) * 0.8, size: 1.1, thick: i * 9 });
    }
    prev = cur;
  }
  pt(dim, "bh_boom", a, { n: 4, r: 0.3, spd: 1.2, size: 1.2, life: 0.6, tone: 0.85 });
  pt(dim, "bh_boom", b, { n: 5, r: 0.3, spd: 1.5, size: 1.4, life: 0.7, tone: 0 });
}
/** 강타 이펙트: 폭발 뭉게로 그린 원이 작게 시작해 점점 커짐. 여러 겹을 차례로 */
function boomRings(dim, at, o = {}) {
  const rings = o.rings ?? [[0, 7, 0], [3, 11, 0.85], [6, 15, 0], [10, 19, 0.85]]; // [지연, 퍼지는 속도, 색]
  for (const [d, spd, tone] of rings) later(d + 1, () => {
    pt(dim, "bh_boomring", up(at, 0.2), { n: o.n ?? 70, r: 0.6, spd, size: o.size ?? 1.9, life: o.life ?? 0.75, tone });
    if (d === 0) pt(dim, "bh_boomring", up(at, 0.9), { n: Math.round((o.n ?? 70) * 0.5), r: 0.4, spd: spd * 0.85, size: (o.size ?? 1.9) * 0.8, life: (o.life ?? 0.75) * 0.9, tone: tone ? 0 : 0.85 });
  });
}
/** 땅을 타고 번지는 폭발 고리 */
const boomWave = (dim, at, o = {}) => pt(dim, "bh_boomwave", up(at, 0.1), { r: o.r ?? 0.5, spd: o.spd ?? 10, n: o.n ?? 120, dur: o.dur ?? 0.45, life: o.life ?? 0.8, size: o.size ?? 1.6, tone: o.tone ?? 0 });
/** 그림 점 찍기: 백호의 도끼 (사용자 그림, 사진 그대로 45도) */
const ART = { axe: AXE_ART };
function art(dim, which, at, u, v, w, o = {}) {
  pt(dim, "bh_art", at, { ...ART[which], u, v, w, scale: o.scale ?? 0.08, depth: o.depth ?? 0, n: o.n ?? 2400, life: o.life ?? 0.12, size: o.size ?? 1 });
}

// ① 백호 · 할퀴기: ↘ ↙ X자 → 덮치며 거대한 가로 할퀴기
function scratch(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.potion(p, "resistance", 3, 1.5);
  const front = (d) => add(p.location, fwdOf(yawOf(p)), d);
  const hits = [
    [1, -58, "slash", 0.8, { r: 4.4, dist: 2.7 }],
    [6, 58, "slash_down", 0.8, { r: 4.4, dist: 2.7 }],
  ];
  for (const [t, roll, anim, mul, o] of hits) later(t, () => {
    M.anim(p, anim);
    const c = claw(dim, p, { roll, ...o });
    dust(dim, c, { n: 18, r: 0.8, spd: 3, tone: 0.8 });
    dust(dim, c, { n: 10, r: 0.6, spd: 4, tone: 0 });
    for (const e of M.around(dim, front(2.2), 3.2)) hit(e, mul);
    M.sound(p, "game.player.attack.strong", 1, 0.7);
    M.sound(p, "mob.ravager.bite", 0.8, 1.3 + t * 0.02);
  });
  // 덮치기: 앞으로 뛰어들며 거대한 가로 할퀴기 5줄
  later(11, () => {
    M.anim(p, "smash");
    M.leap(p, 7, 0.25);
    M.sound(p, "mob.ravager.roar", 0.7, 1.4);
  });
  later(14, () => {
    const yw = yawOf(p), f = fwdOf(yw), rt = rightOf(yw);
    const c = claw(dim, p, { roll: 6, r: 6.6, dots: 5, thick: 0.8, dist: 3.4, size: 1.45, n: 1300, dur: 0.12, life: 0.75, h: 95 });
    claw(dim, p, { roll: 6, r: 7.4, dots: 5, thick: 0.92, dist: 3.8, size: 0.7, n: 420, dur: 0.14, life: 0.5, h: 95 }); // 바깥 잔상
    const g = add(p.location, f, 3.2);
    pt(dim, "bh_shock", up(g, 0.15), { n: 160, spd: 11, size: 1.2 });
    boomWave(dim, g, { r: 0.5, spd: 9, n: 90, dur: 0.3, size: 1.4 });
    for (let k = 0; k < 8; k++) dust(dim, add(c, rt, (k - 3.5) * 0.8), { n: 10, r: 0.4, spd: 3, tone: k % 2 ? 0.85 : 0.05 });
    for (const e of M.around(dim, g, 4.2)) { hit(e, 1.6); M.toss(p.location, e, 1.6, 3.5); }
    shake(dim, g, 0.45, 0.4);
    M.sound(p, "game.player.attack.strong", 1.3, 0.5);
    M.sound(p, "mob.ravager.bite", 1, 0.9);
  });
}

// ② 백호 · 질풍조: 대시처럼 질주하며 좌우로 큰 다섯 줄 할퀴기 (지나간 자리 폭발 뭉게) → 거대한 X 할퀴기 + 앞으로 번지는 폭발
function rush(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.potion(p, "resistance", 3, 1.4);
  M.anim(p, "dash");
  M.sound(p, "mob.ravager.roar", 0.7, 1.5);
  boomWave(dim, p.location, { r: 0.3, spd: 7, n: 70, dur: 0.25, size: 1.2 });
  for (let t = 0; t < 9; t++) later(t + 1, () => {
    const f = fwdOf(yawOf(p));
    if (t < 7) try { p.applyKnockback(f.x, f.z, 1.6, 0.03); } catch {}
    pt(dim, "bh_boom", up(p.location, 0.3), { n: 4, r: 0.5, spd: 1.2, size: 1.3, life: 0.8, tone: t % 2 ? 0.85 : 0 });
    if (t % 2 === 0) {
      M.anim(p, t % 4 ? "slash_down" : "slash");
      const c = claw(dim, p, { roll: t % 4 ? 48 : -48, r: 5.2, dots: 5, thick: 0.75, dist: 2.4, size: 1.35, n: 1000, dur: 0.08, life: 0.55, h: 90 });
      dust(dim, c, { n: 14, r: 0.8, spd: 4, tone: 0.85 });
      pt(dim, "bh_boom", c, { n: 6, r: 0.8, spd: 2.5, size: 1.4, life: 0.7, tone: 0 });
      M.sound(p, "mob.ravager.bite", 0.8, 1.3 + t * 0.05);
    }
    for (const e of M.around(dim, add(p.location, f, 2), 3.4)) hit(e, 0.6);
  });
  later(11, () => {
    M.anim(p, "smash");
    const f = fwdOf(yawOf(p)), g = add(p.location, f, 3.2);
    const c = claw(dim, p, { roll: -42, r: 7.5, dots: 5, thick: 0.95, dist: 3.2, size: 1.8, n: 1500, life: 0.85, h: 95 });
    claw(dim, p, { roll: 42, r: 7.5, dots: 5, thick: 0.95, dist: 3.2, size: 1.8, n: 1500, life: 0.85, h: 95 });
    boom(dim, c, true);
    boomWave(dim, g, { r: 0.6, spd: 12, n: 160, dur: 0.4, size: 1.9 });
    later(3, () => boomWave(dim, g, { r: 0.6, spd: 8, n: 90, dur: 0.35, size: 1.4, tone: 0.85 }));
    pt(dim, "bh_shock", up(g, 0.15), { n: 160, spd: 11, size: 1.2 });
    for (const e of M.around(dim, g, 4.5)) { hit(e, 1.6); M.toss(p.location, e, 1.6, 3.5); }
    shake(dim, c, 0.5, 0.4);
    M.sound(p, "random.explode", 0.9, 1.1);
  });
}

// ③ 백호 · 습격: 포효하며 높이 도약 → 수직으로 내리꽂아 땅을 타고 번지는 폭발 → 주변 적마다 순간이동해 등 뒤에서 할퀴기
//   → 마지막에 할퀸 자리들이 한꺼번에 연쇄 폭발
function ambush(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.potion(p, "resistance", 5, 5);
  M.anim(p, "raise");
  const o0 = { ...p.location };
  try { p.applyKnockback(0, 0, 0, 1.25); } catch {}
  M.sound(p, "mob.ravager.roar", 1.2, 0.8);
  boomWave(dim, o0, { r: 0.4, spd: 8, n: 90, dur: 0.3, size: 1.4 });
  pt(dim, "bh_shock", up(o0, 0.15), { n: 140, spd: 10, size: 1.1 });
  for (let t = 1; t < 8; t++) later(t, () => { // 솟구치는 동안 흑백 기운
    smoke(dim, up(p.location, 0.5), { n: 4, r: 0.6, spd: 1, size: 1.5, life: 0.9 });
    dust(dim, up(p.location, 0.8), { n: 8, r: 0.8, spd: 2, tone: t % 2 ? 0 : 0.85 });
  });
  later(8, () => {
    M.anim(p, "smash");
    try { p.applyKnockback(0, 0, 0, -3); } catch {}
    M.sound(p, "mob.enderdragon.flap", 1, 0.6);
  });
  let tt = 0, done = false;
  const wait = () => {
    if (done || !p.isValid()) return;
    tt++;
    pt(dim, "bh_line", up(p.location, 0.5), { u: UP, v: { x: 1, y: 0, z: 0 }, r: 3, h: 0.3, n: 24, tone: 0, life: 0.25, size: 1.4, thick: tt }); // 낙하 줄
    let g = false;
    try { g = p.isOnGround; } catch {}
    if ((tt > 2 && g) || tt > 25) { done = true; land(); return; }
    later(1, wait);
  };
  later(9, wait);
  const land = () => {
    const g = { ...p.location };
    boom(dim, up(g, 0.4), true);
    boomRings(dim, g, { n: 70, size: 1.9 }); // 강타: 폭발 원이 점점 커짐
    boomWave(dim, g, { r: 0.5, spd: 15, n: 160, dur: 0.5, size: 2.1 });
    later(4, () => boomWave(dim, g, { r: 0.5, spd: 9, n: 140, dur: 0.45, size: 1.6, tone: 0.85 }));
    later(8, () => boomWave(dim, g, { r: 0.5, spd: 5, n: 80, dur: 0.4, size: 1.3 }));
    pt(dim, "bh_shock", up(g, 0.15), { n: 260, spd: 15, size: 1.4 });
    pt(dim, "bh_ripple", g, { r: 0.6, spd: 15, n: 300, life: 0.45, size: 1.2 });
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.random() * 0.4, dir = { x: Math.cos(a), y: 0, z: Math.sin(a) }, len = 3 + Math.random() * 3;
      pt(dim, "bh_line", up(g, 0.06), { u: dir, v: { x: -dir.z, y: 0, z: dir.x }, r: len, h: 1, n: Math.round(len * 16), tone: 0.95, life: 2.5, size: 1.3, thick: k * 3.1 });
    }
    shake(dim, g, 0.8, 0.6);
    M.sound(p, "random.explode", 1.3, 0.8);
    M.sound(p, "mob.ravager.roar", 1, 0.6);
    for (const e of M.around(dim, g, 4.5)) { hit(e, 1.2); M.toss(g, e, 1.2, 4); }
    const targets = M.around(dim, g, 14).sort((a, b) => dist2(a.location, g) - dist2(b.location, g)).slice(0, 8);
    if (!targets.length) return;
    const marks = [];
    later(6 + targets.length * 4 + 60, () => camClear(p)); // 안전장치: 시점 복귀
    targets.forEach((e, i) => later(6 + i * 4, () => {
      if (!e.isValid()) return;
      const from = { ...p.location }, el = e.location;
      const away = norm({ x: el.x - from.x, y: 0, z: el.z - from.z });
      const back = { x: el.x + away.x * 1.8, y: el.y, z: el.z + away.z * 1.8 };
      smoke(dim, up(from, 0.9), { n: 10, r: 0.6, spd: 1.2, size: 1.6, life: 1.1 });
      pt(dim, "bh_boom", up(from, 0.5), { n: 5, r: 0.4, spd: 1.5, size: 1.2, life: 0.6, tone: 0.85 });
      const d = sub(back, from), L = Math.hypot(d.x, d.y, d.z) || 0.1;
      pt(dim, "bh_line", up(from, 1), { u: norm(d), v: UP, r: L, h: 0.25, n: Math.round(L * 12), tone: 0, life: 0.4, size: 1.4, thick: Math.random() * 10 });
      crack(dim, up(from, 0.08), up(back, 0.08));           // 이동한 길을 따라 땅에 균열
      try { p.teleport(back, { facingLocation: up(el, 1.2), keepVelocity: false }); } catch {}
      // 역동적인 시점: 어깨 너머 → 발 근처 낮은 곳 → 적 앞 아래에서 올려다보기 (번갈아)
      const fwd = norm({ x: el.x - back.x, y: 0, z: el.z - back.z }), rgt = cross(fwd, UP);
      const shots = [
        [add(add(add(back, fwd, -1.7), rgt, 0.85), UP, 1.95), up(el, 1.0)],
        [add(add(add(back, rgt, 1.5), fwd, 0.5), UP, 0.25), up(el, 1.7)],
        [add(add(add(el, fwd, 2.6), rgt, -1.1), UP, 0.55), up(back, 1.3)],
      ];
      const [cp, cl] = shots[i % 3];
      cam(p, cp, cl, i ? 0.12 : 0.2, "OutCubic");
      M.anim(p, i % 2 ? "slash_down" : "slash");
      claw(dim, p, { base: back, yaw: yawTo(back, el), roll: (i % 2 ? 1 : -1) * (40 + Math.random() * 30), r: 4.4, dots: 5, thick: 0.7, dist: 1.8, n: 1000, dur: 0.07, life: 0.6, size: 1.35, h: 95 });
      boom(dim, up(el, 1));
      boomWave(dim, el, { r: 0.3, spd: 6, n: 50, dur: 0.25, size: 1.2 });
      hit(e, 1.5);
      marks.push({ e, at: { ...el } });
      M.sound(p, "mob.ravager.bite", 1, 1.2);
      M.sound(p, "random.explode", 0.45, 1.5);
    }));
    // 마지막: 할퀸 자리들이 한꺼번에 연쇄 폭발
    later(6 + targets.length * 4 + 6, () => {
      const pl = p.location;
      cam(p, add(add(up(pl, 8), fwdOf(yawOf(p)), -7), rightOf(yawOf(p)), 4), up(pl, 0.5), 0.35, "OutCubic"); // 위에서 넓게
      later(26, () => camClear(p));
      M.sound(p, "random.explode", 1.4, 0.7);
      marks.forEach(({ e, at }, i) => later(i, () => {
        const q = e.isValid() ? { ...e.location } : at;
        boom(dim, up(q, 0.8), true);
        boomWave(dim, q, { r: 0.4, spd: 8, n: 80, dur: 0.35, size: 1.6 });
        if (e.isValid()) { hit(e, 2); M.toss(q, e, 0.6, 5); }
        shake(dim, q, 0.4, 0.3);
      }));
    });
  };
}
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

// ───────── 3D 백호 (타원체 덩어리로 몸 전체) ─────────
const dot3 = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const scl = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
/** 타원체 하나: 중심 c, 긴 축 방향 d(단위), 반지름 a(긴 축)·b(위)·cc(옆), 위쪽 기준 U */
function blob(dim, c, d, a, b, cc, U, o = {}) {
  const vU = norm(sub(U, scl(d, dot3(U, d))));
  const vv = Math.hypot(vU.x, vU.y, vU.z) > 0.1 ? vU : norm(cross(d, { x: 1, y: 0, z: 0 }));
  const ww = cross(d, vv);
  const area = 4.2 * (a * b + b * cc + cc * a);
  pt(dim, "bh_blob", c, { u: scl(d, a), v: scl(vv, b), w: scl(ww, cc), n: Math.min(1500, Math.round(area * (o.dens ?? 34) + 16)), life: o.life ?? 0.11, size: o.size ?? 1.05, tone: o.tone ?? 0, thick: o.stripe ?? 0, h: o.ph ?? 0, depth: o.ao ?? 0, vd: o.vd, vs: o.vs ?? 0 });
}
/**
 * 거대한 3D 백호 앞발 (위에서 내리치는 손). 아주 자세하게:
 *  팔뚝(근육·줄무늬) → 손목 → 넓은 손바닥 → 발가락 4개(관절 굵기) + 며느리발톱 → 갈고리처럼 휜 검은 발톱(뿌리 밝고 끝 검게)
 *  → 손바닥 쪽 큰 발바닥 살·발가락 살(어두운 회색), 발가락 사이 털 뭉치
 *  W 손목 위치, D 손끝 방향, N 손바닥이 향하는 방향, k 크기, spread 0~1 (발가락 펴고 발톱 꺼냄)
 */
function drawPaw(dim, W, D, N0, k, spread = 1, t = 0) {
  const N = norm(sub(N0, scl(D, dot3(N0, D)))), S = cross(D, N);
  const P = (d, n, s) => add(add(add(W, D, d * k), N, n * k), S, s * k);
  const B = (pos, dir, a, b, cc, o = {}) => blob(dim, pos, dir, a * k, b * k, cc * k, scl(N, -1), { dens: 8, size: 1.5, life: 0.13, ...o, ...(o.dens ? { dens: o.dens * 0.33 } : {}) });
  const seg = (A, Bp, r, o) => { const d = sub(Bp, A), L = Math.hypot(d.x, d.y, d.z) || 0.01; B(add(A, d, 0.5), scl(d, 1 / L), L / (2 * k) + 0.05, r, r, o); };
  // 팔뚝: 짧게 (손 위주로 보이게), 고리 줄무늬
  seg(P(-2.1, -0.1, 0), P(-0.9, 0, 0), 0.72, { stripe: 1.6, ao: 0.1 });
  seg(P(-1.0, 0, 0), P(0, 0.05, 0), 0.68, { stripe: 1.6, ph: 20, ao: 0.15 });
  B(P(-0.1, -0.1, 0), D, 0.62, 0.7, 0.82, { ao: 0.2 });                              // 손목
  // 손바닥 (위는 흰 털, 아래는 큰 발바닥 살)
  B(P(0.7, -0.05, 0), D, 0.8, 0.52, 1.08, { ao: 0.05 });
  B(P(0.72, 0.42, 0), D, 0.48, 0.16, 0.6, { tone: 0.72, dens: 40 });                 // 큰 발바닥 살 (세 갈래 모양)
  // 발가락 4개 (가운데 둘이 더 앞), 관절 두 마디, 발가락 살, 발톱
  const toes = [-0.78, -0.27, 0.27, 0.78];
  toes.forEach((sx, i) => {
    const fwd = i === 1 || i === 2 ? 0.25 : 0;
    const sp = sx * (1 + spread * 0.18);
    const base = P(1.3 + fwd, -0.02, sp), mid = P(1.58 + fwd + spread * 0.08, 0.08 + spread * 0.04, sp * 1.04), tip = P(1.78 + fwd + spread * 0.12, 0.22, sp * 1.06);
    B(base, D, 0.34, 0.32, 0.3, { dens: 34 });                                      // 둥글고 짧은 발가락
    seg(mid, tip, 0.27, { dens: 34 });
    B(add(tip, N, 0.14 * k), D, 0.2, 0.1, 0.18, { tone: 0.72, dens: 50 });           // 발가락 살
    // 발톱: 발가락 끝에서 나와 손바닥 쪽으로 갈고리처럼 휨 (spread 만큼 꺼냄), 뿌리는 밝고 끝은 검게
    const L = (0.55 + spread * 0.75) * k;
    let prev = add(tip, D, 0.1 * k);
    for (let j = 1; j <= 3; j++) {
      const q = j / 3, ang = q * 1.1;
      const cur = add(add(prev, D, (L / 3) * Math.cos(ang)), N, (L / 3) * Math.sin(ang));
      seg(prev, cur, Math.max(0.035, 0.11 * (1 - q * 0.85)), { tone: 0.35 + q * 0.6, dens: 70 });
      prev = cur;
    }
  });
  // 며느리발톱 (안쪽 손목 위)
  const dw = P(0.15, 0.25, -0.95);
  seg(dw, add(add(dw, D, 0.5 * k), N, 0.35 * k), 0.07, { tone: 0.85, dens: 70 });
}
const glow = (dim, at, size) => pt(dim, "cr_glow", at, { n: 2, r: 0, size, tone: 0.45, life: 0.13 });
const line = (dim, a, b, tone = 0.2) => {
  const d = sub(b, a), L = Math.hypot(d.x, d.y, d.z) || 0.01;
  pt(dim, "bh_line", a, { u: scl(d, 1 / L), v: UP, r: L, h: 0, n: Math.max(4, Math.round(L * 14)), tone, life: 0.11, size: 1, thick: 0 });
};

/** 연출 카메라 */
function cam(p, pos, look, ease = 0.4, type = "InOutSine") {
  try { p.camera.setCamera("minecraft:free", { location: pos, facingLocation: look, easeOptions: { easeTime: ease, easeType: type } }); } catch {
    const f = (v) => v.toFixed(2), t = type.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
    try { p.runCommand(`camera @s set minecraft:free ease ${ease} ${t} pos ${f(pos.x)} ${f(pos.y)} ${f(pos.z)} facing ${f(look.x)} ${f(look.y)} ${f(look.z)}`); } catch {}
  }
}
function camClear(p) { try { p.camera.clear(); } catch { try { p.runCommand("camera @s clear"); } catch {} } }

// ④ 백호 · 천붕: 폭발과 함께 주변 사람·몹과 아주 높이 솟구침 → 화면 오른쪽 위에서 거대한 3D 백호가 허공을 질주해 덮쳐 할퀴기(맞은 자리 폭발)
//   → 함께 떨어지며 내리찍으면 하늘에서 거대한 빨간 연기 도끼가 땅에 박힘 → 연쇄 폭발 · 번지는 폭발 · 파문 · 땅 갈라짐
function apex(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  const o = { ...p.location }, yw = yawOf(p), f = fwdOf(yw), rt = rightOf(yw);
  M.potion(p, "resistance", 5, 8);
  M.potion(p, "fire_resistance", 1, 8);
  // 왼쪽 옆 높은 곳에서 크게 보는 카메라 (이 각도에서 박힌 도끼가 사진과 같은 모습)
  const C = add(add(up(o, 11), rt, -17), f, -3), L = add(up(o, 9), f, 3);
  const camDir = norm(sub(L, C)), camRight = norm(cross(camDir, UP)), camUp = cross(camRight, camDir), toCam = { x: -camDir.x, y: -camDir.y, z: -camDir.z };
  cam(p, C, L, 0.6);
  // 0: 발밑 폭발과 함께 아주 높이 솟구침
  let crowd = [];
  try {
    crowd = dim.getEntities({ location: o, maxDistance: 11, excludeTypes: ["minecraft:item", "minecraft:xp_orb", "rpg:npc", "minecraft:armor_stand"], excludeFamilies: ["inanimate"] }).filter((e) => e.id !== p.id);
  } catch {}
  M.anim(p, "raise");
  M.sound(p, "mob.ravager.roar", 1.4, 0.7);
  M.sound(p, "random.explode", 1.2, 0.8);
  boom(dim, up(o, 0.4), true);
  boomRings(dim, o, { n: 50, size: 2, rings: [[0, 8, 0], [4, 13, 0.85]] });
  pt(dim, "bh_shock", up(o, 0.15), { n: 140, spd: 14, size: 1.4 });
  shake(dim, o, 0.7, 0.6);
  for (const e of [p, ...crowd]) {
    try { e.applyKnockback(0, 0, 0, e === p ? 2.3 : 2.0); } catch {}
    later(7, () => { M.potion(e, "levitation", 1, 1.0); M.potion(e, "slow_falling", 1, 3.2); });
    later(24, () => M.potion(e, "levitation", 1, 0.6)); // 공중에 오래 머묾
    // 솟구치는 동안 몸에서 폭발 뭉게 꼬리
    if (e === p) for (let t = 1; t <= 8; t += 2) later(t, () => { if (e.isValid()) pt(dim, "bh_boom", e.location, { n: 3, r: 0.3, spd: 0.8, size: 1.2, life: 0.7, tone: t % 4 === 1 ? 0 : 0.85 }); });
  }
  // 8~30: 하늘(화면 오른쪽 위)에서 거대한 백호 앞발이 나타나 → 높이 치켜들며 발톱을 꺼냄 → 위에서 내리쳐 할큄 → 눌렀다 흩어짐
  const E0 = add(L, UP, 1.2), T0 = 8, TE = T0 + 22;
  const strikeDir = norm(add(add(scl(camRight, -0.55), UP, -1), f, 0.15)); // 오른쪽 위 → 왼쪽 아래로 내리침
  const side = norm({ x: strikeDir.x, y: 0, z: strikeDir.z });
  const palm = norm(add(strikeDir, toCam, 0.25));
  const pawState = (t) => {
    const K = 2.1; // 손을 크게
    if (t <= T0 + 8) { // 나타나며 치켜듦
      const e = ease((t - T0) / 8);
      const W = add(add(E0, strikeDir, -(11 + e * 3)), UP, e * 2);
      return { W, D: norm(add(strikeDir, UP, 0.5 * e)), k: K * (0.6 + e * 0.4), spread: e };
    }
    if (t <= T0 + 12) { // 내리침 (점점 빨라짐)
      const e = Math.pow((t - T0 - 8) / 4, 1.8);
      const from = add(add(E0, strikeDir, -14), UP, 2), to = add(E0, strikeDir, -3.4);
      return { W: add(from, sub(to, from), e), D: norm(add(strikeDir, UP, 0.5 * (1 - e))), k: K, spread: 1 };
    }
    const e = Math.min(1, (t - T0 - 12) / 10); // 누른 채 버팀 → 살짝 들림
    return { W: add(add(E0, strikeDir, -3.4), UP, e * e * 3), D: strikeDir, k: K, spread: 1 - e * 0.3 };
  };
  const frame = (t) => { const st = pawState(t); SINK = []; try { drawPaw(dim, st.W, st.D, palm, st.k, st.spread, t); } catch {} const l = SINK; SINK = null; return { l, st }; };
  for (let t = T0; t <= TE; t += 2) later(t, () => { // 2틱마다 그리고, 그 사이는 다음 위치로 미끄러지게 (부하 절반)
    const cur = frame(t), nxt = frame(t + 2);
    cur.l.forEach((it, i) => {
      const n2 = nxt.l[i];
      if (n2 && n2.name === it.name) {
        const v = scl(sub(n2.loc, it.loc), 10), sp = Math.hypot(v.x, v.y, v.z);
        if (sp > 0.01) { it.o.vd = scl(v, 1 / sp); it.o.vs = sp; }
      }
      pt(dim, it.name, it.loc, it.o);
    });
    const W = cur.st.W;
    if (t === T0) { M.sound(p, "mob.ravager.roar", 1.7, 0.5); smoke(dim, W, { n: 14, r: 3, spd: 2, size: 2.4, life: 1.2 }); }
    if (t > T0 + 7 && t <= T0 + 12) { // 내리칠 때 바람 줄기
      for (let j = 0; j < 2; j++) {
        const o2 = add(add(W, camRight, (Math.random() - 0.5) * 6), UP, (Math.random() - 0.5) * 4);
        pt(dim, "bh_line", o2, { u: scl(strikeDir, -1), v: UP, r: 7, h: 0, n: 30, tone: 0, life: 0.18, size: 1.3, thick: j });
      }
    }
  });
  // 내리친 순간: 거대한 3D 할퀴기 자국 + 폭발 + 번지는 폭발, 맞은 자리마다 폭발
  later(T0 + 12, () => {
    const u = strikeDir, v = norm(cross(toCam, u)), c = add(E0, toCam, 1.5);
    clawAt(dim, c, u, v, toCam, { r: 13, dots: 4, thick: 1.8, size: 3.2, n: 1200, dur: 0.12, life: 0.9, h: 75 });
    boom(dim, E0, true);
    boomWave(dim, add(E0, UP, -1), { r: 0.5, spd: 14, n: 90, dur: 0.35, size: 2.2 });
    let nb = 0;
    for (const e of [...crowd, ...M.around(dim, E0, 10)]) {
      hit(e, 2.8);
      if (e.isValid()) { if (nb++ < 5) later(2, () => boom(dim, up(e.location, 1))); try { e.applyKnockback(side.x, side.z, 0.6, -0.8); } catch {} }
    }
    shake(dim, E0, 0.9, 0.6);
    M.sound(p, "mob.ravager.bite", 1.6, 0.6);
    M.sound(p, "random.explode", 1.3, 0.7);
  });
  later(TE + 1, () => { // 앞발이 흑백 먼지로 흩어짐
    const W = pawState(TE).W;
    dust(dim, W, { n: 40, r: 3, spd: 4, tone: 0 });
    dust(dim, W, { n: 24, r: 3, spd: 3, tone: 0.9 });
    smoke(dim, W, { n: 12, r: 2.5, spd: 2, size: 2.2, life: 1.2 });
  });
  // 도끼: 사진 색 연기 뭉치 점으로 크게, 45도 (날 = 앞 아래로 땅에 박힘). 점이 피어오르며 커짐. 쥐는 곳 기준, 날이 H 지점 땅속에
  const AXS = 0.085, back = scl(f, -1);
  const headPx = { x: 28 - AXE_ART.cx, y: AXE_ART.cy - 132 };
  const gripOf = (H, drop) => add(add(up(H, -1.2 + drop), back, -headPx.x * AXS), UP, -headPx.y * AXS);
  const axeAt = (H, drop, life = 0.4, n = 1500, solid = false) => {
    const grip = gripOf(H, drop);
    if (solid) pt(dim, "bh_art_solid", grip, { ...AXE_ART, u: back, v: UP, w: rt, scale: AXS, depth: 0.6, n, life, size: 1 });
    else art(dim, "axe", grip, back, UP, rt, { scale: AXS, depth: 0.6, n, life });
  };
  // 도끼가 박힐 땅 (솟구치기 전 자리 앞 6칸)
  const H = add(o, f, 6);
  try { const top = dim.getTopmostBlock({ x: Math.floor(H.x), z: Math.floor(H.z) }); if (top && Math.abs(top.location.y + 1 - o.y) < 4) H.y = top.location.y + 1; } catch {}
  // 할퀸 뒤 뜸: 공중에 더 머묾 (천천히 내려옴)
  later(TE + 2, () => { for (const e of [p, ...crowd]) { M.potion(e, "slow_falling", 1, 2.4); M.potion(e, "levitation", 1, 0.5); } });
  const SUM = TE + 10, HOV = SUM + 10, WIND = HOV + 14, FALL0 = WIND + 4, FT = 9, SKY = 17;
  // 1) 소환: 하늘 높은 곳에 흑백 기운이 모이며 도끼가 점점 짙어짐 (0.5초)
  later(SUM - 2, () => { M.sound(p, "mob.wither.spawn", 0.5, 1.6); M.sound(p, "item.trident.thunder", 0.8, 0.6); });
  for (let t = SUM; t < HOV; t += 2) later(t, () => {
    const q = (t - SUM) / 10, g = gripOf(H, SKY);
    axeAt(H, SKY, 0.25, Math.round(600 + q * 1800));
    if (q > 0.4) axeAt(H, SKY, 0.14, Math.round(q * 1500), true);
    for (let j = 0; j < 3; j++) { const a = Math.random() * Math.PI * 2; smoke(dim, add(g, { x: Math.cos(a) * 6, y: (Math.random() - 0.5) * 5, z: Math.sin(a) * 6 }), { n: 3, r: 0.5, spd: 1, size: 2, life: 0.6 }); }
    if (t % 4 === 0) M.sound(p, "beacon.ambient", 1, 0.6 + q * 0.6);
  });
  // 2) 공중에서 뜸: 천천히 위아래로 떠 있으며 연기를 피움, 우르릉
  for (let t = HOV; t < WIND; t += 2) later(t, () => {
    const bob = Math.sin((t - HOV) * 0.35) * 0.4;
    axeAt(H, SKY + bob, 0.14, 2200, true);
    if (t % 4 === 0) axeAt(H, SKY + bob, 0.5, 1400);
    if (t === HOV) { M.sound(p, "ambient.weather.thunder", 0.7, 0.6); shake(dim, H, 0.25, 0.7); dust(dim, gripOf(H, SKY), { n: 30, r: 4, spd: 3, tone: 0.9 }); }
  });
  // 3) 들어올림(예비 동작): 살짝 위로 치켜든 뒤
  for (let t = WIND; t < FALL0; t++) later(t, () => {
    const q = (t - WIND + 1) / 4, lift = SKY + ease(q) * 1.6;
    axeAt(H, lift, 0.08, 2200, true);
    if (t === WIND) { M.sound(p, "mob.ravager.roar", 1.2, 0.9); M.sound(p, "item.trident.riptide_3", 1, 0.6); }
  });
  // 4) 낙하: 점점 빨라지며 내리꽂힘. 점 자체가 낙하 속도로 움직여 프레임 사이가 이어짐 + 낙하 잔상 줄기
  const top0 = SKY + 1.6, dropAt = (t) => top0 * (1 - Math.pow(t / FT, 2)); // t = 0..FT
  const vAt = (t) => (2 * top0 * t / (FT * FT)) * 20; // 블록/초
  for (let t = 0; t < FT; t++) later(FALL0 + t, () => {
    pt(dim, "bh_art_fall", gripOf(H, dropAt(t)), { ...AXE_ART, u: back, v: UP, w: rt, scale: AXS, depth: 0.6, n: 2400, life: 0.08, size: 1, vd: { x: 0, y: -1, z: 0 }, vs: vAt(t), va: (2 * top0 / (FT * FT)) * 400 });
    if (t % 2 === 0) for (let j = 0; j < 4; j++) {
      const s0 = add(gripOf(H, dropAt(t) + 3), rt, (j - 1.5) * 1.6);
      pt(dim, "bh_line", s0, { u: UP, v: rt, r: 4 + t, h: 0, n: 24, tone: j % 2 ? 0.85 : 0, life: 0.15, size: 1.2, thick: j });
    }
    if (t === 0) {
      camClear(p); // 내리꽂을 때는 플레이어 시점으로
      try { p.runCommand("camerashake add @s 0.35 0.5 rotational"); } catch {}
      M.anim(p, "smash");
      for (const e of [p, ...crowd]) {
        try { e.removeEffect("levitation"); e.removeEffect("slow_falling"); } catch {}
        try { e.applyKnockback(0, 0, 0, e === p ? -3 : -2); } catch {}
      }
      M.sound(p, "mob.enderdragon.flap", 1.3, 0.6);
      M.sound(p, "mob.phantom.swoop", 1.4, 0.6);
    }
    if (t === 4) M.sound(p, "item.trident.riptide_3", 1.2, 0.8);
  });
  // 도끼가 땅에 닿기 3틱 전에 착지 충격 시작 → 도끼 박힘과 맞물림
  later(FALL0 + FT - 3, () => impact());
  const impact = () => {
    const G = { ...p.location };
    // 내리꽂는 바로 그 순간: 발밑에서 폭발 파동이 즉시 퍼짐 + 폭발 원이 작게 시작해 점점 커짐 (도끼가 박힐 때도 한 번 더)
    boom(dim, up(G, 0.4), true);
    later(3, () => boomRings(dim, H, { n: 56, size: 2.6, rings: [[0, 9, 0], [3, 14, 0.85], [6, 19, 0], [10, 24, 0.85]] }));
    pt(dim, "bh_shock", up(G, 0.15), { n: 160, spd: 22, size: 1.6 });
    shake(dim, G, 0.9, 0.5);
    M.sound(p, "random.explode", 1.6, 0.7);
    // 도끼가 박혀 8초 동안 연기를 피워 올림
    // 반은 선명한 점 (한 번 그려 8초 그대로), 반은 연기 점 (6틱마다 피어오름)
    later(3, () => axeAt(H, 0, 8, 4500, true));
    for (let t = 3; t < 163; t += 6) later(t, () => axeAt(H, 0, 1.05, 3200));
    later(3, () => boom(dim, up(H, 0.5), true));
    // 연쇄 폭발: 박힌 곳에서 바깥으로 두 바퀴
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, r = k % 2 ? 4 : 7;
      later(4 + k * 2, () => boom(dim, up(add(H, { x: Math.cos(a), y: 0, z: Math.sin(a) }, r), 0.4), false));
    }
    later(3, () => pt(dim, "bh_shock", up(H, 0.15), { n: 180, spd: 18, size: 1.6 }));
    for (const [d, spd] of [[0, 16], [8, 10]]) later(d + 3, () => pt(dim, "bh_ripple", H, { r: 0.8, spd, n: 200, life: 0.5, size: 1.3 }));
    later(3, () => boomWave(dim, H, { r: 0.8, spd: 20, n: 160, dur: 0.5, size: 2.8 }));
    later(12, () => boomWave(dim, H, { r: 0.8, spd: 10, n: 90, dur: 0.45, size: 2, tone: 0.85 }));
    // 땅 갈라짐: 바깥으로 뻗는 검은 금 (4초)
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.random() * 0.3, dir = { x: Math.cos(a), y: 0, z: Math.sin(a) }, len = 5 + Math.random() * 5;
      later(3, () => pt(dim, "bh_line", up(H, 0.06), { u: dir, v: { x: -dir.z, y: 0, z: dir.x }, r: len, h: 1, n: Math.round(len * 8), tone: 0.95, life: 3, size: 2, thick: k * 3.7 }));
    }
    for (let k = 0; k < 5; k++) later(3, () => dust(dim, up(add(H, { x: Math.random() - 0.5, y: 0, z: Math.random() - 0.5 }, 6), 0.3), { n: 10, r: 0.4, spd: 7, tone: 0.9, size: 1.7 }));
    later(3, () => {
      for (const e of M.around(dim, H, 10)) { hit(e, 3); M.toss(H, e, 2.6, 4.5); }
      for (const e of crowd) if (e.typeId === "minecraft:player") try { e.applyKnockback(0, 0, 0, 0.6); } catch {}
      shake(dim, H, 1.2, 1.2);
      M.sound(p, "random.explode", 1.8, 0.55);
      M.sound(p, "random.anvil_land", 1.3, 0.5);
      M.sound(p, "item.trident.thunder", 1.2, 0.5);
      M.sound(p, "mob.ravager.bite", 1.4, 0.4);
    });
    later(40, () => camClear(p));
  };
  later(240, () => camClear(p)); // 안전장치
}

/** 무기 스킬 표 (청룡의 검과 같은 모양: HUD·쿨다운에 그대로 씀) */
export const WEAPON_SKILLS = {
  [AXE_ID]: [
    { id: "w_bh_1", key: 1, name: "백호 · 할퀴기", short: "할퀴기", lv: 1, mp: 10, cd: 3, pow: 1, run: scratch, desc: "↘ ↙ 로 엇갈려 할퀸 뒤, 앞으로 덮치며 거대한 다섯 줄 할퀴기." },
    { id: "w_bh_2", key: 2, name: "백호 · 질풍조", short: "질풍조", lv: 1, mp: 22, cd: 9, pow: 1, run: rush, desc: "대시처럼 앞으로 질주하며 좌우로 연속 할퀴기, 마지막에 X자 할퀴기 폭발." },
    { id: "w_bh_3", key: 3, name: "백호 · 습격", short: "습격", lv: 1, mp: 35, cd: 18, pow: 1, run: ambush, desc: "살짝 도약했다 바로 내리꽂고, 주변 적마다 순간이동해 등 뒤에서 할퀸다." },
    { id: "w_bh_4", key: 4, name: "백호 · 천붕", short: "천붕", lv: 1, mp: 50, cd: 30, pow: 1, run: apex, desc: "주변 사람·몹과 함께 솟구치면 거대한 백호가 나타나 할퀴고, 떨어지며 도끼를 내리찍어 땅을 가른다." },
  ],
};
