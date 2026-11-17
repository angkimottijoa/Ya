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

const DEF = { n: 10, r: 1, spd: 1, tone: 0, size: 1, thick: 0.5, h: 0, dur: 0.1, dots: 4, life: 0.5, x0: 0, y0: 0, iw: 1, ih: 1, cx: 0, cy: 0, scale: 0.05, depth: 0 };
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const UP = { x: 0, y: 1, z: 0 };
const yawTo = (from, to) => (Math.atan2(-(to.x - from.x), to.z - from.z) * 180) / Math.PI;
const ease = (s) => s * s * (3 - 2 * s);
function pt(dim, name, loc, o = {}) {
  try {
    const m = new MolangVariableMap();
    for (const k of Object.keys(DEF)) m.setFloat(`variable.${k}`, o[k] ?? DEF[k]);
    for (const k of ["u", "v", "w"]) m.setVector3(`variable.${k}`, o[k] ?? { x: 0, y: 1, z: 0 });
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
  dust(dim, at, { n: 22, r: 0.6, spd: 5, tone: 0.85 });
  dust(dim, at, { n: 12, r: 0.5, spd: 6, tone: 0 });
  smoke(dim, at, { n: big ? 14 : 6, r: big ? 1.2 : 0.6, spd: big ? 3 : 2, size: big ? 2 : 1.3 });
}
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
    for (let k = 0; k < 8; k++) dust(dim, add(c, rt, (k - 3.5) * 0.8), { n: 10, r: 0.4, spd: 3, tone: k % 2 ? 0.85 : 0.05 });
    for (const e of M.around(dim, g, 4.2)) { hit(e, 1.6); M.toss(p.location, e, 1.6, 3.5); }
    shake(dim, g, 0.45, 0.4);
    M.sound(p, "game.player.attack.strong", 1.3, 0.5);
    M.sound(p, "mob.ravager.bite", 1, 0.9);
  });
}

// ② 백호 · 질풍조: 대시처럼 앞으로 질주하며 좌우로 연속 할퀴기 → 마지막 X 할퀴기 + 폭발
function rush(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.potion(p, "resistance", 3, 1.2);
  M.anim(p, "dash");
  M.sound(p, "mob.ravager.roar", 0.5, 1.6);
  for (let t = 0; t < 8; t++) later(t + 1, () => {
    const f = fwdOf(yawOf(p));
    if (t < 6) try { p.applyKnockback(f.x, f.z, 1.45, 0.03); } catch {}
    smoke(dim, up(p.location, 0.2), { n: 3, r: 0.3, spd: 0.6, size: 0.9, life: 0.9 });
    if (t % 2 === 0) {
      M.anim(p, t % 4 ? "slash_down" : "slash");
      const c = claw(dim, p, { roll: t % 4 ? 52 : -52, r: 3.6, dist: 2, n: 560, dur: 0.07, life: 0.45 });
      dust(dim, c, { n: 10, r: 0.6, spd: 3, tone: 0.8 });
      M.sound(p, "mob.ravager.bite", 0.7, 1.4 + t * 0.05);
    }
    for (const e of M.around(dim, add(p.location, f, 1.6), 2.8)) hit(e, 0.6);
  });
  later(10, () => {
    M.anim(p, "smash");
    const f = fwdOf(yawOf(p));
    const c = claw(dim, p, { roll: -45, r: 5, dist: 2.6, size: 1.3, n: 900, life: 0.7 });
    claw(dim, p, { roll: 45, r: 5, dist: 2.6, size: 1.3, n: 900, life: 0.7 });
    boom(dim, c);
    pt(dim, "bh_shock", up(add(p.location, f, 2.5), 0.15), { n: 120, spd: 9, size: 1 });
    for (const e of M.around(dim, add(p.location, f, 2.6), 3.6)) { hit(e, 1.4); M.toss(p.location, e, 1.2, 3); }
    shake(dim, c, 0.35, 0.3);
    M.sound(p, "random.explode", 0.6, 1.3);
  });
}

