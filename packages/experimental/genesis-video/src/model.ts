/** Versioned video artifacts and bounded model input; media paths refer only to imported project assets. @module */
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'

/** Safe opaque artifact names, validated again on every file read. */
export const idSchema = z.uuid()
/** One durable editing project, independent of Session and render identity. */
export type VideoProjectId = Branded<'GenesisVideoProjectId'>
/** One immutable source/timeline revision. */
export type VideoRevisionId = Branded<'GenesisVideoRevisionId'>
/** One non-replayed render admission. */
export type VideoJobId = Branded<'GenesisVideoJobId'>
/** Parse a project identifier at a JSON/file input. */
export const projectIdSchema = idSchema.transform(value => brandString<VideoProjectId>(value))
/** Parse a revision identifier at a JSON/file input. */
export const revisionIdSchema = idSchema.transform(value => brandString<VideoRevisionId>(value))
/** Parse a render identifier at a JSON/file input. */
export const jobIdSchema = idSchema.transform(value => brandString<VideoJobId>(value))
const asset = z.string().regex(/^[0-9a-f-]{36}\.(mp4|webm|mov|mp3|wav|m4a|ogg|png|jpg|jpeg|webp)$/)
const timed = { from: z.number().nonnegative(), duration: z.number().positive() }
/** Built-in layered timeline; seconds are rounded to the composition's frame rate. */
export const timelineSchema = z.strictObject({
  clips: z.array(z.strictObject({ ...timed, kind: z.enum(['video', 'image', 'color']), asset: asset.optional(),
    color: z.string().max(80).default('#15151d'), trim: z.number().nonnegative().default(0),
    volume: z.number().min(0).max(2).default(1), fit: z.enum(['cover', 'contain']).default('cover'),
    fade: z.number().nonnegative().default(0),
  }).refine(c => c.kind === 'color' || c.asset !== undefined, 'Video and image clips require an imported asset.')).max(200),
  texts: z.array(z.strictObject({ ...timed, text: z.string().max(4000), size: z.number().min(8).max(300).default(48),
    color: z.string().max(80).default('white'), position: z.enum(['top', 'center', 'bottom']).default('bottom'),
  })).max(300).default([]),
  audio: z.array(z.strictObject({ ...timed, asset, trim: z.number().nonnegative().default(0),
    volume: z.number().min(0).max(2).default(0.3),
  })).max(30).default([]),
})
/** Complete new revision; custom source exports a default React component and may import remotion/react. */
export const saveSchema = z.strictObject({ projectId: projectIdSchema.optional(), parentRevision: revisionIdSchema.optional(),
  title: z.string().trim().min(1).max(200), width: z.number().int().min(16).max(3840).multipleOf(2),
  height: z.number().int().min(16).max(3840).multipleOf(2), fps: z.number().int().min(1).max(60),
  duration: z.number().positive(), timeline: timelineSchema.optional(), source: z.string().min(1).optional(),
}).refine(v => (v.timeline === undefined) !== (v.source === undefined), 'Supply exactly one of timeline or source.')
  .refine(v => (v.projectId === undefined) === (v.parentRevision === undefined), 'Revisions require both projectId and parentRevision.')
/** Immutable artifact receipt; no saved field grants execution authority. */
export const revisionSchema = z.strictObject({ version: z.literal(1), projectId: projectIdSchema, revisionId: revisionIdSchema,
  createdAt: z.iso.datetime(), sessionId: z.string().transform(SessionId), callId: z.string().transform(ToolCallId), request: saveSchema,
})
/** Persisted render admission; output always remains in its own job directory. */
export const jobSchema = z.strictObject({ version: z.literal(1), projectId: projectIdSchema, revisionId: revisionIdSchema,
  jobId: jobIdSchema, sessionId: z.string().transform(SessionId), callId: z.string().transform(ToolCallId), createdAt: z.iso.datetime(),
  mode: z.enum(['preview', 'final', 'still', 'player']), frame: z.number().int().nonnegative(),
})
/** Durable terminal process facts; absence after reload means interrupted, never successful. */
export const resultSchema = z.strictObject({ version: z.literal(1), state: z.enum(['completed', 'failed', 'cancelled', 'timed-out']),
  exitCode: z.number().int().nullable(), signal: z.string().nullable(), finishedAt: z.iso.datetime(),
  bytes: z.number().int().nonnegative(), sha256: z.string().nullable(), diagnostics: z.string(), message: z.string().max(2000),
})
/** Parsed immutable video revision. */
export type VideoRevision = z.infer<typeof revisionSchema>
/** Parsed render admission. */
export type VideoJob = z.infer<typeof jobSchema>
