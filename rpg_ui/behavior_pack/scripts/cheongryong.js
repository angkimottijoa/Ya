// ═══════════════════════════════════════════════════════════════════════
// 청룡의 검 (V3.1) — 직업과 상관없이 쓰는 스킬 검
//   ① 클릭        청룡 · 유수   : 앞으로 미끄러지며 몸을 감는 물살 곡선 획
//   ② 쉬프트+클릭 청룡 · 와선창 : 돌진하며 창 반 바퀴씩 좌우로 휘두름 → 찌르기 → 물러섰다 돌진 찌르기 + 번개
//   ③ 쉬프트+점프 청룡 강림     : 먹구름 → 청룡이 구름 아래를 한 바퀴 → 길게 내려와 땅속으로 → 구름에서 번개
//   ④ 쉬프트 두 번 청룡 · 천룡추 : 돌진하며 검기 → 솟구쳐 큰 청룡 머리 → 함께 내리꽂기 → 번개
// 파티클: gen_cheongryong.py (물빛 픽셀 먼지 + ✱ 눈꽃, 머리는 윤곽선 점 찍기)
// ═══════════════════════════════════════════════════════════════════════
import * as WR from "./world_rules.js";
import { system, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
import * as M from "./ms.js";
import { SPEAR } from "./cr_spear_meta.js";
import { skillOpt } from "./skill_opts.js";
import { drawMagic } from "./magic.js";

export const SWORD_ID = "rpg:cheongryong_sword";
const later = (t, fn) => system.runTimeout(() => { try { fn(); } catch {} }, Math.max(1, Math.round(t)));
const up = (l, y) => ({ x: l.x, y: l.y + y, z: l.z });
const yawOf = (p) => p.getRotation().y;
const fwdOf = (yaw) => ({ x: -Math.sin((yaw * Math.PI) / 180), y: 0, z: Math.cos((yaw * Math.PI) / 180) });

const DEF = { n: 10, r: 0.12, spd: 1.2, tone: 0.5, size: 1, yaw: 0, a0: 0, a1: 180, thick: 0.5, h: 1, tilt: 0, dur: 0.15, dots: 36, spin: 0, life: 1, tiltx: 0, tiltz: 0, scale: 1, pitch: 0, seg: 0, seed: 0, amp: 0.6 };
function pt(dim, name, loc, o = {}) {
  try {
    const m = new MolangVariableMap();
    for (const k of Object.keys(DEF)) m.setFloat(`variable.${k}`, o[k] ?? DEF[k]);
    m.setVector3("variable.u", o.u ?? { x: 1, y: 0, z: 0 });
    m.setVector3("variable.v", o.v ?? { x: 0, y: 1, z: 0 });
    m.setVector3("variable.w", o.w ?? { x: 0, y: 1, z: 0 });
    dim.spawnParticle(`rpg:${name}`, loc, m);
  } catch {}
}
const cluster = (dim, loc, o = {}) => pt(dim, "cr_cluster", loc, o);
const snow = (dim, loc, n = 1, r = 0.6) => pt(dim, "cr_snow", loc, { n, r });

/** 같은 대상은 8틱에 한 번만 */
function hitter(ctx) {
  const last = new Map();
  return (e, mul) => {
    const t = system.currentTick;
    if (!e?.isValid() || t - (last.get(e.id) ?? -99) < 8) return;
    last.set(e.id, t);
    M.skillHit.set(e.id, t);
    try { e.applyDamage(Math.max(1, Math.round(ctx.dmg * mul)), { cause: EntityDamageCause.entityAttack, damagingEntity: ctx.p }); } catch {}
    cluster(e.dimension, up(e.location, 1), { n: 14, r: 0.3, spd: 2.5, tone: 0.3 });
  };
}

// 큰 세로 초승달 획: 진행 방향(yaw)을 품은 세로 면을 roll 만큼 기울여, a0 → a1 각도로 긋는다
function bigCrescent(dim, at, yaw, roll, r, o = {}) {
  const f = fwdOf(yaw), ry = (yaw * Math.PI) / 180, rr = (roll * Math.PI) / 180;
  const right = { x: -Math.cos(ry), y: 0, z: -Math.sin(ry) };
  const u = f; // 0° = 앞쪽
  const v = { x: right.x * Math.sin(rr), y: Math.cos(rr), z: right.z * Math.sin(rr) }; // 90° = 위(기울어짐)
  const a0 = o.a0 ?? -25, a1 = o.a1 ?? 205, dur = o.dur ?? 0.16;
  pt(dim, "cr_varc", at, { u, v, r, thick: o.thick ?? 0.7, a0, a1, dur, n: o.n ?? 520 });
  pt(dim, "cr_varc_snow", at, { u, v, r, thick: o.thick ?? 0.7, a0, a1, dur, n: o.ns ?? 160 });
  if (o.outer !== false) pt(dim, "cr_varc_snow", at, { u, v, r: r + 0.9, thick: 0.25, a0: a0 + 15, a1: a1 - 10, dur: dur * 1.2, n: 110 });
}

/**
 * 검기 (V3.9): 파티클 하나(cr_slash)로 그리는 깔끔한 파란 초승달.
 *  플레이어 앞을 지나는 반달 — tilt(도) 만큼 대각선으로 기울이고, dir=1 이면 오른쪽 → 왼쪽, -1 이면 왼쪽 → 오른쪽으로 휘두름.
 *  휘두르는 순서·사라짐은 파티클 안의 Molang 애니메이션이 처리 (스크립트는 한 번만 호출)
 *  spd > 0 이면 초승달 전체가 앞으로 날아감 (날아가는 검기)
 */
function slash(dim, at, yaw, o = {}) {
  const f = fwdOf(yaw), ry = (yaw * Math.PI) / 180, tr = ((o.tilt ?? 0) * Math.PI) / 180;
  const right = { x: -Math.cos(ry), y: 0, z: -Math.sin(ry) };
  const u = { x: right.x * Math.cos(tr), y: Math.sin(tr), z: right.z * Math.cos(tr) };
  const [a0, a1] = o.a0 != null ? [o.a0, o.a1] : o.full ? ((o.dir ?? 1) > 0 ? [0, 370] : [370, 0]) : (o.dir ?? 1) > 0 ? [-8, 188] : [188, -8];
  pt(dim, "cr_slash", at, { u, v: f, w: f, a0, a1, r: o.r ?? 3.6, thick: o.thick ?? 1.2, n: o.n ?? 300, dur: o.dur ?? 0.12, life: o.life ?? 0.45, spd: o.spd ?? 0, size: o.size ?? 1 });
}

// ① 유수: 미끄러지며 파란 초승달 검기를 좌우로 번갈아 4번 → 큰 마무리 → 마크 번개 한 방
function flowingWater(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.anim(p, "dash");
  M.potion(p, "resistance", 5, 3);
  M.potion(p, "fire_resistance", 1, 6);
  M.sound(p, "bucket.empty_water", 1.2);
  M.leap(p, 12, 1);
  const tilts = [-22, 18, -12, 26]; // 대각선 기울기를 번갈아
  tilts.forEach((tilt, i) => {
    later(1 + i * 3, () => {
      const yaw = yawOf(p), L = p.location;
      M.anim(p, i % 2 ? "slash" : "slash_down");
      slash(dim, up(L, 1.1), yaw, { tilt, dir: i % 2 ? -1 : 1, r: 3.4 + (i % 2) * 0.4, thick: 1.15, n: 280 });
      cluster(dim, up(L, 0.9), { n: 12, r: 0.6, spd: 2, tone: 0.5 });
      snow(dim, up(L, 1.4), 3, 2.5);
      const f = fwdOf(yaw);
      for (const e of M.around(dim, { x: L.x + f.x * 2, y: L.y, z: L.z + f.z * 2 }, 4.5)) hit(e, 0.5);
      M.sound(p, "item.trident.riptide_1", 1.2 + i * 0.1, 0.6);
    });
  });
  // 마무리 큰 획 + 번개
  later(14, () => {
    const yaw = yawOf(p), L = p.location, f = fwdOf(yaw);
    slash(dim, up(L, 1), yaw, { tilt: 8, dir: 1, r: 4.8, thick: 1.8, n: 480, dur: 0.16, life: 0.6, size: 1.3 });
    for (const e of M.around(dim, { x: L.x + f.x * 3, y: L.y, z: L.z + f.z * 3 }, 4)) hit(e, 1);
    M.sound(p, "random.splash", 1.3);
  });
  later(20, () => {
    const L = p.location, f = fwdOf(yawOf(p));
    const front = { x: L.x + f.x * 5, y: L.y, z: L.z + f.z * 5 };
    const t = M.around(dim, front, 6).sort((a, b) => Math.hypot(a.location.x - front.x, a.location.z - front.z) - Math.hypot(b.location.x - front.x, b.location.z - front.z))[0];
    const at = t ? { ...t.location } : front;
    try { dim.spawnEntity("minecraft:lightning_bolt", at); } catch {}
    cluster(dim, up(at, 0.5), { n: 20, r: 0.6, spd: 3.5, tone: 0.2 });
    snow(dim, up(at, 1.5), 6, 2);
    if (t) hit(t, 1.8);
  });
}

// ② 와선창: 창을 들고 돌진하며 오른쪽 반 바퀴 → 왼쪽 반 바퀴 휘두름 → 앞으로 찌르기 → 살짝 물러섰다가 → 돌진 찌르기 + 앞으로 번개
/** 파티클 창: 사용자 그림을 점으로 찍음. 손(origin) = 쥐는 곳, dir = 창날 방향.
 *  그림 면은 창 축을 중심으로 돌려 플레이어 시선 쪽을 보게 함 (휘두르거나 찌를 때도 납작하게 안 보임) */
const SPEAR_SCALE = 0.034;
function spear(dim, origin, dir, o = {}) {
  let look = o.look ?? { x: 0, y: 1, z: 0 };
  let v = cross(dir, look);
  if (Math.hypot(v.x, v.y, v.z) < 0.15) v = cross(dir, { x: 0, y: 1, z: 0 });
  if (Math.hypot(v.x, v.y, v.z) < 0.15) v = { x: 1, y: 0, z: 0 };
  v = norm(v);
  const n = Math.round((SPEAR.filled * 1.15) / SPEAR.fill);
  pt(dim, "cr_spear", origin, { u: dir, v, scale: SPEAR_SCALE * (o.size ?? 1), n, life: o.life ?? 0.1 });
  return add(origin, dir, (SPEAR.iw - SPEAR.gx) * SPEAR_SCALE * (o.size ?? 1));
}
const viewOf = (p) => { try { return p.getViewDirection(); } catch { return fwdOf(yawOf(p)); } };
const UP = { x: 0, y: 1, z: 0 };
function whirlpool(ctx) {
  // 더 빠르고 강하게, 동작 다양하게: ① 물살 회오리 돌진(창을 앞으로 겨누고 나선) → ② 오른쪽 반 바퀴 → ③ 왼쪽으로 올려 베는 반 바퀴
  //   → ④ 뛰어올라 공중 한 바퀴 베기 → ⑤ 땅으로 내리꽂는 찌르기(물기둥) → ⑥ 뒤로 물러서며 번개를 모음 → ⑦ 번개 돌진 찌르기 + 다섯 갈래 번개 + 물기둥 길
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.potion(p, "resistance", 4, 3);
  M.sound(p, "item.trident.riptide_2", 1, 1.2);
  const rot = (yaw, deg) => fwdOf(yaw + deg);
  const S = 1.35; // 창·호 크기
  // ① 물살 회오리 돌진 (1~6): 창을 앞으로 겨누고 빠르게, 창 둘레로 물 나선
  M.anim(p, "thrust");
  for (let k = 0; k < 6; k++) later(1 + k, () => {
    const yw = yawOf(p), f = fwdOf(yw), L = p.location;
    try { p.applyKnockback(f.x, f.z, 1.45, 0.03); } catch {}
    const hand = up(L, 1.15), tip = spear(dim, add(hand, f, 0.3), f, { look: viewOf(p), size: S });
    for (const ph of [0, Math.PI]) { const a = k * 1.3 + ph, sd = { x: -f.z, y: 0, z: f.x }; cluster(dim, add(add(add(hand, f, 1.5), sd, Math.cos(a) * 0.9), UP, Math.sin(a) * 0.9), { n: 5, r: 0.15, spd: 0.6, tone: 0.3 }); }
    if (k % 2 === 0) { pt(dim, "cr_wave", up(L, 0.1), { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, a0: (Math.atan2(f.z, f.x) * 180) / Math.PI + 140, a1: (Math.atan2(f.z, f.x) * 180) / Math.PI + 220, r: 0.8, spd: 5, h: 1, thick: 0.3, life: 0.5, n: 50, size: 0.9 }); snow(dim, tip, 2, 0.5); }
    for (const e of M.around(dim, add(L, f, 1.5), 2.4)) hit(e, 0.5);
  });
  // ② 오른쪽 반 바퀴 (7~11) · ③ 왼쪽으로 올려 베는 반 바퀴 (12~16)
  const halves = [{ t0: 7, from: 180, to: 0, side: -1, a0: -90, a1: 90, tilt: 0, anim: "slash" }, { t0: 12, from: -180, to: 0, side: 1, a0: 270, a1: 90, tilt: 30, anim: "shoot_up" }];
  for (const h of halves) {
    later(h.t0, () => {
      M.anim(p, h.anim);
      const yw = yawOf(p);
      slash(dim, up(p.location, 1.05), yw, { a0: h.a0, a1: h.a1, tilt: h.tilt, r: 3.9, thick: 1.2, n: 460, dur: 0.18, life: 0.6, size: 1.5 });
      slash(dim, up(p.location, 1.0), yw, { a0: h.a0, a1: h.a1, tilt: h.tilt, r: 3.2, thick: 0.6, n: 180, dur: 0.22, life: 0.5, size: 1.1, spd: 2 }); // 안쪽 물보라
      M.sound(p, "item.trident.throw", 1.1, 1 + h.t0 * 0.02);
    });
    for (let k = 0; k <= 4; k++) later(h.t0 + k, () => {
      const yw = yawOf(p), f = fwdOf(yw);
      if (k < 4) try { p.applyKnockback(f.x, f.z, 0.9, 0.02); } catch {}
      const deg = h.from + ((h.to - h.from) * k) / 4;
      const hand = add(up(p.location, 1.1), rot(yw, h.side * -90), 0.35);
      const tip = spear(dim, hand, rot(yw, deg), { look: viewOf(p), size: S });
      snow(dim, tip, 2, 0.5);
      for (const e of M.around(dim, p.location, 4)) hit(e, 0.5);
    });
  }
  // ④ 뛰어올라 공중 한 바퀴 베기 (17~21)
  later(17, () => {
    M.anim(p, "spin");
    try { p.applyKnockback(0, 0, 0, 0.62); } catch {}
    M.sound(p, "item.trident.riptide_1", 1, 1.4);
  });
  for (let k = 0; k < 5; k++) later(18 + k, () => {
    const yw = yawOf(p) + k * 72;
    spear(dim, up(p.location, 1.1), fwdOf(yw), { look: viewOf(p), size: S });
    if (k === 1) slash(dim, up(p.location, 1.1), yawOf(p), { full: true, r: 3.6, thick: 1, n: 420, dur: 0.2, life: 0.5, size: 1.4 });
    for (const e of M.around(dim, p.location, 3.8)) hit(e, 0.55);
  });
  // ⑤ 땅으로 내리꽂는 찌르기 (23): 물기둥 + 충격파
  later(23, () => {
    M.anim(p, "slash_down");
    try { p.applyKnockback(0, 0, 0, -1.4); } catch {}
    const yw = yawOf(p), f = fwdOf(yw), at = add(p.location, f, 1.6);
    for (let k = 0; k < 3; k++) later(k, () => spear(dim, add(up(at, 2.6 - k * 0.8), f, -0.2), norm({ x: f.x * 0.25, y: -1, z: f.z * 0.25 }), { look: viewOf(p), size: S }));
    later(2, () => {
      pt(dim, "cr_column", at, { r: 1.2, n: 220, spd: 15 });
      pt(dim, "cr_shock", up(at, 0.1), { n: 160, spd: 13, tone: 0.25 });
      wave(ctx, hit, at, { r: 1, spd: 10, h: 1.6, life: 0.6, n: 360, mul: 0.6, push: 6, size: 1.1 });
      for (const e of M.around(dim, at, 3)) { hit(e, 0.9); M.toss(at, e, 2, 4); }
      shake(dim, at, 0.4, 0.3);
      M.sound(p, "random.splash", 1, 0.8);
      M.sound(p, "item.trident.hit_ground", 1.2, 0.8);
    });
  });
  // ⑥ 뒤로 물러서며 창을 당겨 번개를 모음 (27~31)
  later(27, () => {
    const yw = yawOf(p), f = fwdOf(yw);
    try { p.applyKnockback(-f.x, -f.z, 0.8, 0.15); } catch {}
    for (let k = 0; k < 5; k++) later(k, () => { spear(dim, add(up(p.location, 1.15), fwdOf(yawOf(p)), -0.7), fwdOf(yawOf(p)), { look: viewOf(p), size: S }); bodyVolts(dim, p.location, 2, 1); });
    M.sound(p, "random.fizz", 0.9, 1.6);
    M.sound(p, "beacon.power_select", 0.6, 1.8);
  });
  // ⑦ 번개 돌진 찌르기 (33): 훨씬 빠르게 + 다섯 갈래 번개 + 지나간 길에 물기둥
  later(33, () => {
    M.anim(p, "thrust");
    const yw = yawOf(p), f = fwdOf(yw), o = { ...p.location };
    try { p.applyKnockback(f.x, f.z, 3.6, 0.08); } catch {}
    M.sound(p, "item.trident.riptide_3", 1.3, 1);
    M.sound(p, "ambient.weather.lightning.impact", 1.1, 1.4);
    for (let k = 0; k < 7; k++) later(k, () => {
      const L = p.location, ff = fwdOf(yawOf(p));
      const tip = spear(dim, add(up(L, 1.15), ff, 0.6), ff, { look: viewOf(p), size: S * 1.15 });
      cluster(dim, tip, { n: 8, r: 0.4, spd: 2.5, tone: 0.2 });
      if (k % 2 === 0) pt(dim, "cr_column", L, { r: 0.7, n: 70, spd: 9 });
      for (const e of M.around(dim, add(L, ff, 2.5), 2.8)) hit(e, 1.5);
    });
    later(5, () => {
      const L = p.location, ff = fwdOf(yawOf(p)), start = add(up(L, 1.15), ff, 4.6), sd = { x: -ff.z, y: 0, z: ff.x };
      for (let i = 0; i < 5; i++) volt(dim, start, up(add(add(start, ff, 10 + Math.abs(i - 2) * 1.5), sd, (i - 2) * 2), (Math.random() - 0.5) * 1.4), { size: 1.5, life: 0.36 });
      flash(dim, start, 3.5);
      pt(dim, "cr_shock", up(add(L, ff, 3), 0.15), { n: 140, spd: 12, tone: 0.2 });
      wave(ctx, null, add(L, ff, 2), { dir: (Math.atan2(ff.z, ff.x) * 180) / Math.PI, width: 70, r: 1, spd: 16, h: 2.2, life: 0.8, n: 180, size: 1.2 });
      for (let d = 2; d <= 15; d += 1.5) for (const e of M.around(dim, add(L, ff, d), 2.2)) hit(e, 2.0);
      shake(dim, L, 0.5, 0.35);
      M.sound(p, "ambient.weather.thunder", 1, 1.3);
    });
  });
}

// ───────── 번개 / 구름 / 몸통 도구 ─────────
/**
 * 진짜 같은 번개 (cr_volt): a → b 꺾인 선, 흰 심 + 빛무리, 깜빡임. 곁가지 몇 개를 덧붙임
 *  o.amp 꺾임 폭, o.branch 곁가지 수, o.life, o.size
 */
function volt(dim, a, b, o = {}) {
  const d = sub(b, a), len = Math.hypot(d.x, d.y, d.z) || 0.01, u = { x: d.x / len, y: d.y / len, z: d.z / len };
  const v = norm(Math.abs(u.y) > 0.9 ? cross(u, { x: 1, y: 0, z: 0 }) : cross(u, { x: 0, y: 1, z: 0 })), w = cross(u, v);
  const amp = (o.amp ?? Math.min(3.4, 0.6 + len * 0.2)) * 1.35, size = (o.size ?? 1) * 1.2, life = (o.life ?? 0.22) * 1.25;
  const depth = o.depth ?? 0;
  // 큰 꺾임 꼭짓점은 스크립트가 정함 (곁가지를 정확히 꼭짓점에서 뻗게), 잔 꺾임은 파티클(cr_volt)이 그림
  const N = Math.max(2, Math.min(7, Math.round(len / 1.6)));
  const P = [a];
  for (let k = 1; k < N; k++) {
    const q = k / N, env = Math.sqrt(Math.sin(q * Math.PI)) * amp;
    P.push(add(add(add(a, d, q), v, (Math.random() - 0.5) * env), w, (Math.random() - 0.5) * env));
  }
  P.push(b);
  for (let k = 0; k < N; k++) {
    const sd = sub(P[k + 1], P[k]), sl = Math.hypot(sd.x, sd.y, sd.z) || 0.01, su = { x: sd.x / sl, y: sd.y / sl, z: sd.z / sl };
    const sv = norm(Math.abs(su.y) > 0.9 ? cross(su, { x: 1, y: 0, z: 0 }) : cross(su, { x: 0, y: 1, z: 0 }));
    pt(dim, "cr_volt", P[k], { u: su, v: sv, w: cross(su, sv), r: sl, amp: Math.min(0.9, sl * 0.32), seed: Math.random() * 1000, n: Math.round(sl * 40 * size + 6), life, size, thick: o.thick ?? 1 });
  }
  // 곁가지: 꼭짓점에서 옆으로 크게 갈라짐 (곁가지의 곁가지도 한 번)
  const nb = o.branch ?? (depth ? 1 : Math.min(5, 1 + Math.floor(len / 2)));
  if (depth >= 2) return;
  for (let i = 0; i < nb; i++) {
    const st = P[1 + Math.floor(Math.random() * (N - 1))] ?? a;
    const sgn = Math.random() < 0.5 ? -1 : 1;
    const dir = norm(add(add(v, w, (Math.random() - 0.5) * 1.4), u, (0.35 + Math.random() * 0.4) * sgn));
    const bl = Math.max(0.8, len * (0.28 + Math.random() * 0.3));
    volt(dim, st, add(st, { x: dir.x * sgn, y: dir.y * sgn, z: dir.z * sgn }, bl), { amp: amp / 1.35 * 0.55, size: (o.size ?? 1) * 0.72, life: (o.life ?? 0.22) * 0.85, thick: 0.8, depth: depth + 1, branch: depth ? 0 : 1 });
  }
}
function vfxBolt(dim, a, b, w = 0.45) { volt(dim, a, b, { size: 0.8 + w, branch: 2 }); }
function flash(dim, loc, size = 2) {
  try {
    const m = new MolangVariableMap();
    m.setColorRGBA("variable.color", { red: 0.8, green: 0.92, blue: 1, alpha: 1 });
    m.setFloat("variable.size", size);
    m.setFloat("variable.life", 0.3);
    dim.spawnParticle("rpg:vfx_flash", loc, m);
  } catch {}
}
/** 구름에서 땅으로 번개 (여러 갈래로 꺾임) */
function lightning(ctx, from, to, hit, mul) {
  const dim = ctx.p.dimension;
  let a = from;
  const n = 4;
  for (let i = 1; i <= n; i++) {
    const q = i / n;
    const b = i === n ? to : { x: from.x + (to.x - from.x) * q + (Math.random() - 0.5) * 2.2, y: from.y + (to.y - from.y) * q, z: from.z + (to.z - from.z) * q + (Math.random() - 0.5) * 2.2 };
    vfxBolt(dim, a, b);
    a = b;
  }
  flash(dim, up(to, 1), 3);
  cluster(dim, up(to, 0.4), { n: 30, r: 0.6, spd: 4, tone: 0.2 });
  snow(dim, up(to, 1.5), 8, 2.5);
  for (const e of M.around(dim, to, 4.5)) hit(e, mul);
  M.sound(ctx.p, "ambient.weather.lightning.impact", 0.9, 1);
  M.sound(ctx.p, "ambient.weather.thunder", 1.1, 0.8);
}
/** 몸통: prev → cur 사이를 k번 나눠 단면 */
function body(dim, prev, cur, thick, life = 1.3, steps = 3) {
  const d = norm({ x: cur.x - prev.x, y: cur.y - prev.y, z: cur.z - prev.z });
  const u = norm(Math.abs(d.y) > 0.95 ? cross(d, { x: 1, y: 0, z: 0 }) : cross(d, { x: 0, y: 1, z: 0 }));
  const v = cross(u, d);
  for (let k = 1; k <= steps; k++) {
    const q = k / steps;
    pt(dim, "cr_tube", { x: prev.x + (cur.x - prev.x) * q, y: prev.y + (cur.y - prev.y) * q, z: prev.z + (cur.z - prev.z) * q }, { u, v, r: thick, n: 36, life });
  }
}
/** 몸통: 경로 함수의 (t-1 → t) 구간을 실제 곡선대로 steps 번 나눠 단면 */
function bodyAlong(dim, path, t, thick, life = 1.3, steps = 5) {
  let a = path(t - 1);
  for (let k = 1; k <= steps; k++) {
    const b = path(t - 1 + k / steps);
    body(dim, a, b, thick, life, 1);
    a = b;
  }
}
const headDir = (prev, cur) => {
  const d = { x: cur.x - prev.x, y: cur.y - prev.y, z: cur.z - prev.z };
  return { yaw: (Math.atan2(-d.x, d.z) * 180) / Math.PI, pitch: (Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180) / Math.PI };
};
// ───────── 실감나는 3D 청룡 (③ 강림) ─────────
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scl = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const mix = (...vs) => norm(vs.reduce((acc, [v, k]) => add(acc, v, k), { x: 0, y: 0, z: 0 }));
/** 경로 위 tt 지점의 몸 좌표계: d = 진행, u = 옆, v = 등(위) */
function frame(path, tt) {
  const c = path(tt), d = norm(sub(path(tt + 0.35), path(tt - 0.35)));
  const u = norm(Math.abs(d.y) > 0.95 ? cross(d, { x: 1, y: 0, z: 0 }) : cross(d, { x: 0, y: 1, z: 0 }));
  return { c, d, u, v: cross(u, d) };
}
/** 머리 로컬 좌표 (앞 x, 위 y, 옆 z) → 월드 (cr_head 파티클과 같은 회전) */
function headPt(c, hd, lx, ly, lz, sc) {
  const Y = (hd.yaw * Math.PI) / 180, P = (hd.pitch * Math.PI) / 180, sy = Math.sin(Y), cy = Math.cos(Y), sp = Math.sin(P), cp = Math.cos(P);
  const F = { x: -sy * cp, y: sp, z: cy * cp }, U = { x: sy * sp, y: cp, z: -cy * sp }, S = { x: cy, y: 0, z: sy };
  return add(add(add(c, F, lx * sc), U, ly * sc), S, lz * sc);
}
/** a 에서 b 로 휜 선 (가시·뿔·수염·발톱) */
function line(dim, a, b, o = {}) {
  const d = sub(b, a), len = Math.hypot(d.x, d.y, d.z) || 0.01, u = { x: d.x / len, y: d.y / len, z: d.z / len };
  pt(dim, "cr_line", a, { u, v: o.bend ?? { x: 0, y: 1, z: 0 }, r: len, h: o.h ?? 0, n: o.n ?? Math.ceil(len * 12), tone: o.tone ?? 0.5, spd: o.spd ?? 0, thick: o.thick ?? 0.6, life: o.life ?? 0.12, size: o.size ?? 1 });
}
const glow = (dim, at, o = {}) => pt(dim, "cr_glow", at, { n: o.n ?? 1, r: o.r ?? 0, size: o.size ?? 0.3, tone: o.tone ?? 0.2, life: o.life ?? 0.12 });
function shake(dim, at, power, sec) {
  try { for (const pl of dim.getPlayers({ location: at, maxDistance: 28 })) pl.runCommand(`camerashake add @s ${power} ${sec} positional`); } catch {}
}
/**
 * 한 틱 분량의 청룡: 비늘 몸통 + 등가시 + 갈기 + 네 다리(발톱) + 수염 + 꼬리 지느러미 + 머리(윤곽·채움) + 빛나는 눈
 *  path(t) 위를 지나는 용, ground 아래는 안 그림
 */
function drawDragon(dim, path, t, o) {
  const { thick, life, ground, sc = 1.7 } = o;
  const ok = (q) => q.y > ground;
  const H = frame(path, t);
  // 몸통: 곡선을 따라 5번, 비늘 줄무늬가 엇갈리게 seg 번호
  let a = path(t - 1);
  for (let k = 1; k <= 5; k++) {
    const b = path(t - 1 + k / 5);
    if (ok(b)) {
      const dd = norm(sub(b, a)), uu = norm(Math.abs(dd.y) > 0.95 ? cross(dd, { x: 1, y: 0, z: 0 }) : cross(dd, { x: 0, y: 1, z: 0 }));
      pt(dim, "cr_body", b, { u: uu, v: cross(uu, dd), r: thick, n: 46, life, seg: t * 5 + k });
    }
    a = b;
  }
  // 등가시: 톱니처럼 높낮이 번갈아, 몸통과 함께 남음
  const B = frame(path, t - 1.4);
  if (ok(B.c)) {
    const base = add(B.c, B.v, thick * 0.8);
    line(dim, base, add(add(base, B.v, (t % 2 ? 0.95 : 0.55) * thick), B.d, -0.55 * thick), { tone: 0.82, spd: -0.55, n: 14, life: life * 0.62, thick: 0.75 });
  }
  if (!ok(H.c)) return;
  const hd = headDir(path(t - 1), path(t + 1));
  // 머리: 채움(입체) + 윤곽선
  pt(dim, "cr_headfill", H.c, { ...hd, n: 300, life: 0.1, scale: sc });
  pt(dim, "cr_head", H.c, { ...hd, n: 300, life: 0.1, scale: sc });
  // 빛나는 눈 + 머리 주변 기운
  for (const s of [-1, 1]) glow(dim, headPt(H.c, hd, 1.02, 0.6, 0.44 * s, sc), { size: 0.32, tone: 0.1, n: 2 });
  if (t % 2 === 0) glow(dim, headPt(H.c, hd, 0.6, 0.3, 0, sc), { size: 2.4, tone: 1, r: 0.6, n: 2, life: 0.15 });
  // 수염: 코끝에서 뒤로 흐르며 물결침
  for (const s of [-1, 1]) {
    let q = headPt(H.c, hd, 2.25, 0.02, 0.25 * s, sc);
    for (let k = 1; k <= 4; k++) {
      const F = frame(path, t - k * 0.8);
      const w = Math.sin(t * 0.45 + k * 0.9 + s) * 0.35 * (k / 4);
      const nq = add(add(add(F.c, F.u, s * (0.7 + k * 0.24 + w)), F.v, -0.25 - k * 0.1 + Math.cos(t * 0.4 + k) * 0.25 * (k / 4)), F.d, 1.2);
      if (ok(nq)) line(dim, q, nq, { tone: 0.08, spd: 0.15, n: 13, thick: 0.35, size: 0.8 });
      q = nq;
    }
  }
  // 갈기: 목 뒤로 흰 물결 갈기 (좌·중·우) — 2틱마다 (파티클 수 절약)
  const LL = 0.16;
  if (t % 2 === 0) for (let k = 0; k < 4; k++) {
    const F = frame(path, t - 0.5 - k * 0.7);
    if (!ok(F.c)) continue;
    for (const s of [-1, 0, 1]) {
      const base = add(add(F.c, F.v, thick * 0.65), F.u, s * thick * 0.45);
      const dir = mix([F.v, 0.6], [F.d, -0.85], [F.u, s * 0.45]);
      line(dim, base, add(base, dir, (1.35 - k * 0.22) * (s ? 0.85 : 1)), { bend: F.u, h: Math.sin(t * 0.6 + k + s) * 0.25, tone: 0.04, spd: 0.25, n: 12, thick: 0.7, life: LL });
    }
  }
  // 네 다리: 앞다리(머리 뒤) / 뒷다리(몸 중간), 걷듯이 앞뒤로 휘저음, 흰 발톱 세 개
  if (t % 2 === 1) for (const [lag, ph] of [[4.5, 0], [17, Math.PI]]) {
    const F = frame(path, t - lag);
    if (!ok(F.c)) continue;
    for (const s of [-1, 1]) {
      const sw = Math.sin(t * 0.4 + ph + (s > 0 ? 0 : Math.PI)) * 0.55;
      const hip = add(add(F.c, F.u, s * thick * 0.72), F.v, -thick * 0.45);
      const knee = add(hip, mix([F.v, -0.75], [F.u, s * 0.4], [F.d, 0.25 + sw]), 1.05 * thick);
      const foot = add(knee, mix([F.v, -0.35], [F.d, 0.9 - sw * 0.5]), 0.75 * thick);
      line(dim, hip, knee, { tone: 0.62, n: 14, thick: 0.35, size: 1.5, life: LL });
      line(dim, knee, foot, { tone: 0.5, n: 10, thick: 0.4, size: 1.2, life: LL });
      for (let k = -1; k <= 1; k++) line(dim, foot, add(foot, mix([F.d, 0.65], [F.v, -0.6], [F.u, k * 0.55]), 0.42 * thick), { bend: F.v, h: -0.08, tone: 0.0, n: 6, thick: 0.8, life: LL });
    }
  }
  // 꼬리 끝 지느러미 (몸통이 사라지는 쪽)
  if (t > 30 && t % 2 === 0) {
    const F = frame(path, t - 30);
    if (ok(F.c)) for (let k = -2; k <= 2; k++) {
      const dir = mix([F.d, -1], [F.v, k * 0.32], [F.u, Math.sin(t * 0.5 + k) * 0.35]);
      line(dim, F.c, add(F.c, dir, 1.7 - Math.abs(k) * 0.2), { bend: F.u, h: Math.sin(t * 0.5) * 0.3, tone: 0.1, spd: 0.2, n: 14, thick: 0.6, life: LL });
    }
  }
}
const ease = (s) => s * s * (3 - 2 * s);

/** 파도: c 에서 바깥으로 밀려가는 물결 (dirDeg 방향 중심으로 폭 widthDeg, 360 이면 둥근 해일)
 *  파티클은 한 번만 뿌리고 스스로 밀려감. 판정은 2틱마다 반지름을 따라가며 한 번씩 (밀어내기 + 피해) */
function wave(ctx, hit, c, o = {}) {
  const dim = ctx.p.dimension, spd = o.spd ?? 14, life = o.life ?? 1, r0 = o.r ?? 1.5, W = o.width ?? 360, D = o.dir ?? 0;
  pt(dim, "cr_wave", up(c, 0.1), { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, a0: D - W / 2, a1: D + W / 2, r: r0, spd, h: o.h ?? 2.4, thick: o.curl ?? 0.9, life, n: o.n ?? Math.round(W * 1.6 + 80), size: o.size ?? 1.3 });
  if (o.foam !== false) pt(dim, "cr_wave", up(c, 0.1), { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, a0: D - W / 2, a1: D + W / 2, r: r0 - 0.6, spd: spd * 0.85, h: (o.h ?? 2.4) * 0.5, thick: 0.3, life: life * 0.9, n: Math.round(W * 0.6 + 30), size: (o.size ?? 1.3) * 0.8 });
  if (!hit) return;
  const done = new Set(), ticks = Math.ceil(life * 20);
  for (let t = 0; t <= ticks; t += 2) later(t + 1, () => {
    const rr = r0 + (spd * t) / 20;
    for (const e of M.around(dim, c, rr + 2)) {
      if (done.has(e.id)) continue;
      const dx = e.location.x - c.x, dz = e.location.z - c.z, d = Math.hypot(dx, dz);
      if (Math.abs(d - rr) > 1.6) continue;
      if (W < 360) { let a = (Math.atan2(dz, dx) * 180) / Math.PI - D; a = ((a % 360) + 540) % 360 - 180; if (Math.abs(a) > W / 2 + 8) continue; }
      done.add(e.id);
      hit(e, o.mul ?? 0.5);
      M.toss(c, e, o.push ?? 5, 2.5);
    }
  });
}
// ③ 청룡 강림: 거대한 먹구름 → 청룡이 구름 위에서 나타나 구름을 뚫고 내려와 아래를 한 바퀴
//   → 처음 버전처럼 S자로 꿈틀대며 땅까지 떨어짐 → 주변 몹 위로 진짜 번개
function dragon(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.anim(p, "raise");
  M.potion(p, "resistance", 5, 9);
  M.potion(p, "fire_resistance", 1, 12);
  const yaw0 = yawOf(p), o = { ...p.location }, f = fwdOf(yaw0);
  const side = { x: Math.cos((yaw0 * Math.PI) / 180), y: 0, z: Math.sin((yaw0 * Math.PI) / 180) };
  const G = { x: o.x + f.x * 9, y: o.y, z: o.z + f.z * 9 }; // 떨어질 곳
  const C = { x: o.x + f.x * 4, y: o.y + 16, z: o.z + f.z * 4 }; // 구름 중심
  const R = 8;
  // 거대한 먹구름 (훨씬 크게: 가운데 큰 덩어리 + 둘레 여섯 덩어리 + 위로 부푼 덩어리)
  pt(dim, "cr_cloud", C, { r: 22, life: 8.5 });
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; later(3 + k, () => pt(dim, "cr_cloud", { x: C.x + Math.cos(a) * 17, y: C.y + 1 + (k % 2) * 1.2, z: C.z + Math.sin(a) * 17 }, { r: 11, life: 8 })); }
  later(8, () => pt(dim, "cr_cloud", up(C, 3), { r: 16, life: 7.5 }));
  later(12, () => pt(dim, "cr_cloud", up(C, -1.5), { r: 13, life: 7 }));
  for (let i = 0; i < 4; i++) later(i * 25, () => M.sound(p, "ambient.weather.thunder", 0.5 + i * 0.05, 0.7));
  const a0 = Math.atan2(o.z - C.z, o.x - C.x) + Math.PI; // 플레이어 반대쪽 구름 위에서 등장
  const ring = (ang, s) => ({ x: C.x + Math.cos(ang) * R, y: C.y - 3 - Math.sin(s * Math.PI * 4) * 0.8, z: C.z + Math.sin(ang) * R });
  // A 구름 위 등장 → 구름 아래 진입 / B 한 바퀴 / C 위로 솟아 구름 속으로 / H 구름 위에서 잠깐 사라짐 / D 급강하
  const TA = 28, TB = 54, TC = 20, TH = 8, TD = 26;
  // 3차 베지어 (접선이 이어지게 조절점을 둠)
  const bez3 = (A, B, C2, D, s) => {
    const m = 1 - s, a = m * m * m, b = 3 * m * m * s, c = 3 * m * s * s, d = s * s * s;
    return { x: a * A.x + b * B.x + c * C2.x + d * D.x, y: a * A.y + b * B.y + c * C2.y + d * D.y, z: a * A.z + b * B.z + c * C2.z + d * D.z };
  };
  const tan = (ang) => ({ x: -Math.sin(ang), z: Math.cos(ang) }); // 고리 진행 방향
  const ringStart = ring(a0, 0), ringEnd = ring(a0, 1), t0 = tan(a0);
  const top = { x: C.x + Math.cos(a0) * R * 0.9 - t0.x * R * 0.8, y: C.y + 9, z: C.z + Math.sin(a0) * R * 0.9 - t0.z * R * 0.8 };
  const A1 = { x: top.x, y: C.y + 2, z: top.z }; // 구름을 뚫고 곧게 내려오다가
  const A2 = { x: ringStart.x - t0.x * 6, y: ringStart.y + 0.6, z: ringStart.z - t0.z * 6 }; // 고리 방향으로 부드럽게 꺾임
  const B = { x: G.x, y: G.y - 2.5, z: G.z };
  // 솟구칠 꼭대기: 구름 위, 떨어질 곳 바로 위쪽 (꼭대기에서 진행 방향 = 떨어질 곳 쪽 수평)
  const apex = { x: C.x + (G.x - C.x) * 0.3, y: C.y + 8, z: C.z + (G.z - C.z) * 0.3 };
  const toG = norm({ x: G.x - ringEnd.x, y: 0, z: G.z - ringEnd.z });
  const C1 = { x: ringEnd.x + t0.x * 7, y: ringEnd.y - 1.2, z: ringEnd.z + t0.z * 7 }; // 고리에서 미끄러져 나오며
  const C2 = { x: apex.x - toG.x * 6, y: apex.y - 1, z: apex.z - toG.z * 6 }; // 위로 휘어 올라 꼭대기에서 수평
  const D1 = { x: apex.x + toG.x * 7, y: apex.y - 0.5, z: apex.z + toG.z * 7 }; // 꼭대기에서 고개를 돌려
  const D2 = { x: B.x, y: B.y + 16, z: B.z }; // 수직에 가깝게 내리꽂음
  const T1 = TA + TB, T2 = T1 + TC, T3 = T2 + TH;
  const path = (t) => {
    t = Math.max(0, t);
    if (t <= TA) { const u = t / TA; return bez3(top, A1, A2, ringStart, (u * u + u) / 2); } // 끝으로 갈수록 빨라져 고리 속도와 맞춤
    if (t <= T1) return ring(a0 + ((t - TA) / TB) * Math.PI * 2, (t - TA) / TB); // 구름 아래 한 바퀴
    if (t <= T2) { const u = (t - T1) / TC; return bez3(ringEnd, C1, C2, apex, u * 0.88 + u * u * 0.12); } // 고리 속도 그대로 솟구침
    if (t <= T3) { const u = (t - T2) / TH; return { x: apex.x + toG.x * u * 1.2, y: apex.y + Math.sin(u * Math.PI) * 1.2, z: apex.z + toG.z * u * 1.2 }; } // 구름 위에서 숨 고르기
    const u = Math.min(1, (t - T3) / TD);
    const st = { x: apex.x + toG.x * 1.2, y: apex.y, z: apex.z + toG.z * 1.2 };
    const q = bez3(st, D1, D2, B, u * u * 0.55 + u * 0.45); // 점점 빨라지는 급강하
    const sw = 2.6 * Math.sin(u * Math.PI * 2) * Math.sin(u * Math.PI) * Math.min(1, u * 2.5); // S자 꿈틀 (시작·끝 0)
    return { x: q.x + side.x * sw, y: q.y, z: q.z + side.z * sw };
  };
  const hidden = (t) => t > T2 - 3 && t <= T3 + 2; // 구름 위로 사라진 동안은 안 그림
  const T = T3 + TD;
  // ── 분위기: 비, 구름 속 번개, 회오리 ──
  pt(dim, "cr_rain", up(C, -2.5), { r: 13, n: 130, life: (T + 20) / 20 });
  pt(dim, "cr_rain", up(C, -2), { r: 22, n: 140, life: (T + 20) / 20 }); // 구름이 커진 만큼 넓게 한 겹 더
  pt(dim, "cr_snowfall", up(C, -2), { r: 20, n: 90, life: (T + 30) / 20 });
  // 땅의 진(陣): 구름 아래 바닥에 세 겹 물결 고리가 서로 반대로 돌고, 고리 사이에 끊어진 호 여섯 개 (현무처럼, 1초마다 다시 그림)
  const Gc = { x: C.x, y: o.y + 0.12, z: C.z };
  for (let t = 0; t < T + 60; t += 20) later(t, () => {
    pt(dim, "cr_ring", Gc, { r: 13, h: 0.1, dots: 90, spin: 50, tone: 0.35, life: 1.05 });
    pt(dim, "cr_ring", Gc, { r: 9, h: 0.1, dots: 64, spin: -80, tone: 0.55, life: 1.05 });
    pt(dim, "cr_ring", Gc, { r: 5, h: 0.1, dots: 40, spin: 130, tone: 0.75, life: 1.05 });
    if (t % 40 === 0) for (let k = 0; k < 6; k++) pt(dim, "cr_arc", Gc, { yaw: 0, a0: k * 60 + t, a1: k * 60 + 38 + t, r: 11, thick: 0.4, h: 0.1, dur: 0.3, n: 50 });
    pt(dim, "cr_ring", up(Gc, 0.1), { r: 16, h: 0.1, dots: 70, spin: -30, tone: 0.2, life: 1.05 }); // 가장 바깥 고리
    // 진의 여섯 꼭짓점에서 하늘로 빛기둥 (번갈아)
    for (let k = t / 20 % 2; k < 6; k += 2) { const a = (k / 6) * Math.PI * 2 + t * 0.01, q = { x: Gc.x + Math.cos(a) * 13, y: o.y, z: Gc.z + Math.sin(a) * 13 }; pt(dim, "cr_pillar", q, { r: 0.6, h: 2.5, n: 70, life: 0.9 }); cluster(dim, up(q, 1), { n: 6, r: 0.4, spd: 2, tone: 0.8 }); }
  });
  // 구름에서 진 한가운데로 내려오는 물 회오리 (두 겹, 서로 반대로)
  later(10, () => { pt(dim, "cr_spiral", { x: C.x, y: o.y, z: C.z }, { r: 2.8, h: 15, n: 150, spin: 300, life: (T - 10) / 20 }); pt(dim, "cr_spiral", { x: C.x, y: o.y, z: C.z }, { r: 4.2, h: 14, n: 110, spin: -220, life: (T - 10) / 20 }); });
  // 하늘 번쩍임 + 구름 아래 물방울 별빛
  for (let t = 6; t < T; t += 14) later(t, () => { flash(dim, { x: C.x + (Math.random() - 0.5) * 30, y: C.y + 1, z: C.z + (Math.random() - 0.5) * 30 }, 8); snow(dim, up(C, -4), 10, 12); });
  // 구름에서 땅의 진 둘레로 떨어지는 번개 (연출만, 넷)
  for (const [dt, ang] of [[18, 0.8], [40, 2.9], [62, 4.4], [84, 5.7]]) later(dt, () => {
    const g2 = { x: C.x + Math.cos(ang) * 13, y: o.y, z: C.z + Math.sin(ang) * 13 };
    vfxBolt(dim, { x: g2.x * 0.7 + C.x * 0.3, y: C.y - 1, z: g2.z * 0.7 + C.z * 0.3 }, g2, 0.35);
    flash(dim, up(g2, 1), 4);
    pt(dim, "cr_shock", up(g2, 0.1), { n: 60, spd: 7, tone: 0.2 });
    M.sound(p, "ambient.weather.thunder", 0.5, 1.4);
  });
  for (let i = 0; i * 6 < T3 + 6; i++) {
    later(3 + i * 6 + Math.floor(Math.random() * 4), () => {
      const r1 = Math.random() * Math.PI * 2, r2 = r1 + 1.5 + Math.random() * 2;
      const q1 = { x: C.x + Math.cos(r1) * (4 + Math.random() * 9), y: C.y + (Math.random() - 0.5) * 2, z: C.z + Math.sin(r1) * (4 + Math.random() * 9) };
      const q2 = { x: C.x + Math.cos(r2) * (4 + Math.random() * 9), y: C.y + (Math.random() - 0.5) * 2, z: C.z + Math.sin(r2) * (4 + Math.random() * 9) };
      vfxBolt(dim, q1, q2, 0.3);
      flash(dim, q1, 5);
      if (i % 2) M.sound(p, "ambient.weather.thunder", 0.6, 1.3);
    });
  }
  later(TA, () => {
    pt(dim, "cr_spiral", { x: C.x, y: o.y, z: C.z }, { r: 5.5, h: 13, n: 170, spin: 240, life: TB / 20 });
    M.sound(p, "elytra.loop", 1, 0.6);
  });
  later(1, () => { glow(dim, top, { size: 6, tone: 0.9, r: 1, n: 4, life: 0.5 }); M.sound(p, "mob.enderdragon.growl", 1.3, 0.8); shake(dim, o, 0.25, 0.8); });
  let landed = false;
  for (let t = 1; t <= T; t++) {
    later(t, () => {
      const cur = path(t);
      const s = t / T;
      const thick = 1.05 * Math.min(1, 0.35 + s * 3);
      if (t === T2) { flash(dim, up(C, 3), 6); M.sound(p, "ambient.weather.thunder", 1, 1.2); } // 구름 속 번쩍
      if (t === T3 + 1) { M.sound(p, "mob.enderdragon.growl", 1.4, 0.9); shake(dim, o, 0.35, 1); glow(dim, cur, { size: 7, tone: 0.9, r: 1, n: 4, life: 0.4 }); }
      if (hidden(t)) return;
      drawDragon(dim, path, t, { thick, life: t > T3 ? 1.2 : 1.7, ground: o.y - 0.5 });
      // 꾸미기: 용 몸을 감싸며 도는 나선 연기 두 가닥
      { const F = frame(path, t - 1.5);
        for (const k of [0, Math.PI]) {
          const th = t * 0.55 + k, q = add(add(F.c, F.u, Math.cos(th) * thick * 2.3), F.v, Math.sin(th) * thick * 2.3);
          if (q.y > o.y) pt(dim, "cr_smoke", q, { n: 2, r: 0.15, size: 1, life: 1.6 });
        } }
      // 급강하: 몸을 스치는 바람 줄기
      if (t > T3 && cur.y > o.y) {
        const F = frame(path, t);
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * Math.PI * 2, st = add(add(F.c, F.u, Math.cos(a) * 2.2), F.v, Math.sin(a) * 2.2);
          line(dim, st, add(st, F.d, -3.5), { tone: 0.02, n: 10, thick: 0.9, size: 0.6, life: 0.1 });
        }
      }
      if (t % 3 === 0) snow(dim, cur, 3, 2);
      cluster(dim, cur, { n: 8, r: 0.5, spd: 1.8, tone: 0.5 });
      for (const e of M.around(dim, cur, 3)) hit(e, 0.5);
      if (t % 10 === 0) M.sound(p, "bucket.empty_water", 0.6 + s * 0.6, 0.7);
      // 땅에 닿는 순간: 충격파 · 물기둥 · 갈라짐 · 화면 흔들림
      if (!landed && t > T3 && cur.y <= o.y + 0.5) {
        landed = true;
        const g1 = up(G, 0.15);
        flash(dim, up(G, 1), 7);
        pt(dim, "cr_shock", g1, { n: 240, spd: 17, tone: 0.15 });
        later(3, () => pt(dim, "cr_shock", g1, { n: 170, spd: 10, tone: 0.45 }));
        pt(dim, "cr_column", G, { r: 1.4, n: 280, spd: 17 });
        pt(dim, "cr_pillar", G, { r: 1.6, h: 3, n: 220, life: 1.6 }); // 하늘로 솟는 빛기둥
        snow(dim, up(G, 3), 30, 6);
        later(4, () => pt(dim, "cr_column", G, { r: 2.6, n: 160, spd: 10 }));
        for (let k = 0; k < 11; k++) {
          const a = (k / 11) * Math.PI * 2 + Math.random() * 0.3, dir = { x: Math.cos(a), y: 0, z: Math.sin(a) };
          const mid = add(g1, dir, 1.6 + Math.random() * 1.5);
          line(dim, add(g1, dir, 0.6), mid, { tone: 0.97, n: 26, thick: 0.3, life: 3, size: 1.3 });
          line(dim, mid, add(add(mid, dir, 1.5 + Math.random() * 2), { x: -dir.z, y: 0, z: dir.x }, (Math.random() - 0.5) * 1.4), { tone: 0.97, n: 22, thick: 0.6, life: 3, size: 1.1 });
        }
        pt(dim, "cr_ring", G, { r: 4.5, h: 0.2, dots: 52, spin: 220, tone: 0.5, life: 1.3 });
        pt(dim, "cr_arc", G, { yaw: 0, a0: 0, a1: 360, r: 3.4, thick: 1, h: 0.3, dur: 0.25, n: 280 });
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          cluster(dim, { x: G.x + Math.cos(a) * 2.2, y: G.y + 1 + Math.random(), z: G.z + Math.sin(a) * 2.2 }, { n: 20, r: 0.5, spd: 4.5, tone: k % 3 ? 0.4 : 0.8 });
        }
        for (const e of M.around(dim, G, 5)) { hit(e, 1.6); M.toss(G, e, 3, 5); }
        // 더 화려하게: 둘레 여덟 물기둥이 차례로 솟고, 큰 물결 고리 두 겹이 퍼짐
        for (let k = 0; k < 8; k++) later(2 + k, () => { const a = (k / 8) * Math.PI * 2, q = { x: G.x + Math.cos(a) * 5.5, y: G.y, z: G.z + Math.sin(a) * 5.5 }; pt(dim, "cr_column", q, { r: 0.8, n: 90, spd: 12 }); snow(dim, up(q, 2), 6, 2); });
        later(5, () => { pt(dim, "cr_ring", G, { r: 9, h: 0.3, dots: 80, spin: -200, tone: 0.3, life: 1.4 }); pt(dim, "cr_shock", g1, { n: 200, spd: 22, tone: 0.3 }); });
        // 파괴: 청룡이 땅속으로 박히는 순간 큰 폭발 + 낙뢰 세 줄기 + 둘레 연쇄 폭발 + 바위 파편이 사방으로 튐
        try { dim.spawnParticle("minecraft:huge_explosion_emitter", up(G, 1)); } catch {}
        pt(dim, "hm_rock", G, { n: 50, r: 2, spd: 12, size: 1.3, life: 1.6, tone: 0 });
        for (const [dt, ang] of [[0, 0.5], [2, 2.6], [4, 4.7]]) later(dt, () => { const at = { x: G.x + Math.cos(ang) * 2.5, y: G.y, z: G.z + Math.sin(ang) * 2.5 }; try { dim.spawnEntity("minecraft:lightning_bolt", at); } catch {} vfxBolt(dim, up(at, 16), up(at, 0.3), 0.35); });
        for (let k = 0; k < 8; k++) later(3 + k * 2, () => {
          const a = (k / 8) * Math.PI * 2 + 0.4, r = 3.5 + (k % 2) * 2.5, q = { x: G.x + Math.cos(a) * r, y: G.y + 0.5, z: G.z + Math.sin(a) * r };
          try { dim.spawnParticle("minecraft:large_explosion", q); } catch {}
          pt(dim, "hm_rock", q, { n: 12, r: 0.6, spd: 8, size: 1.1, life: 1.3, tone: 0 });
          cluster(dim, q, { n: 10, r: 0.5, spd: 4, tone: 0.3 });
          if (k % 2 === 0) M.sound(p, "random.explode", 0.8, 0.9 + k * 0.05);
        });
        // 파도: 둥근 해일 두 번 + 여덟 방향으로 갈라져 밀려가는 큰 파도 (현무 쉬쉬의 돌가시처럼 사방으로)
        wave(ctx, hit, G, { r: 2, spd: 15, h: 3, life: 1, n: 700, mul: 0.6, push: 7 });
        later(6, () => wave(ctx, hit, G, { r: 1.5, spd: 10, h: 1.8, life: 0.9, n: 450, size: 1.1, foam: false }));
        for (let k = 0; k < 8; k++) later(10 + (k % 2) * 3, () => wave(ctx, hit, G, { dir: k * 45 + 22, width: 32, r: 3, spd: 17, h: 3.4, curl: 1.3, life: 1.15, n: 150, mul: 0.5, push: 8 }));
        later(10, () => M.sound(p, "random.splash", 1.2, 0.5));
        // 해일: 물결 충격파가 세 번 더 퍼지고, 한가운데서 거대한 물기둥이 두 번 치솟음
        for (const [dt, spd, tone] of [[8, 14, 0.6], [12, 26, 0.2], [16, 34, 0.45]]) later(dt, () => pt(dim, "cr_shock", g1, { n: 180, spd, tone }));
        for (const dt of [6, 14]) later(dt, () => { pt(dim, "cr_column", G, { r: 2, n: 260, spd: 22 }); pt(dim, "cr_pillar", G, { r: 2.4, h: 4, n: 200, life: 1.4 }); flash(dim, up(G, 4), 8); M.sound(p, "random.splash", 1, 0.6); });
        later(10, () => { for (let k = 0; k < 6; k++) pt(dim, "cr_arc", G, { yaw: 0, a0: k * 60, a1: k * 60 + 40, r: 7, thick: 0.6, h: 0.2, dur: 0.2, n: 70 }); });
        shake(dim, G, 0.9, 1.1);
        M.sound(p, "random.splash", 0.7);
        M.sound(p, "random.explode", 1.2, 0.6);
      }
    });
  }
  // 급강하 중에도 떨어질 곳 주변으로 번개 세 줄기
  for (const [dt, ang] of [[8, 0.4], [14, 2.6], [20, 4.6]]) later(T3 + dt, () => {
    const at = { x: G.x + Math.cos(ang) * 6, y: G.y, z: G.z + Math.sin(ang) * 6 };
    try { dim.spawnEntity("minecraft:lightning_bolt", at); } catch {}
    pt(dim, "cr_pillar", at, { r: 0.8, h: 2, n: 100, life: 0.5 });
  });
  // 번개 구간: 주변 사람·몹 구속 + 몹 위로, 그리고 주변 곳곳에 진짜 번개 (3틱 간격)
  later(T + 4, () => {
    const mobs = M.around(dim, G, 14).filter((e) => Math.hypot(e.location.x - p.location.x, e.location.z - p.location.z) > 3).slice(0, 10);
    const spots = [];
    const rnd = Array.from({ length: 9 }, (_, i) => { const a = i * 2.4 + Math.random(), r = 3 + Math.random() * 9; return { location: { x: G.x + Math.cos(a) * r, y: G.y, z: G.z + Math.sin(a) * r } }; });
    for (let i = 0; i < Math.max(mobs.length, rnd.length); i++) { if (mobs[i]) spots.push(mobs[i]); if (rnd[i]) spots.push(rnd[i]); }
    const dur = spots.length * 3 + 14; // 틱
    bind(ctx, G, 14, dur);
    spots.forEach((e, i) => later(i * 3, () => {
      const at = e.isValid?.() === false ? null : { ...e.location };
      if (!at) return;
      try { dim.spawnEntity("minecraft:lightning_bolt", at); } catch {}
      shake(dim, at, 0.4, 0.4);
      pt(dim, "cr_pillar", at, { r: 0.8, h: 2, n: 120, life: 0.6 });
      pt(dim, "cr_shock", up(at, 0.1), { n: 90, spd: 9, tone: 0.1 });
      pt(dim, "cr_ring", up(at, 0.1), { r: 2.2, h: 0.2, dots: 30, spin: 260, tone: 0.4, life: 0.8 });
      pt(dim, "cr_column", at, { r: 0.6, n: 60, spd: 10 });
      vfxBolt(dim, up(at, 14), up(at, 0.5), 0.3);
      wave(ctx, null, at, { r: 0.6, spd: 8, h: 1.2, life: 0.6, n: 160, size: 0.9, foam: false });
      try { dim.spawnParticle("minecraft:large_explosion", up(at, 0.5)); } catch {} // 낙뢰가 떨어진 자리가 터지며 파편이 튐
      pt(dim, "hm_rock", at, { n: 14, r: 0.7, spd: 9, size: 1.1, life: 1.3, tone: 0 });
      cluster(dim, up(at, 0.5), { n: 18, r: 0.6, spd: 3.5, tone: 0.2 });
      snow(dim, up(at, 1.5), 5, 2);
      if (e.id) hit(e, 2);
    }));
  });
}
/** 구속: 반경 r 안의 다른 플레이어와 몹을 dur 틱 동안 묶어 둠 (발밑 고리 + 움직임 정지) */
function bind(ctx, c, r, dur) {
  const { p } = ctx, dim = p.dimension;
  let list = [];
  try {
    list = dim.getEntities({ location: c, maxDistance: r, excludeTypes: ["minecraft:item", "minecraft:xp_orb", "rpg:npc", "minecraft:armor_stand"], excludeFamilies: ["inanimate"] })
      .filter((e) => e.id !== p.id && WR.canHit(p, e));
  } catch {}
  for (const e of list) {
    M.potion(e, "slowness", 255, dur / 20);
    M.potion(e, "weakness", 3, dur / 20);
    try { e.onScreenDisplay?.setActionBar("§b§l청룡의 번개에 구속되었다!"); } catch {}
  }
  for (let t = 0; t < dur; t += 2) later(t + 1, () => {
    for (const e of list) {
      if (!e.isValid()) continue;
      try { e.typeId === "minecraft:player" ? e.applyKnockback(0, 0, 0, 0) : e.clearVelocity(); } catch {}
      if (t % 10 === 0) {
        pt(dim, "cr_ring", up(e.location, 0.1), { r: 0.9, h: 0, dots: 16, spin: 300, tone: 0.3, life: 0.5 });
        pt(dim, "cr_ring", up(e.location, 1.1), { r: 0.7, h: 0, dots: 12, spin: -300, tone: 0.15, life: 0.5, tiltx: 0.3 });
      }
    }
  });
}

