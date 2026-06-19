// ─────────────────────────────────────────────────────────────────────────────
// Exécuteur de workflows au runtime : déroule une suite d'actions en séquence,
// en résolvant les expressions dynamiques contre le contexte courant.
// ─────────────────────────────────────────────────────────────────────────────

import type { Action, Report, RuntimeContext } from '../types'
import { resolveDyn, resolveText, searchRecords, createRecordCtx, updateRecordCtx, deleteRecordCtx } from '../binding'

export interface ActionEnv {
  appId: string
  ctx: RuntimeContext
  reports:     Report[]
  setState:    (key: string, value: unknown) => void
  navigate:    (pageId: string) => void
  goBack:      () => void
  resetInputs: () => void
  refresh:     () => void
  alert:       (message: string) => void
}

/** Évalue une condition « Seulement si… » : truthy → action exécutée. */
function isTruthy(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'string') { const t = v.trim().toLowerCase(); return t !== '' && t !== 'false' && t !== '0' && t !== 'non' && t !== 'no' }
  if (typeof v === 'number') return v !== 0
  if (Array.isArray(v)) return v.length > 0
  return Boolean(v)
}

/** Résout l'identifiant d'un enregistrement depuis une expression (objet record
 *  ou id direct). */
async function resolveRecordId(ref: unknown, ctx: RuntimeContext): Promise<string | null> {
  const v = await resolveDyn(ref, ctx)
  if (!v) return null
  if (typeof v === 'string') return v
  if (typeof v === 'object' && v && '_id' in v) return String((v as { _id: unknown })._id)
  return null
}

async function resolveFields(fields: Record<string, unknown> | undefined, ctx: RuntimeContext): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  for (const [k, expr] of Object.entries(fields ?? {})) {
    out[k] = await resolveDyn(expr, ctx)
  }
  return out
}

export async function runActions(actions: Action[], env: ActionEnv): Promise<void> {
  for (const a of actions) {
    try {
      // Exécution conditionnelle (« Seulement si… ») : on saute si la condition est fausse.
      if (a.condition !== undefined) {
        const cond = await resolveDyn(a.condition, env.ctx)
        if (!isTruthy(cond)) continue
      }
      await runAction(a, env)
    } catch (e) {
      env.alert(`Erreur dans l'action « ${a.type} »`)
      console.error('[app runtime] action failed', a, e)
    }
  }
}

async function runAction(a: Action, env: ActionEnv): Promise<void> {
  const { ctx } = env
  switch (a.type) {
    case 'createRecord': {
      const fields = await resolveFields(a.fields, ctx)
      await createRecordCtx(ctx, a.dataType, fields)
      env.refresh()
      break
    }
    case 'updateRecord': {
      const id = await resolveRecordId(a.recordRef, ctx)
      if (!id) { env.alert('Aucun enregistrement cible'); break }
      const fields = await resolveFields(a.fields, ctx)
      await updateRecordCtx(ctx, a.dataType, id, fields)
      env.refresh()
      break
    }
    case 'deleteRecord': {
      const id = await resolveRecordId(a.recordRef, ctx)
      if (!id) { env.alert('Aucun enregistrement cible'); break }
      await deleteRecordCtx(ctx, a.dataType, id)
      env.refresh()
      break
    }
    case 'navigate':
      env.navigate(a.pageId)
      break
    case 'goBack':
      env.goBack()
      break
    case 'setState':
      env.setState(a.key, await resolveDyn(a.value, ctx))
      break
    case 'showAlert':
      env.alert(await resolveText(a.message, ctx))
      break
    case 'resetInputs':
      env.resetInputs()
      break
    case 'openUrl': {
      const url = (await resolveText(a.url, ctx)).trim()
      if (!url) break
      const safe = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`
      if (a.newTab === false) window.location.href = safe
      else window.open(safe, '_blank', 'noopener,noreferrer')
      break
    }
    case 'copyToClipboard': {
      const text = await resolveText(a.text, ctx)
      try { await navigator.clipboard?.writeText(text); env.alert('Copié dans le presse-papier') }
      catch { env.alert('Impossible de copier') }
      break
    }
    case 'generatePdf': {
      const report = env.reports.find((r) => r.id === a.reportId)
      if (!report) { env.alert('Rapport introuvable'); break }
      const { generateReportPdf } = await import('./pdf')
      // Récupère les données du type ciblé (filtre/tri du rapport), puis génère le PDF.
      const constraints = []
      for (const c of report.constraints ?? []) {
        constraints.push({ field: c.field, op: c.op, value: await resolveDyn(c.value, ctx) })
      }
      const res = await searchRecords(ctx, report.dataType, {
        constraints, sort_field: report.sort?.field, sort_desc: report.sort?.desc, limit: 1000,
      })
      await generateReportPdf(report, res.results)
      break
    }
  }
}
