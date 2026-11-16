// ═══════════════════════════════════════════════════════════════════════
// 청룡의 검 (V3.1) — 직업과 상관없이 쓰는 스킬 검
//   ① 클릭        청룡 · 유수   : 앞으로 미끄러지며 몸을 감는 물살 곡선 획
//   ② 쉬프트+클릭 청룡 · 와선   : 여러 각도로 기울어진 점선 고리가 돌며 끌어당김
//   ③ 쉬프트+점프 청룡 강림     : 물로 된 청룡이 몸에서 솟아올라 크게 휘돌며 앞으로 돌진
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

// ③ 청룡 강림: 용 머리가 경로를 따라 움직이고, 지나간 자리에 몸통 단면이 남는다
function dragon(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.anim(p, "raise");
  M.invuln(p, 2.5);
  M.sound(p, "mob.enderdragon.growl", 1.4, 0.8);
  const yaw0 = yawOf(p), o = { ...p.location };
  const f = fwdOf(yaw0), side = { x: Math.cos((yaw0 * Math.PI) / 180), y: 0, z: Math.sin((yaw0 * Math.PI) / 180) };
  const T = 34, L = 22, A = 3.4, H = 4.2;
  // 경로: 몸 뒤에서 솟아 S자로 크게 휘며 앞으로 (끝에서 땅으로 내리꽂음)
  const path = (s) => {
    const fw = -2 + s * L;
    const sw = A * Math.sin(s * Math.PI * 2.2);
    const hy = 1 + H * Math.sin(Math.min(1, s * 1.15) * Math.PI) + 0.8 * Math.sin(s * Math.PI * 5);
    return { x: o.x + f.x * fw + side.x * sw, y: o.y + hy, z: o.z + f.z * fw + side.z * sw };
  };
  let prev = path(0);
  for (let t = 1; t <= T; t++) {
    later(t, () => {
      const s = t / T;
      const cur = path(s);
      // 몸통: 이전 점과 현재 점 사이를 3번 나눠 단면 원판
      for (let k = 1; k <= 3; k++) {
        const q = k / 3;
        const at = { x: prev.x + (cur.x - prev.x) * q, y: prev.y + (cur.y - prev.y) * q, z: prev.z + (cur.z - prev.z) * q };
        const d = norm({ x: cur.x - prev.x, y: cur.y - prev.y, z: cur.z - prev.z });
        const u = norm(cross(d, { x: 0, y: 1, z: 0 }));
        const v = cross(u, d);
        const thick = 0.75 * Math.min(1, 0.3 + s * 2) * (1 - Math.max(0, s - 0.85) * 2);
        pt(dim, "cr_tube", at, { u, v, r: thick, n: 38, life: 1.1 });
      }
      // 머리: 진행 방향으로
      const d = { x: cur.x - prev.x, y: cur.y - prev.y, z: cur.z - prev.z };
      const hy = (Math.atan2(-d.x, d.z) * 180) / Math.PI;
      const hp = (Math.atan2(d.y, Math.hypot(d.x, d.z)) * 180) / Math.PI;
      if (t % 2 === 0 || t === T) pt(dim, "cr_head", cur, { yaw: hy, pitch: hp, n: 380, life: 0.14, scale: 1.5 });
      if (t % 3 === 0) snow(dim, cur, 3, 1.8);
      cluster(dim, cur, { n: 8, r: 0.5, spd: 1.8, tone: 0.5 });
      for (const e of M.around(dim, cur, 3)) hit(e, 0.7);
      prev = cur;
      if (t % 8 === 0) M.sound(p, "bucket.empty_water", 0.6 + s * 0.6, 0.7);
    });
  }
  // 마무리: 내리꽂힌 곳에 물기둥 고리 + 큰 물보라
  later(T + 2, () => {
    const end = path(1), g = { x: end.x, y: o.y, z: end.z };
    pt(dim, "cr_ring", g, { r: 4, h: 0.2, dots: 48, spin: 200, tone: 0.6, life: 1 });
    pt(dim, "cr_arc", g, { yaw: 0, a0: 0, a1: 360, r: 3.2, thick: 0.9, h: 0.3, dur: 0.25, n: 260 });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      cluster(dim, { x: g.x + Math.cos(a) * 2, y: g.y + 1 + Math.random(), z: g.z + Math.sin(a) * 2 }, { n: 20, r: 0.5, spd: 4, tone: k % 3 ? 0.4 : 0.8 });
    }
    snow(dim, up(g, 2), 10, 3.5);
    for (const e of M.around(dim, g, 5)) { hit(e, 2.2); M.toss(g, e, 4, 6); }
    M.sound(p, "random.explode", 1.2, 0.8);
    M.sound(p, "random.splash", 0.7);
  });
}
const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** 무기 스킬 표 (직업 스킬과 같은 모양: HUD·쿨다운에 그대로 씀) */
export const WEAPON_SKILLS = {
  [SWORD_ID]: [
    { id: "w_cr_1", key: 1, name: "청룡 · 유수", lv: 1, mp: 12, cd: 4, pow: 1, run: flowingWater, desc: "앞으로 미끄러지며 몸을 감는 물살을 그린다." },
    { id: "w_cr_2", key: 2, name: "청룡 · 와선", lv: 1, mp: 25, cd: 14, pow: 1, run: whirlpool, desc: "기울어진 점선 물결 고리가 돌며 적을 끌어당긴다." },
    { id: "w_cr_3", key: 3, name: "청룡 강림", lv: 1, mp: 45, cd: 30, pow: 1, run: dragon, desc: "물로 된 청룡이 솟아올라 크게 휘돌며 앞으로 돌진한다." },
  ],
};
