// Bladework Combat - entry point. Wires game events to the combat modules.
import { world, system, ItemStack, EntityDamageCause } from "@minecraft/server";
import { CFG } from "./config.js";
import { classify } from "./weapons.js";
import { getState, dropState } from "./state.js";
import { now, alive } from "./util.js";
import { onSwing, onVanillaHit, isInternal } from "./attack.js";
import { tickDefense, onPlayerHurt } from "./defense.js";
import { drawHud } from "./hud.js";
import { openMenu, toggleMode } from "./menu.js";

const CODEX = "bw:combat_codex";
const isPlayer = e => e?.typeId === "minecraft:player";

system.runInterval(() => {
  const t = now();
  for (const player of world.getAllPlayers()) {
    try {
      if (!alive(player)) continue;
      const st = getState(player);
      if (!st.mode) continue;
      const w = classify(player);
      tickDefense(player, st, w, t);
      if (t % CFG.HUD_INTERVAL === 0) drawHud(player, st, w, t);
    } catch (err) {
      console.warn(`[Bladework] tick error: ${err}`);
    }
  }
}, 1);

world.afterEvents.entityHurt.subscribe(ev => {
  try {
    const hurt = ev.hurtEntity, src = ev.damageSource;
    if (!alive(hurt)) return;
    if (isPlayer(hurt)) onPlayerHurt(hurt, getState(hurt), ev, now());
    const by = src.damagingEntity;
    if (isPlayer(by) && alive(by) && src.cause === EntityDamageCause.entityAttack && !src.damagingProjectile
        && !isInternal(hurt.id)) {
      onVanillaHit(by, hurt, ev.damage);
    }
  } catch (err) {
    console.warn(`[Bladework] hurt error: ${err}`);
  }
});

// Arm swings let combos advance even when nothing is hit. Older engines lack the event; hits still work there.
world.afterEvents.playerSwingStart?.subscribe(ev => {
  try {
    const source = ev.swingSource;
    if (source !== undefined && String(source).toLowerCase() !== "attack") return;
    if (alive(ev.player)) onSwing(ev.player);
  } catch (err) {
    console.warn(`[Bladework] swing error: ${err}`);
  }
});

world.afterEvents.itemUse.subscribe(ev => {
  if (ev.itemStack?.typeId !== CODEX) return;
  if (ev.source.isSneaking) toggleMode(ev.source); else openMenu(ev.source);
});

world.afterEvents.playerSpawn.subscribe(ev => {
  const player = ev.player;
  dropState(player.id);                    // fresh combat state on (re)spawn
  if (!ev.initialSpawn) return;
  try {
    if (player.getDynamicProperty("bw:init")) return;
    player.setDynamicProperty("bw:init", true);
    player.getComponent("minecraft:inventory")?.container?.addItem(new ItemStack(CODEX, 1));
    player.sendMessage({ translate: "bw.msg.welcome" });
  } catch (err) {
    console.warn(`[Bladework] welcome error: ${err}`);
  }
});

world.afterEvents.playerLeave.subscribe(ev => dropState(ev.playerId));

system.afterEvents.scriptEventReceive.subscribe(ev => {
  const player = ev.sourceEntity;
  if (!isPlayer(player)) return;
  if (ev.id === "bw:menu") openMenu(player);
  else if (ev.id === "bw:toggle") toggleMode(player);
  else if (ev.id === "bw:gauge") getState(player).gauge = CFG.GAUGE_MAX;
});
