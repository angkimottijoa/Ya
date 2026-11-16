// Arcania RPG - 진입점
import { world, system, ItemStack, ItemLockMode } from "@minecraft/server";
import { data, save, forget, msg, notify, isAdmin } from "./player.js";
import { initCombat, castSkill, resetSpeed } from "./combat.js";
import { initSkillTriggers, castWeaponSkill } from "./skills.js";
import { registerNpcEntity } from "./npcdb.js";
import { navTick } from "./waypoints.js";
import * as Q from "./quests.js";
import * as HUD from "./hud.js";
import { openHome, openQuests, openSkills } from "./menu.js";
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
      if (cur === SKILL_SLOT) {
        // HUD [스킬] = 기본 스킬 / 웅크린 채 [스킬] = 쉬프트 스킬
        castWeaponSkill(p, undefined, p.isSneaking ? "sub" : "main");
        continue;
      }
      if (p.isSneaking) {
        // 쉬프트+[메뉴] = HUD 창 접기 순환: 모두 펼침 → 정보 접기 → 모두 접기
        const s = data(p).set;
        if (s.card && s.quest) s.card = false;
        else if (s.quest) s.quest = false;
        else s.card = s.quest = true;
        save(p);
        notify(p, `§7HUD: §f${s.quest ? (s.card ? "모두 펼침" : "정보 접힘") : "모두 접힘"} §7(쉬프트+[메뉴]로 전환)`);
        continue;
      }
      // 터치를 뗄 시간을 준 뒤 화면을 연다 (누르고 있는 중에 열면 바로 닫히는 문제)
      system.runTimeout(() => {
        if (p.isValid()) openHome(p);
      }, 6);
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
    if (!throttled(p)) castWeaponSkill(p, undefined, p.isSneaking ? "sub" : "main");
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
  resetSpeed(p);
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
initSkillTriggers();

// HUD: 4틱마다 (바뀐 것만 전송)
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    try {
      HUD.update(p);
    } catch (e) {
      console.warn(`[Arcania] hud ${e}`);
    }
  }
}, 4);

// 1초마다: 퀘스트 판정 / 길 안내 파티클 / 고정 아이템
let n = 0;
system.runInterval(() => {
  n++;
  for (const p of world.getAllPlayers()) {
    try {
      Q.tick(p);
      navTick(p);
      HUD.navParticles(p);
      if (n % 5 === 0) ensureMenuItem(p);
    } catch (e) {
      console.warn(`[Arcania] ${e}`);
    }
  }
  if (n % 5 === 0) npcMaintenance();
}, 20);

/** 5초마다: NPC 위치 등록(길 안내용), 구버전 NPC 변환, 전투 NPC 제자리 복귀 */
function npcMaintenance() {
  const dims = new Set(world.getAllPlayers().map((p) => p.dimension));
  for (const dim of dims) {
    for (const e of dim.getEntities({ type: "rpg:npc" })) {
      try {
        if (!e.getDynamicProperty("rpg:kind")) {
          e.setDynamicProperty("rpg:kind", "civil");
          e.triggerEvent("rpg:set_civilian");
        }
        if (!e.getDynamicProperty("rpg:anchor")) e.setDynamicProperty("rpg:anchor", e.location);
        const a = e.getDynamicProperty("rpg:anchor");
        if (e.getDynamicProperty("rpg:kind") === "combat" && Math.hypot(e.location.x - a.x, e.location.z - a.z) > 14) {
          e.teleport(a);
        }
        registerNpcEntity(e);
      } catch {}
    }
  }
}
