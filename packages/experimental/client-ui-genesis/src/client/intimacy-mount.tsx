/** Optional adult intimacy configuration on the Genesis plugin page. @module */
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { Context } from '@deepseek-ai/cordis'
import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type { IntimacyStatus as Settings, IntimacySettings } from '@deepseek-ai/dsh-experimental-genesis/types'
import { StatusResource } from './resource.ts'
import { operationFailure } from './operation-failure.ts'
import css from './StatusPanel.module.css'
import intimacyCss from './IntimacySettings.module.css'

interface Actions {
  save: TypertClientRemote['genesisStatus']['saveIntimacy']
  refresh(): void
}
const en = {
  identityTitle: 'Identity and boundaries',
  dynamicsTitle: 'Desire settings',
  title: 'Sexuality and intimacy',
  enabled: 'Enable sexuality and intimacy',
  reload: 'Reload saved settings',
  saved: 'Saved',
  stale: 'State changed. Reload before saving again.',
  description:
    'Optional simulated adult character sexuality. Desire normally returns to a moderate baseline; emotions and desire are appraised together. Attraction, affection and willingness are separate.',
  hint: 'Off by default. Private operator conversations only. Disabling freezes desire and stops appraisal and context injection. Model inferences are uncertain; desire never grants consent or permissions. Historical audit records remain after clearing current state.',
  unavailable: 'Enable Genesis emotion and memory in this profile to use intimacy.',
  saveFailed: 'Could not save. Your draft is retained; reload and try again.',
  save: 'Save',
  saving: 'Saving…',
  influenceExpression: 'Influence attention, expression and willingness',
  genderIdentity: 'Character gender identity',
  sexualOrientation: 'Initial sexual orientation',
  romanticOrientation: 'Initial romantic orientation',
  boundaries: 'Character boundaries',
  baseline: 'Baseline desire (0–1; 0.5 is moderate)',
  halfLifeMs: 'Recovery half-life (milliseconds)',
  maxDelta: 'Maximum desire change per exchange (0–1)',
  desire: 'Current desire',
  attraction: 'Inferred attraction toward the operator',
  selfUnderstanding: 'Uncertain character self-interpretation',
  clear: 'Clear current intimacy state',
}
type Key = keyof typeof en
const zh: Record<Key, string> = {
  identityTitle: '身份与界限',
  dynamicsTitle: '性欲设置',
  title: '性与亲密',
  enabled: '启用性与亲密',
  reload: '重新加载已保存状态',
  saved: '已保存',
  stale: '状态已发生变化，请重新加载后再保存',
  description: '可选的成年角色性与亲密模拟。性欲通常回到中等基准，与情绪一起评价；吸引、感情和当下意愿分别判断',
  hint: '默认关闭，仅用于私有操作者对话。停用后冻结性欲，停止评价与上下文注入。模型解释带有不确定性，欲望不代表同意或权限；清除当前状态仍保留历史审计记录',
  unavailable: '请在当前配置中启用 Genesis 情绪与记忆后再使用',
  saveFailed: '保存失败，草稿已保留；请重新加载后重试',
  save: '保存',
  saving: '保存中…',
  influenceExpression: '影响注意、表达和意愿',
  genderIdentity: '角色性别认同',
  sexualOrientation: '初始性取向',
  romanticOrientation: '初始浪漫取向',
  boundaries: '角色界限',
  baseline: '性欲基准（0～1；0.5 为中等）',
  halfLifeMs: '恢复半衰期（毫秒）',
  maxDelta: '每次交流的性欲变化上限（0～1）',
  desire: '当前性欲',
  attraction: '对操作者的推测性吸引',
  selfUnderstanding: '角色自我理解（不确定的解释）',
  clear: '清除当前亲密状态',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'genesis.intimacy': Key
  }
  interface ResourceProtocolMap {
    'genesis-intimacy': Settings
  }
}

function IntimacyPluginSettings(props: PropsRuntime<'genesis.plugin.settings'> & PropsLocale<'genesis.intimacy'> & InjectFace<Actions>) {
  const resource = props.useResource<'genesis-intimacy'>('dsh-resource://genesis-intimacy/settings')
  return (
    <section className={css.panel}>
      <p>{props.t('description')}</p>
      {resource.status === 'failed' ? <p role="alert">{props.t('unavailable')}</p> : null}
      {resource.value === undefined ? (
        resource.status === 'loading' ? (
          <StateDot state="ongoing" />
        ) : null
      ) : (
        <IntimacyEditor
          t={props.t}
          sample={resource.value}
          writable={resource.status === 'live'}
          save={props.save}
          refresh={props.refresh}
        />
      )}
    </section>
  )
}

