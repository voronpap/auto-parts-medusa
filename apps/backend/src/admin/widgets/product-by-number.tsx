import { defineWidgetConfig } from "@medusajs/admin-sdk"
import {
  Badge,
  Button,
  Container,
  FocusModal,
  Heading,
  Input,
  Label,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FormEvent, useState } from "react"
import { useNavigate } from "react-router-dom"
import { sdk } from "../lib/client"
import { errorMessage, NUMBER_TYPE_LABELS } from "../lib/parts-catalog"

type Candidate = {
  brand: string
  number: string
  number_type: string
  title: string | null
  part_number_id: string | null
  product_id: string | null
  offers: {
    supplier: string
    price: number
    currency_code: string
    stock_quantity: number | null
  }[]
}

type Created = {
  product: { product_id: string; title: string; price: number }
}

const decimal = (value: string) =>
  Number.parseFloat(value.replace(/\s/g, "").replace(",", "."))

const ProductByNumberWidget = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [number, setNumber] = useState("")
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [brand, setBrand] = useState("")
  const [title, setTitle] = useState("")
  const [price, setPrice] = useState("")
  const [quantity, setQuantity] = useState("")

  const reset = () => {
    setNumber("")
    setCandidates(null)
    setPicked(null)
    setBrand("")
    setTitle("")
    setPrice("")
    setQuantity("")
  }

  const pick = (index: number | null, list: Candidate[]) => {
    const candidate = index == null ? null : list[index]

    setPicked(index)
    setBrand(candidate?.brand ?? "")
    setTitle(candidate?.title ?? "")
  }

  const search = useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ candidates: Candidate[] }>(
        "/admin/supply/product-draft",
        { query: { q: number.trim() } }
      ),
    onSuccess: ({ candidates: found }) => {
      setCandidates(found)
      const free = found.findIndex((candidate) => !candidate.product_id)

      pick(free >= 0 ? free : null, found)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const chosen = picked == null ? null : candidates?.[picked] ?? null
  const purchase = decimal(price)
  const ready =
    Boolean(brand.trim()) &&
    Boolean(title.trim()) &&
    Number.isFinite(purchase) &&
    purchase > 0 &&
    !chosen?.product_id

  const create = useMutation({
    mutationFn: () =>
      sdk.client.fetch<Created>("/admin/supply/product-draft", {
        method: "POST",
        body: {
          brand: brand.trim(),
          number: chosen?.number ?? number.trim(),
          number_type: chosen?.number_type ?? "aftermarket",
          title: title.trim(),
          purchase_price: purchase,
          quantity: Number.parseInt(quantity, 10) || 0,
        },
      }),
    onSuccess: ({ product }) => {
      queryClient.invalidateQueries()
      toast.success(
        `Створено. Ціна в магазині: ${product.price} грн. Кроси та застосовність збираються парсерами.`
      )
      setOpen(false)
      reset()
      navigate(`/products/${product.product_id}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const onSearch = (event: FormEvent) => {
    event.preventDefault()

    if (number.trim()) {
      search.mutate()
    }
  }

  return (
    <Container className="flex items-center justify-between px-6 py-4">
      <div>
        <Heading level="h2">Товар за номером запчастини</Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Введіть номер — бренд, назва, кроси й застосовність підтягнуться самі.
        </Text>
      </div>
      <FocusModal
        open={open}
        onOpenChange={(next) => {
          setOpen(next)

          if (!next) {
            reset()
          }
        }}
      >
        <FocusModal.Trigger asChild>
          <Button size="small">Створити за номером</Button>
        </FocusModal.Trigger>
        <FocusModal.Content>
          <FocusModal.Header>
            <FocusModal.Title asChild>
              <Heading level="h2">Новий товар за номером</Heading>
            </FocusModal.Title>
          </FocusModal.Header>
          <FocusModal.Body className="flex justify-center overflow-y-auto px-6 py-8">
            <div className="flex w-full max-w-[640px] flex-col gap-y-6">
              <form onSubmit={onSearch} className="flex items-end gap-x-2">
                <div className="flex flex-1 flex-col gap-y-2">
                  <Label size="small" weight="plus">
                    Номер запчастини
                  </Label>
                  <Input
                    autoFocus
                    placeholder="наприклад 0 451 103 314"
                    value={number}
                    onChange={(event) => setNumber(event.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={!number.trim()}
                  isLoading={search.isPending}
                >
                  Шукати
                </Button>
              </form>

              {candidates && (
                <div className="flex flex-col gap-y-2">
                  <Label size="small" weight="plus">
                    {candidates.length
                      ? "Знайдено"
                      : "Номер ще невідомий — вкажіть бренд і назву, решту зберуть парсери"}
                  </Label>
                  {candidates.map((candidate, index) => (
                    <button
                      key={`${candidate.brand}-${candidate.number_type}`}
                      type="button"
                      disabled={Boolean(candidate.product_id)}
                      onClick={() => pick(index, candidates)}
                      className={`flex flex-col gap-y-1 rounded-lg border px-4 py-3 text-left ${
                        picked === index
                          ? "border-ui-border-interactive bg-ui-bg-highlight"
                          : "border-ui-border-base"
                      } ${candidate.product_id ? "opacity-60" : ""}`}
                    >
                      <div className="flex items-center gap-x-2">
                        <Text size="small" leading="compact" weight="plus">
                          {candidate.brand} {candidate.number}
                        </Text>
                        <Badge size="2xsmall">
                          {NUMBER_TYPE_LABELS[candidate.number_type] ?? candidate.number_type}
                        </Badge>
                        {candidate.part_number_id && (
                          <Badge size="2xsmall" color="green">
                            є в каталозі
                          </Badge>
                        )}
                        {candidate.product_id && (
                          <Badge size="2xsmall" color="orange">
                            товар уже створено
                          </Badge>
                        )}
                      </div>
                      {candidate.title && (
                        <Text size="small" leading="compact" className="text-ui-fg-subtle">
                          {candidate.title}
                        </Text>
                      )}
                      {candidate.offers.map((offer) => (
                        <Text
                          key={offer.supplier}
                          size="xsmall"
                          leading="compact"
                          className="text-ui-fg-muted"
                        >
                          {offer.supplier}: {offer.price} {offer.currency_code.toUpperCase()}
                          {offer.stock_quantity != null
                            ? `, на складі ${offer.stock_quantity}`
                            : ""}
                        </Text>
                      ))}
                    </button>
                  ))}
                  {candidates.length > 0 && (
                    <button
                      type="button"
                      onClick={() => pick(null, candidates)}
                      className={`rounded-lg border px-4 py-3 text-left ${
                        picked == null
                          ? "border-ui-border-interactive bg-ui-bg-highlight"
                          : "border-ui-border-base"
                      }`}
                    >
                      <Text size="small" leading="compact">
                        Інший бренд — вкажу сам
                      </Text>
                    </button>
                  )}
                </div>
              )}

              {candidates && (
                <div className="flex flex-col gap-y-4">
                  <div className="flex flex-col gap-y-2">
                    <Label size="small" weight="plus">
                      Бренд
                    </Label>
                    <Input
                      value={brand}
                      disabled={picked != null}
                      onChange={(event) => setBrand(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-y-2">
                    <Label size="small" weight="plus">
                      Назва
                    </Label>
                    <Input
                      placeholder="наприклад Фільтр масляний"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>
                  <div className="flex gap-x-4">
                    <div className="flex flex-1 flex-col gap-y-2">
                      <Label size="small" weight="plus">
                        Закупівельна ціна, грн
                      </Label>
                      <Input
                        inputMode="decimal"
                        value={price}
                        onChange={(event) => setPrice(event.target.value)}
                      />
                    </div>
                    <div className="flex flex-1 flex-col gap-y-2">
                      <Label size="small" weight="plus">
                        Кількість на складі
                      </Label>
                      <Input
                        inputMode="numeric"
                        placeholder="0"
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                      />
                    </div>
                  </div>
                  <Text size="small" leading="compact" className="text-ui-fg-subtle">
                    Ціна в магазині рахується з закупівельної за націнкою з
                    налаштувань.
                  </Text>
                </div>
              )}
            </div>
          </FocusModal.Body>
          <FocusModal.Footer>
            <FocusModal.Close asChild>
              <Button size="small" variant="secondary">
                Скасувати
              </Button>
            </FocusModal.Close>
            <Button
              size="small"
              disabled={!ready}
              isLoading={create.isPending}
              onClick={() => create.mutate()}
            >
              Створити товар
            </Button>
          </FocusModal.Footer>
        </FocusModal.Content>
      </FocusModal>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.list.before",
})

export default ProductByNumberWidget
