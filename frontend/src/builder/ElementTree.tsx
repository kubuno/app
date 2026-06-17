import { ChevronUp, ChevronDown, Trash2, Square } from 'lucide-react'
import type { Element } from '../types'
import { useBuilder, currentPage, isContainerType } from '../store'
import { paletteItem } from '../elements/palette'
import { DRAG_MIME } from './Canvas'

/** Arborescence des éléments de la page (sélection, réordonnancement, reparent
 *  par glisser-déposer, suppression). */
export default function ElementTree() {
  const page = useBuilder(currentPage)
  if (!page) return null
  return (
    <div className="p-2 text-sm">
      <Node el={page.root} depth={0} />
    </div>
  )
}

function Node({ el, depth }: { el: Element; depth: number }) {
  const selectedId = useBuilder((s) => s.selectedId)
  const select = useBuilder((s) => s.select)
  const moveElement = useBuilder((s) => s.moveElement)
  const deleteElement = useBuilder((s) => s.deleteElement)
  const reparent = useBuilder((s) => s.reparent)
  const selected = selectedId === el.id
  const isRoot = el.type === 'page'
  const item = paletteItem(el.type)
  const Ico = item?.Icon ?? Square

  return (
    <div>
      <div
        draggable={!isRoot}
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-app-move', el.id)
          e.stopPropagation()
        }}
        onDragOver={(e) => {
          if (isContainerType(el.type) && (e.dataTransfer.types.includes('application/x-app-move') || e.dataTransfer.types.includes(DRAG_MIME))) {
            e.preventDefault()
          }
        }}
        onDrop={(e) => {
          const moveId = e.dataTransfer.getData('application/x-app-move')
          if (moveId && isContainerType(el.type)) {
            e.preventDefault()
            e.stopPropagation()
            reparent(moveId, el.id)
          }
        }}
        onClick={(e) => { e.stopPropagation(); select(el.id) }}
        className={`group flex items-center gap-1.5 rounded px-1.5 py-1 ${selected ? 'bg-blue-100 text-blue-800' : 'hover:bg-slate-100 text-slate-700'}`}
        style={{ paddingLeft: depth * 12 + 6 }}
      >
        {Ico ? <Ico size={13} className="shrink-0 opacity-70" /> : null}
        <span className="flex-1 truncate">{el.name}</span>
        {!isRoot && (
          <span className="hidden items-center gap-0.5 group-hover:flex">
            <button type="button" className="rounded p-0.5 hover:bg-slate-200" onClick={(e) => { e.stopPropagation(); moveElement(el.id, -1) }} title="Monter"><ChevronUp size={12} /></button>
            <button type="button" className="rounded p-0.5 hover:bg-slate-200" onClick={(e) => { e.stopPropagation(); moveElement(el.id, 1) }} title="Descendre"><ChevronDown size={12} /></button>
            <button type="button" className="rounded p-0.5 text-red-500 hover:bg-red-100" onClick={(e) => { e.stopPropagation(); deleteElement(el.id) }} title="Supprimer"><Trash2 size={12} /></button>
          </span>
        )}
      </div>
      {(el.children ?? []).map((c) => <Node key={c.id} el={c} depth={depth + 1} />)}
    </div>
  )
}
