// 아이템 분류 / 희귀도 / 스탯 / 아이콘 / 이름
import { ItemStack, world } from "@minecraft/server";
import { getJSON, setJSON } from "./db.js";
import { ITEM_TEX, BLOCK_TEX } from "./texmap.js";

export const ICON = (n) => `textures/ui/rpg/icons/${n}`;

export const CATS = [
  { id: "all", name: "전체", icon: "all" },
  { id: "weapon", name: "무기", icon: "class" },
  { id: "armor", name: "방어구", icon: "armor" },
  { id: "food", name: "소모품", icon: "food" },
  { id: "material", name: "재료", icon: "material" },
  { id: "misc", name: "기타", icon: "misc" },
];

const short = (id) => id.replace(/^minecraft:/, "");

export function category(id) {
  const s = short(id);
  if (/(sword|_axe$|^bow$|crossbow|trident|mace)/.test(s)) return "weapon";
  if (/(helmet|chestplate|leggings|boots|shield|elytra|horse_armor|wolf_armor)/.test(s)) return "armor";
  if (/(apple|bread|beef|pork|chicken|mutton|rabbit|cod|salmon|potato|carrot|beetroot|melon_slice|cookie|pie|stew|soup|berries|kelp|honey_bottle|potion|cake|chorus_fruit|totem|ender_pearl|firework_rocket|arrow)/.test(s)) return "food";
  if (/(ingot|nugget|diamond|emerald|lapis|quartz|redstone|coal|raw_|scrap|shard|dust|string|leather|feather|bone|gunpowder|slime_ball|blaze|ender_eye|stick|flint|wheat|paper|book|clay_ball|brick|glowstone_dust|nether_star|heart_of_the_sea|amethyst)/.test(s)) return "material";
  if (BLOCK_TEX[s]) return "material";
  return "misc";
}

const SPECIAL_RARITY = {
  elytra: 5, totem_of_undying: 5, nether_star: 5, enchanted_golden_apple: 5, beacon: 5, dragon_egg: 5,
  mace: 5, heart_of_the_sea: 4, trident: 4, diamond: 4, netherite_ingot: 5, netherite_scrap: 4,
  golden_apple: 3, emerald: 3, ender_pearl: 3, ender_eye: 3, shulker_shell: 4, echo_shard: 4,
};

export function rarity(stack) {
  const s = short(stack.typeId);
  let r = SPECIAL_RARITY[s];
  if (!r) {
    if (s.includes("netherite")) r = 5;
    else if (s.includes("diamond")) r = 4;
    else if (/(iron|chainmail|golden|gold_)/.test(s)) r = 3;
    else if (/(stone|leather|copper|bow|crossbow)/.test(s)) r = 2;
    else r = 1;
  }
  try {
    if (stack.getComponent("minecraft:enchantable")?.getEnchantments().length) r = Math.min(5, r + 1);
  } catch {}
  return r;
}

const SWORD = { wooden: 4, stone: 5, iron: 6, golden: 4, diamond: 7, netherite: 8, copper: 5 };
const AXE = { wooden: 3, stone: 4, iron: 5, golden: 3, diamond: 6, netherite: 7, copper: 4 };
const ARMOR = {
  leather: [1, 3, 2, 1], chainmail: [2, 5, 4, 1], iron: [2, 6, 5, 2], golden: [2, 5, 3, 1],
  diamond: [3, 8, 6, 3], netherite: [3, 8, 6, 3], turtle: [2, 0, 0, 0], copper: [2, 4, 3, 1],
};
const ARMOR_PART = { helmet: 0, chestplate: 1, leggings: 2, boots: 3 };

