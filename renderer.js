const list = document.getElementById('cards');
const editor = document.getElementById('editor');
const form = editor.querySelector('form');
let cards = [];
let editing = null;
let skills = [];
let conditions = {};

const ZOOMS = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5];
// background opacity per card; text stays fully visible
const ALPHAS = [0.78, 0.6, 0.4, 0.2, 0, 0.95];

function render() {
  renderPanel();
  renderGroups();
  const shown = cards.filter((c) => !c.hidden);
  const leaders = new Set();
  list.replaceChildren(...cards.flatMap((c, i) => {
    // cards sharing a "group" become tabs of one card; the first visible one holds position, size and active tab
    const members = c.group ? shown.filter((x) => x.group === c.group) : [c];
    if (c.hidden || (c.group && (leaders.has(c.group) || members[0] !== c))) return [];
    if (c.group) leaders.add(c.group);
    const a = members[c.tab] || c;
    const el = document.createElement('article');
    el.className = 'card';
    el.classList.toggle('collapsed', !!c.collapsed);
    el.classList.toggle('live', !!c.clickable);
    el.dataset.i = i;
    if (c.w) el.style.width = c.w + 'px';
    if (c.h) el.style.height = c.h + 'px';
    el.classList.toggle('sized', !!c.h);
    if (c.x != null) {
      el.classList.add('placed');
      // never past the screen edges: too tall content scrolls inside the card instead
      const x = Math.max(0, Math.min(c.x, innerWidth - 60));
      const y = Math.max(0, Math.min(c.y, innerHeight - 30));
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.maxHeight = `calc(100vh - ${y + 10}px)`;
      el.style.maxWidth = `calc(100vw - ${x + 10}px)`;
    }
    const title = c.group || c.title;
    const save = () => { window.api.save(cards); render(); };
    const tool = (text, label, onclick, cls = 'tool') => {
      const b = make('button', text, cls);
      b.setAttribute('aria-label', `${label}: ${title}`);
      b.title = label;
      b.onclick = onclick;
      return b;
    };
    // textContent only: scraped text is never parsed as HTML
    const h = document.createElement('h2');
    const grip = tool('⠿', t('Mover'), null, 'grip tool');
    grip.onpointerdown = (e) => drag(e, el, c);
    const fold = make('button', title, 'fold');
    fold.setAttribute('aria-expanded', String(!c.collapsed));
    fold.onclick = () => { c.collapsed = !c.collapsed; save(); };
    const z = ZOOMS.indexOf(c.zoom || 1);
    h.append(grip, fold,
      tool('A−', t('Reducir texto'), () => { c.zoom = ZOOMS[Math.max(0, z - 1)]; save(); }),
      tool('A+', t('Ampliar texto'), () => { c.zoom = ZOOMS[Math.min(ZOOMS.length - 1, z + 1)]; save(); }),
      tool('◐', t('Transparencia del fondo ({p} %)', { p: Math.round((1 - (c.alpha ?? ALPHAS[0])) * 100) }), () => {
        c.alpha = ALPHAS[(ALPHAS.indexOf(c.alpha ?? ALPHAS[0]) + 1) % ALPHAS.length];
        save();
      }));
    if (c.w || c.h || (c.zoom && c.zoom !== 1)) {
      h.append(tool('↺', t('Tamaño original'), () => { delete c.w; delete c.h; delete c.zoom; save(); }));
    }
    h.append(tool('✎', t('Editar'), () => open(cards.indexOf(a)), 'edit-btn'));
    el.append(h);
    if (members.length > 1) {
      const tabs = make('div', null, 'tabs');
      tabs.setAttribute('role', 'tablist');
      members.forEach((m, k) => {
        const t = make('button', m.title, 'tab');
        t.setAttribute('role', 'tab');
        t.setAttribute('aria-selected', String(m === a));
        t.onclick = () => { c.tab = k; save(); };
        tabs.append(t);
      });
      el.append(tabs);
    }
    const box = make('div', null, 'content');
    if (c.alpha != null) el.style.setProperty('--alpha', c.alpha);
    if (c.zoom && c.zoom !== 1) box.style.zoom = c.zoom; // only the content: zooming the card would also scale its position
    el.append(box);
    cardContent(a, box);
    return [el];
  }));
}

