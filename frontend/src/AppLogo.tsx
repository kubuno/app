interface AppLogoProps {
  size?:      number
  className?: string
  title?:     string
}

/** Logo App : carré arrondi bleu/violet + fenêtre d'application stylisée. */
export function AppLogo({ size = 24, className, title = 'App' }: AppLogoProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 1180 1180" role="img" aria-label={title} className={className}
      style={{ fillRule: 'evenodd', clipRule: 'evenodd' }}>
      <title>{title}</title>
      <defs>
        <linearGradient id="app-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2563eb" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <path d="M1179.167,294.792l0,589.583c0,162.7 -132.092,294.792 -294.792,294.792l-589.583,0c-162.7,0 -294.792,-132.092 -294.792,-294.792l0,-589.583c0,-162.7 132.092,-294.792 294.792,-294.792l589.583,0c162.7,0 294.792,132.092 294.792,294.792Z" fill="url(#app-grad)" />
      <path d="M295,360l590,0c30,0 55,25 55,55l0,350c0,30 -25,55 -55,55l-590,0c-30,0 -55,-25 -55,-55l0,-350c0,-30 25,-55 55,-55Z" fill="#fff" />
      <path d="M240,470l700,0l0,-55c0,-30 -25,-55 -55,-55l-590,0c-30,0 -55,25 -55,55l0,55Z" fill="#c7d2fe" />
      <circle cx="305" cy="415" r="20" fill="#7c3aed" />
      <circle cx="375" cy="415" r="20" fill="#2563eb" />
      <rect x="300" y="540" width="240" height="46" rx="23" fill="#2563eb" />
      <rect x="300" y="630" width="360" height="30" rx="15" fill="#e2e8f0" />
      <rect x="300" y="690" width="300" height="30" rx="15" fill="#e2e8f0" />
      <rect x="700" y="540" width="180" height="180" rx="20" fill="#ede9fe" />
    </svg>
  )
}

export default AppLogo
