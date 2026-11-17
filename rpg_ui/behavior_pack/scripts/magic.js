// ═══════════════════════════════════════════════════════════════════════
// 마법진 캐스터 (V11.1) — 마법사 계열 스킬이 쓰는 마법진 그리기 도구
//   요소(gen_magic.py): ring 원·끊어진 호·부분 호 / poly 다각형·별 / spoke 바퀴살·톱니 / rune 룬 글자 띠 / line 직선
//   조합: sub = 작은 원(자리·크기), 문양: eye 눈 · sun 태양 · moon 초승달 · flower 꽃 · star 별
//   한 요소 = 파티클 한 번 뿌림, 회전·나타남·사라짐은 파티클이 스스로 (렉 적음). 서버 파티클 예산(pbudget) 적용
//   drawMagic(dim, 중심, 법선(면이 바라보는 방향), 레이어, { R 크기, color, life, draw, spin 배율, size, yaw })
//   프리셋: astral(성좌) · hexa(육망성) · cyan(오망성·끊어진 호) · seal(봉인) · triseal(삼각 봉인) · trinity(세 원 연결)
// ═══════════════════════════════════════════════════════════════════════
import { MolangVariableMap } from "@minecraft/server";
import { spend } from "./pbudget.js";

const DEF = { n: 10, r: 1, r2: 0, w: 0.04, m: 1, k: 1, g: 1, seg: 0, gap: 0, a0: 0, a1: 360, rot: 0, spin: 0, draw: 0.5, life: 3, fade: 0.5, cr: 1, cg: 1, cb: 1, a: 1, size: 1, seed: 0 };
function emit(dim, name, at, o) {
  if (!spend(o.n, o.life ?? 3, o.prio ?? 1)) return;
  try {
    const m = new MolangVariableMap();
    for (const k of Object.keys(DEF)) m.setFloat(`variable.${k}`, o[k] ?? DEF[k]);
    m.setVector3("variable.u", o.u); m.setVector3("variable.v", o.v);
    dim.spawnParticle(`rpg:${name}`, at, m);
  } catch {}
}
const add = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
/** 면의 두 축: 바닥(법선 위)이면 yaw 기준, 세운 면이면 위쪽이 v */
export function basis(normal, yaw = 0) {
  const w = norm(normal);
  if (Math.abs(w.y) > 0.9) { const r = (yaw * Math.PI) / 180; const u = { x: Math.cos(r), y: 0, z: Math.sin(r) }; return { u, v: norm(cross(w, u)) }; }
  const u = norm(cross({ x: 0, y: 1, z: 0 }, w)); return { u, v: norm(cross(w, u)) };
}

// ── 문양 (작은 원 안) ──
export const SYM = {
  eye: (r) => [{ t: "ring", r: r * 1.15, at: [0, -r * 0.62], a0: 28, a1: 152 }, { t: "ring", r: r * 1.15, at: [0, r * 0.62], a0: 208, a1: 332 }, { t: "ring", r: r * 0.36 }, { t: "ring", r: r * 0.12, w: r * 0.2 }],
  sun: (r) => [{ t: "ring", r: r * 0.35 }, { t: "spoke", r: r * 0.42, r2: r * 0.95, m: 12, w: r * 0.18, spin: 30 }],
  moon: (r) => [{ t: "ring", r: r * 0.85, a0: 40, a1: 320 }, { t: "ring", r: r * 0.68, at: [r * 0.32, 0], a0: 75, a1: 285 }],
  flower: (r) => [{ t: "poly", r: r * 0.85, m: 6, k: 2, spin: -25 }, { t: "ring", r: r * 0.3 }],
  star: (r) => [{ t: "poly", r: r * 0.85, m: 5, k: 2, spin: 20 }],
  hexa: (r) => [{ t: "poly", r: r * 0.85, m: 6, k: 2, spin: 15 }, { t: "ring", r: r * 0.4 }],
};
/** 작은 원 + 문양 */
const orb = (x, y, r, sym, extra = []) => ({ t: "sub", at: [x, y], layers: [{ t: "ring", r }, { t: "ring", r: r * 0.86, w: 0.02 }, ...(SYM[sym]?.(r * 0.8) ?? []), ...extra] });
const around = (n, rr, r, syms, off = 90) => Array.from({ length: n }, (_, i) => { const a = ((off + (i * 360) / n) * Math.PI) / 180; return orb(Math.cos(a) * rr, Math.sin(a) * rr, r, syms[i % syms.length]); });

