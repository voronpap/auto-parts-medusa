import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { CheckCircleSolid, ExclamationCircle, Spinner } from "@medusajs/icons"
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FormEvent, ReactNode, useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { sdk } from "../lib/client"
import { errorMessage, NUMBER_TYPE_LABELS } from "../lib/parts-catalog"

type Candidate = {
  brand: string
  number: string
  number_type: string
  title: string | null
  part_number_id: string | null
  product_id: string | null
  found_in: string[]
  offers: {
    supplier: string
    price: number
    currency_code: string
    stock_quantity: number | null
  }[]
}

type Draft = {
  candidates: Candidate[]
  search: { status: "pending" | "done" | "failed"; age_seconds: number } | null
}

type Created = {
  product_id: string
  title: string
  price: number
  part_number_id: string
}

type Progress = {
  task: {
    status: "pending" | "claimed" | "done" | "failed"
    ahead: number
    errors: { source?: string | null; message: string }[]
  } | null
  relationships: number
  applications: number
  attributes: number
}

// How long the sources are waited for before the owner is let through.
const SOURCES_TIMEOUT_SECONDS = 75

const decimal = (value: string) =>
  Number.parseFloat(value.replace(/\s/g, "").replace(",", "."))

const Step = ({
  state,
  children,
}: {
  state: "busy" | "ok" | "warn"
  children: ReactNode
}) => (
  <div className="flex items-center gap-x-2">
    {state === "busy" && <Spinner className="text-ui-fg-muted animate-spin" />}
    {state === "ok" && <CheckCircleSolid className="text-ui-fg-interactive" />}
    {state === "warn" && <ExclamationCircle className="text-ui-tag-orange-icon" />}
    <Text size="small" leading="compact">
      {children}
    </Text>
  </div>
)

