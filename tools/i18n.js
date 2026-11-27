// Spanish translation of GameTora skill descriptions and conditions (es.json). Not part of the build.
//   node tools/i18n.js missing                 how many texts still have no translation
//   node tools/i18n.js export <dir> [size]     write untranslated texts in batches: <dir>/batch-NN.json
//   node tools/i18n.js merge <dir>             read <dir>/batch-NN.es.json (array, same order) and add them to es.json
// Source texts come from the app's cache (%APPDATA%\umascreen\skills-v*.json, newest).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ES = path.join(ROOT, 'es.json');
const DATA = path.join(process.env.APPDATA || '', 'umascreen');
const COND_FIELDS = ['desc', 'meaning', 'note', 'values'];

function loadCache() {
  const files = fs.readdirSync(DATA).filter((f) => /^skills-v\d+\.json$/.test(f))
    .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]));
  if (!files.length) throw new Error(`No hay caché de habilidades en ${DATA}: abre la app una vez.`);
  return JSON.parse(fs.readFileSync(path.join(DATA, files[0]), 'utf8'));
}
const loadES = () => (fs.existsSync(ES) ? JSON.parse(fs.readFileSync(ES, 'utf8')) : {});

// every text to translate, as { key, en, ctx }: key 'd:<english>' for descriptions, 'c:<name>:<field>' for conditions
function sources(cache) {
  const out = new Map();
  for (const s of cache.skills) if (s.desc && !out.has('d:' + s.desc)) out.set('d:' + s.desc, { en: s.desc, ctx: s.name });
  for (const [name, c] of Object.entries(cache.conditions)) {
    for (const f of COND_FIELDS) if (c[f]) out.set(`c:${name}:${f}`, { en: c[f], ctx: `condición ${name} (${f})` });
  }
  return out;
}

const has = (es, key) => {
  if (key.startsWith('d:')) return !!es.descs?.[key.slice(2)];
  const [, name, f] = key.match(/^c:(.*):(\w+)$/);
  return !!es.conditions?.[name]?.[f];
};

// numbers (with optional decimals / %), ◎○× and `code` must survive translation
const keep = (t) => [...(t.match(/\d+(?:[.,]\d+)?%?|[◎○×]|[a-z_]+(?:==|>=|<=|!=|>|<)\S+/g) || [])].map((x) => x.replace(',', '.')).sort();
function checkTranslation(en, es) {
  if (typeof es !== 'string' || !es.trim()) return 'vacía';
  const a = keep(en).join(' '), b = keep(es).join(' ');
  return a === b ? '' : `números/símbolos distintos: [${a}] vs [${b}]`;
}

function merge(es, batch, translated) {
  if (translated.length !== batch.length) throw new Error(`El lote tiene ${batch.length} textos y la traducción ${translated.length}`);
  const problems = [];
  batch.forEach(({ key, en }, i) => {
    const err = checkTranslation(en, translated[i]);
    if (err) return problems.push(`#${i} ${key.slice(0, 60)}: ${err}`);
    if (key.startsWith('d:')) (es.descs ||= {})[key.slice(2)] = translated[i].trim();
    else {
      const [, name, f] = key.match(/^c:(.*):(\w+)$/);
      ((es.conditions ||= {})[name] ||= {})[f] = translated[i].trim();
    }
  });
  return problems;
}

module.exports = { checkTranslation, merge };

if (require.main === module) {
  const [cmd, dir, size = 250] = process.argv.slice(2);
  const es = loadES();
  const missing = [...sources(loadCache())].filter(([k]) => !has(es, k)).map(([key, v]) => ({ key, ...v }));
  if (cmd === 'missing') {
    const d = missing.filter((m) => m.key.startsWith('d:')).length;
    console.log(`Faltan ${d} descripciones y ${missing.length - d} textos de condiciones.`);
  } else if (cmd === 'export') {
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i * size < missing.length; i++) {
      const f = path.join(dir, `batch-${String(i + 1).padStart(2, '0')}.json`);
      fs.writeFileSync(f, JSON.stringify(missing.slice(i * size, (i + 1) * size), null, 1));
      console.log(f);
    }
  } else if (cmd === 'merge') {
    let all = [];
    for (const f of fs.readdirSync(dir).filter((x) => /^batch-\d+\.json$/.test(x)).sort()) {
      const tr = path.join(dir, f.replace('.json', '.es.json'));
      if (!fs.existsSync(tr)) continue;
      const problems = merge(es, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), JSON.parse(fs.readFileSync(tr, 'utf8')));
      all = all.concat(problems.map((p) => `${f} ${p}`));
    }
    fs.writeFileSync(ES, JSON.stringify(es, null, 1) + '\n');
    console.log(all.length ? all.join('\n') : 'Sin problemas.');
    console.log(`es.json: ${Object.keys(es.descs || {}).length} descripciones, ${Object.keys(es.conditions || {}).length} condiciones.`);
  } else console.log('Uso: node tools/i18n.js missing | export <dir> [tamaño] | merge <dir>');
}
