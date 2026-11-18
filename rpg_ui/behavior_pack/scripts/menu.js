// 플레이어 메뉴 화면들
import { world, EquipmentSlot } from "@minecraft/server";
import { hiddenOpen } from "./hidden_jobs.js";
import { ModalFormData } from "@minecraft/server-ui";
import { Screen, rt } from "./ui.js";
import { data, save, stat, xpNeed, addGold, msg, notify, isAdmin, byId, MAX_LV, maxMp } from "./player.js";
import { CLASSES, STATS, CLASS_CHANGE_COST } from "./classes.js";
import * as Q from "./quests.js";
import * as P from "./party.js";
import { shopList, sellPrice, canBuy, canSell } from "./shop.js";
import {
  ICON, CATS, category, rarity, weaponInfo, armorSlot, iconOf, itemName, STARS, ENCH_KO, roman,
  inv, countItem, removeItem, giveItem,
} from "./itemdb.js";
import { openAdmin } from "./admin.js";
import * as CH from "./chat.js";
import * as SK from "./skills.js";
import { combatStats } from "./combat.js";
import { enhLines, defenseOf, heldEnhMul, getEnh, enhKind, atkLine, defLine } from "./enhance.js";
import { loreInfo } from "./itemlore.js";
import * as WP from "./waypoints.js";
import { npcRegistry } from "./npcdb.js";
import * as J from "./jobs.js";

// ───────── 공통 크롬(레일 + 재화 칩) ─────────
const SECTIONS = [
  { id: "home", name: "홈", icon: "home", open: (p) => openHome(p) },
  { id: "profile", name: "내 정보", icon: "profile", open: (p) => openProfile(p) },
  { id: "party", name: "파티", icon: "party", open: (p) => openParty(p) },
  { id: "chat", name: "채팅", icon: "chat", open: (p) => openChat(p) },
  { id: "quest", name: "퀘스트", icon: "quest", open: (p) => openQuests(p) },
  { id: "skill", name: "직업·스킬", icon: "skill", open: (p) => openSkills(p) },
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
  for (const s of SECTIONS) if (s.id !== "settings" || current === s.id) scr.tab(s.name, ICON(s.icon), () => s.open(p), s.id === current);
  if (isAdmin(p)) scr.tab("제작자 도구", ICON("admin"), () => openAdmin(p), current === "admin");
  chips(scr, p);
  return scr;
}

/** 표시용 현재 직업 (승급 경로 반영) */
const clsOf = (p) => {
  const t = J.PATHS[J.currentPath(data(p))] ?? J.PATHS.novice;
  return { name: t.name, color: t.color ?? "§f", icon: t.icon };
};

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
    `\n\n§e§l조작§r\n§6핫바 9번 §f메뉴  §7· 쉬프트: 옆 창 접기/펼치기\n§e직업 도구를 들고 §f① 클릭 ② 쉬프트+클릭 ③ 쉬프트+점프\n§b공중에서 점프 한 번 더 §f대시 §7(Lv.10, 재사용 80초)\n§7승급·도구 받기 §f메뉴 > 직업·스킬`,
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
  scr.action("§b더보기 (전투 정보 · 스킬 위력)", () => openCombatInfo(p));
  scr.reopen = () => openProfile(p, sel);
  return scr.show(p);
}

// ═════════ 아이템 자세히 보기 (V12.132) ═════════
//   설정 · 공격력 · 강화(단계 막대 · 다음 단계) · 이 무기 / 도구의 스킬 (대기 · 마나 · 위력)
export function openItemDetail(p, it, back) {
  const scr = new Screen("L", "배낭 / 자세히 보기");
  const li = loreInfo(it.typeId);
  scr.tab("돌아가기", ICON("back"), back);
  const lines = ["§l§f", itemName(it), "§r\n"];
  if (li) lines.push(`§7${li.cat}\n\n§f${li.flavor}\n\n§b● 공격력 §f${atkLine(li.atk, it)}\n`);
  else { const w = weaponInfo(it.typeId); if (w?.atk) lines.push(`§7${w.kind}\n§b● 공격력 §f${atkLine(w.atk, it)}\n`); if (w?.def) lines.push(`§7${w.kind}\n§b● 방어력 §f${defLine(w.def, it)}\n`); }
  lines.push(enhLines(it));
  const KT = { 1: "①", 2: "②", 3: "③", 4: "④" };
  if (SK.WEAPON_NAMES[it.typeId]) {
    lines.push("\n§e§l스킬§r\n");
    for (const { s, mp, mix, pow } of SK.weaponSkillInfo(p, it.typeId)) lines.push(`§f${KT[s.key]} §l${s.name.split("·").pop().trim()}§r §7대기 ${s.cd}초 · 마나 ${mp} · 위력 §e${numc(pow)}\n§8${s.desc ?? ""}\n`);
  } else {
    const path = J.pathOfTool(it.typeId);
    if (path) {
      lines.push(`\n§e§l${J.PATHS[path]?.name ?? ""} 스킬§r\n`);
      for (const s of J.skillsOfPath(path)) { const pw = SK.jobSkillPower(p, s); lines.push(`§f${KT[s.key] ?? ""} §l${s.name}§r §7Lv.${s.lv} · 대기 ${s.cd}초 · 마나 ${SK.mpCost(p, s.mp)}${pw ? ` · 위력 §e${numc(pw)}` : ""}\n§8${s.desc ?? ""}\n`); }
    }
  }
  scr.select(rt(itemName(it)), iconOf(it.typeId));
  scr.body(rt(lines));
  scr.reopen = () => openItemDetail(p, it, back);
  return scr.show(p);
}

