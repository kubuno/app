import { useState, useRef, useLayoutEffect } from 'react'
import { ChevronUp, ChevronDown, Copy, Trash2, Group, ChevronRight } from 'lucide-react'
import { resolveIcon } from '../elements/icons'
import type { Element, ElementType } from '../types'
import { useBuilder, currentPage, isContainerType } from '../store'
import { describeDyn } from '../binding'
import { elementCss, asCss, deviceWidth } from '../elements/style'
import { renderWidget } from '../elements/widgets'
import { CanvasMenuProvider, useCanvasMenu } from './CanvasMenu'
import { useCollabAwareness } from '../collab/CollabContext'
import { RemoteCollab } from './RemoteCollab'
import { useCtrlWheelZoom } from './useCtrlWheelZoom'

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
  const select = useBuilder((s) => s.select)
  const { open } = useCanvasMenu()
  const awareness = useCollabAwareness()
  // Page-content frame (white page) — shared coordinate reference for collab cursors.
  const frameRef = useRef<HTMLDivElement>(null)
  const lastPub = useRef(0)
  // Ctrl/⌘ + molette → zoomer l'espace de travail (listener natif non passif :
  // indispensable pour empêcher le zoom de page du navigateur).
  const scrollRef = useCtrlWheelZoom<HTMLDivElement>(
    () => useBuilder.getState().canvasZoom,
    (z) => useBuilder.getState().setCanvasZoom(z),
    { min: 0.25, max: 3 },
  )
  if (!def || !page) return null

  const width = deviceWidth(device)
  // Cadre « téléphone » pour les apps mobiles (et le format mobile des apps web).
  const phone = def.settings?.kind === 'mobile' || device === 'mobile'

  // Publish the local mouse position in unzoomed page-content coordinates (relative
  // to the page frame) → collaborators render it via RemoteCursors (throttled ~40ms).
  const onMouseMove = (e: React.MouseEvent) => {
    if (!awareness || !frameRef.current) return
    const now = performance.now()
    if (now - lastPub.current < 40) return
    lastPub.current = now
    const r = frameRef.current.getBoundingClientRect()
    const z = zoom || 1
    awareness.setLocalStateField('cursor', { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z, page: page.id })
  }
  const onMouseLeave = () => { if (awareness) awareness.setLocalStateField('cursor', null) }

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-auto bg-[var(--app-canvas-bg)] p-8"
      onClick={() => select(null)}
      onContextMenu={(e) => open(e, null)}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
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
        <div ref={frameRef} style={{ position: 'relative', borderRadius: phone ? 24 : 4, overflow: 'hidden', background: '#fff', minHeight: phone ? 580 : 600 }}>
          <EditNode el={page.root} />
          {awareness && <RemoteCollab awareness={awareness} pageId={page.id} zoom={zoom} frameRef={frameRef} />}
        </div>
      </div>
      {/* Fil d'Ariane de la sélection : naviguer vers les conteneurs parents */}
      <SelectionBreadcrumb />
    </div>
  )
}

/** Fil d'Ariane de l'élément sélectionné (façon Webflow) : chaque ancêtre est
 *  cliquable — le moyen le plus simple d'atteindre un conteneur parent. */
