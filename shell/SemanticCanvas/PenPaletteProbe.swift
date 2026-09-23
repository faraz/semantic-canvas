// PROTOTYPE — pen-palette-probe (#23). Throwaway: answers by hand whether
// Apple's PKToolPicker presents and behaves beside our WKWebView Canvas.
//
// What it does (DEBUG only): hosts the webview in a container alongside a
// tiny transparent always-first-responder view, registers BOTH that host
// view and the webview with a retained per-instance PKToolPicker, and shows
// every observer callback in an on-screen log strip (plus prints), so the
// five probe questions can be answered without a debugger:
//  1. Palette appears? (host-view registration vs webview registration —
//     the log strip names which registered responder is first responder.)
//  2. Web text focus (keyboard) hides it? Does it recover?
//  3. Touches outside the palette still reach the canvas?
//  4. frameObscured(in:) floating vs docked (polled while visible).
//  5. Side effects of a system ink with no PKCanvasView observer.
#if DEBUG
    import PencilKit
    import UIKit
    import WebKit

    final class PenProbeContainer: UIView, PKToolPickerObserver {
        private let webView: WKWebView
        // WWDC20: "you must always retain your own tool picker instance."
        private let picker = PKToolPicker()
        private let responderHost = ProbeResponderView()
        private let logLabel = UILabel()
        private var pollTimer: Timer?
        private var wired = false

        init(webView: WKWebView) {
            self.webView = webView
            super.init(frame: .zero)

            webView.frame = bounds
            webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            addSubview(webView)

            // A 1pt transparent view whose only job is to be first responder.
            responderHost.frame = CGRect(x: 0, y: 0, width: 1, height: 1)
            addSubview(responderHost)

            logLabel.numberOfLines = 6
            logLabel.font = .monospacedSystemFont(ofSize: 10, weight: .regular)
            logLabel.textColor = .white
            logLabel.backgroundColor = UIColor.black.withAlphaComponent(0.6)
            logLabel.frame = CGRect(x: 8, y: 40, width: 460, height: 96)
            logLabel.autoresizingMask = [.flexibleRightMargin, .flexibleBottomMargin]
            addSubview(logLabel)
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) { fatalError() }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard window != nil, !wired else { return }
            wired = true

            picker.addObserver(self)
            picker.showsDrawingPolicyControls = false
            // Register BOTH candidates; the log names whichever is actually
            // first responder whenever visibility changes.
            picker.setVisible(true, forFirstResponder: responderHost)
            picker.setVisible(true, forFirstResponder: webView)
            let became = responderHost.becomeFirstResponder()
            log("probe up. host.becomeFirstResponder=\(became) pickerVisible=\(picker.isVisible)")

            pollTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) {
                [weak self] _ in
                guard let self else { return }
                let obscured = self.picker.frameObscured(in: self.webView)
                self.log(
                    "poll: visible=\(self.picker.isVisible) hostFR=\(self.responderHost.isFirstResponder) webFR=\(self.webView.isFirstResponder) obscured=\(self.short(obscured))"
                )
            }
        }

        deinit { pollTimer?.invalidate() }

        // MARK: PKToolPickerObserver

        func toolPickerVisibilityDidChange(_ toolPicker: PKToolPicker) {
            log(
                "visibility → \(toolPicker.isVisible) (hostFR=\(responderHost.isFirstResponder) webFR=\(webView.isFirstResponder))"
            )
        }

        func toolPickerSelectedToolItemDidChange(_ toolPicker: PKToolPicker) {
            if #available(iOS 18.0, *) {
                let item = toolPicker.selectedToolItem
                if let inking = item as? PKToolPickerInkingItem {
                    let tool = inking.inkingTool
                    log(
                        "tool → ink \(tool.inkType.rawValue) width=\(Int(tool.width)) color=\(hex(tool.color))"
                    )
                } else if let eraser = item as? PKToolPickerEraserItem {
                    log("tool → eraser \(eraser.eraserTool.eraserType)")
                } else {
                    log("tool → \(item.identifier)")
                }
            } else {
                log("tool changed (pre-iOS 18 API)")
            }
        }

        func toolPickerFramesObscuredDidChange(_ toolPicker: PKToolPicker) {
            log("framesObscured → \(short(toolPicker.frameObscured(in: webView)))")
        }

        func toolPickerIsRulerActiveDidChange(_ toolPicker: PKToolPicker) {
            log("ruler → \(toolPicker.isRulerActive)")
        }

        // MARK: helpers

        private var lines: [String] = []
        private func log(_ line: String) {
            print("[pen-probe] \(line)")
            lines.append(line)
            if lines.count > 6 { lines.removeFirst() }
            logLabel.text = lines.joined(separator: "\n")
        }

        private func short(_ rect: CGRect) -> String {
            rect.isEmpty
                ? "empty"
                : "(\(Int(rect.minX)),\(Int(rect.minY)) \(Int(rect.width))x\(Int(rect.height)))"
        }

        private func hex(_ color: UIColor) -> String {
            var r: CGFloat = 0
            var g: CGFloat = 0
            var b: CGFloat = 0
            color.getRed(&r, green: &g, blue: &b, alpha: nil)
            return String(format: "#%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
        }
    }

    private final class ProbeResponderView: UIView {
        override var canBecomeFirstResponder: Bool { true }
    }
#endif
