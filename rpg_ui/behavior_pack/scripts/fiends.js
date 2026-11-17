// ═══════════════════════════════════════════════════════════════════════
// 사흉수 무기 (V11.7) — 기동 · 컨트롤형 스킬 무기 넷 (사신수의 약 75% 위력)
//   재입력: 같은 키를 정해진 시간 안에 다시 누르면 후속 동작 (쿨타임·마나 없이, pre 훅)
//   혼돈의 구슬  ① 혼돈탄 3연(3번째 = 균열) · ② 차원 이동(균열 → 4초 안에 다시: 순간이동 + 양쪽 폭발) · ③ 무형 질주(시선으로 조종, 다시: 멈춤 폭발) · ④ 혼돈 붕괴(균열 넷, 6초 동안 클릭마다 다음 균열로)
//   궁기의 쌍발톱 ① 쌍조 연참 4타(돌진, 4타 올려 베기 · 표식) · ② 흑익 활공(3초, 클릭: 조준점 급강하) · ③ 표식 도약(1.5초 안에 다시: 다음 표식, 최대 4) · ④ 흉익 강림(떠서 클릭마다 깃털 탄막 6, 마지막 내리꽂기)
//   도올의 대망치 ① 분쇄 3타(공중 3타 = 낙하 강타) · ② 멈추지 않는 돌진(시선 조종, 벽 충돌 충격파, 다시: 올려치기) · ③ 망치 투척(3초 안에 다시: 망치로 끌려가 강타) · ④ 폭주(대지진 + 8초 동안 착지마다 지진)
//   도철의 아가리 ① 탐식 3타(아가리, 3타 끌어당김) · ② 집어삼키기(물면 끌려가 흡수) · ③ 탐식 도약(적 위 착지 = ③ 초기화) · ④ 도철 현신(가면 · 소용돌이, 3초 클릭 연타로 씹기)
//   도철 「허기」: 시간이 지나면 차오르고 100 이면 체력을 갉아먹음, 삼키면 줄어듦
// 파티클: gen_fiends.py (hd_ · qq_ · tw_ · tt_) — 모두 스스로 움직임
// ═══════════════════════════════════════════════════════════════════════
import { system, world, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
import * as M from "./ms.js";
import { spend } from "./pbudget.js";
import { drawMagic } from "./magic.js";
import { MASK } from "./tt_meta.js";

const FIEND = 0.75; // 사신수 대비 위력
const later = (t, fn) => system.runTimeout(() => { try { fn(); } catch {} }, Math.max(1, Math.round(t)));
const up = (l, y) => ({ x: l.x, y: l.y + y, z: l.z });
const yawOf = (p) => p.getRotation().y;
const rad = (d) => (d * Math.PI) / 180;
const fwdOf = (yaw) => ({ x: -Math.sin(rad(yaw)), y: 0, z: Math.cos(rad(yaw)) });
const rightOf = (yaw) => ({ x: -Math.cos(rad(yaw)), y: 0, z: -Math.sin(rad(yaw)) });
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (v) => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const crs = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const UP = { x: 0, y: 1, z: 0 };
const center = (e) => up(e.location, 0.9);
const snd = (p, id, vol = 1, pitch = 1) => M.sound(p, id, pitch, vol);
const eyeOf = (p) => { try { return p.getHeadLocation(); } catch { return up(p.location, 1.6); } };
const viewOf = (p) => { try { return p.getViewDirection(); } catch { return fwdOf(yawOf(p)); } };
const flatN = (v) => norm({ x: v.x, y: 0, z: v.z });
const now = () => system.currentTick;

const DEF = { n: 10, r: 0.3, spd: 2, life: 0.6, size: 1, tone: 0, vs: 0, h: 0.3, spin: 0, a0: 0, a1: 0, dur: 0.1, iw: 1, ih: 1, scale: 0.1 };
function pt(dim, name, loc, o = {}, prio = 1) {
  if (!spend(o.n ?? 10, (o.life ?? 0.6) + (o.dur ?? 0), prio)) return;
  try {
    const m = new MolangVariableMap();
    for (const k of Object.keys(DEF)) m.setFloat(`variable.${k}`, o[k] ?? DEF[k]);
    for (const k of ["u", "v", "w", "vd"]) m.setVector3(`variable.${k}`, o[k] ?? UP);
    dim.spawnParticle(`rpg:${name}`, loc, m);
  } catch {}
}
function hitter(ctx) {
  const last = new Map();
  return (e, mul, cd = 4) => {
    if (!e?.isValid() || e.id === ctx.p.id) return false;
    const t = now();
    if (t - (last.get(e.id) ?? -99) < cd) return false;
    last.set(e.id, t);
    M.skillHit.set(e.id, t);
    const d = Math.max(1, Math.round(ctx.dmg * FIEND * mul * (ctx.mulx ?? 1)));
    try { e.applyDamage(d, { cause: EntityDamageCause.entityAttack, damagingEntity: ctx.p }); } catch {}
    ctx.onHit?.(e, d);
    return true;
  };
}
const foes = (dim, at, r) => M.around(dim, at, r).filter((e) => e.isValid());
const shake = (p, pw, sec) => { try { p.runCommand(`camerashake add @s ${pw} ${sec} positional`); } catch {} };
const combo = new Map();
function step(p, key, max, gap = 26) { const k = `${p.id}|${key}`, c = combo.get(k), n = c && now() - c.t <= gap ? (c.n + 1) % max : 0; combo.set(k, { n, t: now() }); return n; }
function aim(p, maxD = 22) {
  try { const h = p.getEntitiesFromViewDirection({ maxDistance: maxD }).map((x) => x.entity).find((e) => e?.isValid() && e.id !== p.id && e.typeId !== "minecraft:item"); if (h) return { at: center(h), ent: h }; } catch {}
  try { const b = p.getBlockFromViewDirection({ maxDistance: maxD }); if (b) return { at: add(b.block.location, { x: 0.5, y: 1, z: 0.5 }), block: true }; } catch {}
  return { at: add(eyeOf(p), viewOf(p), maxD) };
}
const healPct = (p, f) => { try { const hp = p.getComponent("minecraft:health"); hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + hp.effectiveMax * f)); } catch {} };
const ST = new Map(); // pid → 무기별 상태
const st = (p) => { let s = ST.get(p.id); if (!s) ST.set(p.id, (s = {})); return s; };
const ctxOf = (p, s) => s.ctx; // 재입력 때 처음 시전한 위력 그대로

