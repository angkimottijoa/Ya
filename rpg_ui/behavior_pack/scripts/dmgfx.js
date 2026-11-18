// 피해 숫자 · 머리 위 체력바 (V12.125)
//   맞으면 깎인 체력만큼 숫자가 떠올랐다 사라짐 (같은 대상을 짧은 사이에 여러 번 치면 한 숫자로 합침)
//   맞은 몹 · 플레이어 머리 위에 체력바 (8초 동안 안 맞으면 원래 이름으로)
import { world, system } from "@minecraft/server";

const NUM_ID = "rpg:dmg_num";
const SKIP = new Set([NUM_ID, "rpg:npc", "minecraft:item", "minecraft:armor_stand", "minecraft:xp_orb"]);
const MAX_NUMS = 40; // 동시에 떠 있는 숫자 최대
const nums = []; // { e, until, target, total, t0 }
const hpSeen = new Map(); // entityId -> 마지막으로 본 체력
const pend = new Map(); // entityId -> { e, prev } (이번 틱에 맞은 대상, 다음 틱에 깎인 양 계산)
const bars = new Map(); // entityId -> { e, until, orig }

const comma = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const hpOf = (e) => { try { const h = e.getComponent("minecraft:health"); return h ? { cur: h.currentValue, max: h.effectiveMax } : null; } catch { return null; } };

function numText(e, total) {
  const big = total >= 1000;
  if (e.typeId === "minecraft:player") return `§c§l-${comma(total)}`;
  return big ? `§6§l${comma(total)}` : `§e§l${comma(total)}`; // 노랑 · 큰 피해는 금색, 굵게 (잘 보이게)
}

function spawnNum(e, total) {
  if (total < 1) return;
  const now = system.currentTick;
  // 같은 대상에게 6틱 안에 또 나오면 그 숫자에 더함 (다단 히트 스킬이 숫자로 도배되지 않게)
  const same = nums.find((n) => n.target === e.id && now - n.t0 < 6 && n.e.isValid());
  if (same) { same.total += total; try { same.e.nameTag = numText(e, same.total); } catch {} return; }
  if (nums.length >= MAX_NUMS) { const old = nums.shift(); try { old.e.remove(); } catch {} }
  let h = 1.9; try { const bb = e.getComponent("minecraft:collision_box"); if (bb?.height) h = bb.height + 0.3; } catch {}
  const at = { x: e.location.x + (Math.random() - 0.5) * 0.9, y: e.location.y + h + Math.random() * 0.3, z: e.location.z + (Math.random() - 0.5) * 0.9 };
  try {
    const n = e.dimension.spawnEntity(NUM_ID, at);
    n.nameTag = numText(e, total);
    nums.push({ e: n, until: now + 18, target: e.id, total, t0: now });
  } catch {}
}

function barText(e) {
  const hp = hpOf(e);
  if (!hp || hp.max <= 0) return null;
  const N = 20, f = Math.max(0, Math.min(N, Math.round((hp.cur / hp.max) * N)));
  const col = hp.cur / hp.max > 0.5 ? "§a" : hp.cur / hp.max > 0.2 ? "§e" : "§c";
  return `§f§l${comma(Math.max(0, hp.cur))}§r§7/${comma(hp.max)}\n${col}${"|".repeat(f)}§8${"|".repeat(N - f)}`; // 숫자 위 · 바 아래
}
function showBar(e, keep = 160) {
  const b = bars.get(e.id) ?? { e, orig: (() => { try { return e.nameTag ?? ""; } catch { return ""; } })() };
  b.until = Math.max(b.until ?? 0, system.currentTick + keep);
  bars.set(e.id, b);
  const t = barText(e);
  if (!t) return;
  try { e.nameTag = e.typeId === "minecraft:player" ? `${b.orig || e.name}\n${t}` : (b.orig ? `${b.orig}\n${t}` : t); } catch {}
}

world.afterEvents.entityHurt.subscribe(({ hurtEntity: e, damage }) => {
  try {
    if (!e?.isValid() || SKIP.has(e.typeId) || damage <= 0) return;
    if (!pend.has(e.id)) {
      const hp = hpOf(e);
      const prev = hpSeen.get(e.id) ?? ((hp?.cur ?? 0) + damage);
      pend.set(e.id, { e, prev });
    }
  } catch {}
});

// 다음 틱: 맞기 전 체력 - 지금 체력 = 실제로 깎인 양 (스탯 · 치명 · 방어까지 반영된 값)
system.runInterval(() => {
  for (const [id, p] of pend) {
    pend.delete(id);
    const e = p.e;
    let cur = 0, alive = false;
    try { alive = e.isValid(); const hp = hpOf(e); cur = hp?.cur ?? 0; } catch {}
    const lost = p.prev - (alive ? cur : 0);
    if (alive) hpSeen.set(id, cur); else hpSeen.delete(id);
    if (lost >= 1) spawnNum(e, lost);
    if (alive) showBar(e);
  }
  const now = system.currentTick;
  // 숫자: 위로 떠오르다 사라짐
  for (let i = nums.length - 1; i >= 0; i--) {
    const n = nums[i];
    if (!n.e.isValid() || now >= n.until) { try { n.e.remove(); } catch {} nums.splice(i, 1); continue; }
    try { const l = n.e.location; n.e.teleport({ x: l.x, y: l.y + 0.06, z: l.z }); } catch {}
  }
}, 1);

// 체력바: 0.5초마다 새로 그림 (회복 반영), 8초 동안 안 맞으면 원래 이름으로
system.runInterval(() => {
  const now = system.currentTick;
  for (const [id, b] of bars) {
    const e = b.e;
    if (!e.isValid()) { bars.delete(id); hpSeen.delete(id); continue; }
    if (now >= b.until) {
      try { e.nameTag = e.typeId === "minecraft:player" ? (b.orig || e.name) : b.orig; } catch {}
      bars.delete(id); hpSeen.delete(id); continue;
    }
    const t = barText(e);
    if (t) try { e.nameTag = e.typeId === "minecraft:player" ? `${b.orig || e.name}\n${t}` : (b.orig ? `${b.orig}\n${t}` : t); } catch {}
    const hp = hpOf(e); if (hp) hpSeen.set(id, hp.cur);
  }
}, 10);

// 가까이 가면 체력바 (V12.127): 플레이어 둘레 10칸 안의 몹 · 다른 플레이어 (한 사람당 최대 12)
const NEAR_EXCLUDE = { excludeTypes: [NUM_ID, "rpg:npc", "minecraft:item", "minecraft:xp_orb", "minecraft:armor_stand"], excludeFamilies: ["inanimate"] };
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    let list = [];
    try { list = p.dimension.getEntities({ location: p.location, maxDistance: 10, closest: 13, ...NEAR_EXCLUDE }); } catch { continue; }
    for (const e of list) { if (e.id === p.id || !hpOf(e)) continue; showBar(e, 25); }
  }
}, 10);

// 월드를 다시 열었을 때 남은 숫자 엔티티 정리
system.runTimeout(() => {
  for (const d of ["overworld", "nether", "the_end"]) try { for (const e of world.getDimension(d).getEntities({ type: NUM_ID })) e.remove(); } catch {}
}, 40);
