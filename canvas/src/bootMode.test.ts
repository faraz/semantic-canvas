// Boot-mode decision (#28): pure url → role, plus the Guest's sync URI.
import { describe, expect, it } from 'vitest'
import { bootMode, guestSyncUri } from './bootMode'

describe('bootMode', () => {
  it('boots as the Host from the Shell bundle (file://)', () => {
    expect(bootMode('file:///private/var/containers/Bundle/App/index.html')).toBe('host')
  })

  it('boots as a Guest when served over http', () => {
    expect(bootMode('http://Farazs-iPad.local:8787/')).toBe('guest')
    expect(bootMode('http://192.168.1.20:8787/')).toBe('guest')
  })

  it('boots as a Guest over https too', () => {
    expect(bootMode('https://example.test/')).toBe('guest')
  })

  it('defaults to Host for anything unparseable or exotic', () => {
    expect(bootMode('not a url')).toBe('host')
    expect(bootMode('about:blank')).toBe('host')
  })
})

describe('guestSyncUri', () => {
  it('targets the /sync route on the page origin, ws-flavored', () => {
    // URL normalizes the host to lowercase; DNS (and mDNS) don't care.
    expect(guestSyncUri('http://Farazs-iPad.local:8787/')).toBe(
      'ws://farazs-ipad.local:8787/sync'
    )
  })

  it('keeps the raw IP host and upgrades https to wss', () => {
    expect(guestSyncUri('http://192.168.1.20:8787/')).toBe('ws://192.168.1.20:8787/sync')
    expect(guestSyncUri('https://host.example:9000/some/path')).toBe(
      'wss://host.example:9000/sync'
    )
  })
})
