import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Element } from '../types'
import { asCss } from './style'
import { resolveIcon } from './icons'

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
  const C = resolveIcon(name || 'Star')
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
  const Chevron = resolveIcon('ChevronDown')
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

// ── Lot 2 : helpers ──────────────────────────────────────────────────────────

/** Découpe un texte multi-lignes en tableau de cellules (séparateur « | »). */
function parseRows(text: string): string[][] {
  return text.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim()).map((l) => l.split('|').map((c) => c.trim()))
}
function rowsToText(rows: string[][]): string { return rows.map((r) => r.join(' | ')).join('\n') }

const BADGE_TONES: Record<string, { bg: string; fg: string }> = {
  neutral: { bg: '#f1f5f9', fg: '#475569' }, info: { bg: '#dbeafe', fg: '#1e40af' },
  success: { bg: '#dcfce7', fg: '#166534' }, warning: { bg: '#fef3c7', fg: '#92400e' },
  danger: { bg: '#fee2e2', fg: '#991b1b' }, primary: { bg: '#ede9fe', fg: '#5b21b6' },
}

const CHART_PALETTE = ['#2563eb', '#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#6366f1', '#84cc16']

// ── Graphique (SVG natif : barres / lignes / aires / camembert / anneau) ──────

function ChartW({ el }: { el: Element }) {
  const css = asCss(el.style)
  const kind = s(el.props.chartType, 'bar')
  const pairs = parsePairs(s(el.props.data))
  const data = (pairs.length ? pairs : [{ a: 'A', b: '30' }, { a: 'B', b: '60' }, { a: 'C', b: '45' }]).map((p) => ({ label: p.a, value: n(p.b, 0) }))
  const color = s(el.props.color, '#2563eb')
  const showValues = el.props.showValues !== false
  const W = 480, H = n(el.props.height, 240), pad = 32
  const max = Math.max(1, ...data.map((d) => d.value))

  if (kind === 'pie' || kind === 'donut') {
    const total = data.reduce((acc, d) => acc + d.value, 0) || 1
    const cx = H / 2, cy = H / 2, r = H / 2 - 6, inner = kind === 'donut' ? r * 0.58 : 0
    let a0 = -Math.PI / 2
    const arc = (v: number, i: number) => {
      const a1 = a0 + (v / total) * Math.PI * 2
      const big = a1 - a0 > Math.PI ? 1 : 0
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
      const d = inner
        ? `M ${cx + inner * Math.cos(a0)} ${cy + inner * Math.sin(a0)} L ${x0} ${y0} A ${r} ${r} 0 ${big} 1 ${x1} ${y1} L ${cx + inner * Math.cos(a1)} ${cy + inner * Math.sin(a1)} A ${inner} ${inner} 0 ${big} 0 ${cx + inner * Math.cos(a0)} ${cy + inner * Math.sin(a0)} Z`
        : `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${big} 1 ${x1} ${y1} Z`
      a0 = a1
      return <path key={i} d={d} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
    }
    return (
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', ...css }}>
        <svg width={H} height={H} viewBox={`0 0 ${H} ${H}`}>{data.map((d, i) => arc(d.value, i))}</svg>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#475569' }}>
          {data.map((d, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: CHART_PALETTE[i % CHART_PALETTE.length] }} />
              <span>{d.label}</span><span style={{ marginLeft: 'auto', fontWeight: 700, color: '#0f172a' }}>{d.value}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const innerW = W - pad * 2, innerH = H - pad
  const stepX = innerW / Math.max(1, data.length - (kind === 'bar' ? 0 : 1))
  const yOf = (v: number) => H - pad - (v / max) * (innerH - 10)
  return (
    <div style={css}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ overflow: 'visible' }}>
        {[0, 0.5, 1].map((g, i) => <line key={i} x1={pad} x2={W - pad} y1={pad + (innerH - 10) * g} y2={pad + (innerH - 10) * g} stroke="#e2e8f0" strokeWidth={1} />)}
        {kind === 'bar' && data.map((d, i) => {
          const bw = Math.min(48, stepX * 0.6), bx = pad + stepX * i + (stepX - bw) / 2, by = yOf(d.value)
          return <g key={i}>
            <rect x={bx} y={by} width={bw} height={H - pad - by} rx={4} fill={CHART_PALETTE[i % CHART_PALETTE.length] || color} />
            {showValues && <text x={bx + bw / 2} y={by - 5} textAnchor="middle" fontSize={11} fill="#475569" fontWeight={600}>{d.value}</text>}
            <text x={bx + bw / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#94a3b8">{d.label}</text>
          </g>
        })}
        {(kind === 'line' || kind === 'area') && (() => {
          const pts = data.map((d, i) => `${pad + stepX * i},${yOf(d.value)}`)
          return <g>
            {kind === 'area' && <polygon points={`${pad},${H - pad} ${pts.join(' ')} ${pad + stepX * (data.length - 1)},${H - pad}`} fill={color} opacity={0.15} />}
            <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
            {data.map((d, i) => <g key={i}>
              <circle cx={pad + stepX * i} cy={yOf(d.value)} r={4} fill="#fff" stroke={color} strokeWidth={2} />
              {showValues && <text x={pad + stepX * i} y={yOf(d.value) - 9} textAnchor="middle" fontSize={11} fill="#475569" fontWeight={600}>{d.value}</text>}
              <text x={pad + stepX * i} y={H - 8} textAnchor="middle" fontSize={11} fill="#94a3b8">{d.label}</text>
            </g>)}
          </g>
        })()}
      </svg>
    </div>
  )
}

// ── Carrousel d'images (autoplay + flèches + points) ─────────────────────────

function CarouselW({ el, interactive }: { el: Element; interactive: boolean }) {
  const css = asCss(el.style)
  const imgs = arr<string>(el.props.images).filter(Boolean)
  const list = imgs.length ? imgs : ['', '', '']
  const [i, setI] = useState(0)
  const autoplay = el.props.autoplay !== false
  const interval = n(el.props.interval, 4000)
  const height = s(el.props.height, '280px')
  useEffect(() => {
    if (!interactive || !autoplay || list.length < 2) return
    const id = setInterval(() => setI((k) => (k + 1) % list.length), interval)
    return () => clearInterval(id)
  }, [interactive, autoplay, interval, list.length])
  const go = (d: number) => setI((k) => (k + d + list.length) % list.length)
  const Arrow = (dir: 'L' | 'R') => {
    const C = resolveIcon(dir === 'L' ? 'ChevronLeft' : 'ChevronRight')
    return (
      <button type="button" onClick={(e) => { if (interactive) { e.stopPropagation(); go(dir === 'L' ? -1 : 1) } }}
        style={{ position: 'absolute', top: '50%', [dir === 'L' ? 'left' : 'right']: 10, transform: 'translateY(-50%)', width: 36, height: 36, borderRadius: 999, border: 'none', cursor: 'pointer', background: 'rgba(15,23,42,.45)', color: '#fff', display: 'grid', placeItems: 'center' } as CSSProperties}>
        {C && <C size={20} />}
      </button>
    )
  }
  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: 12, overflow: 'hidden', background: '#0f172a', ...css }}>
      {list.map((src, k) => src
        ? <img key={k} src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: k === i ? 1 : 0, transition: 'opacity .5s' }} />
        : <div key={k} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#64748b', opacity: k === i ? 1 : 0, transition: 'opacity .5s' }}>Image {k + 1}</div>)}
      {el.props.showArrows !== false && list.length > 1 && <>{Arrow('L')}{Arrow('R')}</>}
      {el.props.showDots !== false && list.length > 1 && (
        <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', gap: 6, justifyContent: 'center' }}>
          {list.map((_, k) => <button key={k} type="button" onClick={(e) => { if (interactive) { e.stopPropagation(); setI(k) } }}
            style={{ width: k === i ? 22 : 8, height: 8, borderRadius: 999, border: 'none', cursor: 'pointer', background: k === i ? '#fff' : 'rgba(255,255,255,.5)', transition: 'width .3s' }} />)}
        </div>
      )}
    </div>
  )
}

