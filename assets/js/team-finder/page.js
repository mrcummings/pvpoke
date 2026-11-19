// page.js: the Team Finder's "Grade one team" section (step 1: grade one team and compare with
// pvpoke.com). Uses common.js (window.TF) for the game master, the cup and the worker.
//
// - A species' moves default to its recommended moveset in the chosen cup's rankings.
// - "Grade team" sends the team to worker.js, which runs upstream's engine in the background.
// - The form is remembered in this browser (localStorage) so it's still filled in next time.

(function () {
  "use strict";

  var form = document.querySelector("[data-team-form]");
  if (!form || !window.TF) return;
  var TF = window.TF;
  var el = TF.el;

  var statusEl = form.querySelector("[data-grade-status]");
  var results = document.querySelector("[data-results]");
  var members = Array.prototype.slice.call(form.querySelectorAll("[data-member]"));
  var STORE = "team-finder-step1";
  var running = false;

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle("error", !!isError);
  }

  // When a species is chosen: its moves, defaulting to the recommended moveset in this cup
  function speciesChosen(fs, keepMoves) {
    var input = fs.querySelector("[data-species]");
    var species = TF.speciesByName[input.value.trim()];
    input.setCustomValidity(species || !input.value ? "" : "Choose a Pokémon from the list.");
    if (!species || fs.getAttribute("data-species-id") === species.speciesId) return Promise.resolve();
    fs.setAttribute("data-species-id", species.speciesId);
    if (keepMoves) { TF.fillMoves(fs, species, keepMoves); return Promise.resolve(); }
    var c = TF.currentCup();
    return TF.loadRankings(c.cup, c.cp).then(function (list) {
      var entry = list.find(function (r) { return r.speciesId === species.speciesId; });
      TF.fillMoves(fs, species, entry && entry.moveset);
    });
  }

  // ---- Remember the form in this browser ----
  function save() {
    var state = {
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

    results.appendChild(el("h3", { text: "Grades" }));
    results.appendChild(grades);
    results.appendChild(link);
    results.appendChild(el("h3", { text: "Team" }));
    results.appendChild(el("div", { class: "table-wrap" }, [mt]));
    results.appendChild(el("h3", { text: "Top threats" }));
    results.appendChild(el("p", { class: "source", text: "The six most threatening Pokémon that aren't too similar to each other; their average rating against your team is the threat score. Ratings: 500 is even, higher is better for the threat." }));
    results.appendChild(el("div", { class: "table-wrap" }, [tt]));
    results.appendChild(el("p", { class: "source", text: r.battles + " battles in " + (r.ms / 1000).toFixed(1) + " s." }));
    results.hidden = false;
  }

  // ---- Grading ----
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (running) return;
    var c = TF.currentCup();
    var team = members.map(function (fs) {
      var species = TF.speciesByName[fs.querySelector("[data-species]").value.trim()];
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
    TF.request({ type: "grade", cup: c.cup, cp: c.cp, meta: c.meta, team: team }, setStatus)
      .then(function (r) { setStatus("Done."); render(r); })
      .catch(function (err) { setStatus(err.message, true); })
      .then(function () { running = false; });
  });

  form.addEventListener("change", save);
  members.forEach(function (fs) {
    var input = fs.querySelector("[data-species]");
    input.addEventListener("change", function () { speciesChosen(fs); });
    input.addEventListener("input", function () { if (TF.speciesByName[input.value.trim()]) speciesChosen(fs); });
  });

  // ---- Start ----
  TF.ready.then(function () {
    restore();
    form.querySelector("[data-grade]").disabled = false;
  }).catch(function () { /* common.js shows the error */ });
})();
