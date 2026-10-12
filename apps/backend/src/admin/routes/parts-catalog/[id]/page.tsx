import { ArrowLongRight, Spinner, Trash } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  IconButton,
  Table,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Fragment, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { CreateRelationshipModal } from "../../../components/parts-catalog/forms"
import { sdk } from "../../../lib/client"
import {
  Application,
  CATALOG_QUERY_KEY,
  errorMessage,
  LOOKUP_STATUS_LABELS,
  LookupTask,
  INVERSE_RELATION_LABELS,
  NUMBER_TYPE_LABELS,
  PartNumber,
  PartNumberDetail,
  Relationship,
  RELATION_TYPE_LABELS,
  STATE_LABELS,
  VERDICT_LABELS,
} from "../../../lib/parts-catalog"

const numberLabel = (item?: PartNumber | null) =>
  item ? `${item.brand?.name ?? ""} ${item.display_number}`.trim() : "—"

const RelationshipsTable = ({
  relationships,
  direction,
  onDelete,
}: {
  relationships: Relationship[]
  direction: "outgoing" | "incoming"
  onDelete: (relationship: Relationship) => void
}) => (
  <Table>
    <Table.Header>
      <Table.Row>
        <Table.HeaderCell>Зв'язок</Table.HeaderCell>
        <Table.HeaderCell>Номер</Table.HeaderCell>
        <Table.HeaderCell>Вердикт</Table.HeaderCell>
        <Table.HeaderCell>Стан</Table.HeaderCell>
        <Table.HeaderCell>Докази</Table.HeaderCell>
        <Table.HeaderCell />
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {relationships.map((relationship) => {
        const other =
          direction === "outgoing"
            ? relationship.to_part_number
            : relationship.from_part_number
        const label =
          direction === "outgoing"
            ? RELATION_TYPE_LABELS[relationship.relation_type]
            : (INVERSE_RELATION_LABELS[relationship.relation_type] ??
              `${RELATION_TYPE_LABELS[relationship.relation_type]} (зворотний)`)
        const verdict = VERDICT_LABELS[relationship.applicability_verdict]
        const evidence = relationship.evidence ?? []

        return (
          <Table.Row key={relationship.id}>
            <Table.Cell>{label ?? relationship.relation_type}</Table.Cell>
            <Table.Cell>
              {other ? (
                <Link
                  to={`/parts-catalog/${other.id}`}
                  className="text-ui-fg-interactive"
                >
                  {numberLabel(other)}
                </Link>
              ) : (
                "—"
              )}
            </Table.Cell>
            <Table.Cell>
              <div className="flex flex-col gap-y-1 py-2">
                <div>
                  <Badge size="2xsmall" color={verdict?.color ?? "grey"}>
                    {verdict?.label ?? relationship.applicability_verdict}
                  </Badge>
                </div>
                {relationship.reason && (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {relationship.reason}
                  </Text>
                )}
              </div>
            </Table.Cell>
            <Table.Cell>
              {STATE_LABELS[relationship.relationship_state] ??
                relationship.relationship_state}
            </Table.Cell>
            <Table.Cell>
              <div className="flex flex-col gap-y-1 py-2">
                <Text size="xsmall" weight="plus">
                  Незалежних підтверджень:{" "}
                  {relationship.independent_confirmations}
                </Text>
                {evidence.map((item) => (
                  <Text
                    key={item.id}
                    size="xsmall"
                    className="text-ui-fg-subtle"
                  >
                    {item.observation?.source?.name ?? "Джерело видалено"}
                    {item.raw_relation_text
                      ? ` — «${item.raw_relation_text}»`
                      : ""}
                  </Text>
                ))}
                {evidence.length === 0 && (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Без доказів
                  </Text>
                )}
              </div>
            </Table.Cell>
            <Table.Cell>
              <IconButton
                size="small"
                variant="transparent"
                onClick={() => onDelete(relationship)}
              >
                <Trash />
              </IconButton>
            </Table.Cell>
          </Table.Row>
        )
      })}
    </Table.Body>
  </Table>
)

const years = (item: Application) =>
  item.year_from || item.year_to
    ? `${item.year_from ?? "…"}–${item.year_to ?? "…"}`
    : "—"

