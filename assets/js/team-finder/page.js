// page.js: the Team Finder page (step 1: grade one team and compare with pvpoke.com).
//
// - Fills the cup list (upstream Team Builder's formats that have rankings here), the species
//   suggestions and each Pokémon's move lists from the game master.
// - A species' moves default to its recommended moveset in the chosen cup's rankings.
// - "Grade team" sends the team to worker.js, which runs upstream's engine in the background.
// - The form is remembered in this browser (localStorage) so it's still filled in next time.

(function () {
  "use strict";

  var form = document.querySelector("[data-team-form]");
  if (!form) return;

  var version = form.getAttribute("data-version") || "1";
  var statusEl = form.querySelector("[data-status]");
  var results = document.querySelector("[data-results]");
  var cupSelect = form.querySelector("#tf-cup");
  var datalist = form.querySelector("#tf-species");
  var members = Array.prototype.slice.call(form.querySelectorAll("[data-member]"));
  var STORE = "team-finder-step1";

  var gm = null;
  var speciesByName = {};
  var speciesById = {};
  var moveName = {};
  var rankingsCache = {};
  var worker = null;
  var running = false;

  var available = {};
  try {
    JSON.parse(form.getAttribute("data-available")).forEach(function (o) { available[o.cup + "/" + o.cp] = true; });
  } catch (e) { /* no list: every cup is offered */ available = null; }

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle("error", !!isError);
  }

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }

  // ---- Cups: upstream Team Builder's list (src/modules/formatselect.php + formats with showFormat) ----
  function fillCups() {
    var top = [
      { cup: "all", cp: 1500, label: "Great League", meta: "great" },
      { cup: "all", cp: 2500, label: "Ultra League", meta: "ultra" },
      { cup: "all", cp: 10000, label: "Master League", meta: "master" }
    ];
    var rest = gm.formats
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
  }

  function currentCup() {
    var opt = cupSelect.options[cupSelect.selectedIndex];
    var parts = cupSelect.value.split("/");
    return { cup: parts[0], cp: Number(parts[1]), meta: opt ? opt.getAttribute("data-meta") : "" };
  }

  function loadRankings(cup, cp) {
    var key = cup + "/" + cp;
    if (!rankingsCache[key]) {
      rankingsCache[key] = fetch("/src/data/rankings/" + cup + "/overall/rankings-" + cp + ".json?v=" + version)
        .then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; });
    }
    return rankingsCache[key];
  }

  // ---- Moves for one member ----
  function fillMoves(fs, species, wanted) {
    var selects = {
      fast: fs.querySelector('[data-move="fast"]'),
      charged1: fs.querySelector('[data-move="charged1"]'),
      charged2: fs.querySelector('[data-move="charged2"]')
    };
    var elite = species.eliteMoves || [];
    function options(select, ids) {
      select.innerHTML = "";
      ids.forEach(function (id) {
        var label = (moveName[id] || id) + (elite.indexOf(id) > -1 ? " (elite)" : "");
        select.appendChild(el("option", { value: id, text: label }));
      });
    }
    options(selects.fast, species.fastMoves || []);
    options(selects.charged1, species.chargedMoves || []);
    options(selects.charged2, species.chargedMoves || []);
    var charged = species.chargedMoves || [];
    selects.fast.value = (wanted && wanted[0]) || (species.fastMoves || [])[0] || "";
    selects.charged1.value = (wanted && wanted[1]) || charged[0] || "";
    selects.charged2.value = (wanted && wanted[2]) || charged[1] || charged[0] || "";
  }

  // When a species is chosen: its moves, defaulting to the recommended moveset in this cup
  function speciesChosen(fs, keepMoves) {
    var input = fs.querySelector("[data-species]");
    var species = speciesByName[input.value.trim()];
    input.setCustomValidity(species || !input.value ? "" : "Choose a Pokémon from the list.");
    if (!species || fs.getAttribute("data-species-id") === species.speciesId) return Promise.resolve();
    fs.setAttribute("data-species-id", species.speciesId);
    if (keepMoves) { fillMoves(fs, species, keepMoves); return Promise.resolve(); }
    var c = currentCup();
    return loadRankings(c.cup, c.cp).then(function (list) {
      var entry = list.find(function (r) { return r.speciesId === species.speciesId; });
      fillMoves(fs, species, entry && entry.moveset);
    });
  }

  // ---- Remember the form in this browser ----
  function save() {
    var state = {
      cup: cupSelect.value,
      members: members.map(function (fs) {
        return {
          species: fs.querySelector("[data-species]").value,
          cp: fs.querySelector("[data-cp]").value,
          atk: fs.querySelector('[data-iv="atk"]').value,
          def: fs.querySelector('[data-iv="def"]').value,
          hp: fs.querySelector('[data-iv="hp"]').value,
          moves: ["fast", "charged1", "charged2"].map(function (k) { return fs.querySelector('[data-move="' + k + '"]').value; })
        };
      })
    };
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* storage blocked */ }
  }

  function restore() {
    var state = null;
    try { state = JSON.parse(localStorage.getItem(STORE)); } catch (e) { state = null; }
    if (!state) return;
    if (state.cup && cupSelect.querySelector('option[value="' + state.cup + '"]')) cupSelect.value = state.cup;
    (state.members || []).forEach(function (m, i) {
      var fs = members[i];
      if (!fs || !m) return;
      fs.querySelector("[data-species]").value = m.species || "";
      fs.querySelector("[data-cp]").value = m.cp || "";
      fs.querySelector('[data-iv="atk"]').value = m.atk || "";
      fs.querySelector('[data-iv="def"]').value = m.def || "";
      fs.querySelector('[data-iv="hp"]').value = m.hp || "";
      speciesChosen(fs, m.moves);
    });
  }

  // ---- Results ----
  function render(r) {
    results.innerHTML = "";
    var gradeNames = { coverage: "Coverage", bulk: "Bulk", safety: "Safety", consistency: "Consistency" };
    var grades = el("div", { class: "grades" });
    Object.keys(gradeNames).forEach(function (k) {
      var g = r.grades[k];
      grades.appendChild(el("div", { class: "grade-card", "data-grade": g.letter }, [
        el("h3", { text: gradeNames[k] }),
        el("p", { class: "letter", text: g.letter }),
        el("p", { class: "value", text: g.label + ": " + g.value }),
        el("p", { class: "goal", text: g.goal })
      ]));
    });

    var link = el("p", { class: "check" }, [
      "Check: ",
      el("a", { href: r.link, target: "_blank", rel: "noopener", text: "open this team in pvpoke.com's Team Builder ↗" }),
      " and press Rate Team. Its four letters should match these."
    ]);

    var mt = el("table", { class: "data" });
    mt.appendChild(el("thead", null, [el("tr", null, ["Pokémon", "Moveset", "CP", "Level", "IVs", "Defense × HP", "Safety", "Consistency"]
      .map(function (h, i) { return el("th", { scope: "col", class: i >= 2 ? "num" : "", text: h }); }))]));
    var mb = el("tbody");
    r.members.forEach(function (m) {
      var level = String(m.level) + (m.otherLevels.length ? " (also fits " + m.otherLevels.join(", ") + ")" : "");
      mb.appendChild(el("tr", null, [
        el("th", { scope: "row", text: m.name }),
        el("td", { text: m.moveset }),
        el("td", { class: "num", text: String(m.cp) }),
        el("td", { class: "num", text: level }),
        el("td", { class: "num", text: m.ivs.atk + "/" + m.ivs.def + "/" + m.ivs.hp }),
        el("td", { class: "num", text: String(m.bulk) }),
        el("td", { class: "num", text: String(m.safety) }),
        el("td", { class: "num", text: String(m.consistency) })
      ]));
    });
    mt.appendChild(mb);

    var tt = el("table", { class: "data" });
    var head = ["Threat", "Moveset", "vs. team"].concat(r.members.map(function (m) { return "vs. " + m.name; }));
    tt.appendChild(el("thead", null, [el("tr", null, head.map(function (h, i) { return el("th", { scope: "col", class: i >= 2 ? "num" : "", text: h }); }))]));
    var tb = el("tbody");
    r.threats.forEach(function (t) {
      var row = el("tr", null, [el("th", { scope: "row", text: t.name }), el("td", { text: t.moveset }), el("td", { class: "num", text: String(t.rating) })]);
      t.ratings.forEach(function (x) { row.appendChild(el("td", { class: "num", text: String(x) })); });
      tb.appendChild(row);
    });
    tt.appendChild(tb);

    results.appendChild(el("h2", { text: "Grades" }));
    results.appendChild(grades);
    results.appendChild(link);
    results.appendChild(el("h2", { text: "Team" }));
    results.appendChild(el("div", { class: "table-wrap" }, [mt]));
    results.appendChild(el("h2", { text: "Top threats" }));
    results.appendChild(el("p", { class: "source", text: "The six most threatening Pokémon that aren't too similar to each other; their average rating against your team is the threat score. Ratings: 500 is even, higher is better for the threat." }));
    results.appendChild(el("div", { class: "table-wrap" }, [tt]));
    results.appendChild(el("p", { class: "source", text: r.battles + " battles in " + (r.ms / 1000).toFixed(1) + " s." }));
    results.hidden = false;
  }

  // ---- Grading ----
  function getWorker() {
    if (worker) return worker;
    worker = new Worker("/assets/js/team-finder/worker.js?v=" + version);
    worker.onmessage = function (e) {
      var m = e.data;
      if (m.type === "progress") setStatus(m.text);
      else if (m.type === "error") { running = false; setStatus(m.message, true); }
      else if (m.type === "result") { running = false; setStatus("Done."); render(m); }
    };
    worker.onerror = function (e) { running = false; setStatus("The battle engine stopped with an error: " + (e.message || "unknown"), true); };
    return worker;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (running) return;
    var c = currentCup();
    var team = members.map(function (fs) {
      var species = speciesByName[fs.querySelector("[data-species]").value.trim()];
      return {
        speciesId: species && species.speciesId,
        cp: Number(fs.querySelector("[data-cp]").value),
        ivs: {
          atk: Number(fs.querySelector('[data-iv="atk"]').value),
          def: Number(fs.querySelector('[data-iv="def"]').value),
          hp: Number(fs.querySelector('[data-iv="hp"]').value)
        },
        fastMove: fs.querySelector('[data-move="fast"]').value,
        chargedMoves: [fs.querySelector('[data-move="charged1"]').value, fs.querySelector('[data-move="charged2"]').value]
      };
    });
    if (team.some(function (m) { return !m.speciesId; })) { setStatus("Choose each Pokémon from the list.", true); return; }
    save();
    running = true;
    results.hidden = true;
    setStatus("Starting the battle engine…");
    getWorker().postMessage({ type: "grade", cup: c.cup, cp: c.cp, meta: c.meta, team: team });
  });

  form.addEventListener("change", save);
  members.forEach(function (fs) {
    var input = fs.querySelector("[data-species]");
    input.addEventListener("change", function () { speciesChosen(fs); });
    input.addEventListener("input", function () { if (speciesByName[input.value.trim()]) speciesChosen(fs); });
  });

  // ---- Start ----
  setStatus("Loading the game master…");
  fetch("/src/data/gamemaster.min.json?v=" + version)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      gm = data;
      gm.moves.forEach(function (m) { moveName[m.moveId] = m.name; });
      gm.pokemon.filter(function (p) { return p.released; }).forEach(function (p) {
        speciesByName[p.speciesName] = p;
        speciesById[p.speciesId] = p;
        datalist.appendChild(el("option", { value: p.speciesName }));
      });
      fillCups();
      restore();
      form.querySelector("[data-grade]").disabled = false;
      setStatus("");
    })
    .catch(function (err) { setStatus("Couldn't load the game master (" + err.message + ").", true); });
})();