// ═════════ 더보기: 전투 정보 (V12.130) ═════════
//   내 수치 · 피해 계산 · 내 직업 스킬 · 가진 사신수 · 사흉수 무기만 (가방 · 손에 있는 것)
const KEY_TXT = { 1: "① 클릭", 2: "② 쉬프트+클릭", 3: "③ 쉬프트+점프", 4: "④ 쉬프트 두 번" };
const numc = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
function ownedWeapons(p) {
  const have = new Set();
  try { const c = p.getComponent("minecraft:inventory").container; for (let i = 0; i < c.size; i++) { const it = c.getItem(i); if (it && SK.WEAPON_NAMES[it.typeId]) have.add(it.typeId); } } catch {}
  return Object.keys(SK.WEAPON_NAMES).filter((id) => have.has(id));
}
export function openCombatInfo(p, sel = "me") {
  const d = data(p);
  const scr = new Screen("L", "내 정보 / 전투 정보");
  const owned = ownedWeapons(p);
  const entries = [["me", "§l내 전투 수치", "profile"], ["calc", "§l피해 계산", "skill"], ["job", "§l내 직업 스킬", "class"],
    ...owned.map((id) => [id, `§l${SK.WEAPON_NAMES[id]}`, "class"])];
  for (const [id, name, icon] of entries) scr.item(name, ICON(icon), () => openCombatInfo(p, id), { on: id === sel });
  chrome(scr, p, "profile");
  scr.select("전투 정보", ICON("skill"));
  const cs = combatStats(p);
  let body = "";
  if (sel === "me") {
    const hc = p.getComponent("minecraft:health");
    body = `§e§l공격 스탯§r\n§f힘 ${cs.str} §7→ 근접 §f+${cs.melee}%\n§f민첩 ${cs.dex} §7→ 원거리 §f+${cs.ranged}%\n§f지능 ${cs.int} §7→ 마법 §f+${cs.magic}%\n\n` +
      `§e§l생존§r\n§f체력 ${cs.vit} §7→ 최대 체력 §f${numc(hc?.effectiveMax ?? 0)}\n§7마나 §f${numc(maxMp(p))}\n` +
      (() => { const df = defenseOf(p); return `§7방어력 §f${df.total} §7(갑옷 ${df.base} + 강화 ${df.enh} → 받는 피해 -${Math.round(df.red * 100)}% 추가)\n§7손에 든 무기 강화 §f×${heldEnhMul(p).toFixed(2)}\n\n`; })() +
      `§e§l공통§r\n§7치명타 5% · 1.5배 · 몹 · 환경 피해 1.1배`;
  } else if (sel === "calc") {
    body = "§e§l스탯 곡선§r §7(상한 없음, 많이 찍을수록 1점당 효과 감소)\n§f힘 · 지능: 100에 +100% · 200에 +150% · 400에 +200%\n§f민첩(원거리): 100에 +75% · 200에 +120% · 400에 +171%\n\n" +
      "§e§l평타§r\n§f아이템 공격력 × 근접 배율 × 치명\n\n§e§l사신수 · 사흉수 스킬§r\n§f200 × (근접%·힘 + 원거리%·민첩 + 마법%·지능) × (1 + 레벨×2.5%) × 위력 보정 × 치명\n\n" +
      "§e§l직업 스킬§r\n§f차수 바탕(60/95/135) × 스탯 배율 × (1 + 차수×10%) × (1 + 레벨×1.5%) × 스킬 위력 × 위력 보정 × 치명\n\n" +
      "§7위력 보정 = 스킬마다 '한 번 쓸 때 총 피해'를 재사용 대기 · 마나 · 성격(장판 · 지속 · 이동기)에 맞춘 값. 한 번의 실제 피해는 위력 × 그 스킬 안의 타격 배율";
  } else if (sel === "job") {
    const list = J.learned(d);
    body = list.length ? list.map((s) => { const pw = SK.jobSkillPower(p, s); return `§f${KEY_TXT[s.key] ?? ""} §l${s.name}§r §7${J.PATHS[s.path]?.name ?? ""}\n§7대기 §f${s.cd}초 §7· 마나 §9${SK.mpCost(p, s.mp)} §7· ${{ melee: "근접", ranged: "원거리", magic: "마법", heal: "회복", buff: "강화" }[s.kind] ?? s.kind}${pw ? ` §7· 위력 §e${numc(pw)}` : ""}`; }).join("\n\n") : "§7배운 직업 스킬이 없습니다.";
  } else if (SK.WEAPON_NAMES[sel] && owned.includes(sel)) {
    const mixTxt = (m) => [["근접", m[0]], ["원거리", m[1]], ["마법", m[2]]].filter((x) => x[1] > 0).map(([n, v]) => `${n} ${Math.round(v * 100)}%`).join(" · ");
    body = SK.weaponSkillInfo(p, sel).map(({ s, mp, mix, pow }) => `§f${KEY_TXT[s.key]} §l${s.name.split("·").pop().trim()}§r\n§7대기 §f${s.cd}초 §7· 마나 §9${mp} §7· 위력 §e${numc(pow)}\n§7${mixTxt(mix)}`).join("\n\n");
  } else body = "§7가지고 있는 무기만 볼 수 있습니다.";
  scr.body(body);
  scr.action("§7능력치로 돌아가기", () => openProfile(p));
  scr.reopen = () => openCombatInfo(p, sel);
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
// 퀘스트 목록 마디 그림 (새 틀: 버튼 아이콘으로 넘김 — 칸마다 그림 5장을 겹쳐 두지 않아 가벼움)
const QNODE = [["[Q0]", "done"], ["[Q1]", "ready"], ["[Q2]", "active"], ["[Q3]", "avail"], ["[Q4]", "lock"]];
const qIcon = (mark) => `textures/ui/rpg/forge/node_${(QNODE.find(([m]) => mark.includes(m)) ?? QNODE[3])[1]}`;
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

/** 퀘스트 자세히 보기 (V12.131): 왼쪽 = 목표 · 보상 칸, 오른쪽 = 진행 별(★ 달성 / ☆ 남음) · 목표마다 진행 막대 · 연결 퀘스트 */
export function openQuestFull(p, q, back, selIdx = 0) {
  const st = Q.state(p, q), t = Q.qtype(q), live = st === "active" || st === "ready";
  const scr = new Screen("Q", q.title);
  const cells = q.obj.map((o, i) => ({ i, o, cur: live ? Q.objProgress(p, q, i) : st === "done" ? Q.objNeed(o) : 0, need: Q.objNeed(o) }));
  cells.forEach((c, k) => {
    const done = c.cur >= c.need, prevDone = k > 0 && cells[k - 1].cur >= cells[k - 1].need;
    const mark = (done ? "[Q0]" : live ? "[Q2]" : st === "locked" ? "[Q4]" : "[Q3]") + (k === 0 ? "[QF]" : "") + (k === cells.length - 1 ? "[QE]" : "") + (prevDone ? "[QG]" : "");
    scr.item([Q.objLine(p, q, c.i, live), `\n§r${done ? "§a완료" : `§7${c.cur}/${c.need} · ${Math.floor((c.cur / Math.max(1, c.need)) * 100)}%`}`], qIcon(mark), () => openQuestFull(p, q, back, c.i), { on: c.i === selIdx, mark });
  });
  scr.tab("돌아가기", ICON("back"), () => back(q.id));
  const stars = cells.map((c) => (c.cur >= c.need ? "§e★" : "§8☆")).join("");
  const c = cells[selIdx] ?? cells[0];
  const bar = (cur, need) => { const n = Math.round((Math.min(cur, need) / Math.max(1, need)) * 20); return `§a${"|".repeat(n)}§8${"|".repeat(20 - n)}§r`; };
  const lines = [`${t.color}§l${t.name} 퀘스트§r  ${STATE_TAG[st]}\n§l§f${q.title}§r\n\n§7진행 ${stars}  §f${cells.filter((x) => x.cur >= x.need).length}/${cells.length}\n\n`];
  if (c) lines.push("§e§l선택한 목표§r\n", Q.objLine(p, q, c.i, live), `\n${bar(c.cur, c.need)} §f${c.cur}/${c.need}\n\n`);
  if (q.desc) lines.push(`§7${q.desc}\n\n`);
  if (q.region) lines.push(`§7지역 §f${q.region}   `);
  if (q.giver !== "board") lines.push(`§7의뢰인 §f${q.giverName ?? q.giver}`);
  lines.push("\n\n§e§l보상§r\n");
  Q.rewardLines(q).forEach((l) => lines.push(l, "\n"));
  const nexts = Q.allQuests().filter((x) => x.prereq === q.id).map((x) => x.title);
  if (q.prereq) lines.push(`\n§7앞 퀘스트 §f${Q.getQuest(q.prereq)?.title ?? q.prereq}`);
  if (nexts.length) lines.push(`\n§7다음 퀘스트 §f${nexts.join(", ")}`);
  scr.select(q.title, ICON(t.icon));
  scr.body(rt(lines));
  questActions(scr, p, q, (id) => openQuestFull(p, Q.getQuest(id ?? q.id) ?? q, back, selIdx));
  scr.reopen = () => openQuestFull(p, q, back, selIdx);
  return scr.show(p);
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
    scr.action("퀘스트 NPC 찾기", () => openNav(p, "quest"));
    if (pr > 0) scr.action("▲ 우선순위 올리기", () => { Q.movePriority(p, q.id, -1); return back(q.id); });
    if (pr < Q.priority(p).length - 1) scr.action("▼ 우선순위 내리기", () => { Q.movePriority(p, q.id, 1); return back(q.id); });
    scr.action(data(p).q.hide?.[q.id] ? "HUD에 표시" : "HUD에서 숨기기", () => { Q.toggleHidden(p, q.id); return back(q.id); });
    if (!Q.adv(q).noAbandon) scr.action("§c포기", () => { Q.abandon(p, q.id); return back(); });
  }
}

