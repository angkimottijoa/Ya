"""자바 MagicSpells(yml) → 베드락 변환기 (V3.0)

magicspells_src/ 의 yml 을 읽어서
  1) 스펠 정의 → behavior_pack/scripts/msdata.js (스크립트 인터프리터 msrun.js 가 실행)
  2) EffectLib 효과(Equation/Sphere/AnimatedBall/Helix/Vortex/Star/Modified) → resource_pack/particles/mss_*.json
     식 문자열("3.8sin(0.0125t)")을 Molang 으로 그대로 옮긴다. t 는 0..(particles×반복) 의 점 번호.
     색은 MolangVariableMap 으로 넘겨 같은 식은 파일 하나를 공유한다.
사용할 스펠은 ROOTS 에서 출발해 참조를 따라간 것만 넣는다.
"""
import json, re, hashlib, glob, math
from pathlib import Path
import yaml

ROOT = Path(__file__).parent
SRC = ROOT / "magicspells_src"
OUT_JS = ROOT / "behavior_pack" / "scripts" / "msdata.js"
OUT_P = ROOT / "resource_pack" / "particles"

# 무기 스킬 시작점: (스킬 키, 스펠 이름)  ① 우클릭  ② 쉬프트 우클릭  ③ 쉬프트 좌클릭
ROOTS = {
    "클라우": ["클라우RCmulti1", "클라우SRCmulti1", "클라우SLCMulti1"],
    "블라디": ["블라디RCmulti1", "블라디SRCmulti1", "블라디SLCmulti1"],
    "바이던트": ["바이던트RCMulti1", "바이던트SRCPP1", "바이던트SLCmulti1"],
    "네일링": ["네일링RCmulti", "네일링SRCmulti", "네일링SLCmulti2"],
    "쉐도어": ["쉐도어RCmultiM", "쉐도어SRCmulti", "쉐도어SLCmulti"],
    "크티아스": ["크타아트RCPPc", "크타아트SRCPP1", "크타아트SLCmulti2"],
    "도살자": ["도살자RCaera1", "도살자SRCaera1", "도살자SLCMultiM"],
    "도사": ["도사_R_M", "도사_SR_M", "도사_SL_M"],
    "데런": ["총칼RCMulti2", "총칼SRCmulti1", "총칼SLCMultiM"],
    "발뭉": ["Balmung_RightClick_M", "Balmung_ShiftR_M", "Balmung_ShiftL"],
    "응룡": ["Dragon_R_TM", "Dragon_ShiftR_M", "Dragon_ShiftL_M", "Dragon_ShiftL_L_M"],
    "섀도우": ["Shadow_RightClick_Dagger_M", "Shadow_Q_TM", "Shadow_ShiftL_M"],
}

MAX_N = 700  # 이미터 하나의 최대 점 수 (넘으면 같은 모양을 성기게)


# ───────── yml 읽기 ─────────
def load_all():
    spells = {}
    for f in sorted(glob.glob(str(SRC / "**" / "*.yml"), recursive=True)):
        raw = open(f, encoding="utf-8", errors="replace").read().replace("\t", "    ").replace("​", "")
        try:
            d = yaml.safe_load(raw)
        except Exception as e:
            print("yml 오류:", f, str(e)[:80])
            continue
        for k, v in (d or {}).items():
            if isinstance(v, dict) and "spell-class" in v:
                spells[str(k).replace("​", "")] = v
    return spells


# ───────── 식 → Molang ─────────
TOK = re.compile(r"\s*(\d+\.\d*|\.\d+|\d+|sin|cos|tan|sqrt|abs|rand|t|[-+*/(),^])")


