// ═══════════════════════════════════════════════════════════════════════
// 사흉수 무기 (V11.7) — 기동 · 컨트롤형 스킬 무기 넷 (사신수의 약 75% 위력)
//   재입력: 같은 키를 정해진 시간 안에 다시 누르면 후속 동작 (쿨타임·마나 없이, pre 훅)
//   혼돈의 낫    ① 낫 회전 돌진 · ② 낫 끌어오기(다시: 충돌 연계) · ③ 낫 그네(다시: 튕겨 나감) · ④ 쌍낫 기동(7초: 클릭 = 줄 감기, ③ 그네 무제한) · ③ 무형 질주(시선으로 조종, 다시: 멈춤 폭발) · ④ 혼돈 붕괴(균열 넷, 6초 동안 클릭마다 다음 균열로)
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
import { SCYTHE } from "./hd_meta.js";

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
// ── 혼돈의 낫 ① 낫 회전 돌진 · ② 낫 끌어오기 (사용자 그림의 보랏빛 불꽃 낫) ──
/** 낫 그림: 중심 c, 면 (u, v), 처음 각 rot, 초당 spin 도, vd 방향 vs 속도로 이동 */
const scythe = (dim, c, u, v, o = {}) => pt(dim, "hd_scythe", c, { ...SCYTHE, u, v, vd: o.vd ?? UP, vs: o.vs ?? 0, rot: o.rot ?? 0, spin: o.spin ?? 0, scale: o.scale ?? 0.055, n: Math.round(SCYTHE.filled * 1.3), life: o.life ?? 0.4, size: o.size ?? 1 }, o.prio ?? 0);
const flame = (dim, at, o = {}) => pt(dim, "hd_flame", at, { n: o.n ?? 10, r: o.r ?? 0.4, spd: o.spd ?? 1.5, life: o.life ?? 0.8, size: o.size ?? 1, vd: o.vd ?? { x: 0, y: 0, z: 0 }, tone: o.tone ?? 0 }, o.prio ?? 1);
const darc = (dim, at, yaw, o = {}) => { const f = fwdOf(yaw), r = rightOf(yaw), t = rad(o.tilt ?? 0), v = { x: r.x * Math.cos(t), y: Math.sin(t), z: r.z * Math.cos(t) }, d = o.dir ?? 1, sw = o.sweep ?? 200; pt(dim, "hd_arc", at, { u: f, v, r: o.r ?? 3.2, h: o.thick ?? 1, a0: (d * sw) / 2, a1: (-d * sw) / 2, dur: o.dur ?? 0.12, life: o.life ?? 0.5, n: o.n ?? 220, size: o.size ?? 1.3, spd: o.spd ?? 2.5 }, 0); };
function hd_spin(ctx) { // ① 낫이 몸 둘레를 한 바퀴 돈 뒤 앞으로 돌진
  const { p } = ctx, dim = p.dimension, s = st(p), hit = hitter(ctx), yw = yawOf(p), f = fwdOf(yw), r = rightOf(yw), c = up(p.location, 1.05);
  s.ctx = ctx;
  if (hd_collide(p)) return; // 끌어오는 중이면 ① 도 부딪치기 연계
  M.anim(p, "spin");
  // 낫 그림이 허리 높이 수평면에서 스스로 한 바퀴 (0.45초) + 보랏빛 불꽃 호 한 바퀴
  scythe(dim, c, f, r, { rot: 0, spin: 800, life: 0.45, scale: 0.06 });
  darc(dim, c, yw, { sweep: 380, r: 3.4, thick: 1.1, dur: 0.4, n: 320, life: 0.55 });
  for (let k = 0; k < 4; k++) later(k * 2, () => { const a = rad(yw + k * 90), q = { x: c.x + Math.cos(a) * 2.6, y: c.y, z: c.z + Math.sin(a) * 2.6 }; flame(dim, q, { n: 8, r: 0.4, spd: 1.2, prio: 2 }); });
  later(4, () => { for (const e of foes(dim, p.location, 3.8)) if (hit(e, 0.75, 1)) { M.toss(p.location, e, 5, 2); flame(dim, center(e), { n: 8, r: 0.3, spd: 2 }); } snd(p, "game.player.attack.sweep", 1, 0.6); snd(p, "mob.blaze.shoot", 0.4, 0.6); });
  // 앞으로 돌진: 낫이 함께 앞으로 (스스로 이동), 지나간 길에 보랏빛 불꽃
  later(9, () => {
    const ff = fwdOf(yawOf(p));
    M.anim(p, "dash");
    try { p.applyKnockback(ff.x, ff.z, 2.6, 0.05); } catch {}
    scythe(dim, up(p.location, 1.05), ff, UP, { rot: -40, spin: 300, vd: ff, vs: 18, life: 0.35, scale: 0.06 });
    darc(dim, up(p.location, 1.1), yawOf(p), { tilt: 25, r: 2.8, sweep: 160, n: 180, life: 0.4 });
    snd(p, "mob.phantom.swoop", 0.8, 0.7);
    for (let t = 1; t <= 6; t++) later(t, () => { flame(dim, up(p.location, 0.6), { n: 6, r: 0.5, spd: 0.8, prio: 2 }); for (const e of foes(dim, p.location, 2)) if (hit(e, 0.65, 20)) { M.toss(p.location, e, 7, 2.5); flame(dim, center(e), { n: 10, r: 0.3, spd: 2.5 }); } });
  });
}
/** 끌어오는 중 · 직후 다시 누르면(② 또는 ①): 끌려오는 적에게 몸을 부딪쳐 크게 날려 보냄 */
function hd_collide(p) {
  const s = st(p), h = s.hook;
  if (!h || now() > h.until || !h.e?.isValid()) return false;
  s.hook = null;
  const e = h.e, ctx = s.ctx, dim = p.dimension, hit = hitter(ctx), d = sub(e.location, p.location), L = Math.hypot(d.x, d.z) || 1, u = { x: d.x / L, y: 0, z: d.z / L };
  M.anim(p, "dash");
  try { p.applyKnockback(u.x, u.z, Math.min(3, L * 0.45 + 0.6), 0.15); } catch {}
  later(3, () => {
    if (!e.isValid()) return;
    const c = center(e);
    hit(e, 1.35, 1);
    try { e.applyKnockback(u.x, u.z, 2.6, 0.55); } catch {} // 크게 날려 보냄
    pt(dim, "hd_burst", c, { n: 40, r: 0.4, spd: 7, life: 0.6, tone: 0.8 }, 0);
    flame(dim, c, { n: 30, r: 0.6, spd: 4, life: 0.9, size: 1.3 });
    darc(dim, c, yawOf(p), { sweep: 120, r: 1.8, n: 120, life: 0.35, tilt: 60 });
    for (const x of foes(dim, c, 2.5)) if (x !== e && hit(x, 0.6, 1)) try { x.applyKnockback(u.x, u.z, 1.4, 0.3); } catch {}
    shake(p, 0.45, 0.3);
    snd(p, "random.explode", 0.6, 1.2); snd(p, "mob.ravager.stun", 0.6, 1.2);
    notify(p, "§5§l충돌!");
  });
  return true;
}
function hd_hook(ctx) { // ② 낫을 던져 걸린 적을 끌어옴 → 끌려오는 동안·직후 다시 누르면 충돌 연계, 아니면 도착하며 밀려남
  const { p } = ctx, dim = p.dimension, s = st(p), hit = hitter(ctx), eye = eyeOf(p), v = viewOf(p);
  s.ctx = ctx;
  M.anim(p, "shoot");
  const a = aim(p, 14), to = a.ent ? center(a.ent) : add(eye, v, Math.min(14, len(sub(a.at, eye)))), d = sub(to, eye), L = Math.max(1, len(d)), u = norm(d), sp = 30, life = L / sp;
  const side = norm(crs(u, UP));
  scythe(dim, add(eye, u, 0.8), u, norm(crs(side, u)), { vd: u, vs: sp, spin: -1100, life, scale: 0.05 }); // 회전하며 날아감
  pt(dim, "hd_flame", add(eye, u, 1), { n: 16, r: 0.2, spd: sp * 0.6, life, vd: { x: u.x * 2, y: u.y * 2, z: u.z * 2 } }, 2);
  snd(p, "item.trident.throw", 0.8, 0.6); snd(p, "mob.phantom.swoop", 0.7, 1.2);
  let caught = null;
  const ticks = Math.ceil(life * 20);
  for (let t = 1; t <= ticks; t++) later(t, () => {
    if (caught) return;
    const c = add(eye, u, (t / 20) * sp);
    const e = (a.ent && a.ent.isValid() && len(sub(center(a.ent), c)) < 1.8) ? a.ent : foes(dim, c, 1.5)[0];
    if (!e) { if (t === ticks) scythe(dim, c, norm(sub(eye, c)), norm(crs(side, u)), { vd: norm(sub(eye, c)), vs: sp, spin: 1100, life: life, scale: 0.05, prio: 1 }); return; }
    caught = e;
    hit(e, 0.55, 1);
    M.potion(e, "slowness", 4, 1);
    s.hook = { e, until: now() + 26 };
    notify(p, "§5걸렸다! §7— ② 또는 ① 다시: 부딪치기");
    snd(p, "random.chestclosed", 0.8, 0.5);
    // 끌어옴: 8틱 동안 내 쪽으로, 낫이 적을 끌고 돌아옴
    for (let k = 0; k < 8; k++) later(k, () => {
      if (!e.isValid()) return;
      const dd = sub(p.location, e.location), LL = Math.hypot(dd.x, dd.z);
      if (LL > 1.8) try { e.applyKnockback(dd.x / LL, dd.z / LL, Math.min(2.4, LL * 0.3), 0.12); } catch {}
      if (k % 2 === 0) { const back = norm(sub(eye, center(e))); scythe(dim, center(e), back, UP, { rot: 90 + k * 40, life: 0.12, scale: 0.05, prio: 1 }); flame(dim, center(e), { n: 5, r: 0.3, spd: 1, prio: 2 }); }
    });
    // 연계 없이 도착하면: 가볍게 베이고 넉백으로 밀려남 (0.8초 안에 다시 누르면 충돌 연계)
    later(16, () => {
      if (!e.isValid() || !s.hook || s.hook.e !== e) return;
      s.hook = null;
      const dd = sub(e.location, p.location), LL = Math.hypot(dd.x, dd.z) || 1;
      hit(e, 0.5, 1);
      try { e.applyKnockback(dd.x / LL, dd.z / LL, 1.4, 0.35); } catch {}
      darc(dim, center(e), yawOf(p), { sweep: 140, r: 1.6, n: 100, life: 0.3 });
      flame(dim, center(e), { n: 12, r: 0.3, spd: 2.5 });
      snd(p, "game.player.attack.sweep", 0.8, 0.8);
    });
  });
}
const hd_hook_pre = (p) => hd_collide(p);
// ── ③ 낫 그네(입체 기동, 4연속) · ④ 혼돈 쌍낫 기동 ──
/** 조준한 곳(적 또는 블록) 에 낫을 박을 자리 */
function anchorAt(p, maxD = 20) {
  const a = aim(p, maxD);
  if (a.ent) return { at: center(a.ent), ent: a.ent };
  if (a.block) return { at: up(a.at, -0.5) };
  return null; // 허공엔 박을 수 없음
}
/** 3D 쇠사슬: a → b, 고리 간격 0.42 (짝·홀 고리가 서로 90°) */
const chain = (dim, a, b, life = 0.12) => {
  const d = sub(b, a), L = len(d); if (L < 0.3) return;
  const u = norm(d), w0 = Math.abs(u.y) > 0.9 ? { x: 1, y: 0, z: 0 } : UP, v = norm(crs(u, w0)), w = norm(crs(u, v)), links = Math.max(1, Math.round(L / 0.42));
  pt(dim, "hd_wire", a, { u, v, w, r: L, h: links, n: Math.min(260, links * 7), life, size: 1 }, 1);
};
const gas = (dim, at, dir, o = {}) => pt(dim, "hd_gas", at, { n: o.n ?? 6, r: o.r ?? 0.15, spd: o.spd ?? 4, life: o.life ?? 0.7, size: o.size ?? 1, vd: dir, tone: o.tone ?? 0 }, o.prio ?? 2);
const speedLines = (dim, at, v, o = {}) => { const d = norm(v), w0 = Math.abs(d.y) > 0.9 ? { x: 1, y: 0, z: 0 } : UP, a = norm(crs(d, w0)), b = norm(crs(d, a)); pt(dim, "hd_speed", at, { u: a, v: b, vd: d, r: o.r ?? 1.4, spd: o.spd ?? 14, n: o.n ?? 8, life: o.life ?? 0.2, size: 1 }, 2); };
const hookHit = (dim, at) => { pt(dim, "hd_burst", at, { n: 8, r: 0.15, spd: 3, life: 0.35 }, 2); gas(dim, at, UP, { n: 5, spd: 1.5, life: 0.5, prio: 2 }); };
// 입체 기동 (줄 물리): 부드러운 줄 탄성 + 감기 · 두 줄이면 가운데로 쭉 당겨짐(어뢰) · 한 줄이면 줄 둘레를 휘돌며(공전) 떠오름
//   가스 분사는 처음에 차오르고(부스트) 점점 식음 · 공기 저항 · 벽 자동 차기 · 지나가며 베기 · 착지 구르기
const CHARGES = 4, COMBO_GAP = 60;
const solid = (dim, q) => { try { const b = dim.getBlock({ x: Math.floor(q.x), y: Math.floor(q.y), z: Math.floor(q.z) }); return !!b && !b.isAir && !b.isLiquid && b.isSolid !== false; } catch { return false; } };
/** 낫 줄을 박을 자리 자동 찾기: 겨눈 적 → 좌우 앞 위쪽 벽·나무·천장 (두 줄) → 정면 → 위 앞 */
function findAnchors(p) {
  const dim = p.dimension, eye = eyeOf(p), v = viewOf(p);
  try { const h = p.getEntitiesFromViewDirection({ maxDistance: 20 }).map((x) => x.entity).find((e) => e?.isValid() && e.id !== p.id && e.typeId !== "minecraft:item"); if (h) return [{ at: center(h), ent: h }]; } catch {}
  const yaw = yawOf(p), pitch = Math.asin(Math.max(-1, Math.min(1, v.y))) * 57.3;
  const dirOf = (dy, dp) => { const y = rad(yaw + dy), pc = rad(Math.min(75, pitch + dp)); return { x: -Math.sin(y) * Math.cos(pc), y: Math.sin(pc), z: Math.cos(y) * Math.cos(pc) }; };
  const ray = (d) => { try { const h = dim.getBlockFromRay(eye, d, { maxDistance: 22, includeLiquidBlocks: false, includePassableBlocks: false }); if (h) return { at: add(h.block.location, { x: h.faceLocation?.x ?? 0.5, y: h.faceLocation?.y ?? 0.5, z: h.faceLocation?.z ?? 0.5 }) }; } catch {} return null; };
  const side = (sg) => { for (const [dy, dp] of [[22, 12], [30, 28], [16, 0], [40, 40]]) { const r = ray(dirOf(sg * dy, dp)); if (r && len(sub(r.at, eye)) > 2.5) return r; } return null; };
  const L = side(-1), R = side(1);
  if (L && R) return [L, R];
  if (L || R) return [L ?? R];
  for (const [dy, dp] of [[0, 8], [0, 35], [0, 60]]) { const r = ray(dirOf(dy, dp)); if (r && len(sub(r.at, eye)) > 2.5) return [r]; }
  return null;
}
function hd_swing_start(p, ctx) {
  const s = st(p), dim = p.dimension, As = findAnchors(p);
  if (!As) { notify(p, "§7걸 곳이 없다 (벽 · 나무 · 천장 · 적 근처에서)"); return false; }
  const hit = hitter(ctx), dual = As.length > 1;
  const C = () => { const pts = As.map((a) => (a.ent?.isValid() ? center(a.ent) : a.at)); return pts.length > 1 ? scl2(add(pts[0], pts[1]), 0.5) : pts[0]; };
  let L = Math.max(3, len(sub(C(), up(p.location, 1))) * 0.95);
  const sw = { As, t: 0, done: false, kick: 0, boost: 0, lift: 0, orbit: 0, v: { x: 0, y: 0, z: 0 } };
  if (s.swing) s.swing.done = true;
  s.swing = sw;
  M.anim(p, "gear_fire");
  later(5, () => { if (!sw.done) M.anim(p, dual ? "gear_swing" : "gear_orbit"); });
  // 쇠사슬이 손에서 박힐 곳까지 날아감 (3틱) → 박힘
  const hand = (i) => add(up(p.location, 1.2), rightOf(yawOf(p)), dual ? (i ? 0.4 : -0.4) : 0);
  for (let k = 1; k <= 3; k++) later(k - 1, () => As.forEach((a, i) => { const h = hand(i); chain(dim, h, add(h, sub(a.at, h), k / 3), 0.1); }));
  later(3, () => As.forEach((a) => hookHit(dim, a.at)));
  snd(p, "item.armor.equip_chain", 1, 1.4); later(3, () => { snd(p, "item.trident.hit_ground", 0.7, 1.3); snd(p, "random.chestclosed", 0.5, 1.8); });
  // 박히는 순간 가스를 뿜으며 당겨 올림
  try { const c = C(), d = sub(c, p.location), h = Math.hypot(d.x, d.z) || 1; p.applyKnockback(d.x / h, d.z / h, 0.6, 0.55); } catch {}
  gas(dim, up(p.location, 1), scl2(viewOf(p), -1), { n: 10, spd: 5, life: 0.8, prio: 1 });
  const tick = () => {
    if (!p.isValid() || sw.done || s.swing !== sw) return;
    sw.t++;
    const c = C(), P = up(p.location, 1);
    let v = { x: 0, y: 0, z: 0 }; try { v = p.getVelocity(); } catch {}
    const look = viewOf(p);
    const d = sub(P, c), dist = len(d) || 0.01, n = scl2(d, 1 / dist);
    // 가스 부스트: 처음 ~17틱 차오르고, 이후 식음
    sw.boost = sw.t < 18 ? Math.min(1, sw.boost + 0.0588) : Math.max(0, sw.boost - 0.0125);
    v = scl2(v, 0.98); // 공기 저항
    v = add(v, look, 0.035 * (1 + 1.5 * sw.boost)); // 보는 방향 추진
    v.y -= 0.06;
    if (dual) { // 두 줄: 가운데로 쭉 (어뢰) + 빠르게 감김
      v = add(v, n, -0.05 * (1 + sw.boost)); L = Math.max(2.2, L - 0.2);
    } else { // 한 줄: 줄 둘레를 휘돌며(공전) 떠오름 — 보는 쪽으로 돎
      const tg = norm(crs(n, UP)), sg = tg.x * look.x + tg.z * look.z >= 0 ? 1 : -1;
      sw.orbit = sg;
      sw.lift = Math.min(1, sw.lift + 0.2 / 3);
      v = add(v, tg, sg * 0.08 * (1 + sw.boost)); v.y += 0.045 * sw.lift;
      L = Math.max(2.6, L - 0.1);
    }
    // 부드러운 줄 탄성 (늘어나면 바깥 속도 지우고 줄 길이로 당김) + 흔들림 감쇠
    if (dist >= L) { const vr = v.x * n.x + v.y * n.y + v.z * n.z; if (vr > 0) v = add(v, n, -vr); v = add(v, n, -(dist - L) * 0.5); v = scl2(v, 0.99); }
    const sp = len(v); if (sp > 2.4) v = scl2(v, 2.4 / sp);
    // 벽 자동 차기
    const hdir = Math.hypot(v.x, v.z);
    if (hdir > 0.2 && sw.t - sw.kick > 6) {
      const fx = { x: P.x + (v.x / hdir) * 0.9, y: P.y, z: P.z }, fz = { x: P.x, y: P.y, z: P.z + (v.z / hdir) * 0.9 };
      const bx = solid(dim, fx) || solid(dim, up(fx, -0.6)), bz = solid(dim, fz) || solid(dim, up(fz, -0.6));
      if (bx || bz) {
        sw.kick = sw.t; sw.boost = Math.min(1, sw.boost + 0.4);
        if (bx) v.x = -v.x * 0.6; if (bz) v.z = -v.z * 0.6;
        v.y = Math.max(v.y, 0.55);
        v = add(v, look, 0.35);
        gas(dim, P, norm({ x: bx ? -v.x : 0, y: -0.3, z: bz ? -v.z : 0 }), { n: 12, spd: 4, life: 0.7, prio: 1 });
        pt(dim, "hd_burst", P, { n: 6, r: 0.3, spd: 2, life: 0.35 }, 2);
        M.anim(p, "gear_kick");
        snd(p, "step.stone", 1, 0.7); snd(p, "mob.phantom.swoop", 0.6, 1.6);
        notify(p, "§5벽 차기!");
      }
    }
    sw.v = v;
    const h = Math.hypot(v.x, v.z);
    try { p.applyKnockback(h > 0.001 ? v.x / h : 0, h > 0.001 ? v.z / h : 0, h, v.y); } catch {}
    // 자세: 두 줄 = 그네, 한 줄 = 줄 쪽으로 몸을 기울여 공전
    if (sw.t % 16 === 5 && sw.t - sw.kick > 6) M.anim(p, dual ? "gear_swing" : sw.orbit > 0 ? "gear_orbit" : "gear_orbit_l");
    // 연출: 쇠사슬(양손에서), 등 뒤 가스 분사(부스트만큼), 빠르면 속도선, 사슬 따라 감겨 오는 불티
    if (sw.t % 2 === 0) {
      const yw = yawOf(p), rr = rightOf(yw);
      sw.As.forEach((a, i) => { const A2 = a.ent?.isValid() ? center(a.ent) : a.at, H = add(up(p.location, 1.2), rr, dual ? (i ? 0.4 : -0.4) : 0); chain(dim, A2, H, 0.12); if (sw.t % 6 === 0) { const dd = sub(H, A2); pt(dim, "hd_reelspark", A2, { u: norm(dd), r: len(dd), spd: 12, n: 3, life: Math.min(0.5, len(dd) / 14), size: 1 }, 2); } });
      const back = add(up(p.location, 0.9), fwdOf(yw), -0.4), bd = norm(add(scl2(norm(v), -1), UP, -0.2));
      gas(dim, back, bd, { n: Math.round(2 + sw.boost * 5), spd: 3 + sw.boost * 3, life: 0.6 + sw.boost * 0.3 });
    }
    if (sp > 0.8 && sw.t % 2 === 1) speedLines(dim, P, v, { n: Math.round(4 + (sp - 0.8) * 6) });
    if (sw.boost > 0.5 && sw.t % 4 === 0) snd(p, "random.fizz", 0.25, 1.6);
    // 지나가며 자동 베기
    for (const e of foes(dim, p.location, 2.4)) if (hit(e, 0.55, 10)) { const cc = up(p.location, 1); M.anim(p, "gear_spin"); later(7, () => { if (!sw.done) M.anim(p, dual ? "gear_swing" : "gear_orbit"); }); scythe(dim, cc, fwdOf(yawOf(p)), rightOf(yawOf(p)), { spin: 1000, life: 0.2, scale: 0.04, prio: 1 }); darc(dim, cc, yawOf(p), { sweep: 220, r: 2.4, dur: 0.08, n: 110, life: 0.35 }); flame(dim, center(e), { n: 8, r: 0.3, spd: 2.5 }); snd(p, "game.player.attack.sweep", 0.7, 1.2); }
    // 착지: 구르기
    let g = false; try { g = p.isOnGround; } catch {}
    if ((g && sw.t > 6) || sw.t > 60) {
      sw.done = true; if (s.swing === sw) s.swing = null;
      // 사슬이 손으로 되감겨 돌아옴
      sw.As.forEach((a) => { const A2 = a.ent?.isValid() ? center(a.ent) : a.at; for (let k = 1; k <= 3; k++) later(k, () => { const H = up(p.location, 1.2); chain(dim, H, add(H, sub(A2, H), 1 - k / 3), 0.08); }); });
      snd(p, "item.armor.equip_chain", 0.8, 1.8);
      if (g) { const f = flatN(v.x || v.z ? v : viewOf(p)); try { p.applyKnockback(f.x, f.z, 0.9, 0.05); } catch {} gas(dim, up(p.location, 0.2), { x: -f.x, y: 0.1, z: -f.z }, { n: 10, spd: 2.5, life: 0.7 }); M.anim(p, "gear_roll"); snd(p, "step.grass", 1, 0.8); }
      return;
    }
    later(1, tick);
  };
  later(3, tick);
  return true;
}
const scl2 = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
/** 날아가는 중 ③ 다시: 줄을 놓으며 가스 폭발 가속(속도 보존) → 바로 다음 줄 */
function hd_swing_launch(p) {
  const s = st(p), sw = s.swing;
  if (!sw || sw.done) return false;
  sw.done = true; s.swing = null;
  let v = { x: 0, y: 0, z: 0 }; try { v = p.getVelocity(); } catch {}
  const look = viewOf(p), nv = add(add(scl2(v, 1.1), look, 0.9), UP, 0.35), h = Math.hypot(nv.x, nv.z);
  try { p.applyKnockback(h > 0.001 ? nv.x / h : 0, h > 0.001 ? nv.z / h : 0, Math.min(2.6, h), Math.min(1.4, nv.y)); } catch {}
  M.anim(p, "gear_launch");
  const dim = p.dimension, P = up(p.location, 1);
  gas(dim, P, scl2(look, -1), { n: 18, r: 0.3, spd: 7, life: 0.9, prio: 1 });
  speedLines(dim, P, nv, { n: 14, spd: 18 });
  darc(dim, up(p.location, 1.1), yawOf(p), { r: 2.6, sweep: 200, n: 120, life: 0.4 });
  snd(p, "mob.phantom.swoop", 1, 1.5); snd(p, "random.fizz", 0.6, 1.2);
  return true;
}
function hd_comboEnd(p) { const s = st(p); if (s.combo3) { s.combo3 = null; s.setCd3?.(6); } }
function hd_swing(ctx) { // ③ 첫 사용: 줄 쏘기 (남은 횟수 3)
  const { p } = ctx, s = st(p);
  s.ctx = ctx; s.setCd3 = ctx.setCd;
  ctx.setCd?.(99); // 콤보 중엔 일반 사용 막고, 끝나면 6초
  if (!hd_swing_start(p, ctx)) { ctx.setCd?.(0.5); return; }
  const c = (s.combo3 = { left: CHARGES - 1, until: now() + COMBO_GAP });
  later(COMBO_GAP + 2, () => { if (s.combo3 === c && now() >= c.until) hd_comboEnd(p); });
  notify(p, `§5낫 사슬 §d${"◆".repeat(c.left)}§8${"◇".repeat(CHARGES - 1 - c.left)} §7— ③ 다시: 놓고 다음 사슬 · ④: 낙뢰 강하`);
}
const hd_swing_pre = (p) => {
  const s = st(p), c = s.combo3;
  if (!(c && now() <= c.until && c.left > 0)) return false;
  hd_swing_launch(p);
  later(1, () => hd_swing_start(p, s.ctx)); // 놓자마자 다음 줄
  c.left--; c.until = now() + COMBO_GAP;
  const c2 = c;
  later(COMBO_GAP + 2, () => { if (s.combo3 === c2 && now() >= c2.until) hd_comboEnd(p); });
  notify(p, `§5낫 사슬 §d${"◆".repeat(c.left)}§8${"◇".repeat(CHARGES - 1 - c.left)}`);
  if (c.left <= 0) later(30, () => hd_comboEnd(p));
  return true;
};
/** ④ 혼돈 · 선풍 낙뢰: 회오리를 두르고 낙뢰처럼 그대로 내리꽂힘. 땅이면 먼저 솟구침, ③ 기동 중(공중)이면 바로 강하 + 위력 1.35배 (연계) */
function hd_plunge(ctx) {
  const { p } = ctx, dim = p.dimension, s = st(p), hit = hitter(ctx);
  let g = false; try { g = p.isOnGround; } catch {}
  const linked = !g && (s.swing || s.combo3);
  if (s.swing) { s.swing.done = true; s.swing = null; }
  if (s.combo3) hd_comboEnd(p);
  const bonus = linked ? 1.35 : 1;
  M.invuln(p, 3);
  const swirlAt = (at, o = {}) => pt(dim, "hd_swirl", at, { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, vd: UP, vs: o.vs ?? 0, r: o.r ?? 2.2, spin: o.spin ?? 900, n: o.n ?? 60, life: o.life ?? 0.35, size: o.size ?? 1 }, o.prio ?? 1);
  const start = () => {
    if (!p.isValid()) return;
    // 내리꽂을 곳: 아래를 보고 있으면 시선이 닿는 땅, 아니면 바로 아래
    const eye = eyeOf(p), look = viewOf(p);
    let T = null;
    try { if (look.y < -0.25) { const h = dim.getBlockFromRay(eye, look, { maxDistance: 30, includePassableBlocks: false }); if (h) T = add(h.block.location, { x: 0.5, y: 1, z: 0.5 }); } } catch {}
    if (!T) { try { const h = dim.getBlockFromRay(p.location, { x: 0, y: -1, z: 0 }, { maxDistance: 40, includePassableBlocks: false }); if (h) T = add(h.block.location, { x: 0.5, y: 1, z: 0.5 }); } catch {} }
    if (!T) T = up(p.location, -20);
    let dir = norm(sub(T, p.location)); if (dir.y > -0.45) dir = norm({ x: dir.x * 0.5, y: -1, z: dir.z * 0.5 });
    M.anim(p, "gear_drill");
    snd(p, "ambient.weather.thunder", 0.6, 1.6); snd(p, "mob.phantom.swoop", 1, 0.8);
    notify(p, linked ? "§5§l연계 · 선풍 낙뢰! §r§d(x1.35)" : "§5§l선풍 낙뢰!");
    // 하늘에서 몸으로 떨어지는 낙뢰 하나
    pt(dim, "hd_bolt", up(p.location, 10), { vd: { x: 0, y: -1, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, r: 9, h: 0.7, tone: Math.random() * 9, n: 70, life: 0.25 }, 0);
    let t = 0;
    const fall = () => {
      if (!p.isValid()) return;
      t++;
      const P = up(p.location, 1), sp = 2.4 + Math.min(1, t / 6) * 0.8, h = Math.hypot(dir.x, dir.z);
      try { p.applyKnockback(h > 0.01 ? dir.x / h : 0, h > 0.01 ? dir.z / h : 0, h * sp, dir.y * sp); } catch {}
      // 몸을 감싼 회오리 원반(돌며 위로 흩어짐) · 나선 기둥 · 가스 꼬리 · 사슬 돌리기 · 번개
      if (t % 2 === 1) swirlAt(P, { r: 2 + (t % 4) * 0.3, vs: 2, life: 0.4 });
      if (t % 3 === 0) pt(dim, "hd_vortex", up(P, 1.5), { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, vd: UP, r: 1.4, h: 4, spin: 1100, n: 40, life: 0.45 }, 1);
      gas(dim, up(P, 0.6), UP, { n: 3, spd: 2, life: 0.5 });
      if (t % 2 === 0) { const a = t * 0.9; for (const sg of [-1, 1]) { const q = add(P, { x: Math.cos(a) * sg * 1.6, y: 0.2, z: Math.sin(a) * sg * 1.6 }); chain(dim, P, q, 0.1); } }
      if (t % 4 === 0) { scythe(dim, P, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { spin: 1400, life: 0.2, scale: 0.05, prio: 1 }); pt(dim, "hd_bolt", up(P, 6), { vd: { x: 0, y: -1, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, r: 6, h: 0.5, tone: Math.random() * 9, n: 40, life: 0.18 }, 2); }
      if (t % 6 === 0) M.anim(p, "gear_drill");
      for (const e of foes(dim, p.location, 2.2)) if (hit(e, 0.5 * bonus, 6)) flame(dim, center(e), { n: 6, r: 0.3, spd: 2 });
      let gr = false; try { gr = p.isOnGround; } catch {}
      if (gr || solid(dim, up(p.location, -0.6)) || t > 34) return impact();
      later(1, fall);
    };
    later(1, fall);
  };
  const impact = () => {
    const c = up(p.location, 0.15), C1 = up(p.location, 1);
    M.anim(p, "gear_slam");
    shake(p, 1, 0.7);
    snd(p, "ambient.weather.thunder", 1, 1.1); snd(p, "random.explode", 0.9, 0.8); snd(p, "game.player.attack.sweep", 1.2, 0.5);
    // 바닥 충격파 둘 · 낮게 퍼지는 회오리 · 사방으로 퍼지는 가스 · 주변에 떨어지는 낙뢰 · 거대한 낫 한 바퀴
    pt(dim, "hd_shock", c, { r: 7, n: 140, life: 0.6 }, 0);
    later(4, () => pt(dim, "hd_shock", c, { r: 10, n: 120, life: 0.7 }, 1));
    swirlAt(up(c, 0.3), { r: 5, spin: 700, n: 110, life: 0.6, vs: 0.5, prio: 0 });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; gas(dim, up(c, 0.3), { x: Math.cos(a), y: 0.15, z: Math.sin(a) }, { n: 4, spd: 7, life: 0.8, prio: 1 }); }
    for (let i = 0; i < 5; i++) later(i * 2, () => { const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 4.5, q = add(c, { x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r }); pt(dim, "hd_bolt", up(q, 9), { vd: { x: 0, y: -1, z: 0 }, u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, r: 9, h: 0.8, tone: Math.random() * 9, n: 55, life: 0.22 }, 1); pt(dim, "hd_burst", q, { n: 8, r: 0.2, spd: 3, life: 0.4 }, 2); });
    scythe(dim, C1, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { spin: 800, life: 0.45, scale: 0.11 });
    darc(dim, C1, yawOf(p), { sweep: 380, r: 5, thick: 1.5, dur: 0.3, n: 260, life: 0.6, size: 1.4 });
    for (const e of foes(dim, c, 5.5)) if (hit(e, 2.2 * bonus, 1)) { const d = sub(e.location, p.location), L = Math.hypot(d.x, d.z) || 1; try { e.applyKnockback(d.x / L, d.z / L, 1.1, 0.75); } catch {} flame(dim, center(e), { n: 10, r: 0.3, spd: 3 }); }
  };
  if (g) { // 땅: 가스를 뿜으며 솟구쳤다가 강하
    M.anim(p, "gear_launch");
    try { p.applyKnockback(0, 0, 0, 1.5); } catch {}
    gas(dim, up(p.location, 0.2), { x: 0, y: -1, z: 0 }, { n: 16, r: 0.4, spd: 5, life: 0.8, prio: 1 });
    swirlAt(up(p.location, 0.2), { r: 2.6, spin: -700, n: 70, life: 0.45, vs: 3 });
    snd(p, "random.fizz", 0.8, 1); snd(p, "mob.phantom.swoop", 0.8, 1.4);
    later(9, start);
  } else later(1, start);
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
  if (id === "rpg:hundun_scythe") { const s = st(p); if (s.hook && now() <= s.hook.until) return "§5§l걸렸다! §r§7② · ① 다시: 부딪치기"; if (s.combo3 && now() <= s.combo3.until) return `§5낫 사슬 §d${"◆".repeat(s.combo3.left)} §7③ 다시: 다음 사슬 · ④: 선풍 낙뢰(연계)`; return "§5혼돈의 낫"; }
  if (id === "rpg:taotie_maw") { const h = Math.floor(HUNGER.get(p.id) ?? 0), b = Math.round(h / 10); return `§2허기 ${h >= 100 ? "§c" : "§a"}${"■".repeat(b)}§8${"■".repeat(10 - b)} §7${h}`; }
  if (id === "rpg:taowu_hammer") { const m = Math.floor(MOM.get(p.id) ?? 0), b = Math.round(m / 10); return `§6가속 §e${"■".repeat(b)}§8${"■".repeat(10 - b)} §7${m}`; }
  if (id === "rpg:qiongqi_claws") { const n = [...MARK.values()].filter((m) => m.pid === p.id && m.until > now() && m.e.isValid()).length; return `§c표식 §f${n}`; }
  return "";
};

/** 무기 스킬 표 (사신수와 같은 모양, pre = 재입력·모드 중 입력: true 면 쿨타임·마나 없이 처리) */
export const WEAPON_SKILLS = {
  "rpg:hundun_scythe": [
    { id: "w_hd_1", key: 1, name: "혼돈 · 낫 회전 돌진", short: "회전", lv: 1, mp: 7, cd: 2.5, pow: 1, run: hd_spin, pre: (p) => hd_collide(p), desc: "낫이 몸 둘레를 보랏빛 불꽃과 함께 한 바퀴 돌며 베고, 이어서 앞으로 돌진하며 지나간 적을 날려 보낸다." },
    { id: "w_hd_2", key: 2, name: "혼돈 · 낫 끌어오기", short: "끌어오기", lv: 1, mp: 14, cd: 7, pow: 1, run: hd_hook, pre: hd_hook_pre, desc: "낫을 회전시켜 던져(14칸) 걸린 적을 끌어온다. 끌려오는 동안·직후 ② 나 ① 을 다시 누르면 몸을 부딪쳐 크게 날려 보내는 연계, 아니면 도착하며 넉백으로 밀려난다." },
    { id: "w_hd_3", key: 3, name: "혼돈 · 낫 사슬 기동", short: "사슬", lv: 1, mp: 14, cd: 6, pow: 1, run: hd_swing, pre: hd_swing_pre, desc: "좌우 앞쪽 벽·나무·천장(겨눈 적)에 쇠사슬 낫을 자동으로 박고 날아감. 두 사슬이면 가운데로 쭉 당겨지고, 한 사슬이면 사슬 둘레를 휘돌며 떠오름. 처음엔 가스 분사가 차올라 빨라지고 점점 식음. 벽에 닿으면 벽 차기, 지나가며 자동 베기, 착지 구르기. 날아가는 중 다시: 사슬을 놓으며 가스 폭발 가속 → 바로 다음 사슬. 4번까지 이어 쓰고 6초 대기." },
    { id: "w_hd_4", key: 4, name: "혼돈 · 선풍 낙뢰", short: "낙뢰", lv: 1, mp: 35, cd: 18, pow: 1, run: hd_plunge, desc: "회오리를 두르고 사슬 낫을 돌리며 낙뢰처럼 그대로 내리꽂힌다(아래를 보면 시선이 닿는 곳으로). 땅에서 쓰면 먼저 솟구친다. ③ 사슬 기동 중 공중에서 쓰면 바로 강하하는 연계기(위력 1.35배). 착지하면 충격파 · 주변 낙뢰 · 거대한 낫 한 바퀴." },
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
