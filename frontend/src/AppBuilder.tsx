import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { useAuthStore, DockArea, WORKSPACE_LIGHT, getDateLocale, prompt, useNotificationStore, type DockPanel } from '@kubuno/sdk'
import { Button, Input, Dropdown, ColorField } from '@ui'
import {
  Undo2, Redo2, Monitor, Tablet, Smartphone, Play, X,
  Layout, Database, Zap, Settings as SettingsIcon, Plus, Globe, Check, ExternalLink, Copy, FileText,
  Container, Heading, Type, MousePointerClick, Image as ImageIcon, Sparkles, Minus,
  Rows3, ChevronsLeftRightEllipsis, LayoutGrid, Map as MapIcon, DollarSign, Repeat,
  Scissors, ClipboardPaste, Trash2, FilePlus2, Pencil, LayoutTemplate, AppWindow, Star,
} from 'lucide-react'
import { appApi } from './api'
import { useBuilder, currentPage, findEl, isContainerType, type LeftTab, type Device } from './store'
import Palette from './builder/Palette'
import ElementTree from './builder/ElementTree'
import Inspector from './builder/Inspector'
import DataDesigner from './builder/DataDesigner'
import WorkflowEditor from './builder/WorkflowEditor'
import ReportDesigner from './builder/ReportDesigner'
import PageDialog from './builder/PageDialog'
import Canvas from './builder/Canvas'
import BuilderToolbar from './builder/BuilderToolbar'
import BuilderStatusBar from './builder/BuilderStatusBar'
import AppRuntime from './runtime/AppRuntime'
import { OfficeShell } from './shell/OfficeShell'
import { SaveButton } from './ribbon/SaveButton'
import { UndoRedoButtons } from './ribbon/UndoRedoButtons'
import { AppLogo } from './AppLogo'
import { THEME_APP, fileAccentFor } from './ribbon/officeThemes'
import { useFileTab, backstageLabels, InfoPanel } from './ribbon/ModuleBackstage'
import AppStartContent from './AppStartContent'
import type { RibbonTab } from './ribbon/types'
import type { AppDefinition, ElementType } from './types'

