import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { Worker } from "worker_threads"
import { PARTS_CATALOG_MODULE } from "../../../modules/parts-catalog"
import PartsCatalogModuleService from "../../../modules/parts-catalog/service"
import { isAllowed, parseRobots } from "../../../modules/parts-catalog/utils/robots"

export const USER_AGENT = "AutoPartsPpUaBot/1.0 (+https://auto-parts.pp.ua)"
// A product gets at most this many photos copied, on its first opening.
export const MAX_PHOTOS_PER_PRODUCT = 4
const MAX_ATTEMPTS = 3
const RETRY_AFTER_MS = 60 * 60 * 1000
const HOST_INTERVAL_MS = 3000
const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000
const MAX_BYTES = 8 * 1024 * 1024
const MAX_SIDE = 800
// Margins are cropped only while the photo stays at least this large.
const MIN_CROPPED_SIDE = 300
const RESIZE_TIMEOUT_MS = 60000
const TIMEOUT_MS = 20000
const TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_WEBP_PIXELS = 20_000_000

type Robots = { rules: ReturnType<typeof parseRobots> | null; at: number }

// Process-wide, so every product shares one pace per host.
const robotsCache = new Map<string, Robots>()
const lastHit = new Map<string, number>()

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function politeFetch(url: URL) {
  const pause = (lastHit.get(url.host) ?? 0) + HOST_INTERVAL_MS - Date.now()

  if (pause > 0) {
    await wait(pause)
  }

  lastHit.set(url.host, Date.now())

  return fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
}

/** null: robots.txt could not be read now, so do not fetch and try later. */
async function robotsAllow(url: URL): Promise<boolean | null> {
  const key = `${url.protocol}//${url.host}`
  let cached = robotsCache.get(key)

  if (!cached || Date.now() - cached.at > ROBOTS_TTL_MS) {
    try {
      const response = await politeFetch(new URL("/robots.txt", key))
      // 4xx means there is no robots.txt: everything is allowed.
      const rules =
        response.ok
          ? parseRobots(await response.text(), USER_AGENT)
          : response.status >= 400 && response.status < 500
            ? []
            : null
      cached = { rules, at: Date.now() }
    } catch {
      cached = { rules: null, at: Date.now() }
    }
    robotsCache.set(key, cached)
  }

  return cached.rules ? isAllowed(cached.rules, url.pathname + url.search) : null
}

const isPrivateHost = (host: string) =>
  host === "localhost" ||
  host.endsWith(".localhost") ||
  host.endsWith(".local") ||
  /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
  host.startsWith("[")

class Skip extends Error {}

// Decoding a large JPEG in plain JavaScript takes seconds on this server, so
// it runs in a worker thread and the API keeps answering meanwhile.
const RESIZE_WORKER = `
const { parentPort, workerData } = require("worker_threads")
const { Jimp } = require("jimp")

;(async () => {
  const { body, maxSide, minSide } = workerData
  const original = await Jimp.read(Buffer.from(body))
  // Catalogue shots sit on wide white margins; keep a thin border.
  const cropped = original.clone().autocrop({ tolerance: 0.02, leaveBorder: 12 })
  const image = Math.max(cropped.width, cropped.height) >= minSide ? cropped : original

  if (image.width > maxSide || image.height > maxSide) {
    image.scaleToFit({ w: maxSide, h: maxSide })
  }

  parentPort.postMessage(await image.getBuffer("image/jpeg", { quality: 82 }))
})()
`

// sharp converts WebP (ZF photos), but its prebuilt binaries refuse the
// server's old CPU ("Unsupported CPU") and a top-level import kept the whole
// backend from starting. It is loaded only when a WebP photo arrives; where it
// cannot load, WebP photos are skipped and everything else keeps working.
type SharpFactory = (
  input: Buffer,
  options: { limitInputPixels: number }
) => { png: (options: { compressionLevel: number }) => { toBuffer: () => Promise<Buffer> } }

let sharpFactory: SharpFactory | null | undefined

async function loadSharp(): Promise<SharpFactory | null> {
  if (sharpFactory === undefined) {
    try {
      const loaded = (await import("sharp")) as unknown as { default?: SharpFactory }
      sharpFactory = loaded.default ?? (loaded as unknown as SharpFactory)
    } catch {
      sharpFactory = null
    }
  }

  return sharpFactory
}

function shrink(body: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(RESIZE_WORKER, {
      eval: true,
      workerData: { body, maxSide: MAX_SIDE, minSide: MIN_CROPPED_SIDE },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    })
    const timer = setTimeout(() => {
      void worker.terminate()
      reject(new Error("resize timed out"))
    }, RESIZE_TIMEOUT_MS)
    const finish = () => clearTimeout(timer)

    worker.once("message", (data: Uint8Array) => {
      finish()
      resolve(Buffer.from(data))
      void worker.terminate()
    })
    worker.once("error", (error) => {
      finish()
      reject(error)
    })
    worker.once("exit", (code) => {
      finish()
      reject(new Error(`resize stopped (${code})`))
    })
  })
}

