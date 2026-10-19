import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  catalogImageFile,
  copied,
  keepsMargins,
  queueCatalogImage,
  verifyCatalogImageKey,
} from "../../../../lib/catalog-images"
import { parsersDb } from "../../../../lib/parsers-db"

/**
 * A catalogue photo: the copy on this server once there is one, otherwise a
 * redirect to the source while the copy is queued. Addresses come signed from
 * the catalogue API; anything else is not found.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const id = verifyCatalogImageKey(req.params.key)

  if (!id) {
    return res.status(404).end()
  }

  const file = catalogImageFile(id)

  if (await copied(id)) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable")
    res.type("image/jpeg")

    return res.sendFile(file)
  }

  const db = parsersDb()
  const [image] = db
    ? ((await db("part_image").select("url", "kind").where("id", id)) as {
        url: string
        kind: string | null
      }[])
    : []

  if (!image?.url || !/^https?:\/\//.test(image.url)) {
    return res.status(404).end()
  }

  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)

  void queueCatalogImage(id, image.url, (message) => logger.warn(message), {
    crop: !keepsMargins(image.kind),
  })

  // Not cached, so the next view asks again and gets the copy.
  res.setHeader("Cache-Control", "no-store")

  return res.redirect(302, image.url)
}
