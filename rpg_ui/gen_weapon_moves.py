"""3D 무기 전용 플레이어 동작 (V12.29) — 참고 팩(blades)의 구조만 분석해 직접 다시 만듦 (값·키프레임은 새로 작성)
  구조: 무기를 들면(3인칭) 마크 기본 동작(root)을 끄고 무기 전용 상태 기계로 바꿈
    대기(자세 + 숨쉬기) · 걷기(자세 위 + 다리 걷기) · 3연타 (각 타: 준비 → 빠른 일격 → 마무리에서 멈춤, 그다음 0.2초 되돌림,
    계속 공격 중이면 다음 타, 아니면 대기) · 움직이며 공격하면 윗몸 공격 + 다리 걷기를 겹침
  각도 규칙: 팔을 내린 상태에서 무기는 앞(-Z). 무기 앞쪽 기울기 φ(+ 위 / - 아래) = -(팔 X + 손 X) → 손 X = -φ - 팔 X 로 무기 방향을 따로 정함
  1인칭 · 탈것 · 잠자기 · 수영 중에는 마크 기본 동작 그대로
"""
import json
from pathlib import Path

ROOT = Path(__file__).parent
RP = ROOT / "resource_pack"
W = {  # 무기 → 동작 종류 (gen_weapons3d.py 의 아이템과 같음)
    "hundun_scythe": ("hundun_scythe", "reap"),
    "cheongryong_lance": ("cheongryong_sword", "thrust"),
    "baekho_axe": ("baekho_axe", "chop"),
    "jujak_bow": ("jujak_bow", "bow"),
    "hyeonmu_shield": ("hyeonmu_shield", "bash"),
}


def arm(x, phi, y=0, z=0):
    """오른팔 X(+ 뒤 / - 앞으로 듦) · 무기 기울기 φ → (오른팔 회전, 손 회전)"""
    return {"rightArm": [x, y, z], "rightItem": [-phi - x, 0, 0]}


def P(**kw):  # 자세: 뼈 → 회전 (position 은 *_pos)
    out = {}
    for k, v in kw.items():
        if k == "R": out.update(v)
        else: out[k] = v
    return out