// ④ 청룡 · 천룡추 (쉬프트 두 번)
//   번개 기운을 두르고 → 일직선 번개 돌진(뇌섬) → 큰 대각 베기 두 번 → 한 바퀴 베기 → 올려 베기
//   → 날아가는 검기 · 솟구침 · 옆에 나란히 나타난 청룡과 함께 내리꽂기 → 번개
/** 몸에 두르는 번개: 몸 주변에 짧게 튀는 전기 */
function bodyVolts(dim, at, k = 3, r = 1.1) {
  for (let i = 0; i < k; i++) {
    const a = Math.random() * Math.PI * 2, h = 0.2 + Math.random() * 1.6;
    const s0 = { x: at.x + Math.cos(a) * r * 0.5, y: at.y + h, z: at.z + Math.sin(a) * r * 0.5 };
    const s1 = { x: at.x + Math.cos(a + 0.9) * r * 1.2, y: at.y + h + (Math.random() - 0.5) * 1.2, z: at.z + Math.sin(a + 0.9) * r * 1.2 };
    volt(dim, s0, s1, { amp: 0.35, size: 0.7, life: 0.12, branch: 0 });
  }
}
/** 연출 카메라: 마크 자유 시점 (실패하면 명령어로) */
function cam(p, pos, look, ease = 0.3, type = "InOutSine") {
  try {
    p.camera.setCamera("minecraft:free", { location: pos, facingLocation: look, easeOptions: { easeTime: ease, easeType: type } });
  } catch {
    const f = (v) => v.toFixed(2), cmdType = type.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
    try { p.runCommand(`camera @s set minecraft:free ease ${ease} ${cmdType} pos ${f(pos.x)} ${f(pos.y)} ${f(pos.z)} facing ${f(look.x)} ${f(look.y)} ${f(look.z)}`); } catch {}
  }
}
function camClear(p) { try { p.camera.clear(); } catch { try { p.runCommand("camera @s clear"); } catch {} } }
function camFlash(p, r = 1, g = 1, b = 1) {
  try { p.camera.fade({ fadeTime: { fadeInTime: 0.04, holdTime: 0.04, fadeOutTime: 0.35 }, fadeColor: { red: r, green: g, blue: b } }); } catch {
    try { p.runCommand(`camera @s fade time 0.04 0.04 0.35 color ${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}`); } catch {}
  }
}