/** 메인 퀘스트 연결 (V12.134): 줄줄이 이어진 마디 — ✔ 완료 · ▶ 진행 · ● 받을 수 있음 · 잠김
 *  누르면 오른쪽에 내용, 잠긴 마디는 「앞 퀘스트를 끝내면 열림」만 보여 줌 (보상 · 내용은 가림) */
function openMainChain(p, sel, page) {
  const d = data(p);
  const mains = Q.allQuests().filter((q) => (q.type ?? "sub") === "main" && (q.enabled || d.q.a[q.id] || d.q.d[q.id]) && !(Q.adv(q).secret && !d.q.d[q.id] && !d.q.a[q.id]));
  const chain = Q.chainSort(mains).map(({ q, depth }) => ({ q, depth, st: Q.state(p, q) }));
  // 앞 퀘스트를 아직 못 끝낸 마디는 무조건 잠김으로 (레벨 · 직업 조건으로 잠긴 것도 잠김)
  for (const x of chain) if (x.st === "available" && x.q.prereq && !d.q.d[x.q.prereq]) x.st = "locked";
  const PAGE = 5; // 새 틀 목록 칸 (한 줄 28) — 작은 화면에서도 안 넘치게
  const pages = Math.max(1, Math.ceil(chain.length / PAGE));
  const firstOpen = Math.max(0, chain.findIndex((x) => x.st !== "done"));
  if (page === undefined || page === null) page = Math.floor(firstOpen / PAGE);
  page = Math.min(page, pages - 1);
  const shown = chain.slice(page * PAGE, page * PAGE + PAGE);
  sel = sel && chain.find((x) => x.q.id === sel) ? sel : (chain[firstOpen] ?? shown[0])?.q.id;
  // [RPG:Q] 연결 화면: 왼쪽 마디(✔ ★ ▶ ● 자물쇠) + 금색/남색 연결선, 오른쪽 이름 칸 (ui/rpg_forge.json)
  const scr = new Screen("Q", "메인 이야기");
  const QM = { done: "[Q0]", ready: "[Q1]", active: "[Q2]", available: "[Q3]", locked: "[Q4]" };
  shown.forEach((x, k) => {
    const i = page * PAGE + k, lock = x.st === "locked";
    const prevDone = i > 0 && chain[i - 1].st === "done";
    const mark = QM[x.st] + (i === 0 ? "[QF]" : "") + (i === chain.length - 1 ? "[QE]" : "") + (prevDone ? "[QG]" : "");
    const title = lock ? `§8${x.q.title}` : x.st === "done" ? `§7${x.q.title}` : `§f${x.q.title}`;
    const sub = { done: "§2완료", ready: "§e완료 보고 가능", active: "§6진행 중", available: "§b수락 가능", locked: "§8잠김 · 앞 장을 끝내면 열림" }[x.st];
    scr.item(`${lock ? "§8" : "§e"}${i + 1}장  ${title}\n§r${sub}`, qIcon(mark), () => openQuests(p, "main", x.q.id, page), { on: x.q.id === sel, mark });
  });
  scr.tab("메뉴", ICON("back"), () => openHome(p));
  for (const c of QCATS) scr.tab(c.name, ICON(c.icon), () => openQuests(p, c.id), c.id === "main");
  chips(scr, p);
  const doneN = chain.filter((x) => x.st === "done").length;
  scr.chip(ICON("star"), `${doneN}/${chain.length}`);
  const cur = chain.find((x) => x.q.id === sel);
  if (!cur) {
    scr.select("메인 이야기", ICON("star"));
    scr.body("§7아직 메인 퀘스트가 없습니다.");
  } else if (cur.st === "locked") {
    const idx = chain.indexOf(cur);
    const prev = cur.q.prereq ? Q.getQuest(cur.q.prereq) : null;
    scr.select(rt(`§8${idx + 1}장 · 잠김`), ICON("lock"));
    const why = prev && !d.q.d[prev.id] ? `§f「${prev.title}」§7을(를) 끝내면 열립니다.` : `§7${Q.lockReason(p, cur.q)}`;
    scr.body(rt(`§8§l${cur.q.title}§r

§c§l잠긴 이야기§r
${why}

§8내용과 보상은 열리면 볼 수 있습니다.

§7메인 진행 §f${doneN}/${chain.length}
${"§a■".repeat(doneN)}${"§8■".repeat(chain.length - doneN)}`));
  } else {
    const q = cur.q, idx = chain.indexOf(cur);
    scr.select(rt(`§e${idx + 1}장 §f`, q.title), ICON(Q.qtype(q).icon));
    scr.body(rt(questDetailBody(p, q), `

§7메인 진행 §f${doneN}/${chain.length}
${"§a■".repeat(doneN)}${"§8■".repeat(chain.length - doneN)}`));
    scr.action("§b자세히 보기", () => openQuestFull(p, q, (id) => openQuests(p, "main", id ?? sel, page)));
    questActions(scr, p, q, (id) => openQuests(p, "main", id ?? sel, page));
  }
  if (pages > 1) {
    if (page > 0) scr.action(`▲ 앞 장들 (${page}/${pages})`, () => openQuests(p, "main", undefined, page - 1));
    if (page < pages - 1) scr.action(`▼ 다음 장들 (${page + 2}/${pages})`, () => openQuests(p, "main", undefined, page + 1));
  }
  scr.reopen = () => openQuests(p, "main", sel, page);
  return scr.show(p);
}

