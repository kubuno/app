// ─────────────────────────────────────────────────────────────────────────────
// Composants de chat LIÉS AUX DONNÉES (runtime). Contrairement aux widgets de
// présentation (rendu statique du builder), ceux-ci interrogent réellement le
// moteur de données (types partagés → multi-utilisateurs), rafraîchissent par
// POLLING (quasi temps réel) et identifient l'auteur réel via `_created_by`.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Element, RuntimeContext } from '../types'
import { asCss } from '../elements/style'
import { Avatar } from '../elements/widgets'
import { resolveIcon } from '../elements/icons'
import { searchRecords, createRecordCtx, type DataRecord } from '../binding'

const SendIcon = resolveIcon('Send')

const POLL_MS = 2500
const sp = (el: Element, k: string, fb = '') => { const v = el.props[k]; return v == null ? fb : String(v) }

/** Polling d'enregistrements (refetch périodique + sur changement des deps). */
function usePolledRecords(ctx: RuntimeContext, type: string, params: () => Parameters<typeof searchRecords>[2], deps: unknown[]): DataRecord[] {
  const [rows, setRows] = useState<DataRecord[]>([])
  const ctxRef = useRef(ctx); ctxRef.current = ctx
  const paramsRef = useRef(params); paramsRef.current = params
  useEffect(() => {
    let stop = false
    const load = async () => {
      try { const r = await searchRecords(ctxRef.current, type, paramsRef.current()); if (!stop) setRows(r.results) }
      catch { /* ignore */ }
    }
    load()
    const id = setInterval(load, POLL_MS)
    return () => { stop = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return rows
}

// ── Liste de conversations (tileList lié) ────────────────────────────────────

export function RunTileList({ el, ctx, setState, navigate, version }: {
  el: Element; ctx: RuntimeContext; setState: (k: string, v: unknown) => void; navigate: (p: string) => void; version: number
}) {
  const css = asCss(el.style)
  const type = sp(el, 'sourceType')
  const titleField = sp(el, 'titleField', 'titre')
  const subField = sp(el, 'subtitleField')
  const timeField = sp(el, 'timeField')
  const setKey = sp(el, 'setStateKey', 'conv')
  const target = sp(el, 'targetPage')
  const rows = usePolledRecords(ctx, type, () => ({ sort_field: '_created_at', sort_desc: true, limit: 200 }), [type, ctx.appId, version])
  const fmtTime = (v: unknown) => { if (!v) return ''; const d = new Date(String(v)); return isNaN(+d) ? String(v) : d.toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }
  return (
    <div style={{ background: sp(el, 'bg', '#fff'), ...css }}>
      {rows.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Aucune conversation pour l’instant.</div>}
      {rows.map((r) => {
        const title = String(r[titleField] ?? '—')
        return (
          <div key={r._id} onClick={() => { setState(setKey, r._id); if (target) navigate(target) }}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
            <Avatar name={title} size={48} status="online" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{title}</div>
              {subField && <div style={{ fontSize: 13, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(r[subField] ?? '')}</div>}
            </div>
            {timeField && <div style={{ fontSize: 11, color: '#94a3b8' }}>{fmtTime(r[timeField])}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ── Fil de messages (chatThread lié) ─────────────────────────────────────────

export function RunChatThread({ el, ctx, version }: { el: Element; ctx: RuntimeContext; version: number }) {
  const css = asCss(el.style)
  const type = sp(el, 'sourceType')
  const textField = sp(el, 'textField', 'texte')
  const timeField = sp(el, 'timeField', '_created_at')
  const convField = sp(el, 'convField', 'conv')
  const convKey = sp(el, 'convStateKey', 'conv')
  const convId = ctx.state[convKey] != null ? String(ctx.state[convKey]) : ''
  const me = ctx.currentUser?.id
  const rows = usePolledRecords(ctx, type,
    () => ({ constraints: convId ? [{ field: convField, op: 'equals', value: convId }] : [{ field: '_id', op: 'equals', value: '__none__' }], sort_field: '_created_at', sort_desc: false, limit: 500 }),
    [type, convId, version, ctx.appId])
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [rows.length])
  const fmtTime = (v: unknown) => { if (!v) return ''; const d = new Date(String(v)); return isNaN(+d) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 14, background: sp(el, 'bg', '#e5ddd5'), overflowY: 'auto', ...css }}>
      {!convId && <div style={{ margin: 'auto', color: '#64748b', fontSize: 14 }}>Choisissez une conversation.</div>}
      {convId && rows.length === 0 && <div style={{ margin: 'auto', color: '#64748b', fontSize: 13 }}>Aucun message — écrivez le premier !</div>}
      {rows.map((m) => {
        const out = me != null && String(m._created_by ?? '') === me
        const bubble: CSSProperties = { alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '78%', background: out ? '#dcf8c6' : '#fff', borderRadius: 10, padding: '7px 10px', boxShadow: '0 1px 1px rgba(0,0,0,.08)' }
        return (
          <div key={m._id} style={bubble}>
            <div style={{ fontSize: 14, color: '#0f172a', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{String(m[textField] ?? '')}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 2 }}>{fmtTime(m[timeField])}</div>
          </div>
        )
      })}
      <div ref={endRef} />
    </div>
  )
}

// ── Zone de saisie fonctionnelle (messageInput lié) ──────────────────────────

export function RunMessageInput({ el, ctx, refresh }: { el: Element; ctx: RuntimeContext; refresh: () => void }) {
  const css = asCss(el.style)
  const type = sp(el, 'dataType')
  const textField = sp(el, 'textField', 'texte')
  const convField = sp(el, 'convField', 'conv')
  const convKey = sp(el, 'convStateKey', 'conv')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const convId = ctx.state[convKey] != null ? String(ctx.state[convKey]) : ''
  const send = async () => {
    const t = text.trim()
    if (!t || !convId || sending) return
    setSending(true)
    try { await createRecordCtx(ctx, type, { [textField]: t, [convField]: convId }); setText(''); refresh() }
    catch { /* ignore */ } finally { setSending(false) }
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: sp(el, 'bg', '#f0f2f5'), ...css }}>
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }}
        placeholder={sp(el, 'placeholder', 'Message')} disabled={!convId}
        style={{ flex: 1, background: '#fff', borderRadius: 999, padding: '9px 14px', border: 'none', outline: 'none', fontSize: 14 }} />
      <button type="button" onClick={send} disabled={!text.trim() || !convId || sending}
        style={{ width: 38, height: 38, borderRadius: 999, background: sp(el, 'accent', '#25d366'), border: 'none', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0, opacity: !text.trim() || !convId ? 0.5 : 1 }}><SendIcon size={18} color="#fff" /></button>
    </div>
  )
}
