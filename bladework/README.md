# Bladework Combat (Minecraft Bedrock add-on)

An original melee-combat overhaul for Minecraft Bedrock: weapon-class combos, stamina, dodge rolls,
guard / parry, weapon arts, and 25 new weapons. All code, textures and animations in this folder are
original and generated from source in this repository (`tools/build.py`, `BP/scripts`).

> **Status: not yet tested in the game.** The scripts pass a simulated test against a mock of the
> scripting API, and all JSON is generated and parsed, but nothing here has been loaded in a real
> Bedrock client. Expect to tune numbers (`BP/scripts/config.js`, `moves.js`) and animation poses.

## Install

1. Open `dist/Bladework.mcaddon` with Minecraft (or unzip it and copy `Bladework_BP` / `Bladework_RP`
   into `development_behavior_packs` / `development_resource_packs`).
2. Enable both packs on a world. No experimental toggles are needed.
3. Requires a Bedrock version that provides `@minecraft/server` **2.6.0** (26.10 or newer). On other
   versions change the version in `BP/manifest.json` (or in `tools/build.py` and rebuild).

## Controls

| Action | Input |
| --- | --- |
| Combo | Attack repeatedly (each weapon class has its own chain) |
| Dash attack | Attack while sprinting |
| Aerial attack | Attack while falling |
| Guard | Hold sneak with a weapon (blocks the front, costs stamina) |
| Parry | Start guarding just before a hit lands (no damage, attacker staggered) |
| Dodge | Double-tap sneak (roll in movement direction, backstep when still) |
| Weapon art | Sneak + attack when the blue gauge is full |
| Menu / settings | Use the **Combat Codex** (given on first join; book + flint) |
| Toggle battle mode | Sneak + use the Codex, or `/scriptevent bw:toggle` |

Weapon classes: sword, axe, mace, trident/spear, bare hands (vanilla items), plus new dagger,
longsword, greatsword, spear and saber in stone / iron / gold / diamond / netherite (smithing).

## Known limits

- Combos advancing on a missed swing rely on the `playerSwingStart` script event; on engines without
  it, moves start only when a hit lands.
- Guarding is built on the Resistance effect and health correction, so the effect icon shows briefly.
- Mobs do not get new attack animations or AI; they can be staggered and launched.
- Player animations are third-person body animations; first-person view shows vanilla arm swings.

## Rebuild

```
pip install pillow
python3 bladework/tools/build.py
```
