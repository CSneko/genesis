#!/usr/bin/env node
/** External worker fixture; no desktop APIs or permissions are used. */
import { createInterface } from 'node:readline'
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgZGIGAAAOAAeCcsnOAAAAAElFTkSuQmCC'
const emit = value => process.stdout.write(JSON.stringify(value) + '\n')
let connected = false
let permission = 'not-granted'
let field = ''
emit({ ready: true })
createInterface({ input: process.stdin }).on('line', line => {
  const { id, owner, args } = JSON.parse(line)
  if (args.action === 'hang') return
  if (args.action === 'large-response') {
    emit({ id, result: { payload: 'x'.repeat(512 * 1024) } })
    return
  }
  if (args.action === 'connect') {
    connected = true
    emit({ id, result: { content: [{ type: 'text', text: JSON.stringify({ connected, permission: 'granted' }) }] } })
    return
  }
  if (args.action === 'screenshot') {
    emit({ id, result: { content: [{ type: 'text', text: JSON.stringify({ frameId: 'fixture', owner }) },
      { type: 'image', mimeType: 'image/png', data: png }] } })
    return
  }
  const text = value => emit({ id, result: { content: [{ type: 'text', text: JSON.stringify(value) }] } })
  if (args.action === 'type' || args.action === 'key') return text({ dispatched: true, verified: false })
  if (args.action === 'apps') return text({ applications: [{ appId: 'fixture-app', name: 'Fixture', permission }] })
  if (args.action === 'app_info') return text({ appId: 'fixture-app', name: 'Fixture', pid: process.pid, executable: '/fixture/semantic-app', permission })
  if (args.action === 'authorize_app' || args.action === 'deny_app') {
    permission = args.action === 'authorize_app' ? 'granted' : 'denied'
    return text({ permission })
  }
  if (['inspect', 'set_text', 'activate'].includes(args.action)) {
    if (permission !== 'granted') throw new Error('Host dispatched unapproved application access')
    if (args.action === 'inspect') return text({ snapshotId: 'fixture-snapshot', elements: [
      { elementId: 'fixture-entry', name: 'Fixture entry', text: field },
      { elementId: 'fixture-button', name: 'Fixture button', actions: ['click'] },
    ] })
    if (args.action === 'set_text') { field = args.text; return text({ dispatched: true, verified: true, verification: 'text-readback' }) }
    return text({ dispatched: true, verified: false })
  }
  if (args.action === 'disconnect') { connected = false; permission = 'not-granted' }
  emit({ id, result: { content: [{ type: 'text', text: JSON.stringify({ connected, permission: connected ? 'granted' : 'not-granted', owner }) }] } })
})