# ── 무기별 자세 · 3연타 (준비, 일격, 마무리) ──
KINDS = {
    "reap": {  # 낫: 낮게 깔고(날이 아래), 수평으로 크게 베어 넘김 → 되베기 → 머리 위에서 내려 거둠
        "stance": P(R=arm(-25, -25), body=[6, 18, 0], leftArm=[-25, 0, -18], head=[0, -10, 0]),
        "hits": [
            (P(R=arm(-80, -5, 70), body=[4, 50, 0], leftArm=[-40, 30, -20]), P(R=arm(-85, -10, -60), body=[10, -55, 0], leftArm=[-10, -20, -40]), P(R=arm(-70, -20, -75), body=[8, -60, 0], leftArm=[0, -10, -45])),
            (P(R=arm(-85, -5, -60), body=[6, -55, 0], leftArm=[-20, -30, -30]), P(R=arm(-80, -10, 75), body=[10, 55, 0], leftArm=[-40, 30, -10]), P(R=arm(-70, -20, 80), body=[8, 60, 0], leftArm=[-30, 30, -5])),
            (P(R=arm(-170, 160), body=[-12, 10, 0], leftArm=[-150, 0, -20]), P(R=arm(-45, -50), body=[28, 0, 0], leftArm=[-60, 0, -20], waist_pos=[0, -2.5, 0]), P(R=arm(-30, -70), body=[24, 0, 0], leftArm=[-40, 0, -20], waist_pos=[0, -2, 0])),
        ]},
    "thrust": {  # 창: 옆으로 선 자세에서 수평으로 겨눔 → 찌르기 · 한 걸음 더 깊게 찌르기 · 휘둘러 쓸기
        "stance": P(R=arm(-40, 0), body=[0, 32, 0], leftArm=[-55, 35, 0], head=[0, -25, 0]),
        "hits": [
            (P(R=arm(-20, 5), body=[0, 40, 0], leftArm=[-60, 30, 0]), P(R=arm(-88, 0), body=[6, 10, 0], leftArm=[-30, 10, -20], root_pos=[0, 0, -3]), P(R=arm(-85, 0), body=[6, 8, 0], leftArm=[-25, 5, -20], root_pos=[0, 0, -3])),
            (P(R=arm(-15, 5), body=[-4, 45, 0], leftArm=[-65, 30, 0]), P(R=arm(-92, -2), body=[10, 0, 0], leftArm=[-20, 0, -30], root_pos=[0, -1, -5]), P(R=arm(-88, -2), body=[10, 0, 0], leftArm=[-20, 0, -30], root_pos=[0, -1, -5])),
            (P(R=arm(-75, 10, 70), body=[0, 55, 0], leftArm=[-40, 30, 0]), P(R=arm(-80, 0, -70), body=[6, -45, 0], leftArm=[-10, -20, -40]), P(R=arm(-70, -10, -75), body=[6, -50, 0], leftArm=[0, -10, -40])),
        ]},
    "chop": {  # 도끼: 비스듬히 들고 → 머리 위에서 내려찍기 · 대각선 베기 · 무겁게 몸을 실어 내려찍기
        "stance": P(R=arm(-20, 45), body=[4, 12, 0], leftArm=[-20, 0, -15]),
        "hits": [
            (P(R=arm(-165, 170), body=[-15, 5, 0], leftArm=[-140, 0, -15]), P(R=arm(-50, -40), body=[30, 0, 0], leftArm=[-50, 0, -20], waist_pos=[0, -2, 0]), P(R=arm(-25, -60), body=[25, 0, 0], leftArm=[-30, 0, -20], waist_pos=[0, -2, 0])),
            (P(R=arm(-150, 150, 0, 45), body=[-8, 35, 0], leftArm=[-60, 20, -15]), P(R=arm(-45, -35, 0, -40), body=[20, -30, 0], leftArm=[-20, -10, -30]), P(R=arm(-30, -55, 0, -45), body=[18, -35, 0], leftArm=[-10, -10, -30])),
            (P(R=arm(-178, 175), body=[-20, 0, 0], leftArm=[-175, 0, -10], waist_pos=[0, 0.5, 0]), P(R=arm(-40, -45), body=[38, 0, 0], leftArm=[-60, 0, -10], waist_pos=[0, -3.5, 0]), P(R=arm(-20, -70), body=[34, 0, 0], leftArm=[-40, 0, -15], waist_pos=[0, -3, 0])),
        ]},
    "bow": {  # 활: 앞으로 겨눠 들고(활대는 세움) 왼손으로 시위 → 쏘면 반동
        "stance": P(rightArm=[-85, 0, 0], rightItem=[85, 0, 0], leftArm=[-85, 35, 0], body=[0, 15, 0], head=[0, -10, 0]),
        "hits": [
            (P(rightArm=[-88, 0, 0], rightItem=[88, 0, 0], leftArm=[-88, 45, 0], body=[0, 18, 0]), P(rightArm=[-100, 0, 0], rightItem=[100, 0, 0], leftArm=[-70, 20, -20], body=[-4, 12, 0]), P(rightArm=[-92, 0, 0], rightItem=[92, 0, 0], leftArm=[-75, 25, -15], body=[-2, 14, 0])),
        ] * 3},
    "bash": {  # 방패: 앞에 세워 들고 → 밀쳐 치기 · 몸통 박치기 · 내려찍기
        "stance": P(rightArm=[0, 0, 0], rightItem=[0, 90, 0], rightItem_pos=[-2.5, 3, 0], leftArm=[-10, 0, -8], body=[0, 6, 0]),  # 팔 X 와 손 Y 를 섞으면 방패가 비스듬히 기울었음 → 팔은 곧게 내리고 손은 Y 만 (방패가 땅과 직각)  # 기본: 팔을 내리고 방패를 손 옆에 세워 거치 (면이 바깥쪽)
        "guard": P(rightArm=[-70, 15, 0], rightItem=[70, 0, 0], leftArm=[-20, 0, -15], body=[4, 10, 0]),  # 패링 · 막기(우클릭 누름): 앞으로 세워 듦
        "hits": [
            (P(rightArm=[-50, 25, 0], rightItem=[50, 0, 0], body=[0, 25, 0]), P(rightArm=[-95, 0, 0], rightItem=[95, 0, 0], body=[14, -5, 0], root_pos=[0, 0, -3]), P(rightArm=[-90, 0, 0], rightItem=[90, 0, 0], body=[12, -5, 0], root_pos=[0, 0, -3])),
            (P(rightArm=[-60, 20, 0], rightItem=[60, 0, 0], body=[-6, 30, 0], waist_pos=[0, -1, 0]), P(rightArm=[-80, -10, 0], rightItem=[80, 0, 0], body=[20, -20, 0], root_pos=[0, 0, -4]), P(rightArm=[-78, -10, 0], rightItem=[78, 0, 0], body=[18, -20, 0], root_pos=[0, 0, -4])),
            (P(rightArm=[-160, 0, 0], rightItem=[160, 0, 0], body=[-12, 0, 0]), P(rightArm=[-40, 0, 0], rightItem=[40, 0, 0], body=[30, 0, 0], waist_pos=[0, -3, 0]), P(rightArm=[-35, 0, 0], rightItem=[35, 0, 0], body=[28, 0, 0], waist_pos=[0, -3, 0])),
        ]},
}
T_WIND, T_HIT, T_END, T_BACK = 0.11, 0.17, 0.3, 0.14  # 3인칭 때리기 (0.7배 시간 = 더 빠르게)
FP_SIZE = {"jujak_bow": 1.45 * 1.3, "baekho_axe": 1.6, "hyeonmu_shield": 1.3 * 2.6 / 1.9}  # 방패 1인칭 배율 (모델 크기에 곱해짐: 3인칭만 1.45 로 줄이고 1인칭은 V12.69 크기 그대로)  # 1인칭 무기별 크기 배율
FP_SCALE = 0.63  # V12.39 크기
FP_POS = [0.2, 0, 0]  # V12.39 (게임에서 확인된 자리)
FP_ROT = [0, 55, 0]  # V12.39: 긴 축이 사용자 빨간 긴 축과 일치
FP_TILT = {"jujak_bow": 135, "hyeonmu_shield": 135}  # 1인칭 가로축(X) 둘레: 근접 45° (V12.50 확정), 활 135° (-45 는 앞쪽이 플레이어 뒤를 향했음 → 가로축 180°)
FP_SPIN = {n: (180 if n in ("jujak_bow", "hyeonmu_shield") else -15) for n in W}  # 방패도 가로축 180° 뒤집어 1인칭에서 뒷면(손잡이 쪽)이 보이게, 위아래는 긴 축 180° 로 되돌림  # 1인칭 긴 축 둘레: 왼쪽 옆면이 살짝 보이게 -15° (12° 는 오른쪽이 보였음) · 활은 위아래 유지용 180°
UPPER = ("body", "head", "rightArm", "leftArm", "rightItem", "waist_pos", "root_pos")


