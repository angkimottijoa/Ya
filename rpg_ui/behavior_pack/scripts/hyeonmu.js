// ═══════════════════════════════════════════════════════════════════════
// 현무의 방패 (V9.5) — 막고 받아치는 탱커 무기. 먹빛 검정 · 짙은 초록 · 비취, 상징 = 거북 등껍질 + 뱀
//   패시브 「등껍질」  방패를 들고 있으면 앞(시선 ±60도)에서 오는 피해 20% 감소
//   패링   우클릭(모바일: 길게 누르기)을 '누른 순간'부터 0.3초 안에 앞에서 공격을 받으면 완벽 패링
//          → 피해 0, 공격자 밀쳐내고 1초 기절 + 반격, 「현무 기운」 +1 (최대 3, 15초), 3초 동안 현무진(등껍질 벽)
//          누르고 있으면 막기(앞 피해 50% 감소, 느려짐). 0.3초 안에 아무것도 안 맞으면 0.8초 동안 완벽 패링 불가
//          짧게 눌렀다 떼면(0.25초 이하) = 스킬 ①/②(쉬프트)
//   현무진  방패 앞에 육각 등껍질 벽: 벽 뒤 구역에 있는 나·아군에게 벽 앞쪽에서 온 피해는 들어가지 않음,
//          벽에 닿는 투사체는 부서져 사라짐, 벽에 붙은 적은 밀려남
//   ① 클릭  귀갑타: 3타 콤보 (방패 밀치기 → 뱀 꼬리 휘두르기 → 내리찍어 균열·띄우기) · 현무 기운 1개당 +15%
//   ② 쉬프트+클릭  사신박: 방패에서 뱀이 뻗어 나가 처음 맞은 적을 휘감아 끌어옴 (독 · 느려짐)
//   ③ 쉬프트+점프  현무진: 방패를 땅에 박아 큰 등껍질 벽 5초 → 끝날 때 벽이 깨지며 앞쪽으로 파편 폭발
//   ④ 쉬프트 두 번  현무붕지: 거대한 방패를 내리찍어 앞으로 20칸 대지가 솟구치며 닿은 적을 모두 띄움
//          → 끝(또는 처음 맞은 적)에서 흑요석빛 비취 바위 기둥 다발이 솟고 검은 뱀이 감아 오름 · 현무 기운을 모두 써서 강해짐
// 파티클: gen_hyeonmu.py
// ═══════════════════════════════════════════════════════════════════════
import { system, world, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
import * as M from "./ms.js";
import { SHIELD as ART } from "./hm_meta.js";
import { skillLock } from "./skill_lock.js";
import { notify } from "./player.js";

export const SHIELD_ID = "rpg:hyeonmu_shield";
const later = (t, fn) => system.runTimeout(() => { try { fn(); } catch {} }, Math.max(1, Math.round(t)));
const up = (l, y) => ({ x: l.x, y: l.y + y, z: l.z });
const yawOf = (p) => p.getRotation().y;
const rad = (d) => (d * Math.PI) / 180;
const fwdOf = (yaw) => ({ x: -Math.sin(rad(yaw)), y: 0, z: Math.cos(rad(yaw)) });
const rightOf = (yaw) => ({ x: -Math.cos(rad(yaw)), y: 0, z: -Math.sin(rad(yaw)) });
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scl = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (v) => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const UP = { x: 0, y: 1, z: 0 };
const ease = (s) => s * s * (3 - 2 * s);
const center = (e) => up(e.location, 0.9);
/** 소리 (음량, 음높이) */
const snd = (p, id, vol = 1, pitch = 1) => M.sound(p, id, pitch, vol);
const viewOf = (p) => { try { return p.getViewDirection(); } catch { return fwdOf(yawOf(p)); } };
const flat = (v) => norm({ x: v.x, y: 0, z: v.z });
/** u 에 수직인 두 방향 (v = 위쪽에 가깝게) */
const basis = (u) => { const w = norm(Math.abs(u.y) > 0.95 ? cross(u, { x: 1, y: 0, z: 0 }) : cross(u, UP)); return { v: norm(cross(w, u)), w }; };

const DEF = { n: 10, r: 0.5, spd: 1, tone: 0, size: 1, life: 0.5, h: 0, thick: 0.3, scale: 0.05, iw: 1, ih: 1, cx: 0, cy: 0 };
function pt(dim, name, loc, o = {}) {
  try {
    const m = new MolangVariableMap();
    for (const k of Object.keys(DEF)) m.setFloat(`variable.${k}`, o[k] ?? DEF[k]);
    for (const k of ["u", "v", "w", "vd"]) m.setVector3(`variable.${k}`, o[k] ?? { x: 0, y: 1, z: 0 });
    dim.spawnParticle(`rpg:${name}`, loc, m);
  } catch {}
}
const glow = (dim, at, o = {}) => pt(dim, "hm_glow", at, { n: 12, r: 0.3, spd: 3, size: 1, life: 0.6, tone: 0.1, ...o });
const smoke = (dim, at, o = {}) => pt(dim, "hm_smoke", at, { n: 6, r: 0.6, spd: 1.2, size: 1.4, life: 1.2, ...o });
const rocks = (dim, at, o = {}) => pt(dim, "hm_rock", at, { n: 14, r: 0.8, spd: 7, size: 1, life: 1.4, tone: 0.1, ...o });
const ring = (dim, at, o = {}) => pt(dim, "hm_ring", up(at, 0.1), { n: 60, r: 0.4, spd: 9, size: 1.4, life: 0.6, tone: 0.1, ...o });
const crack = (dim, a, dir, L, o = {}) => { const d = flat(dir); pt(dim, "hm_line", up(a, 0.08), { u: d, v: { x: -d.z, y: 0, z: d.x }, r: L, h: o.h ?? 0.25, n: o.n ?? Math.round(L * 14), size: o.size ?? 1.2, life: o.life ?? 1.2, tone: o.tone ?? 0.05, thick: Math.random() * 30 }); };
/** 바위 기둥: base 에서 dir 방향으로 길이 L, 밑동 굵기 th */
const spike = (dim, base, dir, L, th, o = {}) => { const u = norm(dir), b = basis(u); pt(dim, "hm_spike", base, { u, v: b.v, w: b.w, r: L, thick: th, n: o.n ?? Math.round(L * th * 90 + 20), size: o.size ?? 1, life: o.life ?? 0.15, tone: o.tone ?? 0 }); };
/** 방패 그림: c = 가운데, u = 그림 가로, v = 그림 위, w = 앞(볼록), h = 높이(블록) */
const shieldArt = (dim, c, u, v, h, o = {}) => {
  const sc = h / ART.ih;
  pt(dim, "hm_shield", c, { ...ART, u, v, w: norm(cross(u, v)), scale: sc, h: o.dome ?? h * 0.18, n: o.n ?? Math.round(ART.filled / ART.fill * 0.9), life: o.life ?? 0.12, size: o.size ?? 1, spd: o.spd ?? 0, vd: o.vd ?? UP });
};
/** 뱀 몸: 점 목록(머리 → 꼬리)을 따라 비늘 토막 + 머리(눈) */
function serpent(dim, pts, o = {}) {
  const th0 = o.thick ?? 0.32, life = o.life ?? 0.08;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], d = sub(a, b), L = len(d);
    if (L < 0.01) continue;
    const u = scl(d, 1 / L), bs = basis(u), q = i / Math.max(1, pts.length - 2);
    pt(dim, "hm_scale", b, { u, v: bs.v, w: bs.w, r: L + 0.05, thick: th0 * (1 - q * 0.65), n: Math.round(26 * (1 - q * 0.5)), life, size: o.size ?? 1, tone: o.tone ?? 0 });
  }
  if (o.head !== false && pts.length > 1) {
    const h = pts[0], d = norm(sub(pts[0], pts[1])), bs = basis(d);
    pt(dim, "hm_scale", h, { u: d, v: bs.v, w: bs.w, r: 0.55, thick: th0 * 1.25, n: 40, life, size: 1.1, tone: o.tone ?? 0 });
    for (const s of [-1, 1]) pt(dim, "hm_glow", add(add(add(h, d, 0.38), bs.w, s * th0 * 0.8), bs.v, th0 * 0.6), { n: 2, r: 0, spd: 0, size: 0.8, life: life * 2, tone: 0 });
  }
}
function shake(dim, at, power, sec) {
  try { for (const pl of dim.getPlayers({ location: at, maxDistance: 22 })) pl.runCommand(`camerashake add @s ${power} ${sec} positional`); } catch {}
}

