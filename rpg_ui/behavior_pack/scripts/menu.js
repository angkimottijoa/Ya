// 플레이어 메뉴 화면들
import { world, EquipmentSlot } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { Screen, rt } from "./ui.js";
import { data, save, stat, xpNeed, addGold, msg, isAdmin, byId, MAX_LV } from "./player.js";
import { CLASSES, STATS, CLASS_CHANGE_COST } from "./classes.js";
import * as Q from "./quests.js";
import * as P from "./party.js";
import { shopList, sellPrice } from "./shop.js";
import {
  ICON, CATS, category, rarity, weaponInfo, armorSlot, iconOf, itemName, STARS, ENCH_KO, roman,
  inv, countItem, removeItem, giveItem,
} from "./itemdb.js";
import { openAdmin } from "./admin.js";

// ───────── 공통 크롬(레일 + 재화 칩) ─────────
const SECTIONS = [
  { id: "home", name: "홈", icon: "home", open: (p) => openHome(p) },
  { id: "profile", name: "내 정보", icon: "profile", open: (p) => openProfile(p) },
  { id: "class", name: "직업", icon: "class", open: (p) => openClass(p) },
  { id: "party", name: "파티", icon: "party", open: (p) => openParty(p) },
  { id: "quest", name: "퀘스트", icon: "quest", open: (p) => openQuests(p) },
  { id: "bag", name: "배낭", icon: "bag", open: (p) => openBag(p) },
  { id: "shop", name: "상점", icon: "shop", open: (p) => openShop(p) },
  { id: "settings", name: "설정", icon: "settings", open: (p) => openSettings(p) },
];

function chips(scr, p) {
  const d = data(p);
  scr.chip(ICON("level"), `Lv.${d.lv}`);
  scr.chip(ICON("gold"), `${d.gold}`);
}

function chrome(scr, p, current) {
  for (const s of SECTIONS) scr.tab(s.name, ICON(s.icon), () => s.open(p), s.id === current);
  if (isAdmin(p)) scr.tab("제작자 도구", ICON("admin"), () => openAdmin(p), current === "admin");
  chips(scr, p);
  return scr;
}

const clsOf = (p) => CLASSES[data(p).cls] ?? CLASSES.novice;

// ═════════ 홈 ═════════
export function openHome(p) {
  const d = data(p);
  const c = clsOf(p);
  const scr = new Screen("H", "메뉴");
  for (const s of SECTIONS.slice(1)) scr.item(s.name, ICON(s.icon), () => s.open(p));
  if (isAdmin(p)) scr.item("제작자 도구", ICON("admin"), () => openAdmin(p));
  chrome(scr, p, "home");
  scr.select(`${c.color}${p.name}`, ICON(c.icon));
  const active = Object.keys(d.q.a).length;
  const pt = P.partyOf(p.id);
  scr.body(rt(
    `§l${c.name}§r  Lv.${d.lv}\n`,
    d.lv >= MAX_LV ? "§6MAX LEVEL\n" : `§8경험치 §r${d.xp} / ${xpNeed(d.lv)}\n`,
    `§8골드 §r${d.gold}\n\n`,
    `§8진행 중 퀘스트 §r${active}개\n`,
    `§8파티 §r${pt ? pt.name : "없음"}\n`,
    d.pts ? `\n§2미사용 스탯 포인트 ${d.pts}!\n§8내 정보에서 분배하세요.` : "",
    `\n\n§8스킬: §r${c.skill.name}\n§8(메뉴북을 웅크린 채 사용)`,
  ));
  scr.action("퀘스트 게시판", () => openQuests(p));
  scr.reopen = () => openHome(p);
  return scr.show(p);
}

