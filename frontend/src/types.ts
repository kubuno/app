// ─────────────────────────────────────────────────────────────────────────────
// Modèle de données du module App (no-code façon Bubble).
//
// Une « application » = pages (arbre d'éléments visuels) + types de données
// (« Things ») + workflows (événement → actions) + thème. La définition complète
// est interprétée par le builder ET par le runtime.
// ─────────────────────────────────────────────────────────────────────────────

/** Métadonnée d'une application renvoyée par le backend. */
export interface Application {
  id:           string
  owner_id:     string
  name:         string
  description:  string | null
  definition:   AppDefinition
  file_id:      string | null
  slug:         string
  is_published: boolean
  tags:         string[]
  is_trashed:   boolean
  created_at:   string
  updated_at:   string
}

export interface AppDefinition {
  pages:     Page[]
  dataTypes: DataType[]
  workflows: Workflow[]
  styles:    NamedStyle[]
  theme:     Theme
  settings:  AppSettings
}

export type AppKind = 'web' | 'mobile'

export interface AppSettings {
  startPage: string
  title:     string
  /** Type d'application — pilote l'adaptation de l'éditeur (canvas, appareils). */
  kind:      AppKind
}

export interface Theme {
  primary:    string
  accent:     string
  background: string
  surface:    string
  text:       string
  radius:     string
  font:       string
}

export interface NamedStyle {
  id:    string
  name:  string
  style: ElementStyle
}

// ── Pages & éléments ─────────────────────────────────────────────────────────

export interface Page {
  id:    string
  name:  string
  route: string
  root:  Element
}

export type ElementType =
  | 'page'
  | 'container'
  | 'text'
  | 'heading'
  | 'button'
  | 'input'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'image'
  | 'link'
  | 'divider'
  | 'icon'
  | 'repeatingGroup'
  // ── Widgets riches (façon Elementor) ──
  | 'spacer'
  | 'video'
  | 'audio'
  | 'map'
  | 'embed'
  | 'gallery'
  | 'iconBox'
  | 'imageBox'
  | 'iconList'
  | 'list'
  | 'alert'
  | 'blockquote'
  | 'rating'
  | 'progress'
  | 'testimonial'
  | 'priceTable'
  | 'cta'
  | 'socialIcons'
  | 'tabs'
  | 'accordion'
  | 'counter'
  | 'countdown'
  | 'flipBox'

export interface ElementStyle {
  [prop: string]: string | number | undefined
}

export interface ElementLayout {
  /** Disposition des enfants : pile verticale, ligne horizontale, ou libre. */
  type?:    'column' | 'row' | 'free'
  gap?:     string
  align?:   string   // align-items
  justify?: string   // justify-content
  wrap?:    boolean
}

export interface Element {
  id:        string
  type:      ElementType
  name:      string
  children?: Element[]
  /** Propriétés métier — certaines valeurs peuvent être des expressions dynamiques. */
  props:     Record<string, unknown>
  style:     ElementStyle
  layout?:   ElementLayout
  /** Condition d'affichage (rendu uniquement si l'expression est « truthy »). */
  visibleWhen?: Dyn
}

// ── Expressions dynamiques (liaison de données) ──────────────────────────────
// Une valeur de propriété peut être un littéral OU une expression `Dyn`.

export type Dyn =
  | { t: 'static';  v: unknown }
  /** Valeur courante d'un élément input/textarea/select/checkbox. */
  | { t: 'input';   elementId: string }
  /** Champ de la cellule courante d'un repeating group (contexte de boucle). */
  | { t: 'cell';    field: string }
  /** Variable d'état de page. */
  | { t: 'state';   key: string }
  /** Utilisateur connecté. */
  | { t: 'currentUser'; field?: string }
  /** Recherche d'enregistrements ; `first` → premier, `count` → nombre. */
  | { t: 'search';  dataType: string; constraints?: ConstraintDef[]; sort?: SortDef; first?: boolean; count?: boolean }
  /** Concaténation (texte composite façon « Bonjour {prénom} »). */
  | { t: 'concat';  parts: Dyn[] }

export interface ConstraintDef {
  field: string
  op:    ConstraintOp
  value: Dyn
}

export type ConstraintOp =
  | 'equals' | 'not_equals' | 'contains'
  | 'greater_than' | 'less_than'
  | 'in' | 'is_empty' | 'is_not_empty'

export interface SortDef {
  field: string
  desc:  boolean
}

/** Aide-type : une propriété qui est soit littérale, soit une expression. */
export type Bindable = Dyn | string | number | boolean | null

// ── Types de données (« Things ») ────────────────────────────────────────────

export type FieldType = 'text' | 'longtext' | 'number' | 'boolean' | 'date' | 'option'

export interface Field {
  id:       string
  name:     string
  type:     FieldType
  /** Pour `option` : la liste des valeurs possibles. */
  options?: string[]
}

export interface DataType {
  id:     string
  name:   string
  fields: Field[]
}

// ── Workflows (événement → actions) ──────────────────────────────────────────

export interface EventTrigger {
  type:       'click' | 'pageLoad' | 'inputChange'
  elementId?: string
  pageId?:    string
}

export type Action =
  | { id: string; type: 'createRecord'; dataType: string; fields: Record<string, Dyn> }
  | { id: string; type: 'updateRecord'; dataType: string; recordRef: Dyn; fields: Record<string, Dyn> }
  | { id: string; type: 'deleteRecord'; dataType: string; recordRef: Dyn }
  | { id: string; type: 'navigate';     pageId: string }
  | { id: string; type: 'setState';     key: string; value: Dyn }
  | { id: string; type: 'showAlert';    message: Dyn }
  | { id: string; type: 'resetInputs' }

export type ActionType = Action['type']

export interface Workflow {
  id:      string
  name:    string
  event:   EventTrigger
  actions: Action[]
}

// ── Runtime ──────────────────────────────────────────────────────────────────

/** Contexte d'évaluation passé aux expressions dynamiques au runtime. */
export interface RuntimeContext {
  appId:      string
  /** Segment d'URL data : `apps/<id>` (auth) ou `public/apps/<slug>` (publié). */
  dataScope:  string
  /** Valeurs des inputs (par id d'élément). */
  inputs:     Record<string, unknown>
  /** Variables d'état de page. */
  state:      Record<string, unknown>
  /** Cellule courante d'un repeating group, le cas échéant. */
  cell?:      Record<string, unknown>
  currentUser?: { id: string; email: string }
}
