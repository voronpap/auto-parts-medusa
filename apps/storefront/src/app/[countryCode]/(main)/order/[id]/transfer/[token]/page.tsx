import { Heading, Text } from "@modules/common/components/ui"
import TransferActions from "@modules/order/components/transfer-actions"
import TransferImage from "@modules/order/components/transfer-image"

export default async function TransferPage({
  params,
}: {
  params: { id: string; token: string }
}) {
  const { id, token } = params

  return (
    <div className="flex flex-col gap-y-4 items-start w-2/5 mx-auto mt-10 mb-20">
      <TransferImage />
      <div className="flex flex-col gap-y-6">
        <Heading level="h1" className="text-xl text-zinc-900">
          Запит на передачу замовлення {id}
        </Heading>
        <Text className="text-zinc-600">
          Надійшов запит на передачу вашого замовлення ({id}) іншому власнику. Якщо ви згодні, підтвердьте передачу кнопкою нижче.
        </Text>
        <div className="w-full h-px bg-zinc-200" />
        <Text className="text-zinc-600">
          Після підтвердження новий власник отримає всі права та обов'язки щодо цього замовлення.
        </Text>
        <Text className="text-zinc-600">
          Якщо ви не надсилали цей запит або хочете залишити замовлення собі, нічого робити не потрібно.
        </Text>
        <div className="w-full h-px bg-zinc-200" />
        <TransferActions id={id} token={token} />
      </div>
    </div>
  )
}