// ③ 백호 · 습격: 살짝 도약 → 바로 내리꽂기 → 주변 적마다 순간이동해 등 뒤에서 할퀴기 (폭발)
function ambush(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.potion(p, "resistance", 5, 4);
  M.anim(p, "raise");
  try { p.applyKnockback(0, 0, 0, 0.85); } catch {}
  M.sound(p, "mob.ravager.roar", 0.6, 1.3);
  later(6, () => {
    M.anim(p, "smash");
    const f = fwdOf(yawOf(p));
    try { p.applyKnockback(f.x, f.z, 0.7, -2.4); } catch {}
  });
  later(10, () => {
    const g = { ...p.location };
    boom(dim, up(g, 0.3));
    pt(dim, "bh_shock", up(g, 0.15), { n: 180, spd: 12, size: 1.1 });
    pt(dim, "bh_ripple", g, { r: 0.6, spd: 14, n: 260, life: 0.35, size: 1 });
    shake(dim, g, 0.4, 0.35);
    M.sound(p, "random.explode", 0.7, 1.1);
    for (const e of M.around(dim, g, 3.5)) hit(e, 1);
    const targets = M.around(dim, g, 12).sort((a, b) => dist2(a.location, g) - dist2(b.location, g)).slice(0, 8);
    if (!targets.length) { later(3, () => claw(dim, p, { roll: 0, r: 5, dist: 2.4, size: 1.3, n: 900 })); return; }
    targets.forEach((e, i) => later(4 + i * 5, () => {
      if (!e.isValid()) return;
      const from = { ...p.location }, el = e.location;
      const away = norm({ x: el.x - from.x, y: 0, z: el.z - from.z });
      const back = { x: el.x + away.x * 1.7, y: el.y, z: el.z + away.z * 1.7 };
      // 잔상: 떠난 자리 검은 연기 + 흰 줄
      smoke(dim, up(from, 0.9), { n: 8, r: 0.5, spd: 1, size: 1.4, life: 1 });
      const d = sub(back, from), L = Math.hypot(d.x, d.y, d.z) || 0.1;
      pt(dim, "bh_line", up(from, 1), { u: norm(d), v: UP, r: L, h: 0.2, n: Math.round(L * 10), tone: 0, life: 0.35, size: 1.2, thick: Math.random() * 10 });
      try { p.teleport(back, { facingLocation: up(el, 1.2), keepVelocity: false }); } catch {}
      const yw = yawTo(back, el);
      M.anim(p, i % 2 ? "slash_down" : "slash");
      claw(dim, p, { base: back, yaw: yw, roll: (i % 2 ? 1 : -1) * (40 + Math.random() * 30), r: 3.4, dist: 1.6, n: 650, dur: 0.07, life: 0.5, size: 1.1 });
      boom(dim, up(el, 1));
      hit(e, 1.5);
      M.toss(back, e, 0.8, 2.5);
      M.sound(p, "mob.ravager.bite", 0.9, 1.2);
      M.sound(p, "random.explode", 0.35, 1.6);
    }));
  });
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
  pt(dim, "bh_blob", c, { u: scl(d, a), v: scl(vv, b), w: scl(ww, cc), n: Math.min(700, Math.round(area * (o.dens ?? 15) + 12)), life: o.life ?? 0.13, size: o.size ?? 1.5, tone: o.tone ?? 0, thick: o.stripe ?? 0, h: o.ph ?? 0 });
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
  const B = (pos, d, a, b, cc, o) => blob(dim, pos, d, a * k, b * k, cc * k, U, o);
  const seg = (A, Bp, r, o) => { const d = sub(Bp, A), L = Math.hypot(d.x, d.y, d.z) || 0.01; B(add(A, d, 0.5), scl(d, 1 / L), L / (2 * k) + 0.06, r, r, o); };
  // 몸: 길고 근육질, 어깨 근육
  const chest = P(1.55 - flex * 0.35, 0.1 + flex * 0.15, 0), hips = P(-1.7 + flex * 0.35, 0.15 + flex * 0.2, 0);
  B(P(0, 0.05 + flex * 0.3, 0), F, 2.15, 0.88, 0.85, { stripe: 3.6 });
  B(chest, F, 1.05, 1.08, 1.0, { stripe: 2.2 });
  B(hips, F, 0.95, 0.9, 0.9, { stripe: 2.6, ph: 60 });
  for (const s of [-1, 1]) B(add(chest, S, s * 0.55 * k), F, 0.6, 0.7, 0.35, { stripe: 2, ph: 30 });
  // 머리: 낮게 내밀고 질주에 맞춰 흔들림, 각진 큰 머리 + 긴 주둥이
  const nod = Math.sin(ph + 1) * 0.15 * gait;
  const Hc = P(3.25, 0.7 + nod, 0), Hd = norm(add(F, U, -0.18));
  B(P(2.45, 0.5, 0), norm(add(F, U, 0.45)), 0.8, 0.72, 0.72, { stripe: 2.4 });
  B(Hc, Hd, 0.98, 0.74, 0.82, { stripe: 2, ph: 90 });
  for (const s of [-1, 1]) {
    B(P(3.1, 0.45 + nod, s * 0.62), F, 0.5, 0.45, 0.36, { stripe: 2.6 });        // 볼털 (갈기처럼 뻗침)
    B(P(2.75, 1.42 + nod, s * 0.5), norm(add(U, F, -0.5)), 0.3, 0.16, 0.1, { dens: 30 }); // 뒤로 젖힌 귀
    B(P(3.62, 1.13 + nod, s * 0.33), norm(add(F, S, s * 0.4)), 0.32, 0.07, 0.13, { tone: 1, dens: 40 }); // 찌푸린 눈썹 (검정)
    eye(dim, P(3.78, 0.98 + nod, s * 0.36));                                         // 금빛 눈
  }
  B(P(4.05, 0.62 + nod, 0), Hd, 0.62, 0.3, 0.42, { dens: 22, stripe: 1.2 });       // 긴 주둥이
  B(P(4.62, 0.74 + nod, 0), F, 0.13, 0.11, 0.17, { tone: 1, dens: 50 });           // 코
  // 입: jaw 만큼 아래턱이 크게 벌어짐, 붉은 입 안, 긴 송곳니
  const jr = rad(10 + jaw * 42), jd = norm(sub(scl(F, Math.cos(jr)), scl(U, Math.sin(jr))));
  const jawBase = P(3.45, 0.18 + nod, 0);
  B(add(jawBase, jd, 0.55 * k), jd, 0.6, 0.14, 0.38, { dens: 22 });
  B(add(jawBase, add(F, jd), 0.35 * k), F, 0.45, 0.1 + jaw * 0.22, 0.32, { tone: 0.9, dens: 30 });
  const upTip = (s) => P(4.35, 0.42 + nod, s * 0.2), loTip = (s) => add(add(jawBase, jd, 1.0 * k), S, s * 0.18 * k);
  for (const s of [-1, 1]) {
    line(dim, upTip(s), add(upTip(s), U, -0.55 * k), 0.02);
    line(dim, loTip(s), add(add(loTip(s), U, 0.38 * k), F, -0.05 * k), 0.02);
  }
  // 다리: 질주(앞뒤 같이 모였다 펴짐) → 뻗기 → 휘두르기
  for (const s of [-1, 1]) {
    const off = s > 0 ? 0.35 : 0;
    const aF = rad(Math.sin(ph + off) * 55 * gait + reach * 85 - 10), aH = rad(-Math.sin(ph + off) * 50 * gait - reach * 75 + 5);
    const sh = add(chest, add(scl(U, -0.45), scl(S, s * 0.62)), k);
    let paw, el;
    if (s > 0 && swipe >= 0) { // 오른 앞발: 머리 위 뒤 → 앞 아래로 크게 휘두름
      const a = rad(200 - swipe * 175), L = 2.5 * k;
      const dir = norm(add(add(scl(F, Math.sin(a)), U, -Math.cos(a)), S, 0.35));
      el = add(sh, dir, L * 0.5); paw = add(sh, dir, L);
    } else {
      const dir = norm(add(scl(F, Math.sin(aF)), U, -Math.cos(aF)));
      el = add(add(sh, dir, 1.0 * k), F, -0.25 * k); paw = add(sh, dir, 2.05 * k);
    }
    seg(sh, el, 0.38, { stripe: 3.4 });
    seg(el, paw, 0.29, { stripe: 3.4, ph: 45 });
    B(paw, F, 0.4, 0.27, 0.36, { dens: 24 });
    const clawDir = s > 0 && swipe >= 0 ? norm(sub(paw, el)) : F;
    for (let j = -1.5; j <= 1.5; j++) line(dim, add(paw, S, j * 0.17 * k), add(add(add(paw, clawDir, 0.75 * k), U, -0.25 * k), S, j * 0.24 * k), 0.95); // 검고 긴 발톱
    const hp = add(hips, add(scl(U, -0.4), scl(S, s * 0.6)), k);
    const hd = norm(add(scl(F, Math.sin(aH)), U, -Math.cos(aH)));
    const kn = add(add(hp, hd, 1.05 * k), F, 0.3 * k), ft = add(hp, hd, 2.1 * k);
    seg(hp, kn, 0.42, { stripe: 3.4 });
    seg(kn, ft, 0.27, { stripe: 3.4, ph: 45 });
    B(ft, F, 0.36, 0.22, 0.3, { dens: 24 });
  }
  // 꼬리: 채찍처럼 휘둘림
  let prev = add(hips, F, -0.9 * k);
  for (let j = 1; j <= 8; j++) {
    const q = j / 8, wv = Math.sin(t * 0.9 - q * 3) * (0.6 + gait * 0.6);
    const cur = add(add(add(prev, F, -0.42 * k), U, (0.28 - q * 0.35 + wv * 0.25) * k), S, wv * 0.35 * k);
    seg(prev, cur, 0.26 - q * 0.1, { tone: j === 8 ? 1 : j % 2 ? 0 : 0.96, dens: 22 });
    prev = cur;
  }
  // 검은 기운
  if (t % 2 === 0) { smoke(dim, P(0, 0.3, 0), { n: 6, r: 1.6 * k, spd: 0.8, size: 2, life: 0.8 }); smoke(dim, Hc, { n: 3, r: 0.6 * k, spd: 0.6, size: 1.4, life: 0.6 }); }
}
const eye = (dim, at) => { pt(dim, "cr_glow", at, { n: 2, r: 0, size: 0.7, tone: 0.55, life: 0.16 }); pt(dim, "cr_glow", at, { n: 1, r: 0, size: 0.28, tone: 0, life: 0.16 }); };
const glow = (dim, at, size) => pt(dim, "cr_glow", at, { n: 2, r: 0, size, tone: 0.45, life: 0.13 });
const line = (dim, a, b, tone = 0.2) => {
  const d = sub(b, a), L = Math.hypot(d.x, d.y, d.z) || 0.01;
  pt(dim, "bh_line", a, { u: scl(d, 1 / L), v: UP, r: L, h: 0, n: Math.max(4, Math.round(L * 14)), tone, life: 0.13, size: 1, thick: 0 });
};