function cardContent(c, box) {
    if (c.image) {
      const img = document.createElement('img');
      img.src = c.image;
      box.append(img);
    }
    if (c.body) box.append(renderNotes(c.body));
    if (c.favorites) {
      const update = () => { const n = favoriteResults(c, update); res.replaceWith(n); res = n; };
      let res = favoriteResults(c, update);
      box.append(res);
    }
    if (c.skills) {
      const q = document.createElement('input');
      q.type = 'search';
      q.className = 'skill-search';
      q.placeholder = t('Buscar habilidad (nombre o descripción)');
      q.setAttribute('aria-label', t('Buscar habilidad'));
      q.value = c.query || '';
      // update only the results so the input keeps focus while typing
      const update = () => { const n = skillResults(c, update); res.replaceWith(n); res = n; };
      let res = skillResults(c, update);
      q.oninput = () => { c.query = q.value; update(); };
      q.onchange = () => window.api.save(cards);
      const sel = document.createElement('div');
      sel.className = 'skill-filters';
      for (const [key, label, opts] of SKILL_FILTERS) {
        const s = document.createElement('select');
        s.setAttribute('aria-label', t(label));
        s.append(new Option(t('{label}: todos', { label: t(label) }), ''), ...opts.map(([v, x]) => new Option(t(x), v)));
        s.value = c.filters?.[key] || '';
        s.onchange = () => { c.filters = { ...c.filters, [key]: s.value }; window.api.save(cards); update(); };
        sel.append(s);
      }
      box.append(q, sel, res);
    }
    if (c.condViewer) {
      const update = () => { const n = conditionResults(c); res.replaceWith(n); res = n; };
      let res = conditionResults(c);
      const field = (key, placeholder) => {
        const i = make('input', null, 'skill-search');
        i.type = 'search'; // Chromium adds its own clear button
        i.placeholder = placeholder;
        i.setAttribute('aria-label', placeholder);
        i.value = c[key] || '';
        i.oninput = () => { c[key] = i.value; update(); };
        i.onchange = () => window.api.save(cards);
        return i;
      };
      const sk = field('skill', t('Filtrar por habilidad (elige de la lista)'));
      sk.setAttribute('list', 'skill-names');
      box.append(field('query', t('Buscar condición (nombre o descripción)')), sk, howToRead(), res);
    }
    if (c.html) {
      // already whitelist-sanitized in scrape.js; CSP also blocks any script
      const web = document.createElement('div');
      web.className = 'web';
      web.innerHTML = c.html;
      box.append(web);
    }
    if (c.error) {
      const e = document.createElement('small');
      e.className = 'error';
      e.textContent = c.error;
      box.append(e);
    }
}

// suggestions for the editor's "group" field
function renderGroups() {
  document.getElementById('group-names').replaceChildren(
    ...[...new Set(cards.map((c) => c.group).filter(Boolean))].map((g) => new Option(g)));
}

const MAX_SKILLS = 15;
// Spanish (when chosen and es.json has it), English otherwise. Skill names always stay in English.
const skillDesc = (s) => (LANG === 'es' && s.desc_es) || s.desc;
const condText = (k, f) => (LANG === 'es' && k.es?.[f]) || k[f];
// search: case and accent insensitive, so "aceleracion" finds "aceleración"
const plain = (t) => String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const searchWords = (q) => plain(q).split(/\s+/).filter(Boolean);
// tags come from skillList in scrape.js
const SKILL_FILTERS = [
  ['kind', 'Tipo', [['spd', 'Velocidad'], ['acc', 'Aceleración'], ['rec', 'Recuperación'], ['grn', 'Verde (stats)'], ['dbf', 'Debuff']]],
  ['style', 'Estilo', [['run', 'Front'], ['ldr', 'Pace'], ['btw', 'Late'], ['cha', 'End']]],
  ['dist', 'Distancia', [['sho', 'Sprint'], ['mil', 'Milla'], ['med', 'Media'], ['lng', 'Larga']]],
  ['rarity', 'Rareza', [['r1', 'Normal'], ['r2', 'Dorada'], ['uniq', 'Única'], ['evo', 'Evolucionada']]],
  ['server', 'Versión', [['glb', 'Global'], ['jp', 'Solo Japón']]],
];
// style/distance: a skill with no tag of that group works for any, so it passes too
const ANY_OK = new Set(['style', 'dist']);