function IntimacyEditor({
  sample,
  writable,
  save,
  refresh,
  t,
}: PropsLocale<'genesis.intimacy'> & Actions & { sample: Settings; writable: boolean }) {
  const [draft, setDraft] = useState(sample.state.settings)
  const [revision, setRevision] = useState(sample.revision)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [saved, setSaved] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(
    () => () => {
      operation.current?.abort()
    },
    [],
  )
  const stale = revision !== sample.revision
  const update = <K extends keyof IntimacySettings>(key: K, value: IntimacySettings[K]) => {
    setDraft(previous => ({ ...previous, [key]: value }))
    setFailure(undefined)
    setSaved(false)
  }
  const commit = (remove: boolean) => {
    if (operation.current !== undefined || !writable || stale || !sample.available) return
    const owned = new AbortController()
    operation.current = owned
    setPending(true)
    setFailure(undefined)
    setSaved(false)
    void save(draft, revision, remove, owned.signal)
      .then((result) => {
        if (owned.signal.aborted) return
        if (result.ok) {
          setDraft(result.value.state.settings)
          setRevision(result.value.revision)
          setSaved(true)
        } else setFailure(operationFailure(result.error, [], t('saveFailed')))
      })
      .catch((error) => {
        if (!owned.signal.aborted) setFailure(operationFailure(error, [], t('saveFailed')))
      })
      .finally(() => {
        operation.current = undefined
        if (!owned.signal.aborted) {
          setPending(false)
          refresh()
        }
      })
  }
  return (
    <div className={`${css.editor} ${intimacyCss.settings}`}>
      <Checkbox
        label={t('enabled')}
        checked={draft.enabled}
        disabled={!writable || pending || !sample.available}
        onChange={(value) => {
          update('enabled', value)
        }}
      />
      <p className={css.secondary}>{t('hint')}</p>
      {!sample.available ? <p role="status">{t('unavailable')}</p> : null}
      <Checkbox
        label={t('influenceExpression')}
        checked={draft.influenceExpression}
        disabled={!writable || pending || !sample.available}
        onChange={(value) => {
          update('influenceExpression', value)
        }}
      />
      <fieldset className={css.modelFields}>
        <legend>{t('identityTitle')}</legend>
        {(['genderIdentity', 'sexualOrientation', 'romanticOrientation', 'boundaries'] as const).map(key => (
          <label className={intimacyCss.field} key={key}>
            {t(key)}
            <Input
              value={draft[key]}
              maxLength={600}
              disabled={!writable || pending || !sample.available}
              onChange={(event) => {
                update(key, event.target.value)
              }}
            />
          </label>
        ))}
      </fieldset>
      <fieldset className={css.modelFields}>
        <legend>{t('dynamicsTitle')}</legend>
        {(['baseline', 'halfLifeMs', 'maxDelta'] as const).map(key => (
          <label className={intimacyCss.field} key={key}>
            {t(key)}
            <Input
              type="number"
              value={draft[key]}
              min={key === 'halfLifeMs' ? 1000 : 0}
              max={key === 'halfLifeMs' ? 31536000000 : 1}
              step={key === 'halfLifeMs' ? 1000 : 0.05}
              disabled={!writable || pending || !sample.available}
              onChange={(event) => {
                if (Number.isFinite(event.target.valueAsNumber)) update(key, event.target.valueAsNumber)
              }}
            />
          </label>
        ))}
      </fieldset>
      {stale ? <p role="alert">{t('stale')}</p> : null}
      {failure === undefined ? null : <p role="alert">{failure}</p>}
      {saved ? <p role="status">{t('saved')}</p> : null}
      <div className={css.actions}>
        <Button
          disabled={!writable || pending || stale || !sample.available || JSON.stringify(draft) === JSON.stringify(sample.state.settings)}
          onClick={() => {
            commit(false)
          }}
        >
          {t(pending ? 'saving' : 'save')}
        </Button>
        <Button
          variant="outline"
          disabled={!writable || pending || stale || !sample.available}
          onClick={() => {
            commit(true)
          }}
        >
          {t('clear')}
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            setDraft(sample.state.settings)
            setRevision(sample.revision)
            setFailure(undefined)
            setSaved(false)
            refresh()
          }}
        >
          {t('reload')}
        </Button>
      </div>
    </div>
  )
}

/** Register operator-only durable settings independently of profile patch precedence.
 * @param ctx - Existing browser Remote, resource, locale and registration owner.
 */
export function mountIntimacy(ctx: Context): void {
  const resource = new StatusResource()
  ctx.effect(() => ctx.locale.register('genesis.intimacy', { en, zh }))
  ctx.effect(() =>
    ctx.resources.register<'genesis-intimacy'>({
      protocol: 'genesis-intimacy',
      open: (_address, { signal }) => resource.open(owned => ctx.remote.genesisStatus.inspectIntimacy(owned), signal),
    }),
  )
  ctx.on('connection/reset', () => {
    resource.refresh()
  })
  ctx.slots.inject('genesis.plugin.settings', () =>
    ctx.slots.register(
      {
        name: 'genesis.plugin.settings',
        key: 'genesis-intimacy',
        locale: 'genesis.intimacy',
        inject: (): Actions => ({
          save: (...args) => ctx.remote.genesisStatus.saveIntimacy(...args),
          refresh: () => {
            resource.refresh()
          },
        }),
      },
      IntimacyPluginSettings,
    ),
  )
}
