/** Staged external-browser address over the Host's persisted configuration form. @module */
import type { Context } from '@deepseek-ai/cordis'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  SettingsForm,
  SettingsFormModel,
  SettingsValueField,
  settingsTextField,
  type SettingsFormShell,
  type SettingsFieldState,
  type SettingsFormActions,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

type State = SettingsFormShell & { endpoint: SettingsFieldState }
interface Face extends SettingsFormActions {
  hooks: { browserConnection: SnapshotStore<State> }
}
const en = {
  title: 'Browser',
  endpoint: 'Chrome debugging address',
  hint: 'Address on the Genesis server, normally http://127.0.0.1:9222. Save, then restart Genesis and resume your conversation to use the new address. Existing connections keep their address. A saved address does not confirm connectivity.',
  unavailable: 'Browser settings are unavailable.',
  readOnly: 'These settings are read-only.',
  saveFailed: 'Could not save the address. Your draft is retained; check the URL and reload before retrying.',
  save: 'Save',
  saving: 'Saving…',
  overridden: 'Overridden',
  reset: 'Reset to default',
  invalid: 'Enter an HTTP(S) or WS(S) debugging URL.',
}
type Key = keyof typeof en
const zh: Record<Key, string> = {
  title: '浏览器',
  endpoint: 'Chrome 调试地址',
  hint: '填写 Genesis 服务器可访问的地址，默认为 http://127.0.0.1:9222。保存后重启 Genesis 并恢复对话，即可使用新地址；现有连接保持原地址。保存地址不代表连接已成功',
  unavailable: '浏览器设置暂不可用',
  readOnly: '当前设置为只读',
  saveFailed: '地址未能保存，草稿已保留；请检查网址，刷新后重试',
  save: '保存',
  saving: '保存中…',
  overridden: '已覆盖',
  reset: '恢复默认',
  invalid: '请填写 HTTP(S) 或 WS(S) 调试地址',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'genesis.browser': Key
  }
}

function BrowserSettings(props: PropsRuntime<'genesis.plugin.settings'> & PropsLocale<'genesis.browser'> & InjectFace<Face>) {
  const state = props.useBrowserConnection(value => value)
  const { t } = props
  return (
    <SettingsForm
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
      labels={{ unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }}
    >
      <SettingsValueField
        id="genesis-browser-endpoint"
        label={t('endpoint')}
        hint={t('hint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalid')}
        disabled={!state.writable}
        {...state.endpoint}
        onEdit={(value) => {
          props.edit('endpoint', value)
        }}
        onReset={() => {
          props.resetField('endpoint')
        }}
      />
    </SettingsForm>
  )
}

/**
 * Show browser address settings while the external-browser provider is active.
 * @param ctx - Genesis settings registration and locale owner.
 */
export function mountBrowser(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('genesis.browser', { en, zh }))
  ctx.effect(() =>
    ctx.configForms.whileServed(['genesis-browser-playwright'], () => {
      const scope = ctx.inject(['slots', 'configForms'], (child) => {
        const form = new SettingsFormModel<{ endpoint: string }>(child.configForms.get('genesis-browser-playwright'), [
          settingsTextField('endpoint'),
        ])
        const store = form.bind((): State => ({ ...form.shell(), endpoint: form.field('endpoint') }))
        child.effect(() => () => {
          form.dispose()
        })
        child.slots.inject('genesis.plugin.settings', () =>
          child.slots.register(
            {
              name: 'genesis.plugin.settings',
              key: 'genesis-browser',
              locale: 'genesis.browser',
              inject: (): Face => ({ ...form.actions(), hooks: { browserConnection: store } }),
            },
            BrowserSettings,
          ),
        )
      })
      return () => scope.dispose()
    }),
  )
}