function passesFilters(s, filters) {
  return SKILL_FILTERS.every(([key, , opts]) => {
    const v = filters?.[key];
    if (!v || s.tags.includes(v)) return true;
    return ANY_OK.has(key) && !opts.some(([t]) => s.tags.includes(t));
  });
}

// GameTora effect type -> [label, value -> text]
const pct = (v) => `${v / 100}%`;
const stat = (v) => `+${v / 10000}`;
const EFFECTS = {
  1: ['Velocidad (stat)', stat], 2: ['Resistencia (stat)', stat], 3: ['Potencia (stat)', stat],
  4: ['Agallas (stat)', stat], 5: ['Inteligencia (stat)', stat],
  8: ['Visión', (v) => `+${v / 10000} m`], 9: ['Recuperación de HP', pct],
  21: ['Velocidad actual', (v) => `${v / 10000} m/s`], 22: ['Velocidad actual', (v) => `+${v / 10000} m/s`],
  27: ['Velocidad', (v) => `+${v / 10000} m/s`], 28: ['Cambio de carril', (v) => `+${v / 10000}`],
  31: ['Aceleración', (v) => `+${v / 10000} m/s²`],
};
const SOURCE_LABELS = {
  chars: 'Personajes (despertar / única)', charEvents: 'Eventos de personaje', supports: 'Cartas de apoyo (pista)',
  supportEvents: 'Eventos de cartas de apoyo', scenarios: 'Escenario',
};

function make(tag, text, cls) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

// "a>=1&b==2@c==1": @ separates alternatives, & joins clauses that must all hold
const branches = (cond) => cond.split('@').map((b) => b.split('&'));
const conditionName = (clause) => clause.split(/[<>=!]/)[0];

function conditionList(cond) {
  const ul = make('ul');
  branches(cond).forEach((branch, i) => {
    if (i) ul.append(make('li', t('o bien:'), 'or'));
    for (const clause of branch) {
      const li = make('li');
      li.append(make('code', clause));
      const k = conditions[conditionName(clause)];
      const d = k && condText(k, 'desc');
      if (d) li.append(' — ' + d);
      ul.append(li);
    }
  });
  return ul;
}

function howToRead() {
  const d = make('details', null, 'how-to');
  d.append(make('summary', t('Cómo leer las condiciones')));
  for (const x of [
    'Cada condición es nombre + operador + valor. Ej.: accumulatetime>=5 = "han pasado 5 segundos o más desde la salida".',
    'Operadores: == igual, != distinto, >= mayor o igual, <= menor o igual, > mayor, < menor.',
    '& une condiciones que deben cumplirse todas. @ separa alternativas: basta con que se cumpla un bloque completo.',
    'Ej.: distance_type==1&ground_type==1@distance_type==2&ground_type==1 → Sprint en césped, o Milla en césped.',
    'La precondición debe cumplirse antes; luego se comprueba la condición. Casi todas las habilidades además necesitan pasar una tirada de Inteligencia.',
    'Si hay varios Triggers se comprueban de arriba abajo: si salta el 1, el 2 ya no (salvo con is_activate_other_skill_detail, donde el 2 es continuación del 1).',
  ]) d.append(make('p', t(x)));
  return d;
}