// ═════════ 내 정보 / 스탯 ═════════
export function openProfile(p, sel = "str") {
  const d = data(p);
  const c = clsOf(p);
  const scr = new Screen("L", "내 정보 / 능력치");
  for (const s of STATS) {
    const total = stat(p, s.id);
    scr.item(`§l${s.name}§r  ${total}  §8(분배 ${d.stat[s.id]})`, ICON({ str: "class", dex: "archer", int: "mage", vit: "cleric" }[s.id]),
      () => openProfile(p, s.id), { on: s.id === sel });
  }
  chrome(scr, p, "profile");
  const s = STATS.find((x) => x.id === sel);
  scr.select(`${s.name} (${stat(p, sel)})`, ICON("profile"));
  scr.body(`§l${s.name}§r\n${s.desc}\n\n§8분배 포인트: §r${d.stat[sel]}\n§8직업 보너스: §r${stat(p, sel) - d.stat[sel]}\n\n§2남은 포인트: ${d.pts}\n\n§8${c.name} Lv.${d.lv}`);
  const spend = (n) => () => {
    n = Math.min(n, d.pts);
    if (n > 0) {
      d.stat[sel] += n;
      d.pts -= n;
      save(p);
      p.playSound("random.pop");
    }
    return openProfile(p, sel);
  };
  if (d.pts > 0) {
    scr.action(`${s.name} +1`, spend(1));
    if (d.pts >= 5) scr.action(`${s.name} +5`, spend(5));
  }
  scr.reopen = () => openProfile(p, sel);
  return scr.show(p);
}

// ═════════ 직업 ═════════
export function openClass(p, sel) {
  const d = data(p);
  sel = sel ?? (d.cls === "novice" ? "warrior" : d.cls);
  const scr = new Screen("L", "직업");
  for (const [id, c] of Object.entries(CLASSES)) {
    if (id === "novice") continue;
    scr.item(`${c.color}§l${c.name}§r${d.cls === id ? "  §8[현재]" : ""}\n§8${c.skill.name}`, ICON(c.icon), () => openClass(p, id), { on: id === sel });
  }
  chrome(scr, p, "class");
  const c = CLASSES[sel];
  const base = Object.entries(c.base).map(([k, v]) => `${STATS.find((s) => s.id === k).name} +${v}`).join(", ");
  scr.select(`${c.color}${c.name}`, ICON(c.icon));
  scr.body(`${c.desc}\n\n§8기본 능력치\n§r${base || "-"}\n\n§8스킬: §l${c.skill.name}§r\n${c.skill.desc}\n§8재사용 ${c.skill.cd}초`);
  if (d.cls !== sel) {
    const cost = d.cls === "novice" ? 0 : CLASS_CHANGE_COST;
    scr.action(cost ? `전직 (${cost}G)` : "이 직업 선택", () => {
      if (d.gold < cost) {
        msg(p, `§c골드가 부족합니다. (${cost}G 필요)`);
        return openClass(p, sel);
      }
      d.gold -= cost;
      d.cls = sel;
      save(p);
      p.playSound("random.levelup");
      p.onScreenDisplay.setTitle(`${c.color}§l${c.name}`, { subtitle: "새로운 길을 걷기 시작했다", fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 });
      return openClass(p, sel);
    });
  }
  scr.reopen = () => openClass(p, sel);
  return scr.show(p);
}

// ═════════ 파티 ═════════
export function openParty(p, sel) {
  const pt = P.partyOf(p.id);
  return pt ? partyView(p, pt, sel) : partyBoard(p, sel);
}

function partyBoard(p, sel) {
  const scr = new Screen("L", "파티 / 모집 게시판");
  const list = P.allParties().filter((x) => x.open);
  sel = sel ?? list[0]?.id;
  for (const x of list.slice(0, 7)) {
    scr.item(`§l${x.name}§r  §8${x.members.length}/${P.MAX_MEMBERS}\n§8${x.msg}`, ICON("party"), () => partyBoard(p, x.id), { on: x.id === sel });
  }
  chrome(scr, p, "party");
  const x = P.getParty(sel);
  if (x) {
    scr.select(x.name, ICON("party"));
    scr.body(
      `§8모집글\n§r${x.msg}\n\n§8리더 §r${x.names[x.leader]}\n§8최소 레벨 §r${x.minLv}\n§8가입 방식 §r${x.auto ? "자유 가입" : "승인 필요"}\n\n§8멤버\n§r` +
      x.members.map((m) => x.names[m]).join("\n"),
    );
    scr.action(x.auto ? "가입하기" : "가입 신청", () => {
      const r = P.join(p, x.id);
      msg(p, { joined: "§a파티에 가입했습니다.", requested: "§e가입을 신청했습니다. 리더의 승인을 기다리세요.", full: "§c파티가 가득 찼습니다.", level: `§c레벨 ${x.minLv} 이상만 가입할 수 있습니다.`, fail: "§c가입할 수 없습니다." }[r]);
      return openParty(p);
    });
  } else {
    scr.select("모집 중인 파티 없음", ICON("party"));
    scr.body("§8지금 모집 중인 파티가 없습니다.\n\n직접 파티를 만들고 모집글을 올려 보세요!");
  }
  scr.action("파티 만들기", async () => {
    const r = await new ModalFormData().title("파티 만들기").textField("파티 이름", "예) 새벽 원정대", `${p.name}의 파티`).show(p);
    if (r.canceled) return openParty(p);
    P.create(p, String(r.formValues[0]).slice(0, 24));
    return openParty(p);
  });
  scr.action("새로고침", () => openParty(p));
  scr.reopen = () => partyBoard(p, sel);
  return scr.show(p);
}

