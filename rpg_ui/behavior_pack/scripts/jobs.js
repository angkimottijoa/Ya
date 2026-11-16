// 직업 승급 트리 + 직업 스킬
//   1차(Lv1)  →  2차(Lv20, 둘 중 선택)  →  3차(Lv40)
//   각 단계마다 "사용 무기"가 정해져 있고, 그 단계 스킬은 그 무기를 들고 있을 때만 쓸 수 있다.
//   스킬 효과(fx)는 skills.js 의 효과를 재사용한다.
import { world } from "@minecraft/server";
import { getJSON, setJSON } from "./db.js";

// bonus: 이 단계에 도달하면 더해지는 능력치
export const PATHS = {
  novice: { name: "모험가", tier: 0, base: "novice", weapons: [], next: ["warrior", "archer", "mage", "cleric"], icon: "novice", desc: "아직 길을 정하지 않은 여행자." },

  warrior: { name: "전사", tier: 1, base: "warrior", weapons: ["sword", "axe", "mace"], next: ["swordmaster", "berserker"], icon: "warrior", color: "§c", desc: "최전선에서 적을 베어 넘기는 근접 전투의 달인." },
  swordmaster: { name: "검성", tier: 2, base: "warrior", lv: 20, cost: 1000, weapons: ["sword"], next: ["sword_emperor"], icon: "class", color: "§c", bonus: { str: 5, dex: 3 }, desc: "검 한 자루에 모든 것을 건 검의 구도자. 빠르고 정확한 연속 공격." },
  sword_emperor: { name: "검황", tier: 3, base: "warrior", lv: 40, cost: 5000, weapons: ["sword"], next: [], icon: "class", color: "§c", bonus: { str: 10, dex: 6 }, desc: "검의 정점. 일격에 전장을 가른다." },
  berserker: { name: "광전사", tier: 2, base: "warrior", lv: 20, cost: 1000, weapons: ["axe", "mace"], next: ["destroyer"], icon: "axe", color: "§c", bonus: { str: 6, vit: 3 }, desc: "분노를 힘으로 바꾸는 파괴자. 넓은 범위와 높은 피해." },
  destroyer: { name: "파괴자", tier: 3, base: "warrior", lv: 40, cost: 5000, weapons: ["axe", "mace"], next: [], icon: "mace", color: "§c", bonus: { str: 12, vit: 6 }, desc: "대지를 부수는 재앙." },

  archer: { name: "궁수", tier: 1, base: "archer", weapons: ["bow", "crossbow"], next: ["sniper", "hunter"], icon: "archer", color: "§a", desc: "먼 거리에서 약점을 꿰뚫는 사냥꾼." },
  sniper: { name: "저격수", tier: 2, base: "archer", lv: 20, cost: 1000, weapons: ["bow"], next: ["hawkeye"], icon: "archer", color: "§a", bonus: { dex: 6, str: 2 }, desc: "한 발에 끝내는 정밀 사격." },
  hawkeye: { name: "매의 눈", tier: 3, base: "archer", lv: 40, cost: 5000, weapons: ["bow"], next: [], icon: "archer", color: "§a", bonus: { dex: 12, str: 4 }, desc: "하늘에서 내려다보듯 모든 것을 꿰뚫는다." },
  hunter: { name: "사냥꾼", tier: 2, base: "archer", lv: 20, cost: 1000, weapons: ["crossbow", "spear"], next: ["beastlord"], icon: "crossbow", color: "§a", bonus: { dex: 4, str: 4 }, desc: "쇠뇌와 창으로 무리를 사냥한다." },
  beastlord: { name: "야수왕", tier: 3, base: "archer", lv: 40, cost: 5000, weapons: ["crossbow", "spear"], next: [], icon: "spear", color: "§a", bonus: { dex: 8, str: 8 }, desc: "사냥의 왕." },

  mage: { name: "마법사", tier: 1, base: "mage", weapons: ["staff"], next: ["elementalist", "stormcaller"], icon: "mage", color: "§b", desc: "원소의 힘을 다루는 학자." },
  elementalist: { name: "원소술사", tier: 2, base: "mage", lv: 20, cost: 1000, weapons: ["staff"], next: ["archmage"], icon: "mage", color: "§b", bonus: { int: 7 }, desc: "불과 얼음을 자유롭게 다룬다." },
  archmage: { name: "대마법사", tier: 3, base: "mage", lv: 40, cost: 5000, weapons: ["staff"], next: [], icon: "mage", color: "§b", bonus: { int: 14 }, desc: "마법의 끝에 도달한 자." },
  stormcaller: { name: "뇌전술사", tier: 2, base: "mage", lv: 20, cost: 1000, weapons: ["staff", "spear"], next: ["stormlord"], icon: "spear", color: "§b", bonus: { int: 5, dex: 2 }, desc: "번개를 창처럼 다룬다." },
  stormlord: { name: "폭풍의 군주", tier: 3, base: "mage", lv: 40, cost: 5000, weapons: ["staff", "spear"], next: [], icon: "spear", color: "§b", bonus: { int: 10, dex: 4 }, desc: "하늘의 분노 그 자체." },

  cleric: { name: "성직자", tier: 1, base: "cleric", weapons: ["mace", "staff"], next: ["priest", "paladin"], icon: "cleric", color: "§e", desc: "빛의 가호로 동료를 지키는 치유사." },
  priest: { name: "사제", tier: 2, base: "cleric", lv: 20, cost: 1000, weapons: ["staff"], next: ["archbishop"], icon: "cleric", color: "§e", bonus: { int: 4, vit: 4 }, desc: "더 강한 치유와 정화." },
  archbishop: { name: "대주교", tier: 3, base: "cleric", lv: 40, cost: 5000, weapons: ["staff"], next: [], icon: "cleric", color: "§e", bonus: { int: 8, vit: 8 }, desc: "기적을 행하는 자." },
  paladin: { name: "성기사", tier: 2, base: "cleric", lv: 20, cost: 1000, weapons: ["mace", "sword"], next: ["crusader"], icon: "class", color: "§e", bonus: { vit: 5, str: 3 }, desc: "빛의 무기로 싸우는 수호자." },
  crusader: { name: "성전사", tier: 3, base: "cleric", lv: 40, cost: 5000, weapons: ["mace", "sword"], next: [], icon: "class", color: "§e", bonus: { vit: 10, str: 6 }, desc: "성스러운 전쟁의 선봉." },
};

