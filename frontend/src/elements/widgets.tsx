import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { getIcon } from '@kubuno/sdk'
import type { Element } from '../types'
import { asCss } from './style'

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue de widgets « riches » (façon Elementor), partagé par le builder
// (aperçu statique) et le runtime (interactif). Contrairement aux éléments de
// base, leurs propriétés sont des valeurs simples (pas d'expressions Dyn) — ce
// sont des composants de présentation. `renderWidget` renvoie `undefined` pour
// un type non géré ici (le switch appelant prend alors le relais).
// ─────────────────────────────────────────────────────────────────────────────

/** Lit une prop comme chaîne simple (gère un éventuel littéral { t:'static', v }). */
function s(v: unknown, fb = ''): string {
  if (v == null) return fb
  if (typeof v === 'object' && v && 't' in (v as Record<string, unknown>) && (v as { t: string }).t === 'static') {
    const vv = (v as { v: unknown }).v
    return vv == null ? fb : String(vv)
  }
  return String(v)
}
function n(v: unknown, fb = 0): number { const x = Number(v); return Number.isFinite(x) ? x : fb }
function arr<T = unknown>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : [] }

function Ico({ name, size = 24, color, strokeWidth = 2 }: { name?: string; size?: number; color?: string; strokeWidth?: number }) {
  const C = getIcon(name || 'Star')
  return C ? <C size={size} color={color} strokeWidth={strokeWidth} /> : null
}

function Placeholder({ label, style }: { label: string; style: CSSProperties }) {
  return <div style={{ ...style, display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 12, background: '#f1f5f9' }}>{label}</div>
}

// ── Helpers d'arrays encodés en texte (« a | b » par ligne) — éditeur compact ─

export function parsePairs(text: string): { a: string; b: string }[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf('|')
    return i === -1 ? { a: l, b: '' } : { a: l.slice(0, i).trim(), b: l.slice(i + 1).trim() }
  })
}
export function pairsToText(items: { a: string; b: string }[]): string {
  return items.map((it) => (it.b ? `${it.a} | ${it.b}` : it.a)).join('\n')
}

// ── Vidéo : URL → embed ──────────────────────────────────────────────────────

