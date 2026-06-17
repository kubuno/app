import { createContext, useContext, useState, type ReactNode } from 'react'
import { MenuDropdown, type MenuItem, type MenuDropdownPos } from '@ui'
import { prompt } from '@kubuno/sdk'
import {
  Copy, ClipboardCopy, Scissors, ClipboardPaste, ArrowUp, ArrowDown,
  BringToFront, SendToBack, Group, Trash2, Plus, Layout, Zap, Image as ImageIcon,
  AlignLeft, AlignCenter, AlignRight, Heading as HeadingIcon, Database, Link2, Settings, Undo2, Redo2, Eraser,
} from 'lucide-react'
import { useBuilder, currentPage, findEl, isContainerType } from '../store'
import { PALETTE, CATEGORIES, paletteItem } from '../elements/palette'
import type { Element } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Menu contextuel (clic droit) de la zone de travail. Riche et variable selon le
// type d'objet ; un menu distinct pour l'espace vide (page / autour des objets).
// ─────────────────────────────────────────────────────────────────────────────

interface MenuState { pos: MenuDropdownPos; elId: string | null }
const Ctx = createContext<{ open: (e: React.MouseEvent, elId: string | null) => void }>({ open: () => {} })
export const useCanvasMenu = () => useContext(Ctx)

export function CanvasMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const def = useBuilder((s) => s.def)
  const page = useBuilder(currentPage)
  const clipboard = useBuilder((s) => s.clipboard)
  const select = useBuilder((s) => s.select)

  const open = (e: React.MouseEvent, elId: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    if (elId) select(elId)
    setMenu({ pos: { top: e.clientY, left: e.clientX, minWidth: 230 }, elId })
  }

  let items: MenuItem[] = []
  if (menu && def && page) {
    const found = menu.elId ? findEl(page.root, menu.elId) : null
    items = !found || found.el.type === 'page'
      ? emptyItems(page.root.id, !!clipboard)
      : elementItems(found.el, !!clipboard)
  }

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      {menu && items.length > 0 && (
        <MenuDropdown items={items} pos={menu.pos} onClose={() => setMenu(null)} />
      )}
    </Ctx.Provider>
  )
}

const st = () => useBuilder.getState()

// ── Sous-menu « Ajouter un élément » (palette → catégories → items) ──────────

function addSubmenu(containerId: string): MenuItem {
  return {
    type: 'submenu',
    label: 'Ajouter un élément',
    icon: <Plus size={15} />,
    items: CATEGORIES.map((cat) => ({
      type: 'submenu' as const,
      label: cat.label,
      items: PALETTE.filter((p) => p.category === cat.id).map((p) => ({
        type: 'action' as const,
        label: p.label,
        icon: <p.Icon size={14} />,
        onClick: () => st().addElement(p.type, containerId),
      })),
    })),
  }
}

function layoutSubmenu(el: Element): MenuItem {
  const set = (type: 'column' | 'row' | 'free') =>
    st().updateElement(el.id, { layout: { ...el.layout, type } })
  const cur = el.layout?.type ?? 'column'
  return {
    type: 'submenu', label: 'Disposition', icon: <Layout size={15} />,
    items: [
      { type: 'action', label: 'Colonne (vertical)', checked: cur === 'column', onClick: () => set('column') },
      { type: 'action', label: 'Ligne (horizontal)', checked: cur === 'row', onClick: () => set('row') },
      { type: 'action', label: 'Libre', checked: cur === 'free', onClick: () => set('free') },
    ],
  }
}

function alignSubmenu(el: Element): MenuItem {
  const set = (v: string) => st().updateElement(el.id, { style: { ...el.style, textAlign: v } })
  return {
    type: 'submenu', label: 'Alignement du texte', icon: <AlignLeft size={15} />,
    items: [
      { type: 'action', label: 'Gauche', icon: <AlignLeft size={14} />, onClick: () => set('left') },
      { type: 'action', label: 'Centré', icon: <AlignCenter size={14} />, onClick: () => set('center') },
      { type: 'action', label: 'Droite', icon: <AlignRight size={14} />, onClick: () => set('right') },
    ],
  }
}

