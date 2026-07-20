// ─────────────────────────────────────────────────────────────────────────────
// Moteur de rendu PDF des rapports « façon Crystal Reports ».
//
// Déroule les bandes du rapport (report/page header, en-têtes & pieds de groupe,
// détail, footers) enregistrement par enregistrement, gère les sauts de page, les
// regroupements et les champs de synthèse (sum/count/avg/min/max). Tout est
// produit CÔTÉ CLIENT (pdf-lib) puis téléchargé — aucun rendu serveur.
// ─────────────────────────────────────────────────────────────────────────────

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import type { Report, ReportBand, ReportObject } from '../types'
import { fmtValue as fmt, summarize } from '../reports'

const PAGE_DIM: Record<string, { w: number; h: number }> = {
  A4: { w: 595.28, h: 841.89 },
  Letter: { w: 612, h: 792 },
}

function hexOrNull(c?: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec((c ?? '').trim())
  if (!m) return null
  const int = parseInt(m[1], 16)
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255)
}
const hex = (c?: string) => hexOrNull(c) ?? rgb(0.1, 0.12, 0.16)

interface Fonts { reg: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont }
interface DeferredTotal { page: PDFPage; x: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb> }

/** Render a report to PDF bytes from its records (no download). */
export async function renderReportPdfBytes(report: Report, rows: Record<string, unknown>[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fonts: Fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
  }
  // Pre-embed every image used by the report (PNG/JPG, by URL or data URI).
  const imgCache = new Map<string, PDFImage | null>()
  {
    const srcs = new Set<string>()
    for (const b of report.bands) for (const o of b.objects) if (o.kind === 'image' && o.src) srcs.add(o.src)
    for (const src of srcs) {
      try {
        const res = await fetch(src, { credentials: 'include' })
        const buf = new Uint8Array(await res.arrayBuffer())
        const isPng = buf[0] === 0x89 && buf[1] === 0x50
        imgCache.set(src, isPng ? await doc.embedPng(buf) : await doc.embedJpg(buf))
      } catch { imgCache.set(src, null) }
    }
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
  // Generalised banded model: every type may have several bands, all drawn in
  // array order within their print slot.
  const listOf = (t: ReportBand['type']) => report.bands.filter((b) => b.type === t && b.groupIndex == null && !b.hidden)
  const pageHeaders = listOf('pageHeader')
  const pageFooters = listOf('pageFooter')
  const reportHeaders = listOf('reportHeader')
  const reportFooters = listOf('reportFooter')
  const details = listOf('detail')
  const pageFootersH = pageFooters.reduce((s, b) => s + b.height, 0)

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
      const fill = hexOrNull(o.bg)
      page.drawRectangle({ x, y: topY - o.height, width: o.width, height: o.height, borderWidth: 0.8, borderColor: hex(o.color || '#cbd5e1'), ...(fill ? { color: fill } : {}) })
      return
    }
    if (o.kind === 'ellipse') {
      const fill = hexOrNull(o.bg)
      page.drawEllipse({ x: x + o.width / 2, y: topY - o.height / 2, xScale: o.width / 2, yScale: o.height / 2, borderWidth: 1, borderColor: hex(o.color || '#94a3b8'), ...(fill ? { color: fill } : {}) })
      return
    }
    if (o.kind === 'image') {
      const img = o.src ? imgCache.get(o.src) : null
      if (img) {
        let w = o.width, h = o.height, dx = 0, dy = 0
        if (o.fit !== 'stretch') {
          const k = Math.min(o.width / img.width, o.height / img.height)
          w = img.width * k; h = img.height * k
          dx = (o.width - w) / 2; dy = (o.height - h) / 2
        }
        page.drawImage(img, { x: x + dx, y: topY - o.height + dy, width: w, height: h })
      }
      return
    }
    if (o.kind === 'checkbox') {
      const v = record?.[o.field ?? '']
      const checked = v === true || v === 1 || /^(true|1|oui|yes)$/i.test(String(v ?? ''))
      const s = Math.min(o.width, o.height)
      const by = topY - s
      const c = hex(o.color || '#334155')
      page.drawRectangle({ x, y: by, width: s, height: s, borderWidth: 1, borderColor: c })
      if (checked) {
        page.drawLine({ start: { x: x + s * 0.2, y: by + s * 0.55 }, end: { x: x + s * 0.42, y: by + s * 0.25 }, thickness: 1.4, color: c })
        page.drawLine({ start: { x: x + s * 0.42, y: by + s * 0.25 }, end: { x: x + s * 0.8, y: by + s * 0.75 }, thickness: 1.4, color: c })
      }
      return
    }
    // Optional background fill behind text objects.
    const bg = hexOrNull(o.bg)
    if (bg) page.drawRectangle({ x, y: topY - o.height, width: o.width, height: o.height, color: bg })
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

  // True once real content (not page header/footer) was drawn on the current page —
  // used by `breakBefore` to avoid emitting blank pages.
  let contentDrawn = false

  function drawBand(band: ReportBand | undefined, record?: Record<string, unknown>, scope: Record<string, unknown>[] = sorted) {
    if (!band || band.height <= 0 || band.hidden) return
    const fill = hexOrNull(band.fill)
    if (fill) page.drawRectangle({ x: m.left, y: cursorY - band.height, width: usableW, height: band.height, color: fill })
    for (const o of band.objects) drawObject(o, cursorY, record, scope)
    cursorY -= band.height
    if (band.type !== 'pageHeader' && band.type !== 'pageFooter') contentDrawn = true
  }

  // Page footers pinned at the BOTTOM of the page (matches the designer layout).
  function drawPageFooter() {
    if (!pageFootersH) return
    cursorY = m.bottom + pageFootersH
    for (const f of pageFooters) drawBand(f)
  }

  function startPage() {
    page = doc.addPage([pageW, pageH])
    pageNo += 1
    cursorY = pageH - m.top
    contentDrawn = false
    for (const h of pageHeaders) drawBand(h)
  }

  function footerSpace() { return pageFootersH }
  function ensure(h: number) {
    if (cursorY - h < m.bottom + footerSpace()) {
      drawPageFooter()                   // pied de page courant (en bas)
      startPage()
    }
  }
  /** Honour a band's « saut de page avant » flag. */
  function maybeBreak(band: ReportBand | undefined) {
    if (band?.breakBefore && !band.hidden && contentDrawn) { drawPageFooter(); startPage() }
  }

  startPage()
  for (const rh of reportHeaders) drawBand(rh)

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
        if (gh) { maybeBreak(gh); ensure(gh.height); drawBand(gh, rec, [rec]) }
      }
    }
    groups.forEach((_, gi) => groupRecs[gi].push(rec))

    recordNo += 1
    for (const d of details) { maybeBreak(d); ensure(d.height); drawBand(d, rec, [rec]) }
  }

  closeGroupsFrom(0)
  for (const rf of reportFooters) { maybeBreak(rf); ensure(rf.height); drawBand(rf, undefined, sorted) }
  drawPageFooter()

  // Champs « nombre total de pages » résolus une fois la pagination connue.
  const total = doc.getPageCount()
  for (const d of deferredTotals) d.page.drawText(String(total), { x: d.x, y: d.y, size: d.size, font: d.font, color: d.color })

  return doc.save()
}

/** Render a report to a PDF Blob (for the designer's live preview). */
export async function renderReportPdfBlob(report: Report, rows: Record<string, unknown>[]): Promise<Blob> {
  const bytes = await renderReportPdfBytes(report, rows)
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

/** Génère et télécharge le PDF d'un rapport à partir de ses enregistrements. */
export async function generateReportPdf(report: Report, rows: Record<string, unknown>[]): Promise<void> {
  const blob = await renderReportPdfBlob(report, rows)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${report.name.replace(/[^\w\-]+/g, '_') || 'rapport'}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
