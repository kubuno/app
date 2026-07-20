import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  Plus, Trash2, FileText, Type as TypeIcon, Sigma, Hash, Minus, Square, FileDown, Database, Layers,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  Copy, Scissors, ClipboardPaste, BringToFront, SendToBack, GripVertical,
  Bold, Italic, AlignLeft, AlignCenter, AlignRight, X, RefreshCw, Eye,
  Image as ImageIcon, Circle, SquareCheck, Pilcrow, EyeOff, Eraser, Rows3, ArrowDownToLine,
} from 'lucide-react'
import { prompt } from '@kubuno/sdk'
import { Button, Input, Textarea, Dropdown, Checkbox, MenuDropdown, type MenuItem, type MenuDropdownPos } from '@ui'
import type { Report, ReportBand, ReportObject, SummaryFn, SpecialField, ValueFormat } from '../types'
import { useBuilder, uid } from '../store'
import { makeReport, withGroupBands, orderedBands, fmtValue, summarize, BAND_LABELS, PAGE_DIM } from '../reports'
import { appApi } from '../api'
import {
  type Box, type Guide, type ResizeHandle, type AlignMode,
  snapMove, snapResize, combinedBox, alignBoxes, distributeBoxes, constrainAxis, constrainAspect,
} from './reportGeom'
import { useCtrlWheelZoom } from './useCtrlWheelZoom'

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
const SNAP_PX = 5           // snapping threshold (1pt == 1px in the plan)
const MIN_W = 8

/** Objects copied via Ctrl+C, pasteable across reports (module-level like the builder clipboard). */
let objClipboard: ReportObject[] = []

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

type Sel = { band: string; objs: string[] } | null
type Draft = { band: string; boxes: Record<string, Box> } | null
type Marquee = { band: string; x0: number; y0: number; x1: number; y1: number } | null

