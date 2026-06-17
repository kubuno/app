// Templates de démarrage — définitions d'app prêtes à l'emploi.
import type { AppDefinition, AppKind } from './types'

const theme = {
  primary: '#2563eb', accent: '#7c3aed', background: '#f1f5f9',
  surface: '#ffffff', text: '#0f172a', radius: '8px', font: 'Inter, system-ui, sans-serif',
}

export function blankTemplate(kind: AppKind = 'web'): AppDefinition {
  return {
    pages: [{
      id: 'index', name: 'Accueil', route: 'index',
      root: { id: 'root', type: 'page', name: 'Page', children: [], props: {}, style: { background: '#ffffff', minHeight: '100%', padding: '24px' }, layout: { type: 'column', gap: '16px', align: 'stretch' } },
    }],
    dataTypes: [], workflows: [], styles: [], theme,
    settings: { startPage: 'index', title: kind === 'mobile' ? 'Mon app mobile' : 'Mon application', kind },
  }
}

/** Application « Liste de tâches » complète et fonctionnelle (CRUD réel). */
export function todoTemplate(kind: AppKind = 'web'): AppDefinition {
  return {
    settings: { startPage: 'index', title: 'Mes tâches', kind },
    theme,
    styles: [],
    dataTypes: [
      { id: 'dt_task', name: 'Tâche', fields: [
        { id: 'f_title', name: 'titre', type: 'text' },
        { id: 'f_done', name: 'fait', type: 'boolean' },
      ] },
    ],
    workflows: [
      {
        id: 'wf_add', name: 'Ajouter une tâche',
        event: { type: 'click', elementId: 'btn_add' },
        actions: [
          { id: 'a1', type: 'createRecord', dataType: 'Tâche', fields: { titre: { t: 'input', elementId: 'inp_new' }, fait: { t: 'static', v: 'false' } } },
          { id: 'a2', type: 'resetInputs' },
        ],
      },
      {
        id: 'wf_del', name: 'Supprimer une tâche',
        event: { type: 'click', elementId: 'btn_del' },
        actions: [
          { id: 'a3', type: 'deleteRecord', dataType: 'Tâche', recordRef: { t: 'cell', field: '_id' } },
        ],
      },
    ],
    pages: [{
      id: 'index', name: 'Accueil', route: 'index',
      root: {
        id: 'root', type: 'page', name: 'Page', props: {},
        style: { background: '#f1f5f9', minHeight: '100%', padding: '32px' },
        layout: { type: 'column', gap: '16px', align: 'stretch' },
        children: [
          { id: 'h1', type: 'heading', name: 'Titre', props: { text: { t: 'static', v: 'Ma liste de tâches' }, level: 'h1' }, style: { fontSize: '28px', fontWeight: '700', color: '#0f172a' } },
          {
            id: 'row_add', type: 'container', name: 'Barre d\'ajout', props: {},
            layout: { type: 'row', gap: '8px', align: 'center' },
            style: { padding: '12px', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' },
            children: [
              { id: 'inp_new', type: 'input', name: 'Nouvelle tâche', props: { placeholder: { t: 'static', v: 'Que faut-il faire ?' }, inputType: 'text' }, style: { flex: '1', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px' } },
              { id: 'btn_add', type: 'button', name: 'Bouton Ajouter', props: { label: { t: 'static', v: 'Ajouter' } }, style: { padding: '10px 18px', background: '#2563eb', color: '#ffffff', borderRadius: '8px', fontWeight: '600', border: 'none', cursor: 'pointer' } },
            ],
          },
          {
            id: 'rg_tasks', type: 'repeatingGroup', name: 'Liste des tâches',
            props: { source: { t: 'search', dataType: 'Tâche', sort: { field: '_created_at', desc: true } } },
            layout: { type: 'column', gap: '8px', align: 'stretch' }, style: { padding: '0' },
            children: [
              {
                id: 'cell_row', type: 'container', name: 'Ligne tâche', props: {},
                layout: { type: 'row', gap: '12px', align: 'center' },
                style: { padding: '12px 16px', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' },
                children: [
                  { id: 'txt_title', type: 'text', name: 'Titre tâche', props: { text: { t: 'cell', field: 'titre' } }, style: { flex: '1', fontSize: '15px', color: '#334155' } },
                  { id: 'btn_del', type: 'button', name: 'Bouton Supprimer', props: { label: { t: 'static', v: 'Supprimer' } }, style: { padding: '6px 12px', background: '#fee2e2', color: '#dc2626', borderRadius: '8px', fontWeight: '600', border: 'none', cursor: 'pointer', fontSize: '13px' } },
                ],
              },
            ],
          },
        ],
      },
    }],
  }
}

export const TEMPLATES: { id: string; name: string; description: string; build: (kind: AppKind) => AppDefinition }[] = [
  { id: 'blank', name: 'Vierge', description: 'Une page vide pour partir de zéro.', build: blankTemplate },
  { id: 'todo', name: 'Liste de tâches', description: 'Démo complète : données, ajout, liste et suppression.', build: todoTemplate },
]
