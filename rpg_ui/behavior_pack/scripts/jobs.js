// 직업 승급 트리 + 직업 스킬
//   1차(Lv1)  →  2차(Lv20, 둘 중 선택)  →  3차(Lv40)
//   각 단계마다 전용 도구(tool)가 있고, 그 단계 스킬 3개는 그 도구를 들고 있을 때만 쓸 수 있다.
//   스킬 효과(fx)는 skills.js 의 효과를 재사용한다.
import { world } from "@minecraft/server";
import { getJSON, setJSON } from "./db.js";

// bonus: 이 단계에 도달하면 더해지는 능력치
export const PATHS = {
  novice: { name: "모험가", tier: 0, base: "novice", weapons: [], next: ["warrior", "archer", "mage", "cleric"], icon: "novice", desc: "아직 길을 정하지 않은 여행자." },

  warrior: { tool: { name: "전사의 검", shape: "sword", dmg: 7 }, name: "전사", tier: 1, base: "warrior", weapons: ["sword", "axe", "mace"], next: ["swordmaster", "berserker"], icon: "warrior", color: "§c", desc: "최전선에서 적을 베어 넘기는 근접 전투의 달인." },
  swordmaster: { tool: { name: "검성의 장검", shape: "greatsword", dmg: 10 }, name: "검성", tier: 2, base: "warrior", lv: 20, cost: 1000, weapons: ["sword"], next: ["sword_emperor"], icon: "class", color: "§c", bonus: { str: 5, dex: 3 }, desc: "검 한 자루에 모든 것을 건 검의 구도자. 빠르고 정확한 연속 공격." },
  sword_emperor: { tool: { name: "검황의 성검", shape: "greatsword", dmg: 14 }, name: "검황", tier: 3, base: "warrior", lv: 40, cost: 5000, weapons: ["sword"], next: [], icon: "class", color: "§c", bonus: { str: 10, dex: 6 }, desc: "검의 정점. 일격에 전장을 가른다." },
  berserker: { tool: { name: "광전사의 전투도끼", shape: "axe", dmg: 11 }, name: "광전사", tier: 2, base: "warrior", lv: 20, cost: 1000, weapons: ["axe", "mace"], next: ["destroyer"], icon: "axe", color: "§c", bonus: { str: 6, vit: 3 }, desc: "분노를 힘으로 바꾸는 파괴자. 넓은 범위와 높은 피해." },
  destroyer: { tool: { name: "파괴자의 대망치", shape: "hammer", dmg: 15 }, name: "파괴자", tier: 3, base: "warrior", lv: 40, cost: 5000, weapons: ["axe", "mace"], next: [], icon: "mace", color: "§c", bonus: { str: 12, vit: 6 }, desc: "대지를 부수는 재앙." },

  archer: { tool: { name: "궁수의 장궁", shape: "bow", dmg: 4 }, name: "궁수", tier: 1, base: "archer", weapons: ["bow", "crossbow"], next: ["sniper", "hunter"], icon: "archer", color: "§a", desc: "먼 거리에서 약점을 꿰뚫는 사냥꾼." },
  sniper: { tool: { name: "저격수의 강궁", shape: "longbow", dmg: 6 }, name: "저격수", tier: 2, base: "archer", lv: 20, cost: 1000, weapons: ["bow"], next: ["hawkeye"], icon: "archer", color: "§a", bonus: { dex: 6, str: 2 }, desc: "한 발에 끝내는 정밀 사격." },
  hawkeye: { tool: { name: "매의 눈 천궁", shape: "longbow", dmg: 8 }, name: "매의 눈", tier: 3, base: "archer", lv: 40, cost: 5000, weapons: ["bow"], next: [], icon: "archer", color: "§a", bonus: { dex: 12, str: 4 }, desc: "하늘에서 내려다보듯 모든 것을 꿰뚫는다." },
  hunter: { tool: { name: "사냥꾼의 쇠뇌", shape: "crossbow", dmg: 6 }, name: "사냥꾼", tier: 2, base: "archer", lv: 20, cost: 1000, weapons: ["crossbow", "spear"], next: ["beastlord"], icon: "crossbow", color: "§a", bonus: { dex: 4, str: 4 }, desc: "쇠뇌와 창으로 무리를 사냥한다." },
  beastlord: { tool: { name: "야수왕의 창", shape: "spear", dmg: 11 }, name: "야수왕", tier: 3, base: "archer", lv: 40, cost: 5000, weapons: ["crossbow", "spear"], next: [], icon: "spear", color: "§a", bonus: { dex: 8, str: 8 }, desc: "사냥의 왕." },

  mage: { tool: { name: "견습 마법 지팡이", shape: "staff", dmg: 3 }, name: "마법사", tier: 1, base: "mage", weapons: ["staff"], next: ["elementalist", "stormcaller"], icon: "mage", color: "§b", desc: "원소의 힘을 다루는 학자." },
  elementalist: { tool: { name: "원소의 지팡이", shape: "orbstaff", dmg: 5 }, name: "원소술사", tier: 2, base: "mage", lv: 20, cost: 1000, weapons: ["staff"], next: ["archmage"], icon: "mage", color: "§b", bonus: { int: 7 }, desc: "불과 얼음을 자유롭게 다룬다." },
  archmage: { tool: { name: "대마법사의 홀", shape: "scepter", dmg: 7 }, name: "대마법사", tier: 3, base: "mage", lv: 40, cost: 5000, weapons: ["staff"], next: [], icon: "mage", color: "§b", bonus: { int: 14 }, desc: "마법의 끝에 도달한 자." },
  stormcaller: { tool: { name: "뇌전의 창", shape: "spear", dmg: 8 }, name: "뇌전술사", tier: 2, base: "mage", lv: 20, cost: 1000, weapons: ["staff", "spear"], next: ["stormlord"], icon: "spear", color: "§b", bonus: { int: 5, dex: 2 }, desc: "번개를 창처럼 다룬다." },
  stormlord: { tool: { name: "폭풍의 삼지창", shape: "trident", dmg: 11 }, name: "폭풍의 군주", tier: 3, base: "mage", lv: 40, cost: 5000, weapons: ["staff", "spear"], next: [], icon: "spear", color: "§b", bonus: { int: 10, dex: 4 }, desc: "하늘의 분노 그 자체." },

  cleric: { tool: { name: "성직자의 철퇴", shape: "mace", dmg: 6 }, name: "성직자", tier: 1, base: "cleric", weapons: ["mace", "staff"], next: ["priest", "paladin"], icon: "cleric", color: "§e", desc: "빛의 가호로 동료를 지키는 치유사." },
  priest: { tool: { name: "사제의 성장", shape: "staff", dmg: 5 }, name: "사제", tier: 2, base: "cleric", lv: 20, cost: 1000, weapons: ["staff"], next: ["archbishop"], icon: "cleric", color: "§e", bonus: { int: 4, vit: 4 }, desc: "더 강한 치유와 정화." },
  archbishop: { tool: { name: "대주교의 성홀", shape: "scepter", dmg: 7 }, name: "대주교", tier: 3, base: "cleric", lv: 40, cost: 5000, weapons: ["staff"], next: [], icon: "cleric", color: "§e", bonus: { int: 8, vit: 8 }, desc: "기적을 행하는 자." },
  paladin: { tool: { name: "성기사의 성검", shape: "sword", dmg: 10 }, name: "성기사", tier: 2, base: "cleric", lv: 20, cost: 1000, weapons: ["mace", "sword"], next: ["crusader"], icon: "class", color: "§e", bonus: { vit: 5, str: 3 }, desc: "빛의 무기로 싸우는 수호자." },
  crusader: { tool: { name: "성전사의 전쟁망치", shape: "hammer", dmg: 13 }, name: "성전사", tier: 3, base: "cleric", lv: 40, cost: 5000, weapons: ["mace", "sword"], next: [], icon: "class", color: "§e", bonus: { vit: 10, str: 6 }, desc: "성스러운 전쟁의 선봉." },
};

