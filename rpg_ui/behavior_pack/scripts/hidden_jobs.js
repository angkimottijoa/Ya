// ═══════════════════════════════════════════════════════════════════════
// 히든 직업 셋 (V11.6) — 3차 대신 고르는 숨겨진 길 (영혼 수확자와 같은 방식: 2차 이상 · Lv.40 이상에서 조건 처치 → 승급 목록)
//   시간술사 chronomancer   해금: 시계를 지닌 채 새벽·해 질 녘에 몬스터 200      자원 「시간 조각」(6) · 패시브 되감기
//   심연의 기사 abyss_knight 해금: Y 0 아래 지하에서 체력 30% 이하로 몬스터 150   자원 「침식」(100) · 침식만큼 강해지고 위험해짐
//   혼령 인도자 spirit_shepherd 해금: 길들인 동물 5마리 이상 곁에 두고 몬스터 200   자원 「유대」(100) · 패시브 혼령 늑대
//   효율: 촉수 · 블랙홀 · 시곗바늘 · 톱니는 파티클이 스스로 움직임(parametric), 짐승은 그림째로 스스로 달려감 → 한 번 뿌리고 끝
// 파티클: gen_hidden.py (tm_ · ab_ · sp_) + 마법진 캐스터(시계판)
// ═══════════════════════════════════════════════════════════════════════
import { system, world, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
import * as M from "./ms.js";
import { spend } from "./pbudget.js";
import { drawMagic } from "./magic.js";
import { skillLock } from "./skill_lock.js";
import { data, save, notify } from "./player.js";
import { BEAST } from "./sp_meta.js";

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
const perp = (u) => { const w = norm(Math.abs(u.y) > 0.9 ? crs(u, { x: 1, y: 0, z: 0 }) : crs(u, UP)); return { v: norm(crs(w, u)), w }; };
const heldId = (p) => { try { return p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex)?.typeId; } catch { return undefined; } };

const DEF = { n: 10, r: 1, w: 0.1, m: 8, rot: 0, spin: 0, spd: 1, life: 0.6, size: 1, tone: 0, vs: 0, thick: 0.2, h: 0.3, seed: 0, dur: 0.2, a0: 0, a1: 0, x0: 0, iw: 1, ih: 1, cx: 0, cy: 0, scale: 0.1 };
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
    const now = system.currentTick;
    if (now - (last.get(e.id) ?? -99) < cd) return false;
    last.set(e.id, now);
    M.skillHit.set(e.id, now);
    try { e.applyDamage(Math.max(1, Math.round(ctx.dmg * mul * (ctx.mulx ?? 1))), { cause: EntityDamageCause.entityAttack, damagingEntity: ctx.p }); } catch {}
    ctx.onHit?.(e);
    return true;
  };
}
const foes = (dim, at, r) => M.around(dim, at, r).filter((e) => e.isValid());
const shake = (p, pw, sec) => { try { p.runCommand(`camerashake add @s ${pw} ${sec} positional`); } catch {} };
const combo = new Map();
function step(p, key, max, gap = 28) { const k = `${p.id}|${key}`, now = system.currentTick, c = combo.get(k), n = c && now - c.t <= gap ? (c.n + 1) % max : 0; combo.set(k, { n, t: now }); return n; }
function aim(p, maxD = 22) {
  try { const h = p.getEntitiesFromViewDirection({ maxDistance: maxD }).map((x) => x.entity).find((e) => e?.isValid() && e.id !== p.id && e.typeId !== "minecraft:item"); if (h) return { at: center(h), ent: h }; } catch {}
  try { const b = p.getBlockFromViewDirection({ maxDistance: maxD }); if (b) return { at: add(b.block.location, { x: 0.5, y: 1, z: 0.5 }) }; } catch {}
  return { at: add(eyeOf(p), viewOf(p), maxD) };
}
const healPct = (p, f) => { try { const hp = p.getComponent("minecraft:health"); hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + hp.effectiveMax * f)); } catch {} };

