// 대시 (V2.7): Lv.10 이상, 공중에서 점프 한 번 더 → 앞으로 크게 돌진. 재사용 대기 80초. 설정에서 끄기 가능.
import { system } from "@minecraft/server";
import { data, notify } from "./player.js";
import { fx, anim } from "./skills.js";
import { isSkillLocked } from "./skill_lock.js";

export const DASH_CD = 80; // 초
const air = new Map(); // pid -> { wasJump, used, ticks }
const cdUntil = new Map(); // pid -> tick

/** 남은 대기 시간(초) */
export function dashLeft(p) {
  return Math.max(0, Math.ceil(((cdUntil.get(p.id) ?? 0) - system.currentTick) / 20));
}

export function dashTick(p) {
  const d = data(p);
  if (d.lv < 10 || d.set.dash === false || isSkillLocked(p)) return;
  let onGround = true, jumping = false, sneak = false;
  try {
    onGround = p.isOnGround;
    jumping = p.isJumping;
    sneak = p.isSneaking;
  } catch {
    return;
  }
  const st = air.get(p.id) ?? { wasJump: false, used: false, ticks: 0 };
  if (onGround) {
    st.used = false;
    st.ticks = 0;
  } else st.ticks++;
  // 공중에서 점프 버튼을 '새로' 누른 순간 (쉬프트 중이면 ③ 스킬이므로 제외)
  if (!onGround && jumping && !st.wasJump && !st.used && !sneak && st.ticks > 3) {
    st.used = true;
    const left = dashLeft(p);
    if (left > 0) {
      notify(p, `§7대시 재사용 대기 §f${left}초`);
    } else {
      cdUntil.set(p.id, system.currentTick + DASH_CD * 20);
      const v = p.getViewDirection();
      const len = Math.hypot(v.x, v.z) || 1;
      try { p.applyKnockback(v.x / len, v.z / len, 3.4, 0.5); } catch {}
      try { p.addEffect("resistance", 30, { amplifier: 1, showParticles: false }); } catch {}
      anim(p, "dash");
      const col = [0.75, 0.95, 1];
      fx(p.dimension, "fx_ring", p.location, { radius: 1.6, color: col });
      for (let i = 1; i <= 6; i++) system.runTimeout(() => p.isValid() && fx(p.dimension, "fx_puff", p.location, { color: col, size: 0.8 }), i * 2);
      p.playSound("mob.phantom.flap", { volume: 0.8, pitch: 1.2 });
      p.playSound("item.trident.riptide_2", { volume: 0.5, pitch: 1.4 });
      notify(p, `§e§l대시! §r§7(재사용 ${DASH_CD}초)`);
    }
  }
  st.wasJump = jumping;
  air.set(p.id, st);
}
