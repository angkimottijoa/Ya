// ═══════════════════════════════════════════════════════════════════════
// 주작의 활 (V6.5) — 콤보 위주 스킬 무기, 불 파티클
//   ① 클릭  주작 · 화시 (3단 콤보)
//      1단: 불화살 한 발 → 맞히면 2단
//      2단: 불화살 세 발(부채꼴) → 맞히면 3단
//      2단 화살은 근접 신관: 둘레(아래쪽까지)에 적이 조금이라도 들어오면 그 자리에서 폭발
//      3단: 주작의 활(사용자 그림 점 찍기)이 손 앞에 나타나 시선을 따라다니며 2초 동안 시위를 당김
//           → 그 순간 바라보는 쪽으로 큰 불화살(사용자 그림)이 곧게 날아가 크게 폭발
//      6초 안에 다음 단을 이어 쏘지 않거나 빗나가면 1단으로. 화살 6발, 2초 동안 안 쏘면 자동 장전
// 파티클: gen_jujak.py (jj_bow, jj_bigarrow, jj_ember, jj_trail, jj_boom, jj_ring)
// ═══════════════════════════════════════════════════════════════════════
import { system, world, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
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
const lastSay = new Map();
const say = (p, t) => { try { p.onScreenDisplay.setActionBar(t); lastSay.set(p.id, system.currentTick); } catch {} };

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

// ───────── 판정: 적의 몸 중심(발 + 0.9) 기준, 넉넉하게 ─────────
const center = (e) => up(e.location, 0.9);
function enemiesNear(dim, p, at, r, below = 0) {
  return M.around(dim, at, r + 2.5).filter((e) => {
    if (e.id === p.id) return false;
    const c = center(e), dx = c.x - at.x, dz = c.z - at.z, dy = c.y - at.y;
    if (Math.hypot(dx, dz) > r) return false;
    return dy <= r * 0.8 && dy >= -(r * 0.8 + below); // below: 화살 아래쪽까지 더 넓게
  });
}
const solidAt = (dim, c) => { try { const b = dim.getBlock({ x: Math.floor(c.x), y: Math.floor(c.y), z: Math.floor(c.z) }); return b && !b.isAir && !b.isLiquid && b.isSolid !== false; } catch { return false; } };

// ───────── 불화살 (스크립트 투사체) ─────────
/** dir 로 곧게 날아가는 불화살. 지나가는 길을 0.5블록마다 검사.
 *  o.prox > 0 이면 근접 신관: 그 반경(+아래쪽)에 적이 들어오면 그 자리에서 폭발 (o.boom 반경 피해) */
function fireArrow(ctx, from, dir, o = {}) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  const speed = o.speed ?? 2.3, life = o.life ?? 24, R = o.radius ?? 1.5;
  let pos = { ...from }, t = 0, done = false;
  const step = () => {
    if (done) return;
    t++;
    const next = add(pos, dir, speed);
    for (let q = 0.25; q <= 1.001; q += 0.25) {
      const c = add(pos, dir, speed * q);
      if (solidAt(dim, c)) { done = true; burst(c, null); o.onMiss?.(); return; }
      const near = enemiesNear(dim, p, c, o.prox || R, o.prox ? 2.2 : 0.6);
      if (near.length) { done = true; burst(c, near); o.onHit?.(near[0]); return; }
    }
    trail(dim, pos, next, { size: 1.4, life: 0.32, n: 24 });
    trail(dim, add(next, dir, -0.7), next, { size: 0.9, life: 0.08, n: 10, tone: -0.2 });
    if (t % 2 === 0) ember(dim, pos, { n: 3, r: 0.1, spd: 0.6, life: 0.6 });
    pos = next;
    if (t >= life) { done = true; o.onMiss?.(); return; }
    later(1, step);
  };
  const burst = (at, near) => {
    if (o.boom) { // 근접 폭발: 반경 안 모두
      for (const e of enemiesNear(dim, p, at, o.boom, 1.5)) hit(e, o.mul ?? 1, 3);
      fireBoom(dim, at, { n: 12, r: 0.6, spd: 4, size: 1.8 });
      pt(dim, "jj_ring", up(at, -0.3), { n: 30, r: 0.4, spd: 7, size: 1.3, life: 0.5, tone: 0.1 });
      ember(dim, at, { n: 26, r: 0.4, spd: 4.5, life: 0.9 });
      M.sound(p, "random.explode", 0.6, 1.4);
    } else {
      if (near) for (const e of near.slice(0, 2)) hit(e, o.mul ?? 1, 3);
      fireBoom(dim, at, { n: near ? 8 : 4, r: 0.3, spd: near ? 3 : 2, size: near ? 1.4 : 1 });
      ember(dim, at, { n: near ? 18 : 8, r: 0.3, spd: 3.5, life: 0.8 });
      if (near) M.sound(p, "random.fizz", 0.8, 1.4);
    }
  };
  step();
}

