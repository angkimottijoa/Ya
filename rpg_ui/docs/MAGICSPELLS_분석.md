# 자바 MagicSpells → 베드락 이식 · 분석 · 재창조 (Arcania V2.9)

## 0. 진행 순서
1. **자바 → 베드락 스펠**: MagicSpells 의 스펠 클래스를 스크립트 엔진(`behavior_pack/scripts/ms.js`)으로 옮김
2. **효과 → 커스텀 파티클 + 모션**: EffectLib 효과를 Molang 파티클(`gen_particles.py` → `rpg_ms_*.json`)로,
   시전 동작을 플레이어 애니메이션(`gen_anims.py`)으로
3. **최종 분석**: 받은 스펠 13종(약 20만 줄)에서 반복되는 문법을 뽑음 (아래 2장)
4. **학습 후 재창조**: 그 문법으로 직업 스킬 60개를 새로 설계 (`spellbook.js`, `jobs.js`)

## 1. 받은 자료 통계
| 항목 | 수 |
|---|---|
| ParticleProjectileSpell | 245 |
| PainSpell / AreaEffectSpell | 62 / 60 |
| MultiSpell / TargetedMultiSpell | 45 / 41 |
| PotionEffect / Leap / Forcetoss / Stun / Drainlife / Shadowstep | 40 / 22 / 14 / 11 / 10 / 5 |
| EffectLib EquationEffect | **9000** (거의 전부 `redstone` 먼지) |
| AnimatedBall / Sphere / Helix / Modified / Star / Vortex | 53 / 32 / 12 / 10 / 8 / 6 |
| ColoredImageEffect (응룡 획 이미지) | 20 |

→ 화려함의 정체는 "특수 이펙트"가 아니라 **작은 색 먼지로 그린 수식 곡선**과 **짧은 DELAY 로 쪼갠 연속 판정**.

## 2. 뽑아낸 문법 (재창조에 쓴 규칙)
| # | 패턴 | 원본 예 | 엔진 표현 |
|---|---|---|---|
| ① | 같은 모양을 반지름 0.3씩 바꿔 계열색 3~4겹 | 바이던트 8EEBEC→438D80 4겹 | `layered(pal, ...)` |
| ② | Leap 직후 1틱 간격 AreaEffect 6번 | 총칼 SLCMulti1 | `dash_slash`, `blade_tempest` |
| ③ | 예고(표식·고리) → DELAY → 큰 효과 | 크티아스 멸망의 마도서 (DELAY 25) | `apocalypse`, `meteor_rain` |
| ④ | 높이를 낮추며 고리를 순서대로 | 크티아스 y=12,9,6,3 | `apocalypse` |
| ⑤ | yEquation = k·t → 감기며 오르는 회오리 | `0.0055t-1` | `coil()` |
| ⑥ | 투사체 진행 위치마다 작은 식 효과 | 클라우 초승달 호 | `proj({ trail })` |
| ⑦ | 마지막 타격에 Forcetoss 수직 + 구 확산 | 총칼, 도살자 | `toss()` + `ball({ grow })` |
| ⑧ | 머리 위 표식 반복으로 "몇 대 맞는지" 보여 줌 | 총칼 RCtarget1~3 | `mark()` + `multiOn()` |
| ⑨ | `(a - b·t)·cos(w·t)` 줄어드는/늘어나는 나선 | 클라우 SLCdummy1, 크티아스 | 항의 `g` 계수 |

## 3. 이식 대응표
### 스펠 클래스
| MagicSpells | 엔진 함수 | 메모 |
|---|---|---|
| MultiSpell (`DELAY n`) | `multi(ctx, [fn, "DELAY n", ...])` | 문법 그대로 |
| TargetedMultiSpell | `multiOn(ctx, target, [...])` | 대상이 죽으면 중단 |
| LeapSpell forward/upward | `leap(p, f, u)` | 값 10 ≈ 1블록/틱 |
| AreaEffectSpell | `area(ctx, center, r, fn, max)` | |
| ParticleProjectileSpell | `proj(ctx, {...})` | horiz-offset = `yawOff`, hug-surface = `hug` |
| Pain / Drainlife / Forcetoss | `pain` / `drain` / `toss` | toss 음수 = 끌어당김 |
| Stun / Potion / Shadowstep | `stun` / `potion` / `shadowstep` | stun = 강한 둔화+약화 |
| Invulnerability / Invisibility / Dot | `invuln` / `invis` / `dot` | |

