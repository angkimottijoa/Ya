// 플레이어 메뉴 화면들
import { world, EquipmentSlot } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { Screen, rt } from "./ui.js";
import { data, save, stat, xpNeed, addGold, msg, notify, isAdmin, byId, MAX_LV, maxMp } from "./player.js";
import { CLASSES, STATS, CLASS_CHANGE_COST } from "./classes.js";
import * as Q from "./quests.js";
import * as P from "./party.js";
import { shopList, sellPrice } from "./shop.js";
import {
  ICON, CATS, category, rarity, weaponInfo, armorSlot, iconOf, itemName, STARS, ENCH_KO, roman,
  inv, countItem, removeItem, giveItem,
} from "./itemdb.js";
import { openAdmin } from "./admin.js";
import * as CH from "./chat.js";
import * as SK from "./skills.js";
import * as WP from "./waypoints.js";
import { npcRegistry } from "./npcdb.js";
import { castSkill } from "./combat.js";

// ───────── 공통 크롬(레일 + 재화 칩) ─────────
const SECTIONS = [
  { id: "home", name: "홈", icon: "home", open: (p) => openHome(p) },
  { id: "profile", name: "내 정보", icon: "profile", open: (p) => openProfile(p) },
  { id: "class", name: "직업", icon: "class", open: (p) => openClass(p) },
  { id: "party", name: "파티", icon: "party", open: (p) => openParty(p) },
  { id: "chat", name: "채팅", icon: "chat", open: (p) => openChat(p) },
  { id: "quest", name: "퀘스트", icon: "quest", open: (p) => openQuests(p) },
  { id: "skill", name: "스킬", icon: "skill", open: (p) => openSkills(p) },
  { id: "nav", name: "길찾기", icon: "nav", open: (p) => openNav(p) },
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
  // 레일은 화면 높이에 맞게 설정을 뺀 섹션만 (설정은 홈 타일에서)
  for (const s of SECTIONS) if (!["settings", "class"].includes(s.id) || current === s.id) scr.tab(s.name, ICON(s.icon), () => s.open(p), s.id === current);
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
  scr.select(`${c.color}${p.name}`, ICON(c.icon), true);
  const active = Object.keys(d.q.a).length;
  const pt = P.partyOf(p.id);
  scr.body(rt(
    `§l${c.name}§r  Lv.${d.lv}\n`,
    d.lv >= MAX_LV ? "§6MAX LEVEL\n" : `§7경험치 §r${d.xp} / ${xpNeed(d.lv)}\n`,
    `§7골드 §r${d.gold}\n\n`,
    `§7진행 중 퀘스트 §r${active}개\n`,
    `§7파티 §r${pt ? pt.name : "없음"}\n`,
    d.pts ? `\n§2미사용 스탯 포인트 ${d.pts}!\n§7내 정보에서 분배하세요.` : "",
    `\n\n§e§l조작§r\n§6오른쪽 위 메뉴 §7(7번) §f메뉴\n§d오른쪽 위 스킬창 §7(8번) §f스킬 목록·장착\n§b오른쪽 아래 스킬 §7(9번) §f스킬 1  §7· 쉬프트: 스킬 2\n§7쉬프트+공격 §f스킬 1\n§7HUD 창 접기 §f설정`,
  ));
  scr.action("퀘스트 게시판", () => openQuests(p, "all"));
  scr.action("길찾기", () => openNav(p));
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
    scr.item(`§l${s.name}§r  ${total}  §7(분배 ${d.stat[s.id]})`, ICON({ str: "class", dex: "archer", int: "mage", vit: "cleric" }[s.id]),
      () => openProfile(p, s.id), { on: s.id === sel });
  }
  chrome(scr, p, "profile");
  const s = STATS.find((x) => x.id === sel);
  scr.select(`${p.name}`, ICON("profile"), true);
  scr.body(`§l${s.name}§r\n${s.desc}\n\n§7분배 포인트: §r${d.stat[sel]}\n§7직업 보너스: §r${stat(p, sel) - d.stat[sel]}\n\n§2남은 포인트: ${d.pts}\n\n§7${c.name} Lv.${d.lv}`);
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
    scr.item(`${c.color}§l${c.name}§r${d.cls === id ? "  §7[현재]" : ""}\n§7${c.skill.name}`, ICON(c.icon), () => openClass(p, id), { on: id === sel });
  }
  chrome(scr, p, "class");
  const c = CLASSES[sel];
  const base = Object.entries(c.base).map(([k, v]) => `${STATS.find((s) => s.id === k).name} +${v}`).join(", ");
  scr.select(`${c.color}${c.name}`, ICON(c.icon));
  scr.body(`${c.desc}\n\n§7기본 능력치\n§r${base || "-"}\n\n§7스킬: §l${c.skill.name}§r\n${c.skill.desc}\n§7재사용 ${c.skill.cd}초`);
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
      notify(p, `${c.color}§l${c.name}§r§f 의 길을 걷기 시작했다`);
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
    scr.item(`§l${x.name}§r  §7${x.members.length}/${P.MAX_MEMBERS}\n§7${x.msg}`, ICON("party"), () => partyBoard(p, x.id), { on: x.id === sel });
  }
  chrome(scr, p, "party");
  const x = P.getParty(sel);
  if (x) {
    scr.select(x.name, ICON("party"));
    scr.body(
      `§7모집글\n§r${x.msg}\n\n§7리더 §r${x.names[x.leader]}\n§7최소 레벨 §r${x.minLv}\n§7가입 방식 §r${x.auto ? "자유 가입" : "승인 필요"}\n\n§7멤버\n§r` +
      x.members.map((m) => x.names[m]).join("\n"),
    );
    scr.action(x.auto ? "가입하기" : "가입 신청", () => {
      const r = P.join(p, x.id);
      msg(p, { joined: "§a파티에 가입했습니다.", requested: "§e가입을 신청했습니다. 리더의 승인을 기다리세요.", full: "§c파티가 가득 찼습니다.", level: `§c레벨 ${x.minLv} 이상만 가입할 수 있습니다.`, fail: "§c가입할 수 없습니다." }[r]);
      return openParty(p);
    });
  } else {
    scr.select("모집 중인 파티 없음", ICON("party"));
    scr.body("§7지금 모집 중인 파티가 없습니다.\n\n직접 파티를 만들고 모집글을 올려 보세요!");
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
    const line2 = m ? `§7Lv.${md.lv} ${CLASSES[md.cls].name} · §c${Math.ceil(m.getComponent("minecraft:health").currentValue)}♥` : "§7오프라인";
    scr.item(`${id === pt.leader ? "§6♛ " : ""}§l${pt.names[id]}§r\n${line2}`, ICON(m ? CLASSES[md.cls].icon : "profile"), () => partyView(p, pt, id), { on: id === sel });
  }
  chrome(scr, p, "party");
  scr.select(pt.names[sel], ICON("profile"));
  scr.body(
    `§7모집글\n§r${pt.msg}\n§7모집 ${pt.open ? "공개" : "비공개"} · ${pt.auto ? "자유 가입" : "승인제"} · 최소 Lv.${pt.minLv}\n\n` +
    `§7파티 혜택\n§r- 48블록 안 파티원 처치 시\n  경험치 40% 공유\n- 처치 퀘스트 진행 공유\n- 성직자 치유 대상`,
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
    scr.item(`§l${pt.names[id]}§r\n§7${m ? `Lv.${data(m).lv} ${CLASSES[data(m).cls].name}` : "오프라인"}`, ICON("profile"), () => partyRequests(p, pt, id), { on: id === sel });
  }
  chrome(scr, p, "party");
  scr.select(sel ? pt.names[sel] : "요청 없음", ICON("profile"));
  scr.body(sel ? "가입을 수락하시겠습니까?" : "§7대기 중인 요청이 없습니다.");
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
  scr.body(`§e${from}§r 님이\n§l${pt.name}§r 파티에 초대했습니다.\n\n§7멤버 ${pt.members.length}/${P.MAX_MEMBERS}`);
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

