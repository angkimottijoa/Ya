// ═══════════════════════════════════════════════════════════════════════
// 스펠북 (V2.9) — 참고 MagicSpells 들을 분석해 배운 "문법"으로 새로 만든 직업 스킬
//
// 분석에서 뽑은 패턴 (docs/MAGICSPELLS_분석.md 참고)
//   ① 색 3~4겹 레이어  : 같은 모양을 반지름 0.3씩 바꿔 계열색으로 겹침 → 두께·입체감
//   ② 이동 + 판정 반복 : Leap 직후 1틱 간격 AreaEffect 6번 → "베며 지나가는" 느낌
//   ③ 예고 → 폭발      : 표식/고리를 먼저 그리고 DELAY 뒤 큰 효과 (멸망의 마도서, 총칼)
//   ④ 위→아래 계단     : 높이를 낮추며 고리를 순서대로 (하늘에서 내려오는 느낌)
//   ⑤ 감기며 오르는 기둥: yEquation = k·t (0.0055t-1) → 회오리
//   ⑥ 투사체 + 궤적식  : ParticleProjectile 의 진행 위치마다 작은 식 효과
//   ⑦ 마무리 띄우기    : 마지막 타격에 Forcetoss 수직 + 큰 구 확산
// ═══════════════════════════════════════════════════════════════════════
import * as M from "./ms.js";
import { nearbyMembers } from "./party.js";

const { S, C, L, K } = M;
const H = (p) => ({ ...p.location });
const up = (l, y) => ({ x: l.x, y: l.y + y, z: l.z });

/** 타격 표시: 작은 별 + 먼지 */
function hitFx(ctx, e) {
  const l = up(e.location, 1);
  M.star(ctx.p.dimension, l, { spikes: 6, h: 0.7, inner: 0.1, n: 36, color: ctx.pal[0], life: 0.4 });
}
function painFx(ctx, e, mul) {
  M.pain(ctx, e, mul);
  hitFx(ctx, e);
}
function healAll(ctx, amt, r = 8) {
  const list = [ctx.p, ...nearbyMembers(ctx.p, r)];
  for (const t of list) {
    try {
      const hp = t.getComponent("minecraft:health");
      hp.setCurrentValue(Math.min(hp.effectiveMax, hp.currentValue + amt));
      M.helix(t.dimension, t.location, { strands: 2, r: 0.7, h: 2.2, twist: 540, n: 70, dur: 0.4, color: ctx.pal[1] ?? ctx.pal[0], life: 0.8 });
    } catch {}
  }
  return list;
}
/** 착지할 때까지 기다렸다가 fn (최대 maxT 틱) */
function onLand(ctx, fn, maxT = 40) {
  let t = 0;
  const p = ctx.p;
  const loop = () => {
    t++;
    let g = false;
    try { g = p.isValid() && p.isOnGround; } catch {}
    if (!p.isValid()) return;
    if ((t > 5 && g) || t > maxT) return fn();
    if (t % 2 === 0) M.ball(p.dimension, up(p.location, 0.5), { r: 0.4, n: 14, color: ctx.pal[t % ctx.pal.length], life: 0.4 });
    M.later(1, loop);
  };
  M.later(1, loop);
}

