// 무기별 스킬 시스템
// - 들고 있는 무기의 "무기 분류"를 자동 판별(태그 → 이름 → 제작자 지정)하고, 처음 보는 무기는 자동 등록한다.
//   → 앞으로 다른 애드온 무기를 추가해도 분류만 맞으면 그 분류의 스킬이 바로 생긴다.
// - 분류마다 스킬 여러 개. 분류별로 "장착" 스킬 하나를 골라 두고 웅크리고 공격/발사하면 발동.
import { world, system, EntityDamageCause } from "@minecraft/server";
import { getJSON, setJSON } from "./db.js";
import { data, save, stat, notify, maxMp } from "./player.js";
import { nearbyMembers } from "./party.js";
import { weaponInfo, inv } from "./itemdb.js";

export const WCLASS = {
  sword: { name: "검", icon: "class" },
  axe: { name: "도끼", icon: "axe" },
  bow: { name: "활", icon: "archer" },
  crossbow: { name: "쇠뇌", icon: "crossbow" },
  spear: { name: "창", icon: "spear" },
  mace: { name: "둔기", icon: "mace" },
  staff: { name: "지팡이", icon: "mage" },
  fist: { name: "맨손", icon: "profile" },
};

// ───────── 스킬 정의 ─────────
// kind: melee(힘 계수) / ranged(민첩 계수) / magic(지능 계수) / heal / buff
const SKILLS_BASE = [
  { id: "sword_spin", w: "sword", name: "회전 베기", lv: 1, mp: 12, cd: 6, kind: "melee", pow: 1.5, desc: "주변 3.5블록의 적을 베어 공격력의 150% 피해." },
  { id: "sword_dash", w: "sword", name: "질풍 돌진", lv: 5, mp: 18, cd: 10, kind: "melee", pow: 1.8, desc: "앞으로 돌진하며 경로의 적에게 180% 피해." },
  { id: "sword_judge", w: "sword", name: "심판의 일격", lv: 15, mp: 35, cd: 25, kind: "melee", pow: 4, desc: "바라보는 적 하나에게 400% 피해 + 3초 구속." },
  { id: "axe_slam", w: "axe", name: "대지 강타", lv: 1, mp: 15, cd: 8, kind: "melee", pow: 1.6, desc: "땅을 내려찍어 4블록 안 적에게 160% 피해 + 띄우기." },
  { id: "axe_rage", w: "axe", name: "광전사의 분노", lv: 8, mp: 25, cd: 30, kind: "buff", pow: 30, desc: "10초 동안 공격력 +30%." },
  { id: "bow_pierce", w: "bow", name: "관통 사격", lv: 1, mp: 10, cd: 5, kind: "ranged", pow: 1.6, desc: "직선 32블록, 적 최대 3명 관통 160% 피해." },
  { id: "bow_rain", w: "bow", name: "화살비", lv: 6, mp: 25, cd: 15, kind: "ranged", pow: 0.8, desc: "목표 지점 4블록에 3번에 걸쳐 80%씩 피해." },
  { id: "xbow_burst", w: "crossbow", name: "폭발 볼트", lv: 1, mp: 15, cd: 8, kind: "ranged", pow: 2, desc: "목표 지점에서 폭발, 3블록 200% 피해." },
  { id: "xbow_volley", w: "crossbow", name: "일제 사격", lv: 8, mp: 22, cd: 12, kind: "ranged", pow: 1.2, desc: "부채꼴로 3발, 각 120% 관통 피해." },
  { id: "spear_thrust", w: "spear", name: "꿰뚫기", lv: 1, mp: 12, cd: 6, kind: "melee", pow: 1.7, desc: "앞 6블록 직선의 적 모두에게 170% 피해." },
  { id: "spear_storm", w: "spear", name: "뇌우", lv: 10, mp: 35, cd: 25, kind: "magic", pow: 2.5, desc: "목표에 번개를 내려 250% 피해." },
  { id: "mace_quake", w: "mace", name: "지진", lv: 1, mp: 18, cd: 10, kind: "melee", pow: 1.4, desc: "5블록 안 적에게 140% 피해 + 크게 띄우기." },
  { id: "staff_fire", w: "staff", name: "화염구", lv: 1, mp: 15, cd: 6, kind: "magic", pow: 1.6, desc: "목표 지점 3블록 폭발 160% + 화상." },
  { id: "staff_frost", w: "staff", name: "서리 폭풍", lv: 6, mp: 22, cd: 12, kind: "magic", pow: 1.2, desc: "주변 5블록 120% 피해 + 4초 구속." },
  { id: "staff_heal", w: "staff", name: "치유의 빛", lv: 4, mp: 25, cd: 15, kind: "heal", pow: 1, desc: "자신과 8블록 안 파티원 회복 + 재생." },
  { id: "fist_breath", w: "fist", name: "숨 고르기", lv: 1, mp: 5, cd: 15, kind: "heal", pow: 0.5, desc: "체력을 조금 회복한다." },
  { id: "fist_combo", w: "fist", name: "연속 타격", lv: 3, mp: 8, cd: 5, kind: "melee", pow: 1.2, desc: "앞의 적에게 3연타 각 120%." },
];
// 기본 스킬의 효과 = 자기 id. 제작자가 만든 스킬은 fx 로 기존 효과를 골라 쓴다.
export const SKILLS = SKILLS_BASE;
for (const s of SKILLS) s.fx = s.id;
// 맨손 스킬은 기본적으로 꺼짐 (무기를 들어야 스킬이 생김) – 제작자 도구에서 켤 수 있음
const DEFAULT_OFF = new Set(["fist_breath", "fist_combo"]);

