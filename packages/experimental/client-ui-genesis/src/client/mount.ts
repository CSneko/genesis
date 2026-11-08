import { ContactsPanel, type ContactActions } from './ContactsPanel.tsx'
import mailContribution from '@deepseek-ai/dsh-experimental-genesis-mail/remote'
import { mountMail } from './mail-mount.ts'
import companionContribution from '@deepseek-ai/dsh-experimental-genesis-companion/remote'
import { mountCompanion } from './companion-mount.ts'
import { mountSpeech } from './speech-mount.tsx'
import { mountPurge } from './purge-mount.tsx'
import { mountBrowser } from './browser-mount.tsx'
import { mountRhythm } from './rhythm-mount.ts'
/** Optional generated Remote, workspace and settings registration with shared resources. @module */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-experimental-genesis/remote'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import type { ToolkitStatus, LifeStatus, AgencyStatus, PersonalityStatus, InitiativeStatus, PeopleCatalog, PersonDetail, ContactCatalog } from '@deepseek-ai/dsh-experimental-genesis/types'
import type { TypertRemoteContribution, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { MemoryNotice, type MemoryNoticeActions, type MemoryNoticeState } from './MemoryNotice.tsx'
import { operationFailure } from './operation-failure.ts'
import { StatusResource } from './resource.ts'
import { type RelationshipActions } from './RelationshipPanel.tsx'
import { PeoplePanel, type PeopleActions } from './PeoplePanel.tsx'
import qqContribution from '@deepseek-ai/dsh-experimental-genesis-qq/remote'
import { mountRemotionPreview } from './video/index.ts'
import { mountTemporary } from './temporary-mount.ts'
import { mountQq } from './qq-mount.ts'
import { EmotionPanel, type EmotionActions } from './EmotionPanel.tsx'
import { AgencyPanel, type AgencyActions } from './AgencyPanel.tsx'
import { InitiativePanel, type InitiativeActions } from './InitiativePanel.tsx'
import { StatusPanel } from './StatusPanel.tsx'
import { Awakening, LifeSetupHero } from './Awakening.tsx'
import { PersonalityPanel } from './PersonalityPanel.tsx'
import { MemoryPanel, type MemoryActions } from './MemoryPanel.tsx'
import { ManualMemory, type ManualMemoryActions } from './ManualMemory.tsx'
import { ReviewNotice } from './ReviewNotice.tsx'
import { KnowledgePanel, type KnowledgeActions } from './KnowledgePanel.tsx'
import { en, zh, type GenesisKey } from './locales.ts'
import { ToolkitsPanel, type ToolkitActions } from './ToolkitsPanel.tsx'
import minecraftContribution from '@deepseek-ai/dsh-experimental-genesis-minecraft/remote'
import { mountMinecraft } from './minecraft-mount.ts'
import { mountRecords } from './records-resources.ts'
import { mountNavigation } from './navigation.ts'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { TasksPanel, type TaskActions } from './TasksPanel.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { genesis: GenesisKey }
  interface ResourceProtocolMap { genesis: LifeStatus; 'genesis-agency': AgencyStatus; 'genesis-personality': PersonalityStatus; 'genesis-initiative': InitiativeStatus; 'genesis-toolkits': ToolkitStatus; 'genesis-people': PeopleCatalog; 'genesis-person': PersonDetail; 'genesis-contacts': ContactCatalog }
}

/** Required infrastructure, with no stable product import of the experimental namespace. */
export const inject = ['remote', 'slots', 'locale', 'resources', 'remote.credentials', 'sessions', 'uiWorkspace', 'configForms', 'layout']

/**
 * Mount Genesis status, credential-first naming and their shared resource.
 * @param ctx - Browser lifetime owner.
 * @param contribution - Generated Remote definitions from the owning Host package.
 * @returns Disposer awaiting UI withdrawal before Remote removal.
 */