function partyView(p, pt, sel) {
  const leader = pt.leader === p.id;
  sel = sel && pt.members.includes(sel) ? sel : p.id;
  const scr = new Screen("L", `파티 / ${pt.name}`);
  for (const id of pt.members) {
    const m = byId(id);
    const md = m ? data(m) : null;
    const line2 = m ? `§8Lv.${md.lv} ${CLASSES[md.cls].name} · §c${Math.ceil(m.getComponent("minecraft:health").currentValue)}♥` : "§8오프라인";
    scr.item(`${id === pt.leader ? "§6♛ " : ""}§l${pt.names[id]}§r\n${line2}`, ICON(m ? CLASSES[md.cls].icon : "profile"), () => partyView(p, pt, id), { on: id === sel });
  }
  chrome(scr, p, "party");
  scr.select(pt.names[sel], ICON("profile"));
  scr.body(
    `§8모집글\n§r${pt.msg}\n§8모집 ${pt.open ? "공개" : "비공개"} · ${pt.auto ? "자유 가입" : "승인제"} · 최소 Lv.${pt.minLv}\n\n` +
    `§8파티 혜택\n§r- 48블록 안 파티원 처치 시\n  경험치 40% 공유\n- 처치 퀘스트 진행 공유\n- 성직자 치유 대상`,
  );
  if (leader) {
    if (pt.req.length) scr.action(`가입 요청 (${pt.req.length})`, () => partyRequests(p, pt));
    scr.action("초대하기", () => partyInvite(p, pt));
    scr.action("모집글 설정", () => partySettings(p, pt));
    if (sel !== p.id) {
      scr.action("리더 위임", () => { P.promote(pt, sel); return openParty(p, sel); });
      scr.action("추방", () => { P.leave(sel); return openParty(p); });
    }
    scr.action("§c파티 해산", () => { P.disband(pt); return openParty(p); });
  } else {
    scr.action("§c파티 탈퇴", () => { P.leave(p.id); return openParty(p); });
  }
  scr.reopen = () => partyView(p, pt, sel);
  return scr.show(p);
}

function partyRequests(p, pt, sel) {
  sel = sel ?? pt.req[0];
  const scr = new Screen("L", `파티 / 가입 요청`);
  for (const id of pt.req) {
    const m = byId(id);
    scr.item(`§l${pt.names[id]}§r\n§8${m ? `Lv.${data(m).lv} ${CLASSES[data(m).cls].name}` : "오프라인"}`, ICON("profile"), () => partyRequests(p, pt, id), { on: id === sel });
  }
  chrome(scr, p, "party");
  scr.select(sel ? pt.names[sel] : "요청 없음", ICON("profile"));
  scr.body(sel ? "가입을 수락하시겠습니까?" : "§8대기 중인 요청이 없습니다.");
  if (sel) {
    scr.action("수락", () => {
      const m = byId(sel);
      if (m) P.addMember(pt, m);
      else msg(p, "§c상대가 오프라인입니다.");
      return P.partyOf(p.id)?.req.length ? partyRequests(p, pt) : openParty(p);
    });
    scr.action("거절", () => { P.decline(pt, sel); return openParty(p); });
  }
  scr.action("돌아가기", () => openParty(p));
  return scr.show(p);
}

