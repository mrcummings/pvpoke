# PvPoke (fork): notes for Claude Code

The owner's fork of PvPoke (pvpoke.com), a public website of tools for Pokémon GO trainer battles: a battle simulator, rankings, a team builder, and so on. The original project is public on GitHub at `pvpoke/pvpoke`, and so is this fork, `mrcummings/pvpoke`. **What the owner wants to do with the fork hasn't been decided yet (see To-do).**

**This isn't a Jekyll site.** It's a PHP site with vanilla JavaScript, built by someone else. The "Preferred Jekyll setup" and "CollectionBuilder sites" sections below are part of the shared template, which every repo gets in full. They don't apply here, and nothing in this repo should be converted to Jekyll unless the owner asks.

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

**Doesn't apply to this repo** (see the note at the top). Kept because it's a shared section; the full text is in `CLAUDE-TEMPLATE.md`.

## CollectionBuilder sites

**Doesn't apply to this repo.** Kept because it's a shared section; the full text is in `CLAUDE-TEMPLATE.md`.

## Project specifics

### Layout
- `src/`: the whole website. The PHP pages (`index.php`, `battle.php`, `rankings.php`, `team-builder.php`, `ranker.php`, and others) are the **web root**, the folder the web server serves.
  - `src/js/`: the application. `GameMaster.js` loads the data; `interface/` holds the code that runs each page; `battle/` holds the battle simulator and the ranking algorithms (`rankers/`); `pokemon/` holds the Pokémon and player models. jQuery 3.3.1 is in `libs/`.
  - `src/data/`: the data (about 130 MB, nearly all of the repo). See below.
  - `src/css/`: `style.scss` compiles to `style.css` (Sass). The compiled `.css` and `.map` files are committed.
  - `src/modules/`: reusable PHP fragments (`header.php` and the dropdowns, for example). `config.php` holds the local settings (see "Site").
  - `src/articles/`, `src/rss/`: articles and the site's news feed.
  - `src/train/`: the Training analysis pages, backed by a MySQL database (`src/data/training/training.sql`).
  - `src/tera/`: a separate Tera Raid counter calculator (for Pokémon Scarlet and Violet), with its own header, CSS and JavaScript.
  - `src/gm-editor/`: a browser editor for the game master data.
  - `src/scripts/`: upstream's helper scripts (PowerShell and Node): the Cup Wizard, JSON formatting, and copying files for deployment. `src/.vscode/tasks.json` runs them from VS Code.
- `docker/`: a Dockerfile and `docker-compose.yml` that run the site in PHP + Apache.
- `README.md`, `LICENSE` (MIT): upstream's.
- `CLAUDE.md`, `CLAUDE-TEMPLATE.md`: the owner's, not upstream's. They sit outside `src/`, so the web server never serves them.

### Data and metadata
- **No CSV. The data is JSON.** `src/data/gamemaster.json` (and a minified copy, `gamemaster.min.json`) holds every Pokémon and move. It's compiled from the parts in `src/data/gamemaster/` (`pokemon.json`, `moves.json`, `formats.json`, `cups/`, and so on) by `src/data/compile.php`.
- **Stable IDs:** each Pokémon has a `speciesId` (for example `magnezone`, `goodra_hisuian`) and each move has a `moveId` (for example `MAGNET_BOMB`). These are the keys used everywhere, including in URLs.
- **Rankings:** `src/data/rankings/<cup>/<category>/rankings-<CP limit>.json`: 25 cups and 246 files as of 2026-11-18. They're **build artifacts**: files the code generates, which are committed so the live site doesn't have to compute them. They're made in the browser on `ranker.php` and `rankersandbox.php`, which save them through `src/data/write.php`. (That file's own comment says it doesn't belong on a public server.)
- `src/data/groups/`: Pokémon lists for each cup. `src/data/overrides/`: hand-set moveset choices that adjust the generated rankings.

### Site
- **Running it needs PHP**, not Jekyll. The pages are PHP files and some data is saved by PHP, so a static server isn't enough. Upstream's two ways: Docker (`docker compose up` from `docker/`, then `http://localhost/pvpoke/src/`), or a local PHP + Apache stack such as XAMPP, as in the [PvPoke Wiki installation guide](https://github.com/pvpoke/pvpoke/wiki/Installation). Upstream gives no way to run it like the owner's Jekyll sites (one command from the repo root).
- `src/modules/config.php` sets `$WEB_ROOT = '/pvpoke/src/'`, which assumes the site is reached at that path. `.gitignore` lists it, but git still tracks it because upstream committed it, so local edits to it will still show up as changes. It contains only local defaults (database `root` with no password), no secrets.
- URLs are rewritten by `src/.htaccess` (Apache's `mod_rewrite`), for example `/battle/1500/…`.
- **Deployment:** none. The fork isn't deployed anywhere.

## Current state
- Fresh clone of the fork, made 2026-11-18. It has no commits by the owner: `master` is at upstream's commit `d02018eb6` ("Magnet Bomb Magnezone", 2026-11-17).
- Remotes: `origin` = `mrcummings/pvpoke` (the owner's fork), `upstream` = `pvpoke/pvpoke`. `upstream` hasn't been fetched yet.
- On the laptop (2026-11-18), neither PHP nor Docker is installed, so the site can't be run there yet. Node and Ruby are installed.

## To-do
### Next session
1. [ ] Ask the owner what the fork is for (contributing to upstream, local experiments, a personal version, studying the code) before changing anything.
2. [ ] Choose how to run it locally (Docker or a PHP install) on both machines.
### Open, not scheduled
- [ ] Decide how and how often to pull in upstream's updates (`git fetch upstream`, then merge into `master`).
### Done
- [x] Added this repo to the template tracker and created CLAUDE.md (2026-11-18).

_Last updated: 2026-11-18 (laptop). CLAUDE.md created after a first look at the repo; no code changes, purpose of the fork not yet decided._