// ═════════════ 혼돈의 구슬 ═════════════
const ELEM = [{ n: "불", tone: 0.05, eff: (e) => { try { e.setOnFire(3, true); } catch {} } }, { n: "얼음", tone: 0.6, eff: (e) => M.potion(e, "slowness", 3, 2) }, { n: "번개", tone: 0.35, eff: (e) => M.potion(e, "weakness", 2, 2) }, { n: "공허", tone: 0.82, eff: (e) => M.potion(e, "wither", 1, 2) }];
const rift = (dim, at, p, life = 4, R = 1.4) => { const f = flatN(viewOf(p)); pt(dim, "hd_rift", at, { u: { x: -f.z, y: 0, z: f.x }, v: UP, r: R, n: 110, life, size: 1.2 }, 0); };
const chaosBoom = (ctx, at, R, mul, el) => { const dim = ctx.p.dimension, hit = hitter(ctx); pt(dim, "hd_burst", at, { n: 50, r: 0.5, spd: 7, life: 0.7, size: 1.2, tone: el.tone }, 0); for (const e of foes(dim, at, R)) if (hit(e, mul, 1)) el.eff(e); snd(ctx.p, "random.explode", 0.5, 1.4); };
function hd_shot(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), n = step(p, "hd1", 3), el = ELEM[n % 3], from = add(add(eyeOf(p), viewOf(p), 1), UP, -0.3), a = aim(p, 24), L = Math.max(1, len(sub(a.at, from))), spd = 28;
  s.ctx = ctx;
  M.anim(p, "cast");
  pt(dim, "hd_orb", from, { vd: norm(sub(a.at, from)), vs: spd, life: L / spd, n: n === 2 ? 70 : 40, r: n === 2 ? 0.3 : 0.2, size: n === 2 ? 1.5 : 1.1, tone: el.tone }, 0);
  snd(p, "mob.evocation_illager.cast_spell", 0.5, 1.4 + n * 0.15);
  later(Math.ceil((L / spd) * 20), () => {
    chaosBoom(ctx, a.at, n === 2 ? 2.8 : 1.6, n === 2 ? 0.8 : 0.55, el);
    if (n === 2) { s.rift = { at: up(a.at, 0.3), until: now() + 120 }; rift(dim, up(a.at, 0.3), p, 6); notify(p, "§d균열 생성 §7(② 로 순간이동)"); }
  });
  if (n === 2) ctx.setCd?.(8);
}
function hd_warp_pre(p) { // ② 다시: 균열로 순간이동
  const s = st(p);
  if (!s.rift || now() > s.rift.until || !s.ctx || !s.warpArmed || now() > s.warpArmed) return false;
  const from = { ...p.location }, to = s.rift.at, dim = p.dimension;
  s.rift = null; s.warpArmed = 0;
  pt(dim, "hd_ghost", from, { n: 30, life: 0.8, size: 1.2 }, 1);
  try { p.teleport(to, { keepVelocity: false }); } catch {}
  chaosBoom(s.ctx, up(from, 1), 3, 0.7, ELEM[3]);
  later(1, () => chaosBoom(s.ctx, up(to, 1), 3, 0.9, ELEM[Math.floor(Math.random() * 3)]));
  snd(p, "mob.endermen.portal", 1, 0.6);
  return true;
}
function hd_warp(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p);
  s.ctx = ctx;
  M.anim(p, "cast");
  if (!s.rift || now() > s.rift.until) { const a = aim(p, 20); s.rift = { at: up(a.at, a.ent ? 0 : 0.3), until: now() + 80 }; rift(dim, s.rift.at, p, 4); }
  else rift(dim, s.rift.at, p, 2.2, 1.6);
  s.warpArmed = now() + 80;
  notify(p, "§d차원 이동 준비 §7(4초 안에 ② 다시)");
  snd(p, "block.portal.trigger", 0.3, 1.8);
}
function hd_phase_pre(p) { const s = st(p); if (s.phase && now() < s.phase.until) { s.phase.stop = true; return true; } return false; }
function hd_phase(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), hit = hitter(ctx), until = now() + 40;
  s.ctx = ctx; const ph = { until, stop: false }; s.phase = ph;
  M.potion(p, "resistance", 4, 2.1); M.potion(p, "invisibility", 1, 2.1);
  snd(p, "mob.vex.charge", 0.8, 1.2);
  const step2 = () => {
    if (!p.isValid()) return;
    const end = ph.stop || now() >= until;
    if (end) { if (s.phase === ph) s.phase = null; try { p.removeEffect("invisibility"); } catch {} chaosBoom(ctx, up(p.location, 1), 3.5, 1.1, ELEM[Math.floor(Math.random() * 4)]); return; }
    const v = viewOf(p);
    try { p.applyKnockback(v.x, v.z, 1.25, v.y * 0.9 + 0.05); } catch {}
    pt(dim, "hd_ghost", p.location, { n: 8, life: 0.6, size: 1.1 }, 1);
    for (const e of foes(dim, p.location, 1.8)) if (hit(e, 0.45, 8)) pt(dim, "hd_burst", center(e), { n: 10, r: 0.2, spd: 3, life: 0.4 }, 2);
    later(1, step2);
  };
  later(1, step2);
}
function hd_ult_pre(p) { // ④ 중 클릭: 다음 균열로 순간이동 + 그 균열의 원소 폭발
  const s = st(p), u = s.ult;
  if (!u || now() > u.until) return false;
  if (now() - (u.last ?? 0) < 6) return true;
  u.last = now();
  const r = u.rifts[u.i % 4], el = ELEM[u.i % 4];
  u.i++;
  pt(p.dimension, "hd_ghost", p.location, { n: 20, life: 0.6 }, 1);
  try { p.teleport(r, { keepVelocity: false }); } catch {}
  chaosBoom(s.ctx, up(r, 0.5), 3.6, 0.85, el);
  shake(p, 0.3, 0.2);
  return true;
}
function hd_ult(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), o = { ...p.location }, yw = yawOf(p);
  s.ctx = ctx;
  const rifts = [0, 90, 180, 270].map((a) => add(o, fwdOf(yw + a + 45), 6));
  s.ult = { rifts, i: 0, until: now() + 120, last: 0 };
  drawMagic(dim, up(o, 0.1), UP, "cyan", { R: 7, color: [0.9, 0.5, 1], life: 6.2, draw: 0.4, yaw: yw });
  rifts.forEach((r, i) => { const f = norm(sub(r, o)); pt(dim, "hd_rift", up(r, 1.2), { u: { x: -f.z, y: 0, z: f.x }, v: UP, r: 1.6, n: 120, life: 6.2, size: 1.3, tone: ELEM[i].tone }, 0); });
  notify(p, "§d§l혼돈 붕괴 §r§7— 6초 동안 클릭으로 균열 사이를 넘나들어라");
  snd(p, "mob.wither.spawn", 0.4, 1.6);
  later(120, () => { // 균열 넷이 한꺼번에 무너짐
    s.ult = null;
    rifts.forEach((r, i) => later(i * 2, () => chaosBoom(ctx, up(r, 1), 4, 1.2, ELEM[i])));
    later(9, () => { chaosBoom(ctx, up(o, 1), 7, 1.4, ELEM[3]); shake(p, 0.7, 0.5); });
  });
}
const notify = (p, t) => { try { p.onScreenDisplay.setActionBar(t); } catch {} };

