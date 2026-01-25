function safeNumber(n, fallback = 0) {
  return Number.isFinite(n) ? n : fallback;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toDateFromExport(obj) {
  // ChatGPT exports may have create_time / update_time (seconds) or (ms) or ISO strings
  const t =
    obj?.create_time ??
    obj?.update_time ??
    obj?.createTime ??
    obj?.updateTime ??
    obj?.created_at ??
    obj?.updated_at;

  if (!t) return null;

  if (typeof t === "number") {
    // handle seconds vs ms
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

function flattenConversationTexts(conversations) {
  // Very defensive: export structure varies.
  // We'll try common shapes; if missing we just return empty.
  const texts = [];
  for (const c of conversations) {
    // Some exports include "mapping" objects of nodes with message content.
    const mapping = c?.mapping || c?.conversation?.mapping;
    if (mapping && typeof mapping === "object") {
      for (const key of Object.keys(mapping)) {
        const node = mapping[key];
        const parts = node?.message?.content?.parts;
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (typeof p === "string") texts.push(p);
          }
        }
      }
    }

    // Some exports contain title
    if (typeof c?.title === "string") texts.push(c.title);
  }
  return texts.join(" ");
}

function topKeywords(text, k = 8) {
  const stop = new Set([
    "the","a","an","and","or","to","of","in","on","for","with","is","are","was","were","it","this","that",
    "i","you","we","they","he","she","my","your","our","as","at","be","by","from","not","but","can","could",
    "should","would","how","what","why","when","where"
  ]);

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

function computeStats(conversations) {
  const now = new Date();
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  let total = 0;
  let last7Count = 0;
  let monthCount = 0;

  // Count by month for future charting
  const byMonth = new Map(); // "YYYY-MM" => count

  for (const c of conversations) {
    total += 1;
    const d = toDateFromExport(c);
    if (!d) continue;

    if (d >= last7) last7Count += 1;
    if (d >= monthStart) monthCount += 1;

    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) || 0) + 1);
  }

  const textBlob = flattenConversationTexts(conversations);
  const keywords = topKeywords(textBlob, 8);

  return {
    total,
    last7Count,
    monthCount,
    byMonth: Object.fromEntries([...byMonth.entries()].sort()),
    keywords
  };
}
