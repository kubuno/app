import { useRef, useState } from 'react'
import { Plus, Trash2, FileText, Type as TypeIcon, Sigma, Hash, Minus, Square, FileDown, Database, Layers } from 'lucide-react'
import { prompt } from '@kubuno/sdk'
import { Button, Input, Dropdown, Checkbox } from '@ui'
import type { Report, ReportBand, ReportObject, SummaryFn, SpecialField, ValueFormat } from '../types'
import { useBuilder } from '../store'
import { makeReport, withGroupBands, orderedBands, usableWidth, BAND_LABELS } from '../reports'
import { appApi } from '../api'

const SPECIALS: { value: SpecialField; label: string }[] = [
  { value: 'pageNumber', label: 'N° de page' }, { value: 'totalPages', label: 'Nombre de pages' },
  { value: 'printDate', label: 'Date d’impression' }, { value: 'recordNumber', label: 'N° d’enregistrement' },
  { value: 'groupName', label: 'Nom du groupe' },
]
const FORMATS: { value: ValueFormat; label: string }[] = [
  { value: 'text', label: 'Texte' }, { value: 'number', label: 'Nombre' }, { value: 'currency', label: 'Monnaie (€)' },
  { value: 'date', label: 'Date' }, { value: 'datetime', label: 'Date + heure' },
]
const BAND_TINT: Record<string, string> = {
  reportHeader: '#eef2ff', pageHeader: '#eff6ff', groupHeader: '#ecfeff',
  detail: '#ffffff', groupFooter: '#f0fdfa', pageFooter: '#fef9c3', reportFooter: '#faf5ff',
}