export default function AppBuilder() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation('app')
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(true)
  const [published, setPublished] = useState(false)
  const [isStarred, setIsStarred] = useState(false)
  const [slug, setSlug] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [pageDialogOpen, setPageDialogOpen] = useState(false)

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
  const addPageDef = useBuilder((s) => s.addPageDef)
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
      setIsStarred(app.is_starred)
      setSlug(app.slug)
      setUpdatedAt(app.updated_at ?? null)
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

  // Force an immediate save (shared Save button) — cancels the pending autosave
  // debounce and persists the current definition right away. Keeps `saveStatus`
  // and autosave intact (same path: appApi.update + markSaved + setSaving).
  const save = async () => {
    const st = useBuilder.getState()
    if (!st.appId || !st.def) return
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    setSaving(true)
    try { await appApi.update(st.appId, { definition: st.def }); markSaved() } catch { /* ignore */ } finally { setSaving(false) }
  }

  // Toggle the favorite flag (persists `is_starred` and refreshes the app query).
  const starMut = useMutation({
    mutationFn: (next: boolean) => appApi.update(appId!, { is_starred: next }),
    onSuccess: (app) => {
      setIsStarred(app.is_starred)
      queryClient.invalidateQueries({ queryKey: ['app', appId] })
    },
  })

  // Move the app to the trash, then return to the dashboard.
  const trashMut = useMutation({
    mutationFn: () => appApi.trash(appId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apps'] })
      navigate('/app')
    },
  })

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

  // ── Onglet « Fichier » (backstage façon Office) — TOUJOURS en 1ʳᵉ position du
  //    ruban. Doit être appelé AVANT tout return anticipé (règles des hooks).
  //    Le contenu « Accueil » réutilise le MÊME AppStartContent que le dashboard. ──
  const { fileTab, activeTabId, onTabChange } = useFileTab({
    theme: THEME_APP,
    labels: backstageLabels(t),
    startContent: <AppStartContent />,
    defaultTab: 'home',
    doc: {
      info: (
        <InfoPanel
          title={appName || t('app')}
          subtitle={t('app')}
          rows={[
            [t('office_bs_info_type', { defaultValue: 'Type' }), def?.settings?.kind === 'mobile' ? t('kind_mobile') : t('kind_web')],
            [t('view_pages', { defaultValue: 'Pages' }), def?.pages.length ?? 0],
            [t('published'), published ? t('yes', { defaultValue: 'Oui' }) : t('no', { defaultValue: 'Non' })],
            ...(updatedAt
              ? [[t('office_bs_info_modified', { defaultValue: 'Modifié le' }), format(new Date(updatedAt), 'd MMM yyyy', { locale: getDateLocale(i18n.language) })] as [string, string]]
              : []),
          ]}
        />
      ),
      onPrint: () => window.print(),
      onClose: () => navigate('/app'),
    },
  })

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
    { id: 'reports',   label: 'Rapports',  Icon: FileText },
    { id: 'settings',  label: 'Réglages',  Icon: SettingsIcon },
  ]
  const viewport =
    leftTab === 'design'    ? <Canvas /> :
    leftTab === 'data'      ? <DataDesigner /> :
    leftTab === 'workflows' ? <WorkflowEditor /> :
    leftTab === 'reports'   ? <ReportDesigner /> :
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
  // Enregistre la page courante comme modèle réutilisable (persisté côté backend,
  // pour la réinsérer dans d'autres projets via la fenêtre « Ajouter une page »).
  const savePageAsTemplate = async () => {
    const pg = currentPage(s()); if (!pg) return
    const name = await prompt({ title: 'Enregistrer la page comme modèle', message: 'Nom du modèle (réutilisable dans vos autres projets)', defaultValue: pg.name, confirmLabel: 'Enregistrer' })
    if (!name?.trim()) return
    const notify = useNotificationStore.getState().push
    try {
      await appApi.savePageTemplate({ name: name.trim(), definition: { ...pg, name: name.trim() } })
      notify({ title: 'Modèle enregistré', body: `« ${name.trim()} » est disponible dans « Mes modèles ».`, moduleId: 'app', icon: 'LayoutTemplate' })
    } catch {
      notify({ title: 'Échec', body: 'Impossible d’enregistrer le modèle de page.', moduleId: 'app', icon: 'AlertTriangle' })
    }
  }
  // ── Ruban (façon MS Office) — reprend l'INTÉGRALITÉ des anciennes barres de menus
  //    (Fichier/Édition/Insertion/Page/Affichage/Aide) + l'options bar contextuelle
  //    (BuilderToolbar → onglet contextuel « Format »). Aucune action perdue. Le
  //    groupe « Fichier » lui-même vit dans le backstage (onglet Fichier, ci-dessus) ;
  //    Aperçu/Publier restent aussi en topbarActions. ────────────────────────────
  const appRibbon: RibbonTab[] = [
    // ── Accueil ──
    { id: 'home', label: t('doc_tab_home', { defaultValue: 'Accueil' }), groups: [
      { id: 'history', label: t('grp_history', { defaultValue: 'Historique' }), items: [
        { id: 'undo', kind: 'button', size: 'large', icon: <Undo2 size={18} />, label: t('undo', { defaultValue: 'Annuler' }), shortcut: 'Ctrl+Z', disabled: !canUndo, onClick: undo },
        { id: 'redo', kind: 'button', icon: <Redo2 size={15} />, label: t('redo', { defaultValue: 'Rétablir' }), shortcut: 'Ctrl+Y', disabled: !canRedo, onClick: redo },
      ] },
      { id: 'clip', label: t('grp_clipboard', { defaultValue: 'Presse-papiers' }), items: [
        { id: 'paste', kind: 'button', size: 'large', icon: <ClipboardPaste size={18} />, label: t('paste', { defaultValue: 'Coller' }), shortcut: 'Ctrl+V', disabled: !hasClipboard, onClick: pasteSmart },
        { id: 'copy', kind: 'button', icon: <Copy size={15} />, label: t('copy', { defaultValue: 'Copier' }), shortcut: 'Ctrl+C', disabled: !selectedId, onClick: () => selectedId && s().copyElement(selectedId) },
        { id: 'cut', kind: 'button', icon: <Scissors size={15} />, label: t('cut', { defaultValue: 'Couper' }), shortcut: 'Ctrl+X', disabled: !selectedId, onClick: () => selectedId && s().cutElement(selectedId) },
        { id: 'dup', kind: 'button', icon: <Copy size={15} />, label: t('duplicate'), shortcut: 'Ctrl+D', disabled: !selectedId, onClick: () => selectedId && s().duplicateElement(selectedId) },
      ] },
      { id: 'edit', label: t('grp_editing', { defaultValue: 'Édition' }), items: [
        { id: 'del', kind: 'button', icon: <Trash2 size={15} />, label: t('delete'), shortcut: 'Suppr', disabled: !selectedId, onClick: () => selectedId && s().deleteElement(selectedId) },
      ] },
      { id: 'pages', label: t('view_pages', { defaultValue: 'Pages' }), items: [
        { id: 'newpage', kind: 'button', size: 'large', icon: <FilePlus2 size={18} />, label: t('page_new', { defaultValue: 'Nouvelle page' }), onClick: () => setPageDialogOpen(true) },
      ] },
      { id: 'publish', label: t('app'), items: [
        { id: 'preview', kind: 'button', size: 'large', icon: <Play size={18} />, label: t('preview', { defaultValue: 'Aperçu' }), shortcut: 'Ctrl+P', onClick: togglePreview },
        { id: 'pub', kind: 'button', icon: published ? <Check size={15} /> : <Globe size={15} />, label: published ? t('unpublish', { defaultValue: 'Dépublier' }) : t('publish', { defaultValue: 'Publier' }), onClick: () => publishApp(!published) },
        ...(published ? [{ id: 'share', kind: 'button' as const, icon: <ExternalLink size={15} />, label: t('share_link', { defaultValue: 'Lien de partage' }), onClick: () => setShareOpen(true) }] : []),
      ] },
    ] },
    // ── Insertion ──
    { id: 'insert', label: t('tab_insert', { defaultValue: 'Insertion' }), groups: [
      { id: 'basic', label: t('grp_elements', { defaultValue: 'Éléments' }), items: [
        { id: 'i-container', kind: 'button', size: 'large', icon: <Container size={18} />, label: t('el_container', { defaultValue: 'Conteneur' }), onClick: () => insert('container') },
        { id: 'i-heading', kind: 'button', icon: <Heading size={15} />, label: t('el_heading', { defaultValue: 'Titre' }), onClick: () => insert('heading') },
        { id: 'i-text', kind: 'button', icon: <Type size={15} />, label: t('el_text', { defaultValue: 'Texte' }), onClick: () => insert('text') },
        { id: 'i-button', kind: 'button', icon: <MousePointerClick size={15} />, label: t('el_button', { defaultValue: 'Bouton' }), onClick: () => insert('button') },
        { id: 'i-image', kind: 'button', icon: <ImageIcon size={15} />, label: t('el_image', { defaultValue: 'Image' }), onClick: () => insert('image') },
        { id: 'i-icon', kind: 'button', icon: <Sparkles size={15} />, label: t('el_icon', { defaultValue: 'Icône' }), onClick: () => insert('icon') },
        { id: 'i-divider', kind: 'button', icon: <Minus size={15} />, label: t('el_divider', { defaultValue: 'Séparateur' }), onClick: () => insert('divider') },
      ] },
      { id: 'components', label: t('grp_components', { defaultValue: 'Composants' }), items: [
        { id: 'i-tabs', kind: 'button', size: 'large', icon: <Rows3 size={18} />, label: t('el_tabs', { defaultValue: 'Onglets' }), onClick: () => insert('tabs') },
        { id: 'i-accordion', kind: 'button', icon: <ChevronsLeftRightEllipsis size={15} />, label: t('el_accordion', { defaultValue: 'Accordéon' }), onClick: () => insert('accordion') },
        { id: 'i-gallery', kind: 'button', icon: <LayoutGrid size={15} />, label: t('el_gallery', { defaultValue: 'Galerie' }), onClick: () => insert('gallery') },
        { id: 'i-map', kind: 'button', icon: <MapIcon size={15} />, label: t('el_map', { defaultValue: 'Carte' }), onClick: () => insert('map') },
        { id: 'i-price', kind: 'button', icon: <DollarSign size={15} />, label: t('el_price', { defaultValue: 'Tarif' }), onClick: () => insert('priceTable') },
        { id: 'i-repeat', kind: 'button', icon: <Repeat size={15} />, label: t('el_repeating', { defaultValue: 'Liste répétée' }), tooltip: t('el_repeating_tip', { defaultValue: 'Liste répétée (données)' }), onClick: () => insert('repeatingGroup') },
      ] },
    ] },
    // ── Page ──
    { id: 'page', label: t('tab_page', { defaultValue: 'Page' }), groups: [
      { id: 'page-manage', label: t('view_pages', { defaultValue: 'Pages' }), items: [
        { id: 'p-new', kind: 'button', size: 'large', icon: <FilePlus2 size={18} />, label: t('page_new', { defaultValue: 'Nouvelle page' }), onClick: () => setPageDialogOpen(true) },
        { id: 'p-rename', kind: 'button', icon: <Pencil size={15} />, label: t('page_rename', { defaultValue: 'Renommer' }), onClick: renamePage },
        { id: 'p-delete', kind: 'button', icon: <Trash2 size={15} />, label: t('page_delete', { defaultValue: 'Supprimer la page' }), disabled: pagesCount <= 1, onClick: () => pageObj && s().deletePage(pageObj.id) },
      ] },
      { id: 'page-tools', label: t('grp_advanced', { defaultValue: 'Avancé' }), items: [
        { id: 'p-tpl', kind: 'button', size: 'large', icon: <LayoutTemplate size={18} />, label: t('page_save_template', { defaultValue: 'Enregistrer comme modèle' }), onClick: savePageAsTemplate },
        { id: 'p-settings', kind: 'button', icon: <SettingsIcon size={15} />, label: t('page_settings', { defaultValue: 'Réglages de la page' }), onClick: () => setLeftTab('settings') },
      ] },
    ] },
    // ── Affichage ──
    { id: 'view', label: t('tab_view', { defaultValue: 'Affichage' }), groups: [
      { id: 'view-modes', label: t('grp_modes', { defaultValue: 'Modes' }), items: [
        { id: 'v-design', kind: 'toggle', size: 'large', icon: <Layout size={18} />, label: t('mode_design', { defaultValue: 'Design' }), active: leftTab === 'design', onClick: () => setLeftTab('design') },
        { id: 'v-data', kind: 'toggle', icon: <Database size={15} />, label: t('mode_data', { defaultValue: 'Données' }), active: leftTab === 'data', onClick: () => setLeftTab('data') },
        { id: 'v-workflows', kind: 'toggle', icon: <Zap size={15} />, label: t('mode_workflows', { defaultValue: 'Workflows' }), active: leftTab === 'workflows', onClick: () => setLeftTab('workflows') },
        { id: 'v-reports', kind: 'toggle', icon: <FileText size={15} />, label: t('mode_reports', { defaultValue: 'Rapports' }), active: leftTab === 'reports', onClick: () => setLeftTab('reports') },
        { id: 'v-settings', kind: 'toggle', icon: <SettingsIcon size={15} />, label: t('mode_settings', { defaultValue: 'Réglages' }), active: leftTab === 'settings', onClick: () => setLeftTab('settings') },
      ] },
      { id: 'view-device', label: t('grp_device', { defaultValue: 'Appareil' }), items: [
        { id: 'd-desktop', kind: 'toggle', size: 'large', icon: <Monitor size={18} />, label: t('device_desktop', { defaultValue: 'Ordinateur' }), active: device === 'desktop', onClick: () => setDevice('desktop') },
        { id: 'd-tablet', kind: 'toggle', icon: <Tablet size={15} />, label: t('device_tablet', { defaultValue: 'Tablette' }), active: device === 'tablet', onClick: () => setDevice('tablet') },
        { id: 'd-mobile', kind: 'toggle', icon: <Smartphone size={15} />, label: t('device_mobile', { defaultValue: 'Téléphone' }), active: device === 'mobile', onClick: () => setDevice('mobile') },
      ] },
    ] },
    // ── Aide ──
    { id: 'help', label: t('tab_help', { defaultValue: 'Aide' }), groups: [
      { id: 'help-grp', label: t('tab_help', { defaultValue: 'Aide' }), items: [
        { id: 'about', kind: 'button', size: 'large', icon: <AppWindow size={18} />, label: t('help_about', { defaultValue: 'À propos de l’éditeur App' }), onClick: () => {} },
      ] },
    ] },
    // ── Format (CONTEXTUEL) — n'apparaît qu'avec un objet sélectionné, liseré violet.
    //    Réutilise l'ancienne options bar (BuilderToolbar) telle quelle via un item
    //    `custom`, donc TOUTES ses actions (align/taille/couleur/disposition/dupliquer/
    //    monter/descendre/supprimer) restent disponibles. ──────────────────────────
    { id: 'format', label: t('tab_format', { defaultValue: 'Format' }), contextual: { accent: fileAccentFor(THEME_APP.accent) }, visible: leftTab === 'design' && !!selectedId, groups: [
      { id: 'fmt', label: t('tab_format', { defaultValue: 'Format' }), items: [
        { id: 'fmt-tools', kind: 'custom', render: <div className="flex items-center px-1 py-1"><BuilderToolbar /></div> },
      ] },
    ] },
  ]

  return (
    <>
    <OfficeShell
      ribbon={[fileTab, ...appRibbon]}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      chromeless
      topbarHeight={64}
      theme={THEME_APP}
      titleIcon={<AppLogo size={20} className="flex-shrink-0" />}
      title={appName}
      titleActions={
        <>
          <SaveButton onSave={save} saving={saving} dirty={dirty} label={t('save', { defaultValue: 'Enregistrer' })} />
          <UndoRedoButtons
            onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
            undoLabel={t('undo', { defaultValue: 'Annuler' }) + ' (Ctrl+Z)'}
            redoLabel={t('redo', { defaultValue: 'Rétablir' }) + ' (Ctrl+Y)'}
          />
          <button
            onClick={() => starMut.mutate(!isStarred)}
            className={`p-1.5 rounded hover:bg-white/10 transition-colors flex-shrink-0 ${isStarred ? 'text-warning' : 'text-white/90'}`}
            title={isStarred ? t('app_unstar', { defaultValue: 'Retirer des favoris' }) : t('app_star', { defaultValue: 'Ajouter aux favoris' })}
          >
            <Star size={15} className={isStarred ? 'fill-warning text-warning' : ''} />
          </button>
        </>
      }
      onDelete={() => trashMut.mutate()}
      deleteTitle={t('app_move_to_trash', { defaultValue: 'Mettre à la corbeille' })}
      deleteConfirm={{
        title: t('app_delete_confirm_title', { defaultValue: 'Supprimer cette application ?' }),
        message: t('app_delete_confirm_msg', { defaultValue: "L'application sera déplacée dans la corbeille." }),
        confirmLabel: t('app_delete_confirm_ok', { defaultValue: 'Supprimer' }),
        variant: 'danger',
      }}
      statusBar={leftTab === 'design' ? <BuilderStatusBar /> : undefined}
      statusHeight={26}
      saveStatus={<span className="text-[11px] text-text-tertiary">{saving ? 'Enregistrement…' : dirty ? 'Modifié' : 'Enregistré'}</span>}
      topbarActions={
        <div className="flex items-center gap-2">
          <DevicePicker device={device} setDevice={setDevice} />
          {/* Style blanc translucide : lisible sur la topbar colorée (cf. « Partager » du tableur). */}
          <button type="button" onClick={onPublishClick}
            className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/15 text-white text-sm font-medium border border-white/25 hover:bg-white/25 transition-colors">
            {published ? <Check size={15} /> : <Globe size={15} />} {published ? 'Publié' : 'Publier'}
          </button>
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
      bottomBar={<PagesBar onAdd={() => setPageDialogOpen(true)} />}
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
    </OfficeShell>
    {shareOpen && <PublishDialog url={shareUrl} published={published} onUnpublish={() => { publishApp(false); setShareOpen(false) }} onClose={() => setShareOpen(false)} />}
    {pageDialogOpen && <PageDialog onClose={() => setPageDialogOpen(false)} onPick={(page) => addPageDef(page)} />}
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

function PagesBar({ onAdd }: { onAdd: () => void }) {
  const def = useBuilder((s) => s.def)
  const page = useBuilder(currentPage)
  const selectPage = useBuilder((s) => s.selectPage)
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
      <button type="button" onClick={onAdd} className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-blue-600" title="Ajouter une page"><Plus size={14} /></button>
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
