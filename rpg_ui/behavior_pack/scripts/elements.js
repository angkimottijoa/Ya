// ═══════════════════════════════════════════════════════════════════════
// 원소 스킬 (V3.0) — 빛나는 커스텀 VFX (gen_vfx.py) 로 만든 번개 / 물 / 불 계열
//   번개: 뇌전술사·폭풍의 군주   물: 대주교   불: 성전사
// ═══════════════════════════════════════════════════════════════════════
import { system, MolangVariableMap } from "@minecraft/server";
import * as M from "./ms.js";
import { nearbyMembers } from "./party.js";

const C = {
  thunder: ["#B07CFF", "#EBDDFF", "#6A3DFF"], // 보라 번개 / 흰 심 / 짙은 보라
  water: ["#3FE6D8", "#C8FFF8", "#1E7BFF"],
  fire: ["#FF7A1A", "#FFE08A", "#C42A00"],
};
const rgb = (h, a = 1) => ({ red: parseInt(h.slice(1, 3), 16) / 255, green: parseInt(h.slice(3, 5), 16) / 255, blue: parseInt(h.slice(5, 7), 16) / 255, alpha: a });
const up = (l, y) => ({ x: l.x, y: l.y + y, z: l.z });
const later = (t, fn) => system.runTimeout(() => { try { fn(); } catch {} }, Math.max(1, Math.round(t)));

/** VFX 파티클 하나 */
function vfx(dim, name, loc, o = {}) {
  try {
    const m = new MolangVariableMap();
    m.setColorRGBA("variable.color", rgb(o.color ?? "#FFFFFF", o.a ?? 1));
    for (const k of ["r", "len", "life", "size", "dur", "w", "yaw", "spin", "h", "n", "seed", "amp"]) {
      m.setFloat(`variable.${k}`, o[k] ?? { r: 3, len: 8, life: 1, size: 1, dur: 0.08, w: 0.35, yaw: 0, spin: 540, h: 1, n: 30, seed: 0, amp: 1 }[k]);
    }
    m.setVector3("variable.dir", o.dir ?? { x: 0, y: 0, z: 1 });
    m.setVector3("variable.perp", o.perp ?? { x: 1, y: 0, z: 0 });
    dim.spawnParticle(`rpg:${name}`, loc, m);
  } catch {}
}
const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
/** 색 선 + 흰 심 (빛나는 선) */
function beam(dim, a, b, col, o = {}) {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, len = Math.hypot(d.x, d.y, d.z);
  const dir = norm(d);
  vfx(dim, "vfx_line", a, { dir, len, color: col[0], w: o.w ?? 0.55, life: o.life ?? 0.6, dur: o.dur ?? 0.08 });
  vfx(dim, "vfx_line", a, { dir, len, color: col[1], w: (o.w ?? 0.55) * 0.35, life: (o.life ?? 0.6) * 0.8, dur: o.dur ?? 0.08 });
}
function bolt(dim, a, b, col, amp = 1) {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, len = Math.hypot(d.x, d.y, d.z);
  const dir = norm(d), perp = norm({ x: -dir.z || 1, y: 0, z: dir.x });
  const seed = Math.random() * 360;
  vfx(dim, "vfx_bolt", a, { dir, perp, len, color: col[0], w: 0.4, dur: 0.06, seed, amp });
  vfx(dim, "vfx_bolt", a, { dir, perp, len, color: col[1], w: 0.15, dur: 0.06, seed, amp });
}
function domain(dim, c, r, col, life) {
  vfx(dim, "vfx_ring", c, { r, color: col[0], life, size: 1.1 });
  vfx(dim, "vfx_ring", c, { r: r - 0.05, color: col[1], life, size: 0.45 });
  vfx(dim, "vfx_fill", c, { r, color: col[2], life, size: 1, a: 0.35 });
}
function segDist(p, a, b) {
  const ab = { x: b.x - a.x, z: b.z - a.z }, ap = { x: p.x - a.x, z: p.z - a.z };
  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.z * ab.z) / ((ab.x * ab.x + ab.z * ab.z) || 1)));
  return Math.hypot(p.x - (a.x + ab.x * t), p.z - (a.z + ab.z * t));
}
/** 선 위의 적 (수평 거리 w 이내) */
function onLine(ctx, a, b, w, fn) {
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
  const r = Math.hypot(b.x - a.x, b.z - a.z) / 2 + w;
  for (const e of M.around(ctx.p.dimension, mid, r)) if (segDist(e.location, a, b) <= w && Math.abs(e.location.y - mid.y) < 3) fn(e);
}
function heal(t, amt) {
  try {
    const hp = t.getComponent("minecraft:health");
    hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + amt * Math.max(1, hp.effectiveMax / 60)));  // V12.109: 체력 최대 1000 → 고정 회복량도 비례
  } catch {}
}
const snd = (p, id, pitch = 1, v = 1) => M.sound(p, id, pitch, v);

