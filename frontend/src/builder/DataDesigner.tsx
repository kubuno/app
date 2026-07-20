import { useEffect, useRef, useState } from 'react'
import {
  Plus, Trash2, Database, RefreshCw, Users, Search, Copy, Download, Upload,
  Type as TypeIcon, AlignLeft, Hash, ToggleLeft, Calendar, List, GripVertical,
  ChevronUp, ChevronDown, CheckSquare, Square,
} from 'lucide-react'
import { prompt } from '@kubuno/sdk'
import { Button, Input, Dropdown, Checkbox, MenuDropdown, type MenuItem, type MenuDropdownPos } from '@ui'
import type { DataType, Field, FieldType } from '../types'
import { useBuilder, uid } from '../store'
import { appApi, type DataRecord } from '../api'

const FIELD_TYPES: { value: FieldType; label: string; Icon: React.ComponentType<{ size?: number | string; className?: string }> }[] = [
  { value: 'text', label: 'Texte', Icon: TypeIcon },
  { value: 'longtext', label: 'Texte long', Icon: AlignLeft },
  { value: 'number', label: 'Nombre', Icon: Hash },
  { value: 'boolean', label: 'Booléen', Icon: ToggleLeft },
  { value: 'date', label: 'Date', Icon: Calendar },
  { value: 'option', label: 'Liste de choix', Icon: List },
]
const fieldIcon = (t: FieldType) => FIELD_TYPES.find((x) => x.value === t)?.Icon ?? TypeIcon
const FIELD_DRAG_MIME = 'application/x-app-field'

/** Concepteur de données : types (« Things »), champs et données réelles. */
export default function DataDesigner() {
  const def = useBuilder((s) => s.def)
  const appId = useBuilder((s) => s.appId)
  const setDataTypes = useBuilder((s) => s.setDataTypes)
  const [sel, setSel] = useState<string | null>(def?.dataTypes[0]?.id ?? null)
  const [menu, setMenu] = useState<{ pos: MenuDropdownPos; typeId: string } | null>(null)

  if (!def) return null
  const types = def.dataTypes
  const current = types.find((t) => t.id === sel) ?? types[0]

  const addType = async () => {
    const name = await prompt({ title: 'Nouveau type de données', message: 'Nom (ex : Tâche, Client)', placeholder: 'Tâche', confirmLabel: 'Créer' })
    if (!name?.trim()) return
    const dt: DataType = { id: uid('dt'), name: name.trim(), fields: [{ id: uid('f'), name: 'titre', type: 'text' }] }
    setDataTypes([...types, dt])
    setSel(dt.id)
  }

  const updateType = (id: string, patch: Partial<DataType>) =>
    setDataTypes(types.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  const removeType = (id: string) => {
    setDataTypes(types.filter((t) => t.id !== id))
    if (sel === id) setSel(types.find((t) => t.id !== id)?.id ?? null)
  }
  const duplicateType = (id: string) => {
    const src = types.find((t) => t.id === id); if (!src) return
    const copy: DataType = { ...structuredClone(src), id: uid('dt'), name: `${src.name} (copie)`, fields: src.fields.map((f) => ({ ...f, id: uid('f') })) }
    setDataTypes([...types, copy])
    setSel(copy.id)
  }

  const typeMenuItems = (): MenuItem[] => {
    if (!menu) return []
    const t = types.find((x) => x.id === menu.typeId)
    if (!t) return []
    return [
      { type: 'label', text: t.name },
      { type: 'separator' },
      { type: 'action', label: 'Dupliquer le type', icon: <Copy size={15} />, onClick: () => duplicateType(t.id) },
      { type: 'action', label: 'Supprimer', danger: true, icon: <Trash2 size={15} />, onClick: () => removeType(t.id) },
    ]
  }

  return (
    <div className="flex h-full">
      <div className="w-52 shrink-0 overflow-auto border-r border-slate-200 bg-slate-50 p-2">
        <div className="mb-2"><Button onClick={addType} icon={<Plus size={14} />} className="w-full justify-center">Type</Button></div>
        {types.map((t) => (
          <button key={t.id} type="button" onClick={() => setSel(t.id)}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ pos: { top: e.clientY, left: e.clientX, minWidth: 180 }, typeId: t.id }) }}
            className={`mb-1 w-full rounded-md border px-2 py-1.5 text-left ${current?.id === t.id ? 'border-blue-300 bg-blue-50' : 'border-transparent hover:border-slate-200 hover:bg-white'}`}>
            <div className="flex items-center gap-1.5">
              <Database size={13} className="shrink-0 text-blue-500" />
              <span className={`flex-1 truncate text-sm ${current?.id === t.id ? 'font-medium text-blue-800' : 'text-slate-700'}`}>{t.name}</span>
              {t.shared && <Users size={11} className="shrink-0 text-violet-500" aria-label="Partagé" />}
            </div>
            <div className="mt-0.5 pl-[19px] text-[11px] text-slate-400">{t.fields.length} champ{t.fields.length > 1 ? 's' : ''}</div>
          </button>
        ))}
        {types.length === 0 && <div className="px-2 py-4 text-center text-xs text-slate-400">Aucun type</div>}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {current ? (
          <TypeEditor key={current.id} type={current} appId={appId} onChange={(p) => updateType(current.id, p)} onRemove={() => removeType(current.id)} />
        ) : (
          <div className="mx-auto max-w-md pt-16 text-center">
            <Database size={32} className="mx-auto mb-3 text-blue-400" />
            <div className="mb-1 text-sm font-medium text-slate-600">Modélisez vos données</div>
            <div className="mb-4 text-xs text-slate-400">Un type de données (« Thing ») décrit une entité de votre app : Tâche, Client, Produit… avec ses champs.</div>
            <Button onClick={addType} icon={<Plus size={14} />}>Créer un premier type</Button>
          </div>
        )}
      </div>
      {menu && <MenuDropdown items={typeMenuItems()} pos={menu.pos} onClose={() => setMenu(null)} />}
    </div>
  )
}

