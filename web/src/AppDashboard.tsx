import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppWindow } from 'lucide-react'
import { ModuleHome } from './ribbon/ModuleBackstage'
import { THEME_APP } from './ribbon/officeThemes'
import AppStartContent from './AppStartContent'

// App dashboard: the start content (recents + browse + create modal) wrapped in the
// editor chrome via `ModuleHome` — a ribbon with only the locked "File" tab, whose
// backstage shows the start content. The exact same `AppStartContent` is reused in
// the open editor's "File" backstage ("Home" section).
export default function AppDashboard() {
  const { t } = useTranslation('app')
  const navigate = useNavigate()
  return (
    <ModuleHome
      theme={THEME_APP}
      title={t('app')}
      titleIcon={<AppWindow size={16} className="text-white/90 flex-shrink-0" />}
      fileLabel={t('office_bs_file', { defaultValue: 'Fichier' })}
      homeLabel={t('office_bs_home', { defaultValue: 'Accueil' })}
      onBack={() => navigate('/')}
      startContent={<AppStartContent />}
    />
  )
}
