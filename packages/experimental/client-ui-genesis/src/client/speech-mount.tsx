import { mountSpeechPlayer } from './speech-player.tsx'
/** Speech route settings reuse the shared staged configuration form. @module */
import type { Context } from '@deepseek-ai/cordis'
import {
  SettingsForm,
  SettingsFormModel,
  SettingsValueField,
  settingsTextField,
  type SettingsFormShell,
  type SettingsFieldState,
  type SettingsFormActions,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

const fields = ['endpoint', 'model', 'voice', 'keyEnv'] as const
type Field = (typeof fields)[number]
type Settings = Record<Field, string>
type State = SettingsFormShell & Record<Field, SettingsFieldState>
interface Face extends SettingsFormActions {
  hooks: { speech: SnapshotStore<State> }
}
const en = {
  title: 'Speech synthesis',
  description: 'Alibaba Cloud CosyVoice with a built-in or custom voice.',
  endpoint: 'Speech API endpoint',
  model: 'CosyVoice model',
  voice: 'Default voice ID',
  keyEnv: 'API key reference',
  endpointHint: 'Use the full HTTPS SpeechSynthesizer URL for your region and workspace.',
  modelHint: 'Use the model bound to your custom voice, for example cosyvoice-v3-flash.',
  voiceHint: 'Enter a built-in voice or a custom voice ID already created in Alibaba Cloud.',
  keyEnvHint: 'Enter a credential reference, never the API key. Uses the Harness credentials store first, then the launch environment.',
  unavailable: 'Speech synthesis is not loaded.',
  readOnly: 'These settings are read-only.',
  saveFailed: 'Could not save settings. Reload and try again; check the server error if this persists.',
  save: 'Save',
  saving: 'Saving…',
  overridden: 'Overridden',
  reset: 'Reset to default',
  invalid: 'Enter a valid value.',
}
type Key = keyof typeof en
const zh: Record<Key, string> = {
  title: '语音合成',
  description: '使用阿里云 CosyVoice，将文本合成为内置或自定义音色的语音',
  endpoint: '语音接口地址',
  model: 'CosyVoice 模型',
  voice: '默认音色 ID',
  keyEnv: 'API Key 凭据名',
  endpointHint: '填写所在地域和业务空间的完整 HTTPS SpeechSynthesizer 接口地址',
  modelHint: '须与自定义音色绑定的模型一致，例如 cosyvoice-v3-flash',
  voiceHint: '填写内置音色，或已在阿里云创建的自定义音色 ID',
  keyEnvHint: '填写凭据名，不要填密钥；优先读取 Harness 凭据文件，再读取启动环境变量',
  unavailable: '语音合成插件尚未加载',
  readOnly: '当前设置为只读',
  saveFailed: '设置未能保存，请刷新页面后重试；仍失败时请查看服务端错误',
  save: '保存',
  saving: '保存中…',
  overridden: '已覆盖',
  reset: '恢复默认',
  invalid: '请填写有效值',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'genesis.speech': Key
  }
}

function SpeechSettings(props: PropsRuntime<'genesis.plugin.settings'> & PropsLocale<'genesis.speech'> & InjectFace<Face>) {
  const state = props.useSpeech(value => value)
  const { t } = props
  return (
    <SettingsForm
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
      labels={{ unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }}
    >
      {fields.map(field => (
        <SettingsValueField
          key={field}
          id={`genesis-speech-${field}`}
          label={t(field)}
          hint={t(`${field}Hint`)}
          overriddenLabel={t('overridden')}
          resetLabel={t('reset')}
          invalidLabel={t('invalid')}
          disabled={!state.writable}
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

/** Mount settings only while the Host serves the speech configuration.
 * @param ctx - Existing Genesis browser registration owner.
 */
export function mountSpeech(ctx: Context): void {
  mountSpeechPlayer(ctx)
  ctx.effect(() => ctx.locale.register('genesis.speech', { en, zh }))
  ctx.effect(() =>
    ctx.configForms.whileServed(['genesis-speech'], () => {
      const scope = ctx.inject(['slots', 'configForms'], (child) => {
        const form = new SettingsFormModel<Settings>(child.configForms.get('genesis-speech'), fields.map(settingsTextField))
        const store = form.bind((): State => ({
          ...form.shell(),
          endpoint: form.field('endpoint'),
          model: form.field('model'),
          voice: form.field('voice'),
          keyEnv: form.field('keyEnv'),
        }))
        child.effect(() => () => {
          form.dispose()
        })
        child.slots.inject('genesis.plugin.settings', () =>
          child.slots.register(
            {
              name: 'genesis.plugin.settings',
              key: 'genesis-speech',
              locale: 'genesis.speech',
              inject: (): Face => ({ ...form.actions(), hooks: { speech: store } }),
            },
            SpeechSettings,
          ),
        )
      })
      return () => scope.dispose()
    }),
  )
}
