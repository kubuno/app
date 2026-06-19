import { useState, useRef, useLayoutEffect } from 'react'
import { resolveIcon } from '../elements/icons'
import type { Element, ElementType } from '../types'
import { useBuilder, currentPage, isContainerType } from '../store'
import { describeDyn } from '../binding'
import { elementCss, asCss, deviceWidth } from '../elements/style'
import { renderWidget } from '../elements/widgets'
import { CanvasMenuProvider, useCanvasMenu } from './CanvasMenu'

export const DRAG_MIME = 'application/x-app-element'

/** Zone d'édition visuelle : rend la page courante en mode édition (sélection +
 *  drop depuis la palette + menu contextuel objets/espace vide). */
export default function Canvas() {
  const def = useBuilder((s) => s.def)
  const page = useBuilder(currentPage)
  if (!def || !page) return null
  return (
    <CanvasMenuProvider>
      <CanvasSurface />
    </CanvasMenuProvider>
  )
}

function CanvasSurface() {
  const def = useBuilder((s) => s.def)
  const page = useBuilder(currentPage)
  const device = useBuilder((s) => s.device)
  const zoom = useBuilder((s) => s.canvasZoom)
  const setCanvasZoom = useBuilder((s) => s.setCanvasZoom)
  const select = useBuilder((s) => s.select)
  const { open } = useCanvasMenu()
  if (!def || !page) return null

  const width = deviceWidth(device)
  // Cadre « téléphone » pour les apps mobiles (et le format mobile des apps web).
  const phone = def.settings?.kind === 'mobile' || device === 'mobile'

  // Ctrl/⌘ + molette → zoomer l'espace de travail.
  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    setCanvasZoom(zoom + (e.deltaY < 0 ? 0.1 : -0.1))
  }

  return (
    <div
      className="flex-1 min-h-0 overflow-auto bg-[var(--app-canvas-bg)] p-8"
      onClick={() => select(null)}
      onContextMenu={(e) => open(e, null)}
      onWheel={onWheel}
      data-testid="app-canvas"
    >
      <div
        className="mx-auto bg-white shadow-xl transition-all"
        style={{
          width,
          minHeight: 600,
          borderRadius: phone ? 32 : 4,
          padding: phone ? 10 : 0,
          background: phone ? '#0f172a' : undefined,
          zoom,   // zoom CSS : scale layout-aware → scroll & centrage natifs
        }}
      >
        <div style={{ borderRadius: phone ? 24 : 4, overflow: 'hidden', background: '#fff', minHeight: phone ? 580 : 600 }}>
          <EditNode el={page.root} />
        </div>
      </div>
    </div>
  )
}

