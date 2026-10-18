import { Metadata } from "next"
import { notFound } from "next/navigation"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { retrievePartsCatalog } from "@lib/data/parts-catalog"
import ProductTemplate from "@modules/products/templates"
import { HttpTypes } from "@medusajs/types"
import { isAvailable } from "@modules/catalog/components/product-table"
import {
  absoluteUrl,
  breadcrumbList,
  JsonLd,
  organization,
} from "@modules/seo/json-ld"

type Props = {
  params: Promise<{ countryCode: string; handle: string }>
  searchParams: Promise<{ v_id?: string }>
}

function getImagesForVariant(
  product: HttpTypes.StoreProduct,
  selectedVariantId?: string,
) {
  if (!selectedVariantId || !product.variants) {
    return product.images
  }

  const variant = product.variants!.find((v) => v.id === selectedVariantId)
  if (!variant || !variant.images?.length) {
    return product.images
  }

  const imageIdsMap = new Map(variant.images!.map((i) => [i.id, true]))
  return product.images?.filter((i) => imageIdsMap.has(i.id)) ?? null
}

type PricedVariant = HttpTypes.StoreProductVariant & {
  calculated_price?: { calculated_amount?: number; currency_code?: string }
}

/** Product + Offer for rich results: the cheapest priced variant and its stock. */
async function productJsonLd(
  product: HttpTypes.StoreProduct,
  path: string,
  image?: string | null
) {
  const catalog = await retrievePartsCatalog(product.id)
  const number = catalog.numbers[0]
  const variant = ((product.variants ?? []) as PricedVariant[])
    .filter((item) => item.calculated_price?.calculated_amount != null)
    .sort(
      (a, b) =>
        a.calculated_price!.calculated_amount! -
        b.calculated_price!.calculated_amount!
    )[0]

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    url: absoluteUrl(path),
    ...(product.description ? { description: product.description } : {}),
    ...(image ? { image: absoluteUrl(image) } : {}),
    ...(number
      ? { brand: { "@type": "Brand", name: number.brand }, mpn: number.number }
      : {}),
    ...(variant?.sku ? { sku: variant.sku } : {}),
    ...(variant
      ? {
          offers: {
            "@type": "Offer",
            url: absoluteUrl(path),
            price: variant.calculated_price!.calculated_amount!.toFixed(2),
            priceCurrency: (
              variant.calculated_price!.currency_code || "uah"
            ).toUpperCase(),
            availability: !isAvailable(variant)
              ? "https://schema.org/OutOfStock"
              : variant.manage_inventory && (variant.inventory_quantity ?? 0) <= 0
              ? "https://schema.org/BackOrder"
              : "https://schema.org/InStock",
            itemCondition: "https://schema.org/NewCondition",
            seller: organization(),
          },
        }
      : {}),
  }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const params = await props.params
  const { handle } = params
  const region = await getRegion(params.countryCode)

  if (!region) {
    notFound()
  }

  const product = await listProducts({
    countryCode: params.countryCode,
    queryParams: { handle },
  }).then(({ response }) => response.products[0])

  if (!product) {
    notFound()
  }

  return {
    title: product.title,
    description: `${product.title}`,
    // ?v_id and other parameters never make a second copy of the page.
    alternates: { canonical: `/${params.countryCode}/products/${handle}` },
    openGraph: {
      title: `${product.title} | Auto Parts`,
      description: `${product.title}`,
      images: product.thumbnail ? [product.thumbnail] : [],
    },
  }
}

export default async function ProductPage(props: Props) {
  const params = await props.params
  const region = await getRegion(params.countryCode)
  const searchParams = await props.searchParams

  const selectedVariantId = searchParams.v_id

  if (!region) {
    notFound()
  }

  const pricedProduct = await listProducts({
    countryCode: params.countryCode,
    queryParams: { handle: params.handle },
  }).then(({ response }) => response.products[0])

  if (!pricedProduct) {
    notFound()
  }

  const images = getImagesForVariant(pricedProduct, selectedVariantId)
  const path = `/${params.countryCode}/products/${params.handle}`

  return (
    <>
      <JsonLd
        data={await productJsonLd(
          pricedProduct,
          path,
          images?.[0]?.url || pricedProduct.thumbnail
        )}
      />
      <JsonLd
        data={breadcrumbList([
          ["Головна", `/${params.countryCode}`],
          ["Каталог", `/${params.countryCode}/store`],
          [pricedProduct.title, path],
        ])}
      />
      <ProductTemplate
        product={pricedProduct}
        region={region}
        countryCode={params.countryCode}
        images={images ?? []}
      />
    </>
  )
}
