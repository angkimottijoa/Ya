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

// ───────── ② 주작 · 연사 (쉬프트+클릭): 뒤로 물러섰다가, 바닥에 눕힌 거대한 활로 연속 사격 → 불화살 비 ─────────
function rapidFire(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.potion(p, "resistance", 3, 3);
  const yw0 = yawOf(p), f0 = fwdOf(yw0);
  M.anim(p, "dash");
  try { p.applyKnockback(-f0.x, -f0.z, 1.1, 0.35); } catch {}
  M.sound(p, "mob.blaze.breathe", 0.8, 1.3);
  ember(dim, up(p.location, 0.3), { n: 20, r: 0.6, spd: 2, life: 0.8 });
  let impact = null;
  // 6~: 바닥에 활을 눕히고 (활 몸 = 플레이어 앞 바닥, 활 배가 앞) 8발 연속
  for (let t = 6; t <= 30; t += 3) later(t, () => {
    const L = p.location, yw = yawOf(p), f = fwdOf(yw), r = rightOf(yw), v = viewOf(p);
    const SB = 0.05, H = add(up(L, 0.15), f, 1.6);
    pt(dim, "jj_bow", H, { cx: BOW.cx, cy: BOW.cy, u: f, v: r, scale: SB, n: Math.round((BOW.filled * 0.8) / BOW.fill), life: 0.25, size: 1 });
    if (t <= 27) {
      M.anim(p, "shoot");
      const start = add(eyeOf(p), v, 1), d = norm(add(v, add(scl(r, (Math.random() - 0.5) * 0.12), UP, (Math.random() - 0.5) * 0.06), 1));
      fireArrow(ctx, start, d, { mul: 0.55, radius: 1.5, speed: 2.6, onHit: (e) => { impact = { ...e.location }; } });
      M.sound(p, "random.bow", 0.8, 1.3 + Math.random() * 0.3);
      ember(dim, add(start, v, 0.5), { n: 4, r: 0.15, spd: 1.5, life: 0.4, tone: 0 });
    }
  });
  // 32~: 불화살 비 — 맞힌 곳(없으면 앞 10칸)에 하늘에서 쏟아짐
  later(32, () => {
    const L = p.location, v = viewOf(p);
    const c = impact ?? add(L, { x: v.x, y: 0, z: v.z }, 10);
    M.sound(p, "mob.blaze.shoot", 1.2, 0.6);
    ring(dim, up(c, 0.1), { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 4.5, { life: 1.6, tone: 0.2, n: 200 });
    for (let i = 0; i < 18; i++) later(Math.floor(i * 1.2), () => {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 4.2;
      const land = { x: c.x + Math.cos(a) * rr, y: c.y, z: c.z + Math.sin(a) * rr };
      const from = add(land, { x: -1.5, y: 14, z: -1.5 }), d = norm(sub(land, from));
      let pos = from, k = 0;
      const fall = () => {
        k++;
        const next = add(pos, d, 3);
        trail(dim, pos, next, { size: 1.3, life: 0.25, n: 18 });
        pos = next;
        if (pos.y <= land.y + 0.3 || k > 8) {
          fireBoom(dim, up(land, 0.3), { n: 5, r: 0.3, spd: 2.5, size: 1.3 });
          ember(dim, up(land, 0.3), { n: 10, r: 0.3, spd: 3, life: 0.7 });
          for (const e of enemiesNear(dim, p, up(land, 0.5), 2, 1)) hit(e, 0.5, 3);
          if (i % 4 === 0) M.sound(p, "random.explode", 0.4, 1.5);
          return;
        }
        later(1, fall);
      };
      fall();
    });
    later(26, () => { // 마지막 큰 불 폭발
      fireBoom(dim, up(c, 0.5), { n: 18, r: 1.4, spd: 5, size: 2.4 });
      pt(dim, "jj_ring", c, { n: 50, r: 0.5, spd: 12, size: 1.8, life: 0.6, tone: 0.1 });
      for (const e of enemiesNear(dim, p, up(c, 0.5), 5, 1.5)) hit(e, 1.2, 4);
      shake(dim, c, 0.5, 0.4);
      M.sound(p, "random.explode", 1, 0.9);
    });
  });
}

/** 무기 스킬 표 (청룡의 검과 같은 모양: HUD·쿨다운에 그대로 씀) */
export const WEAPON_SKILLS = {
  [BOW_ID]: [
    { id: "w_jj_1", key: 1, name: "주작 · 화시", short: "화시", lv: 1, mp: 6, cd: 0.35, pow: 1, run: flameShot, desc: "불화살 → 맞히면 근접 폭발 불화살 세 발 → 또 맞히면 주작의 활로 2초 조준해 큰 불화살을 쏴 크게 폭발. 6발마다 장전." },
    { id: "w_jj_2", key: 2, name: "주작 · 연사", short: "연사", lv: 1, mp: 25, cd: 10, pow: 1, run: rapidFire, desc: "뒤로 물러섰다가 바닥에 눕힌 거대한 활로 불화살 8발 연속 사격, 맞힌 곳에 불화살 비." },
  ],
};
