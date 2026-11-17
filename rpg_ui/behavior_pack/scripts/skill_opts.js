// 스킬 연출 옵션 (V11.7) — 관리자 도구 > 스킬 도움 에서 바꿈, 월드 전체에 적용
import { world } from "@minecraft/server";
import { getJSON, setJSON } from "./db.js";

export const SKILL_OPTS = [
  { id: "crCam3p", name: "청룡 · 천룡추 3인칭 시점", desc: "청룡이 옆에서 나란히 나는 동안 · 내리꽂을 때 카메라가 뒤 왼쪽 위에서 플레이어와 청룡을 함께 비춤 (착지하면 원래 시점)" },
];
let cache = null;
const all = () => (cache ??= getJSON(world, "rpg:skillopt", {}));
export const skillOpt = (id) => !!all()[id];
export function setSkillOpt(id, v) { all()[id] = !!v; setJSON(world, "rpg:skillopt", cache); }
