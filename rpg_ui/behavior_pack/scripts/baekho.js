// ═══════════════════════════════════════════════════════════════════════
// 백호의 도끼 (V4.8~) — 직업과 상관없이 쓰는 스킬 무기, 흑백 파티클
//   ① 클릭        백호 · 할퀴기 : ↘ ↙ 엇갈려 X자로 할퀸 뒤, 앞으로 덮치며 거대한 가로 할퀴기 (발톱 줄은 옆에서 보면 ")")
//   ② 쉬프트+클릭 백호 · 질풍조 : 대시처럼 앞으로 질주하며 연속 할퀴기 → 마지막 X 할퀴기 폭발
//   ③ 쉬프트+점프 백호 · 습격   : 살짝 도약 → 바로 내리꽂기 → 주변 적마다 순간이동해 등 뒤에서 할퀴기 (폭발)
//   ④ 쉬프트 두 번 백호 · 천붕   : 주변 사람·몹과 함께 크게 솟구침 → 화면 오른쪽 위에서 거대한 3D 백호(몸 전체)가 덮쳐 할퀴기
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

const DEF = { n: 10, r: 1, spd: 1, tone: 0, size: 1, thick: 0.5, h: 0, dur: 0.1, dots: 4, life: 0.5, x0: 0, y0: 0, iw: 1, ih: 1, cx: 0, cy: 0, scale: 0.05, depth: 0, vs: 0 };
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
  pt(dim, "bh_boom", at, { n: big ? 26 : 12, r: big ? 1.3 : 0.5, spd: big ? 7 : 4, size: big ? 2.6 : 1.5, life: 0.9, tone: 0 });
  pt(dim, "bh_boom", at, { n: big ? 12 : 5, r: big ? 1 : 0.4, spd: big ? 5 : 3, size: big ? 2 : 1.2, life: 0.8, tone: 0.85 });
  dust(dim, at, { n: big ? 30 : 16, r: 0.6, spd: big ? 7 : 5, tone: 0.85 });
  dust(dim, at, { n: big ? 18 : 10, r: 0.5, spd: big ? 8 : 6, tone: 0 });
  smoke(dim, at, { n: big ? 14 : 5, r: big ? 1.2 : 0.6, spd: big ? 3 : 2, size: big ? 2 : 1.3 });
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
    boomWave(dim, g, { r: 0.5, spd: 15, n: 220, dur: 0.5, size: 2.1 });
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
    targets.forEach((e, i) => later(6 + i * 4, () => {
      if (!e.isValid()) return;
      const from = { ...p.location }, el = e.location;
      const away = norm({ x: el.x - from.x, y: 0, z: el.z - from.z });
      const back = { x: el.x + away.x * 1.8, y: el.y, z: el.z + away.z * 1.8 };
      smoke(dim, up(from, 0.9), { n: 10, r: 0.6, spd: 1.2, size: 1.6, life: 1.1 });
      pt(dim, "bh_boom", up(from, 0.5), { n: 5, r: 0.4, spd: 1.5, size: 1.2, life: 0.6, tone: 0.85 });
      const d = sub(back, from), L = Math.hypot(d.x, d.y, d.z) || 0.1;
      pt(dim, "bh_line", up(from, 1), { u: norm(d), v: UP, r: L, h: 0.25, n: Math.round(L * 12), tone: 0, life: 0.4, size: 1.4, thick: Math.random() * 10 });
      try { p.teleport(back, { facingLocation: up(el, 1.2), keepVelocity: false }); } catch {}
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
 * 거대한 3D 백호. 자세(pose)로 움직임:
 *  t 틱, gait 0~1 (질주 진폭), pitch 몸 기울기(도), jaw 0~1 (입 벌림), reach 0~1 (앞발 뻗기·뒷발 펴기), swipe 0~1 (오른 앞발 머리 위→아래로 휘두름)
 */
function drawTiger(dim, c, F0, k, pose = {}) {
  const { t = 0, gait = 0, pitch = 0, jaw = 0.6, reach = 0, swipe = -1 } = pose;
  const U0 = norm(sub(UP, scl(F0, dot3(UP, F0)))), S = cross(F0, U0);
  const pr = rad(pitch), F = norm(add(scl(F0, Math.cos(pr)), U0, Math.sin(pr))), U = cross(S, F);
  const ph = t * 1.15, flex = Math.sin(ph) * gait; // 질주: 등이 접혔다 펴짐
  const P = (f, u, s) => add(add(add(c, F, f * k), U, u * k), S, s * k);
  // ws: 몸 전체에 이어지는 줄무늬 (등뼈 방향 위치 기준, 1블록당 빈도) → 겹치는 덩어리끼리 줄이 맞음
  const B = (pos, d, a, b, cc, o = {}) => {
    if (o.ws) { const al = dot3(sub(pos, c), F); o = { ...o, stripe: a * k * dot3(d, F) * o.ws, ph: al * o.ws * 180 }; }
    blob(dim, pos, d, a * k, b * k, cc * k, U, o);
  };
  const seg = (A, Bp, r, o) => { const d = sub(Bp, A), L = Math.hypot(d.x, d.y, d.z) || 0.01; B(add(A, d, 0.5), scl(d, 1 / L), L / (2 * k) + 0.06, r, r, o); };
  // 몸: 길고 근육질, 어깨 근육
  // 앞몸·뒷몸을 따로: 등이 S자로 출렁이고(옆으로 흔들림), 앞뒤가 엇박자로 움직임
  const sway = Math.sin(ph * 0.5) * 0.22 * gait;
  const chest = P(1.55 - flex * 0.35, 0.1 + flex * 0.18, sway), hips = P(-1.7 + flex * 0.35, 0.15 - flex * 0.12, -sway * 0.8);
  const mid = P(0, 0.08 + Math.sin(ph + 0.6) * 0.22 * gait, 0);
  B(add(mid, sub(chest, mid), 0.45), norm(sub(chest, mid)), 1.25, 0.9, 0.86, { ws: 1.35 });
  B(add(mid, sub(hips, mid), 0.45), norm(sub(mid, hips)), 1.2, 0.88, 0.84, { ws: 1.35, ao: 0.15 });
  B(chest, F, 1.1, 1.2, 1.02, { ws: 1.35 });
  B(add(chest, U, -0.55 * k), F, 0.85, 0.55, 0.8, { ao: 0.25 }); // 깊은 가슴
  B(hips, F, 1.0, 0.95, 0.92, { ws: 1.35, ao: 0.2 });
  for (const s of [-1, 1]) B(add(chest, S, s * 0.58 * k), F, 0.7, 0.8, 0.38, { ws: 1.35 });
  // 머리: 크고 둥근 호랑이 머리 (넓은 볼털, 짧고 넓은 주둥이, 앞을 보는 눈), 질주에 맞춰 흔들림
  const nod = Math.sin(ph + 1) * 0.15 * gait + Math.sin(t * 0.45) * 0.08;
  const hy = swipe >= 0 ? 0.15 : Math.sin(t * 0.37 + 0.5) * 0.35;             // 고개를 좌우로 돌림 (몸과 따로)
  const PH = (f, u, s) => P(f, u, s + hy * (f - 2.3) * 0.35);
  const Hc = PH(3.2, 0.75 + nod, 0), Hd = norm(add(add(F, U, -0.12), S, hy * 0.35));
  B(PH(2.45, 0.6, 0), norm(add(F, U, 0.4)), 0.95, 0.9, 0.86, { stripe: 4.2 });     // 굵은 목
  B(Hc, Hd, 0.86, 0.82, 0.92, { stripe: 2.4, ph: 90, dens: 44 });                  // 머리통
  for (const s of [-1, 1]) {
    B(PH(3.15, 0.35 + nod, s * 0.78), norm(add(scl(S, s), F, -0.6)), 0.55, 0.5, 0.3, { stripe: 5, dens: 44 }); // 옆으로 뻗친 볼털
    B(PH(2.9, 1.48 + nod, s * 0.55), norm(add(U, F, -0.3)), 0.22, 0.24, 0.09, { dens: 40 });                     // 둥근 귀
    B(PH(2.84, 1.5 + nod, s * 0.55), norm(add(U, F, -0.3)), 0.2, 0.22, 0.05, { tone: 1, dens: 40 });            // 귀 뒤 검정
    B(PH(3.86, 1.08 + nod, s * 0.36), norm(add(F, S, s * 0.5)), 0.3, 0.06, 0.12, { tone: 1, dens: 50 });        // 찌푸린 눈썹
    B(PH(3.9, 0.9 + nod, s * 0.36), F, 0.08, 0.12, 0.17, { tone: 1, dens: 60 });                                 // 눈 테두리 (검정)
    eye(dim, PH(3.98, 0.91 + nod, s * 0.36));                                                                     // 금빛 눈
    B(PH(4.0, 0.42 + nod, s * 0.22), F, 0.3, 0.24, 0.26, { dens: 34 });                                         // 볼록한 윗입술 (흰)
  }
  B(PH(3.95, 0.66 + nod, 0), Hd, 0.4, 0.32, 0.36, { dens: 32 });                    // 짧고 넓은 콧등
  B(PH(4.3, 0.72 + nod, 0), F, 0.07, 0.07, 0.13, { tone: 0.85, dens: 70 });         // 코
  // 입: jaw 만큼 아래턱이 크게 벌어짐, 어두운 입 안, 긴 송곳니
  const jr = rad(8 + jaw * 40), jd = norm(sub(scl(F, Math.cos(jr)), scl(U, Math.sin(jr))));
  const jawBase = PH(3.4, 0.2 + nod, 0);
  B(add(jawBase, jd, 0.5 * k), jd, 0.55, 0.15, 0.4, { dens: 30 });
  B(add(jawBase, add(F, jd), 0.3 * k), F, 0.42, 0.08 + jaw * 0.22, 0.3, { tone: 0.92, dens: 34 });
  const upTip = (s) => PH(4.1, 0.32 + nod, s * 0.2), loTip = (s) => add(add(jawBase, jd, 0.95 * k), S, s * 0.17 * k);
  for (const s of [-1, 1]) {
    line(dim, upTip(s), add(upTip(s), U, -0.5 * k), 0.02);
    line(dim, loTip(s), add(add(loTip(s), U, 0.34 * k), F, -0.05 * k), 0.02);
  }
  // 다리: 질주(앞뒤 같이 모였다 펴짐) → 뻗기 → 휘두르기
  for (const s of [-1, 1]) {
    const off = s > 0 ? 0.35 : 0;
    const aF = rad(Math.sin(ph + off) * 55 * gait + reach * 85 - 10), aH = rad(-Math.sin(ph + off + 0.8) * 52 * gait - reach * 75 + 5);
    const sh = add(chest, add(scl(U, -0.45 + Math.sin(ph + off) * 0.1 * gait), scl(S, s * 0.62)), k); // 어깨가 따로 들썩임
    let paw, el;
    if (s > 0 && swipe >= 0) { // 오른 앞발: 머리 위 뒤 → 앞 아래로 크게 휘두름
      const a = rad(200 - swipe * 175), L = 2.5 * k;
      const dir = norm(add(add(scl(F, Math.sin(a)), U, -Math.cos(a)), S, 0.35));
      el = add(sh, dir, L * 0.5); paw = add(sh, dir, L);
    } else {
      const dir = norm(add(scl(F, Math.sin(aF)), U, -Math.cos(aF)));
      el = add(add(sh, dir, 1.0 * k), F, -0.25 * k); paw = add(sh, dir, 2.05 * k);
    }
    seg(sh, el, 0.46, { stripe: 3.2, ao: 0.35 });
    seg(el, paw, 0.34, { stripe: 3.2, ph: 45, ao: 0.5 });
    B(paw, F, 0.48, 0.3, 0.44, { dens: 40, ao: 0.35 });
    const clawDir = s > 0 && swipe >= 0 ? norm(sub(paw, el)) : F;
    for (let j = -1.5; j <= 1.5; j++) line(dim, add(paw, S, j * 0.17 * k), add(add(add(paw, clawDir, 0.75 * k), U, -0.25 * k), S, j * 0.24 * k), 0.95); // 검고 긴 발톱
    const hp = add(hips, add(scl(U, -0.4), scl(S, s * 0.6)), k);
    const hd = norm(add(scl(F, Math.sin(aH)), U, -Math.cos(aH)));
    const kn = add(add(hp, hd, 1.05 * k), F, 0.3 * k), ft = add(hp, hd, 2.1 * k);
    seg(hp, kn, 0.5, { stripe: 3.2, ao: 0.4 });
    seg(kn, ft, 0.32, { stripe: 3.2, ph: 45, ao: 0.55 });
    B(ft, F, 0.44, 0.27, 0.4, { dens: 40, ao: 0.45 });
  }
  // 꼬리: 채찍처럼 휘둘림
  let prev = add(hips, F, -0.9 * k);
  for (let j = 1; j <= 8; j++) {
    const q = j / 8, wv = Math.sin(t * 0.9 - q * 3) * (0.6 + gait * 0.6);
    const cur = add(add(add(prev, F, -0.42 * k), U, (0.28 - q * 0.35 + wv * 0.25) * k), S, wv * 0.35 * k);
    seg(prev, cur, 0.24 - q * 0.08, { tone: j === 8 ? 1 : 0, stripe: 3, ph: j * 70, dens: 40 });
    prev = cur;
  }
  // 검은 기운
  if (t % 2 === 0) { smoke(dim, P(0, 0.3, 0), { n: 6, r: 1.6 * k, spd: 0.8, size: 2, life: 0.8 }); smoke(dim, Hc, { n: 3, r: 0.6 * k, spd: 0.6, size: 1.4, life: 0.6 }); }
}
const eye = (dim, at) => { pt(dim, "cr_glow", at, { n: 2, r: 0, size: 0.7, tone: 0.55, life: 0.16 }); pt(dim, "cr_glow", at, { n: 1, r: 0, size: 0.28, tone: 0, life: 0.16 }); };
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
  boomWave(dim, o, { r: 0.5, spd: 14, n: 220, dur: 0.5, size: 2.2 });
  later(4, () => boomWave(dim, o, { r: 0.5, spd: 8, n: 120, dur: 0.4, size: 1.6, tone: 0.85 }));
  pt(dim, "bh_shock", up(o, 0.15), { n: 240, spd: 14, size: 1.3 });
  shake(dim, o, 0.7, 0.6);
  for (const e of [p, ...crowd]) {
    try { e.applyKnockback(0, 0, 0, e === p ? 2.3 : 2.0); } catch {}
    later(7, () => { M.potion(e, "levitation", 1, 1.0); M.potion(e, "slow_falling", 1, 3.2); });
    later(27, () => M.potion(e, "levitation", 1, 0.9)); // 공중에 오래 머묾
    // 솟구치는 동안 몸에서 폭발 뭉게 꼬리
    for (let t = 1; t <= 8; t += 2) later(t, () => { if (e.isValid()) pt(dim, "bh_boom", e.location, { n: 3, r: 0.3, spd: 0.8, size: 1.2, life: 0.7, tone: t % 4 === 1 ? 0 : 0.85 }); });
  }
  // 8~30: 거대한 3D 백호 — 머리·앞몸·뒷몸·다리를 따로 움직이고, 다음 틱 위치로 미끄러지듯 이어 그림
  const S0 = add(add(L, camRight, 24), UP, 10), E0 = add(L, UP, 1.5);
  const Fdir = norm(sub(E0, S0));
  const T0 = 8;
  const state = (t) => {
    if (t <= T0 + 12) { // 허공 질주
      const e = (t - T0) / 12;
      return { at: add(add(S0, sub(add(E0, Fdir, -9), S0), e), UP, Math.abs(Math.sin(t * 0.575)) * 1.8),
        pose: { t, gait: 1, pitch: Math.sin(t * 1.15) * 16, jaw: 0.35 + Math.sin(t * 0.9) * 0.3 } };
    }
    if (t <= T0 + 17) { // 도약
      const e = ease((t - T0 - 12) / 5);
      return { at: add(add(E0, Fdir, -9 + e * 5), UP, 1.8 - e * 0.8), pose: { t, gait: 0.15, pitch: 8 - e * 4, jaw: 0.8 + e * 0.2, reach: e } };
    }
    const e = Math.min(1, (t - T0 - 17) / 7); // 일어서며 휘두르기
    return { at: add(add(E0, Fdir, -4 + e * 0.6), UP, 1 + Math.sin(e * Math.PI) * 0.8),
      pose: { t, gait: 0, pitch: 42 * Math.sin(Math.min(1, e * 1.4) * Math.PI * 0.5) - (t > T0 + 24 ? (t - T0 - 24) * 9 : 0), jaw: 1, reach: 0.6, swipe: ease(e) } };
  };
  const frame = (t) => { const st = state(t); SINK = []; try { drawTiger(dim, st.at, Fdir, 2.1, st.pose); } catch {} const l = SINK; SINK = null; return { l, at: st.at }; };
  const TE = T0 + 28;
  for (let t = T0; t <= TE; t++) later(t, () => {
    const cur = frame(t), nxt = frame(t + 1);
    cur.l.forEach((it, i) => {
      const n2 = nxt.l[i];
      if (n2 && n2.name === it.name && (it.name === "bh_blob" || it.name === "bh_line")) {
        const v = scl(sub(n2.loc, it.loc), 20), sp = Math.hypot(v.x, v.y, v.z);
        if (sp > 0.01) { it.o.vd = scl(v, 1 / sp); it.o.vs = sp; }
      }
      pt(dim, it.name, it.loc, it.o);
    });
    const at = cur.at;
    if (t % 2 === 0) dust(dim, add(at, Fdir, -6), { n: 14, r: 1.5, spd: 2, tone: 0 });
    if (t <= T0 + 12 && t % 3 === 0) { // 허공을 디딜 때마다 발밑 폭발
      pt(dim, "bh_boom", add(at, UP, -2), { n: 6, r: 0.8, spd: 2, size: 1.8, life: 0.7, tone: 0 });
      M.sound(p, "mob.ravager.step", 1, 0.6);
      shake(dim, at, 0.15, 0.15);
    }
    if (t === T0 || t === T0 + 13) {
      M.sound(p, "mob.ravager.roar", 1.7, t === T0 ? 0.55 : 0.45);
      const mouth = add(add(at, Fdir, 8), UP, 1);
      pt(dim, "bh_boom", mouth, { n: 18, r: 0.6, spd: 7, size: 2, life: 0.7, tone: 0 });
      shake(dim, mouth, 0.5, 0.5);
    }
  });
  // 백호의 거대한 3D 할퀴기 (오른쪽 위 → 왼쪽 아래), 맞은 자리마다 폭발
  later(T0 + 21, () => {
    const a = rad(40), u = norm(add({ x: -camRight.x * Math.cos(a), y: -camRight.y * Math.cos(a), z: -camRight.z * Math.cos(a) }, camUp, -Math.sin(a)));
    const v = norm(cross(toCam, u));
    const c = add(E0, toCam, 2);
    clawAt(dim, c, u, v, toCam, { r: 14, dots: 4, thick: 1.8, size: 3.2, n: 2400, dur: 0.18, life: 0.95, h: 75 });
    for (const e of [...crowd, ...M.around(dim, E0, 10)]) {
      hit(e, 2.6);
      if (e.isValid()) later(2, () => { boom(dim, up(e.location, 1)); });
    }
    later(3, () => boom(dim, c, true));
    shake(dim, E0, 0.7, 0.6);
    M.sound(p, "mob.ravager.bite", 1.5, 0.7);
    M.sound(p, "game.player.attack.strong", 1.5, 0.5);
  });
  later(TE + 1, () => { // 백호가 폭발하며 흩어짐
    const st = state(TE);
    for (let k = 0; k < 5; k++) later(k * 2, () => boom(dim, add(add(st.at, Fdir, (k - 2) * 2.5), UP, Math.random() * 2), k === 2));
    dust(dim, st.at, { n: 50, r: 4, spd: 5, tone: 0 });
    dust(dim, st.at, { n: 30, r: 4, spd: 4, tone: 0.9 });
    smoke(dim, st.at, { n: 16, r: 3, spd: 2, size: 2.2, life: 1.4 });
  });
  // 공중에 잠시 머문 뒤 함께 떨어지며 내리찍기
  later(TE + 8, () => {
    M.anim(p, "smash");
    for (const e of [p, ...crowd]) {
      try { e.removeEffect("levitation"); e.removeEffect("slow_falling"); } catch {}
      try { e.applyKnockback(0, 0, 0, e === p ? -3 : -2); } catch {}
    }
    M.sound(p, "mob.enderdragon.flap", 1, 0.7);
  });
  // 도끼: 빨간 연기 점으로 크게, 사진 그대로 45도 (날 = 앞 아래로 땅에 박힘). 쥐는 곳 기준, 날이 H 지점 땅속 1칸에
  const AXS = 0.085, back = scl(f, -1);
  const headPx = { x: 28 - AXE_ART.cx, y: AXE_ART.cy - 132 };
  const axeAt = (H, drop, life = 0.4) => {
    const grip = add(add(up(H, -1.2 + drop), back, -headPx.x * AXS), UP, -headPx.y * AXS);
    art(dim, "axe", grip, back, UP, rt, { scale: AXS, depth: 0.6, n: 3200, life });
  };
  let tt = 0, landed = false;
  const fall = () => {
    if (!p.isValid() || landed) return;
    tt++;
    let g = false;
    try { g = p.isOnGround; } catch {}
    if ((tt > 3 && g) || tt > 40) { landed = true; impact(); return; }
    later(1, fall);
  };
  later(TE + 9, fall);
  const impact = () => {
    const G = { ...p.location }, H = add(G, f, 6);
    // 내리꽂는 바로 그 순간: 발밑에서 폭발 파동이 즉시 퍼짐
    boom(dim, up(G, 0.4), true);
    boomWave(dim, G, { r: 0.4, spd: 26, n: 380, dur: 0.45, size: 2.4 });
    pt(dim, "bh_shock", up(G, 0.15), { n: 260, spd: 22, size: 1.5 });
    pt(dim, "bh_ripple", G, { r: 0.5, spd: 22, n: 360, life: 0.4, size: 1.3 });
    shake(dim, G, 0.9, 0.5);
    M.sound(p, "random.explode", 1.6, 0.7);
    // 하늘에서 거대한 빨간 연기 도끼가 떨어져 내리꽂힘 (3틱) → 4초 동안 박혀 연기를 피워 올림
    for (let t = 0; t < 3; t++) later(t, () => axeAt(H, (3 - t) * 8, 0.15));
    for (let t = 3; t < 83; t += 2) later(t, () => axeAt(H, 0, 0.45));
    later(3, () => boom(dim, up(H, 0.5), true));
    // 연쇄 폭발: 박힌 곳에서 바깥으로 두 바퀴
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, r = k % 2 ? 4 : 7;
      later(4 + k, () => boom(dim, up(add(H, { x: Math.cos(a), y: 0, z: Math.sin(a) }, r), 0.4), k % 4 === 0));
    }
    later(3, () => pt(dim, "bh_shock", up(H, 0.15), { n: 300, spd: 18, size: 1.5 }));
    for (const [d, spd] of [[0, 16], [5, 12], [10, 9]]) later(d + 3, () => pt(dim, "bh_ripple", H, { r: 0.8, spd, n: 320, life: 0.5, size: 1.2 }));
    later(3, () => boomWave(dim, H, { r: 0.8, spd: 20, n: 340, dur: 0.6, size: 2.6 }));
    later(9, () => boomWave(dim, H, { r: 0.8, spd: 13, n: 240, dur: 0.55, size: 2.1, tone: 0.85 }));
    later(15, () => boomWave(dim, H, { r: 0.8, spd: 8, n: 160, dur: 0.5, size: 1.7 }));
    later(22, () => boomWave(dim, H, { r: 0.8, spd: 5, n: 100, dur: 0.45, size: 1.4, tone: 0.85 }));
    // 땅 갈라짐: 바깥으로 뻗는 검은 금 (4초)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + Math.random() * 0.3, dir = { x: Math.cos(a), y: 0, z: Math.sin(a) }, len = 5 + Math.random() * 5;
      later(3, () => pt(dim, "bh_line", up(H, 0.06), { u: dir, v: { x: -dir.z, y: 0, z: dir.x }, r: len, h: 1, n: Math.round(len * 16), tone: 0.95, life: 4, size: 1.5, thick: k * 3.7 }));
    }
    for (let k = 0; k < 12; k++) later(3, () => dust(dim, up(add(H, { x: Math.random() - 0.5, y: 0, z: Math.random() - 0.5 }, 6), 0.3), { n: 10, r: 0.4, spd: 7, tone: 0.9, size: 1.7 }));
    later(3, () => {
      for (const e of M.around(dim, H, 10)) { hit(e, 3); M.toss(H, e, 2.6, 4.5); }
      for (const e of crowd) if (e.typeId === "minecraft:player") try { e.applyKnockback(0, 0, 0, 0.6); } catch {}
      shake(dim, H, 1.2, 1.2);
      M.sound(p, "random.explode", 1.8, 0.55);
      M.sound(p, "random.anvil_land", 1.3, 0.5);
    });
    later(40, () => camClear(p));
  };
  later(170, () => camClear(p)); // 안전장치
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
