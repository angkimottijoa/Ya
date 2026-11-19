// ═══════════════════════════════════════════════════════════════════════
// 흑룡의 검 (V12.146 → V12.149 3D 흑룡) — 사신수 위 · 연계 · 극한 기동 · 3D 흑룡(rpg:heuk_dragon, gen_heukdragon.py)을 타고 · 끌려 다님
//   「용맥」 1~5단: 스킬로 맞힌 뒤 1.5초 안에 다른 스킬로 이어 맞히면 한 단계 (위력 +6%) — 단계가 높을수록 소환되는 흑룡이 커짐
//   (V12.149: 흑룡 = 청룡처럼 파티클로 그린 동양 용, 블록 모델 아님)
//   ① 용조 연참  4타: 칠 때마다 빠르게 크게 돌진 · 화려한 검기 + 날아가는 초승달 검기 · 4타 = 흑룡이 튀어나와 돌진하며 물어뜯고 나도 끌려감
//   ② 흑룡 비행  흑룡을 타고 4초 동안 시선으로 조종 · 클릭 = 숨결(3) · 쉬프트 = 급강하 내리꽂기
//   ③ 천쇄      사슬 입체 기동 + 날개 + 따라 나는 흑룡 (회전 도약 때 가까운 적에게 급강하)
//   ④ 흑룡 결계  「용린옥」: 비늘 돔 · 벽을 도는 흑룡 · 안은 내 규칙(빠름 · 공중 점프 · 필중 추격 · 적 둔함) → 무너지며 흑룡 내리꽂힘
//   느린 낙하 없음: 낙하 보호는 땅에 닿기 직전 낙하 거리만 0 으로 (NOFALL)
// 파티클: gen_heukryong.py (hr_*)
// ═══════════════════════════════════════════════════════════════════════
import { system, world, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
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
/** 낙하 보호 (V12.151: 느린 낙하 대신) — 그동안 땅에 닿기 직전 제자리 순간이동으로 낙하 거리를 0 으로 (속도는 그대로) */
const NOFALL = new Map(); // pid → 끝나는 틱
const noFall = (p, ticks = 60) => NOFALL.set(p.id, Math.max(NOFALL.get(p.id) ?? 0, now() + ticks));
const safeLand = (p, sec = 2) => noFall(p, Math.round(sec * 20));
system.runInterval(() => {
  for (const [id, until] of NOFALL) {
    if (now() > until) { NOFALL.delete(id); continue; }
    const p = world.getEntity(id); if (!p?.isValid()) { NOFALL.delete(id); continue; }
    const v = vel(p); if (v.y > -0.35 || onGround(p)) continue;
    let near = false; try { near = !!p.dimension.getBlockFromRay(p.location, { x: 0, y: -1, z: 0 }, { maxDistance: Math.max(1.5, -v.y * 2.5) }); } catch {}
    if (near) try { p.teleport(p.location, { keepVelocity: true }); } catch {}
  }
}, 1);

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
/** 화려한 검기: 큰 호 + 엇갈린 안쪽 호 + 칼끝 빛줄기 + 흑염 · 불티 */
function swordFx(dim, c, yaw, n, tn, k = 1) {
  const tilt = [-25, 32, -48, 0][n], dir = n % 2 ? -1 : 1, r = rightOf(yaw), f = fwdOf(yaw);
  arc(dim, c, yaw, { sweep: 210, r: 3.1 * k, tilt, dir, dur: 0.06, n: Math.round(280 * k), size: 1.45, spd: 3, tone: tn });
  later(1, () => arc(dim, add(c, f, 0.3), yaw, { sweep: 170, r: 2.2 * k, tilt: tilt + 22 * dir, dir, dur: 0.05, n: Math.round(150 * k), size: 1.1, spd: 2.5, tone: Math.max(0, tn - 0.1) }));
  const tt = rad(tilt), side = { x: r.x * Math.cos(tt), y: Math.sin(tt), z: r.z * Math.cos(tt) }, mid = add(c, f, 2.4 * k);
  slash(dim, add(mid, side, -2.4 * k * dir), add(mid, side, 2.4 * k * dir), { h: 0.55, dens: 32, life: 0.35, size: 1.2 });
  burst(dim, add(mid, side, 2.3 * k * dir), { n: 16, r: 0.2, spd: 4, life: 0.4, tone: tn });
  flame(dim, mid, { n: 10, r: 0.6 * k, spd: 1.5, tone: tn });
}
/** 앞으로 날아가는 초승달 검기 (len 칸, 지나가며 관통해 벰) */
function bladeWave(ctx, from, dirv, yaw, n, len, mul) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx, 1, 20), tn = tone(p), steps = Math.ceil(len / 1.8);
  const tilt = [-25, 32, -48, 0][n], dir = n % 2 ? -1 : 1;
  for (let k = 1; k <= steps; k++) later(k, () => {
    const q = add(from, dirv, k * 1.8);
    arc(dim, q, yaw, { sweep: 150, r: 1.9, tilt, dir, dur: 0.03, n: 110, size: 1.2, spd: 1.5, life: 0.25, tone: tn });
    if (k % 2 === 0) flame(dim, q, { n: 5, r: 0.5, spd: 1, tone: tn });
    for (const e of foes(dim, q, 2)) if (hit(e, mul)) burst(dim, center(e), { n: 10, tone: tn });
  });
}
function hr_combo(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), yaw = yawOf(p), v = viewOf(p), air = !onGround(p);
  s.ctx = ctx;
  const n = step(p, 4), hit = hitter(ctx, 1), tn = tone(p);
  M.anim(p, n === 3 ? "spin" : n % 2 ? "slash_down" : "slash");
  // 빠르게 앞으로 돌진 (공중이면 시선의 위아래도 따라감 · 느린 낙하 없음)
  const dd = norm({ x: v.x, y: air ? v.y * 0.6 : 0, z: v.z }), pw = n === 3 ? 1.0 : 1.35;
  push(p, { x: dd.x * pw, y: air ? Math.max(0.18, dd.y * pw * 0.6 + 0.18) : 0.08, z: dd.z * pw });
  noFall(p, 50);
  speed(dim, up(p.location, 1), dd, { n: 8 });
  const c0 = add(up(p.location, 1.05), dd, 1.4);
  swordFx(dim, c0, yaw, n, tn, n === 3 ? 1.25 : 1);
  snd(p, "game.player.attack.sweep", 0.9, 1.15 + n * 0.12); snd(p, "item.trident.throw", 0.5, 1.4 + n * 0.1);
  later(2, () => { const c = add(up(p.location, 1.05), dd, 1.4); for (const e of foes(dim, c, 3.6)) if (hit(e, n === 3 ? 0.4 : 0.3)) flame(dim, center(e), { n: 6, r: 0.25, spd: 2, tone: tn }); });
  bladeWave(ctx, c0, dd, yaw, n, n === 3 ? 10 : 6, n === 3 ? 0.3 : 0.18);
  if (n < 3) return;
  // 4타: 등 뒤에서 흑룡이 튀어나와 시선 쪽으로 꼬불꼬불 돌진, 나도 그 머리에 끌려감
  const dir = norm({ x: v.x, y: Math.max(-0.5, Math.min(0.5, v.y)), z: v.z });
  const dk = new Drake(dim, add(add(up(p.location, 1.6), dir, -3), UP, 0.8), dragonSize(p, 0.55), 2);
  const bite = hitter(ctx, 1, 6), start = { ...dk.pos };
  snd(p, "mob.enderdragon.growl", 0.7, 1.3); snd(p, "mob.enderdragon.flap", 0.8, 1.2);
  for (let k = 1; k <= 12; k++) later(k, () => {
    if (!dk.ok()) return;
    dk.move(add(start, dir, k * 1.3), dir, 0.8);
    if (k >= 3 && k <= 10) { const q = add(dk.head(), dir, -0.4); push(p, { x: (q.x - p.location.x) * 0.5, y: (q.y - 1 - p.location.y) * 0.5 + 0.08, z: (q.z - p.location.z) * 0.5 }); }
    speed(dim, dk.pos, dir, { n: 6 });
    for (const e of bodyHits(dk, 1.5)) if (bite(e, 0.4)) { burst(dim, center(e), { n: 10, tone: tn }); snd(p, "mob.ravager.bite", 0.7, 1.1); }
    if (k === 12) { dk.remove(); noFall(p, 60); }
  });
}

