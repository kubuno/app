import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { getDateLocale, getIcon } from '@kubuno/sdk'
import { Button } from '@ui'
import type { StartPageRecentItem } from '@ui'
import { ModuleStartPage } from '@kubuno/drive'
import type { FileItem } from '@kubuno/drive'
import { AppWindow, Plus, ExternalLink, Monitor, Smartphone, ArrowLeft } from 'lucide-react'
import { appApi } from './api'
import type { Application, AppKind, Page } from './types'
import { TEMPLATES } from './templates'
import { TemplateThumb } from './builder/TemplateThumb'

// Reusable start content for the App module: recent apps (derived from `.kbapp`
// files in the `App/` Drive folder) + a "Browse" tab fed by the file browser, plus
// the web/mobile → template creation modal. Shared by the dashboard (wrapped in the
// editor chrome via `ModuleHome`) and by the open editor's "File" backstage so the
// "Home" section offers the exact same experience.
export default function AppStartContent() {
  const { t, i18n } = useTranslation('app')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [apps, setApps] = useState<Application[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [kind, setKind] = useState<AppKind | null>(null)

  // Fallback for recents before the Drive folder resolves; once resolved,
  // ModuleStartPage derives recents itself from the `.kbapp` files.
  useEffect(() => { appApi.list().then(setApps).catch(() => setApps([])) }, [])

  useEffect(() => {
    if (searchParams.get('new') === '1') { setShowCreate(true); setKind(null); searchParams.delete('new'); setSearchParams(searchParams, { replace: true }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const openCreate = () => { setKind(null); setShowCreate(true) }
  const closeCreate = () => { setShowCreate(false); setKind(null) }

  const create = async (templateId: string) => {
    if (!kind) return
    const tpl = TEMPLATES.find((x) => x.id === templateId)
    const name = !tpl || tpl.id === 'blank' ? (kind === 'mobile' ? 'Mon app mobile' : t('new_app')) : tpl.name
    try {
      const app = await appApi.create({ name, definition: tpl?.build(kind), template: `${kind}:${templateId}` })
      navigate(`/app/${app.id}`)
    } catch { /* ignore */ }
  }

  // Open a .kbapp file from the browser → builder.
  const handleOpenFile = (file: FileItem): boolean => {
    appApi.openByFile(file.id).then((a) => navigate(`/app/${a.id}`)).catch(() => {})
    return true
  }

  const recentItems: StartPageRecentItem[] = apps.slice(0, 12).map((app) => ({
    id:       app.id,
    name:     app.name,
    subtitle: app.updated_at ? format(new Date(app.updated_at), 'd MMM', { locale: getDateLocale(i18n.language) }) : undefined,
    icon:     <AppWindow size={18} className="text-text-tertiary" strokeWidth={1.5} />,
    onClick:  () => navigate(`/app/${app.id}`),
    actions: [
      { id: 'open', label: t('open'), icon: <ExternalLink size={15} />, onClick: () => navigate(`/app/${app.id}`) },
    ],
  }))

  return (
    <>
      <ModuleStartPage
        recentTitle={t('recent')}
        recentItems={recentItems}
        recentEmpty={
          <div className="flex flex-col items-center gap-2">
            <AppWindow size={32} className="text-text-tertiary opacity-30" strokeWidth={1.5} />
            <p className="text-text-tertiary text-xs">{t('no_apps')}</p>
          </div>
        }
        browse={{
          folderPathPrefix: 'App',
          title: t('app'),
          fileTypeModuleId: 'app',
          onOpenFile: handleOpenFile,
          toolbarContent: (
            <Button icon={<Plus size={15} />} onClick={openCreate}>{t('new_app')}</Button>
          ),
        }}
      />

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeCreate}>
          <div className={`w-full rounded-2xl bg-white p-6 shadow-2xl ${kind ? 'max-w-3xl' : 'max-w-lg'}`} onClick={(e) => e.stopPropagation()}>
            {!kind ? (
              <>
                <h2 className="mb-1 text-lg font-bold text-slate-800">{t('new_app')}</h2>
                <p className="mb-4 text-sm text-slate-500">{t('pick_kind')}</p>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setKind('web')}
                    className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-5 text-center transition hover:border-blue-400 hover:bg-blue-50">
                    <Monitor size={30} className="text-blue-600" />
                    <div className="font-semibold text-slate-800">{t('kind_web')}</div>
                    <div className="text-xs text-slate-500">{t('kind_web_desc')}</div>
                  </button>
                  <button type="button" onClick={() => setKind('mobile')}
                    className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-5 text-center transition hover:border-violet-400 hover:bg-violet-50">
                    <Smartphone size={30} className="text-violet-600" />
                    <div className="font-semibold text-slate-800">{t('kind_mobile')}</div>
                    <div className="text-xs text-slate-500">{t('kind_mobile_desc')}</div>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-1 flex items-center gap-2">
                  <button type="button" onClick={() => setKind(null)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><ArrowLeft size={16} /></button>
                  <h2 className="text-lg font-bold text-slate-800">{kind === 'mobile' ? t('kind_mobile') : t('kind_web')}</h2>
                </div>
                <p className="mb-4 text-sm text-slate-500">{t('pick_template')}</p>
                <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-auto sm:grid-cols-3">
                  {TEMPLATES.filter((tpl) => tpl.kinds.includes(kind)).map((tpl) => {
                    const Ico = getIcon(tpl.icon)
                    let start: Page | undefined
                    try { const def = tpl.build(kind); start = def.pages.find((p) => p.route === def.settings.startPage) ?? def.pages[0] } catch { start = undefined }
                    return (
                      <button key={tpl.id} type="button" onClick={() => create(tpl.id)}
                        className="flex flex-col overflow-hidden rounded-xl border border-slate-200 text-left transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md">
                        <div className={`h-36 overflow-hidden border-b border-slate-100 bg-slate-50 ${kind === 'mobile' ? 'flex justify-center' : ''}`}>
                          {start
                            ? (kind === 'mobile'
                                ? <div className="h-full w-[58%] overflow-hidden border-x border-slate-200 bg-white">{<TemplateThumb page={start} width={400} />}</div>
                                : <TemplateThumb page={start} />)
                            : <div className="grid h-full place-items-center text-slate-300">{Ico && <Ico size={28} />}</div>}
                        </div>
                        <div className="flex items-start gap-2 px-3 py-2.5">
                          {Ico && <Ico size={16} className="mt-0.5 shrink-0 text-blue-600" />}
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold text-slate-800">{tpl.name}</div>
                            <div className="text-[11px] leading-tight text-slate-500">{tpl.description}</div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
