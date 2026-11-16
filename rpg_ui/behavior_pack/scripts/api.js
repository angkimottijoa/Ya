// 다른 스크립트/애드온에서 쓰기 위한 간단 API
import { data } from "./player.js";
import * as HUD from "./hud.js";

/** 퀘스트창에 임의 텍스트를 띄운다. 빈 문자열이면 퀘스트 시스템 표시로 복귀. */
export function setQuestText(p, text) {
  const d = data(p);
  d.customQuestText = text || undefined;
  HUD.resetHud(p);
}
