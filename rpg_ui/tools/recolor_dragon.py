# 청룡의 파티클 동양 용(cr_body · cr_line · cr_glow · cr_head · cr_headfill) → 흑룡 색 사본 hrd_* (V12.149)
#   비늘 = 흑요석 보라, 밝은 곳(갈기 · 수염 · 발톱 · 배) = 옅은 은보라, 눈 · 기운 = 밝은 보라
#   gen_cheongryong.py 를 다시 돌린 뒤엔 이것도 다시 돌릴 것
import json, re, colorsys
from pathlib import Path
P = Path("resource_pack/particles")
def recolor(h):
    a, r, g, b = (int(h[i:i + 2], 16) for i in (1, 3, 5, 7))
    hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    if s < 0.25: hh, s, v = 0.76, 0.18, v * 0.9                 # 흰빛 → 옅은 은보라
    else: hh, s, v = 0.765, min(1, s * 0.85 + 0.1), v * 0.62 ** (1 + (1 - v))  # 파랑 → 짙은 보라 (어두운 곳은 더 어둡게 = 흑요석)
    r, g, b = (round(x * 255) for x in colorsys.hsv_to_rgb(hh, s, v))
    return f"#{a:02X}{r:02X}{g:02X}{b:02X}"
for nm in ("body", "line", "glow", "head", "headfill"):
    src = P / f"rpg_cr_{nm}.json"
    s = src.read_text()
    s = s.replace(f'"rpg:cr_{nm}"', f'"rpg:hrd_{nm}"')
    s = re.sub(r"#[0-9A-Fa-f]{8}", lambda m: recolor(m.group(0)), s)
    # 직접 rgb 숫자로 칠한 경우(눈 · 기운): 파랑 성분이 큰 색을 보라로
    (P / f"rpg_hrd_{nm}.json").write_text(s)
    print(nm, len(re.findall(r"#[0-9A-Fa-f]{8}", s)), "colors")
