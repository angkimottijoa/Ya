// 제작자 도구: 퀘스트 / NPC / 상점 / 플레이어 / 데이터 관리 (rpg_admin 태그 필요)
import { world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { Screen, rt } from "./ui.js";
import { data, save, addXp, addGold, msg, isAdmin } from "./player.js";
import { CLASSES } from "./classes.js";
import * as Q from "./quests.js";
import * as SK from "./skills.js";
import { shopList, saveShop } from "./shop.js";
import { getJSON, setJSON, clone } from "./db.js";
import { ICON, iconOf, itemName, inv, iconOverrides, setIconOverride } from "./itemdb.js";
import { openHome, questDetailBody } from "./menu.js";
import { openNpc, SKINS, ANIMS, CAMS, COND_TYPES, npcId, npcHasShop, npcShopList, npcDialog, saveDialog } from "./npc.js";
import { npcRegistry, registerNpcEntity, unregisterNpc } from "./npcdb.js";

const QT = Object.entries(Q.QTYPES);

const TABS = [
  { id: "quest", name: "퀘스트", icon: "quest" },
  { id: "npc", name: "NPC", icon: "npc" },
  { id: "shop", name: "상점", icon: "shop" },
  { id: "player", name: "플레이어", icon: "profile" },
  { id: "data", name: "데이터", icon: "settings" },
];

function adminChrome(scr, p, cur) {
  scr.tab("메뉴", ICON("back"), () => openHome(p));
  for (const t of TABS) scr.tab(t.name, ICON(t.icon), () => openAdmin(p, t.id), t.id === cur);
  scr.chip(ICON("admin"), "제작자 모드");
  return scr;
}

const ns = (id) => (id.includes(":") || id === "*" ? id : `minecraft:${id}`);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);


export function openAdmin(p, tab = "quest", sel, page = 0) {
  if (!isAdmin(p)) {
    msg(p, "§c제작자 권한이 없습니다. §7(/tag @s add rpg_admin)");
    return;
  }
  return { quest: questTab, npc: npcTab, shop: shopTab, player: playerTab, data: dataTab }[tab](p, sel, page);
}

// ═════════ 퀘스트 ═════════
function questTab(p, sel, page = 0) {
  const all = Q.allQuests();
  const PAGE = 5;
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  page = Math.min(page, pages - 1);
  const scr = new Screen("L", "제작자 도구 / 퀘스트");
  scr.item("§l+ 새 퀘스트 (상세)", ICON("plus"), () => createQuest(p));
  scr.item("§l+ 빠른 생성\n§7한 화면에서 처치/수집 퀘스트", ICON("skill"), () => quickQuest(p));
  for (const q of all.slice(page * PAGE, page * PAGE + PAGE)) {
    scr.item(`${q.enabled ? "" : "§7"}§l${q.title}§r\n§7${q.id} · ${q.giver === "board" ? "게시판" : q.giver}`, ICON("quest"), () => questTab(p, q.id, page), { on: q.id === sel });
  }
  adminChrome(scr, p, "quest");
  const q = Q.getQuest(sel);
  if (q) {
    scr.select(q.title, ICON("quest"));
    scr.body(rt(
      `§7ID §r${q.id}\n§7의뢰자 §r${q.giver === "board" ? "게시판" : q.giver}\n§7완료 방식 §r${q.turnIn === "auto" ? "메뉴에서 자동/보고" : "의뢰자에게 보고"}\n`,
      `§7종류 §r${Q.qtype(q).name}  §7지역 §r${q.region || "-"}\n§7최소 레벨 §r${q.minLv}  §7직업 §r${q.cls ? CLASSES[q.cls].name : "제한 없음"}\n§7선행 §r${q.prereq || "없음"}  §7반복 §r${q.repeat ? "O" : "X"}\n\n`,
      questDetailBody(p, q),
    ));
    const re = () => questTab(p, q.id, page);
    scr.action("기본 정보 편집", () => editBasic(p, q, re));
    scr.action("목표 추가", () => addObjective(p, q, re));
    if (q.obj.length) scr.action("목표 삭제", () => removeObjective(p, q, re));
    scr.action("보상 편집", () => editRewards(p, q, re));
    scr.action(q.enabled ? "비활성화" : "활성화", () => { q.enabled = !q.enabled; Q.saveQuest(q); return re(); });
    scr.action("복제", () => {
      const c = clone(q);
      c.id = Q.newQuestId(q.id.replace(/_\d+$/, ""));
      c.title += " (복사본)";
      Q.saveQuest(c);
      return questTab(p, c.id, page);
    });
    scr.action("테스트: 나에게 부여", () => {
      const d = data(p);
      delete d.q.d[q.id];
      d.q.a[q.id] = { p: q.obj.map(() => 0) };
      d.q.track = [q.id, ...d.q.track.filter((t) => t !== q.id)].slice(0, 3);
      save(p);
      msg(p, `퀘스트 §e${q.title}§r 부여됨`);
      return re();
    });
    scr.action("§c삭제", () => confirm(p, `'${q.title}' 퀘스트를 삭제할까요?`, () => { Q.deleteQuest(q.id); return questTab(p, undefined, page); }, re));
  } else {
    scr.select("퀘스트 제작", ICON("admin"));
    scr.body(
      "§l편의 기능§r\n" +
      "- 목표 추가 시 §2바라보는 몹§r/§2손에 든 아이템§r/§2현재 위치§r가 자동 입력\n" +
      "- 빠른 생성: 한 화면으로 완성\n" +
      "- 복제 후 수정으로 시리즈 제작\n" +
      "- NPC 탭에서 의뢰자 NPC 소환\n" +
      "- 데이터 탭: 내보내기/가져오기\n\n" +
      `§7퀘스트 ${all.length}개`,
    );
  }
  if (pages > 1) scr.action(`다음 페이지 (${page + 1}/${pages})`, () => questTab(p, undefined, (page + 1) % pages));
  scr.reopen = () => questTab(p, sel, page);
  return scr.show(p);
}