def eq_to_molang(s, T):
    """EffectLib 식 → Molang. 암묵적 곱셈("3sin(..)2cos(..)", "0.01(t)") 처리, 삼각함수는 라디안 → 도"""
    s = str(s if s is not None else "").strip()
    if not s:
        return "0"
    s = s.replace("rand(", "R(")
    toks, i = [], 0
    while i < len(s):
        if s[i] == "R" and s[i:i + 2] == "R(":
            toks.append("rand"); i += 1; continue
        m = TOK.match(s, i)
        if not m:
            i += 1
            continue
        toks.append(m.group(1))
        i = m.end()
    out = []
    prev = None
    funcs = {"sin", "cos", "tan", "sqrt", "abs", "rand"}
    OPEN = {"sin": "math.sin(57.29578*(", "cos": "math.cos(57.29578*(", "tan": "math.tan(57.29578*(",
            "sqrt": "math.sqrt(", "abs": "math.abs(", "rand": "math.random("}
    CLOSE = {"sin": "))", "cos": "))", "tan": "))", "sqrt": ")", "abs": ")", "rand": ")"}
    pending = None
    stack = []
    for tk in toks:
        is_val_start = tk in funcs or tk == "t" or tk == "(" or re.match(r"[\d.]", tk)
        if pending is None and prev is not None and is_val_start and (prev == ")" or prev == "t" or re.match(r"[\d.]", prev)):
            out.append("*")
        if tk in funcs:
            pending = tk
            prev = None
            continue
        if tk == "(":
            if pending:
                out.append(OPEN[pending]); stack.append(CLOSE[pending]); pending = None
            else:
                out.append("("); stack.append(")")
            prev = "("
            continue
        if tk == ")":
            out.append(stack.pop() if stack else "")
            prev = ")"
            continue
        if tk == "t":
            out.append(f"({T})")
        else:
            out.append(tk)
        prev = tk
    while stack:
        out.append(stack.pop())
    expr = "".join(out).replace("--", "+")
    expr = re.sub(r"^\+", "", expr)
    return expr or "0"


def color_of(e):
    c = str(e.get("color", "")).strip().upper()
    if re.fullmatch(r"[0-9A-F]{6}", c):
        return "#" + c
    p = str(e.get("particle", "redstone")).lower()
    return {
        "flame": "#FF8A1E", "cloud": "#F4F4F4", "spell_witch": "#9B3FD8", "smoke_normal": "#4A4A4A", "smoke_large": "#333333",
        "explosion_large": "#EEEEEE", "drip_water": "#3F76E4", "reddust": "#CC1111", "redstone": "#FF0000",
    }.get(p, "#FFFFFF")


def look(e):
    """입자 종류 → (재질, 크기 배율, 위로 떠오름)"""
    p = str(e.get("particle", "redstone")).lower()
    if p in ("flame",):
        return "particles_add", 1.2, 0.3
    if p in ("cloud", "smoke_normal", "smoke_large", "explosion_large"):
        return "particles_blend", 2.0 if p != "explosion_large" else 4.0, 0.4
    if p in ("spell_witch",):
        return "particles_add", 1.3, 0.6
    return "particles_alpha", 1.0, 0.0


# ───────── 파티클 파일 ─────────
AGE = "(variable.particle_age / variable.particle_lifetime)"
R1, R2, R3, R4 = (f"variable.particle_random_{i}" for i in (1, 2, 3, 4))
made = {}


def particle_file(key, shape_offset, n, dur, life, material, size, rise, direction=None, speed=0):
    """같은 모양은 하나의 파일. 색/yaw/orient 는 스크립트가 변수로 넘김"""
    h = hashlib.md5(json.dumps([key, n, round(dur, 3), material, size, rise, speed], ensure_ascii=False).encode()).hexdigest()[:10]
    ident = f"rpg:mss_{h}"
    if ident in made:
        return ident
    sz = f"variable.size * {0.2 * size:.3f} * (0.8 + {R3} * 0.4) * (1 - 0.7 * math.pow({AGE}, 2))"
    data = {
        "format_version": "1.10.0",
        "particle_effect": {
            "description": {"identifier": ident, "basic_render_parameters": {"material": material, "texture": "textures/particle/particles"}},
            "components": {
                "minecraft:emitter_initialization": {"per_update_expression": f"variable.prog = math.clamp(variable.emitter_age / {max(dur, 0.05):.3f}, 0, 1);"},
                "minecraft:emitter_rate_steady": {"spawn_rate": round(n / max(dur, 0.05), 2), "max_particles": n},
                "minecraft:emitter_lifetime_once": {"active_time": round(max(dur, 0.05), 3)},
                "minecraft:emitter_shape_point": {"offset": shape_offset, "direction": direction or [0, 1, 0]},
                "minecraft:particle_lifetime_expression": {"max_lifetime": f"variable.life * (0.85 + {R4} * 0.3)"},
                "minecraft:particle_initial_speed": speed,
                "minecraft:particle_motion_dynamic": {"linear_acceleration": [0, rise, 0]},
                "minecraft:particle_appearance_billboard": {
                    "size": [sz, sz], "facing_camera_mode": "lookat_xyz",
                    "uv": {"texture_width": 16, "texture_height": 16, "uv": [f"math.floor({R4} * 2) + 6", 0], "uv_size": [1, 1]},
                },
                "minecraft:particle_appearance_tinting": {"color": ["variable.color.r", "variable.color.g", "variable.color.b", 1]},
            },
        },
    }
    OUT_P.mkdir(parents=True, exist_ok=True)
    (OUT_P / f"mss_{h}.json").write_text(json.dumps(data, ensure_ascii=False))
    made[ident] = True
    return ident


