// ═══════════════════════════════════════════════════════════════════════
// 흑룡의 검 (V12.146) — 사신수급 · 연계 중심 · 극한 기동 · 사슬
//   「용맥」 1~5단: 스킬로 적을 맞힌 뒤 1.5초 안에 다른 스킬로 이어 맞히면 한 단계 오름 (단계마다 위력 +6%, 이펙트 강해짐), 끊기면 처음부터
//   ① 연참   4타: 칠 때마다 시선 쪽으로 미끄러지며 벰 · 공중에서 치면 체공 유지 · 4타 = 회전베기 + 사슬 채찍(먼 적을 끌어옴)
//            분기: ② 직후 ① = 추격 베기(방금 꿰뚫은 적에게 사슬로 되돌아가 꽂음) · 승천 중 ① = 공중 순간이동 베기 · 천쇄 중 ① = 회전 도약
//   ② 사슬 섬영  2회 충전: 조준점(적 · 벽 · 허공 10칸)에 사슬을 박고 그쪽으로 끌려가며 그 선을 벰, 0.5초 뒤 지나간 자리가 터짐
//            분기: ① 4타 직후 ② = 역린(같은 선을 되짚어 X자 베기) · 천쇄 중 ② = 걸린 사슬을 끊고 그 속도 그대로 섬영
//   ③ 천쇄   (혼돈에서 옮김) 사슬 입체 기동 + 등에 흑룡 날개 · 지나가며 베기 · 벽 차기 — 끝나면 25초 대기
//   ④ 승천   땅에서 사슬이 솟아 둘레 적을 공중으로 끌어올리고 같이 솟구침 → 떠 있는 동안 클릭마다 적 사이를 순간이동 베기(최대 6)
//            → 내리꽂기. 용맥 5단이면 거대한 흑룡 형상이 함께 내리꽂히고 위력 1.5배
// 파티클: gen_heukryong.py (hr_*)
// ═══════════════════════════════════════════════════════════════════════
import { system, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
import * as M from "./ms.js";
import { spend } from "./pbudget.js";
import { odmStart, odmActive, odmHop, odmLeap, odmLeft, odmDetach } from "./fiends.js";

const ID = "rpg:heukryong_sword";
const later = (t, fn) => system.runTimeout(() => { try { fn(); } catch {} }, Math.max(1, Math.round(t)));
const up = (l, y) => ({ x: l.x, y: l.y + y, z: l.z });
const yawOf = (p) => p.getRotation().y;
const rad = (d) => (d * Math.PI) / 180;
const fwdOf = (yaw) => ({ x: -Math.sin(rad(yaw)), y: 0, z: Math.cos(rad(yaw)) });
const rightOf = (yaw) => ({ x: -Math.cos(rad(yaw)), y: 0, z: -Math.sin(rad(yaw)) });
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scl = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (v) => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const crs = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const UP = { x: 0, y: 1, z: 0 };
const center = (e) => up(e.location, 0.9);
const snd = (p, id, vol = 1, pitch = 1) => M.sound(p, id, pitch, vol);
const eyeOf = (p) => { try { return p.getHeadLocation(); } catch { return up(p.location, 1.6); } };
const viewOf = (p) => { try { return p.getViewDirection(); } catch { return fwdOf(yawOf(p)); } };
const now = () => system.currentTick;
const notify = (p, t) => { try { p.onScreenDisplay.setActionBar(t); } catch {} };
const shake = (p, pw, sec) => { try { p.runCommand(`camerashake add @s ${pw} ${sec} positional`); } catch {} };
const onGround = (p) => { try { return p.isOnGround; } catch { return true; } };
const vel = (p) => { try { return p.getVelocity(); } catch { return { x: 0, y: 0, z: 0 }; } };
const push = (e, v) => { const h = Math.hypot(v.x, v.z); try { e.applyKnockback(h > 0.001 ? v.x / h : 0, h > 0.001 ? v.z / h : 0, h, v.y); } catch {} };
const heldId = (p) => { try { return p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex)?.typeId; } catch { return undefined; } };

