// Tunable numbers for the whole combat system. Times are in game ticks (20 = 1 second).
export const CFG = {
  STAMINA_MAX: 20,
  STAMINA_REGEN: 0.14,        // per tick, once resting
  STAMINA_REGEN_DELAY: 24,    // ticks after last use before regen starts
  DODGE_COST: 4,
  DODGE_IFRAMES: 8,
  DODGE_LOCK: 11,
  DODGE_FORCE: 1.7,
  BACKSTEP_FORCE: 1.25,
  DOUBLE_TAP: 7,              // max ticks between two sneak presses
  PARRY_WINDOW: 5,            // ticks after guard start that count as a parry
  GUARD_RESIST: 3,            // resistance amplifier while guarding (3 = 80% reduction)
  GUARD_FACTOR: 0.2,          // share of damage that still gets through that amplifier
  GUARD_COST: 0.8,            // stamina per point of blocked damage
  GUARD_COST_FLAT: 1,
  GUARD_BREAK_TICKS: 50,
  COMBO_WINDOW: 14,           // ticks after a move ends in which the chain continues
  INPUT_BUFFER: 5,            // an attack pressed this close to the end of a move is queued
  GAUGE_MAX: 100,
  GAUGE_PARRY: 25,
  HUD_INTERVAL: 2,
};

// Mobs that ignore stagger and launch effects.
export const UNSTOPPABLE = new Set([
  "minecraft:ender_dragon", "minecraft:wither", "minecraft:warden", "minecraft:elder_guardian",
  "minecraft:ravager", "minecraft:iron_golem", "minecraft:creaking",
]);
// Never hit by arc sweeps (only by a direct, deliberate hit).
export const SWEEP_SAFE = new Set([
  "minecraft:villager_v2", "minecraft:villager", "minecraft:wandering_trader", "minecraft:iron_golem",
  "minecraft:snow_golem", "minecraft:allay", "minecraft:armor_stand", "minecraft:npc",
]);