function ReportEditor({ report, onChange, onRemove }: { report: Report; onChange: (p: Partial<Report>) => void; onRemove: () => void }) {
  const def = useBuilder((s) => s.def)!
  const appId = useBuilder((s) => s.appId)
  const setReportsStore = useBuilder((s) => s.setReports)
  const dataType = def.dataTypes.find((t) => t.name === report.dataType)
  const fields = dataType?.fields ?? []
  // Physical page + margins (drag-resizable: local draft during the gesture,
  // committed once on release so undo stays a single step).
  const dim = PAGE_DIM[report.pageSize] ?? PAGE_DIM.A4
  const pw = report.orientation === 'landscape' ? dim.h : dim.w
  const ph = report.orientation === 'landscape' ? dim.w : dim.h
  const [mDrag, setMDrag] = useState<{ m: Report['margins']; side: 'left' | 'right' | 'top' | 'bottom' } | null>(null)
  const mg = mDrag?.m ?? report.margins
  // Band-height drag from the rail (draft, single undo on release) + hover sync rail↔page.
  const [hDrag, setHDrag] = useState<{ id: string; h: number } | null>(null)
  const [hoverBand, setHoverBand] = useState<string | null>(null)
  // Band selected from the rail → band inspector in the right panel.
  const [bandSel, setBandSel] = useState<string | null>(null)
  const uw = pw - mg.left - mg.right
  const uh = ph - mg.top - mg.bottom
  const [sel, setSel] = useState<Sel>(null)
  const [draft, setDraft] = useState<Draft>(null)
  const [guides, setGuides] = useState<Guide[]>([])
  const [marquee, setMarquee] = useState<Marquee>(null)
  const [busy, setBusy] = useState(false)
  // Workspace zoom: same state & status-bar control as the Design tab.
  const zoom = useBuilder((s) => s.canvasZoom)
  const [editing, setEditing] = useState<{ band: string; obj: string } | null>(null)
  const [menu, setMenu] = useState<{ pos: MenuDropdownPos; band: string; obj: string | null } | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [liveOn, setLiveOn] = useState(false)
  const [liveRows, setLiveRows] = useState<Record<string, unknown>[] | null>(null)
  const pdfUrlRef = useRef<string | null>(null)
  // Ctrl/⌘ + molette → zoomer le plan (ancré sous le curseur, même zoom que Design).
  const planRef = useCtrlWheelZoom<HTMLDivElement>(
    () => useBuilder.getState().canvasZoom,
    (z) => useBuilder.getState().setCanvasZoom(z),
    { min: 0.25, max: 3 },
  )

  const fetchRows = async (): Promise<Record<string, unknown>[]> => {
    if (!appId || !report.dataType) return []
    try {
      const res = await appApi.search(`apps/${appId}`, report.dataType, { sort_field: report.sort?.field, sort_desc: report.sort?.desc, limit: 1000 })
      return res.results
    } catch { return [] }
  }
  const regenPdf = async (rows?: Record<string, unknown>[]) => {
    setBusy(true)
    try {
      const data = rows ?? liveRows ?? await fetchRows()
      const { renderReportPdfBlob } = await import('../runtime/pdf')
      const blob = await renderReportPdfBlob(report, data)
      const url = URL.createObjectURL(blob)
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
      pdfUrlRef.current = url
      setPdfUrl(url)
    } catch { /* ignore */ } finally { setBusy(false) }
  }
  const openPreview = async () => {
    const rows = liveRows ?? await fetchRows()
    if (!liveRows) setLiveRows(rows)
    void regenPdf(rows)
  }
  const closePreview = () => { if (pdfUrlRef.current) { URL.revokeObjectURL(pdfUrlRef.current); pdfUrlRef.current = null } setPdfUrl(null) }
  const toggleLive = async () => {
    if (!liveOn && !liveRows) setLiveRows(await fetchRows())
    setLiveOn((v) => !v)
  }
  // Live preview: re-render the PDF (debounced) whenever the report changes while the panel is open.
  useEffect(() => {
    if (!pdfUrl) return
    const t = setTimeout(() => { void regenPdf() }, 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report])
  useEffect(() => () => { if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current) }, [])

  // Fresh read from the store so gesture/keyboard commits never use a stale closure.
  const liveBand = (bandId: string): ReportBand | undefined =>
    useBuilder.getState().def?.reports?.find((r) => r.id === report.id)?.bands.find((b) => b.id === bandId)
  /** Rewrite one band's objects and commit as a single undo entry. */
  const commitBand = (bandId: string, fn: (objs: ReportObject[]) => ReportObject[]) => {
    const reports = useBuilder.getState().def?.reports ?? []
    setReportsStore(reports.map((r) => (r.id === report.id
      ? { ...r, bands: r.bands.map((b) => (b.id === bandId ? { ...b, objects: fn(b.objects) } : b)) }
      : r)))
  }

  const setBand = (bandId: string, patch: Partial<ReportBand>) =>
    onChange({ bands: report.bands.map((b) => (b.id === bandId ? { ...b, ...patch } : b)) })
  const addObj = (bandId: string, o: ReportObject) => {
    const band = report.bands.find((b) => b.id === bandId)!
    setBand(bandId, { objects: [...band.objects, o] })
    setSel({ band: bandId, objs: [o.id] })
  }

  // ── Selected objects (live) ────────────────────────────────────────────────
  const selBand = sel ? report.bands.find((b) => b.id === sel.band) : undefined
  const selObjs = sel && selBand ? selBand.objects.filter((o) => sel.objs.includes(o.id)) : []

  const targetBand = sel?.band ?? report.bands.find((b) => b.type === 'detail')?.id ?? report.bands[0]?.id

  // Build an object of a given kind at a position (used by clicks AND palette drag-drop).
  // 'paragraph' is a multiline label preset (not a separate model kind).
  const makeObjAt = (kind: ReportObject['kind'] | 'paragraph', x: number, y: number, field?: string): ReportObject => {
    const id = uid('ro')
    switch (kind) {
      case 'field':     return { id, kind, x, y, width: 110, height: 13, field: field ?? fields[0]?.name ?? '', fontSize: 10, format: 'text' }
      case 'label':     return { id, kind, x, y, width: 140, height: 14, text: 'Étiquette', fontSize: 11 }
      case 'paragraph': return { id, kind: 'label', x, y, width: 220, height: 42, text: 'Paragraphe : le texte revient automatiquement à la ligne dans son cadre.', fontSize: 9, multiline: true, color: '#334155' }
      case 'summary':   return { id, kind, x, y, width: 90, height: 14, summary: 'sum', field: field ?? fields[0]?.name ?? '', fontSize: 10, bold: true, format: 'number' }
      case 'special':   return { id, kind, x, y, width: 110, height: 13, special: 'pageNumber', fontSize: 9, color: '#64748b' }
      case 'line':      return { id, kind, x: 0, y, width: uw, height: 0.8, color: '#cbd5e1' }
      case 'box':       return { id, kind, x, y, width: 120, height: 24, color: '#cbd5e1' }
      case 'ellipse':   return { id, kind, x, y, width: 60, height: 40, color: '#94a3b8' }
      case 'image':     return { id, kind, x, y, width: 90, height: 60, fit: 'contain', src: '' }
      case 'checkbox':  return { id, kind, x, y, width: 11, height: 11, field: field ?? fields.find((f) => f.type === 'boolean')?.name ?? fields[0]?.name ?? '', color: '#334155' }
    }
  }
  const addField = (fieldName: string) => {
    if (!targetBand) return
    const n = report.bands.find((b) => b.id === targetBand)?.objects.length ?? 0
    addObj(targetBand, makeObjAt('field', 8 + (n % 4) * 120, 3, fieldName))
  }
  const addKind = (kind: ReportObject['kind'] | 'paragraph') => targetBand && addObj(targetBand, makeObjAt(kind, 8, kind === 'line' ? 8 : 3))
  // Drop an object from the palette at the exact position in a band.
  const dropObjAt = (bandId: string, kind: ReportObject['kind'] | 'paragraph', field: string | undefined, x: number, y: number) => {
    const band = report.bands.find((b) => b.id === bandId)
    if (!band) return
    addObj(bandId, makeObjAt(kind, clamp(Math.round(x), 0, uw - 40), clamp(Math.round(y), 0, band.height - 6), field))
  }

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

  // ── Object editing operations ───────────────────────────────────────────────
  const patchSel = (patch: Partial<ReportObject>) => {
    if (!sel) return
    commitBand(sel.band, (objs) => objs.map((o) => (sel.objs.includes(o.id) ? { ...o, ...patch } : o)))
  }
  const deleteSel = () => { if (!sel) return; commitBand(sel.band, (objs) => objs.filter((o) => !sel.objs.includes(o.id))); setSel(null) }
  const copySel = () => { objClipboard = selObjs.map((o) => ({ ...o })) }
  const paste = () => {
    if (!objClipboard.length) return
    const bandId = sel?.band ?? targetBand
    if (!bandId) return
    const clones = objClipboard.map((o) => ({ ...o, id: uid('ro'), x: o.x + 10, y: o.y + 10 }))
    commitBand(bandId, (objs) => [...objs, ...clones])
    setSel({ band: bandId, objs: clones.map((c) => c.id) })
  }
  /** Clone objects in a band (fresh store read); returns the new ids. */
  const cloneInBand = (bandId: string, ids: string[], offset: number): string[] => {
    const reports = useBuilder.getState().def?.reports ?? []
    const band = reports.find((r) => r.id === report.id)?.bands.find((b) => b.id === bandId)
    if (!band) return []
    const clones = band.objects.filter((o) => ids.includes(o.id)).map((o) => ({ ...o, id: uid('ro'), x: o.x + offset, y: o.y + offset }))
    setReportsStore(reports.map((r) => (r.id === report.id
      ? { ...r, bands: r.bands.map((b) => (b.id === bandId ? { ...b, objects: [...b.objects, ...clones] } : b)) }
      : r)))
    return clones.map((c) => c.id)
  }
  const duplicateSel = () => { if (!sel) return; const ids = cloneInBand(sel.band, sel.objs, 10); if (ids.length) setSel({ band: sel.band, objs: ids }) }
  const selectAllInBand = () => { if (!selBand) return; setSel({ band: selBand.id, objs: selBand.objects.map((o) => o.id) }) }
  const nudge = (dx: number, dy: number) => {
    if (!sel || !selBand) return
    const bandH = selBand.height
    commitBand(sel.band, (objs) => objs.map((o) => (sel.objs.includes(o.id)
      ? { ...o, x: clamp(o.x + dx, 0, uw - o.width), y: clamp(o.y + dy, 0, bandH - o.height) } : o)))
  }
  const alignSel = (mode: AlignMode) => {
    if (!sel || selObjs.length < 2) return
    const res = alignBoxes(selObjs, mode)
    const patch: Record<string, { x: number; y: number }> = {}
    selObjs.forEach((o, i) => { patch[o.id] = res[i] })
    commitBand(sel.band, (objs) => objs.map((o) => (patch[o.id] ? { ...o, ...patch[o.id] } : o)))
  }
  const distributeSel = (axis: 'h' | 'v') => {
    if (!sel || selObjs.length < 3) return
    const res = distributeBoxes(selObjs, axis)
    const patch: Record<string, { x: number; y: number }> = {}
    selObjs.forEach((o, i) => { patch[o.id] = res[i] })
    commitBand(sel.band, (objs) => objs.map((o) => (patch[o.id] ? { ...o, ...patch[o.id] } : o)))
  }
  const reorderSel = (edge: 'front' | 'back') => {
    if (!sel) return
    commitBand(sel.band, (objs) => {
      const picked = objs.filter((o) => sel.objs.includes(o.id))
      const rest = objs.filter((o) => !sel.objs.includes(o.id))
      return edge === 'front' ? [...rest, ...picked] : [...picked, ...rest]
    })
  }
  // Inline text editing (double-click a label to type directly, like presentations).
  const commitEditText = (text: string) => { if (editing) commitBand(editing.band, (objs) => objs.map((o) => (o.id === editing.obj ? { ...o, text } : o))) }

  // ── Right-click context menu ────────────────────────────────────────────────
  const openMenu = (e: React.MouseEvent, band: string, obj: string | null) => {
    e.preventDefault(); e.stopPropagation()
    if (obj && !(sel && sel.band === band && sel.objs.includes(obj))) setSel({ band, objs: [obj] })
    setMenu({ pos: { top: e.clientY, left: e.clientX, minWidth: 210 }, band, obj })
  }
  const menuItems = (): MenuItem[] => {
    if (!menu) return []
    if (menu.obj) {
      const multi = !!sel && sel.objs.length > 1
      const items: MenuItem[] = [
        { type: 'action', label: 'Dupliquer', shortcut: 'Ctrl+D', icon: <Copy size={15} />, onClick: duplicateSel },
        { type: 'action', label: 'Copier', shortcut: 'Ctrl+C', icon: <Copy size={15} />, onClick: copySel },
        { type: 'action', label: 'Couper', shortcut: 'Ctrl+X', icon: <Scissors size={15} />, onClick: () => { copySel(); deleteSel() } },
      ]
      if (objClipboard.length) items.push({ type: 'action', label: 'Coller', icon: <ClipboardPaste size={15} />, onClick: paste })
      items.push(
        { type: 'separator' },
        { type: 'action', label: 'Premier plan', icon: <BringToFront size={15} />, onClick: () => reorderSel('front') },
        { type: 'action', label: 'Arrière-plan', icon: <SendToBack size={15} />, onClick: () => reorderSel('back') },
      )
      if (multi) items.push({
        type: 'submenu', label: 'Aligner', icon: <AlignStartVertical size={15} />,
        items: [
          { type: 'action', label: 'Gauche', icon: <AlignStartVertical size={14} />, onClick: () => alignSel('left') },
          { type: 'action', label: 'Centrer H', icon: <AlignCenterVertical size={14} />, onClick: () => alignSel('hcenter') },
          { type: 'action', label: 'Droite', icon: <AlignEndVertical size={14} />, onClick: () => alignSel('right') },
          { type: 'action', label: 'Haut', icon: <AlignStartHorizontal size={14} />, onClick: () => alignSel('top') },
          { type: 'action', label: 'Centrer V', icon: <AlignCenterHorizontal size={14} />, onClick: () => alignSel('vcenter') },
          { type: 'action', label: 'Bas', icon: <AlignEndHorizontal size={14} />, onClick: () => alignSel('bottom') },
          ...(sel && sel.objs.length >= 3
            ? [{ type: 'action' as const, label: 'Répartir H', onClick: () => distributeSel('h') }, { type: 'action' as const, label: 'Répartir V', onClick: () => distributeSel('v') }]
            : []),
        ],
      })
      items.push(
        { type: 'separator' },
        { type: 'action', label: 'Supprimer', shortcut: 'Suppr', danger: true, icon: <Trash2 size={15} />, onClick: deleteSel },
      )
      return items
    }
    const items: MenuItem[] = []
    if (objClipboard.length) items.push({ type: 'action', label: 'Coller', icon: <ClipboardPaste size={15} />, onClick: paste })
    items.push({ type: 'action', label: 'Tout sélectionner (bande)', shortcut: 'Ctrl+A', onClick: selectAllInBand })
    return items
  }

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const mod = e.ctrlKey || e.metaKey
      if (mod) {
        const k = e.key.toLowerCase()
        if (k === 'c' && sel) { copySel(); e.preventDefault(); return }
        if (k === 'x' && sel) { copySel(); deleteSel(); e.preventDefault(); return }
        if (k === 'v' && objClipboard.length) { paste(); e.preventDefault(); return }
        if (k === 'd' && sel) { duplicateSel(); e.preventDefault(); return }
        if (k === 'a' && (sel || selBand)) { selectAllInBand(); e.preventDefault(); return }
        return
      }
      if (!sel) return
      if (e.key === 'Delete' || e.key === 'Backspace') { deleteSel(); e.preventDefault(); return }
      if (e.key === 'Escape') { setSel(null); return }
      const step = e.shiftKey ? 10 : 1
      if (e.key === 'ArrowLeft') { nudge(-step, 0); e.preventDefault() }
      else if (e.key === 'ArrowRight') { nudge(step, 0); e.preventDefault() }
      else if (e.key === 'ArrowUp') { nudge(0, -step); e.preventDefault() }
      else if (e.key === 'ArrowDown') { nudge(0, step); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── Pointer gestures (move / resize with smart guides) ──────────────────────
  const beginObjectDrag = (e: React.PointerEvent, bandId: string, objId: string, mode: 'move' | ResizeHandle) => {
    e.preventDefault(); e.stopPropagation()
    setBandSel(null)
    const band = report.bands.find((b) => b.id === bandId)
    if (!band) return
    const bandH = band.height

    // Resolve selection at gesture start.
    let selIds = sel && sel.band === bandId ? [...sel.objs] : []
    if (mode === 'move' && e.shiftKey) {
      selIds = selIds.includes(objId) ? selIds.filter((i) => i !== objId) : [...selIds, objId]
      setSel(selIds.length ? { band: bandId, objs: selIds } : null)
      return // Shift-click toggles membership without dragging.
    }
    if (mode !== 'move') { selIds = [objId]; setSel({ band: bandId, objs: [objId] }) }
    else if (!selIds.includes(objId)) { selIds = [objId]; setSel({ band: bandId, objs: [objId] }) }

    // Ctrl/Cmd-drag = duplicate the selection and drag the copies.
    let dragIds = selIds
    if (mode === 'move' && (e.ctrlKey || e.metaKey)) {
      const clones = cloneInBand(bandId, selIds, 0)
      if (clones.length) { dragIds = clones; setSel({ band: bandId, objs: clones }) }
    }

    const objsNow = liveBand(bandId)?.objects ?? band.objects
    const snap: Record<string, Box> = {}
    for (const id of dragIds) { const o = objsNow.find((x) => x.id === id); if (o) snap[id] = { x: o.x, y: o.y, width: o.width, height: o.height } }
    const others: Box[] = objsNow.filter((o) => !dragIds.includes(o.id)).map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height }))
    const resizingKind = objsNow.find((o) => o.id === dragIds[0])?.kind
    const minH = resizingKind === 'line' ? 0.5 : 6
    const sx = e.clientX, sy = e.clientY
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)

    const onMove = (ev: PointerEvent) => {
      let dx = (ev.clientX - sx) / zoom, dy = (ev.clientY - sy) / zoom
      const boxes: Record<string, Box> = {}
      let gs: Guide[] = []
      if (mode === 'move') {
        if (ev.shiftKey) { const c = constrainAxis(dx, dy); dx = c.dx; dy = c.dy }
        const comb = combinedBox(dragIds.map((id) => snap[id]))
        const s = ev.altKey ? { dx: 0, dy: 0, guides: [] as Guide[] } : snapMove({ ...comb, x: comb.x + dx, y: comb.y + dy }, others, uw, bandH, SNAP_PX)
        const fdx = dx + s.dx, fdy = dy + s.dy
        gs = s.guides
        for (const id of dragIds) {
          const b = snap[id]
          boxes[id] = { ...b, x: clamp(Math.round(b.x + fdx), 0, uw - b.width), y: clamp(Math.round(b.y + fdy), 0, bandH - b.height) }
        }
      } else {
        const id = dragIds[0]; const b = snap[id]
        let nx = b.x, ny = b.y, nw = b.width, nh = b.height
        if (mode.includes('e')) nw = Math.max(MIN_W, b.width + dx)
        if (mode.includes('w')) { nw = Math.max(MIN_W, b.width - dx); nx = b.x + (b.width - nw) }
        if (mode.includes('s')) nh = Math.max(minH, b.height + dy)
        if (mode.includes('n')) { nh = Math.max(minH, b.height - dy); ny = b.y + (b.height - nh) }
        if (ev.shiftKey && mode.length === 2) { // corner + Shift = keep aspect ratio
          const c = constrainAspect(nw, nh, b.width / Math.max(1, b.height))
          if (mode.includes('w')) nx = b.x + b.width - c.width
          if (mode.includes('n')) ny = b.y + b.height - c.height
          nw = c.width; nh = c.height
        }
        const s = ev.altKey ? { box: { x: nx, y: ny, width: nw, height: nh }, guides: [] as Guide[] } : snapResize({ x: nx, y: ny, width: nw, height: nh }, mode as ResizeHandle, others, uw, bandH, SNAP_PX, MIN_W, minH)
        const r = s.box
        boxes[id] = { x: clamp(Math.round(r.x), 0, uw - MIN_W), y: clamp(Math.round(r.y), 0, bandH - minH), width: Math.round(r.width), height: r.height }
        gs = s.guides
      }
      setDraft({ band: bandId, boxes })
      setGuides(gs)
    }
    const onUp = () => {
      el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp)
      setDraft((cur) => { if (cur) commitBand(cur.band, (objs) => objs.map((o) => (cur.boxes[o.id] ? { ...o, ...cur.boxes[o.id] } : o))); return null })
      setGuides([])
    }
    el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp)
  }

  const beginMarquee = (e: React.PointerEvent, bandId: string) => {
    if (e.button !== 0) return
    setBandSel(null)
    const bandEl = e.currentTarget as HTMLElement
    const rect = bandEl.getBoundingClientRect()
    const x0 = (e.clientX - rect.left) / zoom, y0 = (e.clientY - rect.top) / zoom
    const additive = e.shiftKey
    const base = additive && sel && sel.band === bandId ? sel.objs : []
    if (!additive) setSel(null)
    bandEl.setPointerCapture(e.pointerId)
    const objs = liveBand(bandId)?.objects ?? []
    const onMove = (ev: PointerEvent) => {
      const x1 = (ev.clientX - rect.left) / zoom, y1 = (ev.clientY - rect.top) / zoom
      setMarquee({ band: bandId, x0, y0, x1, y1 })
      const r: Box = { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) }
      const hit = objs.filter((o) => o.x < r.x + r.width && o.x + o.width > r.x && o.y < r.y + r.height && o.y + o.height > r.y).map((o) => o.id)
      const ids = Array.from(new Set([...base, ...hit]))
      setSel(ids.length ? { band: bandId, objs: ids } : additive && base.length ? { band: bandId, objs: base } : null)
    }
    const onUp = () => { bandEl.removeEventListener('pointermove', onMove); bandEl.removeEventListener('pointerup', onUp); setMarquee(null) }
    bandEl.addEventListener('pointermove', onMove); bandEl.addEventListener('pointerup', onUp)
  }

  // Drag a margin boundary (from the ruler or the page's dashed guides):
  // live local draft, single commit on release.
  const MARGIN_LABELS = { left: 'Marge gauche', right: 'Marge droite', top: 'Marge haute', bottom: 'Marge basse' } as const
  const beginMarginDrag = (e: React.PointerEvent, side: 'left' | 'right' | 'top' | 'bottom') => {
    e.preventDefault(); e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const horizontal = side === 'left' || side === 'right'
    const start = horizontal ? e.clientX : e.clientY
    const m0 = { ...(mDrag?.m ?? report.margins) }
    // Keep a sensible printable area (min width 120pt / height 200pt).
    const maxVal = horizontal ? pw - m0[side === 'left' ? 'right' : 'left'] - 120 : ph - m0[side === 'top' ? 'bottom' : 'top'] - 200
    let cur = m0
    const mv = (ev: PointerEvent) => {
      const d = ((horizontal ? ev.clientX : ev.clientY) - start) / zoom
      const delta = side === 'right' || side === 'bottom' ? -d : d
      cur = { ...m0, [side]: clamp(Math.round(m0[side] + delta), 6, maxVal) }
      setMDrag({ m: cur, side })
    }
    const up = () => {
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up)
      setMDrag(null)
      onChange({ margins: cur })
    }
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up)
  }

  // ── Band management (rail context menu + inspector) ────────────────────────
  const [railMenu, setRailMenu] = useState<{ pos: MenuDropdownPos; bandId: string | null } | null>(null)
  const ADDABLE: { type: ReportBand['type']; h: number }[] = [
    { type: 'reportHeader', h: 40 }, { type: 'pageHeader', h: 40 },
    { type: 'pageFooter', h: 22 }, { type: 'reportFooter', h: 30 },
  ]
  const detailCount = report.bands.filter((b) => b.type === 'detail').length
  const addBand = (type: ReportBand['type'], h: number) => {
    const nb: ReportBand = { id: uid('band'), type, height: h, objects: [] }
    onChange({ bands: [...report.bands, nb] })
    setBandSel(nb.id)
  }
  /** Whether a band can be deleted: optional bands, or extra detail sections. */
  const canRemoveBand = (b: ReportBand) =>
    ['reportHeader', 'pageHeader', 'pageFooter', 'reportFooter'].includes(b.type) || (b.type === 'detail' && detailCount > 1)
  const removeBand = (bandId: string) => {
    onChange({ bands: report.bands.filter((b) => b.id !== bandId) })
    if (sel?.band === bandId) setSel(null)
    if (bandSel === bandId) setBandSel(null)
  }
  const clearBand = (bandId: string) => setBand(bandId, { objects: [] })
  const duplicateBand = (b: ReportBand) => {
    // Only detail sections can exist in multiple copies.
    const clone: ReportBand = { ...b, id: uid('band'), type: 'detail', objects: b.objects.map((o) => ({ ...o, id: uid('ro') })) }
    const idx = report.bands.findIndex((x) => x.id === b.id)
    const bands = [...report.bands]
    bands.splice(idx + 1, 0, clone)
    onChange({ bands })
    setBandSel(clone.id)
  }
  const promptHeight = async (b: ReportBand) => {
    const v = await prompt({ title: bandLabel(b), message: 'Hauteur de la bande (points)', placeholder: String(Math.round(b.height)), confirmLabel: 'Appliquer' })
    const n = Number(v)
    if (v != null && Number.isFinite(n)) setBand(b.id, { height: clamp(Math.round(n), 8, 500) })
  }
  const promptRename = async (b: ReportBand) => {
    const v = await prompt({ title: 'Renommer la bande', message: `Nom de la bande (vide = « ${BAND_LABELS[b.type]} »)`, placeholder: bandLabel(b), confirmLabel: 'Renommer' })
    if (v != null) setBand(b.id, { name: v.trim() || undefined })
  }
  /** Band types where « saut de page avant » makes sense. */
  const canBreak = (t: ReportBand['type']) => t === 'groupHeader' || t === 'detail' || t === 'reportFooter'
  /** Change a band's type (kept from becoming a group band; keeps the last detail). */
  const changeBandType = (b: ReportBand, t: ReportBand['type']) => {
    if (b.type === t) return
    if (b.type === 'detail' && detailCount <= 1) return // keep at least one detail section
    setBand(b.id, { type: t, groupIndex: undefined })
  }
  /** Move a band next to another one (rail drag & drop). Dropping into another
   *  type's zone re-types the band accordingly. */
  const moveBand = (dragId: string, targetId: string, before: boolean) => {
    const src = report.bands.find((b) => b.id === dragId)
    const tgt = report.bands.find((b) => b.id === targetId)
    if (!src || !tgt || src.id === tgt.id) return
    if (tgt.type === 'groupHeader' || tgt.type === 'groupFooter') return
    if (src.type === 'detail' && tgt.type !== 'detail' && detailCount <= 1) return
    const bands = report.bands.filter((b) => b.id !== dragId)
    const moved: ReportBand = { ...src, type: tgt.type, groupIndex: undefined }
    const ti = bands.findIndex((b) => b.id === targetId)
    bands.splice(before ? ti : ti + 1, 0, moved)
    onChange({ bands })
    setBandSel(moved.id)
  }
  const railMenuItems = (): MenuItem[] => {
    if (!railMenu) return []
    const items: MenuItem[] = []
    const b = railMenu.bandId ? report.bands.find((x) => x.id === railMenu.bandId) : undefined
    if (b) {
      items.push(
        { type: 'label', text: bandLabel(b) },
        { type: 'separator' },
        { type: 'action', label: 'Renommer…', icon: <TypeIcon size={15} />, onClick: () => void promptRename(b) },
        { type: 'action', label: `Hauteur… (${Math.round(b.height)} pt)`, icon: <GripVertical size={15} />, onClick: () => void promptHeight(b) },
        { type: 'action', label: b.hidden ? 'Afficher la bande' : 'Masquer la bande', icon: b.hidden ? <Eye size={15} /> : <EyeOff size={15} />, onClick: () => setBand(b.id, { hidden: !b.hidden }) },
      )
      if (canBreak(b.type)) items.push({ type: 'action', label: 'Saut de page avant', checked: !!b.breakBefore, icon: <ArrowDownToLine size={15} />, onClick: () => setBand(b.id, { breakBefore: !b.breakBefore }) })
      if (b.type === 'detail') items.push({ type: 'action', label: 'Dupliquer la section', icon: <Copy size={15} />, onClick: () => duplicateBand(b) })
      if (b.objects.length) items.push({ type: 'action', label: 'Vider la bande', icon: <Eraser size={15} />, onClick: () => clearBand(b.id) })
      if (canRemoveBand(b)) items.push({ type: 'action', label: 'Supprimer la bande', danger: true, icon: <Trash2 size={15} />, onClick: () => removeBand(b.id) })
    }
    if (items.length) items.push({ type: 'separator' })
    items.push({
      type: 'submenu', label: 'Ajouter une bande', icon: <Plus size={15} />,
      items: FREE_TYPES.map((t) => ({
        type: 'action' as const, label: t.label, icon: t.value === 'detail' ? <Rows3 size={14} /> : undefined,
        onClick: () => addBand(t.value, ADDABLE.find((a) => a.type === t.value)?.h ?? 17),
      })),
    })
    return items
  }
  const openRailMenu = (e: React.MouseEvent, bandId: string | null) => {
    e.preventDefault(); e.stopPropagation()
    setRailMenu({ pos: { top: e.clientY, left: e.clientX, minWidth: 210 }, bandId })
  }

  // Resize a band's height by dragging the bottom edge of its rail cell.
  const beginBandResize = (e: React.PointerEvent, bandId: string) => {
    e.preventDefault(); e.stopPropagation()
    const b0 = report.bands.find((b) => b.id === bandId)
    if (!b0) return
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const start = e.clientY
    let cur = b0.height
    const mv = (ev: PointerEvent) => {
      cur = clamp(Math.round(b0.height + (ev.clientY - start) / zoom), 8, 500)
      setHDrag({ id: bandId, h: cur })
    }
    const up = () => {
      el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up)
      setHDrag(null)
      setBand(bandId, { height: cur })
    }
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up)
  }

  // Apply the height draft for rendering (sheet + rail stay in sync).
  const bands = orderedBands(report).map((b) => (hDrag && hDrag.id === b.id ? { ...b, height: hDrag.h } : b))
  // Print-like vertical layout, shared by the sheet AND the left band rail so
  // both stay pixel-aligned: top margin, header bands, detail, flexible space
  // (where detail repeats), footer bands (page footer at the very bottom),
  // bottom margin. Each band row is height+1 (its bottom border).
  const di = bands.reduce((acc, b, i) => (b.type === 'detail' ? i : acc), -1) // last detail section
  const topBands = bands.slice(0, di + 1)
  const botRaw = bands.slice(di + 1)
  const bottomBands = [...botRaw.filter((b) => b.type !== 'pageFooter'), ...botRaw.filter((b) => b.type === 'pageFooter')]
  const bandsH = bands.reduce((s, b) => s + b.height + 1, 0)
  type Section = { key: string; kind: 'margin' | 'filler' | 'band'; h: number; band?: ReportBand }
  const sections: Section[] = [
    { key: 'mt', kind: 'margin', h: mg.top },
    ...topBands.map((b): Section => ({ key: b.id, kind: 'band', h: b.height + 1, band: b })),
    { key: 'fill', kind: 'filler', h: Math.max(0, uh - bandsH) },
    ...bottomBands.map((b): Section => ({ key: b.id, kind: 'band', h: b.height + 1, band: b })),
    { key: 'mb', kind: 'margin', h: mg.bottom },
  ]

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
          <button type="button" onClick={toggleLive} title="Afficher les données réelles dans le plan"
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${liveOn ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
            <Eye size={14} /> Données réelles
          </button>
          <Button size="sm" variant="primary" icon={<FileDown size={14} />} onClick={openPreview} disabled={busy || !report.dataType}>{busy ? 'Génération…' : 'Aperçu PDF'}</Button>
          <button type="button" onClick={onRemove} className="rounded-md p-2 text-red-500 hover:bg-red-50" title="Supprimer le rapport"><Trash2 size={16} /></button>
        </div>
      </div>

      {/* Barre de format & d'alignement contextuelle (dès qu'un objet est sélectionné) */}
      <SelectionBar objs={selObjs} onPatch={patchSel} onAlign={alignSel} onDistribute={distributeSel} onDuplicate={duplicateSel} onDelete={deleteSel} />

      <div className="flex min-h-0 flex-1">
        {/* Boîte à outils : champs + objets + groupes */}
        <div className="w-52 shrink-0 overflow-auto border-r border-slate-200 bg-slate-50 p-2.5 text-sm">
          <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">Champs</div>
          <div className="mb-3 space-y-1">
            {fields.map((f) => (
              <button key={f.id} type="button" onClick={() => addField(f.name)}
                draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'field', field: f.name })); e.dataTransfer.effectAllowed = 'copy' }}
                className="flex w-full cursor-grab items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1 text-left text-[13px] text-slate-700 hover:border-blue-400 hover:bg-blue-50 active:cursor-grabbing">
                <GripVertical size={11} className="shrink-0 text-slate-300" /><span className="truncate">{f.name}</span><span className="ml-auto text-[10px] text-slate-400">{f.type}</span>
              </button>
            ))}
            {!fields.length && <div className="text-[11px] text-slate-400">Choisissez un type de données.</div>}
          </div>
          <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">Objets</div>
          <div className="mb-3 grid grid-cols-2 gap-1">
            <ToolBtn icon={<TypeIcon size={13} />} label="Étiquette" kind="label" onClick={() => addKind('label')} />
            <ToolBtn icon={<Pilcrow size={13} />} label="Paragraphe" kind="paragraph" onClick={() => addKind('paragraph')} />
            <ToolBtn icon={<Sigma size={13} />} label="Total" kind="summary" onClick={() => addKind('summary')} />
            <ToolBtn icon={<Hash size={13} />} label="Spécial" kind="special" onClick={() => addKind('special')} />
            <ToolBtn icon={<ImageIcon size={13} />} label="Image" kind="image" onClick={() => addKind('image')} />
            <ToolBtn icon={<SquareCheck size={13} />} label="Case" kind="checkbox" onClick={() => addKind('checkbox')} />
            <ToolBtn icon={<Minus size={13} />} label="Trait" kind="line" onClick={() => addKind('line')} />
            <ToolBtn icon={<Square size={13} />} label="Cadre" kind="box" onClick={() => addKind('box')} />
            <ToolBtn icon={<Circle size={13} />} label="Ellipse" kind="ellipse" onClick={() => addKind('ellipse')} />
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
          <div className="mt-4 rounded bg-slate-100 px-2 py-1.5 text-[10px] leading-relaxed text-slate-400">
            Astuce : <b>glissez un champ</b> sur le rapport. Double-clic sur une étiquette pour l’éditer. Clic droit = menu. Repères magnétiques au déplacement · poignées pour redimensionner · Ctrl+glisser duplique · flèches ajustent.
          </div>
        </div>

        {/* Plan du rapport : règle en haut + rail d'étiquettes de bandes à gauche (chrome
            de l'atelier) ; la feuille est la PAGE PHYSIQUE complète, marges visibles,
            pied de page en bas comme à l'impression (façon éditeur Documents). */}
        <div ref={planRef} className="relative min-w-0 flex-1 overflow-auto bg-slate-200/70" onPointerDown={(e) => { if (e.target === e.currentTarget) setSel(null) }}>
          <Ruler pw={pw} mLeft={mg.left} mRight={mg.right} zoom={zoom} onMarginDown={beginMarginDrag} />
          <div className="flex" style={{ width: `max(100%, ${GUTTER + VRULER_W + pw * zoom + 48}px)` }}>
            <BandRail sections={sections} zoom={zoom} groups={report.groups}
              hoverBand={hoverBand} selectedBand={bandSel} onSelect={(id) => { setBandSel(id); setSel(null) }}
              onHover={setHoverBand} onResize={beginBandResize} onContext={openRailMenu} onMove={moveBand} />
            {/* Règle verticale : chrome de l'atelier (sticky à côté du rail), PAS sur la feuille */}
            <VRuler ph={ph} mTop={mg.top} mBottom={mg.bottom} zoom={zoom} onMarginDown={beginMarginDrag} />
            <div className="min-w-0 flex-1 p-6 pt-4" onPointerDown={(e) => { if (e.target === e.currentTarget) setSel(null) }}>
              <div className="mx-auto" style={{ width: pw * zoom }}>
                <div style={{ width: pw * zoom, height: ph * zoom }}>
                  <div className="relative bg-white shadow-md" style={{ width: pw, height: ph, transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                    {/* Limites de la zone imprimable (pointillés, façon Word) */}
                    <div className="pointer-events-none absolute z-0 border border-dashed border-slate-300"
                      style={{ left: mg.left, top: mg.top, width: uw, height: uh }} />
                    {/* Poignées de marges : glisser les bords de la zone imprimable */}
                    <div className="absolute z-10 hover:bg-blue-400/20" title={`${MARGIN_LABELS.left} : ${Math.round(mg.left)} pt — glisser pour redimensionner`}
                      style={{ left: mg.left - 4, top: mg.top, width: 6, height: uh, cursor: 'ew-resize' }}
                      onPointerDown={(e) => beginMarginDrag(e, 'left')} />
                    <div className="absolute z-10 hover:bg-blue-400/20" title={`${MARGIN_LABELS.right} : ${Math.round(mg.right)} pt — glisser pour redimensionner`}
                      style={{ left: mg.left + uw - 2, top: mg.top, width: 6, height: uh, cursor: 'ew-resize' }}
                      onPointerDown={(e) => beginMarginDrag(e, 'right')} />
                    <div className="absolute z-10 hover:bg-blue-400/20" title={`${MARGIN_LABELS.top} : ${Math.round(mg.top)} pt — glisser pour redimensionner`}
                      style={{ left: mg.left, top: mg.top - 8, width: uw, height: 12, cursor: 'ns-resize' }}
                      onPointerDown={(e) => beginMarginDrag(e, 'top')} />
                    <div className="absolute z-10 hover:bg-blue-400/20" title={`${MARGIN_LABELS.bottom} : ${Math.round(mg.bottom)} pt — glisser pour redimensionner`}
                      style={{ left: mg.left, top: mg.top + uh - 4, width: uw, height: 12, cursor: 'ns-resize' }}
                      onPointerDown={(e) => beginMarginDrag(e, 'bottom')} />
                    {/* Valeur en direct pendant le glissement (marge ou hauteur de bande) */}
                    {(mDrag || hDrag) && (
                      <div className="pointer-events-none absolute left-2 top-2 z-20 rounded bg-slate-800/90 px-2 py-1 text-[11px] font-medium text-white">
                        {mDrag
                          ? `${MARGIN_LABELS[mDrag.side]} : ${Math.round(mDrag.m[mDrag.side])} pt`
                          : `Hauteur de bande : ${hDrag!.h} pt`}
                      </div>
                    )}
                    {sections.map((s) => {
                      if (s.kind === 'margin') return <div key={s.key} style={{ height: s.h }} />
                      if (s.kind === 'filler') return (
                        <div key={s.key} className="flex select-none items-start justify-center pt-4 text-[10px] italic text-slate-300"
                          style={{ height: s.h, marginLeft: mg.left, width: uw }}>
                          le détail se répète dans cet espace
                        </div>
                      )
                      const b = s.band!
                      return (
                        <div key={s.key} style={{ marginLeft: mg.left, width: uw }}>
                          <BandRow band={b} uw={uw} zoom={zoom}
                            selIds={sel?.band === b.id ? sel.objs : []}
                            draftBoxes={draft?.band === b.id ? draft.boxes : undefined}
                            guides={draft?.band === b.id ? guides : []}
                            marquee={marquee?.band === b.id ? marquee : null}
                            editingObj={editing?.band === b.id ? editing.obj : null}
                            live={liveOn && liveRows ? { row: liveRows[0], rows: liveRows } : undefined}
                            onObjectDown={beginObjectDrag} onBandDown={beginMarquee}
                            onStartEdit={(objId) => setEditing({ band: b.id, obj: objId })}
                            onEditText={commitEditText} onEditEnd={() => setEditing(null)}
                            onDropObj={(kind, field, x, y) => dropObjAt(b.id, kind, field, x, y)}
                            onContext={(e, objId) => openMenu(e, b.id, objId)}
                            highlight={hoverBand === b.id} bandSelected={bandSel === b.id} onHover={(on) => setHoverBand(on ? b.id : null)}
                            groupField={b.groupIndex != null ? report.groups[b.groupIndex]?.field : undefined} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Aperçu PDF en direct OU inspecteur d'objet */}
        {pdfUrl ? (
          <div className="flex w-[440px] shrink-0 flex-col border-l border-slate-200 bg-slate-100">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-2.5 py-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aperçu PDF</span>
              {busy && <span className="text-[11px] text-slate-400">génération…</span>}
              <div className="ml-auto flex items-center gap-0.5">
                <button type="button" title="Actualiser" onClick={() => void regenPdf()} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><RefreshCw size={14} /></button>
                <a href={pdfUrl} download={`${report.name.replace(/[^\w-]+/g, '_') || 'rapport'}.pdf`} title="Télécharger le PDF" className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><FileDown size={14} /></a>
                <button type="button" title="Fermer l’aperçu" onClick={closePreview} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><X size={14} /></button>
              </div>
            </div>
            <iframe src={`${pdfUrl}#toolbar=0&navpanes=0`} className="min-h-0 w-full flex-1" title="Aperçu du rapport" />
          </div>
        ) : (
          <div className="w-60 shrink-0 overflow-auto border-l border-slate-200 bg-white p-3 text-sm">
            {selObjs.length === 1 ? (
              <ObjectInspector obj={selObjs[0]} fields={fields} onChange={patchSel} onRemove={deleteSel} />
            ) : selObjs.length > 1 ? (
              <MultiInspector objs={selObjs} onChange={patchSel} onRemove={deleteSel} onAlign={alignSel} onDistribute={distributeSel} />
            ) : bandSel && report.bands.some((b) => b.id === bandSel) ? (
              <BandInspector band={report.bands.find((b) => b.id === bandSel)!}
                canRemove={canRemoveBand(report.bands.find((b) => b.id === bandSel)!)}
                canBreak={canBreak(report.bands.find((b) => b.id === bandSel)!.type)}
                typeLocked={report.bands.find((b) => b.id === bandSel)!.type === 'detail' && detailCount <= 1}
                onChange={(p) => setBand(bandSel, p)}
                onChangeType={(t) => changeBandType(report.bands.find((b) => b.id === bandSel)!, t)}
                onClear={() => clearBand(bandSel)}
                onDuplicate={() => { const b = report.bands.find((x) => x.id === bandSel)!; if (b.type === 'detail') duplicateBand(b) }}
                onRemove={() => removeBand(bandSel)} />
            ) : (
              <div className="pt-6 text-center text-[12px] text-slate-400">Sélectionnez un objet (ou plusieurs au lasso / Maj-clic), ou cliquez une bande dans le rail de gauche pour régler la bande.</div>
            )}
          </div>
        )}
      </div>
      {menu && menuItems().length > 0 && <MenuDropdown items={menuItems()} pos={menu.pos} onClose={() => setMenu(null)} />}
      {railMenu && railMenuItems().length > 0 && <MenuDropdown items={railMenuItems()} pos={railMenu.pos} onClose={() => setRailMenu(null)} />}
    </div>
  )
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const DRAG_MIME = 'application/x-report-obj'
const GUTTER = 28 // width (px) of the vertical band-label column (w-7)
const VRULER_W = 16 // width (px) of the vertical ruler column (workshop chrome)
const KIND_LABELS: Record<ReportObject['kind'], string> = {
  label: 'Étiquette', field: 'Champ', summary: 'Total', special: 'Champ spécial', line: 'Trait', box: 'Cadre',
  image: 'Image', ellipse: 'Ellipse', checkbox: 'Case à cocher',
}
/** Object kinds carrying styled text (font controls apply). */
const TEXTUAL_KINDS: ReportObject['kind'][] = ['label', 'field', 'summary', 'special']
/** Live-data rendering context passed down to bands/objects. */
interface LiveCtx { row?: Record<string, unknown>; rows: Record<string, unknown>[] }

function ToolBtn({ icon, label, kind, onClick }: { icon: React.ReactNode; label: string; kind: ReportObject['kind'] | 'paragraph'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind })); e.dataTransfer.effectAllowed = 'copy' }}
      className="flex cursor-grab items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-1.5 text-[11px] text-slate-600 hover:border-blue-400 hover:bg-blue-50 active:cursor-grabbing">{icon}<span className="truncate">{label}</span></button>
  )
}

