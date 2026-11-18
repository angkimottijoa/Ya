// ═══════════════════════════════════════════════════════════════════════
// Arcania MagicSpells (V2.9) — 자바 MagicSpells + EffectLib 를 베드락 스크립트로 옮긴 엔진
//
//   자바 MagicSpells                    →  이 엔진
//   ──────────────────────────────────────────────────────────────
//   .MultiSpell  (spells: [... DELAY n]) →  multi(ctx, [fn, "DELAY n", fn ...])
//   .TargetedMultiSpell                  →  multiOn(ctx, target, [...])
//   .instant.LeapSpell                   →  leap(p, forward, upward)
//   .targeted.AreaEffectSpell            →  area(ctx, center, r, fn, max)
//   .instant.ParticleProjectileSpell     →  proj(ctx, { speed, dist, yawOff, hug, trail, onHit, onEnd })
//   .targeted.PainSpell                  →  pain(ctx, e, 배율)
//   .targeted.DrainlifeSpell             →  drain(ctx, e, 배율, 회복)
//   .targeted.ForcetossSpell             →  toss(from, e, horizontal, vertical)   (음수 = 끌어당김)
//   .targeted.StunSpell                  →  stun(e, 초)
//   .targeted.PotionEffectSpell          →  potion(e, 효과, 레벨, 초)
//   .targeted.ShadowstepSpell            →  shadowstep(p, e)
//   .buff.InvulnerabilitySpell           →  invuln(p, 초)
//   .buff.InvisibilitySpell              →  invis(p, 초)
//   .targeted.DotSpell                   →  dot(ctx, e, 간격, 횟수, 배율)
//
//   EffectLib (redstone 먼지)           →  커스텀 파티클 (resource_pack/particles/rpg_ms_*.json)
//   ──────────────────────────────────────────────────────────────
//   EquationEffect  x/y/z(t)             →  eq()    : rpg:ms_curve  (식의 계수를 Molang 으로 계산)
//   SphereEffect / ModifiedEffect        →  ball()  : rpg:ms_ball   (grow = 반지름 증가 속도)
//   AnimatedBallEffect (x/y/zFactor)     →  ball()  : fx/fy/fz 로 타원체
//   HelixEffect / VortexEffect           →  helix() : rpg:ms_helix
//   StarEffect                           →  star()  : rpg:ms_star
//
// 식 표기: 한 축 = (a + g·t)·sin|cos(w·t + p) + b·t + c ,  t ∈ [0, 1]  (각도 단위: 도)
//   EffectLib 의 "3.8sin(0.0125t)", particles 255 → a 3.8, w = 0.0125·255 rad = 183°
// ═══════════════════════════════════════════════════════════════════════
import { system, MolangVariableMap, EntityDamageCause } from "@minecraft/server";

// ───────── 색 / 팔레트 ─────────
export const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
// 참고 스펠들의 색 조합 (같은 계열 3~4단 → 겹쳐 그리면 입체감)
export const PAL = {
  blood: ["#990000", "#C11B17", "#FF3333", "#2B1B17"], // 도살자 / 블라디
  steel: ["#990000", "#2C3539", "#25383C", "#C11B17"], // 데런(총칼)
  ember: ["#F75D59", "#F62217", "#9F000F", "#FFB347"], // 크티아스
  frost: ["#8EEBEC", "#81D8D0", "#3EA99F", "#438D80"], // 바이던트
  storm: ["#64B5F6", "#000000", "#1E88E5", "#E3F2FD"], // 네일링
  moon: ["#4B0082", "#151B8D", "#FFF380", "#7B68EE"], // 클라우
  shadow: ["#4D00ED", "#000000", "#FF9999", "#2E0854"], // 쉐도어
  forest: ["#2E7D32", "#66BB6A", "#000000", "#FFFFFF"], // 레인저
  holy: ["#FFF380", "#FFFFFF", "#E6C35C", "#F5DEB3"],
  cloud: ["#FFFFFF", "#DDDDDD", "#BBBBBB", "#FFFFFF"], // 도사
};
const col = (c) => (typeof c === "string" ? hex(c) : c);

// ───────── 식 항 ─────────
/** sin 항: (a + g·t)·sin(w·t + p) + b·t + c */
export const S = (a, w, p = 0, g = 0, b = 0, c = 0) => ({ a, w, p, g, b, c, s: 1 });
/** cos 항 */
export const C = (a, w, p = 0, g = 0, b = 0, c = 0) => ({ a, w, p, g, b, c, s: 0 });
/** 직선 항: b·t + c */
export const L = (b, c = 0) => ({ a: 0, w: 0, p: 0, g: 0, b, c, s: 0 });
/** 상수 */
export const K = (c) => L(0, c);

