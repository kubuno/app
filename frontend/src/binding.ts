// ─────────────────────────────────────────────────────────────────────────────
// Moteur de liaison de données dynamique — évalue les expressions `Dyn`.
//
// Une expression résout vers une valeur concrète à partir d'un `RuntimeContext`
// (valeurs des inputs, état de page, cellule courante, utilisateur). Les
// recherches (`search`) frappent réellement le moteur de données du backend.
// ─────────────────────────────────────────────────────────────────────────────

import type { Dyn, RuntimeContext } from './types'
import { appApi, type DataRecord, type ResolvedConstraint } from './api'

export function isDyn(v: unknown): v is Dyn {
  return !!v && typeof v === 'object' && typeof (v as { t?: unknown }).t === 'string'
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
      const res = await appApi.search(ctx.dataScope, d.dataType, {
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
