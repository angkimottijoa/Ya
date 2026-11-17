// ═══════════════════════════════════════════════════════════════════════
// 주작의 활 (V6.5) — 콤보 위주 스킬 무기, 불 파티클
//   ① 클릭  주작 · 화시 (3단 콤보)
//      1단: 불화살 한 발 → 맞히면 2단
//      2단: 불화살 세 발(부채꼴) → 맞히면 3단
//      3단: 주작의 활(사용자 그림 점 찍기)이 나타나 2초 동안 시위를 당겨 조준(시위·큰 불화살도 파티클)
//           → 큰 불화살(사용자 그림)이 조준한 상대를 끝까지 따라가 명중 → 불 폭발
//      6초 안에 다음 단을 이어 쏘지 않거나 빗나가면 1단으로
// 파티클: gen_jujak.py (jj_bow, jj_bigarrow, jj_ember, jj_trail, jj_boom, jj_ring)
// ═══════════════════════════════════════════════════════════════════════
import { system, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
import * as M from "./ms.js";
import { JJ } from "./jujak_meta.js";

export const BOW_ID = "rpg:jujak_bow";
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
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const UP = { x: 0, y: 1, z: 0 };
const ease = (s) => s * s * (3 - 2 * s);

const DEF = { n: 10, r: 0.2, spd: 1, tone: 0, size: 1, life: 0.5, cx: 0, cy: 0, scale: 0.03 };
function pt(dim, name, loc, o = {}) {
  try {
    const m = new MolangVariableMap();
    for (const k of Object.keys(DEF)) m.setFloat(`variable.${k}`, o[k] ?? DEF[k]);
    for (const k of ["u", "v"]) m.setVector3(`variable.${k}`, o[k] ?? { x: 1, y: 0, z: 0 });
    dim.spawnParticle(`rpg:${name}`, loc, m);
  } catch {}
}
const ember = (dim, at, o = {}) => pt(dim, "jj_ember", at, { n: 8, r: 0.2, spd: 1.5, size: 1, life: 0.7, tone: 0.1, ...o });
const fireBoom = (dim, at, o = {}) => pt(dim, "jj_boom", at, { n: 8, r: 0.4, spd: 3, size: 1.4, life: 0.8, tone: 0, ...o });
function trail(dim, a, b, o = {}) {
  const d = sub(b, a), L = len(d) || 0.01;
  pt(dim, "jj_trail", a, { u: scl(d, 1 / L), r: L, n: o.n ?? Math.max(6, Math.round(L * 10)), size: o.size ?? 1, life: o.life ?? 0.35, tone: o.tone ?? 0 });
}
function shake(dim, at, power, sec) {
  try { for (const pl of dim.getPlayers({ location: at, maxDistance: 24 })) pl.runCommand(`camerashake add @s ${power} ${sec} positional`); } catch {}
}
function cam(p, pos, look, easeT = 0.3, type = "InOutSine") {
  try { p.camera.setCamera("minecraft:free", { location: pos, facingLocation: look, easeOptions: { easeTime: easeT, easeType: type } }); } catch {
    const f = (v) => v.toFixed(2), t = type.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
    try { p.runCommand(`camera @s set minecraft:free ease ${easeT} ${t} pos ${f(pos.x)} ${f(pos.y)} ${f(pos.z)} facing ${f(look.x)} ${f(look.y)} ${f(look.z)}`); } catch {}
  }
}
function camClear(p) { try { p.camera.clear(); } catch { try { p.runCommand("camera @s clear"); } catch {} } }
const say = (p, t) => { try { p.onScreenDisplay.setActionBar(t); } catch {} };

function hitter(ctx) {
  return (e, mul, fire = 3) => {
    if (!e?.isValid()) return;
    M.skillHit.set(e.id, system.currentTick);
    try { e.applyDamage(Math.max(1, Math.round(ctx.dmg * mul)), { cause: EntityDamageCause.entityAttack, damagingEntity: ctx.p }); } catch {}
    try { e.setOnFire(fire, true); } catch {}
  };
}
const viewOf = (p) => { try { return p.getViewDirection(); } catch { return fwdOf(yawOf(p)); } };
const eyeOf = (p) => { try { return p.getHeadLocation(); } catch { return up(p.location, 1.6); } };

// ───────── 불화살 (스크립트 투사체) ─────────
/** dir 로 날아가는 불화살. 맞으면 onHit(e), 다 날아가도록 못 맞히면 onMiss() */
function fireArrow(ctx, from, dir, o = {}) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  const speed = o.speed ?? 2.3, life = o.life ?? 22;
  let pos = { ...from }, t = 0, done = false;
  const step = () => {
    if (done) return;
    t++;
    const next = add(pos, dir, speed);
    // 막힘 검사 (중간 두 점)
    for (const q of [0.5, 1]) {
      const c = add(pos, dir, speed * q);
      try { const b = dim.getBlock({ x: Math.floor(c.x), y: Math.floor(c.y), z: Math.floor(c.z) }); if (b && !b.isAir && !b.isLiquid && b.isSolid !== false) { done = true; burst(c, false); o.onMiss?.(); return; } } catch {}
      const tgt = M.around(dim, c, 1.2).filter((e) => e.id !== p.id)[0];
      if (tgt) { done = true; hit(tgt, o.mul ?? 1, 3); burst(up(tgt.location, 1), true); o.onHit?.(tgt); return; }
    }
    // 불꽃 줄 + 화살촉 + 불티
    trail(dim, pos, next, { size: 1.15, life: 0.3, n: 22 });
    trail(dim, add(next, dir, -0.6), next, { size: 0.7, life: 0.08, n: 8, tone: -0.2 });
    if (t % 2 === 0) ember(dim, pos, { n: 3, r: 0.1, spd: 0.6, life: 0.6 });
    pos = next;
    if (t >= life) { done = true; o.onMiss?.(); return; }
    later(1, step);
  };
  const burst = (at, big) => {
    fireBoom(dim, at, { n: big ? 8 : 4, r: 0.3, spd: big ? 3 : 2, size: big ? 1.3 : 1 });
    ember(dim, at, { n: big ? 18 : 8, r: 0.3, spd: 3.5, life: 0.8 });
    if (big) M.sound(p, "random.fizz", 0.8, 1.4);
  };
  step();
}