export function openQuests(p, cat = "active", sel, page) {
  if (cat === "main") return openMainChain(p, sel, page); // 페이지를 안 정하면 지금 진행 중인 장이 있는 쪽
  page ??= 0;
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
  const PAGE = 5; // 새 틀 목록 칸 (한 줄 28) — 작은 화면에서도 안 넘치게
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  page = Math.min(page, pages - 1);
  const shown = list.slice(page * PAGE, page * PAGE + PAGE);
  sel = sel && list.find((x) => x.q.id === sel) ? sel : shown[0]?.q.id;
  const catName = QCATS.find((c) => c.id === cat).name;
  // 연결 화면 (V12.135): 상태 마디 + 같은 묶음(선행 → 후속)끼리만 연결선
  const scr = new Screen("Q", `퀘스트 · ${catName}`);
  const QM = { done: "[Q0]", ready: "[Q1]", active: "[Q2]", available: "[Q3]", locked: "[Q4]" };
  shown.forEach(({ q, st }, k) => {
    const t = Q.qtype(q);
    const pr = pri.indexOf(q.id);
    const nav = st === "active" || st === "ready" ? Q.navTarget(p, q) : null;
    const dist = nav && nav.dim === p.dimension.id ? ` · ${Math.round(Math.hypot(nav.x - p.location.x, nav.z - p.location.z))}m` : "";
    const idx = page * PAGE + k, depth = list[idx]?.depth ?? 0, nextDepth = list[idx + 1]?.depth ?? 0;
    const linkUp = depth > 0, linkDown = nextDepth > 0 && idx + 1 < list.length;
    const mark = QM[st] + (linkUp ? "" : "[QF]") + (linkDown ? "" : "[QE]") + (linkUp && list[idx - 1]?.st === "done" ? "[QG]" : "");
    const sub = { done: "§2완료", ready: "§e완료 보고 가능", active: "§6진행 중", available: "§b수락 가능", locked: "§8잠김" }[st];
    scr.item(`${pr === 0 ? "§e▶ " : ""}${t.color}[${t.name}] ${st === "locked" ? "§8" : "§f"}${q.title}\n§r${sub}§7${q.region ? ` · ${q.region}` : ""}${dist}`, qIcon(mark), () => openQuests(p, cat, q.id, page), { on: q.id === sel, mark });
  });
  scr.tab("메뉴", ICON("back"), () => openHome(p));
  for (const c of QCATS) scr.tab(c.name, ICON(c.icon), () => openQuests(p, c.id), c.id === cat);
  chips(scr, p);
  scr.chip(ICON("quest"), `${pri.length}/${Q.MAX_ACTIVE}`);
  const q = Q.getQuest(sel);
  if (q) {
    scr.select(q.title, ICON(Q.qtype(q).icon));
    scr.body(questDetailBody(p, q));
    scr.action("§b자세히 보기", () => openQuestFull(p, q, (id) => openQuests(p, cat, id ?? sel, page)));
    questActions(scr, p, q, (id) => openQuests(p, cat, id ?? sel, page));
  } else {
    scr.select(catName, ICON("quest"));
    scr.body(cat === "done" ? "§7아직 완료한 퀘스트가 없습니다." : "§7이 분류에 퀘스트가 없습니다.\n\n게시판(전체)이나 NPC에게서 퀘스트를 받아 보세요.");
  }
  if (pages > 1) scr.action(`다음 페이지 (${page + 1}/${pages})`, () => openQuests(p, cat, undefined, (page + 1) % pages));
  scr.reopen = () => openQuests(p, cat, sel, page);
  return scr.show(p);
}

// ═════════ 직업·스킬 (승급 단계별 탭 / 직업 정보 / 승급 / 스킬 장착) ═════════
const tName = (t) => t.tool?.name ?? "-";
const keyLine = (path) => (J.skillAt(path, 4) ? [1, 2, 3, 4] : [1, 2, 3]).map((k) => { const s = J.skillAt(path, k); return `§e${J.KEY_ICONS[k]} ${J.KEY_NAMES[k]} §f${s ? `${s.name} §7(Lv.${s.lv})` : "-"}`; }).join("\n");

/** 직업 전용 도구 지급 (이미 가지고 있으면 생략) */
export function giveTool(p, path) {
  const id = J.toolId(path);
  if (!J.PATHS[path]?.tool || countItem(p, id) > 0) return false;
  giveItem(p, id, 1);
  notify(p, `§a전용 도구 획득: §f${J.PATHS[path].tool.name}`);
  return true;
}

/** 다음 승급 후보 [{ id, ok, why }] */
function nextAdvances(p) {
  const d = data(p);
  const cur = J.currentPath(d);
  const ids = [...(J.PATHS[cur]?.next ?? [])];
  // 히든: 영혼 수확자 (조건을 채우면 2차·3차 어디서나 나타남)
  if (d.reaperOpen && (J.PATHS[cur]?.tier ?? 0) >= 2 && cur !== "soul_reaper") ids.push("soul_reaper");
  if ((J.PATHS[cur]?.tier ?? 0) >= 2) for (const h of hiddenOpen(d)) if (h !== cur) ids.push(h);
  return ids.map((id) => {
    const t = J.PATHS[id];
    const why = d.lv < (t.lv ?? 1) ? `Lv.${t.lv} 필요` : d.gold < (t.cost ?? 0) ? `${t.cost}G 필요` : "";
    return { id, t, ok: !why, why };
  });
}

function doAdvance(p, id) {
  const d = data(p);
  const t = J.PATHS[id];
  if (!t) return;
  if (t.tier === 1) d.cls = id;
  if (t.tier === 2) d.adv2 = id;
  if (t.tier === 3) d.adv3 = id;
  if (t.cost) d.gold -= t.cost;
  save(p);
  giveTool(p, id);
  d.toolGiven = { ...(d.toolGiven ?? {}), [id]: true };
  save(p);
  p.playSound("random.levelup");
  try { p.dimension.spawnParticle("minecraft:totem_particle", p.location); } catch {}
  notify(p, `${t.color ?? "§f"}§l${J.TIER_NAMES[t.tier]} 승급! §r§f${t.name}`);
}