const ApplicationsTable = ({ applications }: { applications: Application[] }) => (
  <Table>
    <Table.Header>
      <Table.Row>
        <Table.HeaderCell>Авто</Table.HeaderCell>
        <Table.HeaderCell>Роки</Table.HeaderCell>
        <Table.HeaderCell>Двигун</Table.HeaderCell>
        <Table.HeaderCell>Позиція</Table.HeaderCell>
        <Table.HeaderCell>Вердикт</Table.HeaderCell>
        <Table.HeaderCell>Джерело</Table.HeaderCell>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {applications.map((item) => {
        const verdict = VERDICT_LABELS[item.applicability_verdict]
        const conditions = item.constraints
          ? String(item.constraints.raw ?? JSON.stringify(item.constraints))
          : null

        return (
          <Table.Row key={item.id}>
            <Table.Cell>
              <div className="flex flex-col gap-y-1 py-2">
                <Text size="small" leading="compact" weight="plus">
                  {[
                    item.vehicle_make?.name ?? item.make,
                    item.vehicle_model?.name ?? item.model,
                    item.generation,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </Text>
                {item.raw_text && (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    У джерелі: {item.raw_text}
                  </Text>
                )}
                {conditions && (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    Умови: {conditions}
                  </Text>
                )}
              </div>
            </Table.Cell>
            <Table.Cell>{years(item)}</Table.Cell>
            <Table.Cell>
              {[
                item.engine,
                item.engine_code,
                item.power_kw ? `${item.power_kw} кВт` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "—"}
            </Table.Cell>
            <Table.Cell>
              {[item.position, item.side].filter(Boolean).join(", ") || "—"}
            </Table.Cell>
            <Table.Cell>
              <Badge size="2xsmall" color={verdict?.color ?? "grey"}>
                {verdict?.label ?? item.applicability_verdict}
              </Badge>
            </Table.Cell>
            <Table.Cell>{item.observation?.source?.name ?? "—"}</Table.Cell>
          </Table.Row>
        )
      })}
    </Table.Body>
  </Table>
)

const LookupStatus = ({ task }: { task?: LookupTask }) => {
  if (!task) {
    return (
      <Text size="small" leading="compact" className="text-ui-fg-subtle">
        Пошук по джерелах ще не запускався.
      </Text>
    )
  }

  const status = LOOKUP_STATUS_LABELS[task.status]
  const summary = task.summary
  const errors = task.errors?.items ?? []

  return (
    <div className="flex flex-col gap-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge size="2xsmall" color={status?.color ?? "grey"}>
          {status?.label ?? task.status}
        </Badge>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          {new Date(task.completed_at ?? task.created_at).toLocaleString(
            "uk-UA"
          )}
          {task.worker ? ` · ${task.worker}` : ""}
        </Text>
      </div>
      {summary && (
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Нових зв'язків: {summary.relationships_added ?? 0}, підтверджено
          наявних: {summary.relationships_confirmed ?? 0}, застосовностей:{" "}
          {summary.applications_added ?? 0}, характеристик:{" "}
          {summary.attributes_added ?? 0}, пропущено: {summary.skipped ?? 0}
        </Text>
      )}
      {errors.map((item, index) => (
        <Text key={index} size="xsmall" className="text-ui-fg-error">
          {item.source ? `${item.source}: ` : ""}
          {item.message}
        </Text>
      ))}
    </div>
  )
}

const PartNumberPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const prompt = usePrompt()
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryFn: () =>
      sdk.client.fetch<PartNumberDetail>(
        `/admin/parts-catalog/part-numbers/${id}`
      ),
    queryKey: [CATALOG_QUERY_KEY, "part-number", id],
    // Results arrive from the parser service on their own schedule.
    refetchInterval: 15_000,
  })

  const lookupMutation = useMutation({
    mutationFn: () =>
      sdk.client.fetch("/admin/parts-catalog/lookup-tasks", {
        method: "POST",
        body: { part_number_id: id },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CATALOG_QUERY_KEY] })
      toast.success("Завдання для парсерів поставлено в чергу")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const deleteMutation = useMutation({
    mutationFn: (path: string) => sdk.client.fetch(path, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CATALOG_QUERY_KEY] })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const confirmDelete = async (description: string) =>
    prompt({
      title: "Видалити?",
      description,
      confirmText: "Видалити",
      cancelText: "Скасувати",
    })

  const deleteRelationship = async (relationship: Relationship) => {
    if (await confirmDelete("Зв'язок буде видалено разом із його доказами.")) {
      deleteMutation.mutate(
        `/admin/parts-catalog/relationships/${relationship.id}`,
        { onSuccess: () => toast.success("Зв'язок видалено") }
      )
    }
  }

  const deleteNumber = async () => {
    if (await confirmDelete("Номер буде видалено з каталогу.")) {
      deleteMutation.mutate(`/admin/parts-catalog/part-numbers/${id}`, {
        onSuccess: () => {
          toast.success("Номер видалено")
          navigate("/parts-catalog")
        },
      })
    }
  }

  if (isLoading || !data) {
    return (
      <Container className="flex items-center justify-center p-8">
        <Spinner className="text-ui-fg-subtle animate-spin" />
      </Container>
    )
  }

  const { part_number: partNumber, outgoing, incoming } = data
  const chain = data.supersession_chain
  const { applications, attributes } = data
  const lastTask = data.lookup_tasks[0]

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex items-start justify-between gap-x-4 px-6 py-4">
          <div className="flex flex-col gap-y-1">
            <Link to="/parts-catalog" className="text-ui-fg-interactive">
              <Text size="small" leading="compact">
                ← Каталог номерів
              </Text>
            </Link>
            <Heading level="h1">{numberLabel(partNumber)}</Heading>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {NUMBER_TYPE_LABELS[partNumber.number_type] ??
                partNumber.number_type}
              {" · у джерелі: "}
              {partNumber.source_number}
              {" · ключ пошуку: "}
              {partNumber.normalized_number}
            </Text>
          </div>
          <div className="flex items-center gap-x-2">
            <Button
              size="small"
              onClick={() => lookupMutation.mutate()}
              disabled={lookupMutation.isPending}
              isLoading={lookupMutation.isPending}
            >
              Знайти аналоги й застосовність
            </Button>
            <Button
              size="small"
              variant="secondary"
              onClick={() => setCreateOpen(true)}
            >
              Додати зв'язок
            </Button>
            <Button
              size="small"
              variant="danger"
              onClick={deleteNumber}
              disabled={deleteMutation.isPending}
            >
              Видалити номер
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-y-2 px-6 py-4">
          <Text size="small" leading="compact" weight="plus">
            Пошук по джерелах
          </Text>
          <LookupStatus task={lastTask} />
        </div>
        {chain.length > 1 && (
          <div className="flex flex-col gap-y-2 px-6 py-4">
            <Text size="small" leading="compact" weight="plus">
              Ланцюжок замін до актуального номера
            </Text>
            <div className="flex flex-wrap items-center gap-2">
              {chain.map((item, index) => (
                <Fragment key={item.id}>
                  {index > 0 && <ArrowLongRight className="text-ui-fg-muted" />}
                  <Link to={`/parts-catalog/${item.id}`}>
                    <Badge
                      size="2xsmall"
                      color={index === chain.length - 1 ? "green" : "grey"}
                    >
                      {numberLabel(item)}
                    </Badge>
                  </Link>
                </Fragment>
              ))}
            </div>
          </div>
        )}
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Зв'язки від цього номера</Heading>
        </div>
        {outgoing.length ? (
          <RelationshipsTable
            relationships={outgoing}
            direction="outgoing"
            onDelete={deleteRelationship}
          />
        ) : (
          <div className="px-6 py-4">
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Зв'язків ще немає.
            </Text>
          </div>
        )}
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Зв'язки до цього номера</Heading>
        </div>
        {incoming.length ? (
          <RelationshipsTable
            relationships={incoming}
            direction="incoming"
            onDelete={deleteRelationship}
          />
        ) : (
          <div className="px-6 py-4">
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              На цей номер ще ніхто не посилається.
            </Text>
          </div>
        )}
      </Container>

      <Container className="divide-y p-0">
        <div className="flex flex-col gap-y-1 px-6 py-4">
          <Heading level="h2">Застосовність</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Авто описані так, як їх подало джерело. Дані з каталогів виробників
            позначаються підтвердженими, з магазинів і прайсів — кандидатами.
          </Text>
        </div>
        {applications.length ? (
          <ApplicationsTable applications={applications} />
        ) : (
          <div className="px-6 py-4">
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              Даних про застосовність ще немає.
            </Text>
          </div>
        )}
      </Container>

      {attributes.length > 0 && (
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">Характеристики</Heading>
          </div>
          <div className="flex flex-col gap-y-2 px-6 py-4">
            {attributes.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-x-4"
              >
                <Text size="small" leading="compact" weight="plus">
                  {item.name}
                </Text>
                <Text
                  size="small"
                  leading="compact"
                  className="text-ui-fg-subtle"
                >
                  {item.value}
                  {item.unit ? ` ${item.unit}` : ""}
                  {item.observation?.source
                    ? ` · ${item.observation.source.name}`
                    : ""}
                </Text>
              </div>
            ))}
          </div>
        </Container>
      )}

      <CreateRelationshipModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        from={partNumber}
      />
    </div>
  )
}

export default PartNumberPage
