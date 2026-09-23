// Session UI: the "Start session"/"Stop session" main-menu action and the
// join panel shown while hosting (QR + the .local URL a Guest opens).
//
// Both render from the session-UI store (../sessionUi.ts), which mirrors the
// Shell's Bridge session events. The menu action only posts the Bridge
// request; the Shell's answer drives the Session lifecycle module through
// the same Bridge events (session/appSession.wireSessionToBridge, #28).
import { useMemo, useSyncExternalStore } from 'react'
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

// Join panel while hosting; a quiet error strip when the Shell reports a
// session error. Mounted in tldraw's InFrontOfTheCanvas slot (Stage Presence
// leaves it free); positioned top-center, clear of the menu zone (top-left),
// style panel (top-right), dock (bottom), and shape rail (right edge).
export function SessionJoinPanel() {
  const session = useSessionUi()
  if (session.hosting) {
    const url = joinUrl(session)
    return (
      <div className="sc-session-panel" data-testid="session-join-panel">
        <div className="sc-session-panel__title">Session live — scan to join</div>
        <div className="sc-session-panel__qr">
          <QrSvg text={url} />
        </div>
        {/* Selectable so the URL can be read out or copied by hand. */}
        <div className="sc-session-panel__url">{url}</div>
      </div>
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
