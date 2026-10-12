import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import { Button, Container, Heading, Label, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Link } from "react-router-dom"
import { OptionSelect } from "../components/parts-catalog/forms"
import { sdk } from "../lib/client"
import {
  Brand,
  CATALOG_QUERY_KEY,
  errorMessage,
  NUMBER_TYPE_LABELS,
} from "../lib/parts-catalog"

type Variant = {
  id: string
  title: string | null
  sku: string | null
  part_numbers?:
    | ({
        id: string
        display_number: string
        number_type: string
        brand?: { id: string; name: string } | null
      } | null)[]
    | null
}

const ProductPartNumbersWidget = ({
  data: product,
}: DetailWidgetProps<HttpTypes.AdminProduct>) => {
  const queryClient = useQueryClient()
  const [brandId, setBrandId] = useState("")
  const [numberType, setNumberType] = useState("aftermarket")
  const queryKey = [CATALOG_QUERY_KEY, "product", product.id]

  const { data } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ variants: Variant[] }>(
        `/admin/parts-catalog/products/${product.id}`
      ),
    queryKey,
  })
  const { data: brands } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ brands: Brand[] }>("/admin/parts-catalog/brands", {
        query: { limit: 100 },
      }),
    queryKey: [CATALOG_QUERY_KEY, "brands", "options"],
  })

  const mutation = useMutation({
    mutationFn: () =>
      sdk.client.fetch<{
        linked: number
        numbers_created: number
        variants_without_sku: number
      }>(`/admin/parts-catalog/products/${product.id}`, {
        method: "POST",
        body: { brand_id: brandId, number_type: numberType },
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [CATALOG_QUERY_KEY] })
      toast.success(
        `Прив'язано варіантів: ${result.linked}, нових номерів у черзі парсерів: ${result.numbers_created}` +
          (result.variants_without_sku
            ? `. Без артикула: ${result.variants_without_sku}`
            : "")
      )
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const variants = data?.variants ?? []
  const brandOptions = Object.fromEntries(
    (brands?.brands ?? []).map((brand) => [brand.id, brand.name])
  )

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h2">Каталог номерів</Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Артикул варіанта стає номером у каталозі, і парсери шукають для
          нього аналоги та застосовність.
        </Text>
      </div>
      <div className="flex flex-col gap-y-2 px-6 py-4">
        {variants.length === 0 && (
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            У товару ще немає варіантів.
          </Text>
        )}
        {variants.map((variant) => {
          const numbers = (variant.part_numbers ?? []).filter(
            (item): item is NonNullable<typeof item> => Boolean(item)
          )

          return (
            <div
              key={variant.id}
              className="flex items-start justify-between gap-x-3"
            >
              <Text size="small" leading="compact" weight="plus">
                {variant.sku || "без артикула"}
              </Text>
              <div className="flex flex-col items-end gap-y-1">
                {numbers.map((number) => (
                  <Link
                    key={number.id}
                    to={`/parts-catalog/${number.id}`}
                    className="text-ui-fg-interactive"
                  >
                    <Text size="small" leading="compact">
                      {number.brand?.name} {number.display_number}
                    </Text>
                  </Link>
                ))}
                {numbers.length === 0 && (
                  <Text
                    size="small"
                    leading="compact"
                    className="text-ui-fg-subtle"
                  >
                    не в каталозі
                  </Text>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div className="flex flex-col gap-y-2">
          <Label size="small" weight="plus">
            Бренд
          </Label>
          <OptionSelect
            value={brandId}
            onChange={setBrandId}
            options={brandOptions}
            placeholder="Оберіть бренд"
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label size="small" weight="plus">
            Тип номера
          </Label>
          <OptionSelect
            value={numberType}
            onChange={setNumberType}
            options={NUMBER_TYPE_LABELS}
          />
        </div>
        <div>
          <Button
            size="small"
            onClick={() => mutation.mutate()}
            disabled={!brandId || mutation.isPending}
            isLoading={mutation.isPending}
          >
            Додати до каталогу
          </Button>
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.side",
})

export default ProductPartNumbersWidget
