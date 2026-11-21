/** Life composer control for voltage, pulses, and timed electric shock. @module */
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { Button, Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import contribution from '@deepseek-ai/dsh-genesis-shock/remote'
import type { ShockDuration, ShockStatus, ShockVoltage } from '@deepseek-ai/dsh-genesis-shock/types'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { useEffect, useRef, useState } from 'react'
import { StatusResource } from './resource.ts'
import css from './shock.module.css'

const voltages = [10, 30, 60, 100, 150, 200, 300, 500] as const satisfies readonly ShockVoltage[]
const durations = [5, 15, 30] as const satisfies readonly ShockDuration[]

const en = {
  shock: 'Electric shock',
  voltage: 'Voltage',
  volts: '{value} V',
  once: 'Shock once',
  continuous: 'Continuous shock',
  timed: 'Continuous · {value}s',
  active: '{voltage} V · {remaining}s',
  stop: 'Stop',
  stopLabel: 'Stop electric shock',
  queued: 'Starting shock reply',
  delivered: 'Shock delivered',
  failed: 'Could not update electric shock. Check its status and try again.',
}
type Key = keyof typeof en
const zh: Record<Key, string> = {
  shock: '电击',
  voltage: '电压',
  volts: '{value} V',
  once: '电击一次',
  continuous: '持续电击',
  timed: '持续 {value} 秒',
  active: '{voltage} V · 剩余 {remaining} 秒',
  stop: '停止',
  stopLabel: '停止电击',
  queued: '正在唤起回复',
  delivered: '已电击',
  failed: '无法更新电击状态，请查看当前状态后重试。',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'genesis.shock': Key
  }
  interface ResourceProtocolMap {
    'genesis-shock': ShockStatus
  }
}

interface ShockActions {
  hooks: { shockConfig: HostObservable<ConfigFormSnapshot<{ enabled: boolean }>> }
  start(voltage: ShockVoltage, duration: ShockDuration, signal: AbortSignal): Promise<RemoteResult<ShockStatus>>
  stop(signal: AbortSignal): Promise<RemoteResult<ShockStatus>>
  refresh(): void
}

type Props = PropsRuntime<'conversation.input.left'> & PropsLocale<'genesis.shock'> & InjectFace<ShockActions>

function ShockSeat({ useShockConfig, ...props }: Props) {
  const enabled = useShockConfig(snapshot => snapshot.value?.enabled === true)
  return enabled ? <ShockControl key={props.sessionId} {...props} /> : null
}

function ShockControl({ sessionId, useResource, t, start, stop, refresh }: Omit<Props, 'useShockConfig'>) {
  const resource = useResource<'genesis-shock'>(`dsh-resource://genesis-shock/status?sessionId=${encodeURIComponent(sessionId)}`)
  const [open, setOpen] = useState(false)
  const [voltage, setVoltage] = useState<ShockVoltage>(30)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const operation = useRef<AbortController>()
  useEffect(() => () => operation.current?.abort(), [])
  useEffect(() => {
    const handle = setInterval(refresh, 1000)
    return () => clearInterval(handle)
  }, [refresh])

  const act = async (run: (signal: AbortSignal) => Promise<RemoteResult<ShockStatus>>) => {
    if (operation.current !== undefined) return
    const controller = new AbortController()
    operation.current = controller
    setOpen(false)
    setBusy(true)
    setFailed(false)
    try {
      const result = await run(controller.signal)
      if (!controller.signal.aborted) setFailed(!result.ok)
    } catch (_error) {
      if (!controller.signal.aborted) setFailed(true)
    } finally {
      if (!controller.signal.aborted) {
        operation.current = undefined
        setBusy(false)
        refresh()
      }
    }
  }

  const status = resource.value
  if (status === undefined || status.kind === 'unavailable') return null
  const active = status.kind === 'continuous'
  const canStop = active || status.kind === 'queued'
  const items: MenuEntry[] = [
    { type: 'label', id: 'voltage', text: t('voltage') },
    ...voltages.map(value => ({ id: `voltage-${value}`, label: t('volts', { value }) })),
    { type: 'separator', id: 'actions' },
    { id: 'once', label: t('once') },
    { id: 'continuous', label: t('continuous'), submenu: durations.map(value => ({ id: `timed-${value}`, label: t('timed', { value }) })) },
  ]
  const select = (id: string) => {
    const choice = voltages.find(value => id === `voltage-${value}`)
    if (choice !== undefined) {
      setVoltage(choice)
      return
    }
    const duration = id === 'once' ? 0 : durations.find(value => id === `timed-${value}`)
    if (duration !== undefined) void act(signal => start(voltage, duration, signal))
  }
  return (
    <div className={css.controls}>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        onSelect={select}
        items={items}
        selectedId={`voltage-${voltage}`}
        side="top"
        align="end"
        compact
        autoFocus
        portal
        anchor={(
          <Button variant="toolbar" size="sm" disabled={busy || active} aria-label={t('shock')}
            aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
            <span aria-hidden="true">⚡︎</span> {t('shock')}
          </Button>
        )}
      />
      {active && (
        <span className={css.status}>
          {t('active', { voltage: status.voltage, remaining: status.remainingSeconds })}
        </span>
      )}
      {status.kind === 'queued' && <span className={css.status} role="status">{t('queued')}</span>}
      {status.kind === 'delivered' && <span className={css.status} role="status">{t('delivered')}</span>}
      {canStop && (
        <Button variant="outline" size="sm" disabled={busy} aria-label={t('stopLabel')} onClick={() => void act(stop)}>
          {t('stop')}
        </Button>
      )}
      {(failed || resource.status === 'failed') && <span role="alert" className={css.status}>{t('failed')}</span>}
    </div>
  )
}

/**
 * Register the composer control against the generated Host Remote.
 * @param ctx - Genesis browser lifetime.
 * @returns Disposer releasing the UI before its Remote contribution.
 */
export async function mountShock(ctx: Context): Promise<() => Promise<void>> {
  const unmount = await ctx.remote.$mount(contribution)
  const ui = ctx.inject(['remote.genesisShock'], (scope) => {
    const resource = new StatusResource()
    const shockConfig = scope.configForms.get<{ enabled: boolean }>('genesis-shock')
    const refresh = () => resource.refresh()
    scope.effect(() => scope.locale.register('genesis.shock', { en, zh }))
    scope.effect(() => scope.resources.register<'genesis-shock'>({
      protocol: 'genesis-shock',
      open(address, { signal }) {
        const id = brandString<SessionId>(new URL(address).searchParams.get('sessionId') ?? '')
        return resource.open(owned => scope.remote.genesisShock.inspect(id, owned), signal)
      },
    }))
    scope.on('connection/reset', refresh)
    scope.slots.inject('conversation.input.left', () => scope.slots.register({
      name: 'conversation.input.left',
      id: 'genesis-shock',
      locale: 'genesis.shock',
      inject: (sessionId): ShockActions => ({
        hooks: { shockConfig },
        start: (voltage, duration, signal) => scope.remote.genesisShock.start(sessionId, voltage, duration, signal),
        stop: signal => scope.remote.genesisShock.stop(sessionId, signal),
        refresh,
      }),
    }, ShockSeat))
  })
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await unmount()
    throw error
  }
  return async () => {
    await ui.dispose()
    await unmount()
  }
}
