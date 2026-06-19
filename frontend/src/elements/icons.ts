import { icons, Circle, type LucideIcon } from 'lucide-react'

// Résolution d'icônes pour le module App. Contrairement à `getIcon` du core (qui
// ne couvre qu'une poignée d'icônes de modules → repli « Cloud »), on résout ici
// sur TOUT le catalogue lucide (PascalCase) afin que les widgets à icône (iconBox,
// stat, socialIcons, appBar, bottomNav…) acceptent n'importe quel nom d'icône.

const MAP = icons as Record<string, LucideIcon>

// Alias pour les noms lucide renommés au fil des versions (l'utilisateur tape
// souvent l'ancien nom familier).
const ALIAS: Record<string, string> = {
  MoreVertical: 'EllipsisVertical', MoreHorizontal: 'Ellipsis', Home: 'House',
  PlusSquare: 'SquarePlus', MinusSquare: 'SquareMinus', CheckSquare: 'SquareCheck',
  Loader2: 'LoaderCircle', Edit: 'Pencil', Edit2: 'Pencil', Edit3: 'PenLine',
  Trash: 'Trash2', Settings2: 'Settings', Twitter: 'Twitter',
}

export function resolveIcon(name?: string): LucideIcon {
  if (!name) return Circle
  return MAP[name]
    ?? MAP[ALIAS[name] ?? '']
    ?? MAP[name.charAt(0).toUpperCase() + name.slice(1)]
    ?? Circle
}