function setTerm(m, k, t = K(0)) {
  m.setFloat(`variable.a${k}`, t.a ?? 0);
  m.setFloat(`variable.g${k}`, t.g ?? 0);
  m.setFloat(`variable.w${k}`, t.w ?? 0);
  m.setFloat(`variable.p${k}`, t.p ?? 0);
  m.setFloat(`variable.s${k}`, t.s ?? 0);
  m.setFloat(`variable.b${k}`, t.b ?? 0);
  m.setFloat(`variable.c${k}`, t.c ?? 0);
}
function base(o) {
  const m = new MolangVariableMap();
  const c = col(o.color ?? "#FFFFFF");
  m.setColorRGBA("variable.color", { red: c[0], green: c[1], blue: c[2], alpha: 1 });
  m.setFloat("variable.n", Math.max(1, Math.min(600, o.n ?? 120)));
  m.setFloat("variable.dur", o.dur ?? 0);
  m.setFloat("variable.draw", o.dur ? 1 : 0);
  m.setFloat("variable.life", o.life ?? 0.9);
  m.setFloat("variable.size", o.size ?? 1);
  m.setFloat("variable.rise", o.rise ?? 0);
  m.setFloat("variable.yaw", o.yaw ?? 0);
  return m;
}
function spawn(dim, id, loc, m) {
  try { dim.spawnParticle(id, loc, m); } catch {}
}

// ───────── EffectLib 효과 ─────────
/** EquationEffect. o: { x, y, z (항), n, dur(그려지는 초), life, size, color, yaw(지정 시 orient), jit } */
export function eq(dim, loc, o) {
  const m = base(o);
  setTerm(m, "x", o.x);
  setTerm(m, "y", o.y);
  setTerm(m, "z", o.z);
  m.setFloat("variable.ori", o.yaw === undefined ? 0 : 1);
  m.setFloat("variable.jit", o.jit ?? 0.04);
  spawn(dim, "rpg:ms_curve", loc, m);
}
/** Sphere / AnimatedBall / ModifiedEffect. o: { r, fx, fy, fz, grow(초당 퍼짐), oy, n, life, color } */
export function ball(dim, loc, o) {
  const m = base(o);
  m.setFloat("variable.r", o.r ?? 1);
  m.setFloat("variable.fx", o.fx ?? 1);
  m.setFloat("variable.fy", o.fy ?? 1);
  m.setFloat("variable.fz", o.fz ?? 1);
  m.setFloat("variable.grow", o.grow ?? 0);
  m.setFloat("variable.oy", o.oy ?? 0);
  spawn(dim, "rpg:ms_ball", loc, m);
}
/** Helix / Vortex. o: { strands, r, h, twist(도), flare, n, dur, color } */
export function helix(dim, loc, o) {
  const m = base(o);
  m.setFloat("variable.strands", o.strands ?? 3);
  m.setFloat("variable.r", o.r ?? 1);
  m.setFloat("variable.h", o.h ?? 0);
  m.setFloat("variable.twist", o.twist ?? 360);
  m.setFloat("variable.flare", o.flare ?? 0);
  spawn(dim, "rpg:ms_helix", loc, m);
}
/** StarEffect. o: { spikes, h(가시 길이), inner, n, color } */
export function star(dim, loc, o) {
  const m = base(o);
  m.setFloat("variable.spikes", o.spikes ?? 8);
  m.setFloat("variable.h", o.h ?? 2);
  m.setFloat("variable.inner", o.inner ?? 0.3);
  spawn(dim, "rpg:ms_star", loc, m);
}
/** 팔레트 여러 색을 조금씩 다르게 겹쳐 그리기 (참고 스펠의 3~4겹 색 레이어) */
export function layered(pal, fn) {
  pal.forEach((c, i) => fn(c, i));
}

