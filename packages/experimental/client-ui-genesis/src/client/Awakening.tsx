/** Credential-first naming step; the shared Host life remains the source of initialization state. @module */
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { LifeStatus } from '@deepseek-ai/dsh-experimental-genesis/types'
import type { StatusActions } from './StatusPanel.tsx'
import css from './StatusPanel.module.css'

type NamingProps = PropsLocale<'genesis'> & InjectFace<StatusActions> & { done?: () => void }

/**
 * Save a name only after Host route and embedding checks succeed; failures retain the user's input for retry.
 * @param props - Localized text, cancellable initialization action and optional completion.
 * @returns The naming form, with a bounded name and explicit pending/error feedback.
 */
export function NamingForm({ t, initialize, done }: NamingProps) {
  const id = useId()
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const controller = useRef<AbortController>()
  useEffect(() => () => { controller.current?.abort() }, [])
  const submit = async () => {
    if (controller.current !== undefined) return
    const operation = new AbortController()
    controller.current = operation
    setPending(true)
    setFailed(false)
    try {
      const saved = await initialize(name.trim(), operation.signal)
      // Naming admission owns the first conversation even if its readiness update replaces this form.
      if (saved) done?.()
      else if (!operation.signal.aborted) setFailed(true)
    } catch {
      // Transport failures use the same recoverable message as rejected initialization; no provider secrets reach the UI.
      if (!operation.signal.aborted) setFailed(true)
    } finally {
      controller.current = undefined
      if (!operation.signal.aborted) setPending(false)
    }
  }
  return <form className={css.naming} onSubmit={(event) => { event.preventDefault(); void submit() }}>
    <p>{t('namingDescription')}</p>
    <label htmlFor={id}>{t('name')}</label>
    <Input id={id} value={name} onChange={(event) => { setName(event.target.value) }}
      maxLength={200} required disabled={pending} data-modal-autofocus />
    {failed ? <p role="alert">{t('initializeFailed')}</p> : null}
    <Button type="submit" disabled={pending || !name.trim()}>{t(pending ? 'initializing' : 'startConversation')}</Button>
  </form>
}

/**
 * Recover a named life whose first conversation has not yet started.
 * @param props - Cancellable conversation action and completion callback.
 * @returns Retryable start action; an error never asks the user to rename the life.
 */
export function FirstConversation({ t, startConversation, done }: PropsLocale<'genesis'> & Pick<StatusActions, 'startConversation'> & { done?: (() => void) | undefined }) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const controller = useRef<AbortController>()
  useEffect(() => () => { controller.current?.abort() }, [])
  return <div className={css.naming}>
    <p>{t('firstConversationDescription')}</p>
    <Button disabled={pending} onClick={() => {
      if (controller.current !== undefined) return
      const owned = new AbortController()
      controller.current = owned; setPending(true); setFailed(false)
      void startConversation(owned.signal).then((ok) => {
        if (!owned.signal.aborted) { if (ok) done?.(); else setFailed(true) }
      }).catch(() => { if (!owned.signal.aborted) setFailed(true) }).finally(() => {
        controller.current = undefined; if (!owned.signal.aborted) setPending(false)
      })
    }}>{t('enterFirstConversation')}</Button>
    {failed ? <p role="alert">{t('conversationFailed')}</p> : null}
  </div>
}

/** Shared automatic-reminder preference; manual life initialization remains available. */
export interface AwakeningActions extends StatusActions {
  dismissSetup(this: void): Promise<boolean>
  hooks: { onboardingPreference: ConfigForm<Record<string, unknown>> }
}
type AwakeningProps = PropsRuntime<'settings.onboarding'> & PropsLocale<'genesis'> & InjectFace<AwakeningActions>

