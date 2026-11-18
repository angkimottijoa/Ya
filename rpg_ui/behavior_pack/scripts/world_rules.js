// 월드 규칙 (V12.109) — 관리자 도구 > 스킬 도움 에서 바꿈
//   PvP: 플레이어끼리 일반 공격 + 모든 스킬 피해 켜기/끄기 (파티원 · 자기 자신은 항상 제외)
//   파티클 최적화: lite(항상) / auto(살아 있는 파티클 6만 넘으면 자동) / full(끄기)
import { world, system, Entity, Dimension, MolangVariableMap } from "@minecraft/server";
import { getJSON, setJSON } from "./db.js";
import { partyOf } from "./party.js";

let opt = null;
const all = () => (opt ??= { pvp: false, fx: "auto", ...getJSON(world, "rpg:worldrules", {}) });
const persist = () => setJSON(world, "rpg:worldrules", all());

// ───────── PvP ─────────
export const pvpOn = () => !!all().pvp;
export function setPvp(v) {
  all().pvp = !!v; persist();
  try { world.getDimension("overworld").runCommand(`gamerule pvp ${v ? "true" : "false"}`); } catch {}
}
/** 시전자가 이 대상을 칠 수 있나 (플레이어끼리는 PvP 켜짐 · 다른 사람 · 다른 파티일 때만) */
export function canHit(src, target) {
  try {
    if (target?.typeId !== "minecraft:player" || src?.typeId !== "minecraft:player") return true;
    if (src.id === target.id || !pvpOn()) return false;
    const pt = partyOf(src.id);
    return !(pt && pt.members.includes(target.id));
  } catch { return false; }
}

system.runTimeout(() => { try { world.getDimension("overworld").runCommand(`gamerule pvp ${pvpOn() ? "true" : "false"}`); } catch {} }, 60); // 월드 열 때 설정 다시 적용

// ───────── 시전자 문맥: 스킬이 예약한 나중 동작(system.run · runTimeout · runInterval)에도 시전자를 이어 줌 ─────────
let CUR = null;
export const caster = () => CUR;
export let contextOk = false;
export function withCaster(p, fn) {
  const prev = CUR; CUR = p;
  try { return fn(); } finally { CUR = prev; }
}
try {
  for (const k of ["run", "runTimeout", "runInterval"]) {
    const orig = system[k].bind(system);
    system[k] = (fn, ...rest) => {
      const c = CUR;
      if (!c) return orig(fn, ...rest);
      return orig((...a) => { const prev = CUR; CUR = c; try { return fn(...a); } finally { CUR = prev; } }, ...rest);
    };
  }
  contextOk = true;
} catch { contextOk = false; }

/** 스킬 대상 목록에 플레이어를 넣을 때 쓰는 제외 목록 / 거르기 */
export const pvpScan = () => pvpOn() && contextOk && !!CUR;
export const keepTarget = (e) => e.typeId !== "minecraft:player" || canHit(CUR, e);

let critHook = null;
/** combat.js 가 등록: 플레이어 → 치명 배율 */
export function setCritHook(fn) { critHook = fn; }
// 플레이어가 받는 스킬 피해는 여기서 한 번 더 거름 (어느 스킬이든 같은 규칙)
try {
  const ad = Entity.prototype.applyDamage;
  Entity.prototype.applyDamage = function (amount, o) {
    try {
      if (this.typeId === "minecraft:player") {
        const src = o?.damagingEntity ?? CUR;
        if (src?.typeId === "minecraft:player" && !canHit(src, this)) return false;
      }
      // 스킬 치명타 (민첩): 플레이어가 준 스킬 피해 (평타는 combat.js 가 따로 굴림)
      const src = o?.damagingEntity ?? CUR;
      if (critHook && src?.typeId === "minecraft:player" && src.id !== this.id) {
        const m = critHook(src);
        if (m > 1) { amount *= m; try { this.dimension.spawnParticle("minecraft:critical_hit_emitter", { ...this.location, y: this.location.y + 1 }); } catch {} }
      }
    } catch {}
    return ad.call(this, amount, o);
  };
} catch {}

// ───────── 파티클 최적화 ─────────
export const FX_MODES = { lite: "항상 최적화", auto: "자동 (파티클 6만 넘으면)", full: "끄기 (최적화 안 함)" };
export const fxMode = () => all().fx ?? "auto";
export function setFxMode(m) { all().fx = FX_MODES[m] ? m : "auto"; persist(); }
const AUTO_AT = 60000, AUTO_OFF = 42000; // 6만 넘으면 켜고, 4.2만 아래로 내려오면 끔
const LITE_K = 0.35; // 최적화 중 파티클 개수 배율
const RING = 600, bucket = new Float64Array(RING);
let alive = 0, last = -1, autoLite = false;
function advance() {
  const now = system.currentTick;
  if (last < 0) last = now;
  if (now - last > RING) { alive = 0; bucket.fill(0); }
  else for (let t = last + 1; t <= now; t++) { const i = t % RING; alive -= bucket[i]; bucket[i] = 0; }
  if (alive < 0) alive = 0;
  last = now;
  if (!autoLite && alive > AUTO_AT) autoLite = true;
  else if (autoLite && alive < AUTO_OFF) autoLite = false;
}
export const particlesAlive = () => { advance(); return Math.round(alive); };
export function liteNow() {
  const m = fxMode();
  if (m === "lite") return true;
  if (m === "full") return false;
  advance(); return autoLite;
}
try {
  // 모든 스킬 파티클은 variable.n(개수) · life · dur 를 넘김 → 개수를 줄이고, 뿌린 양을 셈
  const sf = MolangVariableMap.prototype.setFloat;
  MolangVariableMap.prototype.setFloat = function (name, v) {
    if (name === "variable.n") { if (liteNow()) v = Math.max(1, Math.round(v * LITE_K)); this.__n = v; }
    else if (name === "variable.life") this.__life = v;
    else if (name === "variable.dur") this.__dur = v;
    return sf.call(this, name, v);
  };
  const sp = Dimension.prototype.spawnParticle;
  Dimension.prototype.spawnParticle = function (id, loc, m) {
    try {
      const n = m?.__n ?? 1, life = (m?.__life ?? 1) + (m?.__dur ?? 0);
      advance();
      alive += n;
      bucket[(system.currentTick + Math.max(1, Math.ceil(life * 20))) % RING] += n;
    } catch {}
    return sp.call(this, id, loc, m);
  };
} catch {}
