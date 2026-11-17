// 스킬 잠금: 주작 3단 조준처럼 '진짜 몸이 다른 곳에 있는' 동안 다른 모든 스킬·대시를 막음
export const skillLock = new Set(); // player id
export const isSkillLocked = (p) => skillLock.has(p?.id);
