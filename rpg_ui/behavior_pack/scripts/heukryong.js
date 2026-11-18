// ═══════════════════════════════════════════════════════════════════════
// 흑룡의 검 (V12.146 → V12.149 3D 흑룡) — 사신수 위 · 연계 · 극한 기동 · 3D 흑룡(rpg:heuk_dragon, gen_heukdragon.py)을 타고 · 끌려 다님
//   「용맥」 1~5단: 스킬로 맞힌 뒤 1.5초 안에 다른 스킬로 이어 맞히면 한 단계 (위력 +6%) — 단계가 높을수록 소환되는 흑룡이 커짐
//   (V12.149: 흑룡 = 청룡처럼 파티클로 그린 동양 용, 블록 모델 아님)
//   ① 용조 연참  4타: 칠 때마다 미끄러지며 벰 · 공중 체공 · 4타 = 등 뒤에서 흑룡 머리가 튀어나와 물어뜯으며 앞으로 돌진(나도 같이 끌려감)
//               ② 직후 ① = 추격 베기 · ④ 비행 중 ① = 흑룡 숨결 · ③ 천쇄 중 ① = 회전 도약
//   ② 흑룡 질주  2회 충전: 흑룡 등에 올라타 시선 방향으로 일직선 질주 → U자로 휘돌아 되돌아옴 (지나간 적을 몸으로 벰), 다시 누르면 뛰어내리며 높이 솟구침
//   ③ 천쇄      사슬 입체 기동 + 등에 흑룡 날개 + 흑룡이 꼬불꼬불 따라 날며, 회전 도약(클릭)하면 가까운 적에게 급강하
//   ④ 흑룡 비행  거대한 흑룡을 타고 6초 동안 시선으로 조종하며 비행 (몸에 닿는 적을 벰) · 클릭 = 숨결 · 쉬프트 = 급강하 내리꽂기
// 파티클: gen_heukryong.py (hr_*)
// ═══════════════════════════════════════════════════════════════════════
import { system, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
import { drawDragon } from "./cheongryong.js";
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
  if (n === VEIN_MAX) { snd(p, "mob.enderdragon.growl", 0.6, 0.9); shake(p, 0.2, 0.3); notify(p, "§5§l용맥 5단 §r§d— ④ 승천이 흑룡 형상으로"); }
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
const tone = (p) => Math.max(0, 0.25 - veinN(p) * 0.05); // 용맥이 오를수록 밝은 보라 쪽으로
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

// ═════════ 흑룡 (청룡처럼 파티클로 그린 동양 용: 비늘 몸통 · 등가시 · 갈기 · 네 다리 발톱 · 수염 · 꼬리 지느러미 · 입체 머리 · 빛나는 눈) ═════════
//   cheongryong.js 의 drawDragon 을 흑요석 보라 색 파티클(hrd_*, tools/recolor_dragon.py)로 씀
//   머리가 지나온 자리를 기억해 몸이 그 길을 따라옴 → 좌우 · 위아래로 꼬불꼬불 3D 로 굽이치며 날아감
class Drake {
  constructor(dim, at, size, pose = 0, o = {}) {
    this.dim = dim; this.size = size; this.pos = { ...at }; this.dir = { x: 0, y: 0, z: 1 }; this.t = 0;
    this.hist = [{ ...at }]; this.alive = true; this.life = o.life ?? 1.0; this.mouth = pose === 2;
  }
  ok() { return this.alive; }
  pose(n) { this.mouth = n === 2; }
  /** 머리를 at 으로 (dir = 진행 방향, wig = 꼬불꼬불 세기) — 몸은 지나온 길을 따라 그려짐 */
  move(at, dir, wig = 0.5) {
    if (!this.alive) return;
    this.t++;
    if (dir && len(dir) > 0.01) this.dir = norm(dir);
    const side = norm(crs(this.dir, UP)), vert = norm(crs(side, this.dir));
    const P = add(add(at, side, Math.sin(this.t * 0.42) * wig * 1.3 * this.size), vert, Math.sin(this.t * 0.29 + 1) * wig * 0.7 * this.size);
    this.pos = { ...at }; this.hist.push(P); if (this.hist.length > 42) this.hist.shift();
    const H = this.hist, n = H.length, base = this.t - (n - 1);
    const path = (tt) => { const i = Math.max(0, Math.min(n - 1, tt - base)), i0 = Math.floor(i), i1 = Math.min(n - 1, i0 + 1), f = i - i0; return { x: H[i0].x + (H[i1].x - H[i0].x) * f, y: H[i0].y + (H[i1].y - H[i0].y) * f, z: H[i0].z + (H[i1].z - H[i0].z) * f }; };
    try { drawDragon(this.dim, path, this.t, { thick: 0.78 * this.size, life: this.life, ground: -1e9, sc: 1.55 * this.size, px: "hrd" }); } catch {}
    if (this.mouth && this.t % 2 === 0) flame(this.dim, this.head(), { n: 8, r: 0.3 * this.size, spd: 2.5, vd: scl(this.dir, 2) });
  }
  head() { return this.hist[this.hist.length - 1] ?? this.pos; }
  lag(k) { return this.hist[Math.max(0, this.hist.length - 1 - k)] ?? this.pos; }
  back() { return up(this.lag(3), 0.95 * this.size); }
  /** 몸이 지나는 점들 (닿은 적 판정용) */
  body() { return [0, 4, 8, 12, 16].map((k) => this.lag(k)); }
  remove(fx = true) {
    if (fx && this.alive) { const h = this.head(); pt(this.dim, "hr_swirl", h, { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, vd: UP, vs: 2, r: 1.5 * this.size, spin: 800, n: 50, life: 0.5 }, 1); flame(this.dim, h, { n: 16, r: this.size, spd: 2 }); }
    this.alive = false;
  }
}
const dragonSize = (p, base) => base * (1 + veinN(p) * 0.12); // 용맥이 높을수록 큰 흑룡
/** 흑룡 몸에 닿은 적 (몸 점마다 반지름 r) */
const bodyHits = (dk, r) => { const seen = new Map(); for (const q of dk.body()) for (const e of foes(dk.dim, q, r * dk.size)) seen.set(e.id, e); return [...seen.values()]; };
/** 플레이어를 흑룡 등에 태움 (시선은 그대로) */
const ride = (p, dk) => { try { p.teleport(dk.back(), { keepVelocity: false }); } catch {} };
const solidAt = (dim, q) => { try { const b = dim.getBlock({ x: Math.floor(q.x), y: Math.floor(q.y), z: Math.floor(q.z) }); return !!b && !b.isAir && !b.isLiquid; } catch { return false; } };
/** 다 끝난 뒤 떨어져 죽지 않게 */
const safeLand = (p, sec = 2) => { try { M.potion(p, "slow_falling", 0, sec); } catch {} };

/** 천쇄(입체 기동 엔진) 흑룡 테마 + 따라 나는 흑룡 */
const HR_THEME = {
  name: "흑룡 천쇄", col: "§5", col2: "§d", endCd: 25, reel: "hr_reelspark",
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
  onTick: (p, m) => { if (m.t % 3 === 0) wings(p, 1); companion(p, m); },
  onEnd: (p) => { const s = st(p); s.comp?.remove(); s.comp = null; },
};
/** ③ 천쇄 동안 따라 나는 흑룡: 내 둘레 위쪽을 꼬불꼬불 돌며 따라옴, 회전 도약(클릭)하면 가까운 적에게 급강하해 물어뜯고 돌아옴 */
function companion(p, m) {
  const s = st(p), dim = p.dimension;
  if (!s.comp || !s.comp.ok()) { s.comp = new Drake(dim, add(up(p.location, 5), fwdOf(yawOf(p)), -4), dragonSize(p, 0.6), 0, { life: 0.6 }); s.compA = 0; s.compDive = null; }
  const dk = s.comp, ctx = s.ctx;
  if (m.lastLeap === m.t && !s.compDive) {
    const tgt = foes(dim, p.location, 16).sort((a, b) => len(sub(a.location, p.location)) - len(sub(b.location, p.location)))[0];
    if (tgt) { s.compDive = { e: tgt, t: 0 }; dk.pose(2); snd(p, "mob.enderdragon.growl", 0.5, 1.4); }
  }
  if (s.compDive) {
    const dv = s.compDive, e = dv.e; dv.t++;
    if (!e?.isValid() || dv.t > 24) { s.compDive = null; dk.pose(0); }
    else {
      const to = center(e), d = sub(to, dk.head()), L = len(d);
      dk.move(add(dk.pos, d, Math.min(1, 1.8 / (L || 1))), d, 0.3);
      if (L < 1.8) {
        const hit = hitter(ctx, 33, 1); hit(e, 0.7); burst(dim, to, { n: 18, spd: 4 }); flame(dim, to, { n: 10, r: 0.5 });
        snd(p, "mob.ravager.bite", 0.9, 0.7); shake(p, 0.12, 0.2); s.compDive = null; dk.pose(0);
      }
      return;
    }
  }
  s.compA += 8;
  const r = 4.5, aa = rad(s.compA), goal = add(up(p.location, 3.2 + Math.sin(rad(s.compA * 2)) * 0.8), { x: Math.cos(aa) * r, y: 0, z: Math.sin(aa) * r });
  const d = sub(goal, dk.pos), tangent = { x: -Math.sin(aa), y: 0, z: Math.cos(aa) };
  dk.move(add(dk.pos, d, 0.35), add(scl(tangent, 1), d, 0.3), 0.6);
  if (m.t % 4 === 0) for (const e of bodyHits(dk, 1.6)) hitter(ctx, 33, 10)(e, 0.25);
}

// ═════════ ① 용조 연참 ═════════
const combo = new Map();
function step(p, max, gap = 24) { const c = combo.get(p.id), n = c && now() - c.t <= gap ? (c.n + 1) % max : 0; combo.set(p.id, { n, t: now() }); return n; }
function hr_combo(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), yaw = yawOf(p), f = fwdOf(yaw), air = !onGround(p);
  s.ctx = ctx;
  if (s.lastDash && now() - s.lastDash.t <= 20 && s.lastDash.ent?.isValid()) return chase(ctx, s.lastDash.ent); // ② 직후 = 추격 베기
  const n = step(p, 4), hit = hitter(ctx, 1);
  M.anim(p, n === 3 ? "spin" : n % 2 ? "slash_down" : "slash");
  push(p, { x: f.x * (n === 3 ? 0.4 : 0.6), y: air ? 0.24 : 0.04, z: f.z * (n === 3 ? 0.4 : 0.6) });
  if (air) try { M.potion(p, "slow_falling", 0, 0.6); } catch {}
  const c = add(up(p.location, 1.05), f, 1.2), tn = tone(p);
  if (n < 3) {
    arc(dim, c, yaw, { sweep: 170, r: 2.7, tilt: [-22, 28, -40][n], dir: n % 2 ? -1 : 1, dur: 0.07, n: 150, tone: tn });
    for (const e of foes(dim, c, 3.4)) { const d = sub(e.location, p.location); if (d.x * f.x + d.z * f.z > -0.3) if (hit(e, 0.32)) flame(dim, center(e), { n: 5, r: 0.25, spd: 2, tone: tn }); }
    snd(p, "game.player.attack.sweep", 0.8, 1.2 + n * 0.12);
    return;
  }
  // 4타: 회전베기 → 등 뒤에서 흑룡이 튀어나와 아가리를 벌리고 시선 방향으로 꼬불꼬불 돌진, 나도 그 머리에 끌려감
  const cc = up(p.location, 1);
  arc(dim, cc, yaw, { sweep: 400, r: 3.2, dur: 0.14, n: 220, tone: tn });
  for (const e of foes(dim, cc, 3.8)) hit(e, 0.45);
  const v = viewOf(p), dir = norm({ x: v.x, y: Math.max(-0.5, Math.min(0.5, v.y)), z: v.z });
  const dk = new Drake(dim, add(add(up(p.location, 1.6), dir, -3), UP, 0.8), dragonSize(p, 0.55), 2);
  const bite = hitter(ctx, 1, 6), start = { ...dk.pos };
  snd(p, "mob.enderdragon.growl", 0.7, 1.3); snd(p, "mob.enderdragon.flap", 0.8, 1.2);
  for (let k = 1; k <= 12; k++) later(k, () => {
    if (!dk.ok()) return;
    const at = add(start, dir, k * 1.15);
    dk.move(at, dir, 0.8);
    if (k >= 3 && k <= 10) { const q = add(dk.head(), dir, -0.4); push(p, { x: (q.x - p.location.x) * 0.45, y: (q.y - 1 - p.location.y) * 0.45 + 0.08, z: (q.z - p.location.z) * 0.45 }); } // 머리에 끌려감
    speed(dim, dk.pos, dir, { n: 6 });
    for (const e of bodyHits(dk, 1.5)) if (bite(e, 0.4)) { burst(dim, center(e), { n: 10, tone: tn }); snd(p, "mob.ravager.bite", 0.7, 1.1); }
    if (k === 12) { dk.remove(); safeLand(p, 1); }
  });
  s.combo4 = now();
}
/** 추격 베기: 방금 ② 로 지나친 적에게 사슬로 되돌아가 내리꽂음 */
function chase(ctx, e) {
  const { p } = ctx, dim = p.dimension, s = st(p), hit = hitter(ctx, 5);
  s.lastDash = null;
  const from = up(p.location, 1), c = center(e), back = add(c, norm(sub(c, from)), 1.2);
  for (let k = 1; k <= 2; k++) later(k - 1, () => wire(dim, from, add(from, sub(c, from), k / 2), 0.1));
  later(2, () => {
    if (!e.isValid()) return;
    try { p.teleport(up(back, -0.9), { facingLocation: center(e) }); } catch {}
    slash(dim, from, back, { h: 0.9, dens: 26 });
    arc(dim, center(e), yawOf(p), { sweep: 160, r: 2.4, tilt: 70, dir: -1, dur: 0.06, n: 170, tone: tone(p) });
    hit(e, 0.85, 1); burst(dim, center(e), { n: 18, spd: 4 });
    snd(p, "mob.enderdragon.flap", 0.8, 1.6); snd(p, "item.trident.hit", 1, 0.7); shake(p, 0.15, 0.2);
    notify(p, "§5§l추격 베기");
  });
}

