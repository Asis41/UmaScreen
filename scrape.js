const cheerio = require('cheerio');

const ALLOWED = new Set(['table', 'thead', 'tbody', 'tr', 'th', 'td', 'p', 'ul', 'ol', 'li', 'b', 'strong', 'i', 'em', 'br', 'img', 'span', 'div', 'hr', 'h5', 'h6']);
const HEADINGS = 'h1,h2,h3,h4';

// Extracts text and the first image from the elements matching `selector`.
function extract(html, selector, baseURI) {
  const $ = cheerio.load(html, { baseURI });
  const el = $(selector);
  if (!el.length) throw new Error(`Selector sin resultados: ${selector}`);
  const body = el.map((_, e) => $(e).prop('innerText').trim()).get().filter(Boolean).join('\n\n');
  const img = el.is('img') ? el.first() : el.find('img').first();
  return { body, image: img.length ? img.prop('src') : '', html: '' };
}

// Returns sanitized HTML of everything between the heading containing `section` and the next heading.
function extractSection(html, section, baseURI, selector) {
  const $ = cheerio.load(html);
  const scope = selector ? $(selector) : $.root();
  const want = section.toLowerCase();
  const h = scope.find(HEADINGS).filter((_, e) => $(e).text().toLowerCase().includes(want)).first();
  if (!h.length) throw new Error(`Sección no encontrada: ${section}`);
  const box = $('<div></div>').append(h.nextUntil(HEADINGS).clone());
  return { html: sanitize($, box, baseURI) };
}

// Whitelist-only: scraped pages must never inject scripts, handlers or links into the overlay.
function sanitize($, box, baseURI) {
  box.find('script,style,iframe,noscript,form,button,input,textarea,select,svg,object,embed').remove();
  box.find('*').each((_, el) => {
    const $el = $(el);
    if (!ALLOWED.has(el.tagName)) return void $el.replaceWith($el.contents());
    const a = el.attribs;
    const keep = {};
    if (el.tagName === 'img') {
      // game8 lazy-loads: real URL is in data-src, src is a 1px gif
      let src = '';
      try { src = new URL(a['data-src'] || a.src || '', baseURI).href; } catch {}
      if (!src.startsWith('https://')) return void $el.remove();
      Object.assign(keep, { src, alt: a.alt || '' });
      if (/^\d+$/.test(a.width || '')) keep.width = a.width;
      if (/^\d+$/.test(a.height || '')) keep.height = a.height;
    } else {
      if (/^\d+$/.test(a.colspan || '')) keep.colspan = a.colspan;
      if (/^\d+$/.test(a.rowspan || '')) keep.rowspan = a.rowspan;
    }
    el.attribs = keep;
  });
  return box.html().trim();
}

async function scrape(url, selector, section) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 UmaScreen' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  const html = await res.text();
  return section ? extractSection(html, section, url, selector) : extract(html, selector, url);
}

// Game8's Champions Meeting hub links every CM guide as "<Name> Cup[ 2] (CM<n>)"; the highest n is the current one.
const CM_HUB = 'https://game8.co/games/Umamusume-Pretty-Derby/archives/541155';
function latestCM(html, baseURI) {
  const $ = cheerio.load(html);
  let best = null;
  $('a[href]').each((_, a) => {
    const text = $(a).text().replace(/\s+/g, ' ').trim();
    const m = text.match(/^(.*?\bCup(?: \d+)?) \(CM(\d+)\)/);
    const href = $(a).attr('href');
    if (!m || /look ahead/i.test(text) || !/\/archives\/\d+$/.test(href)) return;
    const n = Number(m[2]);
    if (!best || n > best.n) best = { n, name: m[1], url: new URL(href, baseURI).href };
  });
  return best;
}

