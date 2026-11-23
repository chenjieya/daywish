<script setup lang="ts">
import AppIcon from '../../src/components/AppIcon.vue'
import DesktopDemo from './DesktopDemo.vue'
import { useReleases } from './useReleases'
import { packageUrl } from './types'
const { sorted, windows, macos, loading, error } = useReleases()
const github = 'https://github.com/chenjieya/daywish'
const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const date = (value: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value))
</script>

<template>
  <div class="official-site">
    <header class="site-nav page-width"><a class="site-brand" href="#" aria-label="好日将至首页"><AppIcon name="sun" :size="25" /><span>好日将至</span></a><nav aria-label="主导航"><a href="#features">小窗里的期待</a><a href="#downloads">下载</a><a href="#updates">更新记录</a><a :href="github" target="_blank" rel="noopener noreferrer">GitHub ↗</a></nav></header>
    <main>
      <section class="site-hero page-width">
        <div class="hero-copy"><h1>每一天，<br />都有盼头。</h1><p>工资到账、下一次假期、农历新年。<br />把值得期待的日子，安放在桌面一角。</p><div class="hero-actions"><a class="site-button" :href="windows ? packageUrl(windows) : '#downloads'">{{ windows ? '下载 Windows 版' : '查看下载版本' }}<span aria-hidden="true">↓</span></a><a class="quiet-link" href="#downloads">了解 Mac 版 <span aria-hidden="true">↗</span></a></div><span class="hero-footnote">免费使用，无需账号。安静陪伴你的每个工作日。</span></div>
        <DesktopDemo />
      </section>
      <section id="features" class="feature-section page-width">
        <div class="section-intro"><span class="section-mark" aria-hidden="true">✳</span><h2>小小一扇窗，<br />装着三份期待。</h2><p>不用翻日历，也不用掰着手指算。<br />想知道的日子，抬眼就能看到。</p></div>
        <div class="feature-list"><article><span class="feature-symbol" aria-hidden="true">¥</span><div><h3>下一次工资到账</h3><p>自定义每月发薪日，支持月末及休息日提前、顺延。再忙的日子，也记得犒劳自己。</p></div></article><article><AppIcon name="sun" :size="24" /><div><h3>下一段假期时光</h3><p>依据中国大陆官方放假安排，包含调休。这里期待的是节假日，普通周末不会混进来。</p></div></article><article><span class="feature-symbol spring-symbol" aria-hidden="true">春</span><div><h3>下一次农历新年</h3><p>单独计算距离正月初一的天数。关于团圆的期待，值得有自己的位置。</p></div></article></div>
      </section>
      <section class="details-strip page-width"><div><h3>待在你喜欢的角落</h3><p>自由拖动、始终置顶、记住位置。</p></div><div><h3>清楚，也轻盈</h3><p>Windows 浅色磨砂，浓度随手调。</p></div><div><h3>按自己的时间生活</h3><p>默认北京时间，也可跟随系统时区。</p></div></section>
      <section id="downloads" class="download-section page-width">
        <div class="section-heading"><div><h2>给桌面添一点期待。</h2><p>选择你的电脑，开始等待好日子。</p></div><AppIcon name="sun" :size="38" /></div>
        <p v-if="loading" class="release-message" role="status">正在读取可用版本…</p>
        <p v-else-if="error" class="release-message" role="alert">{{ error }} <a :href="`${github}/releases`">前往 GitHub 查看发布</a></p>
        <div class="download-grid">
          <article class="platform-card"><div class="platform-title"><svg width="27" height="27" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 4.5 10.5 3v8H2zm10-1.8L22 1v10H12zM2 12.5h8.5v8L2 19zm10 0h10v10L12 20.7z" /></svg><h3>Windows</h3><span v-if="windows" class="version-badge">v{{ windows.version }}</span></div><p>浅色磨砂的小窗，给忙碌的桌面留一点呼吸。</p><a v-if="windows" class="site-button" :href="packageUrl(windows)">{{ windows.downloadUrl ? '从 GitHub 下载' : '下载安装包' }} <span aria-hidden="true">↓</span></a><span v-else class="unavailable">{{ loading ? '读取版本中' : '安装包准备中' }}</span><small v-if="windows">Windows x64 · {{ size(windows.bytes) }} · {{ date(windows.publishedAt) }}</small><small>Windows 11 22H2+ 支持系统磨砂，较旧系统使用浅色底。</small><details v-if="windows" class="checksum"><summary>查看 SHA-256 校验值</summary><code>{{ windows.sha256 }}</code></details></article>
          <article class="platform-card mac-card"><div class="platform-title"><svg width="27" height="27" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.8 12.8c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.7-1.8-3.3-1.8-1.4-.1-2.8.9-3.5.9-.8 0-1.9-.9-3.1-.8C7.3 7.6 5.8 8.5 5 10c-1.6 2.8-.4 6.9 1.1 9.1.7 1.1 1.5 2.2 2.7 2.1 1.1 0 1.5-.7 2.9-.7s1.8.7 3 .7 1.9-1 2.6-2.1c.8-1.2 1.2-2.4 1.2-2.5-.1 0-2.3-.9-2.3-3.8zM14.5 6.1c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2-.5 2.7-1.3z" /></svg><h3>macOS</h3><span class="version-badge">{{ macos ? `v${macos.version}` : '正在准备' }}</span></div><p>SwiftUI 与 AppKit 原生构建，融入 Mac 的玻璃质感。</p><a v-if="macos" class="site-button" :href="packageUrl(macos)">下载 Mac 版 <span aria-hidden="true">↓</span></a><span v-else class="unavailable">完成构建验证后开放下载</span><small v-if="macos">{{ macos.file.includes('arm64') ? 'Apple Silicon' : 'Intel' }} · {{ size(macos.bytes) }} · {{ date(macos.publishedAt) }}</small><small>{{ macos ? `需要 macOS ${macos.minimumSystemVersion || '26.0'} 及以上` : '最低系统要求以正式安装包为准' }}，支持直接安装，无需通过 App Store。</small></article>
        </div>
      </section>
      <section id="updates" class="updates-section page-width"><div class="section-heading"><div><h2>好日子，也在慢慢变好。</h2><p>每个版本的变化，都记在这里。</p></div><a class="quiet-link" :href="`${github}/releases`">全部发布 ↗</a></div><p v-if="loading" role="status">正在读取更新记录…</p><p v-else-if="!sorted.length" class="empty-release">{{ error ? '暂时无法读取更新记录，请查看 GitHub 发布页。' : '第一个正式发布版本即将到来。' }}</p><article v-for="release in sorted.slice(0, 6)" :key="`${release.platform}-${release.version}`" class="release-entry"><div><span>{{ release.platform === 'windows' ? 'Windows' : 'macOS' }} v{{ release.version }}</span><time :datetime="release.publishedAt">{{ date(release.publishedAt) }}</time></div><ul><li v-for="note in release.notes" :key="note">{{ note }}</li></ul></article></section>
      <section class="faq-section page-width"><h2>开始之前，你可能想知道。</h2><div><details><summary>节假日和春节日期从哪里来？</summary><p>节假日以国务院年度放假通知为准；正月初一使用大陆历表与政务公开资料。日历可自动检查更新，联网失败时继续使用本地数据。</p></details><details><summary>需要一直联网吗？</summary><p>倒计时在本机计算，设置也保存在本机。检查日历更新时才需要联网。</p></details><details><summary>Windows 安装后，如何找到小窗？</summary><p>安装后打开“好日将至”，小窗默认出现在桌面右下角。点击关闭按钮会收起至托盘，可以从托盘重新打开或退出。</p></details><details><summary>官网更新后，需要重新安装吗？</summary><p>日历数据可在应用内更新；应用功能和界面升级需要下载新版安装包，退出旧版后覆盖安装。官网会显示各平台当前可用版本。</p></details></div></section>
    </main>
    <footer class="site-footer page-width"><a class="site-brand" href="#"><AppIcon name="sun" :size="22" /><span>好日将至</span></a><p>值得期待的日子，就在前面。</p><a :href="github" target="_blank" rel="noopener noreferrer">在 GitHub 看看 ↗</a></footer>
  </div>
</template>
