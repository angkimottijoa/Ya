// ═══════════════════════════════════════════════════════════════════════
// MagicSpells 인터프리터 (V3.0)
//   ms_convert.py 가 자바 MagicSpells yml 을 옮긴 msdata.js 를 원본 의미 그대로 실행한다.
//   - MultiSpell / TargetedMultiSpell : spells 목록을 순서대로, "DELAY n" 틱 대기
//   - modifiers : buffactive X castinstead Y / buffactive X required|denied (콤보) 지원, sneaking 은 발동 키가 대신함
//   - 효과 position : caster / target / special(투사체·범위 중심) / pos1(그림자 이동 출발점) / line(흡혈 선)
//   - 피해 : 원본 수치 × (스킬 위력 / 25)
// ═══════════════════════════════════════════════════════════════════════
import { system, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
import { SPELLS } from "./msdata.js";
import { skillHit } from "./ms.js";

const EXCLUDE = { excludeTypes: ["minecraft:player", "minecraft:item", "minecraft:xp_orb", "rpg:npc", "minecraft:armor_stand"], excludeFamilies: ["inanimate"] };
export const msHit = skillHit; // victimId -> tick (combat.js 보너스 중복 방지)
const buffs = new Map(); // `${pid}|${dummy}` -> 만료 tick

const later = (t, fn) => (t > 0 ? system.runTimeout(() => { try { fn(); } catch {} }, Math.round(t)) : (() => { try { fn(); } catch {} })());
const hexRGB = (h) => ({ red: parseInt(h.slice(1, 3), 16) / 255, green: parseInt(h.slice(3, 5), 16) / 255, blue: parseInt(h.slice(5, 7), 16) / 255, alpha: 1 });
const clean = (n) => String(n).replace(/\(.*\)$/, "").trim();
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// ───────── 효과 재생 ─────────
// 틱당 이미터 수 제한 (원본은 서버가 점마다 보내지만, 베드락은 이미터 하나가 점 수백 개라 이 정도면 충분)
const budget = new Map(); // pid -> { t, n }
const BUDGET = 36;
function spend(p) {
  const b = budget.get(p.id);
  const t = system.currentTick;
  if (!b || b.t !== t) { budget.set(p.id, { t, n: 1 }); return true; }
  return ++b.n <= BUDGET;
}
function playOne(ctx, f, loc, yaw) {
  const dim = ctx.p.dimension;
  if (!f.snd && !spend(ctx.p)) return;
  if (f.snd) {
    try { dim.playSound(f.snd, loc, { pitch: f.pi ?? 1, volume: Math.min(1.5, f.v ?? 1) }); } catch {}
    return;
  }
  const at = { x: loc.x, y: loc.y + (f.hy ?? 0), z: loc.z };
  if (f.burst) {
    const m = new MolangVariableMap();
    m.setColorRGBA("variable.color", hexRGB(f.burst));
    m.setFloat("variable.n", Math.min(60, f.n ?? 10));
    m.setFloat("variable.r", f.sp ?? 0.3);
    try { dim.spawnParticle("rpg:mss_burst", at, m); } catch {}
    return;
  }
  if (!f.p) return;
  const m = new MolangVariableMap();
  m.setColorRGBA("variable.color", hexRGB(f.c ?? "#FFFFFF"));
  m.setFloat("variable.yaw", yaw ?? 0);
  m.setFloat("variable.ori", f.o ?? 0);
  m.setFloat("variable.life", f.l ?? 1);
  m.setFloat("variable.size", ctx.size ?? 1);
  try { dim.spawnParticle(f.p, at, m); } catch {}
}
/** 스펠의 효과 중 pos 가 맞는 것만 (delay 반영) */
function play(ctx, sp, pos, loc, yaw) {
  if (!sp.fx || !loc) return;
  for (const f of sp.fx) {
    if (f.pos !== pos) continue;
    later(f.delay ?? 0, () => playOne(ctx, f, loc, yaw ?? ctx.p.getRotation().y));
  }
}
function playLine(ctx, sp, a, b) {
  if (!sp.fx?.some((f) => f.pos === "line")) return;
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.6);
  const col = sp.fx.find((f) => f.pos === "line").burst ?? "#CC1111";
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    playOne(ctx, { burst: col, n: 3, sp: 0.1 }, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + 1, z: a.z + (b.z - a.z) * t }, 0);
  }
}

