import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { AppWindow } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

// Entrée du bouton « Nouveau » du shell (slot `sidebar-new-actions`). Rendue
// dans le DropdownMenu.Root du core → Radix doit être un singleton partagé.
const ITEM =
  'flex items-center gap-2.5 px-3 py-2 text-sm text-text-primary rounded-md ' +
  'hover:bg-surface-2 cursor-pointer outline-none transition-colors'

export default function AppNewActions() {
  const { t } = useTranslation('app')
  const location = useLocation()
  const navigate = useNavigate()
  if (!location.pathname.startsWith('/app')) return null

  // Le choix web/mobile + le template se fait dans le tableau de bord.
  return (
    <DropdownMenu.Item onSelect={() => navigate('/app?new=1')} className={ITEM}>
      <AppWindow size={16} className="text-primary" />
      {t('new_app')}
    </DropdownMenu.Item>
  )
}