// ── 자주 쓰는 모양 (EffectLib 식을 모양 이름으로 정리) ──
/** 수평 고리/타원. arc = 그릴 비율(1 = 한 바퀴) */
export function ring(dim, loc, r, color, o = {}) {
  const w = 360 * (o.arc ?? 1), p = o.start ?? 0;
  eq(dim, loc, { x: C(r, w, p, o.g ?? 0), y: o.y ?? K(o.h ?? 0.1), z: S(o.rz ?? r, w, p, o.g ?? 0), n: o.n ?? Math.round(40 + r * 30), color, ...o });
}
/** 앞쪽 수평 베기 (yaw 기준 좌→우 호). tilt 로 대각선 */
export function slashH(dim, loc, yaw, r, color, o = {}) {
  const span = o.span ?? 200;
  eq(dim, loc, {
    x: S(r, -span, span / 2), z: C(o.rz ?? r * 0.85, -span, span / 2),
    y: S(o.tilt ?? 0, -span, span / 2, 0, 0, o.h ?? 1.1),
    yaw, n: o.n ?? Math.round(60 + r * 30), color, dur: o.dur ?? 0.12, life: o.life ?? 0.55, ...o,
  });
}
/** 앞쪽 수직 베기 (머리 위 → 발 앞) */
export function slashV(dim, loc, yaw, r, color, o = {}) {
  const span = o.span ?? 220;
  eq(dim, loc, {
    x: S(o.skew ?? 0, -span, span / 2), y: C(r, -span, span / 2, 0, 0, o.h ?? 1), z: S(r * 0.9, -span, span / 2, 0, 0, o.fwd ?? 0.6),
    yaw, n: o.n ?? Math.round(60 + r * 30), color, dur: o.dur ?? 0.12, life: o.life ?? 0.55, ...o,
  });
}
/** 바닥 나선 (크티아스 혈풍 / 바이던트): 반지름이 커지며 여러 바퀴 */
export function spiral(dim, loc, r, turns, color, o = {}) {
  eq(dim, loc, { x: C(o.r0 ?? 0.2, 360 * turns, o.start ?? 0, r), z: S(o.r0 ?? 0.2, 360 * turns, o.start ?? 0, r), y: K(o.h ?? 0.1), n: o.n ?? 160, color, dur: o.dur ?? 0.4, ...o });
}
/** 회오리 기둥 (yEquation 0.0055t-1 : 감기며 올라감) */
export function coil(dim, loc, r, height, turns, color, o = {}) {
  eq(dim, loc, { x: S(r, 360 * turns, o.start ?? 0, o.g ?? 0), z: C(r, 360 * turns, o.start ?? 0, o.g ?? 0), y: L(height, o.y0 ?? -0.5), n: o.n ?? 220, color, dur: o.dur ?? 0.5, ...o });
}
/** 두 점 사이 선 (Drainlife / 연쇄) */
export function line(dim, a, b, color, o = {}) {
  eq(dim, a, { x: L(b.x - a.x), y: L(b.y - a.y), z: L(b.z - a.z), n: o.n ?? Math.round(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 10), color, jit: o.jit ?? 0.08, ...o });
}
/** 머리 위 표식 (총칼 RCtarget: 대상 머리 위 원 + 십자) */
export function mark(dim, e, color, h = 2.6) {
  const l = e.location;
  ring(dim, l, 0.5, color, { h, n: 36, life: 0.5 });
  eq(dim, l, { x: K(0), y: S(0.9, 360, 0, 0, 0, h), z: C(0.9, 360), n: 30, color, life: 0.5 });
}

// ───────── 플레이어 모션 ─────────
// 3D 무기(사신수 · 혼돈)를 들고 있으면 스킬 동작을 무기에 맞는 것으로 바꿈 (gen_anims.py w3d_moves)
const W3D_MAP = {
  "rpg:jujak_bow": { reload: "w3d_bow_nock", shoot: "w3d_bow_shot", shoot_up: "w3d_bow_up", bow_draw: "w3d_bow_shot", bow_hold: "w3d_bow_hold", cast: "w3d_bow_shot", raise: "w3d_bow_up" },
  melee: { shoot: "w3d_m_thrust", cast: "w3d_m_thrust", shoot_up: "w3d_m_upslash", raise: "w3d_m_raise" },
};
const W3D_MELEE = new Set(["rpg:hundun_scythe", "rpg:cheongryong_sword", "rpg:baekho_axe", "rpg:hyeonmu_shield", "rpg:jt_warrior", "rpg:jt_mage", "rpg:jt_cleric", "rpg:jt_swordmaster", "rpg:jt_berserker", "rpg:jt_elementalist", "rpg:jt_stormcaller", "rpg:jt_paladin", "rpg:jt_priest"]);
function w3dName(p, name) {
  let id; try { id = p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex)?.typeId; } catch {}
  const m = ["rpg:jujak_bow", "rpg:jt_archer", "rpg:jt_hunter", "rpg:jt_sniper"].includes(id) ? W3D_MAP["rpg:jujak_bow"] : W3D_MELEE.has(id) ? W3D_MAP.melee : null;
  return (m && m[name]) || name;
}
export function anim(p, name) {
  name = w3dName(p, name);
  try {
    p.playAnimation(`animation.rpg.${name}`, { blendOutTime: 0.15 });
  } catch {
    try { p.runCommand(`playanimation @s animation.rpg.${name} default 0.15`); } catch {}
  }
}
export function sound(p, id, pitch = 1, volume = 1) {
  try { p.dimension.playSound(id, p.location, { pitch, volume }); } catch {
    try { p.playSound(id, { pitch, volume }); } catch {}
  }
}

