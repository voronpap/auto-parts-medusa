"use client"

import React from "react"
import Input from "@modules/common/components/input"
import AccountInfo from "../account-info"
import { HttpTypes } from "@medusajs/types"
// TODO: Re-add toast notifications when Toaster component is implemented

type MyInformationProps = {
  customer: HttpTypes.StoreCustomer
}

const ProfilePassword: React.FC<MyInformationProps> = ({ customer: _customer }) => {
  const [successState, setSuccessState] = React.useState(false)

  // TODO: Add support for password updates
  const updatePassword = async () => {
    // TODO: Re-add toast notification when Toaster component is implemented
    console.info("Зміна пароля поки недоступна")
  }

  const clearState = () => {
    setSuccessState(false)
  }

  return (
    <form
      action={updatePassword}
      onReset={() => clearState()}
      className="w-full"
    >
      <AccountInfo
        label="Пароль"
        currentInfo={
          <span>Пароль не показується з міркувань безпеки</span>
        }
        isSuccess={successState}
        isError={false}
        errorMessage={undefined}
        clearState={clearState}
        data-testid="account-password-editor"
      >
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Поточний пароль"
            name="old_password"
            required
            type="password"
            data-testid="old-password-input"
          />
          <Input
            label="Новий пароль"
            type="password"
            name="new_password"
            required
            data-testid="new-password-input"
          />
          <Input
            label="Повторіть пароль"
            type="password"
            name="confirm_password"
            required
            data-testid="confirm-password-input"
          />
        </div>
      </AccountInfo>
    </form>
  )
}

export default ProfilePassword
