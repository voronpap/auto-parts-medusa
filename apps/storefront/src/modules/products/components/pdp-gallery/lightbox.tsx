"use client"

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react"
import Image from "next/image"
import { useRef } from "react"

// A horizontal move longer than this, mostly sideways, turns the photo.
const SWIPE_PX = 40

/**
 * Full-screen view of the product photos: arrows, ←/→ and swipe turn them;
 * the cross, Esc and a click on the dark background close it. Focus stays
 * inside while it is open and goes back to the photo that opened it.
 */
export default function Lightbox({
  photos,
  title,
  index,
  open,
  onIndex,
  onClose,
}: {
  photos: string[]
  title: string
  index: number
  open: boolean
  onIndex: (index: number) => void
  onClose: () => void
}) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const many = photos.length > 1
  const turn = (step: number) =>
    onIndex((index + step + photos.length) % photos.length)

  return (
    <Dialog open={open} onClose={onClose} className="ap-scope ap-lightbox">
      <DialogBackdrop className="ap-lightbox-backdrop" />
      <div className="ap-lightbox-frame">
        <DialogPanel
          className="ap-lightbox-panel"
          onKeyDown={(event) => {
            if (!many) return
            if (event.key === "ArrowLeft") turn(-1)
            if (event.key === "ArrowRight") turn(1)
          }}
          onTouchStart={(event) => {
            const touch = event.touches[0]
            start.current = { x: touch.clientX, y: touch.clientY }
          }}
          onTouchEnd={(event) => {
            const from = start.current
            const touch = event.changedTouches[0]
            start.current = null
            if (!from || !many) return
            const dx = touch.clientX - from.x
            const dy = touch.clientY - from.y
            if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) {
              turn(dx < 0 ? 1 : -1)
            }
          }}
        >
          <div className="ap-lightbox-bar">
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <span className="ap-lightbox-count" aria-live="polite">
              {index + 1} / {photos.length}
            </span>
            <button
              type="button"
              className="ap-lightbox-close"
              aria-label="Закрити перегляд фото"
              onClick={onClose}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="ap-lightbox-stage">
            <Image
              key={photos[index]}
              src={photos[index]}
              alt={`${title}, фото ${index + 1} з ${photos.length}`}
              width={1200}
              height={1200}
              sizes="92vw"
              draggable={false}
            />
            {many && (
              <>
                <button
                  type="button"
                  className="ap-lightbox-turn ap-lightbox-prev"
                  aria-label="Попереднє фото"
                  onClick={() => turn(-1)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m15 5-7 7 7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="ap-lightbox-turn ap-lightbox-next"
                  aria-label="Наступне фото"
                  onClick={() => turn(1)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m9 5 7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