// ═════════════ 궁기의 쌍발톱 ═════════════
const MARK = new Map(); // 적 id → { pid, until }
const claw = (dim, at, yaw, o = {}) => { const f = fwdOf(yaw), r = rightOf(yaw), t = rad(o.tilt ?? 0), v = { x: r.x * Math.cos(t), y: Math.sin(t), z: r.z * Math.cos(t) }, d = o.dir ?? 1, sw = o.sweep ?? 130; pt(dim, "qq_claw", at, { u: f, v, r: o.r ?? 2.6, a0: (d * sw) / 2, a1: (-d * sw) / 2, dur: o.dur ?? 0.06, life: o.life ?? 0.35, n: o.n ?? 120, size: o.size ?? 1.2, spd: 2 }, 0); };
const mark = (p, e) => { MARK.set(e.id, { pid: p.id, until: now() + 200, e }); pt(p.dimension, "qq_burst", center(e), { n: 8, r: 0.2, spd: 2, life: 0.5 }, 2); };
function qq_combo(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), hit = hitter(ctx), yw = yawOf(p), f = fwdOf(yw), n = step(p, "qq1", 4);
  s.ctx = ctx;
  if (s.glide && now() < s.glide.until) return qq_dive(p);
  M.anim(p, n === 3 ? "slash_down" : "slash");
  try { p.applyKnockback(f.x, f.z, n === 3 ? 0.4 : 0.85, n === 3 ? 0.75 : 0.05); } catch {} // 짧은 돌진 · 4타는 솟구침
  const c = up(p.location, 1.1);
  claw(dim, c, yw, [{ tilt: 30 }, { tilt: -30, dir: -1 }, { tilt: 70 }, { tilt: 90, dir: -1, r: 3 }][n]);
  later(2, () => { for (const e of foes(dim, add(p.location, f, 1.6), 3)) { if (hit(e, n === 3 ? 0.75 : 0.5)) { mark(p, e); if (n === 3) try { e.applyKnockback(0, 0, 0, 0.75); } catch {} } } snd(p, "game.player.attack.sweep", 0.7, 1.3 + n * 0.1); snd(p, "mob.cat.hiss", 0.25, 1.4); });
  if (n === 3) ctx.setCd?.(8);
}
function qq_dive(p) { // 활공 중 클릭: 조준점으로 급강하
  const s = st(p), ctx = s.ctx, dim = p.dimension, hit = hitter(ctx), a = aim(p, 26);
  s.glide = null;
  const from = { ...p.location }, d = sub(a.at, from), L = len(d), u = norm(d);
  try { p.removeEffect("slow_falling"); p.applyKnockback(u.x, u.z, Math.min(4, L * 0.3), Math.min(-0.4, u.y * 2.2)); } catch {}
  M.anim(p, "slash_down");
  pt(dim, "qq_feather", up(from, 1), { vd: u, vs: L / 0.4, life: 0.4, n: 30, r: 0.4, h: 0.15, size: 1.2 }, 1);
  let tt = 0;
  const wait = () => { tt++; let g = false; try { g = p.isOnGround; } catch {} if ((tt > 2 && g) || tt > 25) { const at = { ...p.location }; claw(dim, up(at, 0.8), yawOf(p), { sweep: 359, r: 3.2, dur: 0.1 }); pt(dim, "qq_burst", up(at, 0.5), { n: 40, r: 0.6, spd: 6, life: 0.7 }, 0); for (const e of foes(dim, at, 3.5)) if (hit(e, 1.2, 1)) mark(p, e); shake(p, 0.4, 0.3); snd(p, "random.explode", 0.5, 1.5); } else later(1, wait); };
  later(2, wait);
  return true;
}
function qq_glide(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), until = now() + 60;
  s.ctx = ctx; s.glide = { until };
  M.anim(p, "raise");
  try { p.applyKnockback(0, 0, 0, 0.9); } catch {}
  later(6, () => M.potion(p, "slow_falling", 1, 2.8));
  snd(p, "mob.enderdragon.flap", 0.8, 1.4);
  const fly = () => {
    if (!p.isValid() || !s.glide || now() > until) { s.glide = null; return; }
    const v = viewOf(p), yw = yawOf(p), back = add(up(p.location, 1.3), fwdOf(yw), -0.3), r = rightOf(yw);
    try { p.applyKnockback(v.x, v.z, 0.75, Math.max(-0.15, v.y * 0.4)); } catch {}
    if ((until - now()) % 4 === 0) for (const sg of [-1, 1]) pt(dim, "qq_wing", back, { u: add({ x: 0, y: 0, z: 0 }, r, sg), v: UP, w: fwdOf(yw), r: 2.4, spin: 900, n: 70, life: 0.22, size: 1.1 }, 2); // 스스로 퍼덕이는 날개
    later(1, fly);
  };
  later(6, fly);
  notify(p, "§c흑익 활공 §7— 클릭: 조준점으로 급강하");
}
function qq_hop_pre(p) { const s = st(p); if (s.hop && now() <= s.hop.until && s.hop.left > 0) { qq_hopOnce(p); return true; } return false; }
function qq_hopOnce(p) {
  const s = st(p), ctx = s.ctx, dim = p.dimension, hit = hitter(ctx), v = viewOf(p), eye = eyeOf(p);
  const marks = [...MARK.values()].filter((m) => m.pid === p.id && m.until > now() && m.e.isValid() && !s.hop.done.has(m.e.id));
  if (!marks.length) { s.hop = null; notify(p, "§7남은 표식이 없다"); return; }
  // 조준점에 가장 가까운(시선 각도) 표식
  marks.sort((a, b) => { const sc = (m) => { const d = norm(sub(center(m.e), eye)); return -(d.x * v.x + d.y * v.y + d.z * v.z); }; return sc(a) - sc(b); });
  const e = marks[0].e, from = { ...p.location }, dir = flatN(sub(e.location, from)), to = add(e.location, dir, 1.6);
  s.hop.done.add(e.id); s.hop.left--; s.hop.until = now() + 30;
  pt(dim, "qq_feather", up(from, 1), { vd: norm(sub(to, from)), vs: len(sub(to, from)) / 0.2, life: 0.2, n: 24, r: 0.3, h: 0.1 }, 1);
  try { p.teleport(to, { facingLocation: center(e), keepVelocity: false }); } catch {}
  claw(dim, center(e), yawOf(p) + 180, { tilt: (Math.random() - 0.5) * 80, r: 2.2, n: 110 });
  hit(e, 0.9, 1);
  MARK.delete(e.id);
  snd(p, "mob.phantom.bite", 0.8, 1.2 + (4 - s.hop.left) * 0.1);
  notify(p, `§c표식 도약 §7— ${s.hop.left > 0 ? "1.5초 안에 ③ 다시" : "끝"}`);
}
function qq_hop(ctx) { const { p } = ctx, s = st(p); s.ctx = ctx; s.hop = { left: 4, until: now() + 30, done: new Set() }; qq_hopOnce(p); }
function qq_ult_pre(p) { // ④ 중 클릭: 조준점으로 깃털 탄막
  const s = st(p), u = s.wings;
  if (!u || now() > u.until) return false;
  if (u.shots <= 0 || now() - u.last < 5) return true;
  u.shots--; u.last = now();
  const dim = p.dimension, hit = hitter(s.ctx), from = add(eyeOf(p), UP, -0.2), a = aim(p, 30), d = sub(a.at, from), L = Math.max(1, len(d)), sp = 30;
  pt(dim, "qq_feather", from, { vd: norm(d), vs: sp, life: L / sp, n: 26, r: 0.6, h: 0.18, size: 1.3 }, 0);
  u.target = a.at;
  later(Math.ceil((L / sp) * 20), () => { pt(dim, "qq_burst", a.at, { n: 24, r: 0.4, spd: 5, life: 0.6 }, 1); for (const e of foes(dim, a.at, 2.6)) if (hit(e, 0.55, 2)) mark(p, e); });
  snd(p, "mob.enderdragon.flap", 0.4, 1.8);
  return true;
}
function qq_ult(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), until = now() + 60;
  s.ctx = ctx; s.wings = { until, shots: 6, last: 0, target: null };
  M.anim(p, "raise");
  try { p.applyKnockback(0, 0, 0, 1.4); } catch {}
  later(8, () => M.potion(p, "levitation", 1, 0.3)); later(12, () => M.potion(p, "slow_falling", 1, 2.6));
  M.potion(p, "resistance", 3, 4);
  snd(p, "mob.enderdragon.growl", 0.6, 1.6);
  notify(p, "§c§l흉익 강림 §r§7— 클릭마다 깃털 탄막(6), 3초 뒤 조준점으로 내리꽂힘");
  for (let t = 4; t < 60; t += 4) later(t, () => { const yw = yawOf(p), back = add(up(p.location, 1.3), fwdOf(yw), -0.3), r = rightOf(yw); for (const sg of [-1, 1]) pt(dim, "qq_wing", back, { u: add({ x: 0, y: 0, z: 0 }, r, sg), v: UP, w: fwdOf(yw), r: 3.4, spin: 500, n: 90, life: 0.22, size: 1.3 }, 1); });
  later(60, () => { // 마지막: 조준점으로 내리꽂힘 + 표식 대상 전부 할큄
    s.wings = null;
    const a = aim(p, 30), u = norm(sub(a.at, p.location));
    try { p.removeEffect("slow_falling"); p.applyKnockback(u.x, u.z, 3, -2.4); } catch {}
    M.anim(p, "slash_down");
    let tt = 0;
    const wait = () => { tt++; let g = false; try { g = p.isOnGround; } catch {} if ((tt > 2 && g) || tt > 30) { const at = { ...p.location }; claw(dim, up(at, 1), yawOf(p), { sweep: 359, r: 4, dur: 0.12, n: 220 }); pt(dim, "qq_burst", up(at, 0.6), { n: 70, r: 1, spd: 8, life: 0.8, size: 1.3 }, 0); const h2 = hitter(ctx); for (const e of foes(dim, at, 4.5)) h2(e, 1.4, 1); for (const m of [...MARK.values()]) if (m.pid === p.id && m.e.isValid() && m.until > now()) { claw(dim, center(m.e), yawOf(p) + Math.random() * 180, { r: 1.8, n: 70 }); h2(m.e, 0.7, 1); MARK.delete(m.e.id); } shake(p, 0.7, 0.5); snd(p, "random.explode", 0.8, 1.2); } else later(1, wait); };
    later(2, wait);
  });
}

