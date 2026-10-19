/**
 * A lazy family's English travels with its chunk. Each part (`core/src/i18n/locales/en/<part>.json`, all but
 * `core.json`) is registered (`addEnglish`) by the module that owns its words, and lands in that module's chunk only
 * when the family's group in `groups.mjs` names it — else core keeps it and nothing is saved. A module that says a
 * word of a part's namespace must then run where the part is registered: in the registering module's chunk, or in a
 * chunk that imports that one statically (the schedule sheet's imports the automations family's). Anywhere else, a
 * page that never loaded the registering chunk shows the keys: a wall that never opened `/fluvy` would say
 * `wall.back`. Read from the sources the bundle reaches, grouped as the bundle groups them.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { chunkOf } from '../groups.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PACKAGES = join(ROOT, 'packages');
const ENGLISH = join(PACKAGES, 'core', 'src', 'i18n', 'locales', 'en');

type Tables = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** A module as the guard sees it: what it imports statically, and the namespaces it says words of. */
interface Module {
  readonly id: string;
  readonly imports: readonly string[];
  readonly says: ReadonlySet<string>;
}

/** A family's English part: its file and its tables. */
interface Part {
  readonly id: string;
  readonly tables: Tables;
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;

/** Each workspace package by name: its folder and its exports (`.`, `./activity`, `./locales/en/*.json`). */
const WORKSPACE = new Map(
  readdirSync(PACKAGES)
    .filter((folder) => existsSync(join(PACKAGES, folder, 'package.json')))
    .map((folder) => {
      const { name, exports = {} } = readJson<{ name: string; exports?: Record<string, string> }>(
        join(PACKAGES, folder, 'package.json'),
      );
      return [name, { folder: join(PACKAGES, folder), exports }] as const;
    }),
);

/** Where an import leads: a file of the workspace (a `.js` import is its `.ts` source), else undefined (Lit, Node). */
function resolveImport(specifier: string, from: string): string | undefined {
  if (specifier.startsWith('.')) {
    const path = join(dirname(from), specifier);
    const source = path.replace(/\.js$/, '.ts');
    return existsSync(source) ? source : path;
  }
  const [scope = '', name = '', ...rest] = specifier.split('/');
  const pkg = WORKSPACE.get(`${scope}/${name}`);
  if (!pkg) return undefined;
  const sub = ['.', ...rest].join('/');
  for (const [key, target] of Object.entries(pkg.exports)) {
    const star = key.indexOf('*');
    if (star < 0) {
      if (key === sub) return join(pkg.folder, target);
      continue;
    }
    const tail = key.slice(star + 1);
    if (sub.startsWith(key.slice(0, star)) && sub.endsWith(tail))
      return join(pkg.folder, target.replace('*', sub.slice(star, sub.length - tail.length)));
  }
  return undefined;
}

/**
 * An import that brings only types (`import type`, or every name marked `type`): never taken for a chunk's import,
 * so the guard errs on the strict side.
 */
function typeOnly(clause: ts.ImportClause | undefined): boolean {
  // `import './x.js'`: for its effects
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  const names = clause.namedBindings;
  return (
    !clause.name &&
    names !== undefined &&
    ts.isNamedImports(names) &&
    names.elements.length > 0 &&
    names.elements.every((element) => element.isTypeOnly)
  );
}

/**
 * A module's static imports, the modules it fetches later (`import('…')`), and the namespaces it says words of: each
 * one it asks `strings()` for, and each key it names in full (`'energy-flow.grid'`, or a template's head that starts
 * a key, `` `history-bars.${kind}` ``) — a key of the catalogue, so an entity id (`camera.porch`) or a file name
 * (`history.csv`) is not one.
 */
function read(id: string, tables: Tables): { module: Module; later: string[] } {
  const imports: string[] = [];
  const later: string[] = [];
  const says = new Set<string>();
  if (!id.endsWith('.ts')) return { module: { id, imports, says }, later };
  const lead = (specifier: string, list: string[]): void => {
    const target = resolveImport(specifier, id);
    if (target) list.push(target);
  };
  const named = (text: string, whole: boolean): void => {
    const dot = text.indexOf('.');
    const table = dot > 0 ? tables[text.slice(0, dot)] : undefined;
    const key = text.slice(dot + 1);
    if (table && Object.keys(table).some((own) => (whole ? own === key : own.startsWith(key))))
      says.add(text.slice(0, dot));
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      if (!typeOnly(node.importClause) && ts.isStringLiteral(node.moduleSpecifier))
        lead(node.moduleSpecifier.text, imports);
      return;
    }
    if (ts.isExportDeclaration(node)) {
      if (!node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
        lead(node.moduleSpecifier.text, imports);
      return;
    }
    if (ts.isCallExpression(node)) {
      const [first] = node.arguments;
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        first &&
        ts.isStringLiteral(first)
      )
        lead(first.text, later);
      else if (ts.isIdentifier(node.expression) && node.expression.text === 'strings')
        for (const argument of node.arguments)
          if (ts.isStringLiteral(argument)) says.add(argument.text);
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      named(node.text, true);
    else if (ts.isTemplateExpression(node)) named(node.head.text, false);
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(id, readFileSync(id, 'utf8'), ts.ScriptTarget.ES2022, true));
  return { module: { id, imports, says }, later };
}

/** Every module the bundle reaches from its entry, statically or later. */
function scan(entry: string, tables: Tables): Module[] {
  const seen = new Map<string, Module>();
  const queue = [entry];
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    if (seen.has(id)) continue;
    const { module, later } = read(id, tables);
    seen.set(id, module);
    queue.push(...module.imports, ...later);
  }
  return [...seen.values()];
}