async function partyInvite(p, pt) {
  const cands = world.getAllPlayers().filter((x) => x.id !== p.id && !P.partyOf(x.id));
  if (!cands.length) {
    msg(p, "§7초대할 수 있는 플레이어가 없습니다.");
    return openParty(p);
  }
  const r = await new ModalFormData().title("파티 초대").dropdown("플레이어", cands.map((x) => x.name), 0).show(p);
  if (r.canceled) return openParty(p);
  const t = cands[r.formValues[0]];
  if (!data(t).set.invite) {
    msg(p, "§c상대가 초대를 받지 않도록 설정했습니다.");
    return openParty(p);
  }
  msg(p, `§e${t.name}§r 님에게 초대를 보냈습니다.`);
  invitePrompt(t, pt, p.name);
  return openParty(p);
}

function invitePrompt(t, pt, from) {
  const scr = new Screen("L", "파티 초대");
  scr.select(pt.name, ICON("party"));
  scr.body(`§e${from}§r 님이\n§l${pt.name}§r 파티에 초대했습니다.\n\n§8멤버 ${pt.members.length}/${P.MAX_MEMBERS}`);
  scr.action("수락", () => {
    if (P.getParty(pt.id) && P.addMember(pt, t)) return;
    msg(t, "§c파티에 들어갈 수 없습니다.");
  });
  scr.action("거절", () => {});
  chips(scr, t);
  return scr.show(t);
}

async function partySettings(p, pt) {
  const r = await new ModalFormData()
    .title("모집글 설정")
    .textField("파티 이름", "", pt.name)
    .textField("모집글", "", pt.msg)
    .toggle("게시판에 공개", pt.open)
    .toggle("자유 가입 (끄면 승인제)", pt.auto)
    .slider("최소 레벨", 1, 100, 1, pt.minLv)
    .show(p);
  if (!r.canceled) {
    const [name, m, open, auto, minLv] = r.formValues;
    P.update(pt, { name: String(name).slice(0, 24) || pt.name, msg: String(m).slice(0, 60), open, auto, minLv });
  }
  return openParty(p);
}

// ═════════ 퀘스트 ═════════
const STATE_TAG = { ready: "§2[완료 가능]", active: "§6[진행 중]", available: "§9[수락 가능]", locked: "§8[잠김]", done: "§8[완료]" };

export function questDetailBody(p, q) {
  const st = Q.state(p, q);
  const lines = [`${STATE_TAG[st]}§r\n`, q.desc ? `${q.desc}\n` : "", "\n§8목표\n"];
  q.obj.forEach((_, i) => lines.push(Q.objLine(p, q, i, st === "active" || st === "ready"), "\n"));
  lines.push("\n§8보상\n");
  Q.rewardLines(q).forEach((l) => lines.push(l, "\n"));
  if (st === "locked") lines.push(`\n§c${Q.lockReason(p, q)}`);
  if (q.giver !== "board") lines.push(`\n§8의뢰자: ${q.giverName ?? q.giver}`);
  return rt(lines);
}

function questActions(scr, p, q, back) {
  const st = Q.state(p, q);
  const d = data(p);
  if (st === "available" && (q.giver === "board" || back.npc === q.giver)) scr.action("수락", () => {
    if (Q.accept(p, q.id) && back.npc) Q.onTalk(p, back.npc); // 의뢰한 NPC와의 대화 목표는 바로 달성
    return back(q.id);
  });
  if (st === "ready" && (q.turnIn === "auto" || back.npc === q.giver)) scr.action("완료 보고", () => { Q.turnIn(p, q.id); return back(); });
  if (st === "active" || st === "ready") {
    scr.action(d.q.track.includes(q.id) ? "HUD 추적 해제" : "HUD에 추적", () => { Q.toggleTrack(p, q.id); return back(q.id); });
    scr.action("§c포기", () => { Q.abandon(p, q.id); return back(); });
  }
}

