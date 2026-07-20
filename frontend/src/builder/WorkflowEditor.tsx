import { useMemo, useState } from 'react'
import {
  Plus, Trash2, Zap, ChevronRight, ChevronDown, Copy, Filter, Search,
  Database, ArrowRight, MousePointerClick, FileText, Clock, HelpCircle, RefreshCw,
  Bell, Link2, Undo2, ClipboardCopy, Eraser, Variable, GripVertical, Play, Pause, Type as TypeIcon,
} from 'lucide-react'
import { Button, Input, Dropdown, Checkbox, MenuDropdown, type MenuItem, type MenuDropdownPos } from '@ui'
import type { Action, ActionType, Dyn, Element, Report, Workflow } from '../types'
import { useBuilder, uid } from '../store'
import { describeDyn } from '../binding'
import DynEditor, { type DynInputs } from './DynEditor'

/** Liste déroulante compacte (primitive @ui Dropdown). */
function Sel({ value, onChange, options, width }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; width?: number | string }) {
  return <Dropdown value={value} onChange={onChange} options={options} width={width ?? '100%'} />
}

// ── Catalogue d'actions : familles (couleur + icône) et libellés ─────────────

type FamilyId = 'data' | 'nav' | 'ui' | 'doc' | 'logic'
const FAMILIES: Record<FamilyId, { label: string; fg: string; bg: string }> = {
  data:  { label: 'Données',    fg: '#1d4ed8', bg: '#dbeafe' },
  nav:   { label: 'Navigation', fg: '#7c3aed', bg: '#ede9fe' },
  ui:    { label: 'Interface',  fg: '#0f766e', bg: '#ccfbf1' },
  doc:   { label: 'Documents',  fg: '#be185d', bg: '#fce7f3' },
  logic: { label: 'Logique',    fg: '#b45309', bg: '#fef3c7' },
}
const ACTION_META: Record<ActionType, { label: string; family: FamilyId; Icon: React.ComponentType<{ size?: number | string; className?: string; style?: React.CSSProperties }> }> = {
  createRecord:    { label: 'Créer un enregistrement',     family: 'data',  Icon: Database },
  updateRecord:    { label: 'Modifier un enregistrement',  family: 'data',  Icon: Database },
  deleteRecord:    { label: 'Supprimer un enregistrement', family: 'data',  Icon: Trash2 },
  refreshData:     { label: 'Rafraîchir les données',      family: 'data',  Icon: RefreshCw },
  navigate:        { label: 'Aller à une page',            family: 'nav',   Icon: ArrowRight },
  openUrl:         { label: 'Ouvrir un lien (URL)',        family: 'nav',   Icon: Link2 },
  goBack:          { label: 'Revenir en arrière',          family: 'nav',   Icon: Undo2 },
  showAlert:       { label: 'Afficher un message',         family: 'ui',    Icon: Bell },
  setState:        { label: 'Définir une variable',        family: 'ui',    Icon: Variable },
  resetInputs:     { label: 'Réinitialiser les champs',    family: 'ui',    Icon: Eraser },
  copyToClipboard: { label: 'Copier dans le presse-papier', family: 'ui',   Icon: ClipboardCopy },
  generatePdf:     { label: 'Générer un rapport PDF',      family: 'doc',   Icon: FileText },
  wait:            { label: 'Attendre…',                   family: 'logic', Icon: Clock },
  confirm:         { label: 'Demander confirmation',       family: 'logic', Icon: HelpCircle },
}
const FAMILY_ORDER: FamilyId[] = ['data', 'nav', 'ui', 'doc', 'logic']
const ACTIONS_BY_FAMILY = FAMILY_ORDER.map((f) => ({
  family: f,
  items: (Object.entries(ACTION_META) as [ActionType, (typeof ACTION_META)[ActionType]][]).filter(([, m]) => m.family === f),
}))

const ACT_DRAG_MIME = 'application/x-app-action'

