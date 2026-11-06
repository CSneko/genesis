/** Host HTTP bridge for browser-client RPC. */
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-attachment'
import type {} from '@deepseek-ai/dsh-credentials'
// Activates the webServer Context merge used below.
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { API_PATH } from './api-path.ts'
import { CONNECT_PATH } from './connect-protocol.ts'
import { bridge, DEFAULT_MAX_REQUEST_BODY_BYTES } from './http-bridge.ts'
import { assertTrustedAuthority } from './api-request-trust.ts'
import { BrowserAuth } from './browser-auth.ts'
import { LOGIN_PATH, type KeyLoginConfig } from './key-login.ts'
import { isTrustedApiRequest } from './api-request-trust.ts'
import { HostConnectionService } from './rpc-host.ts'
import { ConnectionRecoveryConfigSchema, resolveConnectionConfig, type ConnectionRecoveryConfig } from './recovery-config.ts'

export type {
  PeerAdmission,
  ConnectionAdmission,
  ConnectionFetchMethod,
  ConnectionFetchHandler,
  ConnectionFetchRoute,
  ConnectionIndexRequest,
  ConnectionIndexResponse,
  ConnectionRpcEndpointMatcher,
  ConnectionRpcAttachment,
  ConnectionRpcFailure,
  ConnectionRpcHandler,
  ConnectionRpcHandlerResult,
  ConnectionRequestRejection,
  ConnectionRpcResult,
  ConnectionRequestBodyMode,
  ConnectionTrustRequest,
  ClientRequest,
  HostConnectionHandle,
  HostConnectionFetch,
  HostConnectionRpc,
  RpcMessage,
  ServerResponse,
} from './rpc.ts'
export type { PeerId, PeerScope, Principal, RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
export { RpcId, transportError } from './rpc.ts'
export { Peer } from './peer.ts'
export type { PeerOptions } from './peer.ts'
export { CONNECT_PATH, type ConnectionInteractions } from './connect-protocol.ts'
export {
  clientRequestSchema,
  rpcErrorSchema,
  rpcIdSchema,
  rpcMessageSchema,
  rpcResultSchema,
  serverResponseSchema,
} from './rpc-schema.ts'
export { HostConnectionService } from './rpc-host.ts'

export { API_PATH } from './api-path.ts'

/** Stable Cordis plugin name. */
export const name = 'client-connection'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Admit or wrap an authenticated shared API request, including body transfer.
     * Existing requests continue when a listener refuses subsequent requests.
     * @param request - Authenticated incoming HTTP request.
     * @param response - Response owned until the delegated bridge settles.
     * @param next - Delegate to the next listener or the shared API bridge.
     * @mode waterfall
     */
    'connection/request'(request: IncomingMessage, response: ServerResponse, next: () => Promise<void>): Promise<void>
  }
}

/** Headroom for RPC JSON fields around aggregate base64 image payloads. */
const REQUEST_ENVELOPE_HEADROOM_BYTES = 1024 * 1024

function assertImageBodyCapacity(ctx: Context, maxRequestBodyBytes: number): void {
  const attachments = ctx.get('attachments')
  if (attachments === undefined) return
  const requiredImageBodyBytes = Math.ceil(
    attachments.imageLimits.maxMessageImageBytes * 4 / 3,
  ) + REQUEST_ENVELOPE_HEADROOM_BYTES
  if (maxRequestBodyBytes < requiredImageBodyBytes) {
    throw new Error(
      `client-connection maxRequestBodyBytes (${String(maxRequestBodyBytes)}) must be at least `
      + `${String(requiredImageBodyBytes)} for the configured aggregate image limit`,
    )
  }
}

/** Services required before providing Connection. */
export const inject = ['credentials']

/** Browser authentication, request limits, and connection recovery configuration. */
export interface ConnectionConfig {
  /** Optional private key-file login bound to client IP and this process; absence retains the launch-token carrier. */
  keyLogin?: KeyLoginConfig | undefined
  /** Browser recovery timing, injected into each served page. */
  recovery?: ConnectionRecoveryConfig
  /**
   * Authorities this deployment serves beyond loopback: exact `host:port`,
   * port-less `host` matching any port, or `*` accepting every authority. The
   * fence accepts loopback and the listener's own bind IP independently; other
   * remote authorities require an entry here. A non-canonical or non-bare
   * authority fails plugin load.
   */
  trustedHosts?: string[]
  /** Absolute browser and API cookie lifetime in days. Default: 30. */
  cookieMaxAgeDays?: number
  /** Maximum buffered JSON body for every `/api` request. Default: 300 MiB. */
  maxRequestBodyBytes?: number
}