function TypeEditor({ type, appId, onChange, onRemove }: {
  type: DataType
  appId: string | null
  onChange: (patch: Partial<DataType>) => void
  onRemove: () => void
}) {
  const [fieldDrop, setFieldDrop] = useState<{ id: string; before: boolean } | null>(null)
  const setField = (id: string, patch: Partial<Field>) =>
    onChange({ fields: type.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  const addField = () => onChange({ fields: [...type.fields, { id: uid('f'), name: `champ${type.fields.length + 1}`, type: 'text' }] })
  const removeField = (id: string) => onChange({ fields: type.fields.filter((f) => f.id !== id) })
  const duplicateField = (id: string) => {
    const i = type.fields.findIndex((f) => f.id === id); if (i < 0) return
    const copy: Field = { ...type.fields[i], id: uid('f'), name: `${type.fields[i].name}_copie` }
    onChange({ fields: [...type.fields.slice(0, i + 1), copy, ...type.fields.slice(i + 1)] })
  }
  const moveField = (dragId: string, targetId: string, before: boolean) => {
    if (dragId === targetId) return
    const src = type.fields.find((f) => f.id === dragId); if (!src) return
    const rest = type.fields.filter((f) => f.id !== dragId)
    const ti = rest.findIndex((f) => f.id === targetId); if (ti < 0) return
    rest.splice(before ? ti : ti + 1, 0, src)
    onChange({ fields: rest })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Input value={type.name} onChange={(e) => onChange({ name: e.target.value })} className="text-lg font-semibold" />
        <button type="button" onClick={onRemove} className="ml-auto rounded-md p-2 text-red-500 hover:bg-red-50" title="Supprimer le type"><Trash2 size={16} /></button>
      </div>

      {/* Données partagées : pool commun multi-utilisateurs (collaboratif/temps réel). */}
      <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
        <Users size={15} className="mt-0.5 shrink-0 text-violet-600" />
        <span className="flex-1">
          <Checkbox checked={!!type.shared} label="Partagé entre tous les utilisateurs" onChange={(c) => onChange({ shared: c })} />
          <span className="mt-0.5 block text-[11px] text-slate-500">Les enregistrements sont communs à tous les comptes (avec l’identité du créateur). Requis pour le collaboratif/temps réel (ex. messagerie). L’app doit être publiée pour que d’autres comptes y accèdent.</span>
        </span>
      </label>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-600">Champs</h3>
          <button type="button" onClick={addField} className="flex items-center gap-1 text-sm text-blue-600 hover:underline"><Plus size={14} /> Champ</button>
        </div>
        <div className="space-y-1.5">
          {type.fields.map((f) => {
            const FIcon = fieldIcon(f.type)
            return (
              <div key={f.id}
                className="relative flex items-center gap-2 rounded-md border border-slate-200 bg-white p-2"
                draggable
                onDragStart={(e) => { e.dataTransfer.setData(FIELD_DRAG_MIME, f.id); e.dataTransfer.effectAllowed = 'move' }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(FIELD_DRAG_MIME)) return
                  e.preventDefault(); e.dataTransfer.dropEffect = 'move'
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  setFieldDrop({ id: f.id, before: e.clientY < r.top + r.height / 2 })
                }}
                onDragLeave={() => setFieldDrop((d) => (d?.id === f.id ? null : d))}
                onDrop={(e) => {
                  const dragId = e.dataTransfer.getData(FIELD_DRAG_MIME)
                  setFieldDrop(null)
                  if (!dragId) return
                  e.preventDefault()
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                  moveField(dragId, f.id, e.clientY < r.top + r.height / 2)
                }}>
                {fieldDrop?.id === f.id && <div className="pointer-events-none absolute inset-x-2 z-10 h-[3px] rounded bg-blue-500" style={fieldDrop.before ? { top: -2 } : { bottom: -2 }} />}
                <GripVertical size={13} className="shrink-0 cursor-grab text-slate-300" />
                <FIcon size={14} className="shrink-0 text-slate-400" />
                <div className="flex-1"><Input value={f.name} onChange={(e) => setField(f.id, { name: e.target.value })} /></div>
                <Dropdown value={f.type} width={150} onChange={(v) => setField(f.id, { type: v as FieldType })}
                  options={FIELD_TYPES.map((ft) => ({ value: ft.value, label: ft.label }))} />
                {f.type === 'option' && (
                  <div className="w-40"><Input placeholder="opt1, opt2" value={(f.options ?? []).join(', ')}
                    onChange={(e) => setField(f.id, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></div>
                )}
                <button type="button" title="Dupliquer le champ" onClick={() => duplicateField(f.id)} className="text-slate-300 hover:text-slate-500"><Copy size={13} /></button>
                <button type="button" title="Supprimer le champ" onClick={() => removeField(f.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            )
          })}
        </div>
      </div>

      <RecordsTable type={type} appId={appId} />
    </div>
  )
}

// ── Table de données : tri serveur, recherche, édition inline, sélection, CSV ─

function parseCsv(text: string): string[][] {
  const delim = (text.split('\n')[0]?.split(';').length ?? 0) > (text.split('\n')[0]?.split(',').length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []; let cur = ''; let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else inQ = false } else cur += c }
    else if (c === '"') inQ = true
    else if (c === delim) { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else if (c !== '\r') cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

function toCsvCell(v: unknown): string {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function coerce(f: Field, raw: string): unknown {
  if (raw === '') return undefined
  if (f.type === 'number') return Number(raw)
  if (f.type === 'boolean') return /^(true|1|oui|yes)$/i.test(raw)
  return raw
}

function RecordsTable({ type, appId }: { type: DataType; appId: string | null }) {
  const [records, setRecords] = useState<DataRecord[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ field: string; desc: boolean } | null>(null)
  const [editing, setEditing] = useState<{ id: string; field: string; value: string } | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const reload = async () => {
    if (!appId) return
    setLoading(true)
    try {
      const res = await appApi.search(`apps/${appId}`, type.name, {
        search_text: q.trim() || undefined, sort_field: sort?.field, sort_desc: sort?.desc, limit: 500,
      })
      setRecords(res.results); setCount(res.count)
      setChecked(new Set())
    } catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { const t = setTimeout(reload, q ? 250 : 0); return () => clearTimeout(t) }, [appId, type.name, q, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    if (!appId) return
    const fields: Record<string, unknown> = {}
    for (const f of type.fields) {
      const v = coerce(f, draft[f.name] ?? '')
      if (v !== undefined) fields[f.name] = v
    }
    await appApi.createRecord(`apps/${appId}`, type.name, fields)
    setDraft({})
    reload()
  }
  const remove = async (id: string) => { if (appId) { await appApi.deleteRecord(`apps/${appId}`, type.name, id); reload() } }
  const removeChecked = async () => {
    if (!appId || !checked.size) return
    for (const id of checked) await appApi.deleteRecord(`apps/${appId}`, type.name, id)
    reload()
  }
  const duplicateRecord = async (r: DataRecord) => {
    if (!appId) return
    const fields: Record<string, unknown> = {}
    for (const f of type.fields) if (r[f.name] !== undefined) fields[f.name] = r[f.name]
    await appApi.createRecord(`apps/${appId}`, type.name, fields)
    reload()
  }
  const commitEdit = async () => {
    if (!appId || !editing) return
    const f = type.fields.find((x) => x.name === editing.field)
    if (f) await appApi.updateRecord(`apps/${appId}`, type.name, editing.id, { [f.name]: coerce(f, editing.value) ?? null })
    setEditing(null)
    reload()
  }

  const exportCsv = () => {
    const head = type.fields.map((f) => toCsvCell(f.name)).join(',')
    const lines = records.map((r) => type.fields.map((f) => toCsvCell(r[f.name])).join(','))
    const blob = new Blob(['﻿' + [head, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${type.name}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 3000)
  }
  const importCsv = async (file: File) => {
    if (!appId) return
    const rows = parseCsv(await file.text())
    if (rows.length < 2) { setStatus('CSV vide ou sans données.'); return }
    const header = rows[0].map((h) => h.trim())
    const mapped = type.fields.filter((f) => header.includes(f.name))
    if (!mapped.length) { setStatus(`Aucune colonne ne correspond aux champs (${type.fields.map((f) => f.name).join(', ')}).`); return }
    setStatus(`Import de ${rows.length - 1} ligne(s)…`)
    let ok = 0
    for (const row of rows.slice(1)) {
      const fields: Record<string, unknown> = {}
      for (const f of mapped) {
        const v = coerce(f, row[header.indexOf(f.name)] ?? '')
        if (v !== undefined) fields[f.name] = v
      }
      try { await appApi.createRecord(`apps/${appId}`, type.name, fields); ok++ } catch { /* skip */ }
    }
    setStatus(`${ok} enregistrement(s) importé(s).`)
    reload()
  }

  const toggleSort = (field: string) =>
    setSort((s) => (s?.field !== field ? { field, desc: false } : s.desc ? null : { field, desc: true }))
  const allChecked = records.length > 0 && checked.size === records.length

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-600">Données <span className="font-normal text-slate-400">({count})</span></h3>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…"
            className="w-44 rounded border border-slate-200 bg-white py-1 pl-6 pr-2 text-xs text-slate-700 placeholder:text-slate-400" />
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {checked.size > 0 && (
            <button type="button" onClick={removeChecked} className="flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-red-600 hover:bg-red-100">
              <Trash2 size={12} /> Supprimer ({checked.size})
            </button>
          )}
          <button type="button" onClick={exportCsv} disabled={!records.length} className="flex items-center gap-1 text-slate-500 hover:text-slate-700 disabled:opacity-40"><Download size={12} /> Exporter CSV</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-slate-500 hover:text-slate-700"><Upload size={12} /> Importer CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = '' }} />
          <button type="button" onClick={reload} className="flex items-center gap-1 text-slate-500 hover:text-slate-700"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Actualiser</button>
        </div>
      </div>
      {status && <div className="mb-2 rounded border border-blue-100 bg-blue-50 px-2 py-1 text-[11px] text-blue-700">{status}</div>}
      <div className="overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="w-7 px-2">
                <button type="button" title={allChecked ? 'Tout désélectionner' : 'Tout sélectionner'}
                  onClick={() => setChecked(allChecked ? new Set() : new Set(records.map((r) => r._id)))}
                  className="text-slate-400 hover:text-slate-600">
                  {allChecked ? <CheckSquare size={14} /> : <Square size={14} />}
                </button>
              </th>
              {type.fields.map((f) => (
                <th key={f.id} className="px-3 py-2 font-medium">
                  <button type="button" onClick={() => toggleSort(f.name)} className="flex items-center gap-1 hover:text-slate-700" title="Trier">
                    {f.name}
                    {sort?.field === f.name && (sort.desc ? <ChevronDown size={11} /> : <ChevronUp size={11} />)}
                  </button>
                </th>
              ))}
              <th className="w-14" />
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r._id} className={`border-t border-slate-100 ${checked.has(r._id) ? 'bg-blue-50/50' : ''}`}>
                <td className="px-2">
                  <button type="button" onClick={() => setChecked((s) => { const n = new Set(s); if (n.has(r._id)) n.delete(r._id); else n.add(r._id); return n })}
                    className="text-slate-300 hover:text-slate-500">
                    {checked.has(r._id) ? <CheckSquare size={14} className="text-blue-500" /> : <Square size={14} />}
                  </button>
                </td>
                {type.fields.map((f) => {
                  const isEd = editing?.id === r._id && editing.field === f.name
                  return (
                    <td key={f.id} className="cursor-text px-3 py-1.5 text-slate-700"
                      title="Double-clic pour modifier"
                      onDoubleClick={() => setEditing({ id: r._id, field: f.name, value: r[f.name] == null ? '' : String(r[f.name]) })}>
                      {isEd ? (
                        f.type === 'boolean' ? (
                          <Dropdown value={editing.value} width="100%" onChange={(v) => setEditing({ ...editing, value: v })}
                            options={[{ value: 'true', label: 'Oui' }, { value: 'false', label: 'Non' }]} />
                        ) : f.type === 'option' ? (
                          <Dropdown value={editing.value} width="100%" onChange={(v) => setEditing({ ...editing, value: v })}
                            options={(f.options ?? []).map((o) => ({ value: o, label: o }))} />
                        ) : (
                          <input autoFocus value={editing.value}
                            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                            onBlur={() => void commitEdit()}
                            onKeyDown={(e) => { if (e.key === 'Enter') void commitEdit(); if (e.key === 'Escape') setEditing(null) }}
                            className="w-full rounded border border-blue-300 px-1 py-0.5 text-sm outline-none" />
                        )
                      ) : formatCell(r[f.name])}
                      {isEd && (f.type === 'boolean' || f.type === 'option') && (
                        <div className="mt-1 flex gap-1">
                          <button type="button" onClick={() => void commitEdit()} className="rounded bg-blue-600 px-1.5 py-0.5 text-[10px] text-white">OK</button>
                          <button type="button" onClick={() => setEditing(null)} className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">Annuler</button>
                        </div>
                      )}
                    </td>
                  )
                })}
                <td className="px-2">
                  <div className="flex items-center gap-1">
                    <button type="button" title="Dupliquer" onClick={() => void duplicateRecord(r)} className="text-slate-300 hover:text-slate-500"><Copy size={12} /></button>
                    <button type="button" title="Supprimer" onClick={() => void remove(r._id)} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {records.length === 0 && !loading && (
              <tr><td colSpan={type.fields.length + 2} className="px-3 py-4 text-center text-xs text-slate-400">{q ? 'Aucun résultat pour cette recherche.' : 'Aucune donnée — ajoutez une première ligne ci-dessous.'}</td></tr>
            )}
            <tr className="border-t border-slate-200 bg-slate-50/50">
              <td />
              {type.fields.map((f) => (
                <td key={f.id} className="px-2 py-1">
                  {f.type === 'boolean' ? (
                    <Dropdown value={draft[f.name] ?? ''} width="100%" onChange={(v) => setDraft({ ...draft, [f.name]: v })}
                      options={[{ value: '', label: '—' }, { value: 'true', label: 'Oui' }, { value: 'false', label: 'Non' }]} />
                  ) : f.type === 'option' ? (
                    <Dropdown value={draft[f.name] ?? ''} width="100%" onChange={(v) => setDraft({ ...draft, [f.name]: v })}
                      options={[{ value: '', label: '—' }, ...(f.options ?? []).map((o) => ({ value: o, label: o }))]} />
                  ) : (
                    <Input placeholder={f.name} value={draft[f.name] ?? ''} onChange={(e) => setDraft({ ...draft, [f.name]: e.target.value })} />
                  )}
                </td>
              ))}
              <td className="px-2"><button type="button" onClick={add} className="rounded bg-blue-600 p-1 text-white hover:bg-blue-700" title="Ajouter"><Plus size={13} /></button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatCell(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
