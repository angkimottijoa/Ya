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

  // 히든 3차 (reaper.js): 2차 이상 · Lv.40 이상으로 밤에 몬스터 300마리를 쓰러뜨리면 승급 목록에 나타남 (아무 2차·3차에서나)
  soul_reaper: { tool: { name: "영혼 수확자의 낫", shape: "scythe", dmg: 15 }, name: "영혼 수확자", tier: 3, base: "hidden", lv: 45, cost: 10000, weapons: [], next: [], icon: "class", color: "§5", bonus: { str: 9, int: 6, dex: 5 }, hidden: true, desc: "떠도는 영혼을 거두는 자. 근처에서 쓰러진 적의 영혼을 모아 낫에 담고, 모은 영혼으로 적을 거둔다." },

  // 히든 3차 (hidden_jobs.js): 2차 이상 · Lv.40 이상에서 조건을 채워 몬스터를 쓰러뜨리면 승급 목록에 나타남
  chronomancer: { tool: { name: "멈춘 시계의 홀", shape: "scepter", dmg: 13 }, name: "시간술사", tier: 3, base: "hidden", lv: 45, cost: 10000, weapons: [], next: [], icon: "mage", color: "§6", bonus: { int: 10, dex: 6, str: 4 }, hidden: true, desc: "시간을 멈추고 되감는 자. 시곗바늘 칼날과 시계판 마법진으로 적의 시간을 빼앗는다." },
  abyss_knight: { tool: { name: "심연의 대검", shape: "greatsword", dmg: 16 }, name: "심연의 기사", tier: 3, base: "hidden", lv: 45, cost: 10000, weapons: [], next: [], icon: "class", color: "§4", bonus: { str: 12, vit: 8 }, hidden: true, desc: "심연에 몸을 내준 기사. 맞을수록 침식이 차올라 강해지고, 끝내 심연 그 자체가 된다." },
  spirit_shepherd: { tool: { name: "혼령 인도자의 지팡이", shape: "staff", dmg: 12 }, name: "혼령 인도자", tier: 3, base: "hidden", lv: 45, cost: 10000, weapons: [], next: [], icon: "archer", color: "§a", bonus: { dex: 8, int: 8, vit: 4 }, hidden: true, desc: "짐승의 혼을 거느리는 자. 혼령 늑대가 늘 곁을 지키고, 까마귀 · 사슴 · 곰의 혼이 부름에 응한다." },

  cleric: { tool: { name: "성직자의 서", shape: "mace", dmg: 6 }, name: "성직자", tier: 1, base: "cleric", weapons: ["mace", "staff"], next: ["priest", "paladin"], icon: "cleric", color: "§e", desc: "빛의 가호로 동료를 지키는 치유사." },
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
  cleric: "holy", priest: "holy", archbishop: "holy", paladin: "holy", crusader: "holy", soul_reaper: "moon", chronomancer: "moon", abyss_knight: "blood", spirit_shepherd: "forest",
};

export const TIER_NAMES = ["", "1차", "2차", "3차"];

