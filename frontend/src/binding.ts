// ─────────────────────────────────────────────────────────────────────────────
// Moteur de liaison de données dynamique — évalue les expressions `Dyn`.
//
// Une expression résout vers une valeur concrète à partir d'un `RuntimeContext`
// (valeurs des inputs, état de page, cellule courante, utilisateur). Les
// recherches (`search`) frappent réellement le moteur de données du backend.
// ─────────────────────────────────────────────────────────────────────────────

import type { Dyn, RuntimeContext } from './types'
import { appApi, type DataRecord, type ResolvedConstraint, type SearchParams } from './api'

export function isDyn(v: unknown): v is Dyn {
  return !!v && typeof v === 'object' && typeof (v as { t?: unknown }).t === 'string'
}

// ── Accès aux données conscient du PARTAGE ───────────────────────────────────
// Un type déclaré « partagé » (multi-utilisateurs) est routé vers les endpoints
// `/apps/:id/shared/:type` (identité réelle) ; sinon vers le scope normal
// (`apps/<id>/data` ou `public/apps/<slug>/data`).
const isShared = (ctx: RuntimeContext, type: string) => !!ctx.sharedTypes?.includes(type)

export function searchRecords(ctx: RuntimeContext, type: string, params: SearchParams) {
  return isShared(ctx, type) ? appApi.sharedSearch(ctx.appId, type, params) : appApi.search(ctx.dataScope, type, params)
}
export function createRecordCtx(ctx: RuntimeContext, type: string, fields: Record<string, unknown>) {
  return isShared(ctx, type) ? appApi.sharedCreate(ctx.appId, type, fields) : appApi.createRecord(ctx.dataScope, type, fields)
}
export function updateRecordCtx(ctx: RuntimeContext, type: string, rid: string, fields: Record<string, unknown>) {
  return isShared(ctx, type) ? appApi.sharedUpdate(ctx.appId, type, rid, fields) : appApi.updateRecord(ctx.dataScope, type, rid, fields)
}
export function deleteRecordCtx(ctx: RuntimeContext, type: string, rid: string) {
  return isShared(ctx, type) ? appApi.sharedDelete(ctx.appId, type, rid) : appApi.deleteRecord(ctx.dataScope, type, rid)
}

/** Crée une expression statique (helper). */
export function staticDyn(v: unknown): Dyn {
  return { t: 'static', v }
}

/** Évalue une expression (ou un littéral) vers une valeur concrète. Async : les
 *  recherches interrogent le backend. */
export async function resolveDyn(d: Dyn | unknown, ctx: RuntimeContext): Promise<unknown> {
  if (!isDyn(d)) return d
  switch (d.t) {
    case 'static':
      return d.v
    case 'input':
      return ctx.inputs[d.elementId]
    case 'cell':
      return ctx.cell?.[d.field]
    case 'state':
      return ctx.state[d.key]
    case 'currentUser':
      return d.field ? (ctx.currentUser as Record<string, unknown> | undefined)?.[d.field] : ctx.currentUser?.id
    case 'concat': {
      const parts = await Promise.all(d.parts.map((p) => resolveDyn(p, ctx)))
      return parts.map((p) => (p == null ? '' : String(p))).join('')
    }
    case 'search': {
      const constraints: ResolvedConstraint[] = await Promise.all(
        (d.constraints ?? []).map(async (c) => ({
          field: c.field,
          op: c.op,
          value: await resolveDyn(c.value, ctx),
        })),
      )
      const res = await searchRecords(ctx, d.dataType, {
        constraints,
        sort_field: d.sort?.field,
        sort_desc: d.sort?.desc,
      })
      if (d.count) return res.count
      if (d.first) return res.results[0] ?? null
      return res.results
    }
    default:
      return null
  }
}

/** Évalue une expression et la renvoie en chaîne (pour le contenu textuel). */
export async function resolveText(d: Dyn | unknown, ctx: RuntimeContext): Promise<string> {
  const v = await resolveDyn(d, ctx)
  if (v == null) return ''
  if (Array.isArray(v)) return v.length ? String(v.length) : ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** Évalue la condition de visibilité (truthy → visible). */
export async function resolveVisible(d: Dyn | undefined, ctx: RuntimeContext): Promise<boolean> {
  if (!d) return true
  const v = await resolveDyn(d, ctx)
  if (Array.isArray(v)) return v.length > 0
  return Boolean(v)
}

/** Description lisible d'une expression, pour l'inspecteur du builder. */
export function describeDyn(d: Dyn | unknown): string {
  if (!isDyn(d)) {
    if (d == null || d === '') return '(vide)'
    return String(d)
  }
  switch (d.t) {
    case 'static':  return d.v == null ? '(vide)' : String(d.v)
    case 'input':   return `Saisie · ${d.elementId}`
    case 'cell':    return `Cellule · ${d.field}`
    case 'state':   return `État · ${d.key}`
    case 'currentUser': return `Utilisateur${d.field ? ` · ${d.field}` : ''}`
    case 'concat':  return d.parts.map(describeDyn).join(' + ')
    case 'search':  return `Recherche · ${d.dataType}${d.count ? ' (nombre)' : d.first ? ' (premier)' : ''}`
    default:        return '(expression)'
  }
}

export type { DataRecord }
