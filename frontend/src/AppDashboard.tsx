import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { getDateLocale } from '@kubuno/sdk'
import { Button } from '@ui'
import type { StartPageRecentItem } from '@ui'
import { ModuleStartPage } from '@kubuno/drive'
import type { FileItem } from '@kubuno/drive'
import { AppWindow, Plus, ExternalLink, Monitor, Smartphone, ArrowLeft } from 'lucide-react'
import { appApi } from './api'
import type { Application, AppKind } from './types'
import { TEMPLATES } from './templates'

// Le tableau de bord s'appuie sur `ModuleStartPage` de @kubuno/drive : récents
// (dérivés des fichiers `.kbapp` du dossier `App/`) + onglet « Parcourir »
// alimenté par le navigateur de fichiers du module. La création reste pilotée
// par notre modale web/mobile → modèle, déclenchée depuis la barre d'outils.
// L'ouverture d'un `.kbapp` depuis le Drive est câblée via FileTypeRegistry.
export default function AppDashboard() {
  const { t, i18n } = useTranslation('app')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [apps, setApps] = useState<Application[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [kind, setKind] = useState<AppKind | null>(null)

  // Repli pour les récents avant que le dossier drive ne soit résolu ; une fois
  // résolu, ModuleStartPage dérive lui-même les récents des fichiers `.kbapp`.
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
    const name = templateId === 'todo' ? 'Liste de tâches' : kind === 'mobile' ? 'Mon app mobile' : t('new_app')
    try {
      const app = await appApi.create({ name, definition: tpl?.build(kind), template: `${kind}:${templateId}` })
      navigate(`/app/${app.id}`)
    } catch { /* ignore */ }
  }

  // Ouverture d'un fichier .kbapp depuis le navigateur → builder.
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
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
                <div className="grid grid-cols-2 gap-3">
                  {TEMPLATES.map((tpl) => (
                    <button key={tpl.id} type="button" onClick={() => create(tpl.id)}
                      className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-blue-400 hover:bg-blue-50">
                      <div className="mb-1 font-semibold text-slate-800">{tpl.name}</div>
                      <div className="text-xs text-slate-500">{tpl.description}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