// ───────── 3단: 주작의 활 · 큰 불화살 ─────────
const BOW = JJ.BOW, AR = JJ.ARROW;
function pickTarget(p) {
  try {
    const hits = p.getEntitiesFromViewDirection({ maxDistance: 40 }).map((h) => h.entity).filter((e) => e?.isValid() && e.id !== p.id && e.typeId !== "minecraft:item");
    if (hits.length) return hits[0];
  } catch {}
  const eye = eyeOf(p), v = viewOf(p);
  let best = null, bs = 0.9; // 시선 25도 안에서 가장 가까운
  for (const e of M.around(p.dimension, add(eye, v, 15), 16)) {
    const d = sub(up(e.location, 1), eye), L = len(d), c = (d.x * v.x + d.y * v.y + d.z * v.z) / (L || 1);
    if (c > bs) { bs = c; best = e; }
  }
  return best;
}
function bigShot(ctx, done) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  const yw = yawOf(p), f = fwdOf(yw), rt = rightOf(yw);
  const target = pickTarget(p);
  M.anim(p, "bow_draw");
  M.potion(p, "slowness", 4, 2.4);
  M.potion(p, "resistance", 3, 2.6);
  M.sound(p, "mob.blaze.breathe", 1, 0.7);
  // 활 (사진 그림): 몸 앞에 세워 그림 (그림 오른쪽 = 앞). 가만히 서 있으니 한 번만 오래 그림
  const SB = 0.03, H = add(up(p.location, 1.45), f, 1.0);
  const toW = (ix, iy) => add(add(H, f, (ix - BOW.cx) * SB), UP, (BOW.cy - iy) * SB);
  const tipT = toW(BOW.top[0], BOW.top[1]), tipB = toW(BOW.bot[0], BOW.bot[1]);
  const rest = scl(add(tipT, tipB), 0.5);
  pt(dim, "jj_bow", H, { cx: BOW.cx, cy: BOW.cy, u: f, v: UP, scale: SB, n: Math.round((BOW.filled * 1.15) / BOW.fill), life: 2.4, size: 1 });
  fireBoom(dim, H, { n: 10, r: 0.8, spd: 2, size: 1.2, tone: 0.2 });
  ember(dim, H, { n: 30, r: 1, spd: 2, life: 1 });
  // 옆 어깨 너머 카메라
  cam(p, add(add(up(p.location, 2.3), rt, 3.4), f, -2.4), add(H, f, 1.5), 0.35);
  if (target) say(p, "§6주작의 눈 §f— 조준 고정!");
  const SA = 3.0 / AR.iw; // 큰 불화살 길이 3블록
  const aimDir = () => {
    if (target?.isValid()) return norm(sub(up(target.location, 1.1), rest));
    return f;
  };
  const DRAW = 40; // 2초
  for (let t = 1; t <= DRAW; t++) later(t, () => {
    const k = ease(t / DRAW), nock = add(rest, f, -1.3 * k);
    // 시위: 활 끝 두 곳에서 당겨진 점으로
    trail(dim, tipT, nock, { size: 0.8, life: 0.1, n: 22, tone: 0.3 });
    trail(dim, tipB, nock, { size: 0.8, life: 0.1, n: 22, tone: 0.3 });
    // 큰 불화살: 꼬리를 시위에 걸고 목표 쪽으로 (2틱마다)
    if (t % 2 === 0) {
      const d = aimDir();
      let v = cross(d, cross(UP, d)); if (len(v) < 0.1) v = UP; // 화살 그림 면을 세움
      pt(dim, "jj_bigarrow", nock, { cx: AR.cx, cy: AR.cy, u: d, v: norm(v), scale: SA, n: Math.round((AR.filled * 1.0) / AR.fill), life: 0.12, size: 1 });
      ember(dim, add(nock, d, 2.6), { n: 4, r: 0.15, spd: 1, life: 0.5, tone: 0 });
    }
    // 목표 발밑에 불 고리 표시
    if (target?.isValid() && t % 6 === 0) pt(dim, "jj_ring", up(target.location, 0.1), { n: 18, r: 0.9, spd: 0.6, size: 0.8, life: 0.4, tone: 0.1 });
    if (t % 10 === 0) M.sound(p, "random.bow", 0.4, 0.5 + t * 0.012);
  });
  // 발사: 큰 불화살이 목표를 끝까지 따라감
  later(DRAW + 1, () => {
    M.sound(p, "random.bow", 1.2, 0.6);
    M.sound(p, "mob.blaze.shoot", 1.2, 0.8);
    shake(dim, rest, 0.3, 0.3);
    let pos = add(rest, aimDir(), 0.5), dir = aimDir(), t = 0, over = false;
    const cpos = add(add(up(p.location, 3), rt, 5), f, -1);
    cam(p, cpos, target?.isValid() ? up(target.location, 1) : add(rest, f, 12), 0.4, "OutCubic");
    const fly = () => {
      if (over) return;
      t++;
      if (target?.isValid()) { const want = norm(sub(up(target.location, 1.1), pos)); dir = norm(add(dir, want, 0.6)); }
      const speed = 1.7, next = add(pos, dir, speed);
      let v = cross(dir, cross(UP, dir)); if (len(v) < 0.1) v = UP;
      pt(dim, "jj_bigarrow", pos, { cx: AR.cx, cy: AR.cy, u: dir, v: norm(v), scale: SA, n: Math.round((AR.filled * 0.85) / AR.fill), life: 0.07, size: 1 });
      trail(dim, add(pos, dir, -2), add(pos, dir, 0.3), { size: 2, life: 0.45, n: 40 });
      ember(dim, pos, { n: 6, r: 0.3, spd: 1.2, life: 0.8 });
      if (t % 2 === 0) fireBoom(dim, add(pos, dir, -1), { n: 2, r: 0.3, spd: 0.6, size: 1.2, life: 0.6, tone: 0.2 });
      const tip = add(pos, dir, 3);
      const victim = (target?.isValid() && len(sub(up(target.location, 1), tip)) < 1.8) ? target : M.around(dim, tip, 1.4).filter((e) => e.id !== p.id)[0];
      let blocked = false;
      try { const b = dim.getBlock({ x: Math.floor(tip.x), y: Math.floor(tip.y), z: Math.floor(tip.z) }); blocked = b && !b.isAir && !b.isLiquid && b.isSolid !== false; } catch {}
      if (victim || blocked || t > 50) { over = true; explode(victim ? up(victim.location, 1) : tip, victim); return; }
      pos = next;
      later(1, fly);
    };
    fly();
  });
  const explode = (at, victim) => {
    if (victim) hit(victim, 4.5, 6);
    for (const e of M.around(dim, at, 4.5)) if (e !== victim) hit(e, 1.8, 4);
    try { dim.spawnParticle("minecraft:large_explosion", at); } catch {}
    fireBoom(dim, at, { n: 22, r: 1.2, spd: 6, size: 2.6, life: 1 });
    ember(dim, at, { n: 60, r: 1, spd: 7, life: 1.2 });
    for (const [d, spd, tone] of [[0, 7, 0], [3, 11, 0.25], [6, 15, 0.45]]) later(d + 1, () => pt(dim, "jj_ring", up(at, -0.6), { n: 60, r: 0.5, spd, size: 1.9, life: 0.7, tone }));
    shake(dim, at, 0.7, 0.5);
    M.sound(p, "random.explode", 1.3, 0.9);
    M.sound(p, "mob.blaze.death", 0.8, 1.4);
    later(18, () => camClear(p));
    done();
  };
  later(DRAW + 80, () => camClear(p)); // 안전장치
}

