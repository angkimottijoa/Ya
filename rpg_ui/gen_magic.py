"""마법진 캐스터 파티클 (V11.1) — 마법사 계열 전용
  모든 요소는 한 번만 뿌리면 스스로 돈다(particle_motion_parametric) → 스크립트가 매 틱 다시 그리지 않음
  공통 변수: u·v = 마법진 면, r = 반지름, rot = 처음 각도(도), spin = 초당 회전(도), draw = 그려지며 나타나는 시간(초),
            life = 유지 시간, fade = 사라지는 시간, cr·cg·cb·a = 색, size = 점 크기, w = 선 두께
  mc_ring   원 · 끊어진 호(seg 마디, gap 빈 비율) · 부분 호(a0~a1)
  mc_poly   정다각형 / 별(m 꼭짓점, k 건너뛰기: 5·2 오망성, 6·2 육망성, 8·3 팔망성, 4·1 사각형, 3·1 삼각형)
  mc_spoke  바퀴살 · 톱니(r → r2, 끝으로 갈수록 가늘게)
  mc_rune   룬 글자 띠(m 글자, 같은 자리에는 같은 글자)
  mc_line   직선(u 방향 길이 r)
"""
import json, math, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).parent
TEXD = ROOT / "resource_pack" / "textures" / "particle"
OUT = ROOT / "resource_pack" / "particles"
AGE = "variable.particle_age"
R1, R2, R3, R4 = (f"variable.particle_random_{i}" for i in (1, 2, 3, 4))
TEX = "textures/particle/rpg_mc"


def frac(x):
    return f"({x} - math.floor({x}))"


