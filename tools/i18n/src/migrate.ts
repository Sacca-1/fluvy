/**
 * One-off: the string tables as they were written (core's `en.ts` / `es.ts`, every card's `strings.ts`, the
 * pages' shared words, the weather words) become the catalogues in `packages/core/src/i18n/locales/` (English's
 * parts, `es.json`), one namespace per table — read with the TypeScript compiler, never transcribed by hand.
 *
 *   pnpm --filter @fluvy/i18n migrate
 *
 * A key two sources give different words for is reported and stops the run (they are merged when the words agree).
 */
import { readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { writeCatalogue } from './lib.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CORE = join(ROOT, 'packages', 'core', 'src', 'i18n');
const CARDS = join(ROOT, 'packages', 'cards', 'src');
const LANGUAGES = ['en', 'es'] as const;
type Language = (typeof LANGUAGES)[number];
type Table = Record<string, string>;
type Catalogue = Record<string, Table>;

/** The shared tables spread into several cards' tables: each is a namespace of its own. */
const SHARED: Record<string, { file: string; namespace: string }> = {
  PAGE_WORDS: { file: join(CARDS, 'shared', 'page-words.ts'), namespace: 'page' },
  WEATHER_WORDS: { file: join(CARDS, 'shared', 'weather.ts'), namespace: 'weather' },
};

/** Where a file's tables go: by the folder, or by the exported name when a file holds several. */
function namespaceOf(file: string, exported: string): string {
  const folder = basename(dirname(file));
  if (folder === 'alarm' && exported === 'k') return 'keypad';
  return folder;
}

const parse = async (file: string): Promise<ts.SourceFile> =>
  ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.ES2022, true);

const nameOf = (name: ts.PropertyName): string =>
  ts.isStringLiteral(name) || ts.isIdentifier(name) || ts.isNumericLiteral(name)
    ? name.text
    : (() => {
        throw new Error(`unsupported property name: ${name.getText()}`);
      })();

const textOf = (node: ts.Expression, where: string): string => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  throw new Error(`${where}: a value that is not a string literal: ${node.getText()}`);
};

/** The object literal a variable of that name holds in the file (`const en = { … }`). */
function variableLiteral(source: ts.SourceFile, name: string): ts.ObjectLiteralExpression {
  let found: ts.ObjectLiteralExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      let init: ts.Expression = node.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) init = init.expression;
      if (ts.isObjectLiteralExpression(init)) found = init;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!found) throw new Error(`${source.fileName}: no object literal named ${name}`);
  return found;
}

/**
 * A language's table out of an object literal: its own entries, and what it spreads from a shared table (named, so
 * the caller can keep those in their own namespace).
 */
function readTable(
  literal: ts.ObjectLiteralExpression,
  source: ts.SourceFile,
  where: string,
): { own: Table; spreads: string[] } {
  const own: Table = {};
  const spreads: string[] = [];
  for (const property of literal.properties) {
    if (ts.isPropertyAssignment(property)) {
      own[nameOf(property.name)] = textOf(
        property.initializer,
        `${where} ${nameOf(property.name)}`,
      );
    } else if (ts.isSpreadAssignment(property)) {
      const expression = property.expression;
      if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression))
        spreads.push(expression.expression.text);
      else throw new Error(`${where}: unsupported spread ${expression.getText()}`);
    } else if (ts.isShorthandPropertyAssignment(property)) {
      const inner = readTable(variableLiteral(source, property.name.text), source, where);
      Object.assign(own, inner.own);
      spreads.push(...inner.spreads);
    } else throw new Error(`${where}: unsupported property ${property.getText()}`);
  }
  return { own, spreads };
}