def orient(lx, ly, lz):
    """EffectLib rotateVector(yaw): 로컬 z = 앞, 로컬 x = 왼쪽"""
    X = f"(variable.ori > 0.5 ? (({lx}) * math.cos(variable.yaw) - ({lz}) * math.sin(variable.yaw)) : ({lx}))"
    Z = f"(variable.ori > 0.5 ? (({lx}) * math.sin(variable.yaw) + ({lz}) * math.cos(variable.yaw)) : ({lz}))"
    return [X, ly, Z]


def iterations(e):
    period = max(1, float(e.get("period", 1) or 1))
    if e.get("iterations") is not None:
        return max(1, int(e["iterations"])), period
    dur = float(e.get("duration", 0) or 0)
    return max(1, int(round(dur / 50 / period))), period


def conv_effectlib(e):
    """effectlib 블록 → { id, color, ori, life } (스크립트가 위치에 뿌림)"""
    cls = str(e.get("class", ""))
    mat, size, rise = look(e)
    it, period = iterations(e)
    dur_s = it * period / 20
    if cls == "ModifiedEffect":
        inner = e.get("effect") or {}
        par = e.get("parameters") or {}
        m = re.match(r"\s*t\s*\*\s*(-?[\d.]+)", str(par.get("radius", "")))
        k = float(m.group(1)) if m else 0.5
        mat, size, rise = look(inner)
        n = min(MAX_N, int(inner.get("particles", 100) or 100))
        dur_s = max(0.15, float(e.get("duration", 300) or 300) / 1000)
        th, ph = f"({R1} * 360)", f"math.acos(1 - 2 * {R2})"
        dirv = [f"math.sin({ph}) * math.cos({th})", f"math.cos({ph})", f"math.sin({ph}) * math.sin({th})"]
        off = [f"{d} * 0.2" for d in dirv]
        pid = particle_file(("mod", k), off, n, 0.05, dur_s, mat, size, 0, direction=dirv, speed=round(abs(k) * 20, 2))
        return {"id": pid, "color": color_of(inner), "ori": 0, "life": round(dur_s, 2), "dy": 1 if "1w" in str(inner.get("relativeOffset", "")) else 0}

    if cls == "EquationEffect":
        per = max(1, int(e.get("particles", 100) or 100))
        cycle = bool(e.get("cycle", False))
        total = per if cycle else per * it
        n = min(MAX_N, total)
        draw = (not cycle) and it > 1
        # EffectLib 은 t 를 정수(점 번호)로 센다: cos(1+8t) 같은 식은 정수 t 라야 원본 모양이 나옴
        T = f"math.floor(variable.prog * {total})" if draw else f"math.floor({R1} * {per})"
        lx, ly, lz = (eq_to_molang(e.get(k), T) for k in ("xEquation", "yEquation", "zEquation"))
        off = orient(lx, ly, lz)
        life = max(0.5, dur_s + 0.4) if draw else max(0.6, dur_s)
        pid = particle_file(("eq", lx, ly, lz), off, n, dur_s if draw else max(0.05, dur_s if cycle else 0.05), life, mat, size, rise)
        return {"id": pid, "color": color_of(e), "ori": 1 if e.get("orient") else 0, "life": round(life, 2)}

    if cls in ("SphereEffect", "AnimatedBallEffect"):
        r = float(e.get("radius", e.get("size", 1)) or 1)
        fx = float(e.get("xFactor", 1) or 1); fy = float(e.get("yFactor", 1) or 1); fz = float(e.get("zFactor", 1) or 1)
        if cls == "AnimatedBallEffect":
            # 원본은 size 단위가 작다 (size 1 + factor 3 ≈ 반지름 1.5)
            fx, fy, fz = fx * 0.5, fy * 0.5, fz * 0.5
        n = min(MAX_N, int(e.get("particles", 100) or 100))
        yo = float(e.get("yOffset", e.get("yoffset", 0)) or 0)
        th, ph = f"({R1} * 360)", f"math.acos(1 - 2 * {R2})"
        off = [f"math.sin({ph}) * math.cos({th}) * {r * fx}", f"math.cos({ph}) * {r * fy} + {yo}", f"math.sin({ph}) * math.sin({th}) * {r * fz}"]
        grow = float(e.get("radiusIncrease", 0) or 0)
        d = dur_s if cls == "AnimatedBallEffect" else 0.05
        pid = particle_file(("ball", r, fx, fy, fz, yo, grow), off, n, d, max(0.6, dur_s), mat, size, rise,
                            direction=[f"math.sin({ph}) * math.cos({th})", f"math.cos({ph})", f"math.sin({ph}) * math.sin({th})"], speed=round(grow * 20, 2))
        return {"id": pid, "color": color_of(e), "ori": 0, "life": round(max(0.6, dur_s), 2)}

    if cls == "HelixEffect":
        strands = max(1, int(e.get("strands", 8) or 8)); per = max(1, int(e.get("particles", 80) or 80))
        radius = float(e.get("radius", 10) or 10); curve = float(e.get("curve", 10) or 10); rot = float(e.get("rotation", 0.785) or 0)
        n = min(MAX_N, strands * per)
        k = f"math.floor({R2} * {strands})"
        ratio = R1
        ang = f"(({curve} * {ratio} * 360 / {strands}) + 360 * {k} / {strands} + {rot * 57.29578})"
        off = [f"math.cos({ang}) * {ratio} * {radius}", "0.1", f"math.sin({ang}) * {ratio} * {radius}"]
        pid = particle_file(("helix", strands, radius, curve, rot), off, n, 0.05, max(0.8, dur_s), mat, size, rise)
        return {"id": pid, "color": color_of(e), "ori": 0, "life": round(max(0.8, dur_s), 2)}

    if cls == "VortexEffect":
        radius = float(e.get("radius", 2) or 2); grow = float(e.get("grow", 0.05) or 0.05)
        radials = float(e.get("radials", 0.39) or 0.39); circles = int(e.get("circles", 3) or 3); helixes = int(e.get("helixes", 4) or 4)
        n = min(MAX_N, circles * helixes * it)
        k = f"math.floor({R2} * {helixes})"
        tt = f"(variable.prog * {it})"
        ang = f"(360 * {k} / {helixes} + {tt} * {radials * 57.29578})"
        off = [f"math.cos({ang}) * {radius}", f"{tt} * {grow}", f"math.sin({ang}) * {radius}"]
        pid = particle_file(("vortex", radius, grow, radials, helixes, it), off, n, dur_s, max(0.6, dur_s + 0.3), mat, size, rise)
        return {"id": pid, "color": color_of(e), "ori": 0, "life": round(max(0.6, dur_s + 0.3), 2)}

    if cls == "StarEffect":
        spikeH = float(e.get("spikeHeight", 3.5) or 3.5); half = int(e.get("spikesHalf", 3) or 3); inner = float(e.get("innerRadius", 0.5) or 0.5)
        spikes = max(2, half * 2 if half else 2)
        n = min(MAX_N, int(e.get("particles", 50) or 50) * spikes)
        k = f"math.floor({R2} * {spikes})"
        az = f"({k} * 360 / {spikes})"
        up = f"({k} < {spikes / 2} ? 1 : -1)"
        d = f"({inner} * (1 - {R1}))"
        off = [f"math.cos({az}) * {d}", f"{up} * {R1} * {spikeH}", f"math.sin({az}) * {d}"]
        pid = particle_file(("star", spikeH, spikes, inner), off, n, 0.05, max(0.6, dur_s), mat, size, rise)
        return {"id": pid, "color": color_of(e), "ori": 0, "life": round(max(0.6, dur_s), 2)}
    return None