export const TIER_NAMES = ["", "1차", "2차", "3차"];

// 직업 스킬 (path 단계에서 배움, 그 단계 무기 필요)
export const JOB_SKILLS = [
  { id: "j_warrior_1", path: "warrior", name: "대지 가르기", lv: 1, mp: 12, cd: 6, kind: "melee", pow: 1.5, fx: "sword_spin", desc: "주변 3.5블록의 적에게 150% 피해." },
  { id: "j_warrior_2", path: "warrior", name: "전투의 함성", lv: 8, mp: 20, cd: 30, kind: "buff", pow: 25, fx: "axe_rage", desc: "10초 동안 공격력 +25%." },
  { id: "j_swordmaster_1", path: "swordmaster", name: "질풍 돌진", lv: 20, mp: 18, cd: 9, kind: "melee", pow: 2, fx: "sword_dash", desc: "앞으로 돌진하며 경로의 적에게 200% 피해." },
  { id: "j_swordmaster_2", path: "swordmaster", name: "일섬", lv: 30, mp: 22, cd: 10, kind: "melee", pow: 2.4, fx: "spear_thrust", desc: "앞 6블록을 한 번에 베어 240% 피해." },
  { id: "j_sword_emperor_1", path: "sword_emperor", name: "심판의 일격", lv: 40, mp: 35, cd: 18, kind: "melee", pow: 5, fx: "sword_judge", desc: "적 하나에게 500% 피해 + 구속." },
  { id: "j_sword_emperor_2", path: "sword_emperor", name: "천검난무", lv: 55, mp: 50, cd: 30, kind: "melee", pow: 1.6, fx: "bow_rain", desc: "목표 지점에 검기가 3번 쏟아져 160%씩 피해." },
  { id: "j_berserker_1", path: "berserker", name: "대지 강타", lv: 20, mp: 18, cd: 9, kind: "melee", pow: 2, fx: "axe_slam", desc: "4블록 범위 200% 피해 + 띄우기." },
  { id: "j_berserker_2", path: "berserker", name: "광폭화", lv: 30, mp: 30, cd: 35, kind: "buff", pow: 50, fx: "axe_rage", desc: "10초 동안 공격력 +50%." },
  { id: "j_destroyer_1", path: "destroyer", name: "지진", lv: 40, mp: 35, cd: 15, kind: "melee", pow: 2.5, fx: "mace_quake", desc: "5블록 범위 250% 피해 + 크게 띄우기." },
  { id: "j_destroyer_2", path: "destroyer", name: "파멸의 일격", lv: 55, mp: 50, cd: 25, kind: "melee", pow: 6, fx: "sword_judge", desc: "적 하나에게 600% 피해." },

  { id: "j_archer_1", path: "archer", name: "관통 사격", lv: 1, mp: 10, cd: 5, kind: "ranged", pow: 1.6, fx: "bow_pierce", desc: "직선 32블록, 적 3명까지 160% 피해." },
  { id: "j_archer_2", path: "archer", name: "화살비", lv: 8, mp: 22, cd: 14, kind: "ranged", pow: 0.8, fx: "bow_rain", desc: "목표 지점에 3번 80%씩 피해." },
  { id: "j_sniper_1", path: "sniper", name: "저격", lv: 20, mp: 18, cd: 8, kind: "ranged", pow: 3, fx: "bow_pierce", desc: "직선 관통 300% 피해." },
  { id: "j_sniper_2", path: "sniper", name: "폭발 화살", lv: 30, mp: 25, cd: 12, kind: "ranged", pow: 2.5, fx: "xbow_burst", desc: "목표 지점 폭발 250% 피해." },
  { id: "j_hawkeye_1", path: "hawkeye", name: "삼연사", lv: 40, mp: 30, cd: 12, kind: "ranged", pow: 2, fx: "xbow_volley", desc: "부채꼴 3발, 각 200% 관통 피해." },
  { id: "j_hawkeye_2", path: "hawkeye", name: "천공의 화살", lv: 55, mp: 45, cd: 25, kind: "ranged", pow: 4, fx: "spear_storm", desc: "하늘에서 번개 화살 400% 피해." },
  { id: "j_hunter_1", path: "hunter", name: "일제 사격", lv: 20, mp: 20, cd: 10, kind: "ranged", pow: 1.4, fx: "xbow_volley", desc: "부채꼴 3발, 각 140% 피해." },
  { id: "j_hunter_2", path: "hunter", name: "꿰뚫기", lv: 30, mp: 18, cd: 7, kind: "melee", pow: 2, fx: "spear_thrust", desc: "앞 6블록 관통 200% 피해." },
  { id: "j_beastlord_1", path: "beastlord", name: "폭발 볼트", lv: 40, mp: 30, cd: 12, kind: "ranged", pow: 3, fx: "xbow_burst", desc: "폭발 300% 피해." },
  { id: "j_beastlord_2", path: "beastlord", name: "사냥의 시간", lv: 55, mp: 40, cd: 35, kind: "buff", pow: 60, fx: "axe_rage", desc: "10초 동안 공격력 +60%." },

  { id: "j_mage_1", path: "mage", name: "화염구", lv: 1, mp: 15, cd: 6, kind: "magic", pow: 1.6, fx: "staff_fire", desc: "목표 지점 폭발 160% + 화상." },
  { id: "j_mage_2", path: "mage", name: "서리 폭풍", lv: 8, mp: 22, cd: 12, kind: "magic", pow: 1.2, fx: "staff_frost", desc: "주변 5블록 120% + 구속." },
  { id: "j_elementalist_1", path: "elementalist", name: "불꽃 비", lv: 20, mp: 28, cd: 14, kind: "magic", pow: 1.2, fx: "bow_rain", desc: "목표 지점에 불꽃 3연타 120%씩." },
  { id: "j_elementalist_2", path: "elementalist", name: "빙결 지옥", lv: 30, mp: 32, cd: 16, kind: "magic", pow: 2, fx: "staff_frost", desc: "주변 5블록 200% + 구속." },
  { id: "j_archmage_1", path: "archmage", name: "메테오", lv: 40, mp: 45, cd: 20, kind: "magic", pow: 4, fx: "xbow_burst", desc: "목표 지점 대폭발 400%." },
  { id: "j_archmage_2", path: "archmage", name: "원소 폭주", lv: 55, mp: 60, cd: 30, kind: "magic", pow: 3.5, fx: "staff_fire", desc: "화염 폭발 350% + 화상." },
  { id: "j_stormcaller_1", path: "stormcaller", name: "뇌우", lv: 20, mp: 30, cd: 18, kind: "magic", pow: 2.5, fx: "spear_storm", desc: "번개 250% 피해." },
  { id: "j_stormcaller_2", path: "stormcaller", name: "번개 창", lv: 30, mp: 22, cd: 9, kind: "magic", pow: 2, fx: "spear_thrust", desc: "앞 6블록 관통 200%." },
  { id: "j_stormlord_1", path: "stormlord", name: "천둥 강림", lv: 40, mp: 45, cd: 20, kind: "magic", pow: 4, fx: "spear_storm", desc: "번개 400% 피해." },
  { id: "j_stormlord_2", path: "stormlord", name: "폭풍", lv: 55, mp: 55, cd: 25, kind: "magic", pow: 2.5, fx: "staff_frost", desc: "주변 5블록 250% + 구속." },

  { id: "j_cleric_1", path: "cleric", name: "치유의 빛", lv: 1, mp: 25, cd: 15, kind: "heal", pow: 1, fx: "staff_heal", desc: "자신과 8블록 안 파티원 회복 + 재생." },
  { id: "j_cleric_2", path: "cleric", name: "신성 강타", lv: 8, mp: 15, cd: 8, kind: "melee", pow: 2, fx: "sword_judge", desc: "적 하나에게 200% 피해 + 구속." },
  { id: "j_priest_1", path: "priest", name: "대치유", lv: 20, mp: 35, cd: 15, kind: "heal", pow: 2, fx: "staff_heal", desc: "파티 대량 회복." },
  { id: "j_priest_2", path: "priest", name: "정화의 빛", lv: 30, mp: 28, cd: 14, kind: "magic", pow: 1.6, fx: "staff_frost", desc: "주변 5블록 160% + 구속." },
  { id: "j_archbishop_1", path: "archbishop", name: "기적", lv: 40, mp: 50, cd: 25, kind: "heal", pow: 3, fx: "staff_heal", desc: "파티 전체를 크게 회복." },
  { id: "j_archbishop_2", path: "archbishop", name: "심판의 빛", lv: 55, mp: 50, cd: 22, kind: "magic", pow: 3.5, fx: "spear_storm", desc: "번개 350% 피해." },
  { id: "j_paladin_1", path: "paladin", name: "신성 돌진", lv: 20, mp: 20, cd: 10, kind: "melee", pow: 1.8, fx: "sword_dash", desc: "돌진하며 180% 피해." },
  { id: "j_paladin_2", path: "paladin", name: "수호의 맹세", lv: 30, mp: 30, cd: 35, kind: "buff", pow: 30, fx: "axe_rage", desc: "10초 동안 공격력 +30%." },
  { id: "j_crusader_1", path: "crusader", name: "성스러운 지진", lv: 40, mp: 40, cd: 18, kind: "melee", pow: 2.4, fx: "mace_quake", desc: "5블록 범위 240% + 띄우기." },
  { id: "j_crusader_2", path: "crusader", name: "천벌", lv: 55, mp: 50, cd: 25, kind: "magic", pow: 4, fx: "spear_storm", desc: "번개 400% 피해." },
];

