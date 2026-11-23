// HUD 버튼 (V12.157 시험판) — 「항상 열린 투명 서버 폼」 꼼수
//   리소스팩: server_form 화면이 입력을 막지 않음(걷기 · 시점 · 공격 그대로) + [RPG:B] = 버튼만 그림 (gen_hudbtn.py)
//   스크립트: 버튼 창을 계속 띄워 두고, 누르면 그 기능 실행 → 바로 다시 띄움
//   다른 폼(메뉴 · 설정 · NPC 등)이 열릴 땐 먼저 버튼 창을 닫고, 그 폼이 닫힌 뒤 잠깐 있다가 다시 띄움
import { system, world } from "@minecraft/server";
import * as UI from "@minecraft/server-ui"; // uiManager 가 없는 버전이어도 멈추지 않게 이름공간으로
import { data } from "./player.js";
import { castKey } from "./skills.js";
import { openHome } from "./menu.js";

const ST = new Map(); // pid → { open, busyUntil }
const now = () => system.currentTick;
const st = (p) => { let s = ST.get(p.id); if (!s) ST.set(p.id, (s = { open: false, busyUntil: 0 })); return s; };
const wait = (t) => new Promise((r) => system.runTimeout(r, t));
export const hudBtnOn = (p) => data(p).set?.hudBtn !== false;

/** 버튼 창 닫기 (다른 폼을 열기 전) */
function closeHud(p) {
  const s = st(p);
  if (!s.open) return false;
  s.open = false;
  try { UI.uiManager?.closeAllForms(p); } catch {}
  return true;
}
const BUTTONS = [
  { t: "☰", fn: (p) => openHome(p) },
  { t: "①", fn: (p) => castKey(p, 1) },
  { t: "②", fn: (p) => castKey(p, 2) },
  { t: "③", fn: (p) => castKey(p, 3) },
  { t: "④", fn: (p) => castKey(p, 4) },
];
function showHud(p) {
  const s = st(p);
  s.open = true;
  const f = new UI.ActionFormData().title("[RPG:B]").body("");
  f.__hud = true;
  for (const b of BUTTONS) f.button(`[HB]§l${b.t}`);
  f.show(p).then((r) => {
    s.open = false;
    if (r.canceled) { if (r.cancelationReason === "UserBusy") s.busyUntil = now() + 10; return; }
    const b = BUTTONS[r.selection];
    if (b) try { b.fn(p); } catch {}
  }).catch(() => { s.open = false; });
}
// 모든 폼: 열기 전에 버튼 창을 닫고, 열려 있는 동안 + 닫힌 뒤 10틱은 버튼 창을 다시 띄우지 않음
for (const C of [UI.ActionFormData, UI.ModalFormData, UI.MessageFormData]) {
  if (!C || Object.prototype.hasOwnProperty.call(C.prototype, "__hudWrapped")) continue;
  const orig = C.prototype.show;
  C.prototype.__hudWrapped = true;
  C.prototype.show = async function (p) {
    if (this.__hud) return orig.call(this, p);
    const s = st(p);
    s.busyUntil = now() + 100000;
    try {
      if (closeHud(p)) await wait(2);
      return await orig.call(this, p);
    } finally { s.busyUntil = now() + 10; }
  };
}
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const s = st(p);
    if (s.open || now() < s.busyUntil || !hudBtnOn(p)) continue;
    try { if (p.getComponent("minecraft:health")?.currentValue <= 0) continue; } catch {}
    showHud(p);
  }
}, 5);
try { world.afterEvents.playerLeave.subscribe(({ playerId }) => ST.delete(playerId)); } catch {}