const MAX_CONDITIONS = 15;
function conditionResults(c) {
  const box = make('div', null, 'cond-viewer');
  const names = Object.keys(conditions).sort();
  if (!names.length) { box.textContent = t('Cargando condiciones de GameTora…'); return box; }
  const want = (c.skill || '').trim().toLowerCase();
  const skill = want && skills.find((s) => s.name.toLowerCase() === want);
  const words = searchWords(c.query);
  if (want && !skill) box.append(make('p', t('Habilidad no encontrada: elige una de la lista.')));
  if (!skill && !words.length) {
    if (!want) box.append(make('p', t('Busca una condición o elige una habilidad en modo edición.')));
    return box;
  }
  let shown = names;
  if (skill) {
    box.append(make('h4', t('Condiciones de: {name}', { name: skill.name })));
    const used = new Set();
    skill.groups.forEach((g, i) => {
      if (skill.groups.length > 1) box.append(make('h4', t('Trigger {n}', { n: i + 1 }), 'trigger'));
      if (g.pre) box.append(make('div', t('Precondición:')), conditionList(g.pre));
      if (g.cond) box.append(make('div', t('Condición:')), conditionList(g.cond));
      for (const b of branches(g.pre + '@' + g.cond)) for (const cl of b) if (cl) used.add(conditionName(cl));
    });
    shown = names.filter((n) => used.has(n));
  }
  const hits = shown.filter((n) => {
    const t = plain(`${n} ${conditions[n].desc} ${conditions[n].es?.desc || ''}`);
    return words.every((w) => t.includes(w));
  });
  if (!hits.length) box.append(make('p', t('Sin resultados.')));
  for (const n of hits.slice(0, MAX_CONDITIONS)) {
    const k = conditions[n];
    const item = make('div', null, 'skill-detail');
    item.append(make('code', n), make('div', condText(k, 'desc')));
    if (k.example) {
      const ex = make('div');
      ex.append(t('Ejemplo: '), make('code', k.example), k.meaning ? ` — ${condText(k, 'meaning')}` : '');
      item.append(ex);
    }
    if (k.values) item.append(make('div', t('Valores: {v}', { v: condText(k, 'values') })));
    if (k.ops) item.append(make('div', t('Usado en habilidades: {v}', { v: k.ops }), 'muted'));
    if (k.note) item.append(make('div', t('Nota: {v}', { v: condText(k, 'note') }), 'muted'));
    box.append(item);
  }
  if (hits.length > MAX_CONDITIONS) box.append(make('small', t('y {n} más… afina la búsqueda', { n: hits.length - MAX_CONDITIONS })));
  return box;
}

function skillDetail(s) {
  const d = make('div', null, 'skill-detail');
  const viewer = cards.find((x) => x.condViewer);
  if (viewer) {
    const b = make('button', t('Ver en visor de condiciones'), 'tool more-btn');
    b.onclick = () => { viewer.skill = s.name; viewer.hidden = false; window.api.save(cards); render(); };
    d.append(b);
  }
  if (s.cost) d.append(make('div', t('Coste: {n} SP', { n: s.cost })));
  for (const g of s.groups || []) {
    const fx = g.effects.map(([type, v]) => {
      const [label, fmt] = EFFECTS[type] || [t('Efecto {n}', { n: type }), (x) => String(x / 10000)];
      return `${t(label)} ${fmt(v)}`;
    });
    d.append(make('h4', t('Efecto')), make('div', fx.join(' · ') + (g.dur > 0 ? t(' · {n} s (base)', { n: g.dur }) : '')));
    if (g.pre) d.append(make('h4', t('Antes (precondición)')), conditionList(g.pre));
    if (g.cond) d.append(make('h4', t('Condición')), conditionList(g.cond));
  }
  for (const [key, label] of Object.entries(SOURCE_LABELS)) {
    const list = s.src?.[key];
    if (!list?.length) continue;
    const ul = make('ul');
    for (const n of list) ul.append(make('li', n, n.endsWith(' · JP') ? 'jp' : null));
    d.append(make('h4', `${t(label)} (${list.length})`), ul);
  }
  return d;
}

