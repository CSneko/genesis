/** Preview cadence classification from the server address used by this viewer. @module */

/**
 * Classify loopback, private IPv4, IPv6 ULA and link-local addresses as local.
 * Public addresses and DNS names other than localhost use the remote cadence.
 * @param hostname - Browser URL hostname, including brackets for IPv6 literals.
 * @returns Whether the viewer should request the local/LAN sampling cadence.
 */
export function isLocalPreviewHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true
  if (host.includes(':')) {
    if (host.startsWith('::ffff:')) return isLocalPreviewHost(host.slice(7))
    return /^(?:f[cd][0-9a-f]{2}|fe[89ab][0-9a-f]):/u.test(host)
  }
  const octets = host.split('.').map(Number)
  if (octets.length !== 4 || octets.some(value => !Number.isInteger(value) || value < 0 || value > 255)) return false
  const [first, second] = octets
  return first === 127 || first === 10 || (first === 192 && second === 168)
    || (first === 172 && second !== undefined && second >= 16 && second <= 31)
    || (first === 169 && second === 254)
}