// ── 프리셋 (반지름 1 기준, R 로 키움) ──
export const PRESET = {
  // 사진 1: 겹 테두리 + 룬 띠 + 팔망성과 꼭짓점의 작은 원 8개(눈·태양·꽃·별) + 안쪽 팔방 별 + 가운데 눈
  astral: () => [
    { t: "ring", r: 1, w: 0.05 }, { t: "rune", r: 0.955, m: 52, spin: 8 }, { t: "ring", r: 0.91 },
    { t: "poly", r: 0.88, m: 8, k: 3, spin: -5 }, { t: "poly", r: 0.7, m: 8, k: 1, spin: -5, rot: 22.5 },
    ...around(8, 0.8, 0.1, ["eye", "sun", "flower", "star"], 90),
    { t: "ring", r: 0.56 }, { t: "ring", r: 0.52, w: 0.02 },
    { t: "spoke", r: 0.13, r2: 0.52, m: 8, w: 0.14, spin: 14 }, { t: "spoke", r: 0.13, r2: 0.33, m: 8, w: 0.1, spin: 14, rot: 22.5 },
    { t: "rune", r: 0.27, m: 18, spin: -20 }, { t: "ring", r: 0.2 },
    { t: "sub", at: [0, 0], layers: SYM.eye(0.11) },
  ],
  // 사진 2: 테두리 + 큰 룬 띠 + 육망성 + 꼭짓점의 작은 원 셋 + 가운데 원·룬
  hexa: () => [
    { t: "ring", r: 1, w: 0.05 }, { t: "ring", r: 0.97 }, { t: "rune", r: 0.89, m: 28, spin: 6, size: 1.6 }, { t: "ring", r: 0.8 }, { t: "ring", r: 0.775, w: 0.02 },
    { t: "poly", r: 0.775, m: 6, k: 2, spin: -4 }, { t: "poly", r: 0.775, m: 3, k: 1, spin: -4, rot: 180 },
    ...around(3, 0.56, 0.15, ["flower", "sun", "moon"], 90),
    { t: "ring", r: 0.33 }, { t: "ring", r: 0.2 }, { t: "rune", r: 0.265, m: 14, spin: -18, size: 0.8 },
    { t: "sub", at: [0, 0], layers: SYM.eye(0.13) },
  ],
  // 사진 3: 바깥 끊어진 호 두 겹(서로 반대로 돎) + 룬 띠 두 겹 + 안쪽 톱니 + 오망성
  cyan: () => [
    { t: "ring", r: 1.12, seg: 3, gap: 0.55, spin: -14 }, { t: "ring", r: 1.05, seg: 5, gap: 0.3, spin: 18 },
    { t: "ring", r: 1, w: 0.03 }, { t: "rune", r: 0.925, m: 46, spin: 7 }, { t: "ring", r: 0.85 },
    { t: "rune", r: 0.775, m: 38, spin: -9 }, { t: "ring", r: 0.7 },
    { t: "spoke", r: 0.7, r2: 0.56, m: 12, w: 0.16, spin: 12 }, { t: "ring", r: 0.55 },
    { t: "poly", r: 0.55, m: 5, k: 2, spin: 12 },
  ],
  // 사진 5 (큰 원): 사각형 두 개를 엇갈려 팔각 + 룬 띠 + 겹 원
  seal: () => [
    { t: "ring", r: 1, w: 0.04 }, { t: "rune", r: 0.91, m: 36, spin: 9 }, { t: "ring", r: 0.83 },
    { t: "poly", r: 0.83, m: 4, k: 1, spin: -8 }, { t: "poly", r: 0.83, m: 4, k: 1, spin: -8, rot: 45 },
    { t: "ring", r: 0.58 }, { t: "rune", r: 0.5, m: 22, spin: -14, size: 0.8 }, { t: "ring", r: 0.42 },
    { t: "poly", r: 0.42, m: 4, k: 1, spin: 20, rot: 45 }, { t: "ring", r: 0.25 }, { t: "ring", r: 0.2, w: 0.02 },
  ],
  // 사진 5 (작은 원): 삼각형 + 꼭짓점 작은 원 + 룬
  triseal: () => [
    { t: "ring", r: 1, w: 0.04 }, { t: "rune", r: 0.88, m: 24, spin: 10 }, { t: "ring", r: 0.78 },
    { t: "poly", r: 0.78, m: 3, k: 1, spin: -10 }, ...around(3, 0.78, 0.14, ["star", "star", "star"], 90),
    { t: "ring", r: 0.3 }, { t: "sub", at: [0, 0], layers: SYM.star(0.22) },
  ],
  // 사진 4: 위 큰 원(팔망성·초승달·육망성) + 양옆 작은 원(태양 · 달) + 아래 원(오망성 + 문양 원 다섯) + 이어 주는 선
  trinity: () => {
    const main = [
      { t: "ring", r: 1, w: 0.04 }, { t: "rune", r: 0.93, m: 40, spin: 6 }, { t: "ring", r: 0.86 }, { t: "ring", r: 0.83, w: 0.02 },
      { t: "poly", r: 0.8, m: 8, k: 3, spin: -6 }, { t: "poly", r: 0.62, m: 7, k: 3, spin: 9 },
      { t: "sub", at: [0.32, 0.32], layers: SYM.moon(0.3) }, { t: "sub", at: [0, 0], layers: [{ t: "ring", r: 0.24 }, ...SYM.hexa(0.22)] },
    ];
    const side = (sym) => [{ t: "ring", r: 1, w: 0.04 }, { t: "rune", r: 0.88, m: 20, spin: 12, size: 0.8 }, { t: "ring", r: 0.76 }, ...SYM[sym](0.66)];
    const low = [
      { t: "ring", r: 1, w: 0.04 }, { t: "rune", r: 0.92, m: 36, spin: -7 }, { t: "ring", r: 0.84 },
      { t: "poly", r: 0.84, m: 10, k: 3, spin: 5 }, { t: "poly", r: 0.36, m: 5, k: 2, spin: -14 }, { t: "ring", r: 0.36 },
      ...around(5, 0.6, 0.15, ["star", "eye", "eye", "moon", "flower"], 90),
    ];
    const sc = (s, layers) => ({ t: "sub", scale: s, layers });
    return [
      { ...sc(1, main), at: [0, 0.75] },
      { ...sc(0.45, side("sun")), at: [-1.6, 1.05] }, { ...sc(0.45, side("moon")), at: [1.6, 1.05] },
      { ...sc(0.72, low), at: [0, -1.25] },
      // 이어 주는 선: 양옆 원 ↔ 큰 원, 양옆 원 → 아래 원(V자), 큰 원 → 아래 원 세 줄
      { t: "line", from: [-1.15, 1.05], to: [-0.95, 1.05] }, { t: "line", from: [1.15, 1.05], to: [0.95, 1.05] },
      { t: "line", from: [-1.42, 0.64], to: [-0.5, -0.78] }, { t: "line", from: [1.42, 0.64], to: [0.5, -0.78] },
      { t: "line", from: [0, -0.25], to: [0, -0.53] }, { t: "line", from: [-0.3, -0.2], to: [-0.2, -0.6] }, { t: "line", from: [0.3, -0.2], to: [0.2, -0.6] },
    ];
  },
};