export function openQuests(p, sel) {
  const order = { ready: 0, active: 1, available: 2, locked: 3, done: 4 };
  const list = Q.allQuests()
    .filter((q) => q.enabled || data(p).q.a[q.id])
    .filter((q) => q.giver === "board" || data(p).q.a[q.id])
    .map((q) => ({ q, st: Q.state(p, q) }))
    .filter((x) => x.st !== "done" && !(x.st === "locked" && x.q.prereq && !data(p).q.d[x.q.prereq]))
    .sort((a, b) => order[a.st] - order[b.st])
    .slice(0, 7);
  sel = sel ?? list[0]?.q.id;
  const scr = new Screen("L", "퀘스트");
  for (const { q, st } of list) scr.item(`§l${q.title}§r\n${STATE_TAG[st]}`, ICON("quest"), () => openQuests(p, q.id), { on: q.id === sel });
  chrome(scr, p, "quest");
  const q = Q.getQuest(sel);
  if (q) {
    scr.select(q.title, ICON("quest"));
    scr.body(questDetailBody(p, q));
    const back = (id) => openQuests(p, id ?? sel);
    questActions(scr, p, q, back);
  } else {
    scr.select("퀘스트 없음", ICON("quest"));
    scr.body("§8지금 받을 수 있는 퀘스트가 없습니다.\n\nNPC에게 말을 걸어 보세요.");
  }
  scr.action("완료한 퀘스트", () => openDoneQuests(p));
  scr.reopen = () => openQuests(p, sel);
  return scr.show(p);
}

function openDoneQuests(p) {
  const d = data(p);
  const scr = new Screen("L", "퀘스트 / 완료 기록");
  const done = Object.entries(d.q.d).map(([id, n]) => ({ q: Q.getQuest(id), n })).filter((x) => x.q).slice(0, 7);
  for (const { q, n } of done) scr.item(`§l${q.title}§r\n§8완료 ${n}회`, ICON("quest"), () => openDoneQuests(p));
  chrome(scr, p, "quest");
  scr.select("완료 기록", ICON("star"));
  scr.body(`§8총 완료한 퀘스트 §r${Object.keys(d.q.d).length}개`);
  scr.action("돌아가기", () => openQuests(p));
  return scr.show(p);
}

// ═════════ 배낭 (사진 레이아웃) ═════════
const EQ = [
  { slot: EquipmentSlot.Head, name: "머리" }, { slot: EquipmentSlot.Chest, name: "몸통" },
  { slot: EquipmentSlot.Legs, name: "다리" }, { slot: EquipmentSlot.Feet, name: "발" },
  { slot: EquipmentSlot.Offhand, name: "보조손" },
];
const SORTS = { rarity: "희귀도", name: "종류", count: "수량" };

function bagEntries(p) {
  const out = [];
  const c = inv(p);
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    if (it && !it.typeId.startsWith("rpg:")) out.push({ key: `i${i}`, it, slot: i });
  }
  const eq = p.getComponent("minecraft:equippable");
  for (const e of EQ) {
    const it = eq?.getEquipment(e.slot);
    if (it) out.push({ key: `e${e.slot}`, it, eq: e });
  }
  return out;
}

