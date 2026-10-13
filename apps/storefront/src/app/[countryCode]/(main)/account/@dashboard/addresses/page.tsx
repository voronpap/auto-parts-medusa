import { Metadata } from "next"
import { notFound } from "next/navigation"

import AddressBook from "@modules/account/components/address-book"

import { getRegion } from "@lib/data/regions"
import { retrieveCustomer } from "@lib/data/customer"

export const metadata: Metadata = {
  title: "Адреси",
  description: "Ваші адреси",
}

export default async function Addresses(props: {
  params: Promise<{ countryCode: string }>
}) {
  const params = await props.params
  const { countryCode } = params
  const customer = await retrieveCustomer()
  const region = await getRegion(countryCode)

  if (!customer || !region) {
    notFound()
  }

  return (
    <div className="w-full" data-testid="addresses-page-wrapper">
      <div className="mb-8 flex flex-col gap-y-4">
        <h1 className="text-2xl-semi">Адреси доставки</h1>
        <p className="text-base-regular">
          Переглядайте й змінюйте адреси доставки; їх можна додати скільки завгодно. Збережені адреси будуть доступні під час оформлення замовлення.
        </p>
      </div>
      <AddressBook customer={customer} region={region} />
    </div>
  )
}
