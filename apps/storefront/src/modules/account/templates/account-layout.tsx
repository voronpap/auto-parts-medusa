import React from "react"

import AccountNav from "../components/account-nav"
import { HttpTypes } from "@medusajs/types"

interface AccountLayoutProps {
  customer: HttpTypes.StoreCustomer | null
  children: React.ReactNode
}

const AccountLayout: React.FC<AccountLayoutProps> = ({
  customer,
  children,
}) => {
  return (
    <div className="ap-scope ap-page flex-1" data-testid="account-page">
      <div className="ap-shell">
        {customer ? (
          <div className="grid grid-cols-1 small:grid-cols-[240px_1fr] gap-4 items-start">
            <div className="ap-card p-6">
              <AccountNav customer={customer} />
            </div>
            <div className="ap-card p-6 small:p-8 min-w-0">{children}</div>
          </div>
        ) : (
          <div className="ap-card ap-auth">{children}</div>
        )}
      </div>
    </div>
  )
}

export default AccountLayout
