# Semantic Canvas

A native iPad whiteboard for drawing live in meetings, built as a thin native
host around a tldraw-powered web canvas.

## Language

**Shell**:
The native SwiftUI/WKWebView host app. Deliberately logic-free.
_Avoid_: wrapper, container app, native app (the whole product is the native app)

**Canvas**:
The bundled tldraw web app where all product logic lives.
_Avoid_: web view, webapp, frontend

**Board**:
The persistent drawing document the presenter works on.
_Avoid_: canvas (that's the app layer), document, drawing, page

**Ink**:
A freehand stroke as drawn, before any recognition.
_Avoid_: stroke (ambiguous with shape outlines), scribble, path

**Shape Snap**:
Recognizing Ink as a geometric shape and replacing it with clean geometry.
_Avoid_: autodraw, shape detection, auto-shape

**Illustration Snap**:
Recognizing one or more Ink strokes as a symbol from the template library and
replacing them with a clean composed illustration.
_Avoid_: sticker, stamp, icon recognition

**Bridge**:
The typed, versioned message channel between Canvas and Shell.
_Avoid_: message handler, JS bridge, native bridge
