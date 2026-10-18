import { model } from "@medusajs/framework/utils"

// Units of an inventory item kept for a shopper's cart for a while, so that
// another shopper does not buy the last ones while the first is checking out.
// Medusa's own reservations start only when the order is placed; a hold is
// not one of them and expires on its own.
const StockHold = model
  .define("stock_hold", {
    id: model.id({ prefix: "sthold" }).primaryKey(),
    cart_id: model.text(),
    line_item_id: model.text(),
    variant_id: model.text(),
    inventory_item_id: model.text(),
    // In units of the inventory item.
    quantity: model.number(),
    expires_at: model.dateTime(),
  })
  .indexes([
    { on: ["inventory_item_id", "expires_at"], where: "deleted_at IS NULL" },
    { on: ["cart_id"], where: "deleted_at IS NULL" },
  ])

export default StockHold