/** Concepteur de rapports PDF « façon Crystal Reports » (bandes + objets placés). */
export default function ReportDesigner() {
  const def = useBuilder((s) => s.def)
  const setReports = useBuilder((s) => s.setReports)
  const reports = def?.reports ?? []
  const [selId, setSelId] = useState<string | null>(reports[0]?.id ?? null)
  if (!def) return null
  const current = reports.find((r) => r.id === selId) ?? reports[0]

  const addReport = async () => {
    const name = await prompt({ title: 'Nouveau rapport', message: 'Nom du rapport', placeholder: 'État des ventes', confirmLabel: 'Créer' })
    if (!name?.trim()) return
    const dt = def.dataTypes[0]
    const r = makeReport(name.trim(), dt?.name ?? '', dt?.fields ?? [])
    setReports([...reports, r])
    setSelId(r.id)
  }
  const updateReport = (id: string, patch: Partial<Report>) => setReports(reports.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  const removeReport = (id: string) => { setReports(reports.filter((r) => r.id !== id)); if (selId === id) setSelId(reports[0]?.id ?? null) }

  return (
    <div className="flex h-full">
      <div className="w-52 shrink-0 overflow-auto border-r border-slate-200 bg-slate-50 p-2">
        <div className="mb-2"><Button onClick={addReport} icon={<Plus size={14} />} className="w-full justify-center">Rapport</Button></div>
        {reports.map((r) => (
          <button key={r.id} type="button" onClick={() => setSelId(r.id)}
            className={`mb-1 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm ${current?.id === r.id ? 'bg-blue-100 text-blue-800' : 'text-slate-700 hover:bg-slate-100'}`}>
            <FileText size={13} className="text-rose-500" /> <span className="flex-1 truncate">{r.name}</span>
          </button>
        ))}
        {reports.length === 0 && <div className="px-2 py-4 text-center text-xs text-slate-400">Aucun rapport. Créez-en un pour générer des PDF depuis vos données.</div>}
      </div>

      {current
        ? <ReportEditor key={current.id} report={current} onChange={(p) => updateReport(current.id, p)} onRemove={() => removeReport(current.id)} />
        : <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Créez un rapport pour commencer.</div>}
    </div>
  )
}

function ReportEditor({ report, onChange, onRemove }: { report: Report; onChange: (p: Partial<Report>) => void; onRemove: () => void }) {
  const def = useBuilder((s) => s.def)!
  const appId = useBuilder((s) => s.appId)
  const dataType = def.dataTypes.find((t) => t.name === report.dataType)
  const fields = dataType?.fields ?? []
  const uw = usableWidth(report)
  const [sel, setSel] = useState<{ band: string; obj: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const setBand = (bandId: string, patch: Partial<ReportBand>) =>
    onChange({ bands: report.bands.map((b) => (b.id === bandId ? { ...b, ...patch } : b)) })
  const setObj = (bandId: string, objId: string, patch: Partial<ReportObject>) =>
    setBand(bandId, { objects: report.bands.find((b) => b.id === bandId)!.objects.map((o) => (o.id === objId ? { ...o, ...patch } : o)) })
  const addObj = (bandId: string, o: ReportObject) => {
    const band = report.bands.find((b) => b.id === bandId)!
    setBand(bandId, { objects: [...band.objects, o] })
    setSel({ band: bandId, obj: o.id })
  }
  const removeObj = (bandId: string, objId: string) => {
    setBand(bandId, { objects: report.bands.find((b) => b.id === bandId)!.objects.filter((o) => o.id !== objId) })
    setSel(null)
  }

  const targetBand = sel?.band ?? report.bands.find((b) => b.type === 'detail')?.id ?? report.bands[0]?.id
  const nid = () => `ro_${Math.random().toString(36).slice(2, 9)}`
  const addField = (fieldName: string) => {
    if (!targetBand) return
    const n = (report.bands.find((b) => b.id === targetBand)?.objects.length ?? 0)
    addObj(targetBand, { id: nid(), kind: 'field', x: 8 + (n % 4) * 120, y: 3, width: 110, height: 13, field: fieldName, fontSize: 10, format: 'text' })
  }
  const addLabel = () => targetBand && addObj(targetBand, { id: nid(), kind: 'label', x: 8, y: 3, width: 140, height: 14, text: 'Étiquette', fontSize: 11 })
  const addSummary = () => targetBand && addObj(targetBand, { id: nid(), kind: 'summary', x: 8, y: 3, width: 90, height: 14, summary: 'sum', field: fields[0]?.name ?? '', fontSize: 10, bold: true, format: 'number' })
  const addSpecial = () => targetBand && addObj(targetBand, { id: nid(), kind: 'special', x: 8, y: 3, width: 110, height: 13, special: 'pageNumber', fontSize: 9, color: '#64748b' })
  const addLine = () => targetBand && addObj(targetBand, { id: nid(), kind: 'line', x: 0, y: 8, width: uw, height: 0.8, color: '#cbd5e1' })
  const addBox = () => targetBand && addObj(targetBand, { id: nid(), kind: 'box', x: 8, y: 2, width: 120, height: 24, color: '#cbd5e1' })

  const changeDataType = (name: string) => {
    const dt = def.dataTypes.find((t) => t.name === name)
    onChange(makeReport(report.name, name, dt?.fields ?? []) as Partial<Report>)
  }
  const addGroup = () => {
    if (!fields.length) return
    const groups = [...report.groups, { field: fields[0].name }]
    onChange({ groups, bands: withGroupBands({ ...report, groups }) })
  }
  const removeGroup = (gi: number) => {
    const groups = report.groups.filter((_, i) => i !== gi)
    onChange({ groups, bands: withGroupBands({ ...report, groups, bands: report.bands.filter((b) => !((b.type === 'groupHeader' || b.type === 'groupFooter') && b.groupIndex === gi)) }) })
  }

  const preview = async () => {
    if (!appId || !report.dataType) { return }
    setBusy(true)
    try {
      const res = await appApi.search(`apps/${appId}`, report.dataType, { sort_field: report.sort?.field, sort_desc: report.sort?.desc, limit: 1000 })
      const { generateReportPdf } = await import('../runtime/pdf')
      await generateReportPdf(report, res.results)
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  const selObj = sel ? report.bands.find((b) => b.id === sel.band)?.objects.find((o) => o.id === sel.obj) : undefined
  const bands = orderedBands(report)

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Barre d'outils du rapport */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <Input value={report.name} onChange={(e) => onChange({ name: e.target.value })} className="w-48 font-semibold" />
        <span className="flex items-center gap-1 text-xs text-slate-500"><Database size={13} /></span>
        <Dropdown value={report.dataType} width={150} onChange={changeDataType}
          options={def.dataTypes.length ? def.dataTypes.map((t) => ({ value: t.name, label: t.name })) : [{ value: '', label: '(aucun type)' }]} />
        <Dropdown value={report.orientation} width={120} onChange={(v) => onChange({ orientation: v as Report['orientation'] })}
          options={[{ value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Paysage' }]} />
        <Dropdown value={report.pageSize} width={90} onChange={(v) => onChange({ pageSize: v as Report['pageSize'] })}
          options={[{ value: 'A4', label: 'A4' }, { value: 'Letter', label: 'Letter' }]} />
        <span className="text-xs text-slate-400">Trier&nbsp;:</span>
        <Dropdown value={report.sort?.field ?? ''} width={130} onChange={(v) => onChange({ sort: v ? { field: v, desc: report.sort?.desc ?? false } : undefined })}
          options={[{ value: '', label: '(aucun)' }, ...fields.map((f) => ({ value: f.name, label: f.name }))]} />
        {report.sort && <Checkbox checked={!!report.sort.desc} label="↓" onChange={(c) => onChange({ sort: { field: report.sort!.field, desc: c } })} />}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="primary" icon={<FileDown size={14} />} onClick={preview} disabled={busy || !report.dataType}>{busy ? 'Génération…' : 'Aperçu PDF'}</Button>
          <button type="button" onClick={onRemove} className="rounded-md p-2 text-red-500 hover:bg-red-50" title="Supprimer le rapport"><Trash2 size={16} /></button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Boîte à outils : champs + objets + groupes */}
        <div className="w-52 shrink-0 overflow-auto border-r border-slate-200 bg-slate-50 p-2.5 text-sm">
          <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">Champs</div>
          <div className="mb-3 space-y-1">
            {fields.map((f) => (
              <button key={f.id} type="button" onClick={() => addField(f.name)}
                className="flex w-full items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1 text-left text-[13px] text-slate-700 hover:border-blue-400 hover:bg-blue-50">
                <span className="truncate">{f.name}</span><span className="ml-auto text-[10px] text-slate-400">{f.type}</span>
              </button>
            ))}
            {!fields.length && <div className="text-[11px] text-slate-400">Choisissez un type de données.</div>}
          </div>
          <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">Objets</div>
          <div className="mb-3 grid grid-cols-2 gap-1">
            <ToolBtn icon={<TypeIcon size={13} />} label="Étiquette" onClick={addLabel} />
            <ToolBtn icon={<Sigma size={13} />} label="Total" onClick={addSummary} />
            <ToolBtn icon={<Hash size={13} />} label="Spécial" onClick={addSpecial} />
            <ToolBtn icon={<Minus size={13} />} label="Trait" onClick={addLine} />
            <ToolBtn icon={<Square size={13} />} label="Cadre" onClick={addBox} />
          </div>
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase text-slate-400">
            <span>Groupes</span>
            <button type="button" onClick={addGroup} disabled={!fields.length} className="text-blue-600 hover:underline disabled:opacity-40"><Plus size={12} /></button>
          </div>
          <div className="space-y-1">
            {report.groups.map((g, gi) => (
              <div key={gi} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-1">
                <Layers size={12} className="text-cyan-600" />
                <Dropdown value={g.field} width="100%" onChange={(v) => onChange({ groups: report.groups.map((x, i) => (i === gi ? { ...x, field: v } : x)) })}
                  options={fields.map((f) => ({ value: f.name, label: f.name }))} />
                <button type="button" onClick={() => removeGroup(gi)} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
              </div>
            ))}
            {!report.groups.length && <div className="text-[11px] text-slate-400">Aucun regroupement.</div>}
          </div>
        </div>

        {/* Plan du rapport (bandes) */}
        <div className="min-w-0 flex-1 overflow-auto bg-slate-100 p-6" onClick={() => setSel(null)}>
          <div className="mx-auto bg-white shadow" style={{ width: uw + 2 }}>
            {bands.map((b) => (
              <BandRow key={b.id} band={b} uw={uw} sel={sel} onSelect={setSel}
                onObj={(objId, patch) => setObj(b.id, objId, patch)}
                onHeight={(h) => setBand(b.id, { height: h })}
                groupField={b.groupIndex != null ? report.groups[b.groupIndex]?.field : undefined} />
            ))}
          </div>
        </div>

        {/* Inspecteur d'objet */}
        <div className="w-60 shrink-0 overflow-auto border-l border-slate-200 bg-white p-3 text-sm">
          {selObj && sel ? (
            <ObjectInspector obj={selObj} fields={fields} onChange={(p) => setObj(sel.band, sel.obj, p)} onRemove={() => removeObj(sel.band, sel.obj)} />
          ) : (
            <div className="pt-6 text-center text-[12px] text-slate-400">Sélectionnez un objet dans le plan pour l’éditer, ou ajoutez champs et objets depuis la gauche.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function ToolBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-1.5 text-[11px] text-slate-600 hover:border-blue-400 hover:bg-blue-50">{icon}<span className="truncate">{label}</span></button>
}

// ── Une bande + ses objets déplaçables ───────────────────────────────────────

function BandRow({ band, uw, sel, onSelect, onObj, onHeight, groupField }: {
  band: ReportBand; uw: number; sel: { band: string; obj: string } | null
  onSelect: (s: { band: string; obj: string } | null) => void
  onObj: (objId: string, patch: Partial<ReportObject>) => void
  onHeight: (h: number) => void
  groupField?: string
}) {
  const label = BAND_LABELS[band.type] + (groupField ? ` · ${groupField}` : '')
  return (
    <div className="flex border-b border-slate-200">
      <div className="flex w-7 shrink-0 items-center justify-center border-r border-slate-200 bg-slate-50" title={label}>
        <span className="rotate-180 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wide text-slate-400" style={{ writingMode: 'vertical-rl' }}>{label}</span>
      </div>
      <div className="relative" style={{ width: uw, height: band.height, background: BAND_TINT[band.type] ?? '#fff' }}
        onClick={(e) => { e.stopPropagation(); onSelect(null) }}>
        {band.objects.map((o) => (
          <DragObject key={o.id} o={o} bandH={band.height} bandW={uw} selected={sel?.band === band.id && sel.obj === o.id}
            onSelect={() => onSelect({ band: band.id, obj: o.id })} onChange={(p) => onObj(o.id, p)} />
        ))}
        {/* poignée de hauteur de bande */}
        <div className="absolute bottom-0 left-0 right-0 h-1.5 cursor-ns-resize" title="Glisser pour changer la hauteur de la bande"
          onPointerDown={(e) => {
            e.preventDefault(); e.stopPropagation()
            const startY = e.clientY, h0 = band.height
            const tgt = e.currentTarget as HTMLElement; tgt.setPointerCapture(e.pointerId)
            const mv = (ev: PointerEvent) => onHeight(Math.max(8, Math.round(h0 + (ev.clientY - startY))))
            const up = () => { tgt.removeEventListener('pointermove', mv); tgt.removeEventListener('pointerup', up) }
            tgt.addEventListener('pointermove', mv); tgt.addEventListener('pointerup', up)
          }} />
      </div>
    </div>
  )
}

function DragObject({ o, bandH, bandW, selected, onSelect, onChange }: {
  o: ReportObject; bandH: number; bandW: number; selected: boolean
  onSelect: () => void; onChange: (p: Partial<ReportObject>) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const startDrag = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    e.preventDefault(); e.stopPropagation(); onSelect()
    const sx = e.clientX, sy = e.clientY, ox = o.x, oy = o.y, ow = o.width, oh = o.height
    const el = e.currentTarget as HTMLElement; el.setPointerCapture(e.pointerId)
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy
      if (mode === 'move') onChange({ x: Math.max(0, Math.min(bandW - 8, Math.round(ox + dx))), y: Math.max(0, Math.min(bandH - 4, Math.round(oy + dy))) })
      else onChange({ width: Math.max(12, Math.round(ow + dx)), height: Math.max(o.kind === 'line' ? 0.5 : 8, Math.round(oh + dy)) })
    }
    const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up) }
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up)
  }
  const preview = o.kind === 'label' ? (o.text || 'Étiquette')
    : o.kind === 'field' ? `{${o.field || '?'}}`
    : o.kind === 'summary' ? `${o.summary}(${o.field || '?'})`
    : o.kind === 'special' ? (SPECIALS.find((s) => s.value === o.special)?.label ?? o.special)
    : ''
  const common: React.CSSProperties = {
    position: 'absolute', left: o.x, top: o.y, width: o.width, height: o.height,
    fontSize: (o.fontSize ?? 10), fontWeight: o.bold ? 700 : 400, fontStyle: o.italic ? 'italic' : undefined,
    color: o.color || '#0f172a', textAlign: o.align ?? 'left', overflow: 'hidden', whiteSpace: 'nowrap',
    outline: selected ? '1.5px solid #2563eb' : '1px dotted #cbd5e1', cursor: 'move', boxSizing: 'border-box',
    padding: o.kind === 'line' || o.kind === 'box' ? 0 : '0 2px', lineHeight: `${o.height}px`,
  }
  if (o.kind === 'line') return <div ref={ref} style={{ ...common, height: Math.max(1, o.height), background: o.color || '#cbd5e1', outline: selected ? '1.5px solid #2563eb' : 'none' }} onPointerDown={(e) => startDrag(e, 'move')} />
  if (o.kind === 'box') return <div ref={ref} style={{ ...common, border: `1px solid ${o.color || '#cbd5e1'}`, background: 'transparent' }} onPointerDown={(e) => startDrag(e, 'move')}>{resizeHandle(startDrag, selected)}</div>
  return (
    <div ref={ref} style={common} onPointerDown={(e) => startDrag(e, 'move')} title={preview}>
      <span style={{ color: o.kind === 'field' ? '#2563eb' : o.kind === 'summary' ? '#7c3aed' : o.kind === 'special' ? '#0891b2' : undefined }}>{preview}</span>
      {resizeHandle(startDrag, selected)}
    </div>
  )
}

function resizeHandle(startDrag: (e: React.PointerEvent, mode: 'move' | 'resize') => void, selected: boolean) {
  if (!selected) return null
  return <div onPointerDown={(e) => startDrag(e, 'resize')} style={{ position: 'absolute', right: -3, bottom: -3, width: 9, height: 9, background: '#2563eb', borderRadius: 2, cursor: 'nwse-resize' }} />
}

// ── Inspecteur d'un objet ────────────────────────────────────────────────────

function ObjectInspector({ obj, fields, onChange, onRemove }: {
  obj: ReportObject; fields: { name: string }[]; onChange: (p: Partial<ReportObject>) => void; onRemove: () => void
}) {
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="mb-2 block"><span className="mb-1 block text-[11px] font-medium text-slate-500">{label}</span>{children}</label>
  )
  const kindLabel = { label: 'Étiquette', field: 'Champ', summary: 'Total', special: 'Champ spécial', line: 'Trait', box: 'Cadre' }[obj.kind]
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{kindLabel}</span>
        <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
      </div>

      {obj.kind === 'label' && <Row label="Texte"><Input value={obj.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} /></Row>}
      {obj.kind === 'field' && (
        <>
          <Row label="Champ de données"><Dropdown value={obj.field ?? ''} width="100%" onChange={(v) => onChange({ field: v })} options={fields.map((f) => ({ value: f.name, label: f.name }))} /></Row>
          <Row label="Format"><Dropdown value={obj.format ?? 'text'} width="100%" onChange={(v) => onChange({ format: v as ValueFormat })} options={FORMATS} /></Row>
        </>
      )}
      {obj.kind === 'summary' && (
        <>
          <Row label="Fonction"><Dropdown value={obj.summary ?? 'sum'} width="100%" onChange={(v) => onChange({ summary: v as SummaryFn })}
            options={[{ value: 'sum', label: 'Somme' }, { value: 'count', label: 'Nombre' }, { value: 'avg', label: 'Moyenne' }, { value: 'min', label: 'Minimum' }, { value: 'max', label: 'Maximum' }]} /></Row>
          <Row label="Champ"><Dropdown value={obj.field ?? ''} width="100%" onChange={(v) => onChange({ field: v })} options={fields.map((f) => ({ value: f.name, label: f.name }))} /></Row>
          <Row label="Format"><Dropdown value={obj.format ?? 'number'} width="100%" onChange={(v) => onChange({ format: v as ValueFormat })} options={FORMATS} /></Row>
        </>
      )}
      {obj.kind === 'special' && <Row label="Type"><Dropdown value={obj.special ?? 'pageNumber'} width="100%" onChange={(v) => onChange({ special: v as SpecialField })} options={SPECIALS} /></Row>}

      {obj.kind !== 'line' && obj.kind !== 'box' && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Taille police"><Input type="number" value={String(obj.fontSize ?? 10)} onChange={(e) => onChange({ fontSize: Number(e.target.value) || 10 })} /></Row>
            <Row label="Couleur"><Input value={obj.color ?? '#0f172a'} onChange={(e) => onChange({ color: e.target.value })} /></Row>
          </div>
          <div className="mb-2 flex items-center gap-3">
            <Checkbox checked={!!obj.bold} label="Gras" onChange={(c) => onChange({ bold: c })} />
            <Checkbox checked={!!obj.italic} label="Italique" onChange={(c) => onChange({ italic: c })} />
          </div>
          <Row label="Alignement"><Dropdown value={obj.align ?? 'left'} width="100%" onChange={(v) => onChange({ align: v as 'left' | 'center' | 'right' })}
            options={[{ value: 'left', label: 'Gauche' }, { value: 'center', label: 'Centré' }, { value: 'right', label: 'Droite' }]} /></Row>
        </>
      )}
      {(obj.kind === 'line' || obj.kind === 'box') && <Row label="Couleur"><Input value={obj.color ?? '#cbd5e1'} onChange={(e) => onChange({ color: e.target.value })} /></Row>}

      <div className="mt-2 grid grid-cols-4 gap-1.5 border-t border-slate-100 pt-2">
        {(['x', 'y', 'width', 'height'] as const).map((k) => (
          <label key={k} className="block"><span className="mb-0.5 block text-[10px] text-slate-400">{k === 'width' ? 'L' : k === 'height' ? 'H' : k.toUpperCase()}</span>
            <Input type="number" value={String(Math.round((obj[k] as number) ?? 0))} onChange={(e) => onChange({ [k]: Number(e.target.value) || 0 } as Partial<ReportObject>)} /></label>
        ))}
      </div>
    </div>
  )
}
