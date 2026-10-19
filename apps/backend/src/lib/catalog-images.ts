import { createHmac, timingSafeEqual } from "node:crypto"
import { mkdir, rename, stat, statfs, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { download } from "../workflows/parts-catalog/steps/product-photos"

/**
 * Photos of the parsers' catalogue are hot-linked from their sources until
 * someone opens them; the first opening queues a copy on this server and
 * later openings get the copy. Only addresses this backend handed out (signed
 * with the cookie secret) are copied, so nobody can make it fetch the whole
 * catalogue.
 */

// Outside the backend's runtime folder, which every deploy replaces.
export const CATALOG_IMAGES_DIR =
  process.env.CATALOG_IMAGES_DIR ?? join(homedir(), "catalog-images")

// Below this much free disk the photos are only redirected, not copied.
const MIN_FREE_BYTES = 5 * 1024 ** 3
const MAX_QUEUE = 2000
const PREFIX = "/static/catalog/"

const secret = () =>
  process.env.COOKIE_SECRET || process.env.JWT_SECRET || "catalog-images"

const signature = (id: string) =>
  createHmac("sha256", secret()).update(`catalog-image:${id}`).digest("base64url").slice(0, 12)

/** Address on this site for part_image row `id` of the parsers database. */
export const catalogImagePath = (id: string | number) =>
  `${PREFIX}${id}-${signature(String(id))}.jpg`

/** The image id when `key` ("<id>-<signature>.jpg") was signed here. */
export function verifyCatalogImageKey(key: string): string | null {
  const match = /^(\d{1,15})-([A-Za-z0-9_-]{12})\.jpg$/.exec(key)

  if (!match) {
    return null
  }

  const expected = Buffer.from(signature(match[1]))
  const given = Buffer.from(match[2])

  return expected.length === given.length && timingSafeEqual(expected, given)
    ? match[1]
    : null
}

export const catalogImageFile = (id: string) => join(CATALOG_IMAGES_DIR, `${id}.jpg`)

/** Whether photo `id` is already copied to this server. */
export const copied = (id: string) =>
  stat(catalogImageFile(id)).then(
    (info) => info.isFile() && info.size > 0,
    () => false
  )

// One copy at a time: the download waits its turn per host and the resize
// takes a CPU core, and the shop must keep answering meanwhile.
const queue = new Map<string, { url: string; crop: boolean }>()
let running = false
// A photo that could not be copied is retried a day later, not on every view.
const failed = new Map<string, number>()
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000

async function work(log: (message: string) => void) {
  running = true

  try {
    await mkdir(CATALOG_IMAGES_DIR, { recursive: true })

    while (queue.size) {
      const [id, { url, crop }] = queue.entries().next().value as [
        string,
        { url: string; crop: boolean },
      ]

      try {
        const disk = await statfs(CATALOG_IMAGES_DIR)

        if (disk.bavail * disk.bsize < MIN_FREE_BYTES) {
          log("catalog images: disk nearly full, copies paused")
          queue.clear()
          break
        }

        const body = await download(url, { crop })
        const file = catalogImageFile(id)
        const temporary = `${file}.${process.pid}.tmp`

        await writeFile(temporary, body)
        await rename(temporary, file)
      } catch (error) {
        failed.set(id, Date.now())
        log(`catalog image ${id} not copied: ${(error as Error).message}`)
      } finally {
        queue.delete(id)
      }
    }
  } finally {
    running = false
  }
}

/** Frames of a 360° turn are not cropped, so the part stays in place. */
export const keepsMargins = (kind: string | null) => kind === "photo360"

/**
 * Queues a copy of photo `id` from `url` unless it is already on disk;
 * repeated calls are ignored.
 */
export async function queueCatalogImage(
  id: string,
  url: string,
  log: (message: string) => void,
  { crop = true }: { crop?: boolean } = {}
) {
  if (await copied(id)) {
    return
  }

  if (queue.has(id) || queue.size >= MAX_QUEUE) {
    return
  }

  if (Date.now() - (failed.get(id) ?? 0) < RETRY_AFTER_MS) {
    return
  }

  failed.delete(id)

  queue.set(id, { url, crop })

  if (!running) {
    void work(log)
  }
}
