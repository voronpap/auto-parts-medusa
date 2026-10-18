import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { DetailWidgetProps, HttpTypes } from "@medusajs/framework/types"
import { Badge, Container, Heading, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { sdk } from "../lib/client"

type OrderStock = {
  items: {
    id: string
    title: string
    sku: string | null
    quantity: number
    fulfilled_quantity: number
    backorder_quantity: number
    reservations: { id: string; quantity: number; location: string }[]
  }[]
}

// Which lines of an order are kept on the shelf for it, which wait for a
// supplier, and what has been shipped.
const OrderStockWidget = ({ data: order }: DetailWidgetProps<HttpTypes.AdminOrder>) => {
  const { data } = useQuery({
    queryFn: () => sdk.client.fetch<OrderStock>(`/admin/stock/orders/${order.id}`),
    queryKey: ["order-stock", order.id],
  })

  if (!data?.items.length) {
    return null
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h2">Резерви і під замовлення</Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Резерв тримає товар на складі за цим замовленням і знімається при
          відвантаженні або скасуванні.
        </Text>
      </div>
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Позиція</Table.HeaderCell>
            <Table.HeaderCell>К-сть</Table.HeaderCell>
            <Table.HeaderCell>Резерв</Table.HeaderCell>
            <Table.HeaderCell>Відвантажено</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {data.items.map((item) => {
            const reserved = item.reservations.reduce((sum, row) => sum + row.quantity, 0)

            return (
              <Table.Row key={item.id}>
                <Table.Cell>
                  <div className="flex flex-col gap-y-1 py-2">
                    <span>
                      {item.title}
                      {item.sku ? ` · ${item.sku}` : ""}
                    </span>
                    {item.backorder_quantity > 0 && (
                      <Badge size="2xsmall" color="orange" className="w-fit">
                        Під замовлення: {item.backorder_quantity} шт.
                      </Badge>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>{item.quantity}</Table.Cell>
                <Table.Cell>
                  {reserved
                    ? item.reservations
                        .map((row) => `${row.quantity} · ${row.location}`)
                        .join(", ")
                    : "—"}
                </Table.Cell>
                <Table.Cell>{item.fulfilled_quantity}</Table.Cell>
              </Table.Row>
            )
          })}
        </Table.Body>
      </Table>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "order.details.after",
})

export default OrderStockWidget
