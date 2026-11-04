/** Shared relationship readings keep confidence distinct from estimated strength. @module */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { RelationshipState } from '@deepseek-ai/dsh-experimental-genesis/types'
import css from './EmotionPanel.module.css'

const fields = ['affection', 'trust', 'attachment', 'familiarity', 'feltSecurity'] as const
/**
 * Render known estimates and explicit unknown fields for either an operator or person relationship.
 * @param props - Estimates, per-field confidence and localized labels.
 * @returns Accessible meters; zero-confidence values are displayed as unknown.
 */
export function RelationshipValues({ relationship, t }: PropsLocale<'genesis'> & {
  relationship: Pick<RelationshipState, 'values' | 'confidence' | 'origins'>
}) {
  return <dl className={css.meters}>{fields.map(field => <div key={field}>
    <dt>{t(`relationship.${field}`)}</dt><dd>{relationship.confidence[field] === 0 ? <span>{t('relationshipUncertain')}</span>
      : <><meter min={0} max={1} value={relationship.values[field]} aria-label={t(`relationship.${field}`)} /><span>{Math.round(relationship.values[field] * 100)}%</span></>}</dd>
    <dd className={css.meterHint}>{t(`relationshipHint.${field}`)} · {relationship.origins[field] === 'user-stated' ? t('relationshipOperatorValue')
      : t('relationshipConfidence', { value: Math.round(relationship.confidence[field] * 100) })}</dd>
  </div>)}</dl>
}