// ───────── 3단: 주작의 활 · 큰 불화살 ─────────
const BOW = JJ.BOW, AR = JJ.ARROW;
/** 활·시위·화살: 플레이어 앞 바닥에 크게(높이 약 5블록) 세움. k = 당긴 정도 0~1. drawBody 일 때만 활 몸을 그림 (3틱마다) */
function drawBow(p, k, withArrow = true, drawBody = true) {
  const dim = p.dimension, v = viewOf(p), yw = yawOf(p), f = fwdOf(yw), right = rightOf(yw);
  // 활 면: 대부분 옆을 향하게 (뒤·1인칭에서도 활 모양이 보임), 활 배(그림 오른쪽)는 앞쪽
  const u = norm(add(scl(f, 0.35), right, 0.94));
  const SB = 0.068;
  // 시위 가운데(활 양 끝의 중간)가 플레이어 바로 앞 가운데 줄에 오게 활 위치를 맞춤 → 화살이 정면으로 곧게
  const rel = (ix, iy) => add(scl(u, (ix - BOW.cx) * SB), UP, (BOW.cy - iy) * SB);
  const restRel = scl(add(rel(BOW.top[0], BOW.top[1]), rel(BOW.bot[0], BOW.bot[1])), 0.5);
  const want = add(up(p.location, 1.4), f, 1.6);
  const H = sub(want, restRel);
  const toW = (ix, iy) => add(H, rel(ix, iy));
  const tipT = toW(BOW.top[0], BOW.top[1]), tipB = toW(BOW.bot[0], BOW.bot[1]);
  const rest = scl(add(tipT, tipB), 0.5), nock = add(rest, f, -1.8 * k);
  if (drawBody) pt(dim, "jj_bow", H, { cx: BOW.cx, cy: BOW.cy, u, v: UP, scale: SB, n: Math.round((BOW.filled * 0.9) / BOW.fill), life: 0.3, size: 1 });
  trail(dim, tipT, nock, { size: 1.5, life: 0.12, n: 34, tone: 0.3 });
  trail(dim, tipB, nock, { size: 1.5, life: 0.12, n: 34, tone: 0.3 });
  let aim = norm({ x: f.x * Math.hypot(v.x, v.z), y: v.y, z: f.z * Math.hypot(v.x, v.z) }); // 정면(시선 높낮이만 따름)
  if (withArrow) {
    const SA = 4.5 / AR.iw, side = norm(cross(aim, UP).x || cross(aim, UP).z ? cross(aim, UP) : right), av = norm(cross(side, aim));
    pt(dim, "jj_bigarrow", nock, { cx: AR.cx, cy: AR.cy, u: aim, v: av, scale: SA, n: Math.round((AR.filled * 1.1) / AR.fill), life: 0.12, size: 1.2 });
    ember(dim, add(nock, aim, 3.6), { n: 5, r: 0.2, spd: 1, life: 0.5, tone: 0 });
  }
  return { nock, v: aim, upv: norm(cross(norm(cross(aim, UP).x || cross(aim, UP).z ? cross(aim, UP) : right), aim)) };
}
function flashScreen(p, r, g, b, t = 0.3) {
  try { p.camera.fade({ fadeTime: { fadeInTime: 0.04, holdTime: 0.02, fadeOutTime: t }, fadeColor: { red: r, green: g, blue: b } }); } catch {
    try { p.runCommand(`camera @s fade time 0.04 0.02 ${t} color ${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}`); } catch {}
  }
}
const vanilla = (dim, id, at) => { try { dim.spawnParticle(id, at); } catch {} };
function bigShot(ctx, done) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.anim(p, "bow_draw");
  M.potion(p, "slowness", 2, 2.2); // 조금 느려질 뿐, 움직이며 자유롭게 조준
  M.potion(p, "resistance", 3, 2.6);
  M.sound(p, "mob.blaze.breathe", 1, 0.7);
  ember(dim, up(p.location, 1.4), { n: 30, r: 1, spd: 2, life: 1 });
  say(p, "§6주작의 활 §f— 시선으로 조준!");
  const DRAW = 40; // 2초 동안 기를 모음
  for (let t = 1; t <= DRAW; t++) later(t, () => {
    if (!p.isValid()) return;
    const k = ease(t / DRAW), L = p.location;
    drawBow(p, k, true, t % 3 === 1);
    // 기 모으기: 불티가 몸으로 빨려 들어옴, 발밑 불 고리가 솟음, 불꽃, 게이지, 점점 세지는 떨림
    if (t % 2 === 0) for (let j = 0; j < 3; j++) {
      const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 1.5, q = { x: L.x + Math.cos(a) * r, y: L.y + 0.3 + Math.random() * 2.5, z: L.z + Math.sin(a) * r };
      pt(dim, "jj_trail", q, { u: norm(sub(up(L, 1.2), q)), r: r * 0.8, n: 10, size: 0.9, life: 0.25, tone: 0.1 });
    }
    if (t % 4 === 0) {
      pt(dim, "jj_ring", up(L, 0.1), { n: 22, r: 2.4 - k, spd: 0.4, size: 1 + k * 0.6, life: 0.5, tone: 0.15 });
      for (let j = 0; j < 4; j++) { const a = (j / 4) * Math.PI * 2 + t * 0.3; vanilla(dim, "minecraft:basic_flame_particle", { x: L.x + Math.cos(a) * 1.8, y: L.y + 0.2, z: L.z + Math.sin(a) * 1.8 }); }
      const bars = Math.round(k * 10);
      say(p, `§6기 모으는 중 §c${"▮".repeat(bars)}§8${"▮".repeat(10 - bars)}`);
    }
    if (t % 8 === 0) try { p.runCommand(`camerashake add @s ${(0.04 + k * 0.18).toFixed(2)} 0.3 positional`); } catch {}
    if (t % 10 === 0) M.sound(p, "random.bow", 0.4, 0.5 + t * 0.012);
    if (t === DRAW) { flashScreen(p, 1, 0.5, 0.12, 0.35); M.sound(p, "mob.blaze.shoot", 0.8, 0.5); ember(dim, up(L, 1.2), { n: 50, r: 1.2, spd: 4, life: 0.9, tone: 0 }); }
  });
  // 발사: 그 순간 바라보는 방향으로 곧게 날아감 → 맞거나 막히면 큰 폭발
  later(DRAW + 1, () => {
    if (!p.isValid()) return done();
    const { nock, v, upv } = drawBow(p, 1, false);
    M.sound(p, "random.bow", 1.2, 0.6);
    M.sound(p, "mob.blaze.shoot", 1.2, 0.8);
    shake(dim, nock, 0.3, 0.3);
    const SA = 4.5 / AR.iw;
    let pos = add(nock, v, 0.5), t = 0, over = false;
    const fly = () => {
      if (over) return;
      t++;
      const speed = 2.0;
      pt(dim, "jj_bigarrow", pos, { cx: AR.cx, cy: AR.cy, u: v, v: upv, scale: SA, n: Math.round((AR.filled * 0.8) / AR.fill), life: 0.07, size: 1 });
      trail(dim, add(pos, v, -2.5), add(pos, v, 0.3), { size: 2.4, life: 0.45, n: 44 });
      // 나선 검기: 날아간 길을 두 가닥 불꽃 나선이 감으며 따라감
      { const side = norm(cross(v, upv)), seg = 4;
        for (const ph of [0, Math.PI]) {
          let prevQ = null;
          for (let j = 0; j <= seg; j++) {
            const s2 = (t - 1) * speed + (j / seg) * speed, ang = s2 * 0.9 + ph, rr = 1.3;
            const q = add(add(add(pos, v, -speed + (j / seg) * speed), side, Math.cos(ang) * rr), upv, Math.sin(ang) * rr);
            if (prevQ) trail(dim, prevQ, q, { size: 1.6, life: 0.55, n: 10, tone: ph ? 0.25 : 0 });
            prevQ = q;
          }
        } }
      ember(dim, pos, { n: 6, r: 0.3, spd: 1.2, life: 0.8 });
      if (t % 2 === 0) fireBoom(dim, add(pos, v, -1), { n: 2, r: 0.3, spd: 0.6, size: 1.4, life: 0.6, tone: 0.2 });
      for (let q = 0; q <= 1.001; q += 0.25) { // 화살 앞부분이 지나가는 길 전부 검사
        const tip = add(pos, v, 4.5 + speed * q);
        if (enemiesNear(dim, p, tip, 2.2, 1.2).length || solidAt(dim, tip)) { over = true; explode(tip); return; }
      }
      if (t > 40) { over = true; explode(add(pos, v, 4.5)); return; }
      pos = add(pos, v, speed);
      later(1, fly);
    };
    fly();
  });
  const explode = (at) => {
    const near = enemiesNear(dim, p, at, 6.5, 2);
    for (const e of near) { const d = len(sub(center(e), at)); hit(e, d < 2.5 ? 4.5 : 2.2, 6); M.toss(at, e, 1.6, 3); }
    try { dim.spawnParticle("minecraft:huge_explosion_emitter", at); } catch {}
    fireBoom(dim, at, { n: 34, r: 1.8, spd: 8, size: 3.4, life: 1.1 });
    fireBoom(dim, at, { n: 14, r: 1, spd: 4, size: 2.4, life: 1.3, tone: 0.35 });
    ember(dim, at, { n: 90, r: 1.2, spd: 9, life: 1.3 });
    for (const [d, spd, tone] of [[0, 8, 0], [3, 12, 0.2], [6, 16, 0.35], [10, 20, 0.5]]) later(d + 1, () => pt(dim, "jj_ring", up(at, -0.6), { n: 64, r: 0.5, spd, size: 2.2, life: 0.75, tone }));
    // 불기둥 6개 + 용암 방울 + 2초 동안 땅에 남는 불 고리
    for (let j = 0; j < 6; j++) later(j, () => {
      const a = (j / 6) * Math.PI * 2, q = { x: at.x + Math.cos(a) * 3, y: at.y - 1, z: at.z + Math.sin(a) * 3 };
      pt(dim, "jj_trail", q, { u: UP, r: 5, n: 50, size: 2.2, life: 0.6, tone: 0 });
      ember(dim, up(q, 1), { n: 20, r: 0.5, spd: 5, life: 1, tone: 0 });
    });
    for (let j = 0; j < 12; j++) vanilla(dim, "minecraft:lava_particle", add(at, { x: Math.random() - 0.5, y: 0, z: Math.random() - 0.5 }, 3));
    for (let t = 4; t <= 40; t += 4) later(t, () => {
      pt(dim, "jj_ring", up(at, -0.8), { n: 30, r: 4, spd: 0.3, size: 1.4, life: 0.5, tone: 0.2 });
      for (let j = 0; j < 6; j++) { const a = Math.random() * Math.PI * 2; vanilla(dim, "minecraft:basic_flame_particle", { x: at.x + Math.cos(a) * 4, y: at.y - 0.8, z: at.z + Math.sin(a) * 4 }); }
    });
    flashScreen(p, 1, 0.55, 0.15, 0.4);
    shake(dim, at, 0.9, 0.7);
    M.sound(p, "random.explode", 1.6, 0.8);
    M.sound(p, "mob.blaze.death", 0.9, 1.3);
    done();
  };
}

