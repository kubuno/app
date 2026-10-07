// Exposes the live Awareness instance to deeply-nested builder components (Canvas)
// so they can publish the local mouse cursor / selection and render the remote
// collaborators' cursors and manipulated objects.
import { createContext, useContext } from 'react'
import type { Awareness } from 'y-protocols/awareness'

export const CollabContext = createContext<Awareness | null>(null)

export const useCollabAwareness = (): Awareness | null => useContext(CollabContext)
