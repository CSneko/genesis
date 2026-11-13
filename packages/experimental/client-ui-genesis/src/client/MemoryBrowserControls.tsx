/** Declarative knowledge and person navigation. @module */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { MemoryBrowserFilter, MemoryCatalog } from '@deepseek-ai/dsh-experimental-genesis/types'
import css from './StatusPanel.module.css'

/**
 * Browse complete-state directories and source-grounded portraits.
 * @param props - Authoritative page metadata and selection.
 * @returns Wrapping directory and person controls.
 */
export function MemoryBrowserControls({
  filter,
  browser,
  change,
  t,
}: PropsLocale<'genesis'> & {
  filter: MemoryBrowserFilter
  browser: MemoryCatalog['browser']
  change: (filter: MemoryBrowserFilter) => void
}) {
  return (
    <div className={css.memoryBrowser}>
      <div className={css.actions} role="group" aria-label={t('memoryOrganizationTypes')}>
        {(['all', 'knowledge', 'person', 'event', 'unclassified'] as const).map(type => (
          <Button
            key={type}
            variant="outline"
            size="sm"
            aria-pressed={type === (filter.type ?? 'all')}
            onClick={() => {
              change({ navigationOffset: 0, ...(type === 'all' ? {} : { type }) })
            }}
          >
            {t(`memoryType.${type}`)}
          </Button>
        ))}
      </div>
      {filter.type === 'knowledge' ? (
        <nav className={css.actions} aria-label={t('memoryKnowledgeDirectory')}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              change({ type: 'knowledge', navigationOffset: 0 })
            }}
          >
            {t('memoryDomainRoot')}
          </Button>
          {(filter.path ?? []).map((part, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              onClick={() => {
                change({ type: 'knowledge', path: filter.path?.slice(0, index + 1), navigationOffset: 0 })
              }}
            >
              {part}
            </Button>
          ))}
        </nav>
      ) : null}
      {filter.subject === undefined ? null : (
        <div className={css.actions}>
          <span>{t('memoryPersonSelected', { name: filter.subject.name })}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              change({ type: 'person', navigationOffset: 0 })
            }}
          >
            {t('memoryPeopleRoot')}
          </Button>
        </div>
      )}
      {browser?.navigation.length ? (
        <ul className={css.records} aria-label={t(filter.type === 'knowledge' ? 'memoryKnowledgeDirectory' : 'memoryPersonPortraits')}>
          {browser.navigation.map(node =>
            node.kind === 'directory' ? (
              <li key={JSON.stringify(node.path)}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    change({ type: 'knowledge', path: node.path, navigationOffset: 0 })
                  }}
                >
                  {node.path.at(-1)}
                </Button>
                <span className={css.secondary}>{t('memoryCount', { count: node.count })}</span>
              </li>
            ) : (
              <li key={node.subject.personId ?? `${node.subject.memoryId}:${node.subject.name}`}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    change({ type: 'person', subject: node.subject, navigationOffset: 0 })
                  }}
                >
                  {node.subject.name}
                </Button>
                <p>{node.overview}</p>
                <span className={css.secondary}>
                  {t(node.subject.personId === undefined ? 'memoryUnlinkedPerson' : 'memoryLinkedPerson')}
                </span>
                <span className={css.secondary}>{t('memoryCount', { count: node.count })}</span>
              </li>
            ),
          )}
        </ul>
      ) : null}
      {browser === undefined || (filter.navigationOffset === 0 && browser.nextNavigationOffset === null) ? null : (
        <div className={css.actions}>
          <Button
            variant="outline"
            size="sm"
            disabled={filter.navigationOffset === 0}
            onClick={() => {
              change({ ...filter, navigationOffset: 0 })
            }}
          >
            {t('memoryNavigationFirst')}
          </Button>
          <span className={css.secondary}>{t('memoryNavigationCount', { count: browser.navigationTotal })}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={browser.nextNavigationOffset === null}
            onClick={() => {
              if (browser.nextNavigationOffset !== null) change({ ...filter, navigationOffset: browser.nextNavigationOffset })
            }}
          >
            {t('nextPage')}
          </Button>
        </div>
      )}
    </div>
  )
}
