/** Punishment webhook settings reuse the shared staged configuration form. @module */
import type { Context } from '@deepseek-ai/cordis'
import {
  SettingsForm,
  SettingsFormModel,
  SettingsValueField,
  Switch,
  settingsTextField,
  type SettingsFormShell,
  type SettingsFieldState,
  type SettingsFormActions,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './WeatherSettings.module.css'

const fields = ['webhookUrl', 'description', 'levelDescription'] as const
type Field = (typeof fields)[number]
type Settings = Record<Field, string> & { allowGroupChats: boolean }
type State = SettingsFormShell & Record<Field | 'allowGroupChats', SettingsFieldState>
interface Face extends SettingsFormActions {
  hooks: { punishment: SnapshotStore<State> }
}
const en = {
  title: 'Punishment',
  allowGroupChats: 'Allow group chats',
  groupHint: 'Allow QQ group conversations to use this tool. Tool learning, toolkit activation and existing QQ permissions still apply. Saving takes effect on the next call.',
  description: 'Set a webhook and the agreed punishment rules. Saving does not send a request.',
  webhookUrl: 'Webhook URL',
  webhookUrlHint: 'HTTP(S) destination receiving POST JSON with a level field. Leave empty to prevent delivery.',
  descriptionHint: 'Instructions shown to Genesis: when to use the tool and the agreed rules.',
  levelDescription: 'Level description',
  levelDescriptionHint: 'Usually 0.0–1.0. Any finite number is accepted; define your own scale here.',
  toolDescription: 'Tool description',
  unavailable: 'Punishment settings are unavailable.',
  readOnly: 'These settings are read-only.',
  saveFailed: 'Could not save. Your draft is retained; reload and try again.',
  save: 'Save', saving: 'Saving…', overridden: 'Overridden', reset: 'Reset to default',
  invalid: 'Enter a valid value.',
}
type Key = keyof typeof en
const zh: Record<Key, string> = {
  title: '惩罚',
  allowGroupChats: '允许群聊使用',
  groupHint: '允许 QQ 群聊使用惩罚工具，仍需学习工具、启用工具包并通过已有 QQ 权限检查；保存后下次调用生效',
  description: '设置 webhook 和约定的惩罚规则，保存设置不会发送请求',
  webhookUrl: 'Webhook 地址',
  webhookUrlHint: '接收含 level 字段的 JSON POST 请求的 HTTP(S) 地址；留空时不会发送',
  descriptionHint: '提供给 Genesis 的工具说明：何时使用工具，以及与主人约定的规则',
  levelDescription: '等级说明',
  levelDescriptionHint: '通常使用 0.0～1.0，也接受其他有限数值，可在这里定义自己的等级含义',
  toolDescription: '工具描述',
  unavailable: '惩罚设置暂不可用', readOnly: '当前设置为只读',
  saveFailed: '保存失败，草稿已保留；请重新加载后重试',
  save: '保存', saving: '保存中…', overridden: '已覆盖', reset: '恢复默认', invalid: '请填写有效值',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'genesis.punishment': Key
  }
}

function PunishmentSettings(props: PropsRuntime<'genesis.plugin.settings'> & PropsLocale<'genesis.punishment'> & InjectFace<Face>) {
  const state = props.usePunishment(value => value)
  const { t } = props
  return (
    <SettingsForm
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
      labels={{ unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }}
    >
      <p>{t('description')}</p>
      <div className={css.row}>
        <span>{t('allowGroupChats')}</span>
        <Switch
          label={t('allowGroupChats')}
          checked={state.allowGroupChats.text === 'true'}
          disabled={!state.writable || state.saving}
          onChange={(value) => { props.edit('allowGroupChats', String(value)) }}
        />
      </div>
      <p className={css.hint}>{t('groupHint')}</p>
      {fields.map(field => (
        <SettingsValueField
          key={field}
          id={`genesis-punishment-${field}`}
          label={t(field === 'description' ? 'toolDescription' : field)}
          hint={t(`${field}Hint`)}
          overriddenLabel={t('overridden')}
          resetLabel={t('reset')}
          invalidLabel={t('invalid')}
          disabled={!state.writable || state.saving}
          {...state[field]}
          onEdit={(value) => {
            props.edit(field, value)
          }}
          onReset={() => {
            props.resetField(field)
          }}
        />
      ))}
    </SettingsForm>
  )
}

/** Mount settings only while the Host serves the punishment configuration.
 * @param ctx - Existing Genesis browser registration owner.
 */
export function mountPunishment(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('genesis.punishment', { en, zh }))
  ctx.effect(() =>
    ctx.configForms.whileServed(['genesis-punishment'], () => {
      const scope = ctx.inject(['slots', 'configForms'], (child) => {
        const form = new SettingsFormModel<Settings>(child.configForms.get('genesis-punishment'), [{
          field: 'allowGroupChats',
          format: value => value === true ? 'true' : 'false',
          parse: text => text === 'true' || text === 'false' ? { kind: 'set', value: text === 'true' } : undefined,
        }, ...fields.map((field) => {
          const spec = settingsTextField(field)
          return { ...spec, parse: (text: string) => {
            if (field !== 'webhookUrl') return text.trim() === '' ? undefined : spec.parse(text)
            if (text.trim() === '') return { kind: 'set' as const, value: '' }
            try {
              const url = new URL(text.trim())
              if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) return undefined
            } catch (_error) { return undefined }
            return { kind: 'set' as const, value: text.trim() }
          } }
        })])
        const store = form.bind((): State => ({
          ...form.shell(),
          allowGroupChats: form.field('allowGroupChats'),
          webhookUrl: form.field('webhookUrl'),
          description: form.field('description'),
          levelDescription: form.field('levelDescription'),
        }))
        child.effect(() => () => {
          form.dispose()
        })
        child.slots.inject('genesis.plugin.settings', () =>
          child.slots.register(
            {
              name: 'genesis.plugin.settings',
              key: 'genesis-punishment',
              locale: 'genesis.punishment',
              inject: (): Face => ({ ...form.actions(), hooks: { punishment: store } }),
            },
            PunishmentSettings,
          ),
        )
      })
      return () => scope.dispose()
    }),
  )
}
