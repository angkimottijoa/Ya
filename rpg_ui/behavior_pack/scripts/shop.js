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
  // 스킬 검 (직업과 상관없이 ①②③ 스킬)
  { id: "rpg:cheongryong_sword", n: 1, price: 30000, sell: false },
  { id: "rpg:baekho_axe", n: 1, price: 30000, sell: false },
  { id: "rpg:jujak_bow", n: 1, price: 30000, sell: false },
  { id: "rpg:hyeonmu_shield", n: 1, price: 30000, sell: false },
  { id: "rpg:hundun_orb", n: 1, price: 25000, sell: false },
  { id: "rpg:qiongqi_claws", n: 1, price: 25000, sell: false },
  { id: "rpg:taowu_hammer", n: 1, price: 25000, sell: false },
  { id: "rpg:taotie_maw", n: 1, price: 25000, sell: false },
  // 판매 전용 (사냥 전리품)
  { id: "minecraft:rotten_flesh", n: 1, price: 0, buy: false, sell: true, sp: 2 },
  { id: "minecraft:bone", n: 1, price: 0, buy: false, sell: true, sp: 3 },
  { id: "minecraft:string", n: 1, price: 0, buy: false, sell: true, sp: 3 },
  { id: "minecraft:gunpowder", n: 1, price: 0, buy: false, sell: true, sp: 6 },
];

let shop = null;
export function shopList() {
  if (!shop) shop = getJSON(world, "rpg:shop", DEFAULT_SHOP);
  return shop;
}
export function saveShop() {
  setJSON(world, "rpg:shop", shop);
}
/** 상품 옵션: buy(구매 가능, 기본 true) / sell(판매 가능, 기본 true) / sp(개당 판매가, 없으면 구매가의 30%) */
export const canBuy = (e) => e.buy !== false;
export const canSell = (e) => e.sell !== false;
export const sellPrice = (e) => Math.max(1, e.sp ?? Math.floor((e.price / e.n) * 0.3));
