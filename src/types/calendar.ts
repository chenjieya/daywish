export interface Holiday { name: string; start: string; end: string }
export interface CalendarData {
  schemaVersion: number
  region: string
  updatedAt: string
  sources: { year: number; url: string; document: string }[]
  holidays: Holiday[]
  workdays: string[]
}
export interface Countdown { date: string; days: number; note: string }
export interface HolidayCountdown extends Countdown { name: string; length: number; ongoing: boolean }
export interface SpringData { source: string; dates: { date: string; source: string }[] }
export interface CalendarBundle { calendar: CalendarData; springs: SpringData }
export interface UpdateStatus { lastChecked: string | null; lastSuccess: string | null; message: string; failed: boolean }
export interface CalendarUpdate extends CalendarBundle { checkedAt: string; message: string; pendingYear?: number }