/** 같은 대상은 5틱에 한 번만 */
function hitter(ctx) {
  const last = new Map();
  return (e, mul, cd = 5) => {
    if (!e?.isValid() || e.id === ctx.p.id) return false;
    const now = system.currentTick;
    if (now - (last.get(e.id) ?? -99) < cd) return false;
    last.set(e.id, now);
    M.skillHit.set(e.id, now);
    try { e.applyDamage(Math.max(1, Math.round(ctx.dmg * mul)), { cause: EntityDamageCause.entityAttack, damagingEntity: ctx.p }); } catch {}
    return true;
  };
}
const foesAround = (dim, p, at, r) => M.around(dim, at, r).filter((e) => e.id !== p.id && e.isValid());
const knockUp = (e, v, slowSec = 1.2) => { try { e.applyKnockback(0, 0, 0, v); } catch {} M.potion(e, "slowness", 4, slowSec); };

// ───────── 상태 ─────────
const ST = new Map(); // pid → { stacks, stackT, combo, comboT, press, window, lockUntil, guard }
const st = (p) => { let s = ST.get(p.id); if (!s) { s = { stacks: 0, stackT: 0, combo: 0, comboT: -99, press: null, window: -1, lockUntil: 0 }; ST.set(p.id, s); } return s; };
const walls = []; // { owner, P0, n, r, half, H, until, big }
export const heldShield = (p) => { try { return p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex)?.typeId === SHIELD_ID; } catch { return false; } };
/** HUD 한 줄: 현무 기운 */
export function shieldLine(p) {
  const s = st(p), now = system.currentTick;
  if (s.stacks && now > s.stackT) s.stacks = 0;
  const lock = s.lockUntil > now;
  return `§2현무 기운 ${"§a◆".repeat(s.stacks)}${"§8◇".repeat(3 - s.stacks)}${lock ? "  §7패링 준비중" : "  §a패링 가능"}`;
}
const addStack = (p) => { const s = st(p); s.stacks = Math.min(3, (s.stacks && system.currentTick <= s.stackT ? s.stacks : 0) + 1); s.stackT = system.currentTick + 300; };
const takeStacks = (p) => { const s = st(p), n = s.stacks && system.currentTick <= s.stackT ? s.stacks : 0; s.stacks = 0; return n; };
const stacksOf = (p) => { const s = st(p); return s.stacks && system.currentTick <= s.stackT ? s.stacks : 0; };

