# Development

The repository is a pnpm workspace (Node 24, pnpm 11) with a Python integration beside it. `CONTRIBUTING.md` has the
setup and the conventions; this page is the map.

## Layout

```
custom_components/fluvy/   the integration Home Assistant installs (Python) — the build lands in frontend/ and themes/
packages/tokens/           @fluvy/tokens   palettes (OKLCH → hex), scales, contrast gates, every Home Assistant variable the theme sets;
                                           src/runtime.ts = the palette engine as the browser runs it
packages/theme/            @fluvy/theme    the theme file, emitted from the tokens and validated offline
packages/ui/               @fluvy/ui       glyphs, templates, <fluvy-ruler>, <fluvy-dial>, motion; styles/ = the approved CSS
packages/core/             @fluvy/core     Home Assistant types, entity resolution, formatting, actions, i18n (the catalogues), history,
                                           the card base class; src/shell/ = the sheets for Home Assistant's own pages;
                                           src/settings/ = Fluvy's settings; src/look/ = the look engine
packages/cards/            @fluvy/cards    one folder per card, registered in src/index.ts (see packages/cards/README.md);
                                           src/strategy/ = the automatic dashboards (the templates); src/panel/ = the settings panel
packages/bundle/           @fluvy/bundle   the build: the entry, its chunks, the loader and the fonts
packages/fonts/            Inter (OFL), subset
packages/demo-home/        @fluvy/demo-home  the fictional house the tests and the playground share
apps/playground/           the real cards on a simulated hass: screenshots, the measurer, interaction tests
apps/demo/                 the public demo on GitHub Pages: the playground's sheets and pages behind a landing page
apps/design-lab/           the approved design sheets (static HTML on packages/ui/styles)
design/                    the design language and the approved renders
tools/render/              screenshots, the alignment measurer, interaction tests, contact sheets
tools/icons/               the glyph outliner and the Material icon map
tools/brand/               the brand files, derived from brand/mark.svg
tools/release/             version bump, release invariants (with every chunk's budget), the leak scan
tools/docs/                the card reference, generated from the code into docs/cards.md
tools/dev/                 a throwaway Home Assistant, and the installer for any configuration folder
```

## The build

```
pnpm build
  @fluvy/tokens build     src/build/run.ts → packages/tokens/dist (palettes.json, tokens.json, lab.css, the contrast report)
  @fluvy/theme build      src/build.ts → custom_components/fluvy/themes/fluvy.yaml (validated first)
  @fluvy/ui build:styles  the approved CSS → packages/ui/src/styles/generated/*.ts (Lit css literals; committed)
  @fluvy/bundle build     vite → custom_components/fluvy/frontend/{fluvy.js, chunks/*.js} + finish.mjs (loader, fonts, manifest)
```

The bundle is one ES module, `fluvy.js`, that imports `chunks/core-<hash>.js` (everything a page needs) and fetches
`chunks/{activity,history,panel,pages,strategy,wall,weather,media,energy,devices,editor,view-icons,lang-*}-<hash>.js` on demand — the Activity page,
the History page, the settings panel, the date picker they share, the automatic dashboards' strategy (when a dashboard
asks for it), wall mode (on a device that is a wall), the weather card and the media, energy and devices families
(fetched as the bundle starts: their cards are announced in core — `src/energy-family.ts` and its siblings, their
names and heights — and defined as `src/energy-cards.ts` and its siblings land; Home Assistant builds a card again
the moment its tag is defined), the cards' visual editor (when a card is edited)
and a language's catalogue (English ships in core). Lit is bundled, pinned to Home Assistant's version. `finish.mjs` writes
`manifest.json` with every file's size and hash and a **build stamp**, and fails the build when the initial set goes
over **222 KB gzip**; `tools/release/check.mjs --release` holds every chunk to its own budget.

## How it reaches Home Assistant

The integration (`custom_components/fluvy`) serves `frontend/` under `/fluvy-frontend/<version>-<build>/`: one URL per
build, so the month-long cache Home Assistant puts on static files can never serve an old build. It loads
`loader.js` on every page and registers the panel with it; the loader restores the last look before Home Assistant
paints, registers the `fluvy:` icon set, waits for Home Assistant's connection and imports `fluvy.js` from the same
folder — the same URL the dashboard resource names, so the browser evaluates the build once. The theme file is
written into `<config>/themes/fluvy/` and reloaded. `docs/installation.md` lists the Repairs it raises.

## Version

One number: `version` in the root `package.json`, mirrored in every workspace package and in
`custom_components/fluvy/manifest.json`. `pnpm release:version 1.2.0` sets all of them and opens the changelog
entry; `node tools/release/check.mjs` (part of `pnpm check`) fails when they disagree, and `--release` also checks
the built folder. A tag `v1.2.0` makes `release.yml` build, check, zip the integration folder as `fluvy.zip` and
publish the release HACS installs from.