// ═════════ 퀘스트 (원신식: 분류 레일 / 목록 / 상세 + 길 안내·우선순위) ═════════
const STATE_TAG = { ready: "§a[완료 가능]", active: "§6[진행 중]", available: "§b[수락 가능]", locked: "§7[잠김]", done: "§7[완료]" };
const QCATS = [
  { id: "active", name: "진행 중", icon: "nav" },
  { id: "all", name: "전체", icon: "all" },
  { id: "main", name: "메인", icon: "star" },
  { id: "sub", name: "서브", icon: "quest" },
  { id: "daily", name: "일일", icon: "daily" },
  { id: "repeat", name: "반복", icon: "repeat" },
  { id: "done", name: "완료", icon: "check" },
];

export function questDetailBody(p, q) {
  const st = Q.state(p, q);
  const t = Q.qtype(q);
  const lines = [`${t.color}§l${t.name} 퀘스트§r  ${STATE_TAG[st]}\n`];
  if (q.region) lines.push(`§7지역 §f${q.region}\n`);
  if (q.giver !== "board") lines.push(`§7의뢰인 §f${q.giverName ?? q.giver}\n`);
  if (q.desc) lines.push(`\n§f${q.desc}\n`);
  lines.push("\n§e§l목표§r\n");
  q.obj.forEach((_, i) => lines.push(Q.objLine(p, q, i, st === "active" || st === "ready"), "\n"));
  if (st === "active" || st === "ready") {
    const nav = Q.navText(p, Q.navTarget(p, q));
    if (nav) lines.push(`\n§7길 안내  ${nav}\n`);
    const pr = Q.priority(p).indexOf(q.id);
    lines.push(`§7우선순위 §f${pr + 1}번${pr === 0 ? " §e(HUD 길 안내 대상)" : ""}${data(p).q.hide?.[q.id] ? " §7· HUD 숨김" : ""}\n`);
  }
  lines.push("\n§e§l보상§r\n");
  Q.rewardLines(q).forEach((l) => lines.push(l, "\n"));
  if (st === "locked") lines.push(`\n§c${Q.lockReason(p, q)}`);
  return rt(lines);
}