// ───────── 입력: 누른 순간 = 패링 창, 짧게 떼면 = 스킬 ①/② ─────────
let caster = null;
/** skills.js 가 castKey 를 넘겨줌 (서로 import 하지 않도록) */
export function setShieldCaster(fn) { caster = fn; }
export let HANDLES_USE = false;
const TAP = 5, WINDOW = 6, WHIFF = 16;
function onPress(p) {
  const s = st(p), now = system.currentTick;
  if (s.press) return;
  s.press = { t0: now, parried: false };
  s.lastStart = now;
  if (now >= s.lockUntil) {
    s.window = now + WINDOW;
    const id = (s.winId = (s.winId ?? 0) + 1);
    M.potion(p, "resistance", 2, WINDOW / 20 + 0.05); // 창 안에서 큰 한 방에 죽지 않게 (나머지는 바로 되돌림)
    later(WINDOW + 1, () => { // 아무것도 못 막았으면 헛패링 → 잠깐 완벽 패링 불가
      const s2 = st(p);
      if (s2.winId !== id) return;
      if (s2.parriedId !== id) s2.lockUntil = system.currentTick + WHIFF;
      s2.window = -1;
    });
  }
  // 막는 동안 방패를 앞에 그림
  const loop = () => {
    const s2 = st(p);
    if (!s2.press || !p.isValid() || !heldShield(p)) { if (s2.press && !heldShield(p)) s2.press = null; return; }
    const held = system.currentTick - s2.press.t0;
    if (held >= TAP && held % 2 === 0) {
      const v = viewOf(p), f = flat(v), r = { x: -f.z, y: 0, z: f.x };
      shieldArt(p.dimension, add(up(p.location, 1.15), f, 0.9), scl(r, -1), UP, 1.25, { n: 520, life: 0.11, dome: 0.18 });
    }
    later(1, loop);
  };
  later(1, loop);
}
/** 클릭 이벤트(itemUse): 누름·뗌 이벤트가 안 오는 환경이면 그냥 ①/② 로 */
export function useEvent(p) {
  const t = system.currentTick, sneak = p.isSneaking;
  later(2, () => { const s = st(p); if (!s.press && (s.lastStart ?? -99) < t - 1 && caster) caster(p, sneak ? 2 : 1); });
}
function onRelease(p) {
  const s = st(p);
  if (!s.press) return;
  const held = system.currentTick - s.press.t0, parried = s.press.parried;
  s.press = null;
  if (!parried && held <= TAP && caster) caster(p, p.isSneaking ? 2 : 1);
}
try {
  world.afterEvents.itemStartUse.subscribe(({ source, itemStack }) => { if (source?.typeId === "minecraft:player" && itemStack?.typeId === SHIELD_ID) onPress(source); });
  const stop = ({ source, itemStack }) => { if (source?.typeId === "minecraft:player" && (!itemStack || itemStack.typeId === SHIELD_ID)) onRelease(source); };
  world.afterEvents.itemStopUse.subscribe(stop);
  try { world.afterEvents.itemReleaseUse.subscribe(stop); } catch {}
  HANDLES_USE = true;
} catch {}

// ───────── 피해 판정: 패링 · 현무진 · 막기 · 패시브 ─────────
const srcPos = (ds) => { try { return ds?.damagingProjectile?.location ?? ds?.damagingEntity?.location ?? null; } catch { return null; } };
const fromFront = (p, at) => {
  const d = { x: at.x - p.location.x, y: 0, z: at.z - p.location.z }, L = Math.hypot(d.x, d.z);
  if (L < 0.35) return true;
  return dot(scl(d, 1 / L), flat(viewOf(p))) > 0.5;
};
const healBack = (e, amt) => { try { const hp = e.getComponent("minecraft:health"); if (hp && hp.currentValue > 0) hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + amt)); } catch {} };
world.afterEvents.entityHurt.subscribe(({ hurtEntity: v, damage, damageSource }) => {
  if (v?.typeId !== "minecraft:player" || damage <= 0) return;
  const at = srcPos(damageSource);
  const now = system.currentTick;
  // 현무진: 벽 뒤 구역 + 벽 앞쪽에서 온 피해 → 되돌림
  if (at) for (const w of walls) {
    if (w.until < now || !inZone(w, v.location) || dot(sub(at, w.P0), w.n) < -0.2) continue;
    healBack(v, damage);
    hexSpark(v.dimension, w, at);
    return;
  }
  const s = ST.get(v.id);
  if (!s || !heldShield(v) || !at) return;
  if (s.window >= now && fromFront(v, at)) { parry(v, damageSource, damage); return; }
  if (s.press && fromFront(v, at)) { healBack(v, damage * 0.5); blockFx(v, at); return; } // 막기
  if (fromFront(v, at)) healBack(v, damage * 0.2); // 패시브 등껍질
});
function blockFx(p, at) {
  const dim = p.dimension, f = flat(sub(at, p.location));
  glow(dim, add(up(p.location, 1.2), f, 1), { n: 8, spd: 2.5, size: 0.9 });
  try { p.playSound("item.shield.block", { volume: 0.8, pitch: 1.1 }); } catch {}
}
function parry(p, ds, damage) {
  const s = st(p), dim = p.dimension, now = system.currentTick;
  healBack(p, damage);
  s.window = -1;
  s.lockUntil = 0;
  s.parriedId = s.winId;
  if (s.press) s.press.parried = true;
  addStack(p);
  const f = flat(viewOf(p)), r = { x: -f.z, y: 0, z: f.x }, C = add(up(p.location, 1.2), f, 1.1);
  // 번쩍: 별 + 비취 불티 + 육각 충격
  pt(dim, "hm_flash", C, { n: 4, spd: 1, size: 3, life: 0.3 });
  glow(dim, C, { n: 40, r: 0.2, spd: 7, size: 1.2, life: 0.6, tone: 0 });
  pt(dim, "hm_hex", C, { u: r, v: UP, w: f, r: 5, h: 4, scale: 0.42, thick: 0.08, n: 260, size: 1.2, life: 0.35, tone: 0 });
  shieldArt(dim, add(up(p.location, 1.15), f, 1), scl(r, -1), UP, 1.5, { n: 700, life: 0.3 });
  try { p.runCommand("camerashake add @s 0.25 0.2 positional"); } catch {}
  try { p.playSound("random.anvil_land", { volume: 0.7, pitch: 1.8 }); p.playSound("item.trident.hit_ground", { volume: 1, pitch: 0.7 }); } catch {}
  try { dim.playSound("block.bell.hit", p.location, { volume: 1, pitch: 1.4 }); } catch {}
  notify(p, `§a§l패링! §r§2현무 기운 ${"◆".repeat(stacksOf(p))}`);
  // 공격자: 기절 + 밀쳐냄 + 반격
  const atk = ds?.damagingEntity;
  if (atk?.isValid() && atk.id !== p.id) {
    M.stun(atk, 1);
    M.toss(p.location, atk, 9, 3);
    hitter({ p, dmg: s.dmg ?? 14 })(atk, 0.6);
    glow(dim, center(atk), { n: 16, spd: 4, tone: 0.2 });
  }
  try { if (ds?.damagingProjectile?.isValid()) ds.damagingProjectile.remove(); } catch {}
  wall(p, { sec: 3, half: 2.6, H: 3.6, big: false });
  void now;
}

