<!--
  CLAUDE-TEMPLATE.md: starting point for a CLAUDE.md in a Jekyll project.

  MASTER COPY: Google Drive, folder "GH-Projects". Make changes there, then copy the updated file
  into every repo listed in the tracker below. A copy inside a repo is not the master.

  To start a new project: copy this file into the repo as-is, plus a second copy named CLAUDE.md.
  In CLAUDE.md, fill in the [bracketed] parts and delete sections that don't apply.
  "About the owner", "Working rules", "Keeping CLAUDE.md current", "Preferred Jekyll setup" and
  "CollectionBuilder sites" should stay the same across projects. Change them in the master.
-->

## Template tracker

Template version: **2026-11-16**

Repos that hold a copy of this template. When the master changes, copy it into each one.

| Repo (GitHub `owner/name`) | Added | Notes |
|---|---|---|
| mrcummings/tes-lore | 2026-11-11 | Where the template was written; not a CollectionBuilder site |
| mrcummings/eu4map | 2026-11-11 | Province Atlas map editor; converted from Node/npm to a Jekyll site with a generator plugin (2026-11-11); not a CollectionBuilder site |
| mrcummings/pkmn-tracker | 2026-11-11 | Living dex tracker; converted from a single HTML file to a Jekyll site built from a CSV (2026-11-11); not a CollectionBuilder site |
| mrcummings/game-hub | 2026-11-11 | Local landing page that starts every game project's server (4000 to 4003); not a CollectionBuilder site |
| mrcummings/familymemories | 2026-11-13 | Family history collection; a CollectionBuilder site with its own AGENTS.md (CLAUDE.md imports it) |
| mrcummings/pvpoke | 2026-11-18 | Fork of pvpoke/pvpoke (Pokémon GO PvP tools); a PHP + vanilla JavaScript site, not Jekyll and not a CollectionBuilder site |

---

# [Project name]: notes for Claude Code

[One or two sentences: what this project is, who it's for, and whether it's private or public.]

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
- [Project-specific rules, for example "Never make this repo public".]

## Keeping CLAUDE.md current

- Update CLAUDE.md whenever something in it changes: when a to-do is finished or added, a decision is made, the layout changes, or a session ends with work in progress. Keep "Current state" and "To-do" accurate, so the next session, on either machine, can continue without the owner re-explaining. Change the "Last updated" line when you do. Tell the owner you've updated it so they can include it in a commit.
- **Template tracker.** At the start of a session, if the repo contains `CLAUDE-TEMPLATE.md`, get the repo's GitHub name from `git remote get-url origin` and check the tracker at the top of that file.
  - If the repo isn't listed, add a row with today's date. Then tell the owner to add the same row to the master copy in Google Drive ("GH-Projects"). Don't edit the Drive copy unless the owner asks.
  - Never edit the shared sections of a repo's copy directly. Changes go into the master first, and the repo copies are then replaced from it. The "Template version" date shows which version a copy is.

## Preferred Jekyll setup

The default for new sites, and the target when converting an existing project to Jekyll. Depart from it only when the owner agrees. **Doesn't apply to CollectionBuilder sites;** see the next section.

### Principles
- **A minimal static site.** Jekyll 4.x, Liquid layouts, plain CSS, and vanilla JavaScript files where needed. No front-end framework, no npm or Node build step, no theme gem unless asked for.
- **At the repo root**, so `bundle exec jekyll s` works from the top folder.
- **Local only by default.** The site is for running on the owner's machines, not deployed anywhere, unless "Project specifics" says otherwise.
- **Data-driven pages.** The metadata lives in a CSV (or several) or in other source files, which are the **single source of truth**. Avoid hand-copied or duplicated data. Where applicable, one page per record is created at build time, either by a small **generator plugin** in `_plugins/` that reads the CSV directly or by a Jekyll **collection**, whichever suits the project. Some projects don't need record pages: an interactive tool, for example, may instead have its plugin write a data file (such as `api/data.json`) that the page's JavaScript loads.
- **Stable IDs as slugs.** Each record has a stable identifier, like CollectionBuilder's `objectid`. Where records have pages, the ID becomes the **permalink**, for example `/items/<id>/`. Never use titles in URLs, because titles change.
- **Progressive enhancement where possible.** For content pages, the static HTML is complete on its own, and JavaScript only adds conveniences such as filtering and sorting. For an interactive tool that can't work without JavaScript (a map editor, for example), a static HTML shell with a JavaScript application is fine. Keep that JavaScript vanilla and unbundled.
- **Readable and dark-mode friendly.** System fonts, CSS custom properties for colors, a `prefers-color-scheme` dark palette, and no external fonts or CDNs unless asked for.

### Typical files
```
_config.yml          title, baseurl, data-source settings, exclude list
Gemfile              see below
Gemfile.lock         committed: pins gem versions so both machines match
.gitignore           _site/, .jekyll-cache/, .jekyll-metadata, .sass-cache/, .bundle/, vendor/
_plugins/            generator plugin(s), if pages are generated from CSV
_layouts/            default.html (shell) + one layout per page type (e.g. item.html)
_includes/           only if a fragment is reused
index.html           browse/landing page
assets/css/site.css
assets/js/*.js       where needed
```

### Gemfile
```ruby
source "https://rubygems.org"

gem "jekyll", "~> 4.3"
gem "csv"      # no longer built into Ruby from 3.4; needed by plugins that read CSV
gem "webrick"  # needed by `jekyll serve` on Ruby 3+

platforms :windows, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end
```

