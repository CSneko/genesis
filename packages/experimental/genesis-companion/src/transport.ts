/** Restricted OneBot 11 implementation for an internal private conversation only. @module */
import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import { z } from 'zod'
import { GenesisError } from '@deepseek-ai/dsh-experimental-genesis'

// Local protocol addresses are unrelated to QQ accounts or operator identity.
const SELF = 10002
const GENESIS = 10001
const actionSchema = z.object({ action: z.string().min(1).max(100), params: z.record(z.string(), z.json()).optional(), echo: z.json().optional() })
type Action = z.infer<typeof actionSchema>

/** One socket owns its heartbeat, action queue and deduplication namespace. */
export class CompanionTransport {
  private socket: WebSocket | undefined
  private heartbeat: ReturnType<typeof setInterval> | undefined
  private pending = 0
  private readonly generation = randomUUID()
  private actions: Promise<void> = Promise.resolve()
  /**
   * @param options - Validated connection, frame and queue limits.
   * @param receive - Durable admission of a text reply, returning an internal message id.
   * @param disconnected - Stops any exchange when the peer disappears.
   */
  constructor(private readonly options: { endpoint: string; token: string; name: string; maxFrameBytes: number; maxTextChars: number;
    maxPending: number; heartbeatMs: number; connectTimeoutMs: number },
  private readonly receive: (text: string, key: string | null) => Promise<number>, private readonly disconnected: () => void) {}
  /** Read actual socket readiness. @returns Whether event writes can be attempted. */
  connected(): boolean { return this.socket?.readyState === WebSocket.OPEN }
  /** Connect as OneBot's Universal reverse-WebSocket client; no conversation starts.
   * @returns After authentication and socket readiness, or rejection on failure.
   */
  async connect(): Promise<void> {
    const socket = new WebSocket(this.options.endpoint, { headers: { Authorization: `Bearer ${this.options.token}`,
      'X-Self-ID': String(SELF), 'X-Client-Role': 'Universal' }, maxPayload: this.options.maxFrameBytes,
    handshakeTimeout: this.options.connectTimeoutMs, followRedirects: false })
    this.socket = socket
    socket.on('error', (_error: Error) => { /* Connection rejection or close owns the sanitized operator report. */ })
    socket.on('close', () => {
      if (this.heartbeat !== undefined) clearInterval(this.heartbeat)
      this.disconnected()
    })
    socket.on('message', (bytes, binary) => {
      if (binary) { socket.close(1003, 'JSON text required'); return }
      let action: Action
      try { action = actionSchema.parse(JSON.parse(bytes.toString())) }
      catch (_error) { socket.close(1008, 'Invalid OneBot action'); return }
      if (this.pending >= this.options.maxPending) { void this.respond(action, { status: 'failed', retcode: 1503, data: null }).catch(() => { socket.terminate() }); return }
      this.pending++
      this.actions = this.actions.then(async () => {
        try { await this.respond(action, { status: 'ok', retcode: 0, data: await this.action(action) }) }
        catch (_error) { await this.respond(action, { status: 'failed', retcode: 1400, data: null }) }
      }).catch((_error: unknown) => { socket.terminate() }).finally(() => { this.pending-- })
    })
    await new Promise<void>((resolve, reject) => {
      const failed = () => { socket.off('open', opened); reject(new GenesisError('invalid-state', 'Companion connection failed. Check AstrBot endpoint and token, then reconnect.')) }
      const opened = () => { socket.off('error', failed); socket.off('close', failed); resolve() }
      socket.once('open', opened); socket.once('error', failed); socket.once('close', failed)
    })
    await this.write({ time: Math.floor(Date.now() / 1000), self_id: SELF, post_type: 'meta_event', meta_event_type: 'lifecycle', sub_type: 'connect' })
    this.heartbeat = setInterval(() => {
      void this.write({ time: Math.floor(Date.now() / 1000), self_id: SELF, post_type: 'meta_event', meta_event_type: 'heartbeat',
        status: { online: true, good: true }, interval: this.options.heartbeatMs }).catch(() => { socket.terminate() })
    }, this.options.heartbeatMs)
    this.heartbeat.unref()
  }
  private write(value: object): Promise<void> {
    if (!this.connected()) return Promise.reject(new GenesisError('invalid-state', 'Companion is disconnected.'))
    const text = JSON.stringify(value)
    if (Buffer.byteLength(text) > this.options.maxFrameBytes) return Promise.reject(new GenesisError('capacity', 'Companion frame exceeds maxFrameBytes.'))
    return new Promise<void>((resolve, reject) => { this.socket!.send(text, error => error ? reject(error) : resolve()) })
  }
  private respond(action: Action, result: object): Promise<void> {
    return this.write({ ...result, ...(action.echo === undefined ? {} : { echo: action.echo }) })
  }
  private async action(action: Action): Promise<object | null> {
    switch (action.action) {
      case 'get_login_info': return { user_id: SELF, nickname: this.options.name }
      case 'get_version_info': return { app_name: 'Genesis Internal Companion', app_version: '0.1.0', protocol_version: 'v11' }
      case 'get_status': return { online: true, good: true }
      case 'get_friend_list': return [{ user_id: GENESIS, nickname: 'Genesis', remark: 'Internal companion' }]
      case 'get_group_list': return []
      case 'get_stranger_info':
        if (String(action.params?.['user_id']) !== String(GENESIS)) throw new GenesisError('invalid-source', 'Unknown internal correspondent.')
        return { user_id: GENESIS, nickname: 'Genesis', sex: 'unknown', age: 0 }
      case 'send_msg':
      case 'send_private_msg': {
        const params = z.object({ user_id: z.union([z.literal(GENESIS), z.literal(String(GENESIS))]),
          message_type: z.literal('private').optional(), group_id: z.never().optional(),
          message: z.union([z.string().min(1), z.array(z.strictObject({ type: z.literal('text'), data: z.strictObject({ text: z.string() }) })).min(1)]) }).parse(action.params)
        const text = typeof params.message === 'string' ? params.message : params.message.map(segment => segment.data.text).join('')
        if (!text.trim() || text.length > this.options.maxTextChars) throw new GenesisError('capacity', 'Internal reply is empty or too long.')
        const key = action.echo === undefined ? null : `${this.generation}:${JSON.stringify(action.echo)}`
        return { message_id: await this.receive(text, key) }
      }
      default: throw new GenesisError('invalid-source', 'This internal OneBot action is unsupported.')
    }
  }
  /** Emit Genesis text only to the internal correspondent, never to QQ.
   * @param id - Durably reserved internal message id.
   * @param text - Bounded public reply.
   * @param name - Genesis's actual life name.
   * @returns After the socket write; the peer's model response is a separate event.
   */
  send(id: number, text: string, name: string): Promise<void> {
    return this.write({ time: Math.floor(Date.now() / 1000), self_id: SELF, post_type: 'message', message_type: 'private', sub_type: 'friend',
      message_id: id, user_id: GENESIS, message: [{ type: 'text', data: { text } }], raw_message: text, font: 0,
      sender: { user_id: GENESIS, nickname: name, sex: 'unknown', age: 0 } })
  }
  /** Stop heartbeat and socket, then drain accepted actions. @returns After action callbacks settle. */
  async close(): Promise<void> {
    if (this.heartbeat !== undefined) clearInterval(this.heartbeat)
    const socket = this.socket
    if (socket !== undefined && socket.readyState !== WebSocket.CLOSED) {
      await new Promise<void>(resolve => { socket.once('close', resolve); socket.terminate() })
    }
    await this.actions
    this.socket = undefined
  }
}
