import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'

export function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw />
    </div>
  )
}
