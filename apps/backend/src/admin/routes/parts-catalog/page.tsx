import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Hashtag, Spinner } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Table,
  Text,
} from "@medusajs/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { ReactNode, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  CreateBrandModal,
  CreatePartNumberModal,
  CreateSourceModal,
} from "../../components/parts-catalog/forms"
import { sdk } from "../../lib/client"
import {
  Brand,
  BRAND_KIND_LABELS,
  CATALOG_QUERY_KEY,
  NUMBER_TYPE_LABELS,
  PartNumber,
  Source,
  SOURCE_KIND_LABELS,
} from "../../lib/parts-catalog"

const Loading = () => (
  <div className="flex items-center justify-center p-8">
    <Spinner className="text-ui-fg-subtle animate-spin" />
  </div>
)

const Empty = ({ children }: { children: ReactNode }) => (
  <div className="px-6 py-4">
    <Text size="small" leading="compact" className="text-ui-fg-subtle">
      {children}
    </Text>
  </div>
)

const SectionHeader = ({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) => (
  <div className="flex items-start justify-between gap-x-4 px-6 py-4">
    <div className="flex flex-col gap-y-1">
      <Heading level="h2">{title}</Heading>
      {description && (
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {description}
        </Text>
      )}
    </div>
    {action}
  </div>
)

const NumbersSection = () => {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const q = search.trim()

  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ part_numbers: PartNumber[]; count: number }>(
        "/admin/parts-catalog/part-numbers",
        { query: { limit: 50, ...(q ? { q } : {}) } }
      ),
    queryKey: [CATALOG_QUERY_KEY, "part-numbers", q],
    placeholderData: keepPreviousData,
  })
  const numbers = data?.part_numbers ?? []

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div className="flex items-start justify-between gap-x-4">
          <div className="flex flex-col gap-y-1">
            <Heading level="h1">Каталог номерів</Heading>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Пошук за початком номера. Пробіли, дефіси, регістр і українська
              розкладка не мають значення.
            </Text>
          </div>
          <Button size="small" onClick={() => setCreateOpen(true)}>
            Додати номер
          </Button>
        </div>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Наприклад: 1K0 615 301 або 0986478"
        />
      </div>
      {isLoading ? (
        <Loading />
      ) : numbers.length === 0 ? (
        <Empty>
          {q
            ? "За цим запитом номерів не знайдено."
            : "У каталозі ще немає номерів. Спершу додайте бренд, потім номер."}
        </Empty>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Номер</Table.HeaderCell>
              <Table.HeaderCell>Бренд</Table.HeaderCell>
              <Table.HeaderCell>Тип</Table.HeaderCell>
              <Table.HeaderCell>Зв'язки</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {numbers.map((item) => (
              <Table.Row
                key={item.id}
                className="cursor-pointer"
                onClick={() => navigate(`/parts-catalog/${item.id}`)}
              >
                <Table.Cell>
                  <Text size="small" leading="compact" weight="plus">
                    {item.display_number}
                  </Text>
                </Table.Cell>
                <Table.Cell>{item.brand?.name ?? "—"}</Table.Cell>
                <Table.Cell>
                  {NUMBER_TYPE_LABELS[item.number_type] ?? item.number_type}
                </Table.Cell>
                <Table.Cell>{item.relationship_count ?? 0}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <CreatePartNumberModal open={createOpen} onOpenChange={setCreateOpen} />
    </Container>
  )
}

const BrandsSection = () => {
  const [createOpen, setCreateOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ brands: Brand[] }>("/admin/parts-catalog/brands", {
        query: { limit: 100 },
      }),
    queryKey: [CATALOG_QUERY_KEY, "brands"],
  })
  const brands = data?.brands ?? []

  return (
    <Container className="divide-y p-0">
      <SectionHeader
        title="Бренди"
        description="Виробники авто, виробники запчастин і постачальники."
        action={
          <Button
            size="small"
            variant="secondary"
            onClick={() => setCreateOpen(true)}
          >
            Додати бренд
          </Button>
        }
      />
      {isLoading ? (
        <Loading />
      ) : brands.length === 0 ? (
        <Empty>Брендів ще немає.</Empty>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Назва</Table.HeaderCell>
              <Table.HeaderCell>Тип</Table.HeaderCell>
              <Table.HeaderCell>Аліаси</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {brands.map((brand) => (
              <Table.Row key={brand.id}>
                <Table.Cell>
                  <Text size="small" leading="compact" weight="plus">
                    {brand.name}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  {BRAND_KIND_LABELS[brand.kind] ?? brand.kind}
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-wrap gap-1">
                    {(brand.aliases ?? []).map((alias) => (
                      <Badge key={alias.id} size="2xsmall">
                        {alias.alias}
                      </Badge>
                    ))}
                  </div>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <CreateBrandModal open={createOpen} onOpenChange={setCreateOpen} />
    </Container>
  )
}

const SourcesSection = () => {
  const [createOpen, setCreateOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ sources: Source[] }>("/admin/parts-catalog/sources", {
        query: { limit: 100 },
      }),
    queryKey: [CATALOG_QUERY_KEY, "sources"],
  })
  const sources = data?.sources ?? []

  return (
    <Container className="divide-y p-0">
      <SectionHeader
        title="Джерела даних"
        description="Звідки беруться кроси. Кожен доказ посилається на джерело з цього списку."
        action={
          <Button
            size="small"
            variant="secondary"
            onClick={() => setCreateOpen(true)}
          >
            Додати джерело
          </Button>
        }
      />
      {isLoading ? (
        <Loading />
      ) : sources.length === 0 ? (
        <Empty>Джерел ще немає.</Empty>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Назва</Table.HeaderCell>
              <Table.HeaderCell>Тип</Table.HeaderCell>
              <Table.HeaderCell>Ліцензія</Table.HeaderCell>
              <Table.HeaderCell>Першоджерело</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {sources.map((source) => (
              <Table.Row key={source.id}>
                <Table.Cell>
                  <Text size="small" leading="compact" weight="plus">
                    {source.name}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  {SOURCE_KIND_LABELS[source.kind] ?? source.kind}
                </Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall">{source.license_class}</Badge>
                </Table.Cell>
                <Table.Cell>{source.lineage}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <CreateSourceModal open={createOpen} onOpenChange={setCreateOpen} />
    </Container>
  )
}

const PartsCatalogPage = () => {
  return (
    <div className="flex flex-col gap-y-3">
      <NumbersSection />
      <BrandsSection />
      <SourcesSection />
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Каталог номерів",
  icon: Hashtag,
})

export default PartsCatalogPage
