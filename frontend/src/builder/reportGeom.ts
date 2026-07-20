// Pure geometry helpers for the report designer: smart guides (snapping),
// alignment, distribution and Shift constraints. Kept dependency-free so the
// logic can be unit-tested in isolation (mirrors the presentations editor).

export interface Box { x: number; y: number; width: number; height: number }

/** A magnetic guide line drawn while moving/resizing. `axis:'x'` is a vertical
 *  line at a constant x; `axis:'y'` is a horizontal line at a constant y.
 *  `start`/`end` are the span along the perpendicular axis. */
export interface Guide { axis: 'x' | 'y'; pos: number; start: number; end: number }

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const xEdges = (b: Box): number[] => [b.x, b.x + b.width / 2, b.x + b.width]
const yEdges = (b: Box): number[] => [b.y, b.y + b.height / 2, b.y + b.height]

/** Candidate snap coordinates on one axis: band edges/center + every sibling's
 *  leading/center/trailing edge. */
export function axisTargets(sibs: Box[], bandSize: number, axis: 'x' | 'y'): number[] {
  const t = [0, bandSize / 2, bandSize]
  for (const s of sibs) t.push(...(axis === 'x' ? xEdges(s) : yEdges(s)))
  return t
}

/** Nearest target for any of the moving edges, within threshold; smallest delta wins. */
function snapDelta(edges: number[], targets: number[], threshold: number): { delta: number; pos: number } | null {
  let best: { delta: number; pos: number } | null = null
  for (const e of edges) {
    for (const t of targets) {
      const d = t - e
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, pos: t }
    }
  }
  return best
}

/** Extent of a guide along the perpendicular axis: union of the moved box and
 *  every sibling that touches `pos` on `axis`. */
function guideFor(axis: 'x' | 'y', pos: number, moved: Box, sibs: Box[]): Guide {
  let lo = axis === 'x' ? moved.y : moved.x
  let hi = axis === 'x' ? moved.y + moved.height : moved.x + moved.width
  for (const s of sibs) {
    const edges = axis === 'x' ? xEdges(s) : yEdges(s)
    if (edges.some((e) => Math.abs(e - pos) < 0.5)) {
      if (axis === 'x') { lo = Math.min(lo, s.y); hi = Math.max(hi, s.y + s.height) }
      else { lo = Math.min(lo, s.x); hi = Math.max(hi, s.x + s.width) }
    }
  }
  return { axis, pos, start: lo, end: hi }
}

/** Snap a moving box against siblings + band edges. Returns the correction
 *  delta to apply and the guide lines to draw. */
export function snapMove(box: Box, sibs: Box[], bandW: number, bandH: number, threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const sx = snapDelta(xEdges(box), axisTargets(sibs, bandW, 'x'), threshold)
  const sy = snapDelta(yEdges(box), axisTargets(sibs, bandH, 'y'), threshold)
  const dx = sx?.delta ?? 0
  const dy = sy?.delta ?? 0
  const moved: Box = { ...box, x: box.x + dx, y: box.y + dy }
  const guides: Guide[] = []
  if (sx) guides.push(guideFor('x', sx.pos, moved, sibs))
  if (sy) guides.push(guideFor('y', sy.pos, moved, sibs))
  return { dx, dy, guides }
}

/** Which box edges move for a given resize handle. */
const movesLeft = (h: ResizeHandle) => h === 'w' || h === 'nw' || h === 'sw'
const movesRight = (h: ResizeHandle) => h === 'e' || h === 'ne' || h === 'se'
const movesTop = (h: ResizeHandle) => h === 'n' || h === 'ne' || h === 'nw'
const movesBottom = (h: ResizeHandle) => h === 's' || h === 'se' || h === 'sw'