// ── Barre de format & d'alignement (dès qu'un objet est sélectionné) ──────────

function SelectionBar({ objs, onPatch, onAlign, onDistribute, onDuplicate, onDelete }: {
  objs: ReportObject[]; onPatch: (p: Partial<ReportObject>) => void
  onAlign: (m: AlignMode) => void; onDistribute: (a: 'h' | 'v') => void
  onDuplicate: () => void; onDelete: () => void
}) {
  if (!objs.length) return null
  const first = objs[0]
  const textual = objs.every((o) => TEXTUAL_KINDS.includes(o.kind))
  const count = objs.length
  const Btn = ({ title, onClick, disabled, active, children }: { title: string; onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode }) => (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      className={`rounded p-1.5 disabled:opacity-30 ${active ? 'bg-blue-100 text-blue-700' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'}`}>{children}</button>
  )
  const Sep = () => <span className="mx-1 h-4 w-px bg-slate-300" />
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-3 py-1">
      <span className="mr-1.5 min-w-[54px] text-[11px] font-medium text-slate-400">{count > 1 ? `${count} objets` : KIND_LABELS[first.kind]}</span>
      {textual && (
        <>
          <Btn title="Gras" active={!!first.bold} onClick={() => onPatch({ bold: !first.bold })}><Bold size={14} /></Btn>
          <Btn title="Italique" active={!!first.italic} onClick={() => onPatch({ italic: !first.italic })}><Italic size={14} /></Btn>
          <input type="number" title="Taille de police" value={first.fontSize ?? 10} min={5} max={72}
            onChange={(e) => onPatch({ fontSize: Number(e.target.value) || 10 })}
            className="mx-0.5 w-12 rounded border border-slate-200 bg-white px-1 py-0.5 text-center text-xs text-slate-700" />
          <Sep />
          <Btn title="Texte à gauche" active={(first.align ?? 'left') === 'left'} onClick={() => onPatch({ align: 'left' })}><AlignLeft size={14} /></Btn>
          <Btn title="Texte centré" active={first.align === 'center'} onClick={() => onPatch({ align: 'center' })}><AlignCenter size={14} /></Btn>
          <Btn title="Texte à droite" active={first.align === 'right'} onClick={() => onPatch({ align: 'right' })}><AlignRight size={14} /></Btn>
          <Sep />
        </>
      )}
      <label title="Couleur du texte / trait" className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 hover:bg-blue-50">
        <span className="text-[10px] text-slate-400">A</span>
        <input type="color" value={first.color || '#0f172a'} onChange={(e) => onPatch({ color: e.target.value })} className="h-4 w-5 cursor-pointer border-0 bg-transparent p-0" />
      </label>
      {first.kind !== 'line' && (
        <label title="Couleur de fond" className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 hover:bg-blue-50">
          <span className="inline-block h-3 w-3 rounded-sm border border-slate-300" style={{ background: first.bg || 'transparent' }} />
          <input type="color" value={first.bg || '#ffffff'} onChange={(e) => onPatch({ bg: e.target.value })} className="h-4 w-5 cursor-pointer border-0 bg-transparent p-0" />
          {first.bg && <button type="button" title="Retirer le fond" onClick={(e) => { e.preventDefault(); onPatch({ bg: undefined }) }} className="text-slate-400 hover:text-red-500"><X size={11} /></button>}
        </label>
      )}
      <Sep />
      <Btn title="Aligner à gauche" disabled={count < 2} onClick={() => onAlign('left')}><AlignStartVertical size={14} /></Btn>
      <Btn title="Centrer horizontalement" disabled={count < 2} onClick={() => onAlign('hcenter')}><AlignCenterVertical size={14} /></Btn>
      <Btn title="Aligner à droite" disabled={count < 2} onClick={() => onAlign('right')}><AlignEndVertical size={14} /></Btn>
      <Btn title="Aligner en haut" disabled={count < 2} onClick={() => onAlign('top')}><AlignStartHorizontal size={14} /></Btn>
      <Btn title="Centrer verticalement" disabled={count < 2} onClick={() => onAlign('vcenter')}><AlignCenterHorizontal size={14} /></Btn>
      <Btn title="Aligner en bas" disabled={count < 2} onClick={() => onAlign('bottom')}><AlignEndHorizontal size={14} /></Btn>
      <Btn title="Répartir horizontalement" disabled={count < 3} onClick={() => onDistribute('h')}><AlignHorizontalDistributeCenter size={14} /></Btn>
      <Btn title="Répartir verticalement" disabled={count < 3} onClick={() => onDistribute('v')}><AlignVerticalDistributeCenter size={14} /></Btn>
      <Sep />
      <Btn title="Dupliquer (Ctrl+D)" onClick={onDuplicate}><Copy size={14} /></Btn>
      <button type="button" title="Supprimer (Suppr)" onClick={onDelete} className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
    </div>
  )
}

