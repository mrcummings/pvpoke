// worker.js: the Team Finder's background thread (a Web Worker). It runs upstream PvPoke's
// battle engine (published at /src/js/ by _plugins/upstream_files.rb) without upstream's page,
// so the Team Finder page stays usable while battles run.
//
// Every message carries the job's id (common.js matches answers to jobs). Jobs run one at a time.
// Messages in:   { id, type: "grade", cup, cp, meta, team: [contender, contender, contender] }
//                { id, type: "evaluate", cup, cp, contenders: [contender, ...] }   (no battles)
//   contender:   { speciesId, ivs: {atk, def, hp}, cp, fastMove, chargedMoves: [id, id or "none"] }
//                Without ivs and cp, the species gets upstream's default IVs and level for the league.
// Messages out:  { id, type: "progress", text }   { id, type: "result", ... }   { id, type: "error", message }
//
// How a team is graded (matching upstream's Team Builder, src/js/interface/TeamInterface.js,
// updateTeamResults, with its default options):
//   1. Each team member battles every threat on its own (TeamRanker, "team-counters"). The
//      team's result against a threat is rebuilt from the three: rating = floor(sum / 3),
//      score = sum / 3. This gives exactly upstream's numbers (checked 2026-11-18 for all
//      410 Master League threats) and is how the full search will grade many teams quickly.
//   2. Threats are sorted by score; the top 6 that aren't too similar to each other form the
//      "counter team"; threat score = round(sum of their ratings / 6).
//   3. Grades: Coverage (1200 - threat score, goal 680), Bulk (average Defense x HP, goal by
//      league), Safety (average of each species' switches score in the rankings, goal 98),
//      Consistency (average of upstream's moveset formula, goal 98).

"use strict";

var params = new URLSearchParams(self.location.search);

// ---- The page globals upstream's engine expects (normally set by src/header.php) ----
self.window = self;
var webRoot = "/src/";
var host = self.location.origin + webRoot; // contains "localhost" => upstream loads gamemaster.json
var siteVersion = params.get("v") || "1";
var settings = {
  gamemaster: "gamemaster",
  colorblindMode: false,
  matrixDirection: "row",
  hardMovesetLinks: false,
  xls: 1,
  ads: 0
};
var get = false;

// ---- A stand-in for the few jQuery features the engine uses ----
// $(...) does nothing (there's no page in a worker); $.ajax, $.getJSON and $.each work.
var chain = new Proxy(function () {}, {
  get: function (t, k) { return k === "length" ? 0 : chain; },
  apply: function () { return chain; }
});
var $ = function () { return chain; };
var jQuery = $;
$.ajax = function (o) {
  fetch(o.url).then(function (r) {
    if (!r.ok) throw new Error(r.status + " " + o.url);
    return r.json();
  }).then(function (data) { o.success(data); })
    .catch(function (e) {
      if (o.error) o.error(e, String(e));
      // End the current job: otherwise it would wait forever for this file
      if (currentReject) currentReject(new Error("Couldn't load " + o.url + ": " + e.message));
    });
};
$.getJSON = function (url, cb) {
  $.ajax({ url: url, success: cb });
  return { fail: function () { return this; }, done: function () { return this; }, always: function () { return this; } };
};
$.each = function (obj, fn) {
  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) if (fn.call(obj[i], i, obj[i]) === false) break;
  } else {
    for (var k in obj) if (fn.call(obj[k], k, obj[k]) === false) break;
  }
  return obj;
};

// Upstream's interface object: GameMaster calls init() once the game master has loaded.
var gmReady;
var gmLoaded = new Promise(function (resolve) { gmReady = resolve; });
var InterfaceMaster = {
  getInstance: function () { return { init: function () { gmReady(); }, displayRankingData: function () {} }; },
  getInterface: function () { return {}; }
};

importScripts(
  "/src/js/GameMaster.js?v=" + siteVersion,
  "/src/js/pokemon/Pokemon.js?v=" + siteVersion,
  "/src/js/battle/DamageCalculator.js?v=" + siteVersion,
  "/src/js/battle/actions/ActionLogic.js?v=" + siteVersion,
  "/src/js/battle/timeline/TimelineEvent.js?v=" + siteVersion,
  "/src/js/battle/timeline/TimelineAction.js?v=" + siteVersion,
  "/src/js/training/DecisionOption.js?v=" + siteVersion,
  "/src/js/battle/Battle.js?v=" + siteVersion,
  "/src/js/battle/rankers/TeamRanker.js?v=" + siteVersion,
  "/src/js/interface/PokeMultiSelect.js?v=" + siteVersion
);