export const FX = [
  { id: "sword_spin", name: "주변 베기 (원형 범위)" }, { id: "sword_dash", name: "돌진 + 범위" },
  { id: "sword_judge", name: "단일 강타 + 구속" }, { id: "axe_slam", name: "내려찍기 + 띄우기" },
  { id: "mace_quake", name: "지진 (넓은 범위)" }, { id: "axe_rage", name: "공격력 버프" },
  { id: "bow_pierce", name: "관통 직선 (3명)" }, { id: "spear_thrust", name: "짧은 직선 관통" },
  { id: "bow_rain", name: "범위 3연타 (화살비)" }, { id: "xbow_burst", name: "지점 폭발" },
  { id: "staff_fire", name: "화염 폭발 + 화상" }, { id: "xbow_volley", name: "부채꼴 3발" },
  { id: "spear_storm", name: "번개" }, { id: "staff_frost", name: "냉기 범위 + 구속" },
  { id: "staff_heal", name: "파티 회복" }, { id: "fist_breath", name: "자기 회복" }, { id: "fist_combo", name: "3연타" },
];

// 제작자 도구 저장값: rpg:skilldb = { [id]: { ...변경할 필드, enabled, custom: true } }
let sdb = null;
export const skillDb = () => (sdb ??= getJSON(world, "rpg:skilldb", {}));
export function saveSkillDef(id, patch) {
  skillDb()[id] = { ...(skillDb()[id] ?? {}), ...patch };
  setJSON(world, "rpg:skilldb", sdb);
  cache = null;
}
export function deleteSkillDef(id) {
  delete skillDb()[id];
  setJSON(world, "rpg:skilldb", sdb);
  cache = null;
}
let cache = null;
/** 모든 스킬 (기본 + 제작, 변경 반영). enabled=false 포함 */
export function allSkillsRaw() {
  if (cache) return cache;
  const db = skillDb();
  const list = SKILLS.map((s) => ({ ...s, enabled: !DEFAULT_OFF.has(s.id), ...(db[s.id] ?? {}) }));
  for (const [id, v] of Object.entries(db)) if (v.custom && !SKILLS.some((s) => s.id === id)) list.push({ id, kind: "melee", pow: 1, mp: 10, cd: 8, lv: 1, w: "sword", fx: "sword_spin", desc: "", enabled: true, ...v });
  return (cache = list);
}
export const skillsOf = (w) => allSkillsRaw().filter((s) => s.w === w && s.enabled !== false);
export const getSkill = (id) => allSkillsRaw().find((s) => s.id === id);

// 직업 보너스 (해당 분류 스킬 피해/회복 증가 %)
const CLASS_BONUS = {
  warrior: { sword: 20, axe: 20, mace: 20, spear: 10 },
  archer: { bow: 25, crossbow: 25, spear: 10 },
  mage: { staff: 30, spear: 10 },
  cleric: { staff: 15, mace: 15 },
};