// ───────── 현무진 (등껍질 벽) ─────────
function inZone(w, pos) {
  const d = sub(pos, w.P0), back = -dot(d, w.n), lat = Math.abs(dot(d, w.r)), dy = pos.y - w.P0.y;
  return back > -0.6 && back < 9 && lat < w.half + 0.8 + back * 0.35 && dy > -2 && dy < w.H + 1.5;
}
function hexSpark(dim, w, at) {
  const d = sub(at, w.P0), lat = Math.max(-w.half, Math.min(w.half, dot(d, w.r))), y = Math.max(0.3, Math.min(w.H, at.y - w.P0.y));
  const q = add(up(w.P0, y), w.r, lat);
  pt(dim, "hm_flash", q, { n: 2, spd: 0.5, size: 1.6, life: 0.25 });
  glow(dim, q, { n: 12, spd: 3.5, size: 0.9 });
  try { dim.playSound("random.anvil_land", q, { volume: 0.4, pitch: 2 }); } catch {}
}
const PROJ = new Set(["minecraft:arrow", "minecraft:small_fireball", "minecraft:fireball", "minecraft:snowball", "minecraft:egg", "minecraft:thrown_trident", "minecraft:shulker_bullet",
  "minecraft:wither_skull", "minecraft:wither_skull_dangerous", "minecraft:llama_spit", "minecraft:dragon_fireball", "minecraft:wind_charge_projectile", "minecraft:breeze_wind_charge_projectile", "minecraft:splash_potion", "minecraft:lingering_potion"]);
function wall(p, o) {
  const dim = p.dimension, f = flat(viewOf(p)), r = { x: -f.z, y: 0, z: f.x };
  const P0 = add({ ...p.location }, f, o.big ? 2 : 1.4);
  const w = { owner: p.id, P0, n: f, r, half: o.half, H: o.H, until: system.currentTick + Math.round(o.sec * 20), big: o.big };
  walls.push(w);
  const cols = Math.round((w.half * 2) / (1.5 * 0.55)) + 1, rows = Math.round(w.H / (1.732 * 0.55)) + 1;
  const mid = up(P0, w.H / 2);
  snd(p, "random.anvil_land", 0.6, 0.6);
  try { dim.playSound("block.bell.resonate", P0, { volume: 0.6, pitch: 0.8 }); } catch {}
  ring(dim, P0, { n: 50, spd: 6, size: 1.2 });
  rocks(dim, P0, { n: 12, r: w.half * 0.8, spd: 4 });
  const T = Math.round(o.sec * 20);
  for (let t = 0; t < T; t += 2) later(t + 1, () => {
    const k = Math.min(1, (t + 2) / 6), fade = t > T - 8 ? (T - t) / 8 : 1;
    pt(dim, "hm_hex", mid, { u: r, v: UP, w: f, r: cols, h: rows * k, scale: 0.55, thick: 0.05, n: Math.round(170 * k * fade + 30), size: 1.1, life: 0.14, tone: 0.05 });
    if (t % 4 === 0) pt(dim, "hm_hexfill", mid, { u: r, v: UP, w: f, r: cols, h: rows * k, scale: 0.55, thick: 0.05, n: Math.round(60 * fade), size: 1, life: 0.26 });
    if (t % 6 === 0) glow(dim, add(up(P0, Math.random() * w.H), r, (Math.random() - 0.5) * 2 * w.half), { n: 3, spd: 0.6, size: 0.8, life: 0.8 });
    // 투사체 부숨 + 붙은 적 밀어냄
    try {
      for (const e of dim.getEntities({ location: mid, maxDistance: w.half + w.H })) {
        if (!e.isValid()) continue;
        const d = sub(e.location, P0), fr = dot(d, f), lat = Math.abs(dot(d, r));
        if (lat > w.half + 0.6 || e.location.y < P0.y - 1 || e.location.y > P0.y + w.H + 1) continue;
        if (PROJ.has(e.typeId)) {
          let own = null; try { own = e.getComponent("minecraft:projectile")?.owner; } catch {}
          if (own?.typeId === "minecraft:player") continue;
          if (fr > -0.3 && fr < 3) { hexSpark(dim, w, e.location); e.remove(); }
        } else if (e.typeId !== "minecraft:player" && e.id !== p.id && fr > -0.2 && fr < 1.4 && t % 6 === 0) {
          try { if (e.matches({ families: ["monster"] })) e.applyKnockback(f.x, f.z, 0.7, 0.15); } catch {}
        }
      }
    } catch {}
  });
  later(T + 1, () => {
    const i = walls.indexOf(w);
    if (i >= 0) walls.splice(i, 1);
    if (o.onEnd) o.onEnd(w);
  });
  return w;
}

