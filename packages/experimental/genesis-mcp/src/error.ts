/** Stable failures safe to expose without provider diagnostics or credential values. @module */
/** Failure reason interpreted by the operator interface. */
export type McpFailure =
  | 'invalid'
  | 'query'
  | 'changed'
  | 'duplicate'
  | 'unsupported'
  | 'missing-input'
  | 'registry'
  | 'registry-size'
  | 'capacity'
/** Expected catalog or input rejection; writes have not been admitted. */
export class McpError extends Error {
  /** @param reason - Stable category; never includes operator inputs. */
  constructor(readonly reason: McpFailure) {
    super(`MCP ${reason}`)
    this.name = 'McpError'
  }
}
