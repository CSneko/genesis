/** Loopback-only first-person rendering; browser, sockets and world listeners share one owner. @module */
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { Server } from 'socket.io'
import { chromium, type Browser } from 'playwright-core'
import { WorldView } from 'prismarine-viewer/viewer/lib/worldView.js'
import { getVersion } from 'prismarine-viewer/viewer/lib/version.js'
import type { Bot } from 'mineflayer'
import { failure } from './settings.ts'

/** Deployment capture limits; screenshots are re-renderings, without resource packs or vanilla menus. */
export interface CameraConfig {
  /** Absolute browser executable, or empty to use the Playwright installation. */
  chromiumPath: string
  /** First-person image width in CSS pixels. */
  width: number
  /** First-person image height in CSS pixels. */
  height: number
  /** Screenshot JPEG quality from 1 to 100. */
  jpegQuality: number
  /** Rendered radius in chunks within the bot's loaded world. */
  viewDistance: number
  /** Maximum raw screenshot or player texture bytes. */
  maxImageBytes: number
  /** Maximum milliseconds per browser setup, screenshot or texture request. */
  timeoutMs: number
}
/**
 * Start a private renderer for one connected bot; failed setup releases every acquired resource.
 * @param bot - Current spawned bot.
 * @param config - Browser location and explicit rendering budgets.
 * @returns Captures and a quiescent disposer; the viewer is never exposed on a public listener.
 */
export async function openCamera(bot: Bot, config: CameraConfig): Promise<{ capture(): Promise<Buffer>; close(): Promise<void> }> {
  if (getVersion(bot.version) === null) throw failure('camera-version-unsupported')
  const app = express()
  const assets = join(dirname(createRequire(import.meta.url).resolve('prismarine-viewer/package.json')), 'public')
  const scripts = fileURLToPath(new URL('../lib/viewer/', import.meta.url))
  app.use(express.static(scripts))
  app.use(express.static(assets))
  const server = createServer(app)
  const io = new Server(server)
  const work = new Set<Promise<void>>()
  const lifetime = new AbortController()
  let browser: Browser | undefined
  let closing: Promise<void> | undefined
  let closed = false
  const track = (task: Promise<void>) => {
    work.add(task)
    void task.catch(() => { /* Capture readiness or the next screenshot reports rendering failure. */ })
      .finally(() => { work.delete(task) })
  }
  app.get('/texture/:hash([0-9a-f]{1,128})', (request, response) => {
    track((async () => {
      try {
        const texture = await fetch(`https://textures.minecraft.net/texture/${request.params.hash}`, {
          redirect: 'error', signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(config.timeoutMs)]),
        })
        if (!texture.ok || texture.body === null) { await texture.body?.cancel(); response.sendStatus(502); return }
        const reader = texture.body.getReader()
        const chunks: Buffer[] = []
        let bytes = 0
        try {
          while (true) {
            const part = await reader.read()
            if (part.done) break
            bytes += part.value.byteLength
            if (bytes > config.maxImageBytes) throw failure('image-too-large')
            chunks.push(Buffer.from(part.value))
          }
        } finally { await reader.cancel() }
        response.type('png').send(Buffer.concat(chunks))
      } catch (_error) { if (!response.headersSent) response.sendStatus(502) }
    })())
  })
  io.on('connection', (socket) => {
    const view = new WorldView(bot.world, config.viewDistance, bot.entity.position, socket)
    socket.emit('version', bot.version)
    view.listenToBot(bot)
    const position = () => {
      socket.emit('position', { pos: bot.entity.position, yaw: bot.entity.yaw, pitch: bot.entity.pitch })
      track(view.updatePosition(bot.entity.position))
    }
    bot.on('move', position)
    socket.once('disconnect', () => { bot.removeListener('move', position); view.removeListenersFromBot(bot) })
    track(view.init(bot.entity.position))
    position()
  })
  const close = (): Promise<void> => {
    closing ??= (async () => {
      closed = true
      lifetime.abort()
      try { await browser?.close() } finally {
        await new Promise<void>((resolve, reject) => { io.close((error) => { if (error) reject(error); else resolve() }) })
        await Promise.allSettled(work)
      }
    })()
    return closing
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw failure('camera-unavailable')
    browser = await chromium.launch({ headless: true, timeout: config.timeoutMs,
      ...(config.chromiumPath === '' ? {} : { executablePath: config.chromiumPath }),
      args: ['--enable-unsafe-swiftshader'] })
    const page = await browser.newPage({ viewport: { width: config.width, height: config.height } })
    let renderFailed = false
    page.on('pageerror', () => { renderFailed = true })
    await page.addInitScript(() => {
      for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        const original = prototype.drawElements
        prototype.drawElements = function (...args) {
          if (args[1] > 0 && this.canvas instanceof HTMLCanvasElement) this.canvas.dataset.minecraftRendered = 'true'
          return original.apply(this, args)
        }
      }
    })
    await page.goto(`http://127.0.0.1:${address.port}/`, { timeout: config.timeoutMs, waitUntil: 'networkidle' })
    await page.locator('canvas[data-minecraft-rendered="true"]').waitFor({ timeout: config.timeoutMs })
    if (renderFailed) throw failure('camera-render-failed')
    return {
      async capture(): Promise<Buffer> {
        if (closed || renderFailed) throw failure('camera-unavailable')
        const bytes = await page.screenshot({ type: 'jpeg', quality: config.jpegQuality, timeout: config.timeoutMs })
        if (bytes.length > config.maxImageBytes) throw failure('image-too-large')
        return bytes
      }, close,
    }
  } catch (error) { await close(); throw error }
}