// ───────── ① 귀갑타 ─────────
function bash(ctx) {
  st(ctx.p).dmg = ctx.dmg;
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), s = st(p), now = system.currentTick;
  if (now - s.comboT > 30) s.combo = 0;
  const stage = s.combo;
  s.combo = (s.combo + 1) % 3;
  s.comboT = now;
  const f = flat(viewOf(p)), r = { x: -f.z, y: 0, z: f.x }, o = { ...p.location }, bonus = 1 + stacksOf(p) * 0.15;
  const front = (rr, cosMin = 0.3) => foesAround(dim, p, add(o, f, rr * 0.5), rr).filter((e) => { const d = flat(sub(e.location, o)); return dot(d, f) > cosMin || len(sub(e.location, o)) < 1.3; });
  if (stage === 0) { // 방패 밀치기
    M.anim(p, "slash");
    try { p.applyKnockback(f.x, f.z, 0.7, 0.05); } catch {}
    for (let t = 0; t < 4; t++) later(t, () => {
      const c = add(up(p.location, 1.1), f, 1 + t * 0.35);
      shieldArt(dim, c, scl(r, -1), UP, 1.4, { n: 480, life: 0.08 });
    });
    later(2, () => {
      const c = add(up(p.location, 1.1), f, 1.8);
      pt(dim, "hm_hex", c, { u: r, v: UP, w: f, r: 4, h: 3, scale: 0.35, thick: 0.1, n: 140, size: 1, life: 0.3, tone: 0.1 });
      glow(dim, c, { n: 18, spd: 4 });
      for (const e of front(3.2)) { if (hit(e, 0.75 * bonus)) M.toss(o, e, 7, 2); }
      snd(p, "random.anvil_land", 0.5, 1.5);
      snd(p, "item.shield.block", 1, 0.8);
    });
  } else if (stage === 1) { // 뱀 꼬리 휘두르기 (오른쪽 → 왼쪽 호)
    M.anim(p, "slash");
    const C = up(o, 1);
    for (let t = 0; t < 6; t++) later(t, () => {
      const q = (t + 1) / 6, pts = [];
      for (let i = 0; i <= 10; i++) {
        const a = rad(-75 + (q * 170) - i * 9), rr = 2.7 - i * 0.05;
        pts.push(add(add(add(C, f, Math.cos(a) * rr), r, Math.sin(a) * rr * -1), UP, Math.sin(i * 0.6 + t) * 0.12));
      }
      serpent(dim, pts, { thick: 0.22, head: false, life: 0.1 });
      glow(dim, pts[0], { n: 3, spd: 1, size: 0.8, life: 0.4 });
    });
    later(3, () => {
      for (const e of front(3.4, -0.1)) if (hit(e, 0.85 * bonus)) { M.potion(e, "poison", 1, 2); M.toss(o, e, 4, 1.5); }
      snd(p, "mob.phantom.swoop", 0.8, 1.4);
    });
  } else { // 내리찍기: 균열 + 바위 + 띄우기
    M.anim(p, "smash");
    later(3, () => {
      const c = add(o, f, 1.8), big = stacksOf(p) >= 2, R = big ? 3.6 : 2.8;
      shieldArt(dim, up(add(o, f, 1.4), 0.7), scl(r, -1), norm(add(UP, f, 0.6)), 1.5, { n: 520, life: 0.25 });
      ring(dim, c, { n: 70, spd: big ? 12 : 9, size: 1.5 });
      rocks(dim, c, { n: big ? 34 : 22, r: 1.2, spd: 7.5 });
      smoke(dim, c, { n: 8, r: 1, spd: 1.5, size: 1.6 });
      for (let k = 0; k < 5; k++) { const a = rad(k * 72 + Math.random() * 30); crack(dim, c, { x: Math.cos(a), y: 0, z: Math.sin(a) }, R * (0.7 + Math.random() * 0.5), { life: 1.4 }); }
      for (let k = 0; k < (big ? 5 : 3); k++) { const a = rad(k * (360 / (big ? 5 : 3)) + 20); spike(dim, add(c, { x: Math.cos(a) * 0.9, y: 0, z: Math.sin(a) * 0.9 }), { x: Math.cos(a) * 0.5, y: 1, z: Math.sin(a) * 0.5 }, 1.2 + Math.random() * 0.6, 0.3, { life: 0.8 }); }
      for (const e of foesAround(dim, p, c, R)) if (hit(e, 1.25 * bonus)) knockUp(e, 0.55, 0.8);
      shake(dim, c, 0.35, 0.3);
      snd(p, "random.explode", 0.6, 1.3);
      snd(p, "random.anvil_land", 0.8, 0.6);
    });
  }
}

