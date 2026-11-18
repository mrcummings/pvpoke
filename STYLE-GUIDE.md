<!--
  STYLE-GUIDE.md: the shared look of the game projects.

  MASTER COPY: Google Drive, folder "GH-Projects". Make changes there first, then copy the
  updated file, plus assets/css/theme.css and assets/js/theme.js if they changed, into every
  repo in the tracker below. A copy inside a repo is not the master.
-->

# Game projects style guide

The game projects are separate sites, but they should look like one family. They share:
- the same warm neutral colors
- the same fonts
- the same corner radius
- the same Light/Dark toggle

**Each project has one accent color of its own**, which is its identity.

## Tracker

Guide version: **2026-11-11**

| Repo | Accent | Adopted | Notes |
|---|---|---|---|
| mrcummings/game-hub | Plum | 2026-11-11 | The reference version; the cards show each project's accent |
| mrcummings/tes-lore | Amber | 2026-11-11 | Book texts use `--font-text` (Georgia) |
| mrcummings/eu4map | Forest green | 2026-11-11 | Exceptions: 13px base size; the map's own colors aren't themed |
| mrcummings/pkmn-tracker | Teal | 2026-11-11 | Keeps its game colors (caught gold, Poké Ball, sprite tiles) |
| mrcummings/pvpoke | Blue | 2026-11-18 | Wide data tables scroll inside their own box, with the header row and first column kept in view |

## How it's built

Every project holds **identical copies** of two shared files, plus its own stylesheet:

| File | What it does | Shared? |
|---|---|---|
| `assets/css/theme.css` | Colors, fonts and corner radius as CSS custom properties; a few base styles; the toggle's look | Identical in every repo |
| `assets/js/theme.js` | Sets light or dark before the page is drawn, and runs the toggle | Identical in every repo |
| The project's own stylesheet | Its accent, and its own layout, using the shared names | Per project |

**Order in `<head>`.** `theme.js` comes first, without `defer` or `async`, so the theme is set before anything is drawn. Then `theme.css`, then the project's stylesheet:

```html
<script src="/assets/js/theme.js"></script>
<link rel="stylesheet" href="/assets/css/theme.css">
<link rel="stylesheet" href="/assets/css/site.css">
```

**Changing a shared file:** change the master first, then copy the file into every repo. Never edit one project's copy on its own, or the copies drift apart. Exclude `STYLE-GUIDE.md` from each Jekyll build (`exclude:` in `_config.yml`).

## Light and Dark

- **Every project supports both**, with a toggle in its header.
- **There are two states, Light and Dark.** On the first visit, the page follows the system setting. After a click, it stays on the choice.
- **The choice is saved per project.** The browser stores it per address, and each project has its own port, so each project remembers its own choice. That's intended.
- **Without JavaScript**, the page still follows the system setting (through `prefers-color-scheme`), and the toggle stays hidden.

The toggle button, placed in the header:

```html
<button type="button" class="theme-toggle" data-theme-toggle hidden>Theme</button>
```

