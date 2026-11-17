// ═══════════════════════════════════════════════════════════════════════
// 주작의 활 (V6.5) — 콤보 위주 스킬 무기, 불 파티클
//   ① 클릭  주작 · 화시 (3단 콤보)
//      1단: 불화살 한 발 → 맞히면 2단
//      2단: 불화살 세 발(부채꼴) → 맞히면 3단
//      2단 화살은 근접 신관: 둘레(아래쪽까지)에 적이 조금이라도 들어오면 그 자리에서 폭발
//      3단: 주작의 활(사용자 그림 점 찍기)이 앞 왼쪽 바닥에 서고 오른쪽 어깨 위 시점으로 시위를 당김 (시선 따라 조준)
//           조준하는 동안 진짜 몸은 바로 위 하늘에, 원래 자리엔 흰 반투명 유령 몸 + 대역(맞으면 진짜 몸이 맞음), 걸을 수는 없고 고개로 조준
//           → 타이밍 게이지가 HP 바처럼 차오름(회색 빗나감 ×0.4 · 금색 좋음 ×1 · 빨강 완벽 ×1.5), 다시 클릭한 순간의 칸으로 세기 결정 (5초 지나면 빗나감)
//           → 그 순간 바라보는 쪽으로 큰 불화살(사용자 그림)이 곧게 날아가 크게 폭발
//      6초 안에 다음 단을 이어 쏘지 않거나 빗나가면 1단으로. 화살 6발: 남아 있으면 6초, 다 쓰면 2초 동안 안 쏘면 자동 장전
// 파티클: gen_jujak.py (jj_bow, jj_bigarrow, jj_ember, jj_trail, jj_boom, jj_ring)
// ═══════════════════════════════════════════════════════════════════════
import { system, world, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
import * as M from "./ms.js";
import { JJ } from "./jujak_meta.js";
import { skillLock } from "./skill_lock.js";

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

const DEF = { n: 10, r: 0.2, spd: 1, tone: 0, size: 1, life: 0.5, cx: 0, cy: 0, scale: 0.03, h: 0, thick: 0.2 };
function pt(dim, name, loc, o = {}) {
  try {
    const m = new MolangVariableMap();
    for (const k of Object.keys(DEF)) m.setFloat(`variable.${k}`, o[k] ?? DEF[k]);
    for (const k of ["u", "v", "w"]) m.setVector3(`variable.${k}`, o[k] ?? { x: 1, y: 0, z: 0 });
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
    // 작은 나선 검기: 두 가닥 불꽃이 화살 길을 감으며 따라감
    { const side = norm(Math.abs(dir.y) > 0.95 ? cross(dir, { x: 1, y: 0, z: 0 }) : cross(dir, UP)), upv = cross(side, dir);
      for (const ph of [0, Math.PI]) {
        let prevQ = null;
        for (let j = 0; j <= 3; j++) {
          const s2 = (t - 1 + j / 3) * speed, ang = s2 * 1.6 + ph;
          const q = add(add(add(pos, dir, (j / 3) * speed), side, Math.cos(ang) * 0.38), upv, Math.sin(ang) * 0.38);
          if (prevQ) trail(dim, prevQ, q, { size: 0.8, life: 0.35, n: 6, tone: ph ? 0.3 : 0.05 });
          prevQ = q;
        }
      } }
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
function drawBow(p, k, withArrow = true, drawBody = true, base = p.location) {
  const dim = p.dimension, v = viewOf(p), yw = yawOf(p), f = fwdOf(yw), right = rightOf(yw);
  // 활 면: 플레이어가 바라보는 방향과 나란히 (활 배 = 앞, 시위 = 플레이어 쪽)
  const u = f;
  const SB = 0.068;
  // 시위 가운데(활 양 끝의 중간)가 플레이어 바로 앞 가운데 줄에 오게 활 위치를 맞춤 → 화살이 정면으로 곧게
  const rel = (ix, iy) => add(scl(u, (ix - BOW.cx) * SB), UP, (BOW.cy - iy) * SB);
  const restRel = scl(add(rel(BOW.top[0], BOW.top[1]), rel(BOW.bot[0], BOW.bot[1])), 0.5);
  const want = add(add(up(base, 1.3), f, 2.6), right, -1.5); // 앞 왼쪽: 오른쪽 어깨 시점을 가리지 않게
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
/** 어깨 위 시점: 오른쪽 어깨 바로 위·조금 뒤에서 시선 방향을 봄 (매 틱 따라가며 조준 그대로) */
function shoulderCam(p, base) {
  const v = viewOf(p), eye = base ? up(base, 1.62) : eyeOf(p), r = rightOf(yawOf(p));
  cam(p, add(add(add(eye, r, 0.6), v, -1.1), UP, 0.3), add(eye, v, 25), 0.06, "Linear");
}
function flashScreen(p, r, g, b, t = 0.3) {
  try { p.camera.fade({ fadeTime: { fadeInTime: 0.04, holdTime: 0.02, fadeOutTime: t }, fadeColor: { red: r, green: g, blue: b } }); } catch {
    try { p.runCommand(`camera @s fade time 0.04 0.02 ${t} color ${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}`); } catch {}
  }
}
const vanilla = (dim, id, at) => { try { dim.spawnParticle(id, at); } catch {} };
// ───────── 3단 조준 중 '유령 몸' 시스템 ─────────
// 진짜 몸은 바로 위 하늘(30칸)에 붙잡아 두고, 원래 자리에는 흰 반투명 유령 몸(파티클) + 보이지 않는 대역(rpg:jj_decoy)
// 대역이 맞으면 그 피해가 진짜 몸으로, 시점·활·발사는 모두 원래 자리 기준
const HOLD = "rpg:jj_hold";
const decoyOwner = new Map(); // decoy id -> player id
function ghost(dim, base, yaw) {
  const f = fwdOf(yaw), r = rightOf(yaw), L = scl(r, -1);
  const box = (c, hu, hv, hw, n) => pt(dim, "jj_ghost", c, { u: hu, v: hv, w: hw, n, life: 0.55 });
  box(up(base, 1.12), scl(r, 0.25), scl(UP, 0.37), scl(f, 0.13), 70);                          // 몸통
  box(up(base, 1.76), scl(r, 0.25), scl(UP, 0.25), scl(f, 0.25), 55);                          // 머리
  for (const s2 of [-1, 1]) box(add(up(base, 0.37), r, s2 * 0.12), scl(r, 0.12), scl(UP, 0.37), scl(f, 0.12), 34); // 다리
  box(add(add(up(base, 1.42), L, 0.36), f, 0.32), scl(r, 0.11), scl(UP, 0.11), scl(f, 0.38), 34);  // 앞으로 뻗은 왼팔
  box(add(add(up(base, 1.46), r, 0.22), f, 0.12), scl(r, 0.11), scl(UP, 0.11), scl(f, 0.26), 28);  // 시위 당긴 오른팔
}
function restoreHold(p) {
  let h = null;
  try { h = JSON.parse(p.getDynamicProperty(HOLD) ?? "null"); } catch {}
  if (!h) return;
  try { p.teleport({ x: h.x, y: h.y, z: h.z }, { rotation: p.getRotation(), keepVelocity: false }); } catch {}
  try { p.setDynamicProperty(HOLD, undefined); } catch {}
  try { p.removeEffect("slowness"); } catch {}
  M.potion(p, "slow_falling", 1, 1);
  if (h.decoy) for (const [id, pid] of decoyOwner) if (id === h.decoy) { decoyOwner.delete(id); try { world.getEntity(id)?.remove(); } catch {} }
}
// 대역이 맞으면 → 진짜 몸이 맞음
world.afterEvents.entityHurt.subscribe(({ hurtEntity, damage, damageSource }) => {
  if (hurtEntity?.typeId !== "rpg:jj_decoy") return;
  const owner = world.getEntity(decoyOwner.get(hurtEntity.id) ?? "");
  try { hurtEntity.getComponent("minecraft:health")?.resetToMaxValue(); } catch {}
  if (!owner?.isValid()) return;
  try { owner.applyDamage(damage, { cause: damageSource.cause, damagingEntity: damageSource.damagingEntity }); } catch {
    try { owner.applyDamage(damage); } catch {}
  }
});
// 다시 접속했거나 스크립트가 다시 시작된 경우: 붙잡혀 있던 몸을 원래 자리로, 주인 없는 대역 정리
world.afterEvents.playerSpawn.subscribe(({ player }) => { if (!aiming.has(player.id)) { restoreHold(player); skillLock.delete(player.id); } });
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    if (!aiming.has(p.id) && p.getDynamicProperty(HOLD)) restoreHold(p);
    // 안전장치: 조준도 아니고 큰 화살도 끝났는데 잠겨 있으면 풂
    if (skillLock.has(p.id) && !aiming.has(p.id) && system.currentTick > (shotLock.get(p.id) ?? 0)) skillLock.delete(p.id);
  }
  for (const dn of ["overworld", "nether", "the_end"]) {
    try { for (const e of world.getDimension(dn).getEntities({ type: "rpg:jj_decoy" })) if (!decoyOwner.has(e.id)) e.remove(); } catch {}
  }
}, 40);

/** 타이밍 게이지 (HP 바처럼 왼쪽부터 참): 0 = 빗나감(회색), 1 = 좋음(금색, 피해 ×1), 2 = 완벽(빨강, 피해 ×1.5)
 *  다 차면 비우고 다시 참. 다시 클릭한 순간 채워진 끝이 놓인 칸으로 결정 */
const GAUGE = [0, 0, ...Array(14).fill(1), ...Array(6).fill(2), ...Array(4).fill(1), 0, 0]; // 28칸
const gaugePos = (t) => t % GAUGE.length; // 1틱마다 한 칸 (다 차는 데 1.4초)
function gaugeText(pos) {
  // 찬 칸·빈 칸 모두 같은 글자(▮)로 크기를 맞추고, 밝기로만 구분 (찬 칸 = 밝게, 빈 칸 = 어둡게)
  const full = ["§f", "§e", "§c"], empty = ["§8", "§6", "§4"];
  return GAUGE.map((z, i) => `${i <= pos ? full[z] : empty[z]}▮`).join("");
}
const aiming = new Map(); // pid -> release(zone) 함수
/** 3단 조준 중 다시 클릭하면 쏨 (skills.js 가 쿨다운 전에 먼저 부름) */
const shotLock = new Map(); // pid -> 이 틱까지 클릭 무시 (발사한 큰 화살이 터질 때까지)
export function releaseAim(p) {
  if (system.currentTick < (shotLock.get(p.id) ?? 0)) return true; // 이미 한 번 눌렀음 → 무시
  const f = aiming.get(p.id); if (!f) return false; f(); return true;
}
function bigShot(ctx, done) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.anim(p, "bow_draw");
  M.potion(p, "slowness", 6, 6);
  M.potion(p, "slow_falling", 1, 6);
  M.potion(p, "resistance", 3, 6);
  M.sound(p, "mob.blaze.breathe", 1, 0.7);
  ember(dim, up(p.location, 0.6), { n: 30, r: 1, spd: 2, life: 1 });
  // 유령 몸 시스템: 진짜 몸은 위 하늘로, 원래 자리에는 유령 몸 + 대역
  const base = { ...p.location }, yaw0 = yawOf(p), sky = up(base, 30);
  let decoy = null;
  try { decoy = dim.spawnEntity("rpg:jj_decoy", base); decoy.setRotation?.({ x: 0, y: yaw0 }); decoyOwner.set(decoy.id, p.id); } catch {}
  try { p.setDynamicProperty(HOLD, JSON.stringify({ x: base.x, y: base.y, z: base.z, decoy: decoy?.id })); } catch {}
  const unhide = () => { restoreHold(p); }; // 스킬 잠금은 큰 화살이 터질 때 풂
  skillLock.add(p.id);
  try { p.teleport(sky, { keepVelocity: false }); } catch {} // 한 번만 옮기고, 이후엔 속도를 0으로 붙잡음 (고개는 자유롭게)
  const MAX = 100; // 5초 안에 안 누르면 빗나감으로 발사
  let t = 0, fired = false;
  const release = () => {
    if (fired || t < 6) return; // 게이지는 한 번만, 처음 0.3초 동안의 터치는 무시 (연타·꾹 누름 방지)
    fired = true;
    shotLock.set(p.id, system.currentTick + 60);
    aiming.delete(p.id);
    const zone = GAUGE[gaugePos(t)];
    shoot(zone);
  };
  aiming.set(p.id, release);
  const loop = () => {
    if (fired || !p.isValid()) { aiming.delete(p.id); unhide(); return; }
    t++;
    const k = ease(Math.min(1, t / 20)), L = base;
    // 진짜 몸은 하늘에 붙잡아 둠: 매 틱 속도를 0으로 (순간이동은 고개 방향까지 되돌려서 쓰지 않음), 멀리 밀렸을 때만 다시 옮김
    try { p.clearVelocity(); } catch { try { p.applyKnockback(0, 0, 0, 0.04); } catch {} }
    try { const pl = p.location; if (Math.abs(pl.y - sky.y) > 1.5 || Math.hypot(pl.x - sky.x, pl.z - sky.z) > 1.5) p.teleport(sky, { keepVelocity: false }); } catch {}
    drawBow(p, k, true, t % 3 === 1, base);
    shoulderCam(p, base);
    if (t % 8 === 1) ghost(dim, base, yawOf(p));
    if (t % 20 === 0) M.anim(p, "bow_hold");
    // 기 모으기 (시야를 가리지 않게 발밑·낮은 곳에서만)
    if (t % 3 === 0) for (let j = 0; j < 2; j++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 1.5, q = { x: L.x + Math.cos(a) * r, y: L.y + 0.15 + Math.random() * 0.6, z: L.z + Math.sin(a) * r };
      pt(dim, "jj_trail", q, { u: norm(sub(up(L, 0.3), q)), r: r * 0.75, n: 9, size: 0.8, life: 0.25, tone: 0.1 });
    }
    if (t % 5 === 0) {
      pt(dim, "jj_ring", up(L, 0.05), { n: 22, r: 2.6 - k * 0.8, spd: 0.25, size: 0.9 + k * 0.5, life: 0.45, tone: 0.15 });
      for (let j = 0; j < 3; j++) { const a = (j / 3) * Math.PI * 2 + t * 0.3; vanilla(dim, "minecraft:basic_flame_particle", { x: L.x + Math.cos(a) * 2, y: L.y + 0.1, z: L.z + Math.sin(a) * 2 }); }
    }
    // 타이밍 게이지 (화면 아래) + 칸이 찰 때마다 점점 높아지는 소리
    const z = GAUGE[gaugePos(t)];
    if (t % 2 === 0) {
      const pos = gaugePos(t), q = pos / (GAUGE.length - 1);
      M.sound(p, "note.pling", 0.35 + q * 0.45, 0.6 + q * 1.4);              // 점점 고조
      if (z === 2 && GAUGE[pos - 2] !== 2) M.sound(p, "note.bell", 0.9, 1.6); // 빨강(완벽) 칸 진입
      if (pos >= GAUGE.length - 2) M.sound(p, "random.fizz", 0.5, 0.6);      // 끝까지 차면 '치익' 하고 다시
      if (pos === 0 && t > 2) M.sound(p, "note.bass", 0.5, 0.6);
    }
    say(p, `${["§7", "§6", "§c§l"][z]}${["빗나감", "좋음 ×1", "완벽 ×1.5"][z]}§r  ${gaugeText(gaugePos(t))}  §7다시 클릭!`);
    if (t === 20) { flashScreen(p, 1, 0.5, 0.12, 0.25); M.sound(p, "mob.blaze.shoot", 0.7, 0.5); }
    if (t % 8 === 0) try { p.runCommand(`camerashake add @s ${(0.03 + k * 0.08).toFixed(2)} 0.25 positional`); } catch {}
    if (t >= MAX) { release(); return; }
    later(1, loop);
  };
  later(1, loop);
  // 발사: zone 에 따라 세기 (2 완벽 / 1 좋음 / 0 빗나감)
  const shoot = (zone) => {
    if (!p.isValid()) { unhide(); skillLock.delete(p.id); return done(); }
    const pow = [0.4, 1, 1.5][zone], big = [0.55, 1, 1.3][zone]; // 피해: 빗나감 0.4 · 좋음 1 · 완벽 1.5
    say(p, ["§7빗나감... 약한 화살", "§6좋음! 큰 불화살", "§c§l완벽!! §r§6주작의 화살"][zone]);
    M.anim(p, "shoot");
    const { nock, v, upv } = drawBow(p, 1, false, false, base);
    unhide(); // 쏘는 순간 진짜 몸이 원래 자리로 돌아옴
    for (let i = 1; i <= 12; i++) later(i, () => shoulderCam(p));
    later(14, () => camClear(p));
    M.sound(p, "random.bow", 1.2, 0.6);
    M.sound(p, "mob.blaze.shoot", 1.2, 0.8);
    if (zone === 2) { flashScreen(p, 1, 0.35, 0.1, 0.3); M.sound(p, "random.levelup", 0.6, 1.6); }
    shake(dim, nock, 0.3 * big, 0.3);
    const SA = (4.5 * (zone === 2 ? 1.2 : 1)) / AR.iw;
    let pos = add(nock, v, 0.5), tt = 0, over = false;
    const fly = () => {
      if (over) return;
      tt++;
      const speed = 2.0;
      pt(dim, "jj_bigarrow", pos, { cx: AR.cx, cy: AR.cy, u: v, v: upv, scale: SA, n: Math.round((AR.filled * 0.8) / AR.fill), life: 0.07, size: 1 });
      trail(dim, add(pos, v, -2.5), add(pos, v, 0.3), { size: 2.4 * big, life: 0.45, n: 44 });
      { const side = norm(cross(v, upv)), seg = 4;
        for (const ph of [0, Math.PI]) {
          let prevQ = null;
          for (let j = 0; j <= seg; j++) {
            const s2 = (tt - 1) * speed + (j / seg) * speed, ang = s2 * 0.9 + ph, rr = 1.3 * big;
            const q = add(add(add(pos, v, -speed + (j / seg) * speed), side, Math.cos(ang) * rr), upv, Math.sin(ang) * rr);
            if (prevQ) trail(dim, prevQ, q, { size: 1.6, life: 0.55, n: 10, tone: ph ? 0.25 : 0 });
            prevQ = q;
          }
        } }
      ember(dim, pos, { n: 6, r: 0.3, spd: 1.2, life: 0.8 });
      if (tt % 2 === 0) fireBoom(dim, add(pos, v, -1), { n: 2, r: 0.3, spd: 0.6, size: 1.4, life: 0.6, tone: 0.2 });
      for (let q = 0; q <= 1.001; q += 0.25) {
        const tip = add(pos, v, 4.5 + speed * q);
        if (enemiesNear(dim, p, tip, 2.2, 1.2).length || solidAt(dim, tip)) { over = true; explode(tip, pow, big); return; }
      }
      if (tt > 40) { over = true; explode(add(pos, v, 4.5), pow, big); return; }
      pos = add(pos, v, speed);
      later(1, fly);
    };
    fly();
  };
  later(MAX + 140, () => camClear(p)); // 안전장치
  const explode = (at, pow, big) => {
    const R = 6.5 * big;
    const near = enemiesNear(dim, p, at, R, 2);
    for (const e of near) { const d = len(sub(center(e), at)); hit(e, (d < 2.5 ? 4.5 : 2.2) * pow, 6); M.toss(at, e, 1.6 * big, 3 * big); }
    try { dim.spawnParticle(big >= 1 ? "minecraft:huge_explosion_emitter" : "minecraft:large_explosion", at); } catch {}
    fireBoom(dim, at, { n: Math.round(34 * big), r: 1.8 * big, spd: 8 * big, size: 3.4 * big, life: 1.1 });
    fireBoom(dim, at, { n: 14, r: 1, spd: 4, size: 2.4 * big, life: 1.3, tone: 0.35 });
    ember(dim, at, { n: Math.round(90 * big), r: 1.2, spd: 9 * big, life: 1.3 });
    for (const [d, spd, tone] of [[0, 8, 0], [3, 12, 0.2], [6, 16, 0.35], [10, 20, 0.5]].slice(0, big >= 1 ? 4 : 2)) later(d + 1, () => pt(dim, "jj_ring", up(at, -0.6), { n: 64, r: 0.5, spd: spd * big, size: 2.2 * big, life: 0.75, tone }));
    if (big >= 1) {
      for (let j = 0; j < 6; j++) later(j, () => {
        const a = (j / 6) * Math.PI * 2, q = { x: at.x + Math.cos(a) * 3 * big, y: at.y - 1, z: at.z + Math.sin(a) * 3 * big };
        pt(dim, "jj_trail", q, { u: UP, r: 5 * big, n: 50, size: 2.2, life: 0.6, tone: 0 });
        ember(dim, up(q, 1), { n: 20, r: 0.5, spd: 5, life: 1, tone: 0 });
      });
      for (let j = 0; j < 12; j++) vanilla(dim, "minecraft:lava_particle", add(at, { x: Math.random() - 0.5, y: 0, z: Math.random() - 0.5 }, 3));
      for (let tt2 = 4; tt2 <= 40; tt2 += 4) later(tt2, () => {
        pt(dim, "jj_ring", up(at, -0.8), { n: 30, r: 4 * big, spd: 0.3, size: 1.4, life: 0.5, tone: 0.2 });
        for (let j = 0; j < 6; j++) { const a = Math.random() * Math.PI * 2; vanilla(dim, "minecraft:basic_flame_particle", { x: at.x + Math.cos(a) * 4 * big, y: at.y - 0.8, z: at.z + Math.sin(a) * 4 * big }); }
      });
      flashScreen(p, 1, 0.55, 0.15, 0.4);
    }
    shake(dim, at, 0.9 * big, 0.7);
    M.sound(p, "random.explode", 1.6 * big, 0.8);
    M.sound(p, "mob.blaze.death", 0.9, 1.3);
    shotLock.set(p.id, system.currentTick + 6);
    skillLock.delete(p.id);
    done();
  };
}