// ═════════ ② 흑룡 질주 (타고 일직선 → U자 → 되돌아옴) ═════════
const RECH = 6; // 충전 1회 6초
function charges(p) { const c = st(p).ch; while (c.n < 2 && now() >= c.next) { c.n++; c.next += RECH * 20; } return c; }
function hr_rush(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), c = charges(p);
  s.ctx = ctx;
  if (c.n <= 0) { ctx.setCd?.(Math.max(0.5, (c.next - now()) / 20)); return; }
  if (c.n === 2) c.next = now() + RECH * 20;
  c.n--;
  ctx.setCd?.(c.n > 0 ? 0.5 : Math.max(0.5, (c.next - now()) / 20));
  if (odmActive(p)) odmDetach(p);
  s.ride?.end?.(false);
  const v = viewOf(p), dir = norm({ x: v.x, y: Math.max(-0.45, Math.min(0.55, v.y)), z: v.z }), side = norm(crs(dir, UP));
  const rev = s.combo4 && now() - s.combo4 <= 16; s.combo4 = 0; // ① 4타 직후: 역린 — 위력 1.3배 · 두 번 휘돎
  const dk = new Drake(dim, up(p.location, 0.2), dragonSize(p, 0.85));
  const hit = hitter(ctx, 2, 8), tn = tone(p), P0 = { ...p.location };
  // 길: 일직선 15칸 (막히면 앞에서 멈춤) → 반지름 3.5 반원 → 되돌아 12칸
  let L = 15; for (let k = 2; k <= 15; k++) if (solidAt(dim, add(up(P0, 1), dir, k))) { L = Math.max(4, k - 2); break; }
  const pts = [];
  for (let k = 1; k <= 10; k++) pts.push({ at: add(P0, dir, (L * k) / 10), d: dir });
  const turnC = add(add(P0, dir, L), side, 3.5);
  const loops = rev ? 2 : 1;
  for (let lp = 0; lp < loops; lp++) for (let k = 1; k <= 8; k++) { const a = Math.PI * (k / 8) + lp * Math.PI; const off = add(scl(side, -Math.cos(a) * 3.5), dir, Math.sin(a) * 3.5 * (lp % 2 ? -1 : 1)); pts.push({ at: add(turnC, off, 1), d: norm(add(scl(side, Math.sin(a)), dir, Math.cos(a) * (lp % 2 ? -1 : 1))) }); }
  const backDir = rev ? dir : scl(dir, -1), from = pts[pts.length - 1].at;
  for (let k = 1; k <= 8; k++) pts.push({ at: add(from, backDir, (12 * k) / 8), d: backDir });
  const r = { i: 0, done: false, last: null };
  r.end = (jump) => {
    if (r.done) return; r.done = true; if (s.ride === r) s.ride = null;
    const d = dk.dir;
    push(p, jump ? { x: d.x * 0.8, y: 1.25, z: d.z * 0.8 } : { x: d.x * 1.1, y: 0.35, z: d.z * 1.1 });
    safeLand(p, jump ? 3 : 1.5);
    if (jump) { arc(dim, up(p.location, 1), yawOf(p), { sweep: 380, r: 2.6, dur: 0.12, n: 160, tone: tn }); snd(p, "mob.enderdragon.flap", 1, 1.5); notify(p, "§5§l뛰어오르기"); }
    s.lastDash = { t: now(), ent: r.last };
    dk.remove();
  };
  s.ride = r;
  M.anim(p, "dash");
  snd(p, "mob.enderdragon.growl", 0.8, 1.2); snd(p, "mob.enderdragon.flap", 1, 1.4);
  notify(p, rev ? "§5§l역린 질주 §r§7(다시: 뛰어오르기)" : "§5§l흑룡 질주 §r§7(② 다시: 뛰어오르기)");
  const tick = () => {
    if (r.done || !p.isValid() || !dk.ok()) return r.end?.(false);
    const q = pts[r.i++];
    if (!q) return r.end(false);
    dk.move(q.at, q.d, 0.35);
    ride(p, dk);
    if (r.i % 2 === 0) wings(p, 0.9);
    speed(dim, up(dk.pos, 0.6), q.d, { n: 10, r: 1.8 });
    for (const e of bodyHits(dk, 1.7)) if (hit(e, rev ? 0.55 : 0.42)) { r.last = e; burst(dim, center(e), { n: 12, tone: tn }); slash(dim, add(center(e), side, -1.4), add(center(e), side, 1.4), { h: 0.5, dens: 26 }); }
    later(1, tick);
  };
  later(1, tick);
}
const hr_rush_pre = (p) => { const r = st(p).ride; if (r && !r.done) { r.end(true); return true; } return false; };

