/** Server-address classification selects the requested preview cadence. */
import { expect, it } from 'vitest'
import { isLocalPreviewHost } from '../src/client/preview-host.ts'

it('uses local cadence for loopback and private addresses, remote cadence otherwise', () => {
  for (const host of ['localhost', '127.0.0.2', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.2',
    '169.254.1.2', '[::1]', '[fd00::1]', '[fe80::1]', '[::ffff:192.168.1.2]']) expect(isLocalPreviewHost(host), host).toBe(true)
  for (const host of ['8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.1.2', '[2001:db8::1]', 'example.com']) {
    expect(isLocalPreviewHost(host), host).toBe(false)
  }
})