/**
 * What is wrong with where the English parts and the words they hold are: a part core keeps, a part with words no
 * module registers, a registrar in another chunk than its part, and a module that says a part's words in a chunk that
 * neither registers the part nor imports the chunk that does.
 */
function misplaced(modules: readonly Module[], parts: readonly Part[]): string[] {
  const name = (id: string): string => relative(ROOT, id);
  const problems: string[] = [];
  // the chunks each chunk imports statically: every one of them is evaluated before it is
  const edges = new Map<string, Set<string>>();
  for (const { id, imports } of modules)
    for (const target of imports) {
      const from = chunkOf(id);
      const to = chunkOf(target);
      if (from !== to) edges.set(from, (edges.get(from) ?? new Set()).add(to));
    }
  const loaded = (chunk: string): Set<string> => {
    const seen = new Set([chunk]);
    for (const next of seen) for (const to of edges.get(next) ?? []) seen.add(to);
    return seen;
  };
  const registered = new Map<string, string>();
  for (const part of parts) {
    const chunk = chunkOf(part.id);
    if (chunk === 'core')
      problems.push(
        `${name(part.id)} lands in core: its family's group in groups.mjs must name it`,
      );
    const owners = modules.filter(({ imports }) => imports.includes(part.id));
    if (!owners.length && Object.values(part.tables).some((table) => Object.keys(table).length))
      problems.push(`${name(part.id)} has words and no module registers it`);
    for (const owner of owners)
      if (chunkOf(owner.id) !== chunk)
        problems.push(
          `${name(owner.id)} registers ${name(part.id)} from ${chunkOf(owner.id)}, but the part lands in ${chunk}`,
        );
    for (const namespace of Object.keys(part.tables)) registered.set(namespace, chunk);
  }
  for (const { id, says } of modules)
    for (const namespace of says) {
      const chunk = registered.get(namespace);
      if (chunk && !loaded(chunkOf(id)).has(chunk))
        problems.push(
          `${name(id)} (${chunkOf(id)}) says ${namespace}, whose English the ${chunk} chunk registers`,
        );
    }
  return problems;
}

/**
 * The parts of a family still being built (its modules land a wave before its card): words no bundle module may say
 * or register yet. The card that brings the family into the bundle takes its part off this list, and must — the last
 * test fails the moment the bundle reaches it.
 */
const BEING_BUILT: ReadonlySet<string> = new Set([]);

