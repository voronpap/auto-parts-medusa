import { Metadata } from "next"

import GarageView from "@modules/garage/garage-view"

export const metadata: Metadata = {
  title: "Мій гараж",
  description:
    "Ваші авто: оберіть одне, і на сторінках товарів буде видно, чи підходить деталь.",
}

export default function AccountGarage() {
  return <GarageView />
}
