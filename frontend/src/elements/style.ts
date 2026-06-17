import type { CSSProperties } from 'react'
import type { Element, ElementLayout, ElementStyle } from '../types'

/** Convertit le style d'un élément en CSSProperties React. */
export function asCss(style: ElementStyle): CSSProperties {
  return style as CSSProperties
}

/** Style flex dérivé du layout d'un conteneur. */
export function layoutStyle(layout?: ElementLayout): CSSProperties {
  if (!layout || layout.type === 'free') return {}
  return {
    display: 'flex',
    flexDirection: layout.type === 'row' ? 'row' : 'column',
    gap: layout.gap ?? '12px',
    alignItems: layout.align ?? 'stretch',
    justifyContent: layout.justify ?? 'flex-start',
    flexWrap: layout.wrap ? 'wrap' : 'nowrap',
  }
}

/** Style complet d'un élément (style propre + layout s'il est conteneur). */
export function elementCss(el: Element): CSSProperties {
  return { ...layoutStyle(el.layout), ...asCss(el.style) }
}

export function deviceWidth(device: 'desktop' | 'tablet' | 'mobile'): number {
  return device === 'mobile' ? 390 : device === 'tablet' ? 768 : 1024
}