async function confirm(p, text, yes, no) {
  const scr = new Screen("L", "확인");
  scr.select("확인", ICON("admin"));
  scr.body(text);
  scr.action("§c예", yes);
  scr.action("아니오", no);
  return scr.show(p);
}

function giverOptions() {
  const reg = npcRegistry();
  return [{ id: "board", name: "게시판 (메뉴에서 수락)" }, ...Object.entries(reg).map(([id, r]) => ({ id, name: `NPC: ${r.name} (${id})` }))];
}

async function createQuest(p) {
  const q = Q.blankQuest(Q.newQuestId());
  const ok = await editBasic(p, q, null, true);
  if (!ok) return questTab(p);
  Q.saveQuest(q);
  msg(p, `퀘스트 생성: §e${q.title}§r → 이제 목표를 추가하세요.`);
  return addObjective(p, q, () => questTab(p, q.id));
}

async function editBasic(p, q, back, isNew = false) {
  const givers = giverOptions();
  const clsKeys = ["", ...Object.keys(CLASSES).filter((c) => c !== "novice")];
  const others = Q.allQuests().filter((x) => x.id !== q.id);
  const r = await new ModalFormData()
    .title(isNew ? "새 퀘스트" : "기본 정보 편집")
    .textField("제목", "예) 마을의 위기", q.title)
    .textField("설명", "의뢰 내용", q.desc)
    .textField(isNew ? "퀘스트 ID (영문, 비우면 자동)" : `퀘스트 ID: ${q.id} (변경 불가)`, q.id, isNew ? q.id : "")
    .dropdown("의뢰자", givers.map((g) => g.name), Math.max(0, givers.findIndex((g) => g.id === q.giver)))
    .dropdown("완료 방식", ["메뉴에서 완료 (목표 달성 즉시/보고)", "의뢰자 NPC에게 보고"], q.turnIn === "auto" ? 0 : 1)
    .textField("최소 레벨", "1", String(q.minLv))
    .dropdown("직업 제한", clsKeys.map((c) => (c ? CLASSES[c].name : "제한 없음")), Math.max(0, clsKeys.indexOf(q.cls)))
    .dropdown("선행 퀘스트", ["없음", ...others.map((x) => x.title)], Math.max(0, others.findIndex((x) => x.id === q.prereq) + 1))
    .toggle("반복 가능", q.repeat)
    .dropdown("종류 (퀘스트 화면 분류)", QT.map(([, t]) => t.name), Math.max(0, QT.findIndex(([k]) => k === (q.type ?? "sub"))))
    .textField("지역 이름 (선택)", "예) 시작의 마을", q.region ?? "")
    .show(p);
  if (r.canceled) {
    if (back) return back();
    return false;
  }
  const [title, desc, id, gi, ti, lv, ci, pi, rep, tyi, region] = r.formValues;
  q.type = QT[tyi][0];
  q.region = String(region).trim();
  q.title = String(title) || q.title;
  q.desc = String(desc);
  if (isNew) {
    const clean = String(id).trim().replace(/[^\w-]/g, "_");
    if (clean && !Q.getQuest(clean)) q.id = clean;
  }
  q.giver = givers[gi].id;
  q.giverName = givers[gi].id === "board" ? undefined : npcRegistry()[q.giver]?.name;
  q.turnIn = ti === 0 ? "auto" : "giver";
  if (q.giver === "board") q.turnIn = "auto";
  q.minLv = Math.max(1, Math.floor(num(lv, 1)));
  q.cls = clsKeys[ci];
  q.prereq = pi ? others[pi - 1].id : "";
  q.repeat = rep;
  if (!isNew) {
    Q.saveQuest(q);
    return back();
  }
  return true;
}

async function addObjective(p, q, back) {
  const r1 = await new ModalFormData()
    .title(`목표 추가 - ${q.title}`)
    .dropdown("목표 유형", Q.OBJ_TYPES.map((t) => t.name), 0)
    .show(p);
  if (r1.canceled) return back();
  const type = Q.OBJ_TYPES[r1.formValues[0]].id;
  const held = inv(p).getItem(p.selectedSlotIndex);
  const look = p.getEntitiesFromViewDirection({ maxDistance: 16 })[0]?.entity;
  const loc = p.location;
  let o = null;

  if (type === "kill") {
    const r = await new ModalFormData()
      .title("처치 목표")
      .textField("대상 몹 ID (* = 아무 몬스터)\n§7바라보던 몹이 자동 입력됨", "minecraft:zombie", look && look.typeId !== "minecraft:player" ? look.typeId : "minecraft:zombie")
      .textField("수량", "5", "5")
      .textField("표시 이름 (비우면 기본 이름)", "예) 고블린", "")
      .show(p);
    if (r.canceled) return back();
    o = { t: "kill", id: ns(String(r.formValues[0]).trim()), n: Math.max(1, num(r.formValues[1], 1)), label: String(r.formValues[2]) || undefined };
  } else if (type === "collect") {
    const r = await new ModalFormData()
      .title("수집 목표")
      .textField("아이템 ID\n§7손에 든 아이템이 자동 입력됨", "minecraft:wheat", held?.typeId ?? "minecraft:wheat")
      .textField("수량", "10", String(held?.amount ?? 10))
      .textField("표시 이름 (비우면 기본 이름)", "", "")
      .show(p);
    if (r.canceled) return back();
    o = { t: "collect", id: ns(String(r.formValues[0]).trim()), n: Math.max(1, num(r.formValues[1], 1)), label: String(r.formValues[2]) || undefined };
  } else if (type === "visit") {
    const r = await new ModalFormData()
      .title("방문 목표 (현재 위치 자동 입력)")
      .textField("장소 이름", "예) 마을 광장", "")
      .textField("X", "", String(Math.floor(loc.x)))
      .textField("Y", "", String(Math.floor(loc.y)))
      .textField("Z", "", String(Math.floor(loc.z)))
      .slider("도착 반경", 2, 30, 1, 5)
      .show(p);
    if (r.canceled) return back();
    const [name, x, y, z, rad] = r.formValues;
    o = { t: "visit", name: String(name) || undefined, x: num(x), y: num(y), z: num(z), r: rad, dim: p.dimension.id };
  } else {
    const reg = Object.entries(npcRegistry()).map(([id, r]) => [id, r.name]);
    if (!reg.length) {
      msg(p, "§c등록된 NPC가 없습니다. 먼저 NPC 탭에서 소환하세요.");
      return back();
    }
    const r = await new ModalFormData().title("대화 목표").dropdown("대화할 NPC", reg.map(([id, n]) => `${n} (${id})`), 0).show(p);
    if (r.canceled) return back();
    const [id, name] = reg[r.formValues[0]];
    o = { t: "talk", npc: id, npcName: name };
  }
  q.obj.push(o);
  Q.saveQuest(q);
  msg(p, rt("목표 추가: ", Q.objLine(p, q, q.obj.length - 1, false)));
  return back();
}