// ───────── 판정 도구 ─────────
const yawOf = (p) => p.getRotation().y;
function around(dim, loc, r, vr) {
  try {
    return dim.getEntities({ location: loc, maxDistance: Math.max(r, vr ?? 0), ...EXCLUDE })
      .filter((e) => Math.hypot(e.location.x - loc.x, e.location.z - loc.z) <= r && Math.abs(e.location.y - loc.y) <= (vr ?? r) + 1);
  } catch { return []; }
}
function lookTarget(p, range = 20) {
  try { return p.getEntitiesFromViewDirection({ maxDistance: range, ...EXCLUDE })[0]?.entity; } catch { return undefined; }
}
// 자바처럼 맞은 뒤 10틱 무적: 그 사이엔 이전보다 큰 피해의 차이만 들어감
const lastHit = new Map(); // victimId -> { t, amt }
function hurt(ctx, e, amount) {
  if (!e?.isValid()) return;
  const now = system.currentTick;
  // 원본의 즉사급 수치(100000)는 큰 일격 정도로 제한
  let dmg = Math.max(1, Math.round(Math.min(amount, 150) * ctx.scale));
  const lh = lastHit.get(e.id);
  if (lh && now - lh.t < 10) {
    if (dmg <= lh.amt) return;
    const extra = dmg - lh.amt;
    lastHit.set(e.id, { t: lh.t, amt: dmg });
    dmg = extra;
  } else lastHit.set(e.id, { t: now, amt: dmg });
  if (lastHit.size > 500) for (const [k, v] of lastHit) if (now - v.t > 40) lastHit.delete(k);
  msHit.set(e.id, now);
  try { e.applyDamage(dmg, { cause: EntityDamageCause.entityAttack, damagingEntity: ctx.p }); } catch {}
}
const POTION = {
  1: "speed", 2: "slowness", 3: "haste", 4: "mining_fatigue", 5: "strength", 6: "instant_health", 7: "instant_damage", 8: "jump_boost",
  9: "nausea", 10: "regeneration", 11: "resistance", 12: "fire_resistance", 13: "water_breathing", 14: "invisibility", 15: "blindness",
  16: "night_vision", 17: "hunger", 18: "weakness", 19: "poison", 20: "wither", 21: "health_boost", 22: "absorption", 25: "levitation",
};

// ───────── 조건 (modifiers) ─────────
const buffOn = (p, name) => (buffs.get(`${p.id}|${clean(name)}`) ?? 0) > system.currentTick;
/** castinstead 로 바뀔 스펠 이름 (없으면 null), required/denied 실패면 false */
function checkMods(p, sp) {
  for (const m of sp.modifiers ?? []) {
    const w = m.trim().split(/\s+/);
    if (w[0] !== "buffactive") continue;
    const on = buffOn(p, w[1]);
    if (w[2] === "castinstead" && on) return clean(w.slice(3).join(" "));
    if (w[2] === "required" && !on) return false;
    if (w[2] === "denied" && on) return false;
  }
  return null;
}
/** 이 스펠을 지금 쓸 수 있나 (buffactive required 를 만족하는 연계 스펠) */
export function canCast(p, name) {
  const sp = SPELLS[clean(name)];
  if (!sp) return false;
  const mods = (sp.modifiers ?? []).filter((m) => m.startsWith("buffactive"));
  if (!mods.some((m) => m.includes("required"))) return false;
  return checkMods(p, sp) !== false;
}
/** 콤보 진행 중인지 (다음 단계가 열려 있으면 쿨다운 없이 이어서 쓸 수 있게) */
export function comboReady(p, root) {
  const sp = SPELLS[root];
  return !!sp && typeof checkMods(p, sp) === "string";
}

// ───────── 실행 ─────────
/**
 * ctx = { p, scale(피해 배율), size }
 * target: 대상 엔티티, at: 위치 (투사체 도착 지점 등)
 */
