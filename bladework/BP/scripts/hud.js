import { CFG } from "./config.js";
import { CLASSES } from "./moves.js";

const SEG = 10;
function bar(ratio, on) {
  const n = Math.max(0, Math.min(SEG, Math.round(ratio * SEG)));
  return on + "▰".repeat(n) + "§8" + "▱".repeat(SEG - n);
}

export function drawHud(player, st, w, t) {
  if (st.hud === 0) return;
  const idleFist = w && w.cls === "fist" && t - (st.lastCombat ?? -999) > 200;
  if (!w || idleFist) {
    if (st.hudShown) { st.hudShown = false; try { player.onScreenDisplay.setActionBar(" "); } catch { /* ignore */ } }
    return;
  }
  st.hudShown = true;
  const cls = CLASSES[w.cls];
  const low = st.stamina < CFG.DODGE_COST || t < st.brokenUntil;
  const ready = st.gauge >= cls.cost;
  const parts = [{ text: `${low ? "§c" : "§e"}⚡ ${bar(st.stamina / CFG.STAMINA_MAX, low ? "§c" : "§e")}  ${ready ? "§b§l" : "§3"}✦§r ${bar(st.gauge / cls.cost, "§b")}` }];
  if (st.hud === 1) {
    if (t < st.flashUntil && st.flash) parts.push({ text: "\n§f§l" }, { translate: st.flash });
    else if (ready) parts.push({ text: "\n§b" }, { translate: "bw.skill." + w.cls }, { text: " §f- " }, { translate: "bw.hud.ready" });
    else if (st.comboShown && t <= st.comboUntil) parts.push({ text: "\n§6" }, { translate: "bw.hud.combo" }, { text: ` §f${st.comboShown}§7/${cls.combo.length}` });
  }
  try { player.onScreenDisplay.setActionBar({ rawtext: parts }); } catch { /* player not ready */ }
}