def chan(bone):
    return (bone[:-4], "position") if bone.endswith("_pos") else (bone, "rotation")


FP_GUARD = "(q.is_using_item ? math.min(1, q.main_hand_item_use_duration * 10) : 0)"  # 우클릭(패링·막기) 들어 올림 0→1 (0.1초)
FP_SHIELD_SIDE = 30  # (V12.78 15° → 더 많이) (-15 는 오른쪽이 보였음) 방패 1인칭: 세로축으로 살짝 돌려 왼쪽 측면이 조금 보이게 (기본·패링 모두)
FP_REST_TURN = -90  # (+90 은 반대쪽이었음) 방패 1인칭: 기본은 방패를 세로축으로 90° 돌려 옆을 봄 · 패링(우클릭) 중엔 0° (정면)


FP_POS_EXTRA = {"hyeonmu_shield": [2.5, 2.5, 0]}  # 방패 1인칭: 시점 후방(화면 오른쪽 아래 바깥)으로 (시뮬: +x 아래, +y 오른쪽 · z -4 는 화면 안쪽으로 들어와 보였음)


def fp_pos(name):
    e = FP_POS_EXTRA.get(name, [0, 0, 0])
    return [FP_POS[i] + e[i] for i in range(3)]


def keyed(frames):
    """[(t, pose)] → bones (뼈마다 rotation/position 키프레임; 없는 뼈는 0)"""
    names = sorted({b for _, p in frames for b in p})
    bones = {}
    for b in names:
        bn, ch = chan(b)
        bones.setdefault(bn, {})[ch] = {f"{t:.2f}": p.get(b, [0, 0, 0]) for t, p in frames}
    return bones


