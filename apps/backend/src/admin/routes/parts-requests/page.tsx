import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Table, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../../lib/client"

type PartsRequest = {
  id: string
  name: string
  phone: string
  vin: string | null
  car: string | null
  message: string
  status: "new" | "in_progress" | "answered" | "closed"
  created_at: string
}

const STATUS: Record<PartsRequest["status"], { label: string; color: "orange" | "blue" | "green" | "grey" }> = {
  new: { label: "Новий", color: "orange" },
  in_progress: { label: "У роботі", color: "blue" },
  answered: { label: "Відповіли", color: "green" },
  closed: { label: "Закрито", color: "grey" },
}
const NEXT: Partial<Record<PartsRequest["status"], PartsRequest["status"]>> = {
  new: "in_progress",
  in_progress: "answered",
  answered: "closed",
}
const KEY = ["parts-requests"]

const PartsRequestsPage = () => {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: () => sdk.client.fetch<{ requests: PartsRequest[]; count: number }>("/admin/supply/parts-requests"),
  })
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PartsRequest["status"] }) =>
      sdk.client.fetch(`/admin/supply/parts-requests/${id}`, { method: "POST", body: { status } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Помилка"),
  })
  const requests = data?.requests ?? []

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Запити на підбір</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Покупці, які не знайшли деталь і просять підібрати її за VIN чи авто.
        </Text>
      </div>
      {isLoading ? (
        <Text className="px-6 py-4">Завантаження…</Text>
      ) : requests.length === 0 ? (
        <Text className="px-6 py-4 text-ui-fg-subtle">Запитів поки немає.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Коли</Table.HeaderCell>
              <Table.HeaderCell>Покупець</Table.HeaderCell>
              <Table.HeaderCell>Авто / VIN</Table.HeaderCell>
              <Table.HeaderCell>Що потрібно</Table.HeaderCell>
              <Table.HeaderCell>Стан</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {requests.map((request) => {
              const next = NEXT[request.status]

              return (
                <Table.Row key={request.id}>
                  <Table.Cell>{new Date(request.created_at).toLocaleString("uk-UA")}</Table.Cell>
                  <Table.Cell>
                    <div>{request.name}</div>
                    <a className="text-ui-fg-interactive" href={`tel:${request.phone.replace(/[^+\d]/g, "")}`}>
                      {request.phone}
                    </a>
                  </Table.Cell>
                  <Table.Cell>
                    <div>{request.car || "—"}</div>
                    <div className="font-mono text-xs">{request.vin || ""}</div>
                  </Table.Cell>
                  <Table.Cell className="max-w-[360px] whitespace-normal">{request.message}</Table.Cell>
                  <Table.Cell>
                    <div className="flex items-center gap-2">
                      <Badge size="2xsmall" color={STATUS[request.status].color}>
                        {STATUS[request.status].label}
                      </Badge>
                      {next && (
                        <Button
                          size="small"
                          variant="secondary"
                          isLoading={move.isPending && move.variables?.id === request.id}
                          onClick={() => move.mutate({ id: request.id, status: next })}
                        >
                          → {STATUS[next].label}
                        </Button>
                      )}
                    </div>
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Запити на підбір",
  icon: ChatBubbleLeftRight,
})

export default PartsRequestsPage