function ConfigurationReminder(props: AwakeningProps) {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const root = document.getElementById('root')
    if (root === null) return
    const previous = root.inert
    root.inert = true
    return () => { root.inert = previous }
  }, [])
  return <Modal open title={props.t('awakeningTitle')} onClose={props.complete} headless className={css.dialog as string}>
    <h2>{props.t('awakeningTitle')}</h2>
    <p>{props.t('configureFirst')}</p>
    <div className={css.editor}>
      <h3>{props.t('writerTitle')}</h3><p>{props.t('inheritDshLlm')}</p>
      <Button variant="outline" onClick={() => { props.openSection('models'); props.complete() }}>{props.t('configureApis')}</Button>
    </div>
    <div className={css.editor}>
      <h3>{props.t('decisionTitle')}</h3>
      <Button variant="outline" onClick={() => { props.openSection('genesis-knowledge'); props.complete() }}>{props.t('cloudDecision')}</Button>
      <Button variant="outline" onClick={() => { props.openSection('genesis-knowledge'); props.complete() }}>{props.t('deployLocalDecision')}</Button>
    </div>
    <div className={css.editor}>
      <h3>{props.t('embeddingTitle')}</h3><p>{props.t('embeddingDescription')}</p>
      <Button variant="outline" onClick={() => { props.openSection('genesis-knowledge'); props.complete() }}>{props.t('configureEmbedding')}</Button>
    </div>
    <Button variant="outline" disabled={pending} onClick={() => {
      setPending(true); setFailed(false)
      void props.dismissSetup().then((saved) => { if (saved) props.complete(); else setFailed(true) })
        .catch(() => { setFailed(true) }).finally(() => { setPending(false) })
    }}>{props.t('dontShowAgain')}</Button>
    {failed ? <p role="alert">{props.t('dismissFailed')}</p> : null}
  </Modal>
}

/**
 * Show only the automatic configuration reminder; naming and conversation start require a deliberate button action.
 * @param props - Host readiness, durable shared reminder preference and settings navigation.
 * @returns A reminder unless dismissed; initialized and ready-to-name lives never open an automatic naming dialog.
 */
export function Awakening(props: AwakeningProps) {
  const resource = props.useResource<'genesis'>('dsh-resource://genesis/status')
  const preference = props.useOnboardingPreference(value => value)
  const phase = resource.value?.setup?.phase
  const dismissed = preference.value?.credentialOnboardingDismissed === true
  const skip = dismissed || (resource.status === 'live' && phase !== 'credentials')
  useEffect(() => { if (skip) props.complete() }, [skip, props.complete])
  if (skip || phase !== 'credentials' || preference.status === 'loading') return null
  return <ConfigurationReminder {...props} />
}

type SetupButtonProps = PropsLocale<'genesis'> & StatusActions & {
  setup: LifeStatus['setup']
  done?: (() => void) | undefined
}

/**
 * Open the one-time naming and first-conversation flow only on an explicit user action.
 * @param props - Sampled initialization phase and the existing life actions.
 * @returns A button until the first text reply completes; completing initialization removes it durably.
 */
export function LifeSetupButton(props: SetupButtonProps) {
  const [open, setOpen] = useState(false)
  if (props.setup === undefined || props.setup.phase === 'ready') return null
  const done = () => { setOpen(false); props.done?.() }
  return <>
    <Button onClick={() => { setOpen(true) }}>{props.t(props.setup.phase === 'conversation' ? 'enterFirstConversation' : 'initializeLife')}</Button>
    <Modal open={open} onClose={() => { setOpen(false) }} title={props.t('lifeSetupTitle')} closeLabel={props.t('close')} className={css.dialog as string}>
      {props.setup.phase === 'credentials' ? <p>{props.t('configureFirst')}</p>
        : props.setup.phase === 'naming' ? <NamingForm {...props} done={done} />
          : <FirstConversation t={props.t} startConversation={props.startConversation} done={done} />}
    </Modal>
  </>
}

/**
 * Keep manual initialization discoverable on the new-conversation screen after configuration reminders are dismissed.
 * @param props - Shared readiness resource and initialization actions.
 * @returns The pending life-setup button, absent after the first conversation completes.
 */
export function LifeSetupHero(props: PropsRuntime<'conversation.hero.options'> & PropsLocale<'genesis'> & InjectFace<StatusActions>) {
  const resource = props.useResource<'genesis'>('dsh-resource://genesis/status')
  return <LifeSetupButton t={props.t} setup={resource.value?.setup} initialize={props.initialize}
    startConversation={props.startConversation} refresh={props.refresh} />
}
