import { Metadata } from "next"
import { retrieveCustomer } from "@lib/data/customer"
// TODO: Re-add Toaster component when needed
import AccountLayout from "@modules/account/templates/account-layout"

// Account pages are personal; a guest sees a sign-in form at these addresses.
export const metadata: Metadata = { robots: { index: false } }

export default async function AccountPageLayout({
  dashboard,
  login,
}: {
  dashboard?: React.ReactNode
  login?: React.ReactNode
}) {
  const customer = await retrieveCustomer().catch(() => null)

  return (
    <AccountLayout customer={customer}>
      {customer ? dashboard : login}
      {/* TODO: Re-add Toaster component when needed */}
    </AccountLayout>
  )
}
