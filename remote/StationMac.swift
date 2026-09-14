import Cocoa
import WebKit

// Thin viewer only. No tools, models, station simulation or task scheduler run here.
// A private Node proxy owns the SSH/GitHub connection and dies with this viewer.
final class StationApp: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, NSWindowDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var proxy: Process?
    var timer: Timer?
    var loaded = false
    var checking = false
    var stopping = false
    var loadingView: StarNetLoadingView!
    var loadingTimeout: Timer?
    var generation = UUID().uuidString
    var startupScript = ""
    var leaving = false
    var didShowStation = false
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
        window.backgroundColor = StarNetLoadingView.background
        window.appearance = NSAppearance(named: .darkAqua)
        window.minSize = NSSize(width: 900, height: 640)
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.setFrameAutosaveName("StarNetRemoteWindow")
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.userContentController.add(self, name: "stationStartup")
        if let file = Bundle.main.path(forResource: "startup-observer", ofType: "js", inDirectory: "remote") {
            startupScript = (try? String(contentsOfFile: file, encoding: .utf8)) ?? ""
        }
        web = WKWebView(frame: window.contentView!.bounds, configuration: config)
        web.autoresizingMask = [.width, .height]
        web.navigationDelegate = self; web.uiDelegate = self
        web.underPageBackgroundColor = StarNetLoadingView.background
        let content = NSView(frame: web.frame)
        content.wantsLayer = true; content.layer?.backgroundColor = StarNetLoadingView.background.cgColor
        content.addSubview(web)
        loadingView = StarNetLoadingView(frame: content.bounds)
        loadingView.autoresizingMask = [.width, .height]
        loadingView.retry.target = self; loadingView.retry.action = #selector(reload)
        content.addSubview(loadingView)
        window.contentView = content
        beginLoading("CONNECTING TO GATEWAY")
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
        catch { loadingView.fail("The connection client could not start. Try reopening StarNet.") }
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
                guard !self.stopping && !self.loaded else { return }
                if (response as? HTTPURLResponse)?.statusCode == 200 {
                    self.loaded = true
                    self.prepareNavigation()
                    self.loadingView.status.stringValue = "OPENING YOUR STATION"
                    self.web.load(URLRequest(url: self.stationURL))
                } else {
                    self.loadingView.status.stringValue = "CONNECTING TO GATEWAY"
                }
            }
        }.resume()
    }
    func prepareNavigation() {
        generation = UUID().uuidString
        web.configuration.userContentController.removeAllUserScripts()
        let source = startupScript.replacingOccurrences(of: "__STARNET_STARTUP_ID__", with: generation)
        web.configuration.userContentController.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }
    func beginLoading(_ phase: String) {
        loadingView.begin(phase)
        loadingTimeout?.invalidate()
        loadingTimeout = Timer.scheduledTimer(withTimeInterval: 45, repeats: false) { [weak self] _ in
            guard let self = self, !self.loadingView.isHidden else { return }
            self.loadingView.detail.stringValue = "Still connecting. StarNet will retry automatically."
            if !self.didShowStation { self.generation = UUID().uuidString; self.web.stopLoading(); self.loaded = false }
            self.loadingView.retry.isHidden = false
        }
    }
    func flushThen(_ completion: @escaping () -> Void) {
        guard didShowStation else { completion(); return }
        var finished = false
        let finish = { if !finished { finished = true; completion() } }
        DispatchQueue.main.asyncAfter(deadline: .now() + 5, execute: finish)
        web.callAsyncJavaScript("if (typeof App !== 'undefined') App.persist(); if (typeof CloudSave !== 'undefined') await CloudSave.flushForUpdate();", arguments: [:], in: nil, in: .page) { _ in finish() }
    }
    @objc func reload() {
        guard !leaving else { return }
        leaving = true
        flushThen { [weak self] in
            guard let self = self else { return }
            self.leaving = false
            self.loadAgain()
        }
    }
    func loadAgain() {
        didShowStation = false
        generation = UUID().uuidString // reject a late readiness message from the old page
        web.stopLoading()
        beginLoading("CONNECTING TO GATEWAY")
        loaded = false
        checkConnection()
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let url = message.frameInfo.request.url, url.scheme == "http", url.host == "127.0.0.1", url.port == 8790,
              let body = message.body as? [String: String], body["generation"] == generation else { return }
        if body["event"] == "load-error" && !didShowStation {
            generation = UUID().uuidString
            web.stopLoading(); loaded = false
            loadingView.fail("Reconnecting to your station automatically…")
            return
        }
        guard body["event"] == "ready" else { return }
        loadingTimeout?.invalidate()
        didShowStation = true
        loadingView.finish()
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        beginLoading("OPENING YOUR STATION")
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        loadingTimeout?.invalidate()
        // Initial navigation can fail while SSH is recovering. The existing
        // status loop retries it automatically; an already usable station is kept.
        if !didShowStation { loaded = false }
        loadingView.fail("Reconnecting to your station automatically…")
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        self.webView(webView, didFailProvisionalNavigation: navigation, withError: error)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        loadingTimeout?.invalidate()
        didShowStation = false; loaded = false
        loadingView.fail("Restoring your station view automatically…")
    }
    @objc func showGateway() {
        guard loaded else { checkConnection(); return }
        web.evaluateJavaScript("window.StarNetGateway?.open()", completionHandler: nil)
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { NSApp.terminate(nil); return false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if leaving { return .terminateCancel }
        if !didShowStation { return .terminateNow }
        leaving = true
        flushThen { sender.reply(toApplicationShouldTerminate: true) }
        return .terminateLater
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) {
        stopping = true
        timer?.invalidate(); loadingTimeout?.invalidate()
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
@main
struct StarNetMain {
    static func main() {
        let app = NSApplication.shared
        let delegate = StationApp()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        withExtendedLifetime(delegate) { app.run() }
    }
}
