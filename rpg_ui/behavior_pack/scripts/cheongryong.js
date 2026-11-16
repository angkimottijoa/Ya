// ═══════════════════════════════════════════════════════════════════════
// 청룡의 검 (V3.1) — 직업과 상관없이 쓰는 스킬 검
//   ① 클릭        청룡 · 유수   : 앞으로 미끄러지며 몸을 감는 물살 곡선 획
//   ② 쉬프트+클릭 청룡 · 와선   : 여러 각도로 기울어진 점선 고리가 돌며 끌어당김
//   ③ 쉬프트+점프 청룡 강림     : 먹구름 → 청룡이 구름 아래를 한 바퀴 → 길게 내려와 땅속으로 → 구름에서 번개
//   ④ 쉬프트 두 번 청룡 · 천룡추 : 돌진하며 검기 → 솟구쳐 큰 청룡 머리 → 함께 내리꽂기 → 번개
// 파티클: gen_cheongryong.py (물빛 픽셀 먼지 + ✱ 눈꽃, 머리는 윤곽선 점 찍기)
// ═══════════════════════════════════════════════════════════════════════
import { system, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
import * as M from "./ms.js";

export const SWORD_ID = "rpg:cheongryong_sword";
const later = (t, fn) => system.runTimeout(() => { try { fn(); } catch {} }, Math.max(1, Math.round(t)));
const up = (l, y) => ({ x: l.x, y: l.y + y, z: l.z });
const yawOf = (p) => p.getRotation().y;
const fwdOf = (yaw) => ({ x: -Math.sin((yaw * Math.PI) / 180), y: 0, z: Math.cos((yaw * Math.PI) / 180) });

const DEF = { n: 10, r: 0.12, spd: 1.2, tone: 0.5, size: 1, yaw: 0, a0: 0, a1: 180, thick: 0.5, h: 1, tilt: 0, dur: 0.15, dots: 36, spin: 0, life: 1, tiltx: 0, tiltz: 0, scale: 1, pitch: 0 };
function pt(dim, name, loc, o = {}) {
  try {
    const m = new MolangVariableMap();
    for (const k of Object.keys(DEF)) m.setFloat(`variable.${k}`, o[k] ?? DEF[k]);
    m.setVector3("variable.u", o.u ?? { x: 1, y: 0, z: 0 });
    m.setVector3("variable.v", o.v ?? { x: 0, y: 1, z: 0 });
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

// ① 유수: 미끄러지며 거대한 세로 초승달 물살 4번 (좌우로 기울기 번갈아) → 마크 번개 한 방
function flowingWater(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.anim(p, "dash");
  M.potion(p, "resistance", 5, 3);
  M.potion(p, "fire_resistance", 1, 6);
  M.sound(p, "bucket.empty_water", 1.2);
  M.leap(p, 12, 1);
  const rolls = [-38, 34, -20, 48];
  rolls.forEach((roll, i) => {
    later(1 + i * 3, () => {
      const yaw = yawOf(p), L = p.location;
      M.anim(p, i % 2 ? "slash" : "slash_down");
      bigCrescent(dim, up(L, 0.4), yaw + (i % 2 ? 20 : -20), roll, 4.4 + (i % 2) * 0.5);
      pt(dim, "cr_arc", L, { yaw, a0: -120 * (i % 2 ? 1 : -1), a1: 150 * (i % 2 ? 1 : -1), r: 2.6, thick: 0.5, h: 0.3, tilt: 0.3, dur: 0.12, n: 120 });
      cluster(dim, up(L, 0.3), { n: 10, r: 0.6, spd: 1.5, tone: 0.5 });
      const f = fwdOf(yaw);
      for (const e of M.around(dim, { x: L.x + f.x * 2, y: L.y, z: L.z + f.z * 2 }, 4.5)) hit(e, 0.5);
      M.sound(p, "item.trident.riptide_1", 1.2 + i * 0.1, 0.6);
    });
  });
  // 마무리 큰 획 + 번개
  later(14, () => {
    const yaw = yawOf(p), L = p.location, f = fwdOf(yaw);
    bigCrescent(dim, up(L, 0.4), yaw, 0, 5.4, { n: 700, ns: 220 });
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

// ② 와선: 기울어진 점선 고리 5개가 2초 동안 돌며, 0.5초마다 끌어당김 + 피해
function whirlpool(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), c = { ...p.location };
  M.anim(p, "raise");
  M.sound(p, "bubble.upinside", 0.7);
  const rings = [
    { r: 3.2, h: 1.2, tiltx: 0.35, tiltz: 0, spin: 160, tone: 0.55, dots: 34 },
    { r: 2.4, h: 2.0, tiltx: -0.5, tiltz: 0.3, spin: -200, tone: 0.3, dots: 26 },
    { r: 4.2, h: 0.6, tiltx: 0.1, tiltz: -0.25, spin: 120, tone: 0.75, dots: 44 },
    { r: 1.8, h: 2.8, tiltx: 0.7, tiltz: 0.5, spin: 260, tone: 0.15, dots: 20 },
    { r: 5.2, h: 0.3, tiltx: 0, tiltz: 0.12, spin: -90, tone: 0.9, dots: 52 },
  ];
  rings.forEach((rg, i) => later(1 + i * 3, () => pt(dim, "cr_ring", c, { ...rg, life: 2 })));
  for (let i = 0; i < 4; i++) {
    later(8 + i * 10, () => {
      pt(dim, "cr_arc", c, { yaw: i * 90, a0: 0, a1: 300, r: 3 + i * 0.4, thick: 0.6, h: 0.2 + i * 0.5, tilt: 0.4, dur: 0.3, n: 180 });
      snow(dim, up(c, 1.5), 4, 3);
      for (const e of M.around(dim, c, 6)) {
        M.toss(c, e, -5, 1.5);
        hit(e, 0.35);
      }
      M.sound(p, "random.splash", 0.8 + i * 0.1, 0.6);
    });
  }
  later(48, () => {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      cluster(dim, { x: c.x + Math.cos(a) * 2.5, y: c.y + 0.6, z: c.z + Math.sin(a) * 2.5 }, { n: 16, r: 0.5, spd: 3, tone: 0.4 });
    }
    for (const e of M.around(dim, c, 5)) hit(e, 1.4);
    M.sound(p, "random.explode", 1.6, 0.5);
  });
}

// ───────── 번개 / 구름 / 몸통 도구 ─────────
function vfxBolt(dim, a, b, w = 0.45) {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, len = Math.hypot(d.x, d.y, d.z) || 1;
  const dir = { x: d.x / len, y: d.y / len, z: d.z / len };
  const perp = norm({ x: -dir.z || 1, y: 0, z: dir.x });
  const seed = Math.random() * 360;
  for (const [c, ww] of [[{ red: 0.62, green: 0.82, blue: 1, alpha: 1 }, w], [{ red: 1, green: 1, blue: 1, alpha: 1 }, w * 0.35]]) {
    try {
      const m = new MolangVariableMap();
      m.setColorRGBA("variable.color", c);
      for (const [k, v] of [["len", len], ["w", ww], ["dur", 0.06], ["seed", seed], ["amp", 1.4], ["size", 1], ["life", 0.4]]) m.setFloat(`variable.${k}`, v);
      m.setVector3("variable.dir", dir);
      m.setVector3("variable.perp", perp);
      dim.spawnParticle("rpg:vfx_bolt", a, m);
    } catch {}
  }
}
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
const headDir = (prev, cur) => {
  const d = { x: cur.x - prev.x, y: cur.y - prev.y, z: cur.z - prev.z };
  return { yaw: (Math.atan2(-d.x, d.z) * 180) / Math.PI, pitch: (Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180) / Math.PI };
};
const ease = (s) => s * s * (3 - 2 * s);

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
  // 거대한 먹구름 (여러 덩어리 겹침)
  pt(dim, "cr_cloud", C, { r: 14, life: 8 });
  for (const [dx, dz, r] of [[9, 0, 9], [-9, 0, 9], [0, 9, 9], [0, -9, 9]]) later(4, () => pt(dim, "cr_cloud", { x: C.x + dx, y: C.y + 1, z: C.z + dz }, { r, life: 7.5 }));
  later(8, () => pt(dim, "cr_cloud", up(C, 2.5), { r: 11, life: 7 }));
  for (let i = 0; i < 4; i++) later(i * 25, () => M.sound(p, "ambient.weather.thunder", 0.5 + i * 0.05, 0.7));
  const a0 = Math.atan2(o.z - C.z, o.x - C.x) + Math.PI; // 플레이어 반대쪽 구름 위에서 등장
  const ring = (ang, s) => ({ x: C.x + Math.cos(ang) * R, y: C.y - 3 + Math.sin(s * Math.PI * 4) * 0.8, z: C.z + Math.sin(ang) * R });
  const TA = 26, TB = 52, TC = 44;
  const top = { x: C.x + Math.cos(a0) * R * 0.5, y: C.y + 8, z: C.z + Math.sin(a0) * R * 0.5 };
  const bez = (A, K, B, s) => { const m = 1 - s; return { x: m * m * A.x + 2 * m * s * K.x + s * s * B.x, y: m * m * A.y + 2 * m * s * K.y + s * s * B.y, z: m * m * A.z + 2 * m * s * K.z + s * s * B.z }; };
  const ringStart = ring(a0, 0);
  const path = (t) => {
    if (t <= TA) { // 구름 위에서 나타나 구름을 뚫고 아래로
      const s = ease(t / TA);
      return bez(top, { x: C.x + Math.cos(a0 - 0.8) * R * 1.3, y: C.y + 1, z: C.z + Math.sin(a0 - 0.8) * R * 1.3 }, ringStart, s);
    }
    if (t <= TA + TB) return ring(a0 + ((t - TA) / TB) * Math.PI * 2, (t - TA) / TB); // 구름 아래 한 바퀴
    // S자로 꿈틀대며 땅까지 (처음 버전 모션)
    const s = Math.min(1, (t - TA - TB) / TC);
    const A = ring(a0, 1), B = { x: G.x, y: G.y - 2.5, z: G.z };
    const e = ease(s);
    const sw = 3.4 * Math.sin(s * Math.PI * 2.2) * (1 - s * 0.6);
    const bob = 1.4 * Math.sin(s * Math.PI * 3) * (1 - s);
    return { x: A.x + (B.x - A.x) * e + side.x * sw, y: A.y + (B.y - A.y) * (s * s) + bob, z: A.z + (B.z - A.z) * e + side.z * sw };
  };
  const T = TA + TB + TC;
  let prev = path(0), landed = false;
  for (let t = 1; t <= T; t++) {
    later(t, () => {
      const cur = path(t);
      const s = t / T;
      const thick = 0.95 * Math.min(1, 0.35 + s * 3);
      if (cur.y > o.y - 0.5) body(dim, prev, cur, thick, 1.7);
      const hd = headDir(prev, cur);
      if (cur.y > o.y + 0.3 && t % 2 === 0) pt(dim, "cr_head", cur, { ...hd, n: 420, life: 0.14, scale: 1.7 });
      if (t % 3 === 0) snow(dim, cur, 3, 2);
      cluster(dim, cur, { n: 8, r: 0.5, spd: 1.8, tone: 0.5 });
      for (const e of M.around(dim, cur, 3)) hit(e, 0.5);
      if (t % 10 === 0) M.sound(p, "bucket.empty_water", 0.6 + s * 0.6, 0.7);
      // 땅에 닿는 순간 물보라
      if (!landed && t > TA + TB && cur.y <= o.y + 0.5) {
        landed = true;
        pt(dim, "cr_ring", G, { r: 4.5, h: 0.2, dots: 52, spin: 220, tone: 0.5, life: 1.3 });
        pt(dim, "cr_arc", G, { yaw: 0, a0: 0, a1: 360, r: 3.4, thick: 1, h: 0.3, dur: 0.25, n: 280 });
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          cluster(dim, { x: G.x + Math.cos(a) * 2.2, y: G.y + 1 + Math.random(), z: G.z + Math.sin(a) * 2.2 }, { n: 20, r: 0.5, spd: 4.5, tone: k % 3 ? 0.4 : 0.8 });
        }
        for (const e of M.around(dim, G, 5)) { hit(e, 1.6); M.toss(G, e, 3, 5); }
        M.sound(p, "random.splash", 0.7);
        M.sound(p, "random.explode", 1.2, 0.6);
      }
      prev = cur;
    });
  }
  // 진짜 마크 번개: 주변 몹 위로 차례로 (몹이 없으면 떨어진 곳 주변)
  later(T + 6, () => {
    const mobs = M.around(dim, G, 14).filter((e) => Math.hypot(e.location.x - p.location.x, e.location.z - p.location.z) > 3).slice(0, 8);
    const spots = mobs.length ? mobs.map((e) => e) : [0, 1, 2].map((i) => ({ location: { x: G.x + Math.cos(i * 2.1) * 4, y: G.y, z: G.z + Math.sin(i * 2.1) * 4 } }));
    spots.forEach((e, i) => later(i * 5, () => {
      const at = e.isValid?.() === false ? null : { ...e.location };
      if (!at) return;
      try { dim.spawnEntity("minecraft:lightning_bolt", at); } catch {}
      cluster(dim, up(at, 0.5), { n: 18, r: 0.6, spd: 3.5, tone: 0.2 });
      snow(dim, up(at, 1.5), 5, 2);
      if (e.id) hit(e, 2);
    }));
  });
}

// ④ 청룡 · 천룡추 (쉬프트 두 번): 돌진하며 검기 → 솟구쳐 큰 청룡 머리 → 함께 내리꽂기 → 번개
function dragonDive(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.invuln(p, 5);
  // 본 스킬 전: 크게 두 번 긋기
  for (const [t, tilt, a0, a1] of [[0, 0.9, -110, 110], [7, -0.9, 110, -110]]) {
    later(t + 1, () => {
      M.anim(p, t ? "slash_down" : "slash");
      const L = p.location, yw = yawOf(p), f = fwdOf(yw);
      pt(dim, "cr_arc", L, { yaw: yw, a0, a1, r: 4.2, thick: 1.1, h: 1.2, tilt, dur: 0.1, n: 360 });
      pt(dim, "cr_arc", L, { yaw: yw, a0, a1, r: 3.6, thick: 0.6, h: 1.2, tilt, dur: 0.1, n: 220 });
      snow(dim, { x: L.x + f.x * 3, y: L.y + 1.4, z: L.z + f.z * 3 }, 6, 2.5);
      for (const e of M.around(dim, { x: L.x + f.x * 2.5, y: L.y, z: L.z + f.z * 2.5 }, 4.2)) hit(e, 0.9);
      M.sound(p, "item.trident.riptide_1", t ? 0.9 : 1.1, 0.9);
    });
  }
  later(14, () => dragonDiveMain(ctx, hit));
}
function dragonDiveMain(ctx, hit) {
  const { p } = ctx, dim = p.dimension;
  M.anim(p, "dash");
  M.leap(p, 14, 0.3);
  M.sound(p, "item.trident.riptide_1", 1.2);
  // 검기 2발: 앞으로 날아가는 초승달 물살
  const yaw0 = yawOf(p);
  for (const [delay, tilt] of [[1, 0.5], [5, -0.5]]) {
    later(delay, () => {
      const o = { ...p.location }, f = fwdOf(yawOf(p)), yw = yawOf(p);
      M.anim(p, "slash");
      for (let i = 0; i < 9; i++) {
        later(i, () => {
          const c = { x: o.x + f.x * i * 1.8, y: o.y, z: o.z + f.z * i * 1.8 };
          pt(dim, "cr_arc", c, { yaw: yw, a0: -70, a1: 70, r: 1.9, thick: 0.45, h: 1.1, tilt, dur: 0.06, n: 90 });
          if (i % 3 === 0) snow(dim, up(c, 1.2), 1, 1);
          for (const e of M.around(dim, { x: c.x + f.x * 1.5, y: c.y, z: c.z + f.z * 1.5 }, 2)) hit(e, 0.6);
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
  // 비상: 1.5초 동안 떠오르며, 눈앞을 가로질러 큰 청룡이 모습을 드러냄
  //   (그림은 옆모습이라 내 시선과 수직인 면에 세워야 잘 보임: 머리 = 오른쪽, 몸통 = 왼쪽)
  const HOVER = 30;
  later(16, () => { M.potion(p, "levitation", 1, 1.2); M.potion(p, "slow_falling", 1, 2.2); });
  const headAt = (pitch, k = 1) => {
    const yw = yawOf(p), f = fwdOf(yw), rx = -Math.cos((yw * Math.PI) / 180), rz = -Math.sin((yw * Math.PI) / 180);
    return { at: { x: p.location.x + f.x * 8 + rx * 3, y: p.location.y + 1.8, z: p.location.z + f.z * 8 + rz * 3 }, yaw: yw + 90, pitch, k };
  };
  for (let t = 0; t <= HOVER; t++) {
    later(17 + t, () => {
      const grow = Math.min(1, 0.55 + t / 10 * 0.45); // 처음 0.5초 동안 커지며 솟아오름
      const h = headAt(8 * Math.sin(t / 5), grow);
      h.at.y += (1 - grow) * -3;
      pt(dim, "cr_bighead", h.at, { yaw: h.yaw, pitch: h.pitch, n: 3200, life: 0.18, scale: 1.1 * grow });
      if (t === 0) { M.sound(p, "mob.enderdragon.growl", 1.3, 1); snow(dim, h.at, 14, 4); }
      if (t % 3 === 0) cluster(dim, h.at, { n: 12, r: 2, spd: 1.5, tone: 0.3 });
      if (t % 6 === 0) snow(dim, h.at, 4, 4);
    });
  }
  // 함께 내리꽂기
  later(17 + HOVER + 1, () => {
    M.anim(p, "smash");
    try { p.removeEffect("levitation"); p.removeEffect("slow_falling"); } catch {}
    const f = fwdOf(yawOf(p));
    try { p.applyKnockback(f.x, f.z, 0.8, -2.6); } catch {}
  });
  let t = 0, landed = false;
  const follow = () => {
    t++;
    if (!p.isValid() || landed) return;
    let g = false;
    try { g = p.isOnGround; } catch {}
    const h = headAt(-30);
    pt(dim, "cr_bighead", h.at, { yaw: h.yaw, pitch: h.pitch, n: 3200, life: 0.14, scale: 1.1 });
    if ((t > 2 && g) || t > 30) {
      landed = true;
      const G = { ...p.location };
      const ff = fwdOf(yawOf(p));
      const hitAt = { x: G.x + ff.x * 2.5, y: G.y, z: G.z + ff.z * 2.5 };
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
      return;
    }
    later(1, follow);
  };
  later(17 + HOVER + 2, follow);
  void yaw0;
}
const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** 무기 스킬 표 (직업 스킬과 같은 모양: HUD·쿨다운에 그대로 씀) */
export const WEAPON_SKILLS = {
  [SWORD_ID]: [
    { id: "w_cr_1", key: 1, name: "청룡 · 유수", short: "유수", lv: 1, mp: 12, cd: 4, pow: 1, run: flowingWater, desc: "앞으로 미끄러지며 몸을 감는 물살을 그린다." },
    { id: "w_cr_2", key: 2, name: "청룡 · 와선", short: "와선", lv: 1, mp: 25, cd: 14, pow: 1, run: whirlpool, desc: "기울어진 점선 물결 고리가 돌며 적을 끌어당긴다." },
    { id: "w_cr_3", key: 3, name: "청룡 강림", short: "강림", lv: 1, mp: 45, cd: 30, pow: 1, run: dragon, desc: "거대한 먹구름 위에서 나타난 청룡이 아래를 한 바퀴 돌고 꿈틀대며 땅으로 떨어진 뒤, 주변 몹에게 번개가 떨어진다." },
    { id: "w_cr_4", key: 4, name: "청룡 · 천룡추", short: "천룡추", lv: 1, mp: 40, cd: 22, pow: 1, run: dragonDive, desc: "돌진하며 검기 두 발 → 솟구쳐 큰 청룡 머리와 함께 내리꽂고 번개." },
  ],
};
