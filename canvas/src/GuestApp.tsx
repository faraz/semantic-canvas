// Guest mode (#28): the same bundle, served by the Shell over http://, boots
// as a Guest editor — a useSync store over the page's own origin, full
// read-write with presence. Deliberately lean: stock tldraw UI (Guests sit at
// a Mac with keyboard and mouse, not the tablet), no persistenceKey (the
// Board lives on the Host), no Session menu or join panel, no capture
// globals. Shape Snap still runs so Guest Ink stays clean; the Bridge's
// haptic post is a no-op off-device.
import { useSync } from '@tldraw/sync'
import {
  getUserPreferences,
  inlineBase64AssetStore,
  setUserPreferences,
  Tldraw,
  type Editor,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { assetUrls } from './assetUrls'
import { guestSyncUri } from './bootMode'
import { postShapeSnapped } from './bridge'
import { wireShapeSnap } from './shapeSnap/wire'

// Presence needs a name; first-time browsers have none set. tldraw keeps
// this in localStorage, so a Guest who renames themselves stays renamed.
function ensureGuestName(): void {
  const prefs = getUserPreferences()
  if (!prefs.name) setUserPreferences({ ...prefs, name: 'Guest' })
}

function mountGuest(editor: Editor) {
  return wireShapeSnap(editor, { onSnap: postShapeSnapped })
}

export function GuestApp() {
  ensureGuestName()
  const store = useSync({
    uri: guestSyncUri(window.location.href),
    assets: inlineBase64AssetStore,
  })
  return <Tldraw store={store} assetUrls={assetUrls} onMount={mountGuest} />
}
