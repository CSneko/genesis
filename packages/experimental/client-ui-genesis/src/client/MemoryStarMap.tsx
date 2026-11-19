/** Interactive perspective memory scene using the existing authenticated browser page. @module */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { LifeMemory } from '@deepseek-ai/dsh-experimental-genesis/types'
import { memoryClusters, memoryStars, projectMemoryStar } from './memory-star-map.ts'
import css from './MemoryStarMap.module.css'

type Props = PropsLocale<'genesis'> & {
  memories: readonly LifeMemory[]
  name: string
  selected: string | undefined
  select: (id: LifeMemory['id']) => void
  category?: LifeMemory['category'] | undefined
  filterCategory?: ((category: LifeMemory['category']) => void) | undefined
  findRelated?: ((id: LifeMemory['id']) => void) | undefined
}

/**
 * Explore a bounded page with rotation, zoom, keyboard selection and reduced-motion support.
 * @param props - Current records, life name, selection callback and localized copy.
 * @returns A read-only scene; selecting a node never changes memory or confidence.
 */
export function MemoryStarMap({ memories, name, selected, select, category, filterCategory, findRelated, t }: Props) {
  const id = useId()
  const stars = useMemo(() => memoryStars(memories), [memories])
  const [camera, setCamera] = useState({ yaw: 0, pitch: -0.35, zoom: 1 })
  const [rotating, setRotating] = useState(true)
  const [reduced, setReduced] = useState(false)
  const drag = useRef<{ x: number; y: number; moved: boolean }>()
  const svg = useRef<SVGSVGElement>(null)
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(preference.matches)
    update()
    preference.addEventListener('change', update)
    return () => preference.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (!rotating || reduced) return
    let frame = 0
    let last = 0
    const animate = (now: number) => {
      if (last !== 0 && drag.current === undefined) {
        const elapsed = Math.min(now - last, 50)
        setCamera(value => ({ ...value, yaw: value.yaw + elapsed * 0.00008 }))
      }
      last = now
      frame = requestAnimationFrame(animate)
    }
    const visibility = () => {
      cancelAnimationFrame(frame)
      last = 0
      if (!document.hidden) frame = requestAnimationFrame(animate)
    }
    visibility()
    document.addEventListener('visibilitychange', visibility)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [rotating, reduced])
  useEffect(() => {
    const element = svg.current
    if (element === null) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      setCamera(value => ({ ...value, zoom: Math.max(0.6, Math.min(1.6, value.zoom - event.deltaY * 0.001)) }))
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])
  const projected = stars.map(star => ({ ...star, ...projectMemoryStar(star, camera.yaw, camera.pitch, camera.zoom) }))
  const center = projectMemoryStar({ x: 0, y: 0, z: 0 }, camera.yaw, camera.pitch, camera.zoom)
  return (
    <section className={css.map} aria-labelledby={`${id}-title`}>
      <header className={css.toolbar}>
        <div><h4 id={`${id}-title`}>{t('starMapTitle')}</h4><p>{t('starMapScope', { count: memories.length })}</p></div>
        <div className={css.controls}>
          <Button size="sm" variant="outline" aria-pressed={rotating && !reduced} disabled={reduced}
            onClick={() => setRotating(value => !value)}>{t(rotating && !reduced ? 'starMapPause' : 'starMapRotate')}</Button>
          <Button size="sm" variant="outline" onClick={() => setCamera({ yaw: 0, pitch: -0.35, zoom: 1 })}>{t('starMapReset')}</Button>
        </div>
      </header>
      <div className={css.stage}>
        <svg ref={svg} viewBox="0 0 800 480" className={css.scene} role="group" aria-label={t('starMapTitle')}
          aria-describedby={`${id}-hint`}
          onFocusCapture={() => setRotating(false)}
          onPointerDown={(event) => {
            setRotating(false)
            if (event.button !== 0) return
            drag.current = { x: event.clientX, y: event.clientY, moved: false }
          }}
          onPointerMove={(event) => {
            const previous = drag.current
            if (previous === undefined) return
            const dx = event.clientX - previous.x
            const dy = event.clientY - previous.y
            if (!previous.moved && Math.abs(dx) + Math.abs(dy) < 5) return
            if (!previous.moved) event.currentTarget.setPointerCapture(event.pointerId)
            drag.current = { x: event.clientX, y: event.clientY, moved: true }
            setCamera(value => ({ ...value, yaw: value.yaw + dx * 0.008,
              pitch: Math.max(-1.2, Math.min(1.2, value.pitch + dy * 0.008)) }))
          }}
          onPointerUp={(event) => {
            // Retain the drag flag until the following click has been dispatched.
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          }}
          onClick={() => { drag.current = undefined }}
          onPointerCancel={() => { drag.current = undefined }}
          onPointerLeave={(event) => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) drag.current = undefined }}>
          <defs>
            <radialGradient id={`${id}-halo`}><stop stopColor="#7ba8ff" stopOpacity="0.24"/><stop offset="1" stopColor="#7ba8ff" stopOpacity="0"/></radialGradient>
          </defs>
          <circle cx="400" cy="240" r="220" fill={`url(#${id}-halo)`}/>
          <ellipse cx="400" cy="240" rx={260 * camera.zoom} ry={62 * camera.zoom} className={css.orbit}/>
          <ellipse cx="400" cy="240" rx={195 * camera.zoom} ry={125 * camera.zoom} className={css.orbit}/>
          {projected.map((star) => {
            const parent = star.memory === undefined ? center : projected.find(item => item.id === star.category)
            if (parent === undefined) return null
            return <line key={star.id} x1={parent.x} y1={parent.y} x2={star.x} y2={star.y}
              className={`${css.link} ${css[star.category]}`} opacity={star.id === selected ? 0.9 : 0.24}/>
          })}
          <circle cx={center.x} cy={center.y} r="24" className={css.coreHalo}/>
          <circle cx={center.x} cy={center.y} r="9" className={css.core}/>
          <text x={center.x} y={center.y + 35} className={css.coreLabel}>{name}</text>
          {[...projected].sort((a, b) => b.z - a.z).map((star) => {
            const memory = star.memory
            const radius = memory === undefined ? 8 : 3 + memory.importance * 5
            const label = memory === undefined ? t(`category.${star.category}`) : memory.summary ?? memory.content
            return <g key={star.id} className={`${css.star} ${css[star.category]}`} transform={`translate(${star.x} ${star.y})`}
              role="button" tabIndex={0}
              aria-label={memory === undefined ? t('starMapSearchCategory', { category: label }) : label}
              aria-pressed={memory === undefined ? category === star.category : selected === memory.id}
              onClick={() => {
                if (drag.current?.moved) return
                if (memory === undefined) filterCategory?.(star.category)
                else select(memory.id)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  if (memory === undefined) filterCategory?.(star.category)
                  else select(memory.id)
                }
              }}>
              <title>{label}</title>
              <circle r={Math.max(15, radius * star.scale + 6)} className={css.hit}/>
              <circle r={radius * star.scale * 2.4} className={css.glow}/>
              <circle r={radius * star.scale} className={css.dot} opacity={memory === undefined ? 1 : 0.65 + memory.importance * 0.3}/>
              {selected === star.id ? <circle r={radius * star.scale + 6} className={css.selection}/> : null}
              {memory === undefined ? <text y="-17" className={css.label}>{label}</text> : null}
            </g>
          })}
        </svg>
        <div className={css.legend}>{memoryClusters.map(cluster => <button key={cluster} type="button" className={css[cluster]} aria-pressed={cluster === category}
          onClick={() => filterCategory?.(cluster)}><i/>{t(`category.${cluster}`)}<span>{memories.filter(memory => memory.category === cluster).length}</span>
        </button>)}</div>
      </div>
      <footer className={css.footer}>
        <p id={`${id}-hint`}>{t('starMapHint')}</p>
        <label htmlFor={`${id}-zoom`}>{t('starMapZoom')}</label>
        <input id={`${id}-zoom`} type="range" min="0.6" max="1.6" step="0.05" value={camera.zoom}
          onChange={event => setCamera(value => ({ ...value, zoom: Number(event.target.value) }))}/>
      </footer>
      <div className={css.picker}>
        <label htmlFor={`${id}-memory`}>{t('starMapSelect')}</label>
        <select id={`${id}-memory`} value={memories.some(memory => memory.id === selected) ? selected : ''}
          onChange={(event) => { const memory = memories.find(item => item.id === event.target.value); if (memory) select(memory.id) }}>
          <option value="" disabled>{t('starMapSelectHint')}</option>
          {memories.map(memory => <option key={memory.id} value={memory.id}>{memory.summary ?? memory.content}</option>)}
        </select>
        {selected === undefined || findRelated === undefined || !memories.some(memory => memory.id === selected) ? null : (
          <Button size="sm" variant="outline" onClick={() => {
            const memory = memories.find(item => item.id === selected)
            if (memory !== undefined) findRelated(memory.id)
          }}>{t('starMapFindRelated')}</Button>
        )}
      </div>
    </section>
  )
}
