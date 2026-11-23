import calendar from '../shared/calendar.json' with { type: 'json' }
import springs from '../shared/springs.json' with { type: 'json' }
import { fetchOfficialCalendar, updateResult } from '../src/lib/calendar-update.ts'
import type { TextLoader } from '../src/lib/calendar-update.ts'
import type { CalendarUpdate } from '../src/types/calendar.ts'

export async function getCalendarUpdate(year: number, loader: TextLoader): Promise<CalendarUpdate> {
  const base = { calendar, springs }
  try { return updateResult(base, await fetchOfficialCalendar(year, loader)) }
  catch (error) {
    if (error instanceof Error && /HTTP 404/.test(error.message)) return { ...base, pendingYear: year, checkedAt: new Date().toISOString(), message: `${year} 年官方安排尚未收录，保留现有日历` }
    throw error
  }
}