// 제작자 도구 변경값: rpg:jobskills = { [id]: { ...변경 필드, enabled, custom } }
let db = null;
export const jobSkillDb = () => (db ??= getJSON(world, "rpg:jobskills", {}));
let cache = null;
export function saveJobSkill(id, patch) {
  jobSkillDb()[id] = { ...(jobSkillDb()[id] ?? {}), ...patch };
  setJSON(world, "rpg:jobskills", db);
  cache = null;
}
export function deleteJobSkill(id) {
  delete jobSkillDb()[id];
  setJSON(world, "rpg:jobskills", db);
  cache = null;
}
export function allJobSkills() {
  if (cache) return cache;
  const d = jobSkillDb();
  const list = JOB_SKILLS.map((s) => ({ ...s, enabled: true, ...(d[s.id] ?? {}) }));
  for (const [id, v] of Object.entries(d)) if (v.custom && !JOB_SKILLS.some((s) => s.id === id)) list.push({ id, path: "warrior", lv: 1, mp: 10, cd: 8, kind: "melee", pow: 1.5, fx: "sword_spin", desc: "", enabled: true, ...v });
  return (cache = list);
}
export const getJobSkill = (id) => allJobSkills().find((s) => s.id === id);
export const skillsOfPath = (path) => allJobSkills().filter((s) => s.path === path && s.enabled !== false);

/** 플레이어의 승급 경로 [1차, 2차, 3차] (없는 단계는 빠짐) */
export function chain(d) {
  return [d.cls, d.adv2, d.adv3].filter((x) => x && PATHS[x] && x !== "novice");
}
export const currentPath = (d) => chain(d).at(-1) ?? "novice";
export function pathBonus(d, k) {
  return chain(d).reduce((n, id) => n + (PATHS[id]?.bonus?.[k] ?? 0), 0);
}
/** 플레이어가 지금 배운(레벨 충족) 직업 스킬 */
export function learned(d) {
  return chain(d).flatMap(skillsOfPath).filter((s) => d.lv >= s.lv);
}