`theme.js` fills in its label: "☾ Dark" in light mode, "☀ Light" in dark mode. A project with its own button style (eu4map's icon buttons, for example) can use any element with `data-theme-toggle`.

## Colors

### Shared neutrals (warm)

| Name | Use | Light | Dark |
|---|---|---|---|
| `--bg` | Page background | `#f7f5f0` | `#1c1a17` |
| `--surface` | Cards, bars, raised areas | `#fffdf9` | `#25221e` |
| `--panel` | Inset areas, chips, table stripes | `#efebe2` | `#2d2a25` |
| `--text` | Main text | `#26231f` | `#ebe6dc` |
| `--muted` | Secondary text | `#6b655b` | `#a59f93` |
| `--border` | Borders and dividers | `#ddd6c9` | `#3d3933` |
| `--ok` | Success, "running" | `#286b35` | `#6cc283` |
| `--warn` | Warnings | `#7d5600` | `#e0b04a` |
| `--danger` | Destructive actions, errors | `#b3362b` | `#ef8476` |
| `--on-accent` | Text on an accent-filled button | `#ffffff` | `#1c1a17` |
| `--shadow` | Shadow for cards and menus | light shadow | darker shadow |

### Accents, one per project

| Project | Accent | Light | Dark |
|---|---|---|---|
| game-hub | Plum | `#6a4c93` | `#c3a6e8` |
| pkmn-tracker | Teal | `#0e7470` | `#4fc9c3` |
| tes-lore | Amber | `#8a5320` | `#e0aa6c` |
| eu4map | Forest green | `#2b6a4f` | `#7cc49e` |
| pvpoke | Blue | `#2f5a9e` | `#8fb3ea` |

Each project sets its accent once, at the top of its own stylesheet:

```css
:root { --accent-light: #0e7470; --accent-dark: #4fc9c3; }
```

`theme.css` turns that into `--accent`, using the right value for the current mode, and into `--accent-soft`, a faint wash of the accent for active or selected states. **Use the accent for:** the header underline, links, primary buttons, focus outlines, hover borders, and the active tool or tab.

**The hub's copy:** game-hub's `_data/projects.yml` repeats each project's accent (`accent:` and `accent_dark:`) for the stripe on its card. When an accent changes, change it in both places.

### Project-specific colors

Colors that *mean* something in a project stay that project's own. Examples: pkmn-tracker's caught gold and sprite tiles, and eu4map's map colors. Rules for them:
- Define them as custom properties in the project's stylesheet.
- Give them a dark value too, if they appear on page backgrounds.
- **Content isn't themed.** Colors that are the user's data (eu4map's painted provinces, water, borders, and its exported PNG/SVG) look the same in both modes.

### Contrast

Text and accent colors must reach a contrast ratio of at least **4.5:1** (the WCAG AA standard for normal text) against `--bg`, `--surface` and `--panel`, in both modes. All the values above were checked by calculation. Check any new color the same way before adopting it.

## Type

| Name | Use | Value |
|---|---|---|
| `--font-body` | All interface and body text | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` (Segoe UI on Windows) |
| `--font-heading` | `h1` to `h3`, site titles | `Georgia, "Times New Roman", serif`, weight 500 |
| `--font-text` | Long-form reading text (tes-lore's books) | Georgia |
| `--font-mono` | Code, hex values, IDs | `ui-monospace, Consolas, monospace` |

- **No web fonts or CDNs.** Every font above is already installed on Windows.
- **Base size 16px**, line height 1.5. **Exception: eu4map uses 13px**, because it's a dense editing tool.

## Shapes

| Name | Use | Value |
|---|---|---|
| `--radius-sm` | Inputs, buttons, chips | 4px |
| `--radius` | Cards, panels, menus | 8px |

A project may use a larger radius for a special element (pkmn-tracker's sprite tiles, for example), but not for ordinary controls.

## Layout

Layout stays per project. Headers follow one pattern:
- the site title in the heading font, at the left
- **an 8px underline in the project's accent** (`border-bottom: 8px solid var(--accent)`), the main place each project shows its color
- the theme toggle at the right

game-hub's cards also have a 12px top stripe in each project's accent. The hub has almost no links or buttons, so this is where its accent shows.

eu4map keeps its full-screen app layout and puts the toggle with its other header buttons.

## Adding a new project

1. Copy `assets/css/theme.css` and `assets/js/theme.js` in unchanged, and add the `<head>` lines and the toggle button.
2. Pick an accent with a light and a dark value that pass the contrast check, and that's clearly different from the accents already in use. Add it to the accent table and the tracker.
3. Add `accent:` and `accent_dark:` to its entry in game-hub's `_data/projects.yml`.
4. Exclude `STYLE-GUIDE.md` from its Jekyll build.
