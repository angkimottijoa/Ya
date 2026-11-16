// 제작자 도구: 퀘스트 / NPC / 상점 / 플레이어 / 데이터 관리 (rpg_admin 태그 필요)
import { world } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { Screen, rt } from "./ui.js";
import { data, save, addXp, addGold, msg, isAdmin } from "./player.js";
import { CLASSES } from "./classes.js";
import * as Q from "./quests.js";
import { shopList, saveShop } from "./shop.js";
import { getJSON, setJSON, clone } from "./db.js";
import { ICON, iconOf, itemName, inv } from "./itemdb.js";
import { openHome, questDetailBody } from "./menu.js";

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

// NPC 레지스트리 (퀘스트 의뢰자 선택용)
export const npcRegistry = () => getJSON(world, "rpg:npcs", {});
export function registerNpc(id, name) {
  const reg = npcRegistry();
  reg[id] = name;
  setJSON(world, "rpg:npcs", reg);
}

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
  scr.item("§l+ 빠른 생성\n§8한 화면에서 처치/수집 퀘스트", ICON("skill"), () => quickQuest(p));
  for (const q of all.slice(page * PAGE, page * PAGE + PAGE)) {
    scr.item(`${q.enabled ? "" : "§8"}§l${q.title}§r\n§8${q.id} · ${q.giver === "board" ? "게시판" : q.giver}`, ICON("quest"), () => questTab(p, q.id, page), { on: q.id === sel });
  }
  adminChrome(scr, p, "quest");
  const q = Q.getQuest(sel);
  if (q) {
    scr.select(q.title, ICON("quest"));
    scr.body(rt(
      `§8ID §r${q.id}\n§8의뢰자 §r${q.giver === "board" ? "게시판" : q.giver}\n§8완료 방식 §r${q.turnIn === "auto" ? "메뉴에서 자동/보고" : "의뢰자에게 보고"}\n`,
      `§8최소 레벨 §r${q.minLv}  §8직업 §r${q.cls ? CLASSES[q.cls].name : "제한 없음"}\n§8선행 §r${q.prereq || "없음"}  §8반복 §r${q.repeat ? "O" : "X"}\n\n`,
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
      `§8퀘스트 ${all.length}개`,
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
  return [{ id: "board", name: "게시판 (메뉴에서 수락)" }, ...Object.entries(reg).map(([id, name]) => ({ id, name: `NPC: ${name} (${id})` }))];
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
    .show(p);
  if (r.canceled) {
    if (back) return back();
    return false;
  }
  const [title, desc, id, gi, ti, lv, ci, pi, rep] = r.formValues;
  q.title = String(title) || q.title;
  q.desc = String(desc);
  if (isNew) {
    const clean = String(id).trim().replace(/[^\w-]/g, "_");
    if (clean && !Q.getQuest(clean)) q.id = clean;
  }
  q.giver = givers[gi].id;
  q.giverName = givers[gi].id === "board" ? undefined : npcRegistry()[q.giver];
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
    const reg = Object.entries(npcRegistry());
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
  scr.body("§8누르면 바로 삭제됩니다.");
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
    .show(p);
  if (r.canceled) return questTab(p);
  const [title, desc, type, target, n, xp, gold, gi, rep] = r.formValues;
  const q = Q.blankQuest(Q.newQuestId());
  Object.assign(q, {
    title: String(title) || "새 퀘스트", desc: String(desc), giver: givers[gi].id,
    giverName: gi ? npcRegistry()[givers[gi].id] : undefined, turnIn: gi ? "giver" : "auto", repeat: rep,
    obj: [{ t: type ? "collect" : "kill", id: ns(String(target).trim()), n: Math.max(1, num(n, 1)) }],
    rw: { xp: num(xp), gold: num(gold), items: [] },
  });
  Q.saveQuest(q);
  msg(p, `퀘스트 생성: §e${q.title}`);
  return questTab(p, q.id);
}

// ═════════ NPC ═════════
function nearbyNpcs(p) {
  return p.dimension.getEntities({ type: "rpg:npc", location: p.location, maxDistance: 96 })
    .sort((a, b) => dist(p, a) - dist(p, b));
}
const dist = (a, b) => Math.hypot(a.location.x - b.location.x, a.location.y - b.location.y, a.location.z - b.location.z);

function npcTab(p, selId) {
  const list = nearbyNpcs(p).slice(0, 6);
  const sel = list.find((e) => e.id === selId) ?? list[0];
  const scr = new Screen("L", "제작자 도구 / NPC");
  scr.item("§l+ NPC 소환 (내 위치)", ICON("plus"), () => spawnNpc(p));
  for (const e of list) {
    scr.item(`§l${e.nameTag || "NPC"}§r\n§8${e.getDynamicProperty("rpg:npc_id") ?? "-"} · ${Math.round(dist(p, e))}m`, ICON("npc"), () => npcTab(p, e.id), { on: e === sel });
  }
  adminChrome(scr, p, "npc");
  if (sel) {
    scr.select(sel.nameTag || "NPC", ICON("npc"));
    const id = sel.getDynamicProperty("rpg:npc_id") ?? "-";
    const qs = Q.allQuests().filter((q) => q.giver === id);
    scr.body(
      `§8NPC ID §r${id}\n§8역할 §r${(sel.getDynamicProperty("rpg:role") ?? "quest") === "shop" ? "상점" : "퀘스트/대화"}\n` +
      `§8위치 §r${Math.floor(sel.location.x)}, ${Math.floor(sel.location.y)}, ${Math.floor(sel.location.z)}\n\n§8인사말\n§r${sel.getDynamicProperty("rpg:greet") ?? "-"}\n\n` +
      `§8의뢰 퀘스트 ${qs.length}개\n§r${qs.map((q) => `- ${q.title}`).join("\n")}`,
    );
    scr.action("편집", () => editNpc(p, sel, () => npcTab(p, sel.id)));
    scr.action("이 NPC에게 이동", () => { p.teleport(sel.location); return npcTab(p, sel.id); });
    scr.action("내 앞으로 데려오기", () => { sel.teleport(p.location); return npcTab(p, sel.id); });
    scr.action("§c제거", () => confirm(p, `${sel.nameTag} NPC를 제거할까요?`, () => { sel.remove(); return npcTab(p); }, () => npcTab(p, sel.id)));
  } else {
    scr.select("NPC", ICON("npc"));
    scr.body("§896블록 안에 NPC가 없습니다.\n\n소환 후, 제작자 도구를 들고 NPC를 누르면 바로 편집할 수 있습니다.");
  }
  scr.reopen = () => npcTab(p, selId);
  return scr.show(p);
}

async function spawnNpc(p) {
  const r = await new ModalFormData()
    .title("NPC 소환")
    .textField("이름", "예) 촌장", "촌장")
    .textField("NPC ID (퀘스트 연결용, 영문)", "chief", `npc_${Object.keys(npcRegistry()).length + 1}`)
    .dropdown("역할", ["퀘스트/대화", "상점"], 0)
    .dropdown("외형", ["스티브", "알렉스"], 0)
    .show(p);
  if (r.canceled) return npcTab(p);
  const [name, id, role, skin] = r.formValues;
  const e = p.dimension.spawnEntity("rpg:npc", p.location);
  const nid = String(id).trim().replace(/[^\w-]/g, "_") || `npc_${Date.now() % 10000}`;
  e.nameTag = String(name) || "NPC";
  e.setDynamicProperty("rpg:npc_id", nid);
  e.setDynamicProperty("rpg:role", role ? "shop" : "quest");
  e.setDynamicProperty("rpg:greet", "안녕하신가, 모험가.");
  try { e.setProperty("rpg:skin", skin); } catch {}
  registerNpc(nid, e.nameTag);
  msg(p, `NPC §e${e.nameTag}§r (${nid}) 소환됨`);
  return npcTab(p, e.id);
}

export async function editNpc(p, e, back) {
  const r = await new ModalFormData()
    .title(`NPC 편집 - ${e.nameTag}`)
    .textField("이름", "", e.nameTag)
    .textField("NPC ID", "", String(e.getDynamicProperty("rpg:npc_id") ?? ""))
    .dropdown("역할", ["퀘스트/대화", "상점"], e.getDynamicProperty("rpg:role") === "shop" ? 1 : 0)
    .textField("인사말", "", String(e.getDynamicProperty("rpg:greet") ?? ""))
    .dropdown("외형", ["스티브", "알렉스"], (() => { try { return e.getProperty("rpg:skin") ?? 0; } catch { return 0; } })())
    .show(p);
  if (!r.canceled) {
    const [name, id, role, greet, skin] = r.formValues;
    e.nameTag = String(name) || e.nameTag;
    const nid = String(id).trim().replace(/[^\w-]/g, "_");
    if (nid) e.setDynamicProperty("rpg:npc_id", nid);
    e.setDynamicProperty("rpg:role", role ? "shop" : "quest");
    e.setDynamicProperty("rpg:greet", String(greet));
    try { e.setProperty("rpg:skin", skin); } catch {}
    registerNpc(nid, e.nameTag);
  }
  return back?.();
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
    scr.body(`§8ID §r${e.id}\n§8수량 §r${e.n}\n§8가격 §r${e.price}G\n\n§8판매가는 개당 가격의 30%`);
    scr.action("가격/수량 편집", async () => {
      const r = await new ModalFormData().title("상품 편집").textField("가격", "", String(e.price)).textField("수량", "", String(e.n)).show(p);
      if (!r.canceled) { e.price = Math.max(0, num(r.formValues[0], e.price)); e.n = Math.max(1, num(r.formValues[1], e.n)); saveShop(); }
      return shopTab(p, sel);
    });
    if (sel > 0) scr.action("앞으로 이동", () => { list.splice(sel - 1, 0, list.splice(sel, 1)[0]); saveShop(); return shopTab(p, sel - 1); });
    scr.action("§c삭제", () => { list.splice(sel, 1); saveShop(); return shopTab(p, Math.max(0, sel - 1)); });
  } else {
    scr.select("상점", ICON("shop"));
    scr.body("§8상품이 없습니다.");
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
    scr.item(`§l${x.name}§r${isAdmin(x) ? " §6[관리자]" : ""}\n§8Lv.${d.lv} ${CLASSES[d.cls].name} · ${d.gold}G`, ICON("profile"), () => playerTab(p, x.id), { on: x === t });
  }
  adminChrome(scr, p, "player");
  const d = data(t);
  scr.select(t.name, ICON(CLASSES[d.cls].icon));
  scr.body(`§8레벨 §r${d.lv}  §8경험치 §r${d.xp}\n§8골드 §r${d.gold}\n§8직업 §r${CLASSES[d.cls].name}\n§8스탯 포인트 §r${d.pts}\n§8진행 퀘스트 §r${Object.keys(d.q.a).length}\n§8완료 퀘스트 §r${Object.keys(d.q.d).length}`);
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
  scr.item("§l퀘스트 내보내기\n§8JSON 복사 (콘텐츠 로그에도 출력)", ICON("quest"), async () => {
    const json = JSON.stringify(Q.allQuests());
    console.warn(`[Arcania] quests export:\n${json}`);
    await new ModalFormData().title("퀘스트 내보내기").textField("전체 선택 후 복사하세요", "", json).show(p);
    return dataTab(p);
  });
  scr.item("§l퀘스트 가져오기\n§8JSON 붙여넣기 (같은 ID는 덮어씀)", ICON("plus"), async () => {
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
  scr.item("§l모든 퀘스트 삭제", ICON("close"), () => confirm(p, "§c모든 퀘스트 정의를 삭제할까요?\n되돌릴 수 없습니다.", () => {
    for (const q of Q.allQuests()) Q.deleteQuest(q.id);
    return dataTab(p);
  }, () => dataTab(p)));
  adminChrome(scr, p, "data");
  scr.select("데이터 관리", ICON("settings"));
  scr.body(`§8퀘스트 ${Q.allQuests().length}개\n§8NPC 등록 ${Object.keys(npcRegistry()).length}개\n§8상점 상품 ${shopList().length}개\n\n§8다른 월드로 퀘스트를 옮길 때 내보내기 → 가져오기를 사용하세요.`);
  return scr.show(p);
}
