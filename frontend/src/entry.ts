/** Bundle MODULE app — chargé à l'exécution (cf. vite.config). */
import { lazy } from 'react'
import {
  RouteRegistry, CollapseSidebarRegistry, WaffleAppRegistry, FileTypeRegistry,
  FaviconRegistry, useToolbarStore, SlotRegistry, ModuleSettingsRegistry, SDK_VERSION,
} from '@kubuno/sdk'
import './index.css'
import './i18n'
import AppLogo from './AppLogo'
import AppNewActions from './AppNewActions'

export const sdkVersion = SDK_VERSION

export function register() {
  FaviconRegistry.register('app', '/app-logo.svg')

  // Type de fichier Kubuno produit par App (.kbapp) — StartPage + icône + ouverture.
  FileTypeRegistry.register({
    moduleId: 'app', label: 'App', icon: 'AppWindow',
    mimeTypes: ['application/vnd.kubuno.app+json'],
    extensions: ['kbapp'],
    open: (f, nav) => { import('./api').then(({ appApi }) => appApi.openByFile(f.id).then((a) => nav(`/app/${a.id}`)).catch(() => {})) },
  })

  // L'éditeur occupe toute la largeur : on replie la sidebar du core.
  CollapseSidebarRegistry.add('/app')

  // Bouton « Nouveau » du shell → ouvre le tableau de bord (choix web/mobile).
  SlotRegistry.register('sidebar-new-actions', 'app', AppNewActions)

  useToolbarStore.getState().register({ moduleId: 'app', routePrefix: '/app', noPadding: true })

  WaffleAppRegistry.register('app', 'App', [
    { id: 'app', label: 'App', Icon: AppLogo, path: '/app' },
  ])

  // The header gear button opens the per-user App settings while in /app.
  ModuleSettingsRegistry.register('app')

  const AppDashboard    = lazy(() => import('./AppDashboard'))
  const AppBuilder      = lazy(() => import('./AppBuilder'))
  const AppSettingsPage = lazy(() => import('./AppSettingsPage'))
  const PublicApp       = lazy(() => import('./PublicApp'))

  RouteRegistry.register('app',          AppDashboard)
  RouteRegistry.register('app/settings', AppSettingsPage)
  // Vue publique d'une app publiée (hors-shell, accessible sans connexion).
  RouteRegistry.registerPublic('app/p/:slug', PublicApp)
  RouteRegistry.register('app/:id',      AppBuilder)
}
