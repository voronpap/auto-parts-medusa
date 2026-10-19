"use client"

import { useState } from "react"

type Video = { title: string; youtube_id: string }

/**
 * Makers' videos (fitting, what to check) from YouTube. The player loads
 * only when a video is started, so the page stays light and YouTube is not
 * contacted by people who do not watch.
 */
export default function PartVideos({ videos }: { videos: Video[] }) {
  const [playing, setPlaying] = useState<string | null>(null)

  return (
    <div className="ap-videos">
      {videos.map((video) => (
        <figure key={video.youtube_id} className="ap-video">
          {playing === video.youtube_id ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${video.youtube_id}?autoplay=1&rel=0`}
              title={video.title}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          ) : (
            <button type="button" onClick={() => setPlaying(video.youtube_id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://i.ytimg.com/vi/${video.youtube_id}/hqdefault.jpg`}
                alt=""
                loading="lazy"
              />
              <span aria-hidden="true">▶</span>
              <span className="sr-only">Дивитися: {video.title}</span>
            </button>
          )}
          <figcaption>{video.title}</figcaption>
        </figure>
      ))}
    </div>
  )
}