async function removeObjective(p, q, back) {
  const scr = new Screen("L", `목표 삭제 / ${q.title}`);
  q.obj.forEach((_, i) => scr.item(rt("§l", `${i + 1}. `, Q.objLine(p, q, i, false)), ICON("close"), () => {
    q.obj.splice(i, 1);
    Q.saveQuest(q);
    return back();
  }));
  adminChrome(scr, p, "quest");
  scr.select("삭제할 목표 선택", ICON("close"));
  scr.body("§7누르면 바로 삭제됩니다.");
  scr.action("취소", back);
  return scr.show(p);
}

function parseItems(s) {
  return String(s).split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
    const [id, n] = x.split("*");
    return { id: ns(id.trim()), n: Math.max(1, num(n, 1)) };
  });
}

async function editRewards(p, q, back) {
  const held = inv(p).getItem(p.selectedSlotIndex);
  const r = await new ModalFormData()
    .title(`보상 편집 - ${q.title}`)
    .textField("경험치", "50", String(q.rw.xp ?? 0))
    .textField("골드", "20", String(q.rw.gold ?? 0))
    .textField("보상 아이템 (형식: id*수량, 쉼표로 구분)", "minecraft:diamond*2, bread*5", (q.rw.items ?? []).map((i) => `${i.id}*${i.n}`).join(", "))
    .toggle(held ? `손에 든 아이템 추가 (${held.typeId} ×${held.amount})` : "손에 든 아이템 추가 (없음)", false)
    .show(p);
  if (r.canceled) return back();
  const [xp, gold, items, addHeld] = r.formValues;
  q.rw = { xp: Math.max(0, num(xp)), gold: Math.max(0, num(gold)), items: parseItems(items) };
  if (addHeld && held) q.rw.items.push({ id: held.typeId, n: held.amount });
  Q.saveQuest(q);
  return back();
}

async function quickQuest(p) {
  const held = inv(p).getItem(p.selectedSlotIndex);
  const look = p.getEntitiesFromViewDirection({ maxDistance: 16 })[0]?.entity;
  const givers = giverOptions();
  const r = await new ModalFormData()
    .title("빠른 퀘스트 생성")
    .textField("제목", "예) 고블린 소탕", "")
    .textField("설명", "", "")
    .dropdown("유형", ["처치", "수집"], held && !look ? 1 : 0)
    .textField("대상 (몹 ID 또는 아이템 ID)\n§7바라보는 몹 / 손에 든 아이템 자동 입력", "", look?.typeId ?? held?.typeId ?? "minecraft:zombie")
    .textField("수량", "", "10")
    .textField("경험치 보상", "", "80")
    .textField("골드 보상", "", "40")
    .dropdown("의뢰자", givers.map((g) => g.name), 0)
    .toggle("반복 가능", false)
    .dropdown("종류", QT.map(([, t]) => t.name), 1)
    .show(p);
  if (r.canceled) return questTab(p);
  const [title, desc, type, target, n, xp, gold, gi, rep, tyi] = r.formValues;
  const q = Q.blankQuest(Q.newQuestId());
  Object.assign(q, {
    title: String(title) || "새 퀘스트", desc: String(desc), giver: givers[gi].id,
    giverName: gi ? npcRegistry()[givers[gi].id]?.name : undefined, turnIn: gi ? "giver" : "auto", repeat: rep,
    obj: [{ t: type ? "collect" : "kill", id: ns(String(target).trim()), n: Math.max(1, num(n, 1)) }],
    rw: { xp: num(xp), gold: num(gold), items: [] }, type: QT[tyi][0],
  });
  Q.saveQuest(q);
  msg(p, `퀘스트 생성: §e${q.title}`);
  return questTab(p, q.id);
}

// ═════════ NPC ═════════
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const skinOf = (e) => { try { return e.getProperty("rpg:skin") ?? 0; } catch { return 0; } };
const animOf = (e) => { try { return e.getProperty("rpg:anim") ?? 0; } catch { return 0; } };
const NPC_FILTERS = [
  { id: "all", name: "전체" }, { id: "civil", name: "비전투" }, { id: "combat", name: "전투" },
  { id: "quest", name: "퀘스트 NPC" }, { id: "shop", name: "상점 NPC" },
];
const NPC_SORTS = [{ id: "dist", name: "거리순" }, { id: "name", name: "이름순" }, { id: "quests", name: "의뢰 많은 순" }, { id: "id", name: "ID순" }];

