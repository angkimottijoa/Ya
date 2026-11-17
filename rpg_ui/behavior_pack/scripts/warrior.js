// ═══════════════════════════════════════════════════════════════════════
// 전사 계열 직업 스킬 (V10.3) — 승급할수록 같은 스킬이 진화하며 화려해짐, 렉 주의(파티클 예산 · 한 번 뿌리고 끝)
//   1차 전사(강철)  ① 강베기 2타 · ② 돌진 베기 · ③ 대지 강타
//   2차 검성(달빛)  ① 월광 연참 3타(3타 초승달 검기) · ② 섬월(꿰뚫고 X자 베기 자국) · ③ 만월 회전(달 문양)
//   3차 검황(만월·월식) ① 만월 연참 4타(보름달 검기) · ② 월영 섬(달그림자 분신이 한 번 더) · ③ 월식 회전 · ④ 월하 일섬
//   2차 광전사(핏빛) ① 혈참 회전 2타(흡혈) · ② 분노 폭주 · ③ 혈열 강타(피 균열)
//   3차 파괴자(용염) ① 대지 가르기 3타 · ② 용린 폭주 · ③ 낙룡 강하 · ④ 용멸
//   광전사·파괴자: 「분노」 — 때리거나 맞으면 쌓이고 100이면 다음 스킬이 「격노」로 강화(범위·피해·연출 한 겹 더)
//   피해: ctx.dmg(직업 도구 공격력 기반) × 배율. 사신수 대비 1차 약 30% · 2차 45% · 3차 60%
// 파티클: gen_warrior.py (wr_ · mn_ · bl_ · dr_ — 직업마다 전용)
// ═══════════════════════════════════════════════════════════════════════
import { system, world, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
import * as M from "./ms.js";
import { spend } from "./pbudget.js";
import { skillLock } from "./skill_lock.js";

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
const UP = { x: 0, y: 1, z: 0 };
const ease = (s) => s * s * (3 - 2 * s);
const center = (e) => up(e.location, 0.9);
const snd = (p, id, vol = 1, pitch = 1) => M.sound(p, id, pitch, vol);

const DEF = { n: 10, r: 1, thick: 0.3, a0: 0, a1: 0, dur: 0.1, life: 0.4, size: 1, tone: 0, h: 0, spd: 0, vs: 0 };
/** 파티클: prio 0 = 판정과 함께 꼭 보여야 할 것, 1 = 장식, 2 = 큰 장식 (서버 예산이 넘으면 1·2부터 생략) */
function pt(dim, name, loc, o = {}, prio = 1) {
  const n = o.n ?? DEF.n, life = (o.life ?? DEF.life) + (o.dur ?? 0);
  if (!spend(n, life, prio)) return;
  try {
    const m = new MolangVariableMap();
    for (const k of Object.keys(DEF)) m.setFloat(`variable.${k}`, o[k] ?? DEF[k]);
    for (const k of ["u", "v", "w", "vd"]) m.setVector3(`variable.${k}`, o[k] ?? { x: 0, y: 1, z: 0 });
    dim.spawnParticle(`rpg:${name}`, loc, m);
  } catch {}
}
/** 호(베기) 면: yaw 방향 기준, tilt 만큼 기울인 면 → u = 앞, v = 옆(기울어짐), w = 면의 법선 */
function plane(yaw, tilt = 0) {
  const f = fwdOf(yaw), r = rightOf(yaw), t = rad(tilt);
  const v = add(scl(r, Math.cos(t)), UP, Math.sin(t));
  return { u: f, v, w: norm({ x: f.y * v.z - f.z * v.y, y: f.z * v.x - f.x * v.z, z: f.x * v.y - f.y * v.x }) };
}
/** 베기 호: 오른쪽(+) → 왼쪽(-) 으로 그어짐 (dir = -1 이면 반대) */
function arc(dim, name, at, yaw, o = {}) {
  const pl = plane(yaw, o.tilt ?? 0), d = o.dir ?? 1, sw = o.sweep ?? 150;
  pt(dim, name, at, { ...pl, r: o.r ?? 2.6, thick: o.thick ?? 0.7, a0: d * sw / 2, a1: -d * sw / 2, dur: o.dur ?? 0.08, life: o.life ?? 0.35, n: o.n ?? 120, size: o.size ?? 1, tone: o.tone ?? 0, spd: o.spd ?? 1.5, h: o.h ?? 0.15 }, o.prio ?? 0);
}

// ───────── 판정 ─────────
function hitter(ctx) {
  const last = new Map();
  return (e, mul, cd = 4) => {
    if (!e?.isValid() || e.id === ctx.p.id) return false;
    const now = system.currentTick;
    if (now - (last.get(e.id) ?? -99) < cd) return false;
    last.set(e.id, now);
    M.skillHit.set(e.id, now);
    const dmg = Math.max(1, Math.round(ctx.dmg * mul * (ctx.rageMul ?? 1)));
    try { e.applyDamage(dmg, { cause: EntityDamageCause.entityAttack, damagingEntity: ctx.p }); } catch {}
    if (ctx.onHit) ctx.onHit(e, dmg);
    return true;
  };
}
const foes = (dim, at, r) => M.around(dim, at, r).filter((e) => e.isValid());
/** 앞쪽 부채꼴 (cosMin = 각도) */
const cone = (dim, p, r, cosMin = 0.3) => {
  const o = p.location, f = fwdOf(yawOf(p));
  return foes(dim, add(o, f, r * 0.5), r).filter((e) => { const d = sub(e.location, o), L = Math.hypot(d.x, d.z); return L < r && (L < 1.2 || (d.x * f.x + d.z * f.z) / L > cosMin); });
};
const knockUp = (e, v) => { try { e.applyKnockback(0, 0, 0, v); } catch {} };
const shake = (p, pw, sec) => { try { p.runCommand(`camerashake add @s ${pw} ${sec} positional`); } catch {} };
const groundY = (dim, at) => { try { const t = dim.getTopmostBlock({ x: Math.floor(at.x), z: Math.floor(at.z) }); if (t && Math.abs(t.location.y + 1 - at.y) < 4) return t.location.y + 1; } catch {} return at.y; };

// ───────── 콤보 ─────────
const combo = new Map(); // pid|skill → { n, t }
function step(p, key, max, gap = 26) {
  const k = `${p.id}|${key}`, now = system.currentTick, c = combo.get(k);
  const n = c && now - c.t <= gap ? (c.n + 1) % max : 0;
  combo.set(k, { n, t: now });
  return n;
}

// ───────── 분노 (광전사 · 파괴자) ─────────
const RAGE = new Map(); // pid → { v, t }
const RAGE_TOOLS = new Set(["rpg:jt_berserker", "rpg:jt_destroyer"]);
const heldId = (p) => { try { return p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex)?.typeId; } catch { return undefined; } };
export const heldRageTool = (p) => RAGE_TOOLS.has(heldId(p));
function rageAdd(p, v) { const r = RAGE.get(p.id) ?? { v: 0, t: 0 }; r.v = Math.min(100, r.v + v); r.t = system.currentTick; RAGE.set(p.id, r); }
export function rageLine(p) {
  const r = RAGE.get(p.id) ?? { v: 0 };
  const full = Math.round(r.v / 10);
  return r.v >= 100 ? "§4§l격노 §c■■■■■■■■■■ §f다음 스킬 강화" : `§c분노 §4${"■".repeat(full)}§8${"■".repeat(10 - full)} §7${Math.floor(r.v)}`;
}
/** 격노면 소모하고 true */
function takeRage(p) { const r = RAGE.get(p.id); if (r && r.v >= 100) { r.v = 0; return true; } return false; }
// 맞으면 분노 (분노 도구를 든 동안), 5초 동안 싸우지 않으면 서서히 식음
world.afterEvents.entityHurt.subscribe(({ hurtEntity: v, damage }) => {
  if (v?.typeId === "minecraft:player" && damage > 0 && heldRageTool(v)) rageAdd(v, Math.min(15, damage * 2.5));
});
system.runInterval(() => {
  const now = system.currentTick;
  for (const [id, r] of RAGE) if (now - r.t > 100 && r.v > 0 && r.v < 100) r.v = Math.max(0, r.v - 3);
}, 20);
/** 분노 계열 ctx: 때릴 때마다 분노 +6 (한 번 시전에 최대 30) */
function rageCtx(ctx) {
  let got = 0;
  return { ...ctx, onHit: () => { if (got < 30) { got += 6; rageAdd(ctx.p, 6); } } };
}

