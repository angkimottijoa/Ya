// 서버 전체 파티클 예산 (V10.3)
//   뿌린 파티클 수 × 남는 시간으로 '지금 화면에 살아 있는 파티클'을 추정해, 튕기기 직전(약 15만)까지 가지 않게 줄임
//   prio 0 = 판정·핵심(항상), 1 = 장식(12만 넘으면 생략), 2 = 큰 장식(9만 넘으면 생략)
import { system } from "@minecraft/server";

export const CAP = 150000;
const SOFT = 45000, DECOR = 28000; // 휴대폰 기준: 장식은 일찍부터 줄임
const RING = 600; // 30초까지 기록
const bucket = new Float64Array(RING);
let alive = 0, lastTick = -1;

function advance() {
  const now = system.currentTick;
  if (lastTick < 0) lastTick = now;
  // 지나간 틱만큼 수명이 끝난 파티클을 뺌
  for (let t = lastTick + 1; t <= now && t - lastTick <= RING; t++) {
    const i = t % RING;
    alive -= bucket[i];
    bucket[i] = 0;
  }
  if (now - lastTick > RING) { alive = 0; bucket.fill(0); }
  if (alive < 0) alive = 0;
  lastTick = now;
}

/** 이 만큼 뿌려도 되나? 되면 예산에 기록하고 true */
export function spend(n, lifeSec, prio = 1) {
  advance();
  const limit = prio === 0 ? CAP : prio === 1 ? SOFT : DECOR;
  if (alive + n > limit) return false;
  alive += n;
  const end = (system.currentTick + Math.max(1, Math.ceil(lifeSec * 20))) % RING;
  bucket[end] += n;
  return true;
}
/** 지금 추정치 (디버그 · HUD) */
export function aliveNow() { advance(); return Math.round(alive); }
