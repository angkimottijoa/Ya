// 동적 프로퍼티 JSON 저장 헬퍼
export function getJSON(holder, key, def) {
  try {
    const v = holder.getDynamicProperty(key);
    if (v === undefined || v === "") return def;
    return JSON.parse(v);
  } catch {
    return def;
  }
}

export function setJSON(holder, key, val) {
  holder.setDynamicProperty(key, JSON.stringify(val));
}

export function clone(o) {
  return JSON.parse(JSON.stringify(o));
}