async function fetchLatestCM() {
  const res = await fetch(CM_HUB, { headers: { 'User-Agent': 'Mozilla/5.0 UmaScreen' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${CM_HUB}`);
  return latestCM(await res.text(), CM_HUB);
}

// GameTora builds its skill list with JS; the data is a JSON whose hashed name is in a manifest.
// GameTora's own tags (style run/ldr/btw/cha, distance sho/mil/med/lng, dbf…) plus effect and rarity ones
const EFFECT_TAGS = { 27: 'spd', 31: 'acc', 9: 'rec', 1: 'grn', 2: 'grn', 3: 'grn', 4: 'grn', 5: 'grn' };
const RARITY_TAGS = { 1: 'r1', 2: 'r2', 3: 'uniq', 4: 'uniq', 5: 'uniq', 6: 'evo' };
function skillTags(s) {
  const effects = (s.condition_groups || []).flatMap((g) => g.effects || []).map((e) => EFFECT_TAGS[e.type]);
  const server = (s.unreleased || []).includes('en') ? 'jp' : 'glb'; // unreleased lists servers it's not out on yet
  return [...new Set([...(s.type || []), ...effects, RARITY_TAGS[s.rarity], server].filter(Boolean))];
}

// where to get it: GameTora ids resolved to names; loc.en holds the subset already out on Global
const SOURCES = { chars: 'char', charEvents: 'char_e', supports: 'sup_hint', supportEvents: 'sup_e', scenarios: 'sce_e' };
const REF = { chars: 'chars', charEvents: 'chars', supports: 'supports', supportEvents: 'supports', scenarios: 'scenarios' };
function skillSources(s, refs) {
  const global = !(s.unreleased || []).includes('en');
  const src = {};
  for (const [out, key] of Object.entries(SOURCES)) {
    const ids = [s[key] || []].flat(2);
    if (!ids.length) continue;
    const en = new Set(s.loc?.en ? [s.loc.en[key] || []].flat(2) : global ? ids : []);
    src[out] = ids.map((id) => (refs[REF[out]]?.get(id) || `#${id}`) + (en.has(id) ? '' : ' · JP'));
  }
  return src;
}

function skillList(data, refs = {}) {
  const seen = new Set();
  return data
    .map((s) => ({
      name: s.name_en || s.enname, desc: s.desc_en || s.endesc || '', tags: skillTags(s), icon: s.iconid,
      cost: s.cost,
      groups: (s.condition_groups || []).map((g) => ({
        dur: g.base_time / 10000, cond: g.condition || '', pre: g.precondition || '',
        effects: (g.effects || []).map((e) => [e.type, e.value]),
      })),
      src: skillSources(s, refs),
    }))
    .filter((s) => s.name && !seen.has(s.name + s.desc) && seen.add(s.name + s.desc));
}

// condition name -> GameTora's explanation, plus the operators/values skills actually use with it
function conditionInfo(conds, used = {}) {
  return Object.fromEntries(conds.map((c) => {
    const u = used[c.name];
    return [c.name, {
      desc: c.desc || '', example: c.example || '', meaning: c.example_meaning || '', note: c.note || '', values: c.values || '',
      ops: u ? `${u.op.join(' ')}  ${u.val.join(', ')}` : '',
    }];
  }));
}

async function fetchSkills() {
  const get = async (url) => {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 UmaScreen' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
    return res.json();
  };
  const manifest = await get('https://gametora.com/data/manifests/umamusume.json');
  const file = (name) => get(`https://gametora.com/data/umamusume/${name}.${manifest[name]}.json`);
  const [skills, chars, supports, scenarios, conds, used] = await Promise.all(
    ['skills', 'character-cards', 'support-cards', 'scenario-names', 'static/skill_conditions', 'static/skill_condition_values'].map(file));
  const refs = {
    chars: new Map(chars.map((c) => [c.card_id, `${c.name_en} (${c.title})`])),
    supports: new Map(supports.map((c) => [c.support_id, `${['', 'R', 'SR', 'SSR'][c.rarity] || ''} ${c.char_name} ${c.title_en || ''}`.trim()])),
    scenarios: new Map(Object.entries(scenarios).map(([id, n]) => [Number(id), n.name_en])),
  };
  return { skills: skillList(skills, refs), conditions: conditionInfo(conds, used) };
}

async function fetchSkillIcon(id) {
  const url = `https://gametora.com/images/umamusume/skill_icons/utx_ico_skill_${id}.png`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 UmaScreen' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { extract, extractSection, scrape, skillList, conditionInfo, fetchSkills, fetchSkillIcon, latestCM, fetchLatestCM };