### Points to remember
- **`exclude:` in `_config.yml` adds to Jekyll's built-in list** of skipped files; it doesn't replace it. Jekyll 4 already skips `Gemfile`, `Gemfile.lock`, `vendor`, `node_modules`, and any file or folder whose name starts with `.` or `_`, so there's no need to repeat those (doing so is harmless). Do exclude `AGENTS.md`, `CLAUDE.md`, `CLAUDE-TEMPLATE.md`, `HUMANS.md`, `README.md`, and any tooling or raw-data folders. Otherwise Jekyll copies them into the built site, where anyone can open them (for example `/CLAUDE.md`). (Checked on Jekyll 4.3.4, 2026-11.)
- **Reading CSV in Ruby:** use `CSV.read(path, headers: true, encoding: "bom|utf-8")` and convert every value to a trimmed string. Ruby gives `nil` for empty cells, and a file with Windows line endings can leave `\r` on the last column. That breaks comparisons like `!= ""` and puts a stray `%0D` at the end of URLs.
- **Escape text** that goes into HTML with `| xml_escape`. To keep a plain-text document's line breaks and indentation, use `white-space: pre-wrap` instead of converting it to `<p>` tags.
- **CSV files for spreadsheets:** UTF-8 **with a BOM**, so Excel opens accented characters correctly. Remember that Google Sheets strips leading zeros (`01` becomes `1`), so decode codes from the CSV, never from a Sheets copy.
- **Windows line endings:** the repos use `core.autocrlf=true`. Git's "LF will be replaced by CRLF" warnings are harmless.
- **If a site is ever deployed:** GitHub Pages' built-in Jekyll build runs only approved plugins, so a site with a custom `_plugins/` generator would need to be built with GitHub Actions.
- **Restart `jekyll s`** after changing `_config.yml` or a plugin. Neither is reloaded while the server is running.

### Checking a site build
1. `bundle install`, then `bundle exec jekyll build`, with no errors or warnings.
2. Count the generated pages against the number of records. Have the plugin log the count.
3. Open the generated HTML for tricky records: empty fields, special characters, the longest text, a record with images, a record without.
4. Start `bundle exec jekyll s` on a spare port, request a few URLs (including one that should 404), then stop it.
5. Say clearly that browser-only behavior (JavaScript filtering and sorting, layout) wasn't tested, and ask the owner to click through it.

### Converting an existing project to Jekyll
1. Read the repo first. Find where the content and metadata live and what the stable ID is. If there's no stable ID, propose one and ask before creating it.
2. Propose the plan before writing anything: which files are added, what the URLs will look like, what is generated vs. hand-written, and what (if anything) moves. Moving or renaming files needs the owner's approval.
3. Recommend a commit before starting, then add the site files around the existing content without changing it.
4. Update the README with a "Running the site" section, and update CLAUDE.md.

## CollectionBuilder sites

**How to recognize one:** some combination of `_data/theme.yml`, `_data/config-*.csv` files (for example `config-browse.csv`, `config-metadata.csv`, `config-nav.csv`), a `metadata:` setting in `_config.yml`, the `cb_page_gen` plugin in `_plugins/`, and an `objectid` column in the metadata CSV. If you see these, say so, and follow CollectionBuilder's conventions instead of "Preferred Jekyll setup". Don't add the minimal-site Gemfile or files.

**`AGENTS.md` is the authority.** Current CollectionBuilder templates ship an `AGENTS.md` at the repo root. It holds the framework's own rules for AI tools: where to make changes, which files never to edit, and what to ask about first.
- **If the repo has `AGENTS.md`:** read it before changing anything and follow it. Where it disagrees with this file, including the owner's preferences elsewhere in this file, **`AGENTS.md` wins**. When you notice such a conflict, tell the owner which rule you followed.
- **Make sure Claude Code loads it.** Claude Code reads `CLAUDE.md` automatically, but not `AGENTS.md`. The repo's `CLAUDE.md` should import it with a line reading `@AGENTS.md` (an *import*: Claude Code pulls the named file in as if it were part of `CLAUDE.md`). If that line is missing, suggest adding it.
- **If the repo has no `AGENTS.md`:** stop and tell the owner before changing any site files. The site may have been cloned from an older CollectionBuilder template, and the owner may want to copy `AGENTS.md` in from the current one. Until they decide, change only the data and config files (the metadata CSV, the `config-*.csv` files in `_data/`, `_data/theme.yml`, `_config.yml`), and **ask first** before editing anything in `_includes/`, `_layouts/`, `pages/`, or `_sass/`.

**Other conventions** (these apply unless `AGENTS.md` says otherwise):
- **`objectid`** is the stable ID and the basis of item URLs. Never rename, regenerate or reformat objectids without asking.
- **Keep the AI instruction files off the website.** Check that `exclude:` in `_config.yml` lists `AGENTS.md`, `CLAUDE.md`, `HUMANS.md` and `CLAUDE-TEMPLATE.md`. Current CollectionBuilder releases list the first three, but a site cloned from an older release, with the files copied in later, won't have them.
- **Use the site's own Gemfile and plugins** as they are. Don't upgrade gems or swap plugins unless asked.
- **The CollectionBuilder documentation** (collectionbuilder.github.io/cb-docs) describes the conventions. When unsure how something is meant to be configured, check it, or ask, before writing custom code.

## Project specifics

### Layout
[Folder-by-folder description.]

### Data and metadata
[Where the CSV lives, its columns, the ID field, encoding.]

### Site
[URL pattern, page types, what's generated. Deployment: local only, unless stated here.]

## Current state
[What exists and works right now, with counts if useful.]

## To-do
### Next session
1. [ ]
### Open, not scheduled
- [ ]
### Done
- [ ]

_Last updated: [date] ([machine]). [One line on where things stand.]_