export function openBag(p, cat = "all", selKey, page = 0) {
  const d = data(p);
  let list = bagEntries(p).filter((x) => cat === "all" || category(x.it.typeId) === cat);
  const sort = d.bag.sort;
  list.sort((a, b) =>
    sort === "count" ? b.it.amount - a.it.amount :
    sort === "name" ? a.it.typeId.localeCompare(b.it.typeId) :
    rarity(b.it) - rarity(a.it) || a.it.typeId.localeCompare(b.it.typeId));
  const PAGE = 30;
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  page = Math.min(page, pages - 1);
  const shown = list.slice(page * PAGE, page * PAGE + PAGE);
  const sel = list.find((x) => x.key === selKey) ?? shown[0];
  const catName = CATS.find((c) => c.id === cat).name;

  const scr = new Screen("G", `배낭 / ${catName}`);
  for (const x of shown) {
    const label = x.eq ? "장착" : x.it.amount > 1 ? `${x.it.amount}` : STARS(Math.min(3, rarity(x.it)));
    scr.item(label, iconOf(x.it.typeId), () => openBag(p, cat, x.key, page), { on: x === sel, rarity: rarity(x.it) });
  }
  // 레일 = 홈 + 카테고리 (사진처럼)
  scr.tab("메뉴", ICON("back"), () => openHome(p));
  for (const c of CATS) scr.tab(c.name, ICON(c.icon), () => openBag(p, c.id), c.id === cat);
  chips(scr, p);
  scr.chip(ICON("bag"), `${bagEntries(p).length}/41`);

  if (sel) {
    const it = sel.it;
    const r = rarity(it);
    const info = weaponInfo(it.typeId);
    const lines = [`§8${info?.kind ?? CATS.find((c) => c.id === category(it.typeId)).name}\n`];
    if (info?.atk) lines.push(`\n§8기초 공격력\n§l§0${info.atk}§r\n`);
    if (info?.def !== undefined && info.def) lines.push(`\n§8방어력\n§l§0${info.def}§r\n`);
    lines.push(`§6${STARS(r)}§r  §8×${it.amount}\n`);
    const dur = it.getComponent("minecraft:durability");
    if (dur) lines.push(`§8내구도 §r${dur.maxDurability - dur.damage}/${dur.maxDurability}\n`);
    try {
      const en = it.getComponent("minecraft:enchantable")?.getEnchantments() ?? [];
      if (en.length) lines.push("\n§5", en.map((e) => `${ENCH_KO[e.type.id] ?? e.type.id} ${roman(e.level)}`).join("\n"), "\n");
    } catch {}
    const lore = it.getLore();
    if (lore.length) lines.push("\n§8", lore.join("\n"), "\n");
    if (sel.eq) lines.push(`\n§2${sel.eq.name}에 장착 중`);
    scr.select(rt(itemName(it)), iconOf(it.typeId));
    scr.body(rt(lines));

    const slotFor = armorSlot(it.typeId);
    if (sel.eq) {
      scr.action("장착 해제", () => {
        const eq = p.getComponent("minecraft:equippable");
        const rest = inv(p).addItem(it);
        if (rest) p.dimension.spawnItem(rest, p.location);
        eq.setEquipment(sel.eq.slot, undefined);
        return openBag(p, cat, undefined, page);
      });
    } else if (slotFor) {
      scr.action("장착", () => {
        const eq = p.getComponent("minecraft:equippable");
        const old = eq.getEquipment(slotFor);
        eq.setEquipment(slotFor, it);
        inv(p).setItem(sel.slot, old);
        p.playSound("armor.equip_generic");
        return openBag(p, cat, `e${slotFor}`, page);
      });
    }
    if (!sel.eq) {
      scr.action("손에 들기", () => {
        const hs = p.selectedSlotIndex;
        if (sel.slot < 9) p.selectedSlotIndex = sel.slot;
        else inv(p).swapItems(sel.slot, hs, inv(p));
        return openBag(p, cat, `i${sel.slot < 9 ? sel.slot : hs}`, page);
      });
      scr.action("버리기", () => {
        p.dimension.spawnItem(it, { x: p.location.x, y: p.location.y + 1.2, z: p.location.z });
        inv(p).setItem(sel.slot, undefined);
        return openBag(p, cat, undefined, page);
      });
    }
  } else {
    scr.select(catName, ICON(CATS.find((c) => c.id === cat).icon));
    scr.body("§8이 분류에 아이템이 없습니다.");
  }
  scr.action(`정렬: ${SORTS[sort]}`, () => {
    const keys = Object.keys(SORTS);
    d.bag.sort = keys[(keys.indexOf(sort) + 1) % keys.length];
    save(p);
    return openBag(p, cat, sel?.key, page);
  });
  if (pages > 1) scr.action(`다음 페이지 (${page + 1}/${pages})`, () => openBag(p, cat, undefined, (page + 1) % pages));
  scr.reopen = () => openBag(p, cat, sel?.key, page);
  return scr.show(p);
}