// ═════════════ 1차 전사 (강철) ═════════════
function w_bash(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), yw = yawOf(p), n = step(p, "w1", 2);
  M.anim(p, "slash");
  const c = up(p.location, 1.1);
  arc(dim, "wr_arc", c, yw, n ? { tilt: 35, dir: -1, r: 2.6, n: 110 } : { r: 2.5, n: 100 });
  later(2, () => {
    for (const e of cone(dim, p, 3.2)) if (hit(e, n ? 0.65 : 0.55)) pt(dim, "wr_spark", center(e), { n: 6, r: 0.3, spd: 4, life: 0.5 });
    snd(p, "random.anvil_land", 0.25, 1.9);
    snd(p, "game.player.attack.sweep", 0.8, n ? 0.9 : 1.1);
  });
}
function w_dash(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), yw = yawOf(p), f = fwdOf(yw);
  M.anim(p, "dash");
  try { p.applyKnockback(f.x, f.z, 2.4, 0.1); } catch {}
  snd(p, "mob.phantom.swoop", 0.7, 1.4);
  for (let t = 1; t <= 6; t++) later(t, () => {
    pt(dim, "wr_dust", p.location, { n: 3, r: 0.4, spd: 1, life: 0.8, size: 1 }, 2);
    for (const e of foes(dim, p.location, 1.8)) hit(e, 0.8, 20);
  });
  later(7, () => {
    arc(dim, "wr_arc", up(p.location, 1.1), yawOf(p), { r: 2.4, n: 100, sweep: 120 });
    for (const e of cone(dim, p, 3)) if (hit(e, 0.5, 1)) pt(dim, "wr_spark", center(e), { n: 8, r: 0.3, spd: 4, life: 0.5 });
    snd(p, "game.player.attack.sweep", 1, 0.9);
  });
}
function w_slam(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.anim(p, "raise");
  try { p.applyKnockback(0, 0, 0, 0.55); } catch {}
  later(7, () => {
    M.anim(p, "smash");
    try { p.applyKnockback(0, 0, 0, -1.2); } catch {}
  });
  later(10, () => {
    const g = { ...p.location };
    pt(dim, "wr_ring", g, { n: 70, r: 0.6, spd: 9, life: 0.5, size: 1.2 }, 0);
    pt(dim, "wr_dust", g, { n: 10, r: 1.5, spd: 2, life: 1, size: 1.4 });
    pt(dim, "wr_spark", up(g, 0.3), { n: 16, r: 0.6, spd: 6, life: 0.6 });
    for (const e of foes(dim, g, 3.5)) if (hit(e, 0.9, 1)) knockUp(e, 0.4);
    shake(p, 0.35, 0.3);
    snd(p, "random.explode", 0.5, 1.3);
    snd(p, "random.anvil_land", 0.6, 0.7);
  });
}

