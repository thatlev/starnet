import Cocoa
import QuartzCore
import CoreText

// Drawn natively before the first network request. Static CRT details cost no
// animation loop; only the small activity mark breathes, unless motion is reduced.
final class StarNetLoadingView: NSView {
    static let background = NSColor(srgbRed: 0.025, green: 0.017, blue: 0.008, alpha: 1)
    static let amber = NSColor(srgbRed: 1, green: 0.67, blue: 0.20, alpha: 1)
    let status = NSTextField(labelWithString: "CONNECTING TO GATEWAY")
    let detail = NSTextField(wrappingLabelWithString: "Your station will appear here when it is ready.")
    let retry = NSButton(title: "TRY AGAIN", target: nil, action: nil)
    private let activity = NSTextField(labelWithString: "▰  ▰  ▰")

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.backgroundColor = Self.background.cgColor
        setAccessibilityElement(false)
        if let file = Bundle.main.url(forResource: "VT323", withExtension: "ttf") { CTFontManagerRegisterFontsForURL(file as CFURL, .process, nil) }
        let logo = NSImageView()
        if let file = Bundle.main.path(forResource: "LoadingLogo", ofType: "png") { logo.image = NSImage(contentsOfFile: file) }
        logo.imageScaling = .scaleProportionallyUpOrDown
        logo.setAccessibilityLabel("StarNet")
        status.font = NSFont(name: "VT323", size: 24) ?? .monospacedSystemFont(ofSize: 14, weight: .medium)
        status.textColor = Self.amber
        status.alignment = .center
        detail.font = NSFont(name: "VT323", size: 20) ?? .monospacedSystemFont(ofSize: 12, weight: .regular)
        detail.textColor = NSColor(srgbRed: 0.82, green: 0.67, blue: 0.44, alpha: 1)
        detail.alignment = .center
        activity.font = .monospacedSystemFont(ofSize: 15, weight: .regular)
        activity.textColor = Self.amber
        activity.setAccessibilityElement(false)
        activity.wantsLayer = true
        retry.bezelStyle = .smallSquare
        retry.font = NSFont(name: "VT323", size: 20) ?? .monospacedSystemFont(ofSize: 12, weight: .medium)
        retry.contentTintColor = Self.amber
        retry.isHidden = true
        let stack = NSStackView(views: [logo, status, activity, detail, retry])
        stack.orientation = .vertical; stack.alignment = .centerX; stack.spacing = 20
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor, constant: 15),
            stack.widthAnchor.constraint(equalToConstant: 560),
            logo.widthAnchor.constraint(equalToConstant: 480),
            logo.heightAnchor.constraint(equalToConstant: 92),
            detail.widthAnchor.constraint(equalTo: stack.widthAnchor),
            retry.heightAnchor.constraint(equalToConstant: 30)
        ])
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    func begin(_ phase: String) {
        status.stringValue = phase
        detail.stringValue = "Your station will appear here when it is ready."
        retry.isHidden = true; activity.isHidden = false; isHidden = false
        activity.layer?.removeAllAnimations()
        if !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion {
            let pulse = CABasicAnimation(keyPath: "opacity")
            pulse.fromValue = 0.3; pulse.toValue = 1; pulse.duration = 1.2
            pulse.autoreverses = true; pulse.repeatCount = .infinity
            activity.layer?.add(pulse, forKey: "activity")
        }
    }
    func finish() { activity.layer?.removeAllAnimations(); isHidden = true }
    func fail(_ message: String) {
        status.stringValue = "CONNECTION INTERRUPTED"
        detail.stringValue = message
        activity.layer?.removeAllAnimations(); activity.isHidden = true; retry.isHidden = false; isHidden = false
    }
    override func draw(_ dirtyRect: NSRect) {
        Self.background.setFill(); bounds.fill()
        // Quiet amber perspective grid, matching the station's opening screen.
        let horizon = bounds.height * 0.27, center = bounds.width / 2
        let grid = NSBezierPath(); grid.lineWidth = 0.7
        for i in -7...7 {
            grid.move(to: NSPoint(x: center + CGFloat(i) * 22, y: horizon))
            grid.line(to: NSPoint(x: center + CGFloat(i) * bounds.width / 7, y: 0))
        }
        for t in [0.0, 0.12, 0.28, 0.49, 0.74, 1.0] {
            let y = horizon * (1 - t * t)
            grid.move(to: NSPoint(x: 0, y: y)); grid.line(to: NSPoint(x: bounds.width, y: y))
        }
        Self.amber.withAlphaComponent(0.12).setStroke(); grid.stroke()
        Self.amber.withAlphaComponent(0.18).setFill()
        for i in 0..<70 {
            let x = CGFloat((i * 173 + 61) % 997) / 997 * bounds.width
            let y = CGFloat((i * 269 + 101) % 991) / 991 * bounds.height
            NSRect(x: x, y: y, width: i % 9 == 0 ? 2 : 1, height: 1).fill()
        }
        let brackets = NSBezierPath(); brackets.lineWidth = 1
        for x in [CGFloat(24), bounds.width - 24] {
            for y in [CGFloat(24), bounds.height - 24] {
                let dx: CGFloat = x < center ? 20 : -20
                let dy: CGFloat = y < bounds.height / 2 ? 20 : -20
                brackets.move(to: NSPoint(x: x, y: y + dy)); brackets.line(to: NSPoint(x: x, y: y)); brackets.line(to: NSPoint(x: x + dx, y: y))
            }
        }
        Self.amber.withAlphaComponent(0.35).setStroke(); brackets.stroke()
    }
}
