// ═══════════════════════════════════════════════════════════════════════
// 백호의 도끼 (V4.8~) — 직업과 상관없이 쓰는 스킬 무기, 흑백 파티클
//   ① 클릭  백호 · 할퀴기 : ↘ ↙ 엇갈려 X자로 할퀸 뒤, 앞으로 덮치며 거대한 가로 할퀴기 (발톱 줄은 옆에서 보면 ")")
// 파티클: gen_baekho.py (bh_claw 발톱 자국 · bh_cluster 흑백 먼지 · bh_shock 충격파)
// ═══════════════════════════════════════════════════════════════════════
import { system, MolangVariableMap, EntityDamageCause } from "@minecraft/server";
import * as M from "./ms.js";

export const AXE_ID = "rpg:baekho_axe";
const later = (t, fn) => system.runTimeout(() => { try { fn(); } catch {} }, Math.max(1, Math.round(t)));
const up = (l, y) => ({ x: l.x, y: l.y + y, z: l.z });
const yawOf = (p) => p.getRotation().y;
const rad = (d) => (d * Math.PI) / 180;
const fwdOf = (yaw) => ({ x: -Math.sin(rad(yaw)), y: 0, z: Math.cos(rad(yaw)) });
const rightOf = (yaw) => ({ x: -Math.cos(rad(yaw)), y: 0, z: -Math.sin(rad(yaw)) });
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });

const DEF = { n: 10, r: 1, spd: 1, tone: 0, size: 1, thick: 0.5, h: 0, dur: 0.1, dots: 4, life: 0.5 };
function pt(dim, name, loc, o = {}) {
  try {
    const m = new MolangVariableMap();
    for (const k of Object.keys(DEF)) m.setFloat(`variable.${k}`, o[k] ?? DEF[k]);
    for (const k of ["u", "v", "w"]) m.setVector3(`variable.${k}`, o[k] ?? { x: 0, y: 1, z: 0 });
    dim.spawnParticle(`rpg:${name}`, loc, m);
  } catch {}
}
const dust = (dim, loc, o = {}) => pt(dim, "bh_cluster", loc, { n: 12, r: 0.3, spd: 2.5, tone: 0.3, ...o });

/** 같은 대상은 6틱에 한 번만 */
function hitter(ctx) {
  const last = new Map();
  return (e, mul) => {
    const t = system.currentTick;
    if (!e?.isValid() || t - (last.get(e.id) ?? -99) < 6) return;
    last.set(e.id, t);
    M.skillHit.set(e.id, t);
    try { e.applyDamage(Math.max(1, Math.round(ctx.dmg * mul)), { cause: EntityDamageCause.entityAttack, damagingEntity: ctx.p }); } catch {}
    dust(e.dimension, up(e.location, 1), { n: 16, tone: 0.75 }); // 검은 먼지
    dust(e.dimension, up(e.location, 1.2), { n: 8, tone: 0, spd: 3.5 }); // 흰 파편
  };
}
function shake(dim, at, power, sec) {
  try { for (const pl of dim.getPlayers({ location: at, maxDistance: 20 })) pl.runCommand(`camerashake add @s ${power} ${sec} positional`); } catch {}
}

/**
 * 할퀴기 자국: 플레이어 앞 dist 블록, 시선에 수직인 면 위에 roll(도) 방향으로 긋는다
 *  roll 0 = 오른쪽 → 왼쪽 가로, 90 = 위 → 아래 세로, -55 = ↘ 대각
 */
