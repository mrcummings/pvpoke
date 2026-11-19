// worker.js: the Team Finder's background thread (a Web Worker). It runs upstream PvPoke's
// battle engine (published at /src/js/ by _plugins/upstream_files.rb) without upstream's page,
// so the Team Finder page stays usable while battles run.
//
// Every message carries the job's id (common.js matches answers to jobs). Jobs run one at a time.
// Messages in:   { id, type: "grade", cup, cp, meta, team: [contender, contender, contender] }
//                { id, type: "evaluate", cup, cp, contenders: [contender, ...] }   (no battles)
//                { id, type: "battles", cup, cp, meta, contenders: [contender, ...] }
//                { id, type: "upgrade", cup, cp, base: contender, change: {...} }   (see upgrade())
//                { type: "cancel", target: id }   (stops a "battles" job between contenders)
//   contender:   { speciesId, ivs: {atk, def, hp}, cp, fastMove, chargedMoves: [id, id or "none"] }
//                Without ivs and cp, the species gets upstream's default IVs and level for the league.
// Messages out:  { id, type: "progress", text, done, total }   { id, type: "result", ... }
//                { id, type: "error", message }
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
function progress(text, done, total) { self.postMessage({ id: currentId, type: "progress", text: text, done: done, total: total }); }
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

// ---- Shared setup for a cup: rankings, meta group, battle, and upstream's default options ----
var allowShadows = true; // Team Builder's "Show Shadow Pokemon in results": on

async function prepare(msg) {
  await gmLoaded;
  var cp = Number(msg.cp);
  var cupName = msg.cup;

  progress("Loading rankings and meta group…");
  await loadRankings(cupName, cp);
  var metaGroup = await loadGroup(msg.meta);

  var battle = new Battle();
  battle.setCP(cp);
  battle.setCup(cupName);

  // Upstream's default Team Builder options
  var prioritizeMetaThreats = true;  // "Prioritize meta threats": on
  var baitShields = 1;               // "Shield Baiting": on
  var shieldCount = 1;               // "Shields": Average (0 & 1) => shieldMode "average"

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

  return { cp: cp, cupName: cupName, battle: battle, ranker: ranker, cache: cupCache(cupName, cp) };
}

// ---- Battle results, kept for as long as the page is open ----
// Per cup: the threats (the cup's eligible Pokémon, in upstream's original order) and, per
// contender, each threat's rating and score against it. A contender's results don't depend on
// its teammates, so they're worked out once and reused for every team it's in (and by "grade").
var battleCaches = {};

function cupCache(cupName, cp) {
  var k = cupName + "/" + cp;
  if (!battleCaches[k]) battleCaches[k] = { threats: null, index: null, results: {} };
  return battleCaches[k];
}

function contenderKey(p) {
  return [p.speciesId, p.ivs.atk, p.ivs.def, p.ivs.hp, p.cp, p.fastMove.moveId]
    .concat(p.chargedMoves.filter(Boolean).map(function (mv) { return mv.moveId; })).join("|");
}

// Runs (or reuses) one contender's battles against every threat. Returns
// { rating: Int16Array, score: Float64Array }, aligned with cache.threats.
// rating is the threat's battle rating (500 even, below 500 = the contender wins).
function battlesFor(ctx, p) {
  var cache = ctx.cache;
  var k = contenderKey(p);
  if (cache.results[k]) return cache.results[k];

  var data = ctx.ranker.rank([p], ctx.cp, ctx.battle.getCup(), [], "team-counters");
  if (!cache.threats) {
    var ordered = data.rankings.slice().sort(function (a, b) { return a.index - b.index; });
    cache.threats = ordered.map(function (r) { return { speciesId: r.speciesId, speciesName: r.speciesName, pokemon: r.pokemon }; });
    cache.index = {};
    cache.threats.forEach(function (t, i) { cache.index[t.speciesId] = i; });
  }
  var n = cache.threats.length;
  var res = { rating: new Int16Array(n), score: new Float64Array(n) };
  if (data.rankings.length !== n) throw new Error("The threat list changed between contenders (" + data.rankings.length + " vs " + n + ").");
  data.rankings.forEach(function (r) {
    var i = cache.index[r.speciesId];
    if (i === undefined) throw new Error("Unexpected threat: " + r.speciesId);
    res.rating[i] = r.matchups[0].rating;
    res.score[i] = r.matchups[0].score;
  });
  cache.results[k] = res;
  return res;
}

