"use client"

import PartImage from "@modules/catalog/components/part-image"
import { useState } from "react"

/** Main product photo with a row of thumbnails when there is more than one. */
export default function PdpGallery({
  photos,
  title,
}: {
  photos: string[]
  title: string
}) {
  const [current, setCurrent] = useState(0)
  const photo = photos[current]

  return (
    <div className="ap-pdp-gallery">
      <div className="ap-pdp-img">
        <PartImage
          key={photo}
          src={photo}
          title={title}
          size={600}
          sizes="(max-width: 800px) 260px, (max-width: 1100px) 220px, 300px"
          priority
        />
      </div>
      {photos.length > 1 && (
        <div className="ap-pdp-thumbs" role="group" aria-label="Фото товару">
          {photos.map((url, index) => (
            <button
              key={url}
              type="button"
              className="ap-pdp-thumb"
              aria-pressed={index === current}
              aria-label={`Фото ${index + 1} з ${photos.length}`}
              onClick={() => setCurrent(index)}
            >
              <PartImage src={url} title={`${title}, фото ${index + 1}`} size={56} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
