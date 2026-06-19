// Templates d'APPLICATIONS de démarrage — définitions complètes prêtes à l'emploi.
// Chaque modèle bâtit un AppDefinition (pages + données + workflows + thème).
// Les modèles « mobile » s'appuient sur les widgets mobiles du module (avatar,
// appBar, bottomNav, tileList, chatThread, messageInput) et leur navigation
// runtime (onNav → navigate(idPage)).
import type { AppDefinition, AppKind, Element, ElementLayout, ElementStyle, Page } from './types'

let c = 0
const eid = (p = 'e') => `tpl_${p}_${(c++).toString(36)}`
const sv = (v: unknown) => ({ t: 'static' as const, v })

function E(type: Element['type'], props: Record<string, unknown> = {}, style: ElementStyle = {}, children?: Element[], layout?: ElementLayout): Element {
  return { id: eid(type), type, name: type, props, style, ...(children ? { children } : {}), ...(layout ? { layout } : {}) }
}
const col = (style: ElementStyle, children: Element[], gap = '0'): Element => E('container', {}, style, children, { type: 'column', gap, align: 'stretch' })
const screen = (id: string, name: string, route: string, children: Element[], bg = '#ffffff'): Page => ({
  id, name, route,
  root: { id: eid('root'), type: 'page', name: 'Page', props: {}, style: { background: bg, minHeight: '100%', padding: '0' }, layout: { type: 'column', gap: '0', align: 'stretch' }, children },
})

const theme = {
  primary: '#2563eb', accent: '#7c3aed', background: '#f1f5f9',
  surface: '#ffffff', text: '#0f172a', radius: '8px', font: 'Inter, system-ui, sans-serif',
}
const chatTheme = { primary: '#075e54', accent: '#25d366', background: '#ffffff', surface: '#ffffff', text: '#0f172a', radius: '8px', font: 'Inter, system-ui, sans-serif' }

// ── Vierge ───────────────────────────────────────────────────────────────────
export function blankTemplate(kind: AppKind = 'web'): AppDefinition {
  return {
    pages: [{ id: 'index', name: 'Accueil', route: 'index', root: { id: 'root', type: 'page', name: 'Page', children: [], props: {}, style: { background: '#ffffff', minHeight: '100%', padding: '24px' }, layout: { type: 'column', gap: '16px', align: 'stretch' } } }],
    dataTypes: [], workflows: [], reports: [], styles: [], theme,
    settings: { startPage: 'index', title: kind === 'mobile' ? 'Mon app mobile' : 'Mon application', kind },
  }
}

