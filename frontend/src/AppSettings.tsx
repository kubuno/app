import { useTranslation } from 'react-i18next'
import { AppWindow } from 'lucide-react'

/** Page de réglages du module (placeholder — réglages globaux à venir). */
export default function AppSettings() {
  const { t } = useTranslation('app')
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-slate-800"><AppWindow className="text-blue-600" /> {t('settings')}</h1>
      <p className="text-sm text-slate-500">{t('settings_desc')}</p>
    </div>
  )
}