def runes():
    """룬 글자 16개(4x4, 칸 16px) + 맨 아래 줄 첫 칸 = 빛나는 점"""
    im = Image.new("RGBA", (64, 80), (0, 0, 0, 0))
    big = 64
    for g in range(16):
        rnd = random.Random(100 + g * 7)
        s = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        d = ImageDraw.Draw(s)
        # 세로 줄기 + 비스듬한 가지 + 작은 고리 (룬 문자 느낌)
        x0 = rnd.choice([20, 32, 44])
        d.line([(x0, 8), (x0, 56)], fill=(255, 255, 255, 255), width=7)
        for _ in range(rnd.randint(1, 3)):
            y = rnd.randint(10, 46)
            dx = rnd.choice([-1, 1]) * rnd.randint(12, 22)
            d.line([(x0, y), (x0 + dx, y + rnd.randint(-14, 14))], fill=(255, 255, 255, 255), width=6)
        if rnd.random() < 0.45:
            cx, cy = x0 + rnd.choice([-12, 12]), rnd.randint(16, 48)
            d.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], outline=(255, 255, 255, 255), width=5)
        if rnd.random() < 0.4:
            d.line([(x0 - 14, 56), (x0 + 14, 56)], fill=(255, 255, 255, 255), width=6)
        glow = s.filter(ImageFilter.GaussianBlur(5))
        out = Image.alpha_composite(Image.new("RGBA", (big, big), (0, 0, 0, 0)), glow)
        out = Image.alpha_composite(out, s)
        im.paste(out.resize((16, 16), Image.LANCZOS), ((g % 4) * 16, (g // 4) * 16))
    dot = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dot)
    c = big / 2
    for r in range(int(c), 0, -1):
        a = int(255 * min(1, (1 - r / c) ** 1.4 * 1.6))
        dd.ellipse([c - r, c - r, c + r, c + r], fill=(255, 255, 255, a))
    im.paste(dot.resize((16, 16), Image.LANCZOS), (0, 64))
    im.save(TEXD / "rpg_mc.png")


def part(name, pos_xy, show, extra_size="1", sprite=None):
    """pos_xy = (X, Y) 마법진 면 좌표(돌기 전), show = 그려짐 순서(0~1)"""
    X, Y = pos_xy
    B = f"(variable.rot + variable.spin * {AGE})"  # 돌아간 각도
    Xr, Yr = f"(({X}) * math.cos({B}) - ({Y}) * math.sin({B}))", f"(({X}) * math.sin({B}) + ({Y}) * math.cos({B}))"
    vis = f"({AGE} < variable.draw * ({show}) ? 0 : 1)"
    fade = f"math.clamp((variable.life - {AGE}) / math.max(0.05, variable.fade), 0, 1)"
    alpha = f"variable.a * {fade} * math.clamp(({AGE} - variable.draw * ({show})) / 0.12, 0, 1)"
    uv = sprite or {"texture_width": 64, "texture_height": 80, "uv": [0, 64], "uv_size": [16, 16]}
    d = {"format_version": "1.10.0", "particle_effect": {
        "description": {"identifier": f"rpg:{name}", "basic_render_parameters": {"material": "particles_blend", "texture": TEX}},
        "components": {
            "minecraft:emitter_rate_instant": {"num_particles": "variable.n"},
            "minecraft:emitter_lifetime_once": {"active_time": 0.05},
            "minecraft:emitter_shape_point": {"offset": [0, 0, 0]},
            "minecraft:particle_lifetime_expression": {"max_lifetime": "variable.life"},
            "minecraft:particle_motion_parametric": {"relative_position": [f"variable.u.{c} * {Xr} + variable.v.{c} * {Yr}" for c in "xyz"]},
            "minecraft:particle_appearance_billboard": {"size": [f"{vis} * variable.size * 0.085 * ({extra_size})"] * 2, "facing_camera_mode": "lookat_xyz", "uv": uv},
            "minecraft:particle_appearance_tinting": {"color": ["variable.cr", "variable.cg", "variable.cb", alpha]},
        }}}
    (OUT / f"rpg_{name}.json").write_text(json.dumps(d, ensure_ascii=False, indent=1))


def main():
    runes()
    # 원 / 끊어진 호 / 부분 호
    seg_t = f"(variable.seg > 0 ? (math.floor({R1} * variable.seg) + {frac(f'{R1} * variable.seg')} * (1 - variable.gap)) / variable.seg : {R1})"
    A = f"(variable.a0 + (variable.a1 - variable.a0) * {seg_t})"
    rad = f"(variable.r + ({R2} - 0.5) * variable.w)"
    part("mc_ring", (f"math.cos({A}) * {rad}", f"math.sin({A}) * {rad}"), R1)
    # 정다각형 · 별: 변 e (0~m-1) 위의 점, 꼭짓점 i 는 각도 90 + i*k*360/m
    e = f"math.floor({R1} * variable.m)"
    t = frac(f"{R1} * variable.m")
    # 겹친 별(육망성 6·2 처럼 최대공약수 g > 1): 변을 g 묶음으로 나눠 묶음마다 꼭짓점을 한 칸씩 밀어 줌
    cyc = "(variable.m / variable.g)"
    j, cg = f"math.mod({e}, {cyc})", f"math.floor({e} / {cyc})"
    a0 = f"(90 + ({j} * variable.k + {cg}) * 360 / variable.m)"
    a1 = f"(90 + (({j} + 1) * variable.k + {cg}) * 360 / variable.m)"
    px = f"((math.cos({a0}) * (1 - {t}) + math.cos({a1}) * {t}) * variable.r + ({R2} - 0.5) * variable.w)"
    py = f"((math.sin({a0}) * (1 - {t}) + math.sin({a1}) * {t}) * variable.r + ({R3} - 0.5) * variable.w)"
    part("mc_poly", (px, py), R1)
    # 바퀴살 · 톱니: r → r2, 끝으로 갈수록 가늘어짐 (w = 밑동 폭)
    sp = f"(math.floor({R1} * variable.m) * 360 / variable.m)"
    rr = f"(variable.r + (variable.r2 - variable.r) * {R2})"
    lat = f"(({R3} - 0.5) * variable.w * (1 - {R2}))"
    part("mc_spoke", (f"math.cos({sp}) * {rr} - math.sin({sp}) * {lat}", f"math.sin({sp}) * {rr} + math.cos({sp}) * {lat}"), R2)
    # 룬 글자 띠: 자리 m 개, 같은 자리에는 같은 글자(겹쳐도 같은 그림)
    slot = f"math.floor({R1} * variable.m)"
    ra = f"({slot} * 360 / variable.m)"
    glyph = f"math.mod({slot} * 7 + math.floor(variable.seed), 16)"
    part("mc_rune", (f"math.cos({ra}) * variable.r", f"math.sin({ra}) * variable.r"), f"({slot} / variable.m)", "2.2",
         {"texture_width": 64, "texture_height": 80, "uv": [f"math.mod({glyph}, 4) * 16", f"math.floor({glyph} / 4) * 16"], "uv_size": [16, 16]})
    # 직선: u 방향 길이 r (회전 없이 쓰려면 spin 0)
    part("mc_line", (f"{R1} * variable.r", f"({R2} - 0.5) * variable.w"), R1)
    print("magic circle particles ok")


if __name__ == "__main__":
    main()
