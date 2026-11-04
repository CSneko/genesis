/** Opt-in checks against the current operator desktop; no model API is used. */
import { it } from 'vitest'
import { check } from './composition.ts'

it.skipIf(process.env.DSH_COMPUTER_USE_PORTAL_E2E !== '1')('loads the real portal and logs denied observation without opening consent', { retry: 0 }, ({ signal }) => check(false, signal))
it.skipIf(process.env.DSH_COMPUTER_USE_PORTAL_CONSENT_E2E !== '1')('captures twice into durable model history while retaining consent and then disconnects', { retry: 0 }, ({ signal }) => check(true, signal))