// ═════════════ 2차 검성 / 3차 검황 (달빛) ═════════════
/** 날아가는 달빛 검기: 파티클은 한 번만 뿌리고(스스로 날아감), 판정만 2틱마다 */
function moonWave(ctx, hit, o) {
  const { p } = ctx, dim = p.dimension, yw = yawOf(p), pl = plane(yw, o.tilt ?? 0);
  const start = add(up(p.location, 1.1), pl.u, 0.8), L = o.len ?? 9, spd = o.spd ?? 20, life = L / spd;
  pt(dim, "mn_wave", start, { u: o.full ? pl.v : pl.u, v: o.full ? UP : pl.v, vd: pl.u, vs: spd, r: o.r ?? 2.2, thick: o.thick ?? 0.7, a0: o.full ? 0 : -75, a1: o.full ? 360 : 75, n: o.n ?? 160, life, size: o.size ?? 1.2, tone: o.tone ?? 0 }, 0);
  if (o.stars) pt(dim, "mn_star", start, { n: 12, r: 0.8, spd: 2, life: 0.8, size: 1 });
  const ticks = Math.ceil(life * 20);
  for (let t = 0; t <= ticks; t += 2) later(t + 1, () => {
    const c = add(start, pl.u, (t / 20) * spd);
    for (const e of foes(dim, c, o.hitR ?? 2)) if (hit(e, o.mul, 20)) { pt(dim, "mn_star", center(e), { n: 6, r: 0.3, spd: 2, life: 0.6 }, 2); if (o.onHit) o.onHit(e); }
  });
}
function sm_combo(ctx, emp) { // 검성 ① 월광 연참 (3타) / 검황 ① 만월 연참 (4타)
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), yw = yawOf(p);
  const max = emp ? 4 : 3, n = step(p, emp ? "se1" : "sm1", max);
  const c = up(p.location, 1.1), last = n === max - 1;
  M.anim(p, last ? "slash_down" : "slash");
  if (!last) {
    const o = [{ r: 2.7 }, { tilt: 40, dir: -1, r: 2.8 }, { tilt: -35, r: 2.8 }][n];
    arc(dim, "mn_arc", c, yw, { ...o, n: emp ? 130 : 110, life: 0.4 });
    later(2, () => arc(dim, "mn_arc", c, yw, { ...o, r: (o.r ?? 2.7) - 0.25, n: 50, life: 0.5, tone: 0.35, prio: 1 })); // 잔상
    if (emp) pt(dim, "mn_star", add(c, fwdOf(yw), 1.5), { n: 10, r: 1.2, spd: 1.5, life: 0.9 }, 2);
    later(2, () => { for (const e of cone(dim, p, 3.3)) hit(e, emp ? 0.62 : 0.5); snd(p, "game.player.attack.sweep", 0.8, 1.2 + n * 0.08); snd(p, "random.orb", 0.25, 1.8); });
  } else if (!emp) { // 3타: 초승달 검기
    arc(dim, "mn_arc", c, yw, { r: 2.6, tilt: 15, n: 100 });
    moonWave(ctx, hit, { len: 9, r: 2.2, n: 150, mul: 0.75 });
    snd(p, "mob.phantom.swoop", 0.9, 1.5);
  } else { // 4타: 보름달 검기 (둥근 원이 날아감)
    arc(dim, "mn_arc", c, yw, { r: 2.6, tilt: 90, n: 110 });
    moonWave(ctx, hit, { len: 13, r: 1.6, thick: 0.5, n: 200, full: true, mul: 0.9, spd: 18, stars: true, hitR: 2.3 });
    snd(p, "mob.phantom.swoop", 1, 1.2);
    snd(p, "random.orb", 0.5, 0.6);
  }
}
function sm_flash(ctx, emp) { // 검성 ② 섬월 / 검황 ② 월영 섬
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), yw = yawOf(p), f = fwdOf(yw), r = rightOf(yw);
  const o = { ...p.location }, L = emp ? 12 : 10, MAX = emp ? 5 : 3;
  M.anim(p, "dash");
  M.potion(p, "resistance", 2, 0.6);
  // 앞 L칸 안, 경로에서 1.8칸 안의 적 (가까운 순)
  const marks = foes(dim, add(o, f, L / 2), L / 2 + 2).filter((e) => { const d = sub(e.location, o), al = d.x * f.x + d.z * f.z; return al > 0 && al < L + 1 && Math.abs(d.x * r.x + d.z * r.z) < 1.8; })
    .sort((a, b) => len(sub(a.location, o)) - len(sub(b.location, o))).slice(0, MAX);
  try { p.applyKnockback(f.x, f.z, emp ? 3.2 : 2.8, 0.05); } catch {}
  pt(dim, "mn_line", up(o, 1), { u: f, v: r, w: UP, r: L, n: Math.round(L * 10), life: 0.6, size: 1.2 }, 0);
  if (emp) pt(dim, "mn_line", up(o, 1.2), { u: f, v: r, w: UP, r: L, n: Math.round(L * 5), life: 0.9, size: 0.9, tone: 0.3 }, 1);
  snd(p, "mob.phantom.swoop", 1, 1.6);
  for (const e of marks) hit(e, 0.35);
  // 지나간 뒤 X자 베기 자국이 터짐
  later(10, () => {
    for (const e of marks) {
      if (!e.isValid()) continue;
      const c = center(e);
      arc(dim, "mn_arc", c, yw + 90, { tilt: 45, r: 1.3, thick: 0.4, n: 50, sweep: 120, life: 0.35 });
      arc(dim, "mn_arc", c, yw + 90, { tilt: -45, r: 1.3, thick: 0.4, n: 50, sweep: 120, dir: -1, life: 0.35 });
      if (hit(e, emp ? 0.85 : 0.8, 1)) pt(dim, "mn_star", c, { n: 8, r: 0.3, spd: 3, life: 0.6 }, 2);
    }
    if (marks.length) snd(p, "random.orb", 0.6, 1.7);
  });
  // 검황: 지나간 자리에 남은 달그림자 분신이 한 번 더 벰
  if (emp) later(18, () => {
    for (const e of marks) {
      if (!e.isValid()) continue;
      const c = center(e), back = add(c, f, -1.6);
      pt(dim, "mn_line", up(back, -0.6), { u: UP, v: r, w: f, r: 1.8, n: 30, life: 0.5, size: 1.4, tone: 0.4 }, 1); // 서 있는 그림자
      arc(dim, "mn_arc", c, yw, { r: 1.6, n: 60, sweep: 160, tone: 0.3, life: 0.4 });
      hit(e, 0.5, 1);
    }
    if (marks.length) snd(p, "game.player.attack.sweep", 0.7, 0.8);
  });
}
function sm_spin(ctx, emp) { // 검성 ③ 만월 회전 / 검황 ③ 월식 회전
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), yw = yawOf(p), g = { ...p.location };
  M.anim(p, "spin");
  const turns = emp ? 2 : 1, R = emp ? 4 : 3.5;
  for (let k = 0; k < turns; k++) later(k * 6, () => {
    arc(dim, "mn_arc", up(p.location, 1), yawOf(p), { r: R, sweep: 359, dur: 0.22, n: emp ? 200 : 170, life: 0.45, thick: 0.8, tone: emp && k ? 0.8 : 0 });
    later(3, () => { for (const e of foes(dim, p.location, R + 0.5)) { if (hit(e, emp ? 0.7 : 0.85, 4)) { const d = sub(p.location, e.location), l = Math.hypot(d.x, d.z) || 1; try { e.applyKnockback(d.x / l, d.z / l, 0.35, 0.1); } catch {} } } });
    snd(p, "game.player.attack.sweep", 1, 0.8 + k * 0.15);
  });
  // 바닥 문양: 검성 = 만월(초승달), 검황 = 월식(검게 가려진 달 + 붉은 테)
  pt(dim, "mn_glyph", up(g, 0.08), { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, r: R, h: emp ? 1 : 0, n: emp ? 260 : 200, life: 2, size: 1.2 }, 1);
  pt(dim, "mn_star", up(g, 1), { n: 14, r: R * 0.7, spd: 1, life: 1.2 }, 2);
  if (emp) later(14, () => { // 월식이 끝나며 붉은 테 고리가 터짐
    arc(dim, "mn_arc", up(g, 0.5), 0, { r: R + 0.5, sweep: 359, dur: 0.05, n: 180, life: 0.5, tone: 0.9, spd: 6, h: 0.4 });
    for (const e of foes(dim, g, R + 1)) if (hit(e, 0.9, 1)) knockUp(e, 0.35);
    snd(p, "random.explode", 0.5, 1.6);
    snd(p, "random.orb", 0.6, 0.5);
  });
}
function se_ult(ctx) { // 검황 ④ 월하 일섬
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), yw = yawOf(p), f = fwdOf(yw), r = rightOf(yw), o = { ...p.location };
  skillLock.add(p.id);
  M.potion(p, "resistance", 4, 1.6);
  M.potion(p, "slowness", 6, 0.8);
  M.anim(p, "iai_ready");
  try { p.camera.fade({ fadeTime: { fadeInTime: 0.3, holdTime: 0.5, fadeOutTime: 0.5 }, fadeColor: { red: 0.02, green: 0.03, blue: 0.12 } }); } catch {}
  snd(p, "ambient.weather.thunder", 0.4, 1.6);
  snd(p, "beacon.power_select", 0.8, 0.5);
  // 하늘(앞 18칸, 높이 10)에 거대한 달이 떠오름
  const moonC = add(up(o, 10), f, 18);
  for (let t = 0; t < 3; t++) later(t * 8, () => pt(dim, "mn_glyph", moonC, { u: r, v: UP, r: 7, h: 0, n: 260, life: 0.5, size: 2.4 }, t ? 2 : 1));
  for (let t = 0; t < 12; t += 4) later(t, () => pt(dim, "mn_star", add(up(o, 1), f, 2), { n: 8, r: 1.5, spd: -2, life: 0.5 }, 2));
  // 발도: 앞쪽 전체를 가르는 일섬
  later(14, () => {
    skillLock.delete(p.id);
    M.anim(p, "iai_dash");
    try { p.applyKnockback(f.x, f.z, 2.2, 0.05); } catch {}
    try { p.camera.fade({ fadeTime: { fadeInTime: 0.02, holdTime: 0.03, fadeOutTime: 0.4 }, fadeColor: { red: 0.85, green: 0.92, blue: 1 } }); } catch {}
    pt(dim, "mn_line", up(o, 1.1), { u: r, v: f, w: UP, r: 24, n: 240, life: 0.8, size: 1.6 }, 0);
    pt(dim, "mn_line", add(up(o, 1.1), r, -24), { u: r, v: f, w: UP, r: 24, n: 240, life: 0.8, size: 1.6 }, 0);
    arc(dim, "mn_arc", add(up(o, 1.1), f, -2), yw, { r: 14, sweep: 120, thick: 1.2, dur: 0.06, n: 320, life: 0.6, size: 1.6 });
    // 달이 갈라짐: 위아래 반쪽이 벌어짐 (두 번 그려 벌어지는 느낌)
    pt(dim, "mn_line", moonC, { u: r, v: UP, w: f, r: 9, n: 90, life: 1, size: 1.6, tone: 0.9 }, 1);
    pt(dim, "mn_line", add(moonC, r, -9), { u: r, v: UP, w: f, r: 9, n: 90, life: 1, size: 1.6, tone: 0.9 }, 1);
    for (const [dy, t] of [[0.6, 2], [1.4, 8]]) later(t, () => { pt(dim, "mn_glyph", up(moonC, dy), { u: r, v: UP, r: 7, h: 0, n: 120, life: 0.4, size: 2.2 }, 2); pt(dim, "mn_glyph", up(moonC, -dy), { u: r, v: UP, r: 7, h: 0, n: 120, life: 0.4, size: 2.2 }, 2); });
    snd(p, "mob.phantom.swoop", 1.5, 1.2);
    snd(p, "random.glass", 1, 1.6);
    shake(p, 0.4, 0.4);
  });
  // 늦게 터지는 베임: 앞 부채꼴(약 120도) 16칸 안의 적 모두
  later(22, () => {
    const hits = foes(dim, add(o, f, 8), 10).filter((e) => { const d = sub(e.location, o), L = Math.hypot(d.x, d.z); return L < 16.5 && (d.x * f.x + d.z * f.z) / (L || 1) > 0.45; });
    for (const e of hits) {
      if (hit(e, 2.2, 1)) { knockUp(e, 0.5); arc(dim, "mn_arc", center(e), yw, { r: 1.5, n: 40, sweep: 140, life: 0.3, prio: 1 }); }
    }
    pt(dim, "mn_star", add(up(o, 1.5), f, 6), { n: 40, r: 5, spd: 3, life: 1.2, size: 1.3 }, 2);
    snd(p, "random.explode", 0.8, 1.5);
    snd(p, "random.orb", 0.8, 0.5);
    shake(p, 0.6, 0.5);
  });
  later(30, () => { for (const e of foes(dim, add(o, f, 8), 10)) hit(e, 0.5, 1); }); // 여운
  later(60, () => skillLock.delete(p.id));
}

