# Contributing to Fluvy

Thank you for helping. Fluvy is a theme and card library for Home Assistant with a demanding design language; the
rules below keep every change at the same level.

## Before you start

- For anything larger than a fix, open an issue first and say what you want to change and why. Design questions
  are settled against `design/language.md`, the specification every card is built and reviewed against.
- Everything is in English: code, comments, commit messages, documentation. Every string the UI shows lives in the
  catalogues (`packages/core/src/i18n/locales/`, one per language; English in parts, `en/core.json` and one per
  lazy family): a new key goes into every language, and `pnpm i18n` checks them (see `docs/translating.md`).
- Never commit anything from your own Home Assistant: entity ids, names, areas, tokens, screenshots of your home.
  The demo home (`packages/demo-home`) is the house every example, test and screenshot lives in.

## Prerequisites

- Node 24 (`.nvmrc`) and pnpm 11 — `corepack enable` installs the version `package.json` names.
- Python 3.13 or newer and `ruff` (`pipx install ruff`) for the integration.
- Chromium for the visual tools: `pnpm --filter @fluvy/render exec playwright install chromium`. The browser
  download is deliberately not part of `pnpm install` (`pnpm-workspace.yaml`); this is the one manual step.

## Setup

```sh
pnpm install
pnpm build      # tokens → theme → styles → bundle, into custom_components/fluvy/
pnpm check      # prettier, eslint, tsc, vitest, the release invariants — what must pass before a commit
```

## Working on cards

```sh
pnpm --filter @fluvy/playground dev
```

opens the cards on a simulated `hass` at http://127.0.0.1:5183/ (`?sheet=home&mode=dark&width=360&lang=es`;
also `palette=`, `shape=`, `compare=linen,blaze`, `panel=appearance`, `activity=1`, `history=1`). The card
contract — base class, styles, markup, states, numbers, strings, actions, editor, layout, registration — is in
`packages/cards/README.md`. Every card must hold from the floor of a narrow column — 152 px for a card that takes half
a section, 211 px for a full one — up to a wall's 520 px, in light and dark, in every language Fluvy speaks, with
`unavailable`, `unknown` and missing entities drawn on purpose, at the size and in the anatomy the card has live.

Two tools decide whether a change is done:

```sh
node tools/render/measure.mjs --page "http://127.0.0.1:5183/?sheet=<sheet>" --frame '[data-frame]' --width 1400
pnpm visual                                              # the interaction suites
```

The measurer must report **0 violations** (the 4 px grid, control heights, touch targets, baselines, containment).

## Working on the theme and the shell

Palettes are seeds in `packages/tokens/src/palettes/`; the theme, the CSS and the look engine are generated from
them — never edit a generated file (`packages/ui/src/styles/generated/`, `packages/core/src/icons/{generated,mdi}.ts`,
`packages/theme/src/__tests__/ha-vars.json`), regenerate it with its generator. The shell's sheets for Home
Assistant's own pages live in `packages/core/src/shell/`; after a Home Assistant release, open an issue with what
the shell no longer matches (`docs/shell.md` says how to look).

## Contributing a palette

A palette is a file: `packages/tokens/src/palettes/community/<name>.fluvy-palette.json`, the same file the panel's
*Share this palette* writes (make one there: choose a custom accent, give it a title and your name, share it).
The file names its palette (`name`, lower case, dashes), a `title`, an `author`, an optional `description` and the
`palette` itself (a base, an accent, a fill, an optional highlight). `pnpm build` in `packages/tokens` checks it —
the file is named after its `name`, no other palette has that name, and both modes pass the contrast gates every
preset passes (an accent that cannot carry text at 4.5:1 gets a darker ink, as a preset's would) — and regenerates
`index.ts`, which the pull request includes. The panel lists it under *Community* with your name beside it.

## Trying it in Home Assistant

`tools/dev/README.md`: a throwaway instance in Docker, or `pnpm ha:install --config <folder>` for any
configuration folder you can write to. The integration's Python is checked with `ruff check custom_components`
and `ruff format custom_components`.

## Conventions

- TypeScript strict as `tsconfig.base.json` sets it; Lit pinned to Home Assistant's version; no literal colours,
  tokens only; design decisions follow `design/language.md`.
- Tests beside the code in `packages/cards`, in `src/__tests__/` in `core`, `tokens` and `ui`. A snapshot is
  updated only with an explanation in the pull request.
- Commit messages are imperative and name the area: `History: a mark is at its value`. One topic per pull request.
- Add a line to `CHANGELOG.md` under *Unreleased* for anything a user would notice.

## Pull requests

The template lists what to check: `pnpm check` green, a playground screenshot for a visual change, the measurer
at 0, documentation updated, every language (`pnpm i18n` clean), nothing from a private instance, and the sign-off below.

## Licensing of contributions

Fluvy is licensed under the GNU General Public License v3.0 (`LICENSE`). By submitting a contribution you
certify the [Developer Certificate of Origin](https://developercertificate.org) — that it is your own work or you
have the right to submit it — and you agree that it is licensed to the project under `LICENSE`, and you grant the
maintainer a perpetual, worldwide, non-exclusive, royalty-free licence to use, modify and redistribute it,
**including under other licence terms** (for example, should the project move to a different open-source licence).
You keep your copyright. Sign every commit with `git commit -s`.

## Security

Please report security problems privately; see `SECURITY.md`.