/** The photo, shrunk to MAX_SIDE and re-encoded as JPEG. */
async function download(address: string): Promise<Buffer> {
  const url = new URL(address)

  if (!["https:", "http:"].includes(url.protocol) || isPrivateHost(url.hostname)) {
    throw new Skip("address is not a public web address")
  }

  const allowed = await robotsAllow(url)

  if (allowed === false) {
    throw new Skip("robots.txt disallows this address")
  }
  if (allowed === null) {
    throw new Error("robots.txt could not be read")
  }

  const response = await politeFetch(url)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim()

  if (!TYPES.includes(type)) {
    throw new Error(`unsupported type ${type || "unknown"}`)
  }
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) {
    throw new Error("file is too large")
  }

  const body = Buffer.from(await response.arrayBuffer())

  if (body.length > MAX_BYTES) {
    throw new Error("file is too large")
  }

  let resizeBody = body

  if (type === "image/webp") {
    const sharp = await loadSharp()

    if (!sharp) {
      throw new Skip("WebP photos need sharp, which cannot run on this machine")
    }

    resizeBody = await sharp(body, { limitInputPixels: MAX_WEBP_PIXELS })
      .png({ compressionLevel: 1 })
      .toBuffer()
  }

  return shrink(resizeBody)
}

export type FetchProductPhotosInput = { product_id: string }

export type PhotoOutcome = {
  id: string
  attempts: number
  status: "stored" | "pending" | "failed" | "skipped"
  error: string | null
}

export type FetchedPhotos = {
  files: { filename: string; mimeType: string; content: string; access: "public" }[]
  // Same order as files: the part image each file was made from.
  stored_ids: string[]
  // Every image tried, with what happened, except the stored file URL.
  outcomes: PhotoOutcome[]
}

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "part"

/**
 * Downloads the photos a product's part numbers have at their sources, when
 * the product has none of its own yet. Nothing is written here.
 */
export const fetchProductPhotosStep = createStep(
  "fetch-product-photos",
  async ({ product_id }: FetchProductPhotosInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const catalog = container.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)
    const empty: FetchedPhotos = { files: [], stored_ids: [], outcomes: [] }

    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "status",
        "thumbnail",
        "images.id",
        "variants.part_numbers.id",
        "variants.part_numbers.display_number",
        "variants.part_numbers.brand.name",
      ],
      filters: { id: product_id },
    })
    const product = products[0] as
      | {
          status: string
          thumbnail: string | null
          images?: { id: string }[] | null
          variants?: {
            part_numbers?:
              | { id: string; display_number: string; brand?: { name: string } | null }[]
              | null
          }[]
        }
      | undefined

    if (!product || product.status !== "published" || product.thumbnail || product.images?.length) {
      return new StepResponse(empty)
    }

    const numbers = new Map(
      (product.variants ?? [])
        .flatMap((variant) => variant.part_numbers ?? [])
        .filter(Boolean)
        .map((number) => [number.id, number])
    )

    if (!numbers.size) {
      return new StepResponse(empty)
    }

    const now = Date.now()
    const candidates = (
      await catalog.listPartImages(
        { part_number_id: [...numbers.keys()], status: "pending" },
        { order: { position: "ASC" }, take: 50 }
      )
    ).filter(
      (image) =>
        image.attempts < MAX_ATTEMPTS &&
        (!image.fetched_at || now - new Date(image.fetched_at).getTime() > RETRY_AFTER_MS)
    )
    const result: FetchedPhotos = { files: [], stored_ids: [], outcomes: [] }
    const seen = new Set<string>()

    for (const image of candidates) {
      if (result.files.length >= MAX_PHOTOS_PER_PRODUCT) {
        break
      }
      // Several numbers of one product can point at the same photo.
      if (seen.has(image.source_url)) {
        continue
      }
      seen.add(image.source_url)

      const attempts = image.attempts + 1

      try {
        const content = await download(image.source_url)
        const number = numbers.get(image.part_number_id)
        const name = slug(`${number?.brand?.name ?? ""} ${number?.display_number ?? ""}`)

        result.files.push({
          filename: `${name}-${result.files.length + 1}.jpg`,
          mimeType: "image/jpeg",
          content: content.toString("base64"),
          access: "public",
        })
        result.stored_ids.push(image.id)
        result.outcomes.push({ id: image.id, attempts, status: "stored", error: null })
      } catch (error) {
        const message = (error as Error).message?.slice(0, 500) || "download failed"
        const status =
          error instanceof Skip ? "skipped" : attempts >= MAX_ATTEMPTS ? "failed" : "pending"

        logger.info(`Product photo ${image.source_url}: ${message}`)
        result.outcomes.push({ id: image.id, attempts, status, error: message })
      }
    }

    return new StepResponse(result)
  }
)

export type MarkPartImagesInput = {
  outcomes: PhotoOutcome[]
  // File URL by part image id, for the images that were stored.
  file_urls: Record<string, string>
}

export const markPartImagesStep = createStep(
  "mark-part-images",
  async ({ outcomes, file_urls }: MarkPartImagesInput, { container }) => {
    const catalog = container.resolve<PartsCatalogModuleService>(PARTS_CATALOG_MODULE)
    const fetchedAt = new Date()

    for (const outcome of outcomes) {
      const fileUrl = file_urls[outcome.id] ?? null

      await catalog.updatePartImages({
        id: outcome.id,
        attempts: outcome.attempts,
        // A download whose file was not saved is retried later.
        status: outcome.status === "stored" && !fileUrl ? "pending" : outcome.status,
        file_url: fileUrl,
        error: outcome.error,
        fetched_at: fetchedAt,
      })
    }

    return new StepResponse(outcomes.length)
  }
)
