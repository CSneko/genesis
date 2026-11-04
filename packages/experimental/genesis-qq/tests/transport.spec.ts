/** Authenticated loopback transport readiness, acknowledgements and pending-call disposal. */
import { once } from 'node:events'
import { WebSocket, WebSocketServer } from 'ws'
import { afterEach, expect, it } from 'vitest'
import { OneBotServer } from 'dsh-qq-onebot-bridge/onebot'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})
const token = 'fixture-onebot-access-token'
const logger = { info() {}, warn() {}, error() {} }
function transport() {
  const transport = new OneBotServer({ host: '127.0.0.1', port: 0, accessToken: token,
    botQq: 11111, maxFrameBytes: 4096, actionTimeoutMs: 1000 }, logger)
  cleanup.push(() => transport.stop())
  return transport
}

it('authenticates a forward connection, parses real frames and settles pending actions on stop', async () => {
  const peer = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  cleanup.push(async () => {
    for (const socket of peer.clients) socket.terminate()
    await new Promise<void>((resolve, reject) => peer.close(error => error ? reject(error) : resolve()))
  })
  await once(peer, 'listening')
  const address = peer.address()
  if (typeof address === 'string' || address === null) throw new Error('Missing test listener')
  const connected = once(peer, 'connection')
  const channel = transport()
  expect(await channel.connect(`ws://127.0.0.1:${address.port}`, { timeoutMs: 1000, signal: new AbortController().signal })).toEqual({ ok: true })
  const [socket, request] = await connected
  expect(request.headers.authorization).toBe(`Bearer ${token}`)
  const incoming = once(channel, 'message')
  socket.send('null')
  socket.send(JSON.stringify({ post_type: 'message', message_type: 'private', user_id: { toString: null } }))
  socket.send(JSON.stringify({ post_type: 'message', message_type: 'private', self_id: 11111,
    user_id: 12345, message_id: 1, message: [{ type: 'text', data: { text: '你好' } }] }))
  const [message] = await incoming
  expect(message.text).toBe('你好')
  for (const content of [
    [{ type: 'video', data: { file: 'opaque-video-id' } }],
    '[CQ:mface,url=https://gchat.qpic.cn/fixture]',
    [{ type: 'face', data: { id: '14' } }],
    '[CQ:reply,id=1]',
  ]) {
    const observed = once(channel, 'message')
    socket.send(JSON.stringify({ post_type: 'message', message_type: 'private', self_id: 11111, user_id: 12345, message_id: 2, message: content }))
    const [media] = await observed
    expect(media.raw.message).toEqual(content)
  }
  const noticed = once(channel, 'notice')
  socket.send(JSON.stringify({ post_type: 'notice', notice_type: 'offline_file', self_id: 11111, user_id: 12345, file: { id: 'fixture-id', name: 'note.txt' } }))
  expect((await noticed)[0].raw.file.name).toBe('note.txt')
  const action = once(socket, 'message')
  const result = channel.sendText(message.bot, 'private', 12345, '回应')
  const [raw] = await action
  const frame = JSON.parse(String(raw)) as { action: string; echo: string }
  expect(frame.action).toBe('send_private_msg')
  socket.send(JSON.stringify({ echo: frame.echo, status: 'ok', retcode: 0, data: { message_id: 9 } }))
  expect(await result).toEqual({ message_id: 9 })
  const pendingFrame = once(socket, 'message')
  const pending = expect(channel.sendText(message.bot, 'private', 12345, 'pending')).rejects.toThrow()
  await pendingFrame
  await channel.stop()
  await pending
})

it('refuses a reverse socket without the shared token', async () => {
  const channel = transport()
  expect((await channel.start({ timeoutMs: 1000 })).ok).toBe(true)
  const address = channel.address()
  if (typeof address !== 'object' || address === null) throw new Error('Missing test listener')
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}`)
  cleanup.push(async () => { socket.terminate() })
  const closed = once(socket, 'close')
  socket.on('error', () => {})
  const [code] = await closed
  expect(code).toBe(4001)
})