// ───────── 1·2단 연출 (연기 점, 시야를 가리지 않게 몸 뒤·양옆) ─────────
const feather = (dim, root, dir, bend, o = {}) => pt(dim, "jj_feather", root, { u: dir, v: bend, r: o.len ?? 1.6, h: o.h ?? 0.12, thick: o.thick ?? 0.28, n: o.n ?? 60, life: o.life ?? 0.6, size: o.size ?? 1, tone: o.tone ?? 0 });
const ring = (dim, c, u, v, r, o = {}) => pt(dim, "jj_circle", c, { u, v, r, thick: o.thick ?? 0.12, n: o.n ?? Math.round(r * 60), life: o.life ?? 0.6, size: o.size ?? 1, tone: o.tone ?? 0.1 });
/** 1단: 등 뒤로 펼쳐지는 불 날개 (깃털 칼날 세 장씩) */
function fireWings(p) {
  const dim = p.dimension, yw = yawOf(p), f = fwdOf(yw), r = rightOf(yw), base = add(up(p.location, 1.35), f, -0.55);
  for (let step = 0; step < 3; step++) later(step, () => {
    const g = 0.55 + step * 0.22;
    for (const s2 of [-1, 1]) for (const [deg, len] of [[32, 1.9], [8, 1.7], [-18, 1.35]]) {
      const a = rad(deg), dir = norm(add(add(scl(r, s2 * Math.cos(a)), UP, Math.sin(a)), f, -0.35));
      feather(dim, add(base, r, s2 * 0.25), dir, norm(cross(dir, f)), { len: len * g, n: Math.round(45 * g), life: 0.45, tone: 0.05 });
    }
  });
}
/** 2단: 양옆 불 고리(깃털 넷 + 바깥으로 뻗는 줄) + 머리 위 작은 고리. 화살은 왼쪽 고리 · 가운데 · 오른쪽 고리에서 */
function sideArrays(p) {
  const dim = p.dimension, yw = yawOf(p), f = fwdOf(yw), r = rightOf(yw), eye = eyeOf(p);
  const spots = [-1, 1].map((s2) => add(add(up(p.location, 1.45), r, s2 * 2.1), f, -0.3));
  spots.forEach((c, i) => {
    const s2 = i ? 1 : -1;
    ring(dim, c, r, UP, 0.5, { life: 0.7, tone: 0 });
    for (const deg of [45, 135, 225, 315]) {
      const a = rad(deg), dir = norm(add(scl(r, Math.cos(a)), UP, Math.sin(a)));
      feather(dim, add(c, dir, 0.62), dir, norm(cross(dir, f)), { len: 0.55, n: 18, life: 0.6, thick: 0.14, tone: 0.1 });
    }
    trail(dim, c, add(c, r, s2 * 3.2), { size: 1, life: 0.35, n: 26, tone: 0.1 });
    trail(dim, add(c, UP, 0.12), add(add(c, r, s2 * 2.6), UP, 0.5), { size: 0.7, life: 0.3, n: 18, tone: 0.3 });
    ember(dim, c, { n: 10, r: 0.3, spd: 1.5, life: 0.6, tone: 0 });
  });
  ring(dim, add(up(p.location, 2.7), f, -0.3), r, f, 0.55, { life: 0.6, tone: 0 });
  return [spots[0], add(eye, viewOf(p), 1), spots[1]];
}

