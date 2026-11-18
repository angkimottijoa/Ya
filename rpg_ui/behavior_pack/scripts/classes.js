// 직업 정의
export const CLASSES = {
  novice: {
    name: "모험가", color: "§f", icon: "novice",
    desc: "아직 길을 정하지 않은 여행자.\n어떤 직업이든 될 수 있다.",
    base: {}, grow: { str: 0.3, dex: 0.3, int: 0.3, vit: 0.3 },
    skill: { name: "숨 고르기", cd: 20, desc: "체력을 조금 회복한다." },
  },
  warrior: {
    name: "전사", color: "§c", icon: "warrior",
    desc: "최전선에서 적을 베어 넘기는 근접 전투의 달인.",
    base: { str: 5, vit: 3 }, grow: { str: 1, vit: 0.6, dex: 0.2 },
    skill: { name: "대지 가르기", cd: 10, desc: "주변 4블록의 적에게 큰 피해를 주고 밀쳐낸다." },
  },
  archer: {
    name: "궁수", color: "§a", icon: "archer",
    desc: "먼 거리에서 약점을 꿰뚫는 사냥꾼.\n이동 속도와 치명타가 높다.",
    base: { dex: 6, str: 1 }, grow: { dex: 1, str: 0.4, vit: 0.2 },
    skill: { name: "관통 사격", cd: 6, desc: "바라보는 방향으로 적 최대 3명을 꿰뚫는다." },
  },
  mage: {
    name: "마법사", color: "§b", icon: "mage",
    desc: "원소의 힘을 다루는 학자.\n광역 마법과 짧은 재사용 대기시간.",
    base: { int: 7 }, grow: { int: 1.2, vit: 0.3 },
    skill: { name: "화염구", cd: 8, desc: "목표 지점에 폭발하는 화염구를 날려 주변을 불태운다." },
  },
  cleric: {
    name: "성직자", color: "§e", icon: "cleric",
    desc: "빛의 가호로 동료를 지키는 치유사.\n파티에 꼭 필요한 존재.",
    base: { vit: 4, int: 3 }, grow: { vit: 0.8, int: 0.6 },
    skill: { name: "치유의 빛", cd: 15, desc: "자신과 8블록 안 파티원을 치유하고 재생 효과를 준다." },
  },
};

export const STATS = [ // V12.123: 네 스탯이 하나씩만 맡음 · 공격 스탯은 같은 곡선 (상한 없음)
  { id: "str", name: "힘", desc: "근접 물리 위력\n(평타 · 근접 스킬 · 사신수 · 사흉수의 근접 몫)\n100에 +100% · 200에 +150% · 400에 +200%" },
  { id: "dex", name: "민첩", desc: "원거리 물리 위력\n(원거리 스킬 · 사신수 · 사흉수의 원거리 몫)\n힘 · 지능보다 천천히: 100에 +75% · 200에 +120% · 400에 +171%" },
  { id: "int", name: "지능", desc: "마법 위력\n(마법 스킬 · 사신수 · 사흉수의 마법 몫)\n100에 +100% · 200에 +150% · 400에 +200%" },
  { id: "vit", name: "체력", desc: "최대 체력 +40 (레벨당 +50, 상한 없음)" },
];

export const CLASS_CHANGE_COST = 500;
