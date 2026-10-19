"use client"

import { useEffect, useRef, useState } from "react"

// Dragging this far turns the part by one frame.
const STEP_PX = 8

/**
 * A part turned around by dragging (mouse or finger) or with the arrow keys,
 * from the source's 360° frames. Frames load in the background after the
 * first one, so the first turn is smooth.
 */
export default function Spin360({ frames, title }: { frames: string[]; title: string }) {
  const [index, setIndex] = useState(0)
  const [loaded, setLoaded] = useState(1)
  const start = useRef<{ x: number; index: number } | null>(null)

  useEffect(() => {
    let cancelled = false

    frames.slice(1).forEach((src) => {
      const image = new Image()

      image.onload = image.onerror = () => {
        if (!cancelled) {
          setLoaded((count) => count + 1)
        }
      }
      image.src = src
    })

    return () => {
      cancelled = true
    }
  }, [frames])

  const turn = (by: number) =>
    setIndex((current) => (current + by + frames.length * 100) % frames.length)

  return (
    <figure className="ap-spin">
      <div
        className="ap-spin-stage"
        role="slider"
        tabIndex={0}
        aria-label={`${title}: огляд 360°, кадр ${index + 1} з ${frames.length}`}
        aria-valuemin={1}
        aria-valuemax={frames.length}
        aria-valuenow={index + 1}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          start.current = { x: event.clientX, index }
        }}
        onPointerMove={(event) => {
          if (!start.current) {
            return
          }

          const moved = Math.round((event.clientX - start.current.x) / STEP_PX)

          setIndex(
            (start.current.index - moved + frames.length * 100) % frames.length
          )
        }}
        onPointerUp={() => {
          start.current = null
        }}
        onPointerCancel={() => {
          start.current = null
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") turn(-1)
          if (event.key === "ArrowRight") turn(1)
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frames[index]} alt="" draggable={false} />
      </div>
      <figcaption>
        {loaded < frames.length
          ? `360° · завантаження ${Math.round((loaded / frames.length) * 100)}%`
          : "360° · потягніть, щоб обернути"}
      </figcaption>
    </figure>
  )
}