function questActions(scr, p, q, back) {
  const st = Q.state(p, q);
  if (st === "available" && (q.giver === "board" || back.npc === q.giver)) scr.action("§a수락", () => {
    if (Q.accept(p, q.id) && back.npc) Q.onTalk(p, back.npc);
    return back(q.id);
  });
  if (st === "ready" && (q.turnIn === "auto" || back.npc === q.giver)) scr.action("§a완료 보고", () => Promise.resolve(Q.turnIn(p, q.id)).then(() => back()));
  if (st === "active" || st === "ready") {
    const pr = Q.priority(p).indexOf(q.id);
    if (pr !== 0) scr.action("★ 길 안내 (최우선)", () => { Q.movePriority(p, q.id, "top"); return back(q.id); });
    if (Q.navTarget(p, q)) scr.action("길찾기 열기", () => openNav(p, "quest", `quest:${q.id}`));
    if (pr > 0) scr.action("▲ 우선순위 올리기", () => { Q.movePriority(p, q.id, -1); return back(q.id); });
    if (pr < Q.priority(p).length - 1) scr.action("▼ 우선순위 내리기", () => { Q.movePriority(p, q.id, 1); return back(q.id); });
    scr.action(data(p).q.hide?.[q.id] ? "HUD에 표시" : "HUD에서 숨기기", () => { Q.toggleHidden(p, q.id); return back(q.id); });
    if (!Q.adv(q).noAbandon) scr.action("§c포기", () => { Q.abandon(p, q.id); return back(); });
  }
}