var gm = GameMaster.getInstance();

var currentId = 0;        // the job being worked on
var currentReject = null; // ends it with an error
function fail(message) { self.postMessage({ id: currentId, type: "error", message: message }); }
function progress(text) { self.postMessage({ id: currentId, type: "progress", text: text }); }
function reply(result) { result.id = currentId; result.type = "result"; self.postMessage(result); }

function loadRankings(cup, cp) {
  return new Promise(function (resolve) {
    gm.loadRankingData({ displayRankingData: resolve }, "overall", cp, cup);
  });
}
function loadGroup(meta) {
  return new Promise(function (resolve) {
    if (!meta) { resolve([]); return; }
    gm.loadGroupData({ displayRankingData: resolve }, meta);
  });
}

// ---- Upstream's grading helpers (TeamInterface.js), unchanged ----
function letterGrade(value, goal) {
  var scale = [["A", 0.9], ["B", 0.8], ["C", 0.7], ["D", 0.6]];
  var pct = value / goal;
  var letter = "F";
  for (var i = scale.length - 1; i >= 0; i--) if (pct >= scale[i][1]) letter = scale[i][0];
  return letter;
}
function bulkGoal(cp, cupName) {
  var league = [22000, 35000, 35000, 10000];
  if (cp == 2500) return cupName == "premier" ? 33000 : league[1];
  if (cp == 10000) return league[2];
  if (cp == 500) return league[3];
  return league[0];
}

// ---- Level from CP ----
// Every level from 1 to 51 in half steps whose CP, with these IVs, equals the given CP.
// (Level 51 is a best-buddy level 50.) Upstream's CP formula is Pokemon.calculateCP.
function levelsForCP(pokemon, ivs, cp) {
  var out = [];
  for (var level = 1; level <= 51; level += 0.5) {
    if (pokemon.calculateCP(pokemon.getCPMByLevel(level), ivs.atk, ivs.def, ivs.hp) === cp) out.push(level);
  }
  return out;
}

// Builds one team member the way upstream does when it opens a share link
// (PokeMultiSelect.quickFillURLParam): initialize, set IVs, set level, select moves.
// Without ivs and cp: upstream's default IVs and level for the league (as initialize sets them).
function buildMember(battle, m, leagueCP) {
  var p = new Pokemon(m.speciesId, 1, battle);
  if (!p.speciesId) throw new Error("Unknown species: " + m.speciesId);
  p.initialize(leagueCP);

  var level, levels;
  var useDefaults = !m.ivs || m.cp === undefined || m.cp === null;
  var label = useDefaults ? p.speciesName :
    p.speciesName + " (CP " + m.cp + ", IVs " + m.ivs.atk + "/" + m.ivs.def + "/" + m.ivs.hp + ")";

  if (useDefaults) {
    level = p.level;
    levels = [level];
  } else {
    if (m.cp > leagueCP) throw new Error(label + ": CP is above this league's " + leagueCP + " cap.");
    levels = levelsForCP(p, m.ivs, m.cp);
    if (levels.length === 0) {
      throw new Error(label + ": no level from 1 to 51 gives exactly this CP with these IVs. Check the CP and IVs.");
    }
    level = levels[levels.length - 1]; // several only happens at very low CP; take the highest

    p.setIV("atk", m.ivs.atk);
    p.setIV("def", m.ivs.def);
    p.setIV("hp", m.ivs.hp);
    p.setLevel(level);
  }

  // Moves must be the species' own: upstream would otherwise quietly add an unknown move,
  // and quietly swap a charged move chosen twice.
  function check(pool, id, what) {
    if (!pool.some(function (mv) { return mv.moveId === id; })) {
      throw new Error(label + ": " + id + " isn't one of its " + what + " moves.");
    }
  }
  var c2 = m.chargedMoves[1] || "none";
  check(p.fastMovePool, m.fastMove, "fast");
  check(p.chargedMovePool, m.chargedMoves[0], "charged");
  if (c2 !== "none") check(p.chargedMovePool, c2, "charged");
  if (c2 === m.chargedMoves[0]) throw new Error(label + ": both charged moves are " + c2 + ".");

  p.selectMove("fast", m.fastMove, 0);
  p.selectMove("charged", m.chargedMoves[0], 0);
  p.selectMove("charged", c2, 1);

  if (!useDefaults && p.cp !== m.cp) throw new Error(label + ": calculated CP " + p.cp + " at level " + level + " doesn't match.");
  if (p.cp > leagueCP) throw new Error(label + ": CP " + p.cp + " is above this league's " + leagueCP + " cap.");
  return { pokemon: p, level: level, otherLevels: levels.slice(0, -1) };
}

