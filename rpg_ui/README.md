# Arcania RPG UI (Minecraft Bedrock)

바닐라 HUD 위에 **메뉴바(메뉴 설정 버튼)** 와 그 **아래 퀘스트창** 을 얹는 리소스팩 + 비헤이비어팩.
마크 기본 UI 느낌이 안 나도록 남색 + 금테 테마의 전용 텍스처를 쓴다.

![preview](preview.png)

## 구성
| 경로 | 내용 |
|---|---|
| `resource_pack/ui/rpg_hud.json` | 메뉴바, 메뉴 버튼(기본/호버/눌림), 퀘스트창 |
| `resource_pack/ui/hud_screen.json` | HUD 루트에 위 UI 삽입 + `quest:` title 을 화면 중앙에 안 띄우게 숨김 |
| `resource_pack/textures/ui/rpg/` | 텍스처 (`gen_textures.py` 로 생성, 색은 `PALETTE` 수정 후 재실행) |
| `behavior_pack/scripts/main.js` | 메뉴 설정 폼, 퀘스트창 갱신 |
| `behavior_pack/items/menu_book.json` | 메뉴를 여는 아이템 `rpg:menu` |

설치: 두 폴더를 각각 `resource_packs/`, `behavior_packs/` 에 넣고 월드에 둘 다 적용.

## 퀘스트창 갱신
퀘스트창은 `quest:` 로 시작하는 title 을 받아 저장/표시한다 (중앙 title 로는 안 뜸).
```
/scriptevent rpg:quest §e[메인] 마을의 위기\n§7- 고블린 처치 §f(3/5)
/titleraw @s title {"rawtext":[{"text":"quest:§e[서브] 약초 수집"}]}   # 스크립트 없이도 가능
/titleraw @s title {"rawtext":[{"text":"quest:"}]}                   # 퀘스트창 숨김
```
스크립트에선 `setQuest(player, text)` 사용.

## 메뉴 버튼 관련 제약 (중요)
베드락 HUD 버튼은 **스크립트로 클릭 이벤트를 보낼 수 없다.** PC 에선 마우스가 잠겨 있어 HUD 클릭 자체가 안 된다.
그래서 버튼은 HUD 에 디자인으로 두고, 실제 메뉴(폼)는 아래로 연다:
- `메뉴 설정` 아이템(`/give @s rpg:menu`) 사용
- `/scriptevent rpg:menu` (커맨드 블록, NPC 대화 버튼 등)

메뉴 → 퀘스트 확인 / 설정(퀘스트창 표시 토글) / 닫기.
