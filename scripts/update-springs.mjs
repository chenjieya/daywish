import { spawnSync } from 'node:child_process'
// 兼容原维护入口，数据源已切换为大陆官方通知。
const result = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/update-calendar.ts', ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(result.status ?? 1)