function SelectionBreadcrumb() {
  const page = useBuilder(currentPage)
  const selectedId = useBuilder((s) => s.selectedId)
  const select = useBuilder((s) => s.select)
  if (!page || !selectedId) return null
  const path: Element[] = []
  const walk = (e: Element, acc: Element[]): boolean => {
    const next = [...acc, e]
    if (e.id === selectedId) { path.push(...next); return true }
    return (e.children ?? []).some((c) => walk(c, next))
  }
  walk(page.root, [])
  if (path.length === 0) return null
  return (
    <div className="sticky bottom-2 z-20 mt-3 flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-slate-200 bg-white/95 px-2 py-1 text-[11px] shadow-lg backdrop-blur"
      onClick={(e) => e.stopPropagation()}>
      {path.map((e, i) => (
        <span key={e.id} className="flex shrink-0 items-center gap-0.5">
          {i > 0 && <ChevronRight size={10} className="text-slate-300" />}
          <button type="button" onClick={() => select(e.id)}
            className={`rounded px-1.5 py-0.5 ${e.id === selectedId ? 'bg-blue-100 font-medium text-blue-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
            {e.type === 'page' ? page.name : e.name}
          </button>
        </span>
      ))}
    </div>
  )
}

/** Prop texte éditable en place par double-clic, selon le type d'élément. */
const INLINE_TEXT_PROP: Record<string, string> = { text: 'text', heading: 'text', button: 'label' }

/** Barre d'actions rapides de l'élément sélectionné (monter/descendre/dupliquer/encapsuler/supprimer). */
function QuickActions({ el }: { el: Element }) {
  const st = () => useBuilder.getState()
  const Btn = ({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) => (
    <button type="button" title={title}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`flex h-5 w-5 items-center justify-center rounded ${danger ? 'hover:bg-red-500' : 'hover:bg-blue-500'}`}>
      {children}
    </button>
  )
  return (
    <div className="absolute -top-6 right-0 z-30 flex items-center gap-0.5 rounded bg-blue-600 px-1 py-0.5 text-white shadow"
      onClick={(e) => e.stopPropagation()}>
      <Btn title="Monter" onClick={() => st().moveElement(el.id, -1)}><ChevronUp size={11} /></Btn>
      <Btn title="Descendre" onClick={() => st().moveElement(el.id, 1)}><ChevronDown size={11} /></Btn>
      <Btn title="Dupliquer (Ctrl+D)" onClick={() => st().duplicateElement(el.id)}><Copy size={11} /></Btn>
      <Btn title="Encapsuler dans un conteneur" onClick={() => st().wrapInContainer(el.id)}><Group size={11} /></Btn>
      <Btn title="Supprimer (Suppr)" danger onClick={() => st().deleteElement(el.id)}><Trash2 size={11} /></Btn>
    </div>
  )
}

function EditNode({ el }: { el: Element }) {
  const selectedId = useBuilder((s) => s.selectedId)
  const select = useBuilder((s) => s.select)
  const addElement = useBuilder((s) => s.addElement)
  const updateElement = useBuilder((s) => s.updateElement)
  const { open } = useCanvasMenu()
  const [dropHover, setDropHover] = useState(false)
  const [hover, setHover] = useState(false)
  const [editText, setEditText] = useState<string | null>(null)
  const selected = selectedId === el.id
  const container = isContainerType(el.type)

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    select(el.id)
  }
  // Double-clic sur un élément textuel → édition en place (si le contenu est statique).
  const textProp = INLINE_TEXT_PROP[el.type]
  const onDblClick = (e: React.MouseEvent) => {
    if (!textProp) return
    const dyn = el.props[textProp] as { t?: string; v?: unknown } | undefined
    if (dyn && dyn.t && dyn.t !== 'static') return // contenu dynamique → passer par l'inspecteur
    e.stopPropagation()
    setEditText(String(dyn?.v ?? ''))
  }
  const commitText = () => {
    if (editText !== null && textProp) updateElement(el.id, { props: { ...el.props, [textProp]: { t: 'static', v: editText } } })
    setEditText(null)
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
    const isPage = el.type === 'page'
    return (
      <div style={style} onClick={onClick} onContextMenu={onCtx} {...hoverHandlers} {...dropHandlers} data-el-id={el.id} data-el-type={el.type}>
        {isRG && (
          <div className="pointer-events-none absolute -top-5 left-0 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
            Liste · {(el.props.source as { dataType?: string })?.dataType || '—'}
          </div>
        )}
        {/* Étiquette de nom + actions rapides du conteneur sélectionné */}
        {!isRG && !isPage && (selected || hover) && (
          <div className="pointer-events-none absolute -top-5 left-0 z-20 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white">{el.name}</div>
        )}
        {selected && !isPage && <QuickActions el={el} />}
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
         onClick={onClick} onDoubleClick={onDblClick} onContextMenu={onCtx} {...hoverHandlers} data-el-id={el.id} data-el-type={el.type}>
      {/* Contenu RENDU non interactif (pointer-events:none) : les boutons/champs
          `disabled` et les boutons internes des widgets n'avalent plus le clic →
          tout clic atteint le wrapper et la sélection est précise (même dans un
          conteneur). Le wrapper, lui, reste cliquable. */}
      <div ref={contentRef} style={{ pointerEvents: 'none', opacity: editText !== null ? 0.15 : undefined }}>
        <Leaf el={el} />
      </div>
      {/* Édition de texte en place (double-clic) */}
      {editText !== null && (
        <input autoFocus value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') setEditText(null) }}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 top-1/2 z-30 -translate-y-1/2 rounded border-2 border-blue-500 bg-white px-2 py-1 text-sm outline-none" />
      )}
      {/* Étiquette de nom (survol / sélection) + actions rapides */}
      {(selected || hover) && editText === null && (
        <div className="pointer-events-none absolute -top-5 left-0 z-20 whitespace-nowrap rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {el.name}{textProp ? ' · 2× clic pour éditer' : ''}
        </div>
      )}
      {selected && editText === null && <QuickActions el={el} />}
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