/** Résumé « humain » d'une action (carte repliée + infobulles). */
function summarizeAction(a: Action, lk: { pages: { id: string; name: string }[]; reports: Report[] }): string {
  switch (a.type) {
    case 'createRecord': return a.dataType || '—'
    case 'updateRecord': return `${a.dataType || '—'} ← ${describeDyn(a.recordRef)}`
    case 'deleteRecord': return `${a.dataType || '—'} ← ${describeDyn(a.recordRef)}`
    case 'navigate':     return lk.pages.find((p) => p.id === a.pageId)?.name ?? '—'
    case 'openUrl':      return describeDyn(a.url)
    case 'setState':     return `${a.key || '—'} = ${describeDyn(a.value)}`
    case 'showAlert':    return describeDyn(a.message)
    case 'copyToClipboard': return describeDyn(a.text)
    case 'generatePdf':  return lk.reports.find((r) => r.id === a.reportId)?.name ?? '—'
    case 'wait':         return `${a.ms ?? 0} ms`
    case 'confirm':      return describeDyn(a.message)
    default:             return ''
  }
}

/** Résumé du déclencheur (barre latérale + carte). */
function triggerMeta(wf: Workflow, els: { id: string; name: string }[], pages: { id: string; name: string }[]) {
  switch (wf.event.type) {
    case 'click':       return { Icon: MousePointerClick, text: `Clic · ${els.find((e) => e.id === wf.event.elementId)?.name ?? '?'}` }
    case 'inputChange': return { Icon: TypeIcon, text: `Saisie · ${els.find((e) => e.id === wf.event.elementId)?.name ?? '?'}` }
    case 'pageLoad':    return { Icon: FileText, text: `Chargement · ${pages.find((p) => p.id === wf.event.pageId)?.name ?? '?'}` }
  }
}