SOUND = {
    "entity.wither.shoot": "mob.wither.shoot", "entity.wither.death": "mob.wither.death", "entity.wither.hurt": "mob.wither.hurt",
    "entity.wither.spawn": "mob.wither.spawn", "entity.blaze.hurt": "mob.blaze.hit", "entity.blaze.hit": "mob.blaze.hit",
    "entity.generic.explode": "random.explode", "entity.enderdragon.growl": "mob.enderdragon.growl",
    "entity.enderdragon.flap": "mob.enderdragon.flap", "entity.enderdragon.wings": "mob.enderdragon.flap",
    "entity.enderdragon.hurt": "mob.enderdragon.hit", "entity.bat.ambient": "mob.bat.idle", "entity.bat.takeoff": "mob.bat.takeoff",
    "entity.irongolem.death": "mob.irongolem.death", "entity.irongolem.hit": "mob.irongolem.hit", "entity.irongolem.attack": "mob.irongolem.throw",
    "entity.creeper.death": "mob.creeper.death", "entity.creeper.hurt": "mob.creeper.say", "mob.creeper.say": "mob.creeper.say",
    "entity.zombie.remedy": "mob.zombie.remedy", "entity.zombie_villager.cure": "mob.zombie.remedy", "entity.zombie_villager.converted": "mob.zombie.unfect",
    "entity.zombie_villager.remedy": "mob.zombie.remedy", "entity.zombie.ambient": "mob.zombie.say", "entity.zombie_pig.death": "mob.zombiepig.zpigdeath",
    "entity.arrow.shoot": "random.bow", "entity.wolf.growl": "mob.wolf.growl", "weather.rain.above": "ambient.weather.rain",
    "entity.shulker_bullet.hit": "mob.shulker.bullet.hit", "entity.player.attack.crit": "game.player.attack.strong",
    "entity.husk.hurt": "mob.husk.hurt", "entity.horse.death": "mob.horse.death", "entity.guardian.death": "mob.guardian.death",
    "entity.zombie.attack_door_wood": "mob.zombie.wood", "entity.zombie.break_door_wood": "mob.zombie.woodbreak",
}


