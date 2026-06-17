import type { ElementType } from '../types'
import { useBuilder, currentPage, findEl, isContainerType } from '../store'
import { PALETTE, CATEGORIES } from '../elements/palette'
import { DRAG_MIME } from './Canvas'

/** Palette d'éléments insérables (glisser sur le canvas, ou cliquer pour ajouter
 *  au conteneur sélectionné). */
export default function Palette() {
  const addElement = useBuilder((s) => s.addElement)
  const selectedId = useBuilder((s) => s.selectedId)
  const page = useBuilder(currentPage)

  // Cible d'insertion au clic : conteneur sélectionné, sinon racine de page.
  const insertTarget = (): string | null => {
    if (!page) return null
    if (selectedId) {
      const f = findEl(page.root, selectedId)
      if (f && isContainerType(f.el.type)) return f.el.id
      if (f?.parent) return f.parent.id
    }
    return page.root.id
  }

  const onAdd = (type: ElementType) => {
    const target = insertTarget()
    if (target) addElement(type, target)
  }

  return (
    <div className="space-y-4 p-3">
      {CATEGORIES.map((cat) => (
        <div key={cat.id}>
          <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{cat.label}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {PALETTE.filter((p) => p.category === cat.id).map((item) => {
              const Ico = item.Icon
              return (
                <button
                  key={item.type}
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, item.type)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => onAdd(item.type)}
                  className="flex cursor-grab flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2.5 text-[11px] text-slate-600 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 active:cursor-grabbing"
                  title={`Ajouter : ${item.label}`}
                >
                  <Ico size={18} />
                  <span className="text-center leading-tight">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
