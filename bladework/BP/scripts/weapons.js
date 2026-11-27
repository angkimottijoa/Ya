import { EquipmentSlot } from "@minecraft/server";
import { CUSTOM_WEAPONS } from "./generated_weapons.js";

const TIER = ["wooden", "stone", "iron", "golden", "diamond", "netherite", "copper"];
const SWORD = { wooden: 5, stone: 6, iron: 7, golden: 5, diamond: 8, netherite: 9, copper: 6 };
const AXE = { wooden: 4, stone: 5, iron: 6, golden: 4, diamond: 7, netherite: 8, copper: 5 };

function vanilla(id) {
  if (id === "minecraft:trident") return { cls: "spear", dmg: 9 };
  if (id === "minecraft:mace") return { cls: "mace", dmg: 6 };
  const m = /^minecraft:([a-z]+)_(sword|axe|spear)$/.exec(id);
  if (!m || !TIER.includes(m[1])) return null;
  if (m[2] === "sword") return { cls: "sword", dmg: SWORD[m[1]] };
  if (m[2] === "axe") return { cls: "axe", dmg: AXE[m[1]] };
  return { cls: "spear", dmg: SWORD[m[1]] - 1 };
}

export function heldItem(player) {
  try { return player.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand); }
  catch { return undefined; }
}

/** Weapon info for whatever the player holds, or null when it is not a combat item. */
export function classify(player) {
  const item = heldItem(player);
  if (!item) return { cls: "fist", dmg: 1, item: undefined };
  const base = CUSTOM_WEAPONS[item.typeId] ?? vanilla(item.typeId);
  if (!base) return null;
  let dmg = base.dmg;
  try {
    const sharp = item.getComponent("minecraft:enchantable")?.getEnchantment("sharpness");
    if (sharp) dmg += 1.25 * sharp.level;
  } catch { /* enchantments unavailable */ }
  return { cls: base.cls, dmg, item };
}