export function openQuests(p, cat = "active", sel, page = 0) {
  const d = data(p);
  const pri = Q.priority(p);
  const order = { ready: 0, active: 1, available: 2, locked: 3, done: 4 };
  const all = Q.allQuests().map((q) => ({ q, st: Q.state(p, q) }));
  let list = all;
  if (cat === "active") {
    list = pri.map((id) => all.find((x) => x.q.id === id)).filter(Boolean);
    if (!list.length) {
      cat = "all";
      list = all;
    }
  }
  if (cat !== "active") {
    list = list.filter((x) => x.q.enabled || d.q.a[x.q.id])
      .filter((x) => x.q.giver === "board" || d.q.a[x.q.id] || x.st === "done")
      .filter((x) => (cat === "done" ? x.st === "done" : x.st !== "done"))
      .filter((x) => (["main", "sub", "daily", "repeat"].includes(cat) ? (x.q.type ?? "sub") === cat : true))
      .filter((x) => !(x.st === "locked" && x.q.prereq && !d.q.d[x.q.prereq]))
      .filter((x) => !(Q.adv(x.q).secret && x.st === "locked"));
    // 선행 → 후속 퀘스트를 묶어서 정렬 (묶음 안에서는 연결 순서, 묶음끼리는 상태 순)
    const byId = new Map(list.map((x) => [x.q.id, x]));
    const groups = [];
    for (const { q, depth } of Q.chainSort(list.map((x) => x.q))) {
      if (depth === 0) groups.push([]);
      groups.at(-1).push({ ...byId.get(q.id), depth });
    }
    groups.sort((a, b) => Math.min(...a.map((x) => order[x.st])) - Math.min(...b.map((x) => order[x.st])));
    list = groups.flat();
  }
  const PAGE = 6;
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  page = Math.min(page, pages - 1);
  const shown = list.slice(page * PAGE, page * PAGE + PAGE);
  sel = sel && list.find((x) => x.q.id === sel) ? sel : shown[0]?.q.id;
  const catName = QCATS.find((c) => c.id === cat).name;
  const scr = new Screen("L", `퀘스트 / ${catName}`);
  for (const { q, st } of shown) {
    const t = Q.qtype(q);
    const pr = pri.indexOf(q.id);
    const nav = st === "active" || st === "ready" ? Q.navTarget(p, q) : null;
    const dist = nav && nav.dim === p.dimension.id ? ` · ${Math.round(Math.hypot(nav.x - p.location.x, nav.z - p.location.z))}m` : "";
    const depth = list.find((x) => x.q === q)?.depth ?? 0;
    scr.item(`${depth ? `${"  ".repeat(Math.min(3, depth - 1))}§7└ ` : ""}${pr === 0 ? "§e▶ " : ""}${t.color}[${t.name}] §f${q.title}\n${STATE_TAG[st]} §7${q.region || ""}${dist}`, ICON(t.icon), () => openQuests(p, cat, q.id, page), { on: q.id === sel });
  }
  scr.tab("메뉴", ICON("back"), () => openHome(p));
  for (const c of QCATS) scr.tab(c.name, ICON(c.icon), () => openQuests(p, c.id), c.id === cat);
  chips(scr, p);
  scr.chip(ICON("quest"), `${pri.length}/${Q.MAX_ACTIVE}`);
  const q = Q.getQuest(sel);
  if (q) {
    scr.select(q.title, ICON(Q.qtype(q).icon));
    scr.body(questDetailBody(p, q));
    questActions(scr, p, q, (id) => openQuests(p, cat, id ?? sel, page));
  } else {
    scr.select(catName, ICON("quest"));
    scr.body(cat === "done" ? "§7아직 완료한 퀘스트가 없습니다." : "§7이 분류에 퀘스트가 없습니다.\n\n게시판(전체)이나 NPC에게서 퀘스트를 받아 보세요.");
  }
  if (pages > 1) scr.action(`다음 페이지 (${page + 1}/${pages})`, () => openQuests(p, cat, undefined, (page + 1) % pages));
  scr.reopen = () => openQuests(p, cat, sel, page);
  return scr.show(p);
}

