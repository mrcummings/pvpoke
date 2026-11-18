# PvPoke (fork): notes for Claude Code

The owner's fork of PvPoke (pvpoke.com), a public website of tools for Pokémon GO trainer battles: a battle simulator, rankings, a team builder, and so on. The original project is public on GitHub at `pvpoke/pvpoke`, and so is this fork, `mrcummings/pvpoke`.

**Two sites in one repo:**
- **`src/`: upstream's PvPoke, a PHP site** with vanilla JavaScript, built by someone else. Leave it as upstream has it.
- **The repo root: "PoGo PvP", the owner's own Jekyll site** (added 2026-11-18). It shows the game master data in `src/data/` as tables, and it follows "Preferred Jekyll setup" below. It's one of the game projects in `mrcummings/game-hub`, on port 4014.

## About the owner

- **Background:** a digital scholarship librarian. Strong in metadata, spreadsheets and CSV, and in CollectionBuilder and Jekyll sites. Most of their repos are Jekyll sites, many of them CollectionBuilder, which starts from a cloned template. They have less experience building a Jekyll site from scratch, and they're building fluency in the vocabulary of static sites and build tooling.
- **Setup:** Windows, on two machines (laptop and desktop), with GitHub Desktop and VS Code. Claude Code sessions don't carry over between machines, so **CLAUDE.md is the handoff**. Shared reference files live in Google Drive, folder "GH-Projects".
- **How they like to run a site:** `bundle exec jekyll s` (or `jekyll s`) from the repo root, then open `localhost:4000`. No `cd` into a subfolder, no npm, no separate build step.
- **Ruby:** 3.3.6 on the laptop and 3.2.3 on the desktop (as of 2026-11). Anything set up must work on both. Don't suggest upgrading Ruby casually: it can break their existing CollectionBuilder sites.

## Working rules

- **Never commit, stage, or push. This applies in every repo, always.** The owner makes every commit, so they know exactly what goes into each one. Do recommend good moments to commit and suggest a message, especially before a large change.
- **Always put a suggested commit message in its own fenced code block** (three backticks on the lines before and after), never inline in a sentence. The owner's editor shows a code block as a box with a copy button. Put only the message inside, with no commentary.
- **Ask before restructuring, renaming, or moving** files and folders. Adding new files is fine.
- **Read the repo before changing anything.** If this file conflicts with the files, trust the files and say so.
- **Small, testable steps.** After each one, say what you **verified by running** and what you're **assuming** or couldn't test (for example, browser-only behavior).
- **Explain decisions in prose with a concrete example.** Don't leave a problem only as a row in a table; a terse table row is easy to miss.
- **Use the proper terms, and briefly say what they mean** the first time: build artifact, permalink, generator plugin, lockfile, and so on. The owner is learning to talk about this environment fluently.
- **Ask, don't assume,** about how the content will be used or published.
- **Never push to or open pull requests against `upstream` (`pvpoke/pvpoke`)** unless the owner explicitly asks. `origin` is the owner's fork.
- **Keep the owner's changes easy to tell apart from upstream's.** The upstream author commits several times a week, so pulling in their updates will be easier if the owner's changes stay small and separate (new files where possible, rather than edits throughout upstream's files). Mention a likely merge conflict before making a change that could cause one.

## Keeping CLAUDE.md current

- Update CLAUDE.md whenever something in it changes: when a to-do is finished or added, a decision is made, the layout changes, or a session ends with work in progress. Keep "Current state" and "To-do" accurate, so the next session, on either machine, can continue without the owner re-explaining. Change the "Last updated" line when you do. Tell the owner you've updated it so they can include it in a commit.
- **Template tracker.** At the start of a session, if the repo contains `CLAUDE-TEMPLATE.md`, get the repo's GitHub name from `git remote get-url origin` and check the tracker at the top of that file.
  - If the repo isn't listed, add a row with today's date. Then tell the owner to add the same row to the master copy in Google Drive ("GH-Projects"). Don't edit the Drive copy unless the owner asks.
  - Never edit the shared sections of a repo's copy directly. Changes go into the master first, and the repo copies are then replaced from it. The "Template version" date shows which version a copy is.

## Preferred Jekyll setup

**Applies to the PoGo PvP site at the repo root, not to `src/`.** The full text is in `CLAUDE-TEMPLATE.md`; read it before changing the Jekyll site. Where this repo departs from it, the reason is under "Project specifics". The data is JSON in `src/data/` rather than CSV, and that's why the CSV notes don't apply.

## CollectionBuilder sites

**Doesn't apply to this repo.** Kept because it's a shared section; the full text is in `CLAUDE-TEMPLATE.md`.

