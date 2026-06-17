import { Input, Dropdown } from '@ui'
import type { Dyn } from '../types'
import { isDyn } from '../binding'

export interface DynInputs { id: string; name: string }
export interface DynDataType { name: string; fields: { name: string }[] }

/** Éditeur d'expression dynamique (liaison de données façon Bubble). Permet de
 *  brancher une propriété sur une valeur fixe, une saisie, une cellule, l'état,
 *  l'utilisateur connecté ou une recherche de données. Bâti sur les primitives
 *  @ui du core (Input / Dropdown). */
export default function DynEditor({
  value, onChange, inputs, dataTypes, allowSearch,
}: {
  value: unknown
  onChange: (v: Dyn) => void
  inputs: DynInputs[]
  dataTypes: DynDataType[]
  allowSearch?: boolean
}) {
  const d: Dyn = isDyn(value) ? value : { t: 'static', v: value ?? '' }

  const kinds = [
    { value: 'static', label: 'Valeur fixe' },
    { value: 'input', label: "Saisie d'un champ" },
    { value: 'cell', label: 'Champ de la cellule' },
    { value: 'state', label: "Variable d'état" },
    { value: 'currentUser', label: 'Utilisateur connecté' },
    ...(allowSearch ? [{ value: 'search', label: 'Recherche de données' }] : []),
  ]

  const setKind = (k: string) => {
    switch (k) {
      case 'static': onChange({ t: 'static', v: '' }); break
      case 'input': onChange({ t: 'input', elementId: inputs[0]?.id ?? '' }); break
      case 'cell': onChange({ t: 'cell', field: '' }); break
      case 'state': onChange({ t: 'state', key: '' }); break
      case 'currentUser': onChange({ t: 'currentUser', field: 'email' }); break
      case 'search': onChange({ t: 'search', dataType: dataTypes[0]?.name ?? '', count: true }); break
    }
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <Dropdown value={d.t} onChange={setKind} options={kinds} width="100%" />
      <div className="mt-2">
        {d.t === 'static' && <Input value={String(d.v ?? '')} placeholder="Valeur…" onChange={(e) => onChange({ t: 'static', v: e.target.value })} />}
        {d.t === 'input' && (
          <Dropdown value={d.elementId} width="100%" onChange={(v) => onChange({ t: 'input', elementId: v })}
            options={inputs.length ? inputs.map((i) => ({ value: i.id, label: i.name })) : [{ value: '', label: '(aucun champ)' }]} />
        )}
        {d.t === 'cell' && <Input value={d.field} placeholder="nom du champ (ex: titre)" onChange={(e) => onChange({ t: 'cell', field: e.target.value })} />}
        {d.t === 'state' && <Input value={d.key} placeholder="nom de la variable" onChange={(e) => onChange({ t: 'state', key: e.target.value })} />}
        {d.t === 'currentUser' && (
          <Dropdown value={d.field ?? 'email'} width="100%" onChange={(v) => onChange({ t: 'currentUser', field: v })}
            options={[{ value: 'email', label: 'Email' }, { value: 'id', label: 'Identifiant' }]} />
        )}
        {d.t === 'search' && (
          <div className="space-y-1.5">
            <Dropdown value={d.dataType} width="100%" onChange={(v) => onChange({ ...d, dataType: v })}
              options={dataTypes.length ? dataTypes.map((t) => ({ value: t.name, label: t.name })) : [{ value: '', label: '(aucun type)' }]} />
            <Dropdown value={d.count ? 'count' : d.first ? 'first' : 'list'} width="100%"
              onChange={(v) => onChange({ ...d, count: v === 'count', first: v === 'first' })}
              options={[{ value: 'count', label: 'Nombre' }, { value: 'first', label: 'Premier' }, { value: 'list', label: 'Liste' }]} />
          </div>
        )}
      </div>
    </div>
  )
}
