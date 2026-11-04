/** Validated deployment limits for the local desktop worker. @module */
import Schema from '@deepseek-ai/schemastery'

/** Python/GI runtime and bounded desktop operations; optional deployment-owned persistent desktop sharing. */
export interface Config {
  /** Connect at activation and share the grant across Sessions; defaults to false. */
  autoConnect: boolean
  /** Absolute private restore-token file; required for autoConnect. */
  restoreTokenPath?: string
  /** Python with PyGObject and GStreamer; defaults to /usr/bin/python3. */
  python: string
  /** Initial worker readiness deadline; defaults to 10000 ms. */
  startupTimeoutMs: number
  /** System or application consent deadline; defaults to 120000 ms. */
  consentTimeoutMs: number
  /** Capture, D-Bus and ordinary tool deadline; defaults to 15000 ms. */
  callTimeoutMs: number
  /** Screenshot long-edge pixel ceiling; defaults to 1600. */
  maxImageDimension: number
  /** Complete worker response byte ceiling; defaults to 16777216. */
  maxResponseBytes: number
  /** Maximum text length per typing or replacement operation; defaults to 4000. */
  maxTextChars: number
  /** Enable AT-SPI application inspection and semantic actions; defaults to true. */
  accessibilityEnabled: boolean
  /** Require interactive approval for each application instance; defaults to true. */
  requireApplicationConsent: boolean
  /** Maximum visited nodes or application entries per inspection; defaults to 200. */
  accessibilityMaxNodes: number
  /** Maximum accessibility tree depth; defaults to 12. */
  accessibilityMaxDepth: number
  /** Maximum characters per accessible name or text excerpt; defaults to 512. */
  accessibilityTextChars: number
  /** Serialized accessibility result byte budget; defaults to 32768. */
  accessibilityResultBytes: number
  /** Accessibility traversal and per-request deadline; defaults to 5000 ms. */
  accessibilityTimeoutMs: number
  /** Managed worker termination grace; defaults to 1000 ms. */
  processGraceMs: number
}

/** Resolve local runtime paths and finite resource budgets before activation. */
export const Config: Schema<Partial<Config>, Config> = Schema.object({
  autoConnect: Schema.boolean().default(false),
  restoreTokenPath: Schema.string().pattern(/\S/u),
  python: Schema.string().pattern(/\S/u).default('/usr/bin/python3'),
  startupTimeoutMs: Schema.number().step(1).min(1).max(300000).default(10000),
  consentTimeoutMs: Schema.number().step(1).min(1).max(600000).default(120000),
  callTimeoutMs: Schema.number().step(1).min(1).max(300000).default(15000),
  maxImageDimension: Schema.number().step(1).min(64).max(4096).default(1600),
  maxResponseBytes: Schema.number().step(1).min(4096).max(67108864).default(16777216),
  maxTextChars: Schema.number().step(1).min(1).max(16000).default(4000),
  accessibilityEnabled: Schema.boolean().default(true),
  requireApplicationConsent: Schema.boolean().default(true),
  accessibilityMaxNodes: Schema.number().step(1).min(1).max(2000).default(200),
  accessibilityMaxDepth: Schema.number().step(1).min(1).max(32).default(12),
  accessibilityTextChars: Schema.number().step(1).min(16).max(4000).default(512),
  accessibilityResultBytes: Schema.number().step(1).min(1024).max(1048576).default(32768),
  accessibilityTimeoutMs: Schema.number().step(1).min(1).max(60000).default(5000),
  processGraceMs: Schema.number().step(1).min(1).max(10000).default(1000),
})
