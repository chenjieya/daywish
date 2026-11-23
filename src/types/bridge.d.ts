import type { Settings } from './settings'
import type { CalendarUpdate } from './calendar'
import type { ViewMode } from './window'
export interface NativeState {
  settings: Settings; native: boolean; material: string; loadError: boolean; canLaunchAtLogin: boolean
}
declare global {
  interface Window {
    daywish?: {
      readState(): Promise<NativeState>
      saveSettings(settings: Settings): Promise<Settings>
      checkCalendar(year: number): Promise<CalendarUpdate>
      setViewMode(mode: ViewMode): Promise<{ width: number; height: number }>
      windowAction(action: 'hide' | 'minimize' | 'quit' | 'quit-ready'): void
      on(event: 'open-settings' | 'refresh-date' | 'storage-error' | 'prepare-quit', callback: () => void): () => void
    }
  }
}
