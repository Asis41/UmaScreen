const assert = require('assert');
const { extract, extractSection, skillList, conditionInfo, latestCM } = require('../scrape');

const html = `<div class="info"><p>Hola</p><img src="/a.png"></div><div class="info"><p>Mundo</p></div>`;
const r = extract(html, '.info', 'https://example.com/page');
assert.strictEqual(r.body, 'Hola\n\nMundo');
assert.strictEqual(r.image, 'https://example.com/a.png');
assert.throws(() => extract(html, '.nada', 'https://example.com'));

const page = `
  <h2>Intro</h2><p>no</p>
  <h3 class="x">CM23 Stat Guidelines</h3>
  <table class="t" onclick="evil()"><tr><td colspan="2" style="color:red">1500+</td></tr></table>
  <p>Texto <a href="https://evil.com">link</a><script>alert(1)</script></p>
  <img src="data:image/gif;base64,AAA" data-src="https://img.game8.co/1.png" width="30" onerror="x()">
  <img src="javascript:alert(1)">
  <h4>Siguiente</h4><p>fuera</p>`;
const s = extractSection(page, 'stat guidelines', 'https://game8.co/x').html;
assert.ok(s.includes('<td colspan="2">1500+</td>'), s);
assert.ok(s.includes('<img src="https://img.game8.co/1.png" alt="" width="30">'), s);
assert.ok(s.includes('Texto link'), s);
for (const bad of ['onclick', 'onerror', 'style', 'script', 'href', 'javascript', 'fuera', 'class']) assert.ok(!s.includes(bad), `${bad} in ${s}`);
assert.throws(() => extractSection(page, 'Nope', 'https://game8.co/x'));
const refs = { supports: new Map([[30004, 'SSR Gold Ship'], [10005, 'R Bakushin']]) };
const sk = skillList([
  { name_en: 'Groundwork', enname: 'Groundwork', desc_en: 'Accel', endesc: 'old', rarity: 2, type: ['run'], iconid: 20041,
    cost: 100, sup_hint: [[30004], [10005]], loc: { en: { sup_hint: [[30004], []] } },
    condition_groups: [{ base_time: 30000, condition: 'activate_count_start>=3', effects: [{ type: 31, value: 2000 }, { type: 999 }] }] },
  { enname: 'JP only', endesc: 'Speed up', unreleased: ['en'], sup_hint: [[30004]] },
  { name_en: 'Groundwork', desc_en: 'Accel' },
  { desc_en: 'no name' },
], refs);
assert.strictEqual(sk.length, 2);
assert.deepStrictEqual(sk[0].tags, ['run', 'acc', 'r2', 'glb']);
assert.strictEqual(sk[0].icon, 20041);
assert.strictEqual(sk[0].cost, 100);
assert.deepStrictEqual(sk[0].groups, [{ dur: 3, cond: 'activate_count_start>=3', pre: '', effects: [[31, 2000], [999, undefined]] }]);
assert.deepStrictEqual(sk[0].src, { supports: ['SSR Gold Ship', 'R Bakushin · JP'] });
assert.deepStrictEqual(sk[1].tags, ['jp']);
assert.deepStrictEqual(sk[1].src, { supports: ['SSR Gold Ship · JP'] }); // not on Global at all
const ci = conditionInfo(
  [{ name: 'accumulatetime', desc: 'Seconds', example: 'accumulatetime>=5', example_meaning: '5 s', note: '', values: '' }, { name: 'corner' }],
  { accumulatetime: { op: ['>='], val: [2, 5] } });
assert.deepStrictEqual(ci.accumulatetime, { desc: 'Seconds', example: 'accumulatetime>=5', meaning: '5 s', note: '', values: '', ops: '>=  2, 5' });
assert.strictEqual(ci.corner.ops, '');
const hub = `
  <a href="/games/x/archives/631341">Aquarius Cup 2 (CM22) Champions Meeting</a>
  <a href="/games/x/archives/638136">Pisces Cup 2 (CM23)</a>
  <a href="https://game8.co/games/x/archives/634580">Champions Meeting Look Ahead: What to Expect in CM23-CM24</a>
  <a href="/games/x/archives/Champions-Meeting-Look-Ahead-CM25-26">Aries Cup (CM25) Look Ahead</a>
  <a href="/games/x/archives/584408">Pisces Cup (CM11)</a>`;
assert.deepStrictEqual(latestCM(hub, 'https://game8.co/games/x/archives/541155'),
  { n: 23, name: 'Pisces Cup 2', url: 'https://game8.co/games/x/archives/638136' });
assert.strictEqual(latestCM('<a href="/a/1">nada</a>', 'https://game8.co/'), null);
const { parseNotes } = require('../notes');
assert.deepStrictEqual(parseNotes('# Plan\n**Front** con *Groundwork*\nsegunda línea\n\n- uno\n- `dos`\n1. a\n<b>x</b>'), [
  { type: 'h', level: 1, inline: [{ t: 'text', v: 'Plan' }] },
  { type: 'p', lines: [[{ t: 'b', v: 'Front' }, { t: 'text', v: ' con ' }, { t: 'i', v: 'Groundwork' }], [{ t: 'text', v: 'segunda línea' }]] },
  { type: 'ul', items: [[{ t: 'text', v: 'uno' }], [{ t: 'code', v: 'dos' }]] },
  { type: 'ol', items: [[{ t: 'text', v: 'a' }]] },
  { type: 'p', lines: [[{ t: 'text', v: '<b>x</b>' }]] }, // HTML stays text
]);
assert.deepStrictEqual(parseNotes('Ctrl+Shift+E  Modo edición\n2 * 3 = 6'), [
  { type: 'p', lines: [[{ t: 'text', v: 'Ctrl+Shift+E  Modo edición' }], [{ t: 'text', v: '2 * 3 = 6' }]] },
]);
const { checkTranslation, merge } = require('../tools/i18n');
assert.strictEqual(checkTranslation('Increase velocity by 0.35 with 200m left ◎', 'Aumenta la velocidad 0.35 con 200m restantes ◎'), '');
assert.ok(checkTranslation('Lasts 3 s', 'Dura unos segundos'));
assert.ok(checkTranslation('x', '  '));
assert.strictEqual(checkTranslation('e.g. order<=5 means top 5', 'p. ej. order<=5 significa entre los 5 primeros'), '');
const es = {};
const probs = merge(es, [{ key: 'd:Speed up', en: 'Speed up' }, { key: 'c:corner:values', en: '1 (first corner)' }, { key: 'd:Bad 2', en: 'Bad 2' }],
  ['Acelera', '1 (primera curva)', 'Malo']);
assert.deepStrictEqual(es, { descs: { 'Speed up': 'Acelera' }, conditions: { corner: { values: '1 (primera curva)' } } });
assert.strictEqual(probs.length, 1);
assert.throws(() => merge({}, [{ key: 'd:a', en: 'a' }], []));
console.log('ok');