function skillResults(c, update) {
  const box = document.createElement('div');
  box.className = 'skills';
  const words = searchWords(c.query);
  const active = SKILL_FILTERS.flatMap(([key, , opts]) => opts.filter(([v]) => v === c.filters?.[key]).map(([, x]) => t(x)));
  if (!skills.length) box.textContent = t('Cargando habilidades de GameTora…');
  else if (!words.length && !active.length) box.textContent = t('Escribe o elige un filtro en modo edición.');
  else {
    if (active.length) {
      const line = document.createElement('small');
      line.className = 'active-filters';
      line.textContent = active.join(' · ');
      box.append(line);
    }
    const hits = skills.filter((s) => {
      const t = plain(`${s.name} ${s.desc} ${s.desc_es}`);
      return words.every((w) => t.includes(w)) && passesFilters(s, c.filters);
    });
    if (!hits.length) box.append(t('Sin resultados.'));
    for (const s of hits.slice(0, MAX_SKILLS)) box.append(...skillItem(s, c, update));
    if (hits.length > MAX_SKILLS) {
      const more = document.createElement('small');
      more.textContent = t('y {n} más… afina la búsqueda', { n: hits.length - MAX_SKILLS });
      box.append(more);
    }
  }
  return box;
}

// one skill line (icon, name, ⭐, Más, description) + its detail when open; c = the card that owns `detail`
function skillItem(s, c, update) {
  const p = document.createElement('p');
  if (s.icon) {
    const img = document.createElement('img');
    img.className = 'skill-icon';
    img.src = s.icon;
    img.alt = ''; // decorative: the name follows
    img.onerror = () => img.remove();
    p.append(img);
  }
  const fav = favoritesCard()?.favs?.includes(s.name);
  const star = make('button', fav ? '★' : '☆', 'tool star-btn');
  star.setAttribute('aria-pressed', String(!!fav));
  star.title = fav ? t('Quitar de favoritas') : t('Añadir a favoritas');
  star.setAttribute('aria-label', `${star.title}: ${s.name}`);
  star.onclick = () => toggleFavorite(s.name);
  const open = c.detail === s.name;
  const more = make('button', open ? t('Menos') : t('Más'), 'tool more-btn');
  more.setAttribute('aria-expanded', String(open));
  more.onclick = () => { c.detail = open ? '' : s.name; window.api.save(cards); update(); };
  p.append(make('strong', s.name), star, more, document.createElement('br'), skillDesc(s));
  return open ? [p, skillDetail(s)] : [p];
}

// Favorites live on this configuration's "Habilidades favoritas" card (created on the first ⭐)
const favoritesCard = () => cards.find((x) => x.favorites);
function toggleFavorite(name) {
  let f = favoritesCard();
  if (!f) cards.push((f = { title: t('Habilidades favoritas'), body: '', image: '', favorites: true, favs: [] }));
  f.favs = f.favs || [];
  f.favs = f.favs.includes(name) ? f.favs.filter((n) => n !== name) : [...f.favs, name];
  window.api.save(cards);
  render();
}

function favoriteResults(c, update) {
  const box = make('div', null, 'skills');
  if (!skills.length) { box.textContent = t('Cargando habilidades de GameTora…'); return box; }
  const list = (c.favs || []).map((n) => skills.find((s) => s.name === n)).filter(Boolean);
  if (!list.length) box.textContent = t('Pulsa ☆ junto a una habilidad (en la tarjeta de habilidades) para añadirla aquí.');
  for (const s of list) box.append(...skillItem(s, c, update));
  return box;
}

// user notes: tokens from parseNotes (notes.js) turned into DOM with textContent only
function renderNotes(text) {
  const inline = (parts) => parts.map(({ t, v }) => (t === 'text' ? v : make(t === 'b' ? 'strong' : t === 'i' ? 'em' : 'code', v)));
  const box = make('div', null, 'notes');
  for (const b of parseNotes(text)) {
    if (b.type === 'h') { const h = make(`h${b.level + 2}`); h.append(...inline(b.inline)); box.append(h); }
    else if (b.type === 'p') {
      const p = make('p');
      b.lines.forEach((l, i) => { if (i) p.append(document.createElement('br')); p.append(...inline(l)); });
      box.append(p);
    } else {
      const list = make(b.type);
      for (const it of b.items) { const li = make('li'); li.append(...inline(it)); list.append(li); }
      box.append(list);
    }
  }
  return box;
}

