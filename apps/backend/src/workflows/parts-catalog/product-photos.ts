import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  updateProductsWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  fetchProductPhotosStep,
  FetchProductPhotosInput,
  markPartImagesStep,
} from "./steps/product-photos"

/**
 * Copies the photos a product's part numbers have at their sources into the
 * shop's own files and makes them the product's images. Runs when a shopper
 * opens a product that has no photos yet.
 */
export const storeProductPhotosWorkflow = createWorkflow(
  "store-product-photos",
  function (input: FetchProductPhotosInput) {
    const fetched = fetchProductPhotosStep(input)

    const uploaded = when({ fetched }, (data) => data.fetched.files.length > 0).then(() => {
      const files = uploadFilesWorkflow.runAsStep({
        input: transform({ fetched }, (data) => ({ files: data.fetched.files })),
      })

      updateProductsWorkflow.runAsStep({
        input: transform({ files, input }, (data) => ({
          products: [
            {
              id: data.input.product_id,
              thumbnail: data.files[0].url,
              images: data.files.map((file) => ({ url: file.url })),
            },
          ],
        })),
      })

      return files
    })

    const marked = when({ fetched }, (data) => data.fetched.outcomes.length > 0).then(() =>
      markPartImagesStep(
        transform({ fetched, uploaded }, (data) => ({
          outcomes: data.fetched.outcomes,
          file_urls: Object.fromEntries(
            (data.uploaded ?? []).map((file, index) => [
              data.fetched.stored_ids[index],
              file.url,
            ])
          ),
        }))
      )
    )

    return new WorkflowResponse({ stored: uploaded, marked })
  }
)