// ───────── 시퀀스 (MultiSpell) ─────────
export const later = (t, fn) => system.runTimeout(() => { try { fn(); } catch {} }, Math.max(0, Math.round(t)));
/** MagicSpells MultiSpell: 함수와 "DELAY n" 을 순서대로 */
export function multi(ctx, steps) {
  let t = 0;
  for (const st of steps) {
    if (typeof st === "string") {
      const m = /^DELAY\s+(\d+)/.exec(st);
      if (m) t += Number(m[1]);
    } else if (typeof st === "function") {
      later(t, () => {
        if (ctx.p.isValid()) st(ctx);
      });
    }
  }
  return t;
}
/** TargetedMultiSpell: 대상이 살아 있는 동안만 */
export function multiOn(ctx, target, steps) {
  return multi(ctx, steps.map((st) => (typeof st === "function" ? () => target.isValid() && st(target) : st)));
}

// ───────── 대상 / 판정 ─────────
const EXCLUDE = { excludeTypes: ["minecraft:player", "minecraft:item", "minecraft:xp_orb", "rpg:npc", "minecraft:armor_stand"], excludeFamilies: ["inanimate"] };
export const skillHit = new Map(); // victimId -> tick (combat.js 가 스탯 보너스 중복 방지에 참조)
export function around(dim, loc, r) {
  try { return dim.getEntities({ location: loc, maxDistance: r, ...EXCLUDE }); } catch { return []; }
}
/** AreaEffectSpell: 중심 반경 r 안의 적에게 fn (max-targets) */
export function area(ctx, center, r, fn, max = 1000) {
  const list = around(ctx.p.dimension, center, r).slice(0, max);
  for (const e of list) fn(e);
  return list;
}
export function looked(p, max = 24) {
  return p.getEntitiesFromViewDirection({ maxDistance: max, ...EXCLUDE })[0]?.entity;
}
export function lookPoint(p, max = 24) {
  const e = looked(p, max);
  if (e) return { ...e.location };
  const b = p.getBlockFromViewDirection({ maxDistance: max });
  if (b) return { x: b.block.location.x + 0.5, y: b.block.location.y + 1, z: b.block.location.z + 0.5 };
  const v = p.getViewDirection(), h = p.getHeadLocation();
  return { x: h.x + v.x * max * 0.5, y: h.y + v.y * max * 0.5, z: h.z + v.z * max * 0.5 };
}
export function flat(p, yawOff = 0) {
  const y = ((p.getRotation().y + yawOff) * Math.PI) / 180;
  return { x: -Math.sin(y), y: 0, z: Math.cos(y) };
}

