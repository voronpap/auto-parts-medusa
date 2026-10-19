import { CatalogPart } from "@lib/data/catalog"
import PartVideos from "./part-videos"
import Spin360 from "./spin-360"

/**
 * The 360° view, the makers' own 3D viewers and videos of a part, as one
 * section under its photos. Renders nothing when the catalogue has none.
 */
export default function PartMedia({
  media,
  title,
}: {
  media: Pick<CatalogPart, "spin" | "viewers" | "videos">
  title: string
}) {
  if (!media.spin.length && !media.viewers.length && !media.videos.length) {
    return null
  }

  return (
    <section className="ap-section ap-card" id="media">
      <div className="ap-section-head">
        <h2>Огляд 360° і відео</h2>
      </div>
      <div className="ap-media">
        {media.spin.length > 0 && <Spin360 frames={media.spin} title={title} />}
        {media.videos.length > 0 && <PartVideos videos={media.videos} />}
        {media.viewers.length > 0 && (
          <p className="ap-hint">
            3D-модель на сайті виробника:{" "}
            {media.viewers.map((url, index) => (
              <span key={url}>
                {index > 0 ? ", " : ""}
                <a className="ap-link" href={url} target="_blank" rel="noopener noreferrer nofollow">
                  відкрити {media.viewers.length > 1 ? index + 1 : ""}
                </a>
              </span>
            ))}
          </p>
        )}
      </div>
    </section>
  )
}
