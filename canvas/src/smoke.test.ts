// Establishes the test-runner convention: vitest over TypeScript in canvas/src.
// Real seams (the Shape Snap recognizer, the Bridge contract) get their suites
// in their own tickets.
import { describe, expect, it } from 'vitest'

describe('test runner', () => {
  it('runs TypeScript tests', () => {
    const vocabulary = ['Shell', 'Canvas', 'Board', 'Ink', 'Shape Snap', 'Bridge']
    expect(vocabulary).toHaveLength(6)
  })
})
