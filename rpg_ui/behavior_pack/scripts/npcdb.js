// NPC 레지스트리 (월드 저장): 퀘스트 의뢰자 선택, 길 안내 위치, 제작자 도구 목록 정렬용
//   { [npcId]: { name, kind: "civil"|"combat", x, y, z, dim, eid } }
import { world } from "@minecraft/server";
import { getJSON, setJSON } from "./db.js";

let reg = null;

export function npcRegistry() {
  if (!reg) {
    reg = getJSON(world, "rpg:npcs", {});
    // 구버전 { id: "이름" } 호환
    for (const [id, v] of Object.entries(reg)) if (typeof v === "string") reg[id] = { name: v, kind: "civil" };
  }
  return reg;
}

function persist() {
  setJSON(world, "rpg:npcs", reg);
}

export const npcIdOf = (e) => String(e.getDynamicProperty("rpg:npc_id") ?? "npc");
export const npcKind = (e) => (e.getDynamicProperty("rpg:kind") === "combat" ? "combat" : "civil");

/** 엔티티 정보를 레지스트리에 반영 (위치 포함) */
export function registerNpcEntity(e) {
  const id = npcIdOf(e);
  const r = npcRegistry();
  const old = r[id] ?? {};
  const loc = e.getDynamicProperty("rpg:anchor") ?? e.location;
  const next = {
    name: e.nameTag || "NPC", kind: npcKind(e),
    x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z), dim: e.dimension.id, eid: e.id,
  };
  if (JSON.stringify(old) !== JSON.stringify(next)) {
    r[id] = next;
    persist();
  }
}

export function unregisterNpc(id) {
  delete npcRegistry()[id];
  persist();
}

export function npcLocation(id) {
  const r = npcRegistry()[id];
  if (!r || r.x === undefined) return null;
  return { x: r.x + 0.5, y: r.y, z: r.z + 0.5, dim: r.dim ?? "minecraft:overworld", name: r.name };
}
