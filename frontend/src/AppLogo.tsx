interface AppLogoProps {
  size?:      number
  className?: string
  title?:     string
}

/** App logo (designer artwork, raster). Served by the host from
 *  `/app-logo.png`; rendered as a square image so it weighs the same as its
 *  neighbours in the waffle menu. */
export function AppLogo({ size = 24, className, title = 'App' }: AppLogoProps) {
  return (
    <img
      src="/app-logo.png"
      width={size}
      height={size}
      alt={title}
      className={className}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  )
}

export default AppLogo
