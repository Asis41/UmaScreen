// Self-check: every Spanish UI text has its English entry in i18n.js (EN). Run: node test/i18n.test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { t, setLang, EN } = require('../i18n');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const texts = new Set();

// t('...') literals in the code
for (const f of ['renderer.js', 'main.js']) {
  for (const m of read(f).matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) texts.add(m[1].replace(/\\'/g, "'"));
}
// labels in tables that are translated where they are used: t(label)
const renderer = read('renderer.js');
const blocks = [/const SKILL_FILTERS = \[[\s\S]*?\n\];/, /const EFFECTS = \{[\s\S]*?\n\};/, /const SOURCE_LABELS = \{[\s\S]*?\n\};/,
  /const ACTION_LABELS = \{.*\};/, /for \(const x of \[[\s\S]*?\]\) d\.append/];
for (const re of blocks) {
  const b = renderer.match(re);
  assert(b, `bloque no encontrado: ${re}`);
  for (const m of b[0].matchAll(/'([^']+)'/g)) if (!/^[a-z0-9]+$/.test(m[1])) texts.add(m[1]);
}
// static texts and placeholders of index.html (applyLang in renderer.js)
const html = read('index.html').replace(/<script[\s\S]*?<\/script>/g, '');
for (const m of html.matchAll(/>([^<]+)</g)) if (m[1].trim()) texts.add(m[1].trim());
for (const m of html.matchAll(/placeholder="([^"]+)"/g)) texts.add(m[1]);

const missing = [...texts].filter((s) => !(s in EN));
assert.deepStrictEqual(missing, [], `Faltan en EN (i18n.js):\n${missing.join('\n')}`);

// placeholders survive translation
setLang('en');
assert.strictEqual(t('y {n} más… afina la búsqueda', { n: 3 }), 'and 3 more… refine the search');
for (const [es, en] of Object.entries(EN)) {
  const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
  assert.strictEqual(vars(en), vars(es), `variables distintas en: ${es}`);
}
setLang('es');
assert.strictEqual(t('Modo edición'), 'Modo edición');
setLang('xx'); // unknown -> Spanish
assert.strictEqual(t('Salir'), 'Salir');
console.log(`i18n OK: ${texts.size} textos traducidos`);