// ═════════ ③ 천쇄 (입체 기동 엔진 + 흑룡 테마 + 따라 나는 흑룡) ═════════
function hr_odm(ctx) {
  const { p } = ctx;
  st(p).ctx = ctx;
  odmStart(p, { ...ctx, theme: HR_THEME, power: 1, mulf: () => veinMul(p), onHit: () => vein(p, 3) });
}

// ═════════ ④ 흑룡 비행 ═════════
const FLY_T = 120;
function hr_fly(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), big = veinN(p) >= VEIN_MAX;
  s.ctx = ctx;
  if (odmActive(p)) odmDetach(p);
  s.ride?.end?.(false);
  const size = dragonSize(p, 1.35) * (big ? 1.15 : 1);
  const dk = new Drake(dim, up(p.location, 0.5), size);
  const hit = hitter(ctx, 4, 10), tn = tone(p);
  const f = { t: 0, breaths: 5, lastBreath: -99, sneakPrev: true, diving: false, done: false, big, dk };
  s.fly = f;
  push(p, { x: 0, y: 0.9, z: 0 });
  snd(p, "mob.enderdragon.growl", 1, big ? 0.7 : 0.9); snd(p, "mob.enderdragon.flap", 1, 0.9); shake(p, 0.3, 0.4);
  try { p.runCommand("camera @s fov_set 95 0.4 in_out_sine"); } catch {}
  notify(p, `§5§l흑룡 비행 §r§7— 시선으로 조종 · 클릭: 숨결 · 쉬프트: 급강하`);
  let dir = norm({ ...viewOf(p), y: Math.max(0.35, viewOf(p).y) }), pos = up(p.location, 1.5);
  const tick = () => {
    if (f.done || !p.isValid() || !dk.ok()) return finish(ctx, f);
    f.t++;
    let sneak = false; try { sneak = !!p.isSneaking; } catch {}
    if (sneak && !f.sneakPrev && f.t > 6) return dive(ctx, f);
    f.sneakPrev = sneak;
    if (f.t >= FLY_T) return dive(ctx, f);
    // 시선 쪽으로 서서히 꺾음 (빠른 선회) · 땅 · 벽에 닿으면 위로
    const want = norm({ ...viewOf(p), y: Math.max(-0.6, Math.min(0.7, viewOf(p).y)) });
    dir = norm(add(scl(dir, 0.82), want, 0.18));
    const spd = 1.15 + (big ? 0.2 : 0);
    let next = add(pos, dir, spd);
    if (solidAt(dim, add(next, dir, 2 * size)) || solidAt(dim, up(next, -1))) { next = up(pos, 0.8); dir = norm(add(dir, UP, 0.6)); }
    pos = next;
    dk.move(pos, dir, 0.55);
    ride(p, dk);
    if (f.t % 3 === 0) wings(p, 0.8);
    if (f.t % 2 === 0) speed(dim, up(pos, 0.5), dir, { n: 10, r: 2.2 * size });
    for (const e of bodyHits(dk, 1.8)) if (hit(e, 0.35)) { burst(dim, center(e), { n: 12, tone: tn }); flame(dim, center(e), { n: 6 }); }
    if (f.t - f.lastBreath === 8) dk.pose(0);
    later(1, tick);
  };
  later(1, tick);
}
/** 비행 중 클릭: 머리에서 시선 방향으로 보랏빛 숨결 (12칸 원뿔) */
function breath(p) {
  const s = st(p), f = s.fly;
  if (!f || f.done || f.diving) return false;
  if (f.t - f.lastBreath < 7 || f.breaths <= 0) return true;
  f.lastBreath = f.t; f.breaths--;
  const dk = f.dk, dim = p.dimension, v = viewOf(p), h = dk.head(), hit = hitter(s.ctx, 41, 1);
  dk.pose(2);
  for (let k = 0; k < 6; k++) later(k, () => {
    for (let j = 1; j <= 6; j++) { const q = add(h, v, j * 2); flame(dim, q, { n: 10, r: 0.2 + j * 0.18, spd: 1.2, vd: scl(v, 2), life: 0.6, size: 1.2 }); }
  });
  for (const e of foes(dim, h, 13)) { const d = sub(center(e), h), L = len(d) || 1; if ((d.x * v.x + d.y * v.y + d.z * v.z) / L > 0.82) if (hit(e, 0.6)) burst(dim, center(e), { n: 14, spd: 3.5 }); }
  snd(p, "mob.enderdragon.shoot", 1, 0.8); snd(p, "mob.blaze.shoot", 0.7, 0.6);
  notify(p, `§5§l숨결 §d${"●".repeat(f.breaths)}§8${"○".repeat(5 - f.breaths)}`);
  return true;
}
/** 급강하 내리꽂기: 날개를 접고 조준점(없으면 아래)으로 꽂힘 → 충격파, 나는 뛰어내림 */
function dive(ctx, f) {
  const { p } = ctx, dim = p.dimension, dk = f.dk, hit = hitter(ctx, 42, 1);
  if (f.diving) return; f.diving = true;
  let land = null;
  try { const b = p.getBlockFromViewDirection({ maxDistance: 30 }); if (b) land = add(b.block.location, { x: 0.5, y: 1, z: 0.5 }); } catch {}
  if (!land) { try { const b = dim.getBlockFromRay(dk.pos, { x: 0, y: -1, z: 0 }, { maxDistance: 60 }); if (b) land = add(b.block.location, { x: 0.5, y: 1, z: 0.5 }); } catch {} }
  land ??= up(dk.pos, -8);
  dk.pose(3);
  snd(p, "mob.enderdragon.growl", 1, 0.7); snd(p, "mob.phantom.swoop", 1, 0.6);
  let t = 0;
  const fall = () => {
    if (!dk.ok() || !p.isValid()) return finish(ctx, f);
    t++;
    const d = sub(land, dk.pos), L = len(d);
    if (L > 2 && t < 30) {
      const stp = Math.min(L, 1.9);
      dk.move(add(dk.pos, d, stp / L), d, 0.15);
      ride(p, dk);
      speed(dim, up(dk.pos, 0.5), d, { n: 12, r: 2 });
      later(1, fall); return;
    }
    // 착지 충격
    const at = { ...land }, mul = (f.big ? 1.5 : 1) * 1.5, R = 6 + dk.size * 1.5;
    pt(dim, "hr_shock", up(at, 0.1), { r: R, n: f.big ? 240 : 170, life: 0.7 }, 0);
    for (let i = 0; i < 8; i++) { const q = add(at, { x: Math.cos(i * 0.785) * R * 0.45, y: 0.2, z: Math.sin(i * 0.785) * R * 0.45 }); flame(dim, q, { n: 14, r: 0.5, spd: 3, vd: { x: 0, y: 1.6, z: 0 }, life: 0.9 }); }
    arc(dim, up(at, 0.8), yawOf(p), { sweep: 400, r: R * 0.7, dur: 0.12, n: 260 });
    for (const e of foes(dim, at, R)) { hit(e, mul); push(e, { x: 0, y: 0.6, z: 0 }); }
    snd(p, "random.explode", 1, 0.7); snd(p, "mob.enderdragon.hit", 0.9, 0.6); shake(p, f.big ? 0.8 : 0.55, 0.5);
    notify(p, f.big ? "§5§l흑룡 강하!" : "§5§l급강하");
    push(p, { x: dk.dir.x * 0.5, y: 0.9, z: dk.dir.z * 0.5 });
    finish(ctx, f);
  };
  later(1, fall);
}
function finish(ctx, f) {
  const { p } = ctx, s = st(p);
  if (f.done) return; f.done = true; if (s.fly === f) s.fly = null;
  f.dk.remove(); safeLand(p, 3);
  try { p.runCommand("camera @s fov_clear 0.5 in_out_sine"); } catch {}
}

