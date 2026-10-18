import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { sdk } from "../../../lib/client"

type StockSettings = {
  settings: { hold_minutes: number; backorder_label: string }
  holds: {
    id: string
    cart_id: string
    title: string
    sku: string | null
    quantity: number
    expires_at: string
  }[]
}

const KEY = ["stock-settings"]
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Сталася помилка"

const StockPage = () => {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryFn: () => sdk.client.fetch<StockSettings>("/admin/stock/settings"),
    queryKey: KEY,
    refetchInterval: 30_000,
  })
  const [minutes, setMinutes] = useState("15")
  const [label, setLabel] = useState("")

  useEffect(() => {
    if (data) {
      setMinutes(String(data.settings.hold_minutes))
      setLabel(data.settings.backorder_label)
    }
  }, [data])

  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/stock/settings", {
        method: "POST",
        body: {
          hold_minutes: Number.parseInt(minutes, 10) || 15,
          backorder_label: label.trim() || "Під замовлення",
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY })
      toast.success("Налаштування збережено")
    },
    onError: (error) => toast.error(message(error)),
  })

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-1 px-6 py-4">
          <Heading level="h1">Наявність</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Залишки ведуться на складі (Товари → Запаси). На вітрині доступно:
            залишок мінус резерви оформлених замовлень мінус товар, який інші
            покупці тримають у кошику. Резерв замовлення знімається при
            відвантаженні або скасуванні. Коли товару немає, його можна
            замовити «під замовлення».
          </Text>
        </div>
        <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-2">
          <div className="flex flex-col gap-y-2">
            <Label size="small" weight="plus">
              Тримати товар у кошику, хв
            </Label>
            <Input
              type="number"
              min={1}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
            <Text size="xsmall" className="text-ui-fg-subtle">
              Відлік починається знову з кожною зміною кошика.
            </Text>
          </div>
          <div className="flex flex-col gap-y-2">
            <Label size="small" weight="plus">
              Напис, коли товару немає
            </Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Під замовлення"
            />
            <Text size="xsmall" className="text-ui-fg-subtle">
              Наприклад: «Під замовлення, 3–7 днів».
            </Text>
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
          <Heading level="h2">Утримується в кошиках</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {data?.holds.length
              ? "Товар, який покупці тримають у кошику зараз."
              : "Зараз ніхто нічого не тримає."}
          </Text>
        </div>
        {(data?.holds.length ?? 0) > 0 && (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Товар</Table.HeaderCell>
                <Table.HeaderCell>Кількість</Table.HeaderCell>
                <Table.HeaderCell>До</Table.HeaderCell>
                <Table.HeaderCell>Кошик</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data!.holds.map((hold) => (
                <Table.Row key={hold.id}>
                  <Table.Cell>
                    {hold.title}
                    {hold.sku ? ` · ${hold.sku}` : ""}
                  </Table.Cell>
                  <Table.Cell>{hold.quantity}</Table.Cell>
                  <Table.Cell>
                    {new Date(hold.expires_at).toLocaleTimeString("uk-UA", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Table.Cell>
                  <Table.Cell className="font-mono text-xs">{hold.cart_id}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Наявність",
})

export default StockPage