async function grade(msg) {
  var ctx = await prepare(msg);
  var cp = ctx.cp, cupName = ctx.cupName, battle = ctx.battle;

  var built = msg.team.map(function (m) { return buildMember(battle, m, cp); });
  var team = built.map(function (b) { return b.pokemon; });

  // 1. Each member against every threat, on its own (or from earlier battles)
  var singles = [];
  var t0 = Date.now();
  for (var i = 0; i < team.length; i++) {
    progress("Simulating " + team[i].speciesName + " (" + (i + 1) + " of " + team.length + ")…");
    singles.push(battlesFor(ctx, team[i]));
  }
  var threatList = ctx.cache.threats;
  var battleCount = threatList.length * team.length * 2;
  var ms = Date.now() - t0;

  // Rebuild the team's result per threat, in upstream's original threat order:
  // rating = floor(sum / members), score = sum / members
  var combined = threatList.map(function (t, ti) {
    var sumRating = 0, sumScore = 0, ratings = [];
    for (var n = 0; n < singles.length; n++) {
      sumRating += singles[n].rating[ti];
      sumScore += singles[n].score[ti];
      ratings.push(singles[n].rating[ti]);
    }
    return {
      pokemon: t.pokemon, speciesId: t.speciesId, speciesName: t.speciesName,
      rating: Math.floor(sumRating / team.length), score: sumScore / team.length, ratings: ratings
    };
  });
  combined.sort(function (a, b) { return a.score > b.score ? -1 : (b.score > a.score ? 1 : 0); });

  // 2. Counter team and threat score (TeamInterface.js, "Potential threats")
  // The threats are reused from earlier battles, but on pvpoke.com they're new objects for every
  // rating. calculateSimilarity saves traits on them, which changes later answers, so clear them.
  threatList.forEach(function (t) { t.pokemon.traits = undefined; });
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

// ---- Contender x threat battles (step 3) ----
// Every contender against every threat in the cup, kept in the cache for the search (step 4).
// Contenders already done are skipped. Between contenders the worker pauses briefly, so a
// "cancel" message can get in; then it stops and replies with cancelled: true, and the
// contenders it finished stay done.
// Result per contender: { ok, wins, losses, ties, fresh }, { ok: false, error }, or
// { ok: true, pending: true } (not battled: the run was cancelled first).
async function battles(msg) {
  var ctx = await prepare(msg);
  var built = msg.contenders.map(function (m) {
    try { return buildMember(ctx.battle, m, ctx.cp).pokemon; } catch (err) { return { error: err.message || String(err) }; }
  });
  var todo = built.filter(function (p) { return !p.error && !ctx.cache.results[contenderKey(p)]; });

  var t0 = Date.now();
  var fresh = {};
  var ran = 0, stopped = false;
  for (var i = 0; i < todo.length; i++) {
    var elapsed = Date.now() - t0;
    var left = i > 0 ? Math.round(elapsed / i * (todo.length - i) / 1000) : null;
    progress("Battling: " + todo[i].speciesName + " (" + (i + 1) + " of " + todo.length + ")" +
      (left !== null ? ", about " + left + " s left" : "") + "…", i, todo.length);
    await new Promise(function (r) { setTimeout(r, 0); }); // let a "cancel" message in
    if (cancelled[currentId]) { stopped = true; break; }
    battlesFor(ctx, todo[i]);
    fresh[contenderKey(todo[i])] = true;
    ran++;
  }
  delete cancelled[currentId];

  var threats = ctx.cache.threats ? ctx.cache.threats.length : 0;
  reply({
    cancelled: stopped,
    threats: threats,
    ran: ran,
    battles: ran * threats * 2,
    ms: Date.now() - t0,
    contenders: built.map(function (p) {
      if (p.error) return { ok: false, error: p.error };
      var res = ctx.cache.results[contenderKey(p)];
      if (!res) return { ok: true, pending: true };
      var s = winCount(res);
      s.fresh = !!fresh[contenderKey(p)];
      return s;
    })
  });
}

// A contender's one-on-one record: the threat's rating below 500 is a win for the contender
function winCount(res) {
  var wins = 0, losses = 0;
  for (var t = 0; t < res.rating.length; t++) {
    if (res.rating[t] < 500) wins++;
    else if (res.rating[t] > 500) losses++;
  }
  return { ok: true, wins: wins, losses: losses, ties: res.rating.length - wins - losses };
}

// ---- Search: grade every team of three (step 4) ----
// Input: { cup, cp, meta, contenders: [contender, ...], include: [index, ...], rules: { sameDex,
//   oneMega }, targets: { coverage, bulk, safety, consistency } (minimum points: A 4 ... F 0) }.
// Contenders that haven't battled yet battle first. Every team of three is then graded from the
// battle cache with arithmetic only, exactly as "grade" does it:
//   - per threat: score = (s1 + s2 + s3) / 3 and rating = floor((r1 + r2 + r3) / 3);
//   - threats sorted by score (ties in upstream's original order); the first 6 that aren't
//     excluded or too similar to one already chosen form the counter team;
//   - threat score = round(sum of their ratings / 6); Coverage = letter for 1200 - threat score.
// Only the best K threats per team are kept in order (a small sorted list), since the counter
// team almost always comes from the first few; if it doesn't, that team falls back to a full sort.
// Rules: sameDex = no two members with the same Pokédex number (GBL: no repeated species, and a
// Shadow counts as its species); oneMega = at most one Mega. Always, whatever the rules: no two
// members with the same group (msg.groups[i]; a Pokémon and its upgraded versions share one).
// Output: the best 500 teams meeting the targets (or, if none do, the 500 closest), plus counts.
var POINTS = { A: 4, B: 3, C: 2, D: 1, F: 0 };
var LETTERS = ["F", "D", "C", "B", "A"];

async function search(msg) {
  var ctx = await prepare(msg);
  var cp = ctx.cp, cupName = ctx.cupName;
  var t0 = Date.now();

  // 1. Build every contender; battle the ones not done yet
  var built = msg.contenders.map(function (m) {
    try { return buildMember(ctx.battle, m, cp).pokemon; } catch (err) { return { error: err.message || String(err) }; }
  });
  var bad = built.map(function (p, i) { return p.error ? "#" + (i + 1) + ": " + p.error : null; }).filter(Boolean);
  if (bad.length) throw new Error("Some contenders can't be used: " + bad.join("; "));
  var todo = built.filter(function (p) { return !ctx.cache.results[contenderKey(p)]; });
  for (var b = 0; b < todo.length; b++) {
    progress("Battling: " + todo[b].speciesName + " (" + (b + 1) + " of " + todo.length + ")…", b, todo.length);
    await new Promise(function (r) { setTimeout(r, 0); });
    if (cancelled[currentId]) { delete cancelled[currentId]; throw new Error("Cancelled."); }
    battlesFor(ctx, todo[b]);
  }
  var results = built.map(function (p) { return ctx.cache.results[contenderKey(p)]; });
  var threats = ctx.cache.threats;
  var T = threats.length;

  // 2. Each contender's own values (as "grade" works them out)
  var overall = gm.rankings[cupName + "overall" + cp] || [];
  var bulk = [], safety = [], consistency = [], dex = [], mega = [];
  built.forEach(function (p) {
    p.fullReset();
    bulk.push(p.getEffectiveStat(1) * p.stats.hp);
    var s = 60;
    for (var n = 0; n < overall.length; n++) if (overall[n].speciesId == p.speciesId) { s = overall[n].scores[2]; break; }
    safety.push(s);
    consistency.push(p.calculateConsistency());
    dex.push(p.dex);
    mega.push(p.hasTag("mega"));
  });
  var bGoal = bulkGoal(cp, cupName);

  // 3. Threats that never join a counter team, and similarity (worked out when first needed)
  var skip = new Uint8Array(T);
  threats.forEach(function (t, i) {
    if ((t.speciesId.indexOf("_shadow") > -1 && !allowShadows) || t.speciesId.indexOf("_xs") > -1 ||
        t.pokemon.hasTag("teambuilderexclude")) skip[i] = 1;
  });
  // Upstream quirk, reproduced exactly: calculateSimilarity(candidate, traits) saves the
  // candidate's traits on it, and the Team Builder passes candidate.traits as `traits`. On
  // pvpoke.com the threats are new objects for every rating, so a candidate is compared with
  // the counter team's first member using that member's traits ("first"), and with every later
  // member using its own traits ("later"). Both answers are kept per pair.
  var simFirst = new Uint8Array(T * T), simLater = new Uint8Array(T * T); // 0 not known, 1 similar, 2 not
  function similar(c, t, first) {
    var k = c * T + t;
    var tab = first ? simFirst : simLater;
    if (!tab[k]) {
      var tp = threats[t].pokemon;
      var s = threats[c].pokemon.calculateSimilarity(tp, first ? undefined : tp.generateTraits(), false);
      tab[k] = (s == -1 || s >= 1000) ? 1 : 2;
    }
    return tab[k] === 1;
  }

  // Threat score for one team (members a, b, c)
  var K = 32;
  var topIdx = new Int32Array(K), topScore = new Float64Array(K);
  var chosen = [];
  function pickFrom(order, n, ra, rb, rc) {
    chosen.length = 0;
    var sum = 0;
    for (var q = 0; q < n && chosen.length < 6; q++) {
      var t = order[q];
      if (skip[t]) continue;
      var close = false;
      for (var z = 0; z < chosen.length; z++) if (similar(chosen[z], t, z === 0)) { close = true; break; }
      if (!close) { chosen.push(t); sum += Math.floor((ra[t] + rb[t] + rc[t]) / 3); }
    }
    return sum;
  }
  function threatScore(a, b, c) {
    var sa = results[a].score, sb = results[b].score, sc = results[c].score;
    var ra = results[a].rating, rb = results[b].rating, rc = results[c].rating;
    var count = 0;
    for (var t = 0; t < T; t++) {
      var s = (sa[t] + sb[t] + sc[t]) / 3;
      if (count === K && s <= topScore[K - 1]) continue; // ties keep the earlier threat
      var pos = count < K ? count : K - 1;
      while (pos > 0 && topScore[pos - 1] < s) { topScore[pos] = topScore[pos - 1]; topIdx[pos] = topIdx[pos - 1]; pos--; }
      topScore[pos] = s; topIdx[pos] = t;
      if (count < K) count++;
    }
    var sum = pickFrom(topIdx, count, ra, rb, rc);
    if (chosen.length < 6 && count === K) {
      // Rare: not enough distinct threats among the best K; sort them all
      var all = [];
      for (var u = 0; u < T; u++) all.push(u);
      var full = all.map(function (u) { return (sa[u] + sb[u] + sc[u]) / 3; });
      all.sort(function (x, y) { return full[y] - full[x] || x - y; });
      sum = pickFrom(all, T, ra, rb, rc);
    }
    return Math.round(sum / 6);
  }

  // 4. Every team of three
  var N = built.length;
  var include = (msg.include || []).slice().sort(function (x, y) { return x - y; });
  var groups = Array.isArray(msg.groups) && msg.groups.length === N ? msg.groups : null;
  if (include.length > 3) throw new Error("At most 3 contenders can be marked \"must include\".");
  var rules = msg.rules || {};
  var targets = msg.targets || {};
  var need = [targets.coverage || 0, targets.bulk || 0, targets.safety || 0, targets.consistency || 0];

  var possible = N * (N - 1) * (N - 2) / 6;
  var teams = [];   // every team allowed by the rules: [a, b, c, threat, bulk, safety, cons, points x4]
  var checked = 0, ruledOut = 0, qualifying = 0;
  for (var a = 0; a < N; a++) {
    for (var b2 = a + 1; b2 < N; b2++) {
      for (var c = b2 + 1; c < N; c++) {
        checked++;
        if (checked % 2000 === 0) {
          progress("Grading teams: " + checked.toLocaleString() + " of " + possible.toLocaleString() + "…", checked, possible);
          await new Promise(function (r) { setTimeout(r, 0); });
          if (cancelled[currentId]) { delete cancelled[currentId]; throw new Error("Cancelled."); }
        }
        if (include.length && include.some(function (x) { return x !== a && x !== b2 && x !== c; })) { ruledOut++; continue; }
        if (groups && (groups[a] === groups[b2] || groups[a] === groups[c] || groups[b2] === groups[c])) { ruledOut++; continue; }
        if (rules.sameDex && (dex[a] === dex[b2] || dex[a] === dex[c] || dex[b2] === dex[c])) { ruledOut++; continue; }
        if (rules.oneMega && (mega[a] + mega[b2] + mega[c]) > 1) { ruledOut++; continue; }

        var ts = threatScore(a, b2, c);
        var avgBulk = (bulk[a] + bulk[b2] + bulk[c]) / 3;
        var avgSafety = (safety[a] + safety[b2] + safety[c]) / 3;
        var avgCons = (consistency[a] + consistency[b2] + consistency[c]) / 3;
        var pts = [
          POINTS[letterGrade(1200 - ts, 680)],
          POINTS[letterGrade(avgBulk, bGoal)],
          POINTS[letterGrade(avgSafety, 98)],
          POINTS[letterGrade(avgCons, 98)]
        ];
        var short = 0;
        for (var g = 0; g < 4; g++) short += Math.max(0, need[g] - pts[g]);
        if (short === 0) qualifying++;
        teams.push({ m: [a, b2, c], ts: ts, bulk: avgBulk, safety: avgSafety, consistency: avgCons, pts: pts, short: short,
          total: pts[0] + pts[1] + pts[2] + pts[3] });
      }
    }
  }

  // 5. The best 500 that meet the targets; if none do, the 500 closest
  var pool = qualifying ? teams.filter(function (t) { return t.short === 0; }) : teams;
  pool.sort(function (x, y) {
    return (x.short - y.short) || (y.total - x.total) || (x.ts - y.ts) || (y.bulk - x.bulk);
  });
  var shown = pool.slice(0, 500).map(function (t) {
    return {
      members: t.m,
      threatScore: t.ts,
      bulk: Math.round(t.bulk), safety: Math.round(t.safety * 10) / 10, consistency: Math.round(t.consistency * 10) / 10,
      letters: t.pts.map(function (p) { return LETTERS[p]; }),
      points: t.total, short: t.short
    };
  });

  reply({
    possible: possible, ruledOut: ruledOut, graded: teams.length, qualifying: qualifying,
    closest: qualifying === 0, teams: shown, battled: todo.length, threats: T, bulkGoal: bGoal,
    records: results.map(winCount), // each contender's wins, for the pool's Wins column
    ms: Date.now() - t0
  });
}

// ---- Jobs, one at a time in the order they arrive ----
// { type: "cancel", target: id } isn't queued: it marks that job, which stops at its next pause.
// ---- Upgrades ("potential"): a contender as it would be after investing in it ----
// Input: { cup, cp, base: contender, change } where change has any of: speciesId (another form),
//   ivs, fastMove, chargedMoves, powerUp (true). It starts from the base's current level (worked
//   out from its CP, as always). A new form or new IVs keep that level, as in the game; powerUp
//   raises it to the highest level, up to 50, whose CP fits under the cup's cap.
// Output: { contender, fromLevel, level, poweredUp } or an error saying why the upgrade doesn't
//   fit (over the cap at the current level; nothing to power up; no change at all; a move the new
//   form doesn't have).
var MAX_UPGRADE_LEVEL = 50;
async function upgrade(msg) {
  await gmLoaded;
  var cap = Number(msg.cp);
  var battle = new Battle();
  battle.setCP(cap);
  battle.setCup(msg.cup);

  var base = msg.base;
  var fromLevel = buildMember(battle, base, cap).level; // also checks the original is valid
  var ch = msg.change || {};
  var speciesId = ch.speciesId || base.speciesId;
  var ivs = ch.ivs || base.ivs;

  var p = new Pokemon(speciesId, 1, battle);
  if (!p.speciesId) throw new Error("Unknown species: " + speciesId);
  p.initialize(cap);
  function cpAt(level) { return p.calculateCP(p.getCPMByLevel(level), ivs.atk, ivs.def, ivs.hp); }

  if (cpAt(fromLevel) > cap) {
    throw new Error(p.speciesName + " with IVs " + ivs.atk + "/" + ivs.def + "/" + ivs.hp + " would be CP " + cpAt(fromLevel) +
      " at its current level (" + fromLevel + "), over this league's " + cap + " cap.");
  }
  var level = fromLevel;
  if (ch.powerUp) {
    for (var l = fromLevel + 0.5; l <= MAX_UPGRADE_LEVEL; l += 0.5) {
      if (cpAt(l) <= cap) level = l; else break;
    }
  }

  var contender = {
    speciesId: speciesId,
    ivs: { atk: ivs.atk, def: ivs.def, hp: ivs.hp },
    cp: cpAt(level),
    fastMove: ch.fastMove || base.fastMove,
    chargedMoves: (ch.chargedMoves || base.chargedMoves).slice()
  };
  if (!contender.chargedMoves[1]) contender.chargedMoves[1] = "none";

  function same(a, b) {
    var ca = [a.chargedMoves[0], a.chargedMoves[1] || "none"].sort().join();
    var cb = [b.chargedMoves[0], b.chargedMoves[1] || "none"].sort().join();
    return a.speciesId === b.speciesId && a.cp === b.cp && a.fastMove === b.fastMove && ca === cb &&
      a.ivs.atk === b.ivs.atk && a.ivs.def === b.ivs.def && a.ivs.hp === b.ivs.hp;
  }
  if (same(contender, base)) {
    throw new Error(ch.powerUp && level === fromLevel
      ? "It can't be powered up any further in this league (level " + fromLevel + ", CP " + base.cp + "), and nothing else changed."
      : "That's no change from the original.");
  }

  var built = buildMember(battle, contender, cap); // checks the moves belong to the (new) form
  reply({ contender: contender, fromLevel: fromLevel, level: built.level, poweredUp: built.level > fromLevel });
}

var jobs = { grade: grade, evaluate: evaluate, battles: battles, search: search, upgrade: upgrade };
var queue = Promise.resolve();
var cancelled = {};

self.onmessage = function (e) {
  var msg = e.data || {};
  if (msg.type === "cancel") { cancelled[msg.target] = true; return; }
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