// ── Comparateur avant / après (curseur déplaçable) ───────────────────────────

function BeforeAfterW({ el, interactive }: { el: Element; interactive: boolean }) {
  const css = asCss(el.style)
  const before = s(el.props.before), after = s(el.props.after)
  const height = s(el.props.height, '300px')
  const [pos, setPos] = useState(50)
  const ref = useRef<HTMLDivElement>(null)
  const drag = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)))
  }
  const onDown = (e: React.PointerEvent) => {
    if (!interactive) return
    e.stopPropagation(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag(e.clientX)
  }
  const fill = (url: string, label: string): CSSProperties => ({ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: url ? undefined : '#e2e8f0' } as CSSProperties)
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height, borderRadius: 12, overflow: 'hidden', userSelect: 'none', cursor: interactive ? 'ew-resize' : 'default', ...css }}
      onPointerDown={onDown} onPointerMove={(e) => { if (interactive && e.buttons === 1) drag(e.clientX) }}>
      {after ? <img src={after} alt="" style={fill(after, 'après')} /> : <div style={{ ...fill('', ''), display: 'grid', placeItems: 'center', color: '#64748b' }}>Après</div>}
      <div style={{ position: 'absolute', inset: 0, width: `${pos}%`, overflow: 'hidden', borderRight: '2px solid #fff' }}>
        {before ? <img src={before} alt="" style={{ ...fill(before, 'avant'), width: ref.current?.offsetWidth || '100%' } as CSSProperties} /> : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#64748b', background: '#cbd5e1', width: ref.current?.offsetWidth }}>Avant</div>}
      </div>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: 2, background: '#fff', transform: 'translateX(-1px)' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 34, height: 34, borderRadius: 999, background: '#fff', boxShadow: '0 1px 6px rgba(0,0,0,.3)', display: 'grid', placeItems: 'center', color: '#0f172a', fontSize: 12 }}>⇄</div>
      </div>
    </div>
  )
}