// ═════════ 스펠 정의 ═════════
// 각 스펠: (ctx, o) → ctx = { p, dim, s, dmg, pal, yaw, tier }, o = 스킬별 조정값(scale 등)
export const SPELLS = {
  // ───── 근접: 검 / 도끼 ─────
  crescent: {
    name: "초승달 회전베기 (주변 3겹 타원)",
    run(ctx, o) {
      const { p, dim, pal } = ctx, r = 3.4 * (o.scale ?? 1);
      M.anim(p, "spin");
      M.sound(p, "item.trident.riptide_1", 1.4);
      // 총칼 RCaera2: x = 3.8sin, z = 3.4cos (y=1) 를 3겹
      M.layered(pal.slice(0, 3), (c, i) => M.eq(dim, H(p), { x: S(r + i * 0.3, 360), z: C(r * 0.9, 360), y: K(1), n: 110, color: c, dur: 0.15, life: 0.6 }));
      M.area(ctx, H(p), r + 0.5, (e) => painFx(ctx, e, 1));
    },
  },
  warcry: {
    name: "함성 (공격력 버프 + 붉은 나선)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "raise");
      M.sound(p, "mob.ravager.roar", 0.9, 0.6);
      M.layered(pal.slice(0, 3), (c, i) => M.helix(dim, H(p), { strands: 3, r: 0.9 + i * 0.25, h: 2.6, twist: 540 + i * 120, n: 120, dur: 0.6, color: c, life: 0.9 }));
      M.ball(dim, up(H(p), 1), { r: 0.4, grow: 7, n: 120, color: pal[0], life: 0.45 });
      ctx.data.buffAtk = ctx.s.pow;
      ctx.data.buffUntil = ctx.tick + 200;
      if (o.party) for (const m of nearbyMembers(p, 8)) M.potion(m, "strength", 1, 10);
    },
  },
  leap_slam: {
    name: "도약 강타 (착지 나선 + 구 확산)",
    run(ctx, o) {
      const { p, dim, pal } = ctx, r = 4 * (o.scale ?? 1);
      M.anim(p, "raise");
      M.invuln(p, 2);
      M.leap(p, 8, 9);
      M.sound(p, "mob.enderdragon.flap", 1.2);
      onLand(ctx, () => {
        M.anim(p, "smash");
        const c = H(p);
        M.sound(p, "random.explode", 0.7, 0.8);
        M.layered(pal.slice(0, 3), (col, i) => M.spiral(dim, c, r + i * 0.4, 2, col, { start: i * 120, dur: 0.3 }));
        M.ball(dim, up(c, 0.5), { r: 0.6, grow: r * 2.5, fy: 0.4, n: 160, color: pal[1] ?? pal[0], life: 0.5 });
        if (o.holy) M.coil(dim, c, 1.2, 6, 3, pal[0], { n: 160 });
        M.area(ctx, c, r, (e) => { painFx(ctx, e, 1); M.toss(c, e, 4, 8 * (o.scale ?? 1)); });
      });
    },
  },
  dash_slash: {
    name: "돌진 연속베기 (도약하며 6연속 타원 베기)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "dash");
      M.sound(p, "mob.wither.shoot", 1.6, 0.5);
      M.leap(p, 16 * (o.scale ?? 1), 0.5);
      // 총칼 SLCMulti1: 리프 + 1틱 간격 AreaEffect 6번, 각각 3겹 기운 타원
      const steps = [];
      for (let i = 0; i < 6; i++) {
        steps.push(() => {
          const yaw = p.getRotation().y;
          M.layered(pal.slice(0, 3), (c, k) => M.eq(dim, H(p), { x: S(3.2 + k * 0.3, 183), y: C(2, 183, 0, 0, 0, 1), z: C((i % 2 ? -2.4 : 2.4), 183), yaw, n: 60, color: c, life: 0.45 }));
          M.area(ctx, H(p), 3.5, (e) => M.pain(ctx, e, 0.3));
          if (i === 0) M.anim(p, "slash");
        });
        steps.push("DELAY 1");
      }
      M.multi(ctx, steps);
    },
  },
  iaido: {
    name: "일섬 (빛보다 빠른 관통 + 수직 베기)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "thrust");
      M.sound(p, "item.trident.throw", 1.6);
      const yaw = p.getRotation().y;
      M.slashV(dim, H(p), yaw, 2.2, pal[0], { span: 240 });
      M.slashV(dim, H(p), yaw, 2.5, pal[1] ?? pal[0], { span: 240, life: 0.7 });
      M.proj(ctx, {
        speed: 4, dist: 14 * (o.scale ?? 1), pierce: true, hitR: 1.4,
        trail: (pos, i) => i % 1 === 0 && M.ball(dim, pos, { r: 0.15, n: 10, color: pal[i % 2], life: 0.5 }),
        onHit: (e) => { painFx(ctx, e, 1); M.mark(dim, e, pal[0]); },
      });
    },
  },
  moon_wave: {
    name: "초승달 검기 (지면을 타고 나가는 3겹 호)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "slash");
      M.sound(p, "mob.blaze.hit", 2, 0.8);
      const yaw = p.getRotation().y;
      // 클라우 RCPP1: 1.8cos / 1.8~2.2sin 의 호를 진행하며 찍음
      M.proj(ctx, {
        speed: 1.6, dist: 16 * (o.scale ?? 1), pierce: true, hug: true, hugH: 1, hitR: 1.8,
        trail: (pos, i) => {
          if (i % 2) return;
          M.layered(pal.slice(0, 3), (c, k) => M.eq(dim, pos, { x: S(1.8 + k * 0.2, 167, -83), z: C(1.8, 167, -83, 0, 0, -1.2), y: K(0), yaw, n: 30, color: c, life: 0.35 }));
        },
        onHit: (e) => painFx(ctx, e, 1),
      });
    },
  },
  judgement: {
    name: "심판 (그림자 이동 → 표식 연타 → 내리꽂기)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      const t = M.looked(p, 13);
      if (!t) {
        M.anim(p, "slash_down");
        M.slashV(dim, H(p), p.getRotation().y, 2.4, pal[0]);
        M.area(ctx, M.lookPoint(p, 4), 2.5, (e) => painFx(ctx, e, 1.5));
        return;
      }
      // 총칼 RCMulti1: 그림자 이동 + 기절 + 머리 위 표식 반복 + 마지막 강타
      M.shadowstep(p, t);
      M.stun(t, 2);
      M.sound(p, "mob.endermen.portal", 0.8);
      const n = o.hits ?? 5;
      const steps = [];
      for (let i = 0; i < n; i++) {
        steps.push((e) => { M.mark(dim, e, pal[i % pal.length], 2.6 + i * 0.15); M.pain(ctx, e, 0.25); M.anim(p, i % 2 ? "slash" : "thrust"); });
        steps.push("DELAY 4");
      }
      steps.push((e) => {
        M.anim(p, "slash_down");
        painFx(ctx, e, o.finish ?? 2);
        M.toss(H(p), e, 3, -8);
        M.slashV(dim, H(p), p.getRotation().y, 2.6, pal[0], { span: 260 });
        M.layered(pal.slice(0, 2), (c, k) => M.ball(dim, up(e.location, 1), { r: 0.5, grow: 9 * (k ? -0.1 : 1) + 1, n: 120, color: c, life: 0.5 }));
        M.sound(p, "random.anvil_land", 0.6);
      });
      M.multiOn(ctx, t, steps);
    },
  },
  thousand_blades: {
    name: "천검난무 (하늘에서 검기가 쏟아짐)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "raise");
      const c = M.lookPoint(p, 28);
      M.layered(pal.slice(0, 3), (col, i) => M.ring(dim, up(c, 9 - i * 0.4), 4 - i * 0.6, col, { dur: 0.3, life: 1.4 }));
      const n = o.count ?? 12;
      for (let i = 0; i < n; i++) {
        M.later(8 + i * 2, () => {
          const from = { x: c.x + (Math.random() * 6 - 3), y: c.y + 9, z: c.z + (Math.random() * 6 - 3) };
          M.proj(ctx, {
            from, dir: { x: 0, y: -1, z: 0 }, speed: 2.2, dist: 12, hitR: 1.2, stopOnGround: true,
            trail: (pos) => M.eq(dim, pos, { x: K(0), y: L(1.6), z: K(0), n: 10, color: pal[i % pal.length], life: 0.3 }),
            onHit: (e) => painFx(ctx, e, 0.6),
            onEnd: (pos) => { M.ring(dim, pos, 1, pal[0], { n: 30, life: 0.5 }); M.area(ctx, pos, 1.6, (e) => M.pain(ctx, e, 0.3)); },
          });
        });
      }
    },
  },
  blade_tempest: {
    name: "검풍난무 (돌진 3연 + 회오리 + 띄우기)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      // 총칼 SLCMultiM 재구성: [돌진+6베기]×3 → 위로 도약 + 큰 회오리 → 착지 폭발
      const wave = (dir) => {
        const st = [() => { M.leap(p, 10, 0.5); M.anim(p, "dash"); }];
        for (let i = 0; i < 6; i++) {
          st.push(() => {
            const yaw = p.getRotation().y;
            M.layered(pal.slice(0, 3), (c, k) => M.eq(dim, H(p), { x: S(3.2 + k * 0.3, 183), y: C(2 * dir, 183, 0, 0, 0, 1), z: C(2.4 * (i % 2 ? -1 : 1), 183), yaw, n: 55, color: c, life: 0.45 }));
            M.area(ctx, H(p), 4, (e) => M.pain(ctx, e, 0.18));
          });
          st.push("DELAY 1");
        }
        return st;
      };
      M.multi(ctx, [
        ...wave(1), "DELAY 1", ...wave(-1), "DELAY 1", ...wave(1),
        () => {
          M.anim(p, "spin");
          M.leap(p, 0, 8);
          M.invuln(p, 2);
          M.layered(pal.slice(0, 3), (c, k) => M.coil(dim, H(p), 5.8 - k * 0.3, 2.2, 3, c, { dur: 0.6, life: 0.9 }));
          M.area(ctx, H(p), 6, (e) => { painFx(ctx, e, 1.2); M.toss(H(p), e, -2, 9); });
          M.sound(p, "mob.enderdragon.flap", 0.6);
        },
        "DELAY 9",
        () => {
          M.anim(p, "smash");
          M.ball(dim, up(H(p), 1), { r: 0.5, grow: 14, n: 220, color: pal[0], life: 0.5 });
          M.ball(dim, up(H(p), 1), { r: 0.5, grow: 10, n: 160, color: pal[1] ?? pal[0], life: 0.5 });
          M.area(ctx, H(p), 8, (e) => painFx(ctx, e, 1));
          M.sound(p, "random.explode", 0.6);
        },
      ]);
    },
  },
  splitter: {
    name: "대지 가르기 (거대한 수직 호 + 앞으로 터지는 파편)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "slash_down");
      const yaw = p.getRotation().y;
      // 크티아스 SLCpain1: x=4.8sin(0.0075t)-2, y=-6.8cos(0.0075t)+1 → 큰 수직 호 3겹
      M.layered(pal.slice(0, 3), (c, k) => M.slashV(dim, H(p), yaw, 3.2 + k * 0.3, c, { span: 180, dur: 0.18, life: 0.7 }));
      const f = M.flat(p);
      for (let i = 1; i <= 5; i++) {
        M.later(4 + i * 2, () => {
          const c = { x: p.location.x + f.x * i * 1.6, y: p.location.y, z: p.location.z + f.z * i * 1.6 };
          M.ball(dim, c, { r: 0.4, grow: 5, fy: 1.6, oy: 0.3, n: 50, color: pal[i % pal.length], life: 0.5 });
          M.area(ctx, c, 1.8, (e) => { M.pain(ctx, e, 0.5); M.toss(c, e, 1, 6); });
          if (i === 1) M.sound(p, "random.explode", 1.2, 0.5);
        });
      }
    },
  },
  slaughter: {
    name: "도살 (3색 구가 퍼지는 대폭발 + 약화)",
    run(ctx, o) {
      const { p, dim, pal } = ctx, r = 7 * (o.scale ?? 1);
      M.anim(p, "smash");
      M.sound(p, "mob.irongolem.death", 0.5);
      // 도살자 SRCaera1: ModifiedEffect Sphere radius = t·1 를 3색으로 + 바닥 나선 + 회오리
      M.layered(pal.slice(0, 3), (c, k) => M.ball(dim, up(H(p), 1), { r: 0.5, grow: r * (1.6 - k * 0.2), n: 200, color: c, life: 0.6 }));
      M.layered(pal.slice(0, 3), (c, k) => M.spiral(dim, H(p), 5.3 - k * 0.3, 2, c, { start: k * 120, dur: 0.5 }));
      M.layered(pal.slice(0, 3), (c, k) => M.coil(dim, H(p), 5.6 - k * 0.3, 2.4, 2, c, { dur: 0.6 }));
      M.area(ctx, H(p), r, (e) => { painFx(ctx, e, 1); M.potion(e, "weakness", 2, 5); M.potion(e, "slowness", 2, 5); });
    },
  },
  execution: {
    name: "처형 (대상 둘레 수직 원 + 별 + 강타)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      const t = M.looked(p, 6);
      M.anim(p, "slash_down");
      if (!t) return M.slashV(dim, H(p), p.getRotation().y, 2.6, pal[0]);
      M.stun(t, 1.5);
      const l = t.location, yaw = p.getRotation().y;
      M.layered(pal.slice(0, 3), (c, k) => M.eq(dim, l, { x: K(0), y: C(2 + k * 0.3, 360, 0, 0, 0, 1), z: S(2 + k * 0.3, 360), yaw, n: 90, color: c, dur: 0.25, life: 0.8 }));
      M.later(8, () => {
        M.star(dim, up(l, 1), { spikes: 10, h: 3, inner: 0.3, n: 160, color: pal[0], life: 0.6 });
        painFx(ctx, t, o.mul ?? 4);
        M.sound(p, "random.anvil_land", 0.5);
      });
    },
  },
  lunge: {
    name: "창 돌격 (돌진하며 흡혈 타원 2회)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      // 바이던트 RCMulti1: 리프 + AreaEffect(Drainlife) + 4겹 타원 (x=3.8sin, y=0.7cos+1, z=3.4cos)
      const hit = (dir) => () => {
        M.anim(p, "thrust");
        M.leap(p, 15, 3);
        M.later(3, () => {
          M.layered(pal, (c, k) => M.eq(dim, H(p), { x: S(3.8 + k * 0.3, 360), y: C(0.7, 360, 0, 0, 0, 1), z: C(dir * (3.4 + k * 0.3), 360), n: 80, color: c, dur: 0.2, life: 0.6 }));
          M.area(ctx, H(p), 4, (e) => M.drain(ctx, e, 0.7, 1.5, pal[0]));
          M.sound(p, "mob.blaze.hit", 2, 0.6);
        });
      };
      M.multi(ctx, [hit(1), "DELAY 10", hit(-1)]);
    },
  },

  // ───── 원거리: 활 / 쇠뇌 ─────
  pierce_arrow: {
    name: "관통 화살 (초록·검정 먼지 궤적)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "shoot");
      M.sound(p, "random.bow", 1.3);
      M.later(4, () => M.proj(ctx, {
        speed: 3, dist: 32 * (o.scale ?? 1), pierce: true, hitR: 1.2,
        trail: (pos, i) => M.ball(dim, pos, { r: 0.12, n: 8, color: pal[i % 2 ? 2 : 0], life: 0.6 }),
        onHit: (e) => { painFx(ctx, e, 1); if (o.slow) M.potion(e, "slowness", 2, 3); },
      }));
    },
  },
  fan_volley: {
    name: "부채꼴 연사",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "shoot");
      M.sound(p, "crossbow.shoot");
      const n = o.count ?? 3, spread = o.spread ?? 20;
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : -spread + (2 * spread * i) / (n - 1);
        M.proj(ctx, {
          speed: 2.4, dist: 24, yawOff: off, pierce: true, hitR: 1.1,
          trail: (pos, k) => M.ball(dim, pos, { r: 0.1, n: 6, color: pal[(i + k) % pal.length], life: 0.5 }),
          onHit: (e) => painFx(ctx, e, 1),
        });
      }
    },
  },
  arrow_rain: {
    name: "화살비 (하늘의 고리 → 낙하 화살 3회)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "shoot_up");
      M.sound(p, "random.bow", 0.8);
      const c = M.lookPoint(p, 32);
      M.eq(dim, p.getHeadLocation(), { x: K(0), y: L(8), z: K(0), n: 40, color: pal[0], life: 0.5 });
      M.layered(pal.slice(0, 3), (col, i) => M.ring(dim, up(c, 7), 4 - i * 0.5, col, { dur: 0.3, life: 1.6 }));
      for (let w = 0; w < (o.waves ?? 3); w++) {
        M.later(10 + w * 9, () => {
          for (let k = 0; k < 8; k++) {
            const from = { x: c.x + Math.random() * 8 - 4, y: c.y + 7, z: c.z + Math.random() * 8 - 4 };
            M.eq(dim, from, { x: K(0), y: L(-7), z: K(0), n: 24, color: pal[k % pal.length], life: 0.35, dur: 0.15 });
          }
          M.area(ctx, c, 4, (e) => painFx(ctx, e, 1));
          M.sound(p, "random.bowhit");
        });
      }
    },
  },
  back_shot: {
    name: "후방 도약 사격 (뒤로 뛰며 3갈래)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "shoot");
      M.leap(p, -8, 5);
      M.invuln(p, 0.8);
      M.ball(dim, H(p), { r: 0.6, n: 40, color: pal[1] ?? pal[0], life: 0.5 });
      // 네일링 RC: 뒤로 리프 → 0 / +20 / -20 방향 관통 탄
      M.later(3, () => {
        for (const off of [0, 20, -20]) {
          M.proj(ctx, {
            speed: 2.6, dist: 22, yawOff: off, pierce: true, hitR: 1.1,
            trail: (pos, k) => M.ball(dim, pos, { r: 0.12, n: 8, color: pal[k % 2 ? 2 : 0], life: 0.5 }),
            onHit: (e) => { painFx(ctx, e, 0.8); if (o.slow) M.potion(e, "slowness", 3, 3); },
          });
        }
        M.sound(p, "random.bow", 1.1);
      });
    },
  },
  spiral_snipe: {
    name: "나선 저격 (시선 방향 코르크스크루 + 관통)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "shoot");
      const yaw = p.getRotation().y, len = 30 * (o.scale ?? 1);
      // 총칼 RCPP1: x=0.03t (앞), y/z = -0.8(2.5-0.0015t)cos/sin(-0.028t) → 줄어드는 나선
      M.later(5, () => {
        M.layered(pal.slice(0, 3), (c, k) => M.eq(dim, H(p), { z: L(len), x: C(1.2 - k * 0.3, -2880, k * 120, -1.0), y: S(1.2 - k * 0.3, -2880, k * 120, -1.0, 0, 1.5), yaw, n: 220, color: c, dur: 0.3, life: 0.7 }));
        M.proj(ctx, { speed: 5, dist: len, pierce: true, hug: false, pitchOff: 0, hitR: 1.3, onHit: (e) => { painFx(ctx, e, 1); M.ball(dim, up(e.location, 1), { r: 0.3, grow: 4, n: 60, color: pal[0], life: 0.4 }); } });
        M.sound(p, "mob.enderdragon.growl", 1.6, 0.4);
        M.sound(p, "random.explode", 2, 0.4);
      });
    },
  },
  blast_arrow: {
    name: "폭발 화살 (착탄 지점 구 폭발 + 별)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "shoot");
      M.proj(ctx, {
        speed: 2.4, dist: 30, hitR: 1.2,
        trail: (pos, k) => M.ball(dim, pos, { r: 0.12, n: 8, color: pal[k % pal.length], life: 0.5 }),
        onEnd: (pos) => {
          M.layered(pal.slice(0, 3), (c, k) => M.ball(dim, pos, { r: 0.3, grow: 7 - k * 1.5, n: 120, color: c, life: 0.5 }));
          M.star(dim, pos, { spikes: 8, h: 2.5, n: 120, color: pal[0], life: 0.5 });
          M.area(ctx, pos, 3 * (o.scale ?? 1), (e) => painFx(ctx, e, 1));
          M.sound(p, "random.explode", 1, 0.6);
        },
      });
    },
  },
  sky_arrow: {
    name: "천공의 화살 (하늘에서 빛줄기 + 회오리)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "shoot_up");
      const c = M.lookPoint(p, 36);
      M.layered(pal.slice(0, 3), (col, k) => M.ring(dim, up(c, 12), 2.5 + k * 0.4, col, { dur: 0.3, life: 1.2 }));
      M.later(10, () => {
        M.layered(pal.slice(0, 3), (col, k) => M.eq(dim, up(c, 14), { x: S(0.2 * k, 3600), y: L(-14), z: C(0.2 * k, 3600), n: 140, color: col, dur: 0.15, life: 0.7 }));
        M.later(3, () => {
          M.layered(pal.slice(0, 3), (col, k) => M.coil(dim, c, 3 - k * 0.5, 3, 2, col, { dur: 0.4 }));
          M.star(dim, up(c, 0.5), { spikes: 12, h: 3.5, n: 200, color: pal[0], life: 0.6 });
          M.area(ctx, c, 4, (e) => painFx(ctx, e, 1));
          M.sound(p, "ambient.weather.thunder", 1.4, 0.6);
        });
      });
    },
  },
  arrow_storm: {
    name: "화살 폭풍 (사방 4갈래 → 각 지점 회오리)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "shoot_up");
      M.sound(p, "random.bow", 0.7);
      // 쉐도어 SLC: 0/90/-90/180 지면 투사체 + Helix 9가닥 → 도착 지점 4sin/0.01t 나선
      for (const off of [0, 90, -90, 180]) {
        M.proj(ctx, {
          speed: 1, dist: 10, yawOff: off, hug: true, hugH: 0.2, pierce: true, hitR: 1.5,
          trail: (pos, k) => k % 3 === 0 && M.helix(dim, pos, { strands: 5, r: 0.8, twist: 90, n: 30, color: pal[k % pal.length], life: 0.4 }),
          onHit: (e) => M.pain(ctx, e, 0.4),
          onEnd: (pos) => {
            M.layered(pal.slice(0, 2), (c, k) => M.eq(dim, pos, { x: S(4 - k * 0.4, 1800), y: L(1.8), z: C(4 - k * 0.4, 1800), n: 160, color: c, dur: 0.4, life: 0.7 }));
            M.area(ctx, pos, 5, (e) => painFx(ctx, e, 1));
          },
        });
      }
    },
  },
  beast_roar: {
    name: "포효 (바닥 확산 나선 + 회오리 + 공포)",
    run(ctx, o) {
      const { p, dim, pal } = ctx, r = 6 * (o.scale ?? 1);
      M.anim(p, "raise");
      M.sound(p, "mob.ravager.roar", 0.8);
      // 바이던트 SLC: 바닥 나선 (반지름 증가) + 5·8.3 반지름 회오리 2쌍
      M.layered(pal, (c, k) => M.spiral(dim, H(p), r - k * 0.3, 2, c, { start: k * 90, dur: 0.6 }));
      M.layered(pal.slice(0, 2), (c, k) => { M.coil(dim, H(p), r, 2.5, 2, c, { start: k * 180, dur: 0.8 }); });
      M.area(ctx, H(p), r + 1, (e) => { painFx(ctx, e, 1); M.potion(e, "slowness", 3, 4); M.potion(e, "weakness", 2, 5); M.toss(H(p), e, 6, 3); });
    },
  },

  // ───── 마법 ─────
  fire_storm: {
    name: "혈풍 (발밑 나선 → 가속 탄 5발 → 띄우는 계단 고리)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "cast");
      M.sound(p, "mob.wither.shoot", 1.5, 0.6);
      // 크티아스 RCPPc: 2cos(1+8t)·2sin(0.001(1-2t)) = 바깥으로 감기는 나선 3겹
      M.layered(pal.slice(0, 3), (c, k) => M.spiral(dim, H(p), 2 + k * 0.3, 3, c, { dur: 0.5 }));
      const n = o.count ?? 5;
      for (let i = 0; i < n; i++) {
        M.later(5 + i * 5, () => M.proj(ctx, {
          speed: 1.5 + i * 0.6, dist: 28, hitR: 1.3,
          trail: (pos) => M.ball(dim, pos, { r: 0.15, n: 6, color: pal[i % pal.length], life: 0.4 }),
          onEnd: (pos) => {
            // 계단 고리 (h1~h12: 높이를 올리며 반지름이 커지고 방향이 번갈아)
            M.layered(pal.slice(0, 2), (c, k) => M.helix(dim, pos, { strands: 2, r: 1, flare: 2.4, h: 5.5, twist: 900 * (k ? -1 : 1), n: 150, color: c, dur: 0.4, life: 0.8 }));
            M.area(ctx, pos, 3, (e) => { painFx(ctx, e, 0.6); M.toss(pos, e, 0, 6); if (o.burn) try { e.setOnFire(3, true); } catch {} });
          },
        }));
      }
    },
  },
  frost_nova: {
    name: "서리 폭풍 (얼음 나선 4겹 + 회오리 + 둔화)",
    run(ctx, o) {
      const { p, dim, pal } = ctx, r = 5 * (o.scale ?? 1);
      M.anim(p, "cast");
      M.sound(p, "random.glass", 1.2);
      M.layered(pal, (c, k) => M.spiral(dim, H(p), r + k * 0.25, 2.5, c, { start: k * 90, dur: 0.6 }));
      M.layered(pal.slice(0, 2), (c, k) => M.coil(dim, H(p), r + 0.5, 2.6, 2, c, { start: k * 180, dur: 0.7 }));
      M.later(6, () => M.area(ctx, H(p), r + 1, (e) => { painFx(ctx, e, 1); M.potion(e, "slowness", 3, 4); }));
    },
  },
  blink: {
    name: "순간 이동 (달 표식 + 사라짐)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "cast");
      const v = p.getViewDirection(), h = p.getHeadLocation(), from = H(p);
      const b = p.getBlockFromViewDirection({ maxDistance: 9 });
      const dist = b ? Math.max(0, Math.hypot(b.block.location.x + 0.5 - h.x, b.block.location.y + 0.5 - h.y, b.block.location.z + 0.5 - h.z) - 1.3) : 9;
      const to = { x: from.x + v.x * dist, y: from.y + Math.max(0, v.y * dist), z: from.z + v.z * dist };
      // 클라우 SLCdummy1: (1.4-0.0004t)cos(0.0325t) 앞으로 줄어드는 나선 + 출발/도착 표식
      M.layered(pal.slice(0, 3), (c, k) => M.eq(dim, up(from, 1), { x: L(to.x - from.x), y: C(1.2 + k * 0.2, 1500, 0, -1), z: L(to.z - from.z), n: 120, color: c, life: 0.6 }));
      M.layered(pal.slice(0, 3), (c, k) => M.ring(dim, from, 1.2 + k * 0.2, c, { n: 40, life: 0.7 }));
      try { p.teleport(to, { keepVelocity: false }); } catch {}
      M.later(1, () => { M.star(dim, up(H(p), 1), { spikes: 8, h: 1.4, n: 80, color: pal[2] ?? pal[0], life: 0.5 }); if (o.invis) M.invis(p, 3); });
      M.sound(p, "mob.endermen.portal", 1.3);
    },
  },
  apocalypse: {
    name: "멸망의 마도서 (하늘 고리 4단 강하 → 대폭발)",
    run(ctx, o) {
      const { p, dim, pal } = ctx, r = 6 * (o.scale ?? 1);
      M.anim(p, "raise");
      const c = M.lookPoint(p, 30);
      // 크티아스 SRCaera2: y=12, 9, 6, 3 고리를 5틱 간격으로 + 15m 수직선
      M.eq(dim, up(c, 15), { x: K(0), y: L(-15), z: K(0), n: 120, color: pal[0], dur: 1, life: 1.2 });
      [12, 9, 6, 3].forEach((hgt, i) => M.later(i * 5, () => M.layered(pal.slice(0, 3), (col, k) => M.ring(dim, up(c, hgt), 4 - i * 0.8 + k * 0.3, col, { dur: 0.2, life: 1.5, start: (i % 2 ? 180 : 0) }))));
      M.later(25, () => {
        M.layered(pal.slice(0, 3), (col, k) => M.spiral(dim, c, r - 1 + k * 0.3, 3, col, { dur: 0.35 }));
        M.ball(dim, up(c, 0.5), { r: 0.5, grow: r * 2.2, n: 220, color: pal[0], life: 0.5 });
        M.star(dim, up(c, 0.5), { spikes: 14, h: r * 0.6, n: 220, color: pal[2] ?? pal[0], life: 0.6 });
        M.area(ctx, c, r, (e) => { painFx(ctx, e, 1); M.toss(c, e, 0, 9); if (o.burn) try { e.setOnFire(4, true); } catch {} });
        M.sound(p, "random.explode", 0.7);
      });
    },
  },
  meteor_rain: {
    name: "운석 비 (예고 마법진 → 연속 낙하)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "raise");
      const c = M.lookPoint(p, 32), n = o.count ?? 3;
      M.layered(pal.slice(0, 3), (col, k) => M.ring(dim, c, 4 + k * 0.3, col, { dur: 0.4, life: 2 }));
      for (let i = 0; i < n; i++) {
        M.later(10 + i * 7, () => {
          const pt = { x: c.x + (i ? Math.random() * 6 - 3 : 0), y: c.y, z: c.z + (i ? Math.random() * 6 - 3 : 0) };
          M.proj(ctx, {
            from: { x: pt.x - 4, y: pt.y + 12, z: pt.z - 2 }, dir: { x: 0.31, y: -0.94, z: 0.16 }, speed: 1.8, dist: 14, hitR: 0.5,
            trail: (pos, k) => M.ball(dim, pos, { r: 0.45, n: 20, color: pal[k % pal.length], life: 0.5 }),
            onEnd: (pos) => {
              M.layered(pal.slice(0, 3), (col, k) => M.ball(dim, up(pos, 0.5), { r: 0.4, grow: 8 - k * 2, n: 120, color: col, life: 0.5 }));
              M.ring(dim, pos, 3, pal[0], { n: 60 });
              M.area(ctx, pos, 3, (e) => { painFx(ctx, e, 1); try { e.setOnFire(3, true); } catch {} });
              M.sound(p, "random.explode", 0.9, 0.5);
            },
          });
        });
      }
    },
  },
  thunder: {
    name: "낙뢰 (지그재그 번개 + 별 + 고리)",
    run(ctx, o) {
      const { p, dim, pal } = ctx, n = o.count ?? 1;
      M.anim(p, "raise");
      const c0 = M.lookPoint(p, 32);
      for (let i = 0; i < n; i++) {
        M.later(i * 6, () => {
          const c = i ? { x: c0.x + Math.random() * 6 - 3, y: c0.y, z: c0.z + Math.random() * 6 - 3 } : c0;
          M.layered(pal.slice(0, 2), (col, k) => M.eq(dim, up(c, 13), { x: S(0.5, 2200 + k * 400), y: L(-13), z: C(0.5, 1700 + k * 300), n: 120, color: col, dur: 0.08, life: 0.5 }));
          M.star(dim, up(c, 0.4), { spikes: 10, h: 2.2, n: 120, color: pal[0], life: 0.4 });
          M.layered(pal.slice(0, 2), (col, k) => M.ring(dim, c, 2.5 + k * 0.4, col, { n: 60, life: 0.5 }));
          M.area(ctx, c, 3, (e) => painFx(ctx, e, 1));
          M.sound(p, "ambient.weather.lightning.impact", 1, 0.6);
        });
      }
    },
  },
  storm_spears: {
    name: "번개 창 (세 갈래 고속 관통)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "thrust");
      M.leap(p, -6, 6);
      // 네일링 RC: 뒤로 뛰고 → 0/+20/-20 고속 관통탄 2색
      M.later(2, () => {
        for (const off of [0, 20, -20]) {
          M.proj(ctx, {
            speed: 3, dist: 14, yawOff: off, pierce: true, hitR: 1.2,
            trail: (pos, k) => M.ball(dim, pos, { r: 0.1, n: 10, color: pal[k % 2], life: 0.4 }),
            onHit: (e) => painFx(ctx, e, 0.9),
          });
        }
        M.sound(p, "random.bow", 0.5);
      });
    },
  },
  chain_lightning: {
    name: "연쇄 번개 (적 사이를 튀는 선)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "cast");
      const max = o.count ?? 4;
      const chain = [];
      let cur = M.looked(p, 24);
      while (cur && chain.length < max) {
        chain.push(cur);
        const used = new Set(chain.map((e) => e.id));
        const from = cur;
        cur = M.around(dim, from.location, 7).filter((e) => !used.has(e.id)).sort((a, b) => dist(a, from) - dist(b, from))[0];
      }
      let prev = p.getHeadLocation();
      chain.forEach((e, i) => {
        const a = prev, b = up(e.location, 1);
        prev = b;
        M.later(i * 3, () => {
          M.layered(pal.slice(0, 2), (col) => M.line(dim, a, b, col, { jit: 0.3, life: 0.4 }));
          M.ball(dim, b, { r: 0.6, fy: 1.4, n: 40, color: pal[1] ?? pal[0], life: 0.4 });
          painFx(ctx, e, 1 - i * 0.08);
          M.sound(p, "ambient.weather.lightning.impact", 1.6, 0.3);
        });
      });
      if (!chain.length) M.line(dim, p.getHeadLocation(), M.lookPoint(p, 12), pal[0], { jit: 0.3 });
    },
  },
  tempest: {
    name: "폭풍의 눈 (도는 타원체 2색 + 주변 연속 피해)",
    run(ctx, o) {
      const { p, dim, pal } = ctx, r = 7 * (o.scale ?? 1);
      M.anim(p, "raise");
      M.invuln(p, 1);
      // 네일링 SRCPP3: AnimatedBall 6방향 회전 타원체 (검정 + 파랑) → 12m 1틱 피해
      for (let k = 0; k < 6; k++) {
        M.later(k * 3, () => {
          M.ball(dim, up(H(p), 1), { r: 2 + (k % 3), fx: 1.5, fy: 1, fz: 1.5, n: 160, color: pal[k % 2], life: 0.6 });
          M.ball(dim, up(H(p), 1), { r: 2, fx: k % 2 ? 2 : 1, fy: 2, fz: k % 2 ? 1 : 2, n: 120, color: pal[(k + 1) % 2], life: 0.6 });
        });
      }
      for (let i = 0; i < 10; i++) M.later(4 + i * 3, () => M.area(ctx, H(p), r, (e) => M.pain(ctx, e, 0.18)));
      M.later(34, () => { M.star(dim, up(H(p), 1), { spikes: 14, h: 3, n: 200, color: pal[0], life: 0.6 }); M.area(ctx, H(p), r, (e) => painFx(ctx, e, 1)); });
      M.sound(p, "mob.wither.shoot", 0.6);
    },
  },

  // ───── 신성 ─────
  heal: {
    name: "치유의 빛 (마법진 + 별 + 파티 회복)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "raise");
      M.layered(pal.slice(0, 3), (c, k) => M.ring(dim, H(p), 2.6 - k * 0.5, c, { dur: 0.4, life: 1.4, start: k * 60 }));
      M.star(dim, up(H(p), 0.1), { spikes: 6, h: 2.4, inner: 0.2, n: 90, color: pal[0], life: 1 });
      const amt = (6 + ctx.stat("int") * 0.4 + ctx.stat("vit") * 0.3) * ctx.s.pow * (1 + ctx.tier * 0.15);
      healAll(ctx, amt, o.r ?? 8);
      if (o.regen) for (const m of [p, ...nearbyMembers(p, 8)]) M.potion(m, "regeneration", 2, 6);
      M.sound(p, "random.orb", 0.7);
    },
  },
  smite: {
    name: "신성 강타 (하늘의 빛줄기 + 별 + 기절)",
    run(ctx, o) {
      const { p, dim, pal } = ctx;
      M.anim(p, "slash_down");
      const t = M.looked(p, 8), c = t ? { ...t.location } : M.lookPoint(p, 6);
      M.layered(pal.slice(0, 3), (col, k) => M.eq(dim, up(c, 10), { x: S(0.3 + k * 0.2, 1080), y: L(-10), z: C(0.3 + k * 0.2, 1080), n: 120, color: col, dur: 0.15, life: 0.8 }));
      M.later(4, () => {
        M.star(dim, up(c, 1), { spikes: 8, h: 2, n: 120, color: pal[0], life: 0.6 });
        M.ring(dim, c, 2, pal[1] ?? pal[0], { n: 50 });
        M.area(ctx, c, 2.5, (e) => { painFx(ctx, e, 1); M.stun(e, 1.5); });
        M.sound(p, "beacon.power", 1.6);
      });
    },
  },
  guard: {
    name: "수호 (파티원 둘레 빛의 구 + 피해 감소·흡수)",
    run(ctx, o) {
      const { p, pal } = ctx, lvl = o.lvl ?? 1;
      M.anim(p, "raise");
      for (const t of [p, ...nearbyMembers(p, 8)]) {
        M.potion(t, "resistance", lvl + 1, 8);
        M.potion(t, "absorption", lvl + 1, 8);
        M.layered(pal.slice(0, 2), (c, k) => M.ball(t.dimension, up(t.location, 1), { r: 1.3 + k * 0.2, fy: 1.3, n: 120, color: c, life: 1 }));
        M.helix(t.dimension, t.location, { strands: 4, r: 1, h: 2.2, twist: 360, n: 90, dur: 0.5, color: pal[0], life: 0.8 });
      }
      M.sound(p, "beacon.activate", 1.3);
    },
  },
  sanctuary: {
    name: "성역 (무적 + 별 4회 흡수 파동)",
    run(ctx, o) {
      const { p, dim, pal } = ctx, r = 6 * (o.scale ?? 1);
      M.anim(p, "raise");
      M.invuln(p, 1.5);
      // 블라디 SRCmulti1: 무적 + [AreaEffect(Drainlife) + StarEffect 4겹] × 5 (20틱 간격)
      const steps = [];
      for (let i = 0; i < (o.pulses ?? 4); i++) {
        steps.push(() => {
          M.layered(pal.slice(0, 3), (c, k) => M.star(dim, H(p), { spikes: 10, h: 5 + k * 0.1, inner: 1 + k * 0.1, n: 150, color: c, life: 0.6 }));
          M.layered(pal.slice(0, 3), (c, k) => M.ring(dim, H(p), r - k * 0.2, c, { n: 90, life: 0.8 }));
          M.area(ctx, H(p), r, (e) => M.drain(ctx, e, 0.5, 1, pal[0]));
          healAll(ctx, 2 * ctx.s.pow, r);
          M.sound(p, "beacon.power", 1.4, 0.6);
        });
        steps.push("DELAY 15");
      }
      M.multi(ctx, steps);
    },
  },
};
const dist = (a, b) => Math.hypot(a.location.x - b.location.x, a.location.z - b.location.z);

