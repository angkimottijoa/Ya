// Move tables. Every move is data: an animation, a lock-out, and a list of timed hits.
//   h(tick, damageMultiplier, range, arcDegrees, staggerTicks, knockback, lift, extra)
const h = (t, mult, range, arc, stun = 0, kb = 0.3, lift = 0, extra = {}) =>
  ({ t, mult, range, arc, stun, kb, lift, ...extra });
const m = (anim, dur, hits, extra = {}) => ({ anim, dur, hits, ...extra });

export const CLASSES = {
  sword: {
    gain: 9, cost: 100, guard: true,
    combo: [
      m("sword.c1", 9, [h(4, 1.0, 3.2, 110, 4)]),
      m("sword.c2", 9, [h(4, 1.1, 3.2, 110, 4)]),
      m("sword.c3", 13, [h(6, 1.5, 3.4, 70, 10, 0.8)], { lunge: { t: 2, f: 0.5 }, heavy: true }),
    ],
    dash: m("sword.dash", 14, [h(5, 1.6, 3.8, 50, 10, 0.9)], { lunge: { t: 1, f: 1.1 } }),
    air: m("sword.air", 13, [h(4, 1.7, 3.2, 90, 12, 0.4)], { heavy: true }),
    skill: m("sword.skill", 24, [h(6, 1.6, 3.8, 360, 12, 0.9), h(15, 2.2, 4.0, 360, 20, 1.2, 0.35)],
      { iframes: 6, heavy: true }),
  },
  axe: {
    gain: 13, cost: 100, guard: true,
    combo: [
      m("axe.c1", 13, [h(6, 1.15, 3.0, 60, 10, 0.5)], { heavy: true }),
      m("axe.c2", 15, [h(7, 1.45, 3.2, 120, 14, 0.9)], { heavy: true }),
    ],
    dash: m("axe.dash", 16, [h(7, 1.7, 3.4, 60, 14, 0.8)], { lunge: { t: 1, f: 1.0, up: 0.25 }, heavy: true }),
    air: m("axe.air", 15, [h(5, 1.9, 3.2, 90, 16, 0.5)], { heavy: true }),
    skill: m("axe.skill", 26, [h(13, 2.6, 4.0, 360, 30, 0.8, 0.45, { quake: true })],
      { lunge: { t: 2, f: 0.9, up: 0.55 }, iframes: 10, heavy: true }),
  },
  longsword: {
    gain: 10, cost: 100, guard: true,
    combo: [
      m("longsword.c1", 10, [h(4, 1.0, 3.6, 120, 5)]),
      m("longsword.c2", 10, [h(4, 1.1, 3.6, 120, 5)]),
      m("longsword.c3", 12, [h(5, 1.25, 4.2, 35, 8, 0.7)], { lunge: { t: 2, f: 0.6 } }),
      m("longsword.c4", 15, [h(7, 1.6, 3.8, 70, 14, 0.9)], { heavy: true }),
    ],
    dash: m("longsword.dash", 14, [h(5, 1.5, 3.8, 90, 10, 0.5, 0.45)], { lunge: { t: 1, f: 1.0 } }),
    air: m("longsword.air", 13, [h(4, 1.7, 3.6, 90, 12, 0.4)], { heavy: true }),
    skill: m("longsword.skill", 24, [h(5, 1.5, 3.8, 120, 16, 0.2, 0.7), h(14, 2.0, 4.0, 100, 20, 1.0)],
      { lunge: { t: 3, f: 0.7 }, iframes: 5, heavy: true }),
  },
  greatsword: {
    gain: 16, cost: 100, guard: true,
    combo: [
      m("greatsword.c1", 16, [h(8, 1.2, 4.0, 150, 12, 0.9)], { heavy: true }),
      m("greatsword.c2", 19, [h(10, 1.6, 4.0, 70, 16, 1.0)], { heavy: true }),
    ],
    dash: m("greatsword.dash", 18, [h(8, 1.8, 4.2, 100, 16, 0.6, 0.5)], { lunge: { t: 2, f: 1.0 }, heavy: true }),
    air: m("greatsword.air", 18, [h(6, 2.0, 4.0, 100, 20, 0.6)], { heavy: true }),
    skill: m("greatsword.skill", 34,
      [h(7, 1.4, 4.4, 360, 10, 0.5), h(13, 1.4, 4.4, 360, 10, 0.5), h(22, 2.8, 4.5, 360, 30, 1.2, 0.4, { quake: true })],
      { iframes: 8, heavy: true }),
  },
  spear: {
    gain: 9, cost: 100, guard: true,
    combo: [
      m("spear.c1", 10, [h(4, 1.0, 4.6, 30, 5, 0.5)]),
      m("spear.c2", 10, [h(4, 1.1, 4.6, 30, 5, 0.5)]),
      m("spear.c3", 14, [h(6, 1.3, 4.2, 150, 10, 0.9)], { heavy: true }),
    ],
    dash: m("spear.dash", 14, [h(4, 1.7, 5.0, 30, 12, 1.1)], { lunge: { t: 1, f: 1.3 } }),
    air: m("spear.air", 13, [h(4, 1.7, 4.0, 60, 12, 0.3)], { heavy: true }),
    skill: m("spear.skill", 22,
      [h(4, 1.1, 4.6, 60, 8, 0.1), h(6, 1.1, 4.6, 60, 8, 0.1), h(8, 1.1, 4.6, 60, 8, 0.1), h(11, 1.8, 5.0, 60, 20, 1.4)],
      { lunge: { t: 3, f: 2.4 }, iframes: 9, heavy: true }),
  },
  dagger: {
    gain: 6, cost: 80, guard: true,
    combo: [
      m("dagger.c1", 6, [h(2, 1.0, 2.6, 90, 3, 0.1)]),
      m("dagger.c2", 6, [h(2, 1.0, 2.6, 90, 3, 0.1)]),
      m("dagger.c3", 6, [h(2, 1.1, 2.9, 40, 3, 0.2)]),
      m("dagger.c4", 10, [h(4, 1.5, 2.8, 90, 8, 0.6)], { heavy: true }),
    ],
    dash: m("dagger.dash", 10, [h(3, 1.6, 3.0, 120, 8, 0.4)], { lunge: { t: 1, f: 1.3 } }),
    air: m("dagger.air", 10, [h(3, 1.6, 2.6, 90, 8, 0.2)]),
    skill: m("dagger.skill", 22,
      [2, 4, 6, 8, 10, 12].map(t => h(t, 0.7, 3.0, 70, 6, 0.02)).concat([h(16, 1.8, 3.2, 50, 20, 1.1)]),
      { iframes: 6 }),
  },
  saber: {
    gain: 8, cost: 100, guard: true,
    combo: [
      m("saber.c1", 8, [h(3, 1.0, 3.4, 110, 4)]),
      m("saber.c2", 8, [h(3, 1.05, 3.4, 110, 4)]),
      m("saber.c3", 12, [h(5, 1.5, 3.6, 140, 10, 0.7)], { heavy: true }),
    ],
    dash: m("saber.dash", 12, [h(4, 1.6, 3.6, 120, 10, 0.5)], { lunge: { t: 1, f: 1.4 } }),
    air: m("saber.air", 12, [h(4, 1.7, 3.4, 90, 12, 0.3)], { heavy: true }),
    // Dash through enemies, marking them; the marked ones are all cut a moment later.
    skill: m("saber.skill", 22,
      [h(4, 0.4, 2.8, 360, 16, 0, 0, { mark: true }), h(5, 0.4, 2.8, 360, 16, 0, 0, { mark: true }),
       h(6, 0.4, 2.8, 360, 16, 0, 0, { mark: true }), h(7, 0.4, 2.8, 360, 16, 0, 0, { mark: true }),
       h(15, 2.4, 0, 0, 20, 0.4, 0.2, { detonate: true })],
      { lunge: { t: 4, f: 3.0 }, iframes: 12, heavy: true }),
  },
  mace: {
    gain: 14, cost: 100, guard: true,
    combo: [
      m("axe.c1", 14, [h(6, 1.2, 3.0, 60, 12, 0.7)], { heavy: true }),
      m("axe.c2", 16, [h(7, 1.5, 3.2, 120, 16, 1.1)], { heavy: true }),
    ],
    dash: m("axe.dash", 16, [h(7, 1.7, 3.4, 60, 16, 1.0)], { lunge: { t: 1, f: 1.0, up: 0.25 }, heavy: true }),
    air: m("axe.air", 15, [h(5, 1.6, 3.2, 90, 16, 0.5)], { heavy: true }),
    skill: m("axe.skill", 26, [h(13, 2.4, 4.6, 360, 34, 1.0, 0.55, { quake: true })],
      { lunge: { t: 2, f: 0.7, up: 0.7 }, iframes: 10, heavy: true }),
  },
  fist: {
    gain: 5, cost: 60, guard: false,
    combo: [
      m("fist.c1", 6, [h(2, 1.0, 2.4, 50, 3, 0.2)]),
      m("fist.c2", 6, [h(2, 1.0, 2.4, 50, 3, 0.2)]),
      m("fist.c3", 10, [h(4, 2.0, 2.8, 60, 10, 1.0)], { heavy: true }),
    ],
    dash: m("fist.dash", 12, [h(4, 2.5, 3.0, 60, 12, 1.2)], { lunge: { t: 1, f: 1.2, up: 0.2 } }),
    air: m("fist.air", 10, [h(3, 2.0, 2.6, 90, 10, 0.3)]),
    skill: m("fist.skill", 18, [h(5, 6.0, 3.0, 50, 24, 2.0, 0.3)], { lunge: { t: 3, f: 0.6 }, iframes: 4, heavy: true }),
  },
};