// ── Bandeau défilant (marquee CSS) ───────────────────────────────────────────

function MarqueeW({ el }: { el: Element }) {
  const css = asCss(el.style)
  const items = arr<string>(el.props.items)
  const list = items.length ? items : ['Kubuno', 'Open source', 'Self-hosted', 'Souverain']
  const dur = Math.max(4, n(el.props.speed, 18))
  const anim = `app-marquee-${el.id.replace(/[^a-z0-9]/gi, '')}`
  return (
    <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', ...css }}>
      <style>{`@keyframes ${anim}{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      <div style={{ display: 'inline-flex', gap: 40, animation: `${anim} ${dur}s linear infinite`, paddingRight: 40 }}>
        {[...list, ...list].map((it, k) => <span key={k} style={{ fontSize: 18, fontWeight: 600, color: (el.style.color as string) || '#475569' }}>{it}</span>)}
      </div>
    </div>
  )
}

// ── Titre animé (mots qui défilent) ──────────────────────────────────────────

function AnimatedHeadingW({ el, interactive }: { el: Element; interactive: boolean }) {
  const css = asCss(el.style)
  const words = arr<string>(el.props.words)
  const list = words.length ? words : ['plus rapides', 'sans code', 'à votre image']
  const [i, setI] = useState(0)
  useEffect(() => {
    if (!interactive) return
    const id = setInterval(() => setI((k) => (k + 1) % list.length), n(el.props.interval, 2200))
    return () => clearInterval(id)
  }, [interactive, list.length])
  const accent = s(el.props.color, '#2563eb')
  return (
    <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', lineHeight: 1.2, ...css }}>
      {s(el.props.before, 'Des apps ')}
      <span style={{ display: 'inline-block', color: accent, position: 'relative' }} key={i}>
        <span style={{ animation: interactive ? 'app-fade-in .5s ease' : undefined }}>{list[i]}</span>
        <style>{`@keyframes app-fade-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>
      </span>
      {s(el.props.after, '')}
    </div>
  )
}

// ── Lot 3 : widgets « mobile / app » ─────────────────────────────────────────

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#4f46e5']
function colorFromName(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}
const STATUS_DOT: Record<string, string> = { online: '#22c55e', away: '#f59e0b', offline: '#94a3b8' }

export function Avatar({ src, name, size, status }: { src?: string; name?: string; size: number; status?: string }) {
  const dot = status ? STATUS_DOT[status] : undefined
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {src
        ? <img src={src} alt="" style={{ width: size, height: size, borderRadius: 999, objectFit: 'cover' }} />
        : <div style={{ width: size, height: size, borderRadius: 999, background: colorFromName(name || '?'), color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: size * 0.4 }}>{initials(name || '?')}</div>}
      {dot && <span style={{ position: 'absolute', right: 0, bottom: 0, width: Math.max(8, size * 0.28), height: Math.max(8, size * 0.28), borderRadius: 999, background: dot, border: '2px solid #fff' }} />}
    </div>
  )
}

