// pool.js: the Team Finder's contenders (step 2 of the plan in CLAUDE.md): the Pokémon that the
// search will build teams of three from. Uses common.js (window.TF).
//
// - Each cup has its own list, remembered in this browser (localStorage, key
//   "team-finder-pool:<cup>/<CP>"). Only what was entered is stored: species, IVs, CP, moves.
// - Contenders come from a CSV, from the "Type in a contender" form, or from the top N of the
//   cup's rankings (recommended moveset, upstream's default IVs for the league).
// - Every contender is checked by worker.js ("evaluate", no battles) before it's added. Its
//   level, IV Rank, Bulk, Safety, Consistency and rank in the cup come from there. Contenders
//   that fail the check aren't added; the reasons are listed above the table.
// - Repeats (same species, IVs, CP, fast move and pair of charged moves) are skipped.
// - Export CSV writes the input columns (which load back in), then the worked-out values.
// - Run battles (step 3): every contender against every Pokémon in the cup, in the worker,
//   with progress and Cancel. The worker keeps the results for the search; this page shows
//   each contender's Wins. Results last until the page is closed or reloaded.
// - "In search" (Use, Must include, Leave out) is stored with each contender as entry.role
//   (absent = Use). search.js reads the list through TF.pool and hears "tf:pool" on changes.
//
// CSV columns, any order, not case-sensitive, other columns ignored:
//   speciesId, ivAtk, ivDef, ivHp, cp, fastMove, chargedMove1, chargedMove2
// Species and moves can be IDs or names. A blank move gets the recommended one for this cup;
// "none" leaves chargedMove2 empty.

