import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Spinner, TruckFast } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Table,
  Text,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Field,
  FormModal,
  useCatalogMutation,
} from "../../components/parts-catalog/forms"
import { sdk } from "../../lib/client"
import { CATALOG_QUERY_KEY, VehicleMake } from "../../lib/parts-catalog"

const CreateMakeModal = ({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const [name, setName] = useState("")
  const [aliases, setAliases] = useState("")
  const mutation = useCatalogMutation(
    "/admin/parts-catalog/vehicle-makes",
    "Марку створено",
    () => {
      setName("")
      setAliases("")
      onOpenChange(false)
    }
  )

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Нова марка авто"
      description="Аліаси — інші написання, які трапляються в джерелах: VW, Фольксваген."
      isPending={mutation.isPending}
      canSubmit={name.trim().length > 0}
      onSubmit={() =>
        mutation.mutate({
          name,
          aliases: aliases
            .split(",")
            .map((alias) => alias.trim())
            .filter(Boolean),
        })
      }
    >
      <Field label="Назва">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Аліаси через кому">
        <Input value={aliases} onChange={(e) => setAliases(e.target.value)} />
      </Field>
    </FormModal>
  )
}

const VehiclesPage = () => {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ vehicle_makes: VehicleMake[] }>(
        "/admin/parts-catalog/vehicle-makes"
      ),
    queryKey: [CATALOG_QUERY_KEY, "vehicle-makes"],
  })
  const q = search.trim().toLowerCase()
  const makes = (data?.vehicle_makes ?? []).filter(
    (make) =>
      !q ||
      make.name.toLowerCase().includes(q) ||
      (make.aliases ?? []).some((alias) => alias.alias.toLowerCase().includes(q))
  )
  const toReview = (data?.vehicle_makes ?? []).filter(
    (make) => make.needs_review
  ).length

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div className="flex items-start justify-between gap-x-4">
          <div className="flex flex-col gap-y-1">
            <Heading level="h1">Довідник авто</Heading>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Марки й моделі, до яких зводяться написання з джерел. Нові назви
              від парсерів додаються самі з позначкою «Перевірити» — дублікати
              об'єднуються на сторінці марки.
              {toReview ? ` Чекають перевірки: ${toReview}.` : ""}
            </Text>
          </div>
          <Button size="small" onClick={() => setCreateOpen(true)}>
            Додати марку
          </Button>
        </div>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук марки або аліасу"
        />
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Spinner className="text-ui-fg-subtle animate-spin" />
        </div>
      ) : makes.length === 0 ? (
        <div className="px-6 py-4">
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Нічого не знайдено.
          </Text>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Марка</Table.HeaderCell>
              <Table.HeaderCell>Аліаси</Table.HeaderCell>
              <Table.HeaderCell>Моделей</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {makes.map((make) => (
              <Table.Row
                key={make.id}
                className="cursor-pointer"
                onClick={() => navigate(`/vehicles/${make.id}`)}
              >
                <Table.Cell>
                  <div className="flex items-center gap-x-2">
                    <Text size="small" leading="compact" weight="plus">
                      {make.name}
                    </Text>
                    {make.needs_review && (
                      <Badge size="2xsmall" color="orange">
                        Перевірити
                      </Badge>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-wrap gap-1">
                    {(make.aliases ?? []).map((alias) => (
                      <Badge key={alias.id} size="2xsmall">
                        {alias.alias}
                      </Badge>
                    ))}
                  </div>
                </Table.Cell>
                <Table.Cell>{make.model_count ?? 0}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
      <CreateMakeModal open={createOpen} onOpenChange={setCreateOpen} />
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Довідник авто",
  icon: TruckFast,
})

export default VehiclesPage
