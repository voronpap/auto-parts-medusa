import { Badge } from "@modules/common/components/ui"

const PaymentTest = ({ className }: { className?: string }) => {
  return (
    <Badge color="orange" className={className}>
      <span className="font-semibold">Увага:</span> лише для тестування.
    </Badge>
  )
}

export default PaymentTest