// ───────── 무기 분류 판별 + 자동 등록 ─────────
let overrides = null; // 제작자 지정 { typeId: wclass }
let known = null; // 자동 등록 { typeId: wclass }
const ov = () => (overrides ??= getJSON(world, "rpg:wclass", {}));
export const knownWeapons = () => (known ??= getJSON(world, "rpg:weapons", {}));

export function setWeaponClass(typeId, w) {
  if (w) ov()[typeId] = w;
  else delete ov()[typeId];
  setJSON(world, "rpg:wclass", ov());
  if (w) registerWeapon(typeId, w);
}

function registerWeapon(typeId, w) {
  const k = knownWeapons();
  if (k[typeId] === w) return;
  k[typeId] = w;
  setJSON(world, "rpg:weapons", k);
}

const TAGS = [
  ["minecraft:is_sword", "sword"], ["minecraft:is_axe", "axe"], ["minecraft:is_trident", "spear"],
  ["minecraft:is_mace", "mace"], ["minecraft:is_spear", "spear"],
];
const NAMES = [
  [/crossbow|arbalest/, "crossbow"], [/(^|_)bow($|_)|longbow|shortbow/, "bow"],
  [/staff|wand|scepter|rod_of|tome|grimoire|blaze_rod/, "staff"],
  [/sword|blade|katana|saber|sabre|dagger|knife|rapier|claymore/, "sword"],
  [/(^|_)axe($|_)|hatchet|halberd|cleaver/, "axe"],
  [/trident|spear|lance|pike|glaive|javelin/, "spear"],
  [/mace|hammer|club|maul|flail|morningstar/, "mace"],
];

/** 아이템 → 무기 분류 (무기가 아니면 null) */
export function weaponClassOf(stack) {
  if (!stack) return null;
  const id = stack.typeId;
  if (ov()[id]) return ov()[id];
  for (const [tag, w] of TAGS) {
    try {
      if (stack.hasTag(tag)) return w;
    } catch {}
  }
  const name = id.split(":")[1] ?? id;
  for (const [re, w] of NAMES) if (re.test(name)) return w;
  return null;
}

export function heldStack(p) {
  return inv(p).getItem(p.selectedSlotIndex);
}

/** 손에 든 무기 분류 (없으면 맨손). 새 무기면 자동 등록 */
export function heldClass(p) {
  const st = heldStack(p);
  const w = weaponClassOf(st);
  if (st && w) registerWeapon(st.typeId, w);
  return w ?? "fist";
}

// ───────── 무기별 설정 (제작자 도구 > 무기·스킬) ─────────
//   rpg:wcfg = { [typeId]: { skills: [skillId...] | null, atk: number | null, mul: 퍼센트 } }
//   skills 를 지정하면 그 무기는 분류와 상관없이 지정한 스킬만 쓴다 (커스텀 무기 연동)
let wcfg = null;
export const weaponCfg = () => (wcfg ??= getJSON(world, "rpg:wcfg", {}));
export function setWeaponCfg(typeId, cfg) {
  if (cfg) weaponCfg()[typeId] = cfg;
  else delete weaponCfg()[typeId];
  setJSON(world, "rpg:wcfg", wcfg);
}

/** 들고 있는 무기의 스킬 목록과 장착 키 (무기가 아니면 맨손 – 기본적으로 스킬 없음) */
export function loadout(p) {
  const st = heldStack(p);
  const w = heldClass(p);
  const cfg = st ? weaponCfg()[st.typeId] : null;
  if (cfg?.skills?.length) return { key: `item:${st.typeId}`, list: cfg.skills.map(getSkill).filter((s) => s && s.enabled !== false), w, cfg };
  return { key: w, list: skillsOf(w), w, cfg };
}

// ───────── 장착 (스킬 1 / 스킬 2) / 쿨다운 ─────────
//   스킬 1: 쉬프트+공격, 스킬 버튼(핫바 8번 칸)      스킬 2: 쉬프트 누른 채 스킬 버튼
//   (설정에서 1/2 바꾸기 가능)
export function equippedFor(p, key, list, slot = "main") {
  const d = data(p);
  const store = slot === "sub" ? "skills2" : "skills";
  const s = getSkill(d[store]?.[key]);
  if (s && list.includes(s) && d.lv >= s.lv) return s;
  const open = list.filter((x) => d.lv >= x.lv);
  if (slot === "sub") {
    const main = equippedFor(p, key, list, "main");
    return open.find((x) => x.id !== main?.id) ?? null;
  }
  return open[0] ?? list[0] ?? null;
}
export const equipped = (p, w, slot = "main") => equippedFor(p, w, skillsOf(w), slot);