// ───────── ② 사신박 ─────────
function serpentBind(ctx) {
  st(ctx.p).dmg = ctx.dmg;
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  const v = viewOf(p), f = flat(v), r = { x: -f.z, y: 0, z: f.x };
  const root = () => add(up(p.location, 1.1), flat(viewOf(p)), 0.7);
  const MAX = 11, SPD = 1.9;
  let reach = 0, caught = null, t = 0;
  M.anim(p, "slash");
  snd(p, "mob.phantom.swoop", 1, 0.7);
  try { p.playSound("random.fizz", { volume: 0.6, pitch: 0.6 }); } catch {}
  const body = (head, from, wave) => { // 머리에서 몸쪽으로 물결치는 점들
    const d = sub(head, from), L = len(d), u = scl(d, 1 / (L || 1)), side = norm(cross(u, UP)), pts = [];
    const N = Math.max(3, Math.round(L / 0.45));
    for (let i = 0; i <= N; i++) { const q = i / N, amp = Math.sin(q * Math.PI) * 0.45 * wave; pts.push(add(add(from, d, 1 - q), side, Math.sin(q * 9 + t * 0.9) * amp)); }
    return pts;
  };
  const go = () => {
    t++;
    const R0 = root();
    if (!caught) {
      reach = Math.min(MAX, reach + SPD);
      const head = add(R0, norm(viewOf(p)), reach);
      serpent(dim, body(head, R0, 1), { thick: 0.3 });
      if (t % 2 === 0) glow(dim, head, { n: 3, spd: 0.8, size: 0.7, life: 0.4 });
      for (const e of foesAround(dim, p, head, 1.9)) { if (len(sub(center(e), head)) < 1.6) { caught = e; break; } }
      if (caught) { bind(); return; }
      if (reach >= MAX) { retract(head); return; }
      later(1, go);
    }
  };
  const retract = (from) => {
    for (let k = 1; k <= 4; k++) later(k, () => { const R0 = root(), head = add(R0, sub(from, R0), 1 - k / 4); serpent(dim, body(head, R0, 0.6), { thick: 0.28 }); });
  };
  const bind = () => {
    const e = caught;
    hit(e, 1.1);
    M.potion(e, "poison", 2, 3);
    M.potion(e, "slowness", 3, 2);
    snd(p, "mob.ravager.bite", 0.8, 1.6);
    snd(p, "random.fizz", 0.8, 0.5);
    // 휘감기: 적 둘레를 나선으로 세 바퀴 (10틱) → 끌어옴
    for (let k = 0; k < 12; k++) later(k, () => {
      if (!e.isValid()) return;
      const c = e.location, pts = [];
      for (let i = 0; i <= 26; i++) { const a = i * 0.75 + k * 0.4, y = 0.15 + i * 0.07; pts.push({ x: c.x + Math.cos(a) * 0.62, y: c.y + y, z: c.z + Math.sin(a) * 0.62 }); }
      pts.reverse();
      serpent(dim, pts, { thick: 0.2, life: 0.08 });
      const R0 = root(); serpent(dim, body(pts[pts.length - 1], R0, 0.4), { thick: 0.26, head: false });
      if (k % 3 === 0) glow(dim, center(e), { n: 5, spd: 1.5, size: 0.8, tone: 0.3 });
    });
    later(10, () => {
      if (!e.isValid()) return;
      const d = sub(p.location, e.location), L = Math.hypot(d.x, d.z);
      if (L > 2.2) try { e.applyKnockback(d.x / L, d.z / L, Math.min(3.2, (L - 1.5) * 0.36), 0.35); } catch {}
      hit(e, 0.5, 1);
      glow(dim, center(e), { n: 20, spd: 4, tone: 0.1 });
      snd(p, "mob.phantom.swoop", 1, 1.2);
    });
  };
  go();
  void r;
}

// ───────── ③ 현무진 전개 ─────────
function fortress(ctx) {
  st(ctx.p).dmg = ctx.dmg;
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.anim(p, "smash");
  M.potion(p, "resistance", 1, 5);
  const f = flat(viewOf(p)), r = { x: -f.z, y: 0, z: f.x };
  const base = add({ ...p.location }, f, 2);
  // 큰 방패를 땅에 박음 (위에서 내려와 꽂힘)
  for (let t = 0; t < 4; t++) later(t, () => shieldArt(dim, up(base, 1.9 + (3 - t) * 0.6), scl(r, -1), UP, 3.2, { n: 1100, life: 0.08 }));
  later(4, () => {
    shieldArt(dim, up(base, 1.9), scl(r, -1), UP, 3.2, { n: 1500, life: 5 });
    ring(dim, base, { n: 80, spd: 10, size: 1.6 });
    rocks(dim, base, { n: 26, r: 1.4, spd: 6 });
    smoke(dim, base, { n: 10, r: 1.5, size: 1.8 });
    for (let k = 0; k < 6; k++) crack(dim, base, { x: Math.cos(k * 1.05), y: 0, z: Math.sin(k * 1.05) }, 2 + Math.random() * 1.5, { life: 3 });
    shake(dim, base, 0.4, 0.4);
    snd(p, "random.anvil_land", 1, 0.5);
    snd(p, "random.explode", 0.6, 0.7);
    for (const e of foesAround(dim, p, base, 2.6)) { if (hit(e, 0.8)) M.toss(base, e, 8, 2.5); }
    wall(p, {
      sec: 5, half: 3.6, H: 4.4, big: true,
      onEnd: (w) => { // 벽이 깨지며 앞쪽으로 파편 폭발
        const mid = up(w.P0, w.H / 2);
        pt(dim, "hm_flash", mid, { n: 4, spd: 1, size: 3, life: 0.3 });
        for (let k = 0; k < 7; k++) { const q = add(up(w.P0, 0.5 + Math.random() * w.H), w.r, (k / 6 - 0.5) * 2 * w.half); glow(dim, q, { n: 10, r: 0.2, spd: 6, size: 1.1 }); rocks(dim, q, { n: 5, r: 0.3, spd: 5, life: 1 }); }
        pt(dim, "hm_hex", mid, { u: w.r, v: UP, w: w.n, r: 9, h: 6, scale: 0.55, thick: 0.05, n: 300, size: 1.3, life: 0.4, tone: 0 });
        for (const e of foesAround(dim, p, add(mid, w.n, 2.5), 4.2)) { if (dot(sub(e.location, w.P0), w.n) > -0.5 && hit(e, 1.3)) M.toss(w.P0, e, 10, 3); }
        shake(dim, w.P0, 0.4, 0.3);
        snd(p, "random.glass", 1, 0.6);
        snd(p, "random.explode", 0.8, 1.1);
      },
    });
  });
}