/** Every `createStrings({ en, es })` call in a file, with the exported name it is assigned to. */
function tablesIn(
  source: ts.SourceFile,
): { exported: string; literal: ts.ObjectLiteralExpression }[] {
  const out: { exported: string; literal: ts.ObjectLiteralExpression }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 'createStrings'
    ) {
      const argument = node.initializer.arguments[0];
      if (argument && ts.isObjectLiteralExpression(argument))
        out.push({ exported: node.name.text, literal: argument });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const languageLiteral = (
  literal: ts.ObjectLiteralExpression,
  language: Language,
  source: ts.SourceFile,
): ts.ObjectLiteralExpression => {
  for (const property of literal.properties) {
    if (ts.isPropertyAssignment(property) && nameOf(property.name) === language) {
      if (ts.isObjectLiteralExpression(property.initializer)) return property.initializer;
      throw new Error(`${source.fileName}: ${language} is not an object literal`);
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === language)
      return variableLiteral(source, language);
  }
  throw new Error(`${source.fileName}: no ${language} table`);
};

const catalogues: Record<Language, Catalogue> = { en: {}, es: {} };
const conflicts: string[] = [];

function put(
  language: Language,
  namespace: string,
  key: string,
  text: string,
  where: string,
): void {
  const table = (catalogues[language][namespace] ??= {});
  const existing = table[key];
  if (existing !== undefined && existing !== text)
    conflicts.push(`${language} ${namespace}.${key}: "${existing}" vs "${text}" (${where})`);
  else table[key] = text;
}

// 1. core: `'namespace.key': 'text'`
for (const language of LANGUAGES) {
  const source = await parse(join(CORE, `${language}.ts`));
  const { own } = readTable(variableLiteral(source, language), source, `core ${language}`);
  for (const [full, text] of Object.entries(own)) {
    const dot = full.indexOf('.');
    put(language, full.slice(0, dot), full.slice(dot + 1), text, `core/${language}.ts`);
  }
}

// 2. the shared tables, each a namespace
for (const [name, { file, namespace }] of Object.entries(SHARED)) {
  const source = await parse(file);
  const literal = variableLiteral(source, name);
  for (const language of LANGUAGES) {
    const { own } = readTable(
      languageLiteral(literal, language, source),
      source,
      `${name} ${language}`,
    );
    for (const [key, text] of Object.entries(own))
      put(language, namespace, key, text, basename(file));
  }
}

// 3. every card's tables: its own words in its namespace; what it spreads stays where it lives
const files: string[] = [];
for (const folder of await readdir(CARDS, { withFileTypes: true })) {
  if (!folder.isDirectory()) continue;
  for (const name of ['strings.ts', 'rows.ts']) {
    const file = join(CARDS, folder.name, name);
    if (
      await readFile(file, 'utf8').then(
        () => true,
        () => false,
      )
    )
      files.push(file);
  }
}
const namespacesOfCards: Record<string, string[]> = {};
for (const file of files.sort()) {
  const source = await parse(file);
  for (const { exported, literal } of tablesIn(source)) {
    const namespace = namespaceOf(file, exported);
    for (const language of LANGUAGES) {
      const { own, spreads } = readTable(
        languageLiteral(literal, language, source),
        source,
        `${basename(dirname(file))}/${basename(file)} ${language}`,
      );
      const shared = spreads.map((s) => SHARED[s]?.namespace ?? s);
      // a card's own word for a shared key stays the card's (the clock says "Clear night", the library "Clear")
      for (const [key, text] of Object.entries(own))
        put(language, namespace, key, text, `${basename(dirname(file))}/${basename(file)}`);
      if (language === 'en') namespacesOfCards[namespace] = [namespace, ...shared];
    }
  }
}

if (conflicts.length) {
  console.error(`✗ ${conflicts.length} keys with different words:\n  ${conflicts.join('\n  ')}`);
  process.exit(1);
}

for (const language of LANGUAGES) {
  const files = await writeCatalogue(language, catalogues[language]);
  const keys = Object.values(catalogues[language]).reduce((n, t) => n + Object.keys(t).length, 0);
  console.log(
    `${files.join(', ')}: ${Object.keys(catalogues[language]).length} namespaces, ${keys} keys`,
  );
}
console.log(
  `card namespaces (with what they spread):\n  ${Object.entries(namespacesOfCards)
    .map(([ns, all]) => `${ns}: strings(${all.map((n) => `'${n}'`).join(', ')})`)
    .join('\n  ')}`,
);
