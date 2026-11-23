import { contextBridge, ipcRenderer } from 'electron'
import type { Settings } from '../src/types/settings.js'
import type { ViewMode } from '../src/types/window.js'

contextBridge.exposeInMainWorld('daywish', {
  readState: () => ipcRenderer.invoke('read-state'),
  saveSettings: (settings: Settings) => ipcRenderer.invoke('save-settings', settings),
  checkCalendar: (year: number) => ipcRenderer.invoke('check-calendar', year),
  setViewMode: (mode: ViewMode) => ipcRenderer.invoke('set-view-mode', mode),
  windowAction: (action: 'hide' | 'minimize' | 'quit' | 'quit-ready') => ipcRenderer.send('window-action', action),
  on: (event: 'open-settings' | 'refresh-date' | 'storage-error' | 'prepare-quit', callback: () => void) => {
    const allowed = ['open-settings', 'refresh-date', 'storage-error', 'prepare-quit']
    if (!allowed.includes(event)) return () => {}
    const handler = () => callback()
    ipcRenderer.on(event, handler)
    return () => ipcRenderer.removeListener(event, handler)
  },
})
