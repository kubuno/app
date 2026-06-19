import { useMemo, useState } from 'react'
import { Plus, Trash2, Zap, ChevronRight, ChevronUp, ChevronDown, Copy, Filter } from 'lucide-react'
import { Button, Input, Dropdown, Checkbox } from '@ui'
import type { Action, ActionType, Dyn, Element, Report, Workflow } from '../types'
import { useBuilder, uid } from '../store'
import DynEditor, { type DynInputs } from './DynEditor'

/** Liste déroulante compacte (primitive @ui Dropdown). */
function Sel({ value, onChange, options, width }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; width?: number | string }) {
  return <Dropdown value={value} onChange={onChange} options={options} width={width ?? '100%'} />
}

// Actions groupées par famille → menu d'ajout plus lisible (mais toujours simple).
const ACTION_GROUPS: { group: string; items: { value: ActionType; label: string }[] }[] = [
  { group: 'Données', items: [
    { value: 'createRecord', label: 'Créer un enregistrement' },
    { value: 'updateRecord', label: 'Modifier un enregistrement' },
    { value: 'deleteRecord', label: 'Supprimer un enregistrement' },
  ]},
  { group: 'Navigation', items: [
    { value: 'navigate',     label: 'Aller à une page' },
    { value: 'openUrl',      label: 'Ouvrir un lien (URL)' },
    { value: 'goBack',       label: 'Revenir en arrière' },
  ]},
  { group: 'Interface', items: [
    { value: 'showAlert',    label: 'Afficher un message' },
    { value: 'setState',     label: 'Définir une variable d’état' },
    { value: 'resetInputs',  label: 'Réinitialiser les champs' },
    { value: 'copyToClipboard', label: 'Copier dans le presse-papier' },
  ]},
  { group: 'Documents', items: [
    { value: 'generatePdf',  label: 'Générer un rapport PDF' },
  ]},
]
const ACTION_TYPES: { value: ActionType; label: string }[] = ACTION_GROUPS.flatMap((g) => g.items)
const actionLabel = (t: ActionType) => ACTION_TYPES.find((a) => a.value === t)?.label ?? t


/** Éditeur de workflows : chaque workflow = un déclencheur (événement) + une
 *  suite d'actions exécutées en séquence par le runtime. */
export default function WorkflowEditor() {
  const def = useBuilder((s) => s.def)
  const setWorkflows = useBuilder((s) => s.setWorkflows)
  const [selId, setSelId] = useState<string | null>(def?.workflows[0]?.id ?? null)

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
  const current = wfs.find((w) => w.id === selId) ?? wfs[0]

  const addWorkflow = () => {
    const wf: Workflow = { id: uid('wf'), name: 'Nouveau workflow', event: { type: 'click' }, actions: [] }
    setWorkflows([...wfs, wf])
    setSelId(wf.id)
  }
  const updateWf = (id: string, patch: Partial<Workflow>) => setWorkflows(wfs.map((w) => (w.id === id ? { ...w, ...patch } : w)))
  const removeWf = (id: string) => { setWorkflows(wfs.filter((w) => w.id !== id)); if (selId === id) setSelId(wfs[0]?.id ?? null) }

  return (
    <div className="flex h-full">
      <div className="w-56 shrink-0 overflow-auto border-r border-slate-200 bg-slate-50 p-2">
        <div className="mb-2"><Button onClick={addWorkflow} icon={<Plus size={14} />} className="w-full justify-center">Workflow</Button></div>
        {wfs.map((w) => (
          <button key={w.id} type="button" onClick={() => setSelId(w.id)}
            className={`mb-1 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm ${current?.id === w.id ? 'bg-blue-100 text-blue-800' : 'text-slate-700 hover:bg-slate-100'}`}>
            <Zap size={13} className="text-amber-500" /> <span className="flex-1 truncate">{w.name}</span>
          </button>
        ))}
        {wfs.length === 0 && <div className="px-2 py-4 text-center text-xs text-slate-400">Aucun workflow</div>}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {current ? (
          <WorkflowDetail key={current.id} wf={current} els={allEls} inputs={inputs} dataTypes={def.dataTypes} reports={def.reports ?? []} pages={def.pages.map((p) => ({ id: p.id, name: p.name }))}
            onChange={(p) => updateWf(current.id, p)} onRemove={() => removeWf(current.id)} />
        ) : (
          <div className="text-sm text-slate-400">Créez un workflow pour réagir aux clics, au chargement de page, etc.</div>
        )}
      </div>
    </div>
  )
}