export function equip(p, id, slot = "main", key) {
  const s = getSkill(id);
  const d = data(p);
  key = key ?? s.w;
  const store = slot === "sub" ? "skills2" : "skills";
  const other = slot === "sub" ? "skills" : "skills2";
  d[store] = d[store] ?? {};
  d[store][key] = id;
  if (d[other]?.[key] === id) delete d[other][key]; // 같은 스킬을 두 칸에 두지 않음
  save(p);
}

const cd = new Map();
export function readyIn(p, id) {
  return Math.max(0, ((cd.get(`${p.id}|${id}`) ?? 0) - system.currentTick) / 20);
}

/** HUD 표시용: 손에 든 무기의 장착 스킬 */
export function currentSkillInfo(p) {
  const { key, list } = loadout(p);
  const s = equippedFor(p, key, list);
  const s2 = equippedFor(p, key, list, "sub");
  return { skill: s, left: s ? readyIn(p, s.id) : 0, sub: s2, left2: s2 ? readyIn(p, s2.id) : 0 };
}

// ───────── 발동 ─────────
const EXCLUDE = { excludeTypes: ["minecraft:player", "minecraft:item", "minecraft:xp_orb", "rpg:npc", "minecraft:armor_stand"], excludeFamilies: ["inanimate"] };
export const skillHit = new Map(); // victimId -> tick (스탯 보너스 중복 방지용, combat.js 가 참조)

function hit(p, e, amount) {
  skillHit.set(e.id, system.currentTick);
  try {
    e.applyDamage(Math.max(1, amount), { cause: EntityDamageCause.entityAttack, damagingEntity: p });
  } catch {}
}
function around(dim, loc, r) {
  return dim.getEntities({ location: loc, maxDistance: r, ...EXCLUDE });
}
function lookTargetPoint(p, max = 24) {
  const e = p.getEntitiesFromViewDirection({ maxDistance: max, ...EXCLUDE })[0]?.entity;
  if (e) return e.location;
  const b = p.getBlockFromViewDirection({ maxDistance: max });
  if (b) return { x: b.block.location.x + 0.5, y: b.block.location.y + 1, z: b.block.location.z + 0.5 };
  const v = p.getViewDirection();
  const h = p.getHeadLocation();
  return { x: h.x + v.x * 12, y: h.y + v.y * 12, z: h.z + v.z * 12 };
}
function ring(dim, c, r, particle = "minecraft:critical_hit_emitter") {
  for (let a = 0; a < 14; a++) {
    const t = (a / 14) * Math.PI * 2;
    try { dim.spawnParticle(particle, { x: c.x + Math.cos(t) * r, y: c.y + 0.3, z: c.z + Math.sin(t) * r }); } catch {}
  }
}
function line(p, len, step, particle) {
  const v = p.getViewDirection();
  const h = p.getHeadLocation();
  for (let i = 1; i < len; i += step) {
    try { p.dimension.spawnParticle(particle, { x: h.x + v.x * i, y: h.y + v.y * i, z: h.z + v.z * i }); } catch {}
  }
}

/** 스킬 위력 (기본 공격력 × 계수 × 스탯/직업 보너스) */
function power(p, s) {
  const d = data(p);
  const held = heldStack(p);
  const cfg = held ? weaponCfg()[held.typeId] : null;
  const base = (s.kind === "magic" ? 5 + stat(p, "int") * 0.6 : (cfg?.atk ?? weaponInfo(held?.typeId ?? "")?.atk ?? 3)) * ((cfg?.mul ?? 100) / 100);
  const statMul = s.kind === "melee" ? 1 + stat(p, "str") * 0.02 : s.kind === "ranged" ? 1 + stat(p, "dex") * 0.02 : 1;
  const buff = (d.buffUntil ?? 0) > system.currentTick ? 1 + (d.buffAtk ?? 0) / 100 : 1;
  const cls = 1 + (CLASS_BONUS[d.cls]?.[s.w] ?? 0) / 100;
  return base * s.pow * statMul * buff * cls;
}

