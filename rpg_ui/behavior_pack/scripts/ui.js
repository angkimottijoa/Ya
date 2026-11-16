// RPG 화면 빌더 → ActionFormData. 레이아웃은 resource_pack/ui/rpg_form.json 참고.
import { ActionFormData } from "@minecraft/server-ui";
import { system } from "@minecraft/server";

/** 문자열 / RawMessage / 배열 → RawMessage */
export function rt(...parts) {
  const raw = [];
  for (const p of parts.flat()) {
    if (p === undefined || p === null || p === "") continue;
    if (typeof p === "string" || typeof p === "number") raw.push({ text: String(p) });
    else if (p.rawtext) raw.push(...p.rawtext);
    else raw.push(p);
  }
  return { rawtext: raw.length ? raw : [{ text: "" }] };
}

export class Screen {
  /** mode: "G" 그리드 | "H" 타일 | "L" 리스트 */
  constructor(mode, crumb) {
    this.mode = mode;
    this.crumb = crumb;
    this.items = [];
    this.tabs = [];
    this.chips = [];
    this.sel = null;
    this.bodyText = "";
    this.actions = [];
    this.reopen = null;
  }
  item(text, icon, fn, opt = {}) {
    this.items.push({ text, icon, fn, ...opt });
    return this;
  }
  tab(label, icon, fn, on = false) {
    this.tabs.push({ text: label, icon, fn, on });
    return this;
  }
  chip(icon, text) {
    this.chips.push({ text, icon });
    return this;
  }
  select(text, icon) {
    this.sel = { text, icon };
    return this;
  }
  body(b) {
    this.bodyText = b;
    return this;
  }
  action(text, fn) {
    this.actions.push({ text, fn });
    return this;
  }

  async show(player, tries = 0) {
    const f = new ActionFormData().title(`[RPG:${this.mode}]${this.crumb}`).body(rt(this.bodyText));
    const handlers = [];
    const add = (marker, e, fn) => {
      f.button(rt(marker, e.text), e.icon || undefined);
      handlers.push(fn ?? null);
    };
    for (const it of this.items) add(`[I]${it.on ? "[ON]" : ""}${it.rarity ? `[R${it.rarity}]` : ""}`, it, it.fn);
    for (const t of this.tabs) add(`[T]${t.on ? "[ON]" : ""}`, t, t.fn);
    for (const c of this.chips) add("[C]", c, null);
    if (this.sel) add("[S]", this.sel, null);
    for (const a of this.actions) add("[A]", { text: a.text }, a.fn);

    const res = await f.show(player);
    if (res.canceled) {
      // 채팅창 등 다른 화면이 열려 있으면 잠시 후 재시도
      if (res.cancelationReason === "UserBusy" && tries < 10) {
        await new Promise((r) => system.runTimeout(r, 10));
        return this.show(player, tries + 1);
      }
      return;
    }
    const h = handlers[res.selection];
    if (h) return h();
    if (this.reopen) return this.reopen();
  }
}
