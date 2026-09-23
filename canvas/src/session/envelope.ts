// The Guest-relay envelope (#28): the framing shared by the Shell's relay
// (SessionServer.swift, which mirrors this by hand — Swift can't import it)
// and the Canvas's host hub. Every frame on the /host loopback channel is one
// JSON envelope:
//
//   Shell → Canvas:  {sid, ev: 'open'}           a Guest socket connected
//                    {sid, ev: 'frame', data}    a Guest sent a wire frame
//                    {sid, ev: 'close'}          a Guest socket closed
//   Canvas → Shell:  {sid, ev: 'frame', data}    a wire frame for that Guest
//                    {sid, ev: 'close'}          close that Guest's socket
//
// `data` is the raw tldraw sync wire frame (itself JSON), carried opaquely.
export type RelayEnvelope =
  | { sid: string; ev: 'open' }
  | { sid: string; ev: 'frame'; data: string }
  | { sid: string; ev: 'close' }

export function encodeEnvelope(envelope: RelayEnvelope): string {
  return JSON.stringify(envelope)
}

// Decodes one raw hub frame; null for anything malformed — a bad frame from
// the relay must drop, never throw into the room.
export function decodeEnvelope(raw: unknown): RelayEnvelope | null {
  if (typeof raw !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const m = parsed as Record<string, unknown>
  if (typeof m.sid !== 'string' || m.sid === '') return null
  switch (m.ev) {
    case 'open':
      return { sid: m.sid, ev: 'open' }
    case 'frame':
      return typeof m.data === 'string' ? { sid: m.sid, ev: 'frame', data: m.data } : null
    case 'close':
      return { sid: m.sid, ev: 'close' }
    default:
      return null
  }
}