// ═════════ 표 · HUD ═════════
export const heukLine = (p) => {
  if (heldId(p) !== ID) return "";
  const n = veinN(p), c = charges(p), s = st(p);
  let line = `§5용맥 §d${"◆".repeat(n)}§8${"◇".repeat(VEIN_MAX - n)} §7질주 ${"§d●".repeat(c.n)}${"§8○".repeat(2 - c.n)}`;
  if (s.fly && !s.fly.done) line += ` §5비행 §d${Math.ceil((FLY_T - s.fly.t) / 20)}초 §7숨결 ${s.fly.breaths}`;
  else if (odmActive(p)) line += ` §5천쇄 §d${"◆".repeat(odmLeft(p))}`;
  return line;
};
export const WEAPON_SKILLS = {
  [ID]: [
    { id: "w_hr_1", key: 1, name: "흑룡 · 용조 연참", short: "연참", lv: 1, mp: 6, cd: 0.35, pow: 1, run: hr_combo, pre: (p) => odmLeap(p) || breath(p),
      desc: "4타: 칠 때마다 미끄러지며 벤다(공중이면 체공). 4타는 회전베기 뒤 등 뒤에서 흑룡이 튀어나와 아가리를 벌리고 시선 쪽으로 꼬불꼬불 돌진하며, 나도 그 머리에 끌려 같이 날아간다. ② 직후 ① = 추격 베기, ④ 비행 중 ① = 숨결, ③ 천쇄 중 ① = 회전 도약(따라 나는 흑룡이 가까운 적에게 급강하)." },
    { id: "w_hr_2", key: 2, name: "흑룡 · 질주", short: "질주", lv: 1, mp: 14, cd: 6, pow: 1, run: hr_rush, pre: hr_rush_pre,
      desc: "2회 충전(6초마다 1). 흑룡 등에 올라타 시선 방향으로 일직선 질주(막히면 그 앞까지) → U자로 휘돌아 되돌아온다. 흑룡 몸에 닿는 적을 모두 벤다. 질주 중 ② 다시 = 뛰어내리며 높이 솟구침. ① 4타 직후 ② = 역린 질주(두 번 휘돌고 위력 1.3배)." },
    { id: "w_hr_3", key: 3, name: "흑룡 · 천쇄", short: "천쇄", lv: 1, mp: 18, cd: 25, pow: 1, run: hr_odm, pre: odmHop,
      desc: "사슬 입체 기동(벽 · 나무 · 지형 · 적에 자동으로 박혀 휘돌아 날아감) + 등에 흑룡 날개. 흑룡이 내 위를 꼬불꼬불 돌며 따라 날고, 클릭(회전 도약)하면 가까운 적에게 급강하해 물어뜯는다. 점프 = 다음 사슬(5번). ② = 사슬을 끊고 질주, ④ = 비행. 끝나면 25초 대기." },
    { id: "w_hr_4", key: 4, name: "흑룡 · 비행", short: "비행", lv: 1, mp: 40, cd: 90, pow: 1, run: hr_fly,
      desc: "거대한 흑룡을 불러 등에 올라타 6초 동안 시선으로 조종하며 난다(빠르게 선회 · 벽 · 땅은 타고 넘음). 흑룡 몸에 닿는 적을 벤다. 클릭 = 보랏빛 숨결(5번), 쉬프트 = 날개를 접고 조준점으로 급강하해 내리꽂는 충격파. 용맥이 높을수록 흑룡이 커지고, 5단이면 더 크고 빠르며 위력 1.5배." },
  ],
};