// ═════════ 스킬 (무기별 · 스킬 1 / 스킬 2) ═════════
/** w: 무기 분류 또는 "item:<typeId>" (제작자가 스킬 목록을 지정한 무기) */
export function openSkills(p, w, sel) {
  const d = data(p);
  const lo = SK.loadout(p);
  w = w ?? lo.key;
  const isItem = w.startsWith("item:");
  const list = isItem ? (SK.weaponCfg()[w.slice(5)]?.skills ?? []).map(SK.getSkill).filter(Boolean) : SK.skillsOf(w);
  const eq = SK.equippedFor(p, w, list);
  const eq2 = SK.equippedFor(p, w, list, "sub");
  sel = sel ?? eq?.id ?? list[0]?.id;
  const wc = isItem ? { name: "내 무기", icon: SK.WCLASS[lo.w]?.icon ?? "class" } : SK.WCLASS[w];
  const swap = d.set.skillSwap === true;
  const t1 = swap ? "스킬 2" : "스킬 1", t2 = swap ? "스킬 1" : "스킬 2";
  const scr = new Screen("L", `스킬 / ${wc.name}`);
  for (const s of list) {
    const lock = d.lv < s.lv;
    const left = SK.readyIn(p, s.id);
    scr.item(`${lock ? "§7" : "§f"}${s.name}${eq?.id === s.id ? ` §e[${t1}]` : ""}${eq2?.id === s.id ? ` §d[${t2}]` : ""}\n§7${lock ? `Lv.${s.lv} 필요` : `MP ${s.mp} · 대기 ${s.cd}초${left > 0 ? ` §c(${Math.ceil(left)}s)` : ""}`}`, ICON(SK.WCLASS[s.w].icon), () => openSkills(p, w, s.id), { on: s.id === sel });
  }
  scr.tab("메뉴", ICON("back"), () => openHome(p));
  if (lo.key.startsWith("item:")) scr.tab("내 무기", ICON(wc.icon), () => openSkills(p, lo.key), isItem);
  for (const [id, c] of Object.entries(SK.WCLASS)) scr.tab(c.name, ICON(c.icon), () => openSkills(p, id), id === w);
  chips(scr, p);
  scr.chip(ICON("skill"), `MP ${Math.floor(d.mp ?? maxMp(p))}/${maxMp(p)}`);
  const s = SK.getSkill(sel);
  const weapons = isItem ? [w.slice(5)] : Object.entries(SK.knownWeapons()).filter(([id, c]) => c === w && !SK.weaponCfg()[id]?.skills?.length).map(([id]) => id);
  if (s) {
    scr.select(s.name, ICON(SK.WCLASS[s.w].icon));
    scr.body(rt(
      `§b§l${wc.name}§r  ${d.lv >= s.lv ? (eq?.id === s.id ? `§e[스킬 1 장착]` : eq2?.id === s.id ? `§d[스킬 2 장착]` : "§a[사용 가능]") : `§c[Lv.${s.lv} 필요]`}\n\n`,
      `§f${s.desc}\n\n`,
      `§7마나 §9${s.mp}   §7재사용 §f${s.cd}초\n`,
      `§7계수 §f${s.kind === "magic" ? "지능" : s.kind === "ranged" ? "민첩" : s.kind === "melee" ? "힘" : "체력/지능"}\n\n`,
      `§e§l조작§r\n§f스킬 버튼(핫바 8번 칸) §7= §e${t1}\n§f쉬프트 + 스킬 버튼 §7= §d${t2}\n${d.set.shiftAttack !== false ? `§f쉬프트 + ${w === "bow" || w === "crossbow" ? "발사" : "공격"} §7= §e스킬 1\n` : ""}§7(PC: 숫자키 8 / 쉬프트+8 · 설정에서 배치 변경)\n\n`,
      `§e§l${isItem ? "이 무기" : "이 분류 무기"}§r §7(${weapons.length}개)\n§f`,
      weapons.length ? weapons.slice(0, 8).map((id) => id.replace("minecraft:", "")).join(", ") : "§7아직 없음 – 들기만 하면 자동 등록",
    ));
    if (d.lv >= s.lv && eq?.id !== s.id) scr.action("§e스킬 1로 장착", () => { SK.equip(p, s.id, "main", w); return openSkills(p, w, s.id); });
    if (d.lv >= s.lv && eq2?.id !== s.id) scr.action("§d스킬 2로 장착", () => { SK.equip(p, s.id, "sub", w); return openSkills(p, w, s.id); });
    if (d.lv >= s.lv) scr.action("지금 사용", () => { SK.castWeaponSkill(p, s.id); });
  } else {
    scr.select(wc.name, ICON(wc.icon));
    scr.body("§7스킬이 없습니다.");
  }
  scr.reopen = () => openSkills(p, w, sel);
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
    const lines = ["§l§f", itemName(it), "§r\n", `§7${info?.kind ?? CATS.find((c) => c.id === category(it.typeId)).name}\n`];
    if (info?.atk) lines.push(`\n§7기초 공격력\n§l§f${info.atk}§r\n`);
    if (info?.def !== undefined && info.def) lines.push(`\n§7방어력\n§l§f${info.def}§r\n`);
    lines.push(`§6${STARS(r)}§r  §7×${it.amount}\n`);
    const dur = it.getComponent("minecraft:durability");
    if (dur) lines.push(`§7내구도 §r${dur.maxDurability - dur.damage}/${dur.maxDurability}\n`);
    try {
      const en = it.getComponent("minecraft:enchantable")?.getEnchantments() ?? [];
      if (en.length) lines.push("\n§5", en.map((e) => `${ENCH_KO[e.type.id] ?? e.type.id} ${roman(e.level)}`).join("\n"), "\n");
    } catch {}
    const lore = it.getLore();
    if (lore.length) lines.push("\n§7", lore.join("\n"), "\n");
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
    scr.body("§7이 분류에 아이템이 없습니다.");
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
/** src: null = 공용 상점, { list, npc } = NPC 전용 상점 */
export function openShop(p, selIdx = 0, crumb = "상점", src = null) {
  const d = data(p);
  const list = src?.list ?? shopList();
  const scr = new Screen("G", crumb);
  list.slice(0, 30).forEach((e, i) => scr.item(`${e.price}G`, iconOf(e.id), () => openShop(p, i, crumb, src), { on: i === selIdx, rarity: rarity({ typeId: e.id, getComponent: () => undefined }) }));
  chrome(scr, p, "shop");
  const e = list[selIdx];
  if (e) {
    const owned = countItem(p, e.id);
    scr.select(rt(itemName(e.id), e.n > 1 ? ` ×${e.n}` : ""), iconOf(e.id));
    const info = weaponInfo(e.id);
    scr.body(rt(
      `§7${info?.kind ?? CATS.find((c) => c.id === category(e.id)).name}\n`,
      info?.atk ? `\n§7기초 공격력 §r${info.atk}\n` : "",
      info?.def ? `\n§7방어력 §r${info.def}\n` : "",
      `\n§7가격 §6${e.price}G §7(${e.n}개)\n§7판매가 §r${sellPrice(e)}G/개\n\n§7보유 §r${owned}개\n§7내 골드 §6${d.gold}G`,
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
      return openShop(p, selIdx, crumb, src);
    };
    scr.action(`구매 (${e.price}G)`, buy(1));
    scr.action(`5번 구매 (${e.price * 5}G)`, buy(5));
    if (owned) {
      scr.action(`1개 판매 (+${sellPrice(e)}G)`, () => {
        if (removeItem(p, e.id, 1)) addGold(p, sellPrice(e));
        p.playSound("random.orb", { pitch: 1.5 });
        return openShop(p, selIdx, crumb, src);
      });
      scr.action(`전부 판매 (+${sellPrice(e) * owned}G)`, () => {
        if (removeItem(p, e.id, owned)) addGold(p, sellPrice(e) * owned);
        p.playSound("random.orb", { pitch: 1.5 });
        return openShop(p, selIdx, crumb, src);
      });
    }
  } else {
    scr.select("상점", ICON("shop"));
    scr.body("§7판매 중인 물건이 없습니다.");
  }
  scr.reopen = () => openShop(p, selIdx, crumb, src);
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
    .toggle("메뉴/스킬 버튼 사용 (핫바 9·8번 칸)", d.set.slots !== false)
    .dropdown("스킬 버튼 배치", ["스킬 버튼 = 스킬 1, 쉬프트+버튼 = 스킬 2", "스킬 버튼 = 스킬 2, 쉬프트+버튼 = 스킬 1"], d.set.skillSwap ? 1 : 0)
    .toggle("쉬프트+공격으로 스킬 1 발동", d.set.shiftAttack !== false)
    .toggle("쉬프트 누를 때 스킬 2 이름 안내", d.set.skillHint !== false)
    .toggle("하단 HP/MP/Lv 바", d.set.status !== false)
    .toggle("길 안내 표시 (화살표)", d.set.nav !== false)
    .toggle("길 안내 파티클", d.set.navFx !== false)
    .show(p);
  if (!r.canceled) {
    let sw;
    [d.set.quest, d.set.card, d.set.invite, d.set.slots, sw, d.set.shiftAttack, d.set.skillHint, d.set.status, d.set.nav, d.set.navFx] = r.formValues;
    d.set.skillSwap = sw === 1;
    save(p);
  }
  return openHome(p);
}

// ═════════ 채팅 ═════════
function fmtTime(t) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function openChat(p, ch = "global") {
  const list = CH.channels(p);
  if (!list.find((c) => c.ch === ch)) ch = "global";
  CH.markSeen(p, ch);
  const cur = list.find((c) => c.ch === ch);
  const scr = new Screen("L", `채팅 / ${cur.name}`);
  for (const c of list.slice(0, 7)) {
    const n = CH.unread(p, c.ch);
    scr.item(`§f${c.name}${n ? `  §d§l● ${n}` : ""}`, ICON(c.icon), () => openChat(p, c.ch), { on: c.ch === ch });
  }
  chrome(scr, p, "chat");
  scr.select(cur.name, ICON(cur.icon));
  const msgs = CH.log(ch).slice(-14);
  scr.body(msgs.length
    ? msgs.map((m) => `§7${fmtTime(m.t)} ${m.from === p.id ? "§a" : "§e"}§l${m.name}§r§7: §f${m.text}`).join("\n")
    : "§7아직 메시지가 없습니다.\n\n아래 '메시지 보내기'로 대화를 시작하세요.");
  scr.action("✎ 메시지 보내기", async () => {
    const r = await new ModalFormData().title(cur.name).textField("메시지", "내용 입력", "").show(p);
    if (!r.canceled) CH.send(p, ch, r.formValues[0]);
    return openChat(p, ch);
  });
  scr.action("새 1:1 대화", async () => {
    const others = world.getAllPlayers().filter((x) => x.id !== p.id);
    if (!others.length) {
      msg(p, "§7접속 중인 다른 플레이어가 없습니다.");
      return openChat(p, ch);
    }
    const r = await new ModalFormData().title("1:1 대화").dropdown("상대", others.map((x) => x.name), 0).show(p);
    if (r.canceled) return openChat(p, ch);
    return openChat(p, CH.openDm(p, others[r.formValues[0]]));
  });
  scr.action("채팅방 만들기 / 참가", () => openRooms(p));
  if (ch.startsWith("room:")) scr.action("§c채팅방 나가기", () => { CH.leaveRoom(p, ch.slice(5)); return openChat(p); });
  if (cur.to) scr.action("1:1 대화 닫기", () => { CH.closeDm(p, cur.to); return openChat(p); });
  scr.reopen = () => openChat(p, ch);
  return scr.show(p);
}

function openRooms(p, sel) {
  const rooms = CH.allRooms();
  sel = sel ?? rooms[0]?.name;
  const scr = new Screen("L", "채팅 / 채팅방");
  for (const r of rooms.slice(0, 7)) {
    scr.item(`§f# ${r.name}${r.pw ? " §7(비공개)" : ""}\n§7${r.members.length}명 · 방장 ${r.names[r.owner] ?? "?"}`, ICON("room"), () => openRooms(p, r.name), { on: r.name === sel });
  }
  chrome(scr, p, "chat");
  const r = rooms.find((x) => x.name === sel);
  scr.select(r ? `# ${r.name}` : "채팅방", ICON("room"));
  scr.body(r ? `§7멤버\n§f${r.members.map((m) => r.names[m]).join(", ")}${r.pw ? "\n\n§7비밀번호가 걸린 방입니다." : ""}` : "§7열린 채팅방이 없습니다.\n새로 만들어 보세요!");
  if (r && !r.members.includes(p.id)) scr.action("참가하기", async () => {
    let pw = "";
    if (r.pw) {
      const f = await new ModalFormData().title(`# ${r.name}`).textField("비밀번호", "", "").show(p);
      if (f.canceled) return openRooms(p, sel);
      pw = String(f.formValues[0]);
    }
    const res = CH.joinRoom(p, r.name, pw);
    if (res === "pw") msg(p, "§c비밀번호가 틀렸습니다.");
    return res === "ok" ? openChat(p, `room:${r.name}`) : openRooms(p, sel);
  });
  if (r?.members.includes(p.id)) scr.action("입장", () => openChat(p, `room:${r.name}`));
  scr.action("새 채팅방 만들기", async () => {
    const f = await new ModalFormData().title("채팅방 만들기").textField("방 이름 (최대 16자)", "예) 던전 공략", "").textField("비밀번호 (비우면 공개)", "", "").show(p);
    if (f.canceled) return openRooms(p, sel);
    const name = String(f.formValues[0]).trim().slice(0, 16);
    if (!CH.createRoom(p, name, String(f.formValues[1]))) {
      msg(p, "§c만들 수 없는 이름이거나 이미 있는 방입니다.");
      return openRooms(p, sel);
    }
    return openChat(p, `room:${name}`);
  });
  scr.action("돌아가기", () => openChat(p));
  return scr.show(p);
}

// ═════════ 길찾기 (장소 / NPC / 퀘스트 목표) ═════════
const NAV_FILTERS = [{ id: "all", name: "전체" }, { id: "fav", name: "즐겨찾기" }, { id: "wp", name: "장소" }, { id: "npc", name: "NPC" }, { id: "quest", name: "퀘스트 목표" }];

function navEntries(p) {
  const out = [];
  for (const [id, w] of Object.entries(WP.waypoints())) {
    out.push({ kind: "wp", id, name: w.name, sub: w.cat, desc: w.desc, t: { x: w.x + 0.5, y: w.y, z: w.z + 0.5, dim: w.dim, label: w.name }, icon: "nav" });
  }
  for (const [id, r] of Object.entries(npcRegistry())) {
    if (r.x === undefined) continue;
    out.push({ kind: "npc", id, name: r.name, sub: r.kind === "combat" ? "전투 NPC" : "NPC", t: { x: r.x + 0.5, y: r.y, z: r.z + 0.5, dim: r.dim, label: r.name }, icon: "npc" });
  }
  for (const qid of Q.priority(p)) {
    const q = Q.getQuest(qid);
    const t = Q.navTarget(p, q);
    if (t) out.push({ kind: "quest", id: qid, name: t.label, sub: `퀘스트 · ${q.title}`, t, icon: "quest" });
  }
  return out;
}

export function openNav(p, filter = "all", selKey) {
  const d = data(p);
  const favs = d.navFav ?? {};
  let list = navEntries(p).filter((x) => filter === "all" || (filter === "fav" ? favs[`${x.kind}:${x.id}`] : x.kind === filter));
  list.sort((a, b) => WP.distTo(p, a.t) - WP.distTo(p, b.t));
  const shown = list.slice(0, 7);
  const sel = list.find((x) => `${x.kind}:${x.id}` === selKey) ?? shown[0];
  const scr = new Screen("L", `길찾기 / ${NAV_FILTERS.find((f) => f.id === filter).name}`);
  for (const x of shown) {
    const dist = WP.distTo(p, x.t);
    const active = d.navTo && d.navTo.kind === x.kind && d.navTo.id === x.id;
    scr.item(`${active ? "§d▶ " : "§f"}${favs[`${x.kind}:${x.id}`] ? "§e★ §f" : ""}${x.name}\n§7${x.sub ?? ""} · ${dist === Infinity ? "다른 차원" : `${Math.round(dist)}m`}`, ICON(x.icon), () => openNav(p, filter, `${x.kind}:${x.id}`), { on: x === sel });
  }
  chrome(scr, p, "nav");
  if (sel) {
    scr.select(sel.name, ICON(sel.icon));
    scr.body(rt(
      `§d§l${sel.sub ?? ""}§r\n`,
      sel.desc ? `§f${sel.desc}\n` : "",
      `\n§7방향  ${Q.navText(p, sel.t)}\n§7좌표 §f${Math.floor(sel.t.x)}, ${Math.floor(sel.t.y)}, ${Math.floor(sel.t.z)}\n`,
      d.navTo ? `\n§7현재 안내 중: §f${WP.manualTarget(p)?.label ?? "-"}` : "",
    ));
    if (sel.kind === "quest") {
      scr.action("이 퀘스트를 최우선으로 (HUD 길 안내)", () => { Q.movePriority(p, sel.id, "top"); WP.stopNav(p); return openNav(p, filter, `${sel.kind}:${sel.id}`); });
    } else {
      scr.action("§d길 안내 시작", () => { WP.startNav(p, sel.kind, sel.id); });
    }
    const fk = `${sel.kind}:${sel.id}`;
    if (sel.kind !== "quest") scr.action(favs[fk] ? "★ 즐겨찾기 해제" : "☆ 즐겨찾기 추가", () => {
      d.navFav = { ...favs };
      if (d.navFav[fk]) delete d.navFav[fk];
      else d.navFav[fk] = true;
      save(p);
      return openNav(p, filter, fk);
    });
    if (isAdmin(p)) scr.action("§7(관리자) 순간이동", () => { p.teleport({ x: sel.t.x, y: sel.t.y, z: sel.t.z }); });
  } else {
    scr.select("길찾기", ICON("nav"));
    scr.body("§7등록된 장소가 없습니다.\n\n제작자 도구 > 길찾기에서 장소를 등록하세요.");
  }
  if (d.navTo) scr.action("§c길 안내 종료", () => { WP.stopNav(p); return openNav(p, filter, selKey); });
  scr.action(`분류: ${NAV_FILTERS.find((f) => f.id === filter).name}`, () => {
    const i = NAV_FILTERS.findIndex((f) => f.id === filter);
    return openNav(p, NAV_FILTERS[(i + 1) % NAV_FILTERS.length].id);
  });
  scr.reopen = () => openNav(p, filter, selKey);
  return scr.show(p);
}