const DEF = { n: 10, r: 0.3, spd: 2, life: 0.6, size: 1, tone: 0, vs: 0, h: 0.3, spin: 0, a0: 0, a1: 0, dur: 0.1 };
function pt(dim, name, loc, o = {}, prio = 1) {
  if (!spend(o.n ?? 10, (o.life ?? 0.6) + (o.dur ?? 0), prio)) return;
  try {
    const m = new MolangVariableMap();
    for (const k of Object.keys(DEF)) m.setFloat(`variable.${k}`, o[k] ?? DEF[k]);
    for (const k of ["u", "v", "w", "vd"]) m.setVector3(`variable.${k}`, o[k] ?? UP);
    dim.spawnParticle(`rpg:${name}`, loc, m);
  } catch {}
}
const foes = (dim, at, r) => M.around(dim, at, r).filter((e) => e.isValid());

// ───────── 상태 · 용맥 ─────────
const ST = new Map();
const st = (p) => { let s = ST.get(p.id); if (!s) ST.set(p.id, (s = { vein: { n: 0, t: -99, key: 0 }, ch: { n: 2, next: 0 } })); return s; };
const VEIN_GAP = 30, VEIN_MAX = 5;
const veinN = (p) => { const v = st(p).vein; return now() - v.t <= VEIN_GAP + 40 ? v.n : 0; };
const veinMul = (p) => 1 + veinN(p) * 0.06;
/** 스킬 key 로 적을 맞힘 → 용맥 단계 */
function vein(p, key) {
  const v = st(p).vein, t = now();
  if (t - v.t > VEIN_GAP + 40) v.n = 1;
  else if (key !== v.key && t - v.t <= VEIN_GAP) { const was = v.n; v.n = Math.min(VEIN_MAX, v.n + 1); if (v.n > was) veinFx(p, v.n); }
  else v.n = Math.max(1, v.n);
  v.t = t; v.key = key;
}
function veinFx(p, n) {
  const dim = p.dimension, c = up(p.location, 1);
  pt(dim, "hr_swirl", c, { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, vd: UP, vs: 2 + n * 0.5, r: 1 + n * 0.25, spin: 700, n: 20 + n * 8, life: 0.45, tone: Math.max(0, 0.3 - n * 0.06) }, 2);
  snd(p, "mob.enderdragon.growl", 0.12 + n * 0.05, 1.6 - n * 0.08);
  if (n === VEIN_MAX) { snd(p, "mob.enderdragon.growl", 0.6, 0.9); shake(p, 0.2, 0.3); notify(p, "§4§l용맥 5단 §r§c— ④ 승천이 흑룡 형상으로"); }
}
/** 흑룡 hitter: 사신수 위력 · 용맥 배율 · 맞히면 용맥 */
function hitter(ctx, key, cdT = 4) {
  const last = new Map(); let any = false;
  return (e, mul, cd = cdT) => {
    if (!e?.isValid() || e.id === ctx.p.id) return false;
    const t = now();
    if (t - (last.get(e.id) ?? -99) < cd) return false;
    last.set(e.id, t);
    M.skillHit.set(e.id, t);
    const d = Math.max(1, Math.round(ctx.dmg * mul * veinMul(ctx.p)));
    try { e.applyDamage(d, { cause: EntityDamageCause.entityAttack, damagingEntity: ctx.p }); } catch {}
    if (!any) { any = true; vein(ctx.p, key); }
    return true;
  };
}