export function openSkills(p, tab, sel) {
  const d = data(p);
  const chainIds = J.chain(d);
  const curTier = chainIds.length;
  tab = tab ?? (curTier ? `t${curTier}` : "info");

  // 레일: 메뉴 / 직업 정보 / 1차 / 2차 / 3차
  const railOf = (scr) => {
    scr.tab("메뉴", ICON("back"), () => openHome(p));
    scr.tab("직업 정보", ICON("profile"), () => openSkills(p, "info"), tab === "info");
    for (let t = 1; t <= 3; t++) scr.tab(J.TIER_NAMES[t], ICON(t <= curTier ? "star" : "close"), () => openSkills(p, `t${t}`), tab === `t${t}`);
    chips(scr, p);
    scr.chip(ICON("skill"), `MP ${Math.floor(d.mp ?? maxMp(p))}/${maxMp(p)}`);
  };

  // ── 직업 정보 ──
  if (tab === "info") {
    const scr = new Screen("L", "직업·스킬 / 직업 정보");
    const cur = J.currentPath(d);
    if (!chainIds.length) {
      // 모험가: 1차 직업 선택
      sel = sel ?? "warrior";
      for (const id of J.PATHS.novice.next) {
        const t = J.PATHS[id];
        scr.item(`${t.color}§l${t.name}§r\n§7도구: ${tName(t)}`, ICON(t.icon), () => openSkills(p, "info", id), { on: id === sel });
      }
      railOf(scr);
      const t = J.PATHS[sel];
      scr.select(`${t.color}${t.name}`, ICON(t.icon));
      scr.body(rt(`§f${t.desc}\n\n§e§l전용 도구§r\n§f${tName(t)}\n\n§e§l1차 스킬§r\n`, J.skillsOfPath(sel).map((s) => `§f${s.name} §7(Lv.${s.lv}) ${s.desc}\n`), "\n§72차 승급: Lv.20 · 3차 승급: Lv.40"));
      scr.action(`§a${t.name}(으)로 시작`, () => { doAdvance(p, sel); return openSkills(p); });
      scr.reopen = () => openSkills(p, "info", sel);
      return scr.show(p);
    }
    // 승급 경로
    chainIds.forEach((id) => {
      const t = J.PATHS[id];
      scr.item(`${t.color}§l${J.TIER_NAMES[t.tier]} ${t.name}§r\n§7도구: ${tName(t)}`, ICON(t.icon), () => openSkills(p, `t${t.tier}`));
    });
    const nexts = nextAdvances(p);
    for (const n of nexts) scr.item(`§8${J.TIER_NAMES[n.t.tier]} ${n.t.name} §7(${n.ok ? "§a승급 가능" : n.why}§7)\n§7도구: ${tName(n.t)}`, ICON(n.t.icon), () => openSkills(p, "adv", n.id));
    railOf(scr);
    const t = J.PATHS[cur];
    scr.select(`${t.color ?? "§f"}${t.name}`, ICON(t.icon), true);
    const bon = ["str", "dex", "int", "vit"].map((k) => [k, J.pathBonus(d, k)]).filter(([, v]) => v);
    scr.body(rt(
      `${t.color ?? "§f"}§l${J.TIER_NAMES[t.tier]} ${t.name}§r  §7Lv.${d.lv}\n§f${t.desc}\n\n`,
      `§e§l전용 도구§r\n§f${tName(t)}\n\n`,
      `§e§l스킬 (${tName(t)}을(를) 들고)§r\n${keyLine(cur)}\n\n`,
      bon.length ? `§e§l승급 보너스§r\n§f${bon.map(([k, v]) => `${STATS.find((s) => s.id === k).name} +${v}`).join(", ")}\n\n` : "",
      d.lv >= 10 ? `§e§l대시§r §f공중에서 점프 한 번 더 §7(재사용 80초) ${d.set.dash === false ? "§c(꺼짐)" : "§a(켜짐)"}\n` : "§7대시: Lv.10에 해금 (공중 점프)\n",
      nexts.length ? `\n§e§l다음 승급§r\n${nexts.map((n) => `§f${n.t.name} §7- ${n.ok ? "§a가능" : n.why}`).join("\n")}` : "\n§6최종 단계에 도달했습니다",
    ));
    if (nexts.some((n) => n.ok)) scr.action("§a승급하기", () => openSkills(p, "adv", nexts.find((n) => n.ok).id));
    const missing = chainIds.filter((id) => countItem(p, J.toolId(id)) === 0);
    if (missing.length) scr.action(`전용 도구 다시 받기 (${missing.length}개)`, () => { for (const id of missing) giveTool(p, id); return openSkills(p, "info"); });
    scr.action("능력치 분배", () => openProfile(p));
    if (d.lv >= 10) scr.action(d.set.dash === false ? "대시 켜기" : "대시 끄기", () => { d.set.dash = d.set.dash === false; save(p); return openSkills(p, "info"); });
    scr.action(`§c직업 변경 (${CLASS_CHANGE_COST}G · 승급 초기화)`, () => openSkills(p, "change"));
    scr.reopen = () => openSkills(p, "info", sel);
    return scr.show(p);
  }

  // ── 승급 선택 ──
  if (tab === "adv") {
    const nexts = nextAdvances(p);
    sel = sel ?? nexts[0]?.id;
    const scr = new Screen("L", "직업·스킬 / 승급");
    for (const n of nexts) scr.item(`${n.t.color}§l${n.t.name}§r ${n.ok ? "§a(가능)" : `§7(${n.why})`}\n§7도구: ${tName(n.t)}`, ICON(n.t.icon), () => openSkills(p, "adv", n.id), { on: n.id === sel });
    railOf(scr);
    const n = nexts.find((x) => x.id === sel);
    if (n) {
      scr.select(`${n.t.color}${n.t.name}`, ICON(n.t.icon));
      scr.body(rt(
        `§f${n.t.desc}\n\n§e§l조건§r\n§fLv.${n.t.lv} · ${n.t.cost ?? 0}G\n\n§e§l전용 도구§r\n§f${tName(n.t)}\n\n`,
        `§e§l스킬§r\n`, J.skillsOfPath(sel).map((s) => `§f${s.name} §7(Lv.${s.lv}) ${s.desc}\n`),
        n.t.bonus ? `\n§e§l능력치 보너스§r\n§f${Object.entries(n.t.bonus).map(([k, v]) => `${STATS.find((s) => s.id === k).name} +${v}`).join(", ")}` : "",
      ));
      if (n.ok) scr.action(`§a${n.t.name}(으)로 승급 (${n.t.cost ?? 0}G)`, () => { doAdvance(p, sel); return openSkills(p, `t${n.t.tier}`); });
    } else {
      scr.select("승급", ICON("star"));
      scr.body("§7더 이상 승급할 수 없습니다.");
    }
    scr.action("돌아가기", () => openSkills(p, "info"));
    return scr.show(p);
  }

  // ── 직업 변경 ──
  if (tab === "change") {
    sel = sel ?? J.PATHS.novice.next.find((x) => x !== d.cls);
    const scr = new Screen("L", "직업·스킬 / 직업 변경");
    for (const id of J.PATHS.novice.next) {
      const t = J.PATHS[id];
      scr.item(`${t.color}§l${t.name}§r${d.cls === id ? " §7[현재]" : ""}\n§7도구: ${tName(t)}`, ICON(t.icon), () => openSkills(p, "change", id), { on: id === sel });
    }
    railOf(scr);
    const t = J.PATHS[sel];
    scr.select(`${t.color}${t.name}`, ICON(t.icon));
    scr.body(`§f${t.desc}\n\n§c직업을 바꾸면 2차·3차 승급이 초기화됩니다.\n§7새 직업의 전용 도구(${tName(t)})를 받습니다.\n§7비용 ${CLASS_CHANGE_COST}G`);
    if (sel !== d.cls) scr.action(`§c${t.name}(으)로 변경 (${CLASS_CHANGE_COST}G)`, () => {
      if (d.gold < CLASS_CHANGE_COST) { msg(p, "§c골드가 부족합니다."); return openSkills(p, "change", sel); }
      d.gold -= CLASS_CHANGE_COST;
      d.cls = sel;
      delete d.adv2;
      delete d.adv3;
      save(p);
      giveTool(p, sel);
      notify(p, `${t.color}§l${t.name}§r§f 의 길을 걷기 시작했다`);
      return openSkills(p, "info");
    });
    scr.action("돌아가기", () => openSkills(p, "info"));
    return scr.show(p);
  }

  // ── 1차/2차/3차 스킬 ──
  const tier = Number(tab.slice(1));
  const myPath = chainIds[tier - 1];
  // 아직 도달 못 한 단계: 갈 수 있는 갈래들의 스킬 미리보기
  const previewPaths = myPath ? [myPath] : (tier === curTier + 1 ? (J.PATHS[J.currentPath(d)]?.next ?? []) : []);
  const list = previewPaths.flatMap(J.skillsOfPath);
  sel = sel && list.find((s) => s.id === sel) ? sel : list[0]?.id;
  const scr = new Screen("L", `직업·스킬 / ${J.TIER_NAMES[tier]}${myPath ? ` ${J.PATHS[myPath].name}` : ""}`);
  for (const s of list) {
    const has = myPath && d.lv >= s.lv;
    const left = SK.readyIn(p, s.id);
    const k = s.key ?? 1;
    scr.item(`${has ? "§f" : "§7"}${J.KEY_ICONS[k]} ${s.name}\n§7${!myPath ? `${J.PATHS[s.path].name} 승급 시` : has ? `${J.KEY_NAMES[k]} · MP ${SK.mpCost(p, s.mp)} · ${s.cd}초${left > 0 ? ` §c(${Math.ceil(left)}s)` : ""}` : `Lv.${s.lv} 필요`}`, ICON(J.PATHS[s.path].icon), () => openSkills(p, tab, s.id), { on: s.id === sel });
  }
  railOf(scr);
  const s = J.getJobSkill(sel);
  if (s) {
    const t = J.PATHS[s.path];
    const has = myPath && d.lv >= s.lv;
    const k = s.key ?? 1;
    scr.select(s.name, ICON(t.icon));
    scr.body(rt(
      `${t.color}§l${J.TIER_NAMES[t.tier]} ${t.name}§r  ${has ? "§a[사용 가능]" : `§c[${myPath ? `Lv.${s.lv} 필요` : "승급 필요"}]`}\n\n`,
      `§f${s.desc}\n\n`,
      `§7발동 §e${J.KEY_ICONS[k]} ${J.KEY_NAMES[k]}\n§7마나 §9${SK.mpCost(p, s.mp)}   §7재사용 §f${s.cd}초\n§7전용 도구 §f${tName(t)}\n\n`,
      `§e§l조작 (${tName(t)}을(를) 들고)§r\n§e① 클릭§f(모바일: 길게 누르기)\n§e② 쉬프트 + 클릭\n§e③ 쉬프트 + 점프`,
    ));
    if (myPath && countItem(p, J.toolId(myPath)) === 0) scr.action(`전용 도구 받기 (${tName(J.PATHS[myPath])})`, () => { giveTool(p, myPath); return openSkills(p, tab, s.id); });
  } else {
    scr.select(J.TIER_NAMES[tier], ICON("close"));
    scr.body(tier > curTier + 1 ? `§7${J.TIER_NAMES[tier - 1]} 승급을 먼저 하세요.` : curTier === 0 ? "§7직업 정보에서 직업을 먼저 고르세요." : "§7스킬이 없습니다.");
  }
  scr.reopen = () => openSkills(p, tab, sel);
  return scr.show(p);
}