export function castWeaponSkill(p, id, slot = "main") {
  const d = data(p);
  const lo = loadout(p);
  const s = id ? getSkill(id) : equippedFor(p, lo.key, lo.list, slot);
  if (!s) {
    notify(p, `§7스킬 ${slot === "sub" ? 2 : 1}이 비어 있습니다 §f(메뉴 > 스킬에서 장착)`);
    return false;
  }
  if (d.lv < s.lv) {
    notify(p, `§7${s.name} §c- Lv.${s.lv} 필요`);
    return false;
  }
  const left = readyIn(p, s.id);
  if (left > 0) {
    notify(p, `§7${s.name} 재사용 대기 §f${Math.ceil(left)}초`);
    return false;
  }
  const mp = d.mp ?? maxMp(p);
  if (mp < s.mp) {
    notify(p, `§9마나 부족 §f(${Math.floor(mp)}/${s.mp})`);
    p.playSound("note.bass");
    return false;
  }
  d.mp = mp - s.mp;
  const cdr = 1 - Math.min(0.4, stat(p, "int") * 0.01);
  cd.set(`${p.id}|${s.id}`, system.currentTick + Math.round(s.cd * cdr * 20));
  const dim = p.dimension;
  const loc = p.location;
  const dmg = power(p, s);

  switch (s.fx ?? s.id) {
    case "sword_spin":
      for (const e of around(dim, loc, 3.5)) hit(p, e, dmg);
      ring(dim, loc, 2.5);
      p.playSound("item.trident.riptide_1", { pitch: 1.4 });
      break;
    case "sword_dash": {
      const v = p.getViewDirection();
      try { p.applyKnockback(v.x, v.z, 2.6, 0.25); } catch {}
      system.runTimeout(() => {
        if (!p.isValid()) return;
        for (const e of around(dim, p.location, 3)) hit(p, e, dmg);
        ring(dim, p.location, 1.5, "minecraft:basic_crit_particle");
      }, 5);
      p.playSound("mob.irongolem.throw");
      break;
    }
    case "sword_judge": {
      const t = p.getEntitiesFromViewDirection({ maxDistance: 6, ...EXCLUDE })[0]?.entity;
      if (t) {
        hit(p, t, dmg);
        try { t.addEffect("slowness", 60, { amplifier: 4 }); } catch {}
        dim.spawnParticle("minecraft:large_explosion", t.location);
      }
      p.playSound("random.anvil_land", { pitch: 0.6 });
      break;
    }
    case "axe_slam":
    case "mace_quake": {
      const r = s.id === "mace_quake" ? 5 : 4;
      for (const e of around(dim, loc, r)) {
        hit(p, e, dmg);
        const dx = e.location.x - loc.x, dz = e.location.z - loc.z, len = Math.hypot(dx, dz) || 1;
        try { e.applyKnockback(dx / len, dz / len, 0.6, s.id === "mace_quake" ? 0.9 : 0.6); } catch {}
      }
      ring(dim, loc, r - 1, "minecraft:huge_explosion_emitter");
      p.playSound("random.explode", { volume: 0.6, pitch: 0.8 });
      break;
    }
    case "axe_rage":
      d.buffAtk = s.pow;
      d.buffUntil = system.currentTick + 200;
      dim.spawnParticle("minecraft:villager_angry", { ...loc, y: loc.y + 2 });
      p.playSound("mob.ravager.roar", { volume: 0.5 });
      break;
    case "bow_pierce":
    case "spear_thrust": {
      const range = s.id === "spear_thrust" ? 6 : 32;
      const hits = p.getEntitiesFromViewDirection({ maxDistance: range, ...EXCLUDE });
      for (const h of s.id === "bow_pierce" ? hits.slice(0, 3) : hits) hit(p, h.entity, dmg);
      line(p, range, 1.2, "minecraft:basic_crit_particle");
      p.playSound(s.id === "bow_pierce" ? "random.bow" : "item.trident.throw", { pitch: 1.5 });
      break;
    }
    case "bow_rain": {
      const c = lookTargetPoint(p, 32);
      for (let i = 0; i < 3; i++) system.runTimeout(() => {
        for (const e of around(dim, c, 4)) hit(p, e, dmg);
        for (let k = 0; k < 10; k++) try { dim.spawnParticle("minecraft:basic_crit_particle", { x: c.x + Math.random() * 8 - 4, y: c.y + 3, z: c.z + Math.random() * 8 - 4 }); } catch {}
        p.playSound("random.bowhit");
      }, i * 10);
      break;
    }
    case "xbow_burst":
    case "staff_fire": {
      const c = lookTargetPoint(p, 28);
      for (const e of around(dim, c, 3)) {
        hit(p, e, dmg);
        if (s.id === "staff_fire") try { e.setOnFire(4, true); } catch {}
      }
      dim.spawnParticle("minecraft:large_explosion", c);
      p.playSound(s.id === "staff_fire" ? "mob.blaze.shoot" : "random.explode", { volume: 0.6 });
      break;
    }
    case "xbow_volley": {
      const v = p.getViewDirection();
      const h = p.getHeadLocation();
      for (const ang of [-0.25, 0, 0.25]) {
        const dx = v.x * Math.cos(ang) - v.z * Math.sin(ang), dz = v.x * Math.sin(ang) + v.z * Math.cos(ang);
        for (let i = 1; i < 24; i += 1) {
          const pt = { x: h.x + dx * i, y: h.y + v.y * i, z: h.z + dz * i };
          for (const e of around(dim, pt, 1)) if (system.currentTick - (skillHit.get(e.id) ?? -9) > 0) hit(p, e, dmg);
          if (i % 2 === 0) try { dim.spawnParticle("minecraft:basic_crit_particle", pt); } catch {}
        }
      }
      p.playSound("crossbow.shoot");
      break;
    }
    case "spear_storm": {
      const c = lookTargetPoint(p, 32);
      try { dim.spawnEntity("minecraft:lightning_bolt", c); } catch {}
      for (const e of around(dim, c, 3)) hit(p, e, dmg);
      break;
    }
    case "staff_frost":
      for (const e of around(dim, loc, 5)) {
        hit(p, e, dmg);
        try { e.addEffect("slowness", 80, { amplifier: 2 }); } catch {}
      }
      ring(dim, loc, 4, "minecraft:snowflake_particle");
      p.playSound("random.glass", { pitch: 1.3 });
      break;
    case "staff_heal":
    case "fist_breath": {
      const amt = s.id === "staff_heal" ? 6 + stat(p, "vit") * 0.3 + stat(p, "int") * 0.3 : 4;
      const bonus = 1 + (CLASS_BONUS[d.cls]?.[s.w] ?? 0) / 100;
      const targets = s.id === "staff_heal" ? [p, ...nearbyMembers(p, 8)] : [p];
      for (const t of targets) {
        const hp = t.getComponent("minecraft:health");
        hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + amt * bonus));
        try { t.dimension.spawnParticle("minecraft:heart_particle", { ...t.location, y: t.location.y + 2 }); } catch {}
      }
      p.playSound("random.orb", { pitch: 0.7 });
      break;
    }
    case "fist_combo": {
      const t = p.getEntitiesFromViewDirection({ maxDistance: 4, ...EXCLUDE })[0]?.entity;
      if (t) for (let i = 0; i < 3; i++) system.runTimeout(() => t.isValid() && hit(p, t, dmg), i * 6);
      p.playSound("game.player.attack.strong");
      break;
    }
  }
  notify(p, `§b§l${s.name}! §r§9-${s.mp} MP`);
  return true;
}

/** 공격력 버프 배율 (combat.js 일반 공격에도 적용) */
export function buffMul(p) {
  const d = data(p);
  return (d.buffUntil ?? 0) > system.currentTick ? 1 + (d.buffAtk ?? 0) / 100 : 1;
}

/** 웅크리고 공격/발사 시 발동 이벤트 연결 */
export function initSkillTriggers() {
  world.afterEvents.entityHitEntity?.subscribe(({ damagingEntity: p }) => {
    if (p?.typeId !== "minecraft:player" || !p.isSneaking) return;
    if (data(p).set.shiftAttack === false) return;
    const w = heldClass(p);
    if (w === "bow" || w === "crossbow") return;
    castWeaponSkill(p);
  });
  world.afterEvents.itemReleaseUse?.subscribe(({ itemStack, source: p }) => {
    if (!p.isSneaking || !itemStack) return;
    const w = weaponClassOf(itemStack);
    if (w === "bow" || w === "spear" || w === "crossbow") castWeaponSkill(p);
  });
  world.afterEvents.itemUse.subscribe(({ itemStack, source: p }) => {
    if (!p.isSneaking) return;
    const w = weaponClassOf(itemStack);
    if (w === "staff" || w === "crossbow") castWeaponSkill(p);
  });
}