function claw(dim, p, o = {}) {
  const yw = yawOf(p), f = fwdOf(yw), rt = rightOf(yw), rr = rad(o.roll ?? 0);
  // 획 방향 u: 시작(오른쪽 위) → 끝, v: 발톱이 나란히 놓이는 방향, w: 앞쪽(살짝 볼록)
  const u = { x: -rt.x * Math.cos(rr), y: -Math.sin(rr), z: -rt.z * Math.cos(rr) };
  const v = { x: -rt.x * Math.sin(rr), y: Math.cos(rr), z: -rt.z * Math.sin(rr) };
  const c = add(up(p.location, o.y ?? 1.25), f, o.dist ?? 2.2);
  pt(dim, "bh_claw", c, { u, v, w: f, r: o.r ?? 4, dots: o.dots ?? 4, thick: o.thick ?? 0.62, h: o.h ?? 85, dur: o.dur ?? 0.09, life: o.life ?? 0.55, size: o.size ?? 1, n: o.n ?? 700, tone: 0 });
  return c;
}

// ① 백호 · 할퀴기: ↘ ↙ X자 → 덮치며 거대한 가로 할퀴기
function scratch(ctx) {
  const { p } = ctx, dim = p.dimension, hit = hitter(ctx);
  M.potion(p, "resistance", 3, 1.5);
  const front = (d) => add(p.location, fwdOf(yawOf(p)), d);
  const hits = [
    [1, -58, "slash", 0.8, { r: 4.4, dist: 2.7 }],
    [6, 58, "slash_down", 0.8, { r: 4.4, dist: 2.7 }],
  ];
  for (const [t, roll, anim, mul, o] of hits) later(t, () => {
    M.anim(p, anim);
    const c = claw(dim, p, { roll, ...o });
    dust(dim, c, { n: 18, r: 0.8, spd: 3, tone: 0.8 });
    dust(dim, c, { n: 10, r: 0.6, spd: 4, tone: 0 });
    for (const e of M.around(dim, front(2.2), 3.2)) hit(e, mul);
    M.sound(p, "game.player.attack.strong", 1, 0.7);
    M.sound(p, "mob.ravager.bite", 0.8, 1.3 + t * 0.02);
  });
  // 덮치기: 앞으로 뛰어들며 거대한 가로 할퀴기 5줄
  later(11, () => {
    M.anim(p, "smash");
    M.leap(p, 7, 0.25);
    M.sound(p, "mob.ravager.roar", 0.7, 1.4);
  });
  later(14, () => {
    const yw = yawOf(p), f = fwdOf(yw), rt = rightOf(yw);
    const c = claw(dim, p, { roll: 6, r: 6.6, dots: 5, thick: 0.8, dist: 3.4, size: 1.45, n: 1300, dur: 0.12, life: 0.75, h: 95 });
    claw(dim, p, { roll: 6, r: 7.4, dots: 5, thick: 0.92, dist: 3.8, size: 0.7, n: 420, dur: 0.14, life: 0.5, h: 95 }); // 바깥 잔상
    const g = add(p.location, f, 3.2);
    pt(dim, "bh_shock", up(g, 0.15), { n: 160, spd: 11, size: 1.2 });
    for (let k = 0; k < 8; k++) dust(dim, add(c, rt, (k - 3.5) * 0.8), { n: 10, r: 0.4, spd: 3, tone: k % 2 ? 0.85 : 0.05 });
    for (const e of M.around(dim, g, 4.2)) { hit(e, 1.6); M.toss(p.location, e, 1.6, 3.5); }
    shake(dim, g, 0.45, 0.4);
    M.sound(p, "game.player.attack.strong", 1.3, 0.5);
    M.sound(p, "mob.ravager.bite", 1, 0.9);
  });
}

/** 무기 스킬 표 (청룡의 검과 같은 모양: HUD·쿨다운에 그대로 씀) */
export const WEAPON_SKILLS = {
  [AXE_ID]: [
    { id: "w_bh_1", key: 1, name: "백호 · 할퀴기", short: "할퀴기", lv: 1, mp: 10, cd: 3, pow: 1, run: scratch, desc: "↘ ↙ 로 엇갈려 할퀸 뒤, 앞으로 덮치며 거대한 다섯 줄 할퀴기." },
  ],
};
