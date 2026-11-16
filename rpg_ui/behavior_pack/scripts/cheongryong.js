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

// ① 유수: 6틱 동안 미끄러지며 매 틱 몸을 감는 물살 획 2개 (위·아래 기울기 번갈아)
function flowingWater(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.anim(p, "dash");
  M.sound(p, "bucket.empty_water", 1.2);
  M.leap(p, 12, 1);
  for (let i = 0; i < 7; i++) {
    later(i + 1, () => {
      const yaw = yawOf(p), L = p.location;
      const s = i % 2 ? 1 : -1;
      pt(dim, "cr_arc", L, { yaw, a0: -110 * s, a1: 160 * s, r: 2.3 + (i % 3) * 0.3, thick: 0.55, h: 0.4 + (i % 3) * 0.35, tilt: 0.5 * s, dur: 0.12, n: 140 });
      if (i % 2 === 0) pt(dim, "cr_arc", L, { yaw, a0: 150 * s, a1: -40 * s, r: 3.1, thick: 0.4, h: 0.15, tilt: 0, dur: 0.15, n: 110 });
      cluster(dim, up(L, 0.3), { n: 10, r: 0.6, spd: 1.5, tone: 0.6 });
      snow(dim, up(L, 1.2), 2, 1.5);
      for (const e of M.around(dim, L, 3.2)) hit(e, 0.45);
      if (i === 0) M.anim(p, "spin");
    });
  }
  later(9, () => {
    const f = fwdOf(yawOf(p)), L = p.location;
    pt(dim, "cr_arc", L, { yaw: yawOf(p), a0: -80, a1: 80, r: 3.4, thick: 0.8, h: 1, tilt: 0.3, dur: 0.1, n: 200 });
    for (let k = 1; k <= 3; k++) cluster(dim, { x: L.x + f.x * k, y: L.y + 1, z: L.z + f.z * k }, { n: 16, r: 0.4, spd: 2, tone: 0.4 });
    for (const e of M.around(dim, { x: L.x + f.x * 2, y: L.y, z: L.z + f.z * 2 }, 3)) hit(e, 0.9);
    M.sound(p, "random.splash", 1.3);
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

// ③ 청룡 강림: 먹구름 → 청룡이 솟아 구름 아래를 한 바퀴 → 길게 내려와 땅속으로 → 구름에서 번개
function dragon(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.anim(p, "raise");
  M.invuln(p, 3);
  const yaw0 = yawOf(p), o = { ...p.location }, f = fwdOf(yaw0);
  const G = { x: o.x + f.x * 7, y: o.y, z: o.z + f.z * 7 }; // 내리꽂을 곳
  const C = { x: G.x, y: o.y + 13, z: G.z }; // 구름 중심
  const RC = 6.5, R = 5.2;
  // 먹구름
  pt(dim, "cr_cloud", C, { r: RC, life: 6.5 });
  later(10, () => pt(dim, "cr_cloud", up(C, 0.6), { r: RC * 0.7, life: 5.5 }));
  M.sound(p, "ambient.weather.thunder", 0.6, 0.6);
  M.sound(p, "mob.enderdragon.growl", 1.3, 0.8);
  const a0 = Math.atan2(o.z - C.z, o.x - C.x); // 플레이어 쪽에서 시작하는 각
  const ring = (ang, s) => ({ x: C.x + Math.cos(ang) * R, y: C.y - 1.2 + Math.sin(s * Math.PI * 4) * 0.6, z: C.z + Math.sin(ang) * R });
  const TA = 30, TB = 46, TC = 34; // 솟아오름 / 한 바퀴 / 내려옴
  const start = ring(a0, 0);
  const path = (t) => {
    if (t <= TA) { // 몸에서 휘감으며 구름 가장자리로
      const s = ease(t / TA);
      const sw = Math.sin(s * Math.PI * 2) * 1.6;
      return { x: o.x + (start.x - o.x) * s + Math.cos(yaw0 * Math.PI / 180) * sw, y: o.y + 1 + (start.y - o.y - 1) * s, z: o.z + (start.z - o.z) * s + Math.sin(yaw0 * Math.PI / 180) * sw };
    }
    if (t <= TA + TB) { // 구름 아래 한 바퀴
      const s = (t - TA) / TB;
      return ring(a0 + s * Math.PI * 2, s);
    }
    // 길게 내려와 땅속으로 (위로 부풀었다가 G 를 지나 땅 아래까지)
    const s = Math.min(1, (t - TA - TB) / TC);
    const A = ring(a0, 1), B = { x: G.x, y: G.y - 3, z: G.z };
    const K = { x: (A.x + G.x) / 2, y: C.y + 2.5, z: (A.z + G.z) / 2 };
    const q = s * s;
    const mt = 1 - s;
    return { x: mt * mt * A.x + 2 * mt * s * K.x + q * B.x, y: mt * mt * A.y + 2 * mt * s * K.y + q * B.y, z: mt * mt * A.z + 2 * mt * s * K.z + q * B.z };
  };
  const T = TA + TB + TC;
  let prev = path(0);
  for (let t = 1; t <= T; t++) {
    later(t, () => {
      const cur = path(t);
      const s = t / T;
      const thick = 0.8 * Math.min(1, 0.35 + s * 3);
      if (cur.y > o.y - 0.5) body(dim, prev, cur, thick, 1.6);
      const hd = headDir(prev, cur);
      if (cur.y > o.y + 0.3 && (t % 2 === 0)) pt(dim, "cr_head", cur, { ...hd, n: 380, life: 0.14, scale: 1.5 });
      if (t % 3 === 0) snow(dim, cur, 3, 2);
      cluster(dim, cur, { n: 8, r: 0.5, spd: 1.8, tone: 0.5 });
      for (const e of M.around(dim, cur, 3)) hit(e, 0.5);
      if (t % 10 === 0) M.sound(p, "bucket.empty_water", 0.6 + s * 0.6, 0.7);
      prev = cur;
    });
  }
  // 땅에 들어간 순간: 물보라 고리
  later(TA + TB + Math.round(TC * 0.8), () => {
    pt(dim, "cr_ring", G, { r: 4, h: 0.2, dots: 48, spin: 220, tone: 0.5, life: 1.2 });
    pt(dim, "cr_arc", G, { yaw: 0, a0: 0, a1: 360, r: 3.2, thick: 0.9, h: 0.3, dur: 0.25, n: 260 });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      cluster(dim, { x: G.x + Math.cos(a) * 2, y: G.y + 1 + Math.random(), z: G.z + Math.sin(a) * 2 }, { n: 20, r: 0.5, spd: 4, tone: k % 3 ? 0.4 : 0.8 });
    }
    for (const e of M.around(dim, G, 5)) { hit(e, 1.6); M.toss(G, e, 3, 5); }
    M.sound(p, "random.splash", 0.7);
    M.sound(p, "random.explode", 1.2, 0.6);
  });
  // 구름에서 번개 3번
  for (let i = 0; i < 3; i++) {
    later(T + 6 + i * 6, () => {
      const at = i === 0 ? G : { x: G.x + (Math.random() - 0.5) * 6, y: G.y, z: G.z + (Math.random() - 0.5) * 6 };
      lightning(ctx, { x: at.x + (Math.random() - 0.5) * 3, y: C.y - 0.5, z: at.z + (Math.random() - 0.5) * 3 }, at, hit, i === 0 ? 2.4 : 1.2);
    });
  }
}

// ④ 청룡 · 천룡추 (쉬프트 두 번): 돌진하며 검기 → 솟구쳐 큰 청룡 머리 → 함께 내리꽂기 → 번개
function dragonDive(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.anim(p, "dash");
  M.invuln(p, 4);
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
  // 정점에서 머무르며 큰 머리 생성
  later(17, () => M.potion(p, "slow_falling", 1, 0.6));
  const headAt = (pitch) => {
    const f = fwdOf(yawOf(p));
    return { at: { x: p.location.x + f.x * 3, y: p.location.y + 1.4, z: p.location.z + f.z * 3 }, yaw: yawOf(p), pitch };
  };
  for (let t = 17; t <= 29; t++) {
    later(t, () => {
      const h = headAt(-15);
      pt(dim, "cr_bighead", h.at, { yaw: h.yaw, pitch: h.pitch, n: 1600, life: 0.16, scale: 1 });
      if (t === 17) { M.sound(p, "mob.enderdragon.growl", 1.4, 1); snow(dim, h.at, 12, 3); }
      cluster(dim, h.at, { n: 10, r: 1.5, spd: 1.5, tone: 0.3 });
    });
  }
  // 함께 내리꽂기
  later(30, () => {
    M.anim(p, "smash");
    const f = fwdOf(yawOf(p));
    try { p.applyKnockback(f.x, f.z, 0.8, -2.6); } catch {}
  });
  let t = 0, landed = false;
  const follow = () => {
    t++;
    if (!p.isValid() || landed) return;
    let g = false;
    try { g = p.isOnGround; } catch {}
    const h = headAt(-40);
    pt(dim, "cr_bighead", h.at, { yaw: h.yaw, pitch: h.pitch, n: 1600, life: 0.12, scale: 1 });
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
  later(31, follow);
  void yaw0;
}
const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** 무기 스킬 표 (직업 스킬과 같은 모양: HUD·쿨다운에 그대로 씀) */
export const WEAPON_SKILLS = {
  [SWORD_ID]: [
    { id: "w_cr_1", key: 1, name: "청룡 · 유수", lv: 1, mp: 12, cd: 4, pow: 1, run: flowingWater, desc: "앞으로 미끄러지며 몸을 감는 물살을 그린다." },
    { id: "w_cr_2", key: 2, name: "청룡 · 와선", lv: 1, mp: 25, cd: 14, pow: 1, run: whirlpool, desc: "기울어진 점선 물결 고리가 돌며 적을 끌어당긴다." },
    { id: "w_cr_3", key: 3, name: "청룡 강림", lv: 1, mp: 45, cd: 30, pow: 1, run: dragon, desc: "먹구름 아래를 한 바퀴 돈 청룡이 길게 내려와 땅으로 파고들고, 구름에서 번개가 친다." },
    { id: "w_cr_4", key: 4, name: "청룡 · 천룡추", lv: 1, mp: 40, cd: 22, pow: 1, run: dragonDive, desc: "돌진하며 검기 두 발 → 솟구쳐 큰 청룡 머리와 함께 내리꽂고 번개." },
  ],
};