// ── Règle horizontale graduée en points (barre FIXE en haut de l'atelier) ────
// Collée sous la barre d'outils (sticky top), pleine largeur, toujours visible
// au défilement vertical. Les graduations sont centrées avec la même formule
// que la page (largeur intérieure identique + le même padding horizontal de
// 24px), donc le « 0 » tombe pile sur le début de la zone utile.

function Ruler({ pw, mLeft, mRight, zoom, onMarginDown }: {
  pw: number; mLeft: number; mRight: number; zoom: number
  onMarginDown: (e: React.PointerEvent, side: 'left' | 'right') => void
}) {
  const uw = pw - mLeft - mRight
  const marks: number[] = []
  for (let p = 0; p <= uw; p += 10) marks.push(p)
  return (
    <div className="sticky top-0 z-20 flex h-[18px] select-none border-b border-slate-300/70 bg-white/95 shadow-sm backdrop-blur"
      style={{ width: `max(100%, ${GUTTER + VRULER_W + pw * zoom + 48}px)` }}>
      {/* Espaceur au droit du rail d'étiquettes + de la règle verticale */}
      <div className="shrink-0" style={{ width: GUTTER + VRULER_W }} />
      <div className="min-w-0 flex-1">
        <div className="relative mx-auto h-full" style={{ width: pw * zoom }}>
          {/* Marges grisées, façon Word */}
          <div className="absolute inset-y-0 left-0 bg-slate-300/50" style={{ width: mLeft * zoom }} />
          <div className="absolute inset-y-0 right-0 bg-slate-300/50" style={{ width: mRight * zoom }} />
          {/* Frontières de marges glissables (façon Word) */}
          <div className="absolute inset-y-0 z-10 hover:bg-blue-400/40" title={`Marge gauche : ${Math.round(mLeft)} pt — glisser pour redimensionner`}
            style={{ left: mLeft * zoom - 3, width: 6, cursor: 'ew-resize' }} onPointerDown={(e) => onMarginDown(e, 'left')} />
          <div className="absolute inset-y-0 z-10 hover:bg-blue-400/40" title={`Marge droite : ${Math.round(mRight)} pt — glisser pour redimensionner`}
            style={{ left: (pw - mRight) * zoom - 3, width: 6, cursor: 'ew-resize' }} onPointerDown={(e) => onMarginDown(e, 'right')} />
          <div className="absolute inset-y-0" style={{ left: mLeft * zoom, width: uw * zoom }}>
            {marks.map((p) => (
              <div key={p} className="absolute bottom-0 bg-slate-400/70" style={{ left: p * zoom, width: 1, height: p % 100 === 0 ? 10 : p % 50 === 0 ? 7 : 4 }} />
            ))}
            {marks.filter((p) => p % 100 === 0).map((p) => (
              <span key={`l${p}`} className="absolute top-0.5 text-[8px] leading-none text-slate-400" style={{ left: p * zoom + 2 }}>{p}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Règle verticale (le long de la feuille) : marges haut/bas glissables ─────

function VRuler({ ph, mTop, mBottom, zoom, onMarginDown }: {
  ph: number; mTop: number; mBottom: number; zoom: number
  onMarginDown: (e: React.PointerEvent, side: 'top' | 'bottom') => void
}) {
  const uh = ph - mTop - mBottom
  const marks: number[] = []
  for (let p = 0; p <= uh; p += 10) marks.push(p)
  return (
    <div className="sticky z-10 shrink-0 select-none self-start border-r border-slate-300/70 bg-white/95 shadow-sm backdrop-blur"
      style={{ left: GUTTER, width: VRULER_W, paddingTop: 16 }}>
      <div className="relative" style={{ height: ph * zoom }}>
        {/* Marges grisées, façon Word */}
        <div className="absolute inset-x-0 top-0 bg-slate-300/50" style={{ height: mTop * zoom }} />
        <div className="absolute inset-x-0 bottom-0 bg-slate-300/50" style={{ height: mBottom * zoom }} />
        <div className="absolute inset-x-0" style={{ top: mTop * zoom, height: uh * zoom }}>
          {marks.map((p) => (
            <div key={p} className="absolute right-0 bg-slate-400/70" style={{ top: p * zoom, height: 1, width: p % 100 === 0 ? 10 : p % 50 === 0 ? 7 : 4 }} />
          ))}
          {marks.filter((p) => p % 100 === 0 && p > 0).map((p) => (
            <span key={`l${p}`} className="absolute left-0.5 text-[7px] leading-none text-slate-400" style={{ top: p * zoom + 2 }}>{p}</span>
          ))}
        </div>
        {/* Frontières de marges glissables */}
        <div className="absolute inset-x-0 z-10 hover:bg-blue-400/40" title={`Marge haute : ${Math.round(mTop)} pt — glisser pour redimensionner`}
          style={{ top: mTop * zoom - 4, height: 8, cursor: 'ns-resize' }} onPointerDown={(e) => onMarginDown(e, 'top')} />
        <div className="absolute inset-x-0 z-10 hover:bg-blue-400/40" title={`Marge basse : ${Math.round(mBottom)} pt — glisser pour redimensionner`}
          style={{ top: (ph - mBottom) * zoom - 4, height: 8, cursor: 'ns-resize' }} onPointerDown={(e) => onMarginDown(e, 'bottom')} />
      </div>
    </div>
  )
}

// ── Rail d'étiquettes de bandes (bord gauche de l'atelier, HORS feuille) ─────
// Collé au bord gauche (sticky) : reste visible au défilement horizontal et
// suit la page verticalement. Il rend LES MÊMES sections que la feuille
// (marges / bandes / espace de répétition), aux mêmes hauteurs × zoom, donc
// chaque étiquette est en face de sa partie de page par construction.

type RailSection = { key: string; kind: 'margin' | 'filler' | 'band'; h: number; band?: ReportBand }

/** Short codes shown when a band is too low for its full rotated label. */
const BAND_ABBR: Record<ReportBand['type'], string> = {
  reportHeader: 'ER', pageHeader: 'EP', groupHeader: 'EG',
  detail: 'DÉT', groupFooter: 'PG', pageFooter: 'PP', reportFooter: 'PR',
}
/** Display label of a band: custom name, else the type label. */
const bandLabel = (b: ReportBand) => b.name || BAND_LABELS[b.type]
/** Band types the user can freely create / retype / reorder (groups are managed via the Groups box). */
const FREE_TYPES: { value: ReportBand['type']; label: string }[] = [
  { value: 'reportHeader', label: BAND_LABELS.reportHeader },
  { value: 'pageHeader', label: BAND_LABELS.pageHeader },
  { value: 'detail', label: BAND_LABELS.detail },
  { value: 'pageFooter', label: BAND_LABELS.pageFooter },
  { value: 'reportFooter', label: BAND_LABELS.reportFooter },
]
const BAND_DRAG_MIME = 'application/x-report-band'

function BandRail({ sections, zoom, groups, hoverBand, selectedBand, onSelect, onHover, onResize, onContext, onMove }: {
  sections: RailSection[]; zoom: number; groups: Report['groups']
  hoverBand: string | null; selectedBand: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
  onResize: (e: React.PointerEvent, bandId: string) => void
  onContext: (e: React.MouseEvent, bandId: string | null) => void
  onMove: (dragId: string, targetId: string, before: boolean) => void
}) {
  // Drop indicator while dragging a band cell.
  const [drop, setDrop] = useState<{ id: string; before: boolean } | null>(null)
  const bandsOnly = sections.filter((s) => s.kind === 'band').map((s) => s.band!)
  const numberOf = (b: ReportBand) => {
    const same = bandsOnly.filter((x) => x.type === b.type)
    return same.length > 1 ? ` ${same.findIndex((x) => x.id === b.id) + 1}` : ''
  }
  return (
    <div className="sticky left-0 z-10 w-7 shrink-0 self-start border-r border-slate-300/70 bg-white/95 shadow-sm backdrop-blur" style={{ paddingTop: 16 }}
      onContextMenu={(e) => onContext(e, null)}>
      {sections.map((s) => {
        if (s.kind !== 'band') {
          // Margin / repeat zones: plain spacer, no label.
          return <div key={s.key} className={s.kind === 'margin' ? 'bg-slate-200/40' : ''} style={{ height: s.h * zoom }} />
        }
        const b = s.band!
        const isGroup = b.type === 'groupHeader' || b.type === 'groupFooter'
        const gf = b.groupIndex != null ? groups[b.groupIndex]?.field : undefined
        const dNum = b.name ? '' : numberOf(b)
        const label = bandLabel(b) + dNum + (gf ? ` · ${gf}` : '') + (b.hidden ? ' (masquée)' : '')
        const cellH = s.h * zoom
        // Adaptive label: full name if it fits (~5.5px/char), else short code, else tooltip only.
        const short = (b.name ? b.name.slice(0, 3).toUpperCase() : BAND_ABBR[b.type]) + dNum
        const text = label.length * 5.5 + 10 <= cellH ? label : short.length * 6 + 8 <= cellH ? short : ''
        const hovered = hoverBand === b.id
        const selected = selectedBand === b.id
        return (
          <div key={s.key}
            className={`relative flex cursor-pointer items-center justify-center overflow-visible border-y border-slate-200/70 ${selected ? 'ring-2 ring-inset ring-blue-500' : hovered ? 'ring-1 ring-inset ring-blue-400' : ''} ${b.hidden ? 'opacity-50' : ''}`}
            style={{ height: cellH, background: BAND_TINT[b.type] ?? '#fff' }}
            title={`${label} · ${Math.round(b.height)} pt — glisser pour déplacer`}
            draggable={!isGroup}
            onDragStart={(e) => { e.dataTransfer.setData(BAND_DRAG_MIME, b.id); e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(BAND_DRAG_MIME) || isGroup) return
              e.preventDefault(); e.dataTransfer.dropEffect = 'move'
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              setDrop({ id: b.id, before: e.clientY < r.top + r.height / 2 })
            }}
            onDragLeave={() => setDrop((d) => (d?.id === b.id ? null : d))}
            onDrop={(e) => {
              const dragId = e.dataTransfer.getData(BAND_DRAG_MIME)
              setDrop(null)
              if (!dragId || isGroup) return
              e.preventDefault()
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
              onMove(dragId, b.id, e.clientY < r.top + r.height / 2)
            }}
            onClick={() => onSelect(b.id)}
            onMouseEnter={() => onHover(b.id)} onMouseLeave={() => onHover(null)}
            onContextMenu={(e) => onContext(e, b.id)}>
            {/* Indicateur d'insertion pendant le glisser-déposer */}
            {drop?.id === b.id && <div className="pointer-events-none absolute inset-x-0 z-20 h-[3px] bg-blue-500" style={drop.before ? { top: -2 } : { bottom: -2 }} />}
            {b.hidden && cellH >= 14 ? (
              <EyeOff size={Math.min(12, cellH - 4)} className="text-slate-400" />
            ) : text ? (
              <span className={`rotate-180 whitespace-nowrap text-[9px] font-semibold uppercase tracking-wide ${selected || hovered ? 'text-blue-600' : 'text-slate-400'}`}
                style={{ writingMode: 'vertical-rl' }}>{text}</span>
            ) : null}
            {/* Poignée de hauteur de bande (comme les lignes d'un tableur) */}
            <div className="absolute inset-x-0 bottom-0 h-[5px] cursor-ns-resize hover:bg-blue-500/60"
              title={`${label} — glisser pour changer la hauteur (${Math.round(b.height)} pt)`}
              onPointerDown={(e) => onResize(e, b.id)} />
          </div>
        )
      })}
    </div>
  )
}

// ── Une bande + ses objets déplaçables ───────────────────────────────────────

function BandRow({ band, uw, zoom, selIds, draftBoxes, guides, marquee, editingObj, live, onObjectDown, onBandDown, onStartEdit, onEditText, onEditEnd, onDropObj, onContext, highlight, bandSelected, onHover, groupField }: {
  band: ReportBand; uw: number; zoom: number; selIds: string[]
  draftBoxes?: Record<string, Box>; guides: Guide[]; marquee: Marquee; editingObj: string | null; live?: LiveCtx
  onObjectDown: (e: React.PointerEvent, bandId: string, objId: string, mode: 'move' | ResizeHandle) => void
  onBandDown: (e: React.PointerEvent, bandId: string) => void
  onStartEdit: (objId: string) => void
  onEditText: (text: string) => void
  onEditEnd: () => void
  onDropObj: (kind: ReportObject['kind'], field: string | undefined, x: number, y: number) => void
  onContext: (e: React.MouseEvent, objId: string | null) => void
  highlight?: boolean
  bandSelected?: boolean
  onHover?: (on: boolean) => void
  groupField?: string
}) {
  const label = bandLabel(band) + (groupField ? ` · ${groupField}` : '') + (band.hidden ? ' (masquée)' : '')
  const [dropHint, setDropHint] = useState(false)
  return (
    <div className="relative border-b border-slate-200" title={label} style={band.hidden ? { opacity: 0.35 } : undefined}>
      {/* Marqueur « saut de page avant » */}
      {band.breakBefore && <div className="pointer-events-none absolute left-0 top-0 z-10 border-t-2 border-dashed border-blue-400" style={{ width: uw }} title="Saut de page avant" />}
      <div className="relative" style={{
        width: uw, height: band.height,
        background: dropHint ? '#dbeafe' : (band.fill || BAND_TINT[band.type] || '#fff'),
        outline: dropHint ? '2px dashed #2563eb' : bandSelected ? '2px solid #3b82f6' : highlight ? '1.5px solid #93c5fd' : undefined, outlineOffset: -2,
      }}
        onPointerDown={(e) => onBandDown(e, band.id)}
        onContextMenu={(e) => onContext(e, null)}
        onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)}
        onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropHint(true) } }}
        onDragLeave={() => setDropHint(false)}
        onDrop={(e) => {
          setDropHint(false)
          const raw = e.dataTransfer.getData(DRAG_MIME); if (!raw) return
          e.preventDefault()
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          const p = JSON.parse(raw) as { kind: ReportObject['kind']; field?: string }
          onDropObj(p.kind, p.field, (e.clientX - rect.left) / zoom, (e.clientY - rect.top) / zoom)
        }}>
        {band.objects.map((o) => (
          <DragObject key={o.id} o={o} box={draftBoxes?.[o.id] ?? { x: o.x, y: o.y, width: o.width, height: o.height }}
            selected={selIds.includes(o.id)} single={selIds.length === 1} editing={editingObj === o.id}
            live={live} groupField={groupField}
            onPointerDown={(e, mode) => onObjectDown(e, band.id, o.id, mode)}
            onStartEdit={() => onStartEdit(o.id)} onEditText={onEditText} onEditEnd={onEditEnd}
            onContext={(e) => onContext(e, o.id)} />
        ))}
        {/* Repères magnétiques (smart guides) */}
        {guides.map((g, i) => (
          <div key={i} className="pointer-events-none absolute bg-fuchsia-600"
            style={g.axis === 'x'
              ? { left: g.pos, top: Math.min(g.start, g.end), height: Math.abs(g.end - g.start), width: 1 }
              : { top: g.pos, left: Math.min(g.start, g.end), width: Math.abs(g.end - g.start), height: 1 }} />
        ))}
        {/* Lasso de sélection */}
        {marquee && (
          <div className="pointer-events-none absolute border border-blue-600 bg-blue-600/10"
            style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }} />
        )}
      </div>
    </div>
  )
}

