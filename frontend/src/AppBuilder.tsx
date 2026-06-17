import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore, WorkspaceShell, DockArea, WORKSPACE_LIGHT, prompt, type DockPanel, type WorkspaceMenuItem } from '@kubuno/sdk'
import { Button, Input, Dropdown, ColorField } from '@ui'
import {
  Undo2, Redo2, Monitor, Tablet, Smartphone, Play, X,
  Layout, Database, Zap, Settings as SettingsIcon, Plus, Globe, Check, ExternalLink, Copy,
} from 'lucide-react'
import { appApi } from './api'
import { useBuilder, currentPage, findEl, isContainerType, type LeftTab, type Device } from './store'
import Palette from './builder/Palette'
import ElementTree from './builder/ElementTree'
import Inspector from './builder/Inspector'
import DataDesigner from './builder/DataDesigner'
import WorkflowEditor from './builder/WorkflowEditor'
import Canvas from './builder/Canvas'
import BuilderToolbar from './builder/BuilderToolbar'
import BuilderStatusBar from './builder/BuilderStatusBar'
import AppRuntime from './runtime/AppRuntime'
import type { AppDefinition, ElementType } from './types'

export default function AppBuilder() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(true)
  const [published, setPublished] = useState(false)
  const [slug, setSlug] = useState('')
  const [shareOpen, setShareOpen] = useState(false)

  const def = useBuilder((s) => s.def)
  const appId = useBuilder((s) => s.appId)
  const appName = useBuilder((s) => s.appName)
  const dirty = useBuilder((s) => s.dirty)
  const preview = useBuilder((s) => s.preview)
  const leftTab = useBuilder((s) => s.leftTab)
  const device = useBuilder((s) => s.device)
  const load = useBuilder((s) => s.load)
  const markSaved = useBuilder((s) => s.markSaved)
  const setLeftTab = useBuilder((s) => s.setLeftTab)
  const setDevice = useBuilder((s) => s.setDevice)
  const togglePreview = useBuilder((s) => s.togglePreview)
  const undo = useBuilder((s) => s.undo)
  const redo = useBuilder((s) => s.redo)
  // États réactifs pour activer/désactiver les entrées de menus.
  const selectedId = useBuilder((s) => s.selectedId)
  const hasClipboard = useBuilder((s) => !!s.clipboard)
  const canUndo = useBuilder((s) => s.past.length > 0)
  const canRedo = useBuilder((s) => s.future.length > 0)
  const pageObj = useBuilder(currentPage)
  const pagesCount = useBuilder((s) => s.def?.pages.length ?? 0)

  // Chargement
  useEffect(() => {
    if (!id) return
    setLoading(true)
    appApi.get(id).then((app) => {
      load(app.id, app.name, app.definition as AppDefinition)
      setPublished(app.is_published)
      setSlug(app.slug)
      setLoading(false)
    }).catch(() => { setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Autosave débounce
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!dirty || !def || !appId) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      try { await appApi.update(appId, { definition: def }); markSaved() } catch { /* ignore */ } finally { setSaving(false) }
    }, 700)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [def, dirty, appId, markSaved])

  // Raccourcis : undo/redo + édition (dupliquer/copier/couper/coller/supprimer)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const s = useBuilder.getState()
      const sel = s.selectedId
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
      if (mod && e.key === 'y') { e.preventDefault(); redo(); return }
      if (mod && (e.key === '+' || e.key === '=')) { e.preventDefault(); s.setCanvasZoom(s.canvasZoom + 0.1); return }
      if (mod && e.key === '-') { e.preventDefault(); s.setCanvasZoom(s.canvasZoom - 0.1); return }
      if (mod && e.key === '0') { e.preventDefault(); s.setCanvasZoom(1); return }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); if (sel) s.duplicateElement(sel); return }
      if (mod && e.key.toLowerCase() === 'c') { if (sel) s.copyElement(sel); return }
      if (mod && e.key.toLowerCase() === 'x') { if (sel) s.cutElement(sel); return }
      if (mod && e.key.toLowerCase() === 'v') {
        const page = currentPage(s)
        if (sel && page) {
          const f = findEl(page.root, sel)
          if (f && isContainerType(f.el.type)) s.pasteInto(sel); else s.pasteAfter(sel)
        } else if (page) s.pasteInto(page.root.id)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); s.deleteElement(sel) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const shareUrl = slug ? `${window.location.origin}/app/p/${slug}` : ''
  const publishApp = async (next: boolean) => {
    if (!appId) return
    try { await appApi.publish(appId, next); setPublished(next); if (next) setShareOpen(true) } catch { /* ignore */ }
  }
  // Bouton « Publier » de la topbar : publie (+ affiche le lien) ou, si déjà publié,
  // ré-ouvre le lien de partage.
  const onPublishClick = () => { if (published) setShareOpen(true); else publishApp(true) }

  if (loading || !def) {
    return <div className="flex h-full items-center justify-center text-slate-400">Chargement…</div>
  }

  if (preview) {
    return (
      <div className="flex h-full flex-col bg-slate-100">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
          <Play size={15} className="text-green-600" />
          <span className="text-sm font-medium text-slate-600">Aperçu en direct</span>
          <DevicePicker device={device} setDevice={setDevice} />
          <div className="ml-auto"><Button variant="secondary" size="sm" icon={<X size={14} />} onClick={togglePreview}>Quitter l'aperçu</Button></div>
        </div>
        <div className="flex flex-1 justify-center overflow-auto p-6">
          <div className="overflow-hidden rounded-lg bg-white shadow-xl ring-1 ring-slate-200" style={{ width: device === 'mobile' ? 390 : device === 'tablet' ? 768 : 1100, height: '100%' }}>
            {appId && <AppRuntime def={def} appId={appId} currentUser={user ? { id: user.id, email: user.email } : undefined} />}
          </div>
        </div>
      </div>
    )
  }

  // Panneaux ancrables (DockArea) : Éléments / Arborescence / Inspecteur — pertinents
  // en mode Design ; masqués (`hidden`) dans les autres modes (centre pleine largeur).
  const dockPanels: Record<string, DockPanel> = {
    elements:  { label: 'Éléments',      render: () => <div className="h-full overflow-y-auto bg-white"><Palette /></div> },
    tree:      { label: 'Arborescence',  render: () => <div className="h-full overflow-y-auto bg-white"><ElementTree /></div> },
    inspector: { label: 'Inspecteur',    render: () => <div className="h-full overflow-y-auto bg-white"><Inspector /></div> },
  }
  const dockTheme = {
    panel: WORKSPACE_LIGHT.panel, header: WORKSPACE_LIGHT.toolbar,
    border: WORKSPACE_LIGHT.border, text: WORKSPACE_LIGHT.text, textDim: WORKSPACE_LIGHT.textDim,
    accent: WORKSPACE_LIGHT.accent,
  }
  const MODES: { id: LeftTab; label: string; Icon: typeof Layout }[] = [
    { id: 'design',    label: 'Design',    Icon: Layout },
    { id: 'data',      label: 'Données',   Icon: Database },
    { id: 'workflows', label: 'Workflows', Icon: Zap },
    { id: 'settings',  label: 'Réglages',  Icon: SettingsIcon },
  ]
  const viewport =
    leftTab === 'design'    ? <Canvas /> :
    leftTab === 'data'      ? <DataDesigner /> :
    leftTab === 'workflows' ? <WorkflowEditor /> :
    <div className="flex-1 overflow-auto bg-white"><div className="mx-auto max-w-xl p-6"><AppSettingsPanel /></div></div>

  // ── Barre de menus principale (Fichier/Édition/Insertion/Page/Affichage/Aide) ──
  const s = () => useBuilder.getState()
  const insertTarget = (): string | null => {
    const st = s(); const pg = currentPage(st)
    if (!pg) return null
    if (st.selectedId) { const f = findEl(pg.root, st.selectedId); if (f && isContainerType(f.el.type)) return f.el.id; if (f?.parent) return f.parent.id }
    return pg.root.id
  }
  const insert = (type: ElementType) => { const t = insertTarget(); if (t) s().addElement(type, t) }
  const pasteSmart = () => {
    const st = s(); const pg = currentPage(st); if (!pg) return
    if (st.selectedId) { const f = findEl(pg.root, st.selectedId); if (f && isContainerType(f.el.type)) return st.pasteInto(st.selectedId); return st.pasteAfter(st.selectedId) }
    st.pasteInto(pg.root.id)
  }
  const renamePage = async () => {
    const st = s(); const pg = currentPage(st); if (!pg || !st.def) return
    const name = await prompt({ title: 'Renommer la page', defaultValue: pg.name, confirmLabel: 'Renommer' })
    if (!name?.trim()) return
    const next = structuredClone(st.def)
    const p = next.pages.find((x) => x.id === pg.id); if (p) p.name = name.trim()
    s().commit(next)
  }
  const menus: { label: string; items: WorkspaceMenuItem[] }[] = [
    { label: 'Fichier', items: [
      { label: 'Aperçu', onClick: togglePreview, shortcut: 'Ctrl+P' },
      { label: published ? 'Dépublier' : 'Publier…', onClick: () => publishApp(!published) },
      ...(published ? [{ label: 'Lien de partage…', onClick: () => setShareOpen(true) }] : []),
      'sep',
      { label: "Retour à l'accueil", onClick: () => navigate('/app') },
    ]},
    { label: 'Édition', items: [
      { label: 'Annuler', onClick: undo, shortcut: 'Ctrl+Z', disabled: !canUndo },
      { label: 'Rétablir', onClick: redo, shortcut: 'Ctrl+Y', disabled: !canRedo },
      'sep',
      { label: 'Copier', onClick: () => selectedId && s().copyElement(selectedId), shortcut: 'Ctrl+C', disabled: !selectedId },
      { label: 'Couper', onClick: () => selectedId && s().cutElement(selectedId), shortcut: 'Ctrl+X', disabled: !selectedId },
      { label: 'Coller', onClick: pasteSmart, shortcut: 'Ctrl+V', disabled: !hasClipboard },
      { label: 'Dupliquer', onClick: () => selectedId && s().duplicateElement(selectedId), shortcut: 'Ctrl+D', disabled: !selectedId },
      'sep',
      { label: 'Supprimer', onClick: () => selectedId && s().deleteElement(selectedId), shortcut: 'Suppr', disabled: !selectedId },
    ]},
    { label: 'Insertion', items: [
      { label: 'Conteneur', onClick: () => insert('container') },
      { label: 'Titre', onClick: () => insert('heading') },
      { label: 'Texte', onClick: () => insert('text') },
      { label: 'Bouton', onClick: () => insert('button') },
      { label: 'Image', onClick: () => insert('image') },
      { label: 'Icône', onClick: () => insert('icon') },
      { label: 'Séparateur', onClick: () => insert('divider') },
      'sep',
      { label: 'Onglets', onClick: () => insert('tabs') },
      { label: 'Accordéon', onClick: () => insert('accordion') },
      { label: 'Galerie', onClick: () => insert('gallery') },
      { label: 'Carte', onClick: () => insert('map') },
      { label: 'Tarif', onClick: () => insert('priceTable') },
      { label: 'Liste répétée (données)', onClick: () => insert('repeatingGroup') },
    ]},
    { label: 'Page', items: [
      { label: 'Nouvelle page', onClick: () => s().addPage(`Page ${pagesCount + 1}`) },
      { label: 'Renommer la page…', onClick: renamePage },
      { label: 'Supprimer la page', onClick: () => pageObj && s().deletePage(pageObj.id), disabled: pagesCount <= 1 },
      'sep',
      { label: 'Réglages de la page…', onClick: () => setLeftTab('settings') },
    ]},
    { label: 'Affichage', items: [
      { label: 'Design', onClick: () => setLeftTab('design') },
      { label: 'Données', onClick: () => setLeftTab('data') },
      { label: 'Workflows', onClick: () => setLeftTab('workflows') },
      { label: 'Réglages', onClick: () => setLeftTab('settings') },
      'sep',
      { label: 'Ordinateur', onClick: () => setDevice('desktop') },
      { label: 'Tablette', onClick: () => setDevice('tablet') },
      { label: 'Téléphone', onClick: () => setDevice('mobile') },
    ]},
    { label: 'Aide', items: [
      { label: 'À propos de l’éditeur App', onClick: () => {} },
    ]},
  ]

  return (
    <>
    <WorkspaceShell
      chromeless
      theme={WORKSPACE_LIGHT}
      onBack={() => navigate('/app')}
      title={appName}
      subtitle="App"
      menus={menus}
      optionsBar={leftTab === 'design' ? <BuilderToolbar /> : undefined}
      optionsBarHeight={40}
      statusBar={leftTab === 'design' ? <BuilderStatusBar /> : undefined}
      statusHeight={26}
      saveStatus={<span className="text-[11px] text-text-tertiary">{saving ? 'Enregistrement…' : dirty ? 'Modifié' : 'Enregistré'}</span>}
      topbarActions={
        <div className="flex items-center gap-1">
          <button type="button" onClick={undo} title="Annuler (Ctrl+Z)" className="rounded p-1.5 text-text-secondary hover:bg-surface-2"><Undo2 size={15} /></button>
          <button type="button" onClick={redo} title="Rétablir (Ctrl+Y)" className="rounded p-1.5 text-text-secondary hover:bg-surface-2"><Redo2 size={15} /></button>
          <div className="mx-1 h-5 w-px bg-border" />
          <DevicePicker device={device} setDevice={setDevice} />
          <Button variant={published ? 'secondary' : 'ghost'} size="sm" icon={published ? <Check size={14} /> : <Globe size={14} />} onClick={onPublishClick}>
            {published ? 'Publié' : 'Publier'}
          </Button>
          <Button variant="primary" size="sm" icon={<Play size={14} />} onClick={togglePreview}>Aperçu</Button>
        </div>
      }
      toolRail={
        <>
          {MODES.map((m) => (
            <button key={m.id} type="button" onClick={() => setLeftTab(m.id)} title={m.label}
              className={`rounded-lg p-2 transition-colors ${leftTab === m.id ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-surface-2'}`}>
              <m.Icon size={18} />
            </button>
          ))}
        </>
      }
      bottomBar={<PagesBar />}
    >
      <DockArea
        panels={dockPanels}
        storageKey="kubuno:app:dockLayout"
        defaultArrangement={{ left: [['elements'], ['tree']], right: [['inspector']] }}
        hidden={leftTab !== 'design'}
        theme={dockTheme}
        viewportBg="#eef1f5"
        moveTitle="Glisser pour déplacer / détacher"
      >
        {viewport}
      </DockArea>
    </WorkspaceShell>
    {shareOpen && <PublishDialog url={shareUrl} published={published} onUnpublish={() => { publishApp(false); setShareOpen(false) }} onClose={() => setShareOpen(false)} />}
    </>
  )
}