// ───────── ④ 현무붕지 ─────────
function earthbreak(ctx) {
  st(ctx.p).dmg = ctx.dmg;
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  const n = takeStacks(p), mul = 1 + n * 0.2, half = 2 + n * 0.4, L = 20;
  const yaw0 = yawOf(p), f0 = fwdOf(yaw0), r0 = rightOf(yaw0), o = { ...p.location };
  const lines = n >= 3 ? [-11, 11] : [0];
  skillLock.add(p.id);
  M.potion(p, "resistance", 3, 2.5);
  M.anim(p, "raise");
  try { p.applyKnockback(0, 0, 0, 0.6); } catch {}
  snd(p, "mob.ravager.roar", 1, 0.6);
  snd(p, "random.anvil_use", 1, 0.5);
  if (n) notify(p, `§2§l현무 기운 ${n}개 해방!`);
  // 0~8: 머리 위로 거대한 방패를 치켜듦 (먹 연기가 모임)
  for (let t = 0; t < 8; t++) later(t, () => {
    const k = ease((t + 1) / 8), c = add(up(p.location, 3 + k * 1.6), f0, -0.3);
    shieldArt(dim, c, scl(r0, 1), norm(add(UP, f0, -0.3)), 3.2 + k * 1.3, { n: 1300, life: 0.08 });
    if (t % 2 === 0) { const a = Math.random() * Math.PI * 2; smoke(dim, add(c, { x: Math.cos(a) * 3, y: -1, z: Math.sin(a) * 3 }), { n: 3, spd: 1, size: 1.6 }); glow(dim, c, { n: 6, r: 1.5, spd: 1, size: 0.9 }); }
  });
  // 8~10: 내리찍기
  for (let t = 8; t < 11; t++) later(t, () => {
    const k = (t - 7) / 3, c = add(up(p.location, 4.6 - k * 4), f0, 0.3 + k * 1.6);
    shieldArt(dim, c, scl(r0, 1), norm(add(UP, f0, k * 1.6)), 4.5, { n: 1300, life: 0.06 });
    if (t === 8) { M.anim(p, "smash"); try { p.applyKnockback(0, 0, 0, -1.4); } catch {} }
  });
  later(11, () => {
    const G = add(o, f0, 1.8);
    shieldArt(dim, up(G, 0.9), scl(r0, 1), norm(add(UP, f0, 1.4)), 4.5, { n: 1500, life: 2.5 });
    pt(dim, "hm_flash", up(G, 1), { n: 5, spd: 1.5, size: 4, life: 0.35 });
    ring(dim, G, { n: 110, spd: 14, size: 2, life: 0.7 });
    ring(dim, G, { n: 70, spd: 7, size: 1.6, life: 0.8, tone: 0.3 });
    rocks(dim, G, { n: 40, r: 1.8, spd: 9 });
    smoke(dim, G, { n: 16, r: 2, spd: 2.2, size: 2.2, life: 1.6 });
    shake(dim, G, 0.9, 0.7);
    snd(p, "random.explode", 1.3, 0.5);
    snd(p, "random.anvil_land", 1.4, 0.4);
    snd(p, "item.trident.thunder", 0.7, 0.6);
    for (const e of foesAround(dim, p, G, 3)) if (hit(e, 0.8 * mul)) knockUp(e, 0.7, 1);
    for (const deg of lines) wave(deg);
  });
  const done = new Set();
  let first = null;
  function wave(deg) {
    const yw = yaw0 + deg, f = fwdOf(yw), r = rightOf(yw), S = add(o, f, 2.2), STEP = 1.25, N = Math.ceil(L / STEP);
    let ended = false;
    for (let i = 0; i < N; i++) later(i, () => {
      const s = i * STEP, c = add(S, f, s);
      let gy = c.y; try { const top = dim.getTopmostBlock({ x: Math.floor(c.x), z: Math.floor(c.z) }); if (top && Math.abs(top.location.y + 1 - c.y) < 4) gy = top.location.y + 1; } catch {}
      const g = { x: c.x, y: gy, z: c.z };
      // 대지 솟음: 큰 바위판 + 조각 + 먼지, 양쪽 가장자리 비취 균열, 가장자리에서 비스듬히 튀어나오는 바위 조각
      pt(dim, "hm_slab", g, { u: f, v: r, r: STEP, h: half, n: Math.round(16 + half * 6), spd: 7.5, size: 1.4, life: 1.6, tone: 0.05 });
      rocks(dim, g, { n: 10, r: half * 0.7, spd: 5, life: 1.1 });
      if (i % 2 === 0) smoke(dim, g, { n: 4, r: half * 0.6, spd: 1.4, size: 1.6, life: 1.4 });
      for (const sd of [-1, 1]) {
        crack(dim, add(g, r, sd * half), f, STEP + 0.1, { h: 0.12, n: 18, life: 2.2 });
        if (i % 2 === (sd > 0 ? 0 : 1)) spike(dim, add(g, r, sd * (half + 0.1)), add(add(UP, r, sd * 0.7), f, 0.2), 0.9 + Math.random() * 0.8, 0.22, { life: 1.4 });
      }
      if (i % 3 === 0) pt(dim, "hm_hex", up(g, 0.12), { u: f, v: r, w: UP, r: 2, h: Math.round(half * 1.2) + 1, scale: 0.5, thick: 0, n: 60, size: 1, life: 0.9, tone: 0.15 });
      if (i % 4 === 0) snd(p, "dig.stone", 1.2, 0.6 + i * 0.03);
      // 닿은 적: 띄움 (처음 맞은 적은 더 높이, 더 오래)
      for (const e of foesAround(dim, p, g, half + 2.5)) {
        if (done.has(e.id)) continue;
        const d = sub(e.location, S), al = dot(d, f), lat = Math.abs(dot(d, r));
        if (al < s - 1.8 || al > s + 1.8 || lat > half + 0.6) continue;
        done.add(e.id);
        const isFirst = !first;
        if (isFirst) first = e;
        hit(e, (isFirst ? 2.4 : 1.6) * mul, 1);
        knockUp(e, isFirst ? 1.2 : 0.95, isFirst ? 1.8 : 1.3);
        glow(dim, center(e), { n: 14, spd: 4, tone: 0.1 });
        for (let k = 0; k < 3; k++) spike(dim, add(e.location, { x: (Math.random() - 0.5) * 1.2, y: 0, z: (Math.random() - 0.5) * 1.2 }), { x: (Math.random() - 0.5) * 0.6, y: 1, z: (Math.random() - 0.5) * 0.6 }, 1.4 + Math.random(), 0.3, { life: 1.2 });
        if (isFirst) { snd(p, "random.anvil_land", 1, 0.8); shake(dim, e.location, 0.5, 0.4); }
      }
      if (i === N - 1 && !ended) { ended = true; later(2, () => cluster(first && first.isValid() && deg === lines[0] ? { ...first.location } : g, f)); }
    });
  }
  // 끝: 흑요석빛 비취 바위 기둥 다발 + 검은 뱀이 감아 오름
  function cluster(at, f) {
    const K = 7, sp = [];
    for (let k = 0; k < K; k++) {
      const a = (k / K) * Math.PI * 2 + Math.random() * 0.4, tilt = 0.35 + Math.random() * 0.35;
      sp.push({ base: add(at, { x: Math.cos(a) * 0.8, y: -0.3, z: Math.sin(a) * 0.8 }), dir: norm({ x: Math.cos(a) * tilt, y: 1, z: Math.sin(a) * tilt }), L: 3.4 + Math.random() * 2.4, th: 0.55 + Math.random() * 0.3 });
    }
    sp.push({ base: up(at, -0.3), dir: UP, L: 6.2, th: 0.85 });
    for (let t = 0; t < 6; t++) later(t, () => { const k = ease((t + 1) / 6); for (const s of sp) spike(dim, s.base, s.dir, s.L * k, s.th, { life: 0.1 }); });
    later(6, () => { for (const s of sp) spike(dim, s.base, s.dir, s.L, s.th, { life: 3 }); });
    pt(dim, "hm_flash", up(at, 1.5), { n: 4, spd: 1, size: 3.5, life: 0.35 });
    ring(dim, at, { n: 100, spd: 12, size: 1.8 });
    rocks(dim, at, { n: 36, r: 1.5, spd: 9 });
    smoke(dim, at, { n: 14, r: 2, spd: 2, size: 2.2, life: 1.8 });
    glow(dim, up(at, 2), { n: 50, r: 1.2, spd: 6, size: 1.2, life: 1 });
    shake(dim, at, 0.8, 0.6);
    snd(p, "random.explode", 1.2, 0.7);
    snd(p, "random.anvil_land", 1.2, 0.5);
    for (const e of foesAround(dim, p, at, 3.8)) if (hit(e, 1.4 * mul, 1)) knockUp(e, 1.1, 1.4);
    // 검은 뱀이 기둥 다발을 나선으로 감아 오르다가 땅속으로
    for (let t = 0; t < 22; t++) later(6 + t, () => {
      const pts = [], head = Math.min(1, t / 14);
      for (let i = 0; i <= 22; i++) {
        const q = head - i * 0.045;
        if (q < 0) break;
        const a = q * Math.PI * 5, rr = 1.5 - q * 0.6, y = t < 14 ? q * 6 : Math.max(-1, q * 6 - (t - 14) * 0.9);
        pts.push({ x: at.x + Math.cos(a) * rr, y: at.y + y, z: at.z + Math.sin(a) * rr });
      }
      if (pts.length > 1) serpent(dim, pts, { thick: 0.34, tone: 0.18, life: 0.08 });
      if (t === 0) snd(p, "mob.ravager.roar", 0.8, 1.6);
    });
    // 3초 뒤 기둥이 금 가며 부서짐
    later(64, () => {
      for (const s of sp) { const tip = add(s.base, s.dir, s.L * 0.6); rocks(dim, tip, { n: 10, r: 0.5, spd: 4, life: 1.2, tone: 0.2 }); glow(dim, tip, { n: 8, r: 0.6, spd: 2.5, size: 0.9 }); }
      smoke(dim, at, { n: 10, r: 2, spd: 1.5, size: 2, life: 1.4 });
      snd(p, "random.glass", 0.9, 0.5);
    });
    void f;
  }
  later(30, () => skillLock.delete(p.id));
}