## Project specifics

### Layout
- `src/`: the whole website. The PHP pages (`index.php`, `battle.php`, `rankings.php`, `team-builder.php`, `ranker.php`, and others) are the **web root**, the folder the web server serves.
  - `src/js/`: the application. `GameMaster.js` loads the data; `interface/` holds the code that runs each page; `battle/` holds the battle simulator and the ranking algorithms (`rankers/`); `pokemon/` holds the Pokémon and player models. jQuery 3.3.1 is in `libs/`.
  - `src/data/`: the data (about 130 MB, nearly all of the repo). See below.
  - `src/css/`: `style.scss` compiles to `style.css` (Sass). The compiled `.css` and `.map` files are committed.
  - `src/modules/`: reusable PHP fragments (`header.php` and the dropdowns, for example). `config.php` holds the local settings (see "Site: upstream PvPoke").
  - `src/articles/`, `src/rss/`: articles and the site's news feed.
  - `src/train/`: the Training analysis pages, backed by a MySQL database (`src/data/training/training.sql`).
  - `src/tera/`: a separate Tera Raid counter calculator (for Pokémon Scarlet and Violet), with its own header, CSS and JavaScript.
  - `src/gm-editor/`: a browser editor for the game master data.
  - `src/scripts/`: upstream's helper scripts (PowerShell and Node): the Cup Wizard, JSON formatting, and copying files for deployment. `src/.vscode/tasks.json` runs them from VS Code.
