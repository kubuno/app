import { useEffect, useRef } from 'react'

/**
 * Ctrl/⌘ + wheel zooms a scrollable workspace, anchored at the cursor.
 *
 * Attached as a NATIVE non-passive listener: React registers `onWheel` as
 * passive at the root, so `preventDefault()` there cannot suppress the
 * browser's own page zoom — this hook can. Returns the ref to put on the
 * scroll container.
 */
export function useCtrlWheelZoom<T extends HTMLElement>(
  getZoom: () => number,
  setZoom: (z: number) => void,
  opts?: { min?: number; max?: number },
) {
  const ref = useRef<T | null>(null)
  // Always call the latest callbacks without re-attaching the listener.
  const fns = useRef({ getZoom, setZoom })
  fns.current = { getZoom, setZoom }
  const min = opts?.min ?? 0.25
  const max = opts?.max ?? 3

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const z = fns.current.getZoom()
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const nz = Math.min(max, Math.max(min, Math.round(z * factor * 100) / 100))
      if (nz === z) return
      // Keep the point under the cursor stable: content scales by nz/z.
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const k = nz / z
      const sl = (el.scrollLeft + cx) * k - cx
      const st = (el.scrollTop + cy) * k - cy
      fns.current.setZoom(nz)
      requestAnimationFrame(() => { el.scrollLeft = sl; el.scrollTop = st })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return ref
}
