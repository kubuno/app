import { Minus, Plus } from 'lucide-react'
import { RangeSlider } from '@ui'
import { useBuilder, currentPage } from '../store'
import type { Element } from '../types'

// Status bar (bottom of WorkspaceShell): element count + workspace ZOOM control
// (− / slider / + / %), styled like the Documents sub-module (office).

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
      <RangeSlider
        min={50} max={200} step={10}
        value={Math.min(200, Math.max(50, pct))}
        onChange={(v) => setZoom(v / 100)}
        aria-label="Zoom"
        className="mx-0.5 w-24"
      />
      <button type="button" onClick={() => setZoom(zoom + 0.1)} title="Zoom avant" className={btn}><Plus size={13} /></button>
      <button type="button" onClick={() => setZoom(1)} title="Rétablir à 100 %" className={`${btn} w-12 tabular-nums`}>{pct} %</button>
    </div>
  )
}