- `docker/`: a Dockerfile and `docker-compose.yml` that run the site in PHP + Apache.
- `README.md`, `LICENSE` (MIT): upstream's. **Don't edit `README.md`** (upstream changes it); the "Running" notes for PoGo PvP live in this file instead.
- `CLAUDE.md`, `CLAUDE-TEMPLATE.md`, `STYLE-GUIDE.md`: the owner's, not upstream's. They sit outside `src/`, so the PHP site never serves them, and `_config.yml` excludes them from the Jekyll site.
- **The PoGo PvP Jekyll site, all at the repo root** (upstream has none of these files, so they can't cause merge conflicts):
  - `_config.yml`: title, `port: 4014`, the data paths (`gamemaster:`, `rankings:`, `rankings_category:`), and `exclude:` (`src/`, `docker/` and the docs).
  - `Gemfile`, `Gemfile.lock`: the standard minimal-site Gemfile.
  - `_plugins/gamemaster_tables.rb`: a **generator plugin**. It reads `src/data/gamemaster.json` and turns its `pokemon`, `moves` and `cups` lists into columns and rows, stored as `site.data["gamemaster"]`. It also holds `PogoPvp::Tables`, the shared code that turns JSON records into a table; the comment at its top explains how nested values become text. It never changes or copies the JSON.
  - `_plugins/rankings_pages.rb`: a second generator plugin. It makes **one page per ranking list** (no file per page), plus the dropdown's list in `site.data["rankings"]`. The comment at its top explains the URLs, labels, order and columns.
  - `_includes/data-table.html`: the table markup, shared by both layouts below.
  - `_layouts/default.html` (header, nav, theme toggle); `_layouts/table.html` (the Pokémon, Moves and Cups pages: one table, chosen by the page's `table:` front matter); `_layouts/rankings.html` (dropdown + one ranking).
  - `index.html` (four cards), `pokemon.html`, `moves.html`, `cups.html`. The rankings pages have no source file; the plugin makes them.
  - `assets/css/theme.css`, `assets/js/theme.js`: **shared with the other game projects. Never edit them here** (see `STYLE-GUIDE.md`).
  - `assets/css/site.css`: this site's own styles and its blue accent.
  - `assets/js/table.js`: filter boxes and click-to-sort. The tables are complete without it.
  - `assets/js/rankings.js`: the rankings dropdown (choosing a cup opens its page).
- `.gitignore`: upstream's, with the standard Jekyll lines added at the end (2026-11-18). If upstream ever changes this file, a merge conflict there is possible but small.

### Data and metadata
- **No CSV. The data is JSON.** `src/data/gamemaster.json` (and a minified copy, `gamemaster.min.json`) holds every Pokémon and move. It's compiled from the parts in `src/data/gamemaster/` (`pokemon.json`, `moves.json`, `formats.json`, `cups/`, and so on) by `src/data/compile.php`.
- **Stable IDs:** each Pokémon has a `speciesId` (for example `magnezone`, `goodra_hisuian`) and each move has a `moveId` (for example `MAGNET_BOMB`). These are the keys used everywhere, including in URLs.
- **Rankings:** `src/data/rankings/<cup>/<category>/rankings-<CP limit>.json`: 25 cups and 246 files as of 2026-11-18. They're **build artifacts**: files the code generates, which are committed so the live site doesn't have to compute them. They're made in the browser on `ranker.php` and `rankersandbox.php`, which save them through `src/data/write.php`. (That file's own comment says it doesn't belong on a public server.)
- `src/data/groups/`: Pokémon lists for each cup. `src/data/overrides/`: hand-set moveset choices that adjust the generated rankings.

### Site: PoGo PvP (the Jekyll site)
- **Running it:** from the repo root, `bundle install` (first time on a machine, or after the Gemfile changes), then `bundle exec jekyll s`, then open `http://localhost:4014`. It also starts with the game-hub (`localhost:4010`).
- **Pages:** `/` (four cards with counts), `/pokemon/`, `/moves/`, `/cups/` and the rankings. Decided 2026-11-18: **no page per Pokémon, move or cup**, only these tables.
- **Rankings** (added 2026-11-18, to the owner's spec):
  - **The owner's spec:** a dropdown at the top listing every cup that has rankings. Great League, Ultra League and Master League come first, in that order, then a separator, then the rest alphabetically. Great League is the default view, and choosing a cup shows its ranking as a table.
  - **How it's built:** one generated page per ranking list. `/rankings/` is Great League (`all`, 1500), and the others are at `/rankings/<cup>/<CP>/`, for example `/rankings/classic/2500/`. The dropdown opens the chosen page. Separate pages were chosen over one page that loads data with JavaScript, so `table.js` works unchanged, every table is complete HTML, and each ranking has its own address that can be bookmarked.
  - **Data:** the **overall** rankings only (`src/data/rankings/<cup>/overall/rankings-<CP>.json`): 36 lists from 25 cup folders, 20,291 rows. Four cups have several leagues (`all`, `classic`, `mega`, `premier`). Upstream's other categories (leads, closers and so on) aren't shown, but their scores are in the `scores.*` columns.
  - **Labels:** the cup `all` is named by its league; otherwise upstream's format title, then the cup's title (`remix`'s comes from upstream's archived cup file); a cup with several leagues gets the league added, for example "Classic (Ultra League)". "Little League" (`all` at 500 CP) is this site's label; upstream doesn't list it on its rankings page. Within the alphabetical list, a cup's leagues stay together, lowest CP first.
  - **Columns:** `rank` (the position in the file, which is in score order), `speciesName` (these two stay in view), `speciesId`, `score`, the six `scores.*` (in the order leads, closers, switches, chargers, attackers, consistency; checked against the category files), `moveset`, then the rest in the JSON's order. Matchups and counters show as `mimikyu (729)`, and move usage as `THUNDER_SHOCK (139900)`.
- **Build time:** about 13 seconds on the laptop (2026-11-18), mostly the rankings; `_site` is about 17 MB. While `jekyll s` is running, every saved change triggers a full rebuild of that length.
- **The tables show every field in the data:** one column per field, labeled with its JSON name, in order of first appearance. An object field becomes one column per key, for example `baseStats.atk`. The first column is the name, and it stays in view while scrolling sideways. Counts as of 2026-11-18: Pokémon 1,753 rows × 41 columns, moves 357 × 20, cups 27 × 13.
- **Empty vs. null:** a missing field is an empty cell, and a field set to `null` shows `null` (five Pokémon have `searchPriority: null`).
- **Filtering and sorting** (`table.js`): one box filters on all columns, plus a box under each heading. A column box accepts text, `!text`, `=text`, `>200`, `<=50` and `100..200`. Clicking a heading sorts ascending, then descending, then back to the original order, with empty cells always last.
- **Restart `jekyll s` after the data changes** (for example after pulling in upstream's updates). `src/` is excluded, so Jekyll doesn't watch it.
- Not included yet: the game master's other lists (`pokemonTags`, `shadowPokemon`, `rankingScenarios` and so on), the parts in `src/data/gamemaster/`, and the ranking categories other than overall.

### Upstream's Team Builder: how it works (examined 2026-11-18)
The owner wants to build their own version with improvements. Nothing has been built yet; these are the findings.
- **Files:** page `src/team-builder.php`; page logic `src/js/interface/TeamInterface.js` (`updateTeamResults()` does everything, about 600 lines); matchup runner `src/js/battle/rankers/TeamRanker.js`; battle engine `src/js/battle/Battle.js` + `DamageCalculator.js` + `actions/ActionLogic.js` + `timeline/*` + `src/js/training/DecisionOption.js`; Pokémon model `src/js/pokemon/Pokemon.js`; data loading `src/js/GameMaster.js`; Pokémon entry `src/js/interface/PokeMultiSelect.js` and `PokeSelect.js`.
- **Runs entirely in the browser; no PHP does any calculation.** It needs only static JSON: `data/gamemaster.min.json`, `data/rankings/<cup>/overall/rankings-<CP>.json`, and `data/groups/<meta>.json` (the format's `meta` field names the group; it's the list of meta Pokémon for the scorecard).
- **Page globals the engine expects** (set by `src/header.php`): `webRoot`, `host`, `siteVersion`, `settings` (`gamemaster`, `colorblindMode`, `matrixDirection`, `hardMovesetLinks`), `get`. **jQuery** is used by `GameMaster.js` (file loading) and the interface files, not by the battle engine itself.
- **IV Rank** ("rating against its species"): `Pokemon.getIVRank("overall")` generates all IV combinations (up to 4,096) under the league's CP cap, each at its highest level that fits, and ranks them by stat product (Attack × Defense × HP). Shown in `PokeSelect.js` as "Rank #N / count".
- **Matchups** (`TeamRanker.rank`): every Pokémon eligible for the cup (about 1,000 in Great League) battles each team member. Threats use their recommended moveset and default IVs; the user's team uses its own. Battle rating = (own HP left % + damage dealt %) × 500, so 500 is even. Shields default to "Average": 0 and 1 shield simulated, combined as (rating₀ × rating₁³)^¼, which weights the 1-shield result 3:1.
- **Threat score** (`TeamInterface`): threats sorted by a softened score (with a boost for meta Pokémon when "Prioritize meta" is on: factor 0.85); the top 6 that aren't too similar to each other (`Pokemon.calculateSimilarity`) form a "counter team"; threat score = sum of their average ratings ÷ 6 (always 6, even if fewer were found).
- **Alternatives:** the same battles again, every eligible Pokémon against that 6-Pokémon counter team, sorted by score. About 6,000 more simulations; all on the main thread, so the page freezes while it runs.
- **The four grades** (`calculateLetterGrade(value, goal)`: value ÷ goal ≥ 0.9 A, ≥ 0.8 B, ≥ 0.7 C, ≥ 0.6 D, else F):
  - **Coverage:** value 1200 − threat score, goal 680. A needs a threat score of 588 or lower.
  - **Bulk:** average of Defense × HP across the team; goal by league: Little 10,000, Great 22,000, Ultra 35,000 (Premier Ultra 33,000), Master 35,000.
  - **Safety:** **not calculated from the team.** It looks up each species' *switches* score (`scores[2]`) in the overall rankings file, 60 if not found, averaged; goal 98. The user's moveset and IVs don't affect it.
  - **Consistency:** `Pokemon.calculateConsistency()`, a formula on the moveset (how much damage depends on baiting with the cheaper charged move; penalties for chance-based buffs and for Power-Up Punch, Lunge, Feather Dance, Bubble Beam), averaged; goal 98.
- **Options:** team size 6 or 8; scorecard length 20; shadows on; prioritize meta threats and alternatives on; XL Pokémon per user setting; same species off; shields Average; shield baiting on. Share links keep the team, cup and CP but not the options.

### Site: upstream PvPoke (the PHP site in `src/`)
- **Running it needs PHP**, not Jekyll. The pages are PHP files and some data is saved by PHP, so a static server isn't enough. Upstream's two ways: Docker (`docker compose up` from `docker/`, then `http://localhost/pvpoke/src/`), or a local PHP + Apache stack such as XAMPP, as in the [PvPoke Wiki installation guide](https://github.com/pvpoke/pvpoke/wiki/Installation). Upstream gives no way to run it like the owner's Jekyll sites (one command from the repo root).
- `src/modules/config.php` sets `$WEB_ROOT = '/pvpoke/src/'`, which assumes the site is reached at that path. `.gitignore` lists it, but git still tracks it because upstream committed it, so local edits to it will still show up as changes. It contains only local defaults (database `root` with no password), no secrets.
- URLs are rewritten by `src/.htaccess` (Apache's `mod_rewrite`), for example `/battle/1500/…`.
- **Deployment:** none. The fork isn't deployed anywhere.

## Current state
- **PoGo PvP works on the laptop** (2026-11-18). Verified by running: `bundle exec jekyll build` with no errors or warnings (row counts above), and a test serve on a spare port (the four pages and assets load; `/src/...`, `/CLAUDE.md` and a made-up URL give 404). The filter rules in `table.js` passed 14 test cases in Node.
- **Owner's browser check (2026-11-18):** sticky header and column, Light/Dark and a narrow window work. Two problems were found, fixed the same day, and **approved by the owner on recheck**: (1) sorting and filters did nothing, because `table.js` was never loaded (it was listed in `_layouts/table.html`'s front matter, which the default layout's `page.scripts` doesn't read; the script tag is now in `table.html` itself); (2) the cup rules wrapped so much that one rule was hard to tell from the next (now wider `include`/`exclude` columns, one block per rule, with a hanging indent). The owner rarely uses a narrow window.
- **The desktop hasn't been set up.** Run `bundle install` there first. Ruby 3.2.3 should work, but it hasn't been tried.
- Upstream's PHP site isn't run anywhere: neither PHP nor Docker is installed on the laptop.
- Remotes: `origin` = `mrcummings/pvpoke` (the owner's fork), `upstream` = `pvpoke/pvpoke`. `upstream` hasn't been fetched yet.

## To-do
### Next session
1. [ ] The owner checks the rankings pages in the browser: the dropdown (order, separator, switching, Back button), the rank and name columns staying in view, sorting and filtering.
2. [ ] Set it up on the desktop (`bundle install`, then run).
### Open, not scheduled
- [ ] **Own Team Builder: a team *search* tool** (owner's goal, 2026-11-18). The problem: on upstream's tool you enter a team, read its grades, and guess what to change. The owner wants to work backwards: "show me A/A/A/A Master League teams", or "here are ~24 contenders (species, IVs, movesets); show me the combinations and their grades". Proposed design, not yet approved:
  - Bulk, Safety and Consistency are averages of per-Pokémon values, so each contender gets its own value and team grades need no battles. Coverage is built from one-on-one battles that don't depend on teammates, so: simulate each contender against each threat once (a contender × threat table), then score every team from the table with arithmetic only. Skip "Potential Alternatives"; no grade uses it.
  - One tool, two pool sources: the owner's contenders, or the top N of the rankings (recommended movesets, default IVs). Teams of 3 from 24 = 2,024; from the top 100 = 161,700; teams of 6 from 24 = 134,596.
  - Page: contenders with their own scores, target grades, lock/exclude, results table (reuse `table.js`), closest teams when none meet the targets.
  - Master League check: only 11 of the top 100 reach A-level Safety on their own (switches ≥ 88.2).
  - **Owner's answers (2026-11-18):** teams of 3 only; contenders from a CSV *and* typed into the page, with CSV export; match upstream's grading exactly for now.
  - **Engine test (2026-11-18, Node, in Claude's scratchpad, not in the repo):** upstream's engine files run outside upstream's pages with a ~20-line stand-in for jQuery (`$.ajax`, `$.getJSON`, `$.each`, and a do-nothing `$()`), plus stand-ins for `InterfaceMaster` and the page globals. It needs the cup's overall rankings loaded first (for threats' recommended movesets) and the meta group. Master League: 410 threats; 2,460 battles in about 1 s (**about 0.4 ms per battle**). **Verified: a team's per-threat rating and score, rebuilt from three single-Pokémon runs, matched the full-team run exactly for all 410 threats** (Dialga Origin / Zacian Crowned / Palkia Origin).
  - Plan proposed to the owner 2026-11-18, waiting for approval: see the latest session's message, summarized here. Upstream's files published into the site at build time by a plugin (not copied into the repo); battles run in a Web Worker (a background thread, so the page doesn't freeze) with a progress bar; pool from CSV, typed entry, or "add top N from rankings"; per-contender stats; every team of 3 graded from the table; filters, lock/exclude, GBL rules (no duplicate Pokédex number, one Mega); results table; verification against pvpoke.com by the owner before building the rest.
- [ ] Decide how and how often to pull in upstream's updates (`git fetch upstream`, then merge into `master`).
- [ ] Maybe: a category choice on the rankings (leads, closers and so on), or tables for the game master's other lists.
- [ ] Maybe: running upstream's PHP site locally (Docker or a PHP install).
### Done
- [x] Added this repo to the template tracker and created CLAUDE.md (2026-11-18).
- [x] Rankings pages: dropdown plus one table per overall ranking list; built and test-served (2026-11-18). Waiting for the owner's browser check.
- [x] Owner's browser check of PoGo PvP, including the fixes for script loading and cup rules: approved (2026-11-18).
- [x] PoGo PvP Jekyll site: home page plus Pokémon, Moves and Cups tables with filters and sorting; blue accent added to `STYLE-GUIDE.md` (here and in game-hub); added to game-hub on port 4014 (2026-11-18).

_Last updated: 2026-11-18 (laptop). Rankings pages added (waiting for the owner's browser check). Upstream's Team Builder examined; waiting for the owner's list of improvements. The desktop isn't set up yet._
