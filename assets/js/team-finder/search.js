// search.js: the Team Finder's "Find teams" section (step 4 of the plan in CLAUDE.md). Uses
// common.js (window.TF) and the contenders from pool.js (TF.pool).
//
// - Sends the contenders marked "Use" or "Must include" to worker.js ("search"), which battles
//   any not done yet and grades every team of three exactly as "Grade one team" does.
// - Target grades and rules are remembered in this browser (localStorage).
// - Results: the best 500 teams that meet the targets, ordered by grade points (A 4, B 3, C 2,
//   D 1, F 0, summed over the four grades), then lowest threat score. If no team meets them,
//   the 500 closest ("short by" = how many grade steps below the targets in total).
// - Each team's "Grade" button loads it into "Grade one team" (page.js, TF.gradeTeam), which
//   shows its top threats and a link to the same team on pvpoke.com.
// - Results are cleared when the cup changes, and marked out of date when the contenders change.

(function () {
  "use strict";

  var section = document.querySelector("[data-search]");
  if (!section || !window.TF) return;
  var TF = window.TF;
  var el = TF.el;

  var form = section.querySelector("[data-search-form]");
  var findBtn = form.querySelector("[data-find]");
  var cancelBtn = form.querySelector("[data-cancel-search]");
  var progressEl = form.querySelector("[data-search-progress]");
  var statusEl = form.querySelector("[data-search-status]");
  var summaryEl = section.querySelector("[data-search-summary]");
  var wrap = section.querySelector("[data-search-wrap]");
  var table = section.querySelector("[data-search-table]");
  var targetSelects = Array.prototype.slice.call(form.querySelectorAll("[data-target]"));
  var ruleBoxes = Array.prototype.slice.call(form.querySelectorAll("[data-rule]"));
  var STORE = "team-finder-search";

  var job = null;
  var last = null;      // { result, used, cupKey, summary }
  var sortCol = -1, sortDir = 0;

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle("error", !!isError);
  }

  // ---- Remember targets and rules ----
  function save() {
    var state = { targets: {}, rules: {} };
    targetSelects.forEach(function (s) { state.targets[s.getAttribute("data-target")] = s.value; });
    ruleBoxes.forEach(function (b) { state.rules[b.getAttribute("data-rule")] = b.checked; });
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* storage blocked */ }
  }
  function restore() {
    var state = null;
    try { state = JSON.parse(localStorage.getItem(STORE)); } catch (e) { state = null; }
    if (!state) return;
    targetSelects.forEach(function (s) {
      var v = state.targets && state.targets[s.getAttribute("data-target")];
      if (v !== undefined && s.querySelector('option[value="' + v + '"]')) s.value = v;
    });
    ruleBoxes.forEach(function (b) {
      var v = state.rules && state.rules[b.getAttribute("data-rule")];
      if (typeof v === "boolean") b.checked = v;
    });
  }
  form.addEventListener("change", save);

  // ---- Results table ----
  var GRADES = ["Coverage", "Bulk", "Safety", "Consistency"];

  function memberLabel(c) {
    return c.name + " " + c.ivs.atk + "/" + c.ivs.def + "/" + c.ivs.hp;
  }

  function columns(closest) {
    var cols = [
      { label: "Team", key: function (t) { return t.names.join(" "); },
        cell: function (t) { return el("th", { scope: "row", class: "team" }, t.names.map(function (n) { return el("span", { class: "line", text: n }); })); } },
      { label: "Coverage", num: true, key: function (t) { return t.threatScore; },
        cell: function (t) { return gradeCell(t.letters[0], "threat score " + t.threatScore); } },
      { label: "Bulk", num: true, key: function (t) { return t.bulk; },
        cell: function (t) { return gradeCell(t.letters[1], t.bulk.toLocaleString()); } },
      { label: "Safety", num: true, key: function (t) { return t.safety; },
        cell: function (t) { return gradeCell(t.letters[2], String(t.safety)); } },
      { label: "Consistency", num: true, key: function (t) { return t.consistency; },
        cell: function (t) { return gradeCell(t.letters[3], String(t.consistency)); } },
      { label: "Points", num: true, key: function (t) { return t.points; },
        cell: function (t) { return el("td", { class: "num", text: String(t.points) }); } }
    ];
    if (closest) {
      cols.push({ label: "Short by", num: true, key: function (t) { return t.short; },
        cell: function (t) { return el("td", { class: "num", text: String(t.short) }); } });
    }
    return cols;
  }

  function gradeCell(letter, detail) {
    return el("td", { class: "num grade-cell", "data-grade": letter }, [
      el("span", { class: "letter", text: letter }), " ", el("span", { class: "detail", text: detail })
    ]);
  }

  function render() {
    table.innerHTML = "";
    if (!last) { wrap.hidden = true; summaryEl.hidden = true; return; }
    var r = last.result;
    summaryEl.hidden = false;
    summaryEl.textContent = (last.stale ? "These results are out of date: the contenders or their In search settings changed. Find teams again to update. " : "") + last.summary;
    summaryEl.classList.toggle("stale", !!last.stale);
    wrap.hidden = r.teams.length === 0;
    if (!r.teams.length) return;

    var cols = columns(r.closest);
    var headRow = el("tr");
    cols.forEach(function (c, i) {
      var th = el("th", { scope: "col", class: c.num ? "num" : "" });
      var btn = el("button", { type: "button", class: "sort", text: c.label });
      btn.addEventListener("click", function () {
        if (sortCol !== i) { sortCol = i; sortDir = 1; }
        else if (sortDir === 1) sortDir = -1;
        else if (sortDir === -1) sortDir = 0;
        else sortDir = 1;
        render();
      });
      if (sortCol === i && sortDir) th.setAttribute("aria-sort", sortDir === 1 ? "ascending" : "descending");
      th.appendChild(btn);
      headRow.appendChild(th);
    });
    headRow.appendChild(el("th", { scope: "col", text: "" }));
    table.appendChild(el("thead", null, [headRow]));

    var rows = r.teams.map(function (t, i) { return { t: t, i: i }; });
    if (sortCol >= 0 && sortDir && cols[sortCol]) {
      var c = cols[sortCol];
      var collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
      rows.sort(function (a, b) {
        var x = c.key(a.t), y = c.key(b.t);
        var d = c.num ? x - y : collator.compare(x, y);
        return d * sortDir || a.i - b.i;
      });
    }

    var tbody = el("tbody");
    rows.forEach(function (row) {
      var tr = el("tr");
      cols.forEach(function (c) { tr.appendChild(c.cell(row.t)); });
      var gradeBtn = el("button", { type: "button", class: "remove", text: "Grade",
        "aria-label": "Grade " + row.t.names.join(", ") + " in Grade one team" });
      gradeBtn.addEventListener("click", function () {
        if (TF.gradeTeam) TF.gradeTeam(row.t.members.map(function (m) { return last.used[m].entry; }));
      });
      tr.appendChild(el("td", null, [gradeBtn]));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function summarize(r, used, cupLabel) {
    var parts = [];
    parts.push(cupLabel + ": " + r.graded.toLocaleString() + " teams of three graded from " + used.length + " contenders" +
      (r.ruledOut ? " (" + r.ruledOut.toLocaleString() + " more ruled out by the rules or Must include)" : "") +
      " in " + (r.ms / 1000).toFixed(1) + " s" + (r.battled ? ", after battling " + r.battled + " new contender" + (r.battled === 1 ? "" : "s") : "") + ".");
    if (!r.graded) parts.push("No team is allowed by the rules and Must include settings.");
    else if (r.closest) parts.push("No team meets all the targets. These are the " + r.teams.length + " closest: \"Short by\" counts the grade steps below the targets (B where A was wanted is 1).");
    else parts.push(r.qualifying.toLocaleString() + " meet the targets" + (r.qualifying > r.teams.length ? "; showing the best " + r.teams.length : "") + ".");
    parts.push("Order: most grade points (A 4, B 3, C 2, D 1, F 0, over the four grades), then lowest threat score. Click a heading to sort; \"Grade\" opens the team below with its top threats and a pvpoke.com link.");
    return parts.join(" ");
  }

  // ---- Find teams ----
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (job) return;
    var cup = TF.currentCup();
    var all = TF.pool ? TF.pool.contenders() : [];
    var used = all.filter(function (c) { return c.role !== "out"; });
    var include = [];
    used.forEach(function (c, i) { if (c.role === "include") include.push(i); });
    if (used.length < 3) { setStatus("At least 3 contenders are needed (not counting any marked Leave out).", true); return; }
    if (include.length > 3) { setStatus("At most 3 contenders can be marked Must include.", true); return; }

    var targets = {};
    targetSelects.forEach(function (s) { targets[s.getAttribute("data-target")] = Number(s.value); });
    var rules = {};
    ruleBoxes.forEach(function (b) { rules[b.getAttribute("data-rule")] = b.checked; });

    var names = used.map(memberLabel);
    findBtn.disabled = true;
    cancelBtn.hidden = false;
    cancelBtn.disabled = false;
    progressEl.hidden = false;
    progressEl.removeAttribute("value");
    setStatus("Starting…");

    job = TF.request({
      type: "search", cup: cup.cup, cp: cup.cp, meta: cup.meta,
      contenders: used.map(function (c) {
        var e = c.entry;
        return { speciesId: e.speciesId, ivs: e.ivs, cp: e.cp, fastMove: e.fastMove, chargedMoves: e.chargedMoves };
      }),
      include: include, rules: rules, targets: targets
    }, function (text, m) {
      setStatus(text);
      if (m.total) { progressEl.max = m.total; progressEl.value = m.done; }
    });

    job.then(function (r) {
      r.teams.forEach(function (t) { t.names = t.members.map(function (m) { return names[m]; }); });
      last = { result: r, used: used, cupKey: cup.key, summary: summarize(r, used, cup.label) };
      sortCol = -1; sortDir = 0;
      if (TF.pool && TF.pool.recordBattles) {
        TF.pool.recordBattles(cup.key, r.threats, used.map(function (c, i) { return { entry: c.entry, record: r.records[i] }; }));
      }
      setStatus("Done.");
      render();
    }).catch(function (err) {
      setStatus(err.message, true);
    }).then(function () {
      job = null;
      findBtn.disabled = false;
      cancelBtn.hidden = true;
      progressEl.hidden = true;
    });
  });

  cancelBtn.addEventListener("click", function () {
    if (!job) return;
    TF.cancel(job);
    cancelBtn.disabled = true;
    setStatus("Cancelling…");
  });

  // A different cup: these results don't apply. Changed contenders: they're out of date.
  document.addEventListener("tf:cup", function () {
    last = null;
    render();
    if (!job) setStatus("");
  });
  document.addEventListener("tf:pool", function () {
    if (!last || job) return;
    if (last.cupKey !== TF.currentCup().key) { last = null; render(); return; }
    if (!last.stale) { last.stale = true; render(); }
  });

  // ---- Start ----
  restore();
  TF.ready.then(function () { findBtn.disabled = false; }).catch(function () { /* common.js shows the error */ });
})();
