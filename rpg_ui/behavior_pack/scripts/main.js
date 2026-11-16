import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

// HUD 퀘스트창은 "quest:" 로 시작하는 title 을 받아 표시한다 (resource_pack/ui/rpg_hud.json).
const QUEST_PREFIX = "quest:";

// 데모용 퀘스트. 실제 게임에선 여기 대신 본인 퀘스트 시스템에서 setQuest() 를 호출하면 된다.
const DEFAULT_QUEST = "§e[메인] 마을의 위기\n§7- 촌장과 대화하기\n§7- 고블린 처치 §f(0/5)";

function getQuest(player) {
  return player.getDynamicProperty("rpg:quest") ?? DEFAULT_QUEST;
}

function isQuestVisible(player) {
  return player.getDynamicProperty("rpg:quest_visible") ?? true;
}

/** 퀘스트창 내용을 HUD 로 보낸다. 숨김 상태면 빈 값을 보내 창을 감춘다. */
function pushQuest(player) {
  const body = isQuestVisible(player) ? getQuest(player) : "";
  player.onScreenDisplay.setTitle(QUEST_PREFIX + body, {
    fadeInDuration: 0,
    stayDuration: 1,
    fadeOutDuration: 0,
  });
}

/** 외부(다른 스크립트)에서 퀘스트 갱신할 때 사용 */
export function setQuest(player, text) {
  player.setDynamicProperty("rpg:quest", text);
  pushQuest(player);
}

async function openSettings(player) {
  const form = new ModalFormData()
    .title("§l설정")
    .toggle("퀘스트창 표시", isQuestVisible(player));
  const res = await form.show(player);
  if (res.canceled) return;
  player.setDynamicProperty("rpg:quest_visible", res.formValues[0]);
  pushQuest(player);
}

async function openMenu(player) {
  const form = new ActionFormData()
    .title("§l§6ARCANIA 메뉴")
    .body("원하는 항목을 선택하세요.")
    .button("§l퀘스트 확인")
    .button("§l설정")
    .button("§l닫기");
  const res = await form.show(player);
  if (res.canceled) return;
  switch (res.selection) {
    case 0: {
      const q = new ActionFormData()
        .title("§l퀘스트")
        .body(getQuest(player))
        .button("돌아가기");
      await q.show(player);
      return openMenu(player);
    }
    case 1:
      return openSettings(player);
  }
}

// 메뉴 열기 ①: "메뉴 설정" 아이템(rpg:menu) 사용
world.afterEvents.itemUse.subscribe(({ itemStack, source }) => {
  if (itemStack.typeId === "rpg:menu") system.run(() => openMenu(source));
});

// 메뉴 열기 ②: /scriptevent rpg:menu  (커맨드블록/NPC 버튼에서 호출 가능)
// 퀘스트 갱신:   /scriptevent rpg:quest <내용>   (\n 은 줄바꿈)
system.afterEvents.scriptEventReceive.subscribe(({ id, message, sourceEntity }) => {
  if (!sourceEntity || sourceEntity.typeId !== "minecraft:player") return;
  if (id === "rpg:menu") openMenu(sourceEntity);
  if (id === "rpg:quest") setQuest(sourceEntity, message.replaceAll("\\n", "\n"));
});

// 접속/리스폰 시 퀘스트창 복원
world.afterEvents.playerSpawn.subscribe(({ player }) => {
  system.runTimeout(() => pushQuest(player), 20);
});