export const Config: z<Omit<ConnectionConfig, 'keyLogin'> & { keyLogin?: (Partial<KeyLoginConfig> & Pick<KeyLoginConfig, 'keyFile'>) | undefined }, ConnectionConfig> = z.object({
  keyLogin: z.union([z.const(undefined), z.object({
    keyFile: z.string().required(),
    attemptsPerWindow: z.natural().min(1).default(10),
    windowMs: z.natural().min(1000).max(3_600_000).default(60_000),
    maxAddresses: z.natural().min(1).max(100000).default(1024),
    timeoutMs: z.natural().min(1000).max(60_000).default(10_000),
  })]),
  recovery: ConnectionRecoveryConfigSchema.default({}),
  trustedHosts: z.array(String).default([]),
  cookieMaxAgeDays: z.natural().min(1).default(30),
  maxRequestBodyBytes: z.natural().min(1).default(DEFAULT_MAX_REQUEST_BODY_BYTES),
})

/**
 * Provides carrier-neutral RPC and Fetch registries. When `webServer` is
 * present, the plugin also mounts the `/api` browser transport with Host/Origin
 * checks and persistent browser authentication.
 * @param ctx - Host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 */
export async function apply(ctx: Context, config?: ConnectionConfig): Promise<void> {
  const recovery = resolveConnectionConfig(config?.recovery)
  // The Loader resolves schema defaults; hand-built test contexts may pass none.
  const trustedHosts = config?.trustedHosts ?? []
  const cookieMaxAgeDays = config?.cookieMaxAgeDays ?? 30
  const maxRequestBodyBytes = config?.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES
  // Config boundary: a malformed entry fails the load loudly here rather than
  // silently authorizing its hostname prefix at request time.
  for (const entry of trustedHosts) assertTrustedAuthority(entry)
  assertImageBodyCapacity(ctx, maxRequestBodyBytes)
  const browserAuth = await BrowserAuth.create(ctx.root, ctx.credentials, cookieMaxAgeDays, config?.keyLogin)
  ctx.effect(() => () => browserAuth.close())
  const connection = new HostConnectionService(
    ctx,
    trustedHosts,
    browserAuth,
  )
  ctx.inject(['webServer'], (webCtx) => {
    assertImageBodyCapacity(webCtx, maxRequestBodyBytes)
    webCtx.on('webserver/index-inject', (table) => {
      table.push({ kind: 'global', name: '__DSH_CONNECTION_RECOVERY__', value: recovery })
    })
    const fetchHandler = connection.createSharedFetchHandler(API_PATH)
    const route: WebRoute = {
      kind: 'prefix',
      path: API_PATH,
      handler: async (req, res) => {
        const admission = connection.admit(req)
        if ('rejection' in admission) {
          res.writeHead(admission.rejection)
          res.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden')
          return
        }
        await webCtx.waterfall('connection/request', req, res, () => bridge(req, res, fetchHandler, admission.peer, maxRequestBodyBytes))
      },
    }
    webCtx.effect(() => webCtx.webServer.register(route), 'client-connection: /api route')
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact', path: CONNECT_PATH,
      handler: (req, res) => { connection.authorizeConnect(req, res) },
    }), 'client-connection: /connect route')
    if (browserAuth.keyLoginEnabled) webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact', path: LOGIN_PATH,
      handler: async (req, res) => {
        const server = webCtx.webServer
        if (!isTrustedApiRequest(req, trustedHosts, server.host, server.protocol)) {
          req.resume(); res.writeHead(403); res.end('forbidden'); return
        }
        await browserAuth.authorizeLogin(req, res, server.protocol === 'https:', (error) => {
          webCtx.logger.error('Web key login failed; check the configured private key file and Host storage.', error)
        })
      },
    }), 'client-connection: key login route')
  })
  ctx.inject(['attachments'], (attachmentCtx) => {
    assertImageBodyCapacity(attachmentCtx, maxRequestBodyBytes)
  })
}