// ───────── 연출 ─────────
const tone = (p) => Math.max(0, 0.25 - veinN(p) * 0.05); // 용맥이 오를수록 밝은 진홍 쪽으로
/** 3D 쇠사슬 a → b */
function wire(dim, a, b, life = 0.12) {
  const d = sub(b, a), L = len(d); if (L < 0.3) return;
  const u = norm(d), w0 = Math.abs(u.y) > 0.9 ? { x: 1, y: 0, z: 0 } : UP, v = norm(crs(u, w0)), w = norm(crs(u, v)), links = Math.max(1, Math.round(L / 0.42));
  pt(dim, "hr_wire", a, { u, v, w, r: L, h: links, n: Math.min(260, links * 7), life, size: 1 }, 1);
}
const flame = (dim, at, o = {}) => pt(dim, "hr_flame", at, { n: o.n ?? 10, r: o.r ?? 0.4, spd: o.spd ?? 1.5, life: o.life ?? 0.7, size: o.size ?? 1, vd: o.vd ?? { x: 0, y: 0, z: 0 }, tone: o.tone ?? 0 }, o.prio ?? 1);
const burst = (dim, at, o = {}) => pt(dim, "hr_burst", at, { n: o.n ?? 14, r: o.r ?? 0.3, spd: o.spd ?? 3, life: o.life ?? 0.45, size: o.size ?? 1, tone: o.tone ?? 0 }, o.prio ?? 1);
/** 베기 호: yaw 기준 앞(f) · 옆(r), tilt 로 기울임, dir 방향, sweep 각 */
function arc(dim, at, yaw, o = {}) {
  const f = fwdOf(yaw), r = rightOf(yaw), t = rad(o.tilt ?? 0), v = { x: r.x * Math.cos(t), y: Math.sin(t), z: r.z * Math.cos(t) }, d = o.dir ?? 1, sw = o.sweep ?? 200;
  pt(dim, "hr_arc", at, { u: f, v, r: o.r ?? 3, h: o.thick ?? 1, a0: (d * sw) / 2, a1: (-d * sw) / 2, dur: o.dur ?? 0.1, life: o.life ?? 0.45, n: o.n ?? 200, size: o.size ?? 1.2, spd: o.spd ?? 2.5, tone: o.tone ?? 0 }, 0);
}
/** 곧은 베기 자국 a → b */
function slash(dim, a, b, o = {}) {
  const d = sub(b, a), L = len(d); if (L < 0.3) return;
  const u = norm(d), w0 = Math.abs(u.y) > 0.9 ? { x: 1, y: 0, z: 0 } : UP, v = o.v ?? norm(crs(u, w0)), w = norm(crs(u, v));
  pt(dim, "hr_slash", a, { u, v, w, r: L, h: o.h ?? 0.7, dur: o.dur ?? 0.08, life: o.life ?? 0.4, n: Math.min(300, Math.round(L * (o.dens ?? 22))), spd: o.spd ?? 1.2, size: o.size ?? 1 }, 0);
}
/** 등에 흑룡 날개 둘 (퍼덕임 위상은 시간으로 이어짐) */
function wings(p, k = 1) {
  const dim = p.dimension, yw = yawOf(p), f = fwdOf(yw), r = rightOf(yw), back = add(up(p.location, 1.42), f, -0.3);
  for (const sg of [-1, 1]) pt(dim, "hr_wing", add(back, r, sg * 0.12), { u: scl(r, sg), v: UP, w: scl(f, -1), r: 1.9 * k, spin: 720, a0: (now() * 36) % 360, n: Math.round(150 * k), life: 0.17, size: 1 }, 2);
}
const speed = (dim, at, v, o = {}) => { const d = norm(v), w0 = Math.abs(d.y) > 0.9 ? { x: 1, y: 0, z: 0 } : UP, a = norm(crs(d, w0)), b = norm(crs(d, a)); pt(dim, "hr_speed", at, { u: a, v: b, vd: d, r: o.r ?? 1.4, spd: o.spd ?? 14, n: o.n ?? 8, life: o.life ?? 0.2, size: 1 }, 2); };

/** 천쇄(입체 기동 엔진) 흑룡 테마 */
const HR_THEME = {
  name: "흑룡 천쇄", col: "§4", col2: "§c", endCd: 25, reel: "hr_reelspark",
  chain: (dim, a, b, life) => wire(dim, a, b, life),
  hook: (dim, at) => { burst(dim, at, { n: 10, r: 0.15, spd: 3, life: 0.35 }); },
  flame: (dim, at, o) => flame(dim, at, o),
  burst: (dim, at) => burst(dim, at, { n: 8, spd: 2, life: 0.35 }),
  speed: (dim, at, v, o) => speed(dim, at, v, o),
  leapFx: (dim, c, yaw) => {
    arc(dim, c, yaw, { sweep: 380, r: 2.8, dur: 0.15, n: 170, life: 0.4 });
    arc(dim, c, yaw, { sweep: 300, r: 2.2, tilt: 60, dur: 0.12, n: 110, life: 0.35, dir: -1 });
    pt(dim, "hr_swirl", c, { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, vd: UP, vs: 3, r: 1.8, spin: 900, n: 44, life: 0.35 }, 2);
  },
  passFx: (dim, cc, yaw, e) => {
    arc(dim, cc, yaw, { sweep: 220, r: 2.4, dur: 0.08, n: 120, life: 0.35 });
    const c = center(e); slash(dim, add(c, rightOf(yaw), -1.6), add(c, rightOf(yaw), 1.6), { h: 0.5, dens: 30 });
    flame(dim, c, { n: 8, r: 0.3, spd: 2.5 });
  },
  onTick: (p, m) => { if (m.t % 3 === 0) wings(p, 1); },
};

