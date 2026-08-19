/**
 * Items of the sidebar "New" button for App — DATA for the project's menu
 * component (`MenuDropdown` from @ui), contributed through the generic
 * 'shell.new-actions' extension point (see entry.ts). Evaluated when the menu
 * opens, so labels are always fresh, without hooks.
 */
import type { MenuItem } from '@ui'
import { AppWindow } from 'lucide-react'
// `navigate` is the core's SPA navigation helper for code running outside
// React: the shell hands it the router's real `navigate`.
import { i18n, navigate } from '@kubuno/sdk'

export function appNewActionItems(): MenuItem[] {
  if (!window.location.pathname.startsWith('/app')) return []

  // The web/mobile choice + the template picker live in the dashboard.
  return [
    {
      type: 'action',
      label: i18n.t('app:new_app'),
      icon: <AppWindow size={16} className="text-primary" />,
      onClick: () => navigate('/app?new=1'),
    },
  ]
}
