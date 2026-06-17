import { useMemo } from 'react'
import { Input, Textarea, Dropdown, Checkbox, ColorField } from '@ui'
import type { ConstraintOp, Dyn, Element, ElementStyle } from '../types'
import { useBuilder, currentPage, findEl, isContainerType } from '../store'
import DynEditor, { type DynInputs } from './DynEditor'
import WidgetInspector from './WidgetInspector'

// ── Petits champs réutilisables (primitives @ui du core) ─────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-2 block">
      <span className="mb-1 block text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}

function Text({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return <Dropdown value={value} onChange={onChange} options={options} width="100%" />
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-100 px-3 py-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      {children}
    </div>
  )
}

// ── Éditeur de style ─────────────────────────────────────────────────────────

const STYLE_FIELDS: { key: keyof ElementStyle | string; label: string }[] = [
  { key: 'width', label: 'Largeur' },
  { key: 'height', label: 'Hauteur' },
  { key: 'padding', label: 'Marge int.' },
  { key: 'margin', label: 'Marge ext.' },
  { key: 'background', label: 'Fond' },
  { key: 'color', label: 'Couleur texte' },
  { key: 'fontSize', label: 'Taille police' },
  { key: 'fontWeight', label: 'Graisse' },
  { key: 'textAlign', label: 'Alignement' },
  { key: 'borderRadius', label: 'Arrondi' },
  { key: 'border', label: 'Bordure' },
  { key: 'boxShadow', label: 'Ombre' },
]

function StyleEditor({ el }: { el: Element }) {
  const updateElement = useBuilder((s) => s.updateElement)
  const set = (k: string, v: string) => {
    const style = { ...el.style }
    if (v === '') delete style[k]
    else style[k] = v
    updateElement(el.id, { style })
  }
  const isColor = (k: string) => ['background', 'color'].includes(k)
  return (
    <div className="grid grid-cols-2 gap-2">
      {STYLE_FIELDS.map((f) => {
        const key = String(f.key)
        const val = String(el.style[key] ?? '')
        return (
          <label key={key} className="block">
            <span className="mb-0.5 block text-[10px] text-slate-400">{f.label}</span>
            {isColor(key) ? (
              <ColorField color={toHex(val)} onChange={(hex) => set(key, hex)} />
            ) : (
              <Input value={val} onChange={(e) => set(key, e.target.value)} />
            )}
          </label>
        )
      })}
    </div>
  )
}

function toHex(v: string): string {
  return /^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff'
}

// ── Inspecteur principal ─────────────────────────────────────────────────────