(function () {
  "use strict";

  var section = document.querySelector("[data-pool]");
  if (!section || !window.TF) return;
  var TF = window.TF;
  var el = TF.el;

  var statusEl = section.querySelector("[data-pool-status]");
  var problemsEl = section.querySelector("[data-problems]");
  var noteEl = section.querySelector("[data-pool-note]");
  var wrap = section.querySelector("[data-pool-wrap]");
  var table = section.querySelector("[data-pool-table]");
  var fileInput = section.querySelector("[data-csv-file]");
  var addForm = section.querySelector("[data-add-form]");
  var addFs = addForm.querySelector("fieldset");
  var runWrap = section.querySelector("[data-battle-run]");
  var runBtn = section.querySelector("[data-run-battles]");
  var cancelBtn = section.querySelector("[data-cancel-battles]");
  var progressEl = section.querySelector("[data-battle-progress]");
  var battleStatus = section.querySelector("[data-battle-status]");
  // Every button but Cancel is disabled while a job runs
  var buttons = Array.prototype.slice.call(section.querySelectorAll("button"))
    .filter(function (b) { return b !== cancelBtn; });

  var STORE = "team-finder-pool:";
  var INPUT_COLUMNS = ["speciesId", "ivAtk", "ivDef", "ivHp", "cp", "fastMove", "chargedMove1", "chargedMove2"];

  var cup = null;        // TF.currentCup() the list belongs to
  var entries = [];      // what was entered: { speciesId, ivs, cp, fastMove, chargedMoves: [c1, c2 or "none"] }
  var info = {};         // key(entry) -> the worker's result for it, in this cup
  var bulkGoal = 0;
  var battleResults = {}; // cup key -> { threats: N, byKey: { key(entry) -> { wins, losses, ties } } }
  var busy = false;
  var sortCol = -1, sortDir = 0;

  // ---- Small helpers ----
  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle("error", !!isError);
  }
  var busyCount = 0; // jobs still running (a cup change can start one while another runs)
  function setBusy(on) {
    busyCount = Math.max(0, busyCount + (on ? 1 : -1));
    busy = busyCount > 0;
    buttons.forEach(function (b) { b.disabled = busy; });
    if (cup) updateRun(); // the Run button also depends on whether anything is left to battle
  }
  function showProblems(list) {
    problemsEl.innerHTML = "";
    list.forEach(function (p) { problemsEl.appendChild(el("li", { text: p })); });
    problemsEl.hidden = list.length === 0;
  }
  function key(e) {
    var c = [e.chargedMoves[0], e.chargedMoves[1] || "none"].sort();
    return [e.speciesId, e.ivs.atk, e.ivs.def, e.ivs.hp, e.cp, e.fastMove, c[0], c[1]].join("|");
  }
  function speciesLabel(id) {
    var s = TF.speciesById[id];
    return s ? s.speciesName : id;
  }
  function describe(e) {
    return speciesLabel(e.speciesId) + " (CP " + e.cp + ", " + e.ivs.atk + "/" + e.ivs.def + "/" + e.ivs.hp + ")";
  }

  // ---- Storage ----
  function load() {
    var list = null;
    try { list = JSON.parse(localStorage.getItem(STORE + cup.key)); } catch (e) { list = null; }
    entries = Array.isArray(list) ? list : [];
  }
  function save() {
    try { localStorage.setItem(STORE + cup.key, JSON.stringify(entries)); } catch (e) { /* storage blocked */ }
    changed();
  }
  // Tells search.js the list (or a contender's "In search" setting) changed
  function changed() { document.dispatchEvent(new CustomEvent("tf:pool")); }

  // For search.js: this cup's contenders that check out, with their "In search" setting
  // (role: "use", "include" or "out").
  TF.pool = {
    // How many contenders this cup's list has, checked or not
    total: function () { return entries.length; },
    contenders: function () {
      return entries.filter(function (e) { var r = info[key(e)]; return r && r.ok; }).map(function (e) {
        var r = info[key(e)];
        return { entry: e, role: e.role || "use", name: r.speciesName, ivs: e.ivs, cp: e.cp, moveset: r.moveset };
      });
    },
    // After a search battled contenders itself: record their wins. list: [{ entry, record }]
    recordBattles: function (cupKey, threats, list) {
      var b = battleResults[cupKey] || (battleResults[cupKey] = { threats: 0, byKey: {} });
      b.threats = threats;
      list.forEach(function (x) { b.byKey[key(x.entry)] = x.record; });
      if (cup && cup.key === cupKey) render();
    }
  };

  // ---- Checking contenders in the worker ----
  // Sends the contenders (and any not yet checked in this cup) to the worker. Resolves to
  // the worker's results for `list`, in order.
  function evaluate(list) {
    var todo = list.concat(entries.filter(function (e) { return !info[key(e)]; }));
    if (!todo.length) return Promise.resolve([]);
    var forCup = cup;
    return TF.request({ type: "evaluate", cup: forCup.cup, cp: forCup.cp, contenders: todo }, function (t) { setStatus(t); })
      .then(function (r) {
        if (forCup !== cup) throw new Error("stale"); // the cup changed meanwhile
        bulkGoal = r.bulkGoal;
        r.contenders.forEach(function (res, i) {
          if (todo[i].ivs && todo[i].cp) info[key(todo[i])] = res;
        });
        return r.contenders.slice(0, list.length);
      });
  }

  // Adds checked contenders to the end of the list. `labels` names each one in problems.
  function addChecked(list, results, labels, problems) {
    var have = {};
    entries.forEach(function (e) { have[key(e)] = true; });
    var added = 0, repeats = 0;
    results.forEach(function (res, i) {
      if (!res.ok) { problems.push(labels[i] + ": " + res.error); return; }
      var entry = {
        speciesId: res.speciesId,
        ivs: res.ivs,
        cp: res.cp,
        fastMove: res.fastMove,
        chargedMoves: [res.chargedMoves[0], res.chargedMoves[1] || "none"]
      };
      var k = key(entry);
      if (have[k]) { repeats++; return; }
      have[k] = true;
      info[k] = res;
      entries.push(entry);
      added++;
    });
    save();
    render();
    var text = added + " contender" + (added === 1 ? "" : "s") + " added";
    if (repeats) text += ", " + repeats + " repeat" + (repeats === 1 ? "" : "s") + " skipped";
    if (problems.length) text += ", " + problems.length + " with problems (listed below)";
    setStatus(text + ".", problems.length > 0 && added === 0);
    showProblems(problems);
    return added;
  }

  function run(promise) {
    setBusy(true);
    return promise
      .catch(function (err) { if (err.message !== "stale") setStatus(err.message, true); })
      .then(function () { setBusy(false); });
  }

  // ---- Recommended moves in this cup (for blanks and new species) ----
  function recommended(speciesId) {
    return TF.loadRankings(cup.cup, cup.cp).then(function (list) {
      var r = list.find(function (x) { return x.speciesId === speciesId; });
      return r ? r.moveset : null;
    });
  }

  // ---- The table ----
  var COLUMNS = [
    { label: "Pokémon", value: function (e, r) { return r && r.ok ? r.speciesName : speciesLabel(e.speciesId); } },
    { label: "Moveset", value: function (e, r) { return r && r.ok ? r.moveset : ""; } },
    { label: "CP", num: true, value: function (e) { return e.cp; } },
    { label: "Level", num: true, value: function (e, r) { return r && r.ok ? r.level : null; },
      text: function (e, r) { return r && r.ok ? String(r.level) + (r.otherLevels.length ? " (also " + r.otherLevels.join(", ") + ")" : "") : ""; } },
    { label: "IVs", value: function (e) { return e.ivs.atk + "/" + e.ivs.def + "/" + e.ivs.hp; } },
    { label: "IV Rank", num: true, value: function (e, r) { return r && r.ok && r.ivRank ? r.ivRank : null; },
      text: function (e, r) { return r && r.ok ? (r.ivRank ? "#" + r.ivRank : "??") + " of " + r.ivCount : ""; } },
    { label: "Bulk", num: true, value: function (e, r) { return r && r.ok ? r.bulk : null; },
      good: function (v) { return bulkGoal && v >= 0.9 * bulkGoal; } },
    { label: "Safety", num: true, value: function (e, r) { return r && r.ok ? r.safety : null; },
      good: function (v) { return v >= 0.9 * 98; } },
    { label: "Consistency", num: true, value: function (e, r) { return r && r.ok ? r.consistency : null; },
      good: function (v) { return v >= 0.9 * 98; } },
    { label: "Cup rank", num: true, value: function (e, r) { return r && r.ok ? r.rank : null; },
      text: function (e, r) { return r && r.ok ? (r.rank ? "#" + r.rank : "not ranked") : ""; } },
    { label: "Wins", num: true, value: function (e, r, b) { return b ? b.wins : null; } }
  ];

  function cupBattles() {
    if (!battleResults[cup.key]) battleResults[cup.key] = { threats: 0, byKey: {} };
    return battleResults[cup.key];
  }
  // Contenders that check out but haven't battled yet (in this cup, since the page opened)
  function needBattles() {
    var done = cupBattles().byKey;
    return entries.filter(function (e) { var r = info[key(e)]; return r && r.ok && !done[key(e)]; });
  }
  function updateRun() {
    runWrap.hidden = entries.length === 0;
    var todo = needBattles().length;
    var b = cupBattles();
    runBtn.textContent = todo === 0 ? "Battles done" : "Run battles for " + todo + " contender" + (todo === 1 ? "" : "s");
    runBtn.disabled = busy || todo === 0;
    if (!busy) {
      var done = Object.keys(b.byKey).length;
      battleStatus.classList.remove("error");
      battleStatus.textContent = done && todo === 0 ? "Every contender has battled all " + b.threats.toLocaleString() + " Pokémon in this cup." : "";
    }
  }

  function render() {
    table.innerHTML = "";
    wrap.hidden = entries.length === 0;
    noteEl.hidden = entries.length === 0;
    updateRun();
    if (!entries.length) return;
    var fought = cupBattles();

    var headRow = el("tr");
    COLUMNS.forEach(function (c, i) {
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
    headRow.appendChild(el("th", { scope: "col", text: "In search" }));
    headRow.appendChild(el("th", { scope: "col", text: "" }));
    table.appendChild(el("thead", null, [headRow]));

    var rows = entries.map(function (e, i) { return { e: e, r: info[key(e)], b: fought.byKey[key(e)], i: i }; });
    if (sortCol >= 0 && sortDir) {
      var c = COLUMNS[sortCol];
      var collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
      rows.sort(function (a, b) {
        var x = c.value(a.e, a.r, a.b), y = c.value(b.e, b.r, b.b);
        var xe = x === null || x === "", ye = y === null || y === "";
        if (xe || ye) return xe === ye ? a.i - b.i : (xe ? 1 : -1); // empty last
        var d = c.num ? x - y : collator.compare(String(x), String(y));
        return d * sortDir || a.i - b.i;
      });
    }

    var tbody = el("tbody");
    rows.forEach(function (row) {
      var tr = el("tr");
      COLUMNS.forEach(function (c, i) {
        var v = c.value(row.e, row.r, row.b);
        var text = c.text ? c.text(row.e, row.r, row.b) : (v === null || v === undefined ? "" : String(v));
        var cls = (c.num ? "num" : "") + (c.good && v !== null && c.good(v) ? " meets-a" : "");
        tr.appendChild(el(i === 0 ? "th" : "td", { scope: i === 0 ? "row" : null, class: cls.trim(), text: text }));
      });
      if (row.r && !row.r.ok) {
        tr.classList.add("problem");
        tr.children[1].textContent = row.r.error;
      } else if (!row.r) {
        tr.children[1].textContent = "Checking…";
      }
      var role = el("select", { class: "role", "aria-label": "In search: " + describe(row.e) }, [
        el("option", { value: "use", text: "Use" }),
        el("option", { value: "include", text: "Must include" }),
        el("option", { value: "out", text: "Leave out" })
      ]);
      role.value = row.e.role || "use";
      role.addEventListener("change", function () {
        if (role.value === "use") delete row.e.role; else row.e.role = role.value;
        save();
      });
      tr.appendChild(el("td", null, [role]));
      var remove = el("button", { type: "button", class: "remove", text: "Remove", "aria-label": "Remove " + describe(row.e) });
      remove.addEventListener("click", function () {
        if (busy) return;
        entries.splice(entries.indexOf(row.e), 1);
        save();
        render();
        setStatus("Removed " + describe(row.e) + ".");
      });
      tr.appendChild(el("td", null, [remove]));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    noteEl.textContent = entries.length + " contender" + (entries.length === 1 ? "" : "s") + ". " +
      "A team's Bulk, Safety and Consistency grades are the averages of its three members' values, so a highlighted value is at A level on its own " +
      "(Bulk " + Math.ceil(0.9 * bulkGoal).toLocaleString() + " or more, Safety and Consistency 88.2 or more). " +
      "IV Rank: the IVs' rank by stat product among every IV combination for this species in this league (upstream's IV Rank; ?? = below the species' IV floor). " +
      "Safety: the species' switches score in this cup's rankings, 60 if it isn't ranked (as upstream's Team Builder does). " +
      (fought.threats ? "Wins: how many of the " + fought.threats.toLocaleString() + " Pokémon in this cup it beats one-on-one (battle rating above 500, shields 0 and 1 combined). " : "") +
      "Click a heading to sort.";
  }

  // ---- Battles (step 3) ----
  var battleJob = null;
  runBtn.addEventListener("click", function () {
    if (busy) return;
    var todo = needBattles();
    if (!todo.length) return;
    var forCup = cup;
    setBusy(true);
    cancelBtn.hidden = false;
    cancelBtn.disabled = false;
    progressEl.hidden = false;
    progressEl.removeAttribute("value"); // moving bar until the first contender starts
    battleStatus.classList.remove("error");
    battleStatus.textContent = "Starting…";
    battleJob = TF.request({ type: "battles", cup: forCup.cup, cp: forCup.cp, meta: forCup.meta, contenders: todo }, function (text, m) {
      battleStatus.textContent = text;
      if (m.total) { progressEl.max = m.total; progressEl.value = m.done; }
    });
    battleJob
      .then(function (r) {
        var b = battleResults[forCup.key] || (battleResults[forCup.key] = { threats: 0, byKey: {} });
        b.threats = r.threats;
        r.contenders.forEach(function (res, i) { if (res.ok && !res.pending) b.byKey[key(todo[i])] = res; });
        var bad = r.contenders.filter(function (res) { return !res.ok; });
        var left = r.contenders.filter(function (res) { return res.pending; }).length;
        battleStatus.textContent = (r.cancelled ? "Cancelled. " : "") +
          r.ran + " contender" + (r.ran === 1 ? "" : "s") + " × " + r.threats.toLocaleString() + " Pokémon: " +
          r.battles.toLocaleString() + " battles in " + (r.ms / 1000).toFixed(1) + " s." +
          (left ? " " + left + " still to do; run again to continue." : "") +
          (bad.length ? " Couldn't battle: " + bad.map(function (x) { return x.error; }).join("; ") : "");
        battleStatus.classList.toggle("error", bad.length > 0);
      })
      .catch(function (err) {
        battleStatus.textContent = err.message;
        battleStatus.classList.add("error");
      })
      .then(function () {
        battleJob = null;
        cancelBtn.hidden = true;
        progressEl.hidden = true;
        setBusy(false);
        if (forCup === cup) render();
      });
  });
  cancelBtn.addEventListener("click", function () {
    if (!battleJob) return;
    TF.cancel(battleJob);
    cancelBtn.disabled = true;
    battleStatus.textContent = "Cancelling after this contender…";
  });

  // ---- Changing cup: show that cup's list ----
  function switchCup() {
    cup = TF.currentCup();
    info = {};
    sortCol = -1; sortDir = 0;
    load();
    showProblems([]);
    render();
    changed();
    if (!entries.length) { setStatus("No contenders for " + cup.label + " yet."); return; }
    run(evaluate([]).then(function () {
      render();
      changed(); // now checked: search.js can count them
      var bad = entries.filter(function (e) { var r = info[key(e)]; return r && !r.ok; }).length;
      setStatus(entries.length + " contenders for " + cup.label + "." + (bad ? " " + bad + " no longer check out; see the table." : ""), bad > 0);
    }));
  }

  // ---- Add the top N from the rankings ----
  section.querySelector("[data-add-top]").addEventListener("click", function () {
    if (busy) return;
    var n = Math.max(1, Math.min(500, Math.floor(Number(section.querySelector("[data-top-n]").value) || 0)));
    run(TF.loadRankings(cup.cup, cup.cp).then(function (list) {
      if (!list.length) throw new Error("No rankings found for " + cup.label + ".");
      var top = list.slice(0, n);
      var asked = top.map(function (r) {
        return { speciesId: r.speciesId, fastMove: r.moveset[0], chargedMoves: [r.moveset[1], r.moveset[2] || "none"] };
      });
      setStatus("Checking the top " + top.length + "…");
      return evaluate(asked).then(function (results) {
        addChecked(asked, results, top.map(function (r, i) { return "#" + (i + 1) + " " + r.speciesName; }), []);
      });
    }));
  });

  // ---- Type in a contender ----
  var addSpecies = addFs.querySelector("[data-species]");
  function addSpeciesChosen() {
    var species = TF.speciesByName[addSpecies.value.trim()];
    addSpecies.setCustomValidity(species || !addSpecies.value ? "" : "Choose a Pokémon from the list.");
    if (!species || addFs.getAttribute("data-species-id") === species.speciesId) return;
    addFs.setAttribute("data-species-id", species.speciesId);
    recommended(species.speciesId).then(function (moves) { TF.fillMoves(addFs, species, moves); });
  }
  addSpecies.addEventListener("change", addSpeciesChosen);
  addSpecies.addEventListener("input", function () { if (TF.speciesByName[addSpecies.value.trim()]) addSpeciesChosen(); });

  addForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (busy) return;
    var species = TF.speciesByName[addSpecies.value.trim()];
    if (!species) { setStatus("Choose the species from the list.", true); return; }
    var entry = {
      speciesId: species.speciesId,
      cp: Number(addFs.querySelector("[data-cp]").value),
      ivs: {
        atk: Number(addFs.querySelector('[data-iv="atk"]').value),
        def: Number(addFs.querySelector('[data-iv="def"]').value),
        hp: Number(addFs.querySelector('[data-iv="hp"]').value)
      },
      fastMove: addFs.querySelector('[data-move="fast"]').value,
      chargedMoves: [addFs.querySelector('[data-move="charged1"]').value, addFs.querySelector('[data-move="charged2"]').value]
    };
    setStatus("Checking " + describe(entry) + "…");
    run(evaluate([entry]).then(function (results) {
      var problems = [];
      if (addChecked([entry], results, [describe(entry)], problems) === 1) {
        // Ready for the next one of the same species: clear CP and IVs, keep species and moves
        ["[data-cp]", '[data-iv="atk"]', '[data-iv="def"]', '[data-iv="hp"]'].forEach(function (s) { addFs.querySelector(s).value = ""; });
        addFs.querySelector("[data-cp]").focus();
      }
    }));
  });

  // ---- CSV in ----
  // Splits CSV text into rows of fields. Handles quoted fields ("a, b", "say ""hi"""), CRLF,
  // a byte order mark, and semicolon or tab separators (detected from the first line).
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    var first = text.split(/\r?\n/, 1)[0] || "";
    var sep = first.indexOf(",") > -1 ? "," : first.indexOf(";") > -1 ? ";" : first.indexOf("\t") > -1 ? "\t" : ",";
    var rows = [], row = [], field = "", quoted = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (quoted) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
        } else field += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === sep) { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field); rows.push(row); row = []; field = "";
      } else field += ch;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function norm(h) { return String(h).toLowerCase().replace(/[^a-z0-9]/g, ""); }

  function importCSV(text, fileName) {
    var rows = parseCSV(text);
    var headerAt = rows.findIndex(function (r) { return r.some(function (f) { return f.trim() !== ""; }); });
    if (headerAt < 0) throw new Error(fileName + " is empty.");
    var header = rows[headerAt].map(norm);
    var col = {};
    INPUT_COLUMNS.forEach(function (name) { col[name] = header.indexOf(norm(name)); });
    var missing = ["speciesId", "ivAtk", "ivDef", "ivHp", "cp"].filter(function (n) { return col[n] < 0; });
    if (missing.length) {
      throw new Error(fileName + " has no " + missing.join(", ") + " column" + (missing.length > 1 ? "s" : "") +
        ". The first row must name the columns: " + INPUT_COLUMNS.join(", ") + ".");
    }

    return TF.loadRankings(cup.cup, cup.cp).then(function (ranking) {
      var recByid = {};
      ranking.forEach(function (r) { if (!recByid[r.speciesId]) recByid[r.speciesId] = r.moveset; });

      var problems = [], list = [], labels = [];
      for (var i = headerAt + 1; i < rows.length; i++) {
        var r = rows[i];
        if (!r.some(function (f) { return f.trim() !== ""; })) continue; // blank line
        var line = "Row " + (i + 1);
        var get = function (name) { return col[name] < 0 ? "" : String(r[col[name]] || "").trim(); };

        var species = TF.findSpecies(get("speciesId"));
        if (!species) { problems.push(line + ": unknown species \"" + get("speciesId") + "\"."); continue; }
        line += " (" + species.speciesName + ")";

        var nums = {}, bad = [];
        [["ivAtk", 0, 15], ["ivDef", 0, 15], ["ivHp", 0, 15], ["cp", 10, 10000]].forEach(function (s) {
          var v = get(s[0]);
          if (!/^\d+$/.test(v) || Number(v) < s[1] || Number(v) > s[2]) bad.push(s[0] + " \"" + v + "\" (should be a whole number from " + s[1] + " to " + s[2] + ")");
          else nums[s[0]] = Number(v);
        });
        if (bad.length) { problems.push(line + ": " + bad.join("; ") + "."); continue; }

        var rec = recByid[species.speciesId] ||
          [(species.fastMoves || [])[0], (species.chargedMoves || [])[0], (species.chargedMoves || [])[1] || "none"];
        var moves = [], moveProblems = [];
        ["fastMove", "chargedMove1", "chargedMove2"].forEach(function (name, slot) {
          var v = get(name);
          if (v === "") { moves.push(rec[slot] || "none"); return; }
          if (slot === 2 && v.toLowerCase() === "none") { moves.push("none"); return; }
          var id = TF.findMove(v);
          if (!id) moveProblems.push(name + " \"" + v + "\" isn't a known move ID or name (a name two moves share needs the ID)");
          moves.push(id);
        });
        if (moveProblems.length) { problems.push(line + ": " + moveProblems.join("; ") + "."); continue; }

        list.push({
          speciesId: species.speciesId,
          ivs: { atk: nums.ivAtk, def: nums.ivDef, hp: nums.ivHp },
          cp: nums.cp,
          fastMove: moves[0],
          chargedMoves: [moves[1], moves[2]]
        });
        labels.push(line);
      }

      if (!list.length) {
        setStatus("No contenders could be read from " + fileName + ".", true);
        showProblems(problems);
        return;
      }
      setStatus("Checking " + list.length + " contenders from " + fileName + "…");
      return evaluate(list).then(function (results) { addChecked(list, results, labels, problems); });
    });
  }

  section.querySelector("[data-load-csv]").addEventListener("click", function () { if (!busy) fileInput.click(); });
  fileInput.addEventListener("change", function () {
    var file = fileInput.files[0];
    fileInput.value = ""; // so choosing the same file again still loads it
    if (!file) return;
    run(file.text().then(function (text) { return importCSV(text, file.name); }));
  });

  // ---- CSV out (UTF-8 with a byte order mark, so Excel reads the é in Pokémon correctly) ----
  function csvField(v) {
    var s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  section.querySelector("[data-export]").addEventListener("click", function () {
    if (!entries.length) { setStatus("There are no contenders to export.", true); return; }
    var head = INPUT_COLUMNS.concat(["speciesName", "moveset", "level", "ivRank", "ivRankOf", "bulk", "safety", "consistency", "cupRank", "wins", "winsOf", "problem"]);
    var lines = [head.join(",")];
    var fought = cupBattles();
    entries.forEach(function (e) {
      var r = info[key(e)] || {};
      var ok = r.ok;
      var b = fought.byKey[key(e)];
      lines.push([
        e.speciesId, e.ivs.atk, e.ivs.def, e.ivs.hp, e.cp, e.fastMove, e.chargedMoves[0], e.chargedMoves[1] || "none",
        speciesLabel(e.speciesId),
        ok ? r.moveset : "", ok ? r.level : "", ok ? r.ivRank : "", ok ? r.ivCount : "",
        ok ? r.bulk : "", ok ? r.safety : "", ok ? r.consistency : "", ok ? (r.rank || "") : "",
        b ? b.wins : "", b ? fought.threats : "",
        r.ok === false ? r.error : ""
      ].map(csvField).join(","));
    });
    var blob = new Blob(["﻿" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    var a = el("a", { href: URL.createObjectURL(blob), download: "contenders-" + cup.cup + "-" + cup.cp + ".csv" });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    setStatus("Exported " + entries.length + " contenders.");
  });

  // ---- Remove all ----
  section.querySelector("[data-clear]").addEventListener("click", function () {
    if (busy || !entries.length) return;
    if (!window.confirm("Remove all " + entries.length + " contenders for " + cup.label + "? Export a CSV first if you want a copy.")) return;
    entries = [];
    save();
    render();
    showProblems([]);
    setStatus("Removed all contenders for " + cup.label + ".");
  });

  // ---- Start ----
  setBusy(true);
  TF.ready.then(function () {
    setBusy(false);
    document.addEventListener("tf:cup", switchCup);
    switchCup();
  }).catch(function () { /* common.js shows the error */ });
})();
