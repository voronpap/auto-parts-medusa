import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Spinner } from "@medusajs/icons"
import {
  Badge,
  Container,
  DataTable,
  DataTablePaginationState,
  Heading,
  Table,
  Tabs,
  Text,
  createDataTableColumnHelper,
  useDataTable,
} from "@medusajs/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../../lib/client"

type SecurityEvent = {
  id: string
  type: string
  severity: string
  ip: string | null
  method: string | null
  path: string | null
  status: number | null
  created_at: string
}

type EventsResponse = {
  events: SecurityEvent[]
  count: number
  limit: number
  offset: number
}

type StatusResponse = {
  retention_days: number
  events: {
    total: number
    last_24_hours: number
    login_succeeded_last_24_hours: number
    login_failed_last_24_hours: number
    access_denied_last_24_hours: number
    rate_limited_last_24_hours: number
    server_errors_last_24_hours: number
  }
}

type IpSummary = {
  ip: string
  total: number
  login_failed: number
  access_denied: number
  rate_limited: number
  last_seen: string
}

type IpsResponse = {
  window_hours: number
  truncated: boolean
  ips: IpSummary[]
}

type BadgeColor = "green" | "red" | "orange" | "grey"

const REFRESH_INTERVAL_MS = 30_000
const PAGE_SIZE = 20

const EVENT_LABELS: Record<string, { label: string; color: BadgeColor }> = {
  login_succeeded: { label: "Успішний вхід", color: "green" },
  login_failed: { label: "Невдалий вхід", color: "orange" },
  access_denied: { label: "Відмова в доступі", color: "orange" },
  rate_limited: { label: "Перевищено ліміт", color: "red" },
  server_error: { label: "Помилка сервера", color: "red" },
}

const TABS = [
  { value: "all", label: "Усі події" },
  { value: "logins", label: "Входи" },
  { value: "errors", label: "Помилки" },
  { value: "attacks", label: "Спроби зламу" },
]

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("uk-UA")

const columnHelper = createDataTableColumnHelper<SecurityEvent>()

const columns = [
  columnHelper.accessor("created_at", {
    header: "Час",
    cell: ({ getValue }) => formatDateTime(getValue()),
  }),
  columnHelper.accessor("type", {
    header: "Подія",
    cell: ({ getValue }) => {
      const type = getValue()
      const event = EVENT_LABELS[type] ?? { label: type, color: "grey" }

      return (
        <Badge size="2xsmall" color={event.color}>
          {event.label}
        </Badge>
      )
    },
  }),
  columnHelper.accessor("ip", {
    header: "IP",
    cell: ({ getValue }) => getValue() ?? "—",
  }),
  columnHelper.accessor("method", {
    header: "Метод",
    cell: ({ getValue }) => getValue() ?? "—",
  }),
  columnHelper.accessor("path", {
    header: "Шлях",
    cell: ({ getValue }) => getValue() ?? "—",
  }),
  columnHelper.accessor("status", {
    header: "Статус",
    cell: ({ getValue }) => getValue() ?? "—",
  }),
]

const StatTile = ({ label, value }: { label: string; value?: number }) => (
  <div className="shadow-elevation-card-rest bg-ui-bg-component flex flex-col gap-y-1 rounded-md px-4 py-3">
    <Text size="small" leading="compact" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Heading level="h2">{value ?? "—"}</Heading>
  </div>
)

