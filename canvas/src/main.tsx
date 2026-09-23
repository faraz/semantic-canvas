import { createRoot } from 'react-dom/client'
import { App } from './App'
import { bootMode } from './bootMode'
import { GuestApp } from './GuestApp'
import { wireSessionToBridge } from './session/appSession'

// One bundle, two roles (#28): file:// inside the Shell is the Host app;
// http:// from the Shell's Session server is a Guest editor.
const mode = bootMode(window.location.href)
if (mode === 'host') wireSessionToBridge()

createRoot(document.getElementById('root')!).render(
  mode === 'guest' ? <GuestApp /> : <App />
)