def build():
    anims, ctrls, ent_anims = {}, {}, {}
    for kind, d in KINDS.items():
        st = d["stance"]
        base = f"animation.rpg_w3d.{kind}"
        # 대기 윗몸: 자세 + 숨쉬기 (몸 · 왼팔이 살짝 오르내림)
        breathe = {k: ([v[0] + 2, v[1], v[2]] if k in ("body", "leftArm") else v) for k, v in st.items()}
        anims[f"{base}.stance_up"] = {"loop": True, "animation_length": 2.0, "bones": keyed([(0, st), (1.0, breathe), (2.0, st)])}
        # 대기 다리: 앞뒤로 벌려 섬 · 살짝 낮춤
        anims[f"{base}.stance_down"] = {"loop": True, "bones": {"rightLeg": {"rotation": [14, 0, 4]}, "leftLeg": {"rotation": [-12, 0, -4]}, "waist": {"position": [0, -0.5, 0]}}}
        # 걷기 다리: 0.8초에 한 걸음씩 + 몸이 위아래로 출렁
        anims[f"{base}.walk_down"] = {"loop": True, "animation_length": 0.8, "bones": {
            "rightLeg": {"rotation": {"0.00": [32, 0, 0], "0.40": [-32, 0, 0], "0.80": [32, 0, 0]}},
            "leftLeg": {"rotation": {"0.00": [-32, 0, 0], "0.40": [32, 0, 0], "0.80": [-32, 0, 0]}},
            "root": {"position": {"0.00": [0, 0, 0], "0.20": [0, 0.8, 0], "0.40": [0, 0, 0], "0.60": [0, 0.8, 0], "0.80": [0, 0, 0]}}}}
        if "guard" in d:
            gd = d["guard"]
            anims[f"{base}.guard"] = {"loop": True, "bones": keyed([(0, gd)])}
            anims[f"{base}.guard_in"] = {"loop": "hold_on_last_frame", "animation_length": 0.08, "bones": keyed([(0, st), (0.08, gd)])}
        for i, (wind, hit, end) in enumerate(d["hits"], 1):
            anims[f"{base}.atk{i}"] = {"loop": "hold_on_last_frame", "animation_length": T_END, "bones": keyed([(0, st), (T_WIND, wind), (T_HIT, hit), (T_END, end)])}
            anims[f"{base}.atk{i}b"] = {"loop": "hold_on_last_frame", "animation_length": T_BACK, "bones": keyed([(0, end), (T_BACK, st)])}
    for name, (item, kind) in W.items():
        base = f"animation.rpg_w3d.{kind}"
        a = lambda s: f"rpgw_{kind}_{s}"
        for s in ["stance_up", "stance_down", "walk_down", "atk1", "atk1b", "atk2", "atk2b", "atk3", "atk3b"] + (["guard", "guard_in"] if "guard" in KINDS[kind] else []):
            ent_anims[a(s)] = f"{base}.{s}"
        legs = [{a("walk_down"): "q.modified_move_speed >= 0.1"}, {a("stance_down"): "q.modified_move_speed < 0.1"}]
        go = "!v.rpg_fr && v.rpg_atk"
        states = {
            "default": {"transitions": [{"atk1": go}, {"idle": "1"}]},
            "idle": {"animations": [a("stance_up")] + legs, "transitions": [{"atk1": go}], "blend_transition": 0.15},
        }
        if "guard" in KINDS[kind]:  # 우클릭을 누르는 동안(패링 창 · 막기) 방패를 앞으로 듦
            states["idle"]["transitions"].insert(0, {"guard_in": "q.is_using_item"})
            states["guard_in"] = {"animations": [a("guard_in")] + legs, "transitions": [{"guard": "q.any_animation_finished"}, {"idle": "!q.is_using_item"}]}
            states["guard"] = {"animations": [a("guard")] + legs, "transitions": [{"atk1": go}, {"idle": "!q.is_using_item"}], "blend_transition": 0.12}
        for i in (1, 2, 3):
            nxt = f"atk{i % 3 + 1}"
            states[f"atk{i}"] = {"animations": [a(f"atk{i}")] + legs, "transitions": [{f"atk{i}b": "q.any_animation_finished"}], "blend_transition": 0.05}
            states[f"atk{i}b"] = {"animations": [a(f"atk{i}b")] + legs, "transitions": [{nxt: f"q.any_animation_finished && {go}"}, {"idle": "q.any_animation_finished && !v.rpg_atk"}]}
        ctrls[f"controller.animation.rpg_w3d.{name}"] = {"initial_state": "default", "states": states}
        ent_anims[f"rpgw_ctrl_{name}"] = f"controller.animation.rpg_w3d.{name}"
    # 1인칭: 무기가 화면을 가리지 않게 손 쪽으로 0.4배 (픽셀 수는 그대로, 크기만)
    for name in W:  # 무기마다 1인칭 긴 축 돌리기 (날이 있는 무기만)
        sw = "math.sin(math.clamp(variable.attack_time * 1.6, 0, 1) * 180)"  # 1.6배 빠르게 (휘두르기 시간 앞 60% 안에 끝)  # 때리기 · 블록 · 몹 · 스킬 휘두름 (게임이 주는 휘두르기 시간)
        if name == "jujak_bow":  # 활: 쏘면 뒤로 튕기고 살짝 들림
            # 당기기(사용 중): 내 쪽으로 당기고 살짝 들림 · 쏘기(휘두르기 시간): 앞으로 튕겼다 반동으로 돌아옴
            draw = "(q.is_using_item ? math.min(1, q.main_hand_item_use_duration * 3) : 0)"
            # Y +15: 활은 세로축 둘레로 돌려 왼쪽 옆면이 살짝 (-15 는 반대쪽이었음)
            spin = {"rotation": [f"{draw} * -8 + {sw} * 14", 15, FP_SPIN.get(name, 0)], "position": [0, f"{draw} * 0.6", f"{draw} * 3 - {sw} * 2.5"]}
        else:  # 근접: 앞 · 아래로 내려침
            turn = f" + {FP_SHIELD_SIDE} + (1 - {FP_GUARD}) * {FP_REST_TURN}" if "guard" in KINDS[W[name][1]] else ""
            spin = {"rotation": [f"{sw} * 70", f"{sw} * -30{turn}", FP_SPIN.get(name, 0)]}  # 앞·아래로 내려치며(X) 왼쪽 대각선으로(Y -30, +30 은 오른쪽이었음)
        anims[f"animation.rpg_w3d.fp_{name}"] = {"loop": True, "bones": {"rpg_w3d": {"scale": FP_SCALE * FP_SIZE.get(name, 1), "rotation": FP_ROT, "position": fp_pos(name)},  # 활은 1인칭에서 더 크게
                                                                          "rpg_w3d_tilt": {"rotation": [FP_TILT.get(name, 45) if isinstance(FP_TILT, dict) else FP_TILT, 0, 0]},
                                                                          "rpg_w3d_spin": spin}}
        ent_anims[f"rpgw_fp_{name}"] = f"animation.rpg_w3d.fp_{name}"
    return anims, ctrls, ent_anims


