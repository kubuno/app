import {
  Square, List, Heading, Type, MousePointerClick, Image, Star, Link, Minus,
  TextCursorInput, AlignLeft, ChevronDown, CheckSquare,
  StretchVertical, Video, Music, MapPin, Code2, LayoutGrid, Sparkles, ImagePlus,
  ListChecks, ListOrdered, AlertTriangle, Quote, BarChart3, MessageSquareQuote,
  Tag, Megaphone, Share2, PanelTop, Rows3, Hash, Timer, RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import type { ElementType } from '../types'

export type PaletteCategory = 'layout' | 'basic' | 'media' | 'content' | 'interactive' | 'marketing' | 'form' | 'data'

export interface PaletteItem {
  type:     ElementType
  label:    string
  Icon:     LucideIcon
  category: PaletteCategory
}

/** Catalogue des éléments insérables, façon palette de Bubble / Elementor. */
export const PALETTE: PaletteItem[] = [
  // Disposition
  { type: 'container',      label: 'Conteneur',      Icon: Square,             category: 'layout' },
  { type: 'spacer',         label: 'Espace',         Icon: StretchVertical,    category: 'layout' },
  { type: 'divider',        label: 'Séparateur',     Icon: Minus,              category: 'layout' },

  // Éléments de base
  { type: 'heading',        label: 'Titre',          Icon: Heading,            category: 'basic' },
  { type: 'text',           label: 'Texte',          Icon: Type,               category: 'basic' },
  { type: 'button',         label: 'Bouton',         Icon: MousePointerClick,  category: 'basic' },
  { type: 'link',           label: 'Lien',           Icon: Link,               category: 'basic' },
  { type: 'icon',           label: 'Icône',          Icon: Star,               category: 'basic' },

  // Média
  { type: 'image',          label: 'Image',          Icon: Image,              category: 'media' },
  { type: 'gallery',        label: 'Galerie',        Icon: LayoutGrid,         category: 'media' },
  { type: 'video',          label: 'Vidéo',          Icon: Video,              category: 'media' },
  { type: 'audio',          label: 'Audio',          Icon: Music,              category: 'media' },
  { type: 'map',            label: 'Carte',          Icon: MapPin,             category: 'media' },
  { type: 'embed',          label: 'HTML',           Icon: Code2,              category: 'media' },

  // Contenu
  { type: 'iconBox',        label: 'Bloc icône',     Icon: Sparkles,           category: 'content' },
  { type: 'imageBox',       label: 'Bloc image',     Icon: ImagePlus,          category: 'content' },
  { type: 'iconList',       label: 'Liste à icônes', Icon: ListChecks,         category: 'content' },
  { type: 'list',           label: 'Liste',          Icon: ListOrdered,        category: 'content' },
  { type: 'alert',          label: 'Alerte',         Icon: AlertTriangle,      category: 'content' },
  { type: 'blockquote',     label: 'Citation',       Icon: Quote,              category: 'content' },
  { type: 'rating',         label: 'Notation',       Icon: Star,               category: 'content' },

  // Interactif
  { type: 'tabs',           label: 'Onglets',        Icon: PanelTop,           category: 'interactive' },
  { type: 'accordion',      label: 'Accordéon',      Icon: Rows3,              category: 'interactive' },
  { type: 'flipBox',        label: 'Carte retourn.', Icon: RefreshCw,          category: 'interactive' },

  // Marketing
  { type: 'counter',        label: 'Compteur',       Icon: Hash,               category: 'marketing' },
  { type: 'progress',       label: 'Progression',    Icon: BarChart3,          category: 'marketing' },
  { type: 'countdown',      label: 'Compte à rebours', Icon: Timer,            category: 'marketing' },
  { type: 'testimonial',    label: 'Témoignage',     Icon: MessageSquareQuote, category: 'marketing' },
  { type: 'priceTable',     label: 'Tarif',          Icon: Tag,                category: 'marketing' },
  { type: 'cta',            label: 'Appel à action', Icon: Megaphone,          category: 'marketing' },
  { type: 'socialIcons',    label: 'Réseaux sociaux', Icon: Share2,            category: 'marketing' },

  // Formulaire
  { type: 'input',          label: 'Champ',          Icon: TextCursorInput,    category: 'form' },
  { type: 'textarea',       label: 'Zone de texte',  Icon: AlignLeft,          category: 'form' },
  { type: 'select',         label: 'Liste',          Icon: ChevronDown,        category: 'form' },
  { type: 'checkbox',       label: 'Case à cocher',  Icon: CheckSquare,        category: 'form' },

  // Données
  { type: 'repeatingGroup', label: 'Liste répétée',  Icon: List,               category: 'data' },
]

export const CATEGORIES: { id: PaletteCategory; label: string }[] = [
  { id: 'layout',      label: 'Disposition' },
  { id: 'basic',       label: 'Éléments' },
  { id: 'media',       label: 'Média' },
  { id: 'content',     label: 'Contenu' },
  { id: 'interactive', label: 'Interactif' },
  { id: 'marketing',   label: 'Marketing' },
  { id: 'form',        label: 'Formulaire' },
  { id: 'data',        label: 'Données' },
]

export function paletteItem(type: ElementType): PaletteItem | undefined {
  return PALETTE.find((p) => p.type === type)
}