export function cast(ctx, name, target, at, depth = 0) {
  name = clean(name);
  const sp = SPELLS[name];
  if (!sp || depth > 40 || !ctx.p.isValid()) return false;
  const p = ctx.p;
  const mod = checkMods(p, sp);
  if (mod === false) return false;
  if (typeof mod === "string") return cast(ctx, mod, target, at, depth + 1);
  const H = p.location;
  const c = sp.c;
  const targetedClass = /^targeted\.(Pain|Drainlife|Forcetoss|Stun|PotionEffect|Shadowstep|Dot|Grip|Dummy|Silence)/.test(c);
  if (targetedClass && !target && !(c === "targeted.PotionEffectSpell" && sp.targeted === false) && !sp["target-self"]) {
    target = lookTarget(p, num(sp.range, 20));
  }
  play(ctx, sp, "caster", H);
  if (target) play(ctx, sp, "target", target.location);

  switch (c) {
    case "MultiSpell":
    case "TargetedMultiSpell": {
      if (c === "TargetedMultiSpell" && !target && !at) target = lookTarget(p, num(sp.range, 20));
      if (c === "TargetedMultiSpell" && !target && !at) return false;
      play(ctx, sp, "special", target?.location ?? at ?? H);
      let t = 0;
      for (const s of sp.spells ?? []) {
        const m = /^DELAY\s+(\d+)/.exec(String(s));
        if (m) { t += Number(m[1]); continue; }
        later(t, () => {
          if (target && !target.isValid()) return;
          cast(ctx, s, target, target ? undefined : at, depth + 1);
        });
      }
      return true;
    }
    case "ExternalCommandSpell":
      for (const cmd of sp["command-to-execute"] ?? []) if (String(cmd).startsWith("c ")) cast(ctx, String(cmd).slice(2), target, at, depth + 1);
      return true;
    case "instant.DummySpell":
    case "targeted.DummySpell":
      play(ctx, sp, "special", target?.location ?? at ?? H);
      return true;
    case "buff.DummySpell":
      buffs.set(`${p.id}|${name}`, system.currentTick + Math.round(num(sp.duration, 5) * 20));
      return true;
    case "targeted.AreaEffectSpell": {
      const center = at ?? target?.location ?? H;
      play(ctx, sp, "special", center);
      const list = around(p.dimension, center, num(sp["horizontal-radius"], 5), num(sp["vertical-radius"], 3)).slice(0, num(sp["max-targets"], 100));
      for (const e of list) for (const s of sp.spells ?? []) if (s) cast(ctx, s, e, undefined, depth + 1);
      return true;
    }
    case "targeted.PainSpell": {
      const t = sp["target-self"] ? null : target;
      if (t) { hurt(ctx, t, num(sp.damage, 4)); play(ctx, sp, "special", t.location); }
      return !!t;
    }
    case "targeted.DrainlifeSpell": {
      if (!target) return false;
      hurt(ctx, target, num(sp["take-amt"], 2));
      const give = num(sp["give-amt"], 0);
      if (give > 0) {
        try {
          const hp = p.getComponent("minecraft:health");
          hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + give * 0.5));
        } catch {}
      }
      playLine(ctx, sp, target.location, H);
      return true;
    }
    case "targeted.ForcetossSpell": {
      if (!target) return false;
      const hf = num(sp["horizontal-force"], 0) / 10, vf = num(sp["vertical-force"], 0) / 10;
      const dx = target.location.x - H.x, dz = target.location.z - H.z, l = Math.hypot(dx, dz) || 1;
      const dir = hf < 0 ? -1 : 1;
      try { target.applyKnockback((dx / l) * dir, (dz / l) * dir, Math.min(2.5, Math.abs(hf)), Math.max(-1.5, Math.min(1.3, vf))); } catch {}
      return true;
    }
    case "targeted.StunSpell": {
      const t = sp["target-self"] ? p : target;
      if (!t) return false;
      const ticks = Math.round(num(sp.duration, 1) * 20);
      try {
        t.addEffect("slowness", ticks, { amplifier: t === p ? 3 : 10, showParticles: false });
        if (t !== p) t.addEffect("weakness", ticks, { amplifier: 3, showParticles: false });
      } catch {}
      return true;
    }
    case "targeted.PotionEffectSpell": {
      const t = sp.targeted === false ? p : target;
      const id = POTION[num(sp.type, 1)];
      if (!t || !id) return false;
      try { t.addEffect(id, Math.max(1, Math.round(num(sp.duration, 100))), { amplifier: Math.min(9, Math.max(0, num(sp.strength, 0))), showParticles: false }); } catch {}
      return true;
    }
    case "instant.LeapSpell": {
      const fv = num(sp["forward-velocity"], 0) / 10, uv = num(sp["upward-velocity"], 0) / 10;
      const y = (yawOf(p) * Math.PI) / 180;
      const dir = fv < 0 ? -1 : 1;
      try { p.applyKnockback(-Math.sin(y) * dir, Math.cos(y) * dir, Math.min(3, Math.abs(fv)), Math.max(-1, Math.min(1.4, uv))); } catch {}
      return true;
    }
    case "instant.VelocitySpell": {
      const v = p.getViewDirection(), s = num(sp.speed, 10) / 10;
      try { p.applyKnockback(v.x, v.z, Math.min(3, s), Math.max(-1, Math.min(1.4, v.y * s))); } catch {}
      return true;
    }
    case "targeted.ShadowstepSpell": {
      if (!target) target = lookTarget(p, num(sp.range, 20));
      if (!target) return false;
      const from = { ...H };
      const ty = (target.getRotation().y * Math.PI) / 180;
      const to = { x: target.location.x + Math.sin(ty) * 1.3, y: target.location.y, z: target.location.z - Math.cos(ty) * 1.3 };
      try { p.teleport(to, { facingLocation: target.location, keepVelocity: false }); } catch {}
      play(ctx, sp, "pos1", from);
      return true;
    }
    case "targeted.GripSpell": {
      if (!target) return false;
      try { target.teleport({ x: H.x + Math.sin(0) * 0, y: H.y, z: H.z }, { keepVelocity: false }); } catch {}
      return true;
    }
    case "buff.InvulnerabilitySpell":
      try { p.addEffect("resistance", Math.round(num(sp.duration, 5) * 20), { amplifier: 4, showParticles: false }); } catch {}
      play(ctx, sp, "special", H);
      return true;
    case "buff.InvisibilitySpell":
      try { p.addEffect("invisibility", Math.round(num(sp.duration, 5) * 20), { amplifier: 0, showParticles: false }); } catch {}
      return true;
    case "targeted.DotSpell": {
      if (!target) return false;
      const iv = Math.max(1, num(sp.interval, 20)), n = Math.max(1, Math.round(num(sp.duration, 100) / iv));
      for (let i = 1; i <= n; i++) later(i * iv, () => hurt(ctx, target, num(sp.damage, 2)));
      return true;
    }
    case "targeted.SilenceSpell":
      if (target) try { target.addEffect("slowness", Math.round(num(sp.duration, 5) * 20), { amplifier: 1 }); } catch {}
      return true;
    case "instant.ParticleProjectileSpell":
      return projectile(ctx, sp, depth, target);
  }
  return false;
}

