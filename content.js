(async function () {
  if (window.__CGS_LOADED__) return;
  window.__CGS_LOADED__ = true;

  // ---------- Storage Keys ----------
  const STORAGE_KEYS = {
    MINIMIZED: "cgs_minimized",
    WIDGET_POS: "cgs_widget_pos",
    IMPORT_ENABLED: "cgs_import_enabled",
    HISTORY_STATS: "cgs_history_stats",

    // Active time buckets + streak
    ACTIVE_TODAY_SECONDS: "cgs_active_today_seconds",
    ACTIVE_WEEK_SECONDS: "cgs_active_week_seconds",
    ACTIVE_MONTH_SECONDS: "cgs_active_month_seconds",
    ACTIVE_LAST_TICK: "cgs_active_last_tick",
    ACTIVE_DAY_KEY: "cgs_active_day_key",
    ACTIVE_WEEK_KEY: "cgs_active_week_key",
    ACTIVE_MONTH_KEY: "cgs_active_month_key",
    STREAK_COUNT: "cgs_streak_count",
    STREAK_LAST_ACTIVE_DAY: "cgs_streak_last_active_day",

    // Sessions
    SESSIONS_TODAY: "cgs_sessions_today",
    SESSION_LAST_ACTIVITY: "cgs_session_last_activity",
    SESSION_DATE_KEY: "cgs_session_date_key",

    // Notes / snippets
    NOTES_STATE: "cgs_notes_state"
  };

  // ---------- Tunables ----------
  const ACTIVE_TICK_MS = 5000;
  const IDLE_CUTOFF_MS = 60_000;
  const NEW_SESSION_GAP_MS = 30 * 60_000;
  const STREAK_DAY_THRESHOLD_SEC = 120; // 2 minutes
  const GOAL_DEFAULT_DUE_DAYS = 7;

  // ---------- Helpers ----------
  function $(sel, root = document) { return root.querySelector(sel); }
  const nowMs = () => Date.now();

  function dayKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }

  function monthKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function weekKey(d = new Date()) {
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = (date.getDay() + 6) % 7; // Monday=0
    date.setDate(date.getDate() - day + 3); // Thu
    const firstThu = new Date(date.getFullYear(), 0, 4);
    const firstDay = (firstThu.getDay() + 6) % 7;
    firstThu.setDate(firstThu.getDate() - firstDay + 3);
    const weekNo = 1 + Math.round((date - firstThu) / 604800000);
    return `${date.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  function formatSeconds(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const mm = String(m).padStart(2, "0");
    return `${h}h ${mm}m`;
  }

  function isTabActive() {
    return document.visibilityState === "visible" && document.hasFocus();
  }

  // ✅ Safe storage wrappers
  async function safeGetStorage(keys) {
    try { return await chrome.storage.local.get(keys); }
    catch (e) { console.warn("safeGetStorage failed:", e?.message || e); return {}; }
  }

  async function safeSetStorage(obj) {
    try { await chrome.storage.local.set(obj); return true; }
    catch (e) { console.warn("safeSetStorage failed:", e?.message || e); return false; }
  }

  // ---------- Live activity detection ----------
  let lastUserActivityMs = nowMs();
  function bumpActivity() { lastUserActivityMs = nowMs(); }

  window.addEventListener("mousemove", bumpActivity, { passive: true });
  window.addEventListener("keydown", bumpActivity, { passive: true });
  window.addEventListener("scroll", bumpActivity, { passive: true });
  window.addEventListener("click", bumpActivity, { passive: true });

  // ---------- UI ----------
  function createWidget() {
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
          <button id="cgs-import-btn" title="Import conversations.json (optional)">Import</button>
          <button id="cgs-refresh-btn" title="Refresh">↻</button>
          <button id="cgs-min-btn" title="Minimize">—</button>
        </div>
      </div>

      <!-- ✅ Top priority chip (always visible when goal exists) -->
      <div id="cgs-priority" style="display:none;">
        <div id="cgs-priority-chip">
          <span id="cgs-priority-text"></span>
          <span id="cgs-priority-timer"></span>
          <button id="cgs-priority-clear" title="Clear">✕</button>
        </div>
      </div>

      <div id="cgs-tabs">
        <button class="cgs-tab cgs-tab-active" data-tab="stats">Stats</button>
        <button class="cgs-tab" data-tab="notes">Notes</button>
      </div>

      <div id="cgs-body">
        <!-- STATS TAB -->
        <div id="cgs-tab-stats" class="cgs-tabpanel">
          <div class="cgs-grid">
            <div class="cgs-card">
              <div class="cgs-k">Active today</div>
              <div class="cgs-v" id="cgs-active-today">—</div>
            </div>
            <div class="cgs-card">
              <div class="cgs-k">Active this week</div>
              <div class="cgs-v" id="cgs-active-week">—</div>
            </div>
            <div class="cgs-card">
              <div class="cgs-k">Active this month</div>
              <div class="cgs-v" id="cgs-active-month">—</div>
            </div>
            <div class="cgs-card">
              <div class="cgs-k">Streak</div>
              <div class="cgs-v" id="cgs-streak">—</div>
            </div>
          </div>

          <div class="cgs-grid">
            <div class="cgs-card">
              <div class="cgs-k">Sessions today</div>
              <div class="cgs-v" id="cgs-sessions">—</div>
            </div>
            <div class="cgs-card">
              <div class="cgs-k">History imported</div>
              <div class="cgs-v" id="cgs-imported">Not imported</div>
            </div>
          </div>

          <div class="cgs-section-title">History (optional import)</div>

          <div class="cgs-grid">
            <div class="cgs-card">
              <div class="cgs-k">Total chats</div>
              <div class="cgs-v" id="cgs-total">—</div>
            </div>
            <div class="cgs-card">
              <div class="cgs-k">Last 7 days</div>
              <div class="cgs-v" id="cgs-last7">—</div>
            </div>
            <div class="cgs-card">
              <div class="cgs-k">This month</div>
              <div class="cgs-v" id="cgs-month">—</div>
            </div>
            <div class="cgs-card">
              <div class="cgs-k">Import enabled</div>
              <div class="cgs-v" id="cgs-import-enabled">—</div>
            </div>
          </div>

          <div id="cgs-divider"></div>

          <div class="cgs-section-title">Top title keywords (history)</div>
          <div id="cgs-keywords">(Enable import + load conversations.json to see this.)</div>
        </div>

        <!-- NOTES TAB -->
        <div id="cgs-tab-notes" class="cgs-tabpanel" style="display:none;">
          <div class="cgs-section-title">Top priority goal</div>

          <div class="cgs-notes-row" style="align-items:center;">
            <div style="flex:1;">
              <input id="cgs-goal" class="cgs-input" placeholder="Top priority goal..." />
            </div>
            <div style="width:110px;">
              <input id="cgs-goal-days" class="cgs-input" type="number" min="1" max="365" placeholder="Days" />
              <div class="cgs-mutedline" style="margin-top:4px;">Due (days)</div>
            </div>
            <div style="width:110px;">
              <button id="cgs-set-deadline" class="cgs-btn">Set</button>
            </div>
          </div>

          <div class="cgs-mutedline">Set adds a deadline + countdown chip on the overlay.</div>

          <div id="cgs-divider"></div>

          <div class="cgs-notes-row">
            <div style="flex:1;">
              <div class="cgs-section-title">Project</div>
              <select id="cgs-project" class="cgs-select"></select>
            </div>
            <div style="width: 120px;">
              <div class="cgs-section-title">New</div>
              <button id="cgs-new-project" class="cgs-btn">+ Project</button>
            </div>
          </div>

          <div class="cgs-section-title">Scratchpad (per project)</div>
          <textarea id="cgs-scratch" class="cgs-textarea" placeholder="Notes, checklist, plan..."></textarea>
          <div class="cgs-mutedline">Auto-saves locally.</div>

          <div id="cgs-divider"></div>

          <div class="cgs-notes-row">
            <div style="flex:1;">
              <div class="cgs-section-title">Pinned snippets</div>
              <input id="cgs-snippet-input" class="cgs-input" placeholder="Paste a prompt/checklist snippet..." />
            </div>
            <div style="width: 120px; margin-top: 22px;">
              <button id="cgs-add-snippet" class="cgs-btn">Add</button>
            </div>
          </div>

          <div id="cgs-snippets"></div>
        </div>
      </div>

      <div id="cgs-footer">
        <small>Local-only. Time + notes work without import.</small>

        <div id="cgs-settings-panel" style="display:none; margin-top:8px;">
          <div class="cgs-footer-row">
            <label class="cgs-check">
              <input type="checkbox" id="cgs-enable-import" />
              Enable import
            </label>
            <div class="cgs-mutedline">Import reads exported <code>conversations.json</code> (optional).</div>
          </div>
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

  function renderActiveBuckets(todaySec, weekSec, monthSec) {
    safeText("cgs-active-today", formatSeconds(todaySec));
    safeText("cgs-active-week", formatSeconds(weekSec));
    safeText("cgs-active-month", formatSeconds(monthSec));
  }

  function renderStreak(count) {
    safeText("cgs-streak", `${count || 0} day${(count || 0) === 1 ? "" : "s"}`);
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
    safeHtml("cgs-keywords", kw.length ? kw.map(k => `• ${k}`).join("<br/>") : "(No keywords yet.)");
  }

  // ---------- Top Priority Chip ----------
  function formatCountdown(ms) {
    const s = Math.floor(Math.max(0, ms) / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `Due in ${d}d ${h}h`;
    if (h > 0) return `Due in ${h}h ${m}m`;
    return `Due in ${m}m`;
  }

  function renderTopPriorityChip(goal, dueAt) {
    const wrap = document.getElementById("cgs-priority");
    const textEl = document.getElementById("cgs-priority-text");
    const timerEl = document.getElementById("cgs-priority-timer");
    if (!wrap || !textEl || !timerEl) return;

    const widget = document.getElementById("cgs-widget");
    widget?.classList.remove("cgs-pri-warn", "cgs-pri-over");

    const hasGoal = (goal || "").trim().length > 0;
    const hasDue = typeof dueAt === "number" && Number.isFinite(dueAt);

    if (!hasGoal) {
      wrap.style.display = "none";
      return;
    }

    wrap.style.display = "block";
    textEl.textContent = goal;

    if (!hasDue) {
      timerEl.textContent = "";
      return;
    }

    const diff = dueAt - Date.now();
    if (diff < 0) {
      timerEl.textContent = "Overdue";
      widget?.classList.add("cgs-pri-over");
      return;
    }

    timerEl.textContent = formatCountdown(diff);

    if (diff <= 48 * 3600 * 1000) widget?.classList.add("cgs-pri-warn");
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

  // ---------- Tabs ----------
  function initTabs() {
    const tabs = Array.from(document.querySelectorAll(".cgs-tab"));
    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        tabs.forEach(b => b.classList.remove("cgs-tab-active"));
        btn.classList.add("cgs-tab-active");

        const tab = btn.getAttribute("data-tab");
        const statsPanel = document.getElementById("cgs-tab-stats");
        const notesPanel = document.getElementById("cgs-tab-notes");
        if (!statsPanel || !notesPanel) return;

        if (tab === "notes") {
          statsPanel.style.display = "none";
          notesPanel.style.display = "block";
        } else {
          notesPanel.style.display = "none";
          statsPanel.style.display = "block";
        }
      });
    });
  }

  // ---------- Notes ----------
  function defaultNotesState() {
    return {
      goal: "",
      goalDueAt: null,             // ms timestamp or null
      goalDueDays: GOAL_DEFAULT_DUE_DAYS,
      selectedProject: "General",
      projects: {
        "General": { scratch: "" },
        "Resume": { scratch: "" },
        "Playwright": { scratch: "" }
      },
      snippets: []
    };
  }

  function ensureNotesShape(state) {
    const s = state && typeof state === "object" ? state : defaultNotesState();
    if (!s.projects || typeof s.projects !== "object") s.projects = {};
    if (!s.projects["General"]) s.projects["General"] = { scratch: "" };
    if (!Array.isArray(s.snippets)) s.snippets = [];
    if (!s.selectedProject || !s.projects[s.selectedProject]) s.selectedProject = "General";
    if (typeof s.goal !== "string") s.goal = "";
    if (!("goalDueAt" in s)) s.goalDueAt = null;
    if (typeof s.goalDueDays !== "number") s.goalDueDays = GOAL_DEFAULT_DUE_DAYS;
    return s;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderSnippets(snippets) {
    const container = document.getElementById("cgs-snippets");
    if (!container) return;

    if (!snippets.length) {
      container.innerHTML = `<div class="cgs-mutedline">(No snippets yet)</div>`;
      return;
    }

    container.innerHTML = snippets.map((snip, idx) => `
      <div class="cgs-snippet">
        <div class="cgs-snippet-text" title="Click to copy">${escapeHtml(snip)}</div>
        <button class="cgs-snippet-del" data-idx="${idx}" title="Delete">✕</button>
      </div>
    `).join("");

    container.querySelectorAll(".cgs-snippet-text").forEach(el => {
      el.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(el.textContent || ""); } catch {}
      });
    });

    container.querySelectorAll(".cgs-snippet-del").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.getAttribute("data-idx"));
        const { [STORAGE_KEYS.NOTES_STATE]: raw } = await safeGetStorage([STORAGE_KEYS.NOTES_STATE]);
        const state = ensureNotesShape(raw);
        state.snippets.splice(idx, 1);
        await safeSetStorage({ [STORAGE_KEYS.NOTES_STATE]: state });
        renderSnippets(state.snippets);
      });
    });
  }

  function renderProjectsSelect(state) {
    const sel = document.getElementById("cgs-project");
    if (!sel) return;

    const names = Object.keys(state.projects).sort((a, b) => a.localeCompare(b));
    sel.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
    sel.value = state.selectedProject;
  }

  function setScratchValue(state) {
    const ta = document.getElementById("cgs-scratch");
    if (!ta) return;
    ta.value = state.projects?.[state.selectedProject]?.scratch ?? "";
  }

  function setGoalValue(state) {
    const inp = document.getElementById("cgs-goal");
    if (!inp) return;
    inp.value = state.goal ?? "";
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  async function initNotesUI() {
    const s = await safeGetStorage([STORAGE_KEYS.NOTES_STATE]);
    let state = ensureNotesShape(s[STORAGE_KEYS.NOTES_STATE]);

    // initial render
    setGoalValue(state);
    renderProjectsSelect(state);
    setScratchValue(state);
    renderSnippets(state.snippets);

    // render chip on load
    renderTopPriorityChip(state.goal, state.goalDueAt);

    const goalInp = document.getElementById("cgs-goal");
    const goalDaysInp = document.getElementById("cgs-goal-days");
    const setDeadlineBtn = document.getElementById("cgs-set-deadline");

    if (goalDaysInp) goalDaysInp.value = String(state.goalDueDays ?? GOAL_DEFAULT_DUE_DAYS);

    // goal save
    if (goalInp) {
      goalInp.addEventListener("input", debounce(async () => {
        const { [STORAGE_KEYS.NOTES_STATE]: raw } = await safeGetStorage([STORAGE_KEYS.NOTES_STATE]);
        const st = ensureNotesShape(raw);
        st.goal = goalInp.value || "";
        await safeSetStorage({ [STORAGE_KEYS.NOTES_STATE]: st });
        renderTopPriorityChip(st.goal, st.goalDueAt);
      }, 250));
    }

    // set deadline
    if (setDeadlineBtn && goalInp && goalDaysInp) {
      setDeadlineBtn.addEventListener("click", async () => {
        const days = Math.max(1, Math.min(365, Number(goalDaysInp.value || GOAL_DEFAULT_DUE_DAYS)));
        const goal = (goalInp.value || "").trim();
        if (!goal) {
          alert("Add a goal first.");
          return;
        }

        const dueAt = Date.now() + days * 86400 * 1000;

        const { [STORAGE_KEYS.NOTES_STATE]: raw } = await safeGetStorage([STORAGE_KEYS.NOTES_STATE]);
        const st = ensureNotesShape(raw);
        st.goal = goal;
        st.goalDueDays = days;
        st.goalDueAt = dueAt;

        await safeSetStorage({ [STORAGE_KEYS.NOTES_STATE]: st });
        renderTopPriorityChip(st.goal, st.goalDueAt);
      });
    }

    // clear chip
    const clearBtn = document.getElementById("cgs-priority-clear");
    if (clearBtn) {
      clearBtn.addEventListener("click", async () => {
        const { [STORAGE_KEYS.NOTES_STATE]: raw } = await safeGetStorage([STORAGE_KEYS.NOTES_STATE]);
        const st = ensureNotesShape(raw);
        st.goal = "";
        st.goalDueAt = null;

        await safeSetStorage({ [STORAGE_KEYS.NOTES_STATE]: st });
        renderTopPriorityChip(st.goal, st.goalDueAt);

        if (goalInp) goalInp.value = "";
      });
    }

    // project change
    const projSel = document.getElementById("cgs-project");
    if (projSel) {
      projSel.addEventListener("change", async () => {
        const { [STORAGE_KEYS.NOTES_STATE]: raw } = await safeGetStorage([STORAGE_KEYS.NOTES_STATE]);
        const st = ensureNotesShape(raw);
        st.selectedProject = projSel.value;
        await safeSetStorage({ [STORAGE_KEYS.NOTES_STATE]: st });
        setScratchValue(st);
      });
    }

    // new project
    const newBtn = document.getElementById("cgs-new-project");
    if (newBtn) {
      newBtn.addEventListener("click", async () => {
        const name = prompt("Project name?");
        if (!name) return;
        const trimmed = name.trim();
        if (!trimmed) return;

        const { [STORAGE_KEYS.NOTES_STATE]: raw } = await safeGetStorage([STORAGE_KEYS.NOTES_STATE]);
        const st = ensureNotesShape(raw);
        if (!st.projects[trimmed]) st.projects[trimmed] = { scratch: "" };
        st.selectedProject = trimmed;

        await safeSetStorage({ [STORAGE_KEYS.NOTES_STATE]: st });
        renderProjectsSelect(st);
        setScratchValue(st);
      });
    }

    // scratch autosave
    const scratch = document.getElementById("cgs-scratch");
    if (scratch) {
      scratch.addEventListener("input", debounce(async () => {
        const { [STORAGE_KEYS.NOTES_STATE]: raw } = await safeGetStorage([STORAGE_KEYS.NOTES_STATE]);
        const st = ensureNotesShape(raw);
        if (!st.projects[st.selectedProject]) st.projects[st.selectedProject] = { scratch: "" };
        st.projects[st.selectedProject].scratch = scratch.value || "";
        await safeSetStorage({ [STORAGE_KEYS.NOTES_STATE]: st });
      }, 300));
    }

    // add snippet
    const snipInput = document.getElementById("cgs-snippet-input");
    const addSnipBtn = document.getElementById("cgs-add-snippet");
    if (snipInput && addSnipBtn) {
      addSnipBtn.addEventListener("click", async () => {
        const txt = (snipInput.value || "").trim();
        if (!txt) return;

        const { [STORAGE_KEYS.NOTES_STATE]: raw } = await safeGetStorage([STORAGE_KEYS.NOTES_STATE]);
        const st = ensureNotesShape(raw);
        st.snippets.unshift(txt);
        st.snippets = st.snippets.slice(0, 30);

        await safeSetStorage({ [STORAGE_KEYS.NOTES_STATE]: st });
        snipInput.value = "";
        renderSnippets(st.snippets);
      });
    }

    // persist shape if missing
    await safeSetStorage({ [STORAGE_KEYS.NOTES_STATE]: state });
  }

  // ---------- Streak logic ----------
  function parseDayKey(key) {
    const [y, m, d] = (key || "").split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function diffDays(dayA, dayB) {
    const a = new Date(dayA.getFullYear(), dayA.getMonth(), dayA.getDate()).getTime();
    const b = new Date(dayB.getFullYear(), dayB.getMonth(), dayB.getDate()).getTime();
    return Math.round((a - b) / 86400000);
  }

  async function maybeUpdateStreak(todaySeconds) {
    const today = dayKey();
    const s = await safeGetStorage([STORAGE_KEYS.STREAK_COUNT, STORAGE_KEYS.STREAK_LAST_ACTIVE_DAY]);
    let streak = Number(s[STORAGE_KEYS.STREAK_COUNT] || 0);
    const lastDay = s[STORAGE_KEYS.STREAK_LAST_ACTIVE_DAY] || null;

    if (todaySeconds < STREAK_DAY_THRESHOLD_SEC) {
      renderStreak(streak);
      return;
    }

    if (!lastDay) {
      streak = 1;
      await safeSetStorage({
        [STORAGE_KEYS.STREAK_COUNT]: streak,
        [STORAGE_KEYS.STREAK_LAST_ACTIVE_DAY]: today
      });
      renderStreak(streak);
      return;
    }

    if (lastDay === today) {
      renderStreak(streak);
      return;
    }

    const lastDate = parseDayKey(lastDay);
    const todayDate = parseDayKey(today);
    if (!lastDate || !todayDate) {
      renderStreak(streak);
      return;
    }

    const gap = diffDays(todayDate, lastDate);
    if (gap === 1) streak += 1;
    else if (gap > 1) streak = 1;

    await safeSetStorage({
      [STORAGE_KEYS.STREAK_COUNT]: streak,
      [STORAGE_KEYS.STREAK_LAST_ACTIVE_DAY]: today
    });

    renderStreak(streak);
  }

  // ---------- Tick: sessions ----------
  async function tickSessions() {
    const t = nowMs();
    const s = await safeGetStorage([
      STORAGE_KEYS.SESSION_LAST_ACTIVITY,
      STORAGE_KEYS.SESSIONS_TODAY,
      STORAGE_KEYS.SESSION_DATE_KEY
    ]);

    const last = s[STORAGE_KEYS.SESSION_LAST_ACTIVITY] || 0;
    const sessionsToday = s[STORAGE_KEYS.SESSIONS_TODAY] ?? 0;
    const storedDay = s[STORAGE_KEYS.SESSION_DATE_KEY] || dayKey();

    const day = dayKey();
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

  // ---------- Tick: active time buckets ----------
  async function tickActiveTimeBuckets() {
    const t = nowMs();
    const today = dayKey();
    const wk = weekKey();
    const mon = monthKey();

    const s = await safeGetStorage([
      STORAGE_KEYS.ACTIVE_TODAY_SECONDS,
      STORAGE_KEYS.ACTIVE_WEEK_SECONDS,
      STORAGE_KEYS.ACTIVE_MONTH_SECONDS,
      STORAGE_KEYS.ACTIVE_LAST_TICK,
      STORAGE_KEYS.ACTIVE_DAY_KEY,
      STORAGE_KEYS.ACTIVE_WEEK_KEY,
      STORAGE_KEYS.ACTIVE_MONTH_KEY,
      STORAGE_KEYS.NOTES_STATE
    ]);

    let todaySec = Number(s[STORAGE_KEYS.ACTIVE_TODAY_SECONDS] || 0);
    let weekSec = Number(s[STORAGE_KEYS.ACTIVE_WEEK_SECONDS] || 0);
    let monthSec = Number(s[STORAGE_KEYS.ACTIVE_MONTH_SECONDS] || 0);

    const lastTick = Number(s[STORAGE_KEYS.ACTIVE_LAST_TICK] || t);

    const storedDay = s[STORAGE_KEYS.ACTIVE_DAY_KEY] || today;
    const storedWeek = s[STORAGE_KEYS.ACTIVE_WEEK_KEY] || wk;
    const storedMonth = s[STORAGE_KEYS.ACTIVE_MONTH_KEY] || mon;

    if (storedDay !== today) todaySec = 0;
    if (storedWeek !== wk) weekSec = 0;
    if (storedMonth !== mon) monthSec = 0;

    const deltaSec = Math.max(0, Math.floor((t - lastTick) / 1000));
    const recentlyActive = (t - lastUserActivityMs) <= IDLE_CUTOFF_MS;

    if (isTabActive() && recentlyActive) {
      todaySec += deltaSec;
      weekSec += deltaSec;
      monthSec += deltaSec;
    }

    await safeSetStorage({
      [STORAGE_KEYS.ACTIVE_TODAY_SECONDS]: todaySec,
      [STORAGE_KEYS.ACTIVE_WEEK_SECONDS]: weekSec,
      [STORAGE_KEYS.ACTIVE_MONTH_SECONDS]: monthSec,
      [STORAGE_KEYS.ACTIVE_LAST_TICK]: t,
      [STORAGE_KEYS.ACTIVE_DAY_KEY]: today,
      [STORAGE_KEYS.ACTIVE_WEEK_KEY]: wk,
      [STORAGE_KEYS.ACTIVE_MONTH_KEY]: mon
    });

    renderActiveBuckets(todaySec, weekSec, monthSec);
    await maybeUpdateStreak(todaySec);

    // keep countdown chip fresh
    const ns = ensureNotesShape(s[STORAGE_KEYS.NOTES_STATE]);
    renderTopPriorityChip(ns.goal, ns.goalDueAt);
  }

  // ---------- Import wiring ----------
  async function initImportUI() {
    const importBtn = document.getElementById("cgs-import-btn");
    const enableImportCheckbox = document.getElementById("cgs-enable-import");
    const fileInput = document.getElementById("cgs-hidden-file");

    const saved = await safeGetStorage([STORAGE_KEYS.IMPORT_ENABLED, STORAGE_KEYS.HISTORY_STATS]);
    const importEnabled = !!saved[STORAGE_KEYS.IMPORT_ENABLED];
    if (enableImportCheckbox) enableImportCheckbox.checked = importEnabled;

    if (importBtn) {
      importBtn.disabled = !importEnabled;
      safeText("cgs-import-enabled", importEnabled ? "Yes" : "No");

      importBtn.addEventListener("click", async () => {
        const s = await safeGetStorage([STORAGE_KEYS.IMPORT_ENABLED]);
        if (!s[STORAGE_KEYS.IMPORT_ENABLED]) {
          alert("Enable import (⚙ settings) first.");
          return;
        }
        fileInput?.click();
      });
    }

    if (enableImportCheckbox) {
      enableImportCheckbox.addEventListener("change", async (e) => {
        const enabled = !!e.target.checked;
        await safeSetStorage({ [STORAGE_KEYS.IMPORT_ENABLED]: enabled });
        if (importBtn) importBtn.disabled = !enabled;
        safeText("cgs-import-enabled", enabled ? "Yes" : "No");
      });
    }

    if (saved[STORAGE_KEYS.HISTORY_STATS]) renderHistory(saved[STORAGE_KEYS.HISTORY_STATS]);
    else renderHistory(null);

    if (fileInput) {
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
            alert("Could not find a conversations array. Please select conversations.json.");
            return;
          }

          // from utils.js
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
    }
  }

  // ---------- Init ----------
  const { w, minimized } = createWidget();
  await restorePosition(w);
  enableDragging(w, $("#cgs-header", w));
  initTabs();

  // Settings toggle (⚙)
  const settingsBtn = document.getElementById("cgs-settings-btn");
  const settingsPanel = document.getElementById("cgs-settings-panel");
  if (settingsBtn && settingsPanel) {
    settingsBtn.addEventListener("click", () => {
      const isOpen = settingsPanel.style.display === "block";
      settingsPanel.style.display = isOpen ? "none" : "block";
    });
  }

  // Minimize / restore
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

  // Restore minimized state + initial renders
  const savedInit = await safeGetStorage([
    STORAGE_KEYS.MINIMIZED,
    STORAGE_KEYS.SESSIONS_TODAY,
    STORAGE_KEYS.ACTIVE_TODAY_SECONDS,
    STORAGE_KEYS.ACTIVE_WEEK_SECONDS,
    STORAGE_KEYS.ACTIVE_MONTH_SECONDS,
    STORAGE_KEYS.STREAK_COUNT,
    STORAGE_KEYS.NOTES_STATE
  ]);

  if (savedInit[STORAGE_KEYS.MINIMIZED]) {
    w.style.display = "none";
    minimized.style.display = "block";
  }

  renderSessions(savedInit[STORAGE_KEYS.SESSIONS_TODAY] ?? 0);
  renderActiveBuckets(
    Number(savedInit[STORAGE_KEYS.ACTIVE_TODAY_SECONDS] || 0),
    Number(savedInit[STORAGE_KEYS.ACTIVE_WEEK_SECONDS] || 0),
    Number(savedInit[STORAGE_KEYS.ACTIVE_MONTH_SECONDS] || 0)
  );
  renderStreak(Number(savedInit[STORAGE_KEYS.STREAK_COUNT] || 0));

  // Ensure notes exists
  if (!savedInit[STORAGE_KEYS.NOTES_STATE]) {
    await safeSetStorage({ [STORAGE_KEYS.NOTES_STATE]: defaultNotesState() });
  } else {
    const ns = ensureNotesShape(savedInit[STORAGE_KEYS.NOTES_STATE]);
    renderTopPriorityChip(ns.goal, ns.goalDueAt);
  }

  await initNotesUI();
  await initImportUI();

  // Refresh button
  $("#cgs-refresh-btn", w).addEventListener("click", async () => {
    const s = await safeGetStorage([
      STORAGE_KEYS.SESSIONS_TODAY,
      STORAGE_KEYS.ACTIVE_TODAY_SECONDS,
      STORAGE_KEYS.ACTIVE_WEEK_SECONDS,
      STORAGE_KEYS.ACTIVE_MONTH_SECONDS,
      STORAGE_KEYS.STREAK_COUNT,
      STORAGE_KEYS.IMPORT_ENABLED,
      STORAGE_KEYS.HISTORY_STATS,
      STORAGE_KEYS.NOTES_STATE
    ]);

    renderSessions(s[STORAGE_KEYS.SESSIONS_TODAY] ?? 0);
    renderActiveBuckets(
      Number(s[STORAGE_KEYS.ACTIVE_TODAY_SECONDS] || 0),
      Number(s[STORAGE_KEYS.ACTIVE_WEEK_SECONDS] || 0),
      Number(s[STORAGE_KEYS.ACTIVE_MONTH_SECONDS] || 0)
    );
    renderStreak(Number(s[STORAGE_KEYS.STREAK_COUNT] || 0));
    safeText("cgs-import-enabled", s[STORAGE_KEYS.IMPORT_ENABLED] ? "Yes" : "No");
    renderHistory(s[STORAGE_KEYS.HISTORY_STATS] || null);

    const ns = ensureNotesShape(s[STORAGE_KEYS.NOTES_STATE]);
    renderTopPriorityChip(ns.goal, ns.goalDueAt);
  });

  // Baseline last tick
  await safeSetStorage({ [STORAGE_KEYS.ACTIVE_LAST_TICK]: nowMs() });

  // Intervals + cleanup + final flush
  const activeInterval = setInterval(tickActiveTimeBuckets, ACTIVE_TICK_MS);
  const sessionInterval = setInterval(tickSessions, ACTIVE_TICK_MS);

  window.addEventListener("pagehide", async () => {
    await tickActiveTimeBuckets();
    await tickSessions();
    clearInterval(activeInterval);
    clearInterval(sessionInterval);
  });
})();
