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
    default:
      return null
  }
}