// ═════════════ 도올의 대망치 ═════════════
const MOM = new Map(); // 가속 0~100 (달리거나 점프하면 쌓임)
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    if (heldId(p) !== "rpg:taowu_hammer") continue;
    let v = { x: 0, y: 0, z: 0 }; try { v = p.getVelocity(); } catch {}
    const sp = Math.hypot(v.x, v.z), m = MOM.get(p.id) ?? 0;
    MOM.set(p.id, Math.max(0, Math.min(100, m + (sp > 0.15 ? 6 : -4) + (v.y > 0.3 ? 4 : 0))));
  }
}, 5);
const heldId = (p) => { try { return p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex)?.typeId; } catch { return undefined; } };
const momMul = (p) => { const m = MOM.get(p.id) ?? 0; MOM.set(p.id, 0); return 1 + m / 200; };
const quake = (ctx, at, R, mul, big = false) => {
  const dim = ctx.p.dimension, hit = hitter(ctx);
  pt(dim, "tw_ring", at, { r: 0.6, spd: big ? 14 : 9, n: big ? 110 : 70, life: 0.7, size: big ? 1.4 : 1.1 }, 0);
  pt(dim, "tw_rock", at, { r: big ? 1.5 : 1, spd: big ? 9 : 7, n: big ? 30 : 16, life: 1.3 }, 1);
  for (let k = 0; k < (big ? 6 : 4); k++) { const a = rad(k * (360 / (big ? 6 : 4)) + Math.random() * 30), d = { x: Math.cos(a), y: 0, z: Math.sin(a) }; pt(dim, "tw_crack", up(at, 0.06), { u: d, v: { x: -d.z, y: 0, z: d.x }, r: R * (0.6 + Math.random() * 0.4), h: Math.random() * 30, n: 40, life: 2, size: 1.1 }, 2); }
  for (const e of foes(dim, at, R)) if (hit(e, mul, 1)) try { e.applyKnockback(0, 0, 0, big ? 0.7 : 0.45); } catch {}
  shake(ctx.p, big ? 0.6 : 0.35, 0.3);
  snd(ctx.p, "random.explode", big ? 0.9 : 0.5, big ? 0.6 : 0.9);
};
function tw_combo(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), hit = hitter(ctx), yw = yawOf(p), f = fwdOf(yw), n = step(p, "tw1", 3);
  s.ctx = ctx;
  let air = false; try { air = !p.isOnGround; } catch {}
  M.anim(p, n === 2 ? "smash" : "slash");
  if (n < 2) {
    pt(dim, "tw_spin", up(add(p.location, f, 1.2), 1.1), { u: f, v: rightOf(yw), vd: f, vs: 0.1, r: 1.2, spin: n ? -900 : 900, n: 50, life: 0.18, size: 1.2 }, 0); // 휘두르는 망치 잔상
    later(2, () => { for (const e of foes(dim, add(p.location, f, 1.6), 2.8)) if (hit(e, n ? 0.65 : 0.6)) M.toss(p.location, e, 6, 2); snd(p, "random.anvil_land", 0.3, 1.4); });
    return;
  }
  ctx.setCd?.(8);
  if (air) { // 공중 3타: 낙하 강타
    try { p.applyKnockback(0, 0, 0, -2.5); } catch {}
    let tt = 0;
    const wait = () => { tt++; let g = false; try { g = p.isOnGround; } catch {} if ((tt > 1 && g) || tt > 30) quake(ctx, { ...p.location }, 4.5, 1.25 * momMul(p), true); else later(1, wait); };
    later(1, wait);
  } else later(3, () => quake(ctx, add(p.location, f, 1.5), 3.2, 0.95 * momMul(p)));
}
function tw_charge_pre(p) { const s = st(p); if (s.charge && now() < s.charge.until) { s.charge.stop = true; return true; } return false; }
function tw_charge(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), hit = hitter(ctx), until = now() + 30, mm = momMul(p);
  s.ctx = ctx; const c = { until, stop: false }; s.charge = c;
  M.anim(p, "dash"); M.potion(p, "resistance", 3, 1.6);
  snd(p, "mob.ravager.roar", 0.7, 1.1);
  let lastPos = { ...p.location };
  const go = () => {
    if (!p.isValid()) return;
    const f = flatN(viewOf(p));
    if (c.stop || now() >= until) { // 멈추며 올려치기
      if (s.charge === c) s.charge = null;
      M.anim(p, "smash");
      pt(dim, "tw_spin", up(add(p.location, f, 1), 1), { u: f, v: UP, vd: UP, vs: 4, r: 1.3, spin: 1100, n: 60, life: 0.3, size: 1.3 }, 0);
      for (const e of foes(dim, add(p.location, f, 1.5), 3)) if (hit(e, 1.0 * mm, 1)) try { e.applyKnockback(f.x, f.z, 0.4, 1.0); } catch {}
      snd(p, "random.anvil_land", 0.8, 0.8);
      return;
    }
    try { p.applyKnockback(f.x, f.z, 1.15, -0.05); } catch {}
    const L = p.location, moved = Math.hypot(L.x - lastPos.x, L.z - lastPos.z);
    lastPos = { ...L };
    pt(dim, "tw_rock", L, { r: 0.4, spd: 3, n: 4, life: 0.7 }, 2);
    for (const e of foes(dim, add(L, f, 1.2), 1.8)) { hit(e, 0.5 * mm, 6); try { e.applyKnockback(f.x, f.z, 1.2, 0.15); } catch {} } // 앞의 적은 함께 밀고 감
    if (now() > until - 26 && moved < 0.08) { if (s.charge === c) s.charge = null; quake(ctx, add(L, f, 0.8), 4, 1.3 * mm, true); notify(p, "§6벽 충돌!"); return; } // 벽에 막힘 → 큰 충격파
    later(1, go);
  };
  later(1, go);
  notify(p, "§6돌진 §7— 시선으로 방향, ② 다시: 멈추며 올려치기");
}
function tw_throw_pre(p) { // ③ 다시: 박힌 망치로 끌려가 강타
  const s = st(p), h = s.hammer;
  if (!h || now() > h.until || now() < h.ready) return false;
  s.hammer = null;
  const ctx = s.ctx, dim = p.dimension, from = { ...p.location }, d = sub(h.at, from), L = len(d), u = norm(d);
  try { p.applyKnockback(u.x, u.z, Math.min(4.5, L * 0.32), Math.max(0.3, u.y * 1.5 + 0.35)); } catch {}
  M.anim(p, "dash");
  snd(p, "random.chestopen", 0.6, 0.6); snd(p, "mob.phantom.swoop", 0.8, 0.8);
  let tt = 0;
  const wait = () => { tt++; const near = len(sub(p.location, h.at)) < 2.2; let g = false; try { g = p.isOnGround; } catch {} if (near || (tt > 4 && g) || tt > 30) quake(ctx, h.at, 4, 1.3, true); else later(1, wait); };
  later(2, wait);
  return true;
}
function tw_throw(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), hit = hitter(ctx), from = add(eyeOf(p), UP, -0.3), a = aim(p, 22), d = sub(a.at, from), L = Math.max(1, len(d)), u = norm(d), sp = 22, life = L / sp;
  s.ctx = ctx;
  M.anim(p, "shoot");
  pt(dim, "tw_spin", from, { u: norm(crs(u, UP)), v: u, vd: u, vs: sp, r: 0.9, spin: 1300, n: 70, life, size: 1.3 }, 0);
  for (let t = 1; t <= Math.ceil(life * 20); t += 2) later(t, () => { const c = add(from, u, Math.min(L, (t / 20) * sp)); for (const e of foes(dim, c, 1.6)) hit(e, 0.7, 20); });
  later(Math.ceil(life * 20), () => {
    s.hammer = { at: a.at, until: now() + 60, ready: now() };
    pt(dim, "tw_rock", a.at, { r: 0.5, spd: 5, n: 14, life: 1 }, 1);
    pt(dim, "tw_spin", a.at, { u: { x: 1, y: 0, z: 0 }, v: UP, vd: UP, vs: 0, r: 0.9, spin: 0, n: 60, life: 3, size: 1.3 }, 1); // 박혀 있는 망치
    snd(p, "random.anvil_land", 0.6, 0.6);
    notify(p, "§6망치가 박혔다 §7— 3초 안에 ③ 다시: 끌려가 강타");
  });
  snd(p, "item.trident.throw", 1, 0.6);
}
const RAMPAGE = new Map();
function tw_ult(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), mm = momMul(p);
  s.ctx = ctx;
  M.anim(p, "raise");
  try { p.applyKnockback(0, 0, 0, 1.6); } catch {}
  M.potion(p, "resistance", 3, 10); M.potion(p, "strength", 2, 10); M.potion(p, "jump_boost", 2, 10);
  snd(p, "mob.ravager.roar", 1.2, 0.7);
  // 공중에서 방향을 틀며 내려와 대지진
  for (let t = 4; t < 14; t++) later(t, () => { const v = viewOf(p); try { p.applyKnockback(v.x, v.z, 0.5, t < 10 ? 0.02 : -0.6); } catch {} });
  let tt = 0;
  const wait = () => { tt++; let g = false; try { g = p.isOnGround; } catch {} if ((tt > 8 && g) || tt > 50) { quake(ctx, { ...p.location }, 7, 1.8 * mm, true); later(3, () => pt(dim, "tw_ring", p.location, { r: 1, spd: 20, n: 140, life: 0.8, size: 1.6 }, 1)); RAMPAGE.set(p.id, { until: now() + 160, ctx, wasAir: false }); notify(p, "§6§l폭주 §r§7— 8초 동안 착지할 때마다 지진"); } else later(1, wait); };
  later(4, wait);
}
system.runInterval(() => { // 폭주: 점프했다 착지할 때마다 지진
  for (const [id, r] of RAMPAGE) {
    if (now() > r.until) { RAMPAGE.delete(id); continue; }
    const p = r.ctx.p; if (!p.isValid()) { RAMPAGE.delete(id); continue; }
    let g = true; try { g = p.isOnGround; } catch {}
    if (!g) r.wasAir = true;
    else if (r.wasAir) { r.wasAir = false; quake(r.ctx, { ...p.location }, 4, 0.75, false); }
  }
}, 2);

