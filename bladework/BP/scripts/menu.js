import { ActionFormData } from "@minecraft/server-ui";
import { CLASSES } from "./moves.js";
import { classify } from "./weapons.js";
import { getState, saveSetting } from "./state.js";
import { sfx } from "./util.js";

const onOff = v => ({ translate: v ? "bw.ui.on" : "bw.ui.off" });
const tr = (key, ...withParts) => withParts.length ? { translate: key, with: { rawtext: withParts } } : { translate: key };

export function toggleMode(player) {
  const st = getState(player);
  saveSetting(player, st, "mode", !st.mode);
  st.cur = null; st.guarding = false;
  try { player.sendMessage({ translate: st.mode ? "bw.msg.mode_on" : "bw.msg.mode_off" }); } catch { /* ignore */ }
  sfx(player, "random.orb", 0.6, st.mode ? 1.4 : 0.8);
}

function show(form, player, handler) {
  form.show(player).then(r => { if (!r.canceled) handler(r.selection); }).catch(() => { /* player left */ });
}

export function openMenu(player) {
  const st = getState(player);
  const form = new ActionFormData().title(tr("bw.ui.title")).body(tr("bw.ui.body"))
    .button(tr("bw.ui.mode", onOff(st.mode)))
    .button(tr("bw.ui.hud", tr("bw.ui.hud" + st.hud)))
    .button(tr("bw.ui.dodge", onOff(st.dodge)))
    .button(tr("bw.ui.moves"))
    .button(tr("bw.ui.guide"));
  show(form, player, i => {
    if (i === 0) { toggleMode(player); openMenu(player); }
    else if (i === 1) { saveSetting(player, st, "hud", (st.hud + 1) % 3); openMenu(player); }
    else if (i === 2) { saveSetting(player, st, "dodge", !st.dodge); openMenu(player); }
    else if (i === 3) openMoves(player);
    else openGuide(player);
  });
}

function openMoves(player) {
  const w = classify(player);
  const body = [];
  if (!w) body.push(tr("bw.ui.noweapon"));
  else {
    const cls = CLASSES[w.cls];
    body.push({ text: "§l§6" }, tr("bw.class." + w.cls), { text: "§r\n\n" },
      tr("bw.ui.m.combo", { text: String(cls.combo.length) }), { text: "\n" },
      tr("bw.ui.m.dash"), { text: "\n" }, tr("bw.ui.m.air"), { text: "\n\n" },
      tr("bw.ui.m.skill", { text: `${cls.cost}%` }), { text: "\n§b" }, tr("bw.skill." + w.cls), { text: "§r - " },
      tr("bw.skilldesc." + w.cls));
  }
  show(new ActionFormData().title(tr("bw.ui.moves")).body({ rawtext: body }).button(tr("bw.ui.back")), player, () => openMenu(player));
}

function openGuide(player) {
  const body = [];
  for (let i = 1; i <= 5; i++) body.push(tr(`bw.ui.g${i}.t`), { text: "\n" }, tr(`bw.ui.g${i}.b`), { text: "\n\n" });
  body.push(tr("bw.ui.g6"));
  show(new ActionFormData().title(tr("bw.ui.guide")).body({ rawtext: body }).button(tr("bw.ui.back")), player, () => openMenu(player));
}