const HANDLE_STYLE: Record<ResizeHandle, CSSProperties> = {
  nw: { left: -4, top: -4, cursor: 'nwse-resize' }, n: { left: '50%', top: -4, marginLeft: -4, cursor: 'ns-resize' },
  ne: { right: -4, top: -4, cursor: 'nesw-resize' }, e: { right: -4, top: '50%', marginTop: -4, cursor: 'ew-resize' },
  se: { right: -4, bottom: -4, cursor: 'nwse-resize' }, s: { left: '50%', bottom: -4, marginLeft: -4, cursor: 'ns-resize' },
  sw: { left: -4, bottom: -4, cursor: 'nesw-resize' }, w: { left: -4, top: '50%', marginTop: -4, cursor: 'ew-resize' },
}

function ResizeHandles({ kind, onStart }: { kind: ReportObject['kind']; onStart: (e: React.PointerEvent, mode: ResizeHandle) => void }) {
  const hs: ResizeHandle[] = kind === 'line' ? ['w', 'e'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
  return <>{hs.map((h) => (
    <div key={h} onPointerDown={(e) => { e.stopPropagation(); onStart(e, h) }}
      style={{ position: 'absolute', width: 8, height: 8, background: '#fff', border: '1.5px solid #2563eb', borderRadius: 2, boxSizing: 'border-box', ...HANDLE_STYLE[h] }} />
  ))}</>
}

function DragObject({ o, box, selected, single, editing, live, groupField, onPointerDown, onStartEdit, onEditText, onEditEnd, onContext }: {
  o: ReportObject; box: Box; selected: boolean; single: boolean; editing: boolean
  live?: LiveCtx; groupField?: string
  onPointerDown: (e: React.PointerEvent, mode: 'move' | ResizeHandle) => void
  onStartEdit: () => void; onEditText: (text: string) => void; onEditEnd: () => void
  onContext: (e: React.MouseEvent) => void
}) {
  // With live data on, show real record values instead of {placeholders}.
  const liveSpecial = (): string => {
    switch (o.special) {
      case 'pageNumber':   return 'Page 1'
      case 'totalPages':   return '1'
      case 'printDate':    return new Date().toLocaleDateString('fr-FR')
      case 'recordNumber': return '1'
      case 'groupName':    return String((groupField && live?.row?.[groupField]) ?? '—')
      default:             return ''
    }
  }
  const preview = o.kind === 'label' ? (o.text || 'Étiquette')
    : o.kind === 'field' ? (live?.row ? fmtValue(live.row[o.field ?? ''], o.format) : `{${o.field || '?'}}`)
    : o.kind === 'summary' ? (live ? fmtValue(summarize(o.summary ?? 'count', o.field ?? '', live.rows), o.format ?? 'number') : `${o.summary}(${o.field || '?'})`)
    : o.kind === 'special' ? (live ? liveSpecial() : (SPECIALS.find((s) => s.value === o.special)?.label ?? o.special))
    : ''
  const handles = selected && single ? <ResizeHandles kind={o.kind} onStart={onPointerDown} /> : null
  // The frame is overflow-visible so resize handles (placed at -4px) are not clipped;
  // the text is clipped by an inner layer instead.
  const frame: CSSProperties = {
    position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height,
    outline: selected ? '1.5px solid #2563eb' : '1px dotted #cbd5e1', cursor: 'move', boxSizing: 'border-box',
  }
  if (o.kind === 'line') return (
    <div style={{ ...frame, height: Math.max(1, box.height), background: o.color || '#cbd5e1', outline: selected ? '1.5px solid #2563eb' : 'none' }}
      onPointerDown={(e) => onPointerDown(e, 'move')} onContextMenu={onContext}>{handles}</div>
  )
  if (o.kind === 'box') return (
    <div style={{ ...frame, border: `1px solid ${o.color || '#cbd5e1'}`, background: o.bg || 'transparent' }}
      onPointerDown={(e) => onPointerDown(e, 'move')} onContextMenu={onContext}>{handles}</div>
  )
  if (o.kind === 'ellipse') return (
    <div style={{ ...frame, borderRadius: '50%', border: `1px solid ${o.color || '#94a3b8'}`, background: o.bg || 'transparent' }}
      onPointerDown={(e) => onPointerDown(e, 'move')} onContextMenu={onContext}>{handles}</div>
  )
  if (o.kind === 'image') return (
    <div style={frame} onPointerDown={(e) => onPointerDown(e, 'move')} onContextMenu={onContext} title="Image">
      {o.src
        ? <img src={o.src} alt="" draggable={false} className="pointer-events-none h-full w-full" style={{ objectFit: o.fit === 'stretch' ? 'fill' : 'contain' }} />
        : <div className="flex h-full w-full items-center justify-center bg-slate-50 text-slate-300"><ImageIcon size={Math.max(10, Math.min(20, box.height - 4))} /></div>}
      {handles}
    </div>
  )
  if (o.kind === 'checkbox') {
    const v = live?.row?.[o.field ?? '']
    const checked = v === true || v === 1 || /^(true|1|oui|yes)$/i.test(String(v ?? ''))
    return (
      <div style={frame} onPointerDown={(e) => onPointerDown(e, 'move')} onContextMenu={onContext} title={`Case à cocher — {${o.field || '?'}}`}>
        <div className="flex h-full w-full items-center justify-center border" style={{ borderColor: o.color || '#334155', color: o.color || '#334155', fontSize: Math.max(7, box.height - 3), lineHeight: 1 }}>
          {(live ? checked : true) ? '✓' : ''}
        </div>
        {handles}
      </div>
    )
  }
  const textLayer: CSSProperties = {
    position: 'absolute', inset: 0, overflow: 'hidden', padding: '0 2px',
    whiteSpace: o.multiline ? 'pre-wrap' : 'nowrap',
    fontSize: o.fontSize ?? 10, fontWeight: o.bold ? 700 : 400, fontStyle: o.italic ? 'italic' : undefined,
    color: o.color || '#0f172a', textAlign: o.align ?? 'left',
    lineHeight: o.multiline ? 1.25 : `${box.height}px`,
    background: o.bg || undefined,
  }
  return (
    <div style={frame} onPointerDown={(e) => { if (!editing) onPointerDown(e, 'move') }} onContextMenu={onContext}
      onDoubleClick={(e) => { if (o.kind === 'label') { e.stopPropagation(); onStartEdit() } }} title={editing ? undefined : preview}>
      {editing ? (
        <input autoFocus defaultValue={o.text ?? ''} onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => onEditText(e.target.value)}
          onBlur={onEditEnd} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); (e.target as HTMLInputElement).blur() } }}
          style={{ ...textLayer, background: '#fff', outline: '1.5px solid #2563eb', border: 'none' }} />
      ) : (
        <div style={textLayer}>
          {/* Placeholder tint only when not showing live data. */}
          <span style={live ? undefined : { color: o.kind === 'field' ? '#2563eb' : o.kind === 'summary' ? '#7c3aed' : o.kind === 'special' ? '#0891b2' : undefined }}>{preview}</span>
        </div>
      )}
      {handles}
    </div>
  )
}