// ═════════════ 도철의 아가리 ═════════════
const HUNGER = new Map();
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    if (heldId(p) !== "rpg:taotie_maw") continue;
    const h = Math.min(100, (HUNGER.get(p.id) ?? 0) + 2);
    HUNGER.set(p.id, h);
    if (h >= 100) { try { const hp = p.getComponent("minecraft:health"); hp.setCurrentValue(Math.max(1, hp.currentValue - hp.effectiveMax * 0.02)); } catch {} notify(p, "§2§l허기 §r§c— 무언가를 삼켜라"); }
  }
}, 20);
const eat = (p, v, heal) => { HUNGER.set(p.id, Math.max(0, (HUNGER.get(p.id) ?? 0) - v)); healPct(p, heal); };
/** 아가리: at 에서 dir 쪽으로 크기 r, 턱이 스스로 닫힘(dur 초) */
const jaw = (dim, at, dir, r, o = {}) => { const u = norm(dir), w = norm(crs(u, UP)), v = norm(crs(w, u)); pt(dim, "tt_jaw", at, { u, v, w, r, h: o.open ?? 40, dur: o.dur ?? 0.12, n: o.n ?? Math.round(r * 50), life: o.life ?? 0.3, size: o.size ?? 1.2 }, o.prio ?? 0); };
function tt_combo(ctx0) {
  const { p } = ctx0, dim = p.dimension, s = st(p), ctx = { ...ctx0, onHit: () => eat(p, 3, 0.005) }, hit = hitter(ctx), yw = yawOf(p), f = fwdOf(yw), n = step(p, "tt1", 3);
  s.ctx = ctx0;
  if (s.feast && now() < s.feast.until) return; // ④ 중에는 pre 가 처리
  M.anim(p, n === 2 ? "smash" : "slash");
  const c = add(up(p.location, 1.1), f, 1.2);
  jaw(dim, c, f, n === 2 ? 2.4 : 1.4, { dur: 0.1 });
  later(2, () => {
    for (const e of foes(dim, add(p.location, f, 1.8), n === 2 ? 3.4 : 2.4)) if (hit(e, [0.6, 0.65, 0.9][n])) { if (n === 2) { const d = sub(p.location, e.location), L = Math.hypot(d.x, d.z) || 1; try { e.applyKnockback(d.x / L, d.z / L, 0.8, 0.2); } catch {} } pt(dim, "tt_burst", center(e), { n: 8, r: 0.2, spd: 2, life: 0.4 }, 2); }
    snd(p, "mob.ravager.bite", 0.6, 1.2 - n * 0.15);
  });
  if (n === 2) ctx0.setCd?.(8);
}
function tt_devour(ctx0) {
  const { p } = ctx0, dim = p.dimension, s = st(p), ctx = { ...ctx0, onHit: () => eat(p, 12, 0.03) }, hit = hitter(ctx), from = add(up(p.location, 1.1), flatN(viewOf(p)), 0.8), a = aim(p, 10);
  s.ctx = ctx0;
  M.anim(p, "thrust");
  const d = sub(a.at, from), L = Math.min(9, len(d)), u = norm(d), sp = 30;
  for (let t = 0; t <= Math.ceil((L / sp) * 20); t++) later(t, () => jaw(dim, add(from, u, Math.min(L, (t / 20) * sp)), u, 1.6, { dur: 0.25, life: 0.08, n: 60, open: 50, prio: t % 2 ? 1 : 0 }));
  snd(p, "mob.ravager.bite", 0.8, 0.7);
  later(Math.ceil((L / sp) * 20) + 1, () => {
    const e = a.ent && a.ent.isValid() && len(sub(center(a.ent), from)) < 10.5 ? a.ent : foes(dim, add(from, u, L), 1.8)[0];
    if (!e) return;
    // 물었다! → 내가 그 적에게 끌려감 → 물어뜯어 흡수
    const to = add(e.location, flatN(sub(p.location, e.location)), 1.4);
    try { p.teleport(to, { facingLocation: center(e), keepVelocity: false }); } catch {}
    jaw(dim, center(e), flatN(sub(e.location, p.location)), 2, { dur: 0.15, n: 120 });
    for (let k = 0; k < 3; k++) later(k * 4, () => { if (e.isValid() && hit(e, 0.55, 1)) pt(dim, "tt_burst", center(e), { n: 14, r: 0.3, spd: 3, life: 0.5 }, 1); snd(p, "mob.ravager.bite", 0.7, 1 + k * 0.1); });
  });
}
function tt_leap(ctx0) {
  const { p } = ctx0, dim = p.dimension, s = st(p), ctx = { ...ctx0, onHit: () => eat(p, 5, 0.01) }, hit = hitter(ctx), a = aim(p, 18), from = { ...p.location }, d = sub(a.at, from), L = Math.hypot(d.x, d.z), u = flatN(d);
  s.ctx = ctx0;
  M.anim(p, "raise");
  try { p.applyKnockback(u.x, u.z, Math.min(3.2, L * 0.24), 0.9); } catch {}
  pt(dim, "tt_vortex", from, { r: 1.5, spd: 1.5, n: 50, life: 0.6 }, 2);
  snd(p, "mob.enderdragon.flap", 0.6, 1.4);
  let tt = 0;
  const wait = () => {
    tt++; let g = false; try { g = p.isOnGround; } catch {}
    if (!((tt > 4 && g) || tt > 40)) return later(1, wait);
    const at = { ...p.location };
    M.anim(p, "smash");
    jaw(dim, up(at, 0.4), UP, 2.6, { dur: 0.12, n: 140, open: 60 });
    pt(dim, "tt_burst", up(at, 0.5), { n: 40, r: 0.6, spd: 6, life: 0.7 }, 0);
    const list = foes(dim, at, 3);
    for (const e of list) hit(e, 1.0, 1);
    if (list.some((e) => len(sub(e.location, at)) < 1.6)) { ctx0.resetCd?.(); notify(p, "§2§l정확한 착지! §r§7탐식 도약 재사용 가능"); snd(p, "random.orb", 0.8, 1.6); }
    shake(p, 0.4, 0.3); snd(p, "mob.ravager.bite", 1, 0.6);
  };
  later(4, wait);
}
function tt_ult_pre(p) { // ④ 중 클릭: 씹기
  const s = st(p), f = s.feast;
  if (!f || now() > f.until) return false;
  if (f.chews >= 12 || now() - f.last < 3) return true;
  f.chews++; f.last = now();
  const dim = p.dimension, hit = hitter({ ...s.ctx, mulx: 1 + f.chews * 0.06 });
  jaw(dim, up(f.at, 1.5), flatN(sub(f.at, p.location)), 3, { dur: 0.08, life: 0.18, n: 100, open: 45, prio: 1 });
  for (const e of foes(dim, f.at, 4.5)) if (hit(e, 0.28, 1)) eat(p, 2, 0.006);
  pt(dim, "tt_burst", up(f.at, 1), { n: 12, r: 1, spd: 3, life: 0.5 }, 2);
  snd(p, "mob.ravager.bite", 0.8, 0.8 + f.chews * 0.05);
  notify(p, `§2씹기 §a${f.chews}/12`);
  return true;
}
function tt_ult(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), f = flatN(viewOf(p)), at = add(p.location, f, 4.5);
  s.ctx = ctx; s.feast = { at, until: now() + 70, chews: 0, last: 0 };
  M.anim(p, "raise"); M.potion(p, "resistance", 3, 4);
  const w = norm(crs(f, UP));
  pt(dim, "tt_mask", up(at, 6), { ...MASK, u: w, v: UP, scale: 0.2, n: Math.round(MASK.filled * 1.3), life: 3.8 }, 0); // 하늘의 도철 가면 (한 번만)
  pt(dim, "tt_vortex", at, { r: 6, spd: 0.8, n: 220, life: 3.6, size: 1.3 }, 0);
  snd(p, "mob.wither.spawn", 0.5, 0.5);
  notify(p, "§2§l도철 현신 §r§7— 3초 동안 클릭 연타로 씹어라 (최대 12)");
  for (let t = 0; t < 60; t += 4) later(t, () => { for (const e of foes(dim, at, 9)) { const d = sub(at, e.location), L = Math.hypot(d.x, d.z) || 1; try { e.applyKnockback(d.x / L, d.z / L, 0.45, 0.04); } catch {} } });
  later(70, () => { // 삼킴: 마지막 큰 아가리
    const ch = s.feast?.chews ?? 0; s.feast = null;
    const hit = hitter({ ...ctx, mulx: 1 + ch * 0.06 });
    jaw(dim, up(at, 1.5), f, 4.5, { dur: 0.14, n: 260, open: 70, life: 0.4 });
    pt(dim, "tt_burst", up(at, 1), { n: 80, r: 1.5, spd: 8, life: 0.8, size: 1.3 }, 0);
    for (const e of foes(dim, at, 5)) hit(e, 1.4, 1);
    HUNGER.set(p.id, 0); healPct(p, 0.05 + ch * 0.01);
    shake(p, 0.7, 0.5); snd(p, "mob.ravager.bite", 1.2, 0.4); snd(p, "random.burp", 1, 0.6);
  });
}
export const fiendLine = (p) => {
  const id = heldId(p);
  if (id === "rpg:taotie_maw") { const h = Math.floor(HUNGER.get(p.id) ?? 0), b = Math.round(h / 10); return `§2허기 ${h >= 100 ? "§c" : "§a"}${"■".repeat(b)}§8${"■".repeat(10 - b)} §7${h}`; }
  if (id === "rpg:taowu_hammer") { const m = Math.floor(MOM.get(p.id) ?? 0), b = Math.round(m / 10); return `§6가속 §e${"■".repeat(b)}§8${"■".repeat(10 - b)} §7${m}`; }
  if (id === "rpg:qiongqi_claws") { const n = [...MARK.values()].filter((m) => m.pid === p.id && m.until > now() && m.e.isValid()).length; return `§c표식 §f${n}`; }
  if (id === "rpg:hundun_orb") { const s = st(p); return `§d균열 ${s.rift && now() <= s.rift.until ? "§a열림" : "§8없음"}`; }
  return "";
};

