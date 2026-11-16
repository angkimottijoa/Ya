// 상점 목록 (월드 저장, 제작자 도구로 편집)
import { world } from "@minecraft/server";
import { getJSON, setJSON } from "./db.js";

const DEFAULT_SHOP = [
  { id: "minecraft:bread", n: 4, price: 12 },
  { id: "minecraft:cooked_beef", n: 4, price: 20 },
  { id: "minecraft:golden_apple", n: 1, price: 150 },
  { id: "minecraft:arrow", n: 16, price: 24 },
  { id: "minecraft:torch", n: 16, price: 10 },
  { id: "minecraft:ender_pearl", n: 1, price: 60 },
  { id: "minecraft:iron_sword", n: 1, price: 180 },
  { id: "minecraft:iron_chestplate", n: 1, price: 320 },
  { id: "minecraft:bow", n: 1, price: 140 },
  { id: "minecraft:shield", n: 1, price: 90 },
  { id: "minecraft:diamond", n: 1, price: 400 },
  { id: "minecraft:experience_bottle", n: 4, price: 80 },
];

let shop = null;
export function shopList() {
  if (!shop) shop = getJSON(world, "rpg:shop", DEFAULT_SHOP);
  return shop;
}
export function saveShop() {
  setJSON(world, "rpg:shop", shop);
}
export const sellPrice = (e) => Math.max(1, Math.floor((e.price / e.n) * 0.3));