// ═════════════ 해금 ═════════════
const isTime = (a, b) => { try { const t = world.getTimeOfDay(); return a <= b ? t >= a && t <= b : t >= a || t <= b; } catch { return false; } };
const hasItem = (p, id) => { try { const c = p.getComponent("minecraft:inventory").container; for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === id) return true; } catch {} return false; };
const tamedNear = (p) => { try { return p.dimension.getEntities({ location: p.location, maxDistance: 24, families: ["mob"] }).filter((e) => { try { return !!e.getComponent("minecraft:is_tamed"); } catch { return false; } }).length; } catch { return 0; } };
export const HIDDEN = {
  chronomancer: { need: 200, label: "멈춘 초침", ok: (p) => hasItem(p, "minecraft:clock") && (isTime(11500, 13500) || isTime(22500, 1000)), lines: ["§6§o「째깍… 째깍… 시간이 너를 지켜본다.」", "§6§o「초침이 거꾸로 돌기 시작했다.」", "§6§l「시간의 문이 열렸노라.」"] },
  abyss_knight: { need: 150, label: "심연의 시선", ok: (p) => { try { const hp = p.getComponent("minecraft:health"); return p.location.y < 0 && hp.currentValue <= hp.effectiveMax * 0.3; } catch { return false; } }, lines: ["§4§o「아래에서 무언가가 너를 본다.」", "§4§o「더 깊이. 더 위태롭게.」", "§4§l「심연이 너를 기사로 삼았다.」"] },
  spirit_shepherd: { need: 200, label: "짐승의 혼", ok: (p) => tamedNear(p) >= 5, lines: ["§a§o「짐승의 혼이 너를 따른다.」", "§a§o「무리의 울음이 들린다.」", "§a§l「너는 이제 혼령들의 인도자다.」"] },
};
world.afterEvents.entityDie.subscribe(({ deadEntity: e, damageSource }) => {
  const k = damageSource?.damagingEntity;
  if (k?.typeId !== "minecraft:player") return;
  let mob = false; try { mob = e.matches({ families: ["monster"] }); } catch {}
  if (!mob) return;
  const d = data(k);
  if (!d.adv2 || d.lv < 40) return;
  let changed = false;
  for (const [id, h] of Object.entries(HIDDEN)) {
    d.hidden ??= {};
    if (d.hidden[id] === "open" || d.adv3 === id || !h.ok(k)) continue;
    const n = (d.hidden[id] ?? 0) + 1;
    d.hidden[id] = n; changed = true;
    if (n === 1) notify(k, `§8…${h.label}`);
    if (n === Math.floor(h.need / 3)) k.sendMessage(h.lines[0]);
    if (n === Math.floor((h.need * 2) / 3)) k.sendMessage(h.lines[1]);
    if (n % 25 === 0 && n < h.need) notify(k, `§8${h.label} §7${n}/${h.need}`);
    if (n >= h.need) { d.hidden[id] = "open"; k.sendMessage(`${h.lines[2]} §r§7(메뉴 > 직업·스킬 > 승급 에 숨겨진 길이 열렸다)`); snd(k, "ui.toast.challenge_complete", 1, 1); }
  }
  if (changed) save(k);
});
export const hiddenOpen = (d) => Object.keys(HIDDEN).filter((id) => d.hidden?.[id] === "open");

