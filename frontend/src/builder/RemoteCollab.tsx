// Overlay rendering remote collaborators inside the canvas page frame:
//  - their mouse cursors (RemoteCursors, shared "content" coordinates),
//  - the element each of them currently has selected / is manipulating.
// Coordinates are expressed in unzoomed page-content pixels (relative to the frame),
// so they map identically across clients regardless of zoom / scroll / window size.
import { useEffect, useReducer, type RefObject } from 'react'
import type { Awareness } from 'y-protocols/awareness'
import { RemoteCursors, type PresenceUser } from '../collab/presence'

interface SelState { id: string; page: string }
interface CursorState { x: number; y: number; page?: string }

export function RemoteCollab({ awareness, pageId, zoom, frameRef }: {
  awareness: Awareness
  pageId: string
  zoom: number
  frameRef: RefObject<HTMLDivElement | null>
}) {
  // Re-render on every awareness change (cursor moves, selection changes, joins/leaves).
  const [, force] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    awareness.on('change', force)
    return () => awareness.off('change', force)
  }, [awareness])

  const z = zoom || 1
  const frame = frameRef.current

  // Remote selections → measured boxes in frame-local unzoomed px.
  const sels: { color: string; name: string; box: { left: number; top: number; width: number; height: number } }[] = []
  if (frame) {
    const fr = frame.getBoundingClientRect()
    awareness.getStates().forEach((state, clientId) => {
      if (clientId === awareness.clientID) return
      const s = state as { user?: PresenceUser; sel?: SelState | null }
      if (!s.user || !s.sel || s.sel.page !== pageId) return
      const node = frame.querySelector(`[data-el-id="${s.sel.id}"]`) as HTMLElement | null
      if (!node) return
      const nr = node.getBoundingClientRect()
      sels.push({
        color: s.user.color,
        name: s.user.name,
        box: { left: (nr.left - fr.left) / z, top: (nr.top - fr.top) / z, width: nr.width / z, height: nr.height / z },
      })
    })
  }

  return (
    <>
      {sels.map((s, i) => (
        <div key={i} className="pointer-events-none absolute z-20"
             style={{ left: s.box.left, top: s.box.top, width: s.box.width, height: s.box.height,
                      boxShadow: `0 0 0 2px ${s.color}`, borderRadius: 4 }}>
          <div className="absolute left-0 top-0 rounded-br rounded-tl px-1 text-[10px] font-medium leading-tight text-white whitespace-nowrap"
               style={{ background: s.color }}>
            {s.name}
          </div>
        </div>
      ))}
      <RemoteCursors awareness={awareness} selfClientId={awareness.clientID} field="cursor"
        toScreen={(c) => {
          const cc = c as unknown as CursorState
          return cc.page === pageId ? { left: cc.x, top: cc.y } : null
        }} />
    </>
  )
}