const ProductByNumberWidget = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [number, setNumber] = useState("")
  // The number being searched; empty until "Шукати" is pressed.
  const [asked, setAsked] = useState("")
  const [picked, setPicked] = useState<string | null>(null)
  const [brand, setBrand] = useState("")
  const [title, setTitle] = useState("")
  const [price, setPrice] = useState("")
  const [quantity, setQuantity] = useState("")
  const [created, setCreated] = useState<Created | null>(null)

  // The standard "Create" button of the page opens this window instead of
  // the blank form; the blank form stays reachable from inside the window.
  useEffect(() => {
    if (
      location.pathname.endsWith("/products/create") &&
      !(location.state as { manual?: boolean } | null)?.manual
    ) {
      navigate("/products", { replace: true })
      setOpen(true)
    }
  }, [location.pathname, location.state, navigate])

  const reset = () => {
    setNumber("")
    setAsked("")
    setPicked(null)
    setBrand("")
    setTitle("")
    setPrice("")
    setQuantity("")
    setCreated(null)
  }

  const start = useMutation({
    mutationFn: (q: string) =>
      sdk.client.fetch("/admin/supply/product-draft/search", {
        method: "POST",
        body: { q },
      }),
    onSuccess: (_, q) => {
      setPicked(null)
      setBrand("")
      setTitle("")
      setAsked(q)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const draft = useQuery({
    queryKey: ["product-draft", asked],
    enabled: Boolean(asked) && !created,
    queryFn: () =>
      sdk.client.fetch<Draft>("/admin/supply/product-draft", {
        query: { q: asked },
      }),
    // Asked again while the sources are still answering.
    refetchInterval: (query) => {
      const search = query.state.data?.search

      return search?.status === "pending" &&
        search.age_seconds < SOURCES_TIMEOUT_SECONDS
        ? 1500
        : false
    },
  })

  const candidates = draft.data?.candidates ?? []
  const search = draft.data?.search ?? null
  const sourcesBusy =
    !draft.data ||
    (search?.status === "pending" && search.age_seconds < SOURCES_TIMEOUT_SECONDS)
  const sourcesSilent = !sourcesBusy && search?.status !== "done"
  const local = candidates.filter((candidate) =>
    candidate.found_in.some(
      (place) => place === "каталог номерів" || place === "прайс постачальника"
    )
  ).length
  const keyOf = (candidate: Candidate) =>
    `${candidate.brand}|${candidate.number_type}`
  const chosen = candidates.find((candidate) => keyOf(candidate) === picked) ?? null
  // Nothing found anywhere: the brand has to be typed.
  const manual = Boolean(asked) && !sourcesBusy && (picked === "" || !candidates.length)

  const pick = (candidate: Candidate | null) => {
    setPicked(candidate ? keyOf(candidate) : "")
    setBrand(candidate?.brand ?? "")
    setTitle(candidate?.title ?? "")
  }

  // The only part of the number that has no product yet is chosen at once.
  useEffect(() => {
    const free = candidates.filter((candidate) => !candidate.product_id)

    if (picked == null && !sourcesBusy && free.length === 1) {
      pick(free[0])
    }
  }, [sourcesBusy, candidates.length])

  const purchase = decimal(price)
  const ready =
    Boolean(brand.trim()) &&
    Boolean(title.trim()) &&
    Number.isFinite(purchase) &&
    purchase > 0 &&
    !chosen?.product_id

  const create = useMutation({
    mutationFn: () =>
      sdk.client.fetch<{ product: Created }>("/admin/supply/product-draft", {
        method: "POST",
        body: {
          brand: brand.trim(),
          number: chosen?.number ?? asked,
          number_type: chosen?.number_type ?? "aftermarket",
          title: title.trim(),
          purchase_price: purchase,
          quantity: Number.parseInt(quantity, 10) || 0,
        },
      }),
    onSuccess: ({ product }) => {
      setCreated(product)
      queryClient.invalidateQueries({ queryKey: ["products"] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const progress = useQuery({
    queryKey: ["product-draft-progress", created?.part_number_id],
    enabled: Boolean(created),
    queryFn: () =>
      sdk.client.fetch<Progress>("/admin/supply/product-draft/progress", {
        query: { part_number_id: created!.part_number_id },
      }),
    refetchInterval: (query) => {
      const status = query.state.data?.task?.status

      return status === "done" || status === "failed" ? false : 3000
    },
  })

  const onSearch = (event: FormEvent) => {
    event.preventDefault()

    if (number.trim()) {
      start.mutate(number.trim())
    }
  }

  const task = progress.data?.task
  const collected = progress.data
    ? `кроси ${progress.data.relationships}, застосовність ${progress.data.applications}, характеристики ${progress.data.attributes}`
    : ""

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
            {created ? (
              <div className="flex w-full max-w-[640px] flex-col gap-y-6">
                <div className="flex flex-col gap-y-1">
                  <Heading level="h2">{created.title}</Heading>
                  <Text size="small" leading="compact" className="text-ui-fg-subtle">
                    Ціна в магазині: {created.price} грн
                  </Text>
                </div>
                <div className="flex flex-col gap-y-3 rounded-lg border px-4 py-4">
                  <Step state="ok">Товар створено й опубліковано</Step>
                  {!task && <Step state="busy">Ставлю номер у чергу парсерів…</Step>}
                  {task?.status === "pending" && (
                    <Step state="busy">
                      У черзі парсерів
                      {task.ahead > 0 ? `, попереду номерів: ${task.ahead}` : ""}
                    </Step>
                  )}
                  {task && task.status !== "pending" && (
                    <Step state="ok">Парсери взяли номер у роботу</Step>
                  )}
                  {task?.status === "claimed" && (
                    <Step state="busy">
                      Джерела опитуються — зазвичай від пів хвилини до кількох
                      хвилин
                    </Step>
                  )}
                  {task?.status === "done" && (
                    <Step state="ok">Зібрано: {collected}</Step>
                  )}
                  {task?.status === "failed" && (
                    <Step state="warn">
                      Джерела не дали даних для цього номера
                      {collected ? ` (у каталозі: ${collected})` : ""}
                    </Step>
                  )}
                  {task?.status === "done" &&
                    task.errors.map((error, index) => (
                      <Step key={index} state="warn">
                        {error.source ?? "джерело"}: {error.message}
                      </Step>
                    ))}
                </div>
                <Text size="small" leading="compact" className="text-ui-fg-subtle">
                  Вікно можна закрити — збирання триває й без нього, дані
                  з'являться на сторінці товару.
                </Text>
              </div>
            ) : (
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
                    isLoading={start.isPending}
                  >
                    Шукати
                  </Button>
                </form>

                {asked && (
                  <div className="flex flex-col gap-y-2 rounded-lg border px-4 py-3">
                    {draft.data ? (
                      <Step state="ok">
                        Каталог номерів і прайси постачальників: {local}
                      </Step>
                    ) : (
                      <Step state="busy">Каталог номерів і прайси постачальників…</Step>
                    )}
                    {sourcesBusy && <Step state="busy">Зовнішні джерела й каталоги виробників — шукаю (до хвилини)…</Step>}
                    {!sourcesBusy && !sourcesSilent && (
                      <Step state="ok">
                        Зовнішні джерела: {candidates.length - local > 0 ? `ще ${candidates.length - local}` : "нічого нового"}
                      </Step>
                    )}
                    {sourcesSilent && (
                      <Step state="warn">Зовнішні джерела не відповіли</Step>
                    )}
                  </div>
                )}

                {asked && candidates.length > 0 && (
                  <div className="flex flex-col gap-y-2">
                    <Label size="small" weight="plus">
                      Оберіть запчастину
                    </Label>
                    {candidates.map((candidate) => (
                      <button
                        key={keyOf(candidate)}
                        type="button"
                        disabled={Boolean(candidate.product_id)}
                        onClick={() => pick(candidate)}
                        className={`flex flex-col gap-y-1 rounded-lg border px-4 py-3 text-left ${
                          picked === keyOf(candidate)
                            ? "border-ui-border-interactive bg-ui-bg-highlight"
                            : "border-ui-border-base"
                        } ${candidate.product_id ? "opacity-60" : ""}`}
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Text size="small" leading="compact" weight="plus">
                            {candidate.brand} {candidate.number}
                          </Text>
                          {candidate.title && (
                            <Text size="small" leading="compact">
                              — {candidate.title}
                            </Text>
                          )}
                          {candidate.number_type !== "aftermarket" && (
                            <Badge size="2xsmall">
                              {NUMBER_TYPE_LABELS[candidate.number_type] ?? candidate.number_type}
                            </Badge>
                          )}
                          {candidate.product_id && (
                            <Badge size="2xsmall" color="orange">
                              товар уже створено
                            </Badge>
                          )}
                        </div>
                        <Text size="xsmall" leading="compact" className="text-ui-fg-muted">
                          {candidate.found_in.join(", ")}
                        </Text>
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
                    {!sourcesBusy && (
                      <button
                        type="button"
                        onClick={() => pick(null)}
                        className="text-ui-fg-interactive self-start"
                      >
                        <Text size="small" leading="compact">
                          Потрібного бренду тут немає
                        </Text>
                      </button>
                    )}
                  </div>
                )}

                {manual && (
                  <div className="flex flex-col gap-y-2">
                    <Text size="small" leading="compact" className="text-ui-fg-subtle">
                      {candidates.length
                        ? "Вкажіть бренд — решту зберуть парсери."
                        : "Цього номера немає ні в каталозі, ні в прайсах, ні в джерелах. Вкажіть бренд — парсери спробують зібрати решту."}
                    </Text>
                    <Label size="small" weight="plus">
                      Бренд
                    </Label>
                    <Input value={brand} onChange={(event) => setBrand(event.target.value)} />
                  </div>
                )}

                {(chosen || manual) && (
                  <div className="flex flex-col gap-y-4">
                    <div className="flex flex-col gap-y-2">
                      <Label size="small" weight="plus">
                        Назва на вітрині
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
            )}
          </FocusModal.Body>
          <FocusModal.Footer>
            {created ? (
              <>
                <Button size="small" variant="secondary" onClick={reset}>
                  Створити ще
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    const id = created.product_id

                    setOpen(false)
                    reset()
                    navigate(`/products/${id}`)
                  }}
                >
                  Відкрити товар
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="small"
                  variant="transparent"
                  onClick={() => {
                    setOpen(false)
                    reset()
                    navigate("/products/create", { state: { manual: true } })
                  }}
                >
                  Заповнити вручну
                </Button>
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
              </>
            )}
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