// ═════════ 상점 ═════════
export function openShop(p, selIdx = 0, crumb = "상점") {
  const d = data(p);
  const list = shopList();
  const scr = new Screen("G", crumb);
  list.slice(0, 30).forEach((e, i) => scr.item(`${e.price}G`, iconOf(e.id), () => openShop(p, i, crumb), { on: i === selIdx, rarity: rarity({ typeId: e.id, getComponent: () => undefined }) }));
  chrome(scr, p, "shop");
  const e = list[selIdx];
  if (e) {
    const owned = countItem(p, e.id);
    scr.select(rt(itemName(e.id), e.n > 1 ? ` ×${e.n}` : ""), iconOf(e.id));
    const info = weaponInfo(e.id);
    scr.body(rt(
      `§8${info?.kind ?? CATS.find((c) => c.id === category(e.id)).name}\n`,
      info?.atk ? `\n§8기초 공격력 §r${info.atk}\n` : "",
      info?.def ? `\n§8방어력 §r${info.def}\n` : "",
      `\n§8가격 §6${e.price}G §8(${e.n}개)\n§8판매가 §r${sellPrice(e)}G/개\n\n§8보유 §r${owned}개\n§8내 골드 §6${d.gold}G`,
    ));
    const buy = (times) => () => {
      const cost = e.price * times;
      if (d.gold < cost) {
        msg(p, "§c골드가 부족합니다.");
        p.playSound("note.bass");
      } else if (giveItem(p, e.id, e.n * times)) {
        addGold(p, -cost);
        p.playSound("random.orb");
      }
      return openShop(p, selIdx, crumb);
    };
    scr.action(`구매 (${e.price}G)`, buy(1));
    scr.action(`5번 구매 (${e.price * 5}G)`, buy(5));
    if (owned) {
      scr.action(`1개 판매 (+${sellPrice(e)}G)`, () => {
        if (removeItem(p, e.id, 1)) addGold(p, sellPrice(e));
        p.playSound("random.orb", { pitch: 1.5 });
        return openShop(p, selIdx, crumb);
      });
      scr.action(`전부 판매 (+${sellPrice(e) * owned}G)`, () => {
        if (removeItem(p, e.id, owned)) addGold(p, sellPrice(e) * owned);
        p.playSound("random.orb", { pitch: 1.5 });
        return openShop(p, selIdx, crumb);
      });
    }
  } else {
    scr.select("상점", ICON("shop"));
    scr.body("§8판매 중인 물건이 없습니다.");
  }
  scr.reopen = () => openShop(p, selIdx, crumb);
  return scr.show(p);
}

// ═════════ 설정 ═════════
export async function openSettings(p) {
  const d = data(p);
  const r = await new ModalFormData()
    .title("설정")
    .toggle("퀘스트창 표시 (HUD 오른쪽)", d.set.quest)
    .toggle("캐릭터 카드 표시 (HUD 왼쪽)", d.set.card)
    .toggle("파티 초대 받기", d.set.invite)
    .show(p);
  if (!r.canceled) {
    [d.set.quest, d.set.card, d.set.invite] = r.formValues;
    save(p);
  }
  return openHome(p);
}

// ═════════ NPC 대화 ═════════
export function openNpc(p, npc, sel) {
  const npcId = npc.getDynamicProperty("rpg:npc_id") ?? "npc";
  const name = npc.nameTag || "NPC";
  if ((npc.getDynamicProperty("rpg:role") ?? "quest") === "shop") return openShop(p, 0, `${name} / 상점`);

  const talked = Q.onTalk(p, npcId);
  const list = Q.allQuests()
    .filter((q) => q.giver === npcId)
    .map((q) => ({ q, st: Q.state(p, q) }))
    .filter((x) => x.st !== "done" && x.st !== "locked");
  sel = sel ?? list[0]?.q.id;
  const scr = new Screen("L", `${name} / 대화`);
  for (const { q, st } of list) scr.item(`§l${q.title}§r\n${STATE_TAG[st]}`, ICON("quest"), () => openNpc(p, npc, q.id), { on: q.id === sel });
  chips(scr, p);
  scr.tab("메뉴", ICON("back"), () => openHome(p));
  const q = Q.getQuest(sel);
  if (q) {
    scr.select(q.title, ICON("npc"));
    scr.body(questDetailBody(p, q));
    const back = (id) => openNpc(p, npc, id ?? sel);
    back.npc = npcId;
    questActions(scr, p, q, back);
  } else {
    scr.select(name, ICON("npc"));
    scr.body(rt(npc.getDynamicProperty("rpg:greet") ?? "안녕하신가, 모험가.", talked ? "\n\n§2(대화 목표 달성)" : ""));
  }
  scr.action("작별 인사", () => {});
  scr.reopen = () => openNpc(p, npc, sel);
  return scr.show(p);
}