// ═════════════ 시간술사 (황동 · 금 · 하늘빛) ═════════════
const TM_C = [1, 0.82, 0.45];
const TIME_SHARD = new Map(); // 시간 조각 (최대 6)
const tmAdd = (p, n) => TIME_SHARD.set(p.id, Math.min(6, (TIME_SHARD.get(p.id) ?? 0) + n));
export const isChrono = (p) => heldId(p) === "rpg:jt_chronomancer";
const HIST = new Map(); // 위치·체력 기록 (10틱마다, 최근 6초)
const REWIND_CD = new Map();
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    let d; try { d = data(p); } catch { continue; }
    if (d.adv3 !== "chronomancer") continue;
    const h = HIST.get(p.id) ?? [];
    let hp = 0; try { hp = p.getComponent("minecraft:health").currentValue; } catch {}
    h.push({ at: { ...p.location }, hp, t: system.currentTick });
    while (h.length > 12) h.shift();
    HIST.set(p.id, h);
  }
}, 10);
const past = (p, ticks) => { const h = HIST.get(p.id) ?? []; const want = system.currentTick - ticks; return h.find((x) => x.t >= want) ?? h[0]; };
/** 시계판 마법진 (12눈금 + 시침 · 분침이 거꾸로 돎) */
function clockFace(dim, c, normal, R, life, o = {}) {
  drawMagic(dim, c, normal, [{ t: "ring", r: 1, w: 0.05 }, { t: "ring", r: 0.93 }, { t: "spoke", r: 0.8, r2: 0.92, m: 12, w: 0.07 }, { t: "spoke", r: 0.84, r2: 0.92, m: 60, w: 0.015 }, { t: "rune", r: 0.7, m: 12, spin: 0, size: 1.2 }, { t: "ring", r: 0.1 }], { R, color: TM_C, life, draw: 0.3, yaw: o.yaw ?? 0, size: 1 });
  const n = norm(normal), b = Math.abs(n.y) > 0.9 ? { u: { x: 1, y: 0, z: 0 }, v: norm(crs(n, { x: 1, y: 0, z: 0 })) } : (() => { const u = norm(crs(UP, n)); return { u, v: norm(crs(n, u)) }; })();
  pt(dim, "tm_hand", c, { u: b.u, v: b.v, r: R * 0.55, w: R * 0.08, rot: 90, spin: -(o.fast ?? 1) * 120, n: 40, life, size: 1.3 }, 1); // 시침
  pt(dim, "tm_hand", c, { u: b.u, v: b.v, r: R * 0.82, w: R * 0.05, rot: 0, spin: -(o.fast ?? 1) * 480, n: 50, life, size: 1.1 }, 1); // 분침
}
function tm_combo(ctx0) {
  const { p } = ctx0, dim = p.dimension, ctx = { ...ctx0, onHit: () => tmAdd(p, 0.34) }, hit = hitter(ctx), yw = yawOf(p), n = step(p, "tm1", 3), c = up(p.location, 1.1);
  const f = fwdOf(yw), r = rightOf(yw), flat = { u: f, v: r };
  M.anim(p, n === 2 ? "spin" : "slash");
  if (n < 2) {
    // 시곗바늘 칼날 두 개가 몸 앞에서 반 바퀴 휙 (스스로 돎)
    pt(dim, "tm_hand", c, { ...flat, r: 3.4, w: 0.35, rot: n ? 80 : -80, spin: n ? -900 : 900, n: 70, life: 0.22, size: 1.4 }, 0);
    pt(dim, "tm_hand", up(c, -0.2), { ...flat, r: 2.6, w: 0.25, rot: n ? 60 : -60, spin: n ? -700 : 700, n: 40, life: 0.25, size: 1.1, tone: 0.6 }, 1);
    later(2, () => { for (const e of foes(dim, add(p.location, f, 1.6), 3.4)) { const d = sub(e.location, p.location), L = Math.hypot(d.x, d.z); if (L < 3.6 && (L < 1.2 || (d.x * f.x + d.z * f.z) / L > 0.15)) if (hit(e, n ? 0.62 : 0.55)) pt(dim, "tm_burst", center(e), { n: 8, r: 0.2, spd: 3, life: 0.5 }, 2); } });
    snd(p, "random.click", 0.8, 1.6 + n * 0.2); snd(p, "game.player.attack.sweep", 0.7, 1.3);
    return;
  }
  ctx0.setCd?.(8);
  clockFace(dim, up(p.location, 0.1), UP, 3.8, 0.9, { yaw: yw, fast: 3 });
  pt(dim, "tm_gear", up(p.location, 1), { ...flat, r: 3.6, w: 0.35, m: 16, spin: 260, n: 120, life: 0.6, size: 1.2 }, 1);
  later(8, () => {
    pt(dim, "tm_burst", up(p.location, 1), { n: 60, r: 2.5, spd: 6, life: 0.8, size: 1.2 }, 0);
    for (const e of foes(dim, p.location, 4)) hit(e, 0.9, 1);
    snd(p, "block.bell.hit", 1, 1.4); shake(p, 0.3, 0.3);
  });
}
const FROZEN = new Map(); // 적 id → { until, dmg }
world.afterEvents.entityHurt.subscribe(({ hurtEntity: e, damage }) => {
  const f = FROZEN.get(e?.id); if (f && system.currentTick <= f.until) f.dmg += damage;
  // 시간술사 패시브: 큰 피해로 체력 25% 아래가 되면 3초 전으로 되감기 (90초에 한 번)
  if (e?.typeId !== "minecraft:player") return;
  let d; try { d = data(e); } catch { return; }
  if (d.adv3 !== "chronomancer" || system.currentTick < (REWIND_CD.get(e.id) ?? 0)) return;
  try {
    const hp = e.getComponent("minecraft:health");
    if (hp.currentValue > hp.effectiveMax * 0.25) return;
    const pst = past(e, 60); if (!pst) return;
    REWIND_CD.set(e.id, system.currentTick + 1800);
    const from = { ...e.location };
    e.teleport(pst.at, { keepVelocity: false });
    hp.setCurrentValue(Math.max(hp.currentValue, pst.hp));
    pt(e.dimension, "tm_sand", up(from, 2.5), { n: 40, r: 0.8, spd: 2, life: 1.2 }, 0);
    clockFace(e.dimension, up(pst.at, 0.1), UP, 2, 1.2, { fast: -4 });
    notify(e, "§6§l되감기! §r§7(90초 뒤 다시)");
    snd(e, "block.bell.resonate", 1, 1.6);
  } catch {}
});
function tm_freeze(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), from = add(eyeOf(p), viewOf(p), 1), tgt = aim(p).at, L = Math.max(1, len(sub(tgt, from))), spd = 26;
  M.anim(p, "cast");
  pt(dim, "tm_shard", from, { vd: norm(sub(tgt, from)), vs: spd, life: L / spd, n: 40, r: 0.2, size: 1.3 }, 0);
  snd(p, "random.click", 1, 0.8);
  later(Math.ceil((L / spd) * 20), () => {
    clockFace(dim, up(tgt, -0.8), UP, 3, 2.2, { fast: 0.2 });
    pt(dim, "tm_gear", up(tgt, 0.5), { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, r: 3.4, w: 0.3, m: 20, spin: 30, n: 110, life: 2.2, size: 1.1 }, 1);
    const until = system.currentTick + 40, list = foes(dim, tgt, 3.5);
    for (const e of list) { hit(e, 0.6, 1); M.potion(e, "slowness", 255, 2); M.potion(e, "weakness", 3, 2); try { e.clearVelocity?.(); } catch {} FROZEN.set(e.id, { until, dmg: 0 }); }
    snd(p, "block.bell.hit", 0.8, 0.6);
    later(41, () => { // 풀릴 때: 멈춘 동안 받은 피해의 40% 가 한꺼번에 더 들어감
      for (const e of list) {
        const f = FROZEN.get(e.id); FROZEN.delete(e.id);
        if (!e.isValid()) continue;
        pt(dim, "tm_burst", center(e), { n: 20, r: 0.3, spd: 4, life: 0.6 }, 1);
        hit(e, 0.5 + Math.min(2, (f?.dmg ?? 0) * 0.4 / Math.max(1, ctx.dmg)), 1);
      }
      tmAdd(p, 1);
      snd(p, "random.glass", 0.7, 1.4);
    });
  });
}
function tm_rewind(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), h = HIST.get(p.id) ?? [], pst = past(p, 40);
  if (!pst) return;
  const trail = h.filter((x) => x.t >= pst.t).map((x) => x.at).concat([{ ...p.location }]);
  M.anim(p, "spin");
  try { p.teleport(pst.at, { keepVelocity: false }); } catch {}
  pt(dim, "tm_sand", up(trail[trail.length - 1], 2.5), { n: 30, r: 0.6, spd: 2, life: 1 }, 1);
  // 지나온 자리마다 잔상이 남아 한꺼번에 벰
  trail.forEach((at, i) => later(2 + i, () => {
    const c = up(at, 1.1);
    pt(dim, "tm_hand", c, { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, r: 2.2, w: 0.25, rot: i * 60, spin: 1000, n: 40, life: 0.3, size: 1.2 }, i % 2 ? 1 : 0);
    pt(dim, "tm_burst", c, { n: 10, r: 0.3, spd: 2, life: 0.5, tone: 0.7 }, 2);
    for (const e of foes(dim, at, 2.6)) hit(e, 0.75, 6);
  }));
  const shards = TIME_SHARD.get(p.id) ?? 0;
  if (shards >= 3) { TIME_SHARD.set(p.id, shards - 3); healPct(p, 0.12); notify(p, "§6시간 조각 3개 → 체력 회복"); }
  snd(p, "block.bell.resonate", 0.8, 1.8); snd(p, "mob.endermen.portal", 0.6, 1.4);
}
function tm_ult(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx), g = { ...p.location }, R = 8, yw = yawOf(p);
  const shards = TIME_SHARD.get(p.id) ?? 0; TIME_SHARD.set(p.id, 0);
  const mul = 1 + shards * 0.08;
  skillLock.add(p.id); later(10, () => skillLock.delete(p.id));
  M.anim(p, "raise");
  clockFace(dim, up(g, 0.1), UP, R, 4.4, { yaw: yw, fast: 0.6 });
  for (let k = 0; k < 4; k++) { const a = rad(k * 90 + 45), at = { x: g.x + Math.cos(a) * (R + 1.5), y: g.y + 3 + (k % 2), z: g.z + Math.sin(a) * (R + 1.5) }, nn = norm(sub(g, at)), b = perp(nn); pt(dim, "tm_gear", at, { u: b.w, v: b.v, r: 1.6, w: 0.3, m: 12, spin: k % 2 ? 90 : -90, n: 70, life: 4.4, size: 1.1 }, 2); }
  for (let t = 0; t < 80; t += 10) later(t, () => pt(dim, "tm_sand", up(g, 9), { n: 40, r: R * 0.8, spd: 1.5, life: 1.6 }, 2));
  snd(p, "block.bell.resonate", 1, 0.6);
  later(10, () => { for (const e of foes(dim, g, R)) { M.potion(e, "slowness", 3, 1.6); hit(e, 0.4, 1); } });
  later(40, () => { for (const e of foes(dim, g, R)) { M.potion(e, "slowness", 255, 2); M.potion(e, "weakness", 3, 2); try { e.clearVelocity?.(); } catch {} } snd(p, "block.bell.hit", 1, 0.5); });
  // 열두 번 종: 눈금마다 차례로 폭발 → 가운데 큰 폭발
  for (let k = 0; k < 12; k++) later(44 + k * 3, () => {
    const a = rad(k * 30 - 90 - yw), at = { x: g.x + Math.cos(a) * R * 0.86, y: g.y + 0.5, z: g.z + Math.sin(a) * R * 0.86 };
    pt(dim, "tm_burst", at, { n: 20, r: 0.4, spd: 5, life: 0.6 }, k % 2 ? 1 : 0);
    for (const e of foes(dim, at, 3)) hit(e, 0.28 * mul, 2);
    snd(p, "block.bell.hit", 0.7, 0.6 + k * 0.08);
  });
  later(82, () => {
    pt(dim, "tm_burst", up(g, 1), { n: 120, r: 2, spd: 9, life: 1, size: 1.4 }, 0);
    pt(dim, "tm_sand", up(g, 4), { n: 60, r: R * 0.6, spd: 4, life: 1.2 }, 2);
    for (const e of foes(dim, g, R)) if (hit(e, 1.6 * mul, 1)) M.toss(g, e, 7, 4);
    shake(p, 0.7, 0.6); snd(p, "random.explode", 1, 1.2); snd(p, "block.bell.resonate", 1.2, 0.4);
  });
  later(100, () => skillLock.delete(p.id));
}
export const tmLine = (p) => { const s = Math.floor(TIME_SHARD.get(p.id) ?? 0), cd = Math.max(0, Math.ceil(((REWIND_CD.get(p.id) ?? 0) - system.currentTick) / 20)); return `§6시간 조각 §e${"◆".repeat(s)}§8${"◇".repeat(6 - s)}  ${cd ? `§7되감기 ${cd}s` : "§a되감기 준비"}`; };

