const { app, BrowserWindow, globalShortcut, ipcMain, screen, shell, Tray, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { scrape, fetchSkills, fetchSkillIcon, fetchLatestCM } = require('./scrape');

// "Predeterminada" is cards.json; each named configuration (one per CM, say) is profiles/<name>.json
const DEFAULT_STORE = path.join(app.getPath('userData'), 'cards.json');
const PROFILES = path.join(app.getPath('userData'), 'profiles');
let STORE = DEFAULT_STORE;
let profile = '';
const SKILLS = path.join(app.getPath('userData'), 'skills-v6.json');
const ICONS = path.join(app.getPath('userData'), 'skill-icons');
const REFRESH_MS = 30 * 60 * 1000;

const ICON = path.join(__dirname, 'icon.png');

// Global settings (not per configuration): shortcuts, screen, configuration to open at launch
const SETTINGS = path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_KEYS = { edit: 'CommandOrControl+Shift+E', toggle: 'CommandOrControl+Shift+O', refresh: 'CommandOrControl+Shift+R' };
let settings = { remember: null, display: null, keys: { ...DEFAULT_KEYS } };
function loadSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    settings = { ...settings, ...s, keys: { ...DEFAULT_KEYS, ...s.keys } };
  } catch {} // missing or broken: defaults
}
function saveSettings() {
  fs.writeFileSync(SETTINGS + '.tmp', JSON.stringify(settings, null, 2));
  fs.renameSync(SETTINGS + '.tmp', SETTINGS);
}
const keyLabel = (acc) => acc.replace('CommandOrControl', 'Ctrl');
// at least one modifier + letter/digit, or a bare F-key
const KEY_RE = /^((CommandOrControl|Alt|Shift)\+){1,3}([A-Z0-9]|F([1-9]|1[0-9]|2[0-4]))$|^F([1-9]|1[0-9]|2[0-4])$/;

let win;
let tray;
let editMode = false;

function load() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); }
  catch (e) {
    // first run: starter cards. Any other error (corrupt file) throws so we never save over it.
    if (e.code !== 'ENOENT') throw e;
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'defaults.json'), 'utf8'));
  }
}

function save(cards) {
  // write-then-rename so a crash mid-write can't wipe the notes
  fs.writeFileSync(STORE + '.tmp', JSON.stringify(cards, null, 2));
  fs.renameSync(STORE + '.tmp', STORE);
}

// names come from the renderer and become file names: keep letters, digits, space . _ - only
const cleanName = (n) => String(n || '').replace(/[^\p{L}\p{N} ._-]/gu, '').replace(/^[.\s]+/, '').trim().slice(0, 60);
const fileFor = (name) => (name ? path.join(PROFILES, name + '.json') : DEFAULT_STORE);

// One-time split (when profiles/ doesn't exist yet): "Predeterminada" keeps only the general cards,
// and the Champions Meeting cards (Game8) move to their own configuration.
const CM_PROFILE = 'CM23 Pisces Cup';
const isCM = (c) => /game8\.co/.test(c.url || '');
function firstProfiles() {
  if (fs.existsSync(PROFILES)) return;
  let current = null;
  try { current = JSON.parse(fs.readFileSync(DEFAULT_STORE, 'utf8')); } catch {} // missing or corrupt: leave it alone
  const cm = current?.some(isCM) ? current : JSON.parse(fs.readFileSync(path.join(__dirname, 'defaults-cm.json'), 'utf8'));
  fs.mkdirSync(PROFILES, { recursive: true });
  fs.writeFileSync(fileFor(CM_PROFILE), JSON.stringify(cm, null, 2));
  if (current?.some(isCM)) {
    fs.copyFileSync(DEFAULT_STORE, path.join(app.getPath('userData'), 'cards.before-profiles.json'));
    save(current.filter((c) => !isCM(c))); // STORE is still the default here
  }
}

