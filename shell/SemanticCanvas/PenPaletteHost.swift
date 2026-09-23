// Hosts Apple's PKToolPicker beside the Canvas (#30, probe #23 GO): the
// system palette picks the pen; the Canvas renders. Every selection goes
// over the Bridge as a versioned penToolChanged message; the Canvas maps it
// onto tldraw's tools and styles.
//
// Responder mechanics (per the pen-toolbar research): the palette shows
// while any registered responder IS first responder. A 1pt transparent host
// view carries that duty; web text focus steals first-responder status (the
// palette hides, keyboard-like) and a keyboard-dismiss observer reclaims it.
import PencilKit
import UIKit
import WebKit

final class PenPaletteHost: UIView, PKToolPickerObserver {
    static private(set) weak var current: PenPaletteHost?

    private let webView: WKWebView
    // WWDC20: "you must always retain your own tool picker instance."
    private let picker = PKToolPicker()
    private let responderHost = PaletteResponderView()
    private var wired = false
    private var wantsPaletteVisible = true
    private var keyboardUp = false

    init(webView: WKWebView) {
        self.webView = webView
        super.init(frame: .zero)
        Self.current = self

        webView.frame = bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(webView)

        responderHost.frame = CGRect(x: 0, y: 0, width: 1, height: 1)
        addSubview(responderHost)

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardDidHide),
            name: UIResponder.keyboardDidHideNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(keyboardWillShow),
            name: UIResponder.keyboardWillShowNotification,
            object: nil
        )
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError() }

    deinit { NotificationCenter.default.removeObserver(self) }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil, !wired else { return }
        wired = true
        picker.addObserver(self)
        picker.showsDrawingPolicyControls = false
        setPaletteVisible(wantsPaletteVisible)
    }

    /// Bridge control: the Canvas's "Pencil palette" toggle. Registers BOTH
    /// the host view and the webview (the probe's proven combination): the
    /// palette stays up whichever of the two holds first responder, so
    /// ordinary canvas taps don't dismiss it.
    func setPaletteVisible(_ visible: Bool) {
        wantsPaletteVisible = visible
        picker.setVisible(visible, forFirstResponder: responderHost)
        picker.setVisible(visible, forFirstResponder: webView)
        if visible {
            responderHost.becomeFirstResponder()
        } else {
            responderHost.resignFirstResponder()
        }
    }

    /// Web text focus takes first responder (palette hides with the
    /// keyboard); reclaim once the keyboard goes away.
    @objc private func keyboardDidHide() {
        keyboardUp = false
        guard wantsPaletteVisible, window != nil else { return }
        responderHost.becomeFirstResponder()
    }

    @objc private func keyboardWillShow() {
        keyboardUp = true
    }

    // MARK: PKToolPickerObserver

    /// Recovery: if the palette hides while it is supposed to be visible and
    /// no keyboard is up (some interaction stole first responder from every
    /// registered view), quietly reclaim. The iPad palette has no close
    /// control of its own, so an unwanted hide is the only false positive.
    func toolPickerVisibilityDidChange(_ toolPicker: PKToolPicker) {
        guard !toolPicker.isVisible, wantsPaletteVisible, !keyboardUp, window != nil
        else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, self.wantsPaletteVisible, !self.keyboardUp else { return }
            self.responderHost.becomeFirstResponder()
        }
    }

    func toolPickerSelectedToolItemDidChange(_ toolPicker: PKToolPicker) {
        guard #available(iOS 18.0, *) else {
            sendLegacyToolChange(toolPicker)
            return
        }
        let item = toolPicker.selectedToolItem
        if let inking = item as? PKToolPickerInkingItem {
            send(inkMessage(for: inking.inkingTool))
        } else if item is PKToolPickerEraserItem {
            send(["v": 1, "event": "penToolChanged", "kind": "eraser"])
        } else if item is PKToolPickerLassoItem {
            send(["v": 1, "event": "penToolChanged", "kind": "lasso"])
        } else {
            send(["v": 1, "event": "penToolChanged", "kind": "other"])
        }
    }

    // MARK: helpers

    private func sendLegacyToolChange(_ toolPicker: PKToolPicker) {
        let tool = toolPicker.selectedTool
        if let inking = tool as? PKInkingTool {
            send(inkMessage(for: inking))
        } else if tool is PKEraserTool {
            send(["v": 1, "event": "penToolChanged", "kind": "eraser"])
        } else if tool is PKLassoTool {
            send(["v": 1, "event": "penToolChanged", "kind": "lasso"])
        } else {
            send(["v": 1, "event": "penToolChanged", "kind": "other"])
        }
    }

    private func inkMessage(for tool: PKInkingTool) -> [String: Any] {
        [
            "v": 1,
            "event": "penToolChanged",
            "kind": "ink",
            "inkType": tool.inkType.rawValue,
            "colorHex": hex(tool.color),
            "width": Double(tool.width),
        ]
    }

    private func send(_ message: [String: Any]) {
        Bridge.send(message, to: webView)
    }

    private func hex(_ color: UIColor) -> String {
        var r: CGFloat = 0
        var g: CGFloat = 0
        var b: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: nil)
        let clamp = { (v: CGFloat) in max(0, min(255, Int(v * 255))) }
        return String(format: "#%02X%02X%02X", clamp(r), clamp(g), clamp(b))
    }
}

private final class PaletteResponderView: UIView {
    override var canBecomeFirstResponder: Bool { true }
}
