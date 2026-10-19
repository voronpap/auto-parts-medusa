import { catalogImagePath, keepsMargins, queueCatalogImage } from "./catalog-images"
import type { ParsersDb } from "./parsers-db"

const MAX_PHOTOS = 40
const MAX_FRAMES = 72
const MAX_VIEWERS = 3

export type PartMedia = {
  /** Photos first, then drawings; addresses on this site. */
  images: string[]
  /** Frames of a 360° turn in order, from the source with the most. */
  spin: string[]
  /** Sources' own 3D viewers, opened on their sites. */
  viewers: string[]
  videos: { title: string; youtube_id: string }[]
}

const youtubeId = (url: string) =>
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url)?.[1] ??
  null

/** Whether a document link is a video that is shown as a player instead. */
export const isVideoLink = (url: string) => youtubeId(url) !== null

/**
 * Every photo, 360° frame, viewer and video the parsers' catalogue has for
 * these part rows. Opening them is what a buyer looks at, so all photos and
 * frames are queued for copying to this server at once, not only the ones
 * the page happens to show first.
 */
export async function partMedia(
  db: ParsersDb,
  partIds: (string | number)[],
  log: (message: string) => void
): Promise<PartMedia> {
  if (!partIds.length) {
    return { images: [], spin: [], viewers: [], videos: [] }
  }

  const [images, links] = await Promise.all([
    db("part_image")
      .select("id", "part_id", "url", "kind")
      .whereIn("part_id", partIds)
      .orderBy(["part_id", "position"])
      .limit(1000) as Promise<
      { id: string; part_id: string; url: string; kind: string | null }[]
    >,
    db("part_attribute")
      .select("name", "value")
      .whereIn("part_id", partIds)
      .where("grp", "Документи")
      .whereRaw("value ~* '(youtube\\.com|youtu\\.be)/'")
      .limit(50) as Promise<{ name: string; value: string }[]>,
  ])

  const web = images.filter((image) => /^https?:\/\//.test(image.url))
  const seenUrls = new Set<string>()
  const pictures = [
    ...web.filter((image) => image.kind === "photo" || !image.kind),
    ...web.filter((image) => image.kind === "drawing"),
  ]
    .filter((image) => !seenUrls.has(image.url) && seenUrls.add(image.url))
    .slice(0, MAX_PHOTOS)

  // Each source has its own turn; frames of two turns would not line up.
  const turns = new Map<string, typeof web>()

  for (const image of web.filter((image) => keepsMargins(image.kind))) {
    turns.set(String(image.part_id), [...(turns.get(String(image.part_id)) ?? []), image])
  }

  const frames = [...turns.values()]
    .sort((a, b) => b.length - a.length)[0]
    ?.slice(0, MAX_FRAMES) ?? []

  for (const image of [...pictures, ...frames]) {
    void queueCatalogImage(String(image.id), image.url, log, {
      crop: !keepsMargins(image.kind),
    })
  }

  const videos = new Map<string, string>()

  for (const link of links) {
    const id = youtubeId(link.value)

    if (id && !videos.has(id)) {
      videos.set(id, link.name)
    }
  }

  return {
    images: pictures.map((image) => catalogImagePath(image.id)),
    spin: frames.length >= 8 ? frames.map((image) => catalogImagePath(image.id)) : [],
    viewers: [...new Set(web.filter((image) => image.kind === "360").map((image) => image.url))].slice(
      0,
      MAX_VIEWERS
    ),
    videos: [...videos.entries()].map(([youtube_id, title]) => ({ title, youtube_id })),
  }
}