// edit-mode menu: a checkbox per card turns it on/off everywhere
function renderPanel() {
  const failing = cards.filter((c) => c.error).length;
  document.getElementById('panel-count').textContent =
    t('{a} de {b} activas', { a: cards.filter((c) => !c.hidden).length, b: cards.length }) + (failing ? t(' · ⚠ {n} con error', { n: failing }) : '');
  document.getElementById('toggles').replaceChildren(...cards.map((c) => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !c.hidden;
    box.onchange = () => { c.hidden = !box.checked; window.api.save(cards); render(); };
    label.append(box, ' ', c.title);
    if (c.error) {
      const warn = make('span', ' ⚠', 'warn');
      warn.title = c.error + (c.autoHidden ? t(' (se desactivó sola)') : '');
      warn.setAttribute('aria-label', t('Error: {v}', { v: warn.title }));
      label.append(warn);
    }
    const live = document.createElement('label');
    live.className = 'live-toggle';
    live.title = t('Clicable fuera del modo edición');
    const click = document.createElement('input');
    click.type = 'checkbox';
    click.checked = !!c.clickable;
    click.setAttribute('aria-label', `${live.title}: ${c.title}`);
    click.onchange = () => { c.clickable = click.checked; window.api.save(cards); render(); };
    live.append(click, '🖱');
    li.append(label, live);
    return li;
  }));
}

function drag(e, el, c) {
  const r = el.getBoundingClientRect(); // start where it is, even if it was still in the column
  const dx = e.clientX - r.left, dy = e.clientY - r.top;
  e.target.setPointerCapture(e.pointerId);
  el.classList.add('placed');
  const move = (ev) => {
    // keep at least the title bar on screen
    el.style.left = Math.min(Math.max(ev.clientX - dx, 0), innerWidth - 60) + 'px';
    el.style.top = Math.min(Math.max(ev.clientY - dy, 0), innerHeight - 30) + 'px';
  };
  move(e);
  e.target.onpointermove = move;
  e.target.onpointerup = () => {
    c.x = parseInt(el.style.left);
    c.y = parseInt(el.style.top);
    window.api.save(cards);
    render();
  };
}

function open(i) {
  editing = i;
  const c = cards[i] || {};
  for (const k of ['title', 'group', 'body', 'image', 'url', 'section', 'selector']) form.elements[k].value = c[k] || '';
  document.getElementById('del').hidden = i == null;
  editor.showModal();
}

editor.addEventListener('close', async () => {
  if (editor.returnValue === 'cancel') return;
  if (editor.returnValue === 'delete') cards.splice(editing, 1);
  else {
    const data = Object.fromEntries(new FormData(form));
    if (!data.url) Object.assign(data, { html: '', error: '' }); // no longer a web card
    data.group = data.group.trim();
    if (editing == null) cards.push(data);
    else Object.assign(cards[editing], data);
  }
  await window.api.save(cards);
  render();
});

document.getElementById('add').onclick = () => open(null);
document.getElementById('refresh').onclick = () => window.api.refresh();
document.getElementById('folder').onclick = () => window.api.openFolder();
document.getElementById('restack').onclick = () => {
  if (!confirm(t('¿Volver a poner todas las tarjetas en la columna de la derecha? (tamaños y zoom se conservan)'))) return;
  for (const c of cards) { delete c.x; delete c.y; }
  window.api.save(cards);
  render();
};

window.api.onCards((c) => { cards = c; render(); });
// CSS resize writes the new size inline; keep it when the mouse is released
document.addEventListener('mouseup', () => {
  let changed = false;
  for (const el of list.children) {
    const c = cards[el.dataset.i];
    const w = parseInt(el.style.width) || undefined;
    const h = parseInt(el.style.height) || undefined;
    if (!c || el.classList.contains('collapsed') || (w === c.w && h === c.h)) continue;
    Object.assign(c, { w, h });
    changed = true;
  }
  if (changed) window.api.save(cards);
});

// Outside edit mode the window ignores the mouse; over a clickable card (or the open editor) it takes it back.
let grabbing = false;
document.addEventListener('mousemove', (e) => {
  if (document.body.classList.contains('edit')) return;
  const want = !!e.target.closest?.('.card.live') || !!document.querySelector('dialog[open]');
  if (want !== grabbing) { grabbing = want; window.api.clickThrough(!want); }
});