function setProp(el: Element, key: string, value: unknown) {
  st().updateElement(el.id, { props: { ...el.props, [key]: value } })
}
function appendProp(el: Element, key: string, value: unknown) {
  const arr = Array.isArray(el.props[key]) ? (el.props[key] as unknown[]) : []
  setProp(el, key, [...arr, value])
}

// ── Actions spécifiques au TYPE d'objet ──────────────────────────────────────

function typeSpecific(el: Element): MenuItem[] {
  const out: MenuItem[] = []
  switch (el.type) {
    case 'container':
      out.push(addSubmenu(el.id), layoutSubmenu(el))
      out.push({ type: 'action', label: 'Vider le conteneur', icon: <Eraser size={15} />, onClick: () => st().updateElement(el.id, { children: [] }) })
      break
    case 'repeatingGroup': {
      out.push(addSubmenu(el.id), layoutSubmenu(el))
      const dts = st().def?.dataTypes ?? []
      const src = (el.props.source as { dataType?: string }) || {}
      out.push({
        type: 'submenu', label: 'Type de données', icon: <Database size={15} />,
        items: dts.length
          ? dts.map((d) => ({ type: 'action' as const, label: d.name, checked: src.dataType === d.name, onClick: () => setProp(el, 'source', { ...src, dataType: d.name }) }))
          : [{ type: 'action', label: '(créez un type dans Données)', disabled: true, onClick: () => {} }],
      })
      break
    }
    case 'link': {
      const pages = st().def?.pages ?? []
      out.push({
        type: 'submenu', label: 'Page cible', icon: <Link2 size={15} />,
        items: pages.map((p) => ({ type: 'action' as const, label: p.name, checked: el.props.targetPage === p.id, onClick: () => setProp(el, 'targetPage', p.id) })),
      })
      out.push(layoutSubmenu(el))
      break
    }
    case 'heading': {
      const cur = (el.props.level as string) || 'h2'
      out.push({
        type: 'submenu', label: 'Niveau de titre', icon: <HeadingIcon size={15} />,
        items: (['h1', 'h2', 'h3'] as const).map((lv) => ({ type: 'action' as const, label: lv.toUpperCase(), checked: cur === lv, onClick: () => setProp(el, 'level', lv) })),
      })
      out.push(alignSubmenu(el))
      break
    }
    case 'text':
      out.push(alignSubmenu(el))
      break
    case 'alert': {
      const cur = (el.props.variant as string) || 'info'
      out.push({
        type: 'submenu', label: 'Type d’alerte', icon: <Layout size={15} />,
        items: ([['info', 'Info'], ['success', 'Succès'], ['warning', 'Attention'], ['danger', 'Erreur']] as const).map(([v, l]) => ({ type: 'action' as const, label: l, checked: cur === v, onClick: () => setProp(el, 'variant', v) })),
      })
      break
    }
    case 'button':
      out.push({ type: 'action', label: 'Gérer les workflows…', icon: <Zap size={15} />, onClick: () => st().setLeftTab('workflows') })
      break
    case 'image':
    case 'imageBox':
      out.push({
        type: 'action', label: 'Remplacer l’image…', icon: <ImageIcon size={15} />,
        onClick: () => { prompt({ title: 'URL de l’image', placeholder: 'https://…', confirmLabel: 'Valider' }).then((url) => { if (url) setProp(el, el.type === 'image' ? 'src' : 'src', el.type === 'image' ? { t: 'static', v: url } : url) }) },
      })
      break
    case 'tabs':
      out.push({ type: 'action', label: 'Ajouter un onglet', icon: <Plus size={15} />, onClick: () => appendProp(el, 'tabs', { a: 'Nouvel onglet', b: 'Contenu' }) })
      break
    case 'accordion':
      out.push({ type: 'action', label: 'Ajouter une section', icon: <Plus size={15} />, onClick: () => appendProp(el, 'items', { a: 'Nouvelle section', b: 'Contenu' }) })
      break
    case 'iconList':
      out.push({ type: 'action', label: 'Ajouter un élément', icon: <Plus size={15} />, onClick: () => appendProp(el, 'items', { a: 'Check', b: 'Nouvel élément' }) })
      break
    case 'socialIcons':
      out.push({ type: 'action', label: 'Ajouter un réseau', icon: <Plus size={15} />, onClick: () => appendProp(el, 'links', { a: 'globe', b: '#' }) })
      break
    case 'list':
      out.push({ type: 'action', label: 'Ajouter une ligne', icon: <Plus size={15} />, onClick: () => appendProp(el, 'items', 'Nouvel élément') })
      break
    case 'priceTable':
      out.push({ type: 'action', label: 'Ajouter une fonction', icon: <Plus size={15} />, onClick: () => appendProp(el, 'features', 'Nouvelle fonction') })
      break
    case 'gallery':
      out.push({ type: 'action', label: 'Ajouter une image…', icon: <ImageIcon size={15} />, onClick: () => { prompt({ title: 'URL de l’image', placeholder: 'https://…', confirmLabel: 'Ajouter' }).then((url) => { if (url) appendProp(el, 'images', url) }) } })
      break
  }
  return out
}

