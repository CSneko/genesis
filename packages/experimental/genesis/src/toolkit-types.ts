/** Browser-safe operator toolkit fields; runtime activation is owned by Genesis. @module */
import type { QqPermissionStatus } from './qq-permission-types.ts'
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable toolkit identity, independent of display names and Session IDs. */
export type ToolkitId = Branded<'GenesisToolkitId'>
/** Operator-owned grouping; a trailing * matches a tool-name prefix. */
export interface ToolkitDefinition {
  id: ToolkitId
  name: string
  description: string
  tools: string[]
  qqAccess?: 'disabled' | 'anyone' | 'operator' | undefined
}
/** Complete editable catalogue with a revision fence and observed learning state. */
export interface ToolkitStatus {
  /** Independent operator policy and revision for per-person and per-group QQ permissions. */
  qqPermissions: QqPermissionStatus
  /** Last committed catalogue revision; zero denotes deployment defaults. */
  revision: number
  /** Complete editable groups, including those hidden from the character. */
  entries: ToolkitDefinition[]
  /** Derived provider-owned groups, excluded from operator saves; absent when none are registered. */
  managed?: ToolkitDefinition[]
  /** Durably learned tool names, including currently missing providers. */
  learned: string[]
  /** Registered in at least one live Agent scope; activation and permission are checked separately. */
  available: string[]
}