// ── Liste de tâches (CRUD réel) ──────────────────────────────────────────────
export function todoTemplate(kind: AppKind = 'web'): AppDefinition {
  return {
    settings: { startPage: 'index', title: 'Mes tâches', kind }, theme, styles: [], reports: [],
    dataTypes: [{ id: 'dt_task', name: 'Tâche', fields: [{ id: 'f_title', name: 'titre', type: 'text' }, { id: 'f_done', name: 'fait', type: 'boolean' }] }],
    workflows: [
      { id: 'wf_add', name: 'Ajouter une tâche', event: { type: 'click', elementId: 'btn_add' }, actions: [
        { id: 'a1', type: 'createRecord', dataType: 'Tâche', fields: { titre: { t: 'input', elementId: 'inp_new' }, fait: { t: 'static', v: 'false' } } },
        { id: 'a2', type: 'resetInputs' }] },
      { id: 'wf_del', name: 'Supprimer une tâche', event: { type: 'click', elementId: 'btn_del' }, actions: [{ id: 'a3', type: 'deleteRecord', dataType: 'Tâche', recordRef: { t: 'cell', field: '_id' } }] },
    ],
    pages: [{ id: 'index', name: 'Accueil', route: 'index', root: { id: 'root', type: 'page', name: 'Page', props: {}, style: { background: '#f1f5f9', minHeight: '100%', padding: '32px' }, layout: { type: 'column', gap: '16px', align: 'stretch' }, children: [
      { id: 'h1', type: 'heading', name: 'Titre', props: { text: { t: 'static', v: 'Ma liste de tâches' }, level: 'h1' }, style: { fontSize: '28px', fontWeight: '700', color: '#0f172a' } },
      { id: 'row_add', type: 'container', name: 'Barre d\'ajout', props: {}, layout: { type: 'row', gap: '8px', align: 'center' }, style: { padding: '12px', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }, children: [
        { id: 'inp_new', type: 'input', name: 'Nouvelle tâche', props: { placeholder: { t: 'static', v: 'Que faut-il faire ?' }, inputType: 'text' }, style: { flex: '1', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px' } },
        { id: 'btn_add', type: 'button', name: 'Ajouter', props: { label: { t: 'static', v: 'Ajouter' } }, style: { padding: '10px 18px', background: '#2563eb', color: '#ffffff', borderRadius: '8px', fontWeight: '600', border: 'none', cursor: 'pointer' } }] },
      { id: 'rg_tasks', type: 'repeatingGroup', name: 'Liste', props: { source: { t: 'search', dataType: 'Tâche', sort: { field: '_created_at', desc: true } } }, layout: { type: 'column', gap: '8px', align: 'stretch' }, style: { padding: '0' }, children: [
        { id: 'cell_row', type: 'container', name: 'Ligne', props: {}, layout: { type: 'row', gap: '12px', align: 'center' }, style: { padding: '12px 16px', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }, children: [
          { id: 'txt_title', type: 'text', name: 'Titre', props: { text: { t: 'cell', field: 'titre' } }, style: { flex: '1', fontSize: '15px', color: '#334155' } },
          { id: 'btn_del', type: 'button', name: 'Supprimer', props: { label: { t: 'static', v: 'Supprimer' } }, style: { padding: '6px 12px', background: '#fee2e2', color: '#dc2626', borderRadius: '8px', fontWeight: '600', border: 'none', cursor: 'pointer', fontSize: '13px' } }] }] }] } }],
  }
}

// ── Messagerie (façon WhatsApp) — RÉELLE, multi-comptes, temps réel ──────────
// Données PARTAGÉES (Conversation/Message) → tout compte connecté ayant le lien
// publié participe, avec identité réelle (created_by) et polling (quasi temps réel).
export function chatTemplate(): AppDefinition {
  const bottom = (active: number) => E('bottomNav', { items: 'MessageCircle | Discussions | chats\nSettings | Réglages | settings', active, accent: '#075e54', bg: '#ffffff' }, { width: '100%' })

  const chats = screen('chats', 'Discussions', 'chats', [
    E('appBar', { title: 'Discussions', bg: '#075e54', color: '#ffffff', rightIcons: 'Search' }, { width: '100%' }),
    // Composer : créer une nouvelle conversation (enregistrement Conversation partagé).
    E('container', {}, { display: 'flex', gap: '8px', padding: '10px 12px', background: '#f0f2f5', alignItems: 'center' } as ElementStyle, [
      { id: 'inp_newconv', type: 'input', name: 'Nouvelle conversation', props: { placeholder: sv('Nom de la conversation…'), inputType: 'text' }, style: { flex: '1', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '999px', fontSize: '14px', background: '#fff' } },
      { id: 'btn_newconv', type: 'button', name: 'Créer', props: { label: sv('Créer') }, style: { padding: '9px 16px', background: '#075e54', color: '#fff', borderRadius: '999px', fontWeight: '700', border: 'none', cursor: 'pointer', fontSize: '14px' } },
    ], { type: 'row', gap: '8px', align: 'center' }),
    E('tileList', { sourceType: 'Conversation', titleField: 'nom', timeField: '_created_at', setStateKey: 'conv', targetPage: 'conversation', status: 'online' }, { width: '100%', flex: '1' }),
    bottom(0),
  ])

  const conversation = screen('conversation', 'Conversation', 'conversation', [
    E('appBar', { title: 'Conversation', subtitle: 'appuyez pour les infos', leftIcon: 'ChevronLeft', backTo: 'chats', avatar: 'oui', rightIcons: 'Video,Phone', bg: '#075e54', color: '#ffffff' }, { width: '100%' }),
    E('chatThread', { sourceType: 'Message', textField: 'texte', convField: 'conv', convStateKey: 'conv', bg: '#e5ddd5' }, { width: '100%', flex: '1', minHeight: '300px' }),
    E('messageInput', { dataType: 'Message', textField: 'texte', convField: 'conv', convStateKey: 'conv', placeholder: 'Message', accent: '#25d366', bg: '#f0f2f5' }, { width: '100%' }),
  ])

  const settings = screen('settings', 'Réglages', 'settings', [
    E('appBar', { title: 'Réglages', bg: '#075e54', color: '#ffffff' }, { width: '100%' }),
    col({ padding: '18px 14px', background: '#ffffff', borderBottom: '1px solid #f1f5f9' }, [
      E('container', {}, { display: 'flex', alignItems: 'center', gap: '14px' } as ElementStyle, [
        E('avatar', { name: 'Mon profil', size: 60, status: 'online' }, {}),
        col({}, [E('heading', { text: { t: 'currentUser', field: 'email' }, level: 'h3' }, { fontSize: '16px', fontWeight: '700', color: '#0f172a' }), E('text', { text: sv('Disponible') }, { fontSize: '13px', color: '#64748b' })], '2px'),
      ], { type: 'row', gap: '14px', align: 'center' }),
    ]),
    E('tileList', { items: 'Compte | Confidentialité, sécurité | | | \nNotifications | Sons, vibrations | | | \nAide | FAQ, nous contacter | | | ' }, { width: '100%', flex: '1' }),
    bottom(1),
  ])

  return {
    pages: [chats, conversation, settings],
    dataTypes: [
      { id: 'dt_conv', name: 'Conversation', shared: true, fields: [{ id: 'f_nom', name: 'nom', type: 'text' }] },
      { id: 'dt_msg', name: 'Message', shared: true, fields: [{ id: 'f_txt', name: 'texte', type: 'text' }, { id: 'f_conv', name: 'conv', type: 'text' }] },
    ],
    workflows: [
      { id: 'wf_newconv', name: 'Créer une conversation', event: { type: 'click', elementId: 'btn_newconv' }, actions: [
        { id: 'a1', type: 'createRecord', dataType: 'Conversation', fields: { nom: { t: 'input', elementId: 'inp_newconv' } } },
        { id: 'a2', type: 'resetInputs' },
      ] },
    ],
    reports: [], styles: [], theme: chatTheme,
    settings: { startPage: 'chats', title: 'Messagerie', kind: 'mobile' },
  }
}

// ── Réseau social (fil mobile) ───────────────────────────────────────────────
export function socialTemplate(): AppDefinition {
  const bottom = (a: number) => E('bottomNav', { items: 'Home | Fil | feed\nSearch | Explorer | explore\nPlusSquare | Publier | feed\nUser | Profil | profile', active: a, accent: '#7c3aed', bg: '#ffffff' }, { width: '100%' })
  const post = (name: string, caption: string) => col({ background: '#ffffff', borderBottom: '1px solid #f1f5f9' }, [
    E('container', {}, { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px' } as ElementStyle, [E('avatar', { name, size: 38, status: '' }, {}), E('text', { text: sv(name) }, { fontWeight: '600', color: '#0f172a' })], { type: 'row', gap: '10px', align: 'center' }),
    E('image', { src: sv(''), alt: 'Photo' }, { width: '100%', height: '320px', objectFit: 'cover', background: '#e2e8f0' }),
    E('container', {}, { display: 'flex', gap: '14px', padding: '8px 12px' } as ElementStyle, [E('icon', { icon: 'Heart' }, { color: '#dc2626', fontSize: '22px' }), E('icon', { icon: 'MessageCircle' }, { color: '#0f172a', fontSize: '22px' }), E('icon', { icon: 'Send' }, { color: '#0f172a', fontSize: '22px' })], { type: 'row', gap: '14px', align: 'center' }),
    E('text', { text: sv(caption) }, { padding: '0 12px 12px', fontSize: '14px', color: '#334155' }),
  ])
  const feed = screen('feed', 'Fil', 'feed', [
    E('appBar', { title: 'Mon réseau', bg: '#ffffff', color: '#0f172a', rightIcons: 'Heart,Send' }, { width: '100%', borderBottom: '1px solid #e2e8f0' }),
    col({ flex: '1' }, [post('Léa Fontaine', 'Léa Fontaine Magnifique coucher de soleil 🌅'), post('Tom Mercier', 'Tom Mercier Nouvelle recette du week-end 🍜')]),
    bottom(0),
  ])
  const profile = screen('profile', 'Profil', 'profile', [
    E('appBar', { title: 'camille.m', bg: '#ffffff', color: '#0f172a', rightIcons: 'Menu' }, { width: '100%', borderBottom: '1px solid #e2e8f0' }),
    E('container', {}, { display: 'flex', alignItems: 'center', gap: '20px', padding: '18px' } as ElementStyle, [
      E('avatar', { name: 'Camille Martin', size: 76, status: '' }, {}),
      E('container', {}, { display: 'flex', gap: '18px', flex: '1', justifyContent: 'space-around' } as ElementStyle, [
        col({ alignItems: 'center' }, [E('heading', { text: sv('128'), level: 'h3' }, { fontSize: '18px', fontWeight: '800' }), E('text', { text: sv('posts') }, { fontSize: '12px', color: '#64748b' })], '0'),
        col({ alignItems: 'center' }, [E('heading', { text: sv('4.2k'), level: 'h3' }, { fontSize: '18px', fontWeight: '800' }), E('text', { text: sv('abonnés') }, { fontSize: '12px', color: '#64748b' })], '0'),
        col({ alignItems: 'center' }, [E('heading', { text: sv('310'), level: 'h3' }, { fontSize: '18px', fontWeight: '800' }), E('text', { text: sv('abonnements') }, { fontSize: '12px', color: '#64748b' })], '0'),
      ], { type: 'row', gap: '18px', align: 'center' }),
    ], { type: 'row', gap: '20px', align: 'center' }),
    E('gallery', { images: [], columns: 3, gap: '2px' }, { padding: '2px', flex: '1' }),
    bottom(3),
  ])
  return { pages: [feed, profile], dataTypes: [], workflows: [], reports: [], styles: [], theme: { ...chatTheme, primary: '#7c3aed', accent: '#db2777' }, settings: { startPage: 'feed', title: 'Mon réseau', kind: 'mobile' } }
}

// ── CRM (web) ────────────────────────────────────────────────────────────────
export function crmTemplate(): AppDefinition {
  return {
    settings: { startPage: 'index', title: 'Mon CRM', kind: 'web' }, theme, styles: [], reports: [],
    dataTypes: [{ id: 'dt_lead', name: 'Contact', fields: [{ id: 'f_name', name: 'nom', type: 'text' }, { id: 'f_company', name: 'societe', type: 'text' }, { id: 'f_status', name: 'statut', type: 'option', options: ['Prospect', 'Client', 'Perdu'] }] }],
    workflows: [{ id: 'wf_add', name: 'Ajouter un contact', event: { type: 'click', elementId: 'btn_add' }, actions: [
      { id: 'a1', type: 'createRecord', dataType: 'Contact', fields: { nom: { t: 'input', elementId: 'inp_name' }, societe: { t: 'input', elementId: 'inp_company' }, statut: { t: 'static', v: 'Prospect' } } },
      { id: 'a2', type: 'resetInputs' }] }],
    pages: [{ id: 'index', name: 'Contacts', route: 'index', root: { id: 'root', type: 'page', name: 'Page', props: {}, style: { background: '#f1f5f9', minHeight: '100%', padding: '32px' }, layout: { type: 'column', gap: '20px', align: 'stretch' }, children: [
      { id: 'h1', type: 'heading', name: 'Titre', props: { text: { t: 'static', v: 'Mes contacts' }, level: 'h1' }, style: { fontSize: '28px', fontWeight: '800', color: '#0f172a' } },
      { id: 'row_add', type: 'container', name: 'Ajout', props: {}, layout: { type: 'row', gap: '8px', align: 'center' }, style: { padding: '14px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }, children: [
        { id: 'inp_name', type: 'input', name: 'Nom', props: { placeholder: { t: 'static', v: 'Nom du contact' }, inputType: 'text' }, style: { flex: '1', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px' } },
        { id: 'inp_company', type: 'input', name: 'Société', props: { placeholder: { t: 'static', v: 'Société' }, inputType: 'text' }, style: { flex: '1', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px' } },
        { id: 'btn_add', type: 'button', name: 'Ajouter', props: { label: { t: 'static', v: 'Ajouter' } }, style: { padding: '10px 18px', background: '#2563eb', color: '#fff', borderRadius: '8px', fontWeight: '700', border: 'none', cursor: 'pointer' } }] },
      { id: 'rg', type: 'repeatingGroup', name: 'Liste', props: { source: { t: 'search', dataType: 'Contact', sort: { field: '_created_at', desc: true } } }, layout: { type: 'column', gap: '8px', align: 'stretch' }, style: { padding: '0' }, children: [
        { id: 'cell', type: 'container', name: 'Ligne', props: {}, layout: { type: 'row', gap: '12px', align: 'center' }, style: { padding: '14px 16px', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }, children: [
          { id: 't_name', type: 'text', name: 'Nom', props: { text: { t: 'cell', field: 'nom' } }, style: { flex: '1', fontWeight: '600', color: '#0f172a' } },
          { id: 't_company', type: 'text', name: 'Société', props: { text: { t: 'cell', field: 'societe' } }, style: { flex: '1', color: '#64748b' } },
          { id: 't_status', type: 'text', name: 'Statut', props: { text: { t: 'cell', field: 'statut' } }, style: { color: '#2563eb', fontWeight: '600', fontSize: '13px' } }] }] }] } }],
  }
}

// ── Catalogue des modèles d'applications ─────────────────────────────────────
export interface AppTemplate {
  id: string
  name: string
  description: string
  icon: string            // nom d'icône Lucide
  kinds: AppKind[]        // types proposant ce modèle
  build: (kind: AppKind) => AppDefinition
}

export const TEMPLATES: AppTemplate[] = [
  { id: 'blank',  name: 'Vierge',            description: 'Une page vide pour partir de zéro.',                 icon: 'File',          kinds: ['web', 'mobile'], build: blankTemplate },
  { id: 'chat',   name: 'Messagerie',        description: 'App de discussion façon WhatsApp : listes, fil de messages et navigation.', icon: 'MessageCircle', kinds: ['mobile'], build: () => chatTemplate() },
  { id: 'social', name: 'Réseau social',     description: 'Fil d’actualité mobile : publications, profil et navigation.', icon: 'Heart',     kinds: ['mobile'], build: () => socialTemplate() },
  { id: 'todo',   name: 'Liste de tâches',   description: 'Démo CRUD : ajouter, lister et supprimer.',          icon: 'ListTodo',      kinds: ['web', 'mobile'], build: todoTemplate },
  { id: 'crm',    name: 'CRM contacts',      description: 'Gérez vos contacts : ajout et liste filtrable.',     icon: 'Users',         kinds: ['web'], build: () => crmTemplate() },
]