/** { kind, atk?, def? } */
export function weaponInfo(id) {
  const s = short(id);
  let m;
  if ((m = s.match(/^(\w+?)_sword$/))) return { kind: "한손검", atk: SWORD[m[1]] ?? 4 };
  if ((m = s.match(/^(\w+?)_axe$/))) return { kind: "도끼", atk: AXE[m[1]] ?? 3 };
  if (s === "trident") return { kind: "삼지창", atk: 9 };
  if (s === "mace") return { kind: "철퇴", atk: 6 };
  if (s === "bow") return { kind: "활", atk: 6 };
  if (s === "crossbow") return { kind: "쇠뇌", atk: 9 };
  if ((m = s.match(/^(\w+?)_(helmet|chestplate|leggings|boots)$/))) {
    const t = ARMOR[m[1]];
    return { kind: { helmet: "투구", chestplate: "갑옷", leggings: "각반", boots: "장화" }[m[2]], def: t ? t[ARMOR_PART[m[2]]] : 1 };
  }
  if (s === "shield") return { kind: "방패", def: 0 };
  if (s === "elytra") return { kind: "날개" };
  return null;
}

export function armorSlot(id) {
  const s = short(id);
  if (/helmet|_head$|_skull$|carved_pumpkin/.test(s)) return "Head";
  if (/chestplate|elytra/.test(s)) return "Chest";
  if (/leggings/.test(s)) return "Legs";
  if (/boots/.test(s)) return "Feet";
  if (s === "shield" || s === "totem_of_undying") return "Offhand";
  return null;
}

const ALIAS = {
  bow: "bow_standby", golden_apple: "apple_golden", enchanted_golden_apple: "apple_golden",
  golden_carrot: "carrot_golden", book: "book_normal", writable_book: "book_writable",
  written_book: "book_written", enchanted_book: "book_enchanted", potion: "potion_bottle_drinkable",
  splash_potion: "potion_bottle_splash", filled_map: "map_filled", map: "map_empty",
  crossbow: "crossbow_standby", fishing_rod: "fishing_rod_uncast", compass: "compass_item",
  clock: "clock_item", spyglass: "spyglass", glass_bottle: "potion_bottle_empty",
  beef: "beef_raw", chicken: "chicken_raw", porkchop: "porkchop_raw", mutton: "mutton_raw",
  rabbit: "rabbit_raw", cod: "fish_raw", salmon: "fish_salmon_raw", melon_slice: "melon",
  cooked_cod: "fish_cooked", cooked_salmon: "fish_salmon_cooked", totem_of_undying: "totem",
  experience_bottle: "experience_bottle", ender_eye: "ender_eye", snowball: "snowball",
  rpg_menu: "rpg/menu",
};

// 제작자 도구에서 지정한 아이콘 (typeId -> 텍스처 경로)
let overrides = null;
export function iconOverrides() {
  if (!overrides) overrides = getJSON(world, "rpg:icons", {});
  return overrides;
}
export function setIconOverride(id, path) {
  const o = iconOverrides();
  if (path) o[id] = path;
  else delete o[id];
  setJSON(world, "rpg:icons", o);
}

const CAT_ICON = { weapon: "class", armor: "armor", food: "food", material: "material", misc: "misc" };

export function iconOf(id) {
  const ov = iconOverrides()[id];
  if (ov) return ov;
  if (id === "rpg:menu") return "textures/items/rpg/menu";
  if (id === "rpg:quest_tool") return "textures/items/rpg/quest_tool";
  if (id === "rpg:skill") return ICON("skill");
  const [ns, name] = id.includes(":") ? id.split(":") : ["minecraft", id];
  // 다른 애드온 아이템: 대부분 textures/items/<이름> 에 아이콘이 있다 (아니면 제작자 도구 > 데이터 > 아이콘 지정)
  if (ns !== "minecraft") return `textures/items/${name}`;
  const s = name;
  const tries = [ALIAS[s], s, s.replace(/^wooden_/, "wood_").replace(/^golden_/, "gold_")];
  const m = s.match(/^cooked_(\w+)$/);
  if (m) tries.push(`${m[1]}_cooked`);
  let path;
  for (const t of tries) if (t && ITEM_TEX[t]) { path = ITEM_TEX[t]; break; }
  path = path ?? BLOCK_TEX[s];
  // 3D 모델용 엔티티 텍스처(방패 등)는 아이콘으로 쓰면 깨져 보임 → 분류 아이콘
  if (!path || path.startsWith("textures/entity")) return ICON(CAT_ICON[category(id)] ?? "misc");
  return path;
}

