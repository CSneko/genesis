/** Real profile persistence and MCP registration, with a local protocol server. @module */
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import { toNodeHandler, type NodeIncomingMessageLike } from '@modelcontextprotocol/node'
import { z } from 'zod'
import { executeToolFixture } from '@deepseek-ai/dsh-tool-testkit'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { PeerId, RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { initProfile, mountRootInclude, readProfilePatches, type ProfileContext } from '@deepseek-ai/dsh-app-boot'
import ConfigEditor from '@deepseek-ai/dsh-config-editor'
import Settings from '@deepseek-ai/dsh-settings'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import McpManager from '@deepseek-ai/dsh-mcp-manager'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { mcpToolkits } from '../src/toolkits.ts'
import { McpMarketplace } from '../src/index.ts'
import { recipes, serverSchema, product } from '../src/catalog.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    'test-mcp-guest': { readonly kind: 'test-mcp-guest' }
  }
}
const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
  vi.restoreAllMocks()
})
const metadata = serverSchema.parse({
  name: 'io.example/fixture',
  description: 'Fixture service',
  title: 'Fixture',
  version: '1.0.0',
  remotes: [
    {
      type: 'streamable-http',
      url: 'https://example.com/mcp',
      headers: [{ name: 'Authorization', value: 'Bearer {key}', variables: { key: { isRequired: true, isSecret: true } } }],
    },
  ],
})
async function setup() {
  const home = await mkdtemp(join(tmpdir(), 'genesis-mcp-market-'))
  cleanup.push(() => rm(home, { recursive: true, force: true }))
  const handler = createMcpHandler(() => {
    const mcp = new McpServer({ name: 'fixture', version: '1.0.0' }, { capabilities: { tools: {} } })
    mcp.registerTool('ping', { description: 'Fixture ping', inputSchema: z.object({}) }, async () => ({
      content: [{ type: 'text', text: 'pong' }],
    }))
    return mcp
  })
  const handle = toNodeHandler(handler)
  let registryMetadata = metadata
  const server = createServer((request, response) => {
    if (request.url === '/mcp') {
      void handle(request as NodeIncomingMessageLike, response).catch(() => {
        response.writeHead(500).end()
      })
      return
    }
    response.setHeader('Content-Type', 'application/json')
    response.end(
      JSON.stringify(
        request.url?.includes('/versions/') ? { server: registryMetadata } : { servers: [{ server: registryMetadata }], metadata: {} },
      ),
    )
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  cleanup.push(async () => {
    await handler.close()
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()))
      server.closeAllConnections()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('No registry address')
  const registryUrl = `http://127.0.0.1:${address.port}`
  registryMetadata = serverSchema.parse({ ...metadata, remotes: [{ ...metadata.remotes[0], url: `${registryUrl}/mcp` }] })
  const dir = join(home, 'profile')
  initProfile(dir, ['test-market'])
  const bundle = join(dir, 'node_modules/test-market')
  await mkdir(bundle, { recursive: true })
  await writeFile(join(home, 'package.json'), '{"name":"test-installation"}\n')
  await writeFile(
    join(bundle, 'package.json'),
    JSON.stringify({ name: 'test-market', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }),
  )
  await writeFile(
    join(bundle, 'cordis.patch.yml'),
    JSON.stringify([
      {
        insert: [
          { id: 'mcp-manager', name: 'cordis:manager', inject: ['credentials'] },
          { id: 'market', name: 'cordis:market', config: { registryUrl } },
        ],
      },
    ]),
  )
  await writeFile(join(dir, 'cordis.yml'), '[]\n')
  const profile: ProfileContext = {
    name: 'test',
    startedBundles: ['test-market'],
    dir,
    patchPath: join(dir, 'cordis.patch.yml'),
    installAnchor: join(home, 'package.json'),
    cwd: home,
    home,
    overlays: [],
    telemetryDisabledEnv: undefined,
  }
  const boot = async () => {
    const ctx = new Context()
    cleanup.push(() => ctx.fiber.dispose())
    ctx.baseUrl = pathToFileURL(home).href + '/'
    ctx.provide('profileContext', profile)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(Tools)
    await ctx.plugin(Credentials, { path: join(home, 'credentials.yml'), watch: false })
    await ctx.plugin(Loader)
    ctx.loader.builtins['manager'] = McpManager
    ctx.loader.builtins['market'] = McpMarketplace
    await ctx.plugin(ConfigEditor)
    await ctx.plugin(Settings)
    await mountRootInclude(ctx, join(dir, 'cordis.yml'), readProfilePatches('test', profile))
    await ctx.loader.await()
    return ctx
  }
  return { home, profile, boot, ctx: await boot() }
}
it('installs from the displayed recipe, protects credentials, rejects replay and restores the live service after restart', async () => {
  const { ctx, profile, home, boot } = await setup(),
    signal = new AbortController().signal
  const page = await ctx.genesisMcp.search('', null, signal),
    item = page.products[0]!,
    recipe = item.recipes[0]!
  const before = await ctx.genesisMcp.inspect(signal)
  const guest = ctx.extend({
    invocation: {
      request: { namespace: 'genesisMcp', method: 'install', args: {} },
      service: 'genesisMcp',
      signal,
      async *uplink() {},
      peer: {
        id: brandString<PeerId>('mcp-guest'),
        ctx,
        principal: { kind: 'test-mcp-guest' },
        signal,
        interactions: 'none',
        async dispose() {},
      },
    } satisfies RemoteInvocation,
  })
  await expect(guest.genesisMcp.search('', null, signal)).rejects.toMatchObject({ details: { reason: 'denied' } })
  const request = {
    name: item.name,
    version: item.version,
    recipe: recipe.id,
    fingerprint: recipe.fingerprint,
    values: { [recipe.inputs[0]!.id]: 'fixture-secret' },
    revision: before.revision,
  }
  await expect(guest.genesisMcp.installService(request, signal)).rejects.toMatchObject({ details: { reason: 'denied' } })
  expect(ctx.mcpManager.list()).toHaveLength(0)
  await expect(ctx.genesisMcp.installService({ ...request, fingerprint: '0'.repeat(64) }, signal)).rejects.toMatchObject({
    details: { reason: 'changed' },
  })
  const name = await ctx.genesisMcp.installService(request, signal)
  await vi.waitFor(() => {
    expect(ctx.tools.get(`mcp__${name}__ping`), JSON.stringify(ctx.mcpManager.list())).toBeDefined()
  })
  expect(
    mcpToolkits(
      ctx.mcpManager.list(),
      ctx.tools.schemas().map(tool => tool.name),
    ),
  ).toEqual([expect.objectContaining({ id: `mcp-${name}`, tools: [`mcp__${name}__*`], qqAccess: 'disabled' })])
  const result = await executeToolFixture(ctx, { name: `mcp__${name}__ping`, arguments: {}, callId: ToolCallId('mcp-fixture-call'), signal })
  expect(result.isError).not.toBe(true)
  expect(JSON.stringify(result)).toContain('pong')
  expect(await readFile(profile.patchPath, 'utf8')).not.toContain('fixture-secret')
  expect(await readFile(join(home, 'credentials.yml'), 'utf8')).toContain('fixture-secret')
  await expect(ctx.genesisMcp.installService(request, signal)).rejects.toMatchObject({ details: { reason: 'stale' } })
  const current = await ctx.genesisMcp.inspect(signal)
  await expect(ctx.genesisMcp.installService({ ...request, revision: current.revision }, signal)).rejects.toMatchObject({
    details: { reason: 'duplicate' },
  })
  expect(JSON.stringify(current)).not.toContain('fixture-secret')
  expect(current.servers).toContainEqual(expect.objectContaining({ name, state: 'connected', tools: [`mcp__${name}__ping`] }))
  await ctx.fiber.dispose()
  const restored = await boot()
  await vi.waitFor(() => {
    expect(restored.tools.get(`mcp__${name}__ping`)).toBeDefined()
  })
  await restored.genesisMcp.control(name, 'disable', (await restored.genesisMcp.inspect(signal)).revision, signal)
  await vi.waitFor(() => {
    expect(restored.tools.get(`mcp__${name}__ping`)).toBeUndefined()
  })
  await vi.waitFor(() => {
    expect(
      mcpToolkits(
        restored.mcpManager.list(),
        restored.tools.schemas().map(tool => tool.name),
      ),
    ).toEqual([])
  })
  await restored.genesisMcp.control(name, 'remove', (await restored.genesisMcp.inspect(signal)).revision, signal)
  await vi.waitFor(() => {
    expect(restored.mcpManager.list()).toHaveLength(0)
  })
  expect(await readFile(join(home, 'credentials.yml'), 'utf8')).not.toContain('fixture-secret')
  await restored.genesisMcp.addCustom(
    {
      name: 'custom',
      transport: 'streamable-http',
      url: recipe.label,
      command: '',
      args: [],
      env: {},
      headers: { Authorization: 'Bearer custom-secret', 'X-Optional': '' },
    },
    (await restored.genesisMcp.inspect(signal)).revision,
    signal,
  )
  await vi.waitFor(() => {
    expect(restored.tools.get('mcp__custom__ping')).toBeDefined()
  })
  expect(await readFile(profile.patchPath, 'utf8')).not.toContain('custom-secret')
  await restored.genesisMcp.control('custom', 'remove', (await restored.genesisMcp.inspect(signal)).revision, signal)
  await vi.waitFor(() => {
    expect(
      mcpToolkits(
        restored.mcpManager.list(),
        restored.tools.schemas().map(tool => tool.name),
      ),
    ).toEqual([])
  })
  expect(await readFile(join(home, 'credentials.yml'), 'utf8')).not.toContain('custom-secret')
})
it('keeps unknown profile write outcomes visible and blocks dependent changes', async () => {
  const { ctx } = await setup(),
    signal = new AbortController().signal
  const page = await ctx.genesisMcp.search('', null, signal),
    item = page.products[0]!,
    recipe = item.recipes[0]!
  const before = await ctx.genesisMcp.inspect(signal)
  vi.spyOn(ctx.settings, 'mutate').mockRejectedValueOnce(new Error('uncertain-secret-value'))
  await expect(
    ctx.genesisMcp.installService(
      {
        name: item.name,
        version: item.version,
        recipe: recipe.id,
        fingerprint: recipe.fingerprint,
        values: { [recipe.inputs[0]!.id]: 'fixture-secret' },
        revision: before.revision,
      },
      signal,
    ),
  ).rejects.toMatchObject({ details: { reason: 'uncertain' } })
  expect((await ctx.genesisMcp.inspect(signal)).uncertain).toBe(true)
  await expect(ctx.genesisMcp.control('anything', 'enable', 0, signal)).rejects.toMatchObject({ details: { reason: 'uncertain' } })
  expect(ctx.mcpManager.list()).toHaveLength(0)
})
it('supports pinned packages and required inputs without accepting runtime flags, executable URLs or credential interpolation', () => {
  const npm = {
    registryType: 'npm',
    identifier: '@example/server',
    version: '1.2.3',
    transport: { type: 'stdio' },
    environmentVariables: [{ name: 'API_KEY', isSecret: true, isRequired: true }],
  }
  const parsed = serverSchema.parse({ name: 'io.example/local', description: 'Local', version: '1', packages: [npm] })
  const recipe = recipes(parsed)[0]!
  expect(recipe.entry).toMatchObject({ command: 'npx', args: ['--yes', '@example/server@1.2.3'] })
  expect(recipe.inputs[0]).toMatchObject({ label: 'API_KEY', secret: true, required: true })
  expect(product(serverSchema.parse({ ...parsed, packages: [{ ...npm, version: 'latest' }] })).recipes).toEqual([])
  expect(product(serverSchema.parse({ ...parsed, packages: [{ ...npm, identifier: 'https://example.com/run.js' }] })).recipes).toEqual([])
  expect(
    product(
      serverSchema.parse({
        ...metadata,
        remotes: [
          {
            type: 'streamable-http',
            url: 'https://example.com/mcp',
            headers: [{ name: 'Authorization', value: '${credential:PRIVATE_TOKEN}' }],
          },
        ],
      }),
    ).recipes,
  ).toEqual([])
})
