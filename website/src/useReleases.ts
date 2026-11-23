import { computed, onMounted, onUnmounted, ref } from 'vue'
import { isReleaseManifest, type PublishedPackage } from './types'

export function useReleases() {
  const releases = ref<PublishedPackage[]>([])
  const loading = ref(true)
  const error = ref('')
  const controller = new AbortController()
  const sorted = computed(() => [...releases.value].sort((a, b) => {
    const av = a.version.split('.').map(Number), bv = b.version.split('.').map(Number)
    return (bv[0]! - av[0]!) || (bv[1]! - av[1]!) || (bv[2]! - av[2]!) || b.publishedAt.localeCompare(a.publishedAt)
  }))
  const windows = computed(() => sorted.value.find(r => r.platform === 'windows'))
  const macos = computed(() => sorted.value.find(r => r.platform === 'macos'))
  onMounted(async () => {
    const timer = setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetch('/releases.json', { cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error('版本信息暂时无法读取')
      const data: unknown = await response.json()
      if (!isReleaseManifest(data)) throw new Error('版本信息校验未通过')
      releases.value = data.releases
    } catch (cause) {
      if (controller.signal.aborted) error.value = '版本读取已超时，请刷新页面或查看 GitHub。'
      else error.value = cause instanceof Error ? cause.message : '暂时无法读取版本信息'
    } finally { clearTimeout(timer); loading.value = false }
  })
  onUnmounted(() => controller.abort())
  return { sorted, windows, macos, loading, error }
}
