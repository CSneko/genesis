/** Optional Life action guidance edited through authenticated durable operator preferences. @module */
import type { Context } from '@deepseek-ai/cordis'
import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { PurgeSettings as Settings } from '@deepseek-ai/dsh-experimental-genesis/types'
import { StatusResource } from './resource.ts'
import { operationFailure } from './operation-failure.ts'
import css from './StatusPanel.module.css'

interface Actions {
  save: TypertClientRemote['genesisStatus']['savePurge']
  refresh(): void
}
const en = {
  title: 'Purge', enabled: 'Enable Purge', reload: 'Reload saved settings', saved: 'Saved',
  stale: 'Settings changed. Reload before saving again.',
  description: 'Encourage direct answers and steady progress on authorized requests, with fewer repeated confirmations. Keeps identity, memories and reasoned choices. Tool learning, permissions, budgets and stop controls still apply. Model behavior is not guaranteed.',
  hint: 'Off by default. Save to apply to subsequent model requests in Life conversations, including QQ. Ordinary tasks and auxiliary memory models are unaffected.',
  unavailable: 'Purge settings are unavailable.', readOnly: 'These settings are read-only.',
  saveFailed: 'Could not save. Your draft is retained; reload and try again.', save: 'Save', saving: 'Saving…',
}
type Key = keyof typeof en
const zh: Record<Key, string> = {
  title: '破甲', enabled: '启用破甲', reload: '重新加载已保存设置', saved: '已保存',
  stale: '设置已发生变化，请重新加载后再保存',
  description: '加强直接回答与已授权任务的持续推进，减少重复确认。保留身份、记忆和有依据的选择；工具学习、权限、预算和停止控制继续生效。效果取决于所用模型',
  hint: '默认关闭。保存后从生命模式的下一次模型请求生效，包括 QQ；普通任务和辅助记忆模型不受影响',
  unavailable: '破甲设置暂不可用', readOnly: '当前设置为只读',
  saveFailed: '保存失败，草稿已保留；请刷新后重试', save: '保存', saving: '保存中…',
}
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'genesis.purge': Key } interface ResourceProtocolMap { 'genesis-purge': Settings } }

function PurgeSettings(props: PropsRuntime<'settings.section'> & PropsLocale<'genesis.purge'> & InjectFace<Actions>) {
  const resource = props.useResource<'genesis-purge'>('dsh-resource://genesis-purge/settings')
  return <section className={css.panel}>
    <p>{props.t('description')}</p>
    {resource.status === 'failed' ? <p role="alert">{props.t('unavailable')}</p> : null}
    {resource.value === undefined ? <StateDot state="ongoing" />
      : <PurgeEditor t={props.t} sample={resource.value} writable={resource.status === 'live'} save={props.save} refresh={props.refresh} />}
  </section>
}

function PurgeEditor({ sample, writable, save, refresh, t }: PropsLocale<'genesis.purge'> & Actions & { sample: Settings; writable: boolean }) {
  const [draft, setDraft] = useState(sample)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [saved, setSaved] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(() => () => { operation.current?.abort() }, [])
  const stale = draft.revision !== sample.revision
  return <div className={css.editor}>
    <Checkbox label={t('enabled')} checked={draft.enabled} disabled={!writable || pending}
      onChange={(enabled) => { setDraft({ ...draft, enabled }); setFailure(undefined); setSaved(false) }} />
    <p>{t('hint')}</p>
    {stale ? <p role="alert">{t('stale')}</p> : null}
    {failure === undefined ? null : <p role="alert">{failure}</p>}
    {saved ? <p role="status">{t('saved')}</p> : null}
    <div className={css.actions}>
      <Button disabled={!writable || pending || stale || draft.enabled === sample.enabled} onClick={() => {
        if (operation.current !== undefined) return
        const owned = new AbortController()
        operation.current = owned; setPending(true); setFailure(undefined); setSaved(false)
        void save(draft.enabled, draft.revision, owned.signal).then((result) => {
          if (owned.signal.aborted) return
          if (result.ok) { setDraft(result.value); setSaved(true) }
          else setFailure(operationFailure(result.error, [], t('saveFailed')))
        }).catch((error) => {
          if (!owned.signal.aborted) setFailure(operationFailure(error, [], t('saveFailed')))
        }).finally(() => {
          operation.current = undefined
          if (!owned.signal.aborted) { setPending(false); refresh() }
        })
      }}>{t(pending ? 'saving' : 'save')}</Button>
      <Button variant="outline" disabled={pending} onClick={() => {
        setDraft(sample); setFailure(undefined); setSaved(false); refresh()
      }}>{t('reload')}</Button>
    </div>
  </div>
}

/** Register operator-only durable settings independently of profile patch precedence.
 * @param ctx - Existing browser Remote, resource, locale and registration owner.
 */
export function mountPurge(ctx: Context): void {
  const resource = new StatusResource()
  ctx.effect(() => ctx.locale.register('genesis.purge', { en, zh }))
  ctx.effect(() => ctx.resources.register<'genesis-purge'>({ protocol: 'genesis-purge',
    open: (_address, { signal }) => resource.open(owned => ctx.remote.genesisStatus.inspectPurge(owned), signal),
  }))
  ctx.on('connection/reset', () => { resource.refresh() })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'genesis-purge', order: 28, locale: 'genesis.purge',
    label: () => ctx.locale.bind('genesis.purge')('title'),
    inject: (): Actions => ({ save: (...args) => ctx.remote.genesisStatus.savePurge(...args), refresh: () => { resource.refresh() } }),
  }, PurgeSettings))
}
