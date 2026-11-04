/** One Minecraft connection and cancellable skills, independent of model inference. @module */
import { randomUUID } from 'node:crypto'
import mineflayer, { type Bot } from 'mineflayer'
import navigation from 'mineflayer-pathfinder'
import { Vec3 } from 'vec3'
import { z } from 'zod'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import { brandString } from '@deepseek-ai/dsh-brand'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import type { MinecraftChat, MinecraftCollectionProgress, MinecraftConnection, MinecraftObservation, MinecraftObservationId, MinecraftPlayerId, MinecraftSettings, MinecraftSkillOutcome, MinecraftStatus, MinecraftScriptEvent } from './types.ts'
import { failure } from './settings.ts'
import { openCamera, type CameraConfig } from './camera.ts'
import { digTarget, type MinecraftDigTarget } from './dig.ts'
import { collectBlocks, inventoryCount } from './collect.ts'
import { useTarget, type UseConfig } from './use.ts'
import { blockQuerySchema, selectBlocks, describeBlock, type MinecraftBlockQuery } from './blocks.ts'

/** Model input accepts bounded skills and concrete targets, never executable code. */
export const actionSchema = z.strictObject({
  ...blockQuerySchema.omit({ limit: true }).shape,
  action: z.enum(['goto', 'move', 'follow', 'look', 'dig', 'collect', 'place', 'equip', 'craft', 'use', 'attack', 'eat', 'chat', 'respawn']),
  observationId: z.string().min(1).transform(brandString<MinecraftObservationId>),
  playerId: z.string().max(100).transform(brandString<MinecraftPlayerId>).optional(), entityId: z.number().int().optional(),
  item: z.string().max(100).optional(), count: z.number().int().min(1).max(64).default(1),
  face: z.enum(['up', 'down', 'north', 'south', 'east', 'west']).default('up'),
  message: z.string().min(1).max(256).optional(),
  waitForCompletion: z.boolean().optional(),
  useTarget: z.enum(['item', 'block', 'entity']).optional(), durationMs: z.number().int().min(0).max(300000).optional(),
  direction: z.enum(['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'forward', 'backward', 'left', 'right']).optional(),
  distance: z.number().finite().min(1).max(256).optional(),
})
/** Parsed skill request; optional fields are required by the corresponding skill at execution. */
export type MinecraftAction = z.infer<typeof actionSchema>
/** Settled bounded skill result; interruption does not roll back operations already sent to the server. */
export type MinecraftActionOutcome = MinecraftSkillOutcome
/** In-process admission and its completion promise; the controller exposes only JSON results to tools. */
export interface MinecraftAdmission {
  started: string
  completion: Promise<MinecraftActionOutcome>
}
/** Runtime resource bounds. */
export interface RuntimeConfig extends CameraConfig, UseConfig {
  /** Maximum milliseconds allowed for game connection and initial renderer setup. */
  connectTimeoutMs: number
  /** Maximum nearest client-known entities included in an observation. */
  entityLimit: number
  /** Maximum inventory stacks included in an observation. */
  inventoryLimit: number
  /** Maximum recent player chat messages retained in memory and included in observations. */
  chatLimit: number
  /** Maximum recently issued observation identifiers retained for action admission. */
  observationLimit: number
  /** Maximum observation age in milliseconds at skill admission. */
  observationMaxAgeMs: number
  /** Maximum radius searched around the bot for optional mining hints. */
  digSearchRadius: number
  /** Maximum matching blocks evaluated per assisted mining skill. */
  digCandidates: number
  /** Maximum eye-to-block-center distance admitted for digging; pathfinding approaches a visible face. */
  digReach: number
  /** Maximum distance for a single directional move, in blocks. */
  moveMaxDistance: number
  /** Maximum nearby block records in an observation. */
  blockLimit: number
  /** Radius searched for observation block records; unloaded regions remain unknown. */
  blockSearchRadius: number
  /** Maximum source blocks mined by one collection skill. */
  collectBlockLimit: number
  /** Maximum wait per mined block for inventory acquisition, including pickup movement. */
  collectPickupTimeoutMs: number
  /** Radius around each mined block in which matching drops may be approached. */
  collectPickupRadius: number
}
type Connection = { bot: Bot; lifetime: AbortController; ended: Promise<void>; camera?: Awaited<ReturnType<typeof openCamera>> }

/** One bot owns controls; every stop invalidates decisions based on preceding observations. */
export class MinecraftRuntime {
  private connection: Connection | undefined
  private setup: Promise<void> | undefined
  private skill: { controller: AbortController; task: Promise<MinecraftActionOutcome>; name: string } | undefined
  private observations = new Map<MinecraftObservationId, { time: number; epoch: number }>()
  private epoch = 0
  private incoming: MinecraftChat[] = []
  private chatSequence = 0
  private settings: MinecraftSettings | undefined
  private failure: string | null = null
  private health: number | undefined
  private spawned = false
  private closing: Promise<void> | undefined
  private lastAction: MinecraftObservation['lastAction']
  /**
   * @param config - Trusted resource bounds.
   * @param onChat - Optional synchronous notification after chat is buffered; the receiver owns callback failures. Omission retains chat for explicit observations only.
   * @param onDanger - Optional synchronous injury/death notification; omission only stops game controls. The receiver owns callback failures.
   * @param onEvent - Optional synchronous bounded event delivery; listeners must not execute game work inline.
   * @param onEnd - Optional notification after an ended connection has drained; omission leaves connection supervision to explicit callers.
   */
  constructor(private readonly config: RuntimeConfig, private readonly onChat?: () => void, private readonly onEnd?: () => void, private readonly onDanger?: () => void,
    private readonly onEvent?: (event: MinecraftScriptEvent) => void) {}
  /** Current control generation, incremented by every interruption.
   * @returns Monotonic in-process control generation.
   */
  get controlRevision(): number { return this.epoch }
  /**
   * Connection and capture status without server error contents.
   * @returns Detached live status fields.
   */
  status(): Pick<MinecraftStatus, 'connection' | 'failure'> & { action: string } {
    return { connection: this.connection === undefined ? 'disconnected' as const : this.spawned ? 'connected' as const : 'connecting' as const,
      failure: this.failure, action: this.skill?.name ?? 'idle' }
  }
  /**
   * Connect only after explicit operator or tool admission. Failed setup closes the bot and camera.
   * @param settings - Captured operator settings and explicit connection choices.
   * @param signal - Caller and plugin cancellation.
   * @returns After spawn and optional first-person renderer readiness; no automatic reconnection occurs.
   */
  async connect(settings: MinecraftSettings & MinecraftConnection, signal: AbortSignal): Promise<void> {
    if (this.connection !== undefined || this.setup !== undefined || this.closing !== undefined) throw failure('already-connected')
    if (!settings.enabled) throw failure('disabled')
    this.settings = settings; this.failure = null; this.incoming = []; this.chatSequence = 0; this.lastAction = undefined
    signal.throwIfAborted()
    const lifetime = new AbortController()
    const owned = AbortSignal.any([signal, lifetime.signal, AbortSignal.timeout(this.config.connectTimeoutMs)])
    const bot = mineflayer.createBot({ host: settings.host, port: settings.port, username: settings.username, auth: 'offline',
      ...(settings.version ? { version: settings.version } : {}), profilesFolder: false,
      respawn: false, logErrors: false, hideErrors: true })
    const ended = new Promise<void>((resolve) => { bot.once('end', () => { resolve() }) })
    const connection: Connection = { bot, lifetime, ended }
    this.connection = connection
    bot.loadPlugin(navigation.pathfinder)
    bot.on('error', () => { this.failure = 'connection-failed'; this.stop() })
    bot.on('kicked', () => { this.failure = 'kicked'; this.stop() })
    bot.once('end', () => {
      const unexpected = !lifetime.signal.aborted
      this.spawned = false; this.stop(); lifetime.abort()
      void this.disconnect().then(() => { if (unexpected) this.onEnd?.() }).catch(() => { this.failure = 'disconnect-failed' })
    })
    const receive = (channel: MinecraftChat['channel'], player: string, message: string) => {
      if (player === bot.username || this.connection !== connection || lifetime.signal.aborted) return
      const uuid = bot.players[player]?.uuid
      this.incoming.push({ sequence: ++this.chatSequence, channel, player: player.slice(0, 100), message: message.slice(0, 256),
        ...(uuid === undefined ? {} : { playerId: brandString<MinecraftPlayerId>(uuid) }) })
      this.incoming = this.incoming.slice(-this.config.chatLimit)
      this.onEvent?.({ type: 'chat', channel, player: player.slice(0, 100), message: message.slice(0, 256),
        ...(uuid === undefined ? {} : { playerId: brandString<MinecraftPlayerId>(uuid) }) })
      this.onChat?.()
    }
    bot.on('chat', (player, message) => { receive('public', player, message) })
    bot.on('whisper', (player, message) => { receive('whisper', player, message) })
    bot.on('health', () => {
      if (this.health !== undefined && bot.health < this.health) { this.onDanger?.(); this.stop(); this.failure = 'hurt' }
      if (bot.health <= settings.lowHealth) { this.onDanger?.(); this.stop(); this.failure = 'low-health' }
      this.health = bot.health
      this.onEvent?.({ type: 'health', health: bot.health, food: bot.food })
    })
    const inventoryChanged = () => { this.onEvent?.({ type: 'inventory' }) }
    const blockChanged: (before: ReturnType<Bot['blockAt']>, after: ReturnType<Bot['blockAt']>) => void = (before, after) => {
      const position = after?.position ?? before?.position
      if (position !== undefined) this.onEvent?.({ type: 'blockUpdate', position: { x: position.x, y: position.y, z: position.z },
        before: before?.name ?? null, after: after?.name ?? null })
    }
    bot.inventory.on('updateSlot', inventoryChanged); bot.on('blockUpdate', blockChanged)
    lifetime.signal.addEventListener('abort', () => {
      bot.inventory.removeListener('updateSlot', inventoryChanged); bot.removeListener('blockUpdate', blockChanged)
    }, { once: true })
    bot.on('death', () => { this.onDanger?.(); this.stop(); this.failure = 'dead' })
    const task = (async () => {
      await new Promise<void>((resolve, reject) => {
        const clean = () => { bot.removeListener('spawn', spawn); bot.removeListener('error', error); owned.removeEventListener('abort', abort) }
        const spawn = () => { clean(); resolve() }
        const error = () => { clean(); reject(failure('connection-failed')) }
        const abort = () => { clean(); reject(failure('connection-timeout')) }
        bot.once('spawn', spawn); bot.once('error', error); owned.addEventListener('abort', abort, { once: true })
        if (owned.aborted) abort()
      })
      owned.throwIfAborted()
      this.spawned = true
      const movements = new navigation.Movements(bot)
      movements.canDig = false; movements.allow1by1towers = false; movements.allowParkour = false
      bot.pathfinder.setMovements(movements)
      if (settings.vision) {
        await bot.waitForChunksToLoad()
        owned.throwIfAborted()
        const camera = await openCamera(bot, this.config)
        if (owned.aborted) { await camera.close(); owned.throwIfAborted() }
        connection.camera = camera
      }
    })()
    this.setup = task
    try { await task } catch (error) {
      this.failure ??= 'connection-failed'
      // Setup owns its cleanup; disconnect may concurrently be waiting for this task.
      lifetime.abort(); bot._client.socket?.destroy()
      await connection.camera?.close(); this.connection = undefined; this.spawned = false
      throw error
    } finally { if (this.setup === task) this.setup = undefined }
  }
  /**
   * Stop controls synchronously and invalidate earlier observations; accepted skill work settles asynchronously.
   * @returns No completion claim for interrupted digging, placement or crafting.
   */
  stop(): void {
    this.epoch++
    this.skill?.controller.abort()
    const bot = this.connection?.bot
    if (bot === undefined) return
    bot.pathfinder.setGoal(null); bot.clearControlStates(); bot.stopDigging(); bot.deactivateItem()
  }
  /**
   * Close the connection, camera and accepted skill.
   * @returns After setup and owned work quiesce.
   */
  disconnect(): Promise<void> {
    if (this.closing !== undefined) return this.closing
    const connection = this.connection
    connection?.lifetime.abort(); this.stop()
    connection?.bot._client.socket?.destroy()
    const task = (async () => {
      await this.setup?.catch((_error: unknown) => { /* Connect caller reports failed setup. */ })
      await this.skill?.task
      await connection?.camera?.close()
      if (connection?.bot._client.socket !== undefined) await connection.ended
      if (this.connection === connection) this.connection = undefined
      this.spawned = false; this.observations.clear(); this.incoming = []
    })()
    this.closing = task
    void task.then(() => { if (this.closing === task) this.closing = undefined }, () => { /* Keep failed cleanup visible and refuse reconnection. */ })
    return task
  }
  /**
   * Read buffered public and private player speech without waiting for rendering or Jev.
   * @param after - Last delivered sequence in this connection; zero reads from the beginning.
   * @returns Detached retained messages, latest sequence and count omitted by the bounded buffer.
   */
  chats(after: number): { messages: MinecraftChat[]; cursor: number; omitted: number } {
    const messages = this.incoming.filter(message => message.sequence > after)
    return { messages: structuredClone(messages), cursor: this.chatSequence,
      omitted: Math.max(0, this.chatSequence - after - messages.length) }
  }
  /**
   * Sample bounded client-known state.
   * @param blockName - Optional exact name or fragment for nearby blocks; omission returns nearby diggable blocks of any name.
   * @returns An observation accepted by act until timeout or any interruption; supported actions do not imply learning or permission.
   */
  observe(blockName?: string): MinecraftObservation {
    const bot = this.bot()
    const id = brandString<MinecraftObservationId>(randomUUID())
    this.observations.set(id, { time: Date.now(), epoch: this.epoch })
    while (this.observations.size > this.config.observationLimit) this.observations.delete(this.observations.keys().next().value!)
    const blocks = selectBlocks(bot, blockName === undefined ? {} : { blockName },
      { ...this.config, digSearchRadius: this.config.blockSearchRadius, digCandidates: this.config.blockLimit }, true)
      .map(block => describeBlock(bot, block, this.config.digReach))
    const cursor = bot.blockAtCursor(this.config.digReach)
    return { id, time: new Date().toISOString(), position: { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z },
      health: bot.health, food: bot.food, dimension: bot.game.dimension, action: this.skill?.name ?? 'idle', failure: this.failure,
      inventory: bot.inventory.items().slice(0, this.config.inventoryLimit).map(item => ({ name: item.name, count: item.count })),
      entities: Object.values(bot.entities).filter(entity => entity !== bot.entity)
        .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))
        .slice(0, this.config.entityLimit).map(entity => ({ id: entity.id, name: (entity.username ?? entity.name ?? 'unknown').slice(0, 100),
          distance: Math.round(entity.position.distanceTo(bot.entity.position) * 10) / 10,
          ...(entity.uuid === undefined ? {} : { uuid: brandString<MinecraftPlayerId>(entity.uuid) }) })), chat: structuredClone(this.incoming),
      blocks, crosshair: cursor === null ? null : { name: cursor.name, position: { x: cursor.position.x, y: cursor.position.y, z: cursor.position.z } },
      supportedActions: [...actionSchema.shape.action.options], ...(this.lastAction === undefined ? {} : { lastAction: structuredClone(this.lastAction) }) }
  }
  /**
   * Find bounded loaded blocks by conditions or explicit coordinates.
   * @param query - Conditions without coordinates search around the bot; coordinates alone select one exact block.
   * @returns A fresh action observation identifier and ranked block evidence.
   */
  findBlocks(query: MinecraftBlockQuery) {
    const bot = this.bot()
    const blocks = selectBlocks(bot, query, this.config, true).map(block => describeBlock(bot, block, this.config.digReach))
    const observation = this.observe()
    return { observationId: observation.id, blocks }
  }
  /**
   * Count an exact item across the full connected inventory.
   * @param item - Registry item name.
   * @returns Current count without observation truncation; disconnected reads fail visibly.
   */
  inventoryCount(item: string): number { return inventoryCount(this.bot(), item) }
  /**
   * Capture the current camera without silently substituting text.
   * @returns JPEG bytes, or undefined when vision was explicitly disabled.
   */
  capture(): Promise<Buffer | undefined> { this.bot(); return this.connection?.camera?.capture() ?? Promise.resolve(undefined) }
  private bot(): Bot { if (!this.spawned || this.connection === undefined) throw failure('not-connected'); return this.connection.bot }
  /**
   * Start a bounded asynchronous skill, replacing previous work after it settles; speech sends immediately without interrupting movement.
   * @param action - Parsed request referencing a recent observation from this connection.
   * @param signal - Optional caller cancellation for waiting actions; omitted or nonwaiting actions remain connection-owned.
   * @param beforeStart - Optional owner callback after observation validation and before replacing a non-chat skill; omission changes no task supervision.
   * @returns Actual admission and a completion promise; observe also reports the running skill or failure. Waiting for follow is refused because it has no natural completion.
   */
  async act(action: MinecraftAction, signal?: AbortSignal, beforeStart?: () => void): Promise<MinecraftAdmission> {
    signal?.throwIfAborted()
    if (action.action === 'follow' && action.waitForCompletion === true) throw failure('follow-is-continuous')
    const observed = this.observations.get(action.observationId)
    if (observed === undefined || (action.action !== 'chat' && observed.epoch !== this.epoch) || Date.now() - observed.time > this.config.observationMaxAgeMs) throw failure('stale-observation')
    const bot = this.bot()
    if (action.action === 'chat') {
      if (action.message === undefined || action.message.trimStart().startsWith('/') || /[\r\n\u0000]/u.test(action.message)) throw failure('chat-required')
      if (action.playerId === undefined) bot.chat(action.message)
      else {
        const player = Object.values(bot.players).find(player => player.uuid === action.playerId)
        if (player === undefined || !/^[A-Za-z0-9_]{1,16}$/u.test(player.username)) throw failure('player-not-known')
        bot.whisper(player.username, action.message)
      }
      return { started: 'chat', completion: Promise.resolve({ outcome: 'completed', failure: null }) }
    }
    const kind = action.action
    beforeStart?.()
    this.stop()
    const epoch = this.epoch
    await this.skill?.task
    signal?.throwIfAborted()
    if (epoch !== this.epoch) throw failure('stale-observation')
    if (!this.spawned) throw failure('not-connected')
    const controller = new AbortController()
    let timedOut = false
    let mined: MinecraftDigTarget | undefined
    let collection: MinecraftCollectionProgress | undefined
    const timeout = setTimeout(() => { timedOut = true; this.stop(); this.failure = 'skill-timeout' }, this.settings!.skillTimeoutMs)
    const target = () => {
      if (action.x === undefined || action.y === undefined || action.z === undefined) throw failure('target-required')
      return new Vec3(action.x, action.y, action.z)
    }
    const run = async () => {
      controller.signal.throwIfAborted()
      switch (kind) {
        case 'goto': {
          const destination = target().floored()
          await bot.pathfinder.goto(new navigation.goals.GoalNear(...destination.toArray(), 1))
          if (bot.entity.position.floored().distanceTo(destination) > 1) throw failure('destination-not-reached')
          break
        }
        case 'move': {
          if (action.direction === undefined || action.distance === undefined || action.distance > this.config.moveMaxDistance) throw failure('direction-and-distance-required')
          const forward = new Vec3(-Math.sin(bot.entity.yaw), 0, -Math.cos(bot.entity.yaw))
          const vectors = { north: new Vec3(0, 0, -1), south: new Vec3(0, 0, 1), east: new Vec3(1, 0, 0), west: new Vec3(-1, 0, 0),
            northeast: new Vec3(1, 0, -1), northwest: new Vec3(-1, 0, -1), southeast: new Vec3(1, 0, 1), southwest: new Vec3(-1, 0, 1),
            forward, backward: forward.scaled(-1), left: new Vec3(forward.z, 0, -forward.x), right: new Vec3(-forward.z, 0, forward.x) }
          const destination = bot.entity.position.plus(vectors[action.direction].normalize().scaled(action.distance)).floored()
          await bot.pathfinder.goto(new navigation.goals.GoalBlock(...destination.toArray()))
          if (!bot.entity.position.floored().equals(destination)) throw failure('destination-not-reached')
          break
        }
        case 'follow': {
          if (action.playerId === undefined) throw failure('player-required')
          const player = Object.values(bot.players).find(player => player.uuid === action.playerId)?.entity
          if (player === undefined) throw failure('player-not-known')
          bot.pathfinder.setGoal(new navigation.goals.GoalFollow(player, 2), true)
          await new Promise<void>((resolve) => { controller.signal.addEventListener('abort', () => { resolve() }, { once: true }) })
          break
        }
        case 'look': await bot.lookAt(target()); break
        case 'dig': mined = await digTarget(bot, action, this.config, controller.signal); break
        case 'collect': {
          if (action.item === undefined) throw failure('collection-item-and-block-required')
          const before = inventoryCount(bot, action.item)
          collection = { item: action.item, requested: action.count, before, current: before, gained: 0, minedBlocks: 0 }
          await collectBlocks(bot, action, this.config, collection, controller.signal)
          break
        }
        case 'equip': case 'place': {
          const item = bot.inventory.items().find(item => item.name === action.item)
          if (item === undefined) throw failure('item-missing')
          await bot.equip(item, 'hand'); controller.signal.throwIfAborted()
          if (action.action === 'place') {
            const block = bot.blockAt(target())
            if (block === null || block.position.distanceTo(bot.entity.position) > 5) throw failure('block-unreachable')
            const faces = { up: new Vec3(0, 1, 0), down: new Vec3(0, -1, 0), north: new Vec3(0, 0, -1),
              south: new Vec3(0, 0, 1), east: new Vec3(1, 0, 0), west: new Vec3(-1, 0, 0) }
            await bot.placeBlock(block, faces[action.face])
          }
          break
        }
        case 'craft': {
          const item = bot.registry.itemsByName[action.item ?? '']
          if (item === undefined) throw failure('item-missing')
          const table = bot.findBlock({ matching: block => block.name === 'crafting_table', maxDistance: 4 })
          const recipe = bot.recipesFor(item.id, null, action.count, table)[0]
          if (recipe === undefined) throw failure('recipe-unavailable')
          for (let count = 0; count < action.count; count++) {
            controller.signal.throwIfAborted(); await bot.craft(recipe, 1, table ?? undefined)
          }
          break
        }
        case 'use': await useTarget(bot, action, this.config, controller.signal); break
        case 'eat': await bot.consume(); break
        case 'attack': {
          const entity = bot.entities[action.entityId ?? -1]
          if (entity === undefined || entity.position.distanceTo(bot.entity.position) > 3) throw failure('entity-unreachable')
          bot.attack(entity); break
        }
        case 'respawn': bot.respawn(); break
        default: assertNever(kind, 'Minecraft action')
      }
    }
    const skill = { controller, task: Promise.resolve<MinecraftActionOutcome>({ outcome: 'completed', failure: null }), name: action.action }
    this.skill = skill; this.failure = null
    const abort = () => { if (this.skill === skill) this.stop() }
    if (action.waitForCompletion === true) signal?.addEventListener('abort', abort, { once: true })
    skill.task = run().then((): MinecraftActionOutcome => {
      if (controller.signal.aborted) return { outcome: timedOut ? 'timed-out' : 'interrupted', failure: timedOut ? 'skill-timeout' : null }
      return { outcome: 'completed', failure: null, ...(mined === undefined ? {} : { target: mined }) }
    }, (error: unknown): MinecraftActionOutcome => {
      if (controller.signal.aborted) return { outcome: timedOut ? 'timed-out' : 'interrupted', failure: timedOut ? 'skill-timeout' : null }
      const detail = remoteErrorOf(error)
      this.failure = detail?.code === 'minecraft/operation' ? detail.details.reason : 'skill-failed'
      this.stop()
      return { outcome: 'failed', failure: this.failure }
    }).then((outcome) => {
      const result = { ...outcome, ...(collection === undefined ? {} : { collection: structuredClone(collection) }) }
      if (this.skill === skill) this.lastAction = { action: kind, ...result }
      return result
    }).finally(() => {
      clearTimeout(timeout); signal?.removeEventListener('abort', abort)
      if (this.skill === skill) this.skill = undefined
    })
    if (action.waitForCompletion === true && signal?.aborted) abort()
    return { started: action.action, completion: skill.task }
  }
}
