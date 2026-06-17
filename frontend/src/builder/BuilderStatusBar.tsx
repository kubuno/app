import { Minus, Plus } from 'lucide-react'
import { useBuilder, currentPage } from '../store'
import type { Element } from '../types'

// Barre de statut (bas du WorkspaceShell) : nombre d'éléments + contrôle de ZOOM
// de l'espace de travail (− / slider / + / %), façon sous-module Documents (office).

function countEls(el: Element): number {
  return 1 + (el.children ?? []).reduce((n, c) => n + countEls(c), 0)
}

export default function BuilderStatusBar() {
  const zoom = useBuilder((s) => s.canvasZoom)
  const setZoom = useBuilder((s) => s.setCanvasZoom)
  const page = useBuilder(currentPage)
  const pct = Math.round(zoom * 100)
  const count = page ? Math.max(0, countEls(page.root) - 1) : 0

  const btn = 'flex items-center justify-center px-1.5 rounded hover:bg-black/5'
  return (
    <div className="flex w-full items-center gap-0.5">
      <span className="px-2 tabular-nums">{count} élément{count > 1 ? 's' : ''}</span>
      <div className="flex-1" />
      <button type="button" onClick={() => setZoom(zoom - 0.1)} title="Zoom arrière" className={btn}><Minus size={13} /></button>
      <input
        type="range" min={50} max={200} step={10}
        value={Math.min(200, Math.max(50, pct))}
        onChange={(e) => setZoom(Number(e.target.value) / 100)}
        title={`${pct} %`}
        className="mx-0.5 h-1 w-24 cursor-pointer"
        style={{ accentColor: 'var(--color-primary, #1a73e8)' }}
      />
      <button type="button" onClick={() => setZoom(zoom + 0.1)} title="Zoom avant" className={btn}><Plus size={13} /></button>
      <button type="button" onClick={() => setZoom(1)} title="Rétablir à 100 %" className={`${btn} w-12 tabular-nums`}>{pct} %</button>
    </div>
  )
}
