// Real-time collaboration for the app builder, on top of the core's generic Yjs
// relay (`/collab/:room/sync`) — same mechanism the office sub-modules use.
//
// The whole AppDefinition is stored as a single value in a Y.Map ('app' → 'def').
// Sync is therefore whole-document "last writer wins" (no per-element CRDT merge):
// enough for a small team building together, with live updates + presence +
// offline persistence (IndexedDB) + durable storage (core PostgreSQL snapshots).
import { useEffect, useMemo, useRef } from 'react'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { useAuthStore } from '@kubuno/sdk'
import { useCollab } from './collabProvider'
import { usePresenceUsers, userColor, type PresenceUser } from './presence'
import { useBuilder } from '../store'
import type { AppDefinition } from '../types'

export function useAppCollab(appId: string | null): {
  presenceUsers: PresenceUser[]
  awareness: Awareness
} {
  const user = useAuthStore((s) => s.user)
  // One Y.Doc / Awareness per opened app.
  const ydoc = useMemo(() => new Y.Doc(), [appId])
  const awareness = useMemo(() => new Awareness(ydoc), [ydoc])
  // True while applying a remote update → blocks the store→Yjs echo.
  const applyingRemote = useRef(false)
  // True once the initial sync resolved → local edits start propagating.
  const synced = useRef(false)

  // Publish our identity (name/color/avatar) to awareness → presence avatars.
  useEffect(() => {
    if (!user) return
    awareness.setLocalStateField('user', {
      id: user.id,
      name: user.display_name || user.username || user.email,
      color: userColor(user.id),
      avatar: user.avatar_url,
    })
  }, [awareness, user])

  useEffect(() => () => awareness.destroy(), [awareness])

  // Publish the locally selected element (+ its page) → lets collaborators see the
  // object each user is manipulating. Re-published on every selection/page change.
  useEffect(() => {
    const push = () => {
      const s = useBuilder.getState()
      awareness.setLocalStateField('sel', s.selectedId ? { id: s.selectedId, page: s.currentPageId } : null)
    }
    push()
    return useBuilder.subscribe((s, prev) => {
      if (s.selectedId !== prev.selectedId || s.currentPageId !== prev.currentPageId) push()
    })
  }, [awareness])

  // Bind the Yjs doc <-> the Zustand store.
  useEffect(() => {
    if (!appId) return
    synced.current = false
    const ymap = ydoc.getMap<AppDefinition>('app')

    const adopt = (def: AppDefinition) => {
      applyingRemote.current = true
      try { useBuilder.getState().applyRemote(def) } finally { applyingRemote.current = false }
    }

    // Remote update (server or IndexedDB hydration) → store.
    const observer = (_e: Y.YMapEvent<AppDefinition>, txn: Y.Transaction) => {
      if (txn.origin === 'local') return // our own write
      const def = ymap.get('def')
      if (def) adopt(def)
    }
    ymap.observe(observer)

    // Local edit → Yjs (once synced, and not while adopting a remote update).
    const unsub = useBuilder.subscribe((s, prev) => {
      if (!synced.current || applyingRemote.current) return
      if (s.def && s.def !== prev.def) {
        ydoc.transact(() => ymap.set('def', s.def as AppDefinition), 'local')
      }
    })

    return () => { ymap.unobserve(observer); unsub() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, ydoc])

  // Connect to the core relay (room = `app:<appId>`). On first sync, seed the room
  // from our REST-loaded definition (new room) or adopt the collaborative one.
  useCollab(`app:${appId ?? ''}`, ydoc, !!appId, {
    awareness,
    onSync: (empty) => {
      const ymap = ydoc.getMap<AppDefinition>('app')
      const localDef = useBuilder.getState().def
      const remoteDef = ymap.get('def')
      if (empty && localDef && !remoteDef) {
        ydoc.transact(() => ymap.set('def', localDef), 'local')
      } else if (remoteDef) {
        applyingRemote.current = true
        try { useBuilder.getState().applyRemote(remoteDef) } finally { applyingRemote.current = false }
      }
      synced.current = true
    },
  })

  return { presenceUsers: usePresenceUsers(awareness, awareness.clientID), awareness }
}