function AppBarW({ el, interactive, onNav }: { el: Element; interactive: boolean; onNav?: (t: string) => void }) {
  const css = asCss(el.style)
  const rights = s(el.props.rightIcons).split(',').map((x) => x.trim()).filter(Boolean)
  const back = s(el.props.backTo)
  const go = (t: string) => { if (interactive && onNav && t) onNav(t) }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: s(el.props.bg, '#075e54'), color: s(el.props.color, '#fff'), ...css }}>
      {s(el.props.leftIcon) && <button type="button" onClick={() => go(back)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: interactive && back ? 'pointer' : 'default', padding: 0, display: 'grid', placeItems: 'center' }}><Ico name={s(el.props.leftIcon, 'ChevronLeft')} size={22} color="currentColor" /></button>}
      {s(el.props.avatar) !== '' && <Avatar name={s(el.props.title)} size={34} status={s(el.props.status) || undefined} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.2 }}>{s(el.props.title, 'Titre')}</div>
        {s(el.props.subtitle) && <div style={{ fontSize: 12, opacity: 0.85 }}>{s(el.props.subtitle)}</div>}
      </div>
      {rights.map((ic, i) => <Ico key={i} name={ic} size={21} color="currentColor" />)}
    </div>
  )
}

function BottomNavW({ el, interactive, onNav }: { el: Element; interactive: boolean; onNav?: (t: string) => void }) {
  const css = asCss(el.style)
  const items = parseRows(s(el.props.items))
  const active = n(el.props.active, 0)
  const accent = s(el.props.accent, '#075e54')
  return (
    <div style={{ display: 'flex', borderTop: '1px solid #e2e8f0', background: s(el.props.bg, '#fff'), ...css }}>
      {items.map((it, i) => (
        <button key={i} type="button" onClick={(e) => { if (interactive && onNav && it[2]) { e.stopPropagation(); onNav(it[2]) } }}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 0', background: 'none', border: 'none', cursor: interactive && it[2] ? 'pointer' : 'default', color: i === active ? accent : '#94a3b8' }}>
          <Ico name={it[0] || 'Circle'} size={22} color={i === active ? accent : '#94a3b8'} />
          <span style={{ fontSize: 11, fontWeight: i === active ? 700 : 500 }}>{it[1]}</span>
        </button>
      ))}
    </div>
  )
}

function TileListW({ el, interactive, onNav }: { el: Element; interactive: boolean; onNav?: (t: string) => void }) {
  const css = asCss(el.style)
  const rows = parseRows(s(el.props.items))
  return (
    <div style={{ background: s(el.props.bg, '#fff'), ...css }}>
      {rows.map((r, i) => {
        const [title = '', subtitle = '', trailing = '', badge = '', target = ''] = r
        return (
          <div key={i} onClick={() => { if (interactive && onNav && target) onNav(target) }}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: interactive && target ? 'pointer' : 'default' }}>
            <Avatar name={title} size={48} status={s(el.props.status) || undefined} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{title}</div>
              <div style={{ fontSize: 13, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {trailing && <div style={{ fontSize: 11, color: badge ? '#22c55e' : '#94a3b8', fontWeight: badge ? 700 : 400 }}>{trailing}</div>}
              {badge && <span style={{ minWidth: 18, textAlign: 'center', padding: '1px 6px', borderRadius: 999, background: '#22c55e', color: '#fff', fontSize: 11, fontWeight: 700 }}>{badge}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ChatThreadW({ el }: { el: Element }) {
  const css = asCss(el.style)
  const msgs = parseRows(s(el.props.messages))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 14, background: s(el.props.bg, '#e5ddd5'), ...css }}>
      {msgs.map((m, i) => {
        const out = (m[0] || '').toLowerCase() === 'out'
        return (
          <div key={i} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '78%', background: out ? '#dcf8c6' : '#fff', borderRadius: 10, padding: '7px 10px', boxShadow: '0 1px 1px rgba(0,0,0,.08)' }}>
            <div style={{ fontSize: 14, color: '#0f172a', whiteSpace: 'pre-wrap' }}>{m[1]}</div>
            {m[2] && <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 2 }}>{m[2]}</div>}
          </div>
        )
      })}
    </div>
  )
}

