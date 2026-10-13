import { HttpTypes } from "@medusajs/types"
import { Text } from "@modules/common/components/ui"

type OrderDetailsProps = {
  order: HttpTypes.StoreOrder
  showStatus?: boolean
}

const OrderDetails = ({ order, showStatus }: OrderDetailsProps) => {
  const STATUSES: Record<string, string> = {
    not_fulfilled: "Обробляється",
    partially_fulfilled: "Частково зібрано",
    fulfilled: "Зібрано",
    partially_shipped: "Частково відправлено",
    shipped: "Відправлено",
    partially_delivered: "Частково доставлено",
    delivered: "Доставлено",
    canceled: "Скасовано",
    not_paid: "Не оплачено",
    awaiting: "Очікує оплати",
    authorized: "Оплату підтверджено",
    partially_authorized: "Оплату підтверджено частково",
    captured: "Оплачено",
    partially_captured: "Оплачено частково",
    refunded: "Кошти повернено",
    partially_refunded: "Кошти повернено частково",
    requires_action: "Потрібна дія",
  }
  const formatStatus = (str: string) => STATUSES[str] ?? str

  return (
    <div>
      <Text>
        Підтвердження замовлення надіслано на{" "}
        <span
          className="text-ui-fg-medium-plus font-semibold"
          data-testid="order-email"
        >
          {order.email}
        </span>
        .
      </Text>
      <Text className="mt-2">
        Дата замовлення:{" "}
        <span data-testid="order-date">
          {new Date(order.created_at).toLocaleDateString("uk-UA")}
        </span>
      </Text>
      <Text className="mt-2 text-ui-fg-interactive">
        Номер замовлення: <span data-testid="order-id">{order.display_id}</span>
      </Text>

      <div className="flex items-center text-compact-small gap-x-4 mt-4">
        {showStatus && (
          <>
            <Text>
              Стан замовлення:{" "}
              <span className="text-ui-fg-subtle " data-testid="order-status">
                {formatStatus(order.fulfillment_status)}
              </span>
            </Text>
            <Text>
              Стан оплати:{" "}
              <span
                className="text-ui-fg-subtle "
                sata-testid="order-payment-status"
              >
                {formatStatus(order.payment_status)}
              </span>
            </Text>
          </>
        )}
      </div>
    </div>
  )
}

export default OrderDetails