/** 무기 스킬 표 */
export const WEAPON_SKILLS = {
  [SHIELD_ID]: [
    { id: "w_hm_1", key: 1, name: "현무 · 귀갑타", short: "귀갑타", lv: 1, mp: 5, cd: 0.35, pow: 1, run: bash, desc: "3타 콤보: 방패 밀치기 → 뱀 꼬리 휘두르기(독) → 내리찍어 균열·바위 기둥·띄우기. 현무 기운 1개당 +15%. 우클릭을 길게 누르면 막기, 맞기 직전 0.3초 안에 누르면 완벽 패링." },
    { id: "w_hm_2", key: 2, name: "현무 · 사신박", short: "사신박", lv: 1, mp: 18, cd: 8, pow: 1, run: serpentBind, desc: "방패에서 검푸른 뱀이 11칸 뻗어 처음 맞은 적을 휘감아(독·느려짐) 내 앞으로 끌어온다." },
    { id: "w_hm_3", key: 3, name: "현무 · 현무진", short: "현무진", lv: 1, mp: 28, cd: 18, pow: 1, run: fortress, desc: "큰 방패를 땅에 박아 5초 동안 육각 등껍질 벽을 세운다. 벽 뒤의 나와 아군은 앞에서 오는 공격을 받지 않고 투사체는 부서진다. 끝날 때 벽이 깨지며 앞으로 파편 폭발." },
    { id: "w_hm_4", key: 4, name: "현무 · 붕지", short: "붕지", lv: 1, mp: 45, cd: 26, pow: 1, run: earthbreak, desc: "거대한 방패를 내리찍어 앞으로 20칸 대지가 솟구치며 닿은 적을 모두 띄우고, 끝에서 흑요석빛 바위 기둥 다발이 솟는다. 현무 기운을 모두 써서 넓고 강해지며, 3개면 두 갈래로 갈라진다." },
  ],
};