function WorkflowDetail({ wf, els, inputs, dataTypes, reports, pages, onChange, onRemove }: {
  wf: Workflow
  els: { id: string; name: string; type: string; page: string }[]
  inputs: DynInputs[]
  dataTypes: { id: string; name: string; fields: { name: string }[] }[]
  reports: Report[]
  pages: { id: string; name: string }[]
  onChange: (patch: Partial<Workflow>) => void
  onRemove: () => void
}) {
  const clickable = els.filter((e) => !['page'].includes(e.type))
  const setAction = (id: string, a: Action) => onChange({ actions: wf.actions.map((x) => (x.id === id ? a : x)) })
  const addAction = (type: ActionType) => onChange({ actions: [...wf.actions, newAction(type, dataTypes[0]?.name ?? '', pages[0]?.id ?? '', reports[0]?.id ?? '')] })
  const removeAction = (id: string) => onChange({ actions: wf.actions.filter((x) => x.id !== id) })
  const duplicateAction = (id: string) => {
    const i = wf.actions.findIndex((x) => x.id === id); if (i < 0) return
    const copy = { ...structuredClone(wf.actions[i]), id: uid('act') }
    onChange({ actions: [...wf.actions.slice(0, i + 1), copy, ...wf.actions.slice(i + 1)] })
  }
  const moveAction = (id: string, dir: -1 | 1) => {
    const i = wf.actions.findIndex((x) => x.id === id); const j = i + dir
    if (i < 0 || j < 0 || j >= wf.actions.length) return
    const next = wf.actions.slice(); [next[i], next[j]] = [next[j], next[i]]
    onChange({ actions: next })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1"><Input value={wf.name} onChange={(e) => onChange({ name: e.target.value })} className="text-lg font-semibold" /></div>
        <button type="button" onClick={onRemove} className="rounded-md p-2 text-red-500 hover:bg-red-50"><Trash2 size={16} /></button>
      </div>

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

      {/* Actions : « Alors… » */}
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-500"><ChevronRight size={14} /> Alors, faire…</div>
      <div className="space-y-2">
        {wf.actions.map((a, i) => (
          <div key={a.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">{i + 1}</span>
              <div className="flex-1"><Sel value={a.type} onChange={(v) => setAction(a.id, { ...newAction(v as ActionType, dataTypes[0]?.name ?? '', pages[0]?.id ?? '', reports[0]?.id ?? '', a.id), condition: a.condition })}
                options={ACTION_TYPES.map((t) => ({ value: t.value, label: t.label }))} /></div>
              <button type="button" title="Monter" onClick={() => moveAction(a.id, -1)} disabled={i === 0} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ChevronUp size={14} /></button>
              <button type="button" title="Descendre" onClick={() => moveAction(a.id, 1)} disabled={i === wf.actions.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ChevronDown size={14} /></button>
              <button type="button" title="Dupliquer" onClick={() => duplicateAction(a.id)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><Copy size={14} /></button>
              <button type="button" title="Supprimer" onClick={() => removeAction(a.id)} className="rounded p-1 text-red-400 hover:bg-red-50"><Trash2 size={14} /></button>
            </div>
            <ActionConfig action={a} onChange={(na) => setAction(a.id, na)} inputs={inputs} dataTypes={dataTypes} reports={reports} pages={pages} />
            <ConditionEditor action={a} onChange={(na) => setAction(a.id, na)} inputs={inputs} dataTypes={dataTypes} />
          </div>
        ))}
        {wf.actions.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">Ajoutez une première action ci-dessous.</div>}
      </div>

      <div className="space-y-2">
        {ACTION_GROUPS.map((g) => (
          <div key={g.group} className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.group}</span>
            {g.items.map((t) => (
              <Button key={t.value} variant="secondary" size="sm" icon={<Plus size={12} />} onClick={() => addAction(t.value)}>{t.label}</Button>
            ))}
          </div>
        ))}
      </div>
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
  }
}