/** 연출 카메라 */
function cam(p, pos, look, ease = 0.4, type = "InOutSine") {
  try { p.camera.setCamera("minecraft:free", { location: pos, facingLocation: look, easeOptions: { easeTime: ease, easeType: type } }); } catch {
    const f = (v) => v.toFixed(2), t = type.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
    try { p.runCommand(`camera @s set minecraft:free ease ${ease} ${t} pos ${f(pos.x)} ${f(pos.y)} ${f(pos.z)} facing ${f(look.x)} ${f(look.y)} ${f(look.z)}`); } catch {}
  }
}
function camClear(p) { try { p.camera.clear(); } catch { try { p.runCommand("camera @s clear"); } catch {} } }

// ④ 백호 · 천붕: 주변과 함께 솟구침 → 오른쪽 위에서 거대한 백호가 나타나 3D 할퀴기 → 떨어지며 도끼를 내리찍어 땅이 갈라짐
function apex(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  const o = { ...p.location }, yw = yawOf(p), f = fwdOf(yw), rt = rightOf(yw);
  M.potion(p, "resistance", 5, 6);
  M.potion(p, "fire_resistance", 1, 6);
  // 왼쪽 옆에서 크게 보는 카메라 (이 각도에서 박힌 도끼가 사진과 같은 모습)
  const C = add(add(up(o, 7), rt, -13), f, -2), L = add(up(o, 5), f, 3);
  const camDir = norm(sub(L, C)), camRight = norm(cross(camDir, UP)), camUp = cross(camRight, camDir), toCam = { x: -camDir.x, y: -camDir.y, z: -camDir.z };
  cam(p, C, L, 0.5);
  // 0: 주변 사람·몹과 함께 솟구침
  let crowd = [];
  try {
    crowd = dim.getEntities({ location: o, maxDistance: 10, excludeTypes: ["minecraft:item", "minecraft:xp_orb", "rpg:npc", "minecraft:armor_stand"], excludeFamilies: ["inanimate"] }).filter((e) => e.id !== p.id);
  } catch {}
  M.anim(p, "raise");
  M.sound(p, "mob.ravager.roar", 1.2, 0.8);
  pt(dim, "bh_shock", up(o, 0.15), { n: 200, spd: 12, size: 1.2 });
  smoke(dim, up(o, 0.4), { n: 14, r: 1.5, spd: 2.5, size: 2, life: 1.6 });
  for (const e of [p, ...crowd]) {
    try { e.applyKnockback(0, 0, 0, e === p ? 1.45 : 1.3); } catch {}
    later(5, () => M.potion(e, "levitation", 1, 1.05));
  }
  // 6~26: 화면 오른쪽 위에서 거대한 3D 백호가 허공을 질주해 옴 → 크게 도약 → 일어서며 오른 앞발로 내리 할큄
  const S0 = add(add(L, camRight, 22), UP, 9), E0 = add(L, UP, 1.5);
  const Fdir = norm(sub(E0, S0));
  for (let t = 6; t <= 26; t++) later(t, () => {
    let at, pose;
    if (t <= 14) { // 질주: 튀어 오르듯 크게 몸을 접었다 폄
      const e = (t - 6) / 8;
      at = add(add(S0, sub(add(E0, Fdir, -9), S0), e), UP, Math.abs(Math.sin(t * 0.575)) * 1.6);
      pose = { t, gait: 1, pitch: Math.sin(t * 1.15) * 14, jaw: 0.35 + Math.sin(t * 0.9) * 0.25 };
    } else if (t <= 18) { // 도약: 몸을 쭉 펴고 앞발·발톱을 뻗음, 입을 크게 벌림
      const e = ease((t - 14) / 4);
      at = add(add(E0, Fdir, -9 + e * 5), UP, 1.6 - e * 0.6);
      pose = { t, gait: 0.15, pitch: 8 - e * 4, jaw: 0.8 + e * 0.2, reach: e };
    } else { // 일어서며 휘두르기
      const e = Math.min(1, (t - 18) / 5);
      at = add(add(E0, Fdir, -4 + e * 0.6), UP, 1 + Math.sin(e * Math.PI) * 0.8);
      pose = { t, gait: 0, pitch: 40 * Math.sin(Math.min(1, e * 1.4) * Math.PI * 0.5) - (t > 23 ? (t - 23) * 10 : 0), jaw: 1, reach: 0.6, swipe: ease(e) };
    }
    drawTiger(dim, at, Fdir, 1.7, pose);
    if (t % 2 === 0) dust(dim, add(at, Fdir, -6), { n: 14, r: 1.5, spd: 2, tone: 0 });
    if (t === 6 || t === 15) M.sound(p, "mob.ravager.roar", 1.6, t === 6 ? 0.55 : 0.45);
    if (t <= 14 && t % 3 === 0) { M.sound(p, "mob.ravager.step", 1, 0.6); shake(dim, at, 0.15, 0.15); }
  });
  // 20: 백호의 거대한 3D 할퀴기 (오른쪽 위 → 왼쪽 아래)
  later(21, () => {
    const a = rad(40), u = norm(add({ x: -camRight.x * Math.cos(a), y: -camRight.y * Math.cos(a), z: -camRight.z * Math.cos(a) }, camUp, -Math.sin(a)));
    const v = norm(cross(toCam, u));
    const c = add(E0, toCam, 2);
    clawAt(dim, c, u, v, toCam, { r: 13, dots: 4, thick: 1.7, size: 3, n: 2200, dur: 0.18, life: 0.9, h: 75 });
    for (const e of [...crowd, ...M.around(dim, E0, 9)]) hit(e, 2.6);
    shake(dim, E0, 0.6, 0.5);
    M.sound(p, "mob.ravager.bite", 1.5, 0.7);
    M.sound(p, "game.player.attack.strong", 1.5, 0.5);
  });
  later(27, () => { // 백호가 흩어짐
    dust(dim, E0, { n: 50, r: 4, spd: 5, tone: 0 });
    dust(dim, E0, { n: 30, r: 4, spd: 4, tone: 0.9 });
    smoke(dim, E0, { n: 16, r: 3, spd: 2, size: 2.2, life: 1.4 });
  });
  // 26~: 함께 떨어지며 도끼 내리찍기 (도끼를 뒤에서 앞으로 크게 휘둘러 내림)
  later(26, () => {
    M.anim(p, "smash");
    for (const e of [p, ...crowd]) {
      try { e.removeEffect("levitation"); } catch {}
      try { e.applyKnockback(0, 0, 0, e === p ? -2.4 : -1.6); } catch {}
    }
    M.sound(p, "mob.enderdragon.flap", 1, 0.7);
  });
  // 도끼: 사진 그대로 45도 (날 = 앞 아래로 땅에 박힘, 자루 끝 = 뒤 위). 쥐는 곳(grip)을 기준으로 놓되, 날이 H 지점 땅속 1칸에 오게
  const AXS = 0.06, back = scl(f, -1);
  const headPx = { x: 28 - AXE_ART.cx, y: AXE_ART.cy - 132 }; // 날 위치(그림 픽셀) - 쥐는 곳
  const axeAt = (H, drop) => {
    const grip = add(add(up(H, -1 + drop), back, -headPx.x * AXS), UP, -headPx.y * AXS);
    art(dim, "axe", grip, back, UP, rt, { scale: AXS, depth: 0.45, n: 4200, life: 0.14 });
  };
  let tt = 0, landed = false;
  const fall = () => {
    if (!p.isValid() || landed) return;
    tt++;
    let g = false;
    try { g = p.isOnGround; } catch {}
    if ((tt > 3 && g) || tt > 30) { landed = true; impact(); return; }
    later(1, fall);
  };
  later(27, fall);
  const impact = () => {
    const G = { ...p.location }, H = add(G, f, 4.3);
    // 하늘에서 거대한 도끼가 떨어져 내리꽂힘 (3틱) → 2.5초 동안 박혀 있음
    for (let t = 0; t < 3; t++) later(t, () => axeAt(H, (3 - t) * 6));
    for (let t = 3; t < 53; t++) later(t, () => axeAt(H, 0));
    later(3, () => boom(dim, up(H, 0.5), true));
    later(3, () => boom(dim, up(add(H, rt, 3), 0.4)));
    later(5, () => boom(dim, up(add(H, rt, -3), 0.4)));
    pt(dim, "bh_shock", up(H, 0.15), { n: 280, spd: 17, size: 1.4 });
    for (const [d, spd] of [[0, 16], [5, 12], [10, 9]]) later(d, () => pt(dim, "bh_ripple", H, { r: 0.8, spd, n: 320, life: 0.5, size: 1.2 }));
    // 땅 갈라짐: 바깥으로 뻗는 검은 금 (3초)
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + Math.random() * 0.3, dir = { x: Math.cos(a), y: 0, z: Math.sin(a) }, len = 4 + Math.random() * 4;
      pt(dim, "bh_line", up(H, 0.06), { u: dir, v: { x: -dir.z, y: 0, z: dir.x }, r: len, h: 1, n: Math.round(len * 16), tone: 0.95, life: 3, size: 1.4, thick: k * 3.7 });
    }
    for (let k = 0; k < 10; k++) dust(dim, up(add(H, { x: Math.random() - 0.5, y: 0, z: Math.random() - 0.5 }, 5), 0.3), { n: 10, r: 0.4, spd: 6, tone: 0.9, size: 1.6 });
    for (const e of M.around(dim, H, 9)) { hit(e, 3); M.toss(H, e, 2.4, 4); }
    for (const e of crowd) if (e.typeId === "minecraft:player") try { e.applyKnockback(0, 0, 0, 0.6); } catch {}
    shake(dim, H, 1, 1);
    M.sound(p, "random.explode", 1.5, 0.6);
    M.sound(p, "random.anvil_land", 1.2, 0.5);
    later(30, () => camClear(p));
  };
  later(90, () => camClear(p)); // 혹시 몰라 안전장치
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
