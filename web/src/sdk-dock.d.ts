// Augmentation locale : `DockArea` (et ses types) a été promu dans le core/sdk
// (`core/shell/workspace/Dock`) mais le paquet npm `@kubuno/sdk` installé n'a pas
// encore été republié. Au RUNTIME, l'import map du host résout `@kubuno/sdk` vers
// le module réel du core qui exporte bien `DockArea`. À supprimer une fois
// `@kubuno/sdk` republié avec ces exports.
import type { ReactNode, CSSProperties, Ref, MutableRefObject, ReactElement } from 'react'

declare module '@kubuno/sdk' {
  export type DockPanel = { label: ReactNode; render: () => ReactNode }
  export type DockController = { activate: (id: string) => void; reset: () => void; open: (id: string) => void; close: (id: string) => void }
  export type DockTheme = { panel: string; header: string; border: string; text: string; textDim: string; accent?: string }
  export function DockArea(props: {
    panels: Record<string, DockPanel>
    storageKey: string
    defaultArrangement: { left?: string[][]; right?: string[][]; float?: string[][] }
    viewportBg?: string
    hidden?: boolean
    theme?: DockTheme
    moveTitle?: string
    children: ReactNode
    className?: string
    style?: CSSProperties
    viewportRef?: Ref<HTMLDivElement>
    controllerRef?: MutableRefObject<DockController | null>
  }): ReactElement
}
