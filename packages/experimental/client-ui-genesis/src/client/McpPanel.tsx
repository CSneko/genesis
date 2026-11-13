/** Catalog detail and one-action MCP installation, with runtime status kept separate from saved configuration. @module */
import { useId, useRef, useState } from 'react'
import { Button, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, PropsLocale, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { TypertClientRemote, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { McpProduct, McpInput, McpCustom } from '@deepseek-ai/dsh-experimental-genesis-mcp/types'
import type { McpKey } from './mcp-locales.ts'
import css from './StatusPanel.module.css'
import styles from './McpPanel.module.css'
type Remote = TypertClientRemote['genesisMcp']
/** Generated Remote actions and resource invalidation owned by the mounting plugin. */
export interface McpActions {
  install: Remote['installService']
  addCustom: Remote['addCustom']
  control: Remote['control']
  refresh(this: void): void
}
type Locale = PropsLocale<'genesis.mcp'>
function errorKey(error: unknown): McpKey {
  if (
    typeof error === 'object' &&
    error !== null &&
    'details' in error &&
    typeof error.details === 'object' &&
    error.details !== null &&
    'reason' in error.details
  ) {
    switch (error.details.reason) {
      case 'query':
        return 'queryError'
      case 'stale':
        return 'stale'
      case 'changed':
        return 'changed'
      case 'duplicate':
        return 'duplicate'
      case 'missing-input':
        return 'missingInput'
      case 'uncertain':
        return 'uncertain'
    }
  }
  return 'failed'
}
/** Render discovery and operator controls inside the existing settings page.
 * @param props - Shared resources, localized labels and generated RPC actions.
 * @returns Searchable catalog, product detail or current services.
 */
export function McpPanel({ useResource, t, ...actions }: PropsRuntime<'settings.section'> & Locale & InjectFace<McpActions>) {
  const [view, setView] = useState<'market' | 'installed' | 'custom'>('market'),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [cursors, setCursors] = useState<Array<string | null>>([null])
  const [selected, setSelected] = useState<McpProduct>(),
    [feedback, setFeedback] = useState<McpKey>(),
    [busy, setBusy] = useState(false),
    [remove, setRemove] = useState<string>()
  const locked = useRef(false)
  const inventory = useResource<'genesis-mcp-inventory'>('dsh-resource://genesis-mcp-inventory/current'),
    sample = inventory.value
  const catalog = useResource<'genesis-mcp-catalog'>(
    `dsh-resource://genesis-mcp-catalog/search?${new URLSearchParams({ query: search, cursor: cursors.at(-1) ?? '' })}`,
  )
  const perform = async <T,>(work: () => Promise<RemoteResult<T>>): Promise<boolean> => {
    if (locked.current) return false
    locked.current = true
    setBusy(true)
    setFeedback(undefined)
    try {
      const result = await work()
      if (!result.ok) setFeedback(errorKey(result.error))
      return result.ok
    } catch (error) {
      setFeedback(errorKey(error))
      return false
    } finally {
      locked.current = false
      setBusy(false)
      actions.refresh()
    }
  }
  const disabled = busy || sample === undefined || sample.uncertain
  const statusKey = (state: string): McpKey =>
    state === 'waiting-credentials'
      ? 'waiting'
      : ['connected', 'connecting', 'reconnecting', 'disabled', 'closed'].includes(state)
        ? (state as McpKey)
        : 'connectionFailed'
  return (
    <section className={css.panel}>
      <div className={css.header}>
        <h3>{t('title')}</h3>
        <Button variant="ghost" onClick={actions.refresh}>
          {t('refresh')}
        </Button>
      </div>
      <p className={css.secondary}>{t('description')}</p>
      <nav className={styles.tabs} aria-label={t('title')}>
        {(['market', 'installed', 'custom'] as const).map(tab => (
          <Button
            key={tab}
            variant={view === tab ? 'outline' : 'ghost'}
            aria-pressed={view === tab}
            onClick={() => {
              setView(tab)
              setSelected(undefined)
              setFeedback(undefined)
            }}
          >
            {t(tab)}
          </Button>
        ))}
      </nav>
      <div className={styles.feedback} aria-live="polite">
        {feedback || sample?.uncertain || inventory.status === 'failed' ? (
          <p role="alert">{t(sample?.uncertain ? 'uncertain' : (feedback ?? 'failed'))}</p>
        ) : null}
      </div>
      {view === 'market' ? (
        selected ? (
          <Product
            key={`${selected.name}:${selected.version}`}
            product={selected}
            {...{ t, busy, disabled }}
            back={() => {
              setSelected(undefined)
            }}
            install={async (recipe, values) => {
              if (!sample) return
              if (
                await perform(() =>
                  actions.install({
                    name: selected.name,
                    version: selected.version,
                    recipe: recipe.id,
                    fingerprint: recipe.fingerprint,
                    values,
                    revision: sample.revision,
                  }),
                )
              ) {
                setSelected(undefined)
                setView('installed')
              }
            }}
          />
        ) : (
          <>
            <form
              className={css.search}
              onSubmit={(event) => {
                event.preventDefault()
                if (query.trim() && [...query.trim()].length < 3) {
                  setFeedback('queryError')
                  return
                }
                setFeedback(undefined)
                setSearch(query.trim())
                setCursors([null])
              }}
            >
              <label htmlFor="genesis-mcp-search">{t('query')}</label>
              <Input
                id="genesis-mcp-search"
                value={query}
                maxLength={200}
                onChange={(event) => {
                  setQuery(event.target.value)
                }}
              />
              <Button type="submit">{t('search')}</Button>
            </form>
            <p className={css.secondary}>{t('catalogHint')}</p>
            {catalog.status === 'failed' ? <p role="alert">{t(errorKey(catalog.failure))}</p> : null}
            {catalog.value === undefined && catalog.status !== 'failed' ? (
              <div className={css.loading} role="status" aria-label={t('loading')}>
                <StateDot state="ongoing" />
              </div>
            ) : null}
            <ul className={css.records}>
              {catalog.value?.products.map(product => (
                <li key={`${product.name}:${product.version}`}>
                  <div className={css.header}>
                    <h3>{product.title}</h3>
                    <Button
                      onClick={() => {
                        setSelected(product)
                        setFeedback(undefined)
                      }}
                    >
                      {t('details')}
                    </Button>
                  </div>
                  <p>{product.description}</p>
                  <span className={css.secondary}>
                    {product.name} · {product.version}
                  </span>
                </li>
              ))}
            </ul>
            {catalog.value?.products.length === 0 ? <p>{t('empty')}</p> : null}
            <div className={css.pagination}>
              <Button
                disabled={cursors.length === 1}
                onClick={() => {
                  setCursors(value => value.slice(0, -1))
                }}
              >
                {t('previous')}
              </Button>
              <Button
                disabled={!catalog.value?.cursor}
                onClick={() => {
                  const cursor = catalog.value?.cursor
                  if (cursor) setCursors(value => [...value, cursor])
                }}
              >
                {t('next')}
              </Button>
            </div>
          </>
        )
      ) : view === 'custom' ? (
        <Custom
          key="custom"
          {...{ t, disabled }}
          invalid={() => {
            setFeedback('invalidJson')
          }}
          save={async (input) => {
            if (sample && (await perform(() => actions.addCustom(input, sample.revision)))) setView('installed')
          }}
        />
      ) : (
        <>
          <p className={css.secondary}>{t('toolHint')}</p>
          {sample === undefined ? (
            <div className={css.loading} role="status" aria-label={t('loading')}>
              <StateDot state="ongoing" />
            </div>
          ) : null}
          <ul className={css.records}>
            {sample?.servers.map(server => (
              <li key={server.name}>
                <div className={css.header}>
                  <h3>{server.name}</h3>
                  <span role="status">{t(statusKey(server.state))}</span>
                </div>
                {!server.managed ? (
                  <span className={css.secondary}>{t('registered')}</span>
                ) : (
                  <div className={css.actions}>
                    <Button
                      disabled={disabled}
                      onClick={() => {
                        void perform(() =>
                          actions.control(server.name, server.state === 'disabled' ? 'enable' : 'disable', sample.revision),
                        )
                      }}
                    >
                      {t(server.state === 'disabled' ? 'enable' : 'disable')}
                    </Button>
                    <Button
                      disabled={disabled || server.state === 'disabled'}
                      onClick={() => {
                        void perform(() => actions.control(server.name, 'restart', sample.revision))
                      }}
                    >
                      {t('restart')}
                    </Button>
                    <Button
                      disabled={disabled}
                      onClick={() => {
                        setRemove(server.name)
                      }}
                    >
                      {t('remove')}
                    </Button>
                  </div>
                )}
                {remove === server.name ? (
                  <div className={css.actions}>
                    <span>{t('confirmRemove')}</span>
                    <Button
                      disabled={disabled}
                      onClick={() => {
                        void perform(() => actions.control(server.name, 'remove', sample.revision)).then((ok) => {
                          if (ok) setRemove(undefined)
                        })
                      }}
                    >
                      {t('remove')}
                    </Button>
                    <Button
                      onClick={() => {
                        setRemove(undefined)
                      }}
                    >
                      {t('cancel')}
                    </Button>
                  </div>
                ) : null}
                {server.tools.length ? (
                  <details>
                    <summary>
                      {t('tools')} ({server.tools.length})
                    </summary>
                    <div className={styles.tools}>
                      {server.tools.map(tool => (
                        <code key={tool}>{tool}</code>
                      ))}
                    </div>
                  </details>
                ) : null}
                {server.omittedTools > 0 ? (
                  <span>
                    {t('omitted')}: {server.omittedTools}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {sample?.servers.length === 0 ? <p>{t('empty')}</p> : null}
        </>
      )}
    </section>
  )
}
function Product({
  product,
  t,
  busy,
  disabled,
  back,
  install,
}: Locale & {
  product: McpProduct
  busy: boolean
  disabled: boolean
  back: () => void
  install: (recipe: McpProduct['recipes'][number], values: Record<string, string>) => Promise<void>
}) {
  const [choice, setChoice] = useState(product.recipes[0]?.id ?? ''),
    [values, setValues] = useState<Record<string, string>>({}),
    id = useId()
  const recipe = product.recipes.find(item => item.id === choice)
  const required = recipe?.inputs.filter(field => field.required) ?? [],
    optional = recipe?.inputs.filter(field => !field.required) ?? []
  return (
    <div className={styles.detail}>
      <Button variant="ghost" onClick={back}>
        {t('back')}
      </Button>
      <h3>{product.title}</h3>
      <p>{product.description}</p>
      <span className={css.secondary}>
        {product.name} · {product.version}
      </span>
      {product.website ? (
        <a href={product.website} target="_blank" rel="noopener noreferrer">
          {t('website')}
        </a>
      ) : null}
      {recipe ? (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault()
            void install(recipe, values)
          }}
        >
          {product.recipes.length > 1 ? (
            <label className={styles.field}>
              {t('choice')}
              <select
                value={choice}
                onChange={(event) => {
                  setChoice(event.target.value)
                  setValues({})
                }}
              >
                {product.recipes.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className={css.secondary}>{t(recipe.local ? 'local' : 'remote')}</p>
          <code className={styles.address}>{recipe.label}</code>
          {required.map(field => (
            <Field
              key={`${recipe.id}:${field.id}`}
              {...{ field, id, t, values }}
              update={(value) => {
                setValues(current => ({ ...current, [field.id]: value }))
              }}
            />
          ))}
          {optional.length ? (
            <details>
              <summary>{t('optional')}</summary>
              <div className={styles.form}>
                {optional.map(field => (
                  <Field
                    key={`${recipe.id}:${field.id}`}
                    {...{ field, id, t, values }}
                    update={(value) => {
                      setValues(current => ({ ...current, [field.id]: value }))
                    }}
                  />
                ))}
              </div>
            </details>
          ) : null}
          {recipe.inputs.some(field => field.secret) ? <p className={css.secondary}>{t('credentials')}</p> : null}
          <Button
            type="submit"
            variant="primary"
            disabled={disabled || required.some(field => !(values[field.id] ?? field.defaultValue).trim())}
          >
            {t(busy ? 'installing' : 'install')}
          </Button>
        </form>
      ) : (
        <p>{t('unsupported')}</p>
      )}
    </div>
  )
}
function Field({
  field,
  id,
  t,
  values,
  update,
}: Locale & { field: McpInput; id: string; values: Record<string, string>; update: (value: string) => void }) {
  return (
    <label className={styles.field} htmlFor={`${id}-${field.id}`}>
      <span>
        {field.label}
        {field.required ? ` · ${t('required')}` : ''}
      </span>
      {field.choices.length ? (
        <select
          id={`${id}-${field.id}`}
          required={field.required}
          value={values[field.id] ?? field.defaultValue}
          onChange={(event) => {
            update(event.target.value)
          }}
        >
          <option value="">—</option>
          {field.choices.map(value => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={`${id}-${field.id}`}
          type={field.secret ? 'password' : 'text'}
          autoComplete="off"
          required={field.required}
          maxLength={8192}
          value={values[field.id] ?? field.defaultValue}
          onChange={(event) => {
            update(event.target.value)
          }}
        />
      )}
      {field.description ? <span className={css.secondary}>{field.description}</span> : null}
    </label>
  )
}
function Custom({
  t,
  disabled,
  invalid,
  save,
}: Locale & { disabled: boolean; invalid: () => void; save: (input: McpCustom) => Promise<void> }) {
  const id = useId(),
    [name, setName] = useState(''),
    [transport, setTransport] = useState<'streamable-http' | 'stdio'>('streamable-http'),
    [url, setUrl] = useState(''),
    [key, setKey] = useState(''),
    [command, setCommand] = useState(''),
    [args, setArgs] = useState('[]'),
    [env, setEnv] = useState('{}'),
    [headers, setHeaders] = useState('{}')
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault()
        try {
          const parsedArgs: unknown = JSON.parse(args),
            parsedEnv: unknown = JSON.parse(env),
            parsedHeaders: unknown = JSON.parse(headers)
          const dict = (value: unknown): value is Record<string, string> =>
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value) &&
            Object.values(value).every(item => typeof item === 'string')
          if (
            !/^[A-Za-z0-9_-]{1,32}$/u.test(name) ||
            !Array.isArray(parsedArgs) ||
            !parsedArgs.every((item: unknown) => typeof item === 'string') ||
            !dict(parsedEnv) ||
            !dict(parsedHeaders)
          ) {
            invalid()
            return
          }
          void save({
            name,
            transport,
            url: transport === 'streamable-http' ? url : '',
            command: transport === 'stdio' ? command : '',
            args: transport === 'stdio' ? parsedArgs : [],
            env: transport === 'stdio' ? parsedEnv : {},
            headers: transport === 'streamable-http' ? { ...parsedHeaders, ...(key ? { Authorization: `Bearer ${key}` } : {}) } : {},
          })
        } catch (_error: unknown) {
          invalid()
        }
      }}
    >
      <p className={css.secondary}>{t('customHint')}</p>
      <label className={styles.field} htmlFor={`${id}-name`}>
        {t('name')}
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={32}
          required
          pattern="[A-Za-z0-9_-]+"
          onChange={(event) => {
            setName(event.target.value)
          }}
        />
      </label>
      <label className={styles.field}>
        {t('transport')}
        <select
          value={transport}
          onChange={(event) => {
            setTransport(event.target.value === 'stdio' ? 'stdio' : 'streamable-http')
          }}
        >
          <option value="streamable-http">Streamable HTTP</option>
          <option value="stdio">stdio</option>
        </select>
      </label>
      {transport === 'streamable-http' ? (
        <>
          <label className={styles.field} htmlFor={`${id}-url`}>
            {t('url')}
            <Input
              id={`${id}-url`}
              type="url"
              required
              value={url}
              onChange={(event) => {
                setUrl(event.target.value)
              }}
            />
          </label>
          <label className={styles.field} htmlFor={`${id}-key`}>
            {t('bearer')}
            <Input
              id={`${id}-key`}
              type="password"
              autoComplete="off"
              value={key}
              onChange={(event) => {
                setKey(event.target.value)
              }}
            />
          </label>
          <details>
            <summary>{t('advanced')}</summary>
            <label className={styles.field} htmlFor={`${id}-headers`}>
              {t('headers')}
              <textarea
                id={`${id}-headers`}
                value={headers}
                onChange={(event) => {
                  setHeaders(event.target.value)
                }}
              />
            </label>
          </details>
        </>
      ) : (
        <>
          <p>{t('local')}</p>
          <label className={styles.field} htmlFor={`${id}-command`}>
            {t('command')}
            <Input
              id={`${id}-command`}
              required
              value={command}
              onChange={(event) => {
                setCommand(event.target.value)
              }}
            />
          </label>
          <label className={styles.field} htmlFor={`${id}-args`}>
            {t('args')}
            <textarea
              id={`${id}-args`}
              value={args}
              onChange={(event) => {
                setArgs(event.target.value)
              }}
            />
          </label>
          <label className={styles.field} htmlFor={`${id}-env`}>
            {t('env')}
            <textarea
              id={`${id}-env`}
              value={env}
              onChange={(event) => {
                setEnv(event.target.value)
              }}
            />
          </label>
        </>
      )}
      <p className={css.secondary}>{t('credentials')}</p>
      <Button type="submit" variant="primary" disabled={disabled}>
        {t('add')}
      </Button>
    </form>
  )
}
