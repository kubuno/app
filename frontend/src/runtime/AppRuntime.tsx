import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getIcon } from '@kubuno/sdk'
import type { AppDefinition, Dyn, Element, Page, RuntimeContext, Workflow } from '../types'
import { resolveDyn, resolveText, resolveVisible } from '../binding'
import { appApi, type DataRecord } from '../api'
import { elementCss, asCss } from '../elements/style'
import { renderWidget } from '../elements/widgets'
import { runActions, type ActionEnv } from './actions'

interface Toast { id: number; msg: string }

/** Runtime : interprète la définition d'une app et l'exécute « pour de vrai »
 *  (saisies, état, recherches de données et workflows). */
export default function AppRuntime({
  def: rawDef, appId, currentUser, initialPageId, publicSlug,
}: {
  def: AppDefinition
  appId: string
  currentUser?: { id: string; email: string }
  initialPageId?: string
  /** Si défini → app PUBLIÉE consultée par un visiteur anonyme (données via le slug). */
  publicSlug?: string
}) {
  // Normalise la définition : une app ancienne ou partielle (champ absent) ne doit
  // jamais faire planter le rendu (notamment la vue publique d'un visiteur anonyme).
  const def: AppDefinition = useMemo(() => ({
    ...rawDef,
    pages: rawDef.pages ?? [],
    workflows: rawDef.workflows ?? [],
    dataTypes: rawDef.dataTypes ?? [],
    theme: rawDef.theme ?? ({} as AppDefinition['theme']),
    settings: rawDef.settings ?? ({} as AppDefinition['settings']),
  }), [rawDef])

  // Segment d'URL pour le moteur de données : public (slug) ou authentifié (id).
  const dataScope = publicSlug ? `public/apps/${publicSlug}` : `apps/${appId}`
  const startId = initialPageId
    ?? def.pages.find((p) => p.route === def.settings.startPage)?.id
    ?? def.pages[0]?.id
  const [pageId, setPageId] = useState(startId)
  const [inputs, setInputs] = useState<Record<string, unknown>>({})
  const [pstate, setPstate] = useState<Record<string, unknown>>({})
  const [version, setVersion] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastSeq = useRef(0)

  const page = def.pages.find((p) => p.id === pageId) ?? def.pages[0]

  const ctxBase: Omit<RuntimeContext, 'cell'> = useMemo(
    () => ({ appId, dataScope, inputs, state: pstate, currentUser }),
    [appId, dataScope, inputs, pstate, currentUser],
  )

  const alert = useCallback((msg: string) => {
    const id = ++toastSeq.current
    setToasts((t) => [...t, { id, msg }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  const navigate = useCallback((pid: string) => { setPageId(pid); setInputs({}) }, [])
  const resetInputs = useCallback(() => setInputs({}), [])
  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  const setStateVar = useCallback((k: string, v: unknown) => setPstate((s) => ({ ...s, [k]: v })), [])

  const makeEnv = useCallback((cell?: Record<string, unknown>): ActionEnv => ({
    appId,
    ctx: { ...ctxBase, cell },
    setState: setStateVar, navigate, resetInputs, refresh, alert,
  }), [appId, ctxBase, setStateVar, navigate, resetInputs, refresh, alert])

  // Workflows « au chargement de page ».
  useEffect(() => {
    const wfs = def.workflows.filter((w) => w.event.type === 'pageLoad' && w.event.pageId === pageId)
    if (wfs.length) wfs.forEach((w) => runActions(w.actions, makeEnv()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId])

  if (!page) return <div className="p-8 text-slate-400">Aucune page.</div>

  return (
    <div className="relative h-full overflow-auto" style={{ background: def.theme.background, fontFamily: def.theme.font }}>
      <RunNode
        el={page.root}
        def={def}
        ctxBase={ctxBase}
        cell={undefined}
        version={version}
        setInput={(id, v) => setInputs((s) => ({ ...s, [id]: v }))}
        makeEnv={makeEnv}
        navigate={navigate}
      />
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{t.msg}</div>
        ))}
      </div>
    </div>
  )
}

interface NodeProps {
  el: Element
  def: AppDefinition
  ctxBase: Omit<RuntimeContext, 'cell'>
  cell?: Record<string, unknown>
  version: number
  setInput: (id: string, v: unknown) => void
  makeEnv: (cell?: Record<string, unknown>) => ActionEnv
  navigate: (pageId: string) => void
}

function RunNode(props: NodeProps) {
  const { el, def, ctxBase, cell, version, setInput, makeEnv, navigate } = props
  const ctx: RuntimeContext = { ...ctxBase, cell }
  const visible = useVisibility(el.visibleWhen, ctx, version)
  if (!visible) return null

  const css = asCss(el.style)
  const workflowsFor = (type: 'click' | 'inputChange') =>
    def.workflows.filter((w) => w.event.type === type && w.event.elementId === el.id)

  const childrenNodes = (el.children ?? []).map((c) => <RunNode key={c.id} {...props} el={c} />)

  // Widgets riches (façon Elementor) : rendu partagé builder/runtime, interactif.
  const custom = renderWidget(el, true)
  if (custom !== undefined) return custom

  switch (el.type) {
    case 'page':
    case 'container':
      return <div style={elementCss(el)}>{childrenNodes}</div>

    case 'link':
      return (
        <div style={{ ...elementCss(el), cursor: 'pointer' }}
          onClick={() => { const pid = el.props.targetPage as string; if (pid) navigate(pid) }}>
          {childrenNodes}
        </div>
      )

    case 'repeatingGroup':
      return <RepeatingGroup {...props} />

    case 'heading': {
      const level = (el.props.level as string) || 'h2'
      const Tag = (['h1', 'h2', 'h3'].includes(level) ? level : 'h2') as 'h1' | 'h2' | 'h3'
      return <Tag style={css}><DynText value={el.props.text} ctx={ctx} version={version} /></Tag>
    }
    case 'text':
      return <div style={css}><DynText value={el.props.text} ctx={ctx} version={version} /></div>

    case 'button':
      return (
        <button type="button" style={css}
          onClick={() => { const wfs = workflowsFor('click'); wfs.forEach((w) => runActions(w.actions, makeEnv(cell))) }}>
          <DynText value={el.props.label} ctx={ctx} version={version} />
        </button>
      )

    case 'input':
      return (
        <RunTextInput style={css} type={(el.props.inputType as string) || 'text'}
          placeholderExpr={el.props.placeholder} ctx={ctx} version={version}
          value={String(ctxBase.inputs[el.id] ?? '')}
          onChange={(v) => { setInput(el.id, v); workflowsFor('inputChange').forEach((w) => runActions(w.actions, makeEnv(cell))) }} />
      )
    case 'textarea':
      return (
        <RunTextArea style={css} placeholderExpr={el.props.placeholder} ctx={ctx} version={version}
          value={String(ctxBase.inputs[el.id] ?? '')}
          onChange={(v) => setInput(el.id, v)} />
      )
    case 'select':
      return (
        <select style={css} value={String(ctxBase.inputs[el.id] ?? '')}
          onChange={(e) => { setInput(el.id, e.target.value); workflowsFor('inputChange').forEach((w) => runActions(w.actions, makeEnv(cell))) }}>
          <option value="">—</option>
          {((el.props.options as string[]) || []).map((o, i) => <option key={i} value={o}>{o}</option>)}
        </select>
      )
    case 'checkbox':
      return (
        <label style={css}>
          <input type="checkbox" checked={Boolean(ctxBase.inputs[el.id])}
            onChange={(e) => setInput(el.id, e.target.checked)} />
          <DynText value={el.props.label} ctx={ctx} version={version} />
        </label>
      )
    case 'image':
      return <DynImage value={el.props.src} alt={(el.props.alt as string) || ''} style={css} ctx={ctx} version={version} />
    case 'divider':
      return <div style={css} />
    case 'icon': {
      const Ico = getIcon((el.props.icon as string) || 'Star')
      return <span style={css}>{Ico ? <Ico size={(el.style.fontSize as number) || 24} /> : null}</span>
    }
    default:
      return null
  }
}

// ── Repeating group : boucle sur des enregistrements réels ───────────────────

function RepeatingGroup(props: NodeProps) {
  const { el, ctxBase, cell, version } = props
  const ctx: RuntimeContext = { ...ctxBase, cell }
  const [rows, setRows] = useState<DataRecord[]>([])
  const source = el.props.source as Extract<Dyn, { t: 'search' }> | undefined
  const depKey = JSON.stringify({ i: ctxBase.inputs, s: ctxBase.state, v: version })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!source?.dataType) { setRows([]); return }
      try {
        const v = await resolveDyn({ ...source, count: false, first: false }, ctx)
        if (!cancelled) setRows(Array.isArray(v) ? (v as DataRecord[]) : [])
      } catch { if (!cancelled) setRows([]) }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, source?.dataType])

  return (
    <div style={elementCss(el)}>
      {rows.length === 0 && <div className="text-sm text-slate-400">Aucune donnée.</div>}
      {rows.map((row) => (
        <div key={row._id} style={{ display: 'contents' }}>
          {(el.children ?? []).map((c) => <RunNode key={`${row._id}-${c.id}`} {...props} el={c} cell={row} />)}
        </div>
      ))}
    </div>
  )
}

