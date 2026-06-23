import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@kubuno/sdk'
import { appApi } from './api'
import AppRuntime from './runtime/AppRuntime'

// Vue PUBLIQUE d'une application publiée — route hors-shell (visiteur anonyme).
// Charge la définition par slug et exécute le runtime ; les données passent par
// les routes publiques du backend (cf. publicSlug → dataScope).
export default function PublicApp() {
  const { slug = '' } = useParams()
  const user = useAuthStore((s) => s.user)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-app', slug],
    queryFn: () => appApi.getPublic(slug),
    retry: false,
  })

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center text-slate-400 text-sm">Chargement…</div>
  }
  if (isError || !data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-center text-slate-500">
        <p className="text-lg font-medium">Application introuvable</p>
        <p className="text-sm text-slate-400">Ce lien est invalide ou l’application n’est plus publiée.</p>
      </div>
    )
  }

  const kind = data.definition.settings?.kind
  const maxWidth = kind === 'mobile' ? 430 : 1100
  return (
    <div className="min-h-screen w-full overflow-auto bg-slate-100 print:bg-white print:overflow-visible print:min-h-0">
      <div className="mx-auto min-h-screen bg-white shadow-xl print:shadow-none print:max-w-none print:min-h-0" style={{ maxWidth }}>
        {/* appId réel (data.id) → routes de données PARTAGÉES ; currentUser si
            connecté → identité réelle (messagerie multi-comptes). */}
        <AppRuntime def={data.definition} appId={data.id} publicSlug={slug}
          currentUser={user ? { id: user.id, email: user.email } : undefined} />
      </div>
    </div>
  )
}