// Boîte de dialogue affichée après publication : montre le lien public à partager
// (copie presse-papier + ouverture dans un nouvel onglet) et permet de dépublier.
function PublishDialog({ url, published, onUnpublish, onClose }: { url: string; published: boolean; onUnpublish: () => void; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = () => navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-[460px] max-w-[92vw] rounded-xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <Globe size={18} className="text-blue-600" />
          <h2 className="text-base font-semibold text-slate-800">Application publiée</h2>
        </div>
        <p className="mb-3 text-sm text-slate-500">Partagez ce lien : toute personne y accède sans connexion.</p>
        <div className="flex items-center gap-2">
          <input readOnly value={url} className="flex-1 rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700"
            onFocus={(e) => e.currentTarget.select()} />
          <Button size="sm" icon={copied ? <Check size={14} /> : <Copy size={14} />} onClick={copy}>{copied ? 'Copié !' : 'Copier'}</Button>
        </div>
        <div className="mt-4 flex items-center justify-between">
          {published
            ? <button type="button" onClick={onUnpublish} className="text-xs text-red-500 hover:underline">Dépublier l’application</button>
            : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Fermer</Button>
            <Button variant="primary" size="sm" icon={<ExternalLink size={14} />} onClick={() => window.open(url, '_blank')}>Ouvrir</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DevicePicker({ device, setDevice }: { device: Device; setDevice: (d: Device) => void }) {
  // Les apps mobiles ne proposent que les formats tactiles ; les apps web, les trois.
  const kind = useBuilder((s) => s.def?.settings?.kind ?? 'web')
  const all: [Device, typeof Monitor][] = [['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]]
  const items = kind === 'mobile' ? all.filter(([d]) => d !== 'desktop') : all
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
      {items.map(([d, Icon]) => (
        <button key={d} type="button" onClick={() => setDevice(d)}
          className={`rounded p-1.5 ${device === d ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`} title={d}>
          <Icon size={15} />
        </button>
      ))}
    </div>
  )
}

function PagesBar() {
  const def = useBuilder((s) => s.def)
  const page = useBuilder(currentPage)
  const selectPage = useBuilder((s) => s.selectPage)
  const addPage = useBuilder((s) => s.addPage)
  const deletePage = useBuilder((s) => s.deletePage)
  if (!def) return null
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
      <span className="mr-1 text-[11px] font-semibold uppercase text-slate-400">Pages</span>
      {def.pages.map((p) => (
        <button key={p.id} type="button" onClick={() => selectPage(p.id)}
          className={`group flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${page?.id === p.id ? 'bg-white font-medium text-blue-600 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/60'}`}>
          {p.name}
          {def.pages.length > 1 && (
            <span onClick={(e) => { e.stopPropagation(); deletePage(p.id) }} className="hidden text-slate-400 hover:text-red-500 group-hover:inline">✕</span>
          )}
        </button>
      ))}
      <button type="button" onClick={() => addPage(`Page ${def.pages.length + 1}`)} className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-blue-600" title="Ajouter une page"><Plus size={14} /></button>
    </div>
  )
}

function AppSettingsPanel() {
  const def = useBuilder((s) => s.def)
  const commit = useBuilder((s) => s.commit)
  if (!def) return null
  const update = (patch: Partial<AppDefinition['settings']>) => commit({ ...def, settings: { ...def.settings, ...patch } })
  const updateTheme = (patch: Partial<AppDefinition['theme']>) => commit({ ...def, theme: { ...def.theme, ...patch } })
  return (
    <div className="space-y-4 p-3 text-sm">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-500">Titre de l'application</label>
        <Input value={def.settings.title} onChange={(e) => update({ title: e.target.value })} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-500">Page de démarrage</label>
        <Dropdown value={def.settings.startPage} width="100%" onChange={(v) => update({ startPage: v })}
          options={def.pages.map((p) => ({ value: p.route, label: p.name }))} />
      </div>
      <div className="border-t border-slate-100 pt-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Thème</div>
        {([['primary', 'Couleur principale'], ['accent', 'Accent'], ['background', 'Fond'], ['surface', 'Surface'], ['text', 'Texte']] as [keyof AppDefinition['theme'], string][]).map(([k, label]) => (
          <div key={k} className="mb-2">
            <span className="mb-1 block text-xs text-slate-600">{label}</span>
            <ColorField color={String(def.theme[k])} onChange={(hex) => updateTheme({ [k]: hex })} />
          </div>
        ))}
      </div>
    </div>
  )
}
