// ─────────────────────────────────────────────────────────────────────────────
// Exécuteur de workflows au runtime : déroule une suite d'actions en séquence,
// en résolvant les expressions dynamiques contre le contexte courant.
// ─────────────────────────────────────────────────────────────────────────────

import type { Action, RuntimeContext } from '../types'
import { resolveDyn, resolveText } from '../binding'
import { appApi } from '../api'

export interface ActionEnv {
  appId: string
  ctx: RuntimeContext
  setState:    (key: string, value: unknown) => void
  navigate:    (pageId: string) => void
  resetInputs: () => void
  refresh:     () => void
  alert:       (message: string) => void
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
      await runAction(a, env)
    } catch (e) {
      env.alert(`Erreur dans l'action « ${a.type} »`)
      console.error('[app runtime] action failed', a, e)
    }
  }
}

async function runAction(a: Action, env: ActionEnv): Promise<void> {
  const { ctx } = env
  const scope = ctx.dataScope
  switch (a.type) {
    case 'createRecord': {
      const fields = await resolveFields(a.fields, ctx)
      await appApi.createRecord(scope, a.dataType, fields)
      env.refresh()
      break
    }
    case 'updateRecord': {
      const id = await resolveRecordId(a.recordRef, ctx)
      if (!id) { env.alert('Aucun enregistrement cible'); break }
      const fields = await resolveFields(a.fields, ctx)
      await appApi.updateRecord(scope, a.dataType, id, fields)
      env.refresh()
      break
    }
    case 'deleteRecord': {
      const id = await resolveRecordId(a.recordRef, ctx)
      if (!id) { env.alert('Aucun enregistrement cible'); break }
      await appApi.deleteRecord(scope, a.dataType, id)
      env.refresh()
      break
    }
    case 'navigate':
      env.navigate(a.pageId)
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
  }
}
