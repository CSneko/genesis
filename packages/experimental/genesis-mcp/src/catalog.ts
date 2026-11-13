/** Official registry parsing and deterministic, supported installation recipes. @module */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { McpProduct, McpRecipe, McpInput } from './types.ts'

const input = z.object({
  name: z.string().max(256).optional(),
  description: z.string().max(4000).default(''),
  value: z.string().max(8192).optional(),
  default: z.string().max(8192).optional(),
  isRequired: z.boolean().default(false),
  isSecret: z.boolean().default(false),
  choices: z.array(z.string().max(8192)).max(100).default([]),
})
const variableInput = input.extend({ variables: z.record(z.string().max(128), input).default({}) })
const argument = variableInput.extend({
  type: z.enum(['named', 'positional']),
  valueHint: z.string().optional(),
  isRepeated: z.boolean().optional(),
})
const remote = z.object({
  type: z.string(),
  url: z.string().max(8192),
  headers: z
    .array(variableInput.extend({ name: z.string().min(1).max(256) }))
    .max(64)
    .default([]),
  variables: z.record(z.string().max(128), input).default({}),
})
/** Validated subset of published metadata; unsupported execution fields are retained for rejection. */
export const serverSchema = z.object({
  name: z.string().min(1).max(256),
  title: z.string().max(256).optional(),
  description: z.string().max(10000),
  version: z.string().min(1).max(128),
  websiteUrl: z.string().max(8192).optional(),
  repository: z.object({ url: z.string().max(8192) }).optional(),
  remotes: z.array(remote).max(30).default([]),
  packages: z
    .array(
      z.object({
        registryType: z.string(),
        identifier: z.string().max(256),
        version: z.string().max(128).optional(),
        registryBaseUrl: z.string().optional(),
        runtimeHint: z.string().optional(),
        fileSha256: z.string().optional(),
        transport: z.object({ type: z.string() }),
        environmentVariables: z
          .array(variableInput.extend({ name: z.string().min(1).max(256) }))
          .max(64)
          .default([]),
        runtimeArguments: z.array(argument).max(64).default([]),
        packageArguments: z.array(argument).max(64).default([]),
      }),
    )
    .max(30)
    .default([]),
})
export type Server = z.infer<typeof serverSchema>
type Input = z.infer<typeof input>
/** A recipe retains templates server-side, never accepting executable metadata from the browser. */
export interface Recipe extends McpRecipe {
  entry: {
    transport: 'streamable-http' | 'stdio'
    url?: string
    command?: string
    args?: string[]
    env?: Record<string, string>
    headers?: Record<string, string>
  }
}
/** Reject non-HTTP addresses, embedded credentials and credential-template injection.
 * @param value - Operator or registry address.
 * @returns Validated URL string.
 */
export function httpUrl(value: string): string {
  const url = new URL(value)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash || value.includes('${'))
    throw new Error('invalid-url')
  return value
}
/** Build only supported, pinned execution recipes; unavailable recipes remain visible as unsupported products.
 * @param server - Validated official metadata.
 * @returns Deterministic recipes and input descriptors.
 */
