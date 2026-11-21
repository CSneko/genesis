/** Genesis-owned optional plugin selection and configuration inside the Plugins page. @module */
import type { Context } from '@deepseek-ai/cordis'
import { useEffect, useRef, useState } from 'react'
import { Button, StateDot, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { BundleInfo } from '@deepseek-ai/dsh-api-remotes/client'
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { StatusResource } from './resource.ts'
import css from './StatusPanel.module.css'

const plugins = [
  { id: 'shock', package: '@deepseek-ai/dsh-genesis-shock' },
  { id: 'punishment', package: '@deepseek-ai/dsh-genesis-punishment' },
  { id: 'weather', package: '@deepseek-ai/dsh-genesis-weather' },
  { id: 'qq', package: '@deepseek-ai/dsh-experimental-genesis-qq' },
  { id: 'mail', package: '@deepseek-ai/dsh-experimental-genesis-mail' },
  { id: 'wallet', package: '@deepseek-ai/dsh-experimental-genesis-wallet' },
  { id: 'companion', package: '@deepseek-ai/dsh-experimental-genesis-companion' },
  { id: 'speech', package: '@deepseek-ai/dsh-experimental-genesis-speech' },
  { id: 'browser', package: '@deepseek-ai/dsh-experimental-browser-use-playwright-mcp' },
] as const
type Selection = Exclude<(typeof plugins)[number]['id'], 'shock'> | 'intimacy'
type EnableSnapshot = ConfigFormSnapshot<{ enabled: boolean }>
const en = {
  title: 'Genesis',
  description: 'Enable optional Genesis capabilities and configure them here. Core life services remain enabled.',
  shock: 'Electric shock',
  punishment: 'Punishment',
  weather: 'Weather',
  qq: 'QQ',
  mail: 'Mail',
  wallet: 'Wallet',
  companion: 'Companion',
  speech: 'Speech',
  mcp: 'MCP',
  browser: 'Browser',
  intimacy: 'Sexuality and intimacy',
  configure: 'Settings',
  back: 'Back to Genesis plugins',
  refresh: 'Refresh',
  enabled: 'Enabled',
  disabled: 'Disabled',
  unavailable: 'Plugin unavailable in this installation.',
  failure: 'Could not update plugins. Refresh and try again.',
  restart: 'Selection saved. Restart DSH to apply it.',
  overridden: 'Another profile patch overrides this selection.',
  settingsPending: 'Settings are not available yet. Wait for the plugin to finish loading, then refresh or restart DSH.',
  enableFirst: 'Enable this plugin to configure it. Restart DSH if its settings are not available yet.',
  author: 'Author: @CSNeko',
  browserAuthor: 'Harness browser integration',
}
type Key = keyof typeof en
const zh: Record<Key, string> = {
  title: 'Genesis',
  description: '在这里启停和配置 Genesis 的可选能力，核心生命功能保持启用',
  shock: '电击',
  punishment: '惩罚',
  weather: '天气',
  qq: 'QQ',
  mail: '邮件',
  wallet: '钱包',
  companion: 'Companion',
  speech: '语音',
  mcp: 'MCP',
  browser: '浏览器',
  intimacy: '性与亲密',
  configure: '设置',
  back: '返回 Genesis 插件',
  refresh: '刷新',
  enabled: '已启用',
  disabled: '未启用',
  unavailable: '当前安装中没有此插件',
  failure: '插件更新失败，请刷新后重试',
  restart: '选择已保存，请重启 DSH 使其生效',
  overridden: '其它配置补丁覆盖了此选择',
  settingsPending: '设置尚未就绪，请等待插件加载完成；仍未出现时请刷新页面或重启 DSH',
  enableFirst: '启用插件后可进行设置；如果设置尚未出现，请重启 DSH',
  author: '作者：@CSNeko',
  browserAuthor: 'Harness 浏览器集成',
}
interface Actions {
  hooks: { settings: HostObservable<string>; punishmentConfig: HostObservable<EnableSnapshot>; shockConfig: HostObservable<EnableSnapshot> }
  setPunishmentEnabled(value: boolean): Promise<boolean>
  setShockEnabled(value: boolean): Promise<boolean>
  setEnabled: TypertClientRemote['pluginManager']['setBundleEnabled']
  refresh(): void
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'genesis.plugins': Key
  }
  interface ResourceProtocolMap {
    'genesis-plugins': BundleInfo[]
  }
  interface SlotMap {
    /** Settings for an optional Genesis capability, keyed by its existing configuration id. */
    'genesis.plugin.settings': { kind: 'keyed'; scope: 'root'; owner: {} }
  }
}