// ───────── ① 주작 · 화시 (3단 콤보) ─────────
const combo = new Map(); // pid -> { stage, until, busy }
function flameShot(ctx) {
  const { p } = ctx, now = system.currentTick;
  let st = combo.get(p.id);
  if (!st || now > st.until) st = { stage: 0, until: 0, busy: 0 };
  if (now < st.busy) return; // 조준 중
  combo.set(p.id, st);
  const eye = eyeOf(p), v = viewOf(p), start = add(eye, v, 1);
  const next = (stage, msg) => { st.stage = stage; st.until = system.currentTick + 120; say(p, msg); M.sound(p, "random.orb", 0.6, 0.8 + stage * 0.3); };
  if (st.stage === 0) {
    M.anim(p, "shoot");
    M.sound(p, "random.bow", 1, 1.2);
    fireArrow(ctx, start, v, { mul: 1, onHit: () => next(1, "§6주작 · 화시 §f2단 §7— 불화살 세 발!"), onMiss: () => { st.stage = 0; } });
  } else if (st.stage === 1) {
    M.anim(p, "shoot");
    M.sound(p, "random.bow", 1, 1);
    let hitAny = false, left = 3;
    const fin = () => { if (--left === 0 && !hitAny) st.stage = 0; };
    for (const deg of [-9, 0, 9]) {
      const yw = yawOf(p) + deg, f = fwdOf(yw), d = norm({ x: f.x * Math.hypot(v.x, v.z), y: v.y, z: f.z * Math.hypot(v.x, v.z) });
      fireArrow(ctx, start, d, { mul: 0.9, onHit: () => { if (!hitAny) { hitAny = true; next(2, "§6주작 · 화시 §c3단 §7— 주작의 활!"); } fin(); }, onMiss: fin });
    }
  } else {
    st.busy = now + 60;
    st.stage = 0;
    bigShot(ctx, () => { st.stage = 0; st.until = 0; });
  }
}

/** 무기 스킬 표 (청룡의 검과 같은 모양: HUD·쿨다운에 그대로 씀) */
export const WEAPON_SKILLS = {
  [BOW_ID]: [
    { id: "w_jj_1", key: 1, name: "주작 · 화시", short: "화시", lv: 1, mp: 8, cd: 0.5, pow: 1, run: flameShot, desc: "불화살 → 맞히면 세 발 → 또 맞히면 주작의 활로 2초 조준해 큰 불화살이 상대를 끝까지 따라가 폭발." },
  ],
};