/** 등록된 NPC (먼 곳 포함) + 로드된 엔티티 */
function npcEntries(p) {
  const reg = npcRegistry();
  const loaded = new Map();
  for (const e of p.dimension.getEntities({ type: "rpg:npc" })) {
    registerNpcEntity(e);
    loaded.set(npcId(e), e);
  }
  const qcount = {};
  for (const q of Q.allQuests()) if (q.giver !== "board") qcount[q.giver] = (qcount[q.giver] ?? 0) + 1;
  return Object.entries(npcRegistry()).map(([id, r]) => {
    const e = loaded.get(id);
    const loc = e?.location ?? (r.x !== undefined ? { x: r.x, y: r.y, z: r.z } : null);
    return {
      id, name: r.name, kind: r.kind ?? "civil", e, quests: qcount[id] ?? 0,
      shop: e ? npcHasShop(e) : !!r.shop, dim: r.dim,
      dist: loc && (r.dim ?? p.dimension.id) === p.dimension.id ? dist(p.location, loc) : Infinity, loc,
    };
  });
}

function npcTab(p, selId, view) {
  if (!view || typeof view !== "object") view = { f: "all", s: "dist", page: 0 };
  let list = npcEntries(p);
  list = list.filter((x) => view.f === "all" || (view.f === "quest" ? x.quests > 0 : view.f === "shop" ? x.shop : x.kind === view.f));
  list.sort((a, b) => view.s === "name" ? a.name.localeCompare(b.name) : view.s === "quests" ? b.quests - a.quests : view.s === "id" ? a.id.localeCompare(b.id) : a.dist - b.dist);
  const PAGE = 5;
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const page = Math.min(view.page, pages - 1);
  const shown = list.slice(page * PAGE, page * PAGE + PAGE);
  const sel = list.find((x) => x.id === selId) ?? shown[0];
  const re = (id, v = view) => npcTab(p, id, v);
  const scr = new Screen("L", `제작자 도구 / NPC · ${NPC_FILTERS.find((f) => f.id === view.f).name}`);
  scr.item("§a+ NPC 소환 (내 위치)", ICON("plus"), () => spawnNpc(p));
  for (const x of shown) {
    const tag = x.kind === "combat" ? "§c[전투]" : "§a[비전투]";
    const where = x.dist === Infinity ? "§7다른 차원/미확인" : `§7${Math.round(x.dist)}m${x.e ? "" : " (멀리 있음)"}`;
    scr.item(`${tag} §f${x.name}\n§7${x.id} · 퀘스트 ${x.quests}${x.shop ? " · 상점" : ""} · ${where}`, ICON(x.kind === "combat" ? "class" : "npc"), () => re(x.id), { on: x === sel });
  }
  adminChrome(scr, p, "npc");
  if (sel) {
    scr.select(sel.name, ICON("npc"));
    scr.body(sel.e ? npcSummary(sel.e) : `§7NPC ID §f${sel.id}\n§7위치 §f${sel.loc ? `${sel.loc.x}, ${sel.loc.y}, ${sel.loc.z}` : "?"}\n\n§7멀리 있어 불러오지 않았습니다.\n'이동'으로 가까이 가면 관리할 수 있습니다.`);
    if (sel.e) scr.action("NPC 관리", () => editNpc(p, sel.e, () => re(sel.id)));
    if (sel.loc) scr.action("이 NPC에게 이동", () => { p.teleport({ x: sel.loc.x + 0.5, y: sel.loc.y, z: sel.loc.z + 1.5 }); return re(sel.id); });
    if (!sel.e) scr.action("§c목록에서 삭제", () => { unregisterNpc(sel.id); return re(); });
  } else {
    scr.select("NPC", ICON("npc"));
    scr.body("§7조건에 맞는 NPC가 없습니다.");
  }
  scr.action(`필터: ${NPC_FILTERS.find((f) => f.id === view.f).name}`, () => {
    const i = NPC_FILTERS.findIndex((f) => f.id === view.f);
    return re(undefined, { ...view, f: NPC_FILTERS[(i + 1) % NPC_FILTERS.length].id, page: 0 });
  });
  scr.action(`정렬: ${NPC_SORTS.find((s) => s.id === view.s).name}`, () => {
    const i = NPC_SORTS.findIndex((s) => s.id === view.s);
    return re(sel?.id, { ...view, s: NPC_SORTS[(i + 1) % NPC_SORTS.length].id });
  });
  if (pages > 1) scr.action(`다음 페이지 (${page + 1}/${pages})`, () => re(undefined, { ...view, page: (page + 1) % pages }));
  scr.reopen = () => re(selId);
  return scr.show(p);
}

function npcSummary(e) {
  const id = npcId(e);
  const qs = Q.allQuests().filter((q) => q.giver === id);
  const dlg = npcDialog(e);
  const own = npcShopList(e);
  return `§7NPC ID §f${id}\n§7종류 §f${e.getDynamicProperty("rpg:kind") === "combat" ? "§c전투" : "§a비전투"}\n` +
    `§7외형 §f${SKINS[skinOf(e)]}  §7동작 §f${ANIMS[animOf(e)]}\n§7카메라 §f${CAMS[Number(e.getDynamicProperty("rpg:cam") ?? 0)]}\n` +
    `§7위치 §f${Math.floor(e.location.x)}, ${Math.floor(e.location.y)}, ${Math.floor(e.location.z)}\n\n` +
    `§7첫 대사\n§f${String(dlg.nodes.start.text).split("|")[0]}\n` +
    `§7대화 노드 §f${Object.keys(dlg.nodes).length}개 · 선택지 ${Object.values(dlg.nodes).reduce((n, x) => n + (x.choices?.length ?? 0), 0)}개\n` +
    `§7상점 §f${npcHasShop(e) ? (own.length ? `전용 ${own.length}개` : "공용") : "없음"}\n` +
    `§7의뢰 퀘스트 §f${qs.length}개${qs.map((q) => `\n §7- §f${q.title}`).join("")}`;
}

