// Session UI: the "Start session"/"Stop session" main-menu action and the
// join panel shown while hosting (QR + the .local URL a Guest opens).
//
// Both render from the session-UI store (../sessionUi.ts), which mirrors the
// Shell's Bridge session events. The menu action only posts the Bridge
// request; the Shell's answer drives the Session lifecycle module through
// the same Bridge events (session/appSession.wireSessionToBridge, #28).
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { TldrawUiMenuItem } from 'tldraw'
import {
  postStartSessionRequested,
  postStopSessionRequested,
} from '../bridge'
import {
  getSessionUiState,
  joinUrl,
  subscribeSessionUi,
  type SessionUiState,
} from '../sessionUi'
import { QrCode } from './qrcodegen'
import './session-panel.css'

function useSessionUi(): SessionUiState {
  return useSyncExternalStore(subscribeSessionUi, getSessionUiState)
}

// Main-menu action, alongside "New board" and "Snapping" in the board group.
export function SessionMenuItem() {
  const session = useSessionUi()
  return (
    <TldrawUiMenuItem
      id="session"
      label={session.hosting ? 'Stop session' : 'Start session'}
      onSelect={() =>
        session.hosting ? postStopSessionRequested() : postStartSessionRequested()
      }
    />
  )
}

// Copies via the async clipboard API where allowed, falling back to the
// execCommand path (WKWebView on file:// can be picky about the former).
function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => copyViaTextarea(text))
  }
  copyViaTextarea(text)
  return Promise.resolve()
}

function copyViaTextarea(text: string): void {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

// Join panel while hosting; a quiet error strip when the Shell reports a
// session error. Mounted in tldraw's InFrontOfTheCanvas slot; compact card
// in the bottom-right corner (device feedback), clear of the dock (bottom
// center), shape rail (right edge, vertically centered), and style panel
// (top right). Tapping the card copies the join URL.
export function SessionJoinPanel() {
  const session = useSessionUi()
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  if (session.hosting) {
    const url = joinUrl(session)
    const copyUrl = () => {
      void copyText(url).then(() => {
        setCopied(true)
        clearTimeout(copiedTimer.current)
        copiedTimer.current = setTimeout(() => setCopied(false), 1500)
      })
    }
    return (
      <button
        type="button"
        className="sc-session-panel"
        data-testid="session-join-panel"
        onClick={copyUrl}
        title="Copy join address"
      >
        <div className="sc-session-panel__qr">
          <QrSvg text={url} />
        </div>
        <div className="sc-session-panel__url">{copied ? 'Copied' : url}</div>
      </button>
    )
  }
  if (session.error !== null) {
    return (
      <div className="sc-session-panel sc-session-panel--error">
        <div className="sc-session-panel__title">Session could not start</div>
        <div className="sc-session-panel__url">{session.error}</div>
      </div>
    )
  }
  return null
}

// The QR symbol as inline SVG: one path of 1x1 module squares, medium error
// correction, the spec's 4-module quiet zone carried in the viewBox. Black
// on white regardless of theme — scanners want contrast, not theming.
const QUIET_ZONE = 4

function QrSvg({ text }: { text: string }) {
  const { d, size } = useMemo(() => {
    const qr = QrCode.encodeText(text, QrCode.Ecc.MEDIUM)
    let d = ''
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.getModule(x, y)) d += `M${x},${y}h1v1h-1z`
      }
    }
    return { d, size: qr.size }
  }, [text])
  const box = size + QUIET_ZONE * 2
  return (
    <svg
      className="sc-session-panel__qr-svg"
      viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${box} ${box}`}
      role="img"
      aria-label={`QR code for ${text}`}
      shapeRendering="crispEdges"
    >
      <rect x={-QUIET_ZONE} y={-QUIET_ZONE} width={box} height={box} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  )
}