## Generated files

Regenerated by their generators, never edited: `packages/ui/src/styles/generated/` (`pnpm --filter @fluvy/ui
build:styles`), `packages/core/src/icons/generated.ts` and `mdi.ts` (`tools/icons/README.md`),
`packages/theme/src/__tests__/ha-vars.json` (`packages/theme/scripts/ha-vars.mjs <clone of home-assistant/frontend>`),
the brand files (`tools/brand/README.md`), the strategy's golden snapshot (`vitest -u`, with an explanation).

## The playground

```sh
pnpm --filter @fluvy/playground dev      # http://127.0.0.1:5183/
```

`?sheet=home` mounts one sheet (default: all); `mode=dark`, `width=392`, `lang=es`, `theme=off` (the cards on their
own tokens), `palette=volt`, `shape=round`, `accent=%23ff4a1a&character=vivid&base=cool`, `compare=linen,volt`,
`panel=appearance&state=pending,guest` (`panel=preferences&state=menu` opens the language menu; `nopopover=1` takes
the Popover API away, as an older WebView has none; `panel=dashboard&state=dashboards` has every template's dashboard
created, `recreate` its Recreate row armed; `panel=wall&state=wall` makes this browser a wall panel), `sheet=home&wall=1&moment=awake|asleep|dim|paused|corner|night` (the page as a
wall panel on the real controller: `after=` minutes, `bg=wall` the mesh), `activity=1&moment=burst`, `history=1&moment=week`. The
playground's `hass` is a small, honest stand-in: a state store, service calls that change it after a delay, and
canned answers for the reads the cards make.

## The demo

```sh
pnpm --filter @fluvy/demo dev            # http://127.0.0.1:5185/fluvy/  (the playground keeps :5183)
pnpm --filter @fluvy/demo build && pnpm --filter @fluvy/demo preview   # the built site on :4173
DEMO=http://127.0.0.1:4173/fluvy/ node tools/render/demo-smoke.mjs     # what visitors get, checked
```

`apps/demo` is the playground as a visitor sees it: its sheets grouped into families, its pages, and the settings
panel, behind a landing page drawn with the design system's own parts. The look runs on Fluvy's own settings
machinery kept in memory (`@fluvy/playground/look-memory`): a palette dot on the landing and the Appearance tab
change the same settings, live. The URL takes the playground's parameters (`sheet`, `panel`, `history`, `activity`,
`mode`, `width`, `lang`, `palette`, `accent`…) and `device=phone|phone-l|tablet|desktop`; what a card cannot do here
(a more-info dialog, a page of Home Assistant) becomes a notice. `pages.yml` builds it on every push to `main`,
smoke-tests the built site and deploys it to https://acosta290.github.io/fluvy/.

## The tools

```sh
node tools/render/shot.mjs --sheet home --mode dark --width 360 --out apps/playground/out/home-dark.png
node tools/render/measure.mjs --page "http://127.0.0.1:5183/?sheet=home" --frame '[data-frame]' --width 1400
pnpm measure                                             # the measurer on every sheet and every panel tab, at 360, 412 and 1400
pnpm visual                                              # every interaction suite
pnpm docs:cards                                          # the card tables of docs/cards.md, from the code (pnpm check fails when they drift)
node tools/render/render.mjs --page apps/design-lab/sheets/home.html --palette linen --mode all --width 900
```

The measurer is the quality gate: the 4 px grid at every device pixel ratio, control heights, icon boxes, touch
targets, baselines, text inside its box, containment, pill sides — **0 violations** or the change is not done.

## Motion clips

```sh
pnpm clips                                        # every clip → docs/media/*.gif and *.mp4 (the playground on :5183, ffmpeg on the PATH)
node tools/render/clip.mjs --clip dimmer --keep-frames 1
```

`tools/render/clip.mjs` plays the gestures the interaction suites prove (`tools/render/lib/gestures.mjs` is one
module for both) on the playground with a drawn touch indicator, records every paint through Chromium's screencast
as lossless PNG frames with their timestamps, and encodes them with the system's ffmpeg: an H.264 mp4 and a GIF
whose palette is computed from what changes. Frames are the screencast's, at CSS pixels; a GIF over 4 MB fails the
run. Re-record after a change to what a clip shows, and commit the media.

## The integration

Python 3.13+, checked with `ruff check custom_components` and `ruff format custom_components` (`pyproject.toml`).
`tools/dev/README.md` runs it in a throwaway Home Assistant; `pnpm ha:install --config <folder>` puts a build into
any configuration folder.