// ═════════ ③ 천쇄 (입체 기동 엔진 + 흑룡 테마 + 따라 나는 흑룡) ═════════
function hr_odm(ctx) {
  const { p } = ctx;
  st(p).ctx = ctx;
  odmStart(p, { ...ctx, theme: HR_THEME, power: 1, mulf: () => veinMul(p), onHit: () => vein(p, 3) });
}

// ═════════ ② 흑룡 비행 (V12.151: ④ 에서 옮김 · 4초 · 숨결 3) ═════════
const FLY_T = 80, BREATHS = 3;
function hr_fly(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), big = veinN(p) >= VEIN_MAX;
  s.ctx = ctx;
  if (odmActive(p)) odmDetach(p);
  const size = dragonSize(p, 1.15) * (big ? 1.15 : 1);
  const dk = new Drake(dim, up(p.location, 0.5), size);
  const hit = hitter(ctx, 4, 10), tn = tone(p);
  const f = { t: 0, breaths: BREATHS, lastBreath: -99, sneakPrev: true, diving: false, done: false, big, dk };
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
  notify(p, `§5§l숨결 §d${"●".repeat(f.breaths)}§8${"○".repeat(BREATHS - f.breaths)}`);
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
    const at = { ...land }, mul = (f.big ? 1.5 : 1) * 1.0, R = 5 + dk.size * 1.5;
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