function MessageInputW({ el }: { el: Element }) {
  const css = asCss(el.style)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: s(el.props.bg, '#f0f2f5'), ...css }}>
      <Ico name="Smile" size={22} color="#64748b" />
      <div style={{ flex: 1, background: '#fff', borderRadius: 999, padding: '8px 14px', color: '#94a3b8', fontSize: 14 }}>{s(el.props.placeholder, 'Message')}</div>
      <span style={{ width: 38, height: 38, borderRadius: 999, background: s(el.props.accent, '#25d366'), display: 'grid', placeItems: 'center', flexShrink: 0 }}><Ico name="Send" size={18} color="#fff" /></span>
    </div>
  )
}

// ── Rendu principal ──────────────────────────────────────────────────────────

export function renderWidget(el: Element, interactive: boolean, onNav?: (target: string) => void) {
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
      const Star = resolveIcon('Star')
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
      const Check = resolveIcon('Check')
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

    // ── Lot 2 ──
    case 'chart':       return <ChartW el={el} />
    case 'carousel':    return <CarouselW el={el} interactive={interactive} />
    case 'beforeAfter': return <BeforeAfterW el={el} interactive={interactive} />
    case 'marquee':     return <MarqueeW el={el} />
    case 'animatedHeading': return <AnimatedHeadingW el={el} interactive={interactive} />

    // ── Lot 3 : mobile / app ──
    case 'avatar':       return <span style={asCss(el.style)}><Avatar src={s(el.props.src) || undefined} name={s(el.props.name)} size={n(el.props.size, 56)} status={s(el.props.status) || undefined} /></span>
    case 'appBar':       return <AppBarW el={el} interactive={interactive} onNav={onNav} />
    case 'bottomNav':    return <BottomNavW el={el} interactive={interactive} onNav={onNav} />
    case 'tileList':     return <TileListW el={el} interactive={interactive} onNav={onNav} />
    case 'chatThread':   return <ChatThreadW el={el} />
    case 'messageInput': return <MessageInputW el={el} />

    case 'table': {
      const rows = parseRows(s(el.props.rows))
      const header = parseRows(s(el.props.columns))[0] ?? (rows[0] ?? [])
      const body = el.props.columns ? rows : rows.slice(1)
      const striped = el.props.striped !== false
      const compact = Boolean(el.props.compact)
      const pad = compact ? '6px 10px' : '10px 14px'
      return (
        <div style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, ...css }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            {header.length > 0 && <thead><tr>{header.map((h, i) => <th key={i} style={{ textAlign: 'left', padding: pad, background: '#f8fafc', color: '#475569', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>{h}</th>)}</tr></thead>}
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} style={{ background: striped && ri % 2 ? '#f8fafc' : '#fff' }}>
                  {r.map((c, ci) => <td key={ci} style={{ padding: pad, color: '#334155', borderBottom: '1px solid #f1f5f9' }}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    case 'stat': {
      const trend = s(el.props.trend, 'up')
      const tc = trend === 'down' ? '#ef4444' : trend === 'flat' ? '#64748b' : '#10b981'
      const Tr = resolveIcon(trend === 'down' ? 'TrendingDown' : trend === 'flat' ? 'Minus' : 'TrendingUp')
      return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, ...css }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            {s(el.props.icon) && <span style={{ width: 38, height: 38, borderRadius: 10, display: 'grid', placeItems: 'center', background: (s(el.props.iconColor, '#2563eb')) + '1a', color: s(el.props.iconColor, '#2563eb') }}><Ico name={s(el.props.icon, 'Activity')} size={20} color={s(el.props.iconColor, '#2563eb')} /></span>}
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{s(el.props.label, 'Indicateur')}</span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{s(el.props.value, '0')}</div>
          {s(el.props.delta) && <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, color: tc, fontSize: 13, fontWeight: 700 }}>{Tr && <Tr size={15} />}{s(el.props.delta)}{s(el.props.deltaLabel) && <span style={{ color: '#94a3b8', fontWeight: 500 }}> {s(el.props.deltaLabel)}</span>}</div>}
        </div>
      )
    }

    case 'steps': {
      const items = parsePairs(s(el.props.steps))
      const list = items.length ? items : [{ a: 'Étape 1', b: 'Description' }, { a: 'Étape 2', b: 'Description' }, { a: 'Étape 3', b: 'Description' }]
      const cur = n(el.props.current, 1)
      const accent = s(el.props.accent, '#2563eb')
      return (
        <div style={{ display: 'flex', gap: 0, ...css }}>
          {list.map((it, i) => {
            const done = i + 1 < cur, active = i + 1 === cur
            const c = done || active ? accent : '#cbd5e1'
            return (
              <div key={i} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                {i > 0 && <div style={{ position: 'absolute', top: 15, right: '50%', width: '100%', height: 2, background: i < cur ? accent : '#e2e8f0' }} />}
                <div style={{ position: 'relative', width: 32, height: 32, margin: '0 auto', borderRadius: 999, background: done ? accent : '#fff', border: `2px solid ${c}`, color: done ? '#fff' : c, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 14 }}>{done ? '✓' : i + 1}</div>
                <div style={{ marginTop: 8, fontWeight: 600, fontSize: 14, color: active ? '#0f172a' : '#64748b' }}>{it.a}</div>
                {it.b && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{it.b}</div>}
              </div>
            )
          })}
        </div>
      )
    }

    case 'timeline': {
      const items = parsePairs(s(el.props.items))
      const list = items.length ? items : [{ a: '2024 · Lancement', b: 'Première version publique.' }, { a: '2025 · Croissance', b: 'Dix mille utilisateurs.' }]
      const accent = s(el.props.accent, '#2563eb')
      return (
        <div style={{ ...css }}>
          {list.map((it, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, paddingBottom: i < list.length - 1 ? 22 : 0, position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ width: 14, height: 14, borderRadius: 999, background: accent, flexShrink: 0, marginTop: 3 }} />
                {i < list.length - 1 && <span style={{ flex: 1, width: 2, background: '#e2e8f0', marginTop: 4 }} />}
              </div>
              <div style={{ paddingBottom: 4 }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{it.a}</div>
                {it.b && <div style={{ color: '#64748b', fontSize: 14, marginTop: 2 }}>{it.b}</div>}
              </div>
            </div>
          ))}
        </div>
      )
    }

    case 'progressCircle': {
      const value = Math.max(0, Math.min(100, n(el.props.value, 70)))
      const size = n(el.props.size, 120), stroke = Math.max(6, size * 0.1)
      const r = (size - stroke) / 2, circ = 2 * Math.PI * r
      const color = s(el.props.color, '#2563eb')
      return (
        <div style={{ display: 'inline-grid', placeItems: 'center', position: 'relative', ...css }}>
          <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s(el.props.track, '#e2e8f0')} strokeWidth={stroke} />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ * (1 - value / 100)} style={{ transition: 'stroke-dashoffset .6s' }} />
          </svg>
          {el.props.showValue !== false && <div style={{ position: 'absolute', textAlign: 'center' }}>
            <div style={{ fontSize: size * 0.22, fontWeight: 800, color: '#0f172a' }}>{value}%</div>
            {s(el.props.label) && <div style={{ fontSize: 11, color: '#94a3b8' }}>{s(el.props.label)}</div>}
          </div>}
        </div>
      )
    }

    case 'badge': {
      const tone = BADGE_TONES[s(el.props.variant, 'primary')] ?? BADGE_TONES.primary
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: el.props.pill === false ? 6 : 999, background: tone.bg, color: tone.fg, fontSize: 13, fontWeight: 600, ...css }}>
        {s(el.props.icon) && <Ico name={s(el.props.icon)} size={14} color={tone.fg} />}{s(el.props.text, 'Badge')}
      </span>
    }

    case 'breadcrumb': {
      const items = arr<string>(el.props.items)
      const list = items.length ? items : ['Accueil', 'Catégorie', 'Page courante']
      const sep = s(el.props.separator, '/')
      return (
        <nav style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 14, ...css }}>
          {list.map((it, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: i === list.length - 1 ? '#0f172a' : '#64748b', fontWeight: i === list.length - 1 ? 600 : 400 }}>{it}</span>
              {i < list.length - 1 && <span style={{ color: '#cbd5e1' }}>{sep}</span>}
            </span>
          ))}
        </nav>
      )
    }

    default:
      return undefined
  }
}

export { parseRows, rowsToText }