// ───────── ① 주작 · 화시 (3단 콤보, 6발 장전) ─────────
const AMMO = 6;
const combo = new Map(); // pid -> { stage, until, busy, ammo, reload }
const REFILL_EMPTY = 40, REFILL_PART = 120; // 다 쓰면 2초, 남아 있으면 6초 동안 안 쏘면 다시 채워짐
const refillDelay = (st) => (st.ammo <= 0 ? REFILL_EMPTY : REFILL_PART);
function refill(p, st) {
  if (st.ammo >= AMMO || system.currentTick - st.last < refillDelay(st)) return;
  st.ammo = AMMO;
  say(p, `§6§l장전 완료! §r§f🔥 ${AMMO}/${AMMO}`);
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
  const left = st.ammo < AMMO ? Math.max(0, Math.ceil((refillDelay(st) - (now - st.last)) / 20)) : 0;
  const reloadTxt = st.ammo <= 0 ? `  §c§l장전 중... §r§f${left}s` : st.ammo < AMMO ? `  §7자동 장전까지 §f${left}s` : "";
  return `§6🔥 §f${"|".repeat(st.ammo)}§8${"|".repeat(AMMO - st.ammo)} §f${st.ammo}/${AMMO}` + (stage ? `  §c${stage + 1}단` : "") + reloadTxt;
}
function flameShot(ctx) {
  const { p } = ctx, now = system.currentTick;
  let st = combo.get(p.id);
  if (!st) { st = { stage: 0, until: 0, busy: 0, ammo: AMMO, last: 0 }; combo.set(p.id, st); }
  refill(p, st);
  if (st.ammo <= 0) { say(p, `§7화살이 없습니다 — ${Math.ceil((refillDelay(st) - (now - st.last)) / 20)}초 뒤 자동 장전`); return; }
  if (aiming.has(p.id)) { releaseAim(p); return; } // 3단 조준 중 다시 클릭 = 발사
  if (now < (shotLock.get(p.id) ?? 0)) return;          // 큰 화살이 날아가는 중엔 클릭 무시
  if (now > st.until) st.stage = 0;
  const eye = eyeOf(p), v = viewOf(p), start = add(eye, v, 1);
  const next = (stage, msg) => { st.stage = stage; st.until = system.currentTick + 120; say(p, msg); M.sound(p, "random.orb", 0.6, 0.8 + stage * 0.3); };
  const used = () => { st.ammo--; st.last = system.currentTick; };
  if (st.stage === 0) {
    M.anim(p, "shoot");
    M.sound(p, "random.bow", 1, 1.2);
    used();
    fireWings(p);
    fireArrow(ctx, start, v, { mul: 1, radius: 1.5, onHit: () => next(1, "§6주작 · 화시 §f2단 §7— 불화살 세 발!"), onMiss: () => { st.stage = 0; } });
  } else if (st.stage === 1) {
    M.anim(p, "shoot");
    M.sound(p, "random.bow", 1, 1);
    used();
    let hitAny = false, left = 3;
    const fin = () => { if (--left === 0 && !hitAny) st.stage = 0; };
    const yaw0 = yawOf(p), horiz = Math.hypot(v.x, v.z);
    const origins = sideArrays(p);
    [-11, 0, 11].forEach((deg, i) => {
      const f = fwdOf(yaw0 + deg), d = norm({ x: f.x * horiz, y: v.y, z: f.z * horiz });
      // 근접 신관: 화살 둘레(아래쪽까지)에 조금이라도 들어오면 그 자리에서 폭발
      fireArrow(ctx, origins[i], d, { mul: 0.9, prox: 2.4, boom: 3, onHit: () => { if (!hitAny) { hitAny = true; next(2, "§6주작 · 화시 §c3단 §7— 주작의 활!"); } fin(); }, onMiss: fin });
    });
  } else {
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
    try { p.onScreenDisplay.setActionBar(`§6§l주작 · 화시§r  ${ammoLine(p)}`); } catch {}
  }
}, 5);

// ───────── ② 주작 · 연사 (쉬프트+클릭) ─────────
// 뒤로 물러서며 등에 3D 불 날개 → 등 뒤 양옆 활 6개가 목표를 향해 세 번 일제 사격 → 날개가 하늘로 솟아 흩어지며 깃털 하나하나가 불화살 비가 됨
/** 3D 불 날개 깃털 목록 (새 날개 구조): 어깨 → 팔꿈치 → 손목 뼈대를 따라
 *  칼깃(손목에서 바깥·아래로 긴 깃) · 둘째깃(팔을 따라 아래·뒤로) · 덮깃(팔 위 짧은 깃), 모두 살짝 뒤로 젖혀 입체감
 *  flap = 날갯짓(라디안, 어깨를 축으로 위아래), open = 펼침 정도 */