function listProfiles() {
  let names = [];
  try { names = fs.readdirSync(PROFILES).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); } catch {}
  const profiles = names.map((name) => ({ name, mtime: fs.statSync(fileFor(name)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
  return { active: profile, profiles };
}

function useProfile(name) {
  name = cleanName(name);
  if (name && !fs.existsSync(fileFor(name))) throw new Error(`No existe la configuración "${name}"`);
  profile = name;
  STORE = fileFor(name);
  tray?.setToolTip(`UmaScreen · ${name || 'Predeterminada'}`);
  setEditMode(false);
  refreshAll(); // this configuration's own webs
  const cards = load();
  win.webContents.send('profile-used', { name, cards });
  return cards;
}

function createProfile(name, base) {
  name = cleanName(name);
  if (!name) throw new Error('Escribe un nombre (letras, números, espacios, . _ -)');
  if (fs.existsSync(fileFor(name))) throw new Error(`Ya existe "${name}"`);
  const from = fileFor(cleanName(base));
  const cards = fs.existsSync(from) ? JSON.parse(fs.readFileSync(from, 'utf8'))
    : JSON.parse(fs.readFileSync(path.join(__dirname, 'defaults.json'), 'utf8'));
  fs.mkdirSync(PROFILES, { recursive: true });
  fs.writeFileSync(fileFor(name), JSON.stringify(cards, null, 2), { flag: 'wx' });
  return useProfile(name);
}

function deleteProfile(name) {
  name = cleanName(name);
  if (!name || name === profile) throw new Error('No se puede borrar la configuración en uso ni la predeterminada');
  fs.rmSync(fileFor(name));
  return listProfiles();
}

// launch menu (and tray / toolbar): the window must take the mouse while it is open
function chooseProfile(news) {
  win.showInactive();
  win.setIgnoreMouseEvents(false);
  win.focus();
  win.webContents.send('choose-profile', { ...listProfiles(), news, remember: settings.remember });
}

// New CM on Game8 -> new configuration "CM<n> <Name>", copied from the newest CM one with its Game8 URL swapped.
// Returns a message for the menu, or '' if nothing new / offline.
const cmNumber = (name) => Number(name.match(/^CM(\d+)\b/)?.[1] || 0);
async function detectNewCM() {
  let cm;
  try { cm = await fetchLatestCM(); } catch { return ''; }
  if (!cm) return '';
  const names = listProfiles().profiles.map((p) => p.name);
  if (names.some((n) => cmNumber(n) === cm.n)) return '';
  const base = names.filter(cmNumber).sort((a, b) => cmNumber(b) - cmNumber(a))[0];
  if (base && cmNumber(base) > cm.n) return '';
  const cards = base ? JSON.parse(fs.readFileSync(fileFor(base), 'utf8'))
    : JSON.parse(fs.readFileSync(path.join(__dirname, 'defaults-cm.json'), 'utf8'));
  // shortcut: every Game8 card points to the same CM guide; other Game8 pages would be swapped too
  for (const c of cards) if (isCM(c)) Object.assign(c, { url: cm.url, html: '', error: '' });
  const name = cleanName(`CM${cm.n} ${cm.name}`);
  fs.mkdirSync(PROFILES, { recursive: true });
  fs.writeFileSync(fileFor(name), JSON.stringify(cards, null, 2), { flag: 'wx' });
  return `Nueva CM detectada en Game8: se creó "${name}"${base ? ` a partir de "${base}"` : ''}.`;
}

async function checkCMAndChoose() {
  chooseProfile(await detectNewCM().catch(() => ''));
}

// launch: open the remembered configuration directly, unless a new CM appeared (then ask)
async function startup() {
  const news = await detectNewCM().catch(() => '');
  const r = settings.remember;
  if (!news && r != null && (r === '' || fs.existsSync(fileFor(r)))) {
    try { useProfile(r); return; } catch {}
  }
  chooseProfile(news);
}

async function refreshAll() {
  const key = (c) => [c.url, c.selector, c.section].join('\n');
  const results = new Map();
  for (const c of load()) {
    if (!c.url || !(c.selector || c.section)) continue;
    if (results.has(key(c))) continue;
    try {
      results.set(key(c), { ...(await scrape(c.url, c.selector, c.section)), error: '' });
    } catch (e) {
      results.set(key(c), { error: e.message }); // keep last good content
    }
  }
  // re-read so edits made during the (slow) downloads aren't overwritten
  const cards = load();
  for (const c of cards) {
    const r = results.get(key(c));
    if (!r) continue;
    Object.assign(c, r);
    // a section missing in a page never loaded (typically a new CM) hides the card once; turning it back on sticks
    if (/^Sección no encontrada/.test(r.error) && !c.html && !c.autoHidden) Object.assign(c, { hidden: true, autoHidden: true });
    if (!r.error) delete c.autoHidden;
  }
  save(cards);
  win?.webContents.send('cards', cards);
}

// ~130 icons shared by ~2000 skills: each is downloaded once, then only new ones
async function downloadIcons(list) {
  fs.mkdirSync(ICONS, { recursive: true });
  const file = (id) => path.join(ICONS, id + '.png');
  // ids come from GameTora and become file names: digits only
  const missing = [...new Set(list.map((s) => s.icon))].filter((id) => /^\d+$/.test(id) && !fs.existsSync(file(id)));
  const worker = async () => {
    for (let id; (id = missing.pop());) {
      try {
        const png = await fetchSkillIcon(id);
        fs.writeFileSync(file(id) + '.tmp', png);
        fs.renameSync(file(id) + '.tmp', file(id));
      } catch {} // a missing icon just isn't shown; retried next start
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

// Spanish texts (es.json, made with tools/i18n.js) keyed by the English text; missing ones stay in English
let ES;
function loadES() {
  try { ES = JSON.parse(fs.readFileSync(path.join(__dirname, 'es.json'), 'utf8')); } catch { ES = {}; }
  return ES;
}

const prepareSkills = (data) => {
  const es = ES || loadES();
  return {
    ...data,
    skills: data.skills.map((s) => ({
      ...s,
      icon: /^\d+$/.test(s.icon) ? pathToFileURL(path.join(ICONS, s.icon + '.png')).href : '',
      desc_es: es.descs?.[s.desc] || '',
    })),
    conditions: Object.fromEntries(Object.entries(data.conditions || {}).map(([n, c]) => [n, { ...c, es: es.conditions?.[n] || {} }])),
  };
};

async function updateSkills() {
  const data = await fetchSkills(); // { skills, conditions }
  await downloadIcons(data.skills);
  fs.writeFileSync(SKILLS + '.tmp', JSON.stringify(data));
  fs.renameSync(SKILLS + '.tmp', SKILLS);
  return data;
}

// cached copy answers at once; a fresh download replaces it for next start
async function skills() {
  try {
    const cached = JSON.parse(fs.readFileSync(SKILLS, 'utf8'));
    updateSkills().catch(() => {});
    return prepareSkills(cached);
  } catch {
    return updateSkills().then(prepareSkills, () => ({ skills: [], conditions: {} }));
  }
}

const ACTIONS = { edit: () => setEditMode(!editMode), toggle: () => toggleVisible(), refresh: () => refreshAll() };
function registerKeys() {
  globalShortcut.unregisterAll();
  const failed = [];
  for (const [k, acc] of Object.entries(settings.keys)) {
    try { if (!globalShortcut.register(acc, ACTIONS[k])) failed.push(k); } catch { failed.push(k); }
  }
  return failed;
}

const targetDisplay = () => screen.getAllDisplays().find((d) => d.id === settings.display) || screen.getPrimaryDisplay();
// portable build: the .exe the user double-clicks, not the copy unpacked to %TEMP%
const exePath = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;

function getSettings() {
  const primary = screen.getPrimaryDisplay().id;
  return {
    remember: settings.remember,
    keys: settings.keys,
    display: targetDisplay().id,
    displays: screen.getAllDisplays().map((d, i) => ({
      id: d.id, label: `Pantalla ${i + 1} (${d.size.width}×${d.size.height})${d.id === primary ? ' · principal' : ''}`,
    })),
    canAutostart: app.isPackaged,
    autostart: app.isPackaged && app.getLoginItemSettings({ path: exePath() }).openAtLogin,
    profiles: listProfiles().profiles.map((p) => p.name),
  };
}

// patch comes from the renderer: validate every field before applying
function setSettings(patch = {}) {
  let error = '';
  if ('remember' in patch) {
    const r = patch.remember == null ? null : cleanName(patch.remember);
    if (r && !fs.existsSync(fileFor(r))) error = `No existe la configuración "${r}"`;
    else settings.remember = r;
  }
  if ('display' in patch) {
    const d = screen.getAllDisplays().find((x) => x.id === Number(patch.display));
    if (d) { settings.display = d.id; win.setBounds(d.workArea); } else error = 'Esa pantalla ya no está conectada';
  }
  if (patch.keys) {
    for (const [k, acc] of Object.entries(patch.keys)) {
      if (!(k in ACTIONS)) continue;
      const value = acc == null ? DEFAULT_KEYS[k] : String(acc);
      if (!KEY_RE.test(value)) { error = `Combinación no válida: ${value}`; continue; }
      if (Object.entries(settings.keys).some(([o, a]) => o !== k && a === value)) { error = `${keyLabel(value)} ya está asignada a otra acción`; continue; }
      const before = settings.keys[k];
      settings.keys[k] = value;
      if (registerKeys().includes(k)) {
        settings.keys[k] = before;
        registerKeys();
        error = `${keyLabel(value)} la está usando otro programa`;
      }
    }
  }
  if ('autostart' in patch && app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!patch.autostart, path: exePath() });
  saveSettings();
  updateTrayMenu();
  return { ...getSettings(), error };
}

function openSettings() {
  win.showInactive();
  win.setIgnoreMouseEvents(false);
  win.focus();
  win.webContents.send('open-settings', getSettings());
}

function setEditMode(on) {
  editMode = on;
  // view mode: clicks pass to the game, but mouse moves are forwarded so clickable cards can claim the mouse
  win.setIgnoreMouseEvents(!on, { forward: true });
  if (on) { win.showInactive(); win.focus(); }
  win.webContents.send('edit-mode', on);
  updateTrayMenu();
}

function toggleVisible() {
  win.isVisible() ? win.hide() : win.showInactive();
  updateTrayMenu();
}

function updateTrayMenu() {
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: `${win.isVisible() ? 'Ocultar' : 'Mostrar'} (${keyLabel(settings.keys.toggle)})`, click: toggleVisible },
    { label: `Modo edición (${keyLabel(settings.keys.edit)})`, type: 'checkbox', checked: editMode, click: () => setEditMode(!editMode) },
    { label: `Actualizar webs (${keyLabel(settings.keys.refresh)})`, click: refreshAll },
    { label: `Cambiar configuración (${profile || 'Predeterminada'})…`, click: () => chooseProfile() },
    { label: 'Buscar CM nueva en Game8', click: checkCMAndChoose },
    { label: 'Ajustes…', click: openSettings },
    { label: 'Abrir carpeta de datos', click: () => shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    { label: 'Salir', click: () => app.quit() },
  ]));
}

// Two copies would overwrite each other's cards.json: a second launch just shows the first one.
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { win.showInactive(); updateTrayMenu(); } });