// ── Helpers de résolution asynchrone ─────────────────────────────────────────

function useVisibility(dyn: Element['visibleWhen'], ctx: RuntimeContext, version: number): boolean {
  const [vis, setVis] = useState(true)
  const depKey = JSON.stringify({ i: ctx.inputs, s: ctx.state, c: ctx.cell, version })
  useEffect(() => {
    let cancelled = false
    resolveVisible(dyn, ctx).then((v) => { if (!cancelled) setVis(v) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey])
  return vis
}

function DynText({ value, ctx, version }: { value: unknown; ctx: RuntimeContext; version: number }) {
  const [txt, setTxt] = useState('')
  const depKey = JSON.stringify({ i: ctx.inputs, s: ctx.state, c: ctx.cell, version })
  useEffect(() => {
    let cancelled = false
    resolveText(value, ctx).then((t) => { if (!cancelled) setTxt(t) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey])
  return <>{txt}</>
}

function usePlaceholder(value: unknown, ctx: RuntimeContext, version: number): string {
  const [txt, setTxt] = useState('')
  const depKey = JSON.stringify({ i: ctx.inputs, s: ctx.state, c: ctx.cell, version })
  useEffect(() => {
    let cancelled = false
    resolveText(value, ctx).then((t) => { if (!cancelled) setTxt(t) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey])
  return txt
}

function RunTextInput({ style, type, placeholderExpr, ctx, version, value, onChange }: {
  style: React.CSSProperties; type: string; placeholderExpr: unknown; ctx: RuntimeContext; version: number; value: string; onChange: (v: string) => void
}) {
  const placeholder = usePlaceholder(placeholderExpr, ctx, version)
  return <input style={style} type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
}

function RunTextArea({ style, placeholderExpr, ctx, version, value, onChange }: {
  style: React.CSSProperties; placeholderExpr: unknown; ctx: RuntimeContext; version: number; value: string; onChange: (v: string) => void
}) {
  const placeholder = usePlaceholder(placeholderExpr, ctx, version)
  return <textarea style={style} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
}

function DynImage({ value, alt, style, ctx, version }: { value: unknown; alt: string; style: React.CSSProperties; ctx: RuntimeContext; version: number }) {
  const [src, setSrc] = useState('')
  const depKey = JSON.stringify({ i: ctx.inputs, s: ctx.state, c: ctx.cell, version })
  useEffect(() => {
    let cancelled = false
    resolveText(value, ctx).then((t) => { if (!cancelled) setSrc(t) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey])
  return src ? <img src={src} alt={alt} style={style} /> : <div style={{ ...style, display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 12 }}>Image</div>
}

export type { Page, Workflow }
