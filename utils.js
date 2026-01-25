function toDateFromExport(obj) {
  const t =
    obj?.create_time ??
    obj?.update_time ??
    obj?.createTime ??
    obj?.updateTime ??
    obj?.created_at ??
    obj?.updated_at;

  if (!t) return null;

  if (typeof t === "number") {
    const ms = t < 1e12 ? t * 1000 : t;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof t === "string") {
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function weekKey(d) {
  // ISO-ish week grouping (simple): year-weekNumber
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function topKeywordsFromTitles(conversations, k = 8) {
  const stop = new Set([
    "the","a","an","and","or","to","of","in","on","for","with","is","are","was","were","it","this","that",
    "i","you","we","they","he","she","my","your","our","as","at","be","by","from","not","but","can","could",
    "should","would","how","what","why","when","where"
  ]);

  const text = conversations
    .map(c => (typeof c?.title === "string" ? c.title : ""))
    .join(" ");

  const words = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stop.has(w));

  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);

  return [...freq.entries()]
    .sort((a,b) => b[1] - a[1])
    .slice(0, k)
    .map(([w, n]) => `${w} (${n})`);
}

function computeHistoryStatsFromExport(conversations) {
  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let total = 0;
  let last7Count = 0;
  let monthCount = 0;

  const byMonth = new Map();
  const byWeek = new Map();

  for (const c of conversations) {
    total += 1;
    const d = toDateFromExport(c);
    if (!d) continue;

    if (d >= last7) last7Count += 1;
    if (d >= monthStart) monthCount += 1;

    byMonth.set(monthKey(d), (byMonth.get(monthKey(d)) || 0) + 1);
    byWeek.set(weekKey(d), (byWeek.get(weekKey(d)) || 0) + 1);
  }

  const keywords = topKeywordsFromTitles(conversations, 8);

  return {
    total,
    last7Count,
    monthCount,
    byMonth: Object.fromEntries([...byMonth.entries()].sort()),
    byWeek: Object.fromEntries([...byWeek.entries()].sort()),
    keywords,
    importedAt: new Date().toISOString()
  };
}