// ═════════════ 심연의 기사 (칠흑 · 자주 · 핏빛) ═════════════
const ERO = new Map(); // 침식 0~100
const eroAdd = (p, v) => ERO.set(p.id, Math.max(0, Math.min(100, (ERO.get(p.id) ?? 0) + v)));
export const isAbyss = (p) => heldId(p) === "rpg:jt_abyss_knight";
const ABYSSAL = new Map(); // 심연화 끝 틱
world.afterEvents.entityHurt.subscribe(({ hurtEntity: v, damage }) => {
  if (v?.typeId !== "minecraft:player" || damage <= 0 || !isAbyss(v)) return;
  eroAdd(v, damage * 3);
  // 침식만큼 위험: 받는 피해 최대 +15%
  const extra = damage * 0.15 * ((ERO.get(v.id) ?? 0) / 100);
  if (extra >= 0.5) try { const hp = v.getComponent("minecraft:health"); hp.setCurrentValue(Math.max(1, hp.currentValue - extra)); } catch {}
});
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: p, hitEntity: e }) => { // 심연화 중 근접 흡혈
  if (p?.typeId === "minecraft:player" && (ABYSSAL.get(p.id) ?? 0) > system.currentTick && e?.isValid()) { healPct(p, 0.025); pt(p.dimension, "ab_burst", center(e), { n: 6, r: 0.2, spd: 2, life: 0.4 }, 2); }
});
system.runInterval(() => { for (const [id, v] of ERO) if (v > 0 && (ABYSSAL.get(id) ?? 0) < system.currentTick) ERO.set(id, Math.max(0, v - 1)); }, 20);
const abMul = (p) => 1 + ((ERO.get(p.id) ?? 0) / 100) * 0.3 + ((ABYSSAL.get(p.id) ?? 0) > system.currentTick ? 0.35 : 0);
/** 촉수: base 에서 dir 방향 길이 L, 꿈틀대며 자라남 */
const tendril = (dim, base, dir, L, o = {}) => { const u = norm(dir), b = perp(u); pt(dim, "ab_tendril", base, { u, v: b.v, w: b.w, r: L, thick: o.thick ?? 0.28, h: o.h ?? 0.45, spd: o.spd ?? 4, seed: Math.random() * 9, dur: o.grow ?? 0.25, life: o.life ?? 1, n: o.n ?? Math.round(L * 22), size: o.size ?? 1, tone: o.tone ?? 0 }, o.prio ?? 0); };
const abArc = (dim, at, yaw, o = {}) => { const f = fwdOf(yaw), r = rightOf(yaw), t = rad(o.tilt ?? 0), v = { x: r.x * Math.cos(t), y: Math.sin(t), z: r.z * Math.cos(t) }, d = o.dir ?? 1, sw = o.sweep ?? 160; pt(dim, "ab_arc", at, { u: f, v, r: o.r ?? 3, thick: o.thick ?? 0.9, a0: (d * sw) / 2, a1: (-d * sw) / 2, dur: o.dur ?? 0.1, life: o.life ?? 0.45, n: o.n ?? 160, size: o.size ?? 1.2, spd: 2 }, 0); };
function ab_combo(ctx0) {
  const { p } = ctx0, dim = p.dimension, ctx = { ...ctx0, mulx: abMul(p), onHit: () => eroAdd(p, 3) }, hit = hitter(ctx), yw = yawOf(p), f = fwdOf(yw), n = step(p, "ab1", 3), c = up(p.location, 1.1);
  M.anim(p, n === 2 ? "slash_down" : "slash");
  if (n < 2) {
    abArc(dim, c, yw, n ? { tilt: 30, dir: -1, r: 3.2 } : { tilt: -20, r: 3.1 });
    tendril(dim, add(c, rightOf(yw), n ? 1.5 : -1.5), add(f, rightOf(yw), n ? -0.8 : 0.8), 3, { life: 0.4, grow: 0.08, prio: 1 }); // 칼을 따라 뻗는 촉수
    later(2, () => { for (const e of foes(dim, add(p.location, f, 1.6), 3.3)) { const d = sub(e.location, p.location), L = Math.hypot(d.x, d.z); if (L < 3.5 && (L < 1.2 || (d.x * f.x + d.z * f.z) / L > 0.15)) hit(e, n ? 0.62 : 0.55); } });
    snd(p, "game.player.attack.sweep", 0.8, 0.6); snd(p, "mob.warden.attack_impact", 0.3, 1.4);
    return;
  }
  ctx0.setCd?.(8);
  const g = add(p.location, f, 2.5);
  pt(dim, "ab_mist", g, { n: 8, r: 1.4, spd: 0.8, life: 1.3 }, 2);
  for (let k = 0; k < 5; k++) later(k, () => { const a = rad(k * 72 + yw), b = { x: g.x + Math.cos(a) * 1.4, y: g.y, z: g.z + Math.sin(a) * 1.4 }; tendril(dim, b, { x: Math.cos(a) * 0.35, y: 1, z: Math.sin(a) * 0.35 }, 3.6, { life: 0.9, grow: 0.15 }); });
  later(4, () => { for (const e of foes(dim, g, 3.2)) if (hit(e, 0.95, 1)) try { e.applyKnockback(0, 0, 0, 0.6); } catch {} shake(p, 0.35, 0.3); snd(p, "mob.warden.emerge", 0.5, 1.4); });
}
function ab_grasp(ctx0) {
  const { p } = ctx0, dim = p.dimension, ctx = { ...ctx0, mulx: abMul(p), onHit: () => eroAdd(p, 3) }, hit = hitter(ctx), yw = yawOf(p), f = fwdOf(yw), o = { ...p.location };
  M.anim(p, "cast");
  const grabbed = [];
  for (let k = 0; k < 6; k++) later(k * 2, () => {
    const d = 3 + k * 1.6, side = ((k % 2) * 2 - 1) * (0.6 + k * 0.25), at = add(add(o, f, d), rightOf(yw), side);
    tendril(dim, at, UP, 2.4, { life: 1.4, grow: 0.12, h: 0.5, thick: 0.32 });
    for (const e of foes(dim, at, 2)) if (!grabbed.includes(e)) { grabbed.push(e); hit(e, 0.6, 1); M.potion(e, "slowness", 6, 1); }
    snd(p, "mob.warden.dig", 0.4, 1.6);
  });
  later(16, () => { for (const e of grabbed) { if (!e.isValid()) continue; const d = sub(p.location, e.location), L = Math.hypot(d.x, d.z); if (L > 2) try { e.applyKnockback(d.x / L, d.z / L, Math.min(3, (L - 1.5) * 0.36), 0.3); } catch {} tendril(dim, center(e), d, Math.min(L, 6), { life: 0.4, grow: 0.05, prio: 1 }); } snd(p, "mob.warden.attack_impact", 0.6, 0.8); });
}
function ab_void(ctx0) {
  const { p } = ctx0, dim = p.dimension, ctx = { ...ctx0, mulx: abMul(p), onHit: () => eroAdd(p, 4) }, hit = hitter(ctx), yw = yawOf(p), f = fwdOf(yw), o = { ...p.location };
  const t = foes(dim, add(o, f, 6), 7).filter((e) => { const d = sub(e.location, o), L = Math.hypot(d.x, d.z); return L < 12.5 && (d.x * f.x + d.z * f.z) / (L || 1) > 0.3; }).sort((a, b) => len(sub(a.location, o)) - len(sub(b.location, o)))[0];
  const vf = { u: rightOf(yw), v: UP };
  pt(dim, "ab_void", up(o, 1), { ...vf, r: 1.3, spd: 1.5, spin: 300, n: 90, life: 0.7, size: 1.1 }, 0);
  const to = t ? add(t.location, norm({ x: t.location.x - o.x, y: 0, z: t.location.z - o.z }), 1.8) : add(o, f, 8);
  later(3, () => {
    try { p.teleport(to, { facingLocation: t ? center(t) : add(to, f, 3), keepVelocity: false }); } catch {}
    pt(dim, "ab_void", up(to, 1), { ...vf, r: 1.4, spd: 1.5, spin: -300, n: 90, life: 0.6, size: 1.1 }, 0);
    abArc(dim, up(to, 1.1), yawOf(p), { r: 2.8, sweep: 200 });
    pt(dim, "ab_burst", up(to, 1), { n: 24, r: 0.4, spd: 4, life: 0.6 }, 1);
    for (const e of foes(dim, to, 3)) hit(e, t && e.id === t.id ? 1.2 : 0.7, 1);
    snd(p, "mob.endermen.portal", 0.8, 0.6); snd(p, "game.player.attack.sweep", 0.8, 0.5);
  });
}
function ab_ult(ctx0) {
  const { p } = ctx0, dim = p.dimension, full = (ERO.get(p.id) ?? 0) >= 100, sec = full ? 12 : 7;
  ERO.set(p.id, full ? 100 : ERO.get(p.id) ?? 0);
  const until = system.currentTick + sec * 20;
  ABYSSAL.set(p.id, until);
  M.anim(p, "raise");
  M.potion(p, "strength", full ? 3 : 2, sec); M.potion(p, "speed", 2, sec); M.potion(p, "resistance", 2, sec);
  pt(dim, "ab_mist", up(p.location, 0.6), { n: 24, r: 1.5, spd: 1.5, life: 1.6, size: 1.4 }, 1);
  for (let k = 0; k < 8; k++) { const a = rad(k * 45); tendril(dim, { x: p.location.x + Math.cos(a), y: p.location.y, z: p.location.z + Math.sin(a) }, { x: Math.cos(a), y: 1.6, z: Math.sin(a) }, 3.5, { life: 1.2, grow: 0.2 }); }
  snd(p, "mob.warden.roar", 1, 0.9); shake(p, 0.5, 0.6);
  if (full) notify(p, "§4§l침식 100 — 완전한 심연화");
  // 등의 촉수 날개 양쪽 두 가닥씩 (0.25초마다 몸을 따라 다시 그림, 그 사이엔 스스로 꿈틀)
  const wings2 = () => {
    if (!p.isValid() || system.currentTick > until) return;
    const yw = yawOf(p), back = add(up(p.location, 1.3), fwdOf(yw), -0.35), r = rightOf(yw);
    for (const s2 of [-1, 1]) for (const k of [0, 1]) tendril(dim, back, add(add(add({ x: 0, y: 0, z: 0 }, r, s2), UP, 0.6 + k * 0.5), fwdOf(yw), -0.5), 2.6 - k * 0.5, { life: 0.28, grow: 0.01, h: 0.35, spd: 6, thick: 0.18, n: 40, prio: 2 });
    later(5, wings2);
  };
  later(2, wings2);
  // 끝: 블랙홀이 열려 빨아들인 뒤 터짐
  later(sec * 20, () => {
    const g = { ...p.location }, ctx = { ...ctx0, mulx: abMul(p) * (full ? 1.3 : 1) }, hit = hitter(ctx), R = full ? 7 : 5;
    pt(dim, "ab_void", up(g, 0.2), { u: { x: 1, y: 0, z: 0 }, v: { x: 0, y: 0, z: 1 }, r: R, spd: 1.2, spin: 200, n: 260, life: 1.6, size: 1.4 }, 0);
    for (let t = 0; t < 30; t += 4) later(t, () => { for (const e of foes(dim, g, R + 2)) { const d = sub(g, e.location), L = Math.hypot(d.x, d.z) || 1; try { e.applyKnockback(d.x / L, d.z / L, 0.5, 0.05); } catch {} } });
    later(32, () => { pt(dim, "ab_burst", up(g, 1), { n: 90, r: 1.5, spd: 8, life: 0.9, size: 1.4 }, 0); for (const e of foes(dim, g, R)) if (hit(e, 1.8, 1)) M.toss(g, e, 7, 4); shake(p, 0.7, 0.6); snd(p, "mob.warden.sonic_boom", 1, 0.8); ERO.set(p.id, 0); });
    snd(p, "mob.warden.heartbeat", 1, 0.8);
  });
}
export const abLine = (p) => { const v = Math.floor(ERO.get(p.id) ?? 0), on = (ABYSSAL.get(p.id) ?? 0) > system.currentTick, b = Math.round(v / 10); return on ? `§4§l심연화 §c${Math.ceil(((ABYSSAL.get(p.id) ?? 0) - system.currentTick) / 20)}s` : `§5침식 §4${"■".repeat(b)}§8${"■".repeat(10 - b)} §7${v}`; };

