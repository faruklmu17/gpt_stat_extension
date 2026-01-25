(async function () {
  if (window.__CHATGPT_STATS_OVERLAY_LOADED__) return;
  window.__CHATGPT_STATS_OVERLAY_LOADED__ = true;

  const STORAGE_KEYS = {
    STATS: "cgs_stats",
    ACTIVE_SECONDS: "cgs_active_seconds",
    ACTIVE_LAST_TICK: "cgs_active_last_tick",
    MINIMIZED: "cgs_minimized"
  };

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function formatSeconds(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  }

  function nowMs() {
    return Date.now();
  }

  function isTabActive() {
    return document.visibilityState === "visible" && document.hasFocus();
  }

  // --- Active time tracking (local, forward-looking) ---
  // We count time only when:
  // 1) Tab is visible/focused
  // 2) user has interacted recently (mouse/keyboard) to avoid counting idle reading forever
  let lastUserActivityMs = nowMs();
  const ACTIVE_IDLE_CUTOFF_MS = 60_000; // 1 minute

  function bumpActivity() {
    lastUserActivityMs = nowMs();
  }

  window.addEventListener("mousemove", bumpActivity, { passive: true });
  window.addEventListener("keydown", bumpActivity, { passive: true });
  window.addEventListener("scroll", bumpActivity, { passive: true });
  window.addEventListener("click", bumpActivity, { passive: true });

  async function getStorage(keys) {
    return await chrome.storage.local.get(keys);
  }

  async function setStorage(obj) {
    return await chrome.storage.local.set(obj);
  }

  async function tickActiveTime() {
    const { [STORAGE_KEYS.ACTIVE_SECONDS]: activeSeconds = 0, [STORAGE_KEYS.ACTIVE_LAST_TICK]: lastTick = nowMs() } =
      await getStorage([STORAGE_KEYS.ACTIVE_SECONDS, STORAGE_KEYS.ACTIVE_LAST_TICK]);

    const t = nowMs();
    const deltaSec = Math.max(0, Math.floor((t - lastTick) / 1000));

    let newActiveSeconds = activeSeconds;

    const recentlyActive = (t - lastUserActivityMs) <= ACTIVE_IDLE_CUTOFF_MS;
    if (isTabActive() && recentlyActive) {
      newActiveSeconds += deltaSec;
    }

    await setStorage({
      [STORAGE_KEYS.ACTIVE_SECONDS]: newActiveSeconds,
      [STORAGE_KEYS.ACTIVE_LAST_TICK]: t
    });

    renderActiveTime(newActiveSeconds);
  }

  // Tick every 5 seconds
  setInterval(tickActiveTime, 5000);

  // --- UI ---
  function createWidget() {
    const minimized = document.createElement("div");
    minimized.id = "cgs-minimized";
    minimized.textContent = "Stats";
    minimized.style.display = "none";

    const w = document.createElement("div");
    w.id = "cgs-widget";
    w.innerHTML = `
      <div id="cgs-header">
        <div id="cgs-title">ChatGPT Stats</div>
        <div id="cgs-actions">
          <button id="cgs-import-btn" title="Import conversations.json">Import</button>
          <button id="cgs-refresh-btn" title="Refresh">↻</button>
          <button id="cgs-min-btn" title="Minimize">—</button>
        </div>
      </div>
      <div id="cgs-body">
        <div class="cgs-row"><span class="cgs-label">Total chats</span><span class="cgs-value" id="cgs-total">—</span></div>
        <div class="cgs-row"><span class="cgs-label">Last 7 days</span><span class="cgs-value" id="cgs-last7">—</span></div>
        <div class="cgs-row"><span class="cgs-label">This month</span><span class="cgs-value" id="cgs-month">—</span></div>
        <div class="cgs-row"><span class="cgs-label">Active time (tracked)</span><span class="cgs-value" id="cgs-active">—</span></div>
        <div style="margin-top:10px; font-weight:700; font-size:12px;">Top keywords</div>
        <div id="cgs-keywords" style="margin-top:6px; opacity:0.9;"></div>
      </div>
      <div id="cgs-footer">
        <small>Local-only. Import your exported conversations.json.</small>
        <input id="cgs-hidden-file" type="file" accept=".json,application/json" />
      </div>
    `;

    document.documentElement.appendChild(w);
    document.documentElement.appendChild(minimized);

    // minimize/restore
    $("#cgs-min-btn", w).addEventListener("click", async () => {
      w.style.display = "none";
      minimized.style.display = "block";
      await setStorage({ [STORAGE_KEYS.MINIMIZED]: true });
    });

    minimized.addEventListener("click", async () => {
      minimized.style.display = "none";
      w.style.display = "block";
      await setStorage({ [STORAGE_KEYS.MINIMIZED]: false });
    });

    // import
    const fileInput = $("#cgs-hidden-file", w);
    $("#cgs-import-btn", w).addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const json = JSON.parse(text);

        // Export formats vary:
        // - Could be an array directly
        // - Could be an object containing conversations
        const conversations = Array.isArray(json)
          ? json
          : (json?.conversations && Array.isArray(json.conversations) ? json.conversations : null);

        if (!conversations) {
          alert("Could not find conversations array in this JSON. Please select the exported conversations.json.");
          return;
        }

        const stats = computeStats(conversations);
        await setStorage({ [STORAGE_KEYS.STATS]: stats });
        renderStats(stats);
      } catch (err) {
        console.error(err);
        alert("Import failed. Make sure you selected a valid conversations.json file.");
      } finally {
        fileInput.value = "";
      }
    });

    // refresh
    $("#cgs-refresh-btn", w).addEventListener("click", async () => {
      const { [STORAGE_KEYS.STATS]: stats } = await getStorage([STORAGE_KEYS.STATS]);
      if (stats) renderStats(stats);
      const { [STORAGE_KEYS.ACTIVE_SECONDS]: activeSeconds = 0 } =
        await getStorage([STORAGE_KEYS.ACTIVE_SECONDS]);
      renderActiveTime(activeSeconds);
    });

    return { w, minimized };
  }

  function renderStats(stats) {
    $("#cgs-total").textContent = String(stats.total ?? "—");
    $("#cgs-last7").textContent = String(stats.last7Count ?? "—");
    $("#cgs-month").textContent = String(stats.monthCount ?? "—");

    const kw = Array.isArray(stats.keywords) ? stats.keywords : [];
    $("#cgs-keywords").innerHTML = kw.length
      ? `<div>${kw.map(k => `• ${k}`).join("<br/>")}</div>`
      : `<div style="opacity:0.7;">(Import conversations.json to see keywords)</div>`;
  }

  function renderActiveTime(activeSeconds) {
    $("#cgs-active").textContent = formatSeconds(activeSeconds || 0);
  }

  // init
  const { w, minimized } = createWidget();

  const saved = await getStorage([STORAGE_KEYS.STATS, STORAGE_KEYS.ACTIVE_SECONDS, STORAGE_KEYS.MINIMIZED]);
  if (saved[STORAGE_KEYS.MINIMIZED]) {
    w.style.display = "none";
    minimized.style.display = "block";
  }

  if (saved[STORAGE_KEYS.STATS]) renderStats(saved[STORAGE_KEYS.STATS]);
  renderActiveTime(saved[STORAGE_KEYS.ACTIVE_SECONDS] || 0);

  // first tick baseline
  await setStorage({ [STORAGE_KEYS.ACTIVE_LAST_TICK]: nowMs() });
})();
