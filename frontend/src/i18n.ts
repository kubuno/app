import { registerModuleTranslations } from '@kubuno/sdk'

// Le module App expose son éditeur entièrement traduit côté composants ; ici on
// déclare les libellés du tableau de bord et des dialogues. FR + EN (les autres
// langues retombent sur l'anglais ; ajout ultérieur trivial via le même schéma).

const en = {
  app: 'App',
  dashboard_subtitle: 'Build full web & mobile apps without code — pages, data and workflows.',
  new_app: 'New app',
  loading: 'Loading…',
  no_apps: 'No apps yet.',
  create_first: 'Create your first app',
  published: 'Published',
  duplicate: 'Duplicate',
  delete: 'Delete',
  delete_app: 'Delete app',
  delete_confirm: 'Delete the app “{{name}}”? This cannot be undone.',
  pick_kind: 'What kind of app do you want to build?',
  kind_web: 'Web app',
  kind_web_desc: 'Responsive app for desktop browsers.',
  kind_mobile: 'Mobile app',
  kind_mobile_desc: 'Phone-sized app, optimized for touch.',
  pick_template: 'Pick a starting point',
  recent: 'Recent',
  open: 'Open',
  files_hint: '.kbapp files in the App/ folder — one file per application',
  settings: 'App — settings',
  settings_desc: 'The no-code builder runs entirely in the browser; data lives in the app module.',
}

const fr = {
  app: 'App',
  dashboard_subtitle: 'Créez des apps web et mobiles complètes sans code — pages, données et workflows.',
  new_app: 'Nouvelle application',
  loading: 'Chargement…',
  no_apps: 'Aucune application pour le moment.',
  create_first: 'Créer votre première application',
  published: 'Publié',
  duplicate: 'Dupliquer',
  delete: 'Supprimer',
  delete_app: 'Supprimer l’application',
  delete_confirm: 'Supprimer l’application « {{name}} » ? Cette action est irréversible.',
  pick_kind: 'Quel type d’application voulez-vous créer ?',
  kind_web: 'Application web',
  kind_web_desc: 'Application responsive pour navigateurs de bureau.',
  kind_mobile: 'Application mobile',
  kind_mobile_desc: 'Application au format téléphone, optimisée pour le tactile.',
  pick_template: 'Choisissez un point de départ',
  recent: 'Récents',
  open: 'Ouvrir',
  files_hint: 'Fichiers .kbapp du dossier App/ — un fichier par application',
  settings: 'App — réglages',
  settings_desc: 'Le builder no-code s’exécute entièrement dans le navigateur ; les données vivent dans le module app.',
}

registerModuleTranslations('app', { en, fr })
