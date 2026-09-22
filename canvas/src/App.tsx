import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'
import { assetUrls } from './assetUrls'

export function App() {
  return <Tldraw assetUrls={assetUrls} />
}
