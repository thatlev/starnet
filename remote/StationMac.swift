import Cocoa
import WebKit

// Thin viewer only. No tools, models, station simulation or task scheduler run here.
// A private Node proxy owns the SSH/GitHub connection and dies with this viewer.
final class StationApp: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var proxy: Process?
    var timer: Timer?
    var loaded = false
    var checking = false
    var stopping = false
    var status: NSTextField!
    let stationURL = URL(string: "http://127.0.0.1:8790")!

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let appMenu = NSMenuItem(); menu.addItem(appMenu)
        let actions = NSMenu(); appMenu.submenu = actions
        actions.addItem(withTitle: "Gateway…", action: #selector(showGateway), keyEquivalent: ",").target = self
        actions.addItem(withTitle: "Reload Station", action: #selector(reload), keyEquivalent: "r").target = self
        actions.addItem(NSMenuItem.separator())
        actions.addItem(withTitle: "Quit StarNet Remote", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let editMenu = NSMenuItem(); editMenu.title = "Edit"; menu.addItem(editMenu)
        let edits = NSMenu(title: "Edit"); editMenu.submenu = edits
        for (name, selector, key) in [("Undo", "undo:", "z"), ("Redo", "redo:", "Z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            edits.addItem(withTitle: name, action: Selector(selector), keyEquivalent: key)
        }
        NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 940),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "StarNet Remote"
        window.minSize = NSSize(width: 900, height: 640)
        window.isReleasedWhenClosed = false
        window.setFrameAutosaveName("StarNetRemoteWindow")
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        web = WKWebView(frame: window.contentView!.bounds, configuration: config)
        web.autoresizingMask = [.width, .height]
        web.navigationDelegate = self; web.uiDelegate = self
        window.contentView = web
        status = NSTextField(labelWithString: "Connecting to your gateway…")
        status.font = NSFont.monospacedSystemFont(ofSize: 18, weight: .medium)
        status.textColor = .labelColor
        status.alignment = .center
        status.frame = NSRect(x: 100, y: 430, width: 1240, height: 70)
        status.autoresizingMask = [.width, .minYMargin, .maxYMargin]
        web.addSubview(status)
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
        startProxy()
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.checkConnection() }
        checkConnection()
    }

    func startProxy() {
        guard let resources = Bundle.main.resourcePath else { return }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["node", resources + "/remote/cli.js", "connect"]
        process.environment = ProcessInfo.processInfo.environment.merging(["PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"]) { _, new in new }
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do { try process.run(); proxy = process }
        catch { status.stringValue = "Connection client could not start. Run the Mac installer again." }
    }
    func checkConnection() {
        guard !stopping && !checking else { return }
        if proxy?.isRunning != true { startProxy() }
        checking = true
        var req = URLRequest(url: stationURL.appendingPathComponent("remote/status"))
        req.timeoutInterval = 15
        URLSession.shared.dataTask(with: req) { [weak self] _, response, _ in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.checking = false
                guard !self.loaded else { return }
                if (response as? HTTPURLResponse)?.statusCode == 200 {
                    self.loaded = true; self.status.removeFromSuperview()
                    self.web.load(URLRequest(url: self.stationURL))
                } else {
                    self.status.stringValue = "Connecting to your gateway…\nYour station will appear when the connection is ready."
                }
            }
        }.resume()
    }
    @objc func reload() { web.reload() }
    @objc func showGateway() {
        guard loaded else { checkConnection(); return }
        web.evaluateJavaScript("window.StarNetGateway?.open()", completionHandler: nil)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) {
        stopping = true
        timer?.invalidate()
        if proxy?.isRunning == true { proxy?.terminate() }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "http" && url.host == "127.0.0.1" && url.port == 8790 { decisionHandler(.allow); return }
        if ["https", "http", "mailto"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
        return nil
    }
}
let app = NSApplication.shared
let delegate = StationApp()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
