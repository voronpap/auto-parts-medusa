"use client"

import Image from "next/image"
import { useState } from "react"

import { PartIcon } from "./part-icon"

/**
 * A product photo in a fixed square, or the part icon when the product has no
 * photo or the file does not load. Lazy unless `priority`.
 */
export default function PartImage({
  src,
  title,
  size,
  sizes,
  priority,
}: {
  src?: string | null
  title: string
  size: number
  /** Rendered width hint when the box is fluid, e.g. "(max-width: 800px) 260px, 300px". */
  sizes?: string
  priority?: boolean
}) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return <PartIcon title={title} />
  }

  return (
    <Image
      src={src}
      alt={title}
      width={size}
      height={size}
      sizes={sizes ?? `${size}px`}
      priority={priority}
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}