/** 마법진 그리기. layers 는 프리셋 이름이나 레이어 배열 */
export function drawMagic(dim, c, normal, layers, o = {}) {
  const R = o.R ?? 4, { u, v } = basis(normal, o.yaw ?? 0), col = o.color ?? [0.45, 0.85, 1];
  const life = o.life ?? 3, draw = o.draw ?? 0.6, spinMul = o.spin ?? 1, size = (o.size ?? 1.3) * 1.25;
  // 렉 줄이기: 점 간격을 넓히고(점은 조금 크게), 큰 마법진일수록 더 성기게 (반지름 4 넘으면 4/R 배)
  const dens = (o.dens ?? 7) * Math.min(1, 4 / Math.max(4, R));
  const L = typeof layers === "string" ? PRESET[layers]() : layers;
  const walk = (list, cx, cy, sc, depth) => list.forEach((ly, i) => {
    const s = sc * (ly.scale ?? 1), at = ly.at ? [cx + ly.at[0] * sc, cy + ly.at[1] * sc] : [cx, cy];
    if (ly.t === "sub") return walk(ly.layers, at[0], at[1], s, depth + 1);
    const pos = add(add(c, u, at[0] * R), v, at[1] * R);
    if (depth >= 2 && R > 6) return; // 큰 마법진의 아주 작은 문양은 생략
    const r = (ly.r ?? 1) * s * R, base = { u, v, life, fade: o.fade ?? 0.5, draw: ly.draw ?? draw * (0.5 + (0.5 * i) / Math.max(1, list.length)), cr: col[0] * (ly.tone ?? 1), cg: col[1] * (ly.tone ?? 1), cb: col[2] * (ly.tone ?? 1), a: ly.a ?? 1, size: size * (ly.size ?? 1) * (depth ? 0.85 : 1), spin: (ly.spin ?? 0) * spinMul, rot: ly.rot ?? 0, prio: depth ? 2 : 1 };
    if (ly.t === "ring") {
      const frac = (((ly.a1 ?? 360) - (ly.a0 ?? 0)) / 360) * (1 - (ly.gap ?? 0));
      emit(dim, "mc_ring", pos, { ...base, r, w: (ly.w ?? 0.03) * R * s, seg: ly.seg ?? 0, gap: ly.gap ?? 0, a0: ly.a0 ?? 0, a1: ly.a1 ?? 360, n: Math.max(8, Math.round(2 * Math.PI * r * frac * dens)) });
    } else if (ly.t === "poly") {
      const m = ly.m, k = ly.k ?? 1, per = m * 2 * r * Math.sin((Math.PI * k) / m);
      const gcd = (a, b) => (b ? gcd(b, a % b) : a);
      emit(dim, "mc_poly", pos, { ...base, r, m, k, g: gcd(m, k), w: (ly.w ?? 0.02) * R * s, n: Math.max(10, Math.round(per * dens)) });
    } else if (ly.t === "spoke") {
      const r2 = (ly.r2 ?? 1) * s * R;
      emit(dim, "mc_spoke", pos, { ...base, r, r2, m: ly.m, w: (ly.w ?? 0.05) * R * s, n: Math.max(8, Math.round(ly.m * Math.abs(r2 - r) * dens * 1.6)) });
    } else if (ly.t === "rune") {
      emit(dim, "mc_rune", pos, { ...base, r, m: ly.m, seed: ly.seed ?? (i * 5) % 16, n: Math.round(ly.m * 2), size: base.size * Math.min(1.6, Math.max(0.6, (r * 2 * Math.PI) / ly.m / 0.55)) });
    } else if (ly.t === "line") {
      const a = ly.from, b = ly.to, p0 = add(add(c, u, (cx + a[0] * sc) * R), v, (cy + a[1] * sc) * R);
      const dx = (b[0] - a[0]) * sc * R, dy = (b[1] - a[1]) * sc * R, Ln = Math.hypot(dx, dy) || 0.01;
      const lu = norm(add(add({ x: 0, y: 0, z: 0 }, u, dx), v, dy)), lv = norm(cross(cross(u, v), lu));
      emit(dim, "mc_line", p0, { ...base, u: lu, v: lv, r: Ln, w: 0.03 * R, spin: 0, rot: 0, n: Math.max(6, Math.round(Ln * dens)) });
    }
  });
  walk(L, 0, 0, 1, 0);
}

/** 미리보기: /scriptevent rpg:circle <프리셋> [크기] [v] — 발밑(또는 v 면 앞에 세워서) 마법진 */
export function demoCircle(p, msg) {
  const [name = "astral", size = "5", mode = ""] = (msg || "").trim().split(/\s+/);
  const yaw = p.getRotation().y, r = (yaw * Math.PI) / 180, f = { x: -Math.sin(r), y: 0, z: Math.cos(r) };
  const key = PRESET[name] ? name : "astral";
  const cols = { astral: [1, 0.92, 0.6], hexa: [0.95, 0.95, 1], cyan: [0.35, 1, 1], seal: [0.3, 0.95, 0.9], triseal: [0.4, 1, 0.95], trinity: [0.55, 0.65, 1] };
  if (mode === "v") drawMagic(p.dimension, add(add(p.location, f, 6), { x: 0, y: 1, z: 0 }, Number(size) + 0.5), f, key, { R: Number(size), color: cols[key], life: 6, yaw });
  else drawMagic(p.dimension, add(p.location, { x: 0, y: 1, z: 0 }, 0.1), { x: 0, y: 1, z: 0 }, key, { R: Number(size), color: cols[key], life: 6, yaw: -yaw });
}
