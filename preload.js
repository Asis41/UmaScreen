const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load'),
  save: (cards) => ipcRenderer.invoke('save', cards),
  skills: () => ipcRenderer.invoke('skills'),
  useProfile: (name) => ipcRenderer.invoke('use-profile', name),
  createProfile: (name, base) => ipcRenderer.invoke('create-profile', name, base),
  deleteProfile: (name) => ipcRenderer.invoke('delete-profile', name),
  chooseProfile: () => ipcRenderer.invoke('choose-profile'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (patch) => ipcRenderer.invoke('set-settings', patch),
  openSettings: () => ipcRenderer.invoke('open-settings'),
  pauseKeys: (on) => ipcRenderer.invoke('pause-keys', on),
  onOpenSettings: (fn) => ipcRenderer.on('open-settings', (_, s) => fn(s)),
  onProfileUsed: (fn) => ipcRenderer.on('profile-used', (_, p) => fn(p)),
  onChooseProfile: (fn) => ipcRenderer.on('choose-profile', (_, info) => fn(info)),
  clickThrough: (on) => ipcRenderer.send('click-through', on),
  refresh: () => ipcRenderer.invoke('refresh'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  onCards: (fn) => ipcRenderer.on('cards', (_, c) => fn(c)),
  onEditMode: (fn) => ipcRenderer.on('edit-mode', (_, on) => fn(on)),
});
