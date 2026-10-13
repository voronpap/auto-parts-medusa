import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Trash } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  IconButton,
  Input,
  Label,
  Switch,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { sdk } from "../../../lib/client"

type Pricing = {
  settings: {
    default_markup_percent: number | null
    rounding_step: number
    sync_stock: boolean
    last_applied_at: string | null
    last_result: Record<string, number> | null
  }
  rules: {
    id: string
    brand: string | null
    price_from: number | null
    price_to: number | null
    markup_percent: number
  }[]
}

const KEY = ["supply-pricing"]
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Сталася помилка"
const number = (value: string) => {
  const parsed = Number.parseFloat(value.replace(",", "."))

  return Number.isFinite(parsed) ? parsed : null
}
const money = (value: number | null) =>
  value == null ? "—" : `${new Intl.NumberFormat("uk-UA").format(value)} грн`

const PricingPage = () => {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryFn: () => sdk.client.fetch<Pricing>("/admin/supply/pricing"),
    queryKey: KEY,
  })
  const [markup, setMarkup] = useState("")
  const [rounding, setRounding] = useState("1")
  const [syncStock, setSyncStock] = useState(true)
  const [brand, setBrand] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [ruleMarkup, setRuleMarkup] = useState("")

  useEffect(() => {
    if (data) {
      setMarkup(
        data.settings.default_markup_percent != null
          ? String(data.settings.default_markup_percent)
          : ""
      )
      setRounding(String(data.settings.rounding_step))
      setSyncStock(data.settings.sync_stock)
    }
  }, [data])

  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY })
  const onError = (error: unknown) => toast.error(message(error))
  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/supply/pricing", {
        method: "POST",
        body: {
          default_markup_percent: markup.trim() ? number(markup) : null,
          rounding_step: number(rounding) ?? 1,
          sync_stock: syncStock,
        },
      }),
    onSuccess: () => {
      refresh()
      toast.success("Налаштування збережено")
    },
    onError,
  })
  const addRule = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/supply/pricing/rules", {
        method: "POST",
        body: {
          brand: brand.trim() || null,
          price_from: from.trim() ? number(from) : null,
          price_to: to.trim() ? number(to) : null,
          markup_percent: number(ruleMarkup) ?? 0,
        },
      }),
    onSuccess: () => {
      refresh()
      setBrand("")
      setFrom("")
      setTo("")
      setRuleMarkup("")
      toast.success("Правило додано")
    },
    onError,
  })
  const removeRule = useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch(`/admin/supply/pricing/rules/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError,
  })
  const apply = useMutation({
    mutationFn: () =>
      sdk.client.fetch<Record<string, number>>("/admin/supply/pricing/apply", {
        method: "POST",
      }),
    onSuccess: (result) => {
      refresh()
      toast.success(
        `Ціни змінено: ${result.prices_changed}, залишки: ${result.stock_changed}`
      )
    },
    onError,
  })
  const last = data?.settings.last_result

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-1 px-6 py-4">
          <Heading level="h1">Ціноутворення</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Ціна в магазині = закупівельна ціна постачальника + націнка,
            округлена вгору. Якщо товар пропонують кілька постачальників,
            береться найдешевша пропозиція, що є в наявності.
          </Text>
        </div>
        <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-3">
          <div className="flex flex-col gap-y-2">
            <Label size="small" weight="plus">
              Загальна націнка, %
            </Label>
            <Input
              value={markup}
              onChange={(e) => setMarkup(e.target.value)}
              placeholder="не задано"
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label size="small" weight="plus">
              Округлювати вгору до, грн
            </Label>
            <Input value={rounding} onChange={(e) => setRounding(e.target.value)} />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label size="small" weight="plus">
              Залишок постачальника як наявність
            </Label>
            <div className="flex h-8 items-center">
              <Switch checked={syncStock} onCheckedChange={setSyncStock} />
            </div>
          </div>
        </div>
        <div className="flex justify-end px-6 py-4">
          <Button size="small" onClick={() => save.mutate()} isLoading={save.isPending}>
            Зберегти
          </Button>
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-1 px-6 py-4">
          <Heading level="h2">Особливі націнки</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Для бренду, для діапазону закупівельної ціни або для обох одразу.
            Діє найточніше правило: бренд із діапазоном, потім бренд, потім
            діапазон, потім загальна націнка. Верхня межа діапазону до нього
            не входить.
          </Text>
        </div>
        {(data?.rules.length ?? 0) > 0 && (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Бренд</Table.HeaderCell>
                <Table.HeaderCell>Закупівля від</Table.HeaderCell>
                <Table.HeaderCell>до</Table.HeaderCell>
                <Table.HeaderCell>Націнка</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data!.rules.map((rule) => (
                <Table.Row key={rule.id}>
                  <Table.Cell>{rule.brand ?? "усі"}</Table.Cell>
                  <Table.Cell>{money(rule.price_from)}</Table.Cell>
                  <Table.Cell>{money(rule.price_to)}</Table.Cell>
                  <Table.Cell>{rule.markup_percent}%</Table.Cell>
                  <Table.Cell>
                    <div className="flex justify-end">
                      <IconButton
                        size="small"
                        variant="transparent"
                        onClick={() => removeRule.mutate(rule.id)}
                      >
                        <Trash />
                      </IconButton>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
        <div className="grid grid-cols-1 items-end gap-3 px-6 py-4 md:grid-cols-5">
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Бренд" />
          <Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Від, грн" />
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="До, грн" />
          <Input
            value={ruleMarkup}
            onChange={(e) => setRuleMarkup(e.target.value)}
            placeholder="Націнка, %"
          />
          <Button
            size="small"
            variant="secondary"
            disabled={number(ruleMarkup) == null}
            isLoading={addRule.isPending}
            onClick={() => addRule.mutate()}
          >
            Додати правило
          </Button>
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="flex items-start justify-between gap-x-4 px-6 py-4">
          <div className="flex flex-col gap-y-1">
            <Heading level="h2">Перерахунок</Heading>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Переносить ціни й залишки постачальників на товари магазину.
              Виконується також після кожного завантаження прайса.
              {data?.settings.last_applied_at
                ? ` Востаннє: ${new Date(data.settings.last_applied_at).toLocaleString("uk-UA")}.`
                : " Ще не виконувався."}
            </Text>
            {last && (
              <Text size="small" leading="compact">
                Товарів із пропозицією: {last.products_with_offer}; змінено цін:{" "}
                {last.prices_changed}; змінено залишків: {last.stock_changed}; без
                пропозиції: {last.without_offer}; без націнки: {last.without_markup}.
              </Text>
            )}
          </div>
          <Button size="small" onClick={() => apply.mutate()} isLoading={apply.isPending}>
            Перерахувати зараз
          </Button>
        </div>
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Ціноутворення",
})

export default PricingPage