// ═════════════ 2차 광전사 (핏빛) / 3차 파괴자 (용염) ═════════════
function bk_spin(ctx0) { // 광전사 ① 혈참 회전 (2타, 흡혈)
  const { p } = ctx0, dim = p.dimension, emp = takeRage(p);
  let healed = 0;
  const ctx = rageCtx({ ...ctx0, rageMul: emp ? 1.4 : 1 }), base = ctx.onHit;
  ctx.onHit = (e, d) => { base(e, d); healed += d * 0.05; };
  const hit = hitter(ctx), n = step(p, "bk1", 2), R = (n ? 3.5 : 3) + (emp ? 1.2 : 0);
  M.anim(p, "spin");
  arc(dim, "bl_arc", up(p.location, 1), yawOf(p), { r: R, sweep: 359, dur: 0.16, n: emp ? 200 : 150, thick: 0.9, spd: 4, life: 0.5 });
  if (emp) pt(dim, "bl_mist", up(p.location, 0.6), { n: 12, r: R * 0.6, spd: 1.5, life: 1.2, size: 1.4 }, 2);
  later(3, () => {
    for (const e of foes(dim, p.location, R + 0.4)) if (hit(e, n ? 0.6 : 0.5)) pt(dim, "bl_drop", center(e), { n: 6, r: 0.3, spd: 3, life: 0.8 }, 2);
    if (healed > 0) { try { const hp = p.getComponent("minecraft:health"); hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + healed)); } catch {} }
    snd(p, "game.player.attack.sweep", 1, 0.7);
    if (emp) snd(p, "mob.ravager.roar", 0.5, 1.4);
  });
}
function bk_rage(ctx, emp0) { // 광전사 ② 분노 폭주 / 파괴자 ② 용린 폭주
  const { p } = ctx, dim = p.dimension, dragon = emp0, emp = takeRage(p);
  const sec = (dragon ? 8 : 6) + (emp ? 4 : 0);
  M.anim(p, "raise");
  M.potion(p, "strength", dragon || emp ? 2 : 1, sec);
  M.potion(p, "speed", 1, sec);
  if (dragon) M.potion(p, "resistance", 1, sec);
  rageAdd(p, 25);
  snd(p, "mob.ravager.roar", 0.9, dragon ? 0.6 : 1);
  if (dragon) { pt(dim, "dr_burst", p.location, { n: 30, r: 1.2, spd: 4, life: 0.8, h: 0.3 }, 1); pt(dim, "dr_ember", up(p.location, 1), { n: 20, r: 1, spd: 2, life: 1.2 }, 2); }
  else { pt(dim, "bl_mist", up(p.location, 0.6), { n: 14, r: 1.2, spd: 1.5, life: 1.2, size: 1.3 }, 1); pt(dim, "bl_drop", up(p.location, 1.4), { n: 14, r: 0.6, spd: 3, life: 0.9 }, 2); }
  // 몸의 기운: 0.5초마다 몇 개만 (가볍게)
  const until = system.currentTick + sec * 20;
  const aura = () => {
    if (!p.isValid() || system.currentTick > until) return;
    if (dragon) pt(dim, "dr_ember", up(p.location, 1), { n: 4, r: 0.5, spd: 1, life: 0.8 }, 2);
    else pt(dim, "bl_mist", up(p.location, 0.9), { n: 2, r: 0.4, spd: 0.6, life: 0.9, size: 0.9 }, 2);
    later(10, aura);
  };
  later(10, aura);
  if (dragon) dragonScale.set(p.id, { until, ctx: rageCtx(ctx), last: 0 });
}
// 파괴자 ② 용린 폭주 중: 근접으로 때릴 때마다 작은 충격파 (0.5초에 한 번)
const dragonScale = new Map();
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: p, hitEntity: v }) => {
  const s = dragonScale.get(p?.id);
  if (!s || system.currentTick > s.until || system.currentTick - s.last < 10 || !v?.isValid()) return;
  s.last = system.currentTick;
  const dim = p.dimension, at = v.location, hit = hitter(s.ctx);
  pt(dim, "dr_burst", at, { n: 14, r: 0.8, spd: 4, life: 0.5, h: 0.1 }, 1);
  for (const e of foes(dim, at, 2.2)) hit(e, 0.3, 1);
  snd(p, "random.explode", 0.3, 1.6);
});
function bk_slam(ctx0, dragon) { // 광전사 ③ 혈열 강타 / 파괴자 ③ 낙룡 강하
  const { p } = ctx0, dim = p.dimension, emp = takeRage(p), ctx = rageCtx({ ...ctx0, rageMul: emp ? 1.4 : 1 }), hit = hitter(ctx);
  M.anim(p, "raise");
  try { p.applyKnockback(0, 0, 0, dragon ? 1.35 : 0.6); } catch {}
  const hang = dragon ? 14 : 7;
  if (dragon) { later(8, () => M.potion(p, "slow_falling", 1, 0.5)); pt(dim, "dr_ember", p.location, { n: 16, r: 0.8, spd: 2, life: 1 }, 2); snd(p, "mob.enderdragon.flap", 0.8, 1); }
  later(hang, () => { M.anim(p, "smash"); try { p.removeEffect("slow_falling"); p.applyKnockback(0, 0, 0, -2); } catch {} });
  let tt = 0;
  const wait = () => { tt++; let g = false; try { g = p.isOnGround; } catch {} if ((tt > 2 && g) || tt > 30) impact(); else later(1, wait); };
  later(hang + 1, wait);
  const impact = () => {
    const g = { ...p.location }, yw = yawOf(p);
    shake(p, dragon ? 0.7 : 0.45, 0.4);
    if (!dragon) { // 피 균열: 세 방향(격노면 다섯 방향)
      const N = emp ? 5 : 3, L = emp ? 9 : 6;
      pt(dim, "bl_drop", up(g, 0.4), { n: 24, r: 0.8, spd: 5, life: 0.9 }, 1);
      pt(dim, "bl_mist", g, { n: 10, r: 1.5, spd: 1.2, life: 1.2 }, 2);
      for (let k = 0; k < N; k++) {
        const a = yw + (k - (N - 1) / 2) * (360 / N), d = fwdOf(a), side = rightOf(a);
        pt(dim, "bl_crack", up(g, 0.06), { u: d, v: side, r: L, h: 0.35, n: Math.round(L * 12), life: 2.5, thick: Math.random() * 30, size: 1.2 }, 0);
        for (const e of foes(dim, add(g, d, L / 2), L / 2 + 1)) { const q = sub(e.location, g), al = q.x * d.x + q.z * d.z; if (al > -0.5 && al < L + 0.5 && Math.abs(q.x * side.x + q.z * side.z) < 1.4) hit(e, 0.85, 1); }
      }
      for (const e of foes(dim, g, 2.5)) hit(e, 0.85, 1);
      snd(p, "random.explode", 0.6, 1.1);
      snd(p, "mob.ravager.bite", 0.6, 0.7);
    } else { // 낙룡: 큰 불꽃 분출 + 바위 + 사방 용암 균열
      pt(dim, "dr_burst", g, { n: emp ? 80 : 60, r: 1.5, spd: 9, life: 0.9, h: 0.15, size: 1.3 }, 0);
      pt(dim, "dr_rock", g, { n: 24, r: 1.5, spd: 8, life: 1.4 }, 1);
      pt(dim, "dr_ember", up(g, 0.5), { n: 30, r: 2, spd: 3, life: 1.4 }, 2);
      const N = emp ? 8 : 6;
      for (let k = 0; k < N; k++) { const a = yw + k * (360 / N), d = fwdOf(a); pt(dim, "dr_crack", up(g, 0.06), { u: d, v: rightOf(a), r: 4 + Math.random() * 2, h: 0.3, n: 60, life: 2.4, thick: Math.random() * 30 }, 1); }
      for (const e of foes(dim, g, emp ? 6 : 5)) if (hit(e, 1.3, 1)) knockUp(e, 0.55);
      snd(p, "random.explode", 1, 0.7);
      snd(p, "mob.enderdragon.growl", 0.6, 1.2);
    }
  };
}
function ds_combo(ctx0) { // 파괴자 ① 대지 가르기 (3타)
  const { p } = ctx0, dim = p.dimension, ctx = rageCtx(ctx0), hit = hitter(ctx), yw = yawOf(p), f = fwdOf(yw), n = step(p, "ds1", 3);
  const c = up(p.location, 1.1);
  if (n < 2) {
    M.anim(p, "slash");
    arc(dim, "dr_arc", c, yw, n ? { tilt: 35, dir: -1, r: 2.8, n: 120 } : { r: 2.7, n: 110 });
    later(2, () => { for (const e of cone(dim, p, 3.3)) hit(e, n ? 0.6 : 0.55); snd(p, "game.player.attack.sweep", 0.9, 0.7); snd(p, "fire.ignite", 0.5, 0.8); });
    return;
  }
  // 3타: 내려찍어 앞으로 10칸 균열 + 바위판
  M.anim(p, "slash_down");
  arc(dim, "dr_arc", c, yw, { tilt: 90, r: 2.6, n: 120 });
  later(3, () => {
    const emp = takeRage(p), L = emp ? 14 : 10, o = { ...p.location }, side = rightOf(yw);
    if (emp) ctx.rageMul = 1.4;
    pt(dim, "dr_crack", up(o, 0.06), { u: f, v: side, r: L, h: 0.35, n: L * 12, life: 2.4, thick: Math.random() * 30, size: 1.3 }, 0);
    for (let s = 1; s < L; s += 2.2) later(s / 2, () => {
      const q = add(o, f, s), g = { x: q.x, y: groundY(dim, q), z: q.z };
      pt(dim, "dr_rock", g, { n: 8, r: 0.7, spd: 6.5, life: 1.1 }, 1);
      if (s % 4.4 < 2.2) pt(dim, "dr_burst", g, { n: 10, r: 0.5, spd: 3, life: 0.6, h: 0.8 }, 2);
      for (const e of foes(dim, g, 1.8)) if (hit(e, 0.8, 20)) knockUp(e, 0.4);
    });
    shake(p, 0.4, 0.3);
    snd(p, "random.explode", 0.7, 0.9);
    snd(p, "dig.stone", 1, 0.6);
  });
}
function ds_ult(ctx0) { // 파괴자 ④ 용멸
  const { p } = ctx0, dim = p.dimension, emp = takeRage(p), ctx = rageCtx({ ...ctx0, rageMul: emp ? 1.3 : 1 }), hit = hitter(ctx);
  const yw = yawOf(p), o = { ...p.location }, L = 16;
  skillLock.add(p.id);
  M.potion(p, "resistance", 4, 1.8);
  M.anim(p, "raise");
  snd(p, "mob.enderdragon.growl", 1.2, 0.6);
  // 0~12: 도끼를 치켜들며 불씨가 소용돌이쳐 모임
  for (let t = 0; t < 12; t += 3) later(t, () => {
    const a = t * 0.5;
    pt(dim, "dr_ember", add(up(p.location, 1), { x: Math.cos(a) * 2, y: 0, z: Math.sin(a) * 2 }), { n: 8, r: 0.4, spd: 1, life: 0.6 }, 2);
    pt(dim, "dr_arc", up(p.location, 1.2), { ...plane(yw + t * 30, 0), r: 2, sweep: 359, a0: 0, a1: 359, dur: 0.1, n: 50, life: 0.3 }, 2);
  });
  later(12, () => {
    skillLock.delete(p.id);
    M.anim(p, "smash");
    shake(p, 0.8, 0.6);
    snd(p, "random.explode", 1.2, 0.5);
    snd(p, "mob.enderdragon.growl", 1.3, 0.9);
    pt(dim, "dr_burst", o, { n: 70, r: 1.5, spd: 8, life: 0.9, h: 0.1, size: 1.4 }, 0);
    pt(dim, "dr_rock", o, { n: 24, r: 1.5, spd: 8, life: 1.3 }, 1);
    for (const e of foes(dim, o, 3.5)) if (hit(e, 0.8, 1)) knockUp(e, 0.5);
    // 세 갈래 균열이 앞으로 갈라져 나감 (불기둥이 차례로 솟음)
    const ends = [];
    for (const deg of [-20, 0, 20]) {
      const d = fwdOf(yw + deg), side = rightOf(yw + deg);
      ends.push(add(o, d, L));
      pt(dim, "dr_crack", up(o, 0.06), { u: d, v: side, r: L, h: 0.45, n: L * 12, life: 3, thick: Math.random() * 30, size: 1.4 }, 0);
      for (let s = 2; s <= L; s += 2) later(s / 1.6, () => {
        const q = add(o, d, s), g = { x: q.x, y: groundY(dim, q), z: q.z };
        pt(dim, "dr_burst", g, { n: 16, r: 0.6, spd: 6, life: 0.7, h: 0.9 }, s % 4 ? 2 : 1); // 불기둥
        pt(dim, "dr_rock", g, { n: 6, r: 0.6, spd: 7, life: 1 }, 2);
        for (const e of foes(dim, g, 2)) if (hit(e, 1.0, 40)) { knockUp(e, 0.6); try { e.setOnFire(3, true); } catch {} }
        if (s % 6 === 0) snd(p, "random.explode", 0.5, 1.1);
      });
    }
    // 끝: 용의 아가리처럼 양쪽 불기둥 줄이 닫히며 터짐
    later(12, () => {
      const mid = add(o, fwdOf(yw), L), right = rightOf(yw);
      for (let k = 0; k <= 6; k++) later(k, () => {
        for (const sg of [-1, 1]) { const q = add(add(mid, right, sg * (6 - k)), fwdOf(yw), -Math.sin((k / 6) * Math.PI) * 2); pt(dim, "dr_burst", { x: q.x, y: groundY(dim, q), z: q.z }, { n: 14, r: 0.5, spd: 7, life: 0.7, h: 1 }, k % 2 ? 2 : 1); }
      });
      later(7, () => {
        pt(dim, "dr_burst", mid, { n: 80, r: 2.5, spd: 10, life: 1, h: 0.2, size: 1.5 }, 0);
        pt(dim, "dr_ember", up(mid, 1), { n: 40, r: 3, spd: 4, life: 1.5 }, 2);
        for (const e of foes(dim, mid, 6)) if (hit(e, 1.3, 1)) knockUp(e, 0.8);
        shake(p, 0.6, 0.5);
        snd(p, "random.explode", 1.3, 0.6);
      });
    });
  });
  later(60, () => skillLock.delete(p.id));
}

/** 직업 스킬 실행표: jobs.js 의 wr 필드 → 함수
 *  3차는 피해 ×1.25 (도구 공격력 차이를 맞춰 사신수 대비 약 60%), 1차 약 30% · 2차 약 45% */
const T3 = new Set(["sword_emperor", "destroyer"]);
const RAW = {
  w_bash, w_dash, w_slam,
  sm_combo: (c) => sm_combo(c, false), sm_flash: (c) => sm_flash(c, false), sm_spin: (c) => sm_spin(c, false),
  se_combo: (c) => sm_combo(c, true), se_flash: (c) => sm_flash(c, true), se_spin: (c) => sm_spin(c, true), se_ult,
  bk_spin, bk_rage: (c) => bk_rage(c, false), bk_slam: (c) => bk_slam(c, false),
  ds_combo, ds_rage: (c) => bk_rage(c, true), ds_slam: (c) => bk_slam(c, true), ds_ult,
};
export const WR = Object.fromEntries(Object.entries(RAW).map(([k, fn]) => [k, (ctx) => fn({ ...ctx, dmg: ctx.dmg * (T3.has(ctx.s?.path) ? 1.25 : 1) })]));