/** Render optional capability switches and the selected settings provider.
 * @param props - Authenticated bundle resource, actions, localized copy and settings slots.
 * @returns Genesis plugin controls with persisted selection feedback.
 */
export function GenesisPlugins({
  useResource,
  renderSlot,
  t,
  setEnabled,
  refresh,
  useSettings,
  usePunishmentConfig,
  setPunishmentEnabled,
  useShockConfig,
  setShockEnabled,
}: PropsRuntime<'plugins.tab'> & PropsRenderSlots<'genesis.plugin.settings'> & PropsLocale<'genesis.plugins'> & InjectFace<Actions>) {
  const resource = useResource<'genesis-plugins'>('dsh-resource://genesis-plugins/catalog')
  const [selected, setSelected] = useState<Selection>()
  const [pending, setPending] = useState<string>()
  const [notice, setNotice] = useState<Key>()
  const operation = useRef(false),
    mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const toggle = (name: string, enabled: boolean, setBuiltin?: (value: boolean) => Promise<boolean>) => {
    if (operation.current) return
    operation.current = true
    setPending(name)
    setNotice(undefined)
    const result = setBuiltin !== undefined
      ? setBuiltin(enabled).then(ok => ({ ok, value: { application: 'applied' as const } }))
      : setEnabled(name, enabled)
    void result
      .then((result) => {
        if (!mounted.current) return
        setNotice(
          !result.ok || result.value.application === 'failed' || result.value.application === 'cancelled'
            ? 'failure'
            : result.value.application === 'restart-required'
              ? 'restart'
              : result.value.application === 'overridden'
                ? 'overridden'
                : undefined,
        )
      })
      .catch(() => {
        if (mounted.current) setNotice('failure')
      })
      .finally(() => {
        operation.current = false
        refresh()
        if (mounted.current) setPending(undefined)
      })
  }
  const builtinSwitches = {
    punishment: { snapshot: usePunishmentConfig(value => value), set: setPunishmentEnabled },
    shock: { snapshot: useShockConfig(value => value), set: setShockEnabled },
  }
  const availableSettings = useSettings(value => value).split('\0')
  const selectedPlugin = plugins.find(plugin => plugin.id === selected)
  const enabled = selected === 'punishment' || selectedPlugin === undefined || resource.value?.find(bundle => bundle.name === selectedPlugin.package)?.enabled === true
  return (
    <section className={css.panel}>
      <header className={css.header}>
        <h3>{t('title')}</h3>
        <Button variant="outline" onClick={refresh}>
          {t('refresh')}
        </Button>
      </header>
      <p className={css.secondary}>{t('description')}</p>
      {resource.status === 'loading' && !resource.value ? <StateDot state="ongoing" /> : null}
      {resource.status === 'failed' ? <p role="alert">{t('failure')}</p> : null}
      {notice ? <p role={notice === 'failure' ? 'alert' : 'status'}>{t(notice)}</p> : null}
      {selected === undefined ? (
        resource.value === undefined ? null : (
          <ul className={css.records}>
            {plugins.map((plugin) => {
              const builtin = plugin.id === 'punishment' || plugin.id === 'shock' ? builtinSwitches[plugin.id] : undefined
              const bundle = resource.value?.find(item => item.name === plugin.package)
              const enabled = builtin ? builtin.snapshot.value?.enabled === true : bundle?.enabled === true
              const selection = plugin.id === 'shock' ? undefined : plugin.id
              return (
                <li key={plugin.id}>
                  <div className={css.header}>
                    <span>{t(plugin.id)}</span>
                    <Switch
                      label={t(plugin.id)}
                      checked={enabled}
                      disabled={
                        pending !== undefined ||
                        (builtin
                          ? builtin.snapshot.status !== 'ready' || !builtin.snapshot.writable
                          : resource.status !== 'live' || bundle === undefined || bundle.availability === 'missing' || bundle.readOnlyReason !== undefined)
                      }
                      onChange={(value) => {
                        toggle(plugin.package, value, builtin?.set)
                      }}
                    />
                  </div>
                  <p className={css.secondary}>
                    {plugin.id === 'shock' ? null : `${t(plugin.id === 'browser' ? 'browserAuthor' : 'author')} · `}
                    {t(enabled ? 'enabled' : 'disabled')}
                  </p>
                  {bundle?.error ? <p role="alert">{t('failure')}</p> : null}
                  {!builtin && bundle === undefined && resource.status === 'live' ? <p>{t('unavailable')}</p> : null}
                  {selection === undefined ? null : (
                    <Button variant="outline" onClick={() => setSelected(selection)}>
                      {t('configure')}
                    </Button>
                  )}
                </li>
              )
            })}
            <li>
              <span>{t('intimacy')}</span>
              <p className={css.secondary}>{t('author')}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setSelected('intimacy')
                }}
              >
                {t('configure')}
              </Button>
            </li>
          </ul>
        )
      ) : (
        <>
          <Button
            variant="outline"
            onClick={() => {
              setSelected(undefined)
            }}
          >
            {t('back')}
          </Button>
          <h4>{t(selected)}</h4>
          {enabled ? (
            availableSettings.includes(`genesis-${selected}`) ? (
              renderSlot('genesis.plugin.settings', {}, { entryKey: `genesis-${selected}` })
            ) : (
              <p role="status">{t('settingsPending')}</p>
            )
          ) : (
            <p>{t('enableFirst')}</p>
          )}
        </>
      )}
    </section>
  )
}