// 직업 스킬 (path 단계에서 배움, 그 단계 전용 도구를 들어야 사용)
//   key 1 = 클릭(사용), 2 = 쉬프트+클릭, 3 = 쉬프트+점프
// V3.0
//  - ms: 자바 MagicSpells 원본 스펠(msdata.js)을 그대로 실행 (2·3차 직업 대부분)
//  - fx: spellbook.js 스펠 (1차 직업 / 폭풍·대주교·성전사)
export const JOB_SKILLS = [
  // ── 자바 MagicSpells 이식 ──
  // ── 전사 계열 (V10.3, warrior.js · 승급할수록 같은 스킬이 진화) ──
  { id: "jw_warrior_1", key: 1, path: "warrior", name: "강베기", lv: 1, mp: 4, cd: 0.5, kind: "melee", pow: 1, wr: "w_bash", desc: "2타 콤보: 가로 베기 → 대각 베기. 강철 호와 쇳불똥." },
  { id: "jw_warrior_2", key: 2, path: "warrior", name: "돌진 베기", lv: 8, mp: 12, cd: 8, kind: "melee", pow: 1, wr: "w_dash", desc: "앞으로 6칸 돌진하며 지나간 적을 베고 끝에서 한 번 더 벤다." },
  { id: "jw_warrior_3", key: 3, path: "warrior", name: "대지 강타", lv: 12, mp: 16, cd: 13, kind: "melee", pow: 1, wr: "w_slam", desc: "살짝 뛰어 내려찍어 땅 고리와 흙먼지, 주변 적을 살짝 띄운다." },
  { id: "jw_swordmaster_1", key: 1, path: "swordmaster", name: "월광 연참", lv: 20, mp: 6, cd: 0.5, kind: "melee", pow: 1, wr: "sm_combo", desc: "3타 콤보: 달빛 호마다 잔상이 따라오고, 3타에 초승달 검기가 9칸 날아간다." },
  { id: "jw_swordmaster_2", key: 2, path: "swordmaster", name: "섬월", lv: 30, mp: 20, cd: 10, kind: "melee", pow: 1, wr: "sm_flash", desc: "10칸을 꿰뚫고 지나가며 최대 3명을 베고, 0.5초 뒤 X자 베기 자국이 터진다." },
  { id: "jw_swordmaster_3", key: 3, path: "swordmaster", name: "만월 회전", lv: 25, mp: 22, cd: 14, kind: "melee", pow: 1, wr: "sm_spin", desc: "회전 베기로 달빛 고리를 그리고 바닥에 달 문양을 남긴다. 적을 살짝 끌어당긴다." },
  { id: "jw_sword_emperor_1", key: 1, path: "sword_emperor", name: "만월 연참", lv: 40, mp: 7, cd: 0.5, kind: "melee", pow: 1, wr: "se_combo", desc: "4타 콤보: 호마다 별가루 잔상, 4타에 보름달처럼 둥근 검기가 13칸 날아간다." },
  { id: "jw_sword_emperor_2", key: 2, path: "sword_emperor", name: "월영 섬", lv: 45, mp: 24, cd: 10, kind: "melee", pow: 1, wr: "se_flash", desc: "12칸을 꿰뚫고 최대 5명을 베고, X자 자국이 터진 뒤 남은 달그림자 분신이 한 번 더 벤다." },
  { id: "jw_sword_emperor_3", key: 3, path: "sword_emperor", name: "월식 회전", lv: 45, mp: 26, cd: 14, kind: "melee", pow: 1, wr: "se_spin", desc: "두 번 회전하며 바닥에 검게 가려진 월식 문양을 남기고, 붉은 테 고리가 터진다." },
  { id: "jw_sword_emperor_4", key: 4, path: "sword_emperor", name: "월하 일섬", lv: 50, mp: 55, cd: 45, kind: "melee", pow: 1, wr: "se_ult", desc: "하늘이 어두워지고 거대한 달이 뜬다. 발도 일섬이 앞쪽 전체를 가르고 달이 갈라지며 늦게 베임이 터진다." },
  { id: "jw_berserker_1", key: 1, path: "berserker", name: "혈참 회전", lv: 20, mp: 6, cd: 0.6, kind: "melee", pow: 1, wr: "bk_spin", desc: "2타 회전 베기, 준 피해의 5% 흡혈. 격노면 범위·피해 증가." },
  { id: "jw_berserker_2", key: 2, path: "berserker", name: "분노 폭주", lv: 30, mp: 25, cd: 25, kind: "buff", pow: 1, wr: "bk_rage", desc: "6초 동안 힘·속도 증가, 분노 +25. 격노면 10초 · 힘 2단계." },
  { id: "jw_berserker_3", key: 3, path: "berserker", name: "혈열 강타", lv: 25, mp: 20, cd: 13, kind: "melee", pow: 1, wr: "bk_slam", desc: "뛰어 내려찍어 피 균열이 세 방향으로 뻗는다. 격노면 다섯 방향 · 더 길게." },
  { id: "jw_destroyer_1", key: 1, path: "destroyer", name: "대지 가르기", lv: 40, mp: 7, cd: 0.6, kind: "melee", pow: 1, wr: "ds_combo", desc: "3타 콤보: 불씨 호 두 번 → 내려찍어 앞으로 10칸 용암 균열과 바위판. 격노면 14칸." },
  { id: "jw_destroyer_2", key: 2, path: "destroyer", name: "용린 폭주", lv: 45, mp: 30, cd: 25, kind: "buff", pow: 1, wr: "ds_rage", desc: "8초 동안 힘 2·속도·저항, 근접으로 때릴 때마다 작은 불꽃 충격파. 격노면 12초." },
  { id: "jw_destroyer_3", key: 3, path: "destroyer", name: "낙룡 강하", lv: 45, mp: 30, cd: 16, kind: "melee", pow: 1, wr: "ds_slam", desc: "높이 뛰어 잠깐 머물렀다 내리꽂아 불꽃 분출 · 바위 · 사방 용암 균열." },
  { id: "jw_destroyer_4", key: 4, path: "destroyer", name: "용멸", lv: 50, mp: 55, cd: 45, kind: "melee", pow: 1, wr: "ds_ult", desc: "도끼를 치켜들어 불씨를 모은 뒤 내려찍으면 세 갈래 균열이 16칸 갈라지며 불기둥이 솟고, 끝에서 용의 아가리처럼 불기둥이 닫히며 터진다." },
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
  // ── 히든: 영혼 수확자 (V11.4, reaper.js) ──
  { id: "jr_soul_reaper_1", key: 1, path: "soul_reaper", name: "사신의 낫질", lv: 45, mp: 7, cd: 0.5, kind: "melee", pow: 1, wr: "rp_combo", desc: "3타: 낫을 크게 휘두름 → 반대로 → 한 바퀴 돌며 주변 적을 끌어당겨 거둠(영혼 조각). 마지막 뒤 8초 대기." },
  { id: "jr_soul_reaper_2", key: 2, path: "soul_reaper", name: "영혼 사슬", lv: 45, mp: 24, cd: 12, kind: "melee", pow: 1, wr: "rp_chain", desc: "앞 14칸 최대 네 명에게 영혼 사슬을 던져 2초 묶고 끌어당긴다. 사슬에 묶인 적에게 낙인(영혼 수확 피해 1.5배)." },
  { id: "jr_soul_reaper_3", key: 3, path: "soul_reaper", name: "망령 행진", lv: 45, mp: 28, cd: 15, kind: "melee", pow: 1, wr: "rp_wraith", desc: "망령이 되어 주변 적 사이를 세 번 꿰뚫고 지나가며 벤다. 영혼 3개마다 한 번 더 (최대 6개 사용)." },
  { id: "jr_soul_reaper_4", key: 4, path: "soul_reaper", name: "영혼 수확", lv: 50, mp: 60, cd: 45, kind: "melee", pow: 1, wr: "rp_ult", desc: "발밑에 죽음의 진, 등 뒤에 거대한 낫. 주변 적의 영혼을 뽑아 낫에 모은 뒤 크게 한 바퀴 베어 거둔다. 체력 15% 이하 일반 몹은 처형(최대 3마리, 보스는 피해 1.5배), 모은 영혼만큼 피해·회복 증가." },
  // ── 히든: 시간술사 · 심연의 기사 · 혼령 인도자 (V11.6, hidden_jobs.js) ──
  { id: "jh_chrono_1", key: 1, path: "chronomancer", name: "초침 베기", lv: 45, mp: 6, cd: 0.5, kind: "magic", pow: 1, wr: "tm_combo", desc: "3타: 시곗바늘 칼날이 몸 앞을 휙 돌며 벰 → 반대로 → 발밑 시계판이 돌다 터짐. 맞힐 때마다 시간 조각. 마지막 뒤 8초." },
  { id: "jh_chrono_2", key: 2, path: "chronomancer", name: "정지 구슬", lv: 45, mp: 24, cd: 12, kind: "magic", pow: 1, wr: "tm_freeze", desc: "날아간 구슬이 터지면 시계판과 톱니가 펼쳐져 주변 적을 2초 멈춤. 풀릴 때 멈춘 동안 받은 피해의 40%가 한꺼번에 더 들어감." },
  { id: "jh_chrono_3", key: 3, path: "chronomancer", name: "되감기", lv: 45, mp: 20, cd: 10, kind: "magic", pow: 1, wr: "tm_rewind", desc: "2초 전 자리로 되돌아가고, 지나온 길의 잔상들이 한꺼번에 벤다. 시간 조각 3개가 있으면 써서 체력 12% 회복." },
  { id: "jh_chrono_4", key: 4, path: "chronomancer", name: "시간 붕괴", lv: 50, mp: 60, cd: 45, kind: "magic", pow: 1, wr: "tm_ult", desc: "바닥에 거대한 시계판(바늘이 거꾸로 돎)과 톱니 넷, 모래가 쏟아짐. 안의 적은 느려지다 멈추고, 열두 번 종이 울리며 눈금마다 폭발 → 가운데 큰 폭발. 시간 조각만큼 강해짐." },
  { id: "jh_abyss_1", key: 1, path: "abyss_knight", name: "심연 베기", lv: 45, mp: 6, cd: 0.5, kind: "melee", pow: 1, wr: "ab_combo", desc: "3타: 검은 호와 칼을 따라 뻗는 촉수 → 반대로 → 앞 바닥에서 촉수 다섯이 솟아 띄움. 마지막 뒤 8초." },
  { id: "jh_abyss_2", key: 2, path: "abyss_knight", name: "끌어당기는 손", lv: 45, mp: 22, cd: 11, kind: "melee", pow: 1, wr: "ab_grasp", desc: "앞쪽 바닥에서 검은 촉수 여섯이 차례로 솟아 적을 붙잡고 내 쪽으로 끌어온다." },
  { id: "jh_abyss_3", key: 3, path: "abyss_knight", name: "공허 돌진", lv: 45, mp: 22, cd: 9, kind: "melee", pow: 1, wr: "ab_void", desc: "검은 구멍으로 들어가 앞 12칸 안 적의 뒤 구멍에서 튀어나와 벤다." },
  { id: "jh_abyss_4", key: 4, path: "abyss_knight", name: "심연화", lv: 50, mp: 50, cd: 45, kind: "melee", pow: 1, wr: "ab_ult", desc: "7초(침식 100이면 12초) 동안 등에 촉수 날개가 돋고 힘·속도·저항 · 근접 흡혈 · 스킬 피해 +35%. 끝날 때 블랙홀이 열려 빨아들인 뒤 터짐." },
  { id: "jh_spirit_1", key: 1, path: "spirit_shepherd", name: "혼령 지휘", lv: 45, mp: 6, cd: 0.5, kind: "ranged", pow: 1, wr: "sp_command", desc: "3타: 혼령 늑대가 조준한 적에게 달려가 문다 → 한 번 더 → 혼령 곰이 달려가 들이받아 띄움. 마지막 뒤 8초." },
  { id: "jh_spirit_2", key: 2, path: "spirit_shepherd", name: "까마귀 떼", lv: 45, mp: 22, cd: 11, kind: "ranged", pow: 1, wr: "sp_crows", desc: "혼령 까마귀 열둘이 부채꼴로 14칸 날아가며 쪼고, 쪼인 적은 2초 실명." },
  { id: "jh_spirit_3", key: 3, path: "spirit_shepherd", name: "수호 사슴", lv: 45, mp: 26, cd: 16, kind: "ranged", pow: 1, wr: "sp_deer", desc: "혼령 사슴이 나타나 주변 아군을 치유(15% + 재생)하고, 뿔 돌진으로 앞 9칸 적을 밀어낸다." },
  { id: "jh_spirit_4", key: 4, path: "spirit_shepherd", name: "백귀 행렬", lv: 50, mp: 60, cd: 45, kind: "ranged", pow: 1, wr: "sp_ult", desc: "뒤에서 늑대 · 사슴 · 곰 · 까마귀 혼령 스물넷이 여섯 줄로 앞 24칸을 휩쓸고 지나간다. 유대만큼 강해짐." },
  // ── 마법사 계열 (V11.2, mage.js · 마법진 캐스터) ──
  { id: "jm_mage_1", key: 1, path: "mage", name: "마력탄", lv: 1, mp: 4, cd: 0.5, kind: "magic", pow: 1, wr: "mg_bolt", desc: "3연: 손끝 작은 마법진에서 조준한 곳으로 마력탄. 3번째는 큰 마력탄(주변 폭발). 마지막 뒤 8초 대기." },
  { id: "jm_mage_2", key: 2, path: "mage", name: "비전 폭발", lv: 8, mp: 16, cd: 10, kind: "magic", pow: 1, wr: "mg_burst", desc: "발밑에 마법진을 그리고 0.6초 뒤 비전 폭발, 주변 적을 밀어낸다." },
  { id: "jm_mage_3", key: 3, path: "mage", name: "순간이동", lv: 12, mp: 12, cd: 7, kind: "magic", pow: 1, wr: "mg_blink", desc: "출발 자리와 도착 자리에 마법진을 남기며 바라보는 쪽으로 8칸 순간이동." },
  { id: "jm_elementalist_1", key: 1, path: "elementalist", name: "원소 연탄", lv: 20, mp: 6, cd: 0.5, kind: "magic", pow: 1, wr: "el_combo", desc: "3타: 화염탄(불붙음) → 얼음탄(느려짐) → 불·얼음 삼각 봉인 두 개에서 큰 원소탄 두 발(주변 폭발)." },
  { id: "jm_elementalist_2", key: 2, path: "elementalist", name: "원소 폭발진", lv: 30, mp: 24, cd: 12, kind: "magic", pow: 1, wr: "el_erupt", desc: "바라본 곳 바닥에 붉은 마법진과 푸른 육망성 → 불기둥과 얼음 가시가 고리 모양으로 솟는다." },
  { id: "jm_elementalist_3", key: 3, path: "elementalist", name: "화염 운석", lv: 25, mp: 28, cd: 16, kind: "magic", pow: 1, wr: "el_meteor", desc: "목표 위 하늘에 봉인 마법진을 그리고 거대한 화염 운석을 떨어뜨린다." },
  { id: "jm_archmage_1", key: 1, path: "archmage", name: "성좌 탄막", lv: 40, mp: 7, cd: 0.5, kind: "magic", pow: 1, wr: "am_combo", desc: "4타: 등 뒤 세 자리에 작은 성좌 마법진이 떠 별탄을 쏜다. 4타는 셋이 함께." },
  { id: "jm_archmage_2", key: 2, path: "archmage", name: "삼위 마법진", lv: 45, mp: 30, cd: 14, kind: "magic", pow: 1, wr: "am_trinity", desc: "목표 위 하늘에 세 원이 이어진 큰 마법진을 펼치고, 원마다 빛줄기가 차례로 내리꽂힌다." },
  { id: "jm_archmage_3", key: 3, path: "archmage", name: "시간 결계", lv: 45, mp: 32, cd: 18, kind: "magic", pow: 1, wr: "am_time", desc: "발밑에 성좌 마법진을 펼쳐 안의 적을 느리게 하다 멈춰 세우고, 시간이 다시 흐르며 터진다." },
  { id: "jm_archmage_4", key: 4, path: "archmage", name: "천체 붕괴", lv: 50, mp: 60, cd: 45, kind: "magic", pow: 1, wr: "am_ult", desc: "하늘에 거대한 성좌 마법진이 펼쳐져 별 운석 열네 개가 쏟아지고, 마지막에 거대한 빛기둥이 내려온다." },
  { id: "jm_stormcaller_1", key: 1, path: "stormcaller", name: "뇌창", lv: 20, mp: 6, cd: 0.5, kind: "magic", pow: 1, wr: "sc_combo", desc: "3연: 손끝 마법진에서 번개 창. 3번째는 끊어진 호 마법진에서 세 갈래 번개 창." },
  { id: "jm_stormcaller_2", key: 2, path: "stormcaller", name: "뇌전 결계", lv: 30, mp: 26, cd: 14, kind: "magic", pow: 1, wr: "sc_field", desc: "바라본 곳 바닥에 봉인 마법진을 펼쳐 4초 동안 안의 적에게 낙뢰가 떨어진다." },
  { id: "jm_stormcaller_3", key: 3, path: "stormcaller", name: "연쇄 번개", lv: 25, mp: 22, cd: 10, kind: "magic", pow: 1, wr: "sc_chain", desc: "조준한 적에서 시작해 최대 여섯 명에게 번개가 튀고, 맞은 적마다 삼각 봉인이 새겨진다." },
  { id: "jm_stormlord_1", key: 1, path: "stormlord", name: "천뢰창", lv: 40, mp: 7, cd: 0.5, kind: "magic", pow: 1, wr: "sl_combo", desc: "4연: 번개 창, 4번째는 큰 끊어진 호 마법진에서 다섯 갈래 번개 창." },
  { id: "jm_stormlord_2", key: 2, path: "stormlord", name: "폭풍 영역", lv: 45, mp: 32, cd: 16, kind: "magic", pow: 1, wr: "sl_storm", desc: "다섯 개의 봉인 마법진이 흩어져 돌며 4초 동안 각자 낙뢰를 떨어뜨린다." },
  { id: "jm_stormlord_3", key: 3, path: "stormlord", name: "뇌신포", lv: 45, mp: 34, cd: 16, kind: "magic", pow: 1, wr: "sl_cannon", desc: "앞에 육망성 마법진을 세워 기를 모은 뒤 22칸 거대한 번개포를 쏜다." },
  { id: "jm_stormlord_4", key: 4, path: "stormlord", name: "만뢰", lv: 50, mp: 60, cd: 45, kind: "magic", pow: 1, wr: "sl_ult", desc: "하늘에 거대한 육망성 마법진이 펼쳐지고 번개 비가 쏟아진 뒤, 한가운데로 마지막 낙뢰가 떨어진다." },
  { id: "j_priest_1", key: 1, path: "priest", name: "부채 바람", lv: 20, mp: 15, cd: 10, kind: "melee", pow: 1, ms: "도사_R_M", anim: "cast", desc: "회오리 바람이 주변을 휩쓴다." },
  { id: "j_priest_2", key: 2, path: "priest", name: "풍신 결계", lv: 30, mp: 45, cd: 60, kind: "melee", pow: 1, ms: "도사_SR_M", anim: "raise", desc: "큰 바람 결계로 적을 밀어내고 지속 피해." },
  { id: "j_priest_3", key: 3, path: "priest", name: "오방 표식", lv: 25, mp: 35, cd: 40, kind: "melee", pow: 1, ms: "도사_SL_M", anim: "shoot_up", desc: "다섯 방향 표식에서 바람 폭발이 이어진다." },
  { id: "j_paladin_1", key: 1, path: "paladin", name: "총칼 사격", lv: 20, mp: 20, cd: 12, kind: "melee", pow: 1, ms: "총칼RCMulti2", anim: "shoot", desc: "적을 묶고 화염 탄을 쏜 뒤 붉은 고리로 돌진." },
  { id: "j_paladin_2", key: 2, path: "paladin", name: "악마 사냥", lv: 30, mp: 40, cd: 40, kind: "melee", pow: 1, ms: "총칼SRCmulti1", anim: "raise", desc: "악마사냥꾼 데런의 기술." },
  { id: "j_paladin_3", key: 3, path: "paladin", name: "검풍 돌진", lv: 25, mp: 40, cd: 30, kind: "melee", pow: 1, ms: "총칼SLCMultiM", anim: "dash", desc: "돌진 베기 3연 → 회오리로 띄우고 → 착지 폭발." },
  // ── 직접 만든 스킬 ──
  { id: "j_archer_1", key: 1, path: "archer", name: "관통 사격", lv: 1, mp: 10, cd: 5, kind: "ranged", pow: 1.6, fx: "pierce_arrow", desc: "초록·검정 궤적을 남기는 관통 화살 160% 피해." },
  { id: "j_archer_2", key: 2, path: "archer", name: "화살비", lv: 8, mp: 22, cd: 14, kind: "ranged", pow: 0.8, fx: "arrow_rain", desc: "하늘에 고리를 그리고 화살이 3번 쏟아진다. 80%씩." },
  { id: "j_archer_3", key: 3, path: "archer", name: "후방 도약 사격", lv: 12, mp: 14, cd: 9, kind: "ranged", pow: 1.4, fx: "back_shot", desc: "뒤로 뛰며 세 갈래 관통 화살 140%." },
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
export const KEY_NAMES = ["", "클릭", "쉬프트+클릭", "쉬프트+점프", "쉬프트 두 번"];
export const KEY_ICONS = ["", "①", "②", "③", "④"];

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