/** 각 스펠이 어떤 자바 MagicSpells 를 옮겨 와 다시 만든 것인지 (스펠 시험장에 표시) */
export const SOURCES = {
  crescent: "데런(총칼) RCaera2 · 3겹 타원", dash_slash: "데런(총칼) SLCMulti1 · 리프 + 6연속 AreaEffect",
  blade_tempest: "데런(총칼) SLCMultiM 전체", judgement: "데런(총칼) RCMulti1 · 쉐도우스텝 + 표식",
  moon_wave: "클라우 RCPP1 · 초승달 호 투사체", blink: "클라우 SLCdummy1 · 줄어드는 나선",
  fire_storm: "크티아스 RCPPc · 혈풍", apocalypse: "크티아스 SRCaera1/2 · 멸망의 마도서", splitter: "크티아스 SLCpain1 · 큰 수직 호",
  lunge: "바이던트 RCMulti1 · 리프 + 흡혈 타원", beast_roar: "바이던트 SLCaera1 · 확산 나선 + 회오리",
  storm_spears: "네일링 RCmulti · 후방 리프 + 3갈래", tempest: "네일링 SRCPP3 · 회전 타원체",
  slaughter: "도살자 SRCaera1 · ModifiedEffect 구 확산", sanctuary: "블라디 SRCmulti1 · 무적 + 별 흡혈",
  arrow_storm: "쉐도어 SLCmulti · 4방향 Helix", spiral_snipe: "데런(총칼) RCPP1 · 나선 궤적",
  back_shot: "네일링 RC + 레인저 영상", pierce_arrow: "레인저 영상 · 초록·검정 궤적",
};

/** 스펠 실행 */
export function cast(ctx, fx, opt = {}) {
  const sp = SPELLS[fx];
  if (!sp) return false;
  sp.run(ctx, opt);
  return true;
}
export const SPELL_LIST = Object.entries(SPELLS).map(([id, s]) => ({ id, name: s.name }));
