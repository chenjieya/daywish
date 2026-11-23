export interface PublishedPackage {
  platform: 'windows' | 'macos'
  version: string
  file: string
  bytes: number
  sha256: string
  publishedAt: string
  notes: string[]
  sourceTag?: string
  downloadUrl?: string
  minimumSystemVersion?: string
}
export interface ReleaseManifest { schema: 1; releases: PublishedPackage[] }

/** 官网只接受本域下载文件名，避免版本元数据变成任意跳转。 */
export function isReleaseManifest(value: unknown): value is ReleaseManifest {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return data.schema === 1 && Array.isArray(data.releases) && data.releases.every((item: unknown) => {
    if (!item || typeof item !== 'object') return false
    const p = item as Record<string, unknown>
    return (p.platform === 'windows' || p.platform === 'macos') && typeof p.version === 'string'
      && /^\d+\.\d+\.\d+$/.test(p.version) && typeof p.file === 'string'
      && /^Daywish-[A-Za-z0-9.-]+\.(exe|zip)$/.test(p.file)
      && p.file.startsWith(`Daywish-${p.version}-`)
      && (p.platform === 'windows' ? p.file.endsWith('.exe') : p.file.endsWith('.zip'))
      && typeof p.bytes === 'number' && Number.isSafeInteger(p.bytes) && p.bytes > 0
      && typeof p.sha256 === 'string' && /^[a-f0-9]{64}$/.test(p.sha256)
      && typeof p.publishedAt === 'string' && Number.isFinite(Date.parse(p.publishedAt))
      && Array.isArray(p.notes) && p.notes.every(note => typeof note === 'string')
      && (p.minimumSystemVersion === undefined || (p.platform === 'macos' && typeof p.minimumSystemVersion === 'string' && /^\d+\.\d+(?:\.\d+)?$/.test(p.minimumSystemVersion)))
      && (p.sourceTag === undefined || (typeof p.sourceTag === 'string' && p.sourceTag.length > 0 && p.sourceTag.length <= 200))
      && (p.downloadUrl === undefined || (typeof p.downloadUrl === 'string' && p.downloadUrl === `https://github.com/chenjieya/daywish/releases/download/${encodeURIComponent(typeof p.sourceTag === 'string' ? p.sourceTag : `${p.platform}-v${p.version}`)}/${p.file}`))
  })
}

export function packageUrl(release: PublishedPackage): string {
  return release.downloadUrl ?? `/downloads/${release.file}`
}
