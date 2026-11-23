import AppKit
import SwiftUI

@main
struct DaywishApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    var body: some Scene { Settings { EmptyView() } }
}

final class WidgetPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
    override func close() { orderOut(nil) }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private var window: WidgetPanel?
    private var glass: NSGlassEffectView?
    private var statusItem: NSStatusItem?
    private var model: AppModel?
    private var displayObserver: NSObjectProtocol?
    private var restoringPosition = true

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        do { model = try AppModel() }
        catch {
            let alert = NSAlert()
            alert.messageText = "无法读取好日将至的日历数据"
            alert.informativeText = "请重新构建或重新下载完整应用。\n\(error.localizedDescription)"
            alert.runModal()
            NSApp.terminate(nil)
            return
        }
        guard let model else { return }
        let panel = WidgetPanel(contentRect: NSRect(x: 0, y: 0, width: 340, height: 236), styleMask: [.borderless, .miniaturizable], backing: .buffered, defer: false)
        panel.title = "好日将至"
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.hidesOnDeactivate = false
        panel.isMovableByWindowBackground = true
        panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.delegate = self
        // 内容必须放入 contentView，确保系统把文字与控件绘制在 Liquid Glass 之上。
        let material = NSGlassEffectView(frame: NSRect(x: 0, y: 0, width: 340, height: 236))
        material.style = .clear
        material.cornerRadius = 20
        if #available(macOS 27.0, *) { material.effectIsInteractive = true }
        let host = NSHostingView(rootView: WidgetView(model: model))
        host.frame = material.bounds
        host.autoresizingMask = [.width, .height]
        material.contentView = host
        panel.contentView = material
        glass = material
        window = panel
        panel.center()
        if let area = NSScreen.main?.visibleFrame { panel.setFrameOrigin(NSPoint(x: area.maxX - 360, y: area.minY + 20)) }
        _ = panel.setFrameUsingName("daywish-window-frame", force: true)
        model.hideWindow = { [weak self] in self?.window?.orderOut(nil) }
        model.onPreferencesChanged = { [weak self] in self?.applyPreferences() }
        applyPreferences()
        restoringPosition = false
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "sun.horizon", accessibilityDescription: "好日将至")
        item.button?.toolTip = "好日将至 · 每一天，都有盼头"
        let menu = NSMenu()
        menu.addItem(withTitle: "打开好日将至", action: #selector(showWindow), keyEquivalent: "")
        menu.addItem(withTitle: "偏好设置…", action: #selector(openSettings), keyEquivalent: ",")
        menu.addItem(withTitle: "检查软件更新…", action: #selector(checkSoftwareUpdates), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "退出好日将至", action: #selector(quit), keyEquivalent: "q")
        for entry in menu.items { entry.target = self }
        item.menu = menu
        statusItem = item
        displayObserver = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.keepOnScreen() }
        }
        showWindow()
        model.softwareUpdates.start()
        if ProcessInfo.processInfo.environment["DAYWISH_SMOKE_TEST"] == "1" {
            guard model.softwareUpdates.canCheck else {
                FileHandle.standardError.write(Data("error: Sparkle 更新器初始化未完成\n".utf8))
                NSApp.terminate(nil)
                return
            }
            FileHandle.standardOutput.write(Data("DAYWISH_READY: resources, native window and Sparkle initialized\n".utf8))
        }
    }
    @objc private func showWindow() { window?.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true); model?.refresh() }
    @objc private func openSettings() { model?.panel = "settings"; showWindow() }
    @objc private func checkSoftwareUpdates() { model?.softwareUpdates.check() }
    @objc private func quit() { NSApp.terminate(nil) }
    private func applyPreferences() {
        guard let window, let model else { return }
        window.level = model.preferences.alwaysOnTop ? .floating : .normal
        glass?.tintColor = model.preferences.opacity > 0 ? NSColor.white.withAlphaComponent(model.preferences.opacity / 100 * 0.2) : nil
        let height: CGFloat = model.panel != nil ? 490 : model.preferences.compact ? 204 : 236
        let top = window.frame.maxY
        window.setContentSize(NSSize(width: 340, height: height))
        window.setFrameOrigin(NSPoint(x: window.frame.minX, y: top - height))
        keepOnScreen()
    }
    private func keepOnScreen() {
        guard let window else { return }
        let screen = NSScreen.screens.first(where: { $0.visibleFrame.intersects(window.frame) }) ?? NSScreen.main
        guard let area = screen?.visibleFrame else { return }
        let frame = window.frame
        window.setFrameOrigin(NSPoint(x: max(area.minX, min(frame.minX, area.maxX - frame.width)), y: max(area.minY, min(frame.minY, area.maxY - frame.height))))
    }
    func windowDidMove(_ notification: Notification) { if !restoringPosition { window?.saveFrame(usingName: "daywish-window-frame") } }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showWindow(); return true }
    func applicationWillTerminate(_ notification: Notification) {
        model?.shutdown()
        if let displayObserver { NotificationCenter.default.removeObserver(displayObserver) }
        if let statusItem { NSStatusBar.system.removeStatusItem(statusItem) }
    }
}