def conv_effects(v):
    out = []
    effs = v.get("effects") or {}
    if not isinstance(effs, dict):
        return out
    for _, e in effs.items():
        if not isinstance(e, dict):
            continue
        pos = str(e.get("position", "caster"))
        if pos == "disabled":
            continue
        delay = int(e.get("delay", 0) or 0)
        kind = str(e.get("effect", ""))
        if kind in ("effectlib", "effectlibentity"):
            c = conv_effectlib(e.get("effectlib") or {})
            if c:
                hy = float(e.get("height-offset", 0) or 0)
                out.append({"pos": pos, "delay": delay, "p": c["id"], "c": c["color"], "o": c["ori"], "l": c["life"], "hy": hy + c.get("dy", 0)})
        elif kind == "sound":
            snd = str(e.get("sound", "")).strip()
            snd = SOUND.get(snd, snd if not snd.startswith("entity.") else None)
            if snd:
                pitch = float(e.get("pitch", 1) or 1)
                out.append({"pos": pos, "delay": delay, "snd": snd, "pi": max(0.5, min(2, pitch if pitch > 0 else 0.6)), "v": min(2, float(e.get("volume", 1) or 1))})
        elif kind == "particles":
            out.append({"pos": pos, "delay": delay, "burst": color_of({"particle": e.get("particle-name", "")}), "n": int(e.get("count", 10) or 10),
                        "sp": float(e.get("horiz-spread", 0.3) or 0.3), "hy": float(e.get("y-offset", 0) or 0)})
    return out