async function grade(msg) {
  await gmLoaded;
  var cp = Number(msg.cp);
  var cupName = msg.cup;

  progress("Loading rankings and meta group…");
  await loadRankings(cupName, cp);
  var metaGroup = await loadGroup(msg.meta);

  var battle = new Battle();
  battle.setCP(cp);
  battle.setCup(cupName);

  var built = msg.team.map(function (m) { return buildMember(battle, m, cp); });
  var team = built.map(function (b) { return b.pokemon; });

  // Upstream's default Team Builder options
  var allowShadows = true;           // "Show Shadow Pokemon in results": on
  var prioritizeMetaThreats = true;  // "Prioritize meta threats": on
  var baitShields = 1;               // "Shield Baiting": on
  var shieldCount = 1;               // "Shields": Average (0 & 1) => shieldMode "average"
  if (cupName == "shadow") allowShadows = true;

  var teamSettings = getDefaultMultiBattleSettings();
  var opponentSettings = getDefaultMultiBattleSettings();
  teamSettings.shields = opponentSettings.shields = shieldCount;
  teamSettings.bait = opponentSettings.bait = baitShields;

  var ranker = RankerMaster.getInstance();
  ranker.setShieldMode("average");
  ranker.applySettings(teamSettings, 0);
  ranker.applySettings(opponentSettings, 1);
  ranker.setMetaGroup(metaGroup);
  ranker.setPrioritizeMeta(prioritizeMetaThreats);
  ranker.setRecommendMoveUsage(true);
  ranker.setTargets([]);

  // 1. Each member against every threat, on its own
  var singles = [];
  var t0 = Date.now();
  for (var i = 0; i < team.length; i++) {
    progress("Simulating " + team[i].speciesName + " (" + (i + 1) + " of " + team.length + ")…");
    var data = ranker.rank([team[i]], cp, battle.getCup(), [], "team-counters");
    var byId = {};
    data.rankings.forEach(function (r) { byId[r.speciesId] = r; });
    singles.push({ rankings: data.rankings, byId: byId });
  }
  var battleCount = singles[0].rankings.length * team.length * 2;
  var ms = Date.now() - t0;

  // Rebuild the team's result per threat, in upstream's original threat order
  var combined = singles[0].rankings.slice().sort(function (a, b) { return a.index - b.index; }).map(function (r0) {
    var sumRating = 0, sumScore = 0, ratings = [];
    for (var n = 0; n < singles.length; n++) {
      var m = singles[n].byId[r0.speciesId].matchups[0];
      sumRating += m.rating;
      sumScore += m.score;
      ratings.push(m.rating);
    }
    return {
      pokemon: r0.pokemon, speciesId: r0.speciesId, speciesName: r0.speciesName,
      rating: Math.floor(sumRating / team.length), score: sumScore / team.length, ratings: ratings
    };
  });
  combined.sort(function (a, b) { return a.score > b.score ? -1 : (b.score > a.score ? 1 : 0); });

  // 2. Counter team and threat score (TeamInterface.js, "Potential threats")
  var counterTeam = [];
  var threats = [];
  var sum = 0;
  for (var k = 0; k < combined.length && counterTeam.length < 6; k++) {
    var r = combined[k];
    if (r.speciesId.indexOf("_shadow") > -1 && !allowShadows) continue;
    if (r.speciesId.indexOf("_xs") > -1) continue;
    if (r.pokemon.hasTag("teambuilderexclude")) continue;
    var similar = counterTeam.some(function (c) {
      var s = c.calculateSimilarity(r.pokemon, r.pokemon && r.pokemon.traits, false);
      return s == -1 || s >= 1000;
    });
    if (!similar) {
      counterTeam.push(r.pokemon);
      threats.push({ name: r.speciesName, moveset: r.pokemon.generateMovesetStr(), rating: r.rating, ratings: r.ratings });
      sum += r.rating;
    }
  }
  var threatScore = Math.round(sum / 6);

  // 3. Grades
  var bulkValues = team.map(function (p) { p.fullReset(); return p.getEffectiveStat(1) * p.stats.hp; });
  var avgBulk = bulkValues.reduce(function (a, b) { return a + b; }, 0) / team.length;

  var overall = gm.rankings[cupName + "overall" + cp] || [];
  var safetyValues = team.map(function (p) {
    for (var n = 0; n < overall.length; n++) if (overall[n].speciesId == p.speciesId) return overall[n].scores[2];
    return 60;
  });
  var avgSafety = safetyValues.reduce(function (a, b) { return a + b; }, 0) / team.length;

  var consistencyValues = team.map(function (p) { return p.calculateConsistency(); });
  var avgConsistency = consistencyValues.reduce(function (a, b) { return a + b; }, 0) / team.length;

  var bGoal = bulkGoal(cp, cupName);
  var grades = {
    coverage:    { letter: letterGrade(1200 - threatScore, 680), value: threatScore, label: "threat score", goal: "A at 588 or lower" },
    bulk:        { letter: letterGrade(avgBulk, bGoal), value: Math.round(avgBulk), label: "average Defense × HP", goal: "goal " + bGoal },
    safety:      { letter: letterGrade(avgSafety, 98), value: Math.round(avgSafety * 10) / 10, label: "average switches score", goal: "goal 98" },
    consistency: { letter: letterGrade(avgConsistency, 98), value: Math.round(avgConsistency * 10) / 10, label: "average consistency", goal: "goal 98" }
  };

  // Link to the same team on pvpoke.com's Team Builder (the format of upstream's share links)
  var link = "https://pvpoke.com/team-builder/" + cupName + "/" + battle.getCP(true) + "/" +
    encodeURIComponent(team.map(function (p) { return p.generateURLPokeStr("team-builder"); }).join(","));

  reply({
    members: built.map(function (b, i) {
      var p = b.pokemon;
      return {
        name: p.speciesName, moveset: p.generateMovesetStr(), cp: p.cp, level: b.level, otherLevels: b.otherLevels,
        ivs: p.ivs, bulk: Math.round(bulkValues[i]), safety: safetyValues[i], consistency: consistencyValues[i]
      };
    }),
    grades: grades,
    threats: threats,
    link: link,
    battles: battleCount,
    ms: ms
  });
}

