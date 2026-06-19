// Fabrique et helpers de rapports « façon Crystal Reports ».
import type { Report, ReportBand, ReportBandType, ReportObject, ValueFormat } from './types'
import { uid } from './store'

export const PAGE_DIM: Record<string, { w: number; h: number }> = {
  A4: { w: 595.28, h: 841.89 },
  Letter: { w: 612, h: 792 },
}

/** Largeur utile (points) selon orientation / format / marges. */
export function usableWidth(r: Pick<Report, 'orientation' | 'pageSize' | 'margins'>): number {
  const dim = PAGE_DIM[r.pageSize] ?? PAGE_DIM.A4
  const w = r.orientation === 'landscape' ? dim.h : dim.w
  return w - r.margins.left - r.margins.right
}

/** Étiquettes lisibles des bandes (panneau + barres de section du concepteur). */
export const BAND_LABELS: Record<ReportBandType, string> = {
  reportHeader: 'En-tête de rapport',
  pageHeader:   'En-tête de page',
  groupHeader:  'En-tête de groupe',
  detail:       'Détail',
  groupFooter:  'Pied de groupe',
  pageFooter:   'Pied de page',
  reportFooter: 'Pied de rapport',
}

/** Ordre d'affichage des bandes dans le concepteur (groupes intercalés). */
export function orderedBands(report: Report): ReportBand[] {
  const find = (t: ReportBandType, gi?: number) =>
    report.bands.find((b) => b.type === t && (gi === undefined ? b.groupIndex == null : b.groupIndex === gi))
  const out: (ReportBand | undefined)[] = [find('reportHeader'), find('pageHeader')]
  report.groups.forEach((_, gi) => out.push(find('groupHeader', gi)))
  out.push(find('detail'))
  for (let gi = report.groups.length - 1; gi >= 0; gi--) out.push(find('groupFooter', gi))
  out.push(find('pageFooter'), find('reportFooter'))
  return out.filter(Boolean) as ReportBand[]
}

function obj(o: Partial<ReportObject> & Pick<ReportObject, 'kind' | 'x' | 'y' | 'width' | 'height'>): ReportObject {
  return { id: uid('ro'), fontSize: 10, ...o }
}

function band(type: ReportBandType, height: number, objects: ReportObject[], groupIndex?: number): ReportBand {
  return { id: uid('band'), type, height, objects, ...(groupIndex !== undefined ? { groupIndex } : {}) }
}

const guessFormat = (name: string, type?: string): ValueFormat => {
  if (type === 'number') return 'number'
  if (type === 'date') return 'date'
  if (/prix|montant|total|price|amount|€|cost/i.test(name)) return 'currency'
  return 'text'
}

/** Crée un rapport de départ équilibré pour un type de données. */
export function makeReport(name: string, dataType: string, fields: { name: string; type?: string }[]): Report {
  const margins = { top: 40, right: 40, bottom: 40, left: 40 }
  const base = { orientation: 'portrait' as const, pageSize: 'A4' as const, margins }
  const cols = (fields.length ? fields : [{ name: 'titre' }]).slice(0, 6)
  const uw = usableWidth(base)
  const colW = uw / cols.length

  const headerLabels = cols.map((f, i) => obj({ kind: 'label', x: i * colW, y: 34, width: colW - 6, height: 14, text: f.name, bold: true, fontSize: 10, color: '#475569' }))
  const detailFields = cols.map((f, i) => obj({ kind: 'field', x: i * colW, y: 3, width: colW - 6, height: 13, field: f.name, fontSize: 10, format: guessFormat(f.name, f.type) }))

  return {
    id: uid('rep'), name, dataType, groups: [], ...base,
    bands: [
      band('pageHeader', 56, [
        obj({ kind: 'label', x: 0, y: 2, width: uw - 120, height: 22, text: name, bold: true, fontSize: 17, color: '#0f172a' }),
        obj({ kind: 'special', x: uw - 120, y: 8, width: 120, height: 12, special: 'printDate', align: 'right', fontSize: 9, color: '#94a3b8' }),
        ...headerLabels,
        obj({ kind: 'line', x: 0, y: 50, width: uw, height: 0.8, color: '#cbd5e1' }),
      ]),
      band('detail', 17, detailFields),
      band('reportFooter', 34, [
        obj({ kind: 'line', x: 0, y: 4, width: uw, height: 0.8, color: '#cbd5e1' }),
        obj({ kind: 'label', x: 0, y: 12, width: 140, height: 14, text: 'Total enregistrements :', bold: true, fontSize: 10 }),
        obj({ kind: 'summary', x: 145, y: 12, width: 80, height: 14, summary: 'count', field: cols[0].name, fontSize: 10, bold: true, format: 'number' }),
      ]),
      band('pageFooter', 22, [
        obj({ kind: 'special', x: 0, y: 6, width: uw, height: 12, special: 'pageNumber', align: 'center', fontSize: 9, color: '#94a3b8' }),
      ]),
    ],
  }
}

/** Ajoute (ou retire) les bandes en-tête/pied pour un niveau de groupe. */
export function withGroupBands(report: Report): ReportBand[] {
  const bands = report.bands.filter((b) => b.type !== 'groupHeader' && b.type !== 'groupFooter')
  const headers: ReportBand[] = []
  const footers: ReportBand[] = []
  report.groups.forEach((g, gi) => {
    const eh = report.bands.find((b) => b.type === 'groupHeader' && b.groupIndex === gi)
    const ef = report.bands.find((b) => b.type === 'groupFooter' && b.groupIndex === gi)
    const uw = usableWidth(report)
    headers.push(eh ?? band('groupHeader', 22, [
      obj({ kind: 'special', x: 0, y: 4, width: uw, height: 16, special: 'groupName', bold: true, fontSize: 12, color: '#1e40af' }),
    ], gi))
    footers.push(ef ?? band('groupFooter', 20, [
      obj({ kind: 'label', x: 0, y: 3, width: 120, height: 13, text: `Sous-total ${g.field}`, italic: true, fontSize: 9, color: '#64748b' }),
    ], gi))
  })
  // Réinsère dans l'ordre logique (les headers après pageHeader, footers avant pageFooter).
  return [...bands.filter((b) => ['reportHeader', 'pageHeader'].includes(b.type)),
    ...headers,
    ...bands.filter((b) => b.type === 'detail'),
    ...footers.reverse(),
    ...bands.filter((b) => ['pageFooter', 'reportFooter'].includes(b.type))]
}
