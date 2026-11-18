// Arcania RPG - 진입점
import "./world_rules.js";
import "./dmgfx.js"; // 피해 숫자 · 머리 위 체력바
import "./enhance.js"; // 강화 · 강화석 떨어뜨리기 // 가장 먼저: PvP · 시전자 문맥 · 파티클 최적화 (다른 모듈이 예약하는 동작까지 감쌈)
import { world, system, ItemStack, ItemLockMode } from "@minecraft/server";
import { demoCircle } from "./magic.js";
import { data, save, forget, msg, notify, isAdmin, setLevel } from "./player.js";
import { initCombat, resetSpeed } from "./combat.js";
import { initSkillTriggers, skillJumpTick } from "./skills.js";
import { dashTick } from "./dash.js";
import { registerNpcEntity } from "./npcdb.js";
import { navTick } from "./waypoints.js";
import * as Q from "./quests.js";
import * as HUD from "./hud.js";
import { openHome, openQuests, openSkills, giveTool } from "./menu.js";
import * as J from "./jobs.js";
import { openNpc } from "./npc.js";
import { openAdmin, editNpc } from "./admin.js";
import { setQuestText } from "./api.js";

// 핫바: 1~8번 아이템, 9번 메뉴(쉬프트 = 옆 창 접기)
// 스킬: 직업 도구를 들고 ① 클릭 / ② 쉬프트+클릭 / ③ 쉬프트+점프 (skills.js)
const MENU_SLOT = 8; // 핫바 9번 칸 = [메뉴]
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
  // 예전 버전의 스킬 버튼/스킬창 아이템 정리
  const c = p.getComponent("minecraft:inventory").container;
  for (let i = 0; i < c.size; i++) if (c.getItem(i)?.typeId.startsWith("rpg:skill")) c.setItem(i, undefined);
}

// [메뉴] 버튼 = 핫바 9번 칸 선택 → 바로 원래 칸으로 되돌리고 메뉴 / 쉬프트면 옆 창 접기 (PC: 숫자키 9)
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const cur = p.selectedSlotIndex;
    const prev = lastSlot.get(p.id) ?? 0;
    if (cur === MENU_SLOT && data(p).set.slots !== false) {
      const back = prev === MENU_SLOT ? 0 : prev;
      p.selectedSlotIndex = back;
      lastSlot.set(p.id, back);
      if (throttled(p)) continue;
      if (p.isSneaking) {
        // 쉬프트+[메뉴] = 옆 창 접기 순환 (V12.124: 정보창이 먼저 남고 퀘스트가 먼저 사라짐): 모두 펼침 → 퀘스트 접힘 → 모두 접힘
        const st = data(p).set;
        if (st.card && st.quest) st.quest = false;
        else if (st.card) st.card = false;
        else st.card = st.quest = true;
        save(p);
        notify(p, `§7HUD 창: §f${st.card ? (st.quest ? "모두 펼침" : "퀘스트 접힘") : "모두 접힘"} §7(쉬프트+[메뉴]로 전환)`);
        continue;
      }
      // 터치를 뗄 시간을 준 뒤 화면을 연다 (누르고 있는 중에 열면 바로 닫히는 문제)
      system.runTimeout(() => {
        if (p.isValid()) openHome(p);
      }, 6);
    } else {
      lastSlot.set(p.id, cur);
    }
    dashTick(p);
    skillJumpTick(p);
  }
}, 1);

// 메뉴북: 사용 → 메뉴 / 웅크리고 사용 → 직업 스킬
// 제작자 도구: 사용 → 제작자 메뉴
world.afterEvents.itemUse.subscribe(({ itemStack, source: p }) => {
  if (itemStack.typeId === "rpg:menu") {
    if (throttled(p)) return;
    system.run(() => openHome(p));
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
//   rpg:level <숫자>      레벨 직접 설정 (스탯 포인트 다시 계산)
//   rpg:gold <숫자>       골드 직접 설정
//   rpg:reaper            히든 직업 영혼 수확자 해금 (테스트용)
//   rpg:hidden [id]       히든 직업 해금 (chronomancer · abyss_knight · spirit_shepherd, 비우면 셋 다)
//   rpg:circle <프리셋> [크기] [v]  마법진 미리보기 (astral · hexa · cyan · seal · triseal · trinity, v = 앞에 세워서)
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
    case "rpg:circle": return void demoCircle(p, message);
    case "rpg:hidden": { const d = data(p); d.hidden ??= {}; for (const id of ["chronomancer", "abyss_knight", "spirit_shepherd"]) if (!message.trim() || message.trim() === id) d.hidden[id] = "open"; save(p); return void notify(p, "§d히든 직업 해금 (직업·스킬 > 승급)"); }
    case "rpg:reaper": { const d = data(p); d.reaperOpen = true; save(p); return void notify(p, "§5히든 직업 영혼 수확자 해금 (직업·스킬 > 승급)"); }
    case "rpg:level": return void setLevel(p, message.trim());
    case "rpg:gold": {
      const d = data(p);
      d.gold = Math.max(0, Math.floor(Number(message.trim()) || 0));
      save(p);
      return void notify(p, `§6골드 설정 §f${d.gold}G`);
    }
  }
});

world.afterEvents.playerSpawn.subscribe(({ player: p, initialSpawn }) => {
  HUD.resetHud(p);
  resetSpeed(p);
  system.runTimeout(() => {
    if (!p.isValid()) return;
    ensureMenuItem(p);
    const d = data(p);
    // V2.7: 이미 직업이 있는 플레이어에게 전용 도구를 한 번 지급
    d.toolGiven = d.toolGiven ?? {};
    for (const id of J.chain(d)) if (!d.toolGiven[id]) {
      giveTool(p, id);
      d.toolGiven[id] = true;
      save(p);
    }
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

// ───────── V12.99: 3D 무기를 들고 블록을 치거나 · 캐거나 · 몹을 때리면 팔 휘두르기를 직접 재생 (1·3인칭 모두) ─────────
const W3D_IDS = new Set(["rpg:hundun_scythe", "rpg:cheongryong_sword", "rpg:baekho_axe", "rpg:jujak_bow", "rpg:hyeonmu_shield",
  "rpg:jt_warrior", "rpg:jt_mage", "rpg:jt_archer", "rpg:jt_cleric", "rpg:jt_swordmaster", "rpg:jt_berserker", "rpg:jt_hunter", "rpg:jt_sniper",
  "rpg:jt_elementalist", "rpg:jt_stormcaller", "rpg:jt_paladin", "rpg:jt_priest", "rpg:jt_sword_emperor", "rpg:jt_abyss_knight",
  "rpg:jt_destroyer", "rpg:jt_beastlord", "rpg:jt_hawkeye", "rpg:jt_soul_reaper"]);
const lastSwing = new Map();
function w3dSwing(p) {
  if (p?.typeId !== "minecraft:player") return;
  let id; try { id = p.getComponent("minecraft:inventory")?.container?.getItem(p.selectedSlotIndex)?.typeId; } catch {}
  if (!W3D_IDS.has(id)) return;
  const now = system.currentTick;
  if (now - (lastSwing.get(p.id) ?? -99) < 5) return; // 0.25초에 한 번
  lastSwing.set(p.id, now);
  try { p.playAnimation("animation.rpg_w3d.hit_swing", { blendOutTime: 0.08 }); } catch {}
}
world.afterEvents.entityHitBlock.subscribe(({ damagingEntity }) => w3dSwing(damagingEntity));
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity }) => w3dSwing(damagingEntity));
world.afterEvents.playerBreakBlock.subscribe(({ player }) => w3dSwing(player));
