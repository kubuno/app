// ─────────────────────────────────────────────────────────────────────────────
// Moteur de rendu PDF des rapports « façon Crystal Reports ».
//
// Déroule les bandes du rapport (report/page header, en-têtes & pieds de groupe,
// détail, footers) enregistrement par enregistrement, gère les sauts de page, les
// regroupements et les champs de synthèse (sum/count/avg/min/max). Tout est
// produit CÔTÉ CLIENT (pdf-lib) puis téléchargé — aucun rendu serveur.
// ─────────────────────────────────────────────────────────────────────────────

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Report, ReportBand, ReportObject, SummaryFn } from '../types'

const PAGE_DIM: Record<string, { w: number; h: number }> = {
  A4: { w: 595.28, h: 841.89 },
  Letter: { w: 612, h: 792 },
}

function hex(c?: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec((c ?? '').trim())
  if (!m) return rgb(0.1, 0.12, 0.16)
  const int = parseInt(m[1], 16)
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255)
}

function asNumber(v: unknown): number {
  if (typeof v === 'number') return v
  const n = parseFloat(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function fmt(value: unknown, format?: string): string {
  if (value == null) return ''
  switch (format) {
    case 'number':   return asNumber(value).toLocaleString('fr-FR')
    case 'currency': return asNumber(value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
    case 'date':     { const d = new Date(String(value)); return isNaN(+d) ? String(value) : d.toLocaleDateString('fr-FR') }
    case 'datetime': { const d = new Date(String(value)); return isNaN(+d) ? String(value) : d.toLocaleString('fr-FR') }
    default:         return typeof value === 'boolean' ? (value ? 'Oui' : 'Non') : String(value)
  }
}

function summarize(fn: SummaryFn, field: string, records: Record<string, unknown>[]): number {
  if (fn === 'count') return records.length
  const nums = records.map((r) => asNumber(r[field]))
  if (!nums.length) return 0
  if (fn === 'sum') return nums.reduce((a, b) => a + b, 0)
  if (fn === 'avg') return nums.reduce((a, b) => a + b, 0) / nums.length
  if (fn === 'min') return Math.min(...nums)
  if (fn === 'max') return Math.max(...nums)
  return 0
}

interface Fonts { reg: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont }
interface DeferredTotal { page: PDFPage; x: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb> }

/** Génère et télécharge le PDF d'un rapport à partir de ses enregistrements. */
export async function generateReportPdf(report: Report, rows: Record<string, unknown>[]): Promise<void> {
  const doc = await PDFDocument.create()
  const fonts: Fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  }
  const dim = PAGE_DIM[report.pageSize] ?? PAGE_DIM.A4
  const land = report.orientation === 'landscape'
  const pageW = land ? dim.h : dim.w
  const pageH = land ? dim.w : dim.h
  const m = report.margins
  const usableW = pageW - m.left - m.right

  // Tri : par champs de groupe puis tri de détail.
  const groups = report.groups ?? []
  const sorted = [...rows].sort((a, b) => {
    for (const g of groups) {
      const c = String(a[g.field] ?? '').localeCompare(String(b[g.field] ?? ''))
      if (c) return g.desc ? -c : c
    }
    if (report.sort) {
      const c = String(a[report.sort.field] ?? '').localeCompare(String(b[report.sort.field] ?? ''))
      if (c) return report.sort.desc ? -c : c
    }
    return 0
  })

  const bandOf = (type: ReportBand['type'], gi?: number) =>
    report.bands.find((b) => b.type === type && (gi === undefined ? b.groupIndex == null : b.groupIndex === gi))
  const pageHeader = bandOf('pageHeader')
  const pageFooter = bandOf('pageFooter')
  const reportHeader = bandOf('reportHeader')
  const reportFooter = bandOf('reportFooter')

  const deferredTotals: DeferredTotal[] = []
  let page!: PDFPage
  let cursorY = 0
  let pageNo = 0
  let recordNo = 0
  let curGroupName = ''

  const fontFor = (o: ReportObject) => o.bold && o.italic ? fonts.boldItalic : o.bold ? fonts.bold : o.italic ? fonts.italic : fonts.reg

  function drawObject(o: ReportObject, bandTop: number, record: Record<string, unknown> | undefined, scope: Record<string, unknown>[]) {
    const x = m.left + o.x
    const topY = bandTop - o.y
    if (o.kind === 'line') {
      page.drawLine({ start: { x, y: topY }, end: { x: x + o.width, y: topY }, thickness: Math.max(0.5, o.height || 0.7), color: hex(o.color || '#cbd5e1') })
      return
    }
    if (o.kind === 'box') {
      page.drawRectangle({ x, y: topY - o.height, width: o.width, height: o.height, borderWidth: 0.8, borderColor: hex(o.color || '#cbd5e1') })
      return
    }
    let text = ''
    if (o.kind === 'label') text = o.text ?? ''
    else if (o.kind === 'field') text = fmt(record?.[o.field ?? ''], o.format)
    else if (o.kind === 'summary') text = fmt(summarize(o.summary ?? 'count', o.field ?? '', scope), o.format ?? 'number')
    else if (o.kind === 'special') {
      switch (o.special) {
        case 'pageNumber':   text = `Page ${pageNo}`; break
        case 'printDate':    text = new Date().toLocaleDateString('fr-FR'); break
        case 'recordNumber': text = String(recordNo); break
        case 'groupName':    text = curGroupName; break
        case 'totalPages':   text = '###'; break
      }
    }
    const size = o.fontSize ?? 10
    const font = fontFor(o)
    const baselineY = topY - size
    let tx = x
    const tw = font.widthOfTextAtSize(text, size)
    if (o.align === 'center') tx = x + (o.width - tw) / 2
    else if (o.align === 'right') tx = x + o.width - tw
    if (o.kind === 'special' && o.special === 'totalPages') {
      deferredTotals.push({ page, x: tx, y: baselineY, size, font, color: hex(o.color) })
      return
    }
    page.drawText(text, { x: tx, y: baselineY, size, font, color: hex(o.color), maxWidth: o.width, lineHeight: size + 2 })
  }

  function drawBand(band: ReportBand | undefined, record?: Record<string, unknown>, scope: Record<string, unknown>[] = sorted) {
    if (!band || band.height <= 0) return
    if (band.fill) page.drawRectangle({ x: m.left, y: cursorY - band.height, width: usableW, height: band.height, color: hex(band.fill) })
    for (const o of band.objects) drawObject(o, cursorY, record, scope)
    cursorY -= band.height
  }

  function startPage() {
    page = doc.addPage([pageW, pageH])
    pageNo += 1
    cursorY = pageH - m.top
    drawBand(pageHeader)
  }

  function footerSpace() { return (pageFooter?.height ?? 0) }
  function ensure(h: number) {
    if (cursorY - h < m.bottom + footerSpace()) {
      drawBand(pageFooter)               // pied de page courant
      startPage()
    }
  }

  startPage()
  drawBand(reportHeader)

  // Accumulateurs de groupe (enregistrements depuis l'ouverture de chaque niveau).
  const groupVals: (string | null)[] = groups.map(() => null)
  const groupRecs: Record<string, unknown>[][] = groups.map(() => [])

  const closeGroupsFrom = (from: number) => {
    for (let gi = groups.length - 1; gi >= from; gi--) {
      if (groupVals[gi] === null) continue
      curGroupName = String(groupVals[gi])
      const gf = bandOf('groupFooter', gi)
      if (gf) { ensure(gf.height); drawBand(gf, undefined, groupRecs[gi]) }
      groupVals[gi] = null
      groupRecs[gi] = []
    }
  }

  for (const rec of sorted) {
    // Détection des ruptures de groupe (du plus haut niveau au plus bas).
    let breakFrom = -1
    for (let gi = 0; gi < groups.length; gi++) {
      const v = String(rec[groups[gi].field] ?? '')
      if (groupVals[gi] === null || groupVals[gi] !== v) { breakFrom = gi; break }
    }
    if (breakFrom >= 0) {
      closeGroupsFrom(breakFrom)
      for (let gi = breakFrom; gi < groups.length; gi++) {
        const v = String(rec[groups[gi].field] ?? '')
        groupVals[gi] = v
        groupRecs[gi] = []
        curGroupName = v
        const gh = bandOf('groupHeader', gi)
        if (gh) { ensure(gh.height); drawBand(gh, rec, [rec]) }
      }
    }
    groups.forEach((_, gi) => groupRecs[gi].push(rec))

    recordNo += 1
    const detail = bandOf('detail')
    if (detail) { ensure(detail.height); drawBand(detail, rec, [rec]) }
  }

  closeGroupsFrom(0)
  if (reportFooter) { ensure(reportFooter.height); drawBand(reportFooter, undefined, sorted) }
  drawBand(pageFooter)

  // Champs « nombre total de pages » résolus une fois la pagination connue.
  const total = doc.getPageCount()
  for (const d of deferredTotals) d.page.drawText(String(total), { x: d.x, y: d.y, size: d.size, font: d.font, color: d.color })

  const bytes = await doc.save()
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${report.name.replace(/[^\w\-]+/g, '_') || 'rapport'}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