async function spawnNpc(p) {
  const r = await new ModalFormData()
    .title("NPC 소환")
    .textField("이름", "예) 촌장", "촌장")
    .textField("NPC ID (퀘스트 연결용, 영문)", "chief", `npc_${Object.keys(npcRegistry()).length + 1}`)
    .dropdown("외형", SKINS, 0)
    .dropdown("종류", ["비전투 (무적, 제자리)", "전투 (주변 몬스터 공격)"], 0)
    .dropdown("기본 동작", ANIMS, 0)
    .textField("첫 대사 (| 로 페이지 구분)", "안녕하신가.|요즘 마을이 흉흉하네.", "안녕하신가, 모험가.")
    .toggle("상점 기능", false)
    .show(p);
  if (r.canceled) return npcTab(p);
  const [name, id, skin, kind, anim, greet, shop] = r.formValues;
  const e = p.dimension.spawnEntity("rpg:npc", p.location);
  const nid = String(id).trim().replace(/[^\w-]/g, "_") || `npc_${Date.now() % 10000}`;
  e.nameTag = String(name) || "NPC";
  e.setDynamicProperty("rpg:npc_id", nid);
  e.setDynamicProperty("rpg:anchor", p.location);
  saveDialog(e, { nodes: { start: { text: String(greet) || "안녕하신가.", choices: [] } } });
  e.setDynamicProperty("rpg:shop", !!shop);
  setKind(e, kind ? "combat" : "civil");
  try { e.setProperty("rpg:skin", skin); e.setProperty("rpg:anim", anim); } catch {}
  registerNpcEntity(e);
  msg(p, `NPC §e${e.nameTag}§r (${nid}) 소환됨`);
  return npcTab(p, nid);
}

function setKind(e, kind) {
  e.setDynamicProperty("rpg:kind", kind);
  try { e.triggerEvent(kind === "combat" ? "rpg:set_combat" : "rpg:set_civilian"); } catch {}
}

/** NPC 관리 화면 (제작자 도구를 들고 NPC 를 눌러도 열림) */
export function editNpc(p, e, back) {
  back = back ?? (() => {});
  const re = () => editNpc(p, e, back);
  if (!e.isValid()) return back();
  const scr = new Screen("L", `NPC 관리 / ${e.nameTag || "NPC"}`);
  scr.item("§f기본 정보\n§7이름 · ID · 외형 · 종류", ICON("npc"), () => npcBasic(p, e, re));
  scr.item(`§f동작 / 애니메이션\n§7현재: ${ANIMS[animOf(e)]}`, ICON("skill"), () => npcAnim(p, e, re));
  scr.item("§f세부 대화 (대화 트리)\n§7노드 · 선택지 · 조건 · 명령어", ICON("chat"), () => dlgEditor(p, e, re));
  scr.item(`§f카메라 연출\n§7${CAMS[Number(e.getDynamicProperty("rpg:cam") ?? 0)]}`, ICON("nav"), () => npcCamera(p, e, re));
  scr.item(`§f상점 설정\n§7${npcHasShop(e) ? "켜짐" : "꺼짐"}`, ICON("shop"), () => npcShop(p, e, re));
  scr.item("§f대화 미리보기", ICON("quest"), () => openNpc(p, e));
  adminChrome(scr, p, "npc");
  scr.select(e.nameTag || "NPC", ICON("npc"));
  scr.body(npcSummary(e));
  scr.action("이 NPC에게 이동", () => { p.teleport(e.location); return re(); });
  scr.action("내 위치로 옮기기 (기준점 변경)", () => { e.teleport(p.location); e.setDynamicProperty("rpg:anchor", p.location); registerNpcEntity(e); return re(); });
  scr.action("§c제거", () => confirm(p, `${e.nameTag} NPC를 제거할까요?`, () => { unregisterNpc(npcId(e)); e.remove(); return npcTab(p); }, re));
  scr.action("돌아가기", back);
  return scr.show(p);
}

async function npcBasic(p, e, back) {
  const r = await new ModalFormData()
    .title(`기본 정보 - ${e.nameTag}`)
    .textField("이름", "", e.nameTag)
    .textField("NPC ID", "", npcId(e))
    .dropdown("외형 (사용자 스킨: textures/entity/rpg_npc/custom_1~4.png)", SKINS, skinOf(e))
    .dropdown("종류", ["비전투 (무적, 제자리)", "전투 (주변 몬스터 공격, 기준점 14블록 안)"], e.getDynamicProperty("rpg:kind") === "combat" ? 1 : 0)
    .show(p);
  if (!r.canceled) {
    const [name, id, skin, kind] = r.formValues;
    const oldId = npcId(e);
    e.nameTag = String(name) || e.nameTag;
    const nid = String(id).trim().replace(/[^\w-]/g, "_");
    if (nid && nid !== oldId) {
      e.setDynamicProperty("rpg:npc_id", nid);
      unregisterNpc(oldId);
    }
    try { e.setProperty("rpg:skin", skin); } catch {}
    setKind(e, kind ? "combat" : "civil");
    registerNpcEntity(e);
  }
  return back();
}

async function npcAnim(p, e, back) {
  const r = await new ModalFormData()
    .title(`동작 - ${e.nameTag}`)
    .dropdown("기본 동작 (계속 반복)", ANIMS, animOf(e))
    .toggle("대화 중 손짓 제스처", e.getDynamicProperty("rpg:no_gesture") !== true)
    .show(p);
  if (!r.canceled) {
    try { e.setProperty("rpg:anim", r.formValues[0]); } catch {}
    e.setDynamicProperty("rpg:no_gesture", !r.formValues[1]);
  }
  return back();
}

