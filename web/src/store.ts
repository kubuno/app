// ─────────────────────────────────────────────────────────────────────────────
// Store du builder (zustand). Détient la définition de l'app en édition, la
// sélection, l'historique undo/redo, l'appareil cible et le mode aperçu.
//
// Stratégie de mutation : chaque modification clone la définition entière
// (structuredClone), mute le clone, puis commit() — ce qui empile l'ancien état
// pour l'undo. Simple et robuste pour un arbre imbriqué de taille modérée.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand'
import type {
  AppDefinition, Element, ElementType, Page, DataType, Field, Workflow, Report,
} from './types'

let counter = 0
// Suivi du dernier édit pour coalescer l'historique des modifs rapides (cf. updateElement).
let lastEditKey = ''
let lastEditAt = 0
export function uid(prefix = 'el'): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}${counter}${Math.floor(Math.random() * 1e4).toString(36)}`
}

// ── Helpers d'arbre (purs) ───────────────────────────────────────────────────

export interface Found {
  el: Element
  parent: Element | null
  index: number
}

export function findEl(root: Element, id: string, parent: Element | null = null): Found | null {
  if (root.id === id) return { el: root, parent, index: 0 }
  const kids = root.children ?? []
  for (let i = 0; i < kids.length; i++) {
    if (kids[i].id === id) return { el: kids[i], parent: root, index: i }
    const deep = findEl(kids[i], id, root)
    if (deep) return deep
  }
  return null
}

export function isContainerType(t: ElementType): boolean {
  return t === 'container' || t === 'page' || t === 'repeatingGroup' || t === 'link'
}

/** Clone profond d'un élément en régénérant tous les ids (pour copier/dupliquer). */
export function cloneWithNewIds(el: Element): Element {
  const copy = structuredClone(el)
  const walk = (e: Element) => {
    e.id = uid(e.type)
    ;(e.children ?? []).forEach(walk)
  }
  walk(copy)
  return copy
}

// ── Définitions par défaut des nouveaux éléments ─────────────────────────────

export function makeElement(type: ElementType): Element {
  const id = uid(type)
  const base: Element = { id, type, name: defaultName(type), props: {}, style: {} }
  switch (type) {
    case 'container':
      base.children = []
      base.layout = { type: 'column', gap: '12px', align: 'stretch' }
      base.style = { padding: '16px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }
      break
    case 'heading':
      base.props = { text: { t: 'static', v: 'Titre' }, level: 'h2' }
      base.style = { fontSize: '24px', fontWeight: '700', color: '#0f172a' }
      break
    case 'text':
      base.props = { text: { t: 'static', v: 'Texte' } }
      base.style = { fontSize: '15px', color: '#334155' }
      break
    case 'button':
      base.props = { label: { t: 'static', v: 'Bouton' } }
      base.style = { padding: '10px 18px', background: '#2563eb', color: '#ffffff', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', border: 'none', alignSelf: 'flex-start' }
      break
    case 'input':
      base.props = { placeholder: { t: 'static', v: 'Saisir…' }, inputType: 'text' }
      base.style = { padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', width: '100%' }
      break
    case 'textarea':
      base.props = { placeholder: { t: 'static', v: 'Saisir…' } }
      base.style = { padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', width: '100%', minHeight: '90px' }
      break
    case 'select':
      base.props = { options: ['Option 1', 'Option 2'] }
      base.style = { padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', width: '100%' }
      break
    case 'checkbox':
      base.props = { label: { t: 'static', v: 'Cocher' } }
      base.style = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }
      break
    case 'image':
      base.props = { src: { t: 'static', v: '' }, alt: 'Image' }
      base.style = { width: '160px', height: '120px', objectFit: 'cover', borderRadius: '8px', background: '#e2e8f0' }
      break
    case 'link':
      base.children = []
      base.props = { targetPage: '' }
      base.layout = { type: 'row', gap: '6px', align: 'center' }
      base.style = { color: '#2563eb', textDecoration: 'underline', cursor: 'pointer' }
      break
    case 'divider':
      base.style = { height: '1px', background: '#e2e8f0', margin: '8px 0', width: '100%' }
      break
    case 'icon':
      base.props = { icon: 'Star' }
      base.style = { color: '#2563eb' }
      break
    case 'repeatingGroup':
      base.children = []
      base.props = { source: { t: 'search', dataType: '', sort: { field: '_created_at', desc: true } } }
      base.layout = { type: 'column', gap: '8px', align: 'stretch' }
      base.style = { padding: '0' }
      break

    // ── Widgets riches (façon Elementor) ──
    case 'spacer':
      base.style = { width: '100%', height: '40px' }
      break
    case 'video':
      base.props = { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
      base.style = { width: '100%' }
      break
    case 'audio':
      base.props = { src: '' }
      base.style = { width: '100%' }
      break
    case 'map':
      base.props = { query: 'Paris, France', zoom: 13 }
      base.style = { width: '100%' }
      break
    case 'embed':
      base.props = { html: '<strong>Mon HTML</strong>' }
      base.style = { width: '100%' }
      break
    case 'gallery':
      base.props = { images: [], columns: 3, gap: '8px' }
      base.style = { width: '100%' }
      break
    case 'iconBox':
      base.props = { icon: 'Sparkles', iconSize: 40, iconColor: '#2563eb', title: 'Titre', text: 'Décrivez votre fonctionnalité.', align: 'center' }
      base.style = { padding: '16px' }
      break
    case 'imageBox':
      base.props = { src: '', title: 'Titre', text: 'Décrivez votre contenu.', align: 'center' }
      base.style = { padding: '0', width: '220px' }
      break
    case 'iconList':
      base.props = { items: [{ a: 'Check', b: 'Premier point' }, { a: 'Check', b: 'Deuxième point' }], iconColor: '#2563eb' }
      base.style = {}
      break
    case 'list':
      base.props = { items: ['Premier élément', 'Deuxième élément', 'Troisième élément'], ordered: false }
      base.style = {}
      break
    case 'alert':
      base.props = { variant: 'info', title: 'Note', text: 'Ceci est un message d’information.' }
      base.style = {}
      break
    case 'blockquote':
      base.props = { text: 'La simplicité est la sophistication suprême.', author: 'Léonard de Vinci' }
      base.style = {}
      break
    case 'rating':
      base.props = { value: 4, max: 5, size: 22 }
      base.style = {}
      break
    case 'progress':
      base.props = { value: 70, label: 'Progression', showPercent: true, color: '#2563eb' }
      base.style = { width: '100%' }
      break
    case 'testimonial':
      base.props = { quote: 'Un produit qui a transformé notre façon de travailler.', author: 'Camille Martin', role: 'Directrice produit', avatar: '' }
      base.style = { width: '320px' }
      break
    case 'priceTable':
      base.props = { plan: 'Pro', price: '29€', period: 'mois', features: ['Projets illimités', 'Support prioritaire', 'Exports avancés'], buttonLabel: 'Choisir', featured: false }
      base.style = { width: '260px' }
      break
    case 'cta':
      base.props = { title: 'Prêt à commencer ?', text: 'Lancez votre projet en quelques minutes.', buttonLabel: 'Commencer', align: 'center', background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }
      base.style = { width: '100%' }
      break
    case 'socialIcons':
      base.props = { links: [{ a: 'facebook', b: '#' }, { a: 'twitter', b: '#' }, { a: 'instagram', b: '#' }, { a: 'linkedin', b: '#' }], size: 20, color: '#0f172a' }
      base.style = {}
      break
    case 'tabs':
      base.props = { tabs: [{ a: 'Onglet 1', b: 'Contenu du premier onglet.' }, { a: 'Onglet 2', b: 'Contenu du second onglet.' }] }
      base.style = { width: '100%' }
      break
    case 'accordion':
      base.props = { items: [{ a: 'Question 1', b: 'Réponse à la première question.' }, { a: 'Question 2', b: 'Réponse à la deuxième question.' }] }
      base.style = { width: '100%' }
      break
    case 'counter':
      base.props = { end: 1250, prefix: '', suffix: '+', label: 'Clients satisfaits', duration: 1500 }
      base.style = {}
      break
    case 'countdown':
      base.props = { target: new Date(Date.now() + 3 * 86400000).toISOString() }
      base.style = {}
      break
    case 'flipBox':
      base.props = { frontIcon: 'Rocket', frontTitle: 'Survolez-moi', frontText: 'Recto de la carte', frontBg: '#2563eb', backTitle: 'Verso', backText: 'Contenu caché révélé au survol.', backBg: '#0f172a' }
      base.style = { width: '240px', height: '220px' }
      break

    // ── Lot 2 : data-viz & widgets « réclamés » ──
    case 'chart':
      base.props = { chartType: 'bar', data: 'Jan | 45\nFév | 72\nMar | 58\nAvr | 91', color: '#2563eb', height: 240, showValues: true }
      base.style = { width: '100%' }
      break
    case 'table':
      base.props = { columns: 'Produit | Stock | Prix', rows: 'Clavier | 120 | 49€\nSouris | 80 | 25€\nÉcran | 40 | 199€', striped: true, compact: false }
      base.style = { width: '100%' }
      break
    case 'stat':
      base.props = { label: 'Chiffre d’affaires', value: '24 580 €', delta: '+12,5 %', deltaLabel: 'ce mois', trend: 'up', icon: 'Wallet', iconColor: '#2563eb' }
      base.style = { width: '240px' }
      break
    case 'steps':
      base.props = { steps: 'Compte | Créez votre profil\nProfil | Complétez vos infos\nPaiement | Validez\nTerminé | C’est prêt !', current: 2, accent: '#2563eb' }
      base.style = { width: '100%' }
      break
    case 'timeline':
      base.props = { items: '2023 · Idée | Naissance du projet.\n2024 · Lancement | Première version publique.\n2025 · Croissance | Dix mille utilisateurs actifs.', accent: '#2563eb' }
      base.style = {}
      break
    case 'carousel':
      base.props = { images: [], autoplay: true, interval: 4000, showDots: true, showArrows: true, height: '300px' }
      base.style = { width: '100%' }
      break
    case 'beforeAfter':
      base.props = { before: '', after: '', height: '300px' }
      base.style = { width: '100%' }
      break
    case 'progressCircle':
      base.props = { value: 72, size: 120, color: '#2563eb', track: '#e2e8f0', label: 'Objectif', showValue: true }
      base.style = {}
      break
    case 'badge':
      base.props = { text: 'Nouveau', variant: 'primary', icon: '', pill: true }
      base.style = {}
      break
    case 'breadcrumb':
      base.props = { items: ['Accueil', 'Produits', 'Détail'], separator: '/' }
      base.style = {}
      break
    case 'marquee':
      base.props = { items: ['Kubuno', 'Open source', 'Self-hosted', 'Souverain', 'AGPLv3'], speed: 18 }
      base.style = { padding: '12px 0' }
      break
    case 'animatedHeading':
      base.props = { before: 'Créez des apps ', words: ['plus vite', 'sans code', 'à votre image'], after: '.', color: '#2563eb', interval: 2200 }
      base.style = { textAlign: 'center' }
      break

    // ── Lot 3 : widgets « mobile / app » ──
    case 'avatar':
      base.props = { src: '', name: 'Alex Martin', size: 56, status: 'online' }
      base.style = {}
      break
    case 'appBar':
      base.props = { title: 'Messages', subtitle: '', leftIcon: '', avatar: '', rightIcons: 'Search,MoreVertical', backTo: '', status: '', bg: '#075e54', color: '#ffffff' }
      base.style = { width: '100%' }
      break
    case 'bottomNav':
      base.props = { items: 'MessageCircle | Discussions | \nUsers | Statuts | \nPhone | Appels | \nSettings | Réglages | ', active: 0, accent: '#075e54', bg: '#ffffff' }
      base.style = { width: '100%' }
      break
    case 'tileList':
      base.props = { items: 'Alex Martin | Salut, ça va ? | 09:24 | 2 | \nGroupe Famille | Maman : à table ! | 08:10 | | \nLéa Fontaine | Vu | Hier | | ', status: '', bg: '#ffffff' }
      base.style = { width: '100%' }
      break
    case 'chatThread':
      base.props = { messages: 'in | Salut ! Comment vas-tu ? | 09:20\nout | Très bien, merci 😄 et toi ? | 09:21\nin | Parfait. On se voit ce soir ? | 09:22\nout | Oui, avec plaisir ! | 09:24', bg: '#e5ddd5' }
      base.style = { width: '100%', minHeight: '220px' }
      break
    case 'messageInput':
      base.props = { placeholder: 'Message', accent: '#25d366', bg: '#f0f2f5' }
      base.style = { width: '100%' }
      break

    default:
      base.children = []
  }
  return base
}

function defaultName(type: ElementType): string {
  const names: Record<ElementType, string> = {
    page: 'Page', container: 'Conteneur', text: 'Texte', heading: 'Titre',
    button: 'Bouton', input: 'Champ', textarea: 'Zone de texte', select: 'Liste',
    checkbox: 'Case', image: 'Image', link: 'Lien', divider: 'Séparateur',
    icon: 'Icône', repeatingGroup: 'Liste répétée',
    spacer: 'Espace', video: 'Vidéo', audio: 'Audio', map: 'Carte', embed: 'HTML',
    gallery: 'Galerie', iconBox: 'Bloc icône', imageBox: 'Bloc image', iconList: 'Liste à icônes',
    list: 'Liste', alert: 'Alerte', blockquote: 'Citation', rating: 'Notation', progress: 'Barre de progression',
    testimonial: 'Témoignage', priceTable: 'Tarif', cta: 'Appel à action', socialIcons: 'Réseaux sociaux',
    tabs: 'Onglets', accordion: 'Accordéon', counter: 'Compteur', countdown: 'Compte à rebours', flipBox: 'Carte retournable',
    chart: 'Graphique', table: 'Tableau', stat: 'Indicateur', steps: 'Étapes', timeline: 'Chronologie',
    carousel: 'Carrousel', beforeAfter: 'Avant / Après', progressCircle: 'Jauge circulaire', badge: 'Badge',
    breadcrumb: 'Fil d’Ariane', marquee: 'Bandeau défilant', animatedHeading: 'Titre animé',
    avatar: 'Avatar', appBar: 'Barre d’app', bottomNav: 'Navigation (bas)', tileList: 'Liste de tuiles',
    chatThread: 'Fil de messages', messageInput: 'Zone de saisie',
  }
  return names[type]
}

export function makePage(name: string): Page {
  const route = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid('page')
  return {
    id: uid('page'), name, route,
    root: {
      id: uid('root'), type: 'page', name: 'Page', children: [], props: {},
      style: { background: '#ffffff', minHeight: '100%', padding: '24px' },
      layout: { type: 'column', gap: '16px', align: 'stretch' },
    },
  }
}

// ── Store ────────────────────────────────────────────────────────────────────

export type LeftTab = 'design' | 'data' | 'workflows' | 'reports' | 'settings'
export type Device = 'desktop' | 'tablet' | 'mobile'

interface BuilderState {
  appId: string | null
  appName: string
  def: AppDefinition | null
  currentPageId: string
  selectedId: string | null
  leftTab: LeftTab
  device: Device
  canvasZoom: number
  preview: boolean
  dirty: boolean
  past: AppDefinition[]
  future: AppDefinition[]

  load: (appId: string, name: string, def: AppDefinition) => void
  markSaved: () => void
  setLeftTab: (t: LeftTab) => void
  setDevice: (d: Device) => void
  setCanvasZoom: (z: number) => void
  togglePreview: () => void
  selectPage: (id: string) => void
  select: (id: string | null) => void

  commit: (next: AppDefinition) => void
  /** Apply a definition received from a remote collaborator: replaces `def`
   *  WITHOUT touching undo history or the dirty flag (the sender persists). */
  applyRemote: (def: AppDefinition) => void
  undo: () => void
  redo: () => void

  // Édition de l'arbre
  addElement: (type: ElementType, parentId: string, index?: number) => void
  updateElement: (id: string, patch: Partial<Element>) => void
  deleteElement: (id: string) => void
  moveElement: (id: string, dir: -1 | 1) => void
  reparent: (id: string, newParentId: string, index?: number) => void

  // Presse-papier & opérations contextuelles
  clipboard: Element | null
  copyElement: (id: string) => void
  cutElement: (id: string) => void
  duplicateElement: (id: string) => void
  pasteInto: (parentId: string, index?: number) => void
  pasteAfter: (id: string) => void
  wrapInContainer: (id: string) => void
  reorderEdge: (id: string, edge: 'front' | 'back') => void

  // Pages / données / workflows
  addPage: (name: string) => void
  addPageDef: (page: Page) => void
  deletePage: (id: string) => void
  setDataTypes: (d: DataType[]) => void
  setWorkflows: (w: Workflow[]) => void
  setReports: (r: Report[]) => void
}

export const currentPage = (s: BuilderState): Page | undefined =>
  s.def?.pages.find((p) => p.id === s.currentPageId)

export const useBuilder = create<BuilderState>((set, get) => ({
  appId: null,
  appName: '',
  def: null,
  currentPageId: '',
  selectedId: null,
  leftTab: 'design',
  device: 'desktop',
  canvasZoom: 1,
  preview: false,
  dirty: false,
  past: [],
  future: [],
  clipboard: null,

  load: (appId, name, def) =>
    set({
      appId, appName: name, def,
      currentPageId: def.pages[0]?.id ?? '', selectedId: null,
      // L'éditeur s'adapte au type d'app : mobile → cadre téléphone par défaut.
      device: def.settings?.kind === 'mobile' ? 'mobile' : 'desktop',
      past: [], future: [], dirty: false,
    }),
  markSaved: () => set({ dirty: false }),
  setLeftTab: (t) => set({ leftTab: t }),
  setDevice: (d) => set({ device: d }),
  setCanvasZoom: (z) => set({ canvasZoom: Math.min(3, Math.max(0.25, Math.round(z * 100) / 100)) }),
  togglePreview: () => set((s) => ({ preview: !s.preview, selectedId: null })),
  selectPage: (id) => set({ currentPageId: id, selectedId: null }),
  select: (id) => set({ selectedId: id }),

  commit: (next) => {
    const { def } = get()
    if (!def) return
    set((s) => ({ def: next, past: [...s.past, def].slice(-50), future: [], dirty: true }))
  },
  applyRemote: (next) =>
    set((s) => ({
      def: next,
      // Keep the current page if it still exists, else fall back to the first.
      currentPageId: next.pages.some((p) => p.id === s.currentPageId)
        ? s.currentPageId
        : (next.pages[0]?.id ?? ''),
      // Drop the selection if the selected element no longer exists remotely.
      selectedId:
        s.selectedId && next.pages.some((p) => findEl(p.root, s.selectedId!))
          ? s.selectedId
          : null,
    })),
  undo: () => {
    const { past, def, future } = get()
    if (!past.length || !def) return
    const prev = past[past.length - 1]
    set({ def: prev, past: past.slice(0, -1), future: [def, ...future].slice(0, 50), dirty: true })
  },
  redo: () => {
    const { future, def, past } = get()
    if (!future.length || !def) return
    const next = future[0]
    set({ def: next, future: future.slice(1), past: [...past, def!].slice(-50), dirty: true })
  },

  addElement: (type, parentId, index) => {
    const { def, currentPageId, commit } = get()
    if (!def) return
    const next = structuredClone(def)
    const page = next.pages.find((p) => p.id === currentPageId)
    if (!page) return
    const found = findEl(page.root, parentId)
    if (!found || !isContainerType(found.el.type)) return
    const el = makeElement(type)
    found.el.children = found.el.children ?? []
    const at = index ?? found.el.children.length
    found.el.children.splice(at, 0, el)
    commit(next)
    set({ selectedId: el.id })
  },

  updateElement: (id, patch) => {
    const { def, currentPageId, commit } = get()
    if (!def) return
    const next = structuredClone(def)
    const page = next.pages.find((p) => p.id === currentPageId)
    if (!page) return
    const found = findEl(page.root, id)
    if (!found) return
    Object.assign(found.el, patch)
    // Coalescing de l'historique : des modifs RAPIDES du même élément sur les mêmes
    // propriétés (glissé d'un sélecteur de couleur, frappe au clavier, slider…)
    // forment UNE SEULE entrée d'undo — sinon un drag de couleur génère des dizaines
    // de micro-pas et « annuler » paraît ne rien faire.
    const now = Date.now()
    const key = id + '|' + Object.keys(patch).sort().join(',')
    const coalesce = key === lastEditKey && now - lastEditAt < 600 && get().past.length > 0
    lastEditKey = key; lastEditAt = now
    if (coalesce) {
      set({ def: next, future: [], dirty: true })   // pas de nouvelle entrée d'historique
    } else {
      commit(next)                                   // 1re modif du burst → pousse l'état d'avant
    }
  },

  deleteElement: (id) => {
    const { def, currentPageId, commit } = get()
    if (!def) return
    const next = structuredClone(def)
    const page = next.pages.find((p) => p.id === currentPageId)
    if (!page || page.root.id === id) return
    const found = findEl(page.root, id)
    if (!found || !found.parent) return
    found.parent.children!.splice(found.index, 1)
    commit(next)
    set({ selectedId: null })
  },

  moveElement: (id, dir) => {
    const { def, currentPageId, commit } = get()
    if (!def) return
    const next = structuredClone(def)
    const page = next.pages.find((p) => p.id === currentPageId)
    if (!page) return
    const found = findEl(page.root, id)
    if (!found || !found.parent) return
    const kids = found.parent.children!
    const j = found.index + dir
    if (j < 0 || j >= kids.length) return
    ;[kids[found.index], kids[j]] = [kids[j], kids[found.index]]
    commit(next)
  },

  reparent: (id, newParentId, index) => {
    const { def, currentPageId, commit } = get()
    if (!def || id === newParentId) return
    const next = structuredClone(def)
    const page = next.pages.find((p) => p.id === currentPageId)
    if (!page) return
    const src = findEl(page.root, id)
    const dst = findEl(page.root, newParentId)
    if (!src || !src.parent || !dst || !isContainerType(dst.el.type)) return
    // Refuser de déposer un élément dans son propre sous-arbre.
    if (findEl(src.el, newParentId)) return
    src.parent.children!.splice(src.index, 1)
    dst.el.children = dst.el.children ?? []
    const at = index ?? dst.el.children.length
    dst.el.children.splice(at, 0, src.el)
    commit(next)
  },

  // ── Presse-papier & opérations contextuelles ──
  copyElement: (id) => {
    const { def, currentPageId } = get()
    if (!def) return
    const page = def.pages.find((p) => p.id === currentPageId)
    if (!page || page.root.id === id) return
    const found = findEl(page.root, id)
    if (found) set({ clipboard: structuredClone(found.el) })
  },

  cutElement: (id) => {
    get().copyElement(id)
    get().deleteElement(id)
  },

  duplicateElement: (id) => {
    const { def, currentPageId, commit } = get()
    if (!def) return
    const next = structuredClone(def)
    const page = next.pages.find((p) => p.id === currentPageId)
    if (!page || page.root.id === id) return
    const found = findEl(page.root, id)
    if (!found || !found.parent) return
    const copy = cloneWithNewIds(found.el)
    found.parent.children!.splice(found.index + 1, 0, copy)
    commit(next)
    set({ selectedId: copy.id })
  },

  pasteInto: (parentId, index) => {
    const { def, currentPageId, commit, clipboard } = get()
    if (!def || !clipboard) return
    const next = structuredClone(def)
    const page = next.pages.find((p) => p.id === currentPageId)
    if (!page) return
    const dst = findEl(page.root, parentId)
    if (!dst || !isContainerType(dst.el.type)) return
    const copy = cloneWithNewIds(clipboard)
    dst.el.children = dst.el.children ?? []
    const at = index ?? dst.el.children.length
    dst.el.children.splice(at, 0, copy)
    commit(next)
    set({ selectedId: copy.id })
  },

  pasteAfter: (id) => {
    const { def, currentPageId, commit, clipboard } = get()
    if (!def || !clipboard) return
    const next = structuredClone(def)
    const page = next.pages.find((p) => p.id === currentPageId)
    if (!page) return
    const found = findEl(page.root, id)
    if (!found || !found.parent) return
    const copy = cloneWithNewIds(clipboard)
    found.parent.children!.splice(found.index + 1, 0, copy)
    commit(next)
    set({ selectedId: copy.id })
  },

  wrapInContainer: (id) => {
    const { def, currentPageId, commit } = get()
    if (!def) return
    const next = structuredClone(def)
    const page = next.pages.find((p) => p.id === currentPageId)
    if (!page || page.root.id === id) return
    const found = findEl(page.root, id)
    if (!found || !found.parent) return
    const box = makeElement('container')
    box.children = [found.el]
    found.parent.children!.splice(found.index, 1, box)
    commit(next)
    set({ selectedId: box.id })
  },

  reorderEdge: (id, edge) => {
    const { def, currentPageId, commit } = get()
    if (!def) return
    const next = structuredClone(def)
    const page = next.pages.find((p) => p.id === currentPageId)
    if (!page) return
    const found = findEl(page.root, id)
    if (!found || !found.parent) return
    const kids = found.parent.children!
    const [el] = kids.splice(found.index, 1)
    if (edge === 'front') kids.push(el)
    else kids.unshift(el)
    commit(next)
  },

  addPage: (name) => {
    const { def, commit } = get()
    if (!def) return
    const next = structuredClone(def)
    const page = makePage(name)
    next.pages.push(page)
    commit(next)
    set({ currentPageId: page.id, selectedId: null })
  },

  // Insère une page pré-construite (modèle) en régénérant tous les ids et en
  // garantissant l'unicité de la route.
  addPageDef: (page) => {
    const { def, commit } = get()
    if (!def) return
    const next = structuredClone(def)
    const fresh: Page = structuredClone(page)
    fresh.id = uid('page')
    fresh.root = cloneWithNewIds(fresh.root)
    let route = fresh.route || uid('page')
    const taken = new Set(next.pages.map((p) => p.route))
    if (taken.has(route)) { let k = 2; while (taken.has(`${route}-${k}`)) k++; route = `${route}-${k}` }
    fresh.route = route
    next.pages.push(fresh)
    commit(next)
    set({ currentPageId: fresh.id, selectedId: null })
  },

  deletePage: (id) => {
    const { def, commit, currentPageId } = get()
    if (!def || def.pages.length <= 1) return
    const next = structuredClone(def)
    next.pages = next.pages.filter((p) => p.id !== id)
    if (next.settings.startPage === id) next.settings.startPage = next.pages[0].route
    commit(next)
    if (currentPageId === id) set({ currentPageId: next.pages[0].id, selectedId: null })
  },

  setDataTypes: (dts) => {
    const { def, commit } = get()
    if (!def) return
    const next = structuredClone(def)
    next.dataTypes = dts
    commit(next)
  },

  setWorkflows: (wf) => {
    const { def, commit } = get()
    if (!def) return
    const next = structuredClone(def)
    next.workflows = wf
    commit(next)
  },

  setReports: (r) => {
    const { def, commit } = get()
    if (!def) return
    const next = structuredClone(def)
    next.reports = r
    commit(next)
  },
}))

export type { Field }