// skills cache files from older versions (skills.json, skills-v3.json…) are never read again
function removeOldCaches() {
  const dir = app.getPath('userData');
  for (const f of fs.readdirSync(dir)) {
    if (/^skills(-v\d+)?\.json(\.tmp)?$/.test(f) && f !== path.basename(SKILLS)) fs.rmSync(path.join(dir, f), { force: true });
  }
}

app.whenReady().then(() => {
  if (!app.hasSingleInstanceLock()) return;
  try { removeOldCaches(); } catch {} // housekeeping only
  loadSettings();
  // whole screen so cards can be dragged anywhere; it's transparent and click-through in view mode
  const { x, y, width, height } = targetDisplay().workArea;
  win = new BrowserWindow({
    x, y, width, height,
    transparent: true, frame: false, resizable: false,
    skipTaskbar: true, hasShadow: false, icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  firstProfiles();
  win.setAlwaysOnTop(true, 'screen-saver');
  // the overlay only ever shows index.html: a dropped file/link must not navigate it, and no popups
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile('index.html');
  win.webContents.on('did-finish-load', () => { setEditMode(false); startup(); });

  tray = new Tray(ICON);
  tray.setToolTip('UmaScreen');
  tray.on('click', toggleVisible);
  updateTrayMenu();

  registerKeys();

  ipcMain.handle('load', load);
  ipcMain.handle('save', (_, cards) => save(cards));
  ipcMain.on('click-through', (_, on) => { if (!editMode) win.setIgnoreMouseEvents(on, { forward: true }); });
  ipcMain.handle('refresh', refreshAll);
  ipcMain.handle('skills', skills);
  ipcMain.handle('profiles', listProfiles);
  ipcMain.handle('use-profile', (_, name) => useProfile(name));
  ipcMain.handle('create-profile', (_, name, base) => createProfile(name, base));
  ipcMain.handle('delete-profile', (_, name) => deleteProfile(name));
  ipcMain.handle('choose-profile', () => chooseProfile());
  ipcMain.handle('get-settings', getSettings);
  ipcMain.handle('set-settings', (_, patch) => setSettings(patch));
  ipcMain.handle('open-settings', openSettings);
  // while a shortcut field is being filled, the current shortcuts must not fire
  ipcMain.handle('pause-keys', (_, on) => (on ? globalShortcut.unregisterAll() : registerKeys()));
  ipcMain.handle('open-folder', () => shell.openPath(app.getPath('userData')));

  // first refresh happens once a configuration is picked (useProfile)
  setInterval(refreshAll, REFRESH_MS);
});

app.on('will-quit', () => globalShortcut.unregisterAll());