export const TIER_NAMES = ["", "1차", "2차", "3차"];

// 직업 스킬 (path 단계에서 배움, 그 단계 전용 도구를 들어야 사용)
//   key 1 = 클릭(사용), 2 = 쉬프트+클릭, 3 = 쉬프트+점프
export const JOB_SKILLS = [
  { id: "j_warrior_1", key: 1, path: "warrior", name: "대지 가르기", lv: 1, mp: 12, cd: 6, kind: "melee", pow: 1.5, fx: "sword_spin", desc: "주변 3.5블록의 적에게 150% 피해." },
  { id: "j_warrior_2", key: 2, path: "warrior", name: "전투의 함성", lv: 8, mp: 20, cd: 30, kind: "buff", pow: 25, fx: "axe_rage", desc: "10초 동안 공격력 +25%." },
  { id: "j_swordmaster_1", key: 1, path: "swordmaster", name: "질풍 돌진", lv: 20, mp: 18, cd: 9, kind: "melee", pow: 2, fx: "sword_dash", desc: "앞으로 돌진하며 경로의 적에게 200% 피해." },
  { id: "j_swordmaster_2", key: 2, path: "swordmaster", name: "일섬", lv: 30, mp: 22, cd: 10, kind: "melee", pow: 2.4, fx: "spear_thrust", desc: "앞 6블록을 한 번에 베어 240% 피해." },
  { id: "j_sword_emperor_1", key: 1, path: "sword_emperor", name: "심판의 일격", lv: 40, mp: 35, cd: 18, kind: "melee", pow: 5, fx: "sword_judge", desc: "적 하나에게 500% 피해 + 구속." },
  { id: "j_sword_emperor_2", key: 2, path: "sword_emperor", name: "천검난무", lv: 55, mp: 50, cd: 30, kind: "melee", pow: 1.6, fx: "bow_rain", desc: "목표 지점에 검기가 3번 쏟아져 160%씩 피해." },
  { id: "j_berserker_1", key: 1, path: "berserker", name: "대지 강타", lv: 20, mp: 18, cd: 9, kind: "melee", pow: 2, fx: "axe_slam", desc: "4블록 범위 200% 피해 + 띄우기." },
  { id: "j_berserker_2", key: 2, path: "berserker", name: "광폭화", lv: 30, mp: 30, cd: 35, kind: "buff", pow: 50, fx: "axe_rage", desc: "10초 동안 공격력 +50%." },
  { id: "j_destroyer_1", key: 1, path: "destroyer", name: "지진", lv: 40, mp: 35, cd: 15, kind: "melee", pow: 2.5, fx: "mace_quake", desc: "5블록 범위 250% 피해 + 크게 띄우기." },
  { id: "j_destroyer_2", key: 2, path: "destroyer", name: "파멸의 일격", lv: 55, mp: 50, cd: 25, kind: "melee", pow: 6, fx: "sword_judge", desc: "적 하나에게 600% 피해." },

  { id: "j_archer_1", key: 1, path: "archer", name: "관통 사격", lv: 1, mp: 10, cd: 5, kind: "ranged", pow: 1.6, fx: "bow_pierce", desc: "직선 32블록, 적 3명까지 160% 피해." },
  { id: "j_archer_2", key: 2, path: "archer", name: "화살비", lv: 8, mp: 22, cd: 14, kind: "ranged", pow: 0.8, fx: "bow_rain", desc: "목표 지점에 3번 80%씩 피해." },
  { id: "j_sniper_1", key: 1, path: "sniper", name: "저격", lv: 20, mp: 18, cd: 8, kind: "ranged", pow: 3, fx: "bow_pierce", desc: "직선 관통 300% 피해." },
  { id: "j_sniper_2", key: 2, path: "sniper", name: "폭발 화살", lv: 30, mp: 25, cd: 12, kind: "ranged", pow: 2.5, fx: "xbow_burst", desc: "목표 지점 폭발 250% 피해." },
  { id: "j_hawkeye_1", key: 1, path: "hawkeye", name: "삼연사", lv: 40, mp: 30, cd: 12, kind: "ranged", pow: 2, fx: "xbow_volley", desc: "부채꼴 3발, 각 200% 관통 피해." },
  { id: "j_hawkeye_2", key: 2, path: "hawkeye", name: "천공의 화살", lv: 55, mp: 45, cd: 25, kind: "ranged", pow: 4, fx: "spear_storm", desc: "하늘에서 번개 화살 400% 피해." },
  { id: "j_hunter_1", key: 1, path: "hunter", name: "일제 사격", lv: 20, mp: 20, cd: 10, kind: "ranged", pow: 1.4, fx: "xbow_volley", desc: "부채꼴 3발, 각 140% 피해." },
  { id: "j_hunter_2", key: 2, path: "hunter", name: "꿰뚫기", lv: 30, mp: 18, cd: 7, kind: "melee", pow: 2, fx: "spear_thrust", desc: "앞 6블록 관통 200% 피해." },
  { id: "j_beastlord_1", key: 1, path: "beastlord", name: "폭발 볼트", lv: 40, mp: 30, cd: 12, kind: "ranged", pow: 3, fx: "xbow_burst", desc: "폭발 300% 피해." },
  { id: "j_beastlord_2", key: 2, path: "beastlord", name: "사냥의 시간", lv: 55, mp: 40, cd: 35, kind: "buff", pow: 60, fx: "axe_rage", desc: "10초 동안 공격력 +60%." },

  { id: "j_mage_1", key: 1, path: "mage", name: "화염구", lv: 1, mp: 15, cd: 6, kind: "magic", pow: 1.6, fx: "staff_fire", desc: "목표 지점 폭발 160% + 화상." },
  { id: "j_mage_2", key: 2, path: "mage", name: "서리 폭풍", lv: 8, mp: 22, cd: 12, kind: "magic", pow: 1.2, fx: "staff_frost", desc: "주변 5블록 120% + 구속." },
  { id: "j_elementalist_1", key: 1, path: "elementalist", name: "불꽃 비", lv: 20, mp: 28, cd: 14, kind: "magic", pow: 1.2, fx: "bow_rain", desc: "목표 지점에 불꽃 3연타 120%씩." },
  { id: "j_elementalist_2", key: 2, path: "elementalist", name: "빙결 지옥", lv: 30, mp: 32, cd: 16, kind: "magic", pow: 2, fx: "staff_frost", desc: "주변 5블록 200% + 구속." },
  { id: "j_archmage_1", key: 1, path: "archmage", name: "메테오", lv: 40, mp: 45, cd: 20, kind: "magic", pow: 4, fx: "xbow_burst", desc: "목표 지점 대폭발 400%." },
  { id: "j_archmage_2", key: 2, path: "archmage", name: "원소 폭주", lv: 55, mp: 60, cd: 30, kind: "magic", pow: 3.5, fx: "staff_fire", desc: "화염 폭발 350% + 화상." },
  { id: "j_stormcaller_1", key: 1, path: "stormcaller", name: "뇌우", lv: 20, mp: 30, cd: 18, kind: "magic", pow: 2.5, fx: "spear_storm", desc: "번개 250% 피해." },
  { id: "j_stormcaller_2", key: 2, path: "stormcaller", name: "번개 창", lv: 30, mp: 22, cd: 9, kind: "magic", pow: 2, fx: "spear_thrust", desc: "앞 6블록 관통 200%." },
  { id: "j_stormlord_1", key: 1, path: "stormlord", name: "천둥 강림", lv: 40, mp: 45, cd: 20, kind: "magic", pow: 4, fx: "spear_storm", desc: "번개 400% 피해." },
  { id: "j_stormlord_2", key: 2, path: "stormlord", name: "폭풍", lv: 55, mp: 55, cd: 25, kind: "magic", pow: 2.5, fx: "staff_frost", desc: "주변 5블록 250% + 구속." },

  { id: "j_cleric_1", key: 1, path: "cleric", name: "치유의 빛", lv: 1, mp: 25, cd: 15, kind: "heal", pow: 1, fx: "staff_heal", desc: "자신과 8블록 안 파티원 회복 + 재생." },
  { id: "j_cleric_2", key: 2, path: "cleric", name: "신성 강타", lv: 8, mp: 15, cd: 8, kind: "melee", pow: 2, fx: "sword_judge", desc: "적 하나에게 200% 피해 + 구속." },
  { id: "j_priest_1", key: 1, path: "priest", name: "대치유", lv: 20, mp: 35, cd: 15, kind: "heal", pow: 2, fx: "staff_heal", desc: "파티 대량 회복." },
  { id: "j_priest_2", key: 2, path: "priest", name: "정화의 빛", lv: 30, mp: 28, cd: 14, kind: "magic", pow: 1.6, fx: "staff_frost", desc: "주변 5블록 160% + 구속." },
  { id: "j_archbishop_1", key: 1, path: "archbishop", name: "기적", lv: 40, mp: 50, cd: 25, kind: "heal", pow: 3, fx: "staff_heal", desc: "파티 전체를 크게 회복." },
  { id: "j_archbishop_2", key: 2, path: "archbishop", name: "심판의 빛", lv: 55, mp: 50, cd: 22, kind: "magic", pow: 3.5, fx: "spear_storm", desc: "번개 350% 피해." },
  { id: "j_paladin_1", key: 1, path: "paladin", name: "신성 돌진", lv: 20, mp: 20, cd: 10, kind: "melee", pow: 1.8, fx: "sword_dash", desc: "돌진하며 180% 피해." },
  { id: "j_paladin_2", key: 2, path: "paladin", name: "수호의 맹세", lv: 30, mp: 30, cd: 35, kind: "buff", pow: 30, fx: "axe_rage", desc: "10초 동안 공격력 +30%." },
  { id: "j_crusader_1", key: 1, path: "crusader", name: "성스러운 지진", lv: 40, mp: 40, cd: 18, kind: "melee", pow: 2.4, fx: "mace_quake", desc: "5블록 범위 240% + 띄우기." },
  { id: "j_crusader_2", key: 2, path: "crusader", name: "천벌", lv: 55, mp: 50, cd: 25, kind: "magic", pow: 4, fx: "spear_storm", desc: "번개 400% 피해." },

  // 3번 스킬 (쉬프트+점프)
  { id: "j_warrior_3", key: 3, path: "warrior", name: "도약 강타", lv: 12, mp: 22, cd: 14, kind: "melee", pow: 1.8, fx: "leap_slam", desc: "높이 뛰어올라 내려찍어 주변 4블록에 180% 피해 + 띄우기." },
  { id: "j_swordmaster_3", key: 3, path: "swordmaster", name: "검기 방출", lv: 25, mp: 24, cd: 10, kind: "melee", pow: 2.2, fx: "sword_wave", desc: "초승달 검기를 앞으로 날려 경로의 적에게 220% 피해." },
  { id: "j_sword_emperor_3", key: 3, path: "sword_emperor", name: "검풍난무", lv: 45, mp: 45, cd: 22, kind: "melee", pow: 1.4, fx: "blade_storm", desc: "회전 베기를 4번 몰아쳐 주변 적에게 140%씩 피해." },
  { id: "j_berserker_3", key: 3, path: "berserker", name: "분쇄 도약", lv: 25, mp: 26, cd: 14, kind: "melee", pow: 2.4, fx: "leap_slam", desc: "도약해 내려찍어 주변 4블록 240% 피해 + 띄우기." },
  { id: "j_destroyer_3", key: 3, path: "destroyer", name: "대지 붕괴", lv: 45, mp: 45, cd: 20, kind: "melee", pow: 3.2, fx: "leap_slam", desc: "거대한 도약 강타. 주변 320% 피해 + 크게 띄우기." },
  { id: "j_archer_3", key: 3, path: "archer", name: "후방 도약 사격", lv: 12, mp: 14, cd: 9, kind: "ranged", pow: 1.4, fx: "backstep", desc: "뒤로 뛰며 앞으로 관통 화살 140% 피해." },
  { id: "j_sniper_3", key: 3, path: "sniper", name: "회피 저격", lv: 25, mp: 20, cd: 9, kind: "ranged", pow: 2.4, fx: "backstep", desc: "뒤로 뛰며 관통 저격 240% 피해." },
  { id: "j_hawkeye_3", key: 3, path: "hawkeye", name: "화살 폭풍", lv: 45, mp: 45, cd: 22, kind: "ranged", pow: 1.2, fx: "arrow_storm", desc: "사방으로 화살을 흩뿌린 뒤 하늘에서 쏟아붓는다. 120%씩 피해." },
  { id: "j_hunter_3", key: 3, path: "hunter", name: "덫 사격", lv: 25, mp: 20, cd: 10, kind: "ranged", pow: 1.8, fx: "backstep", desc: "뒤로 뛰며 쏜 볼트가 180% 피해 + 구속." },
  { id: "j_beastlord_3", key: 3, path: "beastlord", name: "야수의 포효", lv: 45, mp: 40, cd: 22, kind: "melee", pow: 2.2, fx: "roar", desc: "주변 6블록 220% 피해 + 공포(구속·약화)." },
  { id: "j_mage_3", key: 3, path: "mage", name: "순간 이동", lv: 12, mp: 15, cd: 8, kind: "magic", pow: 0, fx: "blink", desc: "바라보는 방향으로 최대 8블록 순간 이동." },
  { id: "j_elementalist_3", key: 3, path: "elementalist", name: "화염 폭풍", lv: 25, mp: 32, cd: 16, kind: "magic", pow: 1.0, fx: "meteor", desc: "목표 지점에 불덩이 3개가 떨어져 100%씩 폭발." },
  { id: "j_archmage_3", key: 3, path: "archmage", name: "메테오 스트라이크", lv: 45, mp: 55, cd: 26, kind: "magic", pow: 2.0, fx: "meteor", desc: "거대한 운석 비. 목표 지점에 200%씩 폭발." },
  { id: "j_stormcaller_3", key: 3, path: "stormcaller", name: "연쇄 번개", lv: 25, mp: 26, cd: 12, kind: "magic", pow: 1.6, fx: "chain_lightning", desc: "적 사이를 튀는 번개. 최대 4명 160% 피해." },
  { id: "j_stormlord_3", key: 3, path: "stormlord", name: "뇌신 강림", lv: 45, mp: 50, cd: 22, kind: "magic", pow: 2.4, fx: "chain_lightning", desc: "최대 7명을 잇는 번개 240% 피해." },
  { id: "j_cleric_3", key: 3, path: "cleric", name: "수호의 빛", lv: 12, mp: 20, cd: 25, kind: "heal", pow: 1, fx: "guard", desc: "자신과 파티원에게 피해 감소 + 흡수 보호막 8초." },
  { id: "j_priest_3", key: 3, path: "priest", name: "성역", lv: 25, mp: 35, cd: 25, kind: "heal", pow: 1.6, fx: "holy_nova", desc: "빛의 파동: 파티원 회복 + 주변 적 160% 피해." },
  { id: "j_archbishop_3", key: 3, path: "archbishop", name: "천상의 빛", lv: 45, mp: 55, cd: 30, kind: "heal", pow: 2.4, fx: "holy_nova", desc: "큰 빛의 파동: 파티 대량 회복 + 적 240% 피해." },
  { id: "j_paladin_3", key: 3, path: "paladin", name: "신성 방패", lv: 25, mp: 25, cd: 25, kind: "heal", pow: 1.5, fx: "guard", desc: "자신과 파티원에게 강한 피해 감소 + 보호막." },
  { id: "j_crusader_3", key: 3, path: "crusader", name: "심판의 도약", lv: 45, mp: 45, cd: 18, kind: "melee", pow: 2.8, fx: "leap_slam", desc: "빛과 함께 내려찍어 주변 280% 피해." },
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
export const skillsOfPath = (path) => allJobSkills().filter((s) => s.path === path && s.enabled !== false).sort((a, b) => (a.key ?? 1) - (b.key ?? 1));
/** 발동 키 (1 = 클릭, 2 = 쉬프트+클릭, 3 = 쉬프트+점프) 에 걸린 스킬. 같은 키가 여럿이면 제작 스킬 우선 */
export function skillAt(path, key) {
  const l = allJobSkills().filter((s) => s.path === path && s.enabled !== false && (s.key ?? 1) === key);
  return l.find((s) => s.custom) ?? l[0] ?? null;
}
export const KEY_NAMES = ["", "클릭", "쉬프트+클릭", "쉬프트+점프"];
export const KEY_ICONS = ["", "①", "②", "③"];

// ───────── 직업 전용 도구 ─────────
export const toolId = (path) => `rpg:jt_${path}`;
export const pathOfTool = (typeId) => (typeId?.startsWith("rpg:jt_") ? typeId.slice(7) : null);

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