// ═════════ ① 연참 ═════════
const combo = new Map();
function step(p, max, gap = 24) { const c = combo.get(p.id), n = c && now() - c.t <= gap ? (c.n + 1) % max : 0; combo.set(p.id, { n, t: now() }); return n; }
function hr_combo(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), yaw = yawOf(p), f = fwdOf(yaw), air = !onGround(p);
  s.ctx = ctx;
  // 분기: ② 직후 = 추격 베기
  if (s.lastDash && now() - s.lastDash.t <= 20 && s.lastDash.ent?.isValid()) return chase(ctx, s.lastDash.ent);
  const n = step(p, 4), hit = hitter(ctx, 1);
  M.anim(p, n === 3 ? "spin" : n % 2 ? "slash_down" : "slash");
  push(p, { x: f.x * (n === 3 ? 0.9 : 0.55), y: air ? 0.24 : 0.04, z: f.z * (n === 3 ? 0.9 : 0.55) });
  if (air) try { M.potion(p, "slow_falling", 0, 0.6); } catch {}
  const c = add(up(p.location, 1.05), f, 1.2), tn = tone(p);
  if (n < 3) {
    arc(dim, c, yaw, { sweep: 170, r: 2.7, tilt: [-22, 28, -40][n], dir: n % 2 ? -1 : 1, dur: 0.07, n: 150, tone: tn });
    for (const e of foes(dim, c, 3.4)) { const d = sub(e.location, p.location); if (d.x * f.x + d.z * f.z > -0.3) if (hit(e, 0.32)) flame(dim, center(e), { n: 5, r: 0.25, spd: 2, tone: tn }); }
    snd(p, "game.player.attack.sweep", 0.8, 1.2 + n * 0.12);
  } else {
    // 4타: 회전베기 + 사슬 채찍 (가장 먼 적 하나를 끌어옴)
    const cc = up(p.location, 1);
    arc(dim, cc, yaw, { sweep: 400, r: 3.2, dur: 0.14, n: 240, tone: tn });
    pt(dim, "hr_swirl", cc, { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, vd: UP, vs: 1.5, r: 2.4, spin: 1000, n: 50, life: 0.4 }, 2);
    for (const e of foes(dim, cc, 3.8)) if (hit(e, 0.55)) flame(dim, center(e), { n: 7, r: 0.3, spd: 2.5, tone: tn });
    const far = foes(dim, cc, 11).filter((e) => len(sub(e.location, p.location)) > 4).sort((a, b) => len(sub(a.location, p.location)) - len(sub(b.location, p.location)))[0];
    if (far) {
      for (let k = 1; k <= 3; k++) later(k, () => { if (!far.isValid()) return; const h = up(p.location, 1.1); wire(dim, h, add(h, sub(center(far), h), k / 3), 0.1); });
      later(4, () => {
        if (!far.isValid()) return;
        const d = sub(p.location, far.location), L = len(d) || 1;
        push(far, { x: (d.x / L) * 1.4, y: 0.35, z: (d.z / L) * 1.4 });
        hit(far, 0.4, 1); burst(dim, center(far), { n: 12, tone: tn });
        snd(p, "item.armor.equip_chain", 1, 0.8);
      });
    }
    snd(p, "game.player.attack.sweep", 1, 0.8); snd(p, "mob.enderdragon.flap", 0.6, 1.3);
    s.combo4 = now();
  }
}
/** 추격 베기: 방금 섬영으로 꿰뚫은 적에게 사슬로 되돌아가 내리꽂음 */
function chase(ctx, e) {
  const { p } = ctx, dim = p.dimension, s = st(p), hit = hitter(ctx, 5);
  s.lastDash = null;
  const from = up(p.location, 1), c = center(e), back = add(c, norm(sub(c, from)), 1.2);
  for (let k = 1; k <= 2; k++) later(k - 1, () => wire(dim, from, add(from, sub(c, from), k / 2), 0.1));
  later(2, () => {
    if (!e.isValid()) return;
    try { p.teleport(up(back, -0.9), { facingLocation: center(e) }); } catch {}
    slash(dim, from, back, { h: 0.9, dens: 26 });
    const yaw = yawOf(p);
    arc(dim, center(e), yaw, { sweep: 160, r: 2.4, tilt: 70, dir: -1, dur: 0.06, n: 170, tone: tone(p) });
    hit(e, 0.85, 1); burst(dim, center(e), { n: 18, spd: 4 });
    snd(p, "mob.enderdragon.flap", 0.8, 1.6); snd(p, "item.trident.hit", 1, 0.7); shake(p, 0.15, 0.2);
    notify(p, "§4§l추격 베기");
  });
}