function wingFeathers(base, yaw, flap = 0, open = 1, k = 1) {
  const f = fwdOf(yaw), r = rightOf(yaw), out = [];
  for (const s2 of [-1, 1]) {
    const rr = scl(r, s2);
    // 날갯짓: (바깥, 위) 평면에서 어깨를 축으로 회전
    const rot = (v) => { const x = v.x * rr.x + v.z * rr.z, y = v.y, fb = v.x * f.x + v.z * f.z, c = Math.cos(flap), sn = Math.sin(flap);
      const nx = x * c - y * sn, ny = x * sn + y * c; return add(add(scl(rr, nx), UP, ny), f, fb); };
    const S0 = add(base, rr, 0.2 * k);
    const E = add(S0, rot(add(add(scl(rr, 0.9 * open), UP, 0.55), f, -0.1)), k);
    const W = add(E, rot(add(add(scl(rr, 0.95 * open), UP, 0.12), f, -0.18)), k);
    const push = (root, d, l, tone) => { const dir = norm(rot(d)), L2 = l === len(sub(E, S0)) || l === len(sub(W, E)) ? l : l * k; out.push({ root, dir, bend: norm(cross(dir, f)), len: L2, tone, tip: add(root, dir, L2) }); };
    // 뼈대(굵은 앞깃)
    push(S0, sub(E, S0), len(sub(E, S0)), 0.05);
    push(E, sub(W, E), len(sub(W, E)), 0.05);
    // 칼깃 5: 손목에서 바깥 → 아래로 펼쳐짐
    for (let i = 0; i < 5; i++) {
      const q = i / 4, a = rad(12 - q * 62);
      push(add(W, rr, -q * 0.35 * k), add(add(scl(rr, Math.cos(a)), UP, Math.sin(a)), f, -0.45), (2.5 - q * 0.6) * (0.7 + open * 0.3), 0.15);
    }
    // 둘째깃 5: 팔을 따라 아래·뒤로
    for (let i = 0; i < 5; i++) {
      const q = 0.12 + (i / 4) * 0.8, root = q < 0.5 ? add(S0, sub(E, S0), q * 2) : add(E, sub(W, E), (q - 0.5) * 2), a = rad(-62 + q * 22);
      push(root, add(add(scl(rr, Math.cos(a) * 0.55), UP, Math.sin(a)), f, -0.4), 1.5 - q * 0.2, 0.1);
    }
    // 덮깃 4: 팔 위 짧은 깃
    for (let i = 0; i < 4; i++) {
      const q = 0.15 + i * 0.25, root = q < 0.5 ? add(S0, sub(E, S0), q * 2) : add(E, sub(W, E), (q - 0.5) * 2);
      push(add(root, UP, 0.05), add(add(scl(rr, 0.7), UP, -0.45), f, -0.3), 0.75, 0);
    }
  }
  return out;
}
function drawWings(dim, list, life = 0.16, size = 1) {
  for (const w of list) feather(dim, w.root, w.dir, w.bend, { len: w.len, n: Math.round(w.len * 18), life, size, tone: w.tone, h: 0.1, thick: 0.26 });
}
function rapidFire(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.potion(p, "resistance", 3, 4);
  const yw0 = yawOf(p), f0 = fwdOf(yw0);
  M.anim(p, "dash");
  try { p.applyKnockback(-f0.x, -f0.z, 2.2, 0.5); } catch {} // 뒤로 크게 밀려남
  M.sound(p, "mob.blaze.breathe", 0.8, 1.3);
  M.sound(p, "mob.enderdragon.flap", 0.8, 1.4);
  ember(dim, up(p.location, 0.3), { n: 20, r: 0.6, spd: 2, life: 0.8 });
  let impact = null;
  const back = () => add(up(p.location, 1.4), fwdOf(yawOf(p)), -0.35);
  // 0~30: 등에 붙은 3D 불 날개 (펼쳐지며 천천히 날갯짓)
  for (let t = 0; t <= 30; t += 2) later(t + 1, () => {
    const open = Math.min(1, 0.35 + t / 8);
    drawWings(dim, wingFeathers(back(), yawOf(p), Math.sin(t * 0.35) * 0.18, open));
    if (t % 6 === 0) ember(dim, back(), { n: 6, r: 0.8, spd: 1, life: 0.6, tone: 0.1 });
    if (t % 10 === 0) M.sound(p, "mob.enderdragon.flap", 0.5, 1.6);
  });
  // 4~24: 등 뒤 양옆에 활 6개가 펼쳐져 목표를 겨눔 → 세 번 한꺼번에 일제 사격
  const tgt0 = (() => { try { const h = p.getEntitiesFromViewDirection({ maxDistance: 40 }).map((x) => x.entity).find((e) => e?.isValid() && e.id !== p.id); if (h) return h; } catch {} return null; })();
  const aimPoint = () => (tgt0?.isValid() ? center(tgt0) : add(eyeOf(p), viewOf(p), 22));
  const bowSpots = () => {
    const L = p.location, yw = yawOf(p), f = fwdOf(yw), r = rightOf(yw), out = [];
    for (const s2 of [-1, 1]) for (const [side, h, bk] of [[1.7, 1.1, 1.3], [2.8, 2.1, 1.7], [1.5, 3.0, 1.1]]) out.push(add(add(add(L, r, s2 * side), UP, h), f, -bk));
    return out;
  };
  const SBs = 0.03;
  const drawSideBow = (H, aim, k) => {
    const u = aim, v0 = norm(cross(cross(aim, UP), aim));
    const vv = len(v0) > 0.1 ? v0 : UP; // 그림 위쪽 = 하늘 쪽
    const toW = (ix, iy) => add(add(H, u, (ix - BOW.cx) * SBs), vv, (BOW.cy - iy) * SBs);
    const tipT = toW(BOW.top[0], BOW.top[1]), tipB = toW(BOW.bot[0], BOW.bot[1]);
    const nock = add(scl(add(tipT, tipB), 0.5), aim, -0.7 * k);
    return { tipT, tipB, nock, u, vv };
  };
  for (let t = 4; t <= 26; t += 2) later(t, () => {
    const ap = aimPoint(), k = ((t - 4) % 6) / 5; // 쏠 때마다 시위를 다시 당김
    bowSpots().forEach((H, i) => {
      const aim = norm(sub(ap, H)), b = drawSideBow(H, aim, k);
      if (t % 4 === 0) pt(dim, "jj_bow", H, { cx: BOW.cx, cy: BOW.cy, u: b.u, v: b.vv, scale: SBs, n: 1400, life: 0.3, size: 1.2 });
      trail(dim, b.tipT, b.nock, { size: 0.7, life: 0.12, n: 12, tone: 0.3 });
      trail(dim, b.tipB, b.nock, { size: 0.7, life: 0.12, n: 12, tone: 0.3 });
      if (t === 4) ember(dim, H, { n: 12, r: 0.5, spd: 1.5, life: 0.6, tone: 0 });
    });
    if (t === 4) M.sound(p, "mob.blaze.shoot", 0.8, 1.4);
  });
  for (const t of [10, 16, 22]) later(t, () => { // 일제 사격
    M.anim(p, "shoot");
    const ap = aimPoint();
    bowSpots().forEach((H) => {
      const aim = norm(sub(ap, H)), b = drawSideBow(H, aim, 1);
      fireArrow(ctx, add(b.nock, aim, 0.4), aim, { mul: 0.45, radius: 1.5, speed: 2.6, onHit: (e) => { impact = { ...e.location }; } });
      ember(dim, b.nock, { n: 4, r: 0.15, spd: 1.5, life: 0.4, tone: 0 });
    });
    M.sound(p, "random.bow", 1.2, 1.1);
    M.sound(p, "mob.blaze.shoot", 0.6, 1.3);
  });
  // 32~44: 날개가 크게 펼쳐지며 하늘로 솟음 → 44: 흩어짐, 깃털 하나하나가 불화살이 되어 떨어짐
  const base0 = { v: null };
  for (let t = 32; t <= 44; t += 2) later(t, () => {
    if (!base0.v) base0.v = { b: back(), yaw: yawOf(p) };
    const e = (t - 32) / 12, b = add(base0.v.b, UP, e * e * 9);
    drawWings(dim, wingFeathers(b, base0.v.yaw, -0.25 + e * 0.5, 1 + e * 0.4), 0.18, 1 + e * 0.4);
    ember(dim, b, { n: 10, r: 1.2, spd: 1.5, life: 0.7, tone: 0 });
    if (t === 32) { M.sound(p, "mob.enderdragon.flap", 1.2, 0.9); M.sound(p, "mob.blaze.shoot", 1, 0.6); }
  });
  later(46, () => {
    const L = p.location, v = viewOf(p);
    const c = impact ?? add(L, { x: v.x, y: 0, z: v.z }, 10);
    const b = add(base0.v?.b ?? back(), UP, 9);
    const feathers = wingFeathers(b, base0.v?.yaw ?? yawOf(p), 0.25, 1.4);
    M.sound(p, "random.explode", 0.7, 1.4);
    ring(dim, up(c, 0.1), { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 4.5, { life: 1.8, tone: 0.2, n: 200 });
    feathers.forEach((w, i) => later(Math.floor(i * 0.8), () => {
      // 깃털이 흩어지는 자리에서 불티가 터지고, 그 깃털이 불화살이 되어 목표로
      fireBoom(dim, w.tip, { n: 2, r: 0.3, spd: 1, size: 1, life: 0.5 });
      ember(dim, w.tip, { n: 6, r: 0.3, spd: 2, life: 0.6, tone: 0 });
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 4.2;
      const land = { x: c.x + Math.cos(a) * rr, y: c.y, z: c.z + Math.sin(a) * rr };
      const d = norm(sub(land, w.tip)), dist = len(sub(land, w.tip));
      let pos = w.tip, k = 0;
      const step = Math.max(2.2, dist / 7);
      const fall = () => {
        k++;
        const next = add(pos, d, step);
        trail(dim, pos, next, { size: 1.3, life: 0.28, n: 18 });
        pos = next;
        if (len(sub(pos, w.tip)) >= dist - 0.2 || k > 10) {
          fireBoom(dim, up(land, 0.3), { n: 5, r: 0.3, spd: 2.5, size: 1.3 });
          ember(dim, up(land, 0.3), { n: 10, r: 0.3, spd: 3, life: 0.7 });
          for (const e of enemiesNear(dim, p, up(land, 0.5), 2, 1)) hit(e, 0.5, 3);
          if (i % 4 === 0) M.sound(p, "random.explode", 0.4, 1.5);
          return;
        }
        later(1, fall);
      };
      fall();
    }));
    later(30, () => { // 마지막 큰 불 폭발
      fireBoom(dim, up(c, 0.5), { n: 18, r: 1.4, spd: 5, size: 2.4 });
      pt(dim, "jj_ring", c, { n: 50, r: 0.5, spd: 12, size: 1.8, life: 0.6, tone: 0.1 });
      for (const e of enemiesNear(dim, p, up(c, 0.5), 5, 1.5)) hit(e, 1.2, 4);
      shake(dim, c, 0.5, 0.4);
      M.sound(p, "random.explode", 1, 0.9);
    });
  });
}

// ───────── ③ 주작 · 비상 (쉬프트+점프) ─────────
// 뒤로 크게 도약 → 공중에 멈춤(시선 자유) → 등의 불 날개를 크게 세 번 퍼덕여 앞쪽에 불비 → 주위에 불화살 셋 + 날개 앞 거대한 활 소환
//   → 시위에 건 주작을 당겨 쏨: 곁 화살 발사 + 주작이 크게 날갯짓하며 천천히 출렁이며 조준 지점으로 날아가 큰 폭발
/** 주작(불새): 몸통 깃털 · 머리(고리 + 부리 + 볏) · 크게 날갯짓하는 날개 · 물결치는 긴 꼬리깃 */
function phoenix(dim, c, yaw, t, k = 1.4, life = 0.16) {
  // t = 날갯짓 위상(라디안). 진짜 새처럼: 내려칠 땐 빠르고 활짝(힘), 올릴 땐 느리고 반쯤 접음(바람 덜 받게)
  //   위상을 비틀어 내려치기 40% · 올리기 60% 시간 → 몸은 내려칠 때 떠오르고 올릴 때 살짝 가라앉음
  const ph = t + 0.35 * Math.sin(t), cs = Math.cos(ph);
  const flap = Math.sin(ph) * 0.8 + 0.1, open = 1.0 + cs * -0.35 + 0.15; // 올리는 중(cos>0) 접힘 0.8, 내려치는 중 1.5
  const f = fwdOf(yaw), r = rightOf(yaw);
  const bob = up(c, -Math.sin(ph - 0.9) * 0.3 * k / 1.4);
  const N = (x) => Math.max(4, Math.round(x));
  for (const [dy, side] of [[0.25, 0], [0, 0.22], [0, -0.22], [-0.2, 0]]) // 몸통
    feather(dim, add(add(add(bob, f, 1.3 * k), UP, dy), r, side), scl(f, -1), UP, { len: 2.8 * k, h: 0.06, thick: 0.45, n: N(40), life, tone: 0.05 });
  // 머리: 날갯짓 반대로 살짝 끄덕 + 좌우로 천천히 둘러봄
  const nod = Math.sin(ph + 2.2) * 0.12 * k, look = Math.sin(t * 0.21) * 0.12 * k;
  const head = add(add(add(bob, f, 1.65 * k), UP, 0.45 * k + nod), r, look);
  ring(dim, head, f, UP, 0.32 * k, { life, tone: 0, n: 22 });
  trail(dim, add(head, f, 0.3 * k), add(add(head, f, 0.85 * k), UP, -0.12), { size: 0.9, life, n: 8, tone: 0.25 }); // 부리
  for (const a of [70, 95, 120]) { const d = norm(add(scl(f, Math.cos(rad(a))), UP, Math.sin(rad(a)))); feather(dim, add(head, UP, 0.2 * k), norm(add(d, f, -0.6 - Math.abs(nod))), f, { len: 0.9 * k, n: 12, life, tone: 0 }); } // 볏 (바람에 젖혀짐)
  ember(dim, add(add(head, f, 0.15), r, 0.2), { n: 1, r: 0, spd: 0, life: 0.12, tone: -0.3 });
  drawWings(dim, wingFeathers(up(bob, 0.35), yaw, flap, open, k * 1.25), life, 1.1);
  // 긴 꼬리깃: 몸 출렁임보다 늦게 따라오는 물결 (뿌리 → 끝으로 위상 지연)
  for (let i = -2; i <= 2; i++) {
    const wave = Math.sin(ph - 1.6 - Math.abs(i) * 0.5) * 0.22 + Math.sin(t * 0.3 + i) * 0.08;
    const d = norm(add(add(scl(f, -1), r, i * 0.22 + Math.sin(t * 0.17) * 0.08), UP, wave - 0.1));
    feather(dim, add(bob, f, -1.4 * k), d, norm(cross(d, f)), { len: (3.4 - Math.abs(i) * 0.4) * k, h: 0.15, n: N(32), life, tone: 0.15 });
  }
}
function soar(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.potion(p, "resistance", 5, 4.5);
  M.potion(p, "fire_resistance", 1, 6);
  skillLock.add(p.id);
  const f0 = fwdOf(yawOf(p));
  M.anim(p, "dash");
  try { p.applyKnockback(-f0.x, -f0.z, 2.0, 1.05); } catch {} // 뒤로 크게 도약
  M.sound(p, "mob.enderdragon.flap", 1.2, 1.1);
  ember(dim, up(p.location, 0.2), { n: 30, r: 0.8, spd: 3, life: 0.8 });
  const back = () => add(up(p.location, 1.4), fwdOf(yawOf(p)), -0.35);
  let hold = null;
  // 1~48: 날개, 8부터 공중에 멈춤 (몸은 고정, 시선은 자유)
  for (let t = 1; t <= 48; t++) later(t, () => {
    if (t >= 8) {
      if (!hold) hold = { ...p.location };
      try { p.applyKnockback(0, 0, 0, 0.03); } catch {}
      try { const pl = p.location; if (Math.hypot(pl.x - hold.x, pl.y - hold.y, pl.z - hold.z) > 1.2) p.teleport(hold, { keepVelocity: false }); } catch {}
    }
    if (t % 2 === 0) {
      const flap = t < 10 ? Math.sin(t * 0.35) * 0.2 : Math.sin((t - 10) * 0.39) * 0.75; // 멈춘 뒤엔 크게 퍼덕임
      drawWings(dim, wingFeathers(back(), yawOf(p), flap, 1.2, 1.25), 0.16, 1.1);
    }
  });
  // 크게 세 번 퍼덕일 때마다 앞쪽에 불비
  for (const t of [14, 22, 30]) later(t, () => {
    const L = p.location, v = viewOf(p), c = add({ x: L.x, y: L.y, z: L.z }, { x: v.x, y: 0, z: v.z }, 11);
    let gy = L.y; try { const top = dim.getTopmostBlock({ x: Math.floor(c.x), z: Math.floor(c.z) }); if (top) gy = top.location.y + 1; } catch {}
    M.sound(p, "mob.enderdragon.flap", 1.4, 0.8);
    shake(dim, L, 0.25, 0.25);
    for (let i = 0; i < 10; i++) later(i % 5, () => {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 5;
      const land = { x: c.x + Math.cos(a) * rr, y: gy, z: c.z + Math.sin(a) * rr };
      const from = add(back(), { x: (Math.random() - 0.5) * 4, y: 1 + Math.random() * 2, z: (Math.random() - 0.5) * 4 });
      const d = norm(sub(land, from)), dist = len(sub(land, from));
      let pos = from, k = 0;
      const fall = () => {
        k++;
        const next = add(pos, d, Math.max(2, dist / 6));
        trail(dim, pos, next, { size: 1.2, life: 0.3, n: 14 });
        pos = next;
        if (len(sub(pos, from)) >= dist - 0.2 || k > 9) {
          fireBoom(dim, up(land, 0.3), { n: 4, r: 0.3, spd: 2.5, size: 1.3 });
          ember(dim, up(land, 0.3), { n: 8, r: 0.3, spd: 3, life: 0.7 });
          for (const e of enemiesNear(dim, p, up(land, 0.5), 2.2, 1)) hit(e, 0.45, 3);
          return;
        }
        later(1, fall);
      };
      fall();
    });
  });
  // 32~46: 주위에 불화살 셋 + 날개 앞에 거대한 활 소환 → 시위에 주작을 걸고 조준 지점을 겨눠 당김
  // 조준한 적: 시선에 걸린 적, 없으면 시선 방향 좁은 원뿔(약 10도) 안에서 가장 가까운 적 → 한 번 잡으면 기억
  let lockOn = null;
  const findAim = () => {
    try { const h = p.getEntitiesFromViewDirection({ maxDistance: 60 }).map((x) => x.entity).find((e) => e?.isValid() && e.id !== p.id); if (h) return h; } catch {}
    try {
      const eye = eyeOf(p), v = viewOf(p);
      let best = null, bd = 1e9;
      for (const e of M.around(dim, add(eye, v, 30), 31)) {
        if (e.id === p.id || !e.isValid()) continue;
        const d = sub(center(e), eye), L = len(d);
        if (L < 2 || L > 60 || (d.x * v.x + d.y * v.y + d.z * v.z) / L < 0.985) continue;
        if (L < bd) { bd = L; best = e; }
      }
      return best;
    } catch { return null; }
  };
  const aimAt = () => {
    const h = findAim();
    if (h) lockOn = h;
    if (lockOn && !lockOn.isValid()) lockOn = null;
    if (lockOn) return center(lockOn);
    try { const bh = p.getBlockFromViewDirection({ maxDistance: 45 }); if (bh) return add(bh.block.location, { x: 0.5, y: 1, z: 0.5 }); } catch {}
    return add(eyeOf(p), viewOf(p), 30);
  };
  const SAm = 2.6 / AR.iw, SBg = 0.15; // 곁 화살 2.6블록, 거대한 활 길이 약 11블록
  const yawTo = (d) => (Math.atan2(-d.x, d.z) * 180) / Math.PI;
  let ground = null; // 활을 눕힐 땅 높이 (처음 한 번 정함)
  const giant = (k) => {
    const eye = eyeOf(p), tgt = aimAt(), d = norm(sub(tgt, eye));
    const side = norm(len(cross(d, UP)) > 0.1 ? cross(d, UP) : rightOf(yawOf(p))), upv = norm(cross(side, d));
    const around = [90, 210, 330].map((deg) => add(add(eye, side, Math.cos(rad(deg)) * 1.7), upv, Math.sin(rad(deg)) * 1.7));
    // 거대한 활: 플레이어 앞 땅바닥에 눕혀 놓음 (활 배 = 조준 방향(수평), 활 위아래 끝 = 좌우)
    const dh = norm({ x: d.x, y: 0, z: d.z }), sh = norm(cross(dh, UP));
    if (ground == null) {
      ground = p.location.y - 3;
      try { const L = p.location, top = dim.getTopmostBlock({ x: Math.floor(L.x + dh.x * 5), z: Math.floor(L.z + dh.z * 5) }); if (top && top.location.y < L.y + 2) ground = top.location.y + 1.15; } catch {}
    }
    const H = { x: p.location.x + dh.x * 5.5, y: ground, z: p.location.z + dh.z * 5.5 };
    const rel = (ix, iy) => add(scl(dh, (ix - BOW.cx) * SBg), sh, (BOW.cy - iy) * SBg);
    const tipT = add(H, rel(BOW.top[0], BOW.top[1])), tipB = add(H, rel(BOW.bot[0], BOW.bot[1]));
    const nock = add(scl(add(tipT, tipB), 0.5), dh, -4.2 * k);
    return { tgt, d, dh, sh, upv, around, H, tipT, tipB, nock };
  };
  for (let t = 32; t <= 46; t += 2) later(t, () => {
    const k = ease((t - 32) / 14), G = giant(k);
    for (const q of G.around) {
      pt(dim, "jj_bigarrow", q, { cx: AR.cx, cy: AR.cy, u: G.d, v: G.upv, scale: SAm, n: 700, life: 0.16, size: 1 });
      ember(dim, add(q, G.d, 2.2), { n: 2, r: 0.1, spd: 0.6, life: 0.4, tone: 0 });
    }
    if (t % 4 === 0) pt(dim, "jj_bow", G.H, { cx: BOW.cx, cy: BOW.cy, u: G.dh, v: G.sh, scale: SBg, n: Math.round(BOW.filled / BOW.fill), life: 0.3, size: 2 });
    if (t === 32) for (let j = 0; j < 8; j++) { const a = (j / 8) * Math.PI * 2; ember(dim, add(G.H, { x: Math.cos(a) * 5, y: 0.2, z: Math.sin(a) * 5 }), { n: 6, r: 0.5, spd: 1.5, life: 0.8, tone: 0 }); }
    trail(dim, G.tipT, G.nock, { size: 2.2, life: 0.16, n: 60, tone: 0.3 });
    trail(dim, G.tipB, G.nock, { size: 2.2, life: 0.16, n: 60, tone: 0.3 });
    phoenix(dim, up(add(G.nock, G.dh, 1.5), 0.8), yawTo(G.dh), t * 0.5, 0.7 + k * 0.6); // 땅에 눕힌 활 시위에 걸린 주작이 점점 커짐
    if (t % 4 === 0) M.sound(p, "note.pling", 0.6 + k * 0.4, 0.6 + k * 1.2);
    if (t === 32) { M.sound(p, "mob.blaze.shoot", 1.3, 0.6); flashScreen(p, 1, 0.55, 0.15, 0.25); ember(dim, G.H, { n: 40, r: 2, spd: 2, life: 0.8, tone: 0 }); }
  });
  // 47: 곁 화살 셋 발사 + 시위를 놓으면 주작이 날아감 (천천히, 출렁이며, 크게)
  later(47, () => {
    const G = giant(1);
    for (const q of G.around) fireArrow(ctx, q, norm(sub(G.tgt, q)), { mul: 0.8, radius: 1.6, speed: 2.8 });
    M.sound(p, "random.bow", 1.5, 0.5);
    M.sound(p, "mob.enderdragon.growl", 0.9, 1.6);
    flashScreen(p, 1, 0.5, 0.1, 0.3);
    trail(dim, G.tipT, scl(add(G.tipT, G.tipB), 0.5), { size: 2, life: 0.3, n: 50, tone: 0.2 });
    trail(dim, G.tipB, scl(add(G.tipT, G.tipB), 0.5), { size: 2, life: 0.3, n: 50, tone: 0.2 });
    fireBoom(dim, G.nock, { n: 14, r: 1, spd: 4, size: 2 });
    // 조준한 적이 있으면: 크게 솟구쳐 호를 그리며 날다가 점점 그 적을 쫓아가(유도) 들이받고 폭발 → 맞은 적에게 큰 피해
    // 없으면: 조준 방향으로 오래(약 5초, 사거리 약 65칸) 날아가 마지막에 땅으로 내리꽂힘
    const start = up(add(G.nock, G.dh, 1.5), 0.8), side = G.sh;
    const target = lockOn && lockOn.isValid() ? lockOn : null;
    let t2 = 0, prev = start, yawF = yawTo(G.dh);
    const angLerp = (a2, b2, k2) => a2 + ((((b2 - a2) % 360) + 540) % 360 - 180) * k2;
    const fx = (pos) => {
      const dir = norm(sub(pos, prev));
      yawF = angLerp(yawF, yawTo(len(dir) > 0.01 ? dir : G.d), 0.25); // 몸 방향도 부드럽게 돌림
      phoenix(dim, pos, yawF, t2 * 0.32, 1.9, 0.07); // 매 틱 그림 + 작은 위상 → 끊김 없는 날갯짓
      trail(dim, prev, pos, { size: 2.6, life: 0.9, n: 24 });
      if (t2 % 2 === 0) ember(dim, pos, { n: 12, r: 1.4, spd: 1.2, life: 1 });
      if (t2 % 6 === 0) { fireBoom(dim, pos, { n: 4, r: 0.8, spd: 1.5, size: 1.8, tone: 0.1 }); for (const e2 of enemiesNear(dim, p, pos, 3.4, 1.5)) hit(e2, 0.7, 4); }
      // 화려하게: 지나간 자리에 남는 잔불 폭발 · 불 고리 · 깃털 불티 · 가끔 터지는 폭죽 같은 폭발
      if (t2 % 3 === 1) fireBoom(dim, prev, { n: 3, r: 0.6, spd: 0.6, size: 2.2, life: 1.4, tone: 0.2 });
      if (t2 % 10 === 5) { pt(dim, "jj_ring", pos, { n: 40, r: 0.6, spd: 9, size: 1.8, life: 0.5, tone: 0.15 }); M.sound(p, "firework.blast", 0.6, 0.8); }
      if (t2 % 4 === 2) ember(dim, add(pos, { x: (Math.random() - 0.5) * 4, y: Math.random() * 2, z: (Math.random() - 0.5) * 4 }), { n: 10, r: 0.3, spd: 3.5, life: 1.2, tone: 0.35 });
      if (t2 % 14 === 7) { const q2 = add(prev, { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 5 }); later(3, () => { try { dim.spawnParticle("minecraft:large_explosion", q2); } catch {} fireBoom(dim, q2, { n: 10, r: 0.6, spd: 4, size: 2 }); ember(dim, q2, { n: 20, r: 0.4, spd: 6, life: 0.9 }); M.sound(p, "firework.large_blast", 0.8, 1); }); }
      if (t2 % 20 === 4) M.sound(p, "mob.enderdragon.flap", 0.9, 1.2);
      prev = pos;
    };
    if (target) {
      // 유도 비행: 속도 0.75칸/틱, 처음엔 위·옆으로 크게 돌다가 회전력이 점점 세져 적에게 꽂힘
      let pos = start, vel = scl(norm(add(add(G.dh, UP, 0.9), side, 0.5)), 0.75);
      const fly = () => {
        t2++;
        const goal = target.isValid() ? center(target) : prev;
        const to = sub(goal, pos), dist = len(to);
        if (dist < 1.8 || t2 > 120) { // 명중
          if (target.isValid()) { hit(target, 2.4, 6); M.toss(pos, target, 1.6, 3); }
          finish(goal); return;
        }
        const turn = t2 < 20 ? 0.03 : Math.min(0.35, 0.05 + (t2 - 20) * 0.012); // 점점 정확하게
        const want = scl(norm(to), 0.75 + Math.min(0.35, t2 * 0.006));
        vel = add(vel, sub(want, vel), turn);
        pos = add(pos, vel);
        fx(pos);
        if (t2 === 30) M.sound(p, "mob.enderdragon.growl", 1, 1.5);
        later(1, fly);
      };
      fly();
      return;
    }
    const T = 100, RANGE = 65;
    const dir3 = norm(add(G.dh, UP, Math.max(-0.25, Math.min(0.3, G.d.y))));
    const endAir = add(start, dir3, RANGE);
    let groundY = endAir.y - 4;
    try { const top = dim.getTopmostBlock({ x: Math.floor(endAir.x), z: Math.floor(endAir.z) }); if (top) groundY = top.location.y + 1; } catch {}
    const goal = { x: endAir.x, y: groundY, z: endAir.z };
    const DIVE = 0.8; // 마지막 20% 동안 내리꽂힘
    const fly = () => {
      t2++;
      const q = t2 / T;
      const w = q < DIVE ? 0 : ease((q - DIVE) / (1 - DIVE));
      const cruise = add(start, dir3, RANGE * q);
      const lift = 4 * ease(Math.min(1, q / 0.15)) + Math.sin(q * Math.PI * 6) * 0.6;
      const wob = Math.sin(q * Math.PI * 4) * 1.8;
      let pos = add(add(cruise, side, wob * (1 - w)), UP, lift * (1 - w));
      pos = { x: pos.x, y: pos.y + (goal.y - pos.y) * w, z: pos.z };
      fx(pos);
      if (t2 === Math.round(T * DIVE)) M.sound(p, "mob.enderdragon.growl", 1, 1.5);
      if (t2 >= T) { finish(goal); return; }
      later(1, fly);
    };
    fly();
  });
  // 공중 정지 풀기 (주작이 날아간 뒤)
  later(49, () => { M.potion(p, "slow_falling", 1, 2); skillLock.delete(p.id); }); // 주작이 날아가는 동안엔 다른 스킬 사용 가능
  const finish = (L) => {
    // 1) 중심 대폭발 + 화면 번쩍
    try { dim.spawnParticle("minecraft:huge_explosion_emitter", L); } catch {}
    fireBoom(dim, L, { n: 40, r: 2, spd: 9, size: 3.6, life: 1.3 });
    ember(dim, L, { n: 120, r: 1, spd: 11, life: 1.4 });
    flashScreen(p, 1, 0.6, 0.15, 0.5);
    shake(dim, L, 1.1, 0.9);
    M.sound(p, "random.explode", 1.8, 0.7);
    M.sound(p, "mob.enderdragon.growl", 1.2, 1.4);
    M.sound(p, "firework.large_blast", 1.5, 0.6);
    for (const e of enemiesNear(dim, p, L, 6.5, 2)) { hit(e, 2.6, 6); M.toss(L, e, 1.8, 3); }
    // 2) 불 고리 5겹이 땅을 타고 번짐
    for (const [d, spd, tone] of [[0, 8, 0], [3, 13, 0.2], [6, 18, 0.4], [10, 24, 0.1], [14, 30, 0.3]]) later(d, () => pt(dim, "jj_ring", up(L, -0.6), { n: 70, r: 0.5, spd, size: 2.4, life: 0.8, tone }));
    // 3) 둘레에 불기둥 8개가 차례로 솟음
    for (let j = 0; j < 8; j++) later(2 + j, () => {
      const a = (j / 8) * Math.PI * 2, q = { x: L.x + Math.cos(a) * 4.5, y: L.y - 1, z: L.z + Math.sin(a) * 4.5 };
      pt(dim, "jj_trail", q, { u: UP, r: 9, n: 60, size: 2.4, life: 0.8, tone: 0 });
      fireBoom(dim, up(q, 1), { n: 8, r: 0.5, spd: 3, size: 2 });
      for (const e of enemiesNear(dim, p, q, 2, 1)) hit(e, 0.8, 4);
    });
    // 4) 깃털이 사방으로 터져 나가 꽃처럼 퍼짐
    for (let j = 0; j < 16; j++) {
      const a = (j / 16) * Math.PI * 2, d = norm({ x: Math.cos(a), y: 0.35 + (j % 2) * 0.3, z: Math.sin(a) });
      feather(dim, up(L, 0.5), d, UP, { len: 3.4, n: 30, life: 0.7, tone: 0.1, size: 1.3 });
    }
    // 5) 연쇄 폭발: 바깥 두 바퀴 (폭죽처럼 하나씩)
    for (let j = 0; j < 10; j++) later(6 + j * 2, () => {
      const a = (j / 10) * Math.PI * 2 + (j % 2) * 0.3, r = j % 2 ? 7 : 5;
      const q = { x: L.x + Math.cos(a) * r, y: L.y + 0.5, z: L.z + Math.sin(a) * r };
      try { dim.spawnParticle("minecraft:large_explosion", q); } catch {}
      fireBoom(dim, q, { n: 12, r: 0.8, spd: 5, size: 2.4 });
      ember(dim, q, { n: 24, r: 0.4, spd: 7, life: 1, tone: 0.2 });
      for (const e of enemiesNear(dim, p, q, 2.8, 1.5)) hit(e, 0.9, 4);
      if (j % 2 === 0) M.sound(p, "firework.blast", 1, 0.7 + j * 0.05);
    });
    // 6) 마지막 큰 불꽃 버섯: 위로 솟는 불티 분수 + 두 번째 폭발
    later(26, () => {
      try { dim.spawnParticle("minecraft:huge_explosion_emitter", up(L, 1)); } catch {}
      pt(dim, "jj_trail", L, { u: UP, r: 14, n: 90, size: 3, life: 1, tone: 0.1 });
      fireBoom(dim, up(L, 12), { n: 30, r: 2.5, spd: 6, size: 3.4, life: 1.2 });
      ember(dim, up(L, 12), { n: 100, r: 2, spd: 9, life: 1.6, tone: 0.3 });
      for (const e of enemiesNear(dim, p, L, 7, 2)) hit(e, 0.9, 6);
      shake(dim, L, 0.8, 0.6);
      M.sound(p, "random.explode", 1.5, 0.6);
      M.sound(p, "firework.twinkle", 1.5, 0.8);
    });
    // 7) 잔불: 2초 동안 바닥 여기저기 불꽃이 터짐
    for (let j = 0; j < 10; j++) later(30 + j * 4, () => {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 6, q = { x: L.x + Math.cos(a) * r, y: L.y, z: L.z + Math.sin(a) * r };
      fireBoom(dim, q, { n: 4, r: 0.4, spd: 1.5, size: 1.8, life: 1 });
      ember(dim, q, { n: 8, r: 0.3, spd: 2.5, life: 1 });
    });
    skillLock.delete(p.id);
  };
  later(170, () => skillLock.delete(p.id)); // 안전장치
}

// ───────── ④ 주작 · 홍련군무 (쉬프트 두 번) ─────────
// 큰 주작에 빙의 → 앞에서 크게 한 바퀴 돌고 나선으로 하늘 높이 비상 → 플레이어는 하늘에 남고 큰 주작이 작은 주작 셋으로 쪼개짐
//   → 작은 주작 셋이 플레이어 둘레를 크게 돌며 비상, 그동안 몸 둘레에 불화살 12발이 모임 → 12발이 각자 다른 적을 쫓아가 터짐
//   → 작은 주작 셋이 내려가 가장 강한 적(최대 체력 높은 적)을 두 번씩 들이받음 → 천천히 내려옴
const maxHpOf = (e) => { try { return e.getComponent("minecraft:health")?.effectiveMax ?? 0; } catch { return 0; } };
/** 유도 비행: 매 틱 goal() 쪽으로 점점 세게 꺾음. draw(pos, prev, t), hitR 안에 들면 onHit(goal) */
function homer(o) {
  let pos = o.pos, vel = o.vel, t = 0;
  const step = () => {
    t++;
    const g = o.goal(), to = sub(g, pos), d = len(to);
    if (d < (o.hitR ?? 1.5) || t > (o.max ?? 60)) { o.onHit(g, t > (o.max ?? 60)); return; }
    const turn = t < (o.free ?? 4) ? 0.04 : Math.min(o.turnMax ?? 0.45, 0.08 + (t - (o.free ?? 4)) * (o.turnUp ?? 0.03));
    vel = add(vel, sub(scl(norm(to), o.speed), vel), turn);
    const prev = pos;
    pos = add(pos, vel);
    o.draw(pos, prev, t);
    later(1, step);
  };
  step();
}
function crimsonDance(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  const N = 12, LOOP = 22, RISE = 14, SPLIT = LOOP + RISE, CIRC = 40, FIRE = SPLIT + CIRC + 2, DIVE = FIRE + 14;
  skillLock.add(p.id);
  M.potion(p, "resistance", 6, 4);
  M.potion(p, "fire_resistance", 1, 8);
  M.potion(p, "invisibility", 1, (SPLIT + 2) / 20); // 빙의하는 동안 몸은 주작 속
  const S = { ...p.location }, yw0 = yawOf(p), f0 = fwdOf(yw0), r0 = rightOf(yw0);
  const C = add(S, f0, 6); // 한 바퀴 도는 중심 (앞쪽)
  const yawTo = (d) => (Math.atan2(-d.x, d.z) * 180) / Math.PI;
  const angLerp = (a2, b2, k2) => a2 + ((((b2 - a2) % 360) + 540) % 360 - 180) * k2;
  // 플레이어를 경로 위 점으로 끌고 감 (속도로 밀어줌 → 시선은 자유, 많이 벗어나면 순간이동)
  const pull = (q) => {
    const d = sub(q, p.location), hl = Math.hypot(d.x, d.z);
    try { p.applyKnockback(hl > 0.01 ? d.x / hl : 0, hl > 0.01 ? d.z / hl : 0, Math.min(2.2, hl), Math.max(-1.5, Math.min(2, d.y + 0.08))); } catch {}
    try { if (len(d) > 5) p.teleport(q, { keepVelocity: true }); } catch {}
  };
  // 빙의 비행 경로: 뒤에서 출발해 앞쪽 원을 한 바퀴(살짝 오르며) → 나선으로 높이 비상
  const R = 6, TOP = 22;
  const path = (t) => {
    if (t <= LOOP) {
      const q = t / LOOP, a = -Math.PI / 2 - q * Math.PI * 2; // 플레이어 쪽(뒤)에서 시작
      return add(add(add(C, f0, Math.sin(-a) * -R), r0, Math.cos(a) * R), UP, 1 + q * 4);
    }
    const q = ease(Math.min(1, (t - LOOP) / RISE)), a = -Math.PI / 2 - Math.PI * 2 - q * Math.PI; // 반 바퀴 더 돌며 솟구침
    return add(add(add(C, f0, Math.sin(-a) * -R * (1 - q * 0.8)), r0, Math.cos(a) * R * (1 - q * 0.8)), UP, 5 + q * (TOP - 5));
  };
  let yawB = yw0, prevB = { ...S };
  M.anim(p, "dash");
  M.sound(p, "mob.enderdragon.growl", 1.2, 1.3);
  M.sound(p, "mob.blaze.shoot", 1.2, 0.6);
  fireBoom(dim, up(S, 0.5), { n: 20, r: 1.2, spd: 4, size: 2.4 });
  pt(dim, "jj_ring", S, { n: 50, r: 0.5, spd: 10, size: 2, life: 0.6, tone: 0.1 });
  flashScreen(p, 1, 0.5, 0.1, 0.3);
  for (let t = 1; t <= SPLIT; t++) later(t, () => {
    const q = path(t);
    pull(q);
    const L = p.location, d = sub(L, prevB);
    if (Math.hypot(d.x, d.z) > 0.05) yawB = angLerp(yawB, yawTo(d), 0.35);
    phoenix(dim, up(L, 0.6), yawB, t * 0.33, 1.9, 0.07); // 플레이어 = 큰 주작
    trail(dim, up(prevB, 1), up(L, 1), { size: 2.8, life: 1, n: 26 });
    if (t % 2 === 0) ember(dim, up(L, 1), { n: 14, r: 1.6, spd: 1.5, life: 1 });
    if (t % 3 === 0) fireBoom(dim, up(prevB, 1), { n: 3, r: 0.8, spd: 0.6, size: 2.2, life: 1.3, tone: 0.2 });
    if (t % 4 === 0) for (const e of enemiesNear(dim, p, L, 3.5, 2)) hit(e, 0.5, 4);
    if (t % 11 === 0) M.sound(p, "mob.enderdragon.flap", 1.2, 1.1);
    if (t === LOOP) { M.sound(p, "mob.enderdragon.growl", 1, 1.6); pt(dim, "jj_ring", up(L, 1), { n: 50, r: 0.6, spd: 12, size: 2, life: 0.5, tone: 0.2 }); }
    prevB = { ...L };
  });
  // 하늘에 멈춤 (화시 3단처럼: 속도로 붙잡고, 벗어나면 되돌림)
  let hold = null;
  for (let t = SPLIT + 1; t <= DIVE + 8; t++) later(t, () => {
    if (!hold) hold = { ...p.location };
    try { p.applyKnockback(0, 0, 0, 0.03); } catch {}
    try { const pl = p.location; if (Math.hypot(pl.x - hold.x, pl.y - hold.y, pl.z - hold.z) > 1.2) p.teleport(hold, { keepVelocity: false }); } catch {}
  });
  // 쪼개짐: 큰 주작이 터지며 작은 주작 셋이 세 방향으로 튀어나감, 플레이어 모습이 드러남
  const birds = [0, 1, 2].map((j) => ({ j, pos: null, yaw: 0, a: (j / 3) * Math.PI * 2 }));
  const ORB = 10;
  const orbit = (b, t) => { // 플레이어 둘레 큰 원 (살짝 아래위로 출렁이며)
    const a = b.a + t * 0.11, H = hold ?? p.location;
    return { x: H.x + Math.cos(a) * ORB, y: H.y - 1 + Math.sin(t * 0.15 + b.j * 2) * 1.5, z: H.z + Math.sin(a) * ORB };
  };
  later(SPLIT + 1, () => {
    try { p.removeEffect("invisibility"); } catch {}
    const L = up(p.location, 1);
    M.anim(p, "raise");
    try { dim.spawnParticle("minecraft:huge_explosion_emitter", L); } catch {}
    fireBoom(dim, L, { n: 30, r: 1.5, spd: 7, size: 3 });
    ember(dim, L, { n: 80, r: 1, spd: 9, life: 1.2 });
    for (const [d, spd] of [[0, 10], [3, 16]]) later(d, () => pt(dim, "jj_ring", L, { n: 60, r: 0.5, spd, size: 2.2, life: 0.6, tone: 0.1 }));
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; feather(dim, L, norm({ x: Math.cos(a), y: 0.2, z: Math.sin(a) }), UP, { len: 3, n: 26, life: 0.6, tone: 0.1, size: 1.2 }); }
    flashScreen(p, 1, 0.55, 0.15, 0.35);
    shake(dim, L, 0.6, 0.5);
    M.sound(p, "random.explode", 1.3, 1);
    M.sound(p, "firework.large_blast", 1.4, 0.7);
    for (const b of birds) { b.pos = L; b.yaw = yawTo({ x: Math.cos(b.a), y: 0, z: Math.sin(b.a) }); }
  });
  // 작은 주작 셋: 쪼개진 자리에서 퍼져 나가 큰 원을 돌며 비상
  for (let t = SPLIT + 2; t < DIVE; t++) later(t, () => {
    const k = Math.min(1, (t - SPLIT - 2) / 10);
    for (const b of birds) {
      const goal = orbit(b, t), np = add(b.pos, sub(goal, b.pos), 0.15 + k * 0.5), d = sub(np, b.pos);
      if (len(d) > 0.02) b.yaw = angLerp(b.yaw, yawTo(d), 0.35);
      phoenix(dim, np, b.yaw, t * 0.35 + b.j, 0.85, 0.07);
      trail(dim, b.pos, np, { size: 2, life: 0.8, n: 14 });
      if (t % 3 === b.j) ember(dim, np, { n: 6, r: 0.8, spd: 1, life: 0.9 });
      b.pos = np;
    }
    if (t % 12 === 0) { M.sound(p, "mob.enderdragon.flap", 1, 1.4); pt(dim, "jj_ring", up(hold ?? p.location, -1), { n: 40, r: ORB - 1, spd: 2, size: 1.4, life: 0.5, tone: 0.2 }); }
  });
  // 불화살 12발: 몸 둘레에 하나씩 생김
  const spot = (i) => {
    const H = up(hold ?? p.location, 1.2), a = ((i + 0.5) / N) * Math.PI * 2;
    return { x: H.x + Math.cos(a) * 2.8, y: H.y + Math.sin(a * 3) * 0.4, z: H.z + Math.sin(a) * 2.8 };
  };
  for (let t = SPLIT + 4; t < FIRE; t++) later(t, () => {
    const have = Math.min(N, Math.floor((t - SPLIT - 4) / 3) + 1);
    if (t % 2 === 0) for (let i = 0; i < have; i++) {
      const q = spot(i), d = norm(add(sub(q, up(hold ?? p.location, 1.2)), UP, -1.4)); // 화살촉이 바깥 아래를 겨눔
      trail(dim, add(q, d, -0.8), add(q, d, 0.8), { size: 1.4, life: 0.12, n: 10, tone: 0.1 });
      ember(dim, add(q, d, 0.85), { n: 1, r: 0, spd: 0, life: 0.15, tone: -0.3 });
    }
    if ((t - SPLIT - 4) % 3 === 0 && have <= N) { ember(dim, spot(have - 1), { n: 8, r: 0.3, spd: 1.5, life: 0.5 }); M.sound(p, "note.pling", 0.5, 0.6 + have * 0.1); }
  });
  // 적 고르기 (땅 위, 처음 자리 둘레 30칸)
  const foesNow = () => {
    let fs = [];
    try { fs = M.around(dim, S, 30).filter((e) => e.id !== p.id && e.typeId !== "minecraft:player" && e.isValid()); } catch {}
    fs.sort((a, b) => len(sub(a.location, S)) - len(sub(b.location, S)));
    return fs.slice(0, N);
  };
  let foes = [];
  later(FIRE, () => {
    foes = foesNow();
    M.anim(p, "slash");
    M.sound(p, "random.bow", 1.5, 0.6);
    M.sound(p, "mob.blaze.shoot", 1.2, 0.8);
    flashScreen(p, 1, 0.5, 0.1, 0.25);
    const H = up(hold ?? p.location, 1.2);
    for (let i = 0; i < N; i++) later(Math.floor(i / 2), () => {
      const from = spot(i), tgt = foes.length ? foes[i % foes.length] : null;
      const a = ((i + 0.5) / N) * Math.PI * 2, fall = { x: S.x + Math.cos(a) * 8, y: S.y, z: S.z + Math.sin(a) * 8 };
      homer({
        pos: from, vel: scl(norm(add(sub(from, H), UP, 0.3)), 0.9), speed: 1.6, free: 4, turnUp: 0.05, max: 50, hitR: 1.6,
        goal: () => (tgt && tgt.isValid() ? center(tgt) : fall),
        draw: (pos, prev, t) => {
          trail(dim, prev, pos, { size: 1.5, life: 0.35, n: 14, tone: 0.05 });
          if (t % 2 === 0) ember(dim, pos, { n: 3, r: 0.2, spd: 0.8, life: 0.5 });
        },
        onHit: (g) => {
          fireBoom(dim, g, { n: 10, r: 0.6, spd: 4, size: 2 });
          ember(dim, g, { n: 18, r: 0.4, spd: 5, life: 0.8 });
          pt(dim, "jj_ring", g, { n: 26, r: 0.4, spd: 7, size: 1.4, life: 0.4, tone: 0.2 });
          if (tgt && tgt.isValid()) hit(tgt, 0.9, 4);
          for (const e of enemiesNear(dim, p, g, 1.8, 1)) if (e !== tgt) hit(e, 0.4, 3);
          if (i % 3 === 0) M.sound(p, "firework.blast", 0.8, 0.9 + i * 0.05);
        },
      });
    });
  });
  // 화살이 터진 뒤: 작은 주작 셋이 내려가 강한 적(최대 체력 40 이상, 없으면 가장 센 적 하나, 최대 3명)을 두 번씩 들이받음
  later(DIVE, () => {
    const strong = [...foes].filter((e) => e.isValid()).sort((a, b) => maxHpOf(b) - maxHpOf(a));
    const picks = strong.filter((e) => maxHpOf(e) >= 40).slice(0, 3);
    if (!picks.length && strong.length) picks.push(strong[0]);
    M.sound(p, "mob.enderdragon.growl", 1, 1.8);
    for (const b of birds) later(b.j * 4, () => {
      const tgt = picks.length ? picks[b.j % picks.length] : null, j = b.j;
      const lost = { x: S.x + Math.cos(b.a) * 6, y: S.y, z: S.z + Math.sin(b.a) * 6 };
      let hits = 0;
      const go = (vel0) => homer({
        pos: b.pos, vel: vel0, speed: 1, free: 5, turnUp: 0.03, turnMax: 0.4, max: 70, hitR: 1.8,
        goal: () => (tgt && tgt.isValid() ? center(tgt) : lost),
        draw: (q, prev, t) => {
          const d = sub(q, prev);
          b.yaw = angLerp(b.yaw, yawTo(d), 0.3);
          phoenix(dim, q, b.yaw, t * 0.35 + j, 0.85, 0.07);
          trail(dim, prev, q, { size: 2, life: 0.6, n: 16 });
          if (t % 3 === 0) fireBoom(dim, prev, { n: 2, r: 0.4, spd: 0.6, size: 1.6, life: 1, tone: 0.2 });
          if (t % 2 === 0) ember(dim, q, { n: 5, r: 0.6, spd: 1.2, life: 0.8 });
          b.pos = q;
        },
        onHit: (g) => {
          hits++;
          const big = hits >= 2 || !tgt;
          if (big) { try { dim.spawnParticle("minecraft:large_explosion", g); } catch {} }
          fireBoom(dim, g, { n: big ? 24 : 14, r: 1, spd: big ? 7 : 5, size: big ? 3 : 2.2 });
          ember(dim, g, { n: big ? 60 : 30, r: 0.6, spd: big ? 8 : 6, life: 1 });
          pt(dim, "jj_ring", up(g, -0.5), { n: 44, r: 0.5, spd: big ? 14 : 9, size: 2, life: 0.6, tone: 0.1 });
          if (tgt && tgt.isValid()) { hit(tgt, big ? 2 : 1.3, 5); if (big) M.toss(g, tgt, 1.2, 2.5); }
          for (const e of enemiesNear(dim, p, g, big ? 3.5 : 2.2, 1.5)) if (e !== tgt) hit(e, 0.6, 3);
          shake(dim, g, big ? 0.6 : 0.3, 0.4);
          M.sound(p, "random.explode", big ? 1.3 : 0.8, big ? 0.8 : 1.2);
          if (big) M.sound(p, "firework.large_blast", 1.2, 0.8);
          if (!big && tgt && tgt.isValid()) go({ x: Math.cos(b.a) * 0.6, y: 1.1, z: Math.sin(b.a) * 0.6 }); // 솟구쳤다 다시 들이받음
        },
      });
      go(scl(norm(add(sub(tgt && tgt.isValid() ? center(tgt) : lost, b.pos), UP, 0.6)), 0.7));
    });
  });
  // ── 역동적인 시점 ──
  const P = () => up(p.location, 1);
  // 1) 빙의 한 바퀴: 주작 바로 뒤·위에서 쫓아가는 추격 시점
  for (let t = 2; t <= LOOP; t += 2) later(t, () => {
    const L = P(), d = norm({ x: L.x - prevB.x, y: 0, z: L.z - prevB.z }), back = len(d) > 0.1 ? d : f0;
    cam(p, add(add(L, back, -7), UP, 2.6), add(L, back, 3), 0.15, "Linear");
  });
  // 2) 비상: 땅 가까이에서 올려다보는 시점 → 솟구치는 주작을 따라 고개를 듦
  later(LOOP + 1, () => cam(p, add(up(C, 1.5), r0, 9), P(), 0.3));
  for (let t = LOOP + 3; t <= SPLIT; t += 2) later(t, () => cam(p, add(up(C, 1.5 + (t - LOOP) * 0.5), r0, 9), P(), 0.12, "Linear"));
  // 3) 쪼개짐: 가까이 옆에서 번쩍 → 4틱 뒤 크게 뒤로 빠지며 하늘 전경
  later(SPLIT + 1, () => { const L = P(); cam(p, add(add(L, r0, 4.5), UP, 0.5), L, 0.08); });
  later(SPLIT + 5, () => { const L = P(); cam(p, add(add(L, r0, 15), UP, 5), up(L, -1), 0.6, "OutCubic"); });
  // 4) 작은 주작 셋이 크게 돌 때: 천천히 둘레를 도는 넓은 시점 (주작과 반대 방향으로 돌아 역동적으로)
  for (let t = SPLIT + 14; t < FIRE; t += 3) later(t, () => {
    const H = up(hold ?? p.location, 0), a = -((t - SPLIT - 14) * 0.06) + Math.atan2(r0.z, r0.x);
    cam(p, { x: H.x + Math.cos(a) * 17, y: H.y + 4 + Math.sin(t * 0.08) * 2, z: H.z + Math.sin(a) * 17 }, up(H, -1), 0.15, "Linear");
  });
  // 5) 불화살 발사: 플레이어 등 뒤 위에서 땅의 적들을 내려다보는 시점
  later(FIRE, () => { const H = up(hold ?? p.location, 1.5); cam(p, add(add(H, sub(H, S).y > 0 ? norm({ x: H.x - S.x, y: 0, z: H.z - S.z }) : f0, 3), UP, 4), S, 0.25, "OutCubic"); });
  // 6) 주작 셋이 내리꽂힐 때: 땅 가까이 표적 옆에서 하늘을 올려다봄 → 맞을 때 표적 쪽으로 다가감
  later(DIVE + 2, () => {
    const tg = foes.filter((e) => e.isValid()).sort((a, b) => maxHpOf(b) - maxHpOf(a))[0];
    const G = tg ? center(tg) : S, side = norm(cross(norm(sub(G, up(hold ?? p.location, 0))), UP));
    cam(p, add(up(G, 1.2), len(side) > 0.1 ? side : r0, 7), up(G, 6), 0.3);
    later(10, () => cam(p, add(up(G, 1.6), len(side) > 0.1 ? side : r0, 5), up(G, 1), 0.4, "OutCubic"));
  });
  // 끝: 화면 살짝 번쩍이며 원래 시점으로
  later(DIVE + 34, () => { flashScreen(p, 1, 0.6, 0.2, 0.3); camClear(p); });
  // 내려옴
  later(DIVE + 9, () => { skillLock.delete(p.id); M.potion(p, "slow_falling", 1, 4); });
  later(DIVE + 120, () => { skillLock.delete(p.id); camClear(p); }); // 안전장치
}