function videoEmbed(url: string): { kind: 'iframe' | 'video' | 'none'; src: string } {
  if (!url) return { kind: 'none', src: '' }
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/)
  if (yt) return { kind: 'iframe', src: `https://www.youtube.com/embed/${yt[1]}` }
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vm) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vm[1]}` }
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return { kind: 'video', src: url }
  return { kind: 'iframe', src: url }
}

const ALERT_TONES: Record<string, { bg: string; border: string; fg: string }> = {
  info:    { bg: '#eff6ff', border: '#3b82f6', fg: '#1e40af' },
  success: { bg: '#ecfdf5', border: '#10b981', fg: '#065f46' },
  warning: { bg: '#fffbeb', border: '#f59e0b', fg: '#92400e' },
  danger:  { bg: '#fef2f2', border: '#ef4444', fg: '#991b1b' },
}

const SOCIAL_ICON: Record<string, string> = {
  facebook: 'Facebook', twitter: 'Twitter', x: 'Twitter', instagram: 'Instagram',
  linkedin: 'Linkedin', youtube: 'Youtube', github: 'Github', mail: 'Mail',
  globe: 'Globe', phone: 'Phone',
}

// ── Composants interactifs ───────────────────────────────────────────────────

function TabsW({ el, interactive }: { el: Element; interactive: boolean }) {
  const css = asCss(el.style)
  const tabs = arr<{ a: string; b: string }>(el.props.tabs)
  const [active, setActive] = useState(0)
  const i = Math.min(active, Math.max(0, tabs.length - 1))
  return (
    <div style={css}>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0' }}>
        {tabs.map((t, k) => (
          <button key={k} type="button"
            onClick={(e) => { if (interactive) { e.stopPropagation(); setActive(k) } }}
            style={{ padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 600,
              color: k === i ? '#2563eb' : '#64748b', borderBottom: k === i ? '2px solid #2563eb' : '2px solid transparent', marginBottom: -1 }}>
            {t.a || `Onglet ${k + 1}`}
          </button>
        ))}
      </div>
      <div style={{ padding: '12px 4px', color: '#334155', fontSize: 15 }}>{tabs[i]?.b}</div>
    </div>
  )
}

function AccordionW({ el, interactive }: { el: Element; interactive: boolean }) {
  const css = asCss(el.style)
  const items = arr<{ a: string; b: string }>(el.props.items)
  const [open, setOpen] = useState<number>(0)
  const Chevron = getIcon('ChevronDown')
  return (
    <div style={{ ...css, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
      {items.map((it, k) => {
        const isOpen = open === k
        return (
          <div key={k} style={{ borderTop: k ? '1px solid #e2e8f0' : 'none' }}>
            <button type="button"
              onClick={(e) => { if (interactive) { e.stopPropagation(); setOpen(isOpen ? -1 : k) } }}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                padding: '12px 14px', background: isOpen ? '#f8fafc' : '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, color: '#0f172a', textAlign: 'left' }}>
              <span>{it.a || `Section ${k + 1}`}</span>
              {Chevron && <Chevron size={16} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />}
            </button>
            {isOpen && <div style={{ padding: '0 14px 12px', color: '#475569', fontSize: 15 }}>{it.b}</div>}
          </div>
        )
      })}
    </div>
  )
}

function CounterW({ el, interactive }: { el: Element; interactive: boolean }) {
  const css = asCss(el.style)
  const end = n(el.props.end, 100)
  const duration = n(el.props.duration, 1500)
  const [val, setVal] = useState(interactive ? 0 : end)
  const raf = useRef<number>(0)
  useEffect(() => {
    if (!interactive) { setVal(end); return }
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      setVal(Math.round(end * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [end, duration, interactive])
  return (
    <div style={{ textAlign: 'center', ...css }}>
      <div style={{ fontSize: 40, fontWeight: 800, color: (el.style.color as string) || '#0f172a', lineHeight: 1.1 }}>
        {s(el.props.prefix)}{val.toLocaleString('fr-FR')}{s(el.props.suffix)}
      </div>
      {s(el.props.label) && <div style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>{s(el.props.label)}</div>}
    </div>
  )
}

function CountdownW({ el, interactive }: { el: Element; interactive: boolean }) {
  const css = asCss(el.style)
  const target = s(el.props.target)
  const compute = () => {
    const ms = Math.max(0, new Date(target).getTime() - Date.now())
    const d = Math.floor(ms / 86400000)
    const h = Math.floor((ms % 86400000) / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    const sec = Math.floor((ms % 60000) / 1000)
    return { d, h, m, s: sec }
  }
  const [t, setT] = useState(compute)
  useEffect(() => {
    if (!interactive) { setT(compute()); return }
    const id = setInterval(() => setT(compute()), 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, interactive])
  const cell = (v: number, l: string) => (
    <div style={{ textAlign: 'center', minWidth: 56 }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: (el.style.color as string) || '#0f172a' }}>{String(v).padStart(2, '0')}</div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#94a3b8' }}>{l}</div>
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', ...css }}>
      {cell(t.d, 'jours')}{cell(t.h, 'heures')}{cell(t.m, 'min')}{cell(t.s, 'sec')}
    </div>
  )
}

function FlipBoxW({ el }: { el: Element }) {
  const css = asCss(el.style)
  const [flip, setFlip] = useState(false)
  const face: CSSProperties = { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 'inherit',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, textAlign: 'center' }
  return (
    <div style={{ perspective: 1000, height: (el.style.height as string) || '220px', ...css, padding: 0, background: 'none', border: 'none' }}
      onMouseEnter={() => setFlip(true)} onMouseLeave={() => setFlip(false)}>
      <div style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', transition: 'transform .6s', transform: flip ? 'rotateY(180deg)' : 'none' }}>
        <div style={{ ...face, background: (el.props.frontBg as string) || '#2563eb', color: '#fff' }}>
          {s(el.props.frontIcon) && <Ico name={s(el.props.frontIcon)} size={36} color="#fff" />}
          <div style={{ fontSize: 20, fontWeight: 700 }}>{s(el.props.frontTitle, 'Recto')}</div>
          <div style={{ opacity: .9, fontSize: 14 }}>{s(el.props.frontText)}</div>
        </div>
        <div style={{ ...face, background: (el.props.backBg as string) || '#0f172a', color: '#fff', transform: 'rotateY(180deg)' }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{s(el.props.backTitle, 'Verso')}</div>
          <div style={{ opacity: .9, fontSize: 14 }}>{s(el.props.backText)}</div>
        </div>
      </div>
    </div>
  )
}

// ── Rendu principal ──────────────────────────────────────────────────────────

export function renderWidget(el: Element, interactive: boolean) {
  const css = asCss(el.style)
  switch (el.type) {
    case 'spacer':
      return <div style={{ width: '100%', height: '40px', ...css }} />

    case 'video': {
      const { kind, src } = videoEmbed(s(el.props.url))
      const box: CSSProperties = { width: '100%', aspectRatio: '16 / 9', borderRadius: 8, overflow: 'hidden', background: '#000', ...css }
      if (kind === 'none') return <Placeholder label="Vidéo (URL YouTube/Vimeo/MP4)" style={box} />
      if (kind === 'video') return <video src={src} controls style={{ ...box, objectFit: 'cover' }} />
      return <div style={box}><iframe src={src} title={el.name} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{ width: '100%', height: '100%', border: 0 }} /></div>
    }

    case 'audio':
      return <audio src={s(el.props.src)} controls style={{ width: '100%', ...css }} />

    case 'map': {
      const q = s(el.props.query, 'Paris, France')
      const z = n(el.props.zoom, 13)
      const box: CSSProperties = { width: '100%', aspectRatio: '16 / 9', borderRadius: 8, overflow: 'hidden', ...css }
      return <div style={box}><iframe title={el.name} src={`https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=${z}&output=embed`} style={{ width: '100%', height: '100%', border: 0 }} /></div>
    }

    case 'embed':
      return <div style={css} dangerouslySetInnerHTML={{ __html: s(el.props.html, '<em>HTML…</em>') }} />

    case 'gallery': {
      const imgs = arr<string>(el.props.images)
      const cols = n(el.props.columns, 3)
      const list = imgs.length ? imgs : ['', '', '']
      return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: s(el.props.gap, '8px'), ...css }}>
          {list.map((src, i) => src
            ? <img key={i} src={src} alt="" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 6 }} />
            : <Placeholder key={i} label="Image" style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 6 }} />)}
        </div>
      )
    }

    case 'iconBox': {
      const align = s(el.props.align, 'center') as 'left' | 'center' | 'right'
      const items = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: items, gap: 10, textAlign: align, ...css }}>
          <Ico name={s(el.props.icon, 'Sparkles')} size={n(el.props.iconSize, 40)} color={s(el.props.iconColor, '#2563eb')} strokeWidth={1.6} />
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{s(el.props.title, 'Titre')}</div>
          <div style={{ fontSize: 14, color: '#64748b' }}>{s(el.props.text, 'Description du bloc.')}</div>
        </div>
      )
    }

    case 'imageBox': {
      const align = s(el.props.align, 'center') as 'left' | 'center' | 'right'
      const items = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'
      const src = s(el.props.src)
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: items, gap: 10, textAlign: align, ...css }}>
          {src ? <img src={src} alt={s(el.props.title)} style={{ width: '100%', borderRadius: 8, objectFit: 'cover' }} />
               : <Placeholder label="Image" style={{ width: '100%', height: 140, borderRadius: 8 }} />}
          <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{s(el.props.title, 'Titre')}</div>
          <div style={{ fontSize: 14, color: '#64748b' }}>{s(el.props.text, 'Description.')}</div>
        </div>
      )
    }

    case 'iconList': {
      const items = arr<{ a: string; b: string }>(el.props.items)
      const list = items.length ? items : [{ a: 'Check', b: 'Élément un' }, { a: 'Check', b: 'Élément deux' }]
      return (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8, ...css }}>
          {list.map((it, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#334155', fontSize: 15 }}>
              <Ico name={it.a || 'Check'} size={18} color={s(el.props.iconColor, '#2563eb')} />
              <span>{it.b}</span>
            </li>
          ))}
        </ul>
      )
    }

    case 'list': {
      const items = arr<string>(el.props.items)
      const list = items.length ? items : ['Premier élément', 'Deuxième élément']
      const ordered = Boolean(el.props.ordered)
      const Tag = ordered ? 'ol' : 'ul'
      return <Tag style={{ paddingLeft: 22, margin: 0, color: '#334155', fontSize: 15, display: 'flex', flexDirection: 'column', gap: 4, ...css }}>{list.map((it, i) => <li key={i}>{it}</li>)}</Tag>
    }

    case 'alert': {
      const tone = ALERT_TONES[s(el.props.variant, 'info')] ?? ALERT_TONES.info
      return (
        <div style={{ background: tone.bg, borderLeft: `4px solid ${tone.border}`, color: tone.fg, padding: '12px 14px', borderRadius: 8, ...css }}>
          {s(el.props.title) && <div style={{ fontWeight: 700, marginBottom: 2 }}>{s(el.props.title)}</div>}
          <div style={{ fontSize: 14 }}>{s(el.props.text, 'Message d’information.')}</div>
        </div>
      )
    }

    case 'blockquote':
      return (
        <blockquote style={{ borderLeft: '4px solid #2563eb', margin: 0, padding: '6px 0 6px 16px', ...css }}>
          <p style={{ fontSize: 19, fontStyle: 'italic', color: '#1e293b', margin: 0 }}>“{s(el.props.text, 'Une citation inspirante.')}”</p>
          {s(el.props.author) && <footer style={{ marginTop: 6, color: '#64748b', fontSize: 13 }}>— {s(el.props.author)}</footer>}
        </blockquote>
      )

    case 'rating': {
      const value = n(el.props.value, 4)
      const max = n(el.props.max, 5)
      const Star = getIcon('Star')
      return (
        <div style={{ display: 'flex', gap: 2, ...css }}>
          {Array.from({ length: max }).map((_, i) => (
            Star ? <Star key={i} size={n(el.props.size, 22)} color="#f59e0b" fill={i < value ? '#f59e0b' : 'none'} /> : null
          ))}
        </div>
      )
    }

    case 'progress': {
      const value = Math.max(0, Math.min(100, n(el.props.value, 70)))
      return (
        <div style={css}>
          {(!!s(el.props.label) || el.props.showPercent !== false) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13, color: '#475569', fontWeight: 600 }}>
              <span>{s(el.props.label)}</span>{el.props.showPercent !== false && <span>{value}%</span>}
            </div>
          )}
          <div style={{ height: 10, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${value}%`, height: '100%', background: s(el.props.color, '#2563eb'), borderRadius: 999, transition: 'width .4s' }} />
          </div>
        </div>
      )
    }

    case 'testimonial': {
      const avatar = s(el.props.avatar)
      return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, ...css }}>
          <p style={{ fontSize: 16, color: '#1e293b', fontStyle: 'italic', margin: '0 0 14px' }}>“{s(el.props.quote, 'Un retour client élogieux.')}”</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {avatar ? <img src={avatar} alt="" style={{ width: 40, height: 40, borderRadius: 999, objectFit: 'cover' }} />
                    : <div style={{ width: 40, height: 40, borderRadius: 999, background: '#cbd5e1' }} />}
            <div>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{s(el.props.author, 'Client satisfait')}</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>{s(el.props.role)}</div>
            </div>
          </div>
        </div>
      )
    }

    case 'priceTable': {
      const feats = arr<string>(el.props.features)
      const list = feats.length ? feats : ['Fonction incluse', 'Autre fonction']
      const featured = Boolean(el.props.featured)
      const Check = getIcon('Check')
      return (
        <div style={{ background: '#fff', border: featured ? '2px solid #2563eb' : '1px solid #e2e8f0', borderRadius: 14, padding: 24, textAlign: 'center', boxShadow: featured ? '0 12px 30px rgba(37,99,235,.15)' : 'none', ...css }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>{s(el.props.plan, 'Pro')}</div>
          <div style={{ margin: '10px 0' }}>
            <span style={{ fontSize: 44, fontWeight: 800, color: '#0f172a' }}>{s(el.props.price, '29€')}</span>
            <span style={{ color: '#94a3b8', fontSize: 14 }}> /{s(el.props.period, 'mois')}</span>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0', display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
            {list.map((f, i) => <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#334155', fontSize: 14 }}>{Check && <Check size={16} color="#10b981" />}{f}</li>)}
          </ul>
          <button type="button" style={{ width: '100%', padding: '11px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, background: featured ? '#2563eb' : '#0f172a', color: '#fff' }}>{s(el.props.buttonLabel, 'Choisir')}</button>
        </div>
      )
    }

    case 'cta': {
      const align = s(el.props.align, 'center') as 'left' | 'center' | 'right'
      return (
        <div style={{ background: s(el.props.background, 'linear-gradient(135deg,#2563eb,#7c3aed)'), color: '#fff', borderRadius: 14, padding: '32px 28px', textAlign: align, ...css }}>
          <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>{s(el.props.title, 'Prêt à commencer ?')}</div>
          <div style={{ opacity: .9, marginBottom: 18, fontSize: 15 }}>{s(el.props.text, 'Rejoignez-nous dès aujourd’hui.')}</div>
          <button type="button" style={{ padding: '12px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, background: '#fff', color: '#1e293b' }}>{s(el.props.buttonLabel, 'Commencer')}</button>
        </div>
      )
    }

    case 'socialIcons': {
      const links = arr<{ a: string; b: string }>(el.props.links)
      const list = links.length ? links : [{ a: 'facebook', b: '#' }, { a: 'twitter', b: '#' }, { a: 'instagram', b: '#' }]
      const size = n(el.props.size, 20)
      return (
        <div style={{ display: 'flex', gap: 10, ...css }}>
          {list.map((lk, i) => (
            <a key={i} href={interactive ? (lk.b || '#') : undefined} target="_blank" rel="noreferrer"
              onClick={(e) => { if (!interactive) e.preventDefault() }}
              style={{ width: size + 18, height: size + 18, borderRadius: 8, display: 'grid', placeItems: 'center', background: s(el.props.color, '#0f172a'), color: '#fff' }}>
              <Ico name={SOCIAL_ICON[lk.a.toLowerCase()] || 'Link'} size={size} color="#fff" />
            </a>
          ))}
        </div>
      )
    }

    case 'tabs':      return <TabsW el={el} interactive={interactive} />
    case 'accordion': return <AccordionW el={el} interactive={interactive} />
    case 'counter':   return <CounterW el={el} interactive={interactive} />
    case 'countdown': return <CountdownW el={el} interactive={interactive} />
    case 'flipBox':   return <FlipBoxW el={el} />

    default:
      return undefined
  }
}
