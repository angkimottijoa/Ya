// 길찾기: 제작자가 등록한 장소(웨이포인트) + NPC 위치로 길 안내
//   월드: rpg:wps = { [id]: { name, cat, desc, x, y, z, dim } }
//   플레이어: data.navTo = { kind: "wp" | "npc", id }  (퀘스트 길 안내보다 우선)
import { world } from "@minecraft/server";
import { getJSON, setJSON } from "./db.js";
import { data, save, notify } from "./player.js";
import { npcLocation } from "./npcdb.js";

export const WP_CATS = ["마을", "던전", "상점", "사냥터", "채집지", "기타"];

let wps = null;
export const waypoints = () => (wps ??= getJSON(world, "rpg:wps", {}));
export function saveWaypoint(id, wp) {
  waypoints()[id] = wp;
  setJSON(world, "rpg:wps", wps);
}
export function deleteWaypoint(id) {
  delete waypoints()[id];
  setJSON(world, "rpg:wps", wps);
}
export function newWaypointId() {
  let i = Object.keys(waypoints()).length + 1;
  while (waypoints()[`wp_${i}`]) i++;
  return `wp_${i}`;
}

/** 수동 길 안내 대상 위치 { x, y, z, dim, label } */
export function manualTarget(p) {
  const n = data(p).navTo;
  if (!n) return null;
  if (n.kind === "wp") {
    const w = waypoints()[n.id];
    return w ? { x: w.x + 0.5, y: w.y, z: w.z + 0.5, dim: w.dim, label: w.name } : null;
  }
  if (n.kind === "npc") {
    const l = npcLocation(n.id);
    return l ? { ...l, label: l.name } : null;
  }
  return null;
}

export function startNav(p, kind, id) {
  data(p).navTo = { kind, id };
  save(p);
  const t = manualTarget(p);
  if (t) notify(p, `§d§l길 안내 시작 §r§f${t.label}`);
}

export function stopNav(p) {
  data(p).navTo = null;
  save(p);
}

/** 1초마다: 도착하면 자동 종료 */
export function navTick(p) {
  const t = manualTarget(p);
  if (!data(p).navTo) return;
  if (!t) return stopNav(p);
  if (t.dim === p.dimension.id && Math.hypot(t.x - p.location.x, t.y - p.location.y, t.z - p.location.z) < 4) {
    notify(p, `§a§l도착! §r§f${t.label}`);
    p.playSound("random.orb", { pitch: 1.6 });
    stopNav(p);
  }
}

export function distTo(p, t) {
  if (!t || t.dim !== p.dimension.id) return Infinity;
  return Math.hypot(t.x - p.location.x, t.y - p.location.y, t.z - p.location.z);
}