/** Interrupteur compact (workflow / action activé·e). */
function Switch({ on, onChange, title }: { on: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} title={title}
      onClick={(e) => { e.stopPropagation(); onChange(!on) }}
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

/** Éditeur de workflows : chaque workflow = un déclencheur (événement) + une
 *  suite d'actions exécutées en séquence par le runtime. */
export default function WorkflowEditor() {
  const def = useBuilder((s) => s.def)
  const setWorkflows = useBuilder((s) => s.setWorkflows)
  const [selId, setSelId] = useState<string | null>(def?.workflows[0]?.id ?? null)
  const [filter, setFilter] = useState('')
  const [menu, setMenu] = useState<{ pos: MenuDropdownPos; wfId: string } | null>(null)

  // Tous les éléments (avec leur page) pour les pickers.
  const allEls = useMemo(() => {
    const acc: { id: string; name: string; type: string; page: string }[] = []
    const walk = (e: Element, page: string) => {
      acc.push({ id: e.id, name: e.name, type: e.type, page })
      ;(e.children ?? []).forEach((c) => walk(c, page))
    }
    def?.pages.forEach((p) => walk(p.root, p.name))
    return acc
  }, [def])

  const inputs: DynInputs[] = allEls.filter((e) => ['input', 'textarea', 'select', 'checkbox'].includes(e.type)).map((e) => ({ id: e.id, name: e.name }))

  if (!def) return null
  const wfs = def.workflows
  const pages = def.pages.map((p) => ({ id: p.id, name: p.name }))
  const current = wfs.find((w) => w.id === selId) ?? wfs[0]
  const visible = filter.trim() ? wfs.filter((w) => w.name.toLowerCase().includes(filter.trim().toLowerCase())) : wfs

  const addWorkflow = () => {
    const wf: Workflow = { id: uid('wf'), name: 'Nouveau workflow', event: { type: 'click' }, actions: [] }
    setWorkflows([...wfs, wf])
    setSelId(wf.id)
  }
  const updateWf = (id: string, patch: Partial<Workflow>) => setWorkflows(wfs.map((w) => (w.id === id ? { ...w, ...patch } : w)))
  const removeWf = (id: string) => { setWorkflows(wfs.filter((w) => w.id !== id)); if (selId === id) setSelId(wfs.find((w) => w.id !== id)?.id ?? null) }
  const duplicateWf = (id: string) => {
    const src = wfs.find((w) => w.id === id); if (!src) return
    const copy: Workflow = { ...structuredClone(src), id: uid('wf'), name: `${src.name} (copie)`, actions: src.actions.map((a) => ({ ...structuredClone(a), id: uid('act') })) }
    const i = wfs.findIndex((w) => w.id === id)
    setWorkflows([...wfs.slice(0, i + 1), copy, ...wfs.slice(i + 1)])
    setSelId(copy.id)
  }

  const wfMenuItems = (): MenuItem[] => {
    if (!menu) return []
    const w = wfs.find((x) => x.id === menu.wfId)
    if (!w) return []
    return [
      { type: 'label', text: w.name },
      { type: 'separator' },
      { type: 'action', label: 'Dupliquer', icon: <Copy size={15} />, onClick: () => duplicateWf(w.id) },
      { type: 'action', label: w.disabled ? 'Activer' : 'Désactiver', icon: w.disabled ? <Play size={15} /> : <Pause size={15} />, onClick: () => updateWf(w.id, { disabled: !w.disabled }) },
      { type: 'separator' },
      { type: 'action', label: 'Supprimer', danger: true, icon: <Trash2 size={15} />, onClick: () => removeWf(w.id) },
    ]
  }

  return (
    <div className="flex h-full">
      {/* ── Liste des workflows ── */}
      <div className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
        <div className="space-y-2 p-2">
          <Button onClick={addWorkflow} icon={<Plus size={14} />} className="w-full justify-center">Workflow</Button>
          {wfs.length > 4 && (
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer…"
                className="w-full rounded border border-slate-200 bg-white py-1 pl-7 pr-2 text-xs text-slate-700 placeholder:text-slate-400" />
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {visible.map((w) => {
            const tm = triggerMeta(w, allEls, pages)
            const active = current?.id === w.id
            return (
              <button key={w.id} type="button" onClick={() => setSelId(w.id)}
                onContextMenu={(e) => { e.preventDefault(); setMenu({ pos: { top: e.clientY, left: e.clientX, minWidth: 190 }, wfId: w.id }) }}
                className={`mb-1 w-full rounded-md border px-2 py-1.5 text-left ${active ? 'border-blue-300 bg-blue-50' : 'border-transparent hover:border-slate-200 hover:bg-white'} ${w.disabled ? 'opacity-55' : ''}`}>
                <div className="flex items-center gap-1.5">
                  <Zap size={13} className={w.disabled ? 'text-slate-400' : 'text-amber-500'} />
                  <span className={`flex-1 truncate text-sm ${active ? 'font-medium text-blue-800' : 'text-slate-700'}`}>{w.name}</span>
                  {w.disabled && <span className="rounded bg-slate-200 px-1 text-[9px] font-semibold uppercase text-slate-500">off</span>}
                </div>
                <div className="mt-0.5 flex items-center gap-1 pl-[19px] text-[11px] text-slate-400">
                  <tm.Icon size={11} /> <span className="truncate">{tm.text}</span>
                  <span className="ml-auto shrink-0 tabular-nums">{w.actions.length} act.</span>
                </div>
              </button>
            )
          })}
          {visible.length === 0 && <div className="px-2 py-4 text-center text-xs text-slate-400">{wfs.length ? 'Aucun résultat.' : 'Aucun workflow'}</div>}
        </div>
      </div>

      {/* ── Détail ── */}
      <div className="flex-1 overflow-auto p-4">
        {current ? (
          <WorkflowDetail key={current.id} wf={current} els={allEls} inputs={inputs} dataTypes={def.dataTypes} reports={def.reports ?? []} pages={pages}
            onChange={(p) => updateWf(current.id, p)} onDuplicate={() => duplicateWf(current.id)} onRemove={() => removeWf(current.id)} />
        ) : (
          <div className="mx-auto max-w-md pt-16 text-center">
            <Zap size={32} className="mx-auto mb-3 text-amber-400" />
            <div className="mb-1 text-sm font-medium text-slate-600">Automatisez votre application</div>
            <div className="mb-4 text-xs text-slate-400">Un workflow réagit à un événement (clic, saisie, chargement de page) et enchaîne des actions : créer des données, naviguer, afficher un message…</div>
            <Button onClick={addWorkflow} icon={<Plus size={14} />}>Créer un premier workflow</Button>
          </div>
        )}
      </div>
      {menu && <MenuDropdown items={wfMenuItems()} pos={menu.pos} onClose={() => setMenu(null)} />}
    </div>
  )
}

function WorkflowDetail({ wf, els, inputs, dataTypes, reports, pages, onChange, onDuplicate, onRemove }: {
  wf: Workflow
  els: { id: string; name: string; type: string; page: string }[]
  inputs: DynInputs[]
  dataTypes: { id: string; name: string; fields: { name: string }[] }[]
  reports: Report[]
  pages: { id: string; name: string }[]
  onChange: (patch: Partial<Workflow>) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  const clickable = els.filter((e) => !['page'].includes(e.type))
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(wf.actions.length <= 2 ? wf.actions.map((a) => a.id) : []))
  const [addMenu, setAddMenu] = useState<{ pos: MenuDropdownPos; at: number } | null>(null)
  const [drop, setDrop] = useState<{ id: string; before: boolean } | null>(null)

  const toggleExpand = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const setAction = (id: string, a: Action) => onChange({ actions: wf.actions.map((x) => (x.id === id ? a : x)) })
  const addAction = (type: ActionType, at: number) => {
    const a = newAction(type, dataTypes[0]?.name ?? '', pages[0]?.id ?? '', reports[0]?.id ?? '')
    const next = wf.actions.slice(); next.splice(at, 0, a)
    onChange({ actions: next })
    setExpanded((s) => new Set(s).add(a.id))
  }
  const removeAction = (id: string) => onChange({ actions: wf.actions.filter((x) => x.id !== id) })
  const duplicateAction = (id: string) => {
    const i = wf.actions.findIndex((x) => x.id === id); if (i < 0) return
    const copy = { ...structuredClone(wf.actions[i]), id: uid('act') }
    onChange({ actions: [...wf.actions.slice(0, i + 1), copy, ...wf.actions.slice(i + 1)] })
  }
  const moveActionTo = (dragId: string, targetId: string, before: boolean) => {
    if (dragId === targetId) return
    const src = wf.actions.find((a) => a.id === dragId); if (!src) return
    const rest = wf.actions.filter((a) => a.id !== dragId)
    const ti = rest.findIndex((a) => a.id === targetId); if (ti < 0) return
    rest.splice(before ? ti : ti + 1, 0, src)
    onChange({ actions: rest })
  }

  const addMenuItems = (at: number): MenuItem[] =>
    ACTIONS_BY_FAMILY.flatMap(({ family, items }) => [
      { type: 'label' as const, text: FAMILIES[family].label },
      ...items.map(([t, m]) => ({ type: 'action' as const, label: m.label, icon: <m.Icon size={14} />, onClick: () => addAction(t, at) })),
    ])

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1"><Input value={wf.name} onChange={(e) => onChange({ name: e.target.value })} className="text-lg font-semibold" /></div>
        <Switch on={!wf.disabled} onChange={(v) => onChange({ disabled: !v })} title={wf.disabled ? 'Workflow désactivé — cliquer pour activer' : 'Workflow actif — cliquer pour désactiver'} />
        <button type="button" title="Dupliquer le workflow" onClick={onDuplicate} className="rounded-md p-2 text-slate-400 hover:bg-slate-100"><Copy size={15} /></button>
        <button type="button" title="Supprimer le workflow" onClick={onRemove} className="rounded-md p-2 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
      </div>
      {wf.disabled && <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">Ce workflow est désactivé : il ne s’exécute pas dans l’application.</div>}

      {/* Déclencheur */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-700"><Zap size={14} /> Quand…</div>
        <div className="flex flex-wrap items-center gap-2">
          <Sel value={wf.event.type} width={220} onChange={(v) => onChange({ event: { type: v as Workflow['event']['type'] } })}
            options={[{ value: 'click', label: 'Un élément est cliqué' }, { value: 'inputChange', label: 'Une saisie change' }, { value: 'pageLoad', label: 'Une page se charge' }]} />
          {wf.event.type === 'pageLoad' ? (
            <Sel value={wf.event.pageId ?? ''} width={220} onChange={(v) => onChange({ event: { ...wf.event, pageId: v } })}
              options={[{ value: '', label: '(choisir une page)' }, ...pages.map((p) => ({ value: p.id, label: p.name }))]} />
          ) : (
            <Sel value={wf.event.elementId ?? ''} width={260} onChange={(v) => onChange({ event: { ...wf.event, elementId: v } })}
              options={[{ value: '', label: '(choisir un élément)' }, ...clickable.map((e) => ({ value: e.id, label: `${e.page} · ${e.name} (${e.type})` }))]} />
          )}
        </div>
      </div>

      {/* Fil des actions */}
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-500"><ChevronRight size={14} /> Alors, faire…</div>
      <div className="relative space-y-2">
        {/* Ligne verticale du fil */}
        {wf.actions.length > 1 && <div className="pointer-events-none absolute bottom-5 left-[22px] top-5 w-px bg-slate-200" />}
        {wf.actions.map((a, i) => {
          const meta = ACTION_META[a.type]
          const fam = FAMILIES[meta.family]
          const open = expanded.has(a.id)
          const summary = summarizeAction(a, { pages, reports })
          return (
            <div key={a.id}
              className={`relative rounded-lg border bg-white transition-shadow ${drop?.id === a.id ? '' : ''} ${a.disabled ? 'opacity-55' : ''} border-slate-200`}
              draggable
              onDragStart={(e) => { e.dataTransfer.setData(ACT_DRAG_MIME, a.id); e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(ACT_DRAG_MIME)) return
                e.preventDefault(); e.dataTransfer.dropEffect = 'move'
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setDrop({ id: a.id, before: e.clientY < r.top + r.height / 2 })
              }}
              onDragLeave={() => setDrop((d) => (d?.id === a.id ? null : d))}
              onDrop={(e) => {
                const dragId = e.dataTransfer.getData(ACT_DRAG_MIME)
                setDrop(null)
                if (!dragId) return
                e.preventDefault()
                const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                moveActionTo(dragId, a.id, e.clientY < r.top + r.height / 2)
              }}>
              {drop?.id === a.id && <div className="pointer-events-none absolute inset-x-2 z-10 h-[3px] rounded bg-blue-500" style={drop.before ? { top: -2 } : { bottom: -2 }} />}
              {/* En-tête de la carte (cliquable pour déplier) */}
              <div className="flex cursor-pointer items-center gap-2 px-2.5 py-2" onClick={() => toggleExpand(a.id)}>
                <GripVertical size={13} className="shrink-0 cursor-grab text-slate-300" />
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: fam.bg, color: fam.fg }}>{i + 1}</span>
                <meta.Icon size={14} className="shrink-0" style={{ color: fam.fg }} />
                <span className="shrink-0 text-[13px] font-medium text-slate-700">{meta.label}</span>
                {summary && <span className="min-w-0 flex-1 truncate text-xs text-slate-400" title={summary}>{summary}</span>}
                {!summary && <span className="flex-1" />}
                {a.condition !== undefined && <span title="Exécution conditionnelle" className="flex shrink-0 items-center gap-0.5 rounded bg-violet-100 px-1 py-0.5 text-[9px] font-semibold uppercase text-violet-600"><Filter size={9} /> si</span>}
                <Switch on={!a.disabled} onChange={(v) => setAction(a.id, { ...a, disabled: !v || undefined })} title={a.disabled ? 'Action désactivée' : 'Action active'} />
                <button type="button" title="Dupliquer" onClick={(e) => { e.stopPropagation(); duplicateAction(a.id) }} className="rounded p-1 text-slate-400 hover:bg-slate-100"><Copy size={13} /></button>
                <button type="button" title="Supprimer" onClick={(e) => { e.stopPropagation(); removeAction(a.id) }} className="rounded p-1 text-red-400 hover:bg-red-50"><Trash2 size={13} /></button>
                {open ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
              </div>
              {open && (
                <div className="border-t border-slate-100 px-3 pb-3 pt-2.5">
                  <div className="mb-2">
                    <Sel value={a.type} onChange={(v) => setAction(a.id, { ...newAction(v as ActionType, dataTypes[0]?.name ?? '', pages[0]?.id ?? '', reports[0]?.id ?? '', a.id), condition: a.condition, disabled: a.disabled })}
                      options={(Object.entries(ACTION_META) as [ActionType, (typeof ACTION_META)[ActionType]][]).map(([t, m]) => ({ value: t, label: `${FAMILIES[m.family].label} · ${m.label}` }))} />
                  </div>
                  <ActionConfig action={a} onChange={(na) => setAction(a.id, na)} inputs={inputs} dataTypes={dataTypes} reports={reports} pages={pages} />
                  <ConditionEditor action={a} onChange={(na) => setAction(a.id, na)} inputs={inputs} dataTypes={dataTypes} />
                </div>
              )}
            </div>
          )
        })}
        {wf.actions.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
            Aucune action pour l’instant — ajoutez-en une ci-dessous.
          </div>
        )}
      </div>

      {/* Ajout d'action : menu groupé */}
      <div>
        <button type="button"
          onClick={(e) => setAddMenu({ pos: { top: e.clientY, left: e.clientX, minWidth: 250 }, at: wf.actions.length })}
          className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700">
          <Plus size={13} /> Ajouter une action
        </button>
      </div>
      {addMenu && <MenuDropdown items={addMenuItems(addMenu.at)} pos={addMenu.pos} onClose={() => setAddMenu(null)} />}
    </div>
  )
}

/** Bloc « Seulement si… » : condition optionnelle qui gate l'exécution de l'action. */
function ConditionEditor({ action, onChange, inputs, dataTypes }: {
  action: Action
  onChange: (a: Action) => void
  inputs: DynInputs[]
  dataTypes: { name: string; fields: { name: string }[] }[]
}) {
  const has = action.condition !== undefined
  return (
    <div className="mt-2 border-t border-dashed border-slate-100 pt-2">
      <Checkbox checked={has} label="Seulement si…"
        onChange={(c) => onChange({ ...action, condition: c ? { t: 'static', v: 'true' } : undefined } as Action)} />
      {has && (
        <div className="mt-1.5 flex items-start gap-1.5">
          <Filter size={13} className="mt-2 shrink-0 text-slate-400" />
          <div className="flex-1"><DynEditor value={action.condition} onChange={(v) => onChange({ ...action, condition: v } as Action)} inputs={inputs} dataTypes={dataTypes} allowSearch /></div>
        </div>
      )}
    </div>
  )
}

function ActionConfig({ action, onChange, inputs, dataTypes, reports, pages }: {
  action: Action
  onChange: (a: Action) => void
  inputs: DynInputs[]
  dataTypes: { name: string; fields: { name: string }[] }[]
  reports: Report[]
  pages: { id: string; name: string }[]
}) {
  if (action.type === 'navigate') {
    return <Sel value={action.pageId} onChange={(v) => onChange({ ...action, pageId: v })} options={pages.map((p) => ({ value: p.id, label: p.name }))} />
  }
  if (action.type === 'goBack') {
    return <div className="text-xs text-slate-400">Revient à la page précédente.</div>
  }
  if (action.type === 'openUrl') {
    return (
      <div className="space-y-2">
        <Field label="URL"><DynEditor value={action.url} onChange={(v) => onChange({ ...action, url: v })} inputs={inputs} dataTypes={dataTypes} allowSearch /></Field>
        <Checkbox checked={action.newTab !== false} label="Ouvrir dans un nouvel onglet" onChange={(c) => onChange({ ...action, newTab: c })} />
      </div>
    )
  }
  if (action.type === 'copyToClipboard') {
    return <Field label="Texte à copier"><DynEditor value={action.text} onChange={(v) => onChange({ ...action, text: v })} inputs={inputs} dataTypes={dataTypes} allowSearch /></Field>
  }
  if (action.type === 'generatePdf') {
    return (
      <Field label="Rapport">
        <Sel value={action.reportId} onChange={(v) => onChange({ ...action, reportId: v })}
          options={reports.length ? reports.map((r) => ({ value: r.id, label: r.name })) : [{ value: '', label: '(créez un rapport dans l’onglet Rapports)' }]} />
      </Field>
    )
  }
  if (action.type === 'showAlert') {
    return <Field label="Message"><DynEditor value={action.message} onChange={(v) => onChange({ ...action, message: v })} inputs={inputs} dataTypes={dataTypes} allowSearch /></Field>
  }
  if (action.type === 'setState') {
    return (
      <div className="space-y-2">
        <Field label="Variable"><Input value={action.key} onChange={(e) => onChange({ ...action, key: e.target.value })} placeholder="ex: filtreActif" /></Field>
        <Field label="Valeur"><DynEditor value={action.value} onChange={(v) => onChange({ ...action, value: v })} inputs={inputs} dataTypes={dataTypes} allowSearch /></Field>
      </div>
    )
  }
  if (action.type === 'resetInputs') {
    return <div className="text-xs text-slate-400">Vide tous les champs de saisie de la page.</div>
  }
  if (action.type === 'refreshData') {
    return <div className="text-xs text-slate-400">Recharge les listes et groupes répétés de la page.</div>
  }
  if (action.type === 'wait') {
    return (
      <Field label="Durée (millisecondes, max 10 000)">
        <Input type="number" value={String(action.ms ?? 0)} onChange={(e) => onChange({ ...action, ms: Math.min(10000, Math.max(0, Number(e.target.value) || 0)) })} />
      </Field>
    )
  }
  if (action.type === 'confirm') {
    return (
      <div className="space-y-1">
        <Field label="Question posée à l’utilisateur"><DynEditor value={action.message} onChange={(v) => onChange({ ...action, message: v })} inputs={inputs} dataTypes={dataTypes} allowSearch /></Field>
        <div className="text-[11px] text-slate-400">Si l’utilisateur annule, les actions suivantes ne s’exécutent pas.</div>
      </div>
    )
  }

  // createRecord / updateRecord / deleteRecord
  const dt = dataTypes.find((t) => t.name === action.dataType)
  return (
    <div className="space-y-2">
      <Field label="Type de données">
        <Sel value={action.dataType} onChange={(v) => onChange({ ...action, dataType: v })}
          options={dataTypes.length ? dataTypes.map((t) => ({ value: t.name, label: t.name })) : [{ value: '', label: '(aucun type)' }]} />
      </Field>
      {(action.type === 'updateRecord' || action.type === 'deleteRecord') && (
        <Field label="Enregistrement cible"><DynEditor value={action.recordRef} onChange={(v) => onChange({ ...action, recordRef: v })} inputs={inputs} dataTypes={dataTypes} allowSearch /></Field>
      )}
      {(action.type === 'createRecord' || action.type === 'updateRecord') && (
        <div className="rounded-md border border-slate-200 p-2">
          <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-500"><ChevronRight size={12} /> Valeurs des champs</div>
          <div className="space-y-2">
            {(dt?.fields ?? []).map((f) => (
              <Field key={f.name} label={f.name}>
                <DynEditor value={(action.fields ?? {})[f.name]} onChange={(v) => onChange({ ...action, fields: { ...action.fields, [f.name]: v } })} inputs={inputs} dataTypes={dataTypes} allowSearch />
              </Field>
            ))}
            {!dt && <div className="text-xs text-slate-400">Choisissez un type de données.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}

function newAction(type: ActionType, dataType: string, pageId: string, reportId: string, id?: string): Action {
  const aid = id ?? uid('act')
  const empty: Dyn = { t: 'static', v: '' }
  switch (type) {
    case 'createRecord':    return { id: aid, type, dataType, fields: {} }
    case 'updateRecord':    return { id: aid, type, dataType, recordRef: empty, fields: {} }
    case 'deleteRecord':    return { id: aid, type, dataType, recordRef: empty }
    case 'navigate':        return { id: aid, type, pageId }
    case 'setState':        return { id: aid, type, key: '', value: empty }
    case 'showAlert':       return { id: aid, type, message: empty }
    case 'resetInputs':     return { id: aid, type }
    case 'openUrl':         return { id: aid, type, url: empty, newTab: true }
    case 'copyToClipboard': return { id: aid, type, text: empty }
    case 'goBack':          return { id: aid, type }
    case 'generatePdf':     return { id: aid, type, reportId }
    case 'wait':            return { id: aid, type, ms: 500 }
    case 'confirm':         return { id: aid, type, message: { t: 'static', v: 'Êtes-vous sûr ?' } }
    case 'refreshData':     return { id: aid, type }
  }
}
