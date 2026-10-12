import { Spinner } from "@medusajs/icons"
import {
  Badge,
  Container,
  Heading,
  Table,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "react-router-dom"
import { OptionSelect } from "../../../components/parts-catalog/forms"
import { sdk } from "../../../lib/client"
import {
  CATALOG_QUERY_KEY,
  errorMessage,
  VehicleMake,
  VehicleModel,
} from "../../../lib/parts-catalog"

type MakeDetail = {
  vehicle_make: VehicleMake
  vehicle_models: VehicleModel[]
  application_count: number
}

const VehicleMakePage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const prompt = usePrompt()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<MakeDetail>(`/admin/parts-catalog/vehicle-makes/${id}`),
    queryKey: [CATALOG_QUERY_KEY, "vehicle-make", id],
  })
  const { data: allMakes } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ vehicle_makes: VehicleMake[] }>(
        "/admin/parts-catalog/vehicle-makes"
      ),
    queryKey: [CATALOG_QUERY_KEY, "vehicle-makes"],
  })

  const mergeMutation = useMutation({
    mutationFn: (input: { path: string; source_id: string; target_id: string }) =>
      sdk.client.fetch(input.path, {
        method: "POST",
        body: { source_id: input.source_id, target_id: input.target_id },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CATALOG_QUERY_KEY] })
      toast.success("Об'єднано")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (isLoading || !data) {
    return (
      <Container className="flex items-center justify-center p-8">
        <Spinner className="text-ui-fg-subtle animate-spin" />
      </Container>
    )
  }

  const make = data.vehicle_make
  const models = data.vehicle_models
  const otherMakes = Object.fromEntries(
    (allMakes?.vehicle_makes ?? [])
      .filter((item) => item.id !== make.id)
      .map((item) => [item.id, item.name])
  )

  const mergeModel = async (source: VehicleModel, targetId: string) => {
    const target = models.find((model) => model.id === targetId)

    if (
      target &&
      (await prompt({
        title: "Об'єднати моделі?",
        description: `«${source.name}» стане аліасом «${target.name}», а її застосовності перейдуть до «${target.name}».`,
        confirmText: "Об'єднати",
        cancelText: "Скасувати",
      }))
    ) {
      mergeMutation.mutate({
        path: "/admin/parts-catalog/vehicle-models/merge",
        source_id: source.id,
        target_id: target.id,
      })
    }
  }

  const mergeMake = async (targetId: string) => {
    if (
      await prompt({
        title: "Об'єднати марки?",
        description: `«${make.name}» стане аліасом «${otherMakes[targetId]}», а її моделі й застосовності перейдуть туди.`,
        confirmText: "Об'єднати",
        cancelText: "Скасувати",
      })
    ) {
      mergeMutation.mutate(
        {
          path: "/admin/parts-catalog/vehicle-makes/merge",
          source_id: make.id,
          target_id: targetId,
        },
        { onSuccess: () => navigate(`/vehicles/${targetId}`) }
      )
    }
  }

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex items-start justify-between gap-x-4 px-6 py-4">
          <div className="flex flex-col gap-y-1">
            <Link to="/vehicles" className="text-ui-fg-interactive">
              <Text size="small" leading="compact">
                ← Довідник авто
              </Text>
            </Link>
            <div className="flex items-center gap-x-2">
              <Heading level="h1">{make.name}</Heading>
              {make.needs_review && (
                <Badge size="2xsmall" color="orange">
                  Перевірити
                </Badge>
              )}
            </div>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Застосовностей: {data.application_count}
              {(make.aliases ?? []).length
                ? ` · аліаси: ${(make.aliases ?? [])
                    .map((alias) => alias.alias)
                    .join(", ")}`
                : ""}
            </Text>
          </div>
          <div className="w-64">
            <OptionSelect
              value=""
              onChange={mergeMake}
              options={otherMakes}
              placeholder="Це дублікат марки…"
            />
          </div>
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-1 px-6 py-4">
          <Heading level="h2">Моделі</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Щоб звести два написання до однієї моделі, оберіть у рядку
            дубліката ту модель, яка має лишитися.
          </Text>
        </div>
        {models.length === 0 ? (
          <div className="px-6 py-4">
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Моделей ще немає. Вони з'являться з даних парсерів.
            </Text>
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Модель</Table.HeaderCell>
                <Table.HeaderCell>Аліаси</Table.HeaderCell>
                <Table.HeaderCell>Застосовностей</Table.HeaderCell>
                <Table.HeaderCell>Об'єднати з</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {models.map((model) => (
                <Table.Row key={model.id}>
                  <Table.Cell>
                    <div className="flex items-center gap-x-2">
                      <Text size="small" leading="compact" weight="plus">
                        {model.name}
                      </Text>
                      {model.needs_review && (
                        <Badge size="2xsmall" color="orange">
                          Перевірити
                        </Badge>
                      )}
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-wrap gap-1">
                      {(model.aliases ?? []).map((alias) => (
                        <Badge key={alias.id} size="2xsmall">
                          {alias.alias}
                        </Badge>
                      ))}
                    </div>
                  </Table.Cell>
                  <Table.Cell>{model.application_count ?? 0}</Table.Cell>
                  <Table.Cell>
                    {models.length > 1 && (
                      <div className="w-56 py-2">
                        <OptionSelect
                          value=""
                          onChange={(targetId) => mergeModel(model, targetId)}
                          options={Object.fromEntries(
                            models
                              .filter((item) => item.id !== model.id)
                              .map((item) => [item.id, item.name])
                          )}
                          placeholder="Оберіть модель"
                        />
                      </div>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Container>
    </div>
  )
}

export default VehicleMakePage