/**
 * 뇌섬: 번개처럼 일직선으로 순간 돌진 (막히면 그 앞에서 멈춤)
 *  지나가는 순간엔 번개·섬광만, 한 박자 뒤에 지나간 줄의 적이 한꺼번에 베임 (발도술 느낌)
 */
function flashDash(ctx, hit, dist = 22) {
  const { p } = ctx, dim = p.dimension;
  const yw = yawOf(p), rot = p.getRotation(), f = fwdOf(yw), o = { ...p.location };
  let reach = 0;
  for (let d = 0.5; d <= dist; d += 0.5) {
    const q = { x: o.x + f.x * d, y: o.y, z: o.z + f.z * d };
    let ok = true;
    for (const dy of [0.2, 1.4]) {
      try { const bl = dim.getBlock({ x: Math.floor(q.x), y: Math.floor(q.y + dy), z: Math.floor(q.z) }); if (bl && !bl.isAir && !bl.isLiquid && bl.isSolid !== false) ok = false; } catch {}
    }
    if (!ok) break;
    reach = d;
  }
  const end = { x: o.x + f.x * reach, y: o.y, z: o.z + f.z * reach }, path = sub(end, o);
  const right = { x: -Math.cos((yw * Math.PI) / 180), y: 0, z: -Math.sin((yw * Math.PI) / 180) };
  const at = (q) => add(o, path, q);
  M.anim(p, "iai_dash");
  camFlash(p, 0.85, 0.95, 1);
  M.sound(p, "ambient.weather.lightning.impact", 1.6, 1.5);
  M.sound(p, "item.trident.thunder", 1.2, 1.3);
  // 출발점: 바닥이 터지듯 흙먼지 고리 + 번개 튐
  pt(dim, "cr_shock", up(o, 0.15), { n: 110, spd: 10, tone: 0.1 });
  pt(dim, "cr_dust", up(o, 0.3), { n: 16, r: 0.8, spd: 4, size: 1.6, life: 1.8 });
  for (let i = 0; i < 4; i++) { const a = Math.random() * 6.28; volt(dim, up(o, 0.2), { x: o.x + Math.cos(a) * 2.5, y: o.y + Math.random() * 1.2, z: o.z + Math.sin(a) * 2.5 }, { amp: 0.6, size: 0.9, life: 0.2 }); }
  // 더 화려하게: 지나간 길에 세로로 선 검기 초승달이 차례로 남았다 사라짐
  for (let k = 1; k <= 5; k++) later(k, () => { const q = at(k / 5.5); slash(dim, up(q, 1.1), yw, { tilt: 90, dir: k % 2 ? 1 : -1, r: 2, thick: 0.6, n: 110, dur: 0.04, life: 0.7, size: 1.1 }); });
  // 4틱에 걸쳐 순간이동
  const STEPS = 4;
  for (let i = 1; i <= STEPS; i++) later(i, () => {
    const q = at(i / STEPS);
    try { p.teleport(q, { rotation: rot, keepVelocity: false }); } catch {}
    bodyVolts(dim, q, 3, 1.3);
  });
  // 일직선 섬광 두 줄 (가슴 높이 굵은 줄 + 발밑 가는 줄)
  later(1, () => {
    volt(dim, up(o, 1.1), up(end, 1.1), { amp: 0.06, size: 1.7, life: 0.45, branch: 0, thick: 2 });
    volt(dim, up(o, 0.25), up(end, 0.25), { amp: 0.15, size: 1, life: 0.4, branch: 0 });
  });
  // 바닥을 기는 번개: 지나간 뒤에도 1초 동안 계속 튀며 잦아듦
  for (let w = 0; w < 7; w++) later(1 + w * 3, () => {
    const k = w < 2 ? 7 : 4 - Math.floor(w / 3);
    for (let i = 0; i < k; i++) {
      const q0 = Math.random() * 0.8, q1 = Math.min(1, q0 + 0.12 + Math.random() * 0.3);
      const s0 = add(at(q0), right, (Math.random() - 0.5) * 3), s1 = add(at(q1), right, (Math.random() - 0.5) * 7.5);
      volt(dim, up(s0, 0.1 + Math.random() * 0.4), up(s1, 0.1 + Math.random() * 1.1), { amp: 1.1, size: w < 2 ? 1.2 : 0.9, life: 0.3, branch: 3 });
    }
  });
  // 지나가는 순간 길 양옆으로 크게 뻗는 번개
  for (let i = 1; i <= STEPS; i++) later(i, () => {
    for (const sgn of [-1, 1]) {
      const c = at((i - 0.5) / STEPS), tip = add(add(c, right, sgn * (3 + Math.random() * 3.5)), f, (Math.random() - 0.3) * 3);
      volt(dim, up(c, 0.6 + Math.random() * 0.6), up(tip, Math.random() * 2.2), { amp: 1, size: 1.1, life: 0.3, branch: 3 });
    }
  });
  // 흙먼지 연기 줄 + 바닥 그을음 선
  const L = Math.max(1, reach);
  for (let k = 0; k <= L; k += 1.1) {
    const c = add(o, f, k);
    later(1 + Math.floor((k / L) * STEPS), () => {
      pt(dim, "cr_dust", up(c, 0.3), { n: 6, r: 0.7, spd: 2.8, size: 1.5, life: 2 });
      if (Math.random() < 0.35) cluster(dim, up(c, 0.4), { n: 6, r: 0.4, spd: 2, tone: 0.1 });
    });
  }
  later(2, () => line(dim, up(o, 0.06), up(end, 0.06), { tone: 0.97, n: Math.round(L * 14), thick: 0.2, life: 2.4, size: 1.4 }));
  // 도착: 흙먼지 크게 + 번개 사방으로
  later(STEPS + 1, () => {
    pt(dim, "cr_dust", up(end, 0.4), { n: 26, r: 1.3, spd: 4.5, size: 1.9, life: 2 });
    pt(dim, "cr_shock", up(end, 0.15), { n: 140, spd: 12, tone: 0.15 });
    flash(dim, up(end, 1), 3.5);
    for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28; volt(dim, up(end, 0.3), { x: end.x + Math.cos(a) * 3.5, y: end.y + Math.random() * 2, z: end.z + Math.sin(a) * 3.5 }, { amp: 0.8, size: 1, life: 0.28 }); }
    shake(dim, end, 0.5, 0.5);
  });
  // 한 박자 뒤: 지나간 줄의 적이 한꺼번에 베임
  const victims = new Set();
  for (let i = 1; i <= STEPS; i++) later(i, () => { for (const e of M.around(dim, at(Math.min(1, i / STEPS)), 2.8)) victims.add(e); });
  later(STEPS + 6, () => {
    M.sound(p, "item.trident.riptide_3", 1, 1.4);
    M.sound(p, "ambient.weather.thunder", 0.8, 1.6);
    for (const e of victims) {
      if (!e.isValid()) continue;
      slash(dim, up(e.location, 1), yw + (Math.random() - 0.5) * 30, { tilt: 30 * (Math.random() < 0.5 ? 1 : -1), r: 1.6, thick: 0.6, n: 160, dur: 0.05, life: 0.4 });
      volt(dim, up(e.location, 2.2), up(e.location, 0.1), { amp: 0.4, size: 0.9, life: 0.2, branch: 1 });
      hit(e, 2.2);
    }
  });
  return { end, steps: STEPS };
}
function dragonDive(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.invuln(p, 9);
  const o = { ...p.location }, yw = yawOf(p), f = fwdOf(yw);
  const right = { x: -Math.cos((yw * Math.PI) / 180), y: 0, z: -Math.sin((yw * Math.PI) / 180) };
  const pp = (fw, rt, h) => ({ x: o.x + f.x * fw + right.x * rt, y: o.y + h, z: o.z + f.z * fw + right.z * rt });
  // 0~20: 발도 준비 — 웅크려 기를 모으고, 카메라는 앞옆에서 가까이 (클로즈업 → 천천히 다가감)
  M.anim(p, "iai_ready");
  M.potion(p, "slowness", 255, 1.1);
  cam(p, pp(1.9, 1.5, 1.0), pp(0, 0, 0.8), 0.35);
  later(8, () => cam(p, pp(1.3, 1.05, 0.75), pp(0, 0, 0.75), 0.6));
  M.sound(p, "beacon.activate", 0.8, 1.6);
  // 더 화려하게: 발밑에 물빛 육망성 마법진 + 등 뒤에 세운 작은 성좌 마법진
  drawMagic(dim, up(o, 0.08), { x: 0, y: 1, z: 0 }, "hexa", { R: 2.6, color: [0.45, 0.85, 1], life: 1.3, draw: 0.3, yaw: -yw });
  drawMagic(dim, add(up(o, 1.6), f, -1.2), f, "triseal", { R: 1.3, color: [0.6, 0.9, 1], life: 1.2, draw: 0.3, spin: 3 });
  for (let t = 0; t < 20; t++) later(t + 1, () => {
    const L = p.location, k = 1 + Math.floor(t / 7);
    bodyVolts(dim, L, k, 0.9);
    if (t % 3 === 0) cluster(dim, up(L, 0.1), { n: 6, r: 0.8, spd: 0.8, tone: 0.1 });
    if (t % 5 === 0) M.sound(p, "random.fizz", 0.6, 1.4 + t * 0.03);
    if (t === 16) volt(dim, up(L, 6), up(L, 0.2), { amp: 0.7, size: 1.1, life: 0.2 }); // 출발 직전 번개 한 줄기
  });
  // 20: 와이드 샷으로 빠르게 빠지며 뇌섬
  later(20, () => {
    cam(p, pp(-4, 7.5, 6.5), pp(11, 0, 0.5), 0.22, "OutCubic");
    flashDash(ctx, hit, 22);
  });
  later(36, () => camClear(p));
  // 대각 베기 두 번 (길게 남음) → 한 바퀴 베기 → 올려 베기
  const cuts = [
    [37, () => ({ tilt: 32, dir: 1, r: 4.8, thick: 1.8, n: 520, dur: 0.24, life: 1.0, size: 1.3 }), "slash", 0.9],
    [44, () => ({ tilt: -32, dir: -1, r: 4.8, thick: 1.8, n: 520, dur: 0.24, life: 1.0, size: 1.3 }), "slash_down", 0.9],
    [51, () => ({ full: true, dir: 1, r: 4.4, thick: 1.5, n: 760, dur: 0.3, life: 1.0, size: 1.2 }), "spin", 1.1],
    [59, () => ({ tilt: 90, dir: -1, r: 4.2, thick: 1.6, n: 460, dur: 0.18, life: 0.9, size: 1.25 }), "raise", 1],
  ];
  for (const [t, opt, anim, mul] of cuts) {
    later(t, () => {
      M.anim(p, anim);
      const L = p.location, yw = yawOf(p), f = fwdOf(yw), o = opt();
      slash(dim, up(L, o.full ? 0.9 : 1.1), yw, o);
      // 더 화려하게: 베기마다 앞으로 날아가는 검기 초승달 + 칼끝 번개
      if (!o.full) { slash(dim, up(L, 1.1), yw, { ...o, r: 3.4, thick: 0.9, n: 260, dur: 0.05, life: 0.55, spd: 26 }); volt(dim, up(add(L, f, 1), 1.2), up(add(L, f, 7), 1.2 + (Math.random() - 0.5) * 2), { size: 0.9, life: 0.22, branch: 1 }); }
      else for (let k = 0; k < 6; k++) slash(dim, up(L, 1), yw + k * 60, { tilt: 0, dir: 1, r: 2.6, thick: 0.6, n: 120, dur: 0.04, life: 0.5, spd: 20, size: 1 });
      if (o.full) { // 한 바퀴: 주변 전부 + 바깥으로 퍼지는 물보라
        pt(dim, "cr_shock", up(L, 0.9), { n: 120, spd: 9, tone: 0.2 });
        for (const e of M.around(dim, L, 5.2)) { hit(e, mul); M.toss(L, e, 1.5, 3); }
        M.sound(p, "item.trident.riptide_2", 1, 1.2);
      } else {
        snow(dim, { x: L.x + f.x * 3, y: L.y + 1.4, z: L.z + f.z * 3 }, 6, 2.5);
        for (const e of M.around(dim, { x: L.x + f.x * 2.5, y: L.y, z: L.z + f.z * 2.5 }, 4.4)) hit(e, mul);
        if (o.tilt === 90) for (const e of M.around(dim, { x: L.x + f.x * 2.5, y: L.y, z: L.z + f.z * 2.5 }, 4)) M.toss(L, e, 0.5, 7); // 올려 베기: 띄움
      }
      M.sound(p, "item.trident.riptide_1", o.full ? 0.8 : 1.1, 0.9);
    });
  }
  later(64, () => dragonDiveMain(ctx, hit));
}
function dragonDiveMain(ctx, hit) {
  const { p } = ctx, dim = p.dimension;
  M.sound(p, "item.trident.riptide_1", 1.2);
  // 검기 2발: 앞으로 날아가는 초승달 물살
  const yaw0 = yawOf(p);
  for (const [delay, tilt] of [[1, 0.5], [5, -0.5]]) {
    later(delay, () => {
      const o = { ...p.location }, f = fwdOf(yawOf(p)), yw = yawOf(p);
      M.anim(p, "slash");
      slash(dim, up(o, 1.1), yw, { tilt: tilt > 0 ? 22 : -22, dir: tilt > 0 ? 1 : -1, r: 2.4, thick: 0.9, n: 240, dur: 0.06, life: 0.5, spd: 30 });
      for (let i = 0; i < 9; i++) {
        later(i, () => {
          const c = { x: o.x + f.x * (2.4 + i * 1.5), y: o.y, z: o.z + f.z * (2.4 + i * 1.5) };
          if (i % 3 === 0) snow(dim, up(c, 1.2), 1, 1);
          for (const e of M.around(dim, c, 2.2)) hit(e, 0.6);
        });
      }
      M.sound(p, "mob.blaze.hit", 1.6, 0.6);
    });
  }
  // 솟구침
  later(9, () => {
    M.anim(p, "raise");
    const f = fwdOf(yawOf(p));
    try { p.applyKnockback(f.x, f.z, 0.3, 1.25); } catch {}
    M.sound(p, "mob.enderdragon.flap", 1, 1);
  });
  // 비상 → 내리꽂기를 한 루프로: 큰 청룡이 플레이어 '옆'에서 같은 방향을 보고 나란히 날다가
  //   (머리 = 플레이어보다 약간 앞, 몸통 = 플레이어 옆을 지나 뒤로 흐름)
  //   내리꽂을 때 고개가 수평 → 아래로 자연스럽게 숙여지며 플레이어와 함께 땅에 박힘
  const HOVER = 40, START = 17, WIND = 5;
  later(16, () => { M.potion(p, "levitation", 1, 1.1); M.potion(p, "slow_falling", 1, 2.8); });
  /** 공중 이동: 이동 키(가능하면) 또는 이미 움직이던 방향으로 밀어줌 → 공중에서 자유롭게 위치 잡기 */
  const steer = (t) => {
    // 자동으로 시선 방향 앞으로 빠르게 날아감 (부유보다 빠름) + 이동 키로 좌우·감속 조절
    const yw = yawOf(p), f = fwdOf(yw), r = { x: -Math.cos((yw * Math.PI) / 180), z: -Math.sin((yw * Math.PI) / 180) };
    let fw = 1, sd = 0;
    try {
      const mv = p.inputInfo?.getMovementVector?.();
      if (mv) { fw = 1 + Math.max(-0.6, Math.min(0.3, mv.y * 0.3)); sd = mv.x * 0.6; }
    } catch {}
    const dx = f.x * fw - r.x * sd, dz = f.z * fw - r.z * sd, l = Math.hypot(dx, dz) || 1;
    const spd = 0.95 * Math.min(1, t / 6) * Math.hypot(fw, sd); // 처음엔 서서히 가속
    try { p.applyKnockback(dx / l, dz / l, spd, t < 18 ? 0.16 : 0.02); } catch {}
  };
  let yawS = yawOf(p), pitchS = 0, t = 0, diveT = -1, landT = -1, G = null, hitAt = null;
  const angLerp = (a, b, k) => a + ((((b - a) % 360) + 540) % 360 - 180) * k;
  const SIDE = 2.4; // 플레이어 오른쪽 거리
  const anchor = (yw, dy) => {
    const f = fwdOf(yw), rx = -Math.cos((yw * Math.PI) / 180), rz = -Math.sin((yw * Math.PI) / 180);
    return { x: p.location.x + f.x * 1.2 + rx * SIDE, y: p.location.y + dy, z: p.location.z + f.z * 1.2 + rz * SIDE };
  };
  // 그림의 목 토막(왼쪽 24열)을 몸통 곡선을 따라 이어 붙여 용 몸이 뒤로 길게 이어지게 함
  //   그림과 같은 면 위에서 S자로 꿈틀(물결이 꼬리 쪽으로 흐름), 꼬리로 갈수록 가늘어짐
  let tick0 = 0;
  const SEGS = 24, PX = 0.048, NECK_X = -180 * PX, NECK_Y = 24 * PX, STRIP = 24 * PX;
  // 몸통 = 밧줄처럼 이어진 사슬: 0번(목)은 머리에 붙고, 나머지 마디는 앞 마디를 따라감(길이 고정) + 원래 S자 모양으로 천천히 돌아감
  //   → 앞으로 가면 몸이 지나온 길을 따라 이어지고, 내리꽂을 때 머리부터 꺾이고 몸이 자연스럽게 따라옴
  let chain = null, follow = 0; // follow: 1 = 몸이 머리가 지나간 길을 그대로 따라감
  const tail = (at, pitch, grow, life) => {
    const sc = 1.1 * grow, tt = tick0;
    // 원래 모양(쉴 때 S자): 목은 머리에 붙지만, 몸 방향은 머리가 아래를 봐도 거의 수평으로 유지
    //   (머리 각도를 그대로 쓰면 내리꽂을 때 몸이 머리 뒤로 수직으로 들려 버림)
    const hd = { yaw: yawS, pitch: Math.max(-12, Math.min(20, pitch)) };
    const neck = headPt(at, { yaw: yawS, pitch }, NECK_X, NECK_Y, 0, sc), off = sub(neck, headPt(at, hd, NECK_X, NECK_Y, 0, sc));
    const rest = [], lens = [];
    let x = NECK_X, y = NECK_Y, dist = 0;
    rest.push(neck);
    for (let k = 0; k < SEGS; k++) {
      const taper = 1 - (k / SEGS) * 0.72, ln = STRIP * taper * 0.8;
      const env = Math.min(1, dist / 2.5);
      const slope = Math.sin(((dist * 26) - tt * 24) * Math.PI / 180) * 0.55 * env;
      x -= ln * Math.cos(slope); y += ln * Math.sin(slope); dist += ln;
      rest.push(add(headPt(at, hd, x, y, 0, sc), off));
      lens.push(ln * sc);
    }
    if (!chain) chain = rest.map((q) => ({ ...q }));
    chain[0] = rest[0];
    for (let k = 1; k <= SEGS; k++) {
      const pull = (0.1 + (k / SEGS) * 0.05) * (1 - follow * 0.75); // 원래 모양으로 천천히 (내리꽂는 중엔 거의 길만 따라감)
      let q = add(chain[k], sub(rest[k], chain[k]), pull);
      const d = sub(q, chain[k - 1]), L = Math.hypot(d.x, d.y, d.z) || 0.001;
      chain[k] = add(chain[k - 1], d, lens[k - 1] / L); // 앞 마디와 거리 고정
    }
    for (let k = 1; k <= SEGS; k++) {
      const a2 = chain[k - 1], b2 = chain[k], d = norm(sub(a2, b2)), taper = 1 - ((k - 1) / SEGS) * 0.72;
      const sy = (Math.atan2(-d.x, d.z) * 180) / Math.PI, sp = (Math.asin(Math.max(-1, Math.min(1, d.y))) * 180) / Math.PI;
      pt(dim, "cr_bigbody", scl(add(a2, b2), 0.5), { yaw: sy, pitch: sp, a0: 0, scale: sc * taper, n: Math.round(95 * taper + 20), life: life * 3 });
    }
  };
  const draw = (at, pitch, grow, life = 0.2) => {
    pt(dim, "cr_bighead", at, { yaw: yawS, pitch, n: 3800, life, scale: 1.1 * grow });
    tail(at, pitch, grow, life);
    tick0++;
  };
  const land = () => {
    const ff = fwdOf(yawS);
    G = { ...p.location };
    hitAt = { x: G.x + ff.x * 2.5, y: G.y, z: G.z + ff.z * 2.5 };
    pt(dim, "cr_ring", hitAt, { r: 4.5, h: 0.2, dots: 52, spin: 260, tone: 0.45, life: 1.2 });
    pt(dim, "cr_arc", hitAt, { yaw: 0, a0: 0, a1: 360, r: 3.4, thick: 1, h: 0.3, dur: 0.2, n: 280 });
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      cluster(dim, { x: hitAt.x + Math.cos(a) * 2.4, y: hitAt.y + 1 + Math.random(), z: hitAt.z + Math.sin(a) * 2.4 }, { n: 22, r: 0.5, spd: 4.5, tone: k % 3 ? 0.35 : 0.8 });
    }
    snow(dim, up(hitAt, 2), 12, 3.5);
    for (const e of M.around(dim, hitAt, 5)) { hit(e, 2); M.toss(hitAt, e, 3, 6); }
    M.sound(p, "random.explode", 1.1, 0.9);
    M.sound(p, "random.splash", 0.7);
    later(7, () => lightning(ctx, { x: hitAt.x + 1, y: hitAt.y + 18, z: hitAt.z - 1 }, hitAt, hit, 2.2));
    // 더 화려하게: 거대한 물빛 성좌 마법진 + 번개 감옥(둘레 여덟 줄기)
    drawMagic(dim, up(hitAt, 0.1), { x: 0, y: 1, z: 0 }, "astral", { R: 6.5, color: [0.45, 0.85, 1], life: 2.4, draw: 0.35, spin: 1.5 });
    for (let k = 0; k < 8; k++) later(2 + k, () => { const a = (k / 8) * Math.PI * 2, q = { x: hitAt.x + Math.cos(a) * 7, y: hitAt.y, z: hitAt.z + Math.sin(a) * 7 }; volt(dim, up(q, 14), up(q, 0.2), { size: 1.1, life: 0.3, branch: 2 }); pt(dim, "cr_pillar", q, { r: 0.5, h: 2, n: 60, life: 0.6 }); });
    later(8, () => wave(ctx, hit, hitAt, { r: 1.5, spd: 10, h: 1.8, life: 0.8, n: 360, size: 1.1, foam: false }));
    // 더 화려하게: 사방으로 날아가는 검기 여덟 · 해일 · 둘레 번개 · 하늘로 솟는 빛기둥
    for (let k = 0; k < 8; k++) slash(dim, up(hitAt, 1), k * 45, { tilt: 0, dir: k % 2 ? 1 : -1, r: 3, thick: 1, n: 220, dur: 0.05, life: 0.7, spd: 22, size: 1.2 });
    wave(ctx, hit, hitAt, { r: 2, spd: 14, h: 2.4, life: 0.9, n: 520, mul: 0.5, push: 6 });
    later(3, () => { pt(dim, "cr_pillar", hitAt, { r: 1.8, h: 3, n: 240, life: 1.4 }); pt(dim, "cr_column", hitAt, { r: 1.6, n: 220, spd: 16 }); });
    for (let k = 0; k < 5; k++) later(4 + k * 3, () => { const a = (k / 5) * Math.PI * 2 + 0.3, q = { x: hitAt.x + Math.cos(a) * 5, y: hitAt.y, z: hitAt.z + Math.sin(a) * 5 }; volt(dim, up(q, 12), up(q, 0.2), { size: 1, life: 0.25 }); pt(dim, "cr_shock", up(q, 0.1), { n: 50, spd: 6, tone: 0.2 }); });
  };
  const cam3 = skillOpt("crCam3p"); // 관리자 옵션: 청룡이 보이는 3인칭 시점
  if (cam3) later(START + HOVER + 90, () => camClear(p)); // 안전장치: 끊겨도 원래 시점으로
  const tick = () => {
    if (!p.isValid()) return;
    yawS = angLerp(yawS, yawOf(p), 0.3); // 시선을 부드럽게 따라감
    if (cam3 && t % 2 === 0) {
      const L = p.location, ff = fwdOf(yawS), rr = { x: -Math.cos((yawS * Math.PI) / 180), y: 0, z: -Math.sin((yawS * Math.PI) / 180) };
      if (landT < 0) cam(p, { x: L.x - ff.x * 9 - rr.x * 4.5, y: L.y + 4.5 + (diveT >= 0 ? 2 : 0), z: L.z - ff.z * 9 - rr.z * 4.5 }, { x: L.x + ff.x * 3 + rr.x * 1.6, y: L.y + (diveT >= 0 ? 0 : 1.2), z: L.z + ff.z * 3 + rr.z * 1.6 }, 0.15, "Linear");
      else if (landT === 2) { cam(p, { x: L.x - ff.x * 7 - rr.x * 6, y: L.y + 3, z: L.z - ff.z * 7 - rr.z * 6 }, up(L, 0.5), 0.3); later(24, () => camClear(p)); }
    }
    if (diveT < 0 && t <= HOVER) steer(t);
    if (t === HOVER + 1) { // 내리꽂기 시작: 먼저 고개를 치켜들며 숨을 고름
      diveT = 0;
      M.sound(p, "mob.enderdragon.growl", 1.1, 1.3);
    }
    if (diveT === WIND) { // 머리가 꺾이기 시작할 때 플레이어도 함께 곡선으로 떨어짐
      M.anim(p, "smash");
      try { p.removeEffect("levitation"); p.removeEffect("slow_falling"); } catch {}
      M.sound(p, "item.trident.riptide_3", 1, 0.8);
    }
    if (diveT >= WIND && landT < 0) { // 앞으로 나아가며 점점 아래로 (포물선)
      const f = fwdOf(yawOf(p)), q = Math.min(1, (diveT - WIND) / 8);
      try { p.applyKnockback(f.x, f.z, 0.9 * (1 - q * 0.5), -0.4 - q * 1.6); } catch {}
    }
    if (landT < 0) {
      let at, pitch, grow = 1;
      if (diveT < 0) { // 비상: 아래에서 솟아오르며 커짐, 살짝 꿈틀
        grow = Math.min(1, 0.55 + (t / 10) * 0.45);
        pitch = 6 * Math.sin(t / 5) + (1 - grow) * 30; // 솟아오를 땐 고개를 들고 → 수평
        at = anchor(yawS, 1.4 - (1 - grow) * 4);
        if (t === 0) { M.sound(p, "mob.enderdragon.growl", 1.3, 1); snow(dim, at, 14, 4); }
      } else { // 내리꽂기: 고개를 살짝 치켜들었다가(예비 동작) → 활처럼 휘며 머리부터 아래로
        const lift = ease(Math.min(1, diveT / WIND)) * (1 - ease(Math.min(1, Math.max(0, diveT - WIND) / 6)));
        const k = ease(Math.min(1, Math.max(0, diveT - WIND) / 14)); // 0.7초에 걸쳐 머리를 숙임
        pitch = 6 * Math.sin(t / 5) * (1 - k) + 22 * lift - 60 * k;
        at = add(anchor(yawS, 1.4 + lift * 1.2 - k * 1.6), fwdOf(yawS), k * 1.5);
      }
      pitchS += (pitch - pitchS) * 0.2;
      if (diveT >= 0) follow = Math.min(1, follow + 0.1);
      draw(at, pitchS, grow);
      if (t % 3 === 0) cluster(dim, at, { n: 12, r: 2, spd: 1.5, tone: 0.3 });
      // 더 화려하게: 몸을 따라 감기는 번개 · 머리에서 날아가는 검기 · 몸 둘레 별빛 · 바깥 물결 고리
      if (chain && t % 5 === 0) { const i = 2 + Math.floor(Math.random() * (chain.length - 6)); volt(dim, chain[i], chain[i + 3], { size: 0.8, life: 0.2, branch: 1, amp: 0.8 }); }
      if (t % 9 === 4) slash(dim, at, yawS, { tilt: (Math.random() - 0.5) * 70, dir: Math.random() < 0.5 ? 1 : -1, r: 3, thick: 0.8, n: 200, dur: 0.05, life: 0.6, spd: 24, size: 1.1 });
      if (chain && t % 4 === 2) for (const q of [chain[6], chain[12], chain[18]]) if (q) snow(dim, q, 2, 1.2);
      if (diveT < 0 && t % 12 === 0) pt(dim, "cr_ring", up(p.location, -0.5), { r: 5, h: 0.2, dots: 40, spin: 200, tone: 0.3, life: 0.8 });
      if (t % 6 === 0) snow(dim, at, 4, 4);
      if (diveT >= 0) {
        diveT++;
        let g = false;
        try { g = p.isOnGround; } catch {}
        if ((diveT > WIND + 2 && g) || diveT > WIND + 34) { landT = 0; land(); }
      }
    } else { // 땅에 닿은 뒤: 용 머리가 그대로 땅속으로 파고들며 사라짐
      const k = landT / 16;
      pitchS += (-72 - pitchS) * 0.12;
      const f = fwdOf(yawS), rx = -Math.cos((yawS * Math.PI) / 180), rz = -Math.sin((yawS * Math.PI) / 180);
      const at = { x: G.x + f.x * (1.2 + k * 2) + rx * SIDE * (1 - k * 0.5), y: G.y + 0.2 - k * 4.5, z: G.z + f.z * (1.2 + k * 1.2) + rz * SIDE * (1 - k * 0.5) };
      draw(at, pitchS, 1, 0.16);
      if (landT % 2 === 0) cluster(dim, up(at, 0.5), { n: 14, r: 1.2, spd: 3, tone: 0.6 });
      if (++landT > 16) return;
    }
    t++;
    later(1, tick);
  };
  later(START, tick);
  void yaw0;
}
const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** 무기 스킬 표 (직업 스킬과 같은 모양: HUD·쿨다운에 그대로 씀) */
export const WEAPON_SKILLS = {
  [SWORD_ID]: [
    { id: "w_cr_1", key: 1, name: "청룡 · 유수", short: "유수", lv: 1, mp: 12, cd: 4, pow: 1, run: flowingWater, desc: "앞으로 미끄러지며 몸을 감는 물살을 그린다." },
    { id: "w_cr_2", key: 2, name: "청룡 · 와선창", short: "와선창", lv: 1, mp: 25, cd: 12, pow: 1, run: whirlpool, desc: "물살 회오리 돌진 → 좌우 반 바퀴(올려 베기) → 뛰어올라 공중 한 바퀴 → 땅에 내리꽂아 물기둥 · 파도 → 물러서며 번개를 모아 번개 돌진 찌르기 + 다섯 갈래 번개." },
    { id: "w_cr_3", key: 3, name: "청룡 강림", short: "강림", lv: 1, mp: 45, cd: 30, pow: 1, run: dragon, desc: "거대한 먹구름 위에서 나타난 청룡이 아래를 한 바퀴 돌고 솟구쳤다가 내리꽂힌 뒤, 주변을 구속하고 번개가 쏟아진다." },
    { id: "w_cr_4", key: 4, name: "청룡 · 천룡추", short: "천룡추", lv: 1, mp: 40, cd: 22, pow: 1, run: dragonDive, desc: "번개를 두르고 일직선으로 번개 돌진(뇌섬) → 대각 베기 두 번 · 한 바퀴 베기 · 올려 베기 → 날아가는 검기 → 솟구쳐 공중 이동, 옆에 나타난 청룡과 함께 내리꽂고 번개." },
  ],
};
