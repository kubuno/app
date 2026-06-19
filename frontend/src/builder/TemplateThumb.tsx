import { useLayoutEffect, useRef, useState } from 'react'
import { resolveIcon } from '../elements/icons'
import type { Element, Page } from '../types'
import { asCss, elementCss } from '../elements/style'
import { renderWidget } from '../elements/widgets'
import { describeDyn } from '../binding'

// Aperçu statique (non interactif) d'une page, réduit pour servir de vignette de
// modèle. La page est rendue à une largeur virtuelle fixe puis mise à l'échelle
// (transform) pour remplir la largeur de la vignette.

const VIRTUAL_W = 1024

function StaticNode({ el }: { el: Element }) {
  const custom = renderWidget(el, false)
  if (custom !== undefined) return custom
  const css = asCss(el.style)
  switch (el.type) {
    case 'page':
    case 'container':
    case 'link':
    case 'repeatingGroup':
      return <div style={elementCss(el)}>{(el.children ?? []).map((c) => <StaticNode key={c.id} el={c} />)}</div>
    case 'heading': {
      const level = (el.props.level as string) || 'h2'
      const Tag = (['h1', 'h2', 'h3'].includes(level) ? level : 'h2') as 'h1' | 'h2' | 'h3'
      return <Tag style={css}>{describeDyn(el.props.text)}</Tag>
    }
    case 'text':   return <div style={css}>{describeDyn(el.props.text)}</div>
    case 'button': return <button type="button" style={css} disabled>{describeDyn(el.props.label)}</button>
    case 'input':  return <input style={css} placeholder={describeDyn(el.props.placeholder)} disabled />
    case 'textarea': return <textarea style={css} placeholder={describeDyn(el.props.placeholder)} disabled />
    case 'select': return <select style={css} disabled>{((el.props.options as string[]) || []).map((o, i) => <option key={i}>{o}</option>)}</select>
    case 'checkbox': return <label style={css}><input type="checkbox" disabled /> {describeDyn(el.props.label)}</label>
    case 'image': {
      const src = (el.props.src as { v?: string })?.v || (typeof el.props.src === 'string' ? el.props.src : '')
      return src ? <img src={src} alt="" style={css} /> : <div style={{ ...css, display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 12 }}>Image</div>
    }
    case 'divider': return <div style={css} />
    case 'icon': {
      const Ico = resolveIcon((el.props.icon as string) || 'Star')
      return <span style={css}>{Ico ? <Ico size={(el.style.fontSize as number) || 24} /> : null}</span>
    }
    default: return null
  }
}

export function TemplateThumb({ page, width = VIRTUAL_W }: { page: Page; width?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.25)
  useLayoutEffect(() => {
    const measure = () => { const w = ref.current?.offsetWidth ?? 256; setScale(w / width) }
    measure()
    const ro = new ResizeObserver(measure)
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [width])
  return (
    <div ref={ref} className="h-full w-full overflow-hidden">
      <div style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
        <StaticNode el={page.root} />
      </div>
    </div>
  )
}
