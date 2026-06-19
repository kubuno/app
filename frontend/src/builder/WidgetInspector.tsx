import { Input, Textarea, Dropdown, Checkbox } from '@ui'
import type { Element } from '../types'
import { parsePairs, pairsToText } from '../elements/widgets'

// Éditeurs de propriétés des widgets « riches » (façon Elementor). Les valeurs
// sont de simples chaînes/tableaux (pas d'expressions Dyn).

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-2 block">
      <span className="mb-1 block text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}
function Sep({ label }: { label: string }) {
  return <div className="mb-2 mt-3 border-t border-slate-200 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
}
const str = (v: unknown, fb = '') => (v == null ? fb : String(v))

export default function WidgetInspector({ el, setProp }: { el: Element; setProp: (k: string, v: unknown) => void }) {
  const p = el.props
  const T = (k: string, label: string, ph?: string) => (
    <Row label={label}><Input value={str(p[k])} placeholder={ph} onChange={(e) => setProp(k, e.target.value)} /></Row>
  )
  const Sel = (k: string, label: string, opts: { value: string; label: string }[], dflt: string) => (
    <Row label={label}><Dropdown value={str(p[k], dflt)} width="100%" options={opts} onChange={(v) => setProp(k, v)} /></Row>
  )
  const Lines = (k: string, label: string, hint = 'Un par ligne') => (
    <Row label={`${label} (${hint})`}>
      <Textarea rows={4} value={(Array.isArray(p[k]) ? (p[k] as string[]) : []).join('\n')}
        onChange={(e) => setProp(k, e.target.value.split('\n').map((x) => x.trim()).filter(Boolean))} />
    </Row>
  )
  const Pairs = (k: string, label: string, hint = 'Une ligne « a | b »') => (
    <Row label={`${label} (${hint})`}>
      <Textarea rows={4} value={pairsToText(Array.isArray(p[k]) ? (p[k] as { a: string; b: string }[]) : [])}
        onChange={(e) => setProp(k, parsePairs(e.target.value))} />
    </Row>
  )
  const Bool = (k: string, label: string, dflt = false) => (
    <div className="mb-2"><Checkbox checked={p[k] === undefined ? dflt : Boolean(p[k])} label={label} onChange={(c) => setProp(k, c)} /></div>
  )
  // Textarea liée à une prop CHAÎNE (multi-lignes : graphique, tableau, étapes…).
  const TA = (k: string, label: string, hint?: string, rows = 4) => (
    <Row label={hint ? `${label} (${hint})` : label}>
      <Textarea rows={rows} value={str(p[k])} onChange={(e) => setProp(k, e.target.value)} />
    </Row>
  )
  const ALIGN = [{ value: 'left', label: 'Gauche' }, { value: 'center', label: 'Centré' }, { value: 'right', label: 'Droite' }]

  switch (el.type) {
    case 'spacer':
      return <div className="text-[11px] text-slate-400">Réglez la hauteur dans la section Style.</div>
    case 'video':
      return T('url', 'URL vidéo', 'YouTube, Vimeo ou .mp4')
    case 'audio':
      return T('src', 'URL audio', '…/son.mp3')
    case 'map':
      return <>{T('query', 'Adresse / lieu', 'Paris, France')}{T('zoom', 'Zoom (1-20)')}</>
    case 'embed':
      return <Row label="Code HTML"><Textarea rows={5} value={str(p.html)} onChange={(e) => setProp('html', e.target.value)} /></Row>
    case 'gallery':
      return <>{Lines('images', 'Images', 'une URL par ligne')}{T('columns', 'Colonnes')}{T('gap', 'Espacement', '8px')}</>
    case 'iconBox':
      return <>{T('icon', 'Icône (nom lucide)', 'Sparkles')}{T('iconColor', 'Couleur icône', '#2563eb')}{T('iconSize', 'Taille icône')}{T('title', 'Titre')}{T('text', 'Texte')}{Sel('align', 'Alignement', ALIGN, 'center')}</>
    case 'imageBox':
      return <>{T('src', 'Image (URL)')}{T('title', 'Titre')}{T('text', 'Texte')}{Sel('align', 'Alignement', ALIGN, 'center')}</>
    case 'iconList':
      return <>{Pairs('items', 'Éléments', 'IcôneLucide | Texte')}{T('iconColor', 'Couleur icône', '#2563eb')}</>
    case 'list':
      return <>{Lines('items', 'Éléments')}{Bool('ordered', 'Liste numérotée')}</>
    case 'alert':
      return <>{Sel('variant', 'Type', [{ value: 'info', label: 'Info' }, { value: 'success', label: 'Succès' }, { value: 'warning', label: 'Attention' }, { value: 'danger', label: 'Erreur' }], 'info')}{T('title', 'Titre')}{T('text', 'Message')}</>
    case 'blockquote':
      return <>{T('text', 'Citation')}{T('author', 'Auteur')}</>
    case 'rating':
      return <>{T('value', 'Note')}{T('max', 'Sur')}{T('size', 'Taille')}</>
    case 'progress':
      return <>{T('value', 'Valeur (0-100)')}{T('label', 'Libellé')}{T('color', 'Couleur', '#2563eb')}{Bool('showPercent', 'Afficher le %', true)}</>
    case 'testimonial':
      return <>{T('quote', 'Citation')}{T('author', 'Auteur')}{T('role', 'Fonction')}{T('avatar', 'Avatar (URL)')}</>
    case 'priceTable':
      return <>{T('plan', 'Offre')}{T('price', 'Prix', '29€')}{T('period', 'Période', 'mois')}{Lines('features', 'Fonctions incluses')}{T('buttonLabel', 'Bouton')}{Bool('featured', 'Mise en avant')}</>
    case 'cta':
      return <>{T('title', 'Titre')}{T('text', 'Texte')}{T('buttonLabel', 'Bouton')}{Sel('align', 'Alignement', ALIGN, 'center')}{T('background', 'Fond (CSS)', 'linear-gradient(...)')}</>
    case 'socialIcons':
      return <>{Pairs('links', 'Liens', 'réseau | url')}{T('color', 'Couleur', '#0f172a')}{T('size', 'Taille')}</>
    case 'tabs':
      return Pairs('tabs', 'Onglets', 'Libellé | Contenu')
    case 'accordion':
      return Pairs('items', 'Sections', 'Titre | Contenu')
    case 'counter':
      return <>{T('end', 'Valeur finale')}{T('prefix', 'Préfixe')}{T('suffix', 'Suffixe')}{T('label', 'Libellé')}{T('duration', 'Durée (ms)')}</>
    case 'countdown':
      return T('target', 'Date cible (ISO)', '2026-12-31T23:59:00')
    case 'flipBox':
      return <>{T('frontIcon', 'Icône recto', 'Rocket')}{T('frontTitle', 'Titre recto')}{T('frontText', 'Texte recto')}{T('frontBg', 'Fond recto', '#2563eb')}{T('backTitle', 'Titre verso')}{T('backText', 'Texte verso')}{T('backBg', 'Fond verso', '#0f172a')}</>

    // ── Lot 2 ──
    case 'chart':
      return <>{Sel('chartType', 'Type', [{ value: 'bar', label: 'Barres' }, { value: 'line', label: 'Courbe' }, { value: 'area', label: 'Aire' }, { value: 'pie', label: 'Camembert' }, { value: 'donut', label: 'Anneau' }], 'bar')}{TA('data', 'Données', 'une ligne « libellé | valeur »')}{T('color', 'Couleur', '#2563eb')}{T('height', 'Hauteur (px)')}{Bool('showValues', 'Afficher les valeurs', true)}</>
    case 'table':
      return <>{TA('columns', 'En-têtes', 'une ligne « col1 | col2 | … »', 2)}{TA('rows', 'Lignes', 'une ligne « a | b | … » par ligne', 6)}{Bool('striped', 'Lignes zébrées', true)}{Bool('compact', 'Compact')}</>
    case 'stat':
      return <>{T('label', 'Libellé')}{T('value', 'Valeur', '24 580 €')}{T('delta', 'Variation', '+12,5 %')}{T('deltaLabel', 'Légende variation', 'ce mois')}{Sel('trend', 'Tendance', [{ value: 'up', label: 'Hausse' }, { value: 'down', label: 'Baisse' }, { value: 'flat', label: 'Stable' }], 'up')}{T('icon', 'Icône (lucide)', 'Wallet')}{T('iconColor', 'Couleur icône', '#2563eb')}</>
    case 'steps':
      return <>{TA('steps', 'Étapes', 'une ligne « Titre | Description »')}{T('current', 'Étape courante (n°)')}{T('accent', 'Couleur', '#2563eb')}</>
    case 'timeline':
      return <>{TA('items', 'Événements', 'une ligne « Titre | Description »', 6)}{T('accent', 'Couleur', '#2563eb')}</>
    case 'carousel':
      return <>{Lines('images', 'Images', 'une URL par ligne')}{T('height', 'Hauteur', '300px')}{T('interval', 'Intervalle (ms)')}{Bool('autoplay', 'Défilement auto', true)}{Bool('showDots', 'Points', true)}{Bool('showArrows', 'Flèches', true)}</>
    case 'beforeAfter':
      return <>{T('before', 'Image « avant » (URL)')}{T('after', 'Image « après » (URL)')}{T('height', 'Hauteur', '300px')}</>
    case 'progressCircle':
      return <>{T('value', 'Valeur (0-100)')}{T('size', 'Taille (px)')}{T('color', 'Couleur', '#2563eb')}{T('track', 'Couleur du fond', '#e2e8f0')}{T('label', 'Libellé')}{Bool('showValue', 'Afficher la valeur', true)}</>
    case 'badge':
      return <>{T('text', 'Texte')}{Sel('variant', 'Couleur', [{ value: 'primary', label: 'Principale' }, { value: 'info', label: 'Info' }, { value: 'success', label: 'Succès' }, { value: 'warning', label: 'Attention' }, { value: 'danger', label: 'Erreur' }, { value: 'neutral', label: 'Neutre' }], 'primary')}{T('icon', 'Icône (lucide)')}{Bool('pill', 'Coins arrondis', true)}</>
    case 'breadcrumb':
      return <>{Lines('items', 'Niveaux', 'un par ligne')}{T('separator', 'Séparateur', '/')}</>
    case 'marquee':
      return <>{Lines('items', 'Textes', 'un par ligne')}{T('speed', 'Durée (s)')}</>
    case 'animatedHeading':
      return <>{T('before', 'Texte avant')}{Lines('words', 'Mots qui défilent', 'un par ligne')}{T('after', 'Texte après')}{T('color', 'Couleur accent', '#2563eb')}{T('interval', 'Intervalle (ms)')}</>

    // ── Lot 3 : mobile / app ──
    case 'avatar':
      return <>{T('name', 'Nom (initiales)')}{T('src', 'Image (URL)')}{T('size', 'Taille (px)')}{Sel('status', 'Statut', [{ value: '', label: 'Aucun' }, { value: 'online', label: 'En ligne' }, { value: 'away', label: 'Absent' }, { value: 'offline', label: 'Hors ligne' }], '')}</>
    case 'appBar':
      return <>{T('title', 'Titre')}{T('subtitle', 'Sous-titre')}{T('leftIcon', 'Icône gauche (lucide)', 'ChevronLeft')}{T('backTo', 'Retour vers (id de page)')}{T('rightIcons', 'Icônes droite (séparées par ,)', 'Search,MoreVertical')}{T('avatar', 'Avatar (laisser vide = non)')}{T('bg', 'Fond', '#075e54')}{T('color', 'Couleur texte', '#ffffff')}</>
    case 'bottomNav':
      return <>{TA('items', 'Onglets', 'une ligne « Icône | Libellé | idPage »', 5)}{T('active', 'Onglet actif (n°, 0 = premier)')}{T('accent', 'Couleur active', '#075e54')}{T('bg', 'Fond', '#ffffff')}</>
    case 'tileList':
      return <>{TA('items', 'Tuiles (aperçu statique)', 'ligne « Titre | Sous-titre | Heure | Badge | idPage »', 5)}{Sel('status', 'Pastille de statut', [{ value: '', label: 'Aucune' }, { value: 'online', label: 'En ligne' }], '')}
        <Sep label="Données (liste réelle)" />
        {T('sourceType', 'Type de données', 'ex : Conversation')}{T('titleField', 'Champ titre', 'nom')}{T('subtitleField', 'Champ sous-titre')}{T('timeField', 'Champ date')}{T('setStateKey', 'Variable d’état à définir', 'conv')}{T('targetPage', 'Page à ouvrir (id)', 'conversation')}</>
    case 'chatThread':
      return <>{TA('messages', 'Messages (aperçu statique)', 'ligne « in/out | texte | heure »', 5)}{T('bg', 'Fond', '#e5ddd5')}
        <Sep label="Données (messages réels)" />
        {T('sourceType', 'Type de données', 'ex : Message')}{T('textField', 'Champ texte', 'texte')}{T('convField', 'Champ conversation', 'conv')}{T('convStateKey', 'Variable d’état conversation', 'conv')}</>
    case 'messageInput':
      return <>{T('placeholder', 'Texte indicatif', 'Message')}{T('accent', 'Couleur du bouton', '#25d366')}{T('bg', 'Fond', '#f0f2f5')}
        <Sep label="Envoi (crée un enregistrement)" />
        {T('dataType', 'Type de données', 'ex : Message')}{T('textField', 'Champ texte', 'texte')}{T('convField', 'Champ conversation', 'conv')}{T('convStateKey', 'Variable d’état conversation', 'conv')}</>

    default:
      return null
  }
}