/** 무기 스킬 표 (청룡의 검과 같은 모양: HUD·쿨다운에 그대로 씀) */
export const WEAPON_SKILLS = {
  [BOW_ID]: [
    { id: "w_jj_1", key: 1, name: "주작 · 화시", short: "화시", lv: 1, mp: 6, cd: 0.35, pow: 1, run: flameShot, desc: "불화살 → 맞히면 근접 폭발 불화살 세 발 → 또 맞히면 주작의 활로 2초 조준해 큰 불화살을 쏴 크게 폭발. 6발마다 장전." },
    { id: "w_jj_2", key: 2, name: "주작 · 연사", short: "연사", lv: 1, mp: 25, cd: 10, pow: 1, run: rapidFire, desc: "등에 3D 불 날개를 펼치며 뒤로 물러서면 등 뒤 양옆에 활 6개가 나타나 목표를 향해 세 번 일제 사격, 날개가 하늘로 솟아 흩어지며 깃털이 불화살 비가 된다." },
    { id: "w_jj_3", key: 3, name: "주작 · 비상", short: "비상", lv: 1, mp: 40, cd: 18, pow: 1, run: soar, desc: "뒤로 크게 도약해 공중에 멈춘 뒤 불 날개를 세 번 퍼덕여 불비를 내리고, 거대한 활을 소환해 시위에 건 주작을 쏘면 주작이 날갯짓하며 조준 지점으로 날아가 폭발." },
    { id: "w_jj_4", key: 4, name: "주작 · 홍련군무", short: "군무", lv: 1, mp: 50, cd: 25, pow: 1, run: crimsonDance, desc: "큰 주작에 빙의해 한 바퀴 돌고 하늘 높이 비상 → 주작이 작은 주작 셋으로 쪼개져 하늘을 크게 돌고, 몸 둘레 불화살 12발이 각자 다른 적을 쫓아가 터진 뒤 주작 셋이 내려가 가장 강한 적을 두 번씩 들이받는다." },
  ],
};