// ───────── ① 주작 · 화시 (3단 콤보, 6발 장전) ─────────
const AMMO = 6;
const combo = new Map(); // pid -> { stage, until, busy, ammo, reload }
const REFILL = 40; // 2초 동안 안 쓰면 다시 채워짐 (들고 있을 때)
function refill(p, st) {
  if (st.ammo >= AMMO || system.currentTick - st.last < REFILL) return;
  st.ammo = AMMO;
  M.anim(p, "reload");
  M.sound(p, "random.bow", 0.8, 1.6);
  const dim = p.dimension;
  for (let t = 2; t <= 20; t += 3) later(t, () => ember(dim, add(up(p.location, 1.5), fwdOf(yawOf(p)), 0.4), { n: 6, r: 0.6, spd: -1.5, life: 0.5, tone: 0 }));
  fireBoom(dim, up(p.location, 1.3), { n: 6, r: 0.4, spd: 2, size: 1.2 });
}
/** 정보창에 늘 보이는 줄: 남은 화살·콤보 단계 (주작의 활을 들고 있을 때) */
export function ammoLine(p) {
  let st = combo.get(p.id);
  if (!st) { st = { stage: 0, until: 0, busy: 0, ammo: AMMO, last: 0 }; combo.set(p.id, st); }
  refill(p, st);
  const now = system.currentTick, stage = now > st.until ? 0 : st.stage;
  const left = st.ammo < AMMO ? Math.max(0, Math.ceil((REFILL - (now - st.last)) / 20)) : 0;
  return `§6🔥 §f${"|".repeat(st.ammo)}§8${"|".repeat(AMMO - st.ammo)} §f${st.ammo}/${AMMO}` + (stage ? `  §c${stage + 1}단` : "") + (left && st.ammo < AMMO ? `  §7장전 ${left}s` : "");
}
function flameShot(ctx) {
  const { p } = ctx, now = system.currentTick;
  let st = combo.get(p.id);
  if (!st) { st = { stage: 0, until: 0, busy: 0, ammo: AMMO, last: 0 }; combo.set(p.id, st); }
  refill(p, st);
  if (st.ammo <= 0) { say(p, `§7화살이 없습니다 — ${Math.ceil((REFILL - (now - st.last)) / 20)}초 뒤 자동 장전`); return; }
  if (now < st.busy) return; // 3단 조준 중
  if (now > st.until) st.stage = 0;
  const eye = eyeOf(p), v = viewOf(p), start = add(eye, v, 1);
  const next = (stage, msg) => { st.stage = stage; st.until = system.currentTick + 120; say(p, msg); M.sound(p, "random.orb", 0.6, 0.8 + stage * 0.3); };
  const used = () => { st.ammo--; st.last = system.currentTick; };
  if (st.stage === 0) {
    M.anim(p, "shoot");
    M.sound(p, "random.bow", 1, 1.2);
    used();
    fireArrow(ctx, start, v, { mul: 1, radius: 1.5, onHit: () => next(1, "§6주작 · 화시 §f2단 §7— 불화살 세 발!"), onMiss: () => { st.stage = 0; } });
  } else if (st.stage === 1) {
    M.anim(p, "shoot");
    M.sound(p, "random.bow", 1, 1);
    used();
    let hitAny = false, left = 3;
    const fin = () => { if (--left === 0 && !hitAny) st.stage = 0; };
    const yaw0 = yawOf(p), horiz = Math.hypot(v.x, v.z);
    for (const deg of [-11, 0, 11]) {
      const f = fwdOf(yaw0 + deg), d = norm({ x: f.x * horiz, y: v.y, z: f.z * horiz });
      // 근접 신관: 화살 둘레(아래쪽까지)에 조금이라도 들어오면 그 자리에서 폭발
      fireArrow(ctx, start, d, { mul: 0.9, prox: 2.4, boom: 3, onHit: () => { if (!hitAny) { hitAny = true; next(2, "§6주작 · 화시 §c3단 §7— 주작의 활!"); } fin(); }, onMiss: fin });
    }
  } else {
    st.busy = now + 46;
    st.stage = 0;
    used();
    bigShot(ctx, () => { st.stage = 0; st.until = 0; });
  }
}

// 주작의 활을 들고 있으면 화면 아래(액션바)에 스킬 정보를 계속 띄움 (방금 띄운 알림은 1.5초 동안 덮지 않음)
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    let held = false;
    try { held = p.getComponent("minecraft:inventory").container.getItem(p.selectedSlotIndex)?.typeId === BOW_ID; } catch {}
    if (!held) continue;
    if (system.currentTick - (lastSay.get(p.id) ?? -99) < 30) continue;
    try { p.onScreenDisplay.setActionBar(`§6§l주작 · 화시§r  ${ammoLine(p)}  §7(클릭: 불화살 → 세 발 → 주작의 활)`); } catch {}
  }
}, 5);

/** 무기 스킬 표 (청룡의 검과 같은 모양: HUD·쿨다운에 그대로 씀) */
export const WEAPON_SKILLS = {
  [BOW_ID]: [
    { id: "w_jj_1", key: 1, name: "주작 · 화시", short: "화시", lv: 1, mp: 6, cd: 0.35, pow: 1, run: flameShot, desc: "불화살 → 맞히면 근접 폭발 불화살 세 발 → 또 맞히면 주작의 활로 2초 조준해 큰 불화살을 쏴 크게 폭발. 6발마다 장전." },
  ],
};
