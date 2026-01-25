(async function () {
  if (window.__CGS_LOADED__) return;
  window.__CGS_LOADED__ = true;

  // ---------- Settings / Storage Keys ----------
  const STORAGE_KEYS = {
    MINIMIZED: "cgs_minimized",
    WIDGET_POS: "cgs_widget_pos",
    IMPORT_ENABLED: "cgs_import_enabled",

    // Live tracking (no import needed)
    ACTIVE_SECONDS: "cgs_active_seconds",
    ACTIVE_LAST_TICK: "cgs_active_last_tick",

    // Sessions
    SESSIONS_TODAY: "cgs_sessions_today",
    SESSION_LAST_ACTIVITY: "cgs_session_last_activity",
    SESSION_DATE_KEY: "cgs_session_date_key",

    // Optional imported history stats (from conversations.json)
    HISTORY_STATS: "cgs_history_stats"
  };

  const ACTIVE_TICK_MS = 5000;
  const IDLE_CUTOFF_MS = 60_000;
  const NEW_SESSION_GAP_MS = 30 * 60_000;

  function $(sel, root = document) { return root.querySelector(sel); }
  const nowMs = () => Date.now();
  const todayKey = () => new Date().toISOString().slice(0, 10);

  function formatSeconds(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  }

  function isTabActive() {
    return document.visibilityState === "visible" && document.hasFocus();
  }

  // ✅ Storage wrappers to avoid "Extension context invalidated"
  async function safeGetStorage(keys) {
    try {
      return await chrome.storage.local.get(keys);
    } catch (e) {
      console.warn("safeGetStorage failed:", e?.message || e);
      return {};
    }
  }

  async function safeSetStorage(obj) {
    try {
      await chrome.storage.local.set(obj);
      return true;
    } catch (e) {
      console.warn("safeSetStorage failed:", e?.message || e);
      return false;
    }
  }

  // ---------- Live activity tracking ----------
  let lastUserActivityMs = nowMs();
  function bumpActivity() {
    lastUserActivityMs = nowMs();
  }

  window.addEventListener("mousemove", bumpActivity, { passive: true });
  window.addEventListener("keydown", bumpActivity, { passive: true });
  window.addEventListener("scroll", bumpActivity, { passive: true });
  window.addEventListener("click", bumpActivity, { passive: true });

  // ---------- UI ----------
  function createWidget() {
    // If we already injected (SPA route change), don’t inject again
    if (document.getElementById("cgs-widget")) {
      return {
        w: document.getElementById("cgs-widget"),
        minimized: document.getElementById("cgs-minimized")
      };
    }

    const minimized = document.createElement("div");
    minimized.id = "cgs-minimized";
    minimized.textContent = "Stats";

    const w = document.createElement("div");
    w.id = "cgs-widget";
    w.innerHTML = `
      <div id="cgs-header">
        <div id="cgs-title">ChatGPT Stats</div>
        <div id="cgs-actions">
          <button id="cgs-settings-btn" title="Settings">⚙</button>
          <button id="cgs-import-btn" title="Import conversations.json">Import</button>
          <button id="cgs-refresh-btn" title="Refresh">↻</button>
          <button id="cgs-min-btn" title="Minimize">—</button>
        </div>
      </div>

      <div id="cgs-body">
        <div class="cgs-grid">
          <div class="cgs-card">
            <div class="cgs-k">Active time (tracked)</div>
            <div class="cgs-v" id="cgs-active">—</div>
          </div>
          <div class="cgs-card">
            <div class="cgs-k">Sessions today</div>
            <div class="cgs-v" id="cgs-sessions">—</div>
          </div>
          <div class="cgs-card">
            <div class="cgs-k">History total chats</div>
            <div class="cgs-v" id="cgs-total">—</div>
          </div>
          <div class="cgs-card">
            <div class="cgs-k">History last 7 days</div>
            <div class="cgs-v" id="cgs-last7">—</div>
          </div>
        </div>

        <div class="cgs-grid">
          <div class="cgs-card">
            <div class="cgs-k">History this month</div>
            <div class="cgs-v" id="cgs-month">—</div>
          </div>
          <div class="cgs-card">
            <div class="cgs-k">History imported</div>
            <div class="cgs-v" id="cgs-imported">—</div>
          </div>
        </div>

        <div id="cgs-divider"></div>

        <div class="cgs-section-title">Top title keywords (history)</div>
        <div id="cgs-keywords">(Import optional — enable it below if you want.)</div>
      </div>

      <div id="cgs-footer">
        <small>Local-only. Active time works without import.</small>

        <!-- ✅ Always visible settings (so you won't miss it) -->
        <div id="cgs-settings" style="display:block;">
          <label>
            <input type="checkbox" id="cgs-enable-import" />
            Enable Import (history stats from conversations.json)
          </label>
        </div>

        <input id="cgs-hidden-file" type="file" accept=".json,application/json" />
      </div>
    `;

    document.documentElement.appendChild(w);
    document.documentElement.appendChild(minimized);

    return { w, minimized };
  }

  function safeText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function safeHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function renderActiveTime(activeSeconds) {
    safeText("cgs-active", formatSeconds(activeSeconds || 0));
  }

  function renderSessions(n) {
    safeText("cgs-sessions", n ?? "—");
  }

  function renderHistory(stats) {
    safeText("cgs-total", stats?.total ?? "—");
    safeText("cgs-last7", stats?.last7Count ?? "—");
    safeText("cgs-month", stats?.monthCount ?? "—");

    const importedAt = stats?.importedAt ? new Date(stats.importedAt) : null;
    safeText("cgs-imported", importedAt ? importedAt.toLocaleDateString() : "Not imported");

    const kw = Array.isArray(stats?.keywords) ? stats.keywords : [];
    safeHtml("cgs-keywords", kw.length ? kw.map(k => `• ${k}`).join("<br/>") : "(No keywords yet. Import optional.)");
  }

  // ---------- Dragging ----------
  function enableDragging(widget, header) {
    let dragging = false;
    let startX = 0, startY = 0;
    let startLeft = 0, startTop = 0;

    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

    header.addEventListener("mousedown", (e) => {
      if ((e.target && e.target.tagName === "BUTTON") || e.target.closest("button")) return;
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = widget.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      e.preventDefault();
    });

    window.addEventListener("mousemove", async (e) => {
      if (!dragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const newLeft = clamp(startLeft + dx, 8, window.innerWidth - widget.offsetWidth - 8);
      const newTop = clamp(startTop + dy, 8, window.innerHeight - widget.offsetHeight - 8);

      widget.style.left = `${newLeft}px`;
      widget.style.top = `${newTop}px`;
      widget.style.right = "auto";

      await safeSetStorage({ [STORAGE_KEYS.WIDGET_POS]: { left: newLeft, top: newTop } });
    });

    window.addEventListener("mouseup", () => { dragging = false; });
  }

  async function restorePosition(widget) {
    const { [STORAGE_KEYS.WIDGET_POS]: pos } = await safeGetStorage([STORAGE_KEYS.WIDGET_POS]);
    if (pos && typeof pos.left === "number" && typeof pos.top === "number") {
      widget.style.left = `${pos.left}px`;
      widget.style.top = `${pos.top}px`;
      widget.style.right = "auto";
    }
  }

  // ---------- Sessions tick ----------
  async function tickSessions() {
    const t = nowMs();
    const s = await safeGetStorage([
      STORAGE_KEYS.SESSION_LAST_ACTIVITY,
      STORAGE_KEYS.SESSIONS_TODAY,
      STORAGE_KEYS.SESSION_DATE_KEY
    ]);

    const last = s[STORAGE_KEYS.SESSION_LAST_ACTIVITY] || 0;
    const sessionsToday = s[STORAGE_KEYS.SESSIONS_TODAY] ?? 0;
    const storedDay = s[STORAGE_KEYS.SESSION_DATE_KEY] || todayKey();

    const day = todayKey();
    let newSessionsToday = sessionsToday;
    let newStoredDay = storedDay;
    let newLast = last;

    if (storedDay !== day) {
      newSessionsToday = 0;
      newStoredDay = day;
      newLast = 0;
    }

    const recentlyActive = (t - lastUserActivityMs) <= IDLE_CUTOFF_MS;
    if (isTabActive() && recentlyActive) {
      if (!newLast || (t - newLast) >= NEW_SESSION_GAP_MS) newSessionsToday += 1;
      newLast = t;
    }

    await safeSetStorage({
      [STORAGE_KEYS.SESSIONS_TODAY]: newSessionsToday,
      [STORAGE_KEYS.SESSION_LAST_ACTIVITY]: newLast,
      [STORAGE_KEYS.SESSION_DATE_KEY]: newStoredDay
    });

    renderSessions(newSessionsToday);
  }

  // ---------- Active time tick ----------
  async function tickActiveTime() {
    const t = nowMs();
    const s = await safeGetStorage([STORAGE_KEYS.ACTIVE_SECONDS, STORAGE_KEYS.ACTIVE_LAST_TICK]);
    const activeSeconds = s[STORAGE_KEYS.ACTIVE_SECONDS] || 0;
    const lastTick = s[STORAGE_KEYS.ACTIVE_LAST_TICK] || t;

    const deltaSec = Math.max(0, Math.floor((t - lastTick) / 1000));
    let newActiveSeconds = activeSeconds;

    const recentlyActive = (t - lastUserActivityMs) <= IDLE_CUTOFF_MS;
    if (isTabActive() && recentlyActive) newActiveSeconds += deltaSec;

    await safeSetStorage({
      [STORAGE_KEYS.ACTIVE_SECONDS]: newActiveSeconds,
      [STORAGE_KEYS.ACTIVE_LAST_TICK]: t
    });

    renderActiveTime(newActiveSeconds);
  }

  // ---------- Init ----------
  const { w, minimized } = createWidget();
  await restorePosition(w);
  enableDragging(w, $("#cgs-header", w));

  // Minimize/restore
  $("#cgs-min-btn", w).addEventListener("click", async () => {
    w.style.display = "none";
    minimized.style.display = "block";
    await safeSetStorage({ [STORAGE_KEYS.MINIMIZED]: true });
  });

  minimized.addEventListener("click", async () => {
    minimized.style.display = "none";
    w.style.display = "block";
    await safeSetStorage({ [STORAGE_KEYS.MINIMIZED]: false });
  });

  // Optional import enable
  const importBtn = $("#cgs-import-btn", w);
  const enableImportCheckbox = $("#cgs-enable-import", w);

  const saved = await safeGetStorage([
    STORAGE_KEYS.MINIMIZED,
    STORAGE_KEYS.IMPORT_ENABLED,
    STORAGE_KEYS.ACTIVE_SECONDS,
    STORAGE_KEYS.SESSIONS_TODAY,
    STORAGE_KEYS.HISTORY_STATS
  ]);

  const importEnabled = !!saved[STORAGE_KEYS.IMPORT_ENABLED];
  enableImportCheckbox.checked = importEnabled;

  // ✅ Always visible Import button, disabled until enabled
  importBtn.style.display = "inline-block";
  importBtn.disabled = !importEnabled;

  enableImportCheckbox.addEventListener("change", async (e) => {
    const enabled = !!e.target.checked;
    await safeSetStorage({ [STORAGE_KEYS.IMPORT_ENABLED]: enabled });
    importBtn.disabled = !enabled;
  });

  if (saved[STORAGE_KEYS.MINIMIZED]) {
    w.style.display = "none";
    minimized.style.display = "block";
  }

  renderActiveTime(saved[STORAGE_KEYS.ACTIVE_SECONDS] || 0);
  renderSessions(saved[STORAGE_KEYS.SESSIONS_TODAY] ?? 0);
  renderHistory(saved[STORAGE_KEYS.HISTORY_STATS] || null);

  // Refresh
  $("#cgs-refresh-btn", w).addEventListener("click", async () => {
    const s = await safeGetStorage([
      STORAGE_KEYS.ACTIVE_SECONDS,
      STORAGE_KEYS.SESSIONS_TODAY,
      STORAGE_KEYS.HISTORY_STATS,
      STORAGE_KEYS.IMPORT_ENABLED
    ]);
    renderActiveTime(s[STORAGE_KEYS.ACTIVE_SECONDS] || 0);
    renderSessions(s[STORAGE_KEYS.SESSIONS_TODAY] ?? 0);
    renderHistory(s[STORAGE_KEYS.HISTORY_STATS] || null);

    const enabled = !!s[STORAGE_KEYS.IMPORT_ENABLED];
    enableImportCheckbox.checked = enabled;
    importBtn.disabled = !enabled;
  });

  // Import logic
  const fileInput = $("#cgs-hidden-file", w);

  importBtn.addEventListener("click", async () => {
    const s = await safeGetStorage([STORAGE_KEYS.IMPORT_ENABLED]);
    if (!s[STORAGE_KEYS.IMPORT_ENABLED]) {
      alert("Enable Import (checkbox) first, then click Import again.");
      return;
    }
    fileInput.click();
  });

  fileInput.addEventListener("change", async (e) => {
    const s = await safeGetStorage([STORAGE_KEYS.IMPORT_ENABLED]);
    if (!s[STORAGE_KEYS.IMPORT_ENABLED]) return;

    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const conversations = Array.isArray(json)
        ? json
        : (json?.conversations && Array.isArray(json.conversations) ? json.conversations : null);

      if (!conversations) {
        alert("Could not find a conversations array. Please select the exported conversations.json.");
        return;
      }

      const stats = computeHistoryStatsFromExport(conversations);
      await safeSetStorage({ [STORAGE_KEYS.HISTORY_STATS]: stats });
      renderHistory(stats);
    } catch (err) {
      console.error(err);
      alert("Import failed. Please select a valid conversations.json file.");
    } finally {
      fileInput.value = "";
    }
  });

  // Baseline last tick
  await safeSetStorage({ [STORAGE_KEYS.ACTIVE_LAST_TICK]: nowMs() });

  // Intervals + cleanup + final flush
  const activeInterval = setInterval(tickActiveTime, ACTIVE_TICK_MS);
  const sessionInterval = setInterval(tickSessions, ACTIVE_TICK_MS);

  window.addEventListener("pagehide", async () => {
    // ✅ flush last seconds before closing tab
    await tickActiveTime();
    await tickSessions();
    clearInterval(activeInterval);
    clearInterval(sessionInterval);
  });
})();