export async function mountStatus(ctx: Context, contribution: TypertRemoteContribution): Promise<() => Promise<void>> {
  const unmount = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.genesisContacts', 'remote.session', 'remote.genesisPeople', 'remote.genesisToolkits', 'remote.genesisStatus', 'remote.genesisAgency', 'remote.genesisInitiativeStatus', 'remote.genesisMemory', 'remote.genesisRecords', 'slots', 'locale', 'resources', 'remote.credentials', 'sessions', 'uiWorkspace', 'configForms', 'layout'], (scope) => {
    scope.effect(() => scope.locale.register('genesis', { en, zh }))
    scope.inject(['documentPreviews'], mountRemotionPreview)
    mountNavigation(scope)
    mountTemporary(scope)
    mountSpeech(scope)
    mountBrowser(scope)
    mountPurge(scope)
    scope.slots.inject('genesis.page', () => scope.slots.register({
      name: 'genesis.page', key: 'outbox', locale: 'genesis', inject: (): InitiativeActions => ({
        view: 'activity', refresh: () => { resource.refresh() },
        saveSettings: (...args) => scope.remote.genesisInitiativeStatus.saveSettings(...args),
      }),
    }, InitiativePanel))
    const resource = new StatusResource()
    scope.inject(['remote.genesisTasks'], (taskScope) => {
      taskScope.effect(() => taskScope.resources.register<'genesis-tasks'>({ protocol: 'genesis-tasks',
        open: (address, { signal }) => resource.open(owned => taskScope.remote.genesisTasks.catalog(
          Number(new URL(address).searchParams.get('offset') ?? 0), owned), signal),
      }))
    })
    scope.slots.inject('genesis.page', () => scope.slots.register({
      name: 'genesis.page', key: 'tasks', locale: 'genesis', inject: (): TaskActions => ({
        refresh: () => { resource.refresh() }, openSession: (id) => { scope.uiWorkspace.openSession(id) },
      }),
    }, TasksPanel))
    scope.effect(() => scope.resources.register<'genesis-contacts'>({ protocol: 'genesis-contacts',
      open: (address, { signal }) => resource.open((owned) => {
        const params = new URL(address).searchParams
        return scope.remote.genesisContacts.inspect(params.get('query') ?? '', Number(params.get('offset') ?? 0), owned)
      }, signal),
    }))
    scope.effect(() => scope.resources.register<'genesis-people'>({ protocol: 'genesis-people',
      open: (address, { signal }) => resource.open(owned => scope.remote.genesisPeople.inspect(Number(new URL(address).searchParams.get('offset') ?? 0), owned), signal),
    }))
    scope.effect(() => scope.resources.register<'genesis-person'>({ protocol: 'genesis-person',
      open: (address, { signal }) => {
        const params = new URL(address).searchParams
        return resource.open(owned => scope.remote.genesisPeople.detail(params.get('id') as PersonDetail['person']['id'], Number(params.get('offset') ?? 0), owned), signal)
      },
    }))
    scope.effect(() => scope.resources.register<'genesis'>({ protocol: 'genesis',
      open: (_address, { signal }) => resource.open(callerSignal => scope.remote.genesisStatus.inspect(callerSignal), signal),
    }))
    scope.effect(() => scope.resources.register<'genesis-agency'>({ protocol: 'genesis-agency',
      open: (_address, { signal }) => resource.open(callerSignal => scope.remote.genesisAgency.inspect(callerSignal), signal),
    }))
    scope.effect(() => scope.resources.register<'genesis-personality'>({ protocol: 'genesis-personality',
      open: (_address, { signal }) => resource.open(callerSignal => scope.remote.genesisStatus.personality(callerSignal), signal),
    }))
    scope.effect(() => scope.resources.register<'genesis-initiative'>({ protocol: 'genesis-initiative',
      open: (_address, { signal }) => resource.open(callerSignal => scope.remote.genesisInitiativeStatus.inspect(callerSignal), signal),
    }))
    scope.effect(() => scope.resources.register<'genesis-toolkits'>({ protocol: 'genesis-toolkits',
      open: (_address, { signal }) => resource.open(callerSignal => scope.remote.genesisToolkits.inspect(callerSignal), signal),
    }))
    scope.on('connection/reset', () => { resource.refresh() })
    scope.slots.inject('settings.section', () => scope.slots.register({
      name: 'settings.section', id: 'genesis-initiative', order: 21, locale: 'genesis',
      label: () => scope.locale.bind('genesis')('initiativePolicyTitle'), inject: (): InitiativeActions => ({
        view: 'settings',
        refresh: () => { resource.refresh() },
        saveSettings: async (...args) => {
          try { return await scope.remote.genesisInitiativeStatus.saveSettings(...args) } finally { resource.refresh() }
        },
      }),
    }, InitiativePanel))
    scope.effect(() => {
      const refresh = () => { resource.refresh() }
      const dispose = [
        scope.remote.$on('settings/document-updated', refresh),
        scope.remote.$on('credentials/record-updated', refresh),
        scope.remote.$on('credentials/reference-updated', refresh),
        scope.remote.$on('llm/adapters-updated', refresh),
        scope.remote.$on('api-session/status', refresh),
      ]
      return () => { for (const remove of dispose) remove() }
    })
    const onboardingPreference = scope.configForms.get<Record<string, unknown>>('ui-settings-general')
    const startupLifetime = new AbortController()
    scope.effect(() => () => { startupLifetime.abort() })
    const startConversation = async (signal: AbortSignal) => {
      const status = await scope.remote.genesisStatus.inspect(signal)
      if (!status.ok || signal.aborted) return false
      const existing = status.value.setup?.firstSessionId
      if (existing !== undefined) { scope.uiWorkspace.openSession(existing); return true }
      const created = await scope.remote.session.create({ agentPreset: 'life' })
      if (!created.ok) return false
      const sessionId = created.value.sessionId
      signal.throwIfAborted()
      const result = await scope.remote.genesisStatus.greet(sessionId, scope.locale.getSnapshot().active.startsWith('zh') ? 'zh' : 'en', signal)
      resource.refresh()
      signal.throwIfAborted()
      if (!result.ok) return false
      scope.uiWorkspace.openSession(result.value)
      return true
    }
    const actions = () => ({ refresh: () => { resource.refresh() }, startConversation,
      initialize: async (name: string, signal: AbortSignal) => {
        const result = await scope.remote.genesisStatus.initialize(name, signal)
        if (!result.ok) { resource.refresh(); return false }
        try { return await startConversation(startupLifetime.signal) } finally { resource.refresh() }
      },
    })
    const knowledge = (): KnowledgeActions => ({
      ...actions(),
      saveModels: async (settings, revision, signal) => {
        const result = await scope.remote.genesisStatus.saveModels(settings, revision, signal)
        resource.refresh()
        return result
      },
      deployLocalDecision: (revision, signal) => scope.remote.genesisStatus.deployLocalDecision(revision, signal),
      stopLocalDecision: (revision, remove, signal) => scope.remote.genesisStatus.stopLocalDecision(revision, remove, signal),
      testModel: (role, signal) => scope.remote.genesisStatus.testModel(role, signal),
      refresh: () => { resource.refresh() },
      save: async (embedding, revision, signal) => {
        const result = await scope.remote.genesisStatus.saveEmbedding(embedding, revision, signal)
        resource.refresh()
        return result
      },
      credential: async (ref, value) => {
        const result = value === undefined ? await scope.remote.credentials.unset(ref) : await scope.remote.credentials.set(ref, value)
        resource.refresh()
        return result.ok ? { ok: true, value: undefined } : result
      },
      test: signal => scope.remote.genesisStatus.testEmbedding(signal),
    })
    const notice = createSnapshotStore<MemoryNoticeState>({ sequence: 0, outcome: null })
    mountRecords(scope, notice)
    mountRhythm(scope, notice)
    scope.effect(() => mountMail(scope, mailContribution, notice))
    scope.effect(() => mountCompanion(scope, companionContribution, notice))
    scope.effect(() => mountQq(scope, qqContribution, notice))
    scope.effect(() => mountMinecraft(scope, minecraftContribution, notice))
    scope.slots.inject('settings.section', () => scope.slots.register({
      name: 'settings.section', id: 'genesis-toolkits', order: 22, locale: 'genesis',
      label: () => scope.locale.bind('genesis')('toolkitsTitle'), inject: (): ToolkitActions => ({
        refresh: () => { resource.refresh() },
        save: async (entries, revision, signal) => {
          const failure = (error: unknown) => ({ ok: false as const, kind: 'toolkits' as const,
            reason: operationFailure(error, [], scope.locale.bind('genesis')('unknownError')) })
          try {
            const result = await scope.remote.genesisToolkits.save(entries, revision, signal)
            if (!signal?.aborted) notice.update((state) => {
              state.sequence++; state.outcome = result.ok ? { ok: true, kind: 'toolkits' } : failure(result.error)
            })
            return result
          } catch (error) {
            if (!signal?.aborted) notice.update((state) => { state.sequence++; state.outcome = failure(error) })
            throw error
          } finally { resource.refresh() }
        },
      }),
    }, ToolkitsPanel))
    scope.slots.inject('shell.overlay', () => scope.slots.register({
      name: 'shell.overlay', id: 'genesis-memory-notice', order: 16, locale: 'genesis',
      inject: (): MemoryNoticeActions => ({ hooks: { notice }, dismiss: (sequence) => {
        notice.update((state) => { if (state.sequence === sequence) state.outcome = null })
      } }),
    }, MemoryNotice))
    const agencyMutation = async (run: () => Promise<RemoteResult<void>>, signal: AbortSignal | undefined, started: boolean) => {
      try {
        const result = await run()
        if (!signal?.aborted) notice.update((state) => {
          state.sequence++; state.outcome = result.ok ? { ok: true, kind: started ? 'agency-started' : 'agency' }
            : { ok: false, kind: 'agency', reason: operationFailure(result.error, [], scope.locale.bind('genesis')('unknownError')) }
        })
        return result
      } catch (error) {
        if (!signal?.aborted) notice.update((state) => {
          state.sequence++; state.outcome = { ok: false, kind: 'agency',
            reason: operationFailure(error, [], scope.locale.bind('genesis')('unknownError')) }
        })
        throw error
      } finally { resource.refresh() }
    }
    scope.slots.inject('genesis.page', () => scope.slots.register({
      name: 'genesis.page', key: 'agency', locale: 'genesis', inject: (): AgencyActions => ({
        refresh: () => { resource.refresh() },
        setGoalStatus: (...args) => agencyMutation(() => scope.remote.genesisAgency.setGoalStatus(...args), args[4], false),
        deliberate: (...args) => agencyMutation(() => scope.remote.genesisAgency.deliberate(...args), args[1], true),
      }),
    }, AgencyPanel))
    const summaryMutation = async <T>(run: () => Promise<RemoteResult<T>>, signal: AbortSignal | undefined): Promise<RemoteResult<T>> => {
      try {
        const result = await run()
        if (!signal?.aborted) notice.update((state) => {
          state.sequence++
          state.outcome = result.ok ? { ok: true, kind: 'memory-summary' }
            : { ok: false, kind: 'memory-summary', reason: operationFailure(result.error, [], scope.locale.bind('genesis')('unknownError')) }
        })
        return result
      } catch (error) {
        if (!signal?.aborted) notice.update((state) => {
          state.sequence++
          state.outcome = { ok: false, kind: 'memory-summary', reason: operationFailure(error, [], scope.locale.bind('genesis')('unknownError')) }
        })
        throw error
      } finally { resource.refresh() }
    }
    const memories = (): MemoryActions => ({
      saveSummary: (...args) => summaryMutation(() => scope.remote.genesisMemory.saveSummary(...args), args[3]),
      summarize: (...args) => summaryMutation(() => scope.remote.genesisMemory.summarize(...args), args[2]),
      saveOperator: async (profile, revision, signal) => {
        try {
          const result = await scope.remote.genesisMemory.saveOperator(profile, revision, signal)
          if (!signal?.aborted) notice.update((state) => {
            state.sequence++; state.outcome = result.ok ? { ok: true, kind: 'operator-identity' } : {
              ok: false, kind: 'operator-identity', reason: operationFailure(result.error, [], scope.locale.bind('genesis')('unknownError')),
            }
          })
          return result
        } catch (error) {
          if (!signal?.aborted) notice.update((state) => {
            state.sequence++; state.outcome = { ok: false, kind: 'operator-identity', reason: operationFailure(error, [], scope.locale.bind('genesis')('unknownError')) }
          })
          throw error
        } finally { resource.refresh() }
      },
      organize: async (request, signal) => {
        try {
          const result = await scope.remote.genesisMemory.organize(request, signal)
          if (!signal?.aborted) notice.update((state) => {
            state.sequence++; state.outcome = result.ok ? { ok: true, kind: 'organization' } : {
              ok: false, kind: 'organization', reason: operationFailure(result.error, [], scope.locale.bind('genesis')('unknownError')),
            }
          })
          return result
        } catch (error) {
          if (!signal?.aborted) notice.update((state) => {
            state.sequence++; state.outcome = { ok: false, kind: 'organization', reason: operationFailure(error, [], scope.locale.bind('genesis')('unknownError')) }
          })
          throw error
        } finally { resource.refresh() }
      },
      setConsolidation: async (...args) => {
        const result = await scope.remote.genesisMemory.setConsolidation(...args); resource.refresh(); return result
      },
      consolidate: async (...args) => {
        const result = await scope.remote.genesisMemory.consolidate(...args); resource.refresh(); return result
      },
      refresh: () => { resource.refresh() },
      save: async (...args) => { const result = await scope.remote.genesisMemory.save(...args); resource.refresh(); return result },
      remove: async (...args) => {
        const result = await scope.remote.genesisMemory.deleteMemory(...args)
        if (!args[2]?.aborted) notice.update((state) => {
          state.sequence++
          state.outcome = result.ok ? { ok: true } : { ok: false,
            reason: operationFailure(result.error, [], scope.locale.bind('genesis')('unknownError')) }
        })
        resource.refresh()
        return result
      },
      convert: async (...args) => { const result = await scope.remote.genesisMemory.convert(...args); resource.refresh(); return result },
      browse: (query, kind, offset, signal) => scope.remote.genesisStatus.memories(query, kind, offset, signal),
    })
    scope.slots.inject('genesis.page', () => scope.slots.register({
      name: 'genesis.page', key: 'overview', locale: 'genesis', inject: actions,
    }, StatusPanel))
    scope.slots.inject('settings.section', () => scope.slots.register({
      name: 'settings.section', id: 'genesis-knowledge', order: 16, locale: 'genesis',
      label: () => scope.locale.bind('genesis')('knowledgeTitle'), inject: knowledge,
    }, KnowledgePanel))
    scope.slots.inject('genesis.page', () => scope.slots.register({
      name: 'genesis.page', key: 'memories', locale: 'genesis', inject: memories,
    }, MemoryPanel))
    scope.slots.inject('genesis.page', () => scope.slots.register({
      name: 'genesis.page', key: 'personality', locale: 'genesis', inject: memories,
    }, PersonalityPanel))
    const emotionMutation = async (work: Promise<RemoteResult<number>>, kind: 'emotion-settings' | 'emotion-adjustment' | 'relationship-adjustment', signal: AbortSignal | undefined) => {
      const failure = (error: unknown) => ({ ok: false as const, kind: 'emotion' as const,
        reason: operationFailure(error, [], scope.locale.bind('genesis')('unknownError')) })
      try {
        const result = await work
        if (!signal?.aborted) notice.update((state) => {
          state.sequence++; state.outcome = result.ok ? { ok: true, kind } : failure(result.error)
        })
        return result
      } catch (error) {
        if (!signal?.aborted) notice.update((state) => { state.sequence++; state.outcome = failure(error) })
        throw error
      } finally { resource.refresh() }
    }
    scope.slots.inject('genesis.page', () => scope.slots.register({
      name: 'genesis.page', key: 'emotion', locale: 'genesis', inject: (): EmotionActions => ({
        refresh: () => { resource.refresh() },
        saveSettings: (...args) => emotionMutation(scope.remote.genesisStatus.saveEmotionSettings(...args), 'emotion-settings', args[2]),
        adjust: (...args) => emotionMutation(scope.remote.genesisStatus.adjustEmotion(...args), 'emotion-adjustment', args[2]),
      }),
    }, EmotionPanel))
    const contactMutation = async (work: () => Promise<RemoteResult<void>>): Promise<RemoteResult<void>> => {
      const report = (ok: boolean) => notice.update((state) => {
        state.sequence++; state.outcome = ok ? { ok: true, kind: 'contacts' }
          : { ok: false, kind: 'contacts', reason: scope.locale.bind('genesis')('contactsFailureHint') }
      })
      try { const result = await work(); report(result.ok); return result }
      catch (error) { report(false); throw error }
      finally { resource.refresh() }
    }
    scope.slots.inject('genesis.page', () => scope.slots.register({
      name: 'genesis.page', key: 'contacts', locale: 'genesis', inject: (): ContactActions => ({
        save: (...args) => contactMutation(() => scope.remote.genesisContacts.save(...args)),
        erase: (...args) => contactMutation(() => scope.remote.genesisContacts.erase(...args)),
        refresh: () => { resource.refresh() },
      }),
    }, ContactsPanel))
    scope.slots.inject('genesis.page', () => scope.slots.register({
      name: 'genesis.page', key: 'relationship', locale: 'genesis', inject: (): RelationshipActions & PeopleActions => ({
        openSession: (id) => { scope.uiWorkspace.openSession(id) },
        forget: async (...args) => {
          const report = (ok: boolean) => notice.update((state) => {
            if (args[2]?.aborted) return
            state.sequence++; state.outcome = ok ? { ok: true, kind: 'person' }
              : { ok: false, kind: 'person', reason: scope.locale.bind('genesis')('peopleOperationHint') }
          })
          try { const result = await scope.remote.genesisPeople.forget(...args); report(result.ok); return result }
          catch (error) { report(false); throw error }
          finally { resource.refresh() }
        },
        refresh: () => { resource.refresh() },
        adjust: (...args) => emotionMutation(scope.remote.genesisStatus.adjustRelationship(...args), 'relationship-adjustment', args[2]),
      }),
    }, PeoplePanel))
    scope.slots.inject('conversation.chat.assistant-actions', () => scope.slots.register({
      name: 'conversation.chat.assistant-actions', id: 'genesis-manual-memory', order: 15, locale: 'genesis',
      inject: (sessionId): ManualMemoryActions => ({
        overview: async (id, signal) => {
          const result = await scope.remote.genesisMemory.overview(sessionId, id, signal)
          resource.refresh()
          return result
        },
        generate: async (messageId, kind, signal) => {
          const result = await scope.remote.genesisMemory.generate(sessionId, messageId, kind, signal)
          resource.refresh()
          return result
        },
      }),
    }, ManualMemory))
    scope.slots.inject('conversation.input.dock', () => scope.slots.register({
      name: 'conversation.input.dock', id: 'genesis-memory-review', order: 30, locale: 'genesis', inject: () => ({
        retry: async (sessionId, signal) => {
          const result = await scope.remote.genesisStatus.retryMemory(sessionId, signal)
          resource.refresh()
          return result
        },
      }),
    }, ReviewNotice))
    scope.slots.inject('conversation.hero.options', () => scope.slots.register({
      name: 'conversation.hero.options', id: 'genesis-initialize', order: 10, locale: 'genesis', inject: actions,
    }, LifeSetupHero))
    scope.slots.inject('settings.onboarding', () => scope.slots.register({
      name: 'settings.onboarding', id: 'genesis-awakening', order: 20, locale: 'genesis', inject: () => ({ ...actions(),
        hooks: { onboardingPreference },
        dismissSetup: async () => {
          await onboardingPreference.set('credentialOnboardingDismissed', true)
          return onboardingPreference.getSnapshot().value?.credentialOnboardingDismissed === true
        },
      }),
    }, Awakening))
  })
  try { await ui } catch (error) { await ui.dispose(); await unmount(); throw error }
  return async () => { await ui.dispose(); await unmount() }
}