### EffectLib → 파티클
| EffectLib | 파티클 | 방법 |
|---|---|---|
| EquationEffect | `rpg:ms_curve` | 축마다 `(a + g·t)·sin/cos(w·t + p) + b·t + c` 를 Molang 으로 계산. `orient` = 시선 yaw 회전 |
| Sphere / Modified(radius=t·k) / AnimatedBall | `rpg:ms_ball` | 구면 균등 분포 + `grow` 속도로 퍼짐, `fx/fy/fz` 로 타원체 |
| Helix / Vortex | `rpg:ms_helix` | 가닥 수·비틀림·벌어짐(flare) |
| StarEffect | `rpg:ms_star` | 황금각으로 가시 방향 분배 |
| redstone 먼지 | 공통 | 바닐라 파티클 점(이미지 추가 없음), 불투명, 끝에서 작아짐 |

식 변환: EffectLib 의 `t` 는 0..particles, 각도 단위 라디안.
`3.8sin(0.0125t)` + `particles: 255` → `S(3.8, 0.0125·255·57.3 = 183°)`.

한 번의 스크립트 호출이 파티클 이미터 1개를 만들고, 점 수백 개는 클라이언트의 Molang 이 그린다.
자바처럼 서버가 점마다 패킷을 보내지 않아서 모바일에서도 가볍다.

## 4. 재창조 결과 (직업별 ①클릭 ②쉬프트+클릭 ③쉬프트+점프)
- 전사 계열(강철/피): 초승달 회전베기 · 질풍 연참 · 일섬 · 심판 · 검풍난무 · 대지 가르기 · 도살 · 처형
- 궁수 계열(숲): 관통 사격 · 화살비 · 나선 저격 · 오연사 · 천공의 화살 · 화살 폭풍 · 창 돌격 · 야수의 포효
- 마법 계열(달/화염/얼음/번개): 화염 연탄 · 혈풍 · 서리 폭풍 · 순간 이동 · 멸망의 마도서 · 운석 비 · 낙뢰 · 연쇄 번개 · 폭풍의 눈
- 신성 계열(빛): 치유의 빛 · 신성 강타 · 수호의 빛 · 성역 · 신성 돌진 · 천벌 · 심판의 도약

제작자 도구 > 무기·스킬 > **스펠 시험장**: 모든 스펠을 팔레트를 바꿔 가며 바로 시전 (원본 표시).
제작자 도구 > 직업 스킬 편집기: 스킬마다 효과·발동 키·색 팔레트를 바꿔 새 스킬 제작.

## 5. 이식하지 않은 것
- ColoredImageEffect(이미지를 점으로 찍기): 이번 방침(이미지 없이 수식)에 맞춰 제외. 필요하면 PNG → 점 목록 굽기로 추가 가능.
- PassiveSpell(조건 발동), 변수(variables) 누적형 패시브: 다음 단계 후보.

## 6. V3.0: "거의 그대로" 이식으로 전환
- 직접 재설계(spellbook) 대신 **yml 원본을 변환기로 그대로** 옮김: `ms_convert.py` → `msdata.js` + `rpg:mss_*` 파티클 609개
- 식 변환 예: `2cos(1+8t)2sin(0.001 * (1-2t))` → `2*math.cos(57.29578*(1+8*(T)))*2*math.sin(57.29578*(0.001*(1-2*(T))))`, T = 정수 점 번호
- 반복(iterations = duration/50/period)과 cycle 을 따라 "그려지는" 효과는 시간 순서대로, cycle 이면 한 번에
- orient: EffectLib rotateVector(yaw) 와 같은 축 (로컬 z = 앞, x = 왼쪽)
- 원본에 있지만 의미가 다른 것: sneaking 조건은 발동 키(②③)가 대신, potioneffect/variable 조건은 무시