export function recipes(server: Server): Recipe[] {
  const results: Recipe[] = []
  const add = (
    id: string,
    label: string,
    local: boolean,
    build: (
      field: (id: string, label: string, spec: Input) => string,
      expand: (id: string, spec: z.infer<typeof variableInput>) => string,
    ) => Recipe['entry'],
  ) => {
    const inputs: McpInput[] = []
    const field = (key: string, name: string, spec: Input): string => {
      if (spec.value !== undefined) {
        if (spec.value.includes('${')) throw new Error('template')
        return spec.value
      }
      inputs.push({
        id: key,
        label: name,
        description: spec.description,
        secret: spec.isSecret,
        required: spec.isRequired,
        defaultValue: spec.isSecret ? '' : (spec.default ?? ''),
        choices: spec.choices,
      })
      return `{{${key}}}`
    }
    const expand = (key: string, spec: z.infer<typeof variableInput>): string => {
      if (Object.keys(spec.variables).length === 0) return field(key, spec.name ?? key, spec)
      if (spec.value === undefined || spec.value.includes('${')) throw new Error('template')
      return spec.value.replace(/\{([^{}]+)\}/gu, (_match, name: string) => {
        const variable = spec.variables[name]
        if (variable === undefined) throw new Error('variable')
        return field(`${key}.${name}`, name, variable)
      })
    }
    try {
      const entry = build(field, expand)
      const fingerprint = createHash('sha256')
        .update(JSON.stringify({ server: server.name, version: server.version, id, entry, inputs }))
        .digest('hex')
      results.push({ id, label, local, entry, inputs, fingerprint })
    } catch (_error: unknown) {
      /* Unsupported templates cannot produce a runnable recipe. */
    }
  }
  server.remotes.forEach((item, index) => {
    if (item.type !== 'streamable-http') return
    add(`remote-${index}`, item.url, false, (field, expand) => {
      httpUrl(item.url)
      // Hostnames and schemes are fixed by the publisher; inputs substitute only path/query values.
      const origin = new URL(item.url).origin
      if (origin.includes('{') || origin.includes('}')) throw new Error('variable-origin')
      const url = item.url.replace(/\{([^{}]+)\}/gu, (_match, name: string) => {
        const spec = item.variables[name]
        if (spec === undefined || spec.isSecret) throw new Error('url-variable')
        return field(`url.${name}`, name, spec)
      })
      return {
        transport: 'streamable-http',
        url,
        headers: Object.fromEntries(item.headers.map((header, i) => [header.name, expand(`header.${i}`, header)])),
      }
    })
  })
  server.packages.forEach((item, index) => {
    const npm = item.registryType === 'npm',
      pypi = item.registryType === 'pypi'
    if (
      (!npm && !pypi) ||
      item.transport.type !== 'stdio' ||
      item.runtimeArguments.length ||
      item.fileSha256 ||
      !item.version ||
      !/^\d[\w.+-]*$/u.test(item.version) ||
      !/^(?:@[a-z0-9_.-]+\/)?[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u.test(item.identifier) ||
      (item.runtimeHint && item.runtimeHint !== (npm ? 'npx' : 'uvx')) ||
      (item.registryBaseUrl && item.registryBaseUrl.replace(/\/$/u, '') !== (npm ? 'https://registry.npmjs.org' : 'https://pypi.org'))
    )
      return
    add(`package-${index}`, `${item.identifier}@${item.version}`, true, (_field, expand) => {
      const args = npm ? ['--yes', `${item.identifier}@${item.version}`] : [`${item.identifier}==${item.version}`]
      item.packageArguments.forEach((arg, i) => {
        if (arg.isRepeated || (arg.type === 'named' && !arg.name)) throw new Error('argument')
        const value = expand(`arg.${i}`, { ...arg, name: arg.name ?? arg.valueHint })
        if (arg.type === 'named') args.push(`${arg.name}=${value}`)
        else args.push(value)
      })
      return {
        transport: 'stdio',
        command: npm ? 'npx' : 'uvx',
        args,
        env: Object.fromEntries(item.environmentVariables.map((env, i) => [env.name, expand(`env.${i}`, env)])),
      }
    })
  })
  return results
}
/** Produce a browser view without private executable templates.
 * @param server - Validated registry record.
 * @returns Display metadata and supported choices.
 */
export function product(server: Server): McpProduct {
  let website = server.websiteUrl ?? server.repository?.url ?? ''
  try {
    if (website) httpUrl(website)
  } catch (_error: unknown) {
    website = ''
  }
  return {
    name: server.name,
    title: server.title ?? server.name,
    description: server.description,
    version: server.version,
    website,
    recipes: recipes(server).map(({ entry: _entry, ...recipe }) => recipe),
  }
}
