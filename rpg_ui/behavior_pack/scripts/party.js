// 파티: 생성/모집 게시판/가입 신청·승인/초대/추방/위임/탈퇴/해산 + 경험치 공유
import { world } from "@minecraft/server";
import { getJSON, setJSON } from "./db.js";
import { data, msg, byId } from "./player.js";

export const MAX_MEMBERS = 4;
let parties = null;

function load() {
  if (!parties) parties = getJSON(world, "rpg:parties", {});
  return parties;
}
function persist() {
  setJSON(world, "rpg:parties", parties);
}

export const allParties = () => Object.values(load());
export const getParty = (id) => load()[id];
export const memberIds = (party) => party.members;
export const partyOf = (pid) => allParties().find((pt) => pt.members.includes(pid));

export function create(p, name) {
  if (partyOf(p.id)) return null;
  const id = `pt_${Date.now().toString(36)}`;
  load()[id] = {
    id, name: name || `${p.name}의 파티`, leader: p.id, members: [p.id], names: { [p.id]: p.name },
    open: true, auto: false, msg: "함께 모험할 동료 구합니다!", minLv: 1, req: [],
  };
  persist();
  return load()[id];
}

export function join(p, partyId) {
  const pt = getParty(partyId);
  if (!pt || partyOf(p.id)) return "fail";
  if (pt.members.length >= MAX_MEMBERS) return "full";
  if (data(p).lv < pt.minLv) return "level";
  if (!pt.auto) {
    if (!pt.req.includes(p.id)) pt.req.push(p.id);
    pt.names[p.id] = p.name;
    persist();
    const leader = byId(pt.leader);
    if (leader) msg(leader, `§e${p.name}§r 님이 파티 가입을 신청했습니다. (메뉴 > 파티)`);
    return "requested";
  }
  addMember(pt, p);
  return "joined";
}

export function addMember(pt, p) {
  if (pt.members.length >= MAX_MEMBERS || partyOf(p.id)) return false;
  pt.members.push(p.id);
  pt.names[p.id] = p.name;
  pt.req = pt.req.filter((r) => r !== p.id);
  persist();
  for (const id of pt.members) {
    const m = byId(id);
    if (m) msg(m, `§a${p.name}§r 님이 파티에 합류했습니다.`);
  }
  return true;
}

export function decline(pt, pid) {
  pt.req = pt.req.filter((r) => r !== pid);
  persist();
}

export function leave(pid) {
  const pt = partyOf(pid);
  if (!pt) return;
  pt.members = pt.members.filter((m) => m !== pid);
  if (!pt.members.length) {
    delete load()[pt.id];
  } else if (pt.leader === pid) {
    pt.leader = pt.members[0];
  }
  persist();
  for (const id of pt.members) {
    const m = byId(id);
    if (m) msg(m, `§7${pt.names[pid] ?? "?"} 님이 파티를 떠났습니다.`);
  }
}

export function disband(pt) {
  for (const id of pt.members) {
    const m = byId(id);
    if (m) msg(m, "§c파티가 해산되었습니다.");
  }
  delete load()[pt.id];
  persist();
}

export function promote(pt, pid) {
  pt.leader = pid;
  persist();
}

export function update(pt, patch) {
  Object.assign(pt, patch);
  persist();
}

/** 같은 차원, dist 안의 온라인 파티원 (자신 제외) */
export function nearbyMembers(p, dist = 48) {
  const pt = partyOf(p.id);
  if (!pt) return [];
  return pt.members
    .filter((id) => id !== p.id)
    .map(byId)
    .filter((m) => m && m.dimension.id === p.dimension.id &&
      Math.hypot(m.location.x - p.location.x, m.location.y - p.location.y, m.location.z - p.location.z) <= dist);
}