/** ParticleProjectileSpell: velocity 는 블록/초, tick-interval 틱마다 이동 */
function projectile(ctx, sp, depth, target0) {
  const p = ctx.p, dim = p.dimension;
  const r = p.getRotation();
  const hug = !!sp["hug-surface"];
  const yaw = ((r.y + num(sp["projectile-horiz-offset"], 0)) * Math.PI) / 180;
  const pitch = ((hug ? 0 : r.x - num(sp["projectile-vert-offset"], 0)) * Math.PI) / 180;
  const dir = { x: -Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
  const fwd = num(sp["start-forward-offset"], 0);
  let pos = { x: p.location.x + dir.x * fwd, y: p.location.y + num(sp["start-y-offset"], 1) + (hug ? num(sp["height-from-surface"], 0) : 0), z: p.location.z + dir.z * fwd };
  const iv = Math.max(1, num(sp["tick-interval"], 1));
  const step = (num(sp["projectile-velocity"], 10) / 20) * iv;
  const grav = num(sp["projectile-gravity"], 0) / 400;
  const maxD = num(sp["max-distance"], 15);
  const hitR = num(sp["hit-radius"], 1.5);
  const sfxEvery = Math.max(1, num(sp["special-effect-interval"], 1));
  const spell = sp.spell;
  const hitNP = sp["hit-non-players"] !== false;
  const done = new Set();
  const projYaw = (yaw * 180) / Math.PI;
  const end = (at) => {
    if (sp["hit-air-at-end"] && spell) cast(ctx, spell, undefined, at, depth + 1);
  };
  // 거리 0: 시작 위치에서 바로 (원본의 "위치 지정용" 투사체 패턴)
  if (maxD <= 0 || step <= 0) {
    play(ctx, sp, "special", pos, projYaw);
    if (hitNP && spell) {
      const e = around(dim, pos, hitR, hitR)[0];
      if (e && !sp["hit-air-at-end"]) cast(ctx, spell, e, undefined, depth + 1);
    }
    end(pos);
    return true;
  }
  let went = 0, n = 0, vy = 0;
  const job = system.runInterval(() => {
    try {
      if (!p.isValid()) return system.clearRun(job);
      n++;
      pos = { x: pos.x + dir.x * step, y: pos.y + dir.y * step - (vy += grav), z: pos.z + dir.z * step };
      went += step;
      if (hug) {
        try {
          const b = dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y - num(sp["height-from-surface"], 0) - 0.5), z: Math.floor(pos.z) });
          if (b?.isAir) pos.y -= 1;
        } catch {}
      } else if (sp["stop-on-hit-ground"]) {
        try {
          const b = dim.getBlock({ x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) });
          if (b && !b.isAir && !b.isLiquid) { system.clearRun(job); return end(pos); }
        } catch {}
      }
      if (n % sfxEvery === 0) play(ctx, sp, "special", pos, projYaw);
      if (sp["hit-air-during"] && spell) cast(ctx, spell, undefined, pos, depth + 1);
      if (hitNP && spell) {
        for (const e of around(dim, pos, hitR, hitR)) {
          if (done.has(e.id)) continue;
          done.add(e.id);
          cast(ctx, spell, e, undefined, depth + 1);
          if (sp["stop-on-hit-entity"]) { system.clearRun(job); return; }
        }
      }
      if (went >= maxD) { system.clearRun(job); end(pos); }
    } catch {
      system.clearRun(job);
    }
  }, iv);
  void target0;
  return true;
}