function EditNode({ el }: { el: Element }) {
  const selectedId = useBuilder((s) => s.selectedId)
  const select = useBuilder((s) => s.select)
  const addElement = useBuilder((s) => s.addElement)
  const { open } = useCanvasMenu()
  const [dropHover, setDropHover] = useState(false)
  const [hover, setHover] = useState(false)
  const selected = selectedId === el.id
  const container = isContainerType(el.type)

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    select(el.id)
  }
  const onCtx = (e: React.MouseEvent) => open(e, el.id)
  // Survol : on isole l'élément LE PLUS PROFOND (stopPropagation) → liseré clair
  // indiquant précisément la cible de sélection.
  const hoverHandlers = {
    onMouseOver: (e: React.MouseEvent) => { e.stopPropagation(); setHover(true) },
    onMouseOut:  (e: React.MouseEvent) => { e.stopPropagation(); setHover(false) },
  }

  // Liseré qui ÉPOUSE la forme réelle de la feuille (taille + border-radius mesurés
  // sur l'élément rendu), au lieu d'un rectangle plein-largeur sur le wrapper.
  const zoom = useBuilder((s) => s.canvasZoom)
  const contentRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number; radius: string } | null>(null)
  const showOutline = (selected || hover) && !container
  useLayoutEffect(() => {
    if (!showOutline || !contentRef.current) { return }
    const node = contentRef.current.firstElementChild as HTMLElement | null
    const host = contentRef.current.parentElement
    if (!node || !host) return
    const nr = node.getBoundingClientRect(), hr = host.getBoundingClientRect()
    // getBoundingClientRect renvoie des px VISUELS (le canvas applique `zoom` CSS) ;
    // l'overlay vit dans le même contexte zoomé → on divise pour retomber en px locaux.
    const z = zoom || 1
    setBox({ top: (nr.top - hr.top) / z, left: (nr.left - hr.left) / z, width: nr.width / z, height: nr.height / z, radius: getComputedStyle(node).borderRadius })
  }, [showOutline, el, zoom])

  const dropHandlers = container
    ? {
        onDragOver: (e: React.DragEvent) => {
          if (e.dataTransfer.types.includes(DRAG_MIME)) {
            e.preventDefault()
            e.stopPropagation()
            setDropHover(true)
          }
        },
        onDragLeave: () => setDropHover(false),
        onDrop: (e: React.DragEvent) => {
          const type = e.dataTransfer.getData(DRAG_MIME) as ElementType
          if (type) {
            e.preventDefault()
            e.stopPropagation()
            setDropHover(false)
            addElement(type, el.id)
          }
        },
      }
    : {}

  const outline = selected
    ? '0 0 0 2px #2563eb'
    : dropHover
      ? '0 0 0 2px #22c55e inset'
      : hover
        ? '0 0 0 3px rgba(37,99,235,0.6)'
        : undefined

  const style = {
    ...elementCss(el),
    boxShadow: outline ? `${outline}${el.style.boxShadow ? `, ${el.style.boxShadow}` : ''}` : el.style.boxShadow as string | undefined,
    position: 'relative' as const,
    outline: selected ? 'none' : undefined,
  }

  // Élément avec enfants (conteneur, page, lien, repeating group)
  if (container) {
    const kids = el.children ?? []
    const isRG = el.type === 'repeatingGroup'
    return (
      <div style={style} onClick={onClick} onContextMenu={onCtx} {...hoverHandlers} {...dropHandlers} data-el-id={el.id} data-el-type={el.type}>
        {isRG && (
          <div className="pointer-events-none absolute -top-5 left-0 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
            Liste · {(el.props.source as { dataType?: string })?.dataType || '—'}
          </div>
        )}
        {kids.length === 0 ? (
          <div className="pointer-events-none flex min-h-[60px] items-center justify-center rounded border-2 border-dashed border-slate-300 text-xs text-slate-400">
            {isRG ? 'Cellule (gabarit) — déposez ici' : 'Déposez un élément ici'}
          </div>
        ) : (
          kids.map((k) => <EditNode key={k.id} el={k} />)
        )}
        {isRG && kids.length > 0 && (
          <div className="pointer-events-none rounded border border-dashed border-violet-200 p-2 opacity-40">
            {kids.map((k) => <EditNode key={`ghost-${k.id}`} el={k} />)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}
         onClick={onClick} onContextMenu={onCtx} {...hoverHandlers} data-el-id={el.id} data-el-type={el.type}>
      {/* Contenu RENDU non interactif (pointer-events:none) : les boutons/champs
          `disabled` et les boutons internes des widgets n'avalent plus le clic →
          tout clic atteint le wrapper et la sélection est précise (même dans un
          conteneur). Le wrapper, lui, reste cliquable. */}
      <div ref={contentRef} style={{ pointerEvents: 'none' }}>
        <Leaf el={el} />
      </div>
      {/* Liseré épousant la forme mesurée (taille + coins arrondis). */}
      {showOutline && box && (
        <div className="pointer-events-none absolute z-10"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height, borderRadius: box.radius,
                   boxShadow: selected ? '0 0 0 2px #2563eb' : '0 0 0 3px rgba(37,99,235,0.6)' }} />
      )}
    </div>
  )
}

/** Rend un élément feuille en mode édition (aperçu statique, non interactif). */
function Leaf({ el }: { el: Element }) {
  const css = asCss(el.style)
  // Widgets riches (façon Elementor) : rendu partagé builder/runtime.
  const custom = renderWidget(el, false)
  if (custom !== undefined) return custom
  switch (el.type) {
    case 'heading': {
      const level = (el.props.level as string) || 'h2'
      const Tag = (['h1', 'h2', 'h3'].includes(level) ? level : 'h2') as 'h1' | 'h2' | 'h3'
      return <Tag style={css}>{describeDyn(el.props.text)}</Tag>
    }
    case 'text':
      return <div style={css}>{describeDyn(el.props.text)}</div>
    case 'button':
      return <button type="button" style={css} disabled>{describeDyn(el.props.label)}</button>
    case 'input':
      return <input style={css} placeholder={describeDyn(el.props.placeholder)} disabled />
    case 'textarea':
      return <textarea style={css} placeholder={describeDyn(el.props.placeholder)} disabled />
    case 'select':
      return (
        <select style={css} disabled>
          {((el.props.options as string[]) || []).map((o, i) => <option key={i}>{o}</option>)}
        </select>
      )
    case 'checkbox':
      return <label style={css}><input type="checkbox" disabled /> {describeDyn(el.props.label)}</label>
    case 'image': {
      const src = (el.props.src as { v?: string })?.v || (typeof el.props.src === 'string' ? el.props.src : '')
      return src
        ? <img src={src} alt={(el.props.alt as string) || ''} style={css} />
        : <div style={{ ...css, display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 12 }}>Image</div>
    }
    case 'divider':
      return <div style={css} />
    case 'icon': {
      const Ico = resolveIcon((el.props.icon as string) || 'Star')
      return <span style={css}>{Ico ? <Ico size={(el.style.fontSize as number) || 24} /> : null}</span>
    }
    default:
      return <div style={css}>{el.name}</div>
  }
}