// ═════════ ② 사슬 섬영 ═════════
const RECH = 6; // 충전 1회 6초
function charges(p) { const c = st(p).ch; while (c.n < 2 && now() >= c.next) { c.n++; c.next += RECH * 20; } return c; }
function hr_dash(ctx) {
  const { p } = ctx, s = st(p), c = charges(p);
  s.ctx = ctx;
  if (c.n <= 0) { ctx.setCd?.(Math.max(0.5, (c.next - now()) / 20)); return; }
  if (c.n === 2) c.next = now() + RECH * 20;
  c.n--;
  ctx.setCd?.(c.n > 0 ? 0.5 : Math.max(0.5, (c.next - now()) / 20));
  const rev = s.combo4 && now() - s.combo4 <= 16; s.combo4 = 0;
  if (odmActive(p)) odmDetach(p); // 천쇄 중: 걸린 사슬을 끊고 지금 속도 그대로 섬영
  const eye = eyeOf(p), v = viewOf(p);
  let target = null, ent = null;
  try { ent = p.getEntitiesFromViewDirection({ maxDistance: 24 }).map((x) => x.entity).find((e) => e?.isValid() && e.id !== p.id && e.typeId !== "minecraft:item") ?? null; } catch {}
  if (ent) target = center(ent);
  else { try { const b = p.getBlockFromViewDirection({ maxDistance: 24 }); if (b) target = add(b.block.location, { x: b.faceLocation?.x ?? 0.5, y: b.faceLocation?.y ?? 0.5, z: b.faceLocation?.z ?? 0.5 }); } catch {} }
  const hookAt = target ?? add(eye, v, 10);
  const end = ent ? add(center(ent), norm(sub(center(ent), eye)), 1.6) : add(hookAt, norm(sub(hookAt, eye)), target ? -1.2 : 0);
  const start = up(p.location, 1);
  dashLine(ctx, start, end, hookAt, ent, () => { if (rev) later(3, () => dashLine(ctx, up(p.location, 1), start, null, null, null, true)); }); // 역린: 같은 선을 되짚어 처음 자리로
}
/** from → to 로 사슬에 끌려가며 벰 (anchor = 사슬 박힌 곳) */
function dashLine(ctx, from, to, anchor, ent, done, reverse = false) {
  const { p } = ctx, dim = p.dimension, s = st(p), hit = hitter(ctx, 2), tn = tone(p);
  const d = sub(to, from), L = Math.min(len(d), 24), dir = norm(d), steps = Math.max(3, Math.min(9, Math.round(L / 2.4)));
  M.anim(p, "shoot");
  snd(p, "item.armor.equip_chain", 1, 1.3); snd(p, "mob.enderdragon.flap", 0.7, 1.8);
  const fly = anchor ? 2 : 0;
  if (anchor) for (let k = 1; k <= fly; k++) later(k - 1, () => { const h = up(p.location, 1.1); wire(dim, h, add(h, sub(anchor, h), k / fly), 0.1); });
  const path = [];
  for (let k = 0; k <= steps; k++) later(fly + k, () => {
    const P = up(p.location, 1);
    path.push(P);
    if (k < steps) {
      const rem = sub(add(from, dir, (L * (k + 1)) / steps), P);
      push(p, { x: rem.x * 0.9, y: rem.y * 0.9 + 0.06, z: rem.z * 0.9 });
      if (anchor) wire(dim, P, anchor, 0.08);
      speed(dim, P, dir, { n: 10 });
      if (k % 2 === 0) wings(p, 0.8);
      for (const e of foes(dim, P, 2.2)) if (hit(e, reverse ? 0.42 : 0.5, 20)) { burst(dim, center(e), { n: 10, tone: tn }); if (!s.lastDash?.ent && e !== ent) s.pierced = e; }
    } else {
      // 끝: 크게 가르기 + 지나간 자리 0.5초 뒤 폭발
      const yaw = yawOf(p);
      arc(dim, P, yaw, { sweep: 180, r: 2.8, tilt: reverse ? 40 : -40, dir: reverse ? -1 : 1, dur: 0.06, n: 180, tone: tn });
      if (reverse) arc(dim, P, yaw, { sweep: 180, r: 2.8, tilt: -40, dur: 0.06, n: 180, tone: tn });
      if (ent?.isValid()) { hit(ent, 0.7, 1); flame(dim, center(ent), { n: 10, r: 0.4, spd: 2.5, tone: tn }); }
      const pts = path.slice();
      later(10, () => {
        for (let i = 0; i + 1 < pts.length; i++) slash(dim, pts[i], pts[i + 1], { h: 0.6, dens: 18, life: 0.35 });
        for (const q of pts) { for (const e of foes(dim, q, 1.8)) hit(e, 0.28, 40); }
        burst(dim, pts[Math.floor(pts.length / 2)] ?? P, { n: 16, spd: 4 });
        snd(p, "random.explode", 0.35, 1.6);
      });
      s.lastDash = { t: now(), ent: ent ?? s.pierced ?? null }; s.pierced = null;
      snd(p, "game.player.attack.sweep", 1, 0.9); if (reverse) notify(p, "§4§l역린");
      done?.();
    }
  });
}