window.api.onEditMode((on) => {
  grabbing = false;
  document.body.classList.toggle('edit', on);
  document.getElementById('toolbar').hidden = !on;
  document.getElementById('panel').hidden = !on;
});

// static texts of index.html: remember the Spanish original once, then show t(original)
const staticTexts = [];
{
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) if (n.textContent.trim()) staticTexts.push([n, n.textContent]);
}
const staticPlaceholders = [...document.querySelectorAll('[placeholder]')].map((e) => [e, e.placeholder]);
function applyLang(lang) {
  setLang(lang);
  document.documentElement.lang = LANG;
  for (const [n, orig] of staticTexts) n.textContent = orig.replace(orig.trim(), t(orig.trim()));
  for (const [e, orig] of staticPlaceholders) e.placeholder = t(orig);
  setProfileLabel();
}

window.api.getSettings().then((s) => { applyLang(s.lang); render(); });
window.api.load().then((c) => { cards = c; render(); });

// configurations: picked at launch, from the toolbar or from the tray
const picker = document.getElementById('profiles');
let profileInfo = { active: '', profiles: [] };
const errorText = (e) => e.message.replace(/^.*Error: /, '');

let profileName = '';
function setProfileLabel(name = profileName) {
  profileName = name;
  document.getElementById('mode-label').textContent = `${t('Modo edición')} · ${name || t('Predeterminada')}`;
}

async function useProfile(run, name) {
  try {
    cards = await run();
    picker.close();
    render();
  } catch (e) { alert(errorText(e)); return; }
  // "remember" checkbox: open this one directly next launch
  const remember = document.getElementById('profile-remember').checked;
  if (remember || profileInfo.remember != null) await window.api.setSettings({ remember: remember ? name : null });
}

function showProfiles(info) {
  profileInfo = info;
  setProfileLabel(info.active);
  document.getElementById('profile-remember').checked = info.remember != null;
  const news = document.getElementById('profile-news');
  news.textContent = info.news || '';
  news.hidden = !info.news;
  const row = (name, mtime) => {
    const li = document.createElement('li');
    const pick = make('button', name || t('Predeterminada'), name === info.active ? 'profile current' : 'profile');
    if (mtime) pick.append(make('small', ` · ${new Date(mtime).toLocaleDateString(LANG)}`));
    pick.onclick = () => useProfile(() => window.api.useProfile(name), name);
    li.append(pick);
    if (name && name !== info.active) {
      const del = make('button', '🗑', 'tool del-profile');
      del.setAttribute('aria-label', t('Borrar configuración {name}', { name }));
      del.onclick = async () => {
        if (!confirm(t('¿Borrar la configuración "{name}"? No se puede deshacer.', { name }))) return;
        try { showProfiles(await window.api.deleteProfile(name)); } catch (e) { alert(errorText(e)); }
      };
      li.append(del);
    }
    return li;
  };
  document.getElementById('profile-list').replaceChildren(row(''), ...info.profiles.map((p) => row(p.name, p.mtime)));
  const base = document.getElementById('profile-base');
  base.replaceChildren(new Option(t('Predeterminada'), ''), ...info.profiles.map((p) => new Option(p.name, p.name)));
  base.value = info.active;
  if (!picker.open) picker.showModal();
}

document.getElementById('profile-create').onclick = () => {
  const name = document.getElementById('profile-name').value;
  useProfile(() => window.api.createProfile(name, document.getElementById('profile-base').value), name)
    .then(() => { document.getElementById('profile-name').value = ''; });
};
// Esc keeps the current configuration
picker.addEventListener('cancel', (e) => {
  e.preventDefault();
  useProfile(() => window.api.useProfile(profileInfo.active), profileInfo.active);
});
window.api.onProfileUsed(({ name, cards: c }) => { cards = c; setProfileLabel(name); render(); });