const ALL_PARTS: readonly Part[] = readdirSync(ENGLISH)
  .filter((file) => file.endsWith('.json') && file !== 'core.json')
  .map((file) => ({ id: join(ENGLISH, file), tables: readJson<Tables>(join(ENGLISH, file)) }));
const PARTS = ALL_PARTS.filter(({ id }) => !BEING_BUILT.has(basename(id)));
const TABLES: Tables = Object.assign(
  readJson<Tables>(join(ENGLISH, 'core.json')),
  ...ALL_PARTS.map((part) => part.tables),
);
const MODULES = scan(join(PACKAGES, 'bundle', 'src', 'index.ts'), TABLES);
const sayers = (namespace: string): string[] =>
  MODULES.filter(({ says }) => says.has(namespace)).map(({ id }) => relative(ROOT, id));

describe('a family’s English', () => {
  it('is said only where its chunk has registered it', () => {
    expect(misplaced(MODULES, PARTS)).toEqual([]);
  });

  it('is said somewhere, every namespace with words: the guard sees who says them', () => {
    for (const { tables } of PARTS)
      for (const [namespace, table] of Object.entries(tables))
        if (Object.keys(table).length) expect(sayers(namespace), namespace).not.toEqual([]);
    expect(sayers('panel')).toContain('packages/cards/src/panel/panel.ts');
    expect(sayers('energy-flow')).toContain('packages/cards/src/grid/grid-card.ts');
    expect(sayers('history-bars')).toContain('packages/cards/src/history-bars/facts.ts');
    expect(sayers('automations')).toContain(
      'packages/cards/src/automations/sheet/schedule-sheet.ts',
    );
    // the wall's pieces say core's `wall`, never the panel's words
    expect(sayers('wall').sort()).toEqual([
      'packages/cards/src/wall/back.ts',
      'packages/cards/src/wall/corner.ts',
      'packages/cards/src/wall/toast.ts',
    ]);
  });

  it('is reported where a page could show its keys', () => {
    const at = (
      path: string,
      imports: readonly string[] = [],
      says: readonly string[] = [],
    ): Module => ({
      id: join(PACKAGES, path),
      imports: imports.map((target) => join(PACKAGES, target)),
      says: new Set(says),
    });
    const panel = { id: join(ENGLISH, 'panel.json'), tables: { panel: { back: 'Back' } } };
    const stray = { id: join(ENGLISH, 'stray.json'), tables: { stray: { word: 'Word' } } };
    expect(
      misplaced(
        [
          at('cards/src/panel/english.ts', ['core/src/i18n/locales/en/panel.json']),
          at('cards/src/panel/panel.ts', ['cards/src/panel/english.ts'], ['panel']),
          // the panel's chunk is imported statically: its words are here
          at('cards/src/strategy/views.ts', ['cards/src/panel/panel.ts'], ['panel']),
          // a wall that never opened the panel
          at('cards/src/wall/back.ts', [], ['panel']),
          at('cards/src/media/english.ts', ['core/src/i18n/locales/en/stray.json']),
        ],
        [panel, stray],
      ),
    ).toEqual([
      "packages/core/src/i18n/locales/en/stray.json lands in core: its family's group in groups.mjs must name it",
      'packages/cards/src/media/english.ts registers packages/core/src/i18n/locales/en/stray.json from media, but the part lands in core',
      'packages/cards/src/wall/back.ts (wall) says panel, whose English the panel chunk registers',
    ]);
  });

  it('waits for a family still being built: nothing the bundle reaches registers or says its words yet', () => {
    for (const part of ALL_PARTS.filter(({ id }) => BEING_BUILT.has(basename(id)))) {
      const registrars = MODULES.filter(({ imports }) => imports.includes(part.id));
      expect(
        registrars.map(({ id }) => relative(ROOT, id)),
        `${basename(part.id)} is in the bundle now: take it off BEING_BUILT`,
      ).toEqual([]);
      for (const namespace of Object.keys(part.tables))
        expect(sayers(namespace), namespace).toEqual([]);
      // its group names it, so the card's chunk will carry it
      expect(chunkOf(part.id)).not.toBe('core');
    }
  });
});