// ═════════ ③ 천쇄 (입체 기동 엔진 + 흑룡 테마) ═════════
function hr_odm(ctx) {
  const { p } = ctx;
  st(p).ctx = ctx;
  odmStart(p, { ...ctx, theme: HR_THEME, power: 1, mulf: () => veinMul(p), onHit: () => vein(p, 3) });
}

// ═════════ ④ 승천 ═════════
function hr_ascend(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), hit = hitter(ctx, 4, 1), big = veinN(p) >= VEIN_MAX;
  s.ctx = ctx;
  const at = { ...p.location }, tn = tone(p);
  const mob = foes(dim, at, 8).slice(0, 8);
  M.anim(p, "raise");
  snd(p, "mob.enderdragon.growl", big ? 1 : 0.6, big ? 0.7 : 1); shake(p, 0.3, 0.4);
  // 땅에서 사슬이 솟아 적을 붙잡아 끌어올림
  mob.forEach((e, i) => {
    const g = add(e.location, { x: Math.cos(i * 2.4) * 1.6, y: 0, z: Math.sin(i * 2.4) * 1.6 });
    for (let k = 1; k <= 3; k++) later(i + k, () => { if (e.isValid()) wire(dim, g, add(g, sub(center(e), g), k / 3), 0.1); });
    later(i + 4, () => { if (!e.isValid()) return; burst(dim, g, { n: 10, spd: 3 }); hit(e, 0.35); push(e, { x: 0, y: 1.25, z: 0 }); flame(dim, center(e), { n: 6 }); });
  });
  pt(dim, "hr_shock", up(at, 0.1), { r: 6, n: 120, life: 0.6 }, 1);
  push(p, { x: 0, y: 1.3, z: 0 });
  s.asc = { left: 6, hits: 0, until: now() + 80, mob, hold: new Map(), big, done: false };
  const a = s.asc;
  notify(p, `§4§l흑룡 승천 §r§7— 클릭: 적 사이를 베며 날기 (최대 6)`);
  let t = 0;
  const tick = () => {
    if (!p.isValid() || s.asc !== a || a.done) return;
    t++;
    if (t % 3 === 0) wings(p, big ? 1.35 : 1.1);
    if (t >= 10) {
      // 떠 있음: 플레이어와 붙잡힌 적을 공중에 고정
      push(p, { x: 0, y: 0.02, z: 0 });
      for (const e of a.mob) {
        if (!e.isValid()) continue;
        if (!a.hold.has(e.id)) a.hold.set(e.id, { ...e.location });
        try { e.teleport(a.hold.get(e.id), { keepVelocity: false }); } catch {}
        if (t % 4 === 0) wire(dim, up(a.hold.get(e.id), -3), center(e), 0.2);
      }
    }
    if (now() >= a.until || (a.left <= 0 && now() > a.lastHit + 6)) return dive(ctx, a);
    later(1, tick);
  };
  a.lastHit = 0;
  later(1, tick);
}
/** 승천 중 클릭: 다음 공중의 적에게 순간이동하며 X자 베기 */
function ascHit(p) {
  const s = st(p), a = s.asc; if (!a || a.done || a.left <= 0) return false;
  const ctx = s.ctx, dim = p.dimension, hit = hitter(ctx, 41, 1);
  const alive = a.mob.filter((e) => e.isValid());
  if (!alive.length) { a.left = 0; return true; }
  const e = alive[a.hits % alive.length];
  const from = up(p.location, 1), c = center(e), ang = a.hits * 2.1 + Math.random(), off = { x: Math.cos(ang) * 1.8, y: 0.2, z: Math.sin(ang) * 1.8 };
  const to = add(c, off);
  try { p.teleport(up(to, -1), { facingLocation: c }); } catch {}
  slash(dim, from, to, { h: 0.7, dens: 20 }); wire(dim, from, c, 0.25);
  const yaw = yawOf(p);
  arc(dim, c, yaw, { sweep: 170, r: 2.3, tilt: 45, dur: 0.05, n: 140, tone: tone(p) });
  arc(dim, c, yaw, { sweep: 170, r: 2.3, tilt: -45, dir: -1, dur: 0.05, n: 140, tone: tone(p) });
  hit(e, 0.5); burst(dim, c, { n: 14, spd: 4 });
  snd(p, "mob.enderdragon.flap", 0.8, 1.5 + a.hits * 0.08); snd(p, "game.player.attack.sweep", 1, 1.3);
  a.left--; a.hits++; a.lastHit = now(); a.until = Math.max(a.until, now() + 20);
  notify(p, `§4§l승천 §c${"◆".repeat(a.hits)}§8${"◇".repeat(a.left)}`);
  return true;
}
/** 내리꽂기 */
function dive(ctx, a) {
  const { p } = ctx, dim = p.dimension, s = st(p), hit = hitter(ctx, 42, 1);
  a.done = true; if (s.asc === a) s.asc = null;
  let land = null;
  try { const b = p.getBlockFromViewDirection({ maxDistance: 18 }); if (b) land = add(b.block.location, { x: 0.5, y: 1, z: 0.5 }); } catch {}
  if (!land) { try { const b = dim.getBlockFromRay(p.location, { x: 0, y: -1, z: 0 }, { maxDistance: 40 }); if (b) land = add(b.block.location, { x: 0.5, y: 1, z: 0.5 }); } catch {} }
  land ??= up(p.location, -6);
  const from = { ...p.location };
  M.anim(p, "smash");
  if (a.big) pt(dim, "hr_dragon", add(land, { x: 0, y: 16, z: 0 }), { vd: norm(sub(land, add(land, { x: 0, y: 16, z: 0 }))), u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, r: 14, h: 1.1, vs: 22, spin: 500, n: 420, life: 0.7, size: 1.4 }, 0);
  snd(p, "mob.enderdragon.growl", a.big ? 1 : 0.5, 0.8);
  let t = 0;
  const fall = () => {
    if (!p.isValid()) return;
    t++;
    const d = sub(land, p.location), L = len(d);
    if (L > 1.2 && t < 14 && !(t > 2 && onGround(p))) {
      push(p, { x: (d.x / L) * Math.min(2.6, L), y: Math.max(-3, (d.y / L) * Math.min(3, L)), z: (d.z / L) * Math.min(2.6, L) });
      speed(dim, up(p.location, 1), d, { n: 10 }); if (t % 2 === 0) wings(p, a.big ? 1.3 : 1);
      later(1, fall); return;
    }
    // 착지
    const at = { ...p.location }, mul = (a.big ? 1.5 : 1) * 1.4;
    pt(dim, "hr_shock", up(at, 0.1), { r: a.big ? 9 : 7, n: a.big ? 220 : 150, life: 0.7 }, 0);
    for (let i = 0; i < 6; i++) { const q = add(at, { x: Math.cos(i * 1.047) * 2.5, y: 0.2, z: Math.sin(i * 1.047) * 2.5 }); flame(dim, q, { n: 14, r: 0.5, spd: 3, vd: { x: 0, y: 1.5, z: 0 }, life: 0.9 }); }
    arc(dim, up(at, 0.8), yawOf(p), { sweep: 400, r: 4.2, dur: 0.12, n: 260 });
    for (const e of foes(dim, at, a.big ? 7.5 : 6)) { hit(e, mul); push(e, { x: 0, y: -0.6, z: 0 }); }
    snd(p, "random.explode", 1, 0.7); snd(p, "mob.enderdragon.hit", 0.8, 0.6); shake(p, a.big ? 0.8 : 0.5, 0.5);
    notify(p, a.big ? "§4§l흑룡 강하!" : "§4§l승천 · 내리꽂기");
    void from;
  };
  later(1, fall);
}