/** 무기 스킬 표 (사신수와 같은 모양, pre = 재입력·모드 중 입력: true 면 쿨타임·마나 없이 처리) */
export const WEAPON_SKILLS = {
  "rpg:hundun_orb": [
    { id: "w_hd_1", key: 1, name: "혼돈 · 혼돈탄", short: "혼돈탄", lv: 1, mp: 5, cd: 0.4, pow: 1, run: hd_shot, pre: hd_ult_pre, desc: "3연: 불 → 얼음 → 번개 구슬탄(색이 계속 바뀜). 3번째가 떨어진 자리에 균열. ④ 중에는 클릭마다 다음 균열로." },
    { id: "w_hd_2", key: 2, name: "혼돈 · 차원 이동", short: "차원", lv: 1, mp: 16, cd: 6, pow: 1, run: hd_warp, pre: hd_warp_pre, desc: "균열이 없으면 조준한 곳에 균열을 열고, 4초 안에 다시 누르면 균열로 순간이동하며 떠난 자리와 도착한 자리가 함께 터진다." },
    { id: "w_hd_3", key: 3, name: "혼돈 · 무형 질주", short: "무형", lv: 1, mp: 20, cd: 10, pow: 1, run: hd_phase, pre: hd_phase_pre, desc: "2초 동안 흐려져 보는 방향(위아래 포함)으로 날며 적을 통과해 벤다. 다시 누르면 그 자리에서 멈추며 폭발." },
    { id: "w_hd_4", key: 4, name: "혼돈 · 붕괴", short: "붕괴", lv: 1, mp: 45, cd: 35, pow: 1, run: hd_ult, desc: "주변에 균열 넷. 6초 동안 클릭할 때마다 다음 균열로 순간이동하며 그 균열의 원소가 터지고, 끝에 넷이 한꺼번에 무너진다." },
  ],
  "rpg:qiongqi_claws": [
    { id: "w_qq_1", key: 1, name: "궁기 · 쌍조 연참", short: "쌍조", lv: 1, mp: 5, cd: 0.35, pow: 1, run: qq_combo, pre: (p) => (st(p).glide && now() < st(p).glide.until ? qq_dive(p) : qq_ult_pre(p)), desc: "4타: 칠 때마다 짧게 돌진, 4타는 함께 솟구치는 올려 베기. 맞힌 적에게 표식. 활공 중 클릭 = 급강하, ④ 중 클릭 = 깃털 탄막." },
    { id: "w_qq_2", key: 2, name: "궁기 · 흑익 활공", short: "활공", lv: 1, mp: 16, cd: 8, pow: 1, run: qq_glide, desc: "날개를 펴고 3초 동안 보는 방향으로 활공. 활공 중 클릭하면 조준점으로 급강하해 할퀸다." },
    { id: "w_qq_3", key: 3, name: "궁기 · 표식 도약", short: "도약", lv: 1, mp: 18, cd: 10, pow: 1, run: qq_hop, pre: qq_hop_pre, desc: "조준점에 가장 가까운 표식 적 뒤로 순간이동해 할퀸다. 1.5초 안에 다시 누르면 다음 표식으로 (최대 4)." },
    { id: "w_qq_4", key: 4, name: "궁기 · 흉익 강림", short: "흉익", lv: 1, mp: 45, cd: 35, pow: 1, run: qq_ult, desc: "하늘로 솟아 3초 동안 떠서 클릭마다 조준점에 깃털 탄막(6), 마지막에 조준점으로 내리꽂히며 표식 대상 전부를 할퀸다." },
  ],
  "rpg:taowu_hammer": [
    { id: "w_tw_1", key: 1, name: "도올 · 분쇄", short: "분쇄", lv: 1, mp: 5, cd: 0.45, pow: 1, run: tw_combo, desc: "3타: 휘두르기 둘 → 지면 강타. 공중에서 3타면 낙하 강타(더 큼). 달리거나 뛰어 쌓은 가속만큼 강해짐." },
    { id: "w_tw_2", key: 2, name: "도올 · 멈추지 않는 돌진", short: "돌진", lv: 1, mp: 16, cd: 8, pow: 1, run: tw_charge, pre: tw_charge_pre, desc: "1.5초 동안 시선 방향으로 돌진하며 앞의 적을 밀고 감. 벽에 막히면 큰 충격파, 다시 누르면 멈추며 올려치기." },
    { id: "w_tw_3", key: 3, name: "도올 · 망치 투척", short: "투척", lv: 1, mp: 16, cd: 9, pow: 1, run: tw_throw, pre: tw_throw_pre, desc: "망치가 회전하며 조준점까지 날아가 박힘. 3초 안에 다시 누르면 망치 쪽으로 끌려가 착지 강타." },
    { id: "w_tw_4", key: 4, name: "도올 · 폭주", short: "폭주", lv: 1, mp: 45, cd: 35, pow: 1, run: tw_ult, desc: "높이 뛰어 방향을 틀며 내려와 대지진. 이후 8초 동안 점프했다 착지할 때마다 지진." },
  ],
  "rpg:taotie_maw": [
    { id: "w_tt_1", key: 1, name: "도철 · 탐식", short: "탐식", lv: 1, mp: 5, cd: 0.4, pow: 1, run: tt_combo, pre: tt_ult_pre, desc: "3타: 주먹마다 아가리가 덥석, 3타는 큰 아가리로 끌어당김. 맞힐 때마다 허기가 줄어듦. ④ 중 클릭 = 씹기." },
    { id: "w_tt_2", key: 2, name: "도철 · 집어삼키기", short: "삼키기", lv: 1, mp: 16, cd: 8, pow: 1, run: tt_devour, desc: "아가리가 9칸 날아가 적을 물면 그 적에게 끌려가 세 번 물어뜯어 체력을 흡수하고 허기를 크게 줄인다." },
    { id: "w_tt_3", key: 3, name: "도철 · 탐식 도약", short: "도약", lv: 1, mp: 16, cd: 9, pow: 1, run: tt_leap, desc: "조준점으로 크게 뛰어 착지하며 물어뜯는다. 적 바로 위에 착지하면 재사용 대기가 초기화된다." },
    { id: "w_tt_4", key: 4, name: "도철 · 현신", short: "현신", lv: 1, mp: 45, cd: 35, pow: 1, run: tt_ult, desc: "하늘에 거대한 도철 가면, 소용돌이가 주변을 빨아들인다. 3초 동안 클릭 연타로 씹고(최대 12, 많이 씹을수록 강해짐) 마지막에 통째로 삼킨다. 허기 0." },
  ],
};