export default function Inspector() {
  const def = useBuilder((s) => s.def)
  const page = useBuilder(currentPage)
  const selectedId = useBuilder((s) => s.selectedId)
  const updateElement = useBuilder((s) => s.updateElement)
  const setLeftTab = useBuilder((s) => s.setLeftTab)

  const found = useMemo(() => (page && selectedId ? findEl(page.root, selectedId) : null), [page, selectedId])

  const inputs: DynInputs[] = useMemo(() => {
    const acc: DynInputs[] = []
    const walk = (e: Element) => {
      if (['input', 'textarea', 'select', 'checkbox'].includes(e.type)) acc.push({ id: e.id, name: e.name })
      ;(e.children ?? []).forEach(walk)
    }
    if (page) walk(page.root)
    return acc
  }, [page])

  if (!def) return null
  if (!found) {
    return <div className="p-4 text-sm text-slate-400">Sélectionnez un élément sur le canvas pour le configurer.</div>
  }
  const el = found.el
  const dataTypes = def.dataTypes
  const setProp = (k: string, v: unknown) => updateElement(el.id, { props: { ...el.props, [k]: v } })

  // Workflows déclenchés par cet élément (clic).
  const clickWorkflows = def.workflows.filter((w) => w.event.type === 'click' && w.event.elementId === el.id)

  return (
    <div className="text-sm">
      <Section title="Élément">
        <Row label="Nom"><Text value={el.name} onChange={(v) => updateElement(el.id, { name: v })} /></Row>
        <div className="text-[11px] text-slate-400">Type : {el.type} · id : <code className="text-slate-500">{el.id}</code></div>
      </Section>

      {/* Contenu / propriétés spécifiques au type */}
      <Section title="Contenu">
        {el.type === 'heading' && (
          <>
            <Row label="Texte"><DynEditor value={el.props.text} onChange={(v) => setProp('text', v)} inputs={inputs} dataTypes={dataTypes} allowSearch /></Row>
            <Row label="Niveau"><Select value={(el.props.level as string) || 'h2'} onChange={(v) => setProp('level', v)} options={[{ value: 'h1', label: 'Titre 1' }, { value: 'h2', label: 'Titre 2' }, { value: 'h3', label: 'Titre 3' }]} /></Row>
          </>
        )}
        {el.type === 'text' && (
          <Row label="Texte"><DynEditor value={el.props.text} onChange={(v) => setProp('text', v)} inputs={inputs} dataTypes={dataTypes} allowSearch /></Row>
        )}
        {el.type === 'button' && (
          <>
            <Row label="Libellé"><DynEditor value={el.props.label} onChange={(v) => setProp('label', v)} inputs={inputs} dataTypes={dataTypes} /></Row>
            <div className="mt-1 rounded-md bg-slate-50 p-2 text-[11px] text-slate-500">
              {clickWorkflows.length} action(s) au clic ·{' '}
              <button type="button" className="font-medium text-blue-600 hover:underline" onClick={() => setLeftTab('workflows')}>Gérer dans Workflows →</button>
            </div>
          </>
        )}
        {(el.type === 'input' || el.type === 'textarea') && (
          <>
            <Row label="Texte indicatif"><DynEditor value={el.props.placeholder} onChange={(v) => setProp('placeholder', v)} inputs={inputs} dataTypes={dataTypes} /></Row>
            {el.type === 'input' && (
              <Row label="Type de saisie"><Select value={(el.props.inputType as string) || 'text'} onChange={(v) => setProp('inputType', v)}
                options={[{ value: 'text', label: 'Texte' }, { value: 'number', label: 'Nombre' }, { value: 'email', label: 'Email' }, { value: 'password', label: 'Mot de passe' }, { value: 'date', label: 'Date' }]} /></Row>
            )}
            <div className="text-[11px] text-slate-400">Référez cette saisie via « Saisie d'un champ » → {el.name}</div>
          </>
        )}
        {el.type === 'select' && (
          <Row label="Options (une par ligne)">
            <Textarea rows={4} value={((el.props.options as string[]) || []).join('\n')}
              onChange={(e) => setProp('options', e.target.value.split('\n').filter(Boolean))} />
          </Row>
        )}
        {el.type === 'checkbox' && (
          <Row label="Libellé"><DynEditor value={el.props.label} onChange={(v) => setProp('label', v)} inputs={inputs} dataTypes={dataTypes} /></Row>
        )}
        {el.type === 'image' && (
          <>
            <Row label="Source (URL)"><DynEditor value={el.props.src} onChange={(v) => setProp('src', v)} inputs={inputs} dataTypes={dataTypes} /></Row>
            <Row label="Texte alternatif"><Text value={(el.props.alt as string) || ''} onChange={(v) => setProp('alt', v)} /></Row>
          </>
        )}
        {el.type === 'icon' && (
          <Row label="Icône (nom lucide)"><Text value={(el.props.icon as string) || 'Star'} onChange={(v) => setProp('icon', v)} /></Row>
        )}
        {el.type === 'link' && (
          <Row label="Page cible"><Select value={(el.props.targetPage as string) || ''} onChange={(v) => setProp('targetPage', v)}
            options={[{ value: '', label: '(aucune)' }, ...def.pages.map((p) => ({ value: p.id, label: p.name }))]} /></Row>
        )}
        {el.type === 'repeatingGroup' && <RepeatingSource el={el} dataTypes={dataTypes} setProp={setProp} inputs={inputs} />}
        {(el.type === 'container' || el.type === 'page') && <div className="text-[11px] text-slate-400">Conteneur : ajoutez des éléments à l'intérieur (palette ou glisser-déposer).</div>}
        <WidgetInspector el={el} setProp={setProp} />
      </Section>

      {/* Visibilité conditionnelle */}
      {el.type !== 'page' && (
        <Section title="Visibilité">
          <div className="mb-2">
            <Checkbox checked={!!el.visibleWhen} label="Condition d'affichage"
              onChange={(checked) => updateElement(el.id, { visibleWhen: checked ? { t: 'static', v: true } : undefined })} />
          </div>
          {el.visibleWhen && <DynEditor value={el.visibleWhen} onChange={(v) => updateElement(el.id, { visibleWhen: v })} inputs={inputs} dataTypes={dataTypes} allowSearch />}
        </Section>
      )}

      {/* Disposition (conteneurs) */}
      {isContainerType(el.type) && (
        <Section title="Disposition">
          <Row label="Sens"><Select value={el.layout?.type ?? 'column'} onChange={(v) => updateElement(el.id, { layout: { ...el.layout, type: v as 'column' | 'row' | 'free' } })}
            options={[{ value: 'column', label: 'Colonne (vertical)' }, { value: 'row', label: 'Ligne (horizontal)' }, { value: 'free', label: 'Libre' }]} /></Row>
          <div className="grid grid-cols-2 gap-2">
            <Row label="Espacement"><Text value={el.layout?.gap ?? ''} onChange={(v) => updateElement(el.id, { layout: { ...el.layout, gap: v } })} placeholder="12px" /></Row>
            <Row label="Aligner"><Select value={el.layout?.align ?? 'stretch'} onChange={(v) => updateElement(el.id, { layout: { ...el.layout, align: v } })}
              options={['stretch', 'flex-start', 'center', 'flex-end'].map((o) => ({ value: o, label: o }))} /></Row>
          </div>
          <Row label="Justifier"><Select value={el.layout?.justify ?? 'flex-start'} onChange={(v) => updateElement(el.id, { layout: { ...el.layout, justify: v } })}
            options={['flex-start', 'center', 'flex-end', 'space-between', 'space-around'].map((o) => ({ value: o, label: o }))} /></Row>
        </Section>
      )}

      {/* Style */}
      <Section title="Style"><StyleEditor el={el} /></Section>
    </div>
  )
}

// ── Source de données d'un repeating group ───────────────────────────────────

function RepeatingSource({
  el, dataTypes, setProp, inputs,
}: {
  el: Element
  dataTypes: { name: string; fields: { name: string }[] }[]
  setProp: (k: string, v: unknown) => void
  inputs: DynInputs[]
}) {
  const source = (el.props.source as Extract<Dyn, { t: 'search' }>) || { t: 'search', dataType: '' }
  const dt = dataTypes.find((t) => t.name === source.dataType)
  const sortFields = ['_created_at', '_updated_at', ...(dt?.fields.map((f) => f.name) ?? [])]
  const constraints = source.constraints ?? []

  const update = (patch: Partial<Extract<Dyn, { t: 'search' }>>) => setProp('source', { ...source, ...patch })

  return (
    <div className="space-y-2">
      <Row label="Type de données">
        <Select value={source.dataType} onChange={(v) => update({ dataType: v })}
          options={dataTypes.length ? dataTypes.map((t) => ({ value: t.name, label: t.name })) : [{ value: '', label: '(créez un type dans Données)' }]} />
      </Row>
      <div className="grid grid-cols-2 gap-2">
        <Row label="Trier par"><Select value={source.sort?.field ?? '_created_at'} onChange={(v) => update({ sort: { field: v, desc: source.sort?.desc ?? true } })}
          options={sortFields.map((f) => ({ value: f, label: f }))} /></Row>
        <Row label="Ordre"><Select value={source.sort?.desc ? 'desc' : 'asc'} onChange={(v) => update({ sort: { field: source.sort?.field ?? '_created_at', desc: v === 'desc' } })}
          options={[{ value: 'desc', label: 'Décroissant' }, { value: 'asc', label: 'Croissant' }]} /></Row>
      </div>
      <div className="rounded-md border border-slate-200 p-2">
        <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-slate-500">
          <span>Filtres</span>
          <button type="button" className="text-blue-600 hover:underline" onClick={() => update({ constraints: [...constraints, { field: dt?.fields[0]?.name ?? '', op: 'equals', value: { t: 'static', v: '' } }] })}>+ Ajouter</button>
        </div>
        {constraints.map((c, i) => (
          <div key={i} className="mb-1.5 space-y-1 rounded bg-slate-50 p-1.5">
            <div className="flex gap-1">
              <div className="w-1/2">
                <Dropdown value={c.field} width="100%"
                  onChange={(v) => update({ constraints: constraints.map((x, j) => j === i ? { ...x, field: v } : x) })}
                  options={(dt?.fields ?? []).map((f) => ({ value: f.name, label: f.name }))} />
              </div>
              <div className="w-1/2">
                <Dropdown value={c.op} width="100%"
                  onChange={(v) => update({ constraints: constraints.map((x, j) => j === i ? { ...x, op: v as ConstraintOp } : x) })}
                  options={OPS.map((o) => ({ value: o.value, label: o.label }))} />
              </div>
            </div>
            <div className="flex gap-1">
              <div className="flex-1">
                <DynEditor value={c.value} onChange={(v) => update({ constraints: constraints.map((x, j) => j === i ? { ...x, value: v } : x) })} inputs={inputs} dataTypes={dataTypes} />
              </div>
              <button type="button" className="self-start text-red-500" onClick={() => update({ constraints: constraints.filter((_, j) => j !== i) })}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const OPS: { value: ConstraintOp; label: string }[] = [
  { value: 'equals', label: '=' },
  { value: 'not_equals', label: '≠' },
  { value: 'contains', label: 'contient' },
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
  { value: 'is_empty', label: 'vide' },
  { value: 'is_not_empty', label: 'non vide' },
]