// ═════════ 표 · HUD ═════════
export const heukLine = (p) => {
  if (heldId(p) !== ID) return "";
  const n = veinN(p), c = charges(p), s = st(p);
  let line = `§4용맥 §c${"◆".repeat(n)}§8${"◇".repeat(VEIN_MAX - n)} §7섬영 ${"§c●".repeat(c.n)}${"§8○".repeat(2 - c.n)}`;
  if (s.asc && !s.asc.done) line += ` §4승천 §c${s.asc.left}`;
  else if (odmActive(p)) line += ` §4천쇄 §c${"◆".repeat(odmLeft(p))}`;
  return line;
};
export const WEAPON_SKILLS = {
  [ID]: [
    { id: "w_hr_1", key: 1, name: "흑룡 · 연참", short: "연참", lv: 1, mp: 6, cd: 0.35, pow: 1, run: hr_combo, pre: (p) => odmLeap(p) || ascHit(p),
      desc: "4타: 칠 때마다 시선 쪽으로 미끄러지며 벤다. 공중에서 치면 체공이 유지되는 공중 콤보. 4타는 검은 불꽃 회전베기 + 사슬 채찍으로 먼 적 하나를 끌어온다. ② 직후 ① = 추격 베기(방금 꿰뚫은 적에게 사슬로 되돌아가 꽂음). ④ 승천 중 ① = 적 사이 순간이동 베기, ③ 천쇄 중 ① = 회전 도약." },
    { id: "w_hr_2", key: 2, name: "흑룡 · 사슬 섬영", short: "섬영", lv: 1, mp: 14, cd: 6, pow: 1, run: hr_dash,
      desc: "2회 충전(6초마다 1). 조준한 적 · 벽 · 허공(10칸)에 사슬을 박고 그쪽으로 끌려가며 그 선의 적을 모두 벤다. 0.5초 뒤 지나간 자리가 터진다. ① 4타 직후 ② = 역린(같은 선을 되짚어 X자 베기). ③ 천쇄 중이면 걸린 사슬을 끊고 그 속도 그대로 섬영." },
    { id: "w_hr_3", key: 3, name: "흑룡 · 천쇄", short: "천쇄", lv: 1, mp: 18, cd: 25, pow: 1, run: hr_odm, pre: odmHop,
      desc: "보이는 벽 · 나무 · 지형 · 적(앞쪽 56칸)에 사슬이 자동으로 박혀 휘돌아 날아가는 입체 기동. 등에 흑룡 날개가 펼쳐진다. 점프(또는 ③ 다시)마다 반대쪽에 다음 사슬(5번), 클릭 = 회전 도약 베기, 지나가며 베기 · 벽 차기 · 착지 구르기. ② = 사슬을 끊고 섬영, ④ = 승천. 다 쓰거나 12초 지나면 25초 대기." },
    { id: "w_hr_4", key: 4, name: "흑룡 · 승천", short: "승천", lv: 1, mp: 40, cd: 90, pow: 1, run: hr_ascend,
      desc: "땅에서 사슬이 솟아 둘레 8칸 적을 공중으로 끌어올리고 같이 솟구친다. 떠 있는 동안 클릭마다 적 사이를 순간이동하며 X자로 벤다(최대 6). 끝나면 조준점으로 내리꽂혀 흑염 충격파. 용맥 5단에서 쓰면 거대한 흑룡 형상이 함께 내리꽂히고 위력 1.5배." },
  ],
};