// ═════════ ④ 흑룡 결계 「용린옥」 ═════════
//   칼을 땅에 꽂으면 반지름 14칸(용맥 5단 18칸)에 흑요석 비늘 돔이 땅에서 솟아 닫힘 · 바닥에 도는 용 문양
//   벽을 따라 흑룡이 꼬불꼬불 휘감아 돎(5단이면 둘) · 벽에 닿은 적은 안으로 튕김 · 안의 적은 둔해짐
//   안에서 나는 빨라지고 공중 점프 한 번 더 · 내가 벤 적에게 벽의 흑룡이 날아와 물어뜯음(필중 추격)
//   8초 뒤 또는 ④ 다시 = 돔이 안으로 무너지며 흑룡이 중심으로 내리꽂힘 (안의 모든 적에게 큰 피해)
const DOM_T = 160;
const inDom = (d, e) => { const q = sub(e.location, d.c); return Math.hypot(q.x, q.z) < d.R && q.y > -3 && q.y < d.R; };
function hr_domain(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), big = veinN(p) >= VEIN_MAX;
  s.ctx = ctx;
  if (odmActive(p)) odmDetach(p);
  const c = { ...p.location }, R = big ? 18 : 14;
  const d = { c, R, t: 0, done: false, big, drakes: [], queue: [], bite: new Map(), biting: false, jumpPrev: true, airJump: false };
  s.dom = d;
  M.anim(p, "smash");
  snd(p, "mob.enderdragon.growl", 1, big ? 0.6 : 0.75); snd(p, "ambient.weather.thunder", 0.8, 0.6); shake(p, 0.4, 0.6);
  pt(dim, "hr_shock", up(c, 0.1), { r: R, n: 220, life: 0.8 }, 0);
  notify(p, "§5§l흑룡 결계 · 용린옥 §r§7— 8초 (④ 다시: 무너뜨리기)");
  const tick = () => {
    if (d.done || !p.isValid()) return;
    d.t++;
    // 돔 · 문양
    if (d.t <= 14) { if (d.t % 2 === 0) pt(dim, "hr_dome", c, { r: R, h: d.t / 14, n: 900, life: 0.16, size: 1.4 }, 0); }
    else if (d.t % 4 === 0) pt(dim, "hr_dome", c, { r: R, h: 1, n: 700, life: 0.24, size: 1.4 }, 0);
    if (d.t % 6 === 0) pt(dim, "hr_sigil", c, { r: R * 0.95, spin: 24, n: 520, life: 0.36, size: 1.2 }, 1);
    // 벽을 휘감아 도는 흑룡
    if (d.t === 10) for (let i = 0; i < (big ? 2 : 1); i++) d.drakes.push(new Drake(dim, add(c, { x: R * 0.9, y: 3, z: 0 }), dragonSize(p, 1.0), 0, { life: 1.1 }));
    d.drakes.forEach((dk, i) => {
      if (dk.busy) return;
      const ang = d.t * 0.085 + i * Math.PI, el = Math.sin(ang * 2.3 + i) * 0.55, rr = R * 0.9;
      const at = add(c, { x: Math.cos(ang) * Math.cos(el) * rr, y: 2 + Math.abs(Math.sin(el)) * rr * 0.75, z: Math.sin(ang) * Math.cos(el) * rr });
      dk.move(at, sub(at, dk.head()), 0.45);
    });
    if (d.t >= 10) {
      for (const e of foes(dim, c, R + 2)) {
        if (!inDom(d, e) && Math.hypot(e.location.x - c.x, e.location.z - c.z) > R + 1.5) continue;
        const q = sub(e.location, c), L = Math.hypot(q.x, q.z) || 1;
        if (L > R - 1.2) { push(e, { x: (-q.x / L) * 0.9, y: 0.25, z: (-q.z / L) * 0.9 }); burst(dim, center(e), { n: 6 }); } // 벽에 튕김
        if (d.t % 20 === 10) try { M.potion(e, "slowness", 2, 1.2); } catch {}
      }
      if (inDom(d, p)) {
        if (d.t % 20 === 10) try { M.potion(p, "speed", 2, 1.2); } catch {}
        const g = onGround(p); let jump = false; try { jump = !!p.isJumping; } catch {}
        if (g) d.airJump = false;
        else if (jump && !d.jumpPrev && !d.airJump) { d.airJump = true; const f = fwdOf(yawOf(p)); push(p, { x: f.x * 0.6, y: 0.95, z: f.z * 0.6 }); wings(p, 1); burst(dim, p.location, { n: 12, spd: 3 }); snd(p, "mob.enderdragon.flap", 0.8, 1.5); noFall(p, 60); }
        d.jumpPrev = jump;
      }
      // 필중 추격: 내가 벤 적에게 가까운 벽 흑룡이 날아와 물어뜯음
      while (d.queue.length && d.drakes.length) {
        const e = d.queue.shift(); if (!e?.isValid()) continue;
        const dk = d.drakes.reduce((a, b) => (len(sub(a.head(), e.location)) < len(sub(b.head(), e.location)) ? a : b));
        const h = dk.head(), to = center(e), dl = sub(to, h);
        for (let j = 1; j <= 5; j++) flame(dim, add(h, dl, j / 6), { n: 6, r: 0.3, spd: 1.5, vd: scl(norm(dl), 2) });
        d.biting = true; try { hitter(ctx, 44, 1)(e, 0.3); } finally { d.biting = false; }
        burst(dim, to, { n: 14, spd: 4 }); snd(p, "mob.ravager.bite", 0.6, 1.2);
      }
    }
    if (d.t >= DOM_T) return collapse(ctx, d);
    later(1, tick);
  };
  later(1, tick);
}
/** 무너뜨리기: 돔이 안으로 오므라들고 흑룡이 중심으로 내리꽂힘 */
function collapse(ctx, d) {
  const { p } = ctx, dim = p.dimension, s = st(p), hit = hitter(ctx, 45, 1);
  if (d.done) return; d.done = true;
  d.drakes.forEach((dk) => { dk.busy = true; });
  snd(p, "mob.enderdragon.growl", 1, 0.6);
  for (let k = 1; k <= 12; k++) later(k, () => {
    if (k % 2 === 0) pt(dim, "hr_dome", d.c, { r: d.R * (1 - k / 13), h: 1, n: 500, life: 0.14, size: 1.3 }, 0);
    d.drakes.forEach((dk) => { const h = dk.head(), to = up(d.c, 1), dl = sub(to, h), L = len(dl); dk.move(add(h, dl, Math.min(1, 2.4 / (L || 1))), dl, 0.2); });
  });
  later(13, () => {
    const c = d.c, mul = 2.2 * (d.big ? 1.4 : 1);
    pt(dim, "hr_shock", up(c, 0.1), { r: d.R, n: 260, life: 0.8 }, 0);
    for (let i = 0; i < 10; i++) { const q = add(c, { x: Math.cos(i * 0.628) * d.R * 0.5, y: 0.2, z: Math.sin(i * 0.628) * d.R * 0.5 }); flame(dim, q, { n: 16, r: 0.6, spd: 3.5, vd: { x: 0, y: 1.8, z: 0 }, life: 1 }); }
    arc(dim, up(c, 1), yawOf(p), { sweep: 400, r: d.R * 0.6, dur: 0.12, n: 300 });
    for (const e of foes(dim, c, d.R)) if (inDom(d, e)) { hit(e, mul); push(e, { x: 0, y: 0.7, z: 0 }); }
    snd(p, "random.explode", 1, 0.6); snd(p, "ambient.weather.thunder", 1, 0.8); shake(p, 0.7, 0.6);
    d.drakes.forEach((dk) => dk.remove()); if (s.dom === d) s.dom = null;
    notify(p, "§5§l용린옥 붕괴");
  });
}
const hr_domain_pre = (p) => { const s = st(p), d = s.dom; if (d && !d.done) { collapse(s.ctx, d); return true; } return false; };
// 결계 안에서 내가 때린 적 → 추격 대기열
world.afterEvents.entityHurt.subscribe(({ hurtEntity: e, damageSource }) => {
  try {
    const p = damageSource?.damagingEntity; if (p?.typeId !== "minecraft:player") return;
    const d = ST.get(p.id)?.dom; if (!d || d.done || d.biting || d.t < 10 || e.id === p.id || e.typeId === "minecraft:player" || !inDom(d, e)) return;
    if (now() - (d.bite.get(e.id) ?? -99) < 10) return;
    d.bite.set(e.id, now()); d.queue.push(e);
  } catch {}
});

