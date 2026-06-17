import { useEffect, useState } from 'react'
import { Plus, Trash2, Database, RefreshCw } from 'lucide-react'
import { prompt } from '@kubuno/sdk'
import { Button, Input, Dropdown } from '@ui'
import type { DataType, Field, FieldType } from '../types'
import { useBuilder, uid } from '../store'
import { appApi, type DataRecord } from '../api'

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Texte' },
  { value: 'longtext', label: 'Texte long' },
  { value: 'number', label: 'Nombre' },
  { value: 'boolean', label: 'Booléen' },
  { value: 'date', label: 'Date' },
  { value: 'option', label: 'Liste de choix' },
]

/** Concepteur de données : types (« Things »), champs et données réelles. */
export default function DataDesigner() {
  const def = useBuilder((s) => s.def)
  const appId = useBuilder((s) => s.appId)
  const setDataTypes = useBuilder((s) => s.setDataTypes)
  const [sel, setSel] = useState<string | null>(def?.dataTypes[0]?.id ?? null)

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
    if (sel === id) setSel(types[0]?.id ?? null)
  }

  return (
    <div className="flex h-full">
      <div className="w-48 shrink-0 border-r border-slate-200 bg-slate-50 p-2">
        <div className="mb-2"><Button onClick={addType} icon={<Plus size={14} />} className="w-full justify-center">Type</Button></div>
        {types.map((t) => (
          <button key={t.id} type="button" onClick={() => setSel(t.id)}
            className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm ${current?.id === t.id ? 'bg-blue-100 text-blue-800' : 'text-slate-700 hover:bg-slate-100'}`}>
            <Database size={13} /> <span className="flex-1 truncate">{t.name}</span>
          </button>
        ))}
        {types.length === 0 && <div className="px-2 py-4 text-center text-xs text-slate-400">Aucun type</div>}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {current ? (
          <TypeEditor key={current.id} type={current} appId={appId} onChange={(p) => updateType(current.id, p)} onRemove={() => removeType(current.id)} />
        ) : (
          <div className="text-sm text-slate-400">Créez un type de données pour modéliser vos « Things ».</div>
        )}
      </div>
    </div>
  )
}

function TypeEditor({ type, appId, onChange, onRemove }: {
  type: DataType
  appId: string | null
  onChange: (patch: Partial<DataType>) => void
  onRemove: () => void
}) {
  const setField = (id: string, patch: Partial<Field>) =>
    onChange({ fields: type.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  const addField = () => onChange({ fields: [...type.fields, { id: uid('f'), name: `champ${type.fields.length + 1}`, type: 'text' }] })
  const removeField = (id: string) => onChange({ fields: type.fields.filter((f) => f.id !== id) })

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Input value={type.name} onChange={(e) => onChange({ name: e.target.value })} className="text-lg font-semibold" />
        <button type="button" onClick={onRemove} className="ml-auto rounded-md p-2 text-red-500 hover:bg-red-50" title="Supprimer le type"><Trash2 size={16} /></button>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-600">Champs</h3>
          <button type="button" onClick={addField} className="flex items-center gap-1 text-sm text-blue-600 hover:underline"><Plus size={14} /> Champ</button>
        </div>
        <div className="space-y-1.5">
          {type.fields.map((f) => (
            <div key={f.id} className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-2">
              <div className="flex-1"><Input value={f.name} onChange={(e) => setField(f.id, { name: e.target.value })} /></div>
              <Dropdown value={f.type} width={150} onChange={(v) => setField(f.id, { type: v as FieldType })}
                options={FIELD_TYPES.map((ft) => ({ value: ft.value, label: ft.label }))} />
              {f.type === 'option' && (
                <div className="w-40"><Input placeholder="opt1, opt2" value={(f.options ?? []).join(', ')}
                  onChange={(e) => setField(f.id, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></div>
              )}
              <button type="button" onClick={() => removeField(f.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      <RecordsTable type={type} appId={appId} />
    </div>
  )
}

function RecordsTable({ type, appId }: { type: DataType; appId: string | null }) {
  const [records, setRecords] = useState<DataRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const reload = async () => {
    if (!appId) return
    setLoading(true)
    try {
      const res = await appApi.listRecords(`apps/${appId}`, type.name)
      setRecords(res.results)
    } catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { reload() }, [appId, type.name]) // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    if (!appId) return
    const fields: Record<string, unknown> = {}
    for (const f of type.fields) {
      const raw = draft[f.name]
      if (raw == null || raw === '') continue
      fields[f.name] = f.type === 'number' ? Number(raw) : f.type === 'boolean' ? raw === 'true' : raw
    }
    await appApi.createRecord(`apps/${appId}`, type.name, fields)
    setDraft({})
    reload()
  }
  const remove = async (id: string) => { if (appId) { await appApi.deleteRecord(`apps/${appId}`, type.name, id); reload() } }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-600">Données ({records.length})</h3>
        <button type="button" onClick={reload} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Actualiser</button>
      </div>
      <div className="overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>{type.fields.map((f) => <th key={f.id} className="px-3 py-2 font-medium">{f.name}</th>)}<th className="w-8" /></tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r._id} className="border-t border-slate-100">
                {type.fields.map((f) => <td key={f.id} className="px-3 py-1.5 text-slate-700">{formatCell(r[f.name])}</td>)}
                <td className="px-2"><button type="button" onClick={() => remove(r._id)} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button></td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 bg-slate-50/50">
              {type.fields.map((f) => (
                <td key={f.id} className="px-2 py-1">
                  {f.type === 'boolean' ? (
                    <Dropdown value={draft[f.name] ?? ''} width="100%" onChange={(v) => setDraft({ ...draft, [f.name]: v })}
                      options={[{ value: '', label: '—' }, { value: 'true', label: 'Oui' }, { value: 'false', label: 'Non' }]} />
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
