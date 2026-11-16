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

/** 경로별 기본 색 팔레트 (ms.js PAL) */
export const PATH_PAL = {
  novice: "cloud", warrior: "steel", swordmaster: "steel", sword_emperor: "steel", berserker: "blood", destroyer: "blood",
  archer: "forest", sniper: "forest", hawkeye: "forest", hunter: "forest", beastlord: "forest",
  mage: "moon", elementalist: "ember", archmage: "ember", stormcaller: "storm", stormlord: "storm",
  cleric: "holy", priest: "holy", archbishop: "holy", paladin: "holy", crusader: "holy",
};

export const TIER_NAMES = ["", "1차", "2차", "3차"];

// 직업 스킬 (path 단계에서 배움, 그 단계 전용 도구를 들어야 사용)
//   key 1 = 클릭(사용), 2 = 쉬프트+클릭, 3 = 쉬프트+점프
// V2.9: MagicSpells 분석 후 새로 만든 스킬 (fx = spellbook.js 의 스펠, o = 스펠 조정값, pal = 색 팔레트)
export const JOB_SKILLS = [
  { id: "j_warrior_1", key: 1, path: "warrior", name: "초승달 회전베기", lv: 1, mp: 12, cd: 6, kind: "melee", pow: 1.5, fx: "crescent", desc: "주변에 3겹 붉은 타원을 그리며 3.5블록 안 적에게 150% 피해." },
  { id: "j_warrior_2", key: 2, path: "warrior", name: "전투의 함성", lv: 8, mp: 20, cd: 30, kind: "buff", pow: 25, fx: "warcry", desc: "붉은 나선이 감싸며 10초 동안 공격력 +25%." },
  { id: "j_warrior_3", key: 3, path: "warrior", name: "도약 강타", lv: 12, mp: 22, cd: 14, kind: "melee", pow: 1.8, fx: "leap_slam", desc: "뛰어올라 내려찍어 바닥 나선과 함께 주변 180% 피해 + 띄우기." },
  { id: "j_swordmaster_1", key: 1, path: "swordmaster", name: "질풍 연참", lv: 20, mp: 18, cd: 9, kind: "melee", pow: 1.6, fx: "dash_slash", desc: "앞으로 돌진하며 6번 연속 베기. 지나간 자리의 적에게 연속 피해." },
  { id: "j_swordmaster_2", key: 2, path: "swordmaster", name: "일섬", lv: 30, mp: 22, cd: 10, kind: "melee", pow: 2.4, fx: "iaido", desc: "수직으로 베어 올린 뒤 14블록을 꿰뚫는 일격. 240% 피해." },
  { id: "j_swordmaster_3", key: 3, path: "swordmaster", name: "초승달 검기", lv: 25, mp: 24, cd: 10, kind: "melee", pow: 2.0, fx: "moon_wave", desc: "지면을 타고 나아가는 3겹 초승달 검기. 경로의 적에게 200% 피해." },
  { id: "j_sword_emperor_1", key: 1, path: "sword_emperor", name: "심판", lv: 40, mp: 35, cd: 18, kind: "melee", pow: 1.6, fx: "judgement", o: {hits: 6, finish: 3}, desc: "바라본 적의 등 뒤로 이동, 표식 연타 후 내리꽂는다." },
  { id: "j_sword_emperor_2", key: 2, path: "sword_emperor", name: "천검난무", lv: 55, mp: 50, cd: 30, kind: "melee", pow: 1.6, fx: "thousand_blades", o: {count: 16}, desc: "하늘의 고리에서 검기 16줄기가 쏟아진다." },
  { id: "j_sword_emperor_3", key: 3, path: "sword_emperor", name: "검풍난무", lv: 45, mp: 45, cd: 22, kind: "melee", pow: 1.4, fx: "blade_tempest", desc: "돌진 베기 3연 → 회오리로 띄우고 → 착지 대폭발." },
  { id: "j_berserker_1", key: 1, path: "berserker", name: "대지 가르기", lv: 20, mp: 18, cd: 9, kind: "melee", pow: 2.0, fx: "splitter", desc: "거대한 수직 호로 내려찍고 앞으로 파편이 터져 나간다." },
  { id: "j_berserker_2", key: 2, path: "berserker", name: "광폭화", lv: 30, mp: 30, cd: 35, kind: "buff", pow: 50, fx: "warcry", desc: "10초 동안 공격력 +50%." },
  { id: "j_berserker_3", key: 3, path: "berserker", name: "분쇄 도약", lv: 25, mp: 26, cd: 14, kind: "melee", pow: 2.4, fx: "leap_slam", o: {scale: 1.2}, desc: "더 높이 뛰어 내려찍는다. 주변 240% 피해 + 띄우기." },
  { id: "j_destroyer_1", key: 1, path: "destroyer", name: "도살", lv: 40, mp: 35, cd: 15, kind: "melee", pow: 2.5, fx: "slaughter", desc: "3색 구가 퍼지는 대폭발. 7블록 250% 피해 + 약화·둔화." },
  { id: "j_destroyer_2", key: 2, path: "destroyer", name: "처형", lv: 55, mp: 50, cd: 25, kind: "melee", pow: 2.0, fx: "execution", o: {mul: 5}, desc: "대상을 묶고 둘레에 수직 원을 그린 뒤 1000% 강타." },
  { id: "j_destroyer_3", key: 3, path: "destroyer", name: "대지 붕괴", lv: 45, mp: 45, cd: 20, kind: "melee", pow: 3.2, fx: "leap_slam", o: {scale: 1.5}, desc: "거대한 도약 강타. 넓은 범위 320% 피해 + 크게 띄우기." },
  { id: "j_archer_1", key: 1, path: "archer", name: "관통 사격", lv: 1, mp: 10, cd: 5, kind: "ranged", pow: 1.6, fx: "pierce_arrow", desc: "초록·검정 궤적을 남기는 관통 화살 160% 피해." },
  { id: "j_archer_2", key: 2, path: "archer", name: "화살비", lv: 8, mp: 22, cd: 14, kind: "ranged", pow: 0.8, fx: "arrow_rain", desc: "하늘에 고리를 그리고 화살이 3번 쏟아진다. 80%씩." },
  { id: "j_archer_3", key: 3, path: "archer", name: "후방 도약 사격", lv: 12, mp: 14, cd: 9, kind: "ranged", pow: 1.4, fx: "back_shot", desc: "뒤로 뛰며 세 갈래 관통 화살 140%." },
  { id: "j_sniper_1", key: 1, path: "sniper", name: "나선 저격", lv: 20, mp: 18, cd: 8, kind: "ranged", pow: 3.0, fx: "spiral_snipe", desc: "시선 방향으로 감기는 나선과 함께 관통 저격 300%." },
  { id: "j_sniper_2", key: 2, path: "sniper", name: "폭발 화살", lv: 30, mp: 25, cd: 12, kind: "ranged", pow: 2.5, fx: "blast_arrow", desc: "착탄 지점이 구 모양으로 폭발. 250%." },
  { id: "j_sniper_3", key: 3, path: "sniper", name: "회피 사격", lv: 25, mp: 20, cd: 9, kind: "ranged", pow: 2.4, fx: "back_shot", desc: "뒤로 뛰며 세 갈래 관통 화살 240%." },
  { id: "j_hawkeye_1", key: 1, path: "hawkeye", name: "오연사", lv: 40, mp: 30, cd: 12, kind: "ranged", pow: 2.0, fx: "fan_volley", o: {count: 5, spread: 40}, desc: "부채꼴로 5발 관통 화살, 각 200%." },
  { id: "j_hawkeye_2", key: 2, path: "hawkeye", name: "천공의 화살", lv: 55, mp: 45, cd: 25, kind: "ranged", pow: 4.0, fx: "sky_arrow", desc: "하늘에서 빛줄기가 내리꽂혀 회오리와 별로 터진다. 400%." },
  { id: "j_hawkeye_3", key: 3, path: "hawkeye", name: "화살 폭풍", lv: 45, mp: 45, cd: 22, kind: "ranged", pow: 1.2, fx: "arrow_storm", desc: "사방 4갈래로 나가 각 지점에서 회오리가 일어난다." },
  { id: "j_hunter_1", key: 1, path: "hunter", name: "일제 사격", lv: 20, mp: 20, cd: 10, kind: "ranged", pow: 1.4, fx: "fan_volley", o: {count: 3, spread: 20}, desc: "부채꼴 3발, 각 140%." },
  { id: "j_hunter_2", key: 2, path: "hunter", name: "창 돌격", lv: 30, mp: 18, cd: 9, kind: "melee", pow: 1.5, fx: "lunge", pal: "frost", desc: "두 번 돌진하며 주변의 생명력을 흡수한다." },
  { id: "j_hunter_3", key: 3, path: "hunter", name: "덫 사격", lv: 25, mp: 20, cd: 10, kind: "ranged", pow: 1.8, fx: "back_shot", o: {slow: true}, desc: "뒤로 뛰며 쏜 세 갈래 볼트가 적을 묶는다." },
  { id: "j_beastlord_1", key: 1, path: "beastlord", name: "폭발 볼트", lv: 40, mp: 30, cd: 12, kind: "ranged", pow: 3.0, fx: "blast_arrow", o: {scale: 1.3}, desc: "넓게 폭발하는 볼트 300%." },
  { id: "j_beastlord_2", key: 2, path: "beastlord", name: "사냥의 시간", lv: 55, mp: 40, cd: 35, kind: "buff", pow: 60, fx: "warcry", o: {party: true}, desc: "10초 동안 공격력 +60%, 주변 파티원 힘." },
  { id: "j_beastlord_3", key: 3, path: "beastlord", name: "야수의 포효", lv: 45, mp: 40, cd: 22, kind: "melee", pow: 2.2, fx: "beast_roar", pal: "frost", desc: "바닥 나선과 회오리. 주변 220% 피해 + 공포(둔화·약화)." },
  { id: "j_mage_1", key: 1, path: "mage", name: "화염 연탄", lv: 1, mp: 15, cd: 6, kind: "magic", pow: 1.0, fx: "fire_storm", o: {count: 3, burn: true}, pal: "ember", desc: "발밑 나선 후 가속하는 화염탄 3발. 맞은 곳에 불꽃 계단." },
  { id: "j_mage_2", key: 2, path: "mage", name: "서리 폭풍", lv: 8, mp: 22, cd: 12, kind: "magic", pow: 1.2, fx: "frost_nova", pal: "frost", desc: "얼음 나선 4겹. 주변 120% + 둔화." },
  { id: "j_mage_3", key: 3, path: "mage", name: "순간 이동", lv: 12, mp: 15, cd: 8, kind: "magic", pow: 0, fx: "blink", desc: "달빛 나선을 남기며 바라보는 방향으로 순간 이동." },
  { id: "j_elementalist_1", key: 1, path: "elementalist", name: "혈풍", lv: 20, mp: 28, cd: 14, kind: "magic", pow: 1.2, fx: "fire_storm", o: {count: 5, burn: true}, pal: "ember", desc: "화염탄 5발이 점점 빨라진다. 120%씩 + 화상." },
  { id: "j_elementalist_2", key: 2, path: "elementalist", name: "빙결 지옥", lv: 30, mp: 32, cd: 16, kind: "magic", pow: 2.0, fx: "frost_nova", o: {scale: 1.3}, pal: "frost", desc: "넓은 얼음 폭풍 200% + 둔화." },
  { id: "j_elementalist_3", key: 3, path: "elementalist", name: "화염 폭풍", lv: 25, mp: 32, cd: 16, kind: "magic", pow: 1.0, fx: "meteor_rain", o: {count: 3}, pal: "ember", desc: "마법진에 불덩이 3개가 떨어진다." },
  { id: "j_archmage_1", key: 1, path: "archmage", name: "멸망의 마도서", lv: 40, mp: 45, cd: 20, kind: "magic", pow: 4.0, fx: "apocalypse", o: {burn: true, scale: 1.2}, pal: "ember", desc: "하늘의 고리 4단이 내려오고 대폭발. 400%." },
  { id: "j_archmage_2", key: 2, path: "archmage", name: "메테오 스트라이크", lv: 55, mp: 60, cd: 30, kind: "magic", pow: 2.0, fx: "meteor_rain", o: {count: 6}, pal: "ember", desc: "운석 6개가 쏟아진다. 200%씩." },
  { id: "j_archmage_3", key: 3, path: "archmage", name: "차원 도약", lv: 45, mp: 40, cd: 20, kind: "magic", pow: 0, fx: "blink", o: {invis: true}, desc: "순간 이동 후 3초 동안 모습을 감춘다." },
  { id: "j_stormcaller_1", key: 1, path: "stormcaller", name: "낙뢰", lv: 20, mp: 30, cd: 18, kind: "magic", pow: 2.5, fx: "thunder", pal: "storm", desc: "지그재그 번개가 떨어진다. 250%." },
  { id: "j_stormcaller_2", key: 2, path: "stormcaller", name: "번개 창", lv: 30, mp: 22, cd: 9, kind: "magic", pow: 2.0, fx: "storm_spears", pal: "storm", desc: "뒤로 뛰며 세 갈래 번개 창. 200%." },
  { id: "j_stormcaller_3", key: 3, path: "stormcaller", name: "연쇄 번개", lv: 25, mp: 26, cd: 12, kind: "magic", pow: 1.6, fx: "chain_lightning", o: {count: 4}, pal: "storm", desc: "적 사이를 튀는 번개. 최대 4명 160%." },
  { id: "j_stormlord_1", key: 1, path: "stormlord", name: "천둥 강림", lv: 40, mp: 45, cd: 20, kind: "magic", pow: 2.4, fx: "thunder", o: {count: 4}, pal: "storm", desc: "번개 4줄기 240%씩." },
  { id: "j_stormlord_2", key: 2, path: "stormlord", name: "폭풍의 눈", lv: 55, mp: 55, cd: 30, kind: "magic", pow: 1.6, fx: "tempest", pal: "storm", desc: "돌아가는 폭풍 구체가 주변을 연속으로 갈아 낸다." },
  { id: "j_stormlord_3", key: 3, path: "stormlord", name: "뇌신 강림", lv: 45, mp: 50, cd: 22, kind: "magic", pow: 2.4, fx: "chain_lightning", o: {count: 7}, pal: "storm", desc: "최대 7명을 잇는 번개 240%." },
  { id: "j_cleric_1", key: 1, path: "cleric", name: "치유의 빛", lv: 1, mp: 25, cd: 15, kind: "heal", pow: 1, fx: "heal", desc: "바닥 마법진과 별. 자신과 8블록 안 파티원 회복." },
  { id: "j_cleric_2", key: 2, path: "cleric", name: "신성 강타", lv: 8, mp: 15, cd: 8, kind: "melee", pow: 2.0, fx: "smite", desc: "하늘의 빛줄기가 내리꽂혀 200% + 기절." },
  { id: "j_cleric_3", key: 3, path: "cleric", name: "수호의 빛", lv: 12, mp: 20, cd: 25, kind: "heal", pow: 1, fx: "guard", o: {lvl: 1}, desc: "파티원을 빛의 구로 감싸 피해 감소 + 흡수." },
  { id: "j_priest_1", key: 1, path: "priest", name: "대치유", lv: 20, mp: 35, cd: 15, kind: "heal", pow: 2, fx: "heal", o: {regen: true, r: 12}, desc: "넓은 범위 대량 회복 + 재생." },
  { id: "j_priest_2", key: 2, path: "priest", name: "정화의 파동", lv: 30, mp: 28, cd: 14, kind: "magic", pow: 1.6, fx: "frost_nova", pal: "holy", desc: "빛의 나선 파동. 주변 160% + 둔화." },
  { id: "j_priest_3", key: 3, path: "priest", name: "성역", lv: 25, mp: 35, cd: 25, kind: "heal", pow: 1.6, fx: "sanctuary", desc: "잠시 무적, 빛의 별 파동 4번이 적을 흡수하고 아군을 회복." },
  { id: "j_archbishop_1", key: 1, path: "archbishop", name: "기적", lv: 40, mp: 50, cd: 25, kind: "heal", pow: 3, fx: "heal", o: {regen: true, r: 14}, desc: "파티 전체를 크게 회복 + 재생." },
  { id: "j_archbishop_2", key: 2, path: "archbishop", name: "심판의 빛", lv: 55, mp: 50, cd: 22, kind: "magic", pow: 3.5, fx: "apocalypse", pal: "holy", desc: "하늘의 빛 고리 4단 → 대폭발 350%." },
  { id: "j_archbishop_3", key: 3, path: "archbishop", name: "천상의 성역", lv: 45, mp: 55, cd: 30, kind: "heal", pow: 2.4, fx: "sanctuary", o: {scale: 1.3, pulses: 5}, desc: "더 넓은 성역 5파동." },
  { id: "j_paladin_1", key: 1, path: "paladin", name: "신성 돌진", lv: 20, mp: 20, cd: 10, kind: "melee", pow: 1.6, fx: "dash_slash", pal: "holy", desc: "빛을 두르고 돌진하며 6연속 베기." },
  { id: "j_paladin_2", key: 2, path: "paladin", name: "수호의 맹세", lv: 30, mp: 30, cd: 35, kind: "buff", pow: 30, fx: "warcry", o: {party: true}, pal: "holy", desc: "10초 동안 공격력 +30%, 주변 파티원 힘." },
  { id: "j_paladin_3", key: 3, path: "paladin", name: "신성 방패", lv: 25, mp: 25, cd: 25, kind: "heal", pow: 1.5, fx: "guard", o: {lvl: 2}, desc: "파티원에게 강한 피해 감소 + 보호막." },
  { id: "j_crusader_1", key: 1, path: "crusader", name: "성스러운 지진", lv: 40, mp: 40, cd: 18, kind: "melee", pow: 2.4, fx: "slaughter", pal: "holy", desc: "빛의 구가 퍼지는 대지진 240%." },
  { id: "j_crusader_2", key: 2, path: "crusader", name: "천벌", lv: 55, mp: 50, cd: 25, kind: "magic", pow: 1.8, fx: "thousand_blades", o: {count: 14}, pal: "holy", desc: "하늘에서 빛의 검 14자루가 쏟아진다." },
  { id: "j_crusader_3", key: 3, path: "crusader", name: "심판의 도약", lv: 45, mp: 45, cd: 18, kind: "melee", pow: 2.8, fx: "leap_slam", o: {scale: 1.4, holy: true}, desc: "빛기둥과 함께 내려찍어 280% 피해." },
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
  for (const [id, v] of Object.entries(d)) if (v.custom && !JOB_SKILLS.some((s) => s.id === id)) list.push({ id, path: "warrior", key: 1, lv: 1, mp: 10, cd: 8, kind: "melee", pow: 1.5, fx: "crescent", desc: "", enabled: true, ...v });
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
