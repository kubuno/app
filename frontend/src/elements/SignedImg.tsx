import type { ImgHTMLAttributes, MediaHTMLAttributes } from 'react'
import { useAuthStore, useSignedUrl } from '@kubuno/sdk'

/**
 * Ticketed form of a free-form media URL (e.g. a Drive download URL picked in
 * the builder; the bare URL stays persisted, it is signed at render time).
 * Other origins pass through unchanged. Without a session (a published app
 * viewed anonymously) no ticket can be minted, so the bare URL is used as-is.
 * `undefined` while the ticket is being fetched.
 */
export function useMediaSrc(url: string | undefined, purpose?: 'view' | 'stream'): string | undefined {
  const signedIn = !!useAuthStore(s => s.accessToken)
  const signed = useSignedUrl(signedIn && url ? url : null, purpose ? { purpose } : {})
  if (!url) return undefined
  return signedIn ? signed : url
}

/** `<img>` whose `src` is signed when needed; renders nothing until it is ready. */
export function SignedImg({ src, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const resolved = useMediaSrc(typeof src === 'string' ? src : undefined)
  if (!resolved) return null
  return <img src={resolved} {...rest} />
}

/** `<video>` / `<audio>` whose `src` carries a long-lived `stream` ticket. */
export function SignedMedia({ as: Tag, src, ...rest }: { as: 'video' | 'audio'; src: string } & MediaHTMLAttributes<HTMLMediaElement>) {
  const resolved = useMediaSrc(src, 'stream')
  if (!resolved) return null
  return <Tag src={resolved} {...rest} />
}
