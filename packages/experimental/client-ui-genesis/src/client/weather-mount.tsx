/** Optional weather settings reuse the revision-fenced configuration form. @module */
import type { Context } from '@deepseek-ai/cordis'
import {
  SettingsForm,
  SettingsFormModel,
  SettingsValueField,
  Switch,
  settingsTextField,
  type SettingsFieldSpec,
  type SettingsFieldState,
  type SettingsFormActions,
  type SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './WeatherSettings.module.css'

const switches = ['enabled', 'toolEnabled', 'contextEnabled'] as const
type Toggle = (typeof switches)[number]
type Settings = Record<Toggle, boolean> & { location: string }
type State = SettingsFormShell & Record<Toggle | 'location', SettingsFieldState>
interface Face extends SettingsFormActions {
  hooks: { weather: SnapshotStore<State> }
}
const en = {
  title: 'Weather',
  enabled: 'Enable weather',
  toolEnabled: 'Weather tool',
  contextEnabled: 'Share weather with the character',
  description: 'Open-Meteo weather for a city you choose. No API key or automatic location access.',
  toolHint: 'Enable get_weather in private operator Life conversations. Existing tool learning and toolkit permissions still apply.',
  contextHint:
    'Private operator Life conversations only. Shares a short initial reading, then updates on condition changes, temperature or feels-like changes of 5 °C, or wind changes of 15 km/h.',
  refreshHint:
    'Tools and context share a cache: one lookup attempt per city every 30 minutes, including failures and across restarts. Refreshes on use; no background polling.',
  location: 'Your weather city',
  locationHint:
    'Enter a city, for example Shanghai. Context requires this city; tool calls may specify another. City names are sent to Open-Meteo. Saving takes effect on the next request.',
  unavailable: 'Weather settings are unavailable.',
  readOnly: 'These settings are read-only.',
  saveFailed: 'Could not save. Your draft is retained; reload and try again.',
  save: 'Save',
  saving: 'Saving…',
  overridden: 'Overridden',
  reset: 'Reset to default',
  invalid: 'Enter a city name of at most 200 characters.',
}
type Key = keyof typeof en
const zh: Record<Key, string> = {
  title: '天气',
  enabled: '启用天气插件',
  toolEnabled: '天气查询工具',
  contextEnabled: '向角色提供天气上下文',
  description: '查询你指定城市的 Open-Meteo 天气，无需 API Key，不自动获取定位',
  toolHint: '在私有操作者 Life 对话中启用 get_weather，仍遵循已有工具学习与工具包权限',
  contextHint: '仅用于私有操作者 Life 对话。首次提供简短天气，之后仅在天气类型变化、气温或体感变化达到 5°C，或风速变化达到 15 km/h 时更新',
  refreshHint: '工具与上下文共享缓存：每个城市每半小时最多尝试查询一次，失败和重启也遵循此限制。使用时刷新，不在后台轮询',
  location: '你的天气城市',
  locationHint: '填写城市，例如 Shanghai。上下文使用此城市，工具可指定其他地点；城市名会发送给 Open-Meteo。保存后下次请求生效',
  unavailable: '天气设置暂不可用',
  readOnly: '当前设置为只读',
  saveFailed: '保存失败，草稿已保留；请重新加载后重试',
  save: '保存',
  saving: '保存中…',
  overridden: '已覆盖',
  reset: '恢复默认',
  invalid: '请填写不超过 200 个字符的城市名',
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'genesis.weather': Key
  }
}

function WeatherSettings(props: PropsRuntime<'genesis.plugin.settings'> & PropsLocale<'genesis.weather'> & InjectFace<Face>) {
  const state = props.useWeather(value => value)
  const { t } = props
  return (
    <SettingsForm
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
      labels={{ unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }}
    >
      <p className={css.hint}>{t('description')}</p>
      {switches.map(field => (
        <div key={field} className={css.row}>
          <span>{t(field)}</span>
          <Switch
            label={t(field)}
            checked={state[field].text === 'true'}
            disabled={!state.writable || state.saving}
            onChange={(value) => {
              props.edit(field, String(value))
            }}
          />
        </div>
      ))}
      <p className={css.hint}>{t('toolHint')}</p>
      <p className={css.hint}>{t('contextHint')}</p>
      <SettingsValueField
        id="genesis-weather-location"
        label={t('location')}
        hint={t('locationHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalid')}
        disabled={!state.writable || state.saving}
        {...state.location}
        onEdit={(value) => {
          props.edit('location', value)
        }}
        onReset={() => {
          props.resetField('location')
        }}
      />
      <p className={css.hint}>{t('refreshHint')}</p>
    </SettingsForm>
  )
}
function toggleField(field: Toggle): SettingsFieldSpec {
  return {
    field,
    format: value => (value === true ? 'true' : 'false'),
    parse: text => (text === 'true' || text === 'false' ? { kind: 'set', value: text === 'true' } : undefined),
  }
}
/** Mount the weather plugin settings while its Host configuration is served.
 * @param ctx - Genesis browser registrations and locale owner.
 */
export function mountWeather(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('genesis.weather', { en, zh }))
  ctx.effect(() =>
    ctx.configForms.whileServed(['genesis-weather'], () => {
      const scope = ctx.inject(['slots', 'configForms'], (child) => {
        const location = settingsTextField('location')
        const form = new SettingsFormModel<Settings>(child.configForms.get('genesis-weather'), [
          ...switches.map(toggleField),
          { ...location, parse: text => (text.trim().length <= 200 ? location.parse(text) : undefined) },
        ])
        const store = form.bind((): State => ({
          ...form.shell(),
          enabled: form.field('enabled'),
          toolEnabled: form.field('toolEnabled'),
          contextEnabled: form.field('contextEnabled'),
          location: form.field('location'),
        }))
        child.effect(() => () => {
          form.dispose()
        })
        child.slots.inject('genesis.plugin.settings', () =>
          child.slots.register(
            {
              name: 'genesis.plugin.settings',
              key: 'genesis-weather',
              locale: 'genesis.weather',
              inject: (): Face => ({ ...form.actions(), hooks: { weather: store } }),
            },
            WeatherSettings,
          ),
        )
      })
      return () => scope.dispose()
    }),
  )
}