// ═════════════ 혼령 인도자 (은빛 · 연두) ═════════════
const BOND = new Map();
const bondAdd = (p, v) => BOND.set(p.id, Math.min(100, (BOND.get(p.id) ?? 0) + v));
export const isShepherd = (p) => heldId(p) === "rpg:jt_spirit_shepherd";
/** 짐승 그림: at 에서 dir 방향으로 L 칸을 sec 초 동안 달려감 (한 번 뿌림) */
function beast(dim, kind, at, dir, L, sec, o = {}) {
  const b = BEAST[kind], u = norm({ x: dir.x, y: o.fly ? dir.y : 0, z: dir.z }), w = norm(crs(u, UP)), v = UP, sc = o.scale ?? 0.07;
  pt(dim, "sp_beast", at, { ...b, u, v, w, vd: u, vs: L / sec, life: sec, scale: sc, n: Math.round(b.filled * 1.25 * (o.dens ?? 1)), size: o.size ?? 1, tone: o.tone ?? 0 }, o.prio ?? 0);
}
// 패시브: 혼령 늑대가 곁을 따라다니며(0.5초마다 그림) 2초마다 가까운 적을 물어뜯음
const WOLF_T = new Map();
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    if (!isShepherd(p)) continue;
    let d; try { d = data(p); } catch { continue; }
    if (d.adv3 !== "spirit_shepherd") continue;
    const yw = yawOf(p), at = add(add(p.location, rightOf(yw), -1.6), fwdOf(yw), 0.4);
    beast(p.dimension, "wolf", up(at, 0.85), fwdOf(yw), 0.01, 0.55, { scale: 0.055, dens: 0.5, prio: 2, tone: 0.1 });
    const now = system.currentTick;
    if (now - (WOLF_T.get(p.id) ?? 0) < 40) continue; // 2초마다 물기
    const e = foes(p.dimension, p.location, 6)[0];
    if (!e) continue;
    WOLF_T.set(p.id, now);
    const dir = sub(e.location, at);
    beast(p.dimension, "wolf", up(at, 0.85), dir, len(dir), 0.3, { scale: 0.055, prio: 1 });
    later(6, () => { if (!e.isValid()) return; try { e.applyDamage(Math.max(1, Math.round(4 + d.lv * 0.12)), { cause: EntityDamageCause.entityAttack, damagingEntity: p }); } catch {} pt(p.dimension, "sp_burst", center(e), { n: 8, r: 0.2, spd: 2, life: 0.5 }, 2); bondAdd(p, 3); });
  }
}, 10); // 0.5초마다 (상시 부하 적게)
function sp_command(ctx0) {
  const { p } = ctx0, dim = p.dimension, ctx = { ...ctx0, onHit: () => bondAdd(p, 5) }, hit = hitter(ctx), n = step(p, "sp1", 3), a = aim(p, 18);
  M.anim(p, "cast");
  const yw = yawOf(p), from = up(add(p.location, rightOf(yw), -1.2), 0.85), to = a.ent ? { ...a.ent.location, y: a.ent.location.y + 0.85 } : a.at;
  const dir = sub(to, from), L = len(dir), sec = Math.max(0.2, L / 22);
  beast(dim, n === 2 ? "bear" : "wolf", from, dir, L, sec, { scale: n === 2 ? 0.09 : 0.07 });
  pt(dim, "sp_wisp", from, { vd: norm(dir), vs: L / sec, life: sec, n: 20, r: 0.3, size: 1 }, 2);
  snd(p, "mob.wolf.growl", 0.6, 1.2);
  if (n === 2) ctx0.setCd?.(8);
  later(Math.ceil(sec * 20), () => {
    for (const e of foes(dim, to, n === 2 ? 2.6 : 1.8)) if (hit(e, [0.6, 0.65, 0.9][n], 1)) { if (n === 2) { try { e.applyKnockback(0, 0, 0, 0.8); } catch {} } }
    pt(dim, "sp_burst", to, { n: n === 2 ? 30 : 14, r: 0.3, spd: n === 2 ? 5 : 3, life: 0.6 }, 1);
    snd(p, n === 2 ? "mob.polarbear.warning" : "mob.wolf.bark", 0.8, 1);
  });
}
function sp_crows(ctx0) {
  const { p } = ctx0, dim = p.dimension, ctx = { ...ctx0, onHit: () => bondAdd(p, 2) }, hit = hitter(ctx), yw = yawOf(p), o = up(p.location, 1.6);
  M.anim(p, "shoot_up");
  snd(p, "mob.parrot.fly", 1, 0.6);
  for (let k = 0; k < 12; k++) later(Math.floor(k / 3) * 2, () => {
    const dir = norm(add(fwdOf(yw + (k - 5.5) * 7), UP, (Math.random() - 0.3) * 0.25)), L = 14;
    beast(dim, "crow", add(o, rightOf(yw), (k % 3 - 1) * 0.8), dir, L, 0.7, { scale: 0.05, fly: true, prio: k < 6 ? 0 : 1 });
    for (let t = 2; t <= 14; t += 3) later(t, () => { const c = add(o, dir, (t / 14) * L); for (const e of foes(dim, c, 1.6)) if (hit(e, 0.3, 6)) M.potion(e, "blindness", 1, 2); });
  });
}
function sp_deer(ctx0) {
  const { p } = ctx0, dim = p.dimension, ctx = { ...ctx0, onHit: () => bondAdd(p, 4) }, hit = hitter(ctx), yw = yawOf(p), f = fwdOf(yw), at = up(add(p.location, rightOf(yw), 1.6), 0.95);
  M.anim(p, "raise");
  beast(dim, "deer", at, f, 0.01, 1, { scale: 0.08 });
  pt(dim, "sp_heal", p.location, { n: 40, r: 5, spd: 1.5, life: 1.4 }, 1);
  try { for (const a of dim.getPlayers({ location: p.location, maxDistance: 6 })) { healPct(a, 0.15); M.potion(a, "regeneration", 2, 4); pt(dim, "sp_heal", a.location, { n: 12, r: 0.5, spd: 1.2, life: 1 }, 2); } } catch {}
  snd(p, "block.amethyst_block.chime", 1, 0.8);
  later(18, () => { // 뿔 돌진
    beast(dim, "deer", at, f, 9, 0.45, { scale: 0.08 });
    for (let t = 1; t <= 9; t += 2) later(t, () => { const c = add(at, f, t); for (const e of foes(dim, c, 1.8)) if (hit(e, 0.8, 20)) M.toss(c, e, 9, 3); });
    snd(p, "mob.horse.gallop", 1, 0.8);
  });
}
function sp_ult(ctx0) {
  const { p } = ctx0, dim = p.dimension, bond = BOND.get(p.id) ?? 0, ctx = { ...ctx0, mulx: 1 + (bond / 100) * 0.5 }, hit = hitter(ctx), yw = yawOf(p), f = fwdOf(yw), r = rightOf(yw), o = { ...p.location };
  BOND.set(p.id, 0);
  skillLock.add(p.id); later(10, () => skillLock.delete(p.id));
  M.anim(p, "raise");
  drawMagic(dim, up(o, 0.1), UP, [{ t: "ring", r: 1, w: 0.04 }, { t: "rune", r: 0.88, m: 24, spin: 12 }, { t: "poly", r: 0.8, m: 4, k: 1, spin: -10, rot: 45 }, { t: "ring", r: 0.3 }], { R: 3, color: [0.6, 1, 0.75], life: 3, draw: 0.3, yaw: yw });
  snd(p, "mob.wolf.howl", 1, 0.8);
  // 뒤에서 여섯 줄로 혼령 짐승 스물넷이 앞으로 휩쓸고 지나감 (한 마리 = 한 번 뿌림)
  const kinds = ["wolf", "deer", "bear", "wolf", "crow", "wolf"];
  let k = 0;
  for (let row = 0; row < 6; row++) for (let col = -2; col <= 1; col++) {
    const kind = kinds[(row + col + 6) % kinds.length], i = k++;
    later(6 + row * 4, () => {
      const start = up(add(add(o, f, -3), r, col * 2 + 1 + (row % 2) * 0.6), kind === "crow" ? 2.5 : kind === "bear" ? 1.1 : 0.9);
      beast(dim, kind, start, f, 24, 1.1, { scale: kind === "bear" ? 0.09 : kind === "crow" ? 0.055 : 0.07, prio: i % 3 ? 1 : 0, fly: kind === "crow" });
    });
  }
  for (let t = 8; t < 40; t += 3) later(t, () => {
    const front = Math.min(22, ((t - 8) / 22) * 24);
    for (const e of foes(dim, add(o, f, front), 5)) { const d = sub(e.location, o), al = d.x * f.x + d.z * f.z, lat = Math.abs(d.x * r.x + d.z * r.z); if (al > -1 && al < 23 && lat < 4.5) if (hit(e, 0.55, 8)) M.toss(o, e, 6, 2.5); }
    if (t % 9 === 2) snd(p, "mob.horse.gallop", 1, 0.7);
  });
  later(40, () => { pt(dim, "sp_burst", up(add(o, f, 20), 1), { n: 60, r: 2, spd: 6, life: 1 }, 1); snd(p, "mob.wolf.howl", 1, 1.2); });
  later(80, () => skillLock.delete(p.id));
}
export const spLine = (p) => { const b = Math.floor(BOND.get(p.id) ?? 0), n = Math.round(b / 10); return `§a유대 §2${"■".repeat(n)}§8${"■".repeat(10 - n)} §7${b}`; };

const RAW = { tm_combo, tm_freeze, tm_rewind, tm_ult, ab_combo, ab_grasp, ab_void, ab_ult, sp_command, sp_crows, sp_deer, sp_ult };
/** 3차 수준 피해 (×1.25) */
export const HJ = Object.fromEntries(Object.entries(RAW).map(([k, fn]) => [k, (ctx) => fn({ ...ctx, dmg: ctx.dmg * 1.25 })]));
/** HUD: 든 도구에 맞는 자원 줄 */
export const hiddenLine = (p) => (isChrono(p) ? tmLine(p) : isAbyss(p) ? abLine(p) : isShepherd(p) ? spLine(p) : "");