// ═════════ 표 · HUD ═════════
export const heukLine = (p) => {
  if (heldId(p) !== ID) return "";
  const n = veinN(p), s = st(p);
  let line = `§5용맥 §d${"◆".repeat(n)}§8${"◇".repeat(VEIN_MAX - n)}`;
  if (s.fly && !s.fly.done) line += ` §5비행 §d${Math.ceil((FLY_T - s.fly.t) / 20)}초 §7숨결 ${s.fly.breaths}`;
  else if (s.dom && !s.dom.done) line += ` §5결계 §d${Math.ceil((DOM_T - s.dom.t) / 20)}초`;
  else if (odmActive(p)) line += ` §5천쇄 §d${"◆".repeat(odmLeft(p))}`;
  return line;
};
export const WEAPON_SKILLS = {
  [ID]: [
    { id: "w_hr_1", key: 1, name: "흑룡 · 용조 연참", short: "연참", lv: 1, mp: 6, cd: 0.35, pow: 1, run: hr_combo, pre: (p) => odmLeap(p) || breath(p),
      desc: "4타: 칠 때마다 시선 쪽으로 빠르게 크게 돌진하며 벤다(공중이면 위아래도). 화려한 검기 + 앞으로 날아가 관통하는 초승달 검기. 4타는 등 뒤에서 흑룡이 튀어나와 꼬불꼬불 돌진하며 물어뜯고, 나도 그 머리에 끌려 같이 날아간다. ② 비행 중 ① = 숨결, ③ 천쇄 중 ① = 회전 도약." },
    { id: "w_hr_2", key: 2, name: "흑룡 · 비행", short: "비행", lv: 1, mp: 25, cd: 20, pow: 1, run: hr_fly,
      desc: "흑룡을 불러 등에 올라타 4초 동안 시선으로 조종하며 난다(빠르게 선회 · 벽 · 땅은 타고 넘음). 흑룡 몸에 닿는 적을 벤다. 클릭 = 보랏빛 숨결(3번), 쉬프트 = 날개 없이 몸을 틀어 조준점으로 급강하해 내리꽂음. 용맥이 높을수록 흑룡이 크고, 5단이면 더 빠르고 1.5배." },
    { id: "w_hr_3", key: 3, name: "흑룡 · 천쇄", short: "천쇄", lv: 1, mp: 18, cd: 25, pow: 1, run: hr_odm, pre: odmHop,
      desc: "사슬 입체 기동(벽 · 나무 · 지형 · 적에 자동으로 박혀 휘돌아 날아감) + 등에 흑룡 날개. 흑룡이 내 위를 꼬불꼬불 돌며 따라 날고, 클릭(회전 도약)하면 가까운 적에게 급강하해 물어뜯는다. 점프 = 다음 사슬(5번). ② = 사슬을 끊고 비행. 끝나면 25초 대기." },
    { id: "w_hr_4", key: 4, name: "흑룡 · 결계 「용린옥」", short: "결계", lv: 1, mp: 45, cd: 120, pow: 1, run: hr_domain, pre: hr_domain_pre,
      desc: "칼을 땅에 꽂아 반지름 14칸(용맥 5단 18칸)에 흑요석 비늘 돔을 땅에서 솟아 닫는다. 바닥엔 도는 용 문양, 벽을 따라 흑룡이 휘감아 돈다(5단이면 둘). 벽에 닿은 적은 안으로 튕기고 안의 적은 둔해진다. 안에서 나는 빨라지고 공중 점프 한 번 더, 내가 벤 적에게는 벽의 흑룡이 날아와 물어뜯는다. 8초 뒤 또는 ④ 다시 = 돔이 무너지며 흑룡이 중심으로 내리꽂혀 안의 모든 적에게 큰 피해." },
  ],
};