/** Register the Genesis tab without importing or changing the Harness plugin manager implementation.
 * @param ctx - Genesis browser lifetime owner.
 */
export function mountGenesisPlugins(ctx: Context): void {
  ctx.inject(['remote.pluginManager'], (scope) => {
    const resource = new StatusResource()
    const punishment = scope.configForms.get<{ enabled: boolean }>('genesis-punishment')
    const shock = scope.configForms.get<{ enabled: boolean }>('genesis-shock')
    scope.effect(() => scope.locale.register('genesis.plugins', { en, zh }))
    scope.effect(() =>
      scope.resources.register<'genesis-plugins'>({
        protocol: 'genesis-plugins',
        open: (_address, { signal }) => resource.open(() => scope.remote.pluginManager.listBundles(), signal),
      }),
    )
    scope.effect(() =>
      scope.remote.$on('plugin-manager/changed', () => {
        resource.refresh()
      }),
    )
    scope.on('connection/reset', () => {
      resource.refresh()
    })
    scope.slots.inject('plugins.tab', () =>
      scope.slots.register(
        {
          name: 'plugins.tab',
          id: 'genesis',
          order: 20,
          locale: 'genesis.plugins',
          label: () => scope.locale.bind('genesis.plugins')('title'),
          children: { 'genesis.plugin.settings': { kind: 'keyed', scope: 'root' } },
          inject: (): Actions => ({
            hooks: {
              punishmentConfig: punishment,
              shockConfig: shock,
              settings: {
                getSnapshot: () =>
                  scope.slots
                    .entries('genesis.plugin.settings')
                    .map(entry => entry.options.key)
                    .join('\0'),
                subscribe: listener => scope.slots.subscribe('genesis.plugin.settings', listener),
              },
            },
            setPunishmentEnabled: value => punishment.set('enabled', value),
            setShockEnabled: value => shock.set('enabled', value),
            setEnabled: (...args) => scope.remote.pluginManager.setBundleEnabled(...args),
            refresh: () => {
              resource.refresh()
            },
          }),
        },
        GenesisPlugins,
      ),
    )
  })
}