async function npcCamera(p, e, back) {
  const r = await new ModalFormData()
    .title(`카메라 연출 - ${e.nameTag}`)
    .dropdown("대화할 때 시점", CAMS, Number(e.getDynamicProperty("rpg:cam") ?? 0))
    .slider("전환 시간 (x0.1초)", 0, 20, 1, Math.round(Number(e.getDynamicProperty("rpg:cam_ease") ?? 0.6) * 10))
    .toggle("대화 중 HUD 숨기기", e.getDynamicProperty("rpg:hud_hide") === true)
    .show(p);
  if (!r.canceled) {
    e.setDynamicProperty("rpg:cam", r.formValues[0]);
    e.setDynamicProperty("rpg:cam_ease", r.formValues[1] / 10);
    e.setDynamicProperty("rpg:hud_hide", r.formValues[2]);
  }
  return back();
}

// ───── 대화 트리 편집기 ─────
function dlgEditor(p, e, back, sel = "start") {
  const dlg = npcDialog(e);
  const ids = Object.keys(dlg.nodes);
  if (!dlg.nodes[sel]) sel = "start";
  const node = dlg.nodes[sel];
  const re = (s = sel) => dlgEditor(p, e, back, s);
  const scr = new Screen("L", `NPC 관리 / ${e.nameTag} / 대화 트리`);
  for (const id of ids.slice(0, 7)) {
    const n = dlg.nodes[id];
    scr.item(`${id === "start" ? "§e★ " : "§f"}${id}\n§7${String(n.text).split("|")[0].slice(0, 22)} · 선택지 ${n.choices?.length ?? 0}`, ICON("chat"), () => re(id), { on: id === sel });
  }
  adminChrome(scr, p, "npc");
  scr.select(`노드: ${sel}`, ICON("chat"));
  const cond = (c) => (c?.t ? ` §7[${COND_TYPES.find((t) => t.id === c.t)?.name} ${c.v}]` : "");
  scr.body(
    `§7대사 (${String(node.text).split("|").length}페이지)\n§f${String(node.text).replace(/\|/g, "\n§7── §f")}\n\n§e§l선택지§r\n` +
    ((node.choices ?? []).map((c, i) => `§f${i + 1}. ${c.label} §7→ ${c.goto || "대화 종료"}${c.cmd ? ` §d/${c.cmd}` : ""}${cond(c.cond)}`).join("\n") || "§7없음") +
    (sel === "start" ? "\n\n§7(시작 노드에는 퀘스트·상점 선택지가 자동으로 붙음)" : ""),
  );
  scr.action("대사 편집", async () => {
    const pages = String(node.text).split("|");
    const f = new ModalFormData().title(`대사 - ${sel}`);
    for (let i = 0; i < 5; i++) f.textField(`${i + 1}페이지${i ? " (비우면 없음)" : ""}`, "", pages[i]?.trim() ?? "");
    const r = await f.show(p);
    if (!r.canceled) {
      node.text = r.formValues.map((v) => String(v).trim()).filter(Boolean).join("|") || "...";
      saveDialog(e, dlg);
    }
    return re();
  });
  scr.action("선택지 추가", () => editChoice(p, e, dlg, sel, (node.choices ?? []).length, re));
  if (node.choices?.length) scr.action("선택지 편집/삭제", () => pickChoice(p, e, dlg, sel, re));
  scr.action("새 노드 만들기", async () => {
    const r = await new ModalFormData().title("새 대화 노드").textField("노드 ID (영문)", "예) story1", `node${ids.length}`).textField("대사 (| 로 페이지)", "", "").show(p);
    if (r.canceled) return re();
    const nid = String(r.formValues[0]).trim().replace(/[^\w-]/g, "_");
    if (!nid || dlg.nodes[nid]) { msg(p, "§c쓸 수 없는 ID입니다."); return re(); }
    dlg.nodes[nid] = { text: String(r.formValues[1]) || "...", choices: [] };
    saveDialog(e, dlg);
    return re(nid);
  });
  if (sel !== "start") scr.action("§c이 노드 삭제", () => {
    delete dlg.nodes[sel];
    for (const n of Object.values(dlg.nodes)) for (const c of n.choices ?? []) if (c.goto === sel) c.goto = "";
    saveDialog(e, dlg);
    return re("start");
  });
  scr.action("돌아가기", back);
  return scr.show(p);
}

function pickChoice(p, e, dlg, nodeId, back) {
  const node = dlg.nodes[nodeId];
  const scr = new Screen("L", `대화 트리 / ${nodeId} / 선택지`);
  node.choices.forEach((c, i) => scr.item(`§f${i + 1}. ${c.label}\n§7→ ${c.goto || "대화 종료"}`, ICON("chat"), () => editChoice(p, e, dlg, nodeId, i, back)));
  adminChrome(scr, p, "npc");
  scr.select("편집할 선택지", ICON("chat"));
  scr.body("§7누르면 편집 화면이 열립니다.\n편집 화면에서 '삭제'를 켜면 지워집니다.");
  scr.action("돌아가기", back);
  return scr.show(p);
}