export const ELEMENTS = {
  // ───── 번개 ─────
  thunder_cross: {
    name: "뇌인 교차 (앞쪽에 교차하는 빛의 선)",
    run(ctx, o) {
      const { p, dim } = ctx, col = C.thunder, n = o.lines ?? 3, L = o.len ?? 12;
      M.anim(p, "slash");
      const f = M.flat(p), c = { x: p.location.x + f.x * 5, y: p.location.y + 1.1, z: p.location.z + f.z * 5 };
      vfx(dim, "vfx_flash", c, { color: col[0], life: 0.25, size: 1.2 });
      for (let i = 0; i < n; i++) {
        later(1 + i * 2, () => {
          const a = Math.random() * Math.PI, tilt = (Math.random() - 0.5) * 0.5;
          const d = { x: Math.cos(a), y: tilt, z: Math.sin(a) };
          const A = { x: c.x - d.x * L / 2, y: c.y - d.y * L / 2, z: c.z - d.z * L / 2 }, B = { x: c.x + d.x * L / 2, y: c.y + d.y * L / 2, z: c.z + d.z * L / 2 };
          beam(dim, A, B, col, { w: 0.5 });
          onLine(ctx, A, B, 1.3, (e) => M.pain(ctx, e, 1 / n + 0.3));
          snd(p, "ambient.weather.lightning.impact", 1.8, 0.4);
        });
      }
    },
  },
  thunder_pierce: {
    name: "천뢰 관통 (시선 방향 거대한 빛의 선 + 번개)",
    run(ctx, o) {
      const { p, dim } = ctx, col = C.thunder, L = o.len ?? 36;
      M.anim(p, "raise");
      const f = M.flat(p), c = up(p.location, 2.2);
      const A = { x: c.x - f.x * L * 0.4, y: c.y, z: c.z - f.z * L * 0.4 }, B = { x: c.x + f.x * L * 0.6, y: c.y - 0.6, z: c.z + f.z * L * 0.6 };
      for (let i = 0; i < 4; i++) later(i * 2, () => bolt(dim, up(c, (Math.random() - 0.5)), { x: c.x + (Math.random() - 0.5) * 8, y: c.y + Math.random() * 2, z: c.z + (Math.random() - 0.5) * 8 }, col, 0.8));
      later(8, () => {
        beam(dim, A, B, col, { w: 0.8, life: 0.9, dur: 0.12 });
        vfx(dim, "vfx_flash", c, { color: col[1], life: 0.3, size: 2 });
        onLine(ctx, A, B, 2, (e) => M.pain(ctx, e, 1.5));
        snd(p, "ambient.weather.thunder", 1.4, 0.8);
      });
    },
  },
  thunder_domain: {
    name: "뇌전 영역 (빛의 고리 안 적에게 주기적 낙뢰)",
    run(ctx, o) {
      const { p, dim } = ctx, col = C.thunder, r = o.r ?? 7, secs = o.secs ?? 8;
      M.anim(p, "raise");
      const c = { ...p.location };
      domain(dim, c, r, col, secs);
      beam(dim, c, up(c, 3.5), col, { w: 0.3, life: 1.2, dur: 0.15 });
      snd(p, "beacon.activate", 1.6, 0.8);
      for (let i = 1; i <= secs; i++) {
        later(i * 20, () => {
          for (const e of M.around(dim, c, r).slice(0, 6)) {
            bolt(dim, up(e.location, 9), up(e.location, 0.5), col, 0.7);
            vfx(dim, "vfx_flash", up(e.location, 1), { color: col[0], life: 0.2, size: 0.8 });
            M.pain(ctx, e, o.tick ?? 0.45);
          }
          snd(p, "ambient.weather.lightning.impact", 1.5, 0.3);
        });
      }
    },
  },
  thunder_judgement: {
    name: "천뢰 난무 (영역 + 교차하는 빛의 선 연속 → 섬광)",
    run(ctx, o) {
      const { p, dim } = ctx, col = C.thunder, r = o.r ?? 8, n = o.lines ?? 8;
      M.anim(p, "raise");
      M.invuln(p, 2);
      const c = { ...p.location };
      domain(dim, c, r, col, 3);
      for (let i = 0; i < n; i++) {
        later(6 + i * 2, () => {
          const a = Math.random() * Math.PI * 2, L = r * 2.4;
          const d = { x: Math.cos(a), y: 0.08 * (Math.random() - 0.5), z: Math.sin(a) };
          const off = (Math.random() - 0.5) * r * 0.6;
          const mid = { x: c.x - d.z * off, y: c.y + 1, z: c.z + d.x * off };
          const A = { x: mid.x - d.x * L / 2, y: mid.y, z: mid.z - d.z * L / 2 }, B = { x: mid.x + d.x * L / 2, y: mid.y, z: mid.z + d.z * L / 2 };
          beam(dim, A, B, col, { w: 0.6, life: 0.8 });
          onLine(ctx, A, B, 1.6, (e) => M.pain(ctx, e, 0.35));
          snd(p, "ambient.weather.lightning.impact", 1.7 - i * 0.05, 0.4);
        });
      }
      later(8 + n * 2, () => {
        vfx(dim, "vfx_flash", up(c, 1), { color: col[1], life: 0.4, size: 4 });
        M.area(ctx, c, r, (e) => M.pain(ctx, e, 1.6));
        snd(p, "ambient.weather.thunder", 1.2);
      });
    },
  },

  // ───── 물 ─────
  water_circle: {
    name: "수류 법진 (마법진 + 물기둥, 파티 회복)",
    run(ctx, o) {
      const { p, dim } = ctx, col = C.water, r = o.r ?? 4, secs = o.secs ?? 3;
      M.anim(p, "raise");
      const c = { ...p.location };
      vfx(dim, "vfx_sigil", c, { r, color: col[0], life: secs, yaw: p.getRotation().y });
      vfx(dim, "vfx_ring", c, { r: r * 1.02, color: col[1], life: secs, size: 0.5 });
      later(6, () => vfx(dim, "vfx_fountain", c, { r, color: col[1], life: secs - 0.3 }));
      snd(p, "bubble.upinside", 1, 1);
      const amt = (4 + ctx.stat("int") * 0.3) * ctx.s.pow;
      for (let i = 0; i < secs; i++) {
        later(10 + i * 20, () => {
          for (const t of [p, ...nearbyMembers(p, 12)]) if (Math.hypot(t.location.x - c.x, t.location.z - c.z) <= r + 1) heal(t, amt);
          M.area(ctx, c, r, (e) => M.pain(ctx, e, 0.3));
        });
      }
    },
  },
  water_vortex: {
    name: "와류 (소용돌이 물결로 끌어당김)",
    run(ctx, o) {
      const { p, dim } = ctx, col = C.water, r = o.r ?? 5;
      M.anim(p, "spin");
      const c = { ...p.location };
      vfx(dim, "vfx_swirl", c, { r, color: col[0], dur: 1.4, spin: 600 });
      vfx(dim, "vfx_swirl", c, { r: r * 0.8, color: col[1], dur: 1.4, spin: 640 });
      vfx(dim, "vfx_ring", c, { r, color: col[2], life: 1.4, size: 0.7 });
      snd(p, "bucket.empty_water", 0.8);
      for (let i = 0; i < 5; i++) later(4 + i * 6, () => M.area(ctx, c, r + 1, (e) => { M.pain(ctx, e, 0.3); M.toss(c, e, -6, 1); }));
    },
  },
  water_tide: {
    name: "해일 법진 (큰 마법진 → 분출, 적은 띄우고 아군은 회복)",
    run(ctx, o) {
      const { p, dim } = ctx, col = C.water, r = o.r ?? 7;
      M.anim(p, "raise");
      const c = M.lookPoint(p, 20);
      vfx(dim, "vfx_sigil", c, { r, color: col[0], life: 2.4, yaw: p.getRotation().y });
      vfx(dim, "vfx_ring", c, { r: r * 1.02, color: col[1], life: 2.4, size: 0.6 });
      snd(p, "beacon.power", 1.5, 0.8);
      later(26, () => {
        vfx(dim, "vfx_fountain", c, { r, color: col[1], life: 1.4 });
        vfx(dim, "vfx_flash", up(c, 1), { color: col[0], life: 0.35, size: 3 });
        M.area(ctx, c, r, (e) => { M.pain(ctx, e, 1.6); M.toss(c, e, 0, 9); });
        for (const t of [p, ...nearbyMembers(p, 16)]) if (Math.hypot(t.location.x - c.x, t.location.z - c.z) <= r + 1) heal(t, 8 * ctx.s.pow);
        snd(p, "bucket.empty_water", 0.5);
      });
    },
  },

  // ───── 불 ─────
  fire_whirl: {
    name: "화염 선회 (회전하는 불꽃 베기 + 불티)",
    run(ctx, o) {
      const { p, dim } = ctx, col = C.fire, r = o.r ?? 3.6;
      M.anim(p, "spin");
      const c = { ...p.location };
      vfx(dim, "vfx_swirl", c, { r, color: col[0], dur: 0.45, spin: 1100 });
      vfx(dim, "vfx_swirl", c, { r: r * 0.9, color: col[1], dur: 0.45, spin: 1150 });
      vfx(dim, "vfx_ember", up(c, 0.8), { r: r * 0.7, n: 40, color: col[1] });
      vfx(dim, "vfx_ember", up(c, 0.5), { r: r * 0.5, n: 25, color: col[2] });
      snd(p, "mob.blaze.shoot", 0.9);
      later(4, () => M.area(ctx, c, r + 0.5, (e) => { M.pain(ctx, e, 1); try { e.setOnFire(3, true); } catch {} }));
    },
  },
  fire_dash: {
    name: "작열 질주 (불티 궤적을 남기며 돌진)",
    run(ctx, o) {
      const { p, dim } = ctx, col = C.fire;
      M.anim(p, "dash");
      M.leap(p, 22, 1);
      const hit = new Set();
      for (let i = 0; i < 8; i++) {
        later(i + 1, () => {
          vfx(dim, "vfx_ember", up(p.location, 0.9), { r: 0.6, n: 14, color: i % 2 ? col[1] : col[0] });
          vfx(dim, "vfx_flash", up(p.location, 1), { color: col[0], life: 0.15, size: 0.5 });
          M.area(ctx, p.location, 2.2, (e) => { if (hit.has(e.id)) return; hit.add(e.id); M.pain(ctx, e, 1); try { e.setOnFire(3, true); } catch {} });
        });
      }
      later(10, () => { vfx(dim, "vfx_swirl", p.location, { r: 2.5, color: col[0], dur: 0.3, spin: 1200 }); });
      snd(p, "mob.blaze.shoot", 1.3);
    },
  },
  fire_fall: {
    name: "업화 강림 (도약 → 불꽃 소용돌이 + 고리 폭발)",
    run(ctx, o) {
      const { p, dim } = ctx, col = C.fire, r = o.r ?? 5;
      M.anim(p, "raise");
      M.invuln(p, 2);
      M.leap(p, 8, 9);
      let t = 0;
      const loop = () => {
        t++;
        let g = false;
        try { g = p.isOnGround; } catch {}
        if (!p.isValid()) return;
        if ((t > 5 && g) || t > 40) {
          M.anim(p, "smash");
          const c = { ...p.location };
          vfx(dim, "vfx_swirl", c, { r, color: col[0], dur: 0.6, spin: 900 });
          vfx(dim, "vfx_swirl", c, { r: r * 0.85, color: col[1], dur: 0.6, spin: 960 });
          vfx(dim, "vfx_ring", c, { r, color: col[0], life: 1, size: 1 });
          vfx(dim, "vfx_ember", up(c, 0.5), { r: r * 0.6, n: 60, color: col[1] });
          vfx(dim, "vfx_flash", up(c, 1), { color: col[1], life: 0.3, size: 3 });
          M.area(ctx, c, r, (e) => { M.pain(ctx, e, 1.4); M.toss(c, e, 4, 7); try { e.setOnFire(5, true); } catch {} });
          snd(p, "random.explode", 0.8);
          return;
        }
        if (t % 2 === 0) vfx(dim, "vfx_ember", up(p.location, 0.5), { r: 0.4, n: 8, color: col[0] });
        later(1, loop);
      };
      later(1, loop);
    },
  },
};
