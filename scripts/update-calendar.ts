import { readFile, writeFile } from 'node:fs/promises'
import { getCalendarUpdate } from '../server/calendar-service.ts'
import { fetchText } from '../server/fetch-text.ts'
import { dateKey } from '../src/lib/dates.ts'
import { mergeCalendar, validateCalendar, validateSprings } from '../src/lib/calendar-update.ts'
const year = Number(process.argv[2] ?? dateKey(new Date()).slice(0, 4))
const oldCalendar: unknown = JSON.parse(await readFile('shared/calendar.json', 'utf8'))
const oldSprings: unknown = JSON.parse(await readFile('shared/springs.json', 'utf8'))
if (!validateCalendar(oldCalendar) || !validateSprings(oldSprings)) throw new Error('现有数据校验未通过，未写入')
const update = await getCalendarUpdate(year, fetchText)
if (update.pendingYear) throw new Error(update.message)
const bundle = mergeCalendar({ calendar: oldCalendar, springs: oldSprings }, update)
await writeFile('shared/calendar.json', JSON.stringify(bundle.calendar, null, 2) + '\n')
await writeFile('shared/springs.json', JSON.stringify(bundle.springs, null, 2) + '\n')
console.log(update.message)
console.log('请运行 node scripts/sync-mac-data.mjs 同步 Mac 资源。')