async function editChoice(p, e, dlg, nodeId, i, back) {
  const node = dlg.nodes[nodeId];
  node.choices = node.choices ?? [];
  const cur = node.choices[i] ?? { label: "", goto: "", cmd: "", cond: null };
  const targets = ["", ...Object.keys(dlg.nodes)];
  const quests = Q.allQuests();
  const r = await new ModalFormData()
    .title(i < node.choices.length ? "선택지 편집" : "선택지 추가")
    .textField("버튼 이름", "예) 마을 이야기 해줘", cur.label)
    .dropdown("누르면 이동할 노드", targets.map((t) => (t ? t : "대화 종료")), Math.max(0, targets.indexOf(cur.goto ?? "")))
    .textField("실행할 명령어 (선택, 플레이어 기준)", "예) give @s bread 3", cur.cmd ?? "")
    .dropdown("표시 조건", COND_TYPES.map((c) => c.name), Math.max(0, COND_TYPES.findIndex((c) => c.id === (cur.cond?.t ?? ""))))
    .textField("조건 값 (레벨 숫자 또는 퀘스트 ID)", quests[0]?.id ?? "", String(cur.cond?.v ?? ""))
    .toggle("§c이 선택지 삭제", false)
    .show(p);
  if (!r.canceled) {
    const [label, gi, cmd, ci, cv, del] = r.formValues;
    if (del) node.choices.splice(i, 1);
    else if (String(label).trim()) {
      node.choices[i] = { label: String(label).trim(), goto: targets[gi], cmd: String(cmd).trim(), cond: ci ? { t: COND_TYPES[ci].id, v: String(cv).trim() } : null };
    }
    saveDialog(e, dlg);
  }
  return back();
}

function npcShop(p, e, back, sel = 0) {
  const own = npcShopList(e);
  const re = (i) => npcShop(p, e, back, i);
  const scr = new Screen("G", `NPC 관리 / ${e.nameTag} / 상점`);
  own.slice(0, 30).forEach((it, i) => scr.item(`${it.price}G`, iconOf(it.id), () => re(i), { on: i === sel, rarity: 1 }));
  adminChrome(scr, p, "npc");
  const it = own[sel];
  scr.select(it ? rt(itemName(it.id), ` ×${it.n}`) : "상점 설정", it ? iconOf(it.id) : ICON("shop"));
  scr.body(`§7상점 기능 §f${npcHasShop(e) ? "켜짐" : "꺼짐"}\n§7상품 §f${own.length ? `전용 상품 ${own.length}개` : "없음 → 공용 상점 목록 사용"}` +
    (it ? `\n\n§7선택: §f${it.id}\n§7가격 §f${it.price}G §7/ ${it.n}개` : ""));
  const save = () => setJSON(e, "rpg:shop_list", own);
  scr.action(npcHasShop(e) ? "상점 끄기" : "상점 켜기", () => { e.setDynamicProperty("rpg:shop", !npcHasShop(e)); e.setDynamicProperty("rpg:role", undefined); return re(sel); });
  scr.action("손에 든 아이템 등록", async () => {
    const held = inv(p).getItem(p.selectedSlotIndex);
    if (!held) { msg(p, "§c손에 아이템을 들어 주세요."); return re(sel); }
    const r = await new ModalFormData().title(`상품 등록 - ${held.typeId}`).textField("가격", "100", "100").textField("묶음 수량", "", String(held.amount)).show(p);
    if (!r.canceled) { own.push({ id: held.typeId, price: Math.max(0, num(r.formValues[0], 100)), n: Math.max(1, num(r.formValues[1], 1)) }); save(); }
    return re(own.length - 1);
  });
  if (it) {
    scr.action("가격/수량 편집", async () => {
      const r = await new ModalFormData().title("상품 편집").textField("가격", "", String(it.price)).textField("수량", "", String(it.n)).show(p);
      if (!r.canceled) { it.price = Math.max(0, num(r.formValues[0], it.price)); it.n = Math.max(1, num(r.formValues[1], it.n)); save(); }
      return re(sel);
    });
    scr.action("§c상품 삭제", () => { own.splice(sel, 1); save(); return re(0); });
  }
  scr.action("돌아가기", back);
  return scr.show(p);
}

// ═════════ 상점 ═════════
function shopTab(p, sel = 0) {
  const list = shopList();
  const scr = new Screen("G", "제작자 도구 / 상점");
  list.slice(0, 30).forEach((e, i) => scr.item(`${e.price}G`, iconOf(e.id), () => shopTab(p, i), { on: i === sel, rarity: 1 }));
  adminChrome(scr, p, "shop");
  const e = list[sel];
  if (e) {
    scr.select(rt(itemName(e.id), ` ×${e.n}`), iconOf(e.id));
    scr.body(`§7ID §r${e.id}\n§7수량 §r${e.n}\n§7가격 §r${e.price}G\n\n§7판매가는 개당 가격의 30%`);
    scr.action("가격/수량 편집", async () => {
      const r = await new ModalFormData().title("상품 편집").textField("가격", "", String(e.price)).textField("수량", "", String(e.n)).show(p);
      if (!r.canceled) { e.price = Math.max(0, num(r.formValues[0], e.price)); e.n = Math.max(1, num(r.formValues[1], e.n)); saveShop(); }
      return shopTab(p, sel);
    });
    if (sel > 0) scr.action("앞으로 이동", () => { list.splice(sel - 1, 0, list.splice(sel, 1)[0]); saveShop(); return shopTab(p, sel - 1); });
    scr.action("§c삭제", () => { list.splice(sel, 1); saveShop(); return shopTab(p, Math.max(0, sel - 1)); });
  } else {
    scr.select("상점", ICON("shop"));
    scr.body("§7상품이 없습니다.");
  }
  scr.action("손에 든 아이템 등록", async () => {
    const held = inv(p).getItem(p.selectedSlotIndex);
    if (!held) { msg(p, "§c손에 아이템을 들어 주세요."); return shopTab(p, sel); }
    const r = await new ModalFormData().title(`상품 등록 - ${held.typeId}`).textField("가격", "100", "100").textField("묶음 수량", "", String(held.amount)).show(p);
    if (!r.canceled) { list.push({ id: held.typeId, price: Math.max(0, num(r.formValues[0], 100)), n: Math.max(1, num(r.formValues[1], 1)) }); saveShop(); }
    return shopTab(p, list.length - 1);
  });
  scr.reopen = () => shopTab(p, sel);
  return scr.show(p);
}