// ── Inspecteur d'une BANDE (sélectionnée depuis le rail) ─────────────────────

function BandInspector({ band, canRemove, canBreak, typeLocked, onChange, onChangeType, onClear, onDuplicate, onRemove }: {
  band: ReportBand; canRemove: boolean; canBreak: boolean; typeLocked: boolean
  onChange: (p: Partial<ReportBand>) => void
  onChangeType: (t: ReportBand['type']) => void
  onClear: () => void; onDuplicate: () => void; onRemove: () => void
}) {
  const isGroup = band.type === 'groupHeader' || band.type === 'groupFooter'
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500">Bande · {bandLabel(band)}</span>
        {canRemove && <button type="button" onClick={onRemove} title="Supprimer la bande" className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>}
      </div>
      <InspRow label="Nom">
        <Input value={band.name ?? ''} placeholder={BAND_LABELS[band.type]} onChange={(e) => onChange({ name: e.target.value || undefined })} />
      </InspRow>
      {!isGroup && (
        <InspRow label="Type">
          {typeLocked
            ? <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[12px] text-slate-400">{BAND_LABELS.detail} — dernière section Détail (type verrouillé)</div>
            : <Dropdown value={band.type} width="100%" onChange={(v) => onChangeType(v as ReportBand['type'])} options={FREE_TYPES} />}
        </InspRow>
      )}
      <InspRow label="Hauteur (pt)">
        <Input type="number" value={String(Math.round(band.height))} onChange={(e) => onChange({ height: clamp(Number(e.target.value) || 8, 8, 500) })} />
      </InspRow>
      <InspRow label="Fond de bande">
        <div className="flex items-center gap-1.5">
          <input type="color" value={band.fill || '#ffffff'} onChange={(e) => onChange({ fill: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-white p-0.5" />
          {band.fill ? <button type="button" onClick={() => onChange({ fill: undefined })} className="text-[11px] text-slate-400 hover:text-red-500">retirer</button> : <span className="text-[11px] text-slate-400">transparent</span>}
        </div>
      </InspRow>
      <div className="mb-2 space-y-1.5">
        <Checkbox checked={!!band.hidden} label="Masquer (non imprimée)" onChange={(c) => onChange({ hidden: c })} />
        {canBreak && <Checkbox checked={!!band.breakBefore} label="Saut de page avant" onChange={(c) => onChange({ breakBefore: c })} />}
      </div>
      <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
        {band.type === 'detail' && (
          <button type="button" onClick={onDuplicate} className="flex w-full items-center gap-1.5 rounded border border-slate-200 px-2 py-1.5 text-[12px] text-slate-600 hover:border-blue-400 hover:bg-blue-50">
            <Copy size={13} /> Dupliquer la section Détail
          </button>
        )}
        <button type="button" onClick={onClear} disabled={!band.objects.length}
          className="flex w-full items-center gap-1.5 rounded border border-slate-200 px-2 py-1.5 text-[12px] text-slate-600 hover:border-red-300 hover:bg-red-50 disabled:opacity-40">
          <Eraser size={13} /> Vider la bande ({band.objects.length} objet{band.objects.length > 1 ? 's' : ''})
        </button>
      </div>
      <div className="mt-3 rounded bg-slate-50 px-2 py-1.5 text-[10px] leading-relaxed text-slate-400">
        Astuce : la hauteur se règle aussi en glissant le bord bas de la cellule dans le rail de gauche.
      </div>
    </div>
  )
}

// ── Inspecteur d'un objet ────────────────────────────────────────────────────

function InspRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="mb-2 block"><span className="mb-1 block text-[11px] font-medium text-slate-500">{label}</span>{children}</label>
}

/** Style controls shared by single and multi selection. */
function StyleControls({ obj, onChange }: { obj: Partial<ReportObject>; onChange: (p: Partial<ReportObject>) => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <InspRow label="Taille police"><Input type="number" value={String(obj.fontSize ?? 10)} onChange={(e) => onChange({ fontSize: Number(e.target.value) || 10 })} /></InspRow>
        <InspRow label="Couleur"><Input value={obj.color ?? '#0f172a'} onChange={(e) => onChange({ color: e.target.value })} /></InspRow>
      </div>
      <InspRow label="Fond">
        <div className="flex items-center gap-1.5">
          <input type="color" value={obj.bg || '#ffffff'} onChange={(e) => onChange({ bg: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-white p-0.5" />
          {obj.bg ? <button type="button" onClick={() => onChange({ bg: undefined })} className="text-[11px] text-slate-400 hover:text-red-500">retirer</button> : <span className="text-[11px] text-slate-400">transparent</span>}
        </div>
      </InspRow>
      <div className="mb-2 flex items-center gap-3">
        <Checkbox checked={!!obj.bold} label="Gras" onChange={(c) => onChange({ bold: c })} />
        <Checkbox checked={!!obj.italic} label="Italique" onChange={(c) => onChange({ italic: c })} />
      </div>
      <InspRow label="Alignement"><Dropdown value={obj.align ?? 'left'} width="100%" onChange={(v) => onChange({ align: v as 'left' | 'center' | 'right' })}
        options={[{ value: 'left', label: 'Gauche' }, { value: 'center', label: 'Centré' }, { value: 'right', label: 'Droite' }]} /></InspRow>
    </>
  )
}

function ObjectInspector({ obj, fields, onChange, onRemove }: {
  obj: ReportObject; fields: { name: string }[]; onChange: (p: Partial<ReportObject>) => void; onRemove: () => void
}) {
  const kindLabel = KIND_LABELS[obj.kind]
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{kindLabel}</span>
        <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
      </div>

      {obj.kind === 'label' && (
        <>
          <InspRow label="Texte">
            {obj.multiline
              ? <Textarea value={obj.text ?? ''} rows={3} onChange={(e) => onChange({ text: e.target.value })} />
              : <Input value={obj.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} />}
          </InspRow>
          <div className="mb-2"><Checkbox checked={!!obj.multiline} label="Multiligne (retour à la ligne)" onChange={(c) => onChange({ multiline: c })} /></div>
        </>
      )}
      {obj.kind === 'image' && (
        <>
          <InspRow label="URL de l’image (PNG/JPG)"><Input value={obj.src ?? ''} placeholder="https://… ou /files/…" onChange={(e) => onChange({ src: e.target.value })} /></InspRow>
          <InspRow label="Ajustement"><Dropdown value={obj.fit ?? 'contain'} width="100%" onChange={(v) => onChange({ fit: v as 'contain' | 'stretch' })}
            options={[{ value: 'contain', label: 'Contenir (proportions)' }, { value: 'stretch', label: 'Étirer' }]} /></InspRow>
        </>
      )}
      {obj.kind === 'checkbox' && (
        <InspRow label="Champ (vrai/faux)"><Dropdown value={obj.field ?? ''} width="100%" onChange={(v) => onChange({ field: v })} options={fields.map((f) => ({ value: f.name, label: f.name }))} /></InspRow>
      )}
      {obj.kind === 'field' && (
        <>
          <InspRow label="Champ de données"><Dropdown value={obj.field ?? ''} width="100%" onChange={(v) => onChange({ field: v })} options={fields.map((f) => ({ value: f.name, label: f.name }))} /></InspRow>
          <InspRow label="Format"><Dropdown value={obj.format ?? 'text'} width="100%" onChange={(v) => onChange({ format: v as ValueFormat })} options={FORMATS} /></InspRow>
        </>
      )}
      {obj.kind === 'summary' && (
        <>
          <InspRow label="Fonction"><Dropdown value={obj.summary ?? 'sum'} width="100%" onChange={(v) => onChange({ summary: v as SummaryFn })}
            options={[{ value: 'sum', label: 'Somme' }, { value: 'count', label: 'Nombre' }, { value: 'avg', label: 'Moyenne' }, { value: 'min', label: 'Minimum' }, { value: 'max', label: 'Maximum' }]} /></InspRow>
          <InspRow label="Champ"><Dropdown value={obj.field ?? ''} width="100%" onChange={(v) => onChange({ field: v })} options={fields.map((f) => ({ value: f.name, label: f.name }))} /></InspRow>
          <InspRow label="Format"><Dropdown value={obj.format ?? 'number'} width="100%" onChange={(v) => onChange({ format: v as ValueFormat })} options={FORMATS} /></InspRow>
        </>
      )}
      {obj.kind === 'special' && <InspRow label="Type"><Dropdown value={obj.special ?? 'pageNumber'} width="100%" onChange={(v) => onChange({ special: v as SpecialField })} options={SPECIALS} /></InspRow>}

      {TEXTUAL_KINDS.includes(obj.kind) && <StyleControls obj={obj} onChange={onChange} />}
      {(obj.kind === 'line' || obj.kind === 'box' || obj.kind === 'ellipse' || obj.kind === 'checkbox') && (
        <InspRow label="Couleur"><Input value={obj.color ?? '#cbd5e1'} onChange={(e) => onChange({ color: e.target.value })} /></InspRow>
      )}
      {(obj.kind === 'box' || obj.kind === 'ellipse') && (
        <InspRow label="Fond">
          <div className="flex items-center gap-1.5">
            <input type="color" value={obj.bg || '#ffffff'} onChange={(e) => onChange({ bg: e.target.value })} className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-white p-0.5" />
            {obj.bg ? <button type="button" onClick={() => onChange({ bg: undefined })} className="text-[11px] text-slate-400 hover:text-red-500">retirer</button> : <span className="text-[11px] text-slate-400">transparent</span>}
          </div>
        </InspRow>
      )}

      <div className="mt-2 grid grid-cols-4 gap-1.5 border-t border-slate-100 pt-2">
        {(['x', 'y', 'width', 'height'] as const).map((k) => (
          <label key={k} className="block"><span className="mb-0.5 block text-[10px] text-slate-400">{k === 'width' ? 'L' : k === 'height' ? 'H' : k.toUpperCase()}</span>
            <Input type="number" value={String(Math.round((obj[k] as number) ?? 0))} onChange={(e) => onChange({ [k]: Number(e.target.value) || 0 } as Partial<ReportObject>)} /></label>
        ))}
      </div>
    </div>
  )
}

/** Inspector shown when several objects are selected: batch style + alignment. */
function MultiInspector({ objs, onChange, onRemove, onAlign, onDistribute }: {
  objs: ReportObject[]; onChange: (p: Partial<ReportObject>) => void; onRemove: () => void
  onAlign: (m: AlignMode) => void; onDistribute: (a: 'h' | 'v') => void
}) {
  const common = objs[0]
  const textual = objs.every((o) => TEXTUAL_KINDS.includes(o.kind))
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{objs.length} objets</span>
        <button type="button" onClick={onRemove} className="text-red-400 hover:text-red-600" title="Tout supprimer"><Trash2 size={14} /></button>
      </div>
      <div className="mb-3 text-[11px] font-semibold uppercase text-slate-400">Alignement</div>
      <div className="mb-3 grid grid-cols-3 gap-1">
        <AlignBtn title="Gauche" onClick={() => onAlign('left')}><AlignStartVertical size={16} /></AlignBtn>
        <AlignBtn title="Centre H" onClick={() => onAlign('hcenter')}><AlignCenterVertical size={16} /></AlignBtn>
        <AlignBtn title="Droite" onClick={() => onAlign('right')}><AlignEndVertical size={16} /></AlignBtn>
        <AlignBtn title="Haut" onClick={() => onAlign('top')}><AlignStartHorizontal size={16} /></AlignBtn>
        <AlignBtn title="Centre V" onClick={() => onAlign('vcenter')}><AlignCenterHorizontal size={16} /></AlignBtn>
        <AlignBtn title="Bas" onClick={() => onAlign('bottom')}><AlignEndHorizontal size={16} /></AlignBtn>
        <AlignBtn title="Répartir H" onClick={() => onDistribute('h')} disabled={objs.length < 3}><AlignHorizontalDistributeCenter size={16} /></AlignBtn>
        <AlignBtn title="Répartir V" onClick={() => onDistribute('v')} disabled={objs.length < 3}><AlignVerticalDistributeCenter size={16} /></AlignBtn>
      </div>
      {textual ? (
        <div className="border-t border-slate-100 pt-2"><StyleControls obj={common} onChange={onChange} /></div>
      ) : (
        <div className="border-t border-slate-100 pt-2"><InspRow label="Couleur"><Input value={common.color ?? '#0f172a'} onChange={(e) => onChange({ color: e.target.value })} /></InspRow></div>
      )}
    </div>
  )
}

function AlignBtn({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled}
      className="flex items-center justify-center rounded border border-slate-200 bg-white py-1.5 text-slate-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30">{children}</button>
  )
}