// ═════════ 배낭 (사진 레이아웃) ═════════
const EQ = [
  { slot: EquipmentSlot.Head, name: "머리" }, { slot: EquipmentSlot.Chest, name: "몸통" },
  { slot: EquipmentSlot.Legs, name: "다리" }, { slot: EquipmentSlot.Feet, name: "발" },
  { slot: EquipmentSlot.Offhand, name: "보조손" },
];
const SORTS = { rarity: "희귀도", name: "종류", count: "수량" };

const BAG_HIDE = new Set(["rpg:menu", "rpg:quest_tool", "rpg:skill"]);
function bagEntries(p) {
  const out = [];
  const c = inv(p);
  for (let i = 0; i < c.size; i++) {
    const it = c.getItem(i);
    // 메뉴 · 퀘스트 도구만 숨김 (사신수 · 사흉수 · 직업 도구 · 강화 재료는 보임, V12.138)
    if (it && !BAG_HIDE.has(it.typeId)) out.push({ key: `i${i}`, it, slot: i });
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
    if (info?.atk) lines.push(`\n§7공격력\n§l§f${atkLine(info.atk, it)}§r\n`);
    if (info?.def !== undefined && info.def) lines.push(`\n§7방어력\n§l§f${defLine(info.def, it)}§r\n`);
    lines.push(`§6${STARS(r)}§r  §7×${it.amount}\n`);
    const dur = it.getComponent("minecraft:durability");
    if (dur) lines.push(`§7내구도 §r${dur.maxDurability - dur.damage}/${dur.maxDurability}\n`);
    try {
      const en = it.getComponent("minecraft:enchantable")?.getEnchantments() ?? [];
      if (en.length) lines.push("\n§5", en.map((e) => `${ENCH_KO[e.type.id] ?? e.type.id} ${roman(e.level)}`).join("\n"), "\n");
    } catch {}
    // V12.132: 긴 설명 · 강화 표 · 스킬은 「자세히 보기」로 (여기엔 요약만)
    const li = loreInfo(it.typeId), L = getEnh(it);
    if (li) lines.push(`§7${li.cat}\n§b공격력 §f${atkLine(li.atk, it)}\n`);
    if (enhKind(it)) lines.push(`§6강화 §f+${L}§7/15\n`);
    const lore = it.getLore().filter((l) => !l.startsWith("§6§l강화 +") && !(li && (l.startsWith("§7") || l.startsWith("§8") || l.startsWith("§b●"))));
    if (lore.length) lines.push("\n§7", lore.join("\n"), "\n");
    if (sel.eq) lines.push(`\n§2${sel.eq.name}에 장착 중`);
    scr.select(rt(itemName(it)), iconOf(it.typeId));
    scr.body(rt(lines));

    if (li || enhKind(it)) scr.action("§b자세히 보기", () => openItemDetail(p, it, () => openBag(p, cat, sel.key, page)));
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

// ═════════ 상점 (구매 / 판매 탭 분리) ═════════
/** src: null = 공용 상점, { list, npc } = NPC 전용 상점. mode: "buy" | "sell" */
export function openShop(p, selIdx = 0, crumb = "상점", src = null, mode = "buy") {
  const d = data(p);
  const all = src?.list ?? shopList();
  // 구매: 구매 가능 상품 / 판매: 판매 가능하고 내가 가진 것
  const list = all
    .map((e, i) => ({ e, i, owned: countItem(p, e.id) }))
    .filter((x) => (mode === "buy" ? canBuy(x.e) : canSell(x.e) && x.owned > 0));
  const re = (i, m = mode) => openShop(p, i, crumb, src, m);
  const scr = new Screen("G", `${crumb} / ${mode === "buy" ? "구매" : "판매"}`);
  list.slice(0, 30).forEach((x, k) => scr.item(mode === "buy" ? `${x.e.price}G` : `×${x.owned}`, iconOf(x.e.id), () => re(k), { on: k === selIdx, rarity: rarity({ typeId: x.e.id, getComponent: () => undefined }) }));
  scr.tab("메뉴", ICON("back"), () => openHome(p));
  scr.tab("구매", ICON("shop"), () => re(0, "buy"), mode === "buy");
  scr.tab("판매", ICON("gold"), () => re(0, "sell"), mode === "sell");
  chips(scr, p);
  const x = list[selIdx];
  if (x) {
    const e = x.e;
    const info = weaponInfo(e.id);
    scr.select(rt(itemName(e.id), mode === "buy" && e.n > 1 ? ` ×${e.n}` : ""), iconOf(e.id));
    scr.body(rt(
      `§7${info?.kind ?? CATS.find((c) => c.id === category(e.id)).name}\n`,
      info?.atk ? `§7기초 공격력 §f${info.atk}\n` : "",
      info?.def ? `§7방어력 §f${info.def}\n` : "",
      mode === "buy"
        ? `\n§7가격 §6${e.price}G §7(${e.n}개)\n§7보유 §f${x.owned}개\n§7내 골드 §6${d.gold}G${canSell(e) ? `\n\n§7판매가 §f${sellPrice(e)}G/개` : "\n\n§7이 상품은 판매할 수 없습니다"}`
        : `\n§7판매가 §6${sellPrice(e)}G §7/개\n§7보유 §f${x.owned}개 §7→ 전부 §6${sellPrice(e) * x.owned}G\n§7내 골드 §6${d.gold}G`,
    ));
    if (mode === "buy") {
      const buy = (times) => () => {
        const cost = e.price * times;
        if (d.gold < cost) {
          msg(p, "§c골드가 부족합니다.");
          p.playSound("note.bass");
        } else if (giveItem(p, e.id, e.n * times)) {
          addGold(p, -cost);
          p.playSound("random.orb");
        }
        return re(selIdx);
      };
      scr.action(`구매 (${e.price}G)`, buy(1));
      scr.action(`5번 구매 (${e.price * 5}G)`, buy(5));
    } else {
      const sell = (n) => () => {
        n = Math.min(n, countItem(p, e.id));
        if (n > 0 && removeItem(p, e.id, n)) addGold(p, sellPrice(e) * n);
        p.playSound("random.orb", { pitch: 1.5 });
        return re(selIdx);
      };
      scr.action(`1개 판매 (+${sellPrice(e)}G)`, sell(1));
      if (x.owned >= 10) scr.action(`10개 판매 (+${sellPrice(e) * 10}G)`, sell(10));
      scr.action(`전부 판매 (+${sellPrice(e) * x.owned}G)`, sell(x.owned));
    }
  } else {
    scr.select(mode === "buy" ? "구매" : "판매", ICON(mode === "buy" ? "shop" : "gold"));
    scr.body(mode === "buy" ? "§7판매 중인 물건이 없습니다." : "§7팔 수 있는 아이템을 가지고 있지 않습니다.\n\n§7구매 탭에서 각 상품의 판매 가능 여부를 볼 수 있습니다.");
  }
  scr.reopen = () => re(selIdx);
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
    .toggle("메뉴 버튼 사용 (핫바 9번 칸)", d.set.slots !== false)
    .toggle("대시 (Lv.10 이상, 공중에서 점프 한 번 더 · 재사용 80초)", d.set.dash !== false)
    .toggle("하단 HP/MP/Lv 바", d.set.status !== false)
    .toggle("길 안내 표시 (화살표)", d.set.nav !== false)
    .toggle("길 안내 파티클", d.set.navFx !== false)
    .show(p);
  if (!r.canceled) {
    [d.set.quest, d.set.card, d.set.invite, d.set.slots, d.set.dash, d.set.status, d.set.nav, d.set.navFx] = r.formValues;
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

// ═════════ 길찾기 (NPC 찾기 / 퀘스트 NPC) ═════════
const NAV_TABS = [{ id: "npc", name: "NPC 찾기", icon: "npc" }, { id: "quest", name: "퀘스트 NPC", icon: "quest" }];
const QST = {
  ready: { rank: 0, text: "§a§l완료 보고", mark: "§a✔" },
  talk: { rank: 1, text: "§b§l대화 필요", mark: "§b…" },
  avail: { rank: 2, text: "§6§l수락 가능", mark: "§6!" },
  active: { rank: 3, text: "§e진행 중", mark: "§e?" },
};

/** 플레이어 개인 별명 (없으면 원래 이름) */
const npcName = (p, id, r) => data(p).npcAlias?.[id] || r.name;

/** 이 NPC와 관련된 내 퀘스트 [{ q, st }] */
function npcQuests(p, id) {
  const d = data(p);
  const out = [];
  for (const q of Object.values(Q.allQuests())) {
    const st = Q.state(p, q);
    if (d.q.a[q.id]) {
      if (st === "ready" && q.turnIn === "giver" && q.giver === id) out.push({ q, st: "ready" });
      else if (q.obj.some((o, i) => o.t === "talk" && o.npc === id && Q.objProgress(p, q, i) < Q.objNeed(o))) out.push({ q, st: "talk" });
      else if (q.giver === id) out.push({ q, st: "active" });
    } else if (st === "available" && q.giver === id) out.push({ q, st: "avail" });
  }
  return out.sort((a, b) => QST[a.st].rank - QST[b.st].rank);
}

function navEntries(p, tab) {
  const out = [];
  for (const [id, r] of Object.entries(npcRegistry())) {
    if (r.x === undefined) continue;
    const qs = npcQuests(p, id);
    if (tab === "quest" && !qs.length) continue;
    const name = npcName(p, id, r);
    out.push({
      kind: "npc", id, name, orig: r.name, qs, icon: "npc",
      sub: tab === "quest" ? QST[qs[0].st].text : r.kind === "combat" ? "전투 NPC" : "NPC",
      t: { x: r.x + 0.5, y: r.y, z: r.z + 0.5, dim: r.dim, label: name },
    });
  }
  // 관리자가 등록한 장소는 NPC 찾기 탭 아래에 함께
  if (tab === "npc") for (const [id, w] of Object.entries(WP.waypoints())) {
    out.push({ kind: "wp", id, name: w.name, sub: `장소 · ${w.cat}`, desc: w.desc, qs: [], icon: "nav", t: { x: w.x + 0.5, y: w.y, z: w.z + 0.5, dim: w.dim, label: w.name } });
  }
  return out;
}

export function openNav(p, tab = "npc", selKey, page = 0) {
  if (!NAV_TABS.some((t) => t.id === tab)) tab = "npc";
  const d = data(p);
  const favs = d.navFav ?? {};
  const key = (x) => `${x.kind}:${x.id}`;
  const list = navEntries(p, tab);
  list.sort((a, b) =>
    (favs[key(b)] ? 1 : 0) - (favs[key(a)] ? 1 : 0) ||
    (tab === "quest" ? QST[a.qs[0].st].rank - QST[b.qs[0].st].rank : 0) ||
    WP.distTo(p, a.t) - WP.distTo(p, b.t));
  const PER = 6;
  const pages = Math.max(1, Math.ceil(list.length / PER));
  page = Math.max(0, Math.min(page, pages - 1));
  const shown = list.slice(page * PER, page * PER + PER);
  const sel = list.find((x) => key(x) === selKey) ?? shown[0];
  const re = (k = selKey, pg = page, t = tab) => openNav(p, t, k, pg);
  const tabName = NAV_TABS.find((t) => t.id === tab).name;
  const scr = new Screen("L", `길찾기 / ${tabName}`);
  for (const x of shown) {
    const dist = WP.distTo(p, x.t);
    const active = d.navTo && d.navTo.kind === x.kind && d.navTo.id === x.id;
    const marks = tab === "quest" ? `${QST[x.qs[0].st].mark} ` : "";
    scr.item(`${active ? "§d▶ " : ""}${marks}${favs[key(x)] ? "§e★ " : ""}§f${x.name}\n§7${x.sub ?? ""} · ${dist === Infinity ? "다른 차원" : `${Math.round(dist)}m`}`, ICON(x.icon), () => re(key(x)), { on: x === sel });
  }
  scr.tab("메뉴", ICON("back"), () => openHome(p));
  for (const t of NAV_TABS) scr.tab(t.name, ICON(t.icon), () => re(undefined, 0, t.id), t.id === tab);
  chips(scr, p);
  if (sel) {
    const fk = key(sel);
    scr.select(sel.name, ICON(sel.icon));
    const qLines = sel.qs.map((x) => `\n${QST[x.st].mark} §f${x.q.title} §7- ${QST[x.st].text}`).join("");
    scr.body(rt(
      sel.kind === "npc" && sel.name !== sel.orig ? `§7본래 이름 §f${sel.orig}\n` : "",
      `§d§l${sel.sub ?? ""}§r\n`,
      sel.desc ? `§f${sel.desc}\n` : "",
      qLines ? `\n§7관련 퀘스트${qLines}\n` : "",
      `\n§7방향  `, Q.navText(p, sel.t),
      `\n§7좌표 §f${Math.floor(sel.t.x)}, ${Math.floor(sel.t.y)}, ${Math.floor(sel.t.z)}`,
      pages > 1 ? `\n\n§7목록 ${page + 1}/${pages} 쪽` : "",
    ));
    scr.action("§d길 안내 시작", () => { WP.startNav(p, sel.kind, sel.id); });
    scr.action(favs[fk] ? "★ 즐겨찾기 해제" : "☆ 즐겨찾기 추가", () => {
      d.navFav = { ...favs };
      if (d.navFav[fk]) delete d.navFav[fk];
      else d.navFav[fk] = true;
      save(p);
      return re(fk);
    });
    if (sel.kind === "npc") scr.action("이름 바꾸기 (나만 보임)", async () => {
      const f = await new ModalFormData().title("NPC 이름 바꾸기")
        .textField(`§7본래 이름: §f${sel.orig}\n§7비우면 본래 이름으로 돌아갑니다.`, sel.orig, sel.name === sel.orig ? "" : sel.name).show(p);
      if (!f.canceled) {
        const v = String(f.formValues[0]).trim().slice(0, 20);
        d.npcAlias = { ...(d.npcAlias ?? {}) };
        if (v && v !== sel.orig) d.npcAlias[sel.id] = v;
        else delete d.npcAlias[sel.id];
        save(p);
      }
      return re(fk);
    });
    if (isAdmin(p)) scr.action("§7(관리자) 순간이동", () => { p.teleport({ x: sel.t.x, y: sel.t.y, z: sel.t.z }); });
  } else {
    scr.select(tabName, ICON(tab === "quest" ? "quest" : "nav"));
    scr.body(tab === "quest" ? "§7지금 찾아갈 퀘스트 NPC가 없습니다.\n\n§7수락할 수 있거나 진행 중인 퀘스트가 생기면 여기에 표시됩니다." : "§7등록된 NPC가 없습니다.");
  }
  if (page > 0) scr.action("◀ 이전 쪽", () => re(undefined, page - 1));
  if (page < pages - 1) scr.action("다음 쪽 ▶", () => re(undefined, page + 1));
  if (d.navTo) scr.action("§c길 안내 종료", () => { WP.stopNav(p); return re(); });
  scr.reopen = () => re();
  return scr.show(p);
}