// ---- Contenders: each one's own values, no battles ----
// For each contender: its CP, level, IVs, IV Rank (upstream's getIVRank("overall"): rank by
// stat product among every IV combination at its best level under the cap), Bulk (Defense x HP),
// Safety (its species' switches score in this cup, 60 if unranked), Consistency, and its
// position in this cup's overall rankings. A contender that can't be built gets { ok: false, error }.
async function evaluate(msg) {
  await gmLoaded;
  var cp = Number(msg.cp);
  var cupName = msg.cup;

  progress("Loading rankings…");
  await loadRankings(cupName, cp);
  var overall = gm.rankings[cupName + "overall" + cp] || [];
  var position = {};
  overall.forEach(function (r, i) { if (!(r.speciesId in position)) position[r.speciesId] = i; });

  var battle = new Battle();
  battle.setCP(cp);
  battle.setCup(cupName);

  var t0 = Date.now();
  var out = [];
  for (var i = 0; i < msg.contenders.length; i++) {
    if (i % 10 === 0) progress("Working out contender " + (i + 1) + " of " + msg.contenders.length + "…");
    try {
      var b = buildMember(battle, msg.contenders[i], cp);
      var p = b.pokemon;
      var ivRank = p.getIVRank("overall");
      p.fullReset();
      var pos = position[p.speciesId];
      out.push({
        ok: true,
        speciesId: p.speciesId, speciesName: p.speciesName,
        cp: p.cp, level: b.level, otherLevels: b.otherLevels,
        ivs: { atk: p.ivs.atk, def: p.ivs.def, hp: p.ivs.hp },
        fastMove: p.fastMove.moveId,
        chargedMoves: p.chargedMoves.filter(Boolean).map(function (mv) { return mv.moveId; }),
        moveset: p.generateMovesetStr(),
        ivRank: ivRank.rank, ivCount: ivRank.count,
        bulk: Math.round(p.getEffectiveStat(1) * p.stats.hp),
        safety: pos === undefined ? 60 : overall[pos].scores[2],
        consistency: p.calculateConsistency(),
        rank: pos === undefined ? null : pos + 1
      });
    } catch (err) {
      out.push({ ok: false, error: err.message || String(err) });
    }
  }

  reply({ contenders: out, bulkGoal: bulkGoal(cp, cupName), ms: Date.now() - t0 });
}

// ---- Jobs, one at a time in the order they arrive ----
var jobs = { grade: grade, evaluate: evaluate };
var queue = Promise.resolve();

self.onmessage = function (e) {
  var msg = e.data || {};
  queue = queue.then(function () {
    return new Promise(function (resolve, reject) {
      currentId = msg.id;
      currentReject = reject;
      if (!jobs[msg.type]) throw new Error("Unknown job: " + msg.type);
      jobs[msg.type](msg).then(resolve, reject);
    }).catch(function (err) { fail(err.message || String(err)); })
      .then(function () { currentReject = null; });
  });
};
