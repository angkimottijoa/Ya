// 채팅: 전체 / 파티 / 채팅방 / 개인 메시지(DM)
// 채널 키: "global", "party:<id>", "room:<이름>", "dm:<id1>|<id2>" (id 정렬)
import { world } from "@minecraft/server";
import { getJSON, setJSON } from "./db.js";
import { notify, byId } from "./player.js";
import { partyOf } from "./party.js";

const KEEP = 40;
const logs = new Map(); // channel -> [{ from, name, text, t }]
const seen = new Map(); // `${pid}|${channel}` -> 마지막으로 본 메시지 수
let rooms = null; // name -> { owner, members: [pid], names: {} }

function roomsDb() {
  if (!rooms) rooms = getJSON(world, "rpg:rooms", {});
  return rooms;
}
function saveRooms() {
  setJSON(world, "rpg:rooms", rooms);
}

// 동적 프로퍼티 키에 한글/특수문자가 들어가지 않도록 해시
function pkey(ch) {
  let h = 5381;
  for (let i = 0; i < ch.length; i++) h = ((h * 33) ^ ch.charCodeAt(i)) >>> 0;
  return `rpg:chat:${h.toString(36)}`;
}

export function log(ch) {
  if (!logs.has(ch)) logs.set(ch, getJSON(world, pkey(ch), []));
  return logs.get(ch);
}

export const dmKey = (a, b) => `dm:${[a, b].sort().join("|")}`;

/** 플레이어가 볼 수 있는 채널 목록 */
export function channels(p) {
  const out = [{ ch: "global", name: "전체 채팅", icon: "chat" }];
  const pt = partyOf(p.id);
  if (pt) out.push({ ch: `party:${pt.id}`, name: `파티 · ${pt.name}`, icon: "party" });
  for (const [name, r] of Object.entries(roomsDb())) {
    if (r.members.includes(p.id)) out.push({ ch: `room:${name}`, name: `# ${name}`, icon: "room" });
  }
  const dms = getJSON(p, "rpg:dms", {});
  for (const [id, name] of Object.entries(dms)) out.push({ ch: dmKey(p.id, id), name: `@ ${name}`, icon: "dm", to: id });
  return out;
}

export function unread(p, ch) {
  return Math.max(0, log(ch).length - (seen.get(`${p.id}|${ch}`) ?? log(ch).length));
}
export function markSeen(p, ch) {
  seen.set(`${p.id}|${ch}`, log(ch).length);
}
export function unreadCount(p) {
  let n = 0;
  for (const c of channels(p)) if (c.ch !== "global") n += unread(p, c.ch);
  return n;
}

function recipients(p, ch) {
  if (ch === "global") return world.getAllPlayers();
  if (ch.startsWith("party:")) return (partyOf(p.id)?.members ?? []).map(byId).filter(Boolean);
  if (ch.startsWith("room:")) return (roomsDb()[ch.slice(5)]?.members ?? []).map(byId).filter(Boolean);
  if (ch.startsWith("dm:")) return ch.slice(3).split("|").map(byId).filter(Boolean);
  return [];
}

const PREFIX = { global: "§f[전체]", party: "§d[파티]", room: "§b[#", dm: "§e[DM]" };

export function send(p, ch, text) {
  text = String(text).trim().slice(0, 200);
  if (!text) return;
  const l = log(ch);
  // 첫 메시지 전에 각자 '본 위치'를 기록해 두어야 안 읽음 계산이 맞음
  for (const r of recipients(p, ch)) if (!seen.has(`${r.id}|${ch}`)) seen.set(`${r.id}|${ch}`, l.length);
  l.push({ from: p.id, name: p.name, text, t: Date.now() });
  if (l.length > KEEP) l.splice(0, l.length - KEEP);
  setJSON(world, pkey(ch), l);
  markSeen(p, ch);

  const kind = ch.split(":")[0];
  const tag = kind === "room" ? `${PREFIX.room}${ch.slice(5)}]` : PREFIX[kind];
  for (const r of recipients(p, ch)) {
    r.sendMessage(`${tag} §r§l${p.name}§r§7: §f${text}`);
    if (r.id !== p.id && kind !== "global") notify(r, `${tag} §r§f${p.name}: ${text.slice(0, 30)}`);
    if (kind === "dm" && r.id !== p.id) {
      const dms = getJSON(r, "rpg:dms", {});
      if (!dms[p.id]) {
        dms[p.id] = p.name;
        setJSON(r, "rpg:dms", dms);
      }
    }
  }
}

export function openDm(p, target) {
  const dms = getJSON(p, "rpg:dms", {});
  dms[target.id] = target.name;
  setJSON(p, "rpg:dms", dms);
  return dmKey(p.id, target.id);
}

export function closeDm(p, otherId) {
  const dms = getJSON(p, "rpg:dms", {});
  delete dms[otherId];
  setJSON(p, "rpg:dms", dms);
}

// ───── 채팅방 ─────
export const allRooms = () => Object.entries(roomsDb()).map(([name, r]) => ({ name, ...r }));

export function createRoom(p, name, pw = "") {
  name = String(name).trim().slice(0, 16);
  if (!name || roomsDb()[name]) return false;
  roomsDb()[name] = { owner: p.id, members: [p.id], names: { [p.id]: p.name }, pw };
  saveRooms();
  return true;
}

export function joinRoom(p, name, pw = "") {
  const r = roomsDb()[name];
  if (!r) return "none";
  if (r.pw && r.pw !== pw) return "pw";
  if (!r.members.includes(p.id)) r.members.push(p.id);
  r.names[p.id] = p.name;
  saveRooms();
  send(p, `room:${name}`, "§7(입장했습니다)");
  return "ok";
}

export function leaveRoom(p, name) {
  const r = roomsDb()[name];
  if (!r) return;
  send(p, `room:${name}`, "§7(퇴장했습니다)");
  r.members = r.members.filter((m) => m !== p.id);
  if (!r.members.length) {
    delete roomsDb()[name];
    world.setDynamicProperty(pkey(`room:${name}`), undefined);
    logs.delete(`room:${name}`);
  } else if (r.owner === p.id) r.owner = r.members[0];
  saveRooms();
}
