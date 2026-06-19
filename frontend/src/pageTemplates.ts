// ─────────────────────────────────────────────────────────────────────────────
// Modèles de pages prêts à l'emploi, regroupés par thème. Chaque modèle bâtit un
// arbre d'éléments (réutilisant largement le catalogue de widgets). À l'insertion,
// le store régénère tous les ids (cf. addPageDef) — les ids ci-dessous n'ont qu'à
// être uniques au sein du modèle.
//
// Objectif de conception : des MISES EN PAGE distinctes (pas seulement des thèmes
// différents). Les helpers ci-dessous fournissent des squelettes variés (héros
// centré, héros scindé, zigzag, bento, listes, grilles, formulaires latéraux…)
// que les modèles combinent pour éviter les répétitions.
// ─────────────────────────────────────────────────────────────────────────────
import type { Element, ElementLayout, ElementStyle, Page } from './types'

let seq = 0
const id = (p = 'e') => `tpl_${p}_${(seq++).toString(36)}`
const sv = (v: unknown) => ({ t: 'static' as const, v })

type Kids = Element[]
function box(style: ElementStyle, children: Kids, layout: ElementLayout = { type: 'column', gap: '16px', align: 'stretch' }): Element {
  return { id: id('container'), type: 'container', name: 'Conteneur', props: {}, style, layout, children }
}
function row(style: ElementStyle, children: Kids, gap = '16px', align = 'stretch'): Element {
  return box(style, children, { type: 'row', gap, align, wrap: true })
}
function heading(text: string, level: 'h1' | 'h2' | 'h3' = 'h2', style: ElementStyle = {}): Element {
  const sizes = { h1: '34px', h2: '24px', h3: '18px' }
  return { id: id('heading'), type: 'heading', name: 'Titre', props: { text: sv(text), level }, style: { fontSize: sizes[level], fontWeight: '800', color: '#0f172a', ...style } }
}
function text(t: string, style: ElementStyle = {}): Element {
  return { id: id('text'), type: 'text', name: 'Texte', props: { text: sv(t) }, style: { fontSize: '15px', color: '#475569', lineHeight: '1.6', ...style } }
}
function button(label: string, style: ElementStyle = {}): Element {
  return { id: id('button'), type: 'button', name: 'Bouton', props: { label: sv(label) }, style: { padding: '11px 20px', background: '#2563eb', color: '#fff', borderRadius: '8px', fontWeight: '700', border: 'none', cursor: 'pointer', alignSelf: 'flex-start', ...style } }
}
function input(placeholder: string, style: ElementStyle = {}): Element {
  return { id: id('input'), type: 'input', name: 'Champ', props: { placeholder: sv(placeholder), inputType: 'text' }, style: { padding: '11px 13px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', width: '100%', ...style } }
}
function img(style: ElementStyle = {}): Element {
  return { id: id('image'), type: 'image', name: 'Image', props: { src: sv(''), alt: 'Image' }, style: { width: '100%', height: '220px', objectFit: 'cover', borderRadius: '12px', background: '#e2e8f0', ...style } }
}
function w(type: Element['type'], props: Record<string, unknown>, style: ElementStyle = {}): Element {
  return { id: id(type), type, name: type, props, style }
}
function card(children: Kids, style: ElementStyle = {}): Element {
  return box({ padding: '20px', background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', ...style }, children)
}

function page(name: string, route: string, children: Kids, rootStyle: ElementStyle = {}): Page {
  return {
    id: id('page'), name, route,
    root: { id: id('root'), type: 'page', name: 'Page', props: {},
      style: { background: '#f8fafc', minHeight: '100%', padding: '32px', ...rootStyle },
      layout: { type: 'column', gap: '24px', align: 'stretch' }, children },
  }
}
const wrap = (children: Kids, maxWidth = '1080px'): Element =>
  box({ width: '100%', maxWidth, margin: '0 auto' }, children)

export interface PageTemplate {
  id: string
  name: string
  theme: string
  description: string
  build: () => Page
}

// ── Thèmes ───────────────────────────────────────────────────────────────────

const T = {
  landing: 'Accueil & landing',
  dashboard: 'Tableaux de bord',
  auth: 'Authentification',
  ecommerce: 'E-commerce',
  content: 'Contenu & blog',
  forms: 'Contact & formulaires',
  data: 'Listes & données',
  legal: 'Divers & légal',
  portfolio: 'Portfolio & créatif',
  saas: 'SaaS & logiciel',
  food: 'Restaurant & food',
  realestate: 'Immobilier',
  health: 'Santé & bien-être',
  education: 'Éducation & e-learning',
  event: 'Événementiel',
  travel: 'Voyage & tourisme',
  agency: 'Agence & corporate',
  ngo: 'Associatif & ONG',
  fitness: 'Fitness & sport',
  fashion: 'Mode & beauté',
}

// ── Helpers compacts ─────────────────────────────────────────────────────────
const stat = (label: string, value: string, delta: string, icon: string, trend = 'up') =>
  w('stat', { label, value, delta, deltaLabel: 'ce mois', trend, icon, iconColor: '#2563eb' }, { flex: '1', minWidth: '180px' })

function hero(title: string, sub: string, cta = 'Commencer', bg = ''): Element {
  const onBg = !!bg
  return box({ padding: '56px 28px', textAlign: 'center', ...(onBg ? { background: bg, borderRadius: '16px' } : {}) }, [
    heading(title, 'h1', { textAlign: 'center', fontSize: '42px', ...(onBg ? { color: '#fff' } : {}) }),
    text(sub, { textAlign: 'center', fontSize: '18px', maxWidth: '640px', margin: '0 auto', ...(onBg ? { color: 'rgba(255,255,255,.9)' } : {}) }),
    row({ justifyContent: 'center' }, [button(cta, onBg ? { background: '#fff', color: '#1e293b' } : {})], '12px', 'center'),
  ], { type: 'column', gap: '16px', align: 'center' })
}
function splitHero(title: string, sub: string, cta = 'Découvrir', reverse = false, bg = ''): Element {
  const onBg = !!bg
  const txt = box({ flex: '1', minWidth: '300px' }, [
    heading(title, 'h1', { fontSize: '40px', ...(onBg ? { color: '#fff' } : {}) }),
    text(sub, { fontSize: '18px', ...(onBg ? { color: 'rgba(255,255,255,.9)' } : {}) }),
    row({}, [button(cta, onBg ? { background: '#fff', color: '#1e293b' } : {})], '10px'),
  ])
  const media = img({ flex: '1', minWidth: '300px', height: '360px', borderRadius: '16px' })
  return row({ alignItems: 'center', gap: '32px', ...(onBg ? { background: bg, borderRadius: '20px', padding: '36px' } : {}) }, reverse ? [media, txt] : [txt, media])
}
function features(items: [string, string, string][], accent = '#2563eb'): Element {
  return row({}, items.map(([icon, t, d]) => w('iconBox', { icon, title: t, text: d, align: 'center', iconColor: accent }, { flex: '1', minWidth: '200px' })))
}
function featureCards(items: [string, string, string][], accent = '#2563eb'): Element {
  return row({}, items.map(([ic, t, d]) => card([w('icon', { icon: ic }, { color: accent, fontSize: '30px' }), heading(t, 'h3'), text(d, { fontSize: '14px' })], { flex: '1', minWidth: '200px' })))
}
function zigzag(rows: [string, string][]): Element {
  return box({}, rows.map(([t, d], i) => row({ alignItems: 'center', gap: '28px' }, i % 2
    ? [img({ flex: '1', minWidth: '280px', height: '240px' }), box({ flex: '1', minWidth: '300px' }, [heading(t, 'h2'), text(d)])]
    : [box({ flex: '1', minWidth: '300px' }, [heading(t, 'h2'), text(d)]), img({ flex: '1', minWidth: '280px', height: '240px' })])), { type: 'column', gap: '28px', align: 'stretch' })
}
function bigStats(items: [number, string, string][], bg = '#0f172a'): Element {
  return row({ justifyContent: 'space-around', padding: '30px 20px', background: bg, borderRadius: '16px' }, items.map(([e, s, l]) => w('counter', { end: e, suffix: s, label: l, duration: 1500 }, { flex: '1', minWidth: '140px', color: '#fff' })))
}
function statRow(items: [string, string, string, string][]): Element {
  return row({}, items.map(([l, v, dl, ic]) => stat(l, v, dl, ic)))
}
function chartCard(title: string, props: Record<string, unknown>, extra: ElementStyle = {}): Element { return card([heading(title, 'h3'), w('chart', props, {})], extra) }
function tableCard(title: string, cols: string, rows: string, opts: Record<string, unknown> = {}): Element { return card([heading(title, 'h3'), w('table', { columns: cols, rows, striped: true, ...opts }, {})]) }
function priceRow(plans: [string, string, string, string[], boolean?][]): Element {
  return row({ justifyContent: 'center' }, plans.map(([p, pr, pe, f, ft]) => w('priceTable', { plan: p, price: pr, period: pe, features: f, buttonLabel: 'Choisir', featured: !!ft }, { flex: '1', minWidth: '220px', maxWidth: '280px' })))
}
function peopleGrid(people: [string, string][], accent = '#2563eb'): Element {
  return row({ justifyContent: 'center' }, people.map(([n, r]) => card([img({ width: '96px', height: '96px', borderRadius: '999px', alignSelf: 'center' }), text(n, { fontWeight: '700', textAlign: 'center' }), text(r, { color: accent, textAlign: 'center', fontSize: '13px' })], { flex: '1', minWidth: '180px', maxWidth: '220px', alignItems: 'center' })))
}
function productGrid(items: [string, string][], accent = '#2563eb'): Element {
  return row({}, items.map(([n, p]) => card([img({ height: '150px' }), text(n, { fontWeight: '600' }), row({ justifyContent: 'space-between', alignItems: 'center' }, [text(p, { fontWeight: '700', color: accent }), button('Ajouter', { fontSize: '13px', padding: '7px 12px', background: accent })], '8px', 'center')], { flex: '1', minWidth: '180px' })))
}
function listRows(items: [string, string, string][], accent = '#2563eb'): Element {
  return box({}, items.map(([t, m, r]) => card([row({ justifyContent: 'space-between', alignItems: 'center', gap: '12px' }, [box({ flex: '1' }, [text(t, { fontWeight: '700' }), text(m, { fontSize: '13px', color: '#64748b' })]), text(r, { fontWeight: '700', color: accent })])], { padding: '14px 18px' })), { type: 'column', gap: '10px', align: 'stretch' })
}
function gallery(cols = 3): Element { return w('gallery', { images: [], columns: cols, gap: '10px' }, {}) }
function section(title: string, children: Kids): Element { return box({}, [heading(title, 'h2'), ...children]) }
function gallerySection(title: string, cols = 3): Element { return section(title, [gallery(cols)]) }
function textarea(ph: string): Element {
  return { id: id('textarea'), type: 'textarea', name: 'Zone de texte', props: { placeholder: sv(ph) }, style: { padding: '11px 13px', border: '1px solid #cbd5e1', borderRadius: '8px', minHeight: '110px', width: '100%' } }
}
function select(options: string[]): Element {
  return { id: id('select'), type: 'select', name: 'Liste', props: { options }, style: { padding: '11px 13px', border: '1px solid #cbd5e1', borderRadius: '8px', width: '100%' } }
}
function checkbox(label: string): Element { return w('checkbox', { label: sv(label) }, { fontSize: '13px' }) }
function formCard(title: string, fields: Kids, submit = 'Envoyer', maxWidth = '560px'): Element {
  return box({ width: '100%', maxWidth, margin: '0 auto' }, [card([heading(title, 'h2'), ...fields, button(submit, { width: '100%', alignSelf: 'stretch', textAlign: 'center' })], { padding: '28px' })])
}
function splitForm(title: string, fields: Kids, submit = 'Envoyer', accent = '#2563eb'): Element {
  return row({ gap: '0', alignItems: 'stretch' }, [
    img({ flex: '1', minWidth: '260px', height: 'auto', borderRadius: '16px 0 0 16px', minHeight: '380px' }),
    box({ flex: '1', minWidth: '300px', background: '#fff', borderRadius: '0 16px 16px 0', border: '1px solid #e2e8f0', borderLeft: 'none', padding: '32px' }, [heading(title, 'h2'), ...fields, button(submit, { width: '100%', alignSelf: 'stretch', textAlign: 'center', background: accent })]),
  ])
}
function sideForm(title: string, fields: Kids, asideTitle: string, asideItems: { a: string; b: string }[], submit = 'Envoyer', accent = '#2563eb'): Element {
  return row({ gap: '20px' }, [
    box({ flex: '2', minWidth: '320px' }, [card([heading(title, 'h2'), ...fields, button(submit, { width: '100%', alignSelf: 'stretch', textAlign: 'center', background: accent })], { padding: '24px' })]),
    cardCol([heading(asideTitle, 'h3'), w('iconList', { items: asideItems, iconColor: accent }, {})]),
  ])
}
function timelineCard(title: string, items: string, accent = '#2563eb'): Element { return card([heading(title, 'h3'), w('timeline', { items, accent }, {})]) }
function ctaBand(title: string, txt: string, btn = 'Commencer', bg = 'linear-gradient(135deg,#2563eb,#7c3aed)'): Element { return w('cta', { title, text: txt, buttonLabel: btn, background: bg }, {}) }
function bento(big: Element, smalls: Kids): Element { return row({ gap: '16px' }, [box({ flex: '2', minWidth: '300px' }, [big]), box({ flex: '1', minWidth: '220px' }, smalls)]) }
function checkout(steps: string, current: number, left: Kids, right: Kids, accent = '#2563eb'): Element {
  return box({}, [w('steps', { steps, current, accent }, {}), row({ gap: '20px' }, [box({ flex: '2', minWidth: '300px' }, left), box({ flex: '1', minWidth: '240px' }, right)])], { type: 'column', gap: '20px', align: 'stretch' })
}
const cardCol = (children: Kids, extra: ElementStyle = {}) => card(children, { flex: '1', minWidth: '220px', ...extra })
const authPage = (name: string, route: string, children: Kids) => page(name, route, [box({ width: '100%', maxWidth: '420px', margin: '50px auto' }, [card(children, { padding: '32px' })])], { background: '#f1f5f9' })

// ─────────────────────────────────────────────────────────────────────────────

export const PAGE_TEMPLATES: PageTemplate[] = [

  // ── Accueil & landing ──
  { id: 'landing-hero', name: 'Hero centré', theme: T.landing, description: 'Grand titre centré, accroche et boutons.', build: () => page('Accueil', 'accueil', [
    wrap([ box({ padding: '56px 24px', textAlign: 'center' }, [w('badge', { text: 'Nouveau', variant: 'primary' }, { alignSelf: 'center' }), heading('Construisez sans écrire de code', 'h1', { textAlign: 'center', fontSize: '46px' }), text('Une plateforme souveraine et open-source pour créer des apps en quelques minutes.', { textAlign: 'center', fontSize: '18px', maxWidth: '640px', margin: '0 auto' }), row({ justifyContent: 'center' }, [button('Commencer'), button('Démo', { background: '#fff', color: '#1e293b', border: '1px solid #cbd5e1' })], '12px', 'center')], { type: 'column', gap: '18px', align: 'center' }), featureCards([['Zap', 'Rapide', 'Performances natives.'], ['ShieldCheck', 'Souverain', 'Vos données vous appartiennent.'], ['Boxes', 'Modulaire', 'Activez ce qu’il vous faut.']]) ]) ]) },
  { id: 'landing-split', name: 'Hero scindé + zigzag', theme: T.landing, description: 'Texte/visuel côte à côte puis sections alternées.', build: () => page('Accueil', 'accueil', [
    wrap([ splitHero('Le logiciel qui fait gagner du temps', 'Automatisez vos tâches et concentrez-vous sur l’essentiel.', 'Essai gratuit'), zigzag([['Automatisation visuelle', 'Créez des flux déclenchés par vos événements, sans code.'], ['Données en temps réel', 'Suivez vos indicateurs depuis des tableaux de bord vivants.'], ['Collaboration', 'Invitez votre équipe et travaillez ensemble.']]) ]) ]) },
  { id: 'landing-stats', name: 'Bandeau de chiffres', theme: T.landing, description: 'Compteurs en bandeau sombre + bénéfices + CTA.', build: () => page('Accueil', 'accueil', [
    wrap([ heading('Ils nous font confiance', 'h1', { textAlign: 'center' }), bigStats([[50000, '+', 'utilisateurs'], [120, '', 'pays'], [99, ' %', 'satisfaction'], [15, '', 'années']]), featureCards([['Rocket', 'Démarrage rapide', 'Opérationnel en minutes.'], ['HeartHandshake', 'Support humain', 'Une équipe dédiée.'], ['Lock', 'Sécurité', 'Chiffrement de bout en bout.']]), ctaBand('Prêt à vous lancer ?', 'Rejoignez des milliers d’équipes dès aujourd’hui.') ]) ]) },
  { id: 'landing-pricing', name: 'Tarifs + FAQ', theme: T.landing, description: 'Offres tarifaires suivies d’une FAQ.', build: () => page('Tarifs', 'tarifs', [
    wrap([ heading('Des tarifs simples', 'h1', { textAlign: 'center' }), priceRow([['Gratuit', '0€', 'mois', ['1 projet', 'Communauté']], ['Pro', '29€', 'mois', ['Illimité', 'Prioritaire', 'Domaine'], true], ['Entreprise', 'Sur devis', 'an', ['SSO', 'SLA']]]), section('Questions fréquentes', [w('accordion', { items: 'Puis-je changer d’offre ? | Oui, à tout moment.\nY a-t-il un engagement ? | Aucun, sans engagement.\nProposez-vous des remises ? | Oui pour les associations et l’éducation.' }, {})]) ]) ]) },
  { id: 'landing-showcase', name: 'Vitrine visuelle', theme: T.landing, description: 'Galerie carrousel, témoignages et CTA.', build: () => page('Accueil', 'accueil', [
    wrap([ box({ textAlign: 'center' }, [heading('Voyez par vous-même', 'h1', { textAlign: 'center' }), text('Un aperçu de ce que vous pouvez créer.', { textAlign: 'center' })], { type: 'column', gap: '8px', align: 'center' }), w('carousel', { images: [], height: '360px', autoplay: true }, {}), row({}, [w('testimonial', { quote: 'Un outil qui a transformé notre façon de travailler.', author: 'Camille M.', role: 'Directrice produit' }, { flex: '1', minWidth: '260px' }), w('testimonial', { quote: 'Simple, puissant et respectueux de nos données.', author: 'Alex D.', role: 'CTO' }, { flex: '1', minWidth: '260px' })]), ctaBand('Commencez gratuitement', 'Aucune carte bancaire requise.') ]) ]) },
  { id: 'landing-app', name: 'Promo application', theme: T.landing, description: 'Titre animé, visuel mobile et stores.', build: () => page('Application', 'application', [
    wrap([ row({ alignItems: 'center', gap: '32px' }, [box({ flex: '1', minWidth: '300px' }, [w('animatedHeading', { before: 'Votre quotidien, ', words: ['plus simple', 'dans votre poche', 'partout'], after: '.', color: '#2563eb' }, {}), text('Disponible sur iOS et Android. Gratuit, sans publicité.'), row({}, [button('App Store', { background: '#0f172a' }), button('Google Play', { background: '#0f172a' })], '10px'), w('rating', { value: 5, max: 5 }, {})]), img({ flex: '1', minWidth: '260px', height: '460px', borderRadius: '28px' })]) ]) ]) },

  // ── Tableaux de bord ──
  { id: 'dash-overview', name: 'Vue d’ensemble', theme: T.dashboard, description: 'KPIs + graphique principal et jauge.', build: () => page('Tableau de bord', 'dashboard', [
    wrap([ heading('Tableau de bord', 'h1'), statRow([['Revenus', '24 580 €', '+12 %', 'Wallet'], ['Commandes', '1 240', '+4 %', 'ShoppingCart'], ['Clients', '860', '+8 %', 'Users'], ['Conversion', '3,4 %', '-0,3 %', 'TrendingDown']]), bento(chartCard('Ventes mensuelles', { chartType: 'bar', data: 'Jan | 45\nFév | 72\nMar | 58\nAvr | 91\nMai | 80', color: '#2563eb', height: 240 }), [cardCol([heading('Objectif', 'h3'), w('progressCircle', { value: 72, size: 130, label: 'atteint' }, { alignSelf: 'center' })]), cardCol([heading('Note moyenne', 'h3'), w('stat', { label: 'Satisfaction', value: '4,8/5', delta: '+0,1', trend: 'up', icon: 'Star' }, {})])]) ]) ]) },
  { id: 'dash-table', name: 'Centré sur le tableau', theme: T.dashboard, description: 'Petits indicateurs + grand tableau de données.', build: () => page('Activité', 'activite', [
    wrap([ row({ justifyContent: 'space-between', alignItems: 'center' }, [heading('Commandes', 'h1'), button('Exporter', { background: '#0f172a' })], '12px', 'center'), statRow([['Total', '1 240', '+24', 'Package'], ['En cours', '38', '', 'Clock'], ['Livrées', '1 190', '+22', 'CheckCircle'], ['Retours', '12', '-3', 'RotateCcw']]), tableCard('Dernières commandes', 'N° | Client | Montant | Statut', '10428 | A. Dupont | 120 € | Payé\n10427 | B. Martin | 89 € | En attente\n10426 | C. Bernard | 240 € | Payé\n10425 | D. Roy | 56 € | Expédié') ], '1000px') ]) },
  { id: 'dash-gauges', name: 'Jauges & objectifs', theme: T.dashboard, description: 'Rangée de jauges circulaires + progression.', build: () => page('Objectifs', 'objectifs', [
    wrap([ heading('Suivi des objectifs', 'h1'), row({}, [['Ventes', 72, '#2563eb'], ['Marketing', 54, '#7c3aed'], ['Support', 88, '#10b981'], ['Produit', 41, '#f59e0b']].map(([l, v, c]) => cardCol([w('progressCircle', { value: v as number, size: 120, label: l as string, color: c as string }, { alignSelf: 'center' })]))), card([heading('Avancement par équipe', 'h3'), w('progress', { value: 64, label: 'Commercial', color: '#2563eb' }, {}), w('progress', { value: 88, label: 'Technique', color: '#10b981' }, {}), w('progress', { value: 37, label: 'Design', color: '#f59e0b' }, {})]) ]) ]) },
  { id: 'dash-finance', name: 'Finances', theme: T.dashboard, description: 'Chiffres clés sombres + courbe + répartition.', build: () => page('Finances', 'finances', [
    wrap([ heading('Finances', 'h1'), bigStats([[128400, ' €', 'revenus'], [74200, ' €', 'dépenses'], [54200, ' €', 'trésorerie'], [42, ' %', 'marge']]), row({}, [chartCard('Revenus vs Dépenses', { chartType: 'line', data: 'Jan | 90\nFév | 110\nMar | 95\nAvr | 128', color: '#10b981', height: 220 }, { flex: '2', minWidth: '320px' }), chartCard('Postes de dépense', { chartType: 'donut', data: 'Salaires | 50\nOutils | 20\nLocaux | 18\nAutres | 12' }, { flex: '1', minWidth: '260px' })]) ]) ]) },
  { id: 'dash-funnel', name: 'Entonnoir marketing', theme: T.dashboard, description: 'Étapes de conversion + sources + liste.', build: () => page('Marketing', 'marketing', [
    wrap([ heading('Acquisition', 'h1'), card([heading('Entonnoir de conversion', 'h3'), w('steps', { steps: 'Visite | 42k\nLead | 1.3k\nQualifié | 600\nClient | 320', current: 4, accent: '#7c3aed' }, {})]), row({}, [chartCard('Sources de trafic', { chartType: 'bar', data: 'Direct | 40\nSEO | 32\nSocial | 18\nAds | 10' }, { flex: '1', minWidth: '300px' }), box({ flex: '1', minWidth: '280px' }, [heading('Top campagnes', 'h3'), listRows([['Soldes d’été', '12 400 vues', '+18 %'], ['Newsletter', '8 200 vues', '+6 %'], ['Webinaire', '3 100 vues', '+22 %']], '#7c3aed')])]) ]) ]) },
  { id: 'dash-kanban', name: 'Kanban d’équipe', theme: T.dashboard, description: 'Trois colonnes de cartes à déplacer.', build: () => page('Tableau', 'kanban', [
    wrap([ heading('Tableau d’équipe', 'h1'), row({}, [['À faire', '#f1f5f9'], ['En cours', '#eff6ff'], ['Terminé', '#ecfdf5']].map(([col, bg]) => box({ flex: '1', minWidth: '240px', padding: '12px', background: bg as string, borderRadius: '12px' }, [heading(col as string, 'h3'), card([text('Refonte page d’accueil', { fontWeight: '600' }), w('badge', { text: 'Design', variant: 'info' }, {})], { padding: '12px' }), card([text('Correctif paiement', { fontWeight: '600' }), w('badge', { text: 'Urgent', variant: 'danger' }, {})], { padding: '12px' })], { type: 'column', gap: '10px', align: 'stretch' }))) ], '1080px') ]) },

  // ── Authentification ──
  { id: 'auth-login', name: 'Connexion', theme: T.auth, description: 'Carte de connexion centrée.', build: () => authPage('Connexion', 'connexion', [
    heading('Se connecter', 'h2', { textAlign: 'center' }), input('E-mail'), input('Mot de passe'), button('Connexion', { width: '100%', alignSelf: 'stretch', textAlign: 'center' }), text('Pas encore de compte ? S’inscrire', { textAlign: 'center', fontSize: '13px', color: '#2563eb' }),
  ]) },
  { id: 'auth-register-split', name: 'Inscription scindée', theme: T.auth, description: 'Visuel à gauche, formulaire à droite.', build: () => page('Inscription', 'inscription', [
    box({ maxWidth: '860px', margin: '40px auto', width: '100%' }, [splitForm('Créer un compte', [row({}, [input('Prénom'), input('Nom')], '10px'), input('E-mail'), input('Mot de passe'), checkbox('J’accepte les conditions')], 'S’inscrire')]),
  ], { background: '#f1f5f9' }) },
  { id: 'auth-forgot', name: 'Mot de passe oublié', theme: T.auth, description: 'Réinitialisation minimaliste.', build: () => authPage('Mot de passe oublié', 'mot-de-passe-oublie', [
    heading('Mot de passe oublié', 'h2', { textAlign: 'center' }), text('Saisissez votre e-mail pour recevoir un lien.', { textAlign: 'center' }), input('E-mail'), button('Envoyer le lien', { width: '100%', alignSelf: 'stretch', textAlign: 'center' }),
  ]) },
  { id: 'auth-2fa', name: 'Vérification 2FA', theme: T.auth, description: 'Saisie du code à usage unique.', build: () => authPage('Vérification', 'verification', [
    heading('Vérification en deux étapes', 'h2', { textAlign: 'center' }), text('Saisissez le code à 6 chiffres reçu par SMS.', { textAlign: 'center' }), input('______', { textAlign: 'center', letterSpacing: '10px', fontSize: '24px' }), button('Vérifier', { width: '100%', alignSelf: 'stretch', textAlign: 'center' }), text('Renvoyer le code', { textAlign: 'center', fontSize: '13px', color: '#2563eb' }),
  ]) },
  { id: 'auth-profile', name: 'Profil & sécurité', theme: T.auth, description: 'Édition du profil avec colonnes.', build: () => page('Profil', 'profil', [
    wrap([ heading('Mon profil', 'h1'), row({}, [cardCol([img({ width: '96px', height: '96px', borderRadius: '999px', alignSelf: 'center' }), button('Changer la photo', { alignSelf: 'center', background: '#fff', color: '#1e293b', border: '1px solid #cbd5e1' })], { alignItems: 'center' }), box({ flex: '2', minWidth: '320px' }, [card([heading('Informations', 'h3'), input('Nom complet'), input('E-mail'), button('Enregistrer')]), card([heading('Sécurité', 'h3'), input('Mot de passe actuel'), input('Nouveau mot de passe'), button('Mettre à jour', { background: '#0f172a' })])])]) ], '760px') ]) },

  // ── E-commerce ──
  { id: 'shop-grid', name: 'Boutique (grille)', theme: T.ecommerce, description: 'Fil d’Ariane + grille de produits.', build: () => page('Boutique', 'boutique', [
    wrap([ row({ justifyContent: 'space-between', alignItems: 'center' }, [heading('Boutique', 'h1'), input('Rechercher…', { maxWidth: '260px' })], '12px', 'center'), w('breadcrumb', { items: ['Accueil', 'Boutique'], separator: '/' }, {}), productGrid([['Clavier mécanique', '79 €'], ['Souris ergonomique', '45 €'], ['Casque audio', '120 €'], ['Webcam HD', '65 €']]) ]) ]) },
  { id: 'shop-filters', name: 'Catégorie + filtres', theme: T.ecommerce, description: 'Filtres latéraux et grille de résultats.', build: () => page('Catégorie', 'categorie', [
    wrap([ row({ gap: '20px' }, [cardCol([heading('Filtres', 'h3'), text('Prix', { fontWeight: '600' }), w('progress', { value: 50, label: 'Jusqu’à 100 €', showPercent: false }, {}), text('Catégories', { fontWeight: '600' }), w('iconList', { items: [{ a: 'Square', b: 'Accessoires' }, { a: 'Square', b: 'Périphériques' }, { a: 'Square', b: 'Écrans' }] }, {})], { maxWidth: '220px' }), box({ flex: '3', minWidth: '320px' }, [productGrid([['Produit A', '39 €'], ['Produit B', '59 €'], ['Produit C', '24 €'], ['Produit D', '88 €']])])]) ]) ]) },
  { id: 'product-detail', name: 'Fiche produit', theme: T.ecommerce, description: 'Carrousel, prix et accordéon d’infos.', build: () => page('Produit', 'produit', [
    wrap([ row({ gap: '24px' }, [box({ flex: '1', minWidth: '300px' }, [w('carousel', { images: [], height: '340px' }, {})]), box({ flex: '1', minWidth: '300px' }, [w('badge', { text: 'En stock', variant: 'success' }, {}), heading('Nom du produit', 'h1'), w('rating', { value: 4, max: 5 }, {}), text('Description détaillée du produit et de ses atouts.'), heading('49 €', 'h2', { color: '#2563eb' }), row({}, [button('Ajouter au panier'), button('Acheter', { background: '#0f172a' })], '10px')])]), section('Détails', [w('accordion', { items: 'Livraison | Expédié sous 48h.\nRetours | 30 jours.\nGarantie | 2 ans.' }, {})]) ]) ]) },
  { id: 'cart', name: 'Panier', theme: T.ecommerce, description: 'Articles en liste + résumé latéral.', build: () => page('Panier', 'panier', [
    wrap([ heading('Votre panier', 'h1'), row({ gap: '20px' }, [box({ flex: '2', minWidth: '320px' }, [listRows([['Clavier mécanique', 'Qté 1', '79 €'], ['Souris ergonomique', 'Qté 2', '90 €'], ['Tapis XL', 'Qté 1', '15 €']])]), cardCol([heading('Résumé', 'h3'), row({ justifyContent: 'space-between' }, [text('Sous-total'), text('184 €')]), row({ justifyContent: 'space-between' }, [text('Livraison'), text('5 €')]), w('divider', {}, {}), row({ justifyContent: 'space-between' }, [text('Total', { fontWeight: '800' }), text('189 €', { fontWeight: '800' })]), button('Commander', { width: '100%', alignSelf: 'stretch', textAlign: 'center' })])]) ]) ]) },
  { id: 'checkout', name: 'Paiement', theme: T.ecommerce, description: 'Étapes + adresse et paiement.', build: () => page('Paiement', 'paiement', [
    wrap([ checkout('Panier | \nLivraison | \nPaiement | \nFini | ', 3, [card([heading('Livraison', 'h3'), input('Nom complet'), input('Adresse'), row({}, [input('Code postal'), input('Ville')], '10px')]), card([heading('Paiement', 'h3'), input('Numéro de carte'), row({}, [input('MM/AA'), input('CVC')], '10px')])], [cardCol([heading('Résumé', 'h3'), row({ justifyContent: 'space-between' }, [text('Total'), text('189 €', { fontWeight: '800' })]), button('Payer', { width: '100%', alignSelf: 'stretch', textAlign: 'center' })])]) ]) ]) },
  { id: 'order-confirm', name: 'Confirmation', theme: T.ecommerce, description: 'Remerciement centré + récapitulatif.', build: () => page('Commande confirmée', 'commande-confirmee', [
    box({ width: '100%', maxWidth: '600px', margin: '0 auto' }, [box({ textAlign: 'center' }, [w('icon', { icon: 'CheckCircle2' }, { color: '#10b981', fontSize: '56px', alignSelf: 'center' }), heading('Merci pour votre commande !', 'h1', { textAlign: 'center' }), text('Confirmation envoyée par e-mail. Commande n° 10428.', { textAlign: 'center' })], { type: 'column', gap: '10px', align: 'center' }), tableCard('Récapitulatif', 'Article | Qté | Prix', 'Clavier | 1 | 79 €\nSouris | 2 | 90 €'), button('Suivre ma commande', { alignSelf: 'center' })]),
  ]) },

  // ── Contenu & blog ──
  { id: 'article', name: 'Article (éditorial)', theme: T.content, description: 'Couverture pleine largeur + corps centré.', build: () => page('Article', 'article', [
    box({}, [img({ height: '320px', borderRadius: '0' }), box({ width: '100%', maxWidth: '720px', margin: '-50px auto 0', padding: '0 16px' }, [card([w('badge', { text: 'Tendances', variant: 'info' }, {}), heading('Un titre qui capte l’attention', 'h1'), text('Par Alex Durand · 8 min de lecture', { color: '#94a3b8' }), text('Paragraphe d’introduction qui pose le décor du sujet.'), w('blockquote', { text: 'Une idée forte mise en valeur.', author: 'Anonyme' }, {}), text('Suite et conclusion de l’article.')], { padding: '32px' })])])], { background: '#fff', padding: '0' }) },
  { id: 'blog-magazine', name: 'Blog (magazine)', theme: T.content, description: 'Article à la une + grille d’articles.', build: () => page('Blog', 'blog', [
    wrap([ heading('Le blog', 'h1'), row({ gap: '20px' }, [box({ flex: '2', minWidth: '320px' }, [card([img({ height: '220px' }), w('badge', { text: 'À la une', variant: 'primary' }, {}), heading('Le grand article du moment', 'h2'), text('Un résumé engageant de l’article principal.')], { padding: '0', overflow: 'hidden' })]), box({ flex: '1', minWidth: '240px' }, [listRows([['Cinq astuces no-code', 'Productivité', 'Lire'], ['Sécuriser vos données', 'Sécurité', 'Lire'], ['Tendances 2026', 'Veille', 'Lire']])])]) ]) ]) },
  { id: 'docs', name: 'Documentation', theme: T.content, description: 'Sommaire latéral + contenu technique.', build: () => page('Documentation', 'documentation', [
    row({ gap: '24px' }, [cardCol([text('Sommaire', { fontWeight: '700' }), w('iconList', { items: [{ a: 'ChevronRight', b: 'Démarrage' }, { a: 'ChevronRight', b: 'Installation' }, { a: 'ChevronRight', b: 'Configuration' }, { a: 'ChevronRight', b: 'API' }] }, {})], { maxWidth: '240px' }), box({ flex: '3', minWidth: '320px' }, [heading('Démarrage', 'h1'), text('Suivez ce guide pour bien commencer.'), heading('Installation', 'h3'), w('embed', { html: '<pre style="background:#0f172a;color:#e2e8f0;padding:14px;border-radius:8px;overflow:auto">npm install kubuno</pre>' }, {}), heading('Étapes suivantes', 'h3'), w('iconList', { items: [{ a: 'Check', b: 'Créer un projet' }, { a: 'Check', b: 'Configurer la base' }] }, {})])]),
  ], { background: '#fff' }) },
  { id: 'faq', name: 'FAQ', theme: T.content, description: 'Questions fréquentes en accordéon.', build: () => page('FAQ', 'faq', [
    box({ width: '100%', maxWidth: '720px', margin: '0 auto' }, [heading('Questions fréquentes', 'h1', { textAlign: 'center' }), w('accordion', { items: 'Comment démarrer ? | Créez un compte et suivez l’assistant.\nEst-ce gratuit ? | Une offre gratuite existe.\nPuis-je exporter mes données ? | Oui, dans des formats ouverts.\nComment obtenir de l’aide ? | Via le formulaire ou la communauté.' }, {}), ctaBand('Une autre question ?', 'Notre équipe vous répond sous 24h.', 'Nous contacter')]),
  ]) },
  { id: 'changelog', name: 'Journal des versions', theme: T.content, description: 'Historique chronologique des nouveautés.', build: () => page('Nouveautés', 'nouveautes', [
    box({ width: '100%', maxWidth: '720px', margin: '0 auto' }, [heading('Journal des versions', 'h1'), w('timeline', { items: 'v2.4 · Juin 2026 | Rapports PDF et nouveaux modèles.\nv2.3 · Mai 2026 | Mode hors-ligne sur mobile.\nv2.2 · Avril 2026 | Refonte du tableau de bord.\nv2.1 · Mars 2026 | Nouvelles intégrations.', accent: '#2563eb' }, {})]),
  ]) },
  { id: 'newsletter', name: 'Inscription newsletter', theme: T.content, description: 'Capture d’e-mail centrée.', build: () => page('Newsletter', 'newsletter', [
    box({ width: '100%', maxWidth: '560px', margin: '40px auto' }, [card([heading('Restez informé', 'h1', { textAlign: 'center' }), text('Recevez nos actualités chaque mois. Pas de spam.', { textAlign: 'center' }), row({ justifyContent: 'center' }, [input('Votre e-mail', { maxWidth: '320px' }), button('S’inscrire')], '8px', 'center'), w('socialIcons', { links: [{ a: 'twitter', b: '#' }, { a: 'linkedin', b: '#' }, { a: 'github', b: '#' }], size: 18 }, { alignSelf: 'center' })], { padding: '40px' })]),
  ]) },

  // ── Contact & formulaires ──
  { id: 'contact', name: 'Contact', theme: T.forms, description: 'Formulaire + coordonnées et carte.', build: () => page('Contact', 'contact', [
    wrap([ heading('Nous contacter', 'h1'), sideForm('Envoyez-nous un message', [input('Votre nom'), input('Votre e-mail'), textarea('Votre message')], 'Coordonnées', [{ a: 'Mail', b: 'contact@exemple.com' }, { a: 'Phone', b: '+33 1 23 45 67 89' }, { a: 'MapPin', b: 'Paris, France' }], 'Envoyer') ]) ]) },
  { id: 'quote', name: 'Demande de devis', theme: T.forms, description: 'Formulaire de devis centré.', build: () => page('Devis', 'devis', [
    formCard('Demander un devis', [row({}, [input('Société'), input('Contact')], '10px'), input('E-mail'), select(['Site web', 'Application mobile', 'Conseil', 'Autre']), textarea('Décrivez votre besoin'), checkbox('J’accepte d’être recontacté')], 'Recevoir mon devis', '600px'),
  ]) },
  { id: 'multistep', name: 'Formulaire multi-étapes', theme: T.forms, description: 'Assistant en plusieurs étapes.', build: () => page('Assistant', 'assistant', [
    box({ width: '100%', maxWidth: '640px', margin: '0 auto' }, [w('steps', { steps: 'Profil | \nBesoins | \nValidation | ', current: 1, accent: '#2563eb' }, {}), card([heading('Étape 1 — Votre profil', 'h3'), input('Nom complet'), input('Organisation'), select(['Particulier', 'Entreprise', 'Association']), row({ justifyContent: 'space-between' }, [button('Précédent', { background: '#fff', color: '#1e293b', border: '1px solid #cbd5e1' }), button('Continuer')])])]),
  ]) },
  { id: 'survey', name: 'Sondage', theme: T.forms, description: 'Questionnaire de satisfaction.', build: () => page('Sondage', 'sondage', [
    box({ width: '100%', maxWidth: '600px', margin: '0 auto' }, [card([heading('Votre avis compte', 'h2'), text('Comment évaluez-vous votre expérience ?'), w('rating', { value: 0, max: 5, size: 28 }, {}), text('Nous recommanderiez-vous ?'), select(['Oui, sans hésiter', 'Probablement', 'Peut-être', 'Non']), textarea('Un commentaire ?'), button('Envoyer mes réponses')], { padding: '28px' })]),
  ]) },
  { id: 'booking', name: 'Prise de rendez-vous', theme: T.forms, description: 'Réservation avec visuel scindé.', build: () => page('Rendez-vous', 'rendez-vous', [
    box({ maxWidth: '860px', margin: '0 auto', width: '100%' }, [splitForm('Réserver un créneau', [input('Nom complet'), input('E-mail'), select(['Consultation (30 min)', 'Démo (45 min)', 'Support (60 min)']), row({}, [input('Date'), input('Heure')], '10px')], 'Confirmer')]),
  ]) },
  { id: 'feedback', name: 'Avis & retours', theme: T.forms, description: 'Note + commentaire compacts.', build: () => page('Votre avis', 'avis', [
    formCard('Donnez votre avis', [text('Quelle note donneriez-vous ?'), w('rating', { value: 0, max: 5, size: 30 }, {}), select(['Excellent', 'Bien', 'Moyen', 'Décevant']), textarea('Dites-nous en plus…')], 'Envoyer mon avis'),
  ]) },

  // ── Listes & données ──
  { id: 'crm', name: 'CRM — Contacts', theme: T.data, description: 'Indicateurs + tableau de contacts.', build: () => page('Contacts', 'crm', [
    wrap([ row({ justifyContent: 'space-between', alignItems: 'center' }, [heading('Contacts', 'h1'), button('Nouveau contact')], '12px', 'center'), statRow([['Total', '1 248', '+18', 'Users'], ['Clients', '420', '+6', 'UserCheck'], ['Prospects', '828', '+12', 'UserPlus'], ['Inactifs', '110', '-4', 'UserMinus']]), tableCard('Répertoire', 'Nom | Société | E-mail | Statut', 'Alice Dupont | Acme | alice@acme.fr | Client\nBob Martin | Globex | bob@globex.fr | Prospect\nChloé Roy | Initech | chloe@initech.fr | Client') ], '1000px') ]) },
  { id: 'data-table', name: 'Tableau de données', theme: T.data, description: 'Barre de recherche + tableau plein écran.', build: () => page('Données', 'donnees', [
    wrap([ row({ justifyContent: 'space-between', alignItems: 'center' }, [heading('Données', 'h1'), row({}, [input('Rechercher…', { maxWidth: '220px' }), button('Exporter')], '8px', 'center')], '12px', 'center'), tableCard('Enregistrements', 'ID | Nom | E-mail | Statut | Date', '001 | Alice Dupont | alice@ex.com | Actif | 12/06\n002 | Bob Martin | bob@ex.com | Inactif | 11/06\n003 | Chloé Bernard | chloe@ex.com | Actif | 10/06\n004 | David Roy | david@ex.com | Actif | 09/06') ], '1000px') ]) },
  { id: 'calendar-view', name: 'Vue calendrier', theme: T.data, description: 'Grille mensuelle + navigation.', build: () => page('Calendrier', 'calendrier', [
    wrap([ row({ justifyContent: 'space-between', alignItems: 'center' }, [heading('Juin 2026', 'h1'), row({}, [button('‹', { background: '#fff', color: '#1e293b', border: '1px solid #cbd5e1', padding: '8px 14px' }), button('›', { background: '#fff', color: '#1e293b', border: '1px solid #cbd5e1', padding: '8px 14px' })], '6px')], '12px', 'center'), card([w('table', { columns: 'Lun | Mar | Mer | Jeu | Ven | Sam | Dim', rows: '1 | 2 | 3 | 4 | 5 | 6 | 7\n8 | 9 | 10 | 11 | 12 | 13 | 14\n15 | 16 | 17 | 18 | 19 | 20 | 21\n22 | 23 | 24 | 25 | 26 | 27 | 28', striped: false }, {})]) ]) ]) },
  { id: 'report', name: 'Vue rapport', theme: T.data, description: 'Filtres + tableau + export PDF.', build: () => page('Rapport', 'rapport-vue', [
    wrap([ heading('Rapport mensuel', 'h1'), card([row({ alignItems: 'center' }, [select(['Janvier', 'Février', 'Mars']), select(['Toutes régions', 'Nord', 'Sud']), button('Exporter en PDF', { background: '#0f172a' })], '10px', 'center')]), tableCard('Détail', 'Date | Produit | Région | Montant', '01/03 | Clavier | Nord | 120 €\n02/03 | Écran | Sud | 450 €\n03/03 | Souris | Est | 60 €') ], '1000px') ]) },
  { id: 'data-kanban', name: 'Pipeline (Kanban)', theme: T.data, description: 'Suivi par colonnes de statut.', build: () => page('Pipeline', 'pipeline', [
    wrap([ heading('Pipeline commercial', 'h1'), row({}, [['Nouveau', '#f1f5f9'], ['En discussion', '#eff6ff'], ['Gagné', '#ecfdf5']].map(([col, bg]) => box({ flex: '1', minWidth: '240px', padding: '12px', background: bg as string, borderRadius: '12px' }, [heading(col as string, 'h3'), card([text('Acme Corp', { fontWeight: '600' }), text('12 000 €', { color: '#2563eb', fontWeight: '700', fontSize: '13px' })], { padding: '12px' }), card([text('Globex SA', { fontWeight: '600' }), text('8 400 €', { color: '#2563eb', fontWeight: '700', fontSize: '13px' })], { padding: '12px' })], { type: 'column', gap: '10px', align: 'stretch' }))) ], '1080px') ]) },

  // ── Divers & légal ──
  { id: 'error-404', name: 'Erreur 404', theme: T.legal, description: 'Page introuvable centrée.', build: () => page('Erreur 404', '404', [
    box({ padding: '80px 24px', textAlign: 'center' }, [heading('404', 'h1', { fontSize: '72px', textAlign: 'center', color: '#cbd5e1' }), heading('Page introuvable', 'h2', { textAlign: 'center' }), text('La page que vous cherchez n’existe pas ou a été déplacée.', { textAlign: 'center' }), button('Retour à l’accueil', { alignSelf: 'center' })], { type: 'column', gap: '14px', align: 'center' }),
  ]) },
  { id: 'legal', name: 'Mentions légales', theme: T.legal, description: 'Page de texte légal.', build: () => page('Mentions légales', 'mentions-legales', [
    box({ width: '100%', maxWidth: '760px', margin: '0 auto' }, [heading('Mentions légales', 'h1'), heading('Éditeur', 'h3'), text('Nom de la société, adresse, immatriculation.'), heading('Hébergement', 'h3'), text('Nom et coordonnées de l’hébergeur.'), heading('Propriété intellectuelle', 'h3'), text('L’ensemble du contenu est protégé.')]),
  ], { background: '#fff' }) },
  { id: 'privacy', name: 'Confidentialité', theme: T.legal, description: 'Politique de confidentialité.', build: () => page('Confidentialité', 'confidentialite', [
    box({ width: '100%', maxWidth: '760px', margin: '0 auto' }, [heading('Politique de confidentialité', 'h1'), text('Dernière mise à jour : 18 juin 2026', { color: '#94a3b8' }), w('accordion', { items: 'Données collectées | Nom, e-mail et données d’usage.\nUtilisation | Améliorer le service et la sécurité.\nVos droits | Accès, rectification et suppression à tout moment.\nContact | dpo@exemple.com' }, {})]),
  ], { background: '#fff' }) },

  // ── Portfolio & créatif ──
  { id: 'portfolio-hero', name: 'Portfolio — Accueil', theme: T.portfolio, description: 'Présentation scindée + galerie.', build: () => page('Portfolio', 'portfolio', [
    wrap([ splitHero('Camille Martin — Designer produit', 'Je conçois des expériences numériques simples et élégantes.', 'Voir mes projets'), gallerySection('Projets récents', 3) ]) ]) },
  { id: 'portfolio-gallery', name: 'Galerie de réalisations', theme: T.portfolio, description: 'Bandeau défilant + galeries.', build: () => page('Réalisations', 'realisations', [
    wrap([ heading('Mes réalisations', 'h1', { textAlign: 'center' }), w('marquee', { items: ['Branding', 'UI/UX', 'Illustration', 'Motion', '3D'], speed: 16 }, {}), gallery(3), gallery(2) ]) ]) },
  { id: 'case-study', name: 'Étude de cas', theme: T.portfolio, description: 'Contexte, solution en zigzag, chiffres.', build: () => page('Étude de cas', 'etude-de-cas', [
    box({ width: '100%', maxWidth: '880px', margin: '0 auto' }, [w('badge', { text: 'Étude de cas', variant: 'primary' }, {}), heading('Refonte d’une application bancaire', 'h1'), img({ height: '300px' }), bigStats([[3, ' M', 'utilisateurs'], [40, ' %', 'conversion'], [4, ' mois', 'projet']]), zigzag([['Le défi', 'Une interface vieillissante et un taux d’abandon élevé.'], ['La solution', 'Un parcours repensé, des composants clairs et accessibles.']])]),
  ], { background: '#fff' }) },
  { id: 'cv', name: 'CV en ligne', theme: T.portfolio, description: 'Parcours en chronologie + compétences.', build: () => page('CV', 'cv', [
    box({ width: '100%', maxWidth: '760px', margin: '0 auto' }, [row({ alignItems: 'center' }, [img({ width: '90px', height: '90px', borderRadius: '999px' }), box({ flex: '1' }, [heading('Alex Durand', 'h1'), text('Développeur Full-Stack · Paris')])]), row({ gap: '24px' }, [box({ flex: '2', minWidth: '300px' }, [timelineCard('Expérience', '2024-2026 · Lead Dev @ Acme | Direction d’une équipe de 6.\n2021-2024 · Dev @ Globex | Développement produit web.')]), cardCol([heading('Compétences', 'h3'), w('iconList', { items: [{ a: 'Check', b: 'React / TypeScript' }, { a: 'Check', b: 'Rust / Node' }, { a: 'Check', b: 'PostgreSQL' }] }, {})])])]),
  ], { background: '#fff' }) },
  { id: 'creative-services', name: 'Services créatifs', theme: T.portfolio, description: 'Offres tarifaires créatives.', build: () => page('Services', 'services-creatifs', [
    wrap([ heading('Travaillons ensemble', 'h1', { textAlign: 'center' }), priceRow([['Essentiel', '900€', 'projet', ['Logo', '1 révision']], ['Complet', '2 400€', 'projet', ['Identité', 'Charte', '3 révisions'], true], ['Sur-mesure', 'Sur devis', '', ['Accompagnement global']]]), ctaBand('Un projet en tête ?', 'Discutons-en autour d’un café.', 'Me contacter') ]) ]) },

  // ── SaaS & logiciel ──
  { id: 'saas-hero', name: 'SaaS — Accueil', theme: T.saas, description: 'Hero scindé + cartes de fonctionnalités.', build: () => page('Accueil', 'saas', [
    wrap([ splitHero('La plateforme tout-en-un pour vos équipes', 'Centralisez projets, données et automatisations.', 'Démarrer'), featureCards([['Workflow', 'Automatisez', 'Gagnez du temps.'], ['Lock', 'Sécurisé', 'Chiffré de bout en bout.'], ['Plug', 'Intégrations', 'Connectez vos outils.']]) ]) ]) },
  { id: 'saas-features', name: 'SaaS — Fonctionnalités', theme: T.saas, description: 'Sections alternées détaillées.', build: () => page('Fonctionnalités', 'fonctionnalites', [
    wrap([ heading('Tout ce dont vous avez besoin', 'h1', { textAlign: 'center' }), zigzag([['Automatisation visuelle', 'Créez des flux sans code, déclenchés par vos événements.'], ['Tableaux de bord', 'Visualisez vos données en temps réel.'], ['Collaboration', 'Invitez votre équipe et partagez vos espaces.']]) ]) ]) },
  { id: 'saas-pricing', name: 'SaaS — Tarifs comparés', theme: T.saas, description: 'Offres + tableau comparatif.', build: () => page('Tarifs', 'tarifs-saas', [
    wrap([ heading('Choisissez votre offre', 'h1', { textAlign: 'center' }), priceRow([['Starter', '12€', 'mois', ['5 projets', '2 Go']], ['Business', '39€', 'mois', ['Illimité', '50 Go', 'API'], true], ['Entreprise', 'Sur devis', '', ['SSO', 'SLA']]]), tableCard('Comparatif', 'Fonction | Starter | Business | Entreprise', 'Projets | 5 | ∞ | ∞\nAPI | — | ✓ | ✓\nSSO | — | — | ✓') ]) ]) },
  { id: 'integrations', name: 'Intégrations', theme: T.saas, description: 'Catalogue de connecteurs.', build: () => page('Intégrations', 'integrations', [
    wrap([ heading('Connectez vos outils favoris', 'h1', { textAlign: 'center' }), input('Rechercher une intégration…', { maxWidth: '360px', margin: '0 auto' }), row({}, ['Slack', 'GitHub', 'Stripe', 'Notion', 'Drive', 'Zoom'].map((nm) => cardCol([w('icon', { icon: 'Plug' }, { color: '#2563eb', fontSize: '28px', alignSelf: 'center' }), text(nm, { fontWeight: '600', textAlign: 'center' }), button('Connecter', { fontSize: '12px', padding: '6px 12px', alignSelf: 'center' })], { minWidth: '140px', alignItems: 'center' }))) ]) ]) },
  { id: 'status-page', name: 'Page de statut', theme: T.saas, description: 'État des services + disponibilité.', build: () => page('Statut', 'statut', [
    wrap([ w('alert', { variant: 'success', title: 'Tous les systèmes opérationnels', text: 'Aucun incident en cours.' }, {}), row({ gap: '20px' }, [box({ flex: '2', minWidth: '300px' }, [card([heading('Services', 'h3'), w('iconList', { items: [{ a: 'CheckCircle', b: 'API — Opérationnel' }, { a: 'CheckCircle', b: 'Tableau de bord — Opérationnel' }, { a: 'AlertTriangle', b: 'E-mails — Dégradé' }], iconColor: '#10b981' }, {})])]), cardCol([heading('Disponibilité', 'h3'), w('progressCircle', { value: 99, size: 130, label: '90 jours', color: '#10b981' }, { alignSelf: 'center' })])]) ]) ]) },
  { id: 'onboarding', name: 'Onboarding', theme: T.saas, description: 'Premiers pas guidés en étapes.', build: () => page('Bienvenue', 'onboarding', [
    box({ width: '100%', maxWidth: '640px', margin: '0 auto' }, [heading('Bienvenue 👋', 'h1', { textAlign: 'center' }), text('Configurons votre espace en 3 étapes.', { textAlign: 'center' }), w('steps', { steps: 'Profil | Vos infos\nÉquipe | Invitez\nProjet | Créez', current: 1, accent: '#2563eb' }, {}), card([heading('Étape 1 — Votre profil', 'h3'), input('Nom complet'), input('Nom de l’organisation'), button('Continuer', { width: '100%', alignSelf: 'stretch', textAlign: 'center' })])]),
  ]) },

  // ── Restaurant & food ──
  { id: 'restaurant-home', name: 'Restaurant — Accueil', theme: T.food, description: 'Hero gourmand + carte du menu.', build: () => page('Accueil', 'restaurant', [
    wrap([ hero('Une cuisine de saison, faite maison', 'Réservez votre table au cœur de la ville.', 'Réserver', 'linear-gradient(135deg,#7c2d12,#b45309)'), tableCard('Notre carte du jour', 'Plat | Prix', 'Velouté de saison | 9 €\nRisotto aux champignons | 19 €\nMagret de canard | 24 €\nTarte au citron | 8 €', { striped: false }) ]) ]) },
  { id: 'reservation-food', name: 'Réservation', theme: T.food, description: 'Réserver une table (visuel scindé).', build: () => page('Réserver', 'reserver', [
    box({ maxWidth: '860px', margin: '0 auto', width: '100%' }, [splitForm('Réserver une table', [row({}, [input('Nom'), input('Téléphone')], '10px'), row({}, [input('Date'), input('Heure')], '10px'), select(['1 personne', '2 personnes', '3-4 personnes', '5+ personnes'])], 'Confirmer', '#b45309')]),
  ]) },
  { id: 'food-delivery', name: 'Commande en ligne', theme: T.food, description: 'Plats à commander en grille.', build: () => page('Commander', 'commander', [
    wrap([ heading('Commander en ligne', 'h1'), productGrid([['Burger maison', '14 €'], ['Salade César', '11 €'], ['Pizza margherita', '13 €'], ['Tiramisu', '6 €']], '#b45309') ]) ]) },
  { id: 'chef', name: 'Le chef', theme: T.food, description: 'Portrait du chef + citation.', build: () => page('Le chef', 'le-chef', [
    wrap([ splitHero('Chef Antoine Leroy', 'Vingt ans d’expérience dans la gastronomie française, au service du produit.', 'Découvrir la carte', true), w('blockquote', { text: 'La cuisine, c’est l’art de transformer le simple en mémorable.', author: 'Antoine Leroy' }, {}) ]) ]) },
  { id: 'cafe', name: 'Café / Coffee shop', theme: T.food, description: 'Galerie d’ambiance + atouts.', build: () => page('Café', 'cafe', [
    box({}, [hero('Votre pause café idéale', 'Cafés de spécialité et pâtisseries maison.', 'Voir le menu', 'linear-gradient(135deg,#44403c,#78716c)'), wrap([gallery(3), featureCards([['Coffee', 'Torréfaction', 'Grains sélectionnés.'], ['Croissant', 'Pâtisseries', 'Faites chaque matin.'], ['Wifi', 'Espace travail', 'Wifi & prises.']], '#78716c')])])], { padding: '0' }) },

  // ── Immobilier ──
  { id: 'realestate-home', name: 'Immobilier — Accueil', theme: T.realestate, description: 'Recherche en bandeau + biens en liste.', build: () => page('Accueil', 'immobilier', [
    wrap([ box({ padding: '40px 24px', background: 'linear-gradient(135deg,#0f766e,#0891b2)', borderRadius: '16px' }, [heading('Trouvez le bien de vos rêves', 'h1', { color: '#fff', textAlign: 'center' }), card([row({ alignItems: 'center' }, [input('Ville ou code postal'), select(['Acheter', 'Louer']), select(['Tous types', 'Appartement', 'Maison']), button('Rechercher', { background: '#0891b2' })], '8px', 'center')])], { type: 'column', gap: '16px', align: 'stretch' }), heading('Biens en vedette', 'h2'), listRows([['Appartement 3 pièces · 68 m²', 'Paris 11e', '320 000 €'], ['Maison 5 pièces · 120 m²', 'Lyon 6e', '480 000 €'], ['Studio · 24 m²', 'Bordeaux', '145 000 €']], '#0891b2') ]) ]) },
  { id: 'property-detail', name: 'Détail d’un bien', theme: T.realestate, description: 'Carrousel + caractéristiques et prix.', build: () => page('Bien', 'bien', [
    wrap([ w('carousel', { images: [], height: '360px' }, {}), row({ gap: '24px' }, [box({ flex: '2', minWidth: '320px' }, [heading('Appartement 4 pièces · 92 m²', 'h1'), text('Paris 11e — Proche métro', { color: '#64748b' }), statRow([['Surface', '92 m²', '', 'Maximize'], ['Pièces', '4', '', 'DoorOpen'], ['Étage', '3/6', '', 'Building']]), heading('Description', 'h3'), text('Bel appartement lumineux, entièrement rénové.')]), cardCol([heading('420 000 €', 'h2', { color: '#0891b2' }), button('Demander une visite', { width: '100%', alignSelf: 'stretch', textAlign: 'center', background: '#0891b2' }), button('Contacter l’agent', { width: '100%', alignSelf: 'stretch', background: '#fff', color: '#0891b2', border: '1px solid #0891b2' })])]) ]) ]) },
  { id: 'agent', name: 'Profil agent', theme: T.realestate, description: 'Agent à la une + ses biens.', build: () => page('Agent', 'agent', [
    wrap([ row({ alignItems: 'center', gap: '24px', background: '#f1f5f9', borderRadius: '16px', padding: '24px' }, [img({ width: '120px', height: '120px', borderRadius: '999px' }), box({ flex: '1', minWidth: '260px' }, [heading('Marie Lambert', 'h1'), text('Agent immobilier · 12 ans d’expérience'), w('rating', { value: 5, max: 5 }, {})])]), statRow([['Biens vendus', '240', '', 'Home'], ['Délai moyen', '38 j', '', 'Clock'], ['Satisfaction', '98 %', '', 'Smile']]), gallerySection('Ses biens', 3) ]) ]) },
  { id: 'mortgage', name: 'Simulateur de prêt', theme: T.realestate, description: 'Calcul de mensualités + résultat.', build: () => page('Simulateur', 'simulateur', [
    box({ width: '100%', maxWidth: '600px', margin: '0 auto' }, [card([heading('Simuler mon prêt', 'h2'), input('Montant du bien (€)'), input('Apport (€)'), row({}, [input('Durée (années)'), input('Taux (%)')], '10px'), button('Calculer', { width: '100%', alignSelf: 'stretch', textAlign: 'center', background: '#0891b2' })]), card([heading('Estimation', 'h3'), row({ justifyContent: 'space-between' }, [text('Mensualité', { fontWeight: '600' }), text('1 240 €', { fontWeight: '800', color: '#0891b2' })]), row({ justifyContent: 'space-between' }, [text('Coût total', { fontWeight: '600' }), text('372 000 €', { fontWeight: '800' })])])]),
  ]) },
  { id: 'neighborhoods', name: 'Quartiers', theme: T.realestate, description: 'Guide des quartiers en grille.', build: () => page('Quartiers', 'quartiers', [
    wrap([ heading('Explorer les quartiers', 'h1'), productGrid([['Le Marais', 'Historique'], ['Montmartre', 'Bohème'], ['Bastille', 'Vivant']], '#0891b2') ]) ]) },

  // ── Santé & bien-être ──
  { id: 'clinic-home', name: 'Clinique — Accueil', theme: T.health, description: 'Hero + cartes de services.', build: () => page('Accueil', 'clinique', [
    wrap([ hero('Votre santé, notre priorité', 'Une équipe de professionnels à votre écoute.', 'Prendre rendez-vous', 'linear-gradient(135deg,#0e7490,#0d9488)'), featureCards([['Stethoscope', 'Médecine générale', 'Consultations sur place.'], ['HeartPulse', 'Spécialistes', 'Cardiologie, dermatologie…'], ['Clock', 'Sans rendez-vous', 'Urgences acceptées.']], '#0d9488') ]) ]) },
  { id: 'doctors', name: 'Nos praticiens', theme: T.health, description: 'Grille de portraits de l’équipe.', build: () => page('Praticiens', 'praticiens', [
    wrap([ heading('Nos praticiens', 'h1', { textAlign: 'center' }), peopleGrid([['Dr. Sophie Bernard', 'Médecine générale'], ['Dr. Marc Petit', 'Cardiologie'], ['Dr. Lina Costa', 'Dermatologie'], ['Dr. Yanis Roux', 'Pédiatrie']], '#0d9488') ]) ]) },
  { id: 'appointment-health', name: 'Prise de RDV médical', theme: T.health, description: 'Formulaire + informations pratiques.', build: () => page('Rendez-vous', 'rdv-medical', [
    wrap([ heading('Prendre rendez-vous', 'h1'), sideForm('Votre demande', [select(['Médecine générale', 'Cardiologie', 'Dermatologie']), select(['Dr. Bernard', 'Dr. Petit', 'Dr. Costa']), row({}, [input('Date'), input('Heure')], '10px'), input('Nom du patient')], 'Bon à savoir', [{ a: 'Clock', b: 'Ouvert 8h-19h' }, { a: 'CreditCard', b: 'Carte Vitale acceptée' }, { a: 'MapPin', b: '12 rue de la Santé' }], 'Confirmer', '#0d9488') ]) ]) },
  { id: 'services-health', name: 'Services de santé', theme: T.health, description: 'Prestations détaillées en accordéon.', build: () => page('Services', 'services-sante', [
    box({ width: '100%', maxWidth: '760px', margin: '0 auto' }, [heading('Nos services', 'h1'), w('accordion', { items: 'Consultations | Médecine générale et spécialités.\nAnalyses | Prélèvements et résultats en ligne.\nVaccinations | Calendrier vaccinal complet.\nSuivi | Suivi des maladies chroniques.' }, {})]),
  ]) },
  { id: 'patient-portal', name: 'Espace patient', theme: T.health, description: 'Tableau de bord du patient.', build: () => page('Mon espace', 'espace-patient', [
    wrap([ heading('Bonjour, Camille', 'h1'), statRow([['Prochain RDV', '24 juin', '', 'Calendar'], ['Ordonnances', '2', '', 'FileText'], ['Résultats', '1 nouveau', '', 'FlaskConical']]), tableCard('Mes documents', 'Document | Date | Type', 'Ordonnance | 12/06 | PDF\nRésultats sanguins | 10/06 | PDF') ]) ]) },

  // ── Éducation & e-learning ──
  { id: 'school-home', name: 'École — Accueil', theme: T.education, description: 'Hero scindé + chiffres.', build: () => page('Accueil', 'ecole', [
    wrap([ splitHero('Apprendre, grandir, réussir', 'Une pédagogie tournée vers l’avenir, du primaire au lycée.', 'Découvrir l’école', false, 'linear-gradient(135deg,#4338ca,#6d28d9)'), bigStats([[98, ' %', 'réussite au bac'], [12, '', 'élèves par classe'], [40, '', 'enseignants']]) ]) ]) },
  { id: 'courses', name: 'Catalogue de cours', theme: T.education, description: 'Cours en cartes avec notes.', build: () => page('Cours', 'cours', [
    wrap([ heading('Catalogue de cours', 'h1'), input('Rechercher un cours…', { maxWidth: '360px' }), row({}, [['Introduction au design', '49 €'], ['Développement web', '129 €'], ['Marketing digital', '79 €']].map(([t, p]) => cardCol([img({ height: '140px' }), w('badge', { text: 'Débutant', variant: 'info' }, {}), text(t, { fontWeight: '700' }), w('rating', { value: 4, max: 5, size: 16 }, {}), row({ justifyContent: 'space-between', alignItems: 'center' }, [text(p, { fontWeight: '700', color: '#6d28d9' }), button('S’inscrire', { fontSize: '13px', padding: '7px 14px', background: '#6d28d9' })], '8px', 'center')]))) ]) ]) },
  { id: 'course-detail', name: 'Détail d’un cours', theme: T.education, description: 'Programme en accordéon + inscription.', build: () => page('Cours', 'cours-detail', [
    wrap([ row({ gap: '24px' }, [box({ flex: '2', minWidth: '320px' }, [w('badge', { text: 'Populaire', variant: 'warning' }, {}), heading('Développement web complet', 'h1'), w('rating', { value: 5, max: 5 }, {}), heading('Programme', 'h3'), w('accordion', { items: 'Module 1 — Bases | HTML, CSS, JavaScript.\nModule 2 — Frontend | React et TypeScript.\nModule 3 — Backend | API et bases de données.' }, {})]), cardCol([img({ height: '160px' }), heading('129 €', 'h2', { color: '#6d28d9' }), button('S’inscrire', { width: '100%', alignSelf: 'stretch', textAlign: 'center', background: '#6d28d9' }), w('iconList', { items: [{ a: 'Clock', b: '24 h de vidéo' }, { a: 'Award', b: 'Certificat' }] }, {})])]) ]) ]) },
  { id: 'lms-dashboard', name: 'Espace apprenant', theme: T.education, description: 'Progression et statistiques.', build: () => page('Apprentissage', 'apprentissage', [
    wrap([ heading('Mon apprentissage', 'h1'), statRow([['Cours suivis', '5', '+1', 'BookOpen'], ['Heures', '38 h', '+4', 'Clock'], ['Certificats', '2', '', 'Award']]), card([heading('En cours', 'h3'), w('progress', { value: 65, label: 'Développement web', color: '#6d28d9' }, {}), w('progress', { value: 30, label: 'Design UI', color: '#6d28d9' }, {}), w('progress', { value: 90, label: 'Marketing', color: '#10b981' }, {})]) ]) ]) },
  { id: 'certificate', name: 'Certificat', theme: T.education, description: 'Attestation de réussite encadrée.', build: () => page('Certificat', 'certificat', [
    box({ width: '100%', maxWidth: '640px', margin: '40px auto' }, [card([box({ textAlign: 'center', padding: '20px' }, [w('icon', { icon: 'Award' }, { color: '#6d28d9', fontSize: '52px', alignSelf: 'center' }), text('CERTIFICAT DE RÉUSSITE', { letterSpacing: '3px', color: '#94a3b8', fontSize: '12px', textAlign: 'center' }), heading('Camille Martin', 'h1', { textAlign: 'center' }), text('a complété avec succès', { textAlign: 'center' }), heading('Développement web complet', 'h3', { textAlign: 'center', color: '#6d28d9' }), text('Le 18 juin 2026', { textAlign: 'center', color: '#64748b' })], { type: 'column', gap: '8px', align: 'center' })], { padding: '32px', border: '2px solid #6d28d9' })]),
  ]) },

  // ── Événementiel ──
  { id: 'event-landing', name: 'Événement — Accueil', theme: T.event, description: 'Hero avec compte à rebours.', build: () => page('Accueil', 'evenement', [
    wrap([ box({ padding: '52px 24px', textAlign: 'center', background: 'linear-gradient(135deg,#be123c,#9333ea)', borderRadius: '16px' }, [w('badge', { text: '18-20 septembre 2026 · Paris', variant: 'primary' }, { alignSelf: 'center' }), heading('TechConf 2026', 'h1', { color: '#fff', textAlign: 'center', fontSize: '48px' }), text('Trois jours d’inspiration et de rencontres.', { color: 'rgba(255,255,255,.9)', textAlign: 'center' }), w('countdown', { target: new Date(Date.now() + 30 * 86400000).toISOString() }, { alignSelf: 'center' }), button('Réserver ma place', { alignSelf: 'center', background: '#fff', color: '#9333ea' })], { type: 'column', gap: '16px', align: 'center' }) ]) ]) },
  { id: 'schedule', name: 'Programme', theme: T.event, description: 'Planning des sessions en tableau.', build: () => page('Programme', 'programme', [
    wrap([ heading('Programme', 'h1'), tableCard('Jour 1', 'Heure | Session | Salle', '09:00 | Ouverture | Grand Amphi\n10:00 | Le futur du no-code | Salle A\n11:30 | Atelier API | Salle B\n14:00 | Table ronde | Grand Amphi') ]) ]) },
  { id: 'speakers', name: 'Intervenants', theme: T.event, description: 'Grille des speakers.', build: () => page('Intervenants', 'intervenants', [
    wrap([ heading('Intervenants', 'h1', { textAlign: 'center' }), peopleGrid([['Sofia Klein', 'CTO @ Acme'], ['Marc Lemaire', 'Designer @ Globex'], ['Aïcha Benali', 'Founder @ Initech'], ['Tom Weber', 'Dev @ Stark']], '#9333ea') ]) ]) },
  { id: 'tickets', name: 'Billetterie', theme: T.event, description: 'Offres de billets.', build: () => page('Billets', 'billets', [
    wrap([ heading('Choisissez votre billet', 'h1', { textAlign: 'center' }), priceRow([['Standard', '99€', '', ['Accès 3 jours', 'Pauses café']], ['Pro', '199€', '', ['Accès VIP', 'Déjeuners', 'Replay'], true], ['Étudiant', '49€', '', ['Accès 3 jours', 'Sur justificatif']]]) ]) ]) },
  { id: 'venue', name: 'Lieu & accès', theme: T.event, description: 'Informations pratiques + carte.', build: () => page('Lieu', 'lieu', [
    wrap([ heading('Lieu & accès', 'h1'), row({ gap: '20px' }, [cardCol([heading('Palais des Congrès', 'h3'), w('iconList', { items: [{ a: 'MapPin', b: '2 place de la Porte Maillot, Paris' }, { a: 'Train', b: 'Métro ligne 1' }, { a: 'Car', b: 'Parking sur place' }] }, {})]), w('map', { query: 'Palais des Congrès Paris', zoom: 14 }, { flex: '1', minWidth: '280px' })]) ]) ]) },

  // ── Voyage & tourisme ──
  { id: 'travel-home', name: 'Voyage — Accueil', theme: T.travel, description: 'Recherche en bandeau + destinations.', build: () => page('Accueil', 'voyage', [
    wrap([ box({ padding: '40px 24px', background: 'linear-gradient(135deg,#0284c7,#0891b2)', borderRadius: '16px' }, [heading('Partez à l’aventure', 'h1', { color: '#fff', textAlign: 'center' }), card([row({ alignItems: 'center' }, [input('Destination'), input('Dates'), select(['1 voyageur', '2 voyageurs', 'Famille']), button('Rechercher', { background: '#0891b2' })], '8px', 'center')])], { type: 'column', gap: '16px', align: 'stretch' }), gallerySection('Destinations populaires', 3) ]) ]) },
  { id: 'destinations', name: 'Destinations', theme: T.travel, description: 'Destinations en grille.', build: () => page('Destinations', 'destinations', [
    wrap([ heading('Où partir ?', 'h1'), productGrid([['Bali', 'dès 890 €'], ['Islande', 'dès 1 200 €'], ['Maroc', 'dès 540 €']], '#0891b2') ]) ]) },
  { id: 'tour-detail', name: 'Détail d’un séjour', theme: T.travel, description: 'Carrousel + itinéraire chronologique.', build: () => page('Séjour', 'sejour', [
    wrap([ w('carousel', { images: [], height: '340px' }, {}), row({ gap: '24px' }, [box({ flex: '2', minWidth: '320px' }, [heading('Circuit au Japon · 10 jours', 'h1'), w('rating', { value: 5, max: 5 }, {}), timelineCard('Itinéraire', 'Jours 1-3 · Tokyo | Découverte de la capitale.\nJours 4-6 · Kyoto | Temples et traditions.\nJours 7-10 · Osaka | Gastronomie.', '#0891b2')]), cardCol([heading('2 490 €', 'h2', { color: '#0891b2' }), text('par personne', { color: '#64748b' }), button('Réserver', { width: '100%', alignSelf: 'stretch', textAlign: 'center', background: '#0891b2' }), w('iconList', { items: [{ a: 'Plane', b: 'Vols inclus' }, { a: 'Hotel', b: 'Hébergement 4★' }] }, {})])]) ]) ]) },
  { id: 'hotel-booking', name: 'Réservation hôtel', theme: T.travel, description: 'Carrousel + réservation latérale.', build: () => page('Hôtel', 'hotel', [
    wrap([ row({ gap: '24px' }, [box({ flex: '2', minWidth: '320px' }, [w('carousel', { images: [], height: '280px' }, {}), heading('Hôtel Belle Vue ★★★★', 'h1'), w('iconList', { items: [{ a: 'Wifi', b: 'Wifi gratuit' }, { a: 'Waves', b: 'Piscine' }, { a: 'Utensils', b: 'Restaurant' }] }, {})]), cardCol([heading('Réserver', 'h3'), row({}, [input('Arrivée'), input('Départ')], '8px'), select(['Standard', 'Deluxe', 'Suite']), heading('120 €/nuit', 'h3', { color: '#0891b2' }), button('Réserver', { width: '100%', alignSelf: 'stretch', textAlign: 'center', background: '#0891b2' })])]) ]) ]) },
  { id: 'flights', name: 'Recherche de vols', theme: T.travel, description: 'Comparateur de vols.', build: () => page('Vols', 'vols', [
    wrap([ card([row({ alignItems: 'center' }, [input('Départ'), input('Arrivée'), input('Date'), button('Rechercher', { background: '#0891b2' })], '8px', 'center')]), tableCard('Résultats', 'Compagnie | Départ | Arrivée | Prix', 'AirFly | 08:20 | 10:45 | 89 €\nSkyJet | 12:10 | 14:30 | 110 €\nBlueAir | 18:00 | 20:25 | 76 €') ]) ]) },

  // ── Agence & corporate ──
  { id: 'corporate-home', name: 'Entreprise — Accueil', theme: T.agency, description: 'Bandeau de chiffres + services.', build: () => page('Accueil', 'entreprise', [
    wrap([ heading('Des solutions qui font la différence', 'h1', { textAlign: 'center' }), bigStats([[500, '+', 'clients'], [12, '', 'pays'], [230, '', 'collaborateurs'], [15, '', 'années']]), featureCards([['Briefcase', 'Conseil', 'Stratégie sur-mesure.'], ['Cog', 'Solutions', 'Outils adaptés.'], ['LifeBuoy', 'Support', 'Accompagnement continu.']]) ]) ]) },
  { id: 'corporate-services', name: 'Services entreprise', theme: T.agency, description: 'Prestations en cartes détaillées.', build: () => page('Services', 'services-entreprise', [
    wrap([ heading('Nos services', 'h1', { textAlign: 'center' }), featureCards([['Lightbulb', 'Stratégie', 'Définissez votre cap.'], ['Code', 'Développement', 'Construisons vos outils.'], ['TrendingUp', 'Croissance', 'Accélérez vos résultats.']]), ctaBand('Parlons de votre projet', 'Un premier échange gratuit et sans engagement.', 'Nous contacter') ]) ]) },
  { id: 'about-corp', name: 'À propos', theme: T.agency, description: 'Valeurs en zigzag + parcours.', build: () => page('À propos', 'a-propos', [
    wrap([ heading('Notre entreprise', 'h1'), zigzag([['Notre mission', 'Créer de la valeur durable pour nos clients.'], ['Notre vision', 'Un avenir plus efficace et plus humain.']]), timelineCard('Notre parcours', '2011 · Création | Lancement de l’entreprise.\n2016 · Expansion | Ouverture à l’international.\n2026 · Leader | 500 clients dans 12 pays.') ]) ]) },
  { id: 'careers', name: 'Carrières', theme: T.agency, description: 'Offres d’emploi en liste.', build: () => page('Carrières', 'carrieres', [
    wrap([ hero('Rejoignez l’aventure', 'Nous recrutons des talents passionnés.', 'Voir les offres'), listRows([['Développeur Full-Stack', 'Tech · Paris · CDI', 'Postuler'], ['Designer UX', 'Produit · Remote · CDI', 'Postuler'], ['Commercial', 'Ventes · Lyon · CDI', 'Postuler']]) ]) ]) },
  { id: 'press', name: 'Espace presse', theme: T.agency, description: 'Communiqués en liste.', build: () => page('Presse', 'presse', [
    wrap([ heading('Espace presse', 'h1'), listRows([['Levée de fonds de 20 M€', '12 juin 2026', 'Lire'], ['Ouverture du bureau de Berlin', '2 mai 2026', 'Lire'], ['Nouveau partenariat stratégique', '18 avril 2026', 'Lire']]) ]) ]) },

  // ── Associatif & ONG ──
  { id: 'ngo-home', name: 'ONG — Accueil', theme: T.ngo, description: 'Impact en chiffres + répartition.', build: () => page('Accueil', 'ong', [
    wrap([ hero('Ensemble, changeons les choses', 'Votre soutien fait la différence sur le terrain.', 'Faire un don', 'linear-gradient(135deg,#15803d,#0d9488)'), row({ gap: '20px' }, [bigStats([[120000, '', 'bénéficiaires'], [48, '', 'projets'], [2400, '', 'bénévoles']], '#15803d')]), chartCard('Utilisation des fonds', { chartType: 'donut', data: 'Terrain | 92\nFonctionnement | 6\nCollecte | 2' }) ]) ]) },
  { id: 'donate', name: 'Faire un don', theme: T.ngo, description: 'Choix du montant + paiement.', build: () => page('Donner', 'donner', [
    box({ width: '100%', maxWidth: '560px', margin: '0 auto' }, [card([heading('Faire un don', 'h2', { textAlign: 'center' }), text('Choisissez un montant', { textAlign: 'center' }), row({ justifyContent: 'center' }, [button('20 €', { background: '#fff', color: '#15803d', border: '1px solid #15803d' }), button('50 €', { background: '#15803d' }), button('100 €', { background: '#fff', color: '#15803d', border: '1px solid #15803d' })], '8px', 'center'), input('Autre montant (€)'), select(['Don unique', 'Don mensuel']), button('Je donne', { width: '100%', alignSelf: 'stretch', textAlign: 'center', background: '#15803d' }), text('Déductible des impôts à 66 %.', { textAlign: 'center', fontSize: '12px', color: '#64748b' })], { padding: '28px' })]),
  ]) },
  { id: 'volunteer', name: 'Devenir bénévole', theme: T.ngo, description: 'Inscription + missions proposées.', build: () => page('Bénévolat', 'benevolat', [
    wrap([ heading('Devenez bénévole', 'h1'), sideForm('Votre engagement', [row({}, [input('Prénom'), input('Nom')], '10px'), input('E-mail'), select(['Quelques heures/mois', 'Régulièrement', 'Ponctuellement'])], 'Missions possibles', [{ a: 'HandHeart', b: 'Aide sur le terrain' }, { a: 'Megaphone', b: 'Communication' }, { a: 'Calendar', b: 'Événements' }], 'Je m’engage', '#15803d') ]) ]) },
  { id: 'campaigns', name: 'Nos campagnes', theme: T.ngo, description: 'Projets avec barres de progression.', build: () => page('Campagnes', 'campagnes', [
    wrap([ heading('Nos campagnes', 'h1'), row({}, [['Eau potable', 72], ['Éducation', 45], ['Reforestation', 88]].map(([t, p]) => cardCol([img({ height: '140px' }), heading(t as string, 'h3'), w('progress', { value: p as number, label: 'Objectif', color: '#15803d' }, {}), button('Soutenir', { background: '#15803d', fontSize: '13px', padding: '7px 14px' })]))) ]) ]) },
  { id: 'ngo-events', name: 'Événements solidaires', theme: T.ngo, description: 'Agenda chronologique des actions.', build: () => page('Événements', 'evenements-ong', [
    box({ width: '100%', maxWidth: '720px', margin: '0 auto' }, [heading('Nos prochains événements', 'h1'), w('timeline', { items: '24 juin · Collecte | Grande collecte alimentaire.\n5 juillet · Course | Course solidaire annuelle.\n18 juillet · Gala | Soirée de levée de fonds.', accent: '#15803d' }, {})]),
  ]) },

  // ── Fitness & sport ──
  { id: 'gym-home', name: 'Salle de sport — Accueil', theme: T.fitness, description: 'Hero sombre scindé + chiffres.', build: () => page('Accueil', 'salle-sport', [
    wrap([ splitHero('Dépassez vos limites', 'Coaching, cours collectifs et équipements de pointe.', 'Essai gratuit', false, 'linear-gradient(135deg,#dc2626,#ea580c)'), statRow([['Membres', '3 200', '+120', 'Users'], ['Coachs', '18', '', 'Award'], ['Cours/sem.', '34', '', 'Calendar']]) ]) ]) },
  { id: 'classes', name: 'Cours collectifs', theme: T.fitness, description: 'Planning hebdomadaire en tableau.', build: () => page('Cours', 'cours-sport', [
    wrap([ heading('Planning des cours', 'h1'), tableCard('Cette semaine', 'Heure | Lun | Mar | Mer | Jeu | Ven', '09:00 | Yoga | HIIT | Yoga | Pilates | HIIT\n12:00 | Cardio | Renfo | Cardio | Renfo | Boxe\n18:00 | CrossFit | Yoga | CrossFit | Boxe | Cardio') ], '960px') ]) },
  { id: 'trainers', name: 'Nos coachs', theme: T.fitness, description: 'Grille de coachs.', build: () => page('Coachs', 'coachs', [
    wrap([ heading('Nos coachs', 'h1', { textAlign: 'center' }), peopleGrid([['Léa Fontaine', 'Yoga & Pilates'], ['Tom Mercier', 'Musculation'], ['Sarah Dubois', 'Cardio & HIIT']], '#dc2626') ]) ]) },
  { id: 'membership', name: 'Abonnements', theme: T.fitness, description: 'Formules d’adhésion.', build: () => page('Abonnements', 'abonnements', [
    wrap([ heading('Choisissez votre formule', 'h1', { textAlign: 'center' }), priceRow([['Découverte', '29€', 'mois', ['Accès salle', 'Horaires limités']], ['Illimité', '49€', 'mois', ['Accès 24/7', 'Cours collectifs', 'Sauna'], true], ['Premium', '79€', 'mois', ['Tout illimité', 'Coach perso']]]) ]) ]) },
  { id: 'nutrition', name: 'Nutrition', theme: T.fitness, description: 'Jauges et suivi des macros.', build: () => page('Nutrition', 'nutrition', [
    wrap([ heading('Nutrition', 'h1'), row({ gap: '20px' }, [cardCol([heading('Apports du jour', 'h3'), w('progressCircle', { value: 64, size: 130, label: 'kcal', color: '#dc2626' }, { alignSelf: 'center' })]), cardCol([heading('Macros', 'h3'), w('progress', { value: 70, label: 'Protéines', color: '#dc2626' }, {}), w('progress', { value: 50, label: 'Glucides', color: '#ea580c' }, {}), w('progress', { value: 40, label: 'Lipides', color: '#f59e0b' }, {})])]) ]) ]) },

  // ── Mode & beauté ──
  { id: 'fashion-home', name: 'Mode — Accueil', theme: T.fashion, description: 'Hero mode + nouveautés.', build: () => page('Accueil', 'mode', [
    box({}, [hero('Collection Printemps 2026', 'Des pièces intemporelles, fabriquées de façon responsable.', 'Découvrir', 'linear-gradient(135deg,#1f2937,#be185d)'), wrap([productGrid([['Robe lin', '79 €'], ['Veste oversize', '120 €'], ['Pantalon taille haute', '65 €'], ['Chemise coton', '49 €']], '#be185d')])])], { padding: '0' }) },
  { id: 'lookbook', name: 'Lookbook', theme: T.fashion, description: 'Galeries de looks plein écran.', build: () => page('Lookbook', 'lookbook', [
    box({}, [wrap([heading('Lookbook 2026', 'h1', { textAlign: 'center' })]), wrap([gallery(2)]), wrap([gallery(3)]), wrap([ctaBand('Découvrez la collection', 'Disponible en boutique et en ligne.', 'Acheter', 'linear-gradient(135deg,#1f2937,#be185d)')])])], { background: '#fff', padding: '24px 0' }) },
  { id: 'salon', name: 'Salon de beauté', theme: T.fashion, description: 'Hero + carte des prestations.', build: () => page('Salon', 'salon', [
    wrap([ hero('Révélez votre beauté', 'Coiffure, soins et esthétique dans un cadre raffiné.', 'Prendre rendez-vous', 'linear-gradient(135deg,#9d174d,#be185d)'), tableCard('Nos prestations', 'Prestation | Durée | Prix', 'Coupe & brushing | 45 min | 38 €\nColoration | 1h30 | 65 €\nSoin du visage | 1h | 55 €', { striped: false }) ]) ]) },
  { id: 'beauty-products', name: 'Produits beauté', theme: T.fashion, description: 'Catalogue cosmétiques.', build: () => page('Produits', 'produits-beaute', [
    wrap([ heading('Nos produits', 'h1'), productGrid([['Sérum éclat', '24 €'], ['Crème hydratante', '32 €'], ['Masque purifiant', '18 €'], ['Huile précieuse', '40 €']], '#be185d') ]) ]) },
  { id: 'brand-story', name: 'Histoire de marque', theme: T.fashion, description: 'Récit éditorial de la marque.', build: () => page('Notre histoire', 'histoire-marque', [
    box({ width: '100%', maxWidth: '760px', margin: '0 auto' }, [img({ height: '300px' }), heading('Notre histoire', 'h1', { textAlign: 'center' }), text('Née d’une passion pour l’artisanat et la durabilité, notre marque crée des pièces pensées pour durer.', { textAlign: 'center', fontSize: '17px' }), w('blockquote', { text: 'La vraie élégance, c’est la simplicité assumée.', author: 'La fondatrice' }, {}), gallery(2)]),
  ], { background: '#fff' }) },

]

export const PAGE_TEMPLATE_THEMES: string[] = Object.values(T)