/** 아이템 이름 RawMessage */
export function itemName(stackOrId) {
  if (typeof stackOrId !== "string") {
    if (stackOrId.nameTag) return { text: stackOrId.nameTag };
    if (!stackOrId.typeId.startsWith("minecraft:") && !stackOrId.localizationKey) return { text: pretty(stackOrId.typeId) };
    const k = stackOrId.localizationKey;
    if (k) return { translate: k };
    return { text: pretty(stackOrId.typeId) };
  }
  try {
    const k = new ItemStack(stackOrId, 1).localizationKey;
    if (k) return { translate: k };
  } catch {}
  return { text: pretty(stackOrId) };
}

export function entityName(typeId) {
  if (typeId === "*") return { text: "아무 몬스터" };
  return { translate: `entity.${short(typeId)}.name` };
}

export function pretty(id) {
  return short(id).replace(/_/g, " ");
}

export const STARS = (n) => "★".repeat(n);

export const ENCH_KO = {
  sharpness: "날카로움", smite: "강타", bane_of_arthropods: "살충", knockback: "밀치기",
  fire_aspect: "발화", looting: "약탈", efficiency: "효율", silk_touch: "섬세한 손길",
  unbreaking: "내구성", fortune: "행운", power: "힘", punch: "밀어내기", flame: "화염",
  infinity: "무한", protection: "보호", fire_protection: "화염으로부터 보호",
  feather_falling: "가벼운 착지", blast_protection: "폭발로부터 보호",
  projectile_protection: "발사체로부터 보호", thorns: "가시", respiration: "호흡",
  depth_strider: "물갈퀴", aqua_affinity: "친수성", mending: "수선", frost_walker: "차가운 걸음",
  soul_speed: "영혼 가속", swift_sneak: "신속한 잠행", loyalty: "충성", impaling: "찌르기",
  riptide: "급류", channeling: "집전", multishot: "다중 발사", quick_charge: "빠른 장전",
  piercing: "관통", density: "밀도", breach: "파괴", wind_burst: "돌풍", lure: "미끼",
  luck_of_the_sea: "바다의 행운", curse_of_binding: "귀속 저주", curse_of_vanishing: "소실 저주",
};
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
export const roman = (n) => ROMAN[n] ?? String(n);

// ───── 인벤토리 유틸 ─────
export function inv(player) {
  return player.getComponent("minecraft:inventory").container;
}

export function countItem(player, id) {
  const c = inv(player);
  let n = 0;
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (it?.typeId === id) n += it.amount;
  }
  return n;
}

export function removeItem(player, id, count) {
  const c = inv(player);
  for (let i = 0; i < c.size && count > 0; i++) {
    const it = c.getItem(i);
    if (it?.typeId !== id) continue;
    if (it.amount > count) {
      it.amount -= count;
      c.setItem(i, it);
      count = 0;
    } else {
      count -= it.amount;
      c.setItem(i, undefined);
    }
  }
  return count === 0;
}

/** 아이템 지급 (꽉 차면 발밑에 드롭) */
export function giveItem(player, id, count) {
  const c = inv(player);
  let left = count;
  let max = 64;
  try {
    max = new ItemStack(id, 1).maxAmount;
  } catch {
    return false;
  }
  while (left > 0) {
    const n = Math.min(max, left);
    left -= n;
    const rest = c.addItem(new ItemStack(id, n));
    if (rest) player.dimension.spawnItem(rest, player.location);
  }
  return true;
}