def main():
    anims, ctrls, ent_anims = build()
    (RP / "animations" / "rpg_w3d_moves.animation.json").write_text(json.dumps({"format_version": "1.8.0", "animations": anims}, indent=1))
    (RP / "animation_controllers").mkdir(parents=True, exist_ok=True)
    (RP / "animation_controllers" / "rpg_w3d.animation_controllers.json").write_text(json.dumps({"format_version": "1.10.0", "animation_controllers": ctrls}, indent=1))
    # 플레이어 정의(gen_weapons3d.py 가 만든 것)에 연결: 무기를 들면(3인칭) 기본 동작 root 를 끄고 무기 상태 기계 + 기본 자세 · 고개 돌리기만 남김
    pe = RP / "entity" / "player.entity.json"
    van = json.loads(pe.read_text()); de = van["minecraft:client_entity"]["description"]
    de["animations"].update(ent_anims)
    held = " || ".join(f"query.get_equipped_item_name == '{item}'" for item, _ in W.values())
    pre = de["scripts"].setdefault("pre_animation", [])
    pre[:] = [x for x in pre if not x.startswith("v.rpg_")] + [
        f"v.rpg_w = {held};",
        "v.rpg_fr = variable.is_first_person || query.is_riding || query.is_sleeping || query.is_swimming || query.is_gliding;",
        "v.rpg_atk = variable.attack_time > 0.0;",
    ]
    anim = [{"root": "!v.rpg_w || v.rpg_fr"}, {"humanoid_base_pose": "v.rpg_w && !v.rpg_fr"}, {"look_at_target_default": "v.rpg_w && !v.rpg_fr"}, {"cape": "v.rpg_w && !v.rpg_fr"}]
    for name, (item, _) in W.items():
        anim.append({f"rpgw_ctrl_{name}": f"!v.rpg_fr && query.get_equipped_item_name == '{item}'"})
    anim.append({"attack.rotations": "v.rpg_w && !v.rpg_fr && variable.attack_time > 0"})  # 3인칭: 마크 기본 팔 휘두르기도 겹침 (때리기 · 블록 · 몹)
    for name, (item, _) in W.items():
        anim.append({f"rpgw_fp_{name}": f"variable.is_first_person && query.get_equipped_item_name == '{item}'"})
    de["scripts"]["animate"] = anim
    pe.write_text(json.dumps(van, indent=1))
    print(len(anims), "animations,", len(ctrls), "controllers")


if __name__ == "__main__":
    main()