const SummarySection = () => {
  const { data, isLoading } = useQuery({
    queryFn: () => sdk.client.fetch<StatusResponse>("/admin/security/status"),
    queryKey: ["security-audit", "status"],
    refetchInterval: REFRESH_INTERVAL_MS,
  })
  const events = data?.events

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h1">Аудит безпеки</Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Входи, помилки та підозріла активність за останні 24 години. Події
          зберігаються {data?.retention_days ?? 30} днів.
        </Text>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Spinner className="text-ui-fg-subtle animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-6 py-4 lg:grid-cols-5">
          <StatTile
            label="Успішні входи"
            value={events?.login_succeeded_last_24_hours}
          />
          <StatTile
            label="Невдалі входи"
            value={events?.login_failed_last_24_hours}
          />
          <StatTile
            label="Відмови в доступі"
            value={events?.access_denied_last_24_hours}
          />
          <StatTile
            label="Перевищення ліміту"
            value={events?.rate_limited_last_24_hours}
          />
          <StatTile
            label="Помилки сервера"
            value={events?.server_errors_last_24_hours}
          />
        </div>
      )}
    </Container>
  )
}

const EventsSection = () => {
  const [tab, setTab] = useState("all")
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  })
  const limit = pagination.pageSize
  const offset = pagination.pageIndex * limit

  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<EventsResponse>("/admin/security/events", {
        query: {
          limit,
          offset,
          ...(tab === "all" ? {} : { category: tab }),
        },
      }),
    queryKey: ["security-audit", "events", tab, limit, offset],
    placeholderData: keepPreviousData,
    refetchInterval: REFRESH_INTERVAL_MS,
  })

  const table = useDataTable({
    data: data?.events ?? [],
    columns,
    getRowId: (event) => event.id,
    rowCount: data?.count ?? 0,
    isLoading,
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
  })

  const changeTab = (value: string) => {
    setTab(value)
    setPagination({ pageIndex: 0, pageSize: PAGE_SIZE })
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <Heading level="h2">Журнал подій</Heading>
        <Tabs value={tab} onValueChange={changeTab}>
          <Tabs.List>
            {TABS.map((item) => (
              <Tabs.Trigger key={item.value} value={item.value}>
                {item.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs>
      </div>
      <DataTable instance={table}>
        <DataTable.Table
          emptyState={{
            empty: {
              heading: "Подій немає",
              description: "У цій категорії ще нічого не зафіксовано.",
            },
          }}
        />
        <DataTable.Pagination />
      </DataTable>
    </Container>
  )
}

const SuspiciousIpsSection = () => {
  const { data, isLoading } = useQuery({
    queryFn: () => sdk.client.fetch<IpsResponse>("/admin/security/ips"),
    queryKey: ["security-audit", "ips"],
    refetchInterval: REFRESH_INTERVAL_MS,
  })
  const ips = data?.ips ?? []

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-1 px-6 py-4">
        <Heading level="h2">Підозрілі IP-адреси</Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Адреси з невдалими входами, відмовами в доступі та перевищенням
          лімітів за останні {data?.window_hours ?? 24} години.
        </Text>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Spinner className="text-ui-fg-subtle animate-spin" />
        </div>
      ) : ips.length === 0 ? (
        <div className="px-6 py-4">
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Підозрілої активності не зафіксовано.
          </Text>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>IP</Table.HeaderCell>
              <Table.HeaderCell>Невдалі входи</Table.HeaderCell>
              <Table.HeaderCell>Відмови в доступі</Table.HeaderCell>
              <Table.HeaderCell>Перевищення ліміту</Table.HeaderCell>
              <Table.HeaderCell>Разом</Table.HeaderCell>
              <Table.HeaderCell>Остання активність</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {ips.map((item) => (
              <Table.Row key={item.ip}>
                <Table.Cell>{item.ip}</Table.Cell>
                <Table.Cell>{item.login_failed}</Table.Cell>
                <Table.Cell>{item.access_denied}</Table.Cell>
                <Table.Cell>{item.rate_limited}</Table.Cell>
                <Table.Cell>{item.total}</Table.Cell>
                <Table.Cell>{formatDateTime(item.last_seen)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

const AuditPage = () => {
  return (
    <div className="flex flex-col gap-y-3">
      <SummarySection />
      <EventsSection />
      <SuspiciousIpsSection />
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Аудит",
})

export default AuditPage