// ═════════ 플레이어 ═════════
function playerTab(p, selId) {
  const all = world.getAllPlayers().slice(0, 7);
  const t = all.find((x) => x.id === selId) ?? p;
  const scr = new Screen("L", "제작자 도구 / 플레이어");
  for (const x of all) {
    const d = data(x);
    scr.item(`§l${x.name}§r${isAdmin(x) ? " §6[관리자]" : ""}\n§7Lv.${d.lv} ${CLASSES[d.cls].name} · ${d.gold}G`, ICON("profile"), () => playerTab(p, x.id), { on: x === t });
  }
  adminChrome(scr, p, "player");
  const d = data(t);
  scr.select(t.name, ICON(CLASSES[d.cls].icon));
  scr.body(`§7레벨 §r${d.lv}  §7경험치 §r${d.xp}\n§7골드 §r${d.gold}\n§7직업 §r${CLASSES[d.cls].name}\n§7스탯 포인트 §r${d.pts}\n§7진행 퀘스트 §r${Object.keys(d.q.a).length}\n§7완료 퀘스트 §r${Object.keys(d.q.d).length}`);
  const re = () => playerTab(p, t.id);
  scr.action("경험치 +100", () => { addXp(t, 100); return re(); });
  scr.action("골드 +1000", () => { addGold(t, 1000); return re(); });
  scr.action("레벨/스탯 초기화", () => confirm(p, `${t.name}의 레벨과 스탯을 초기화할까요?`, () => {
    Object.assign(d, { lv: 1, xp: 0, pts: 0, stat: { str: 0, dex: 0, int: 0, vit: 0 } });
    save(t);
    return re();
  }, re));
  scr.action("퀘스트 진행 초기화", () => { d.q = { a: {}, d: {}, track: [] }; save(t); return re(); });
  if (t !== p) scr.action(isAdmin(t) ? "관리자 해제" : "관리자 권한 부여", () => { isAdmin(t) ? t.removeTag("rpg_admin") : t.addTag("rpg_admin"); return re(); });
  scr.reopen = re;
  return scr.show(p);
}

// ═════════ 데이터 ═════════
function dataTab(p) {
  const scr = new Screen("L", "제작자 도구 / 데이터");
  scr.item("§l퀘스트 내보내기\n§7JSON 복사 (콘텐츠 로그에도 출력)", ICON("quest"), async () => {
    const json = JSON.stringify(Q.allQuests());
    console.warn(`[Arcania] quests export:\n${json}`);
    await new ModalFormData().title("퀘스트 내보내기").textField("전체 선택 후 복사하세요", "", json).show(p);
    return dataTab(p);
  });
  scr.item("§l퀘스트 가져오기\n§7JSON 붙여넣기 (같은 ID는 덮어씀)", ICON("plus"), async () => {
    const r = await new ModalFormData().title("퀘스트 가져오기").textField("JSON 붙여넣기", "[{...}]", "").show(p);
    if (!r.canceled) {
      try {
        const arr = JSON.parse(String(r.formValues[0]));
        let n = 0;
        for (const q of Array.isArray(arr) ? arr : [arr]) {
          if (q?.id && Array.isArray(q.obj)) { Q.saveQuest(Object.assign(Q.blankQuest(q.id), q)); n++; }
        }
        msg(p, `§a${n}개 퀘스트를 가져왔습니다.`);
      } catch (err) {
        msg(p, `§cJSON 오류: ${err}`);
      }
    }
    return dataTab(p);
  });
  scr.item("§l아이템 아이콘 지정\n§7손에 든 (애드온) 아이템의 아이콘 경로", ICON("bag"), async () => {
    const held = inv(p).getItem(p.selectedSlotIndex);
    if (!held) { msg(p, "§c아이콘을 지정할 아이템을 손에 들어 주세요."); return dataTab(p); }
    const r = await new ModalFormData()
      .title(`아이콘 지정 - ${held.typeId}`)
      .textField("텍스처 경로 (비우면 자동)\n§7예) textures/items/my_sword", "textures/items/...", iconOverrides()[held.typeId] ?? iconOf(held.typeId))
      .show(p);
    if (!r.canceled) setIconOverride(held.typeId, String(r.formValues[0]).trim());
    return dataTab(p);
  });
  scr.item("§l무기 분류 지정\n§7손에 든 무기의 스킬 분류 (자동 판별 덮어쓰기)", ICON("class"), async () => {
    const held = inv(p).getItem(p.selectedSlotIndex);
    if (!held) { msg(p, "§c무기를 손에 들어 주세요."); return dataTab(p); }
    const keys = ["", ...Object.keys(SK.WCLASS)];
    const cur = SK.weaponClassOf(held) ?? "";
    const r = await new ModalFormData()
      .title(`무기 분류 - ${held.typeId}`)
      .dropdown(`현재 자동 판별: ${cur ? SK.WCLASS[cur].name : "무기 아님"}`, keys.map((k) => (k ? SK.WCLASS[k].name : "자동 판별")), Math.max(0, keys.indexOf(cur)))
      .show(p);
    if (!r.canceled) SK.setWeaponClass(held.typeId, keys[r.formValues[0]]);
    return dataTab(p);
  });
  scr.item("§l모든 퀘스트 삭제", ICON("close"), () => confirm(p, "§c모든 퀘스트 정의를 삭제할까요?\n되돌릴 수 없습니다.", () => {
    for (const q of Q.allQuests()) Q.deleteQuest(q.id);
    return dataTab(p);
  }, () => dataTab(p)));
  adminChrome(scr, p, "data");
  scr.select("데이터 관리", ICON("settings"));
  scr.body(`§7퀘스트 ${Q.allQuests().length}개\n§7NPC 등록 ${Object.keys(npcRegistry()).length}개\n§7상점 상품 ${shopList().length}개\n\n§7다른 월드로 퀘스트를 옮길 때 내보내기 → 가져오기를 사용하세요.`);
  return scr.show(p);
}
