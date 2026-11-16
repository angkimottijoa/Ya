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
  swordmaster: { tool: { name: "차가운 달빛 클라우", shape: "greatsword", dmg: 10 }, name: "검성", tier: 2, base: "warrior", lv: 20, cost: 1000, weapons: ["sword"], next: ["sword_emperor"], icon: "class", color: "§c", bonus: { str: 5, dex: 3 }, desc: "검 한 자루에 모든 것을 건 검의 구도자. 빠르고 정확한 연속 공격." },
  sword_emperor: { tool: { name: "발뭉", shape: "greatsword", dmg: 14 }, name: "검황", tier: 3, base: "warrior", lv: 40, cost: 5000, weapons: ["sword"], next: [], icon: "class", color: "§c", bonus: { str: 10, dex: 6 }, desc: "검의 정점. 일격에 전장을 가른다." },
  berserker: { tool: { name: "핏빛칼날 블라디", shape: "sword", dmg: 11 }, name: "광전사", tier: 2, base: "warrior", lv: 20, cost: 1000, weapons: ["axe", "mace"], next: ["destroyer"], icon: "axe", color: "§c", bonus: { str: 6, vit: 3 }, desc: "분노를 힘으로 바꾸는 파괴자. 넓은 범위와 높은 피해." },
  destroyer: { tool: { name: "응룡의 도끼", shape: "axe", dmg: 15 }, name: "파괴자", tier: 3, base: "warrior", lv: 40, cost: 5000, weapons: ["axe", "mace"], next: [], icon: "mace", color: "§c", bonus: { str: 12, vit: 6 }, desc: "대지를 부수는 재앙." },

  archer: { tool: { name: "궁수의 장궁", shape: "bow", dmg: 4 }, name: "궁수", tier: 1, base: "archer", weapons: ["bow", "crossbow"], next: ["sniper", "hunter"], icon: "archer", color: "§a", desc: "먼 거리에서 약점을 꿰뚫는 사냥꾼." },
  sniper: { tool: { name: "혹한의 단검 네일링", shape: "sword", dmg: 8 }, name: "저격수", tier: 2, base: "archer", lv: 20, cost: 1000, weapons: ["bow"], next: ["hawkeye"], icon: "archer", color: "§a", bonus: { dex: 6, str: 2 }, desc: "한 발에 끝내는 정밀 사격." },
  hawkeye: { tool: { name: "쉐도어", shape: "sword", dmg: 11 }, name: "매의 눈", tier: 3, base: "archer", lv: 40, cost: 5000, weapons: ["bow"], next: [], icon: "archer", color: "§a", bonus: { dex: 12, str: 4 }, desc: "하늘에서 내려다보듯 모든 것을 꿰뚫는다." },
  hunter: { tool: { name: "영혼수확자의 창 바이던트", shape: "spear", dmg: 9 }, name: "사냥꾼", tier: 2, base: "archer", lv: 20, cost: 1000, weapons: ["crossbow", "spear"], next: ["beastlord"], icon: "crossbow", color: "§a", bonus: { dex: 4, str: 4 }, desc: "쇠뇌와 창으로 무리를 사냥한다." },
  beastlord: { tool: { name: "도살자", shape: "greatsword", dmg: 14 }, name: "야수왕", tier: 3, base: "archer", lv: 40, cost: 5000, weapons: ["crossbow", "spear"], next: [], icon: "spear", color: "§a", bonus: { dex: 8, str: 8 }, desc: "사냥의 왕." },

  mage: { tool: { name: "견습 마법 지팡이", shape: "staff", dmg: 3 }, name: "마법사", tier: 1, base: "mage", weapons: ["staff"], next: ["elementalist", "stormcaller"], icon: "mage", color: "§b", desc: "원소의 힘을 다루는 학자." },
  elementalist: { tool: { name: "크티아스의 마도서", shape: "orbstaff", dmg: 6 }, name: "원소술사", tier: 2, base: "mage", lv: 20, cost: 1000, weapons: ["staff"], next: ["archmage"], icon: "mage", color: "§b", bonus: { int: 7 }, desc: "불과 얼음을 자유롭게 다룬다." },
  archmage: { tool: { name: "그림자", shape: "scepter", dmg: 9 }, name: "대마법사", tier: 3, base: "mage", lv: 40, cost: 5000, weapons: ["staff"], next: [], icon: "mage", color: "§b", bonus: { int: 14 }, desc: "마법의 끝에 도달한 자." },
  stormcaller: { tool: { name: "뇌전의 창", shape: "spear", dmg: 8 }, name: "뇌전술사", tier: 2, base: "mage", lv: 20, cost: 1000, weapons: ["staff", "spear"], next: ["stormlord"], icon: "spear", color: "§b", bonus: { int: 5, dex: 2 }, desc: "번개를 창처럼 다룬다." },
  stormlord: { tool: { name: "폭풍의 삼지창", shape: "trident", dmg: 11 }, name: "폭풍의 군주", tier: 3, base: "mage", lv: 40, cost: 5000, weapons: ["staff", "spear"], next: [], icon: "spear", color: "§b", bonus: { int: 10, dex: 4 }, desc: "하늘의 분노 그 자체." },

  cleric: { tool: { name: "성직자의 철퇴", shape: "mace", dmg: 6 }, name: "성직자", tier: 1, base: "cleric", weapons: ["mace", "staff"], next: ["priest", "paladin"], icon: "cleric", color: "§e", desc: "빛의 가호로 동료를 지키는 치유사." },
  priest: { tool: { name: "도사의 부채", shape: "staff", dmg: 6 }, name: "사제", tier: 2, base: "cleric", lv: 20, cost: 1000, weapons: ["staff"], next: ["archbishop"], icon: "cleric", color: "§e", bonus: { int: 4, vit: 4 }, desc: "더 강한 치유와 정화." },
  archbishop: { tool: { name: "물의 성홀", shape: "scepter", dmg: 7 }, name: "대주교", tier: 3, base: "cleric", lv: 40, cost: 5000, weapons: ["staff"], next: [], icon: "cleric", color: "§e", bonus: { int: 8, vit: 8 }, desc: "기적을 행하는 자." },
  paladin: { tool: { name: "악마사냥꾼 데런의 총칼", shape: "sword", dmg: 12 }, name: "성기사", tier: 2, base: "cleric", lv: 20, cost: 1000, weapons: ["mace", "sword"], next: ["crusader"], icon: "class", color: "§e", bonus: { vit: 5, str: 3 }, desc: "빛의 무기로 싸우는 수호자." },
  crusader: { tool: { name: "업화의 전쟁망치", shape: "hammer", dmg: 13 }, name: "성전사", tier: 3, base: "cleric", lv: 40, cost: 5000, weapons: ["mace", "sword"], next: [], icon: "class", color: "§e", bonus: { vit: 10, str: 6 }, desc: "성스러운 전쟁의 선봉." },
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
// V3.0
//  - ms: 자바 MagicSpells 원본 스펠(msdata.js)을 그대로 실행 (2·3차 직업 대부분)
//  - fx: spellbook.js 스펠 (1차 직업 / 폭풍·대주교·성전사)
export const JOB_SKILLS = [
  // ── 자바 MagicSpells 이식 ──
  { id: "j_swordmaster_1", key: 1, path: "swordmaster", name: "초승달 베기", lv: 20, mp: 15, cd: 8, kind: "melee", pow: 1, ms: "클라우RCmulti1", anim: "slash", desc: "지면을 타고 나가는 달빛 초승달. 맞은 적 주위에 3색 고리." },
  { id: "j_swordmaster_2", key: 2, path: "swordmaster", name: "개기월식", lv: 30, mp: 30, cd: 25, kind: "melee", pow: 1, ms: "클라우SRCmulti1", anim: "raise", desc: "모습을 감추고 다음 일격에 달빛 별을 새긴다." },
  { id: "j_swordmaster_3", key: 3, path: "swordmaster", name: "달빛의 춤", lv: 25, mp: 25, cd: 18, kind: "melee", pow: 1, ms: "클라우SLCMulti1", anim: "dash", desc: "뒤로 물러섰다 그림자처럼 파고들어 베는 연속기." },
  { id: "j_sword_emperor_1", key: 1, path: "sword_emperor", name: "발뭉 연격", lv: 40, mp: 25, cd: 6, kind: "melee", pow: 1, ms: "Balmung_RightClick_M", anim: "slash", desc: "도약 베기 3단 콤보. 이어서 쓰면 다음 단계가 나간다." },
  { id: "j_sword_emperor_2", key: 2, path: "sword_emperor", name: "용살의 일격", lv: 55, mp: 60, cd: 60, kind: "melee", pow: 1, ms: "Balmung_ShiftR_M", anim: "raise", desc: "마법진과 두 마리 용의 검기가 내리꽂히는 궁극기." },
  { id: "j_sword_emperor_3", key: 3, path: "sword_emperor", name: "발뭉 난무", lv: 45, mp: 40, cd: 30, kind: "melee", pow: 1, ms: "Balmung_ShiftL", anim: "spin", desc: "발뭉의 검무." },
  { id: "j_berserker_1", key: 1, path: "berserker", name: "혈풍 흡혈", lv: 20, mp: 15, cd: 7, kind: "melee", pow: 1, ms: "블라디RCmulti1", anim: "spin", desc: "핏빛 고리 3번, 주변의 생명력을 빨아들인다." },
  { id: "j_berserker_2", key: 2, path: "berserker", name: "피의 성역", lv: 30, mp: 40, cd: 35, kind: "melee", pow: 1, ms: "블라디SRCmulti1", anim: "raise", desc: "5초간 무적. 피의 별이 5번 터지며 흡혈." },
  { id: "j_berserker_3", key: 3, path: "berserker", name: "핏빛 나선", lv: 25, mp: 30, cd: 20, kind: "melee", pow: 1, ms: "블라디SLCmulti1", anim: "smash", desc: "핏빛 나선이 3번 몰아친 뒤 적을 날려 버린다." },
  { id: "j_destroyer_1", key: 1, path: "destroyer", name: "용의 일격", lv: 40, mp: 30, cd: 12, kind: "melee", pow: 1, ms: "Dragon_R_TM", hit: 3, anim: "slash_down", desc: "적의 등 뒤로 이동해 띄우고 내리친다." },
  { id: "j_destroyer_2", key: 2, path: "destroyer", name: "응룡 강림", lv: 55, mp: 60, cd: 60, kind: "melee", pow: 1, ms: "Dragon_ShiftR_M", anim: "raise", desc: "응룡을 불러내는 궁극기." },
  { id: "j_destroyer_3", key: 3, path: "destroyer", name: "비룡 낙하", lv: 45, mp: 40, cd: 25, kind: "melee", pow: 1, ms: "Dragon_ShiftL_M", next: "Dragon_ShiftL_L_M", anim: "raise", desc: "하늘로 솟구쳐 머문다. 공중에서 한 번 더 누르면 내리꽂는다." },
  { id: "j_sniper_1", key: 1, path: "sniper", name: "혹한의 연격", lv: 20, mp: 15, cd: 8, kind: "melee", pow: 1, ms: "네일링RCmulti", anim: "shoot", desc: "뒤로 뛰며 얼음 칼날 탄을 흩뿌린다." },
  { id: "j_sniper_2", key: 2, path: "sniper", name: "혹한의 폭풍", lv: 30, mp: 45, cd: 40, kind: "melee", pow: 1, ms: "네일링SRCmulti", anim: "raise", desc: "그림자 이동 후 얼음 폭풍이 주변을 갈아 낸다." },
  { id: "j_sniper_3", key: 3, path: "sniper", name: "빙결 질주", lv: 25, mp: 30, cd: 25, kind: "melee", pow: 1, ms: "네일링SLCmulti2", anim: "dash", desc: "6번 돌진하며 얼음 타원을 남긴다." },
  { id: "j_hawkeye_1", key: 1, path: "hawkeye", name: "그림자 다섯 갈래", lv: 40, mp: 20, cd: 8, kind: "melee", pow: 1, ms: "쉐도어RCmultiM", anim: "shoot", desc: "다섯 갈래 그림자 탄, 맞은 곳에 보랏빛 소용돌이." },
  { id: "j_hawkeye_2", key: 2, path: "hawkeye", name: "암흑 강림", lv: 55, mp: 60, cd: 60, kind: "melee", pow: 1, ms: "쉐도어SRCmulti", anim: "raise", desc: "암흑 구체가 주변을 끌어당기며 흡혈, 마지막에 대폭발." },
  { id: "j_hawkeye_3", key: 3, path: "hawkeye", name: "그림자 나선", lv: 45, mp: 35, cd: 30, kind: "melee", pow: 1, ms: "쉐도어SLCmulti", anim: "shoot_up", desc: "사방으로 나선을 퍼뜨려 적을 침묵시킨다." },
  { id: "j_hunter_1", key: 1, path: "hunter", name: "영혼 수확 돌격", lv: 20, mp: 15, cd: 8, kind: "melee", pow: 1, ms: "바이던트RCMulti1", anim: "thrust", desc: "두 번 돌진하며 4겹 타원으로 생명력을 수확한다." },
  { id: "j_hunter_2", key: 2, path: "hunter", name: "영혼 낙인", lv: 30, mp: 30, cd: 25, kind: "melee", pow: 1, ms: "바이던트SRCPP1", anim: "thrust", desc: "앞의 적을 띄우고 20번 연속으로 영혼을 찢는다." },
  { id: "j_hunter_3", key: 3, path: "hunter", name: "영혼의 소용돌이", lv: 25, mp: 30, cd: 25, kind: "melee", pow: 1, ms: "바이던트SLCmulti1", anim: "raise", desc: "거대한 영혼 나선이 몇 번이고 주변을 휩쓴다." },
  { id: "j_beastlord_1", key: 1, path: "beastlord", name: "도살", lv: 40, mp: 20, cd: 10, kind: "melee", pow: 1, ms: "도살자RCaera1", anim: "spin", desc: "도살자의 원형 베기." },
  { id: "j_beastlord_2", key: 2, path: "beastlord", name: "살점 폭발", lv: 55, mp: 45, cd: 30, kind: "melee", pow: 1, ms: "도살자SRCaera1", anim: "smash", desc: "3색 구가 퍼지며 주변을 약화·침묵시킨다." },
  { id: "j_beastlord_3", key: 3, path: "beastlord", name: "학살", lv: 45, mp: 50, cd: 40, kind: "melee", pow: 1, ms: "도살자SLCMultiM", anim: "slash", desc: "붙잡은 적을 수십 번 베고 큰 피의 회오리로 끝낸다." },
  { id: "j_elementalist_1", key: 1, path: "elementalist", name: "혈풍", lv: 20, mp: 20, cd: 10, kind: "melee", pow: 1, ms: "크타아트RCPPc", anim: "cast", desc: "바닥의 피 나선 후 가속 탄 5발, 맞은 곳에 핏빛 계단." },
  { id: "j_elementalist_2", key: 2, path: "elementalist", name: "멸망의 마도서", lv: 30, mp: 50, cd: 40, kind: "melee", pow: 1, ms: "크타아트SRCPP1", anim: "raise", desc: "하늘에서 고리가 내려오고 대폭발." },
  { id: "j_elementalist_3", key: 3, path: "elementalist", name: "피의 마수", lv: 25, mp: 35, cd: 30, kind: "melee", pow: 1, ms: "크타아트SLCmulti2", anim: "cast", desc: "4방향 피의 손아귀가 적을 붙잡아 연속 피해." },
  { id: "j_archmage_1", key: 1, path: "archmage", name: "그림자 단검", lv: 40, mp: 20, cd: 8, kind: "melee", pow: 1, ms: "Shadow_RightClick_Dagger_M", anim: "cast", desc: "그림자 단검을 던진다." },
  { id: "j_archmage_2", key: 2, path: "archmage", name: "그림자 습격", lv: 55, mp: 35, cd: 20, kind: "melee", pow: 1, ms: "Shadow_Q_TM", hit: 2.5, anim: "thrust", desc: "바라본 적의 등 뒤로 그림자 이동해 찌른다." },
  { id: "j_archmage_3", key: 3, path: "archmage", name: "그림자 검술", lv: 45, mp: 40, cd: 30, kind: "melee", pow: 1, ms: "Shadow_ShiftL_M", anim: "spin", desc: "그림자의 검무." },
  { id: "j_priest_1", key: 1, path: "priest", name: "부채 바람", lv: 20, mp: 15, cd: 10, kind: "melee", pow: 1, ms: "도사_R_M", anim: "cast", desc: "회오리 바람이 주변을 휩쓴다." },
  { id: "j_priest_2", key: 2, path: "priest", name: "풍신 결계", lv: 30, mp: 45, cd: 60, kind: "melee", pow: 1, ms: "도사_SR_M", anim: "raise", desc: "큰 바람 결계로 적을 밀어내고 지속 피해." },
  { id: "j_priest_3", key: 3, path: "priest", name: "오방 표식", lv: 25, mp: 35, cd: 40, kind: "melee", pow: 1, ms: "도사_SL_M", anim: "shoot_up", desc: "다섯 방향 표식에서 바람 폭발이 이어진다." },
  { id: "j_paladin_1", key: 1, path: "paladin", name: "총칼 사격", lv: 20, mp: 20, cd: 12, kind: "melee", pow: 1, ms: "총칼RCMulti2", anim: "shoot", desc: "적을 묶고 화염 탄을 쏜 뒤 붉은 고리로 돌진." },
  { id: "j_paladin_2", key: 2, path: "paladin", name: "악마 사냥", lv: 30, mp: 40, cd: 40, kind: "melee", pow: 1, ms: "총칼SRCmulti1", anim: "raise", desc: "악마사냥꾼 데런의 기술." },
  { id: "j_paladin_3", key: 3, path: "paladin", name: "검풍 돌진", lv: 25, mp: 40, cd: 30, kind: "melee", pow: 1, ms: "총칼SLCMultiM", anim: "dash", desc: "돌진 베기 3연 → 회오리로 띄우고 → 착지 폭발." },
  // ── 직접 만든 스킬 ──
  { id: "j_warrior_1", key: 1, path: "warrior", name: "초승달 회전베기", lv: 1, mp: 12, cd: 6, kind: "melee", pow: 1.5, fx: "crescent", desc: "주변에 3겹 붉은 타원을 그리며 3.5블록 안 적에게 150% 피해." },
  { id: "j_warrior_2", key: 2, path: "warrior", name: "전투의 함성", lv: 8, mp: 20, cd: 30, kind: "buff", pow: 25, fx: "warcry", desc: "붉은 나선이 감싸며 10초 동안 공격력 +25%." },
  { id: "j_warrior_3", key: 3, path: "warrior", name: "도약 강타", lv: 12, mp: 22, cd: 14, kind: "melee", pow: 1.8, fx: "leap_slam", desc: "뛰어올라 내려찍어 바닥 나선과 함께 주변 180% 피해 + 띄우기." },
  { id: "j_archer_1", key: 1, path: "archer", name: "관통 사격", lv: 1, mp: 10, cd: 5, kind: "ranged", pow: 1.6, fx: "pierce_arrow", desc: "초록·검정 궤적을 남기는 관통 화살 160% 피해." },
  { id: "j_archer_2", key: 2, path: "archer", name: "화살비", lv: 8, mp: 22, cd: 14, kind: "ranged", pow: 0.8, fx: "arrow_rain", desc: "하늘에 고리를 그리고 화살이 3번 쏟아진다. 80%씩." },
  { id: "j_archer_3", key: 3, path: "archer", name: "후방 도약 사격", lv: 12, mp: 14, cd: 9, kind: "ranged", pow: 1.4, fx: "back_shot", desc: "뒤로 뛰며 세 갈래 관통 화살 140%." },
  { id: "j_mage_1", key: 1, path: "mage", name: "화염 연탄", lv: 1, mp: 15, cd: 6, kind: "magic", pow: 1.0, fx: "fire_storm", o: {count: 3, burn: true}, pal: "ember", desc: "발밑 나선 후 가속하는 화염탄 3발. 맞은 곳에 불꽃 계단." },
  { id: "j_mage_2", key: 2, path: "mage", name: "서리 폭풍", lv: 8, mp: 22, cd: 12, kind: "magic", pow: 1.2, fx: "frost_nova", pal: "frost", desc: "얼음 나선 4겹. 주변 120% + 둔화." },
  { id: "j_mage_3", key: 3, path: "mage", name: "순간 이동", lv: 12, mp: 15, cd: 8, kind: "magic", pow: 0, fx: "blink", desc: "달빛 나선을 남기며 바라보는 방향으로 순간 이동." },
  { id: "j_stormcaller_1", key: 1, path: "stormcaller", name: "뇌인 교차", lv: 20, mp: 22, cd: 8, kind: "magic", pow: 2.0, fx: "thunder_cross", o: {lines: 3, len: 12}, desc: "앞에 보랏빛 번개 선 3줄이 교차한다." },
  { id: "j_stormcaller_2", key: 2, path: "stormcaller", name: "뇌전 영역", lv: 30, mp: 40, cd: 30, kind: "magic", pow: 1.4, fx: "thunder_domain", o: {r: 7, secs: 8}, desc: "빛의 고리를 펼친다. 안의 적에게 매초 낙뢰." },
  { id: "j_stormcaller_3", key: 3, path: "stormcaller", name: "천뢰 난무", lv: 25, mp: 45, cd: 30, kind: "magic", pow: 1.6, fx: "thunder_judgement", o: {r: 8, lines: 8}, desc: "영역에 빛의 선 8줄이 교차한 뒤 섬광이 터진다." },
  { id: "j_stormlord_1", key: 1, path: "stormlord", name: "천뢰 관통", lv: 40, mp: 35, cd: 12, kind: "magic", pow: 2.6, fx: "thunder_pierce", o: {len: 36}, desc: "시선 방향을 가로지르는 거대한 번개 선." },
  { id: "j_stormlord_2", key: 2, path: "stormlord", name: "뇌신 영역", lv: 55, mp: 55, cd: 35, kind: "magic", pow: 1.8, fx: "thunder_domain", o: {r: 9, secs: 10, tick: 0.6}, desc: "더 넓은 빛의 고리, 10초 동안 낙뢰." },
  { id: "j_stormlord_3", key: 3, path: "stormlord", name: "만뢰 심판", lv: 45, mp: 60, cd: 40, kind: "magic", pow: 2.2, fx: "thunder_judgement", o: {r: 10, lines: 14}, desc: "빛의 선 14줄이 영역을 난도질한다." },
  { id: "j_cleric_1", key: 1, path: "cleric", name: "치유의 빛", lv: 1, mp: 25, cd: 15, kind: "heal", pow: 1, fx: "heal", desc: "바닥 마법진과 별. 자신과 8블록 안 파티원 회복." },
  { id: "j_cleric_2", key: 2, path: "cleric", name: "신성 강타", lv: 8, mp: 15, cd: 8, kind: "melee", pow: 2.0, fx: "smite", desc: "하늘의 빛줄기가 내리꽂혀 200% + 기절." },
  { id: "j_cleric_3", key: 3, path: "cleric", name: "수호의 빛", lv: 12, mp: 20, cd: 25, kind: "heal", pow: 1, fx: "guard", o: {lvl: 1}, desc: "파티원을 빛의 구로 감싸 피해 감소 + 흡수." },
  { id: "j_archbishop_1", key: 1, path: "archbishop", name: "수류 법진", lv: 40, mp: 40, cd: 20, kind: "heal", pow: 2.5, fx: "water_circle", o: {r: 4, secs: 3}, desc: "물의 마법진과 물기둥. 안의 아군을 3번 회복." },
  { id: "j_archbishop_2", key: 2, path: "archbishop", name: "해일 법진", lv: 55, mp: 55, cd: 30, kind: "magic", pow: 3.0, fx: "water_tide", o: {r: 7}, desc: "바라본 곳에 큰 마법진, 잠시 뒤 분출해 적을 띄우고 아군을 회복." },
  { id: "j_archbishop_3", key: 3, path: "archbishop", name: "와류", lv: 45, mp: 35, cd: 18, kind: "magic", pow: 1.6, fx: "water_vortex", o: {r: 5}, desc: "소용돌이 물결로 주변 적을 끌어당기며 피해." },
  { id: "j_crusader_1", key: 1, path: "crusader", name: "화염 선회", lv: 40, mp: 30, cd: 8, kind: "melee", pow: 2.0, fx: "fire_whirl", o: {r: 3.6}, desc: "회전하는 불꽃 베기. 주변 적에게 화상." },
  { id: "j_crusader_2", key: 2, path: "crusader", name: "작열 질주", lv: 55, mp: 35, cd: 12, kind: "melee", pow: 2.2, fx: "fire_dash", o: {}, desc: "불티 궤적을 남기며 돌진, 지나간 적을 태운다." },
  { id: "j_crusader_3", key: 3, path: "crusader", name: "업화 강림", lv: 45, mp: 50, cd: 22, kind: "melee", pow: 2.8, fx: "fire_fall", o: {r: 5}, desc: "뛰어올라 불꽃 소용돌이와 함께 내려찍는다." },
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
