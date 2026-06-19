import { api } from '@kubuno/sdk'
import type { Application, AppDefinition, ConstraintDef, Page } from './types'

/** Modèle de page réutilisable (persisté côté backend, par utilisateur). */
export interface SavedPageTemplate {
  id:         string
  name:       string
  theme:      string
  definition: Page
  created_at: string
}

/** Contrainte « résolue » envoyée au moteur de données (valeurs littérales). */
export interface ResolvedConstraint {
  field: string
  op:    ConstraintDef['op']
  value: unknown
}

export interface SearchParams {
  constraints?: ResolvedConstraint[]
  sort_field?:  string
  sort_desc?:   boolean
  search_text?: string
  limit?:       number
  offset?:      number
}

export interface DataRecord {
  _id:         string
  _type:       string
  _created_at: string
  _updated_at: string
  _created_by?: string
  [field: string]: unknown
}

export const appApi = {
  // ── Applications ───────────────────────────────────────────────────────────
  async list(): Promise<Application[]> {
    const { data } = await api.get('/app/apps')
    return data
  },
  async get(id: string): Promise<Application> {
    const { data } = await api.get(`/app/apps/${id}`)
    return data
  },
  async openByFile(fileId: string): Promise<Application> {
    const { data } = await api.post('/app/apps/open-by-file', { file_id: fileId })
    return data
  },
  async create(payload: { name: string; description?: string; definition?: AppDefinition; template?: string }): Promise<Application> {
    const { data } = await api.post('/app/apps', payload)
    return data
  },
  async update(id: string, payload: Partial<{ name: string; description: string | null; definition: AppDefinition; tags: string[]; is_published: boolean }>): Promise<Application> {
    const { data } = await api.put(`/app/apps/${id}`, payload)
    return data
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/app/apps/${id}`)
  },
  async duplicate(id: string): Promise<Application> {
    const { data } = await api.post(`/app/apps/${id}/duplicate`)
    return data
  },
  async publish(id: string, published: boolean): Promise<Application> {
    const { data } = await api.post(`/app/apps/${id}/publish`, { published })
    return data
  },

  // ── Vue publique d'une app publiée ───────────────────────────────────────────
  async getPublic(slug: string): Promise<{ id: string; name: string; slug: string; definition: AppDefinition }> {
    const { data } = await api.get(`/app/public/apps/${encodeURIComponent(slug)}`)
    return data
  },

  // ── Modèles de pages réutilisables (inter-projets) ───────────────────────────
  async listPageTemplates(): Promise<SavedPageTemplate[]> {
    const { data } = await api.get('/app/page-templates')
    return data
  },
  async savePageTemplate(payload: { name: string; theme?: string; definition: Page }): Promise<SavedPageTemplate> {
    const { data } = await api.post('/app/page-templates', payload)
    return data
  },
  async deletePageTemplate(id: string): Promise<void> {
    await api.delete(`/app/page-templates/${id}`)
  },

  // ── Données dynamiques (« Things ») ──────────────────────────────────────────
  // `scope` = segment d'URL : `apps/<id>` (authentifié, propriétaire) OU
  // `public/apps/<slug>` (app publiée, visiteur anonyme). Cf. dataScope du runtime.
  async search(scope: string, type: string, params: SearchParams): Promise<{ results: DataRecord[]; count: number }> {
    const { data } = await api.post(`/app/${scope}/data/${encodeURIComponent(type)}/search`, params)
    return data
  },
  async listRecords(scope: string, type: string): Promise<{ results: DataRecord[]; count: number }> {
    const { data } = await api.get(`/app/${scope}/data/${encodeURIComponent(type)}`)
    return data
  },
  async createRecord(scope: string, type: string, fields: Record<string, unknown>): Promise<DataRecord> {
    const { data } = await api.post(`/app/${scope}/data/${encodeURIComponent(type)}`, { data: fields })
    return data
  },
  async updateRecord(scope: string, type: string, rid: string, fields: Record<string, unknown>): Promise<DataRecord> {
    const { data } = await api.put(`/app/${scope}/data/${encodeURIComponent(type)}/${rid}`, { data: fields })
    return data
  },
  async deleteRecord(scope: string, type: string, rid: string): Promise<void> {
    await api.delete(`/app/${scope}/data/${encodeURIComponent(type)}/${rid}`)
  },

  // ── Données PARTAGÉES (multi-utilisateurs, identité réelle) ──────────────────
  // Pool commun sous l'owner de l'app, accessible à tout compte connecté si l'app
  // est publiée + le type déclaré « partagé ». Clé = appId (pas le scope).
  async sharedSearch(appId: string, type: string, params: SearchParams): Promise<{ results: DataRecord[]; count: number }> {
    const { data } = await api.post(`/app/apps/${appId}/shared/${encodeURIComponent(type)}/search`, params)
    return data
  },
  async sharedList(appId: string, type: string): Promise<{ results: DataRecord[]; count: number }> {
    const { data } = await api.get(`/app/apps/${appId}/shared/${encodeURIComponent(type)}`)
    return data
  },
  async sharedCreate(appId: string, type: string, fields: Record<string, unknown>): Promise<DataRecord> {
    const { data } = await api.post(`/app/apps/${appId}/shared/${encodeURIComponent(type)}`, { data: fields })
    return data
  },
  async sharedUpdate(appId: string, type: string, rid: string, fields: Record<string, unknown>): Promise<DataRecord> {
    const { data } = await api.put(`/app/apps/${appId}/shared/${encodeURIComponent(type)}/${rid}`, { data: fields })
    return data
  },
  async sharedDelete(appId: string, type: string, rid: string): Promise<void> {
    await api.delete(`/app/apps/${appId}/shared/${encodeURIComponent(type)}/${rid}`)
  },
}