// ── Menu d'un OBJET ──────────────────────────────────────────────────────────

function elementItems(el: Element, hasClipboard: boolean): MenuItem[] {
  const label = paletteItem(el.type)?.label ?? el.type
  const cont = isContainerType(el.type)
  const specific = typeSpecific(el)
  const items: MenuItem[] = [{ type: 'label', text: `${label} · ${el.name}` }]

  if (specific.length) { items.push({ type: 'separator' }, ...specific) }
  items.push(
    { type: 'separator' },
    { type: 'action', label: 'Dupliquer', shortcut: 'Ctrl+D', icon: <Copy size={15} />, onClick: () => st().duplicateElement(el.id) },
    { type: 'action', label: 'Copier', shortcut: 'Ctrl+C', icon: <ClipboardCopy size={15} />, onClick: () => st().copyElement(el.id) },
    { type: 'action', label: 'Couper', shortcut: 'Ctrl+X', icon: <Scissors size={15} />, onClick: () => st().cutElement(el.id) },
  )
  if (hasClipboard && cont) items.push({ type: 'action', label: 'Coller dedans', icon: <ClipboardPaste size={15} />, onClick: () => st().pasteInto(el.id) })
  if (hasClipboard) items.push({ type: 'action', label: 'Coller après', icon: <ClipboardPaste size={15} />, onClick: () => st().pasteAfter(el.id) })

  items.push(
    { type: 'separator' },
    { type: 'action', label: 'Monter', icon: <ArrowUp size={15} />, onClick: () => st().moveElement(el.id, -1) },
    { type: 'action', label: 'Descendre', icon: <ArrowDown size={15} />, onClick: () => st().moveElement(el.id, 1) },
    { type: 'action', label: 'Premier plan', icon: <BringToFront size={15} />, onClick: () => st().reorderEdge(el.id, 'front') },
    { type: 'action', label: 'Arrière-plan', icon: <SendToBack size={15} />, onClick: () => st().reorderEdge(el.id, 'back') },
    { type: 'separator' },
    { type: 'action', label: 'Encapsuler dans un conteneur', icon: <Group size={15} />, onClick: () => st().wrapInContainer(el.id) },
    { type: 'separator' },
    { type: 'action', label: 'Supprimer', shortcut: 'Suppr', danger: true, icon: <Trash2 size={15} />, onClick: () => st().deleteElement(el.id) },
  )
  return items
}

// ── Menu de l'ESPACE VIDE (page / autour des objets) ─────────────────────────

function emptyItems(pageRootId: string, hasClipboard: boolean): MenuItem[] {
  const items: MenuItem[] = [
    { type: 'label', text: 'Page' },
    { type: 'separator' },
    addSubmenu(pageRootId),
  ]
  if (hasClipboard) items.push({ type: 'action', label: 'Coller', icon: <ClipboardPaste size={15} />, onClick: () => st().pasteInto(pageRootId) })
  items.push(
    { type: 'separator' },
    { type: 'action', label: 'Annuler', shortcut: 'Ctrl+Z', icon: <Undo2 size={15} />, onClick: () => st().undo() },
    { type: 'action', label: 'Rétablir', shortcut: 'Ctrl+Y', icon: <Redo2 size={15} />, onClick: () => st().redo() },
    { type: 'separator' },
    { type: 'action', label: 'Réglages de la page…', icon: <Settings size={15} />, onClick: () => st().setLeftTab('settings') },
  )
  return items
}
