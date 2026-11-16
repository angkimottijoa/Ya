// Arcania RPG - 진입점
import { world, system, ItemStack, ItemLockMode } from "@minecraft/server";
import { data, save, forget, msg, notify, isAdmin } from "./player.js";
import { initCombat, castSkill } from "./combat.js";
import * as Q from "./quests.js";
import * as HUD from "./hud.js";
import { openHome, openQuests } from "./menu.js";
import { openNpc } from "./npc.js";
import { openAdmin, editNpc } from "./admin.js";
import { setQuestText } from "./api.js";

const MENU_SLOT = 8; // 핫바 9번 칸 = HUD [메뉴] 버튼
const SKILL_SLOT = 7; // 핫바 8번 칸 = HUD [스킬] 버튼
const lastUse = new Map();
const lastSlot = new Map();

function throttled(p) {
  const t = system.currentTick;
  if (t - (lastUse.get(p.id) ?? -99) < 6) return true;
  lastUse.set(p.id, t);
  return false;
}

/** 메뉴북(9번 칸)과 스킬(8번 칸)을 고정 지급 */
function ensureSlotItem(p, id, slot) {
  const c = p.getComponent("minecraft:inventory").container;
  if (c.getItem(slot)?.typeId === id) return;
  for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId === id) c.setItem(i, undefined);
  const it = new ItemStack(id, 1);
  it.lockMode = ItemLockMode.slot;
  it.keepOnDeath = true;
  const old = c.getItem(slot);
  c.setItem(slot, it);
  if (old) {
    const rest = c.addItem(old);
    if (rest) p.dimension.spawnItem(rest, p.location);
  }
}
function ensureMenuItem(p) {
  ensureSlotItem(p, "rpg:menu", MENU_SLOT);
  ensureSlotItem(p, "rpg:skill", SKILL_SLOT);
}

// HUD [메뉴]/[스킬] 버튼 = 핫바 9번/8번 칸 선택. 선택되면 바로 원래 칸으로 되돌리고 실행.
// (PC 에선 숫자키 9 / 8)
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const cur = p.selectedSlotIndex;
    const prev = lastSlot.get(p.id) ?? 0;
    if ((cur === MENU_SLOT || cur === SKILL_SLOT) && data(p).set.slots !== false) {
      const back = prev === MENU_SLOT || prev === SKILL_SLOT ? 0 : prev;
      p.selectedSlotIndex = back;
      lastSlot.set(p.id, back);
      if (throttled(p)) continue;
      if (cur === MENU_SLOT) openHome(p);
      else castSkill(p);
    } else {
      lastSlot.set(p.id, cur);
    }
  }
}, 1);

// 메뉴북: 사용 → 메뉴 / 웅크리고 사용 → 직업 스킬
// 제작자 도구: 사용 → 제작자 메뉴
world.afterEvents.itemUse.subscribe(({ itemStack, source: p }) => {
  if (itemStack.typeId === "rpg:menu") {
    if (throttled(p)) return;
    if (p.isSneaking) castSkill(p);
    else system.run(() => openHome(p));
  } else if (itemStack.typeId === "rpg:skill") {
    if (!throttled(p)) castSkill(p);
  } else if (itemStack.typeId === "rpg:quest_tool") {
    if (throttled(p)) return;
    system.run(() => openAdmin(p));
  }
});

// NPC 상호작용 (제작자 도구를 들고 누르면 편집)
world.afterEvents.playerInteractWithEntity?.subscribe(({ player: p, target }) => {
  if (target.typeId !== "rpg:npc" || throttled(p)) return;
  const held = p.getComponent("minecraft:inventory").container.getItem(p.selectedSlotIndex);
  if (held?.typeId === "rpg:quest_tool" && isAdmin(p)) system.run(() => editNpc(p, target));
  else system.run(() => openNpc(p, target));
});

// /scriptevent 명령 (커맨드 블록 / 다른 애드온 연동용)
//   rpg:menu              메뉴 열기
//   rpg:quests            퀘스트 화면
//   rpg:admin             제작자 도구
//   rpg:give_quest <id>   퀘스트 부여
//   rpg:quest <텍스트>    퀘스트창에 임의 텍스트 표시 (\n 줄바꿈, 빈 값이면 원래대로)
system.afterEvents.scriptEventReceive.subscribe(({ id, message, sourceEntity: p }) => {
  if (p?.typeId !== "minecraft:player") return;
  switch (id) {
    case "rpg:menu": return void openHome(p);
    case "rpg:quests": return void openQuests(p);
    case "rpg:admin": return void openAdmin(p);
    case "rpg:give_quest": {
      const ok = Q.accept(p, message.trim());
      if (!ok) msg(p, `§c퀘스트를 줄 수 없습니다: ${message}`);
      return;
    }
    case "rpg:quest": return void setQuestText(p, message.replaceAll("\\n", "\n"));
  }
});

world.afterEvents.playerSpawn.subscribe(({ player: p, initialSpawn }) => {
  HUD.resetHud(p);
  system.runTimeout(() => {
    if (!p.isValid()) return;
    ensureMenuItem(p);
    const d = data(p);
    if (initialSpawn && !d.joined) {
      d.joined = true;
      save(p);
      notify(p, "§6§lA R C A N I A §r§f· 오른쪽 위 §e[메뉴]§f 버튼 (PC: 숫자키 9)");
    }
  }, 20);
});

world.afterEvents.playerLeave.subscribe(({ playerId }) => forget(playerId));

initCombat();

// 1초마다: HUD / 퀘스트 판정 / 메뉴북 확인
let n = 0;
system.runInterval(() => {
  n++;
  for (const p of world.getAllPlayers()) {
    try {
      Q.tick(p);
      HUD.update(p);
      if (n % 5 === 0) ensureMenuItem(p);
    } catch (e) {
      console.warn(`[Arcania] ${e}`);
    }
  }
}, 20);