// Settings: start with Windows, screen, configuration at launch, shortcuts. Each change applies at once.
const settingsDlg = document.getElementById('settings');
const ACTION_LABELS = { edit: 'Modo edición', toggle: 'Mostrar / ocultar', refresh: 'Actualizar webs' };
const keyLabel = (acc) => acc.replace('CommandOrControl', 'Ctrl');

function showSettings(s) {
  document.getElementById('set-msg').textContent = s.error || '';
  const auto = document.getElementById('set-autostart');
  auto.checked = s.autostart;
  auto.disabled = !s.canAutostart;
  document.getElementById('set-autostart-note').hidden = s.canAutostart;
  const disp = document.getElementById('set-display');
  disp.replaceChildren(...s.displays.map((d) => new Option(d.label, d.id)));
  disp.value = s.display;
  const rem = document.getElementById('set-remember');
  rem.replaceChildren(new Option(t('Preguntar siempre'), '__ask'), new Option(t('Predeterminada'), ''),
    ...s.profiles.map((p) => new Option(p, p)));
  rem.value = s.remember == null ? '__ask' : s.remember;
  document.getElementById('set-lang').value = s.lang;
  document.getElementById('set-keys').replaceChildren(...Object.entries(ACTION_LABELS).map(([k, label]) => {
    const l = make('label', t(label) + ' ');
    const i = make('input');
    i.readOnly = true;
    i.value = keyLabel(s.keys[k]);
    i.dataset.key = k;
    i.setAttribute('aria-label', t('Atajo para {label}: haz clic y pulsa la combinación', { label: t(label) }));
    i.onfocus = () => { window.api.pauseKeys(true); i.value = t('Pulsa la combinación…'); };
    i.onblur = () => { window.api.pauseKeys(false); i.value = keyLabel(s.keys[k]); };
    i.onkeydown = async (e) => {
      e.preventDefault();
      if (e.key === 'Escape' || e.key === 'Tab') return i.blur();
      const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5)
        : /^F([1-9]|1\d|2[0-4])$/.test(e.code) ? e.code : null;
      if (!key) return; // modifier alone, or a key we don't support
      const acc = [e.ctrlKey && 'CommandOrControl', e.altKey && 'Alt', e.shiftKey && 'Shift', key].filter(Boolean).join('+');
      const r = await window.api.setSettings({ keys: { [k]: acc } });
      s = r;
      i.blur();
      showSettings(r);
    };
    const reset = make('button', '↺', 'tool');
    reset.type = 'button';
    reset.title = t('Volver al atajo original');
    reset.setAttribute('aria-label', t('Atajo original para {label}', { label: t(label) }));
    reset.onclick = async () => showSettings(await window.api.setSettings({ keys: { [k]: null } }));
    l.append(i, reset);
    return l;
  }));
  if (!settingsDlg.open) settingsDlg.showModal();
}

document.getElementById('set-autostart').onchange = async (e) => showSettings(await window.api.setSettings({ autostart: e.target.checked }));
document.getElementById('set-display').onchange = async (e) => showSettings(await window.api.setSettings({ display: e.target.value }));
document.getElementById('set-remember').onchange = async (e) =>
  showSettings(await window.api.setSettings({ remember: e.target.value === '__ask' ? null : e.target.value }));
document.getElementById('set-lang').onchange = async (e) => {
  const r = await window.api.setSettings({ lang: e.target.value });
  applyLang(r.lang);
  render();
  showSettings(r);
};
settingsDlg.addEventListener('close', () => {
  // back to click-through unless we're in edit mode
  grabbing = false;
  if (!document.body.classList.contains('edit')) window.api.clickThrough(true);
});
document.getElementById('settings-btn').onclick = () => window.api.openSettings();
window.api.onOpenSettings(showSettings);
// moving to another screen changes the size: re-clamp cards
addEventListener('resize', () => render());
document.getElementById('profiles-btn').onclick = () => window.api.chooseProfile();
window.api.onChooseProfile(showProfiles);
window.api.skills().then((d) => {
  skills = d.skills || [];
  conditions = d.conditions || {};
  document.getElementById('skill-names').replaceChildren(...[...new Set(skills.map((s) => s.name))].map((n) => new Option(n)));
  render();
});
