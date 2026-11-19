// common.js: what the Team Finder's two parts share (pool.js: the contenders; page.js: grade one
// team). It loads first and sets up window.TF:
//
//   TF.ready            a Promise, resolved once the game master is loaded and the cup list filled
//   TF.gm, TF.speciesById, TF.speciesByName, TF.moveName     game master lookups
//   TF.findSpecies(text), TF.findMove(text)                    by ID or name, not case-sensitive
//   TF.currentCup()     { cup, cp, meta, key: "all/1500", label }
//   TF.loadRankings(cup, cp)   Promise of that cup's overall rankings (cached)
//   TF.fillMoves(fieldset, species, wanted)   fills a fieldset's three move lists
//   TF.request(message, onProgress)   sends a job to worker.js; Promise of its result.
//                       One worker is shared; it does one job at a time, in order.
//                       onProgress(text, message): message has done and total when known.
//   TF.cancel(promise)  asks the worker to stop that job
//   TF.el(tag, attrs, children)       makes an element
//
// The chosen cup is remembered in this browser. Changing it fires "tf:cup" on document.

(function () {
  "use strict";

  var root = document.querySelector("[data-team-finder]");
  if (!root) return;

  var version = root.getAttribute("data-version") || "1";
  var cupSelect = document.getElementById("tf-cup");
  var statusEl = root.querySelector("[data-status]");
  var datalist = document.getElementById("tf-species");
  var CUP_STORE = "team-finder-cup";

  var TF = window.TF = {
    version: version,
    gm: null,
    speciesById: {},
    speciesByName: {},
    moveName: {}
  };

  var lowerSpecies = {};
  var lowerMove = {};
  var rankingsCache = {};

  var available = {};
  try {
    JSON.parse(root.getAttribute("data-available")).forEach(function (o) { available[o.cup + "/" + o.cp] = true; });
  } catch (e) { available = null; /* no list: every cup is offered */ }

  TF.el = function (tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (attrs[k] === undefined || attrs[k] === null) return;
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return e;
  };
  var el = TF.el;

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle("error", !!isError);
  }

  TF.findSpecies = function (text) {
    var t = String(text || "").trim();
    return TF.speciesById[t] || TF.speciesByName[t] || lowerSpecies[t.toLowerCase()] || null;
  };
  // Moves ignore case, spaces, underscores and hyphens: "LOCK_ON", "Lock On" and "lock-on" all
  // match. "+" still counts ("Brave Bird+" is BRAVE_BIRD_PLUS). A name two moves share (the two
  // Aura Wheels) matches neither; use the ID.
  function moveKey(text) { return String(text || "").toLowerCase().replace(/[\s_\-]+/g, ""); }
  TF.findMove = function (text) {
    var id = lowerMove[moveKey(text)];
    return id && id !== "?" ? id : null; // a moveId, or null
  };

  // ---- Cups: upstream Team Builder's list (src/modules/formatselect.php + formats with showFormat) ----
  function fillCups() {
    var top = [
      { cup: "all", cp: 1500, label: "Great League", meta: "great" },
      { cup: "all", cp: 2500, label: "Ultra League", meta: "ultra" },
      { cup: "all", cp: 10000, label: "Master League", meta: "master" }
    ];
    var rest = TF.gm.formats
      .filter(function (f) { return f.showFormat && f.cup !== "custom"; })
      .map(function (f) { return { cup: f.cup, cp: f.cp, label: f.title, meta: f.meta }; })
      .sort(function (a, b) { return a.label.localeCompare(b.label); });
    function ok(o) { return !available || available[o.cup + "/" + o.cp]; }
    function add(o) {
      var opt = el("option", { value: o.cup + "/" + o.cp, text: o.label });
      opt.setAttribute("data-meta", o.meta || "");
      cupSelect.appendChild(opt);
    }
    top.filter(ok).forEach(add);
    var sep = el("option", { text: "──────────" });
    sep.disabled = true;
    cupSelect.appendChild(sep);
    rest.filter(ok).forEach(add);

    var saved = null;
    try { saved = localStorage.getItem(CUP_STORE); } catch (e) { saved = null; }
    if (saved && cupSelect.querySelector('option[value="' + saved + '"]')) cupSelect.value = saved;
  }

  TF.currentCup = function () {
    var opt = cupSelect.options[cupSelect.selectedIndex];
    var parts = cupSelect.value.split("/");
    return {
      cup: parts[0], cp: Number(parts[1]), key: cupSelect.value,
      meta: opt ? opt.getAttribute("data-meta") : "", label: opt ? opt.textContent : ""
    };
  };

  cupSelect.addEventListener("change", function () {
    try { localStorage.setItem(CUP_STORE, cupSelect.value); } catch (e) { /* storage blocked */ }
    document.dispatchEvent(new CustomEvent("tf:cup", { detail: TF.currentCup() }));
  });

  TF.loadRankings = function (cup, cp) {
    var key = cup + "/" + cp;
    if (!rankingsCache[key]) {
      // Some cups share another cup's rankings (upstream's rankingAlias, as GameMaster.js does)
      var data = (TF.gm.cups || []).find(function (c) { return c.name === cup; });
      var folder = (data && data.rankingAlias) || cup;
      rankingsCache[key] = fetch("/src/data/rankings/" + folder + "/overall/rankings-" + cp + ".json?v=" + version)
        .then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; });
    }
    return rankingsCache[key];
  };

  // ---- A fieldset's three move lists (fast, charged1, charged2) ----
  // wanted: [fast, charged1, charged2] to select; missing ones get the species' first moves.
  // A charged2 list with data-allow-none also offers "(none)".
  TF.fillMoves = function (fs, species, wanted) {
    var selects = {
      fast: fs.querySelector('[data-move="fast"]'),
      charged1: fs.querySelector('[data-move="charged1"]'),
      charged2: fs.querySelector('[data-move="charged2"]')
    };
    var elite = species.eliteMoves || [];
    function options(select, ids) {
      select.innerHTML = "";
      if (select.hasAttribute("data-allow-none")) select.appendChild(el("option", { value: "none", text: "(none)" }));
      ids.forEach(function (id) {
        var label = (TF.moveName[id] || id) + (elite.indexOf(id) > -1 ? " (elite)" : "");
        select.appendChild(el("option", { value: id, text: label }));
      });
    }
    var fast = species.fastMoves || [];
    var charged = species.chargedMoves || [];
    options(selects.fast, fast);
    options(selects.charged1, charged);
    options(selects.charged2, charged);
    selects.fast.value = (wanted && wanted[0]) || fast[0] || "";
    selects.charged1.value = (wanted && wanted[1]) || charged[0] || "";
    selects.charged2.value = (wanted && wanted[2]) || charged[1] || charged[0] || "";
  };

  // ---- The background worker: one, shared; jobs answered by id ----
  var worker = null;
  var nextId = 1;
  var pending = {};

  function failAll(message) {
    Object.keys(pending).forEach(function (id) { pending[id].reject(new Error(message)); });
    pending = {};
    worker = null;
  }

  TF.request = function (message, onProgress) {
    if (!worker) {
      worker = new Worker("/assets/js/team-finder/worker.js?v=" + version);
      worker.onmessage = function (e) {
        var m = e.data;
        var job = pending[m.id];
        if (!job) return;
        if (m.type === "progress") { if (job.onProgress) job.onProgress(m.text, m); return; }
        delete pending[m.id];
        if (m.type === "error") job.reject(new Error(m.message));
        else job.resolve(m);
      };
      worker.onerror = function (e) {
        failAll("The battle engine stopped with an error: " + (e.message || "unknown"));
      };
    }
    var id = nextId++;
    var promise = new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject, onProgress: onProgress };
      message.id = id;
      worker.postMessage(message);
    });
    promise.jobId = id;
    return promise;
  };

  // Asks the worker to stop a job (a "battles" job stops between contenders).
  TF.cancel = function (promise) {
    if (worker && promise && promise.jobId) worker.postMessage({ type: "cancel", target: promise.jobId });
  };

  // ---- Start ----
  setStatus("Loading the game master…");
  TF.ready = fetch("/src/data/gamemaster.min.json?v=" + version)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      TF.gm = data;
      data.moves.forEach(function (m) {
        TF.moveName[m.moveId] = m.name;
      });
      // IDs first, so a name can never hide another move's ID
      data.moves.forEach(function (m) { lowerMove[moveKey(m.moveId)] = m.moveId; });
      var isId = {};
      Object.keys(lowerMove).forEach(function (k) { isId[k] = true; });
      data.moves.forEach(function (m) {
        if (!m.name) return;
        var k = moveKey(m.name);
        if (isId[k]) return;                                              // an ID wins
        lowerMove[k] = lowerMove[k] && lowerMove[k] !== m.moveId ? "?" : m.moveId; // "?" = ambiguous
      });
      data.pokemon.filter(function (p) { return p.released; }).forEach(function (p) {
        TF.speciesByName[p.speciesName] = p;
        TF.speciesById[p.speciesId] = p;
        lowerSpecies[p.speciesId.toLowerCase()] = p;
        if (!lowerSpecies[p.speciesName.toLowerCase()]) lowerSpecies[p.speciesName.toLowerCase()] = p;
        datalist.appendChild(el("option", { value: p.speciesName }));
      });
      fillCups();
      setStatus("");
      return TF;
    })
    .catch(function (err) {
      setStatus("Couldn't load the game master (" + err.message + ").", true);
      throw err;
    });
})();
