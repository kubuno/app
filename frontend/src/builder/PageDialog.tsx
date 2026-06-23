import { useEffect, useMemo, useState } from 'react'
import { X, FilePlus, Search, Trash2, LayoutTemplate, Sparkles } from 'lucide-react'
import { Input } from '@ui'
import type { Page } from '../types'
import { makePage } from '../store'
import { PAGE_TEMPLATES, PAGE_TEMPLATE_THEMES, type PageTemplate } from '../pageTemplates'
import { appApi, type SavedPageTemplate } from '../api'
import { TemplateThumb } from './TemplateThumb'

const USER_THEME = 'Mes modèles'

/** Fenêtre de création de page : page vierge OU modèle (prédéfini ou utilisateur). */
export default function PageDialog({ onClose, onPick }: { onClose: () => void; onPick: (page: Page) => void }) {
  const [q, setQ] = useState('')
  const [theme, setTheme] = useState<string>('Tous')
  const [saved, setSaved] = useState<SavedPageTemplate[]>([])

  useEffect(() => { appApi.listPageTemplates().then(setSaved).catch(() => {}) }, [])

  const themes = useMemo(() => ['Tous', ...PAGE_TEMPLATE_THEMES, ...(saved.length ? [USER_THEME] : [])], [saved.length])
  const ql = q.trim().toLowerCase()

  const builtinShown = PAGE_TEMPLATES.filter((t) =>
    (theme === 'Tous' || t.theme === theme) && (!ql || t.name.toLowerCase().includes(ql) || t.description.toLowerCase().includes(ql)))
  const savedShown = saved.filter((t) =>
    (theme === 'Tous' || theme === USER_THEME) && (!ql || t.name.toLowerCase().includes(ql)))

  const pickBuiltin = (t: PageTemplate) => { onPick(t.build()); onClose() }
  const pickSaved = (t: SavedPageTemplate) => { onPick(t.definition); onClose() }
  const pickBlank = () => { onPick(makePage('Nouvelle page')); onClose() }
  const removeSaved = async (id: string) => { await appApi.deletePageTemplate(id).catch(() => {}); setSaved((s) => s.filter((x) => x.id !== id)) }

  // Regroupe les modèles prédéfinis affichés par thème (en mode « Tous »).
  const grouped = useMemo(() => {
    const m = new Map<string, PageTemplate[]>()
    for (const t of builtinShown) { const a = m.get(t.theme) ?? []; a.push(t); m.set(t.theme, a) }
    return [...m.entries()]
  }, [builtinShown])

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex h-[80vh] w-[920px] max-w-[96vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* En-tête */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
          <LayoutTemplate size={18} className="text-blue-600" />
          <h2 className="text-base font-semibold text-slate-800">Ajouter une page</h2>
          <div className="relative ml-4 flex-1 max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un modèle…" className="pl-8" />
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Rail des thèmes */}
          <div className="w-48 shrink-0 overflow-auto border-r border-slate-200 bg-slate-50 p-2">
            {themes.map((t) => (
              <button key={t} type="button" onClick={() => setTheme(t)}
                className={`mb-0.5 block w-full truncate rounded-md px-2.5 py-1.5 text-left text-[13px] ${theme === t ? 'bg-blue-100 font-medium text-blue-800' : 'text-slate-600 hover:bg-slate-100'}`}>
                {t}{t === USER_THEME && saved.length ? ` (${saved.length})` : ''}
              </button>
            ))}
          </div>

          {/* Grille */}
          <div className="min-w-0 flex-1 overflow-auto p-4">
            {/* Page vierge — toujours en tête */}
            {(theme === 'Tous' || theme === USER_THEME) && (
              <button type="button" onClick={pickBlank}
                className="mb-5 flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 text-left hover:border-blue-400 hover:bg-blue-50/50">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-slate-500"><FilePlus size={20} /></span>
                <span><span className="block text-sm font-semibold text-slate-800">Page vierge</span><span className="block text-xs text-slate-500">Partir d’une toile vide.</span></span>
              </button>
            )}

            {/* Modèles utilisateur */}
            {savedShown.length > 0 && (
              <section className="mb-6">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><Sparkles size={13} /> {USER_THEME}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:grid-cols-3">
                  {savedShown.map((t) => (
                    <div key={t.id} className="group relative">
                      <TemplateCard title={t.name} subtitle="Mon modèle" page={t.definition} onClick={() => pickSaved(t)} />
                      <button type="button" onClick={() => removeSaved(t.id)} title="Supprimer ce modèle"
                        className="absolute right-1.5 top-1.5 hidden rounded-md bg-white/90 p-1 text-red-500 shadow group-hover:block hover:bg-red-50"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Modèles prédéfinis groupés par thème */}
            {grouped.map(([th, items]) => (
              <section key={th} className="mb-6">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{th}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:grid-cols-3">
                  {items.map((t) => <TemplateCard key={t.id} title={t.name} subtitle={t.description} page={t.build()} onClick={() => pickBuiltin(t)} />)}
                </div>
              </section>
            ))}

            {builtinShown.length === 0 && savedShown.length === 0 && (
              <div className="py-16 text-center text-sm text-slate-400">Aucun modèle ne correspond à « {q} ».</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TemplateCard({ title, subtitle, page, onClick }: { title: string; subtitle: string; page: Page; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md">
      <div className="h-32 overflow-hidden border-b border-slate-100 bg-slate-50">
        <TemplateThumb page={page} />
      </div>
      <div className="px-3 py-2">
        <div className="truncate text-[13px] font-semibold text-slate-800">{title}</div>
        <div className="truncate text-[11px] text-slate-500">{subtitle}</div>
      </div>
    </button>
  )
}