KEEP = {
    "MultiSpell": ["spells", "modifiers"], "TargetedMultiSpell": ["spells", "modifiers", "range", "stop-on-fail"],
    "instant.ParticleProjectileSpell": ["projectile-velocity", "projectile-horiz-offset", "projectile-vert-offset", "projectile-gravity",
                                        "hug-surface", "height-from-surface", "tick-interval", "start-forward-offset", "start-y-offset",
                                        "max-distance", "max-duration", "hit-players", "hit-non-players", "stop-on-hit-entity", "hit-air-during",
                                        "hit-air-at-end", "stop-on-hit-ground", "spell", "special-effect-interval", "hit-radius", "particle-name"],
    "targeted.AreaEffectSpell": ["horizontal-radius", "vertical-radius", "max-targets", "spells", "target-caster"],
    "targeted.PainSpell": ["damage", "target-self"], "targeted.DrainlifeSpell": ["take-amt", "give-amt"],
    "targeted.ForcetossSpell": ["horizontal-force", "vertical-force"], "targeted.StunSpell": ["duration", "target-self"],
    "targeted.PotionEffectSpell": ["type", "strength", "duration", "targeted"], "instant.LeapSpell": ["forward-velocity", "upward-velocity"],
    "targeted.ShadowstepSpell": ["range"], "buff.InvulnerabilitySpell": ["duration"], "buff.InvisibilitySpell": ["duration"],
    "instant.DummySpell": [], "targeted.DummySpell": [], "buff.DummySpell": ["duration"], "targeted.DotSpell": ["interval", "duration", "damage"],
    "instant.VelocitySpell": ["speed", "add-velocity-instead"], "targeted.GripSpell": ["yoffset", "location-offset"],
    "ExternalCommandSpell": ["command-to-execute"], "targeted.SilenceSpell": ["duration"],
}


def main():
    spells = load_all()
    print("yml 스펠:", len(spells))
    for f in OUT_P.glob("mss_*.json"):  # 이전 결과 정리
        f.unlink()
    out = {}
    queue = [s for lst in ROOTS.values() for s in lst]
    missing = []
    while queue:
        name = re.sub(r"\(.*\)$", "", str(queue.pop()).strip())
        if name in out or name.startswith("DELAY"):
            continue
        v = spells.get(name)
        if not v:
            missing.append(name)
            continue
        cls = str(v["spell-class"]).lstrip(".")
        d = {"c": cls}
        for k in KEEP.get(cls, []):
            if k in v:
                d[k] = v[k]
        if "cooldown" in v:
            d["cooldown"] = v["cooldown"]
        mods = [str(m) for m in (v.get("modifiers") or [])]
        if mods:
            d["modifiers"] = mods
        fx = conv_effects(v)
        if fx:
            d["fx"] = fx
        out[name] = d
        refs = list(v.get("spells") or []) + ([v["spell"]] if v.get("spell") else [])
        refs += [m.split("castinstead")[-1].strip() for m in mods if "castinstead" in m]
        refs += [str(c).split(" ", 1)[1] for c in (v.get("command-to-execute") or []) if str(c).startswith("c ")]
        for r in refs:
            if r:
                queue.append(str(r).strip())
    # 단순 입자 뿌리기 (effect: particles / 흡혈 선)
    burst = {"format_version": "1.10.0", "particle_effect": {"description": {"identifier": "rpg:mss_burst", "basic_render_parameters": {"material": "particles_alpha", "texture": "textures/particle/particles"}},
        "components": {"minecraft:emitter_rate_instant": {"num_particles": "variable.n"}, "minecraft:emitter_lifetime_once": {"active_time": 0.05},
            "minecraft:emitter_shape_sphere": {"radius": "variable.r", "direction": "outwards"}, "minecraft:particle_lifetime_expression": {"max_lifetime": f"0.6 + {R4} * 0.4"},
            "minecraft:particle_initial_speed": 0.3, "minecraft:particle_motion_dynamic": {"linear_drag_coefficient": 2},
            "minecraft:particle_appearance_billboard": {"size": [f"0.2 * (1 - {AGE} * 0.7)", f"0.2 * (1 - {AGE} * 0.7)"], "facing_camera_mode": "lookat_xyz",
                "uv": {"texture_width": 16, "texture_height": 16, "uv": [f"math.floor({R4} * 2) + 6", 0], "uv_size": [1, 1]}},
            "minecraft:particle_appearance_tinting": {"color": ["variable.color.r", "variable.color.g", "variable.color.b", 1]}}}}
    (OUT_P / "mss_burst.json").write_text(json.dumps(burst))
    OUT_JS.write_text(
        "// 자동 생성 (ms_convert.py): 자바 MagicSpells yml 을 옮긴 스펠 데이터. 직접 고치지 말고 yml 을 고친 뒤 다시 생성.\n"
        f"export const ROOTS = {json.dumps(ROOTS, ensure_ascii=False)};\n"
        f"export const SPELLS = {json.dumps(out, ensure_ascii=False)};\n"
    )
    print("변환 스펠:", len(out), "| 파티클 파일:", len(made), "| 없는 스펠:", sorted(set(missing))[:15])


if __name__ == "__main__":
    main()
