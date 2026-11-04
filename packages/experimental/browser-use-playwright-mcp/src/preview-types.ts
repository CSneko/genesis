/** Transient operator-only browser observations; no page content enters model context. @module */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Identity of one process-local action, never reused during this provider activation. */
export type BrowserActionId = Branded<'BrowserActionId'>

/** Stable identity of a live page; closing it or restarting the provider invalidates the identity. */
export type BrowserTabId = Branded<'BrowserTabId'>

/** Operator input against one explicitly observed page; coordinates are viewport fractions. */
export type BrowserInput =
  | { kind: 'click'; x: number; y: number }
  | { kind: 'scroll'; x: number; y: number; deltaX: number; deltaY: number }
  | { kind: 'key'; key: string }
  | { kind: 'text'; text: string }
  | { kind: 'navigate'; url: string }
  | { kind: 'back' }

/** One currently open page in the shared browser. */
export interface BrowserTab {
  /** Process-local page identity, independent of tab ordering and URL. */
  id: BrowserTabId
  /** Page title, bounded by the preview text limit. */
  title: string
  /** Page address, bounded by the preview text limit. */
  url: string
  /** Whether the AI's latest recognized tool result identifies this page. */
  active: boolean
  /** Whether this page is currently shown in the preview. */
  selected: boolean
}

/** One admitted browser action; arguments and result text are deliberately excluded. */
export interface BrowserAction {
  /** Process-local stable execution identity. */
  id: BrowserActionId
  /** Initiator of this browser operation. */
  origin: 'ai' | 'operator'
  /** Upstream browser tool name or operator action name. */
  tool: string
  /** Dispatch start time. */
  startedAt: string
  /** Final registry outcome, or an action still executing. */
  status: 'running' | 'succeeded' | 'failed'
}

/** Bounded preview of the character-owned persistent browser. */
export interface BrowserPreviewFrame {
  /** Open pages, bounded by the provider's tab limit. */
  tabs: BrowserTab[]
  /** Number of open pages omitted from the bounded list. */
  omittedTabs: number
  /** Whether the preview follows the AI's page instead of an operator-selected page. */
  following: boolean
  /** URL of the latest successfully captured preview page, if any. */
  url?: string
  /** Latest page title. */
  title?: string
  /** JPEG viewport image, retained across a failed capture. */
  image?: string
  /** Identity of the page in the retained image, independent of current preview selection. */
  imageTabId?: BrowserTabId
  /** Timestamp of the retained successful image. */
  capturedAt?: string
  /** Capture failure; a retained image is stale when set. */
  error?: 'capture-failed' | 'image-too-large'
  /** Whether the browser has successfully executed a tool since startup. */
  started: boolean
  /** Most recent actions, newest first, bounded by configuration. */
  actions: BrowserAction[]
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Shared browser views and controls require the operator identity. */
    'browser-preview/forbidden': {}
    /** The requested page closed or belongs to an earlier browser lifetime. */
    'browser-preview/tab-missing': {}
    /** A page mutation failed after admission and is not automatically retried. */
    'browser-preview/action-failed': { action: 'reload' | 'close' | BrowserInput['kind'] }
    /** Operator input exceeds the accepted limits or uses an unsupported URL or key. */
    'browser-preview/invalid-input': {}
  }
}