/** Snap the edge(s) dragged by a resize handle. Returns the snapped box and guides. */
export function snapResize(box: Box, handle: ResizeHandle, sibs: Box[], bandW: number, bandH: number, threshold: number, minW: number, minH: number): { box: Box; guides: Guide[] } {
  const tx = axisTargets(sibs, bandW, 'x')
  const ty = axisTargets(sibs, bandH, 'y')
  let { x, y, width, height } = box
  const guides: Guide[] = []
  const right = x + width
  const bottom = y + height

  if (movesRight(handle)) {
    const s = snapDelta([right], tx, threshold)
    if (s) { width = Math.max(minW, s.pos - x); guides.push(guideFor('x', s.pos, { x, y, width, height }, sibs)) }
  } else if (movesLeft(handle)) {
    const s = snapDelta([x], tx, threshold)
    if (s && right - s.pos >= minW) { x = s.pos; width = right - s.pos; guides.push(guideFor('x', s.pos, { x, y, width, height }, sibs)) }
  }
  if (movesBottom(handle)) {
    const s = snapDelta([bottom], ty, threshold)
    if (s) { height = Math.max(minH, s.pos - y); guides.push(guideFor('y', s.pos, { x, y, width, height }, sibs)) }
  } else if (movesTop(handle)) {
    const s = snapDelta([y], ty, threshold)
    if (s && bottom - s.pos >= minH) { y = s.pos; height = bottom - s.pos; guides.push(guideFor('y', s.pos, { x, y, width, height }, sibs)) }
  }
  return { box: { x, y, width, height }, guides }
}

/** Union bounding box of several boxes. */
export function combinedBox(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const r = Math.max(...boxes.map((b) => b.x + b.width))
  const b = Math.max(...boxes.map((b) => b.y + b.height))
  return { x, y, width: r - x, height: b - y }
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'

/** New x/y for each box aligned to the group's common bounding box. */
export function alignBoxes(boxes: Box[], mode: AlignMode): { x: number; y: number }[] {
  const c = combinedBox(boxes)
  return boxes.map((b) => {
    switch (mode) {
      case 'left':    return { x: c.x, y: b.y }
      case 'hcenter': return { x: c.x + c.width / 2 - b.width / 2, y: b.y }
      case 'right':   return { x: c.x + c.width - b.width, y: b.y }
      case 'top':     return { x: b.x, y: c.y }
      case 'vcenter': return { x: b.x, y: c.y + c.height / 2 - b.height / 2 }
      case 'bottom':  return { x: b.x, y: c.y + c.height - b.height }
    }
  })
}

/** Evenly distribute the gaps between boxes along an axis (needs ≥3). */
export function distributeBoxes(boxes: Box[], axis: 'h' | 'v'): { x: number; y: number }[] {
  if (boxes.length < 3) return boxes.map((b) => ({ x: b.x, y: b.y }))
  const pos = (b: Box) => (axis === 'h' ? b.x : b.y)
  const size = (b: Box) => (axis === 'h' ? b.width : b.height)
  const order = boxes.map((b, i) => i).sort((a, b) => pos(boxes[a]) - pos(boxes[b]))
  const first = boxes[order[0]]
  const last = boxes[order[order.length - 1]]
  const span = pos(last) + size(last) - pos(first)
  const totalSize = order.reduce((sum, i) => sum + size(boxes[i]), 0)
  const gap = (span - totalSize) / (order.length - 1)
  const out = boxes.map((b) => ({ x: b.x, y: b.y }))
  let cursor = pos(first)
  for (const i of order) {
    if (axis === 'h') out[i] = { x: cursor, y: boxes[i].y }
    else out[i] = { x: boxes[i].x, y: cursor }
    cursor += size(boxes[i]) + gap
  }
  return out
}

/** Constrain a move to the dominant axis (Shift while moving). */
export function constrainAxis(dx: number, dy: number): { dx: number; dy: number } {
  return Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy }
}

/** Constrain a resize to the box's aspect ratio (Shift while resizing corners). */
export function constrainAspect(w: number, h: number, ratio: number): { width: number; height: number } {
  return w / h > ratio ? { width: w, height: w / ratio } : { width: h * ratio, height: h }
}
