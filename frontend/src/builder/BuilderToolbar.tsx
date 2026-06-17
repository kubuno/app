import {
  AlignLeft, AlignCenter, AlignRight, Bold, Plus, Minus, Copy, ArrowUp, ArrowDown,
  Trash2, Columns2, Rows2, Type, Heading, MousePointerClick, Image as ImageIcon, Square,
} from 'lucide-react'
import { useBuilder, currentPage, findEl, isContainerType } from '../store'
import { paletteItem } from '../elements/palette'
import type { Element, ElementType } from '../types'

// Toolbar contextuelle (options bar du WorkspaceShell) : varie selon l'objet
// sélectionné — alignement/taille/graisse/couleur du texte, sens de disposition
// des conteneurs, et actions rapides (dupliquer/monter/descendre/supprimer).
// Sans sélection : insertion rapide des éléments courants dans la page.

const st = () => useBuilder.getState()

function TBtn({ on, active, title, children }: { on: () => void; active?: boolean; title: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={on} title={title}
      className={`flex h-7 items-center justify-center rounded px-1.5 ${active ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-surface-2'}`}>
      {children}
    </button>
  )
}
const Sep = () => <div className="mx-1 h-5 w-px bg-border" />

function parsePx(v: unknown, fb: number): number {
  const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : fb
}

export default function BuilderToolbar() {
  const page = useBuilder(currentPage)
  const selectedId = useBuilder((s) => s.selectedId)
  const found = page && selectedId ? findEl(page.root, selectedId) : null
  const el = found?.el

  // ── Sans sélection : insertion rapide ──
  if (!el) {
    const insert = (type: ElementType) => { if (page) st().addElement(type, page.root.id) }
    const quick: [ElementType, string, React.ReactNode][] = [
      ['heading', 'Titre', <Heading size={15} key="h" />],
      ['text', 'Texte', <Type size={15} key="t" />],
      ['button', 'Bouton', <MousePointerClick size={15} key="b" />],
      ['image', 'Image', <ImageIcon size={15} key="i" />],
      ['container', 'Conteneur', <Square size={15} key="c" />],
    ]
    return (
      <div className="flex items-center gap-1">
        <span className="mr-1 text-[11px] text-text-tertiary">Insérer :</span>
        {quick.map(([type, label, icon]) => (
          <button key={type} type="button" onClick={() => insert(type)} title={label}
            className="flex h-7 items-center gap-1 rounded px-2 text-[11px] text-text-secondary hover:bg-surface-2">
            {icon}{label}
          </button>
        ))}
      </div>
    )
  }

  return <ElementToolbar el={el} />
}

function ElementToolbar({ el }: { el: Element }) {
  const setStyle = (k: string, v: string | undefined) => {
    const style = { ...el.style }
    if (v == null || v === '') delete style[k]; else style[k] = v
    st().updateElement(el.id, { style })
  }
  const setLayout = (type: 'column' | 'row' | 'free') => st().updateElement(el.id, { layout: { ...el.layout, type } })

  const isText = ['heading', 'text', 'button'].includes(el.type)
  const align = String(el.style.textAlign ?? 'left')
  const size = parsePx(el.style.fontSize, 15)
  const bold = String(el.style.fontWeight ?? '') === '700'
  const layoutType = el.layout?.type ?? 'column'

  return (
    <div className="flex w-full items-center gap-1.5">
      <span className="text-[11px] font-medium text-text-primary">{paletteItem(el.type)?.label ?? el.type}</span>
      <span className="text-[11px] text-text-tertiary">· {el.name}</span>
      <Sep />

      {isText && (
        <>
          <TBtn title="Aligner à gauche" active={align === 'left'} on={() => setStyle('textAlign', 'left')}><AlignLeft size={15} /></TBtn>
          <TBtn title="Centrer" active={align === 'center'} on={() => setStyle('textAlign', 'center')}><AlignCenter size={15} /></TBtn>
          <TBtn title="Aligner à droite" active={align === 'right'} on={() => setStyle('textAlign', 'right')}><AlignRight size={15} /></TBtn>
          <Sep />
          <TBtn title="Réduire la taille" on={() => setStyle('fontSize', `${Math.max(8, size - 2)}px`)}><Minus size={14} /></TBtn>
          <span className="w-9 text-center text-[11px] text-text-secondary">{size}px</span>
          <TBtn title="Augmenter la taille" on={() => setStyle('fontSize', `${size + 2}px`)}><Plus size={14} /></TBtn>
          <TBtn title="Gras" active={bold} on={() => setStyle('fontWeight', bold ? '400' : '700')}><Bold size={15} /></TBtn>
          <Sep />
          <label className="flex h-7 cursor-pointer items-center" title="Couleur du texte">
            <input type="color" value={toHex(String(el.style.color ?? '#000000'))}
              onChange={(e) => setStyle('color', e.target.value)}
              className="h-5 w-6 cursor-pointer rounded border border-border bg-transparent p-0" />
          </label>
        </>
      )}

      {isContainerType(el.type) && (
        <>
          <TBtn title="Disposition en colonne" active={layoutType === 'column'} on={() => setLayout('column')}><Rows2 size={15} /></TBtn>
          <TBtn title="Disposition en ligne" active={layoutType === 'row'} on={() => setLayout('row')}><Columns2 size={15} /></TBtn>
        </>
      )}

      <div className="ml-auto flex items-center gap-0.5">
        <TBtn title="Dupliquer" on={() => st().duplicateElement(el.id)}><Copy size={15} /></TBtn>
        <TBtn title="Monter" on={() => st().moveElement(el.id, -1)}><ArrowUp size={15} /></TBtn>
        <TBtn title="Descendre" on={() => st().moveElement(el.id, 1)}><ArrowDown size={15} /></TBtn>
        <button type="button" onClick={() => st().deleteElement(el.id)} title="Supprimer"
          className="flex h-7 items-center justify-center rounded px-1.5 text-danger hover:bg-danger/10">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

function toHex(v: string): string {
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000'
}
