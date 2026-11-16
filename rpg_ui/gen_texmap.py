"""바닐라 아이템/블록 typeId → 아이콘 텍스처 경로 표 생성 (배낭 UI 용).

Mojang/bedrock-samples 의 item_texture.json / terrain_texture.json / blocks.json 을 받아
behavior_pack/scripts/texmap.js 로 저장한다. 마크 업데이트 후 다시 실행하면 갱신.
"""
import json
import re
import urllib.request
from pathlib import Path

BASE = "https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/"
OUT = Path(__file__).parent / "behavior_pack" / "scripts" / "texmap.js"


def load(path):
    raw = urllib.request.urlopen(BASE + path).read().decode("utf-8")
    raw = re.sub(r"^\s*//.*$", "", raw, flags=re.M)
    return json.loads(raw)


def first_path(t):
    if isinstance(t, str):
        return t
    if isinstance(t, list):
        return first_path(t[0]) if t else None
    if isinstance(t, dict):
        if "path" in t:
            return t["path"]
        if "textures" in t:
            return first_path(t["textures"])
    return None


def main():
    items = load("textures/item_texture.json")["texture_data"]
    terrain = load("textures/terrain_texture.json")["texture_data"]
    blocks = load("blocks.json")

    item_paths = {}
    for v in items.values():
        tex = v.get("textures")
        for t in tex if isinstance(tex, list) else [tex]:
            p = first_path(t)
            if p:
                item_paths.setdefault(p.rsplit("/", 1)[-1], p)

    block_paths = {}
    for name, v in blocks.items():
        if not isinstance(v, dict) or "textures" not in v:
            continue
        t = v["textures"]
        short = t if isinstance(t, str) else (t.get("side") or t.get("north") or t.get("up") or next(iter(t.values())))
        if short in terrain:
            p = first_path(terrain[short]["textures"])
            if p:
                block_paths[name.replace("minecraft:", "")] = p

    # 이름 번역 키: lang 파일에 item.<id>.name / tile.<id>.name 이 있는 것만 (게임 언어로 표시됨)
    lang = urllib.request.urlopen(BASE + "texts/en_US.lang").read().decode("utf-8")
    keys = {}
    for line in lang.splitlines():
        m = re.match(r"^(item|tile)\.([a-z0-9_]+)\.name=", line)
        if m and m.group(2) not in keys:
            keys[m.group(2)] = m.group(1)
    OUT.write_text(
        "// 자동 생성 파일 (gen_texmap.py). 직접 수정하지 말 것.\n"
        f"export const ITEM_TEX = {json.dumps(item_paths, separators=(',', ':'))};\n"
        f"export const BLOCK_TEX = {json.dumps(block_paths, separators=(',', ':'))};\n"
        f"export const NAME_KEY = {json.dumps(keys, separators=(',', ':'))};\n"
    )
    print(f"name keys {len(keys)}")
    print(f"items {len(item_paths)}, blocks {len(block_paths)} -> {OUT}")


if __name__ == "__main__":
    main()