// ───────── 효과 (Pain / Drain / Toss / Stun / Potion ...) ─────────
/** PainSpell: ctx.dmg × 배율 */
export function pain(ctx, e, mul = 1) {
  if (!e?.isValid()) return;
  skillHit.set(e.id, system.currentTick);
  try { e.applyDamage(Math.max(1, ctx.dmg * mul), { cause: EntityDamageCause.entityAttack, damagingEntity: ctx.p }); } catch {}
}
/** DrainlifeSpell: 피해 + 시전자 회복 + 둘 사이 선 */
export function drain(ctx, e, mul = 1, heal = 2, color = ctx.pal[0]) {
  pain(ctx, e, mul);
  try {
    const hp = ctx.p.getComponent("minecraft:health");
    hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + heal));
  } catch {}
  line(ctx.p.dimension, { ...e.location, y: e.location.y + 1 }, { ...ctx.p.location, y: ctx.p.location.y + 1 }, color, { dur: 0.25 });
}
/** ForcetossSpell: 양수 = 밀어냄 / 음수 = 끌어당김, vertical 양수 = 띄움 */
export function toss(from, e, h, v) {
  const dx = e.location.x - from.x, dz = e.location.z - from.z, l = Math.hypot(dx, dz) || 1;
  try { e.applyKnockback(dx / l, dz / l, h / 10, v / 10); } catch {}
}
export function stun(e, sec) {
  try {
    e.addEffect("slowness", Math.round(sec * 20), { amplifier: 10, showParticles: false });
    e.addEffect("weakness", Math.round(sec * 20), { amplifier: 3, showParticles: false });
  } catch {}
}
export function potion(e, id, lvl, sec) {
  try { e.addEffect(id, Math.round(sec * 20), { amplifier: Math.max(0, lvl - 1), showParticles: false }); } catch {}
}
export function invuln(p, sec) {
  potion(p, "resistance", 5, sec);
}
export function invis(p, sec) {
  potion(p, "invisibility", 1, sec);
}
/** ShadowstepSpell: 대상 등 뒤로 순간이동 */
export function shadowstep(p, e) {
  if (!e?.isValid()) return false;
  const y = (e.getRotation().y * Math.PI) / 180;
  const to = { x: e.location.x + Math.sin(y) * 1.4, y: e.location.y, z: e.location.z - Math.cos(y) * 1.4 };
  try {
    p.teleport(to, { facingLocation: e.location, keepVelocity: false });
    return true;
  } catch { return false; }
}
/** DotSpell: interval 틱마다 count 번 */
export function dot(ctx, e, interval, count, mul) {
  for (let i = 1; i <= count; i++) later(i * interval, () => pain(ctx, e, mul));
}
/** LeapSpell: forward/upward 는 MagicSpells 값(10 ≈ 1블록/틱) 그대로. 음수 forward = 뒤로 */
export function leap(p, forward, upward, yawOff = 0) {
  const f = flat(p, yawOff);
  const dir = forward < 0 ? -1 : 1;
  try { p.applyKnockback(f.x * dir, f.z * dir, Math.abs(forward) / 10, upward / 10); } catch {}
}

// ───────── ParticleProjectileSpell ─────────
/**
 * o: { speed(블록/틱), dist, yawOff(도), pitchOff, from, dir, hug(지면 높이 유지), hitR, pierce,
 *      trail(pos, i, dir), onHit(e, pos), onEnd(pos) }
 */
export function proj(ctx, o) {
  const p = ctx.p, dim = p.dimension;
  let dir = o.dir;
  if (!dir) {
    const r = p.getRotation();
    const yaw = ((r.y + (o.yawOff ?? 0)) * Math.PI) / 180;
    const pit = (((o.hug ? 0 : r.x) + (o.pitchOff ?? 0)) * Math.PI) / 180;
    dir = { x: -Math.sin(yaw) * Math.cos(pit), y: -Math.sin(pit), z: Math.cos(yaw) * Math.cos(pit) };
  }
  const h = p.getHeadLocation();
  let pos = o.from ? { ...o.from } : { x: h.x, y: o.hug ? p.location.y + (o.hugH ?? 1) : h.y - 0.2, z: h.z };
  const speed = o.speed ?? 1.5, max = o.dist ?? 24;
  const hitR = o.hitR ?? 1.3, done = new Set();
  let went = 0, i = 0;
  const job = system.runInterval(() => {
    try {
      if (!p.isValid()) return system.clearRun(job);
      const steps = Math.max(1, Math.ceil(speed / 0.8));
      for (let k = 0; k < steps; k++) {
        pos = { x: pos.x + (dir.x * speed) / steps, y: pos.y + (dir.y * speed) / steps, z: pos.z + (dir.z * speed) / steps };
        went += speed / steps;
        if (o.hug) {
          try {
            const below = dim.getBlockBelow?.({ x: pos.x, y: pos.y + 1, z: pos.z }, { maxDistance: 4 });
            if (below) pos.y = below.location.y + 1 + (o.hugH ?? 0.2);
          } catch {}
        } else {
          try {
            const b = dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) });
            if (b && !b.isAir && !b.isLiquid && o.stopOnGround !== false) {
              system.clearRun(job);
              o.onEnd?.(pos);
              return;
            }
          } catch {}
        }
        for (const e of around(dim, pos, hitR)) {
          if (done.has(e.id)) continue;
          done.add(e.id);
          o.onHit?.(e, pos);
          if (!o.pierce) {
            system.clearRun(job);
            o.onEnd?.(pos);
            return;
          }
        }
      }
      o.trail?.(pos, i++, dir);
      if (went >= max) {
        system.clearRun(job);
        o.onEnd?.(pos);
      }
    } catch {
      system.clearRun(job);
    }
  }, 1);
  return job;
}
