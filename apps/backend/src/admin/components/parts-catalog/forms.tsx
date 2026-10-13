import {
  Button,
  FocusModal,
  Heading,
  Input,
  Label,
  Select,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ReactNode, useState } from "react"
import { sdk } from "../../lib/client"
import {
  Brand,
  BRAND_KIND_LABELS,
  CATALOG_QUERY_KEY,
  errorMessage,
  LICENSE_CLASS_LABELS,
  NUMBER_TYPE_LABELS,
  PartNumber,
  Relationship,
  RELATION_TYPE_LABELS,
  Source,
  SOURCE_KIND_LABELS,
  STATE_LABELS,
  VERDICT_LABELS,
} from "../../lib/parts-catalog"

type ModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-y-2">
    <Label size="small" weight="plus">
      {label}
    </Label>
    {children}
  </div>
)

export const OptionSelect = ({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  options: Record<string, string>
  placeholder?: string
}) => (
  <Select value={value} onValueChange={onChange}>
    <Select.Trigger>
      <Select.Value placeholder={placeholder} />
    </Select.Trigger>
    <Select.Content>
      {Object.entries(options).map(([key, label]) => (
        <Select.Item key={key} value={key}>
          {label}
        </Select.Item>
      ))}
    </Select.Content>
  </Select>
)

export const FormModal = ({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  isPending,
  canSubmit,
  children,
}: ModalProps & {
  title: string
  description?: string
  onSubmit: () => void
  isPending: boolean
  canSubmit: boolean
  children: ReactNode
}) => (
  <FocusModal open={open} onOpenChange={onOpenChange}>
    <FocusModal.Content>
      <FocusModal.Header>
        <Button
          size="small"
          onClick={onSubmit}
          disabled={!canSubmit || isPending}
          isLoading={isPending}
        >
          Зберегти
        </Button>
      </FocusModal.Header>
      <FocusModal.Body className="flex justify-center overflow-y-auto px-6 py-10">
        <div className="flex w-full max-w-xl flex-col gap-y-6">
          <div className="flex flex-col gap-y-1">
            <FocusModal.Title asChild>
              <Heading>{title}</Heading>
            </FocusModal.Title>
            {description && (
              <Text size="small" className="text-ui-fg-subtle">
                {description}
              </Text>
            )}
          </div>
          {children}
        </div>
      </FocusModal.Body>
    </FocusModal.Content>
  </FocusModal>
)

export const useCatalogMutation = (
  path: string,
  successMessage: string,
  onDone: () => void
) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      sdk.client.fetch(path, { method: "POST", body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [CATALOG_QUERY_KEY] })
      toast.success(successMessage)
      onDone()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
}

export const CreateBrandModal = ({ open, onOpenChange }: ModalProps) => {
  const [name, setName] = useState("")
  const [kind, setKind] = useState("parts_manufacturer")
  const [aliases, setAliases] = useState("")
  const mutation = useCatalogMutation(
    "/admin/parts-catalog/brands",
    "Бренд створено",
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
      title="Новий бренд"
      description="Аліаси — інші написання тієї самої назви: VW і Volkswagen, ВАЗ і Lada."
      isPending={mutation.isPending}
      canSubmit={name.trim().length > 0}
      onSubmit={() =>
        mutation.mutate({
          name,
          kind,
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
      <Field label="Тип">
        <OptionSelect
          value={kind}
          onChange={setKind}
          options={BRAND_KIND_LABELS}
        />
      </Field>
      <Field label="Аліаси через кому">
        <Input
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          placeholder="VW, V.A.G."
        />
      </Field>
    </FormModal>
  )
}

export const CreateSourceModal = ({ open, onOpenChange }: ModalProps) => {
  const [name, setName] = useState("")
  const [kind, setKind] = useState("manufacturer_catalog")
  const [licenseClass, setLicenseClass] = useState("OPEN")
  const [lineage, setLineage] = useState("")
  const [url, setUrl] = useState("")
  const [licenseNote, setLicenseNote] = useState("")
  const mutation = useCatalogMutation(
    "/admin/parts-catalog/sources",
    "Джерело створено",
    () => {
      setName("")
      setLineage("")
      setUrl("")
      setLicenseNote("")
      onOpenChange(false)
    }
  )

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Нове джерело"
      description="Джерела зі спільним першоджерелом рахуються як одне незалежне підтвердження."
      isPending={mutation.isPending}
      canSubmit={name.trim().length > 0}
      onSubmit={() =>
        mutation.mutate({
          name,
          kind,
          license_class: licenseClass,
          lineage: lineage || undefined,
          url: url || null,
          license_note: licenseNote || null,
        })
      }
    >
      <Field label="Назва">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Тип джерела">
        <OptionSelect
          value={kind}
          onChange={setKind}
          options={SOURCE_KIND_LABELS}
        />
      </Field>
      <Field label="Ліцензійний клас">
        <OptionSelect
          value={licenseClass}
          onChange={setLicenseClass}
          options={LICENSE_CLASS_LABELS}
        />
      </Field>
      <Field label="Першоджерело даних (якщо порожньо — саме джерело)">
        <Input
          value={lineage}
          onChange={(e) => setLineage(e.target.value)}
          placeholder="TecDoc"
        />
      </Field>
      <Field label="URL">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="Примітка про ліцензію">
        <Textarea
          value={licenseNote}
          onChange={(e) => setLicenseNote(e.target.value)}
        />
      </Field>
    </FormModal>
  )
}

export const CreatePartNumberModal = ({ open, onOpenChange }: ModalProps) => {
  const [brand, setBrand] = useState<Brand | null>(null)
  const brandId = brand?.id ?? ""
  const [numberType, setNumberType] = useState("aftermarket")
  const [number, setNumber] = useState("")
  const mutation = useCatalogMutation(
    "/admin/parts-catalog/part-numbers",
    "Номер створено",
    () => {
      setNumber("")
      onOpenChange(false)
    }
  )
  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title="Новий номер"
      description="Вводьте номер так, як він записаний у джерелі: пробіли й дефіси зберігаються для показу, а пошук їх ігнорує."
      isPending={mutation.isPending}
      canSubmit={Boolean(brandId) && number.trim().length > 0}
      onSubmit={() =>
        mutation.mutate({
          brand_id: brandId,
          number_type: numberType,
          number,
        })
      }
    >
      <Field label="Бренд">
        <BrandPicker value={brand} onChange={setBrand} />
      </Field>
      <Field label="Тип номера">
        <OptionSelect
          value={numberType}
          onChange={setNumberType}
          options={NUMBER_TYPE_LABELS}
        />
      </Field>
      <Field label="Номер">
        <Input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="0 986 478 123"
        />
      </Field>
    </FormModal>
  )
}

export const CreateRelationshipModal = ({
  open,
  onOpenChange,
  from,
}: ModalProps & { from: PartNumber }) => {
  const [relationType, setRelationType] = useState("AFTERMARKET_CROSS")
  const [verdict, setVerdict] = useState("UNRESOLVED")
  const [search, setSearch] = useState("")
  const [target, setTarget] = useState<PartNumber | null>(null)
  const [reason, setReason] = useState("")
  const [sourceId, setSourceId] = useState("")
  const [rawText, setRawText] = useState("")
  const [url, setUrl] = useState("")
  const hasTarget = relationType !== "DISCONTINUED_NO_REPLACEMENT"
  const isUrl = /^https?:\/\//i.test(url.trim())

  const { data: matches } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ part_numbers: PartNumber[] }>(
        "/admin/parts-catalog/part-numbers",
        { query: { q: search, limit: 10 } }
      ),
    queryKey: [CATALOG_QUERY_KEY, "target-search", search],
    enabled: open && search.trim().length >= 3,
  })
  const { data: sources } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ sources: Source[] }>("/admin/parts-catalog/sources", {
        query: { limit: 100 },
      }),
    queryKey: [CATALOG_QUERY_KEY, "sources", "options"],
    enabled: open,
  })
  const mutation = useCatalogMutation(
    "/admin/parts-catalog/relationships",
    "Зв'язок створено",
    () => {
      setTarget(null)
      setSearch("")
      setReason("")
      setRawText("")
      setUrl("")
      onOpenChange(false)
    }
  )
  const sourceOptions = Object.fromEntries(
    (sources?.sources ?? []).map((source) => [source.id, source.name])
  )
  const candidates = (matches?.part_numbers ?? []).filter(
    (item) => item.id !== from.id
  )

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Новий зв'язок від ${from.display_number}`}
      description="Вердикт «Підтверджено» або «Умовно» можливий лише з доказом із джерела, що не є AI."
      isPending={mutation.isPending}
      canSubmit={!hasTarget || Boolean(target)}
      onSubmit={() =>
        mutation.mutate({
          from_part_number_id: from.id,
          to_part_number_id: hasTarget ? target?.id : null,
          relation_type: relationType,
          applicability_verdict: verdict,
          reason: reason || null,
          evidence: sourceId
            ? [
                {
                  source_id: sourceId,
                  raw_relation_text: rawText || null,
                  url: isUrl ? url : null,
                  record_ref: !isUrl && url ? url : null,
                },
              ]
            : [],
        })
      }
    >
      <Field label="Тип зв'язку">
        <OptionSelect
          value={relationType}
          onChange={setRelationType}
          options={RELATION_TYPE_LABELS}
        />
      </Field>
      {hasTarget && (
        <Field label="Цільовий номер">
          {target ? (
            <div className="flex items-center justify-between gap-x-3">
              <Text size="small" weight="plus">
                {target.brand?.name} {target.display_number}
              </Text>
              <Button
                size="small"
                variant="secondary"
                onClick={() => setTarget(null)}
              >
                Змінити
              </Button>
            </div>
          ) : (
            <>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Почніть вводити номер, від 3 символів"
              />
              <div className="flex flex-col gap-y-1">
                {candidates.map((item) => (
                  <Button
                    key={item.id}
                    size="small"
                    variant="transparent"
                    className="justify-start"
                    onClick={() => setTarget(item)}
                  >
                    {item.brand?.name} {item.display_number}
                  </Button>
                ))}
                {search.trim().length >= 3 && matches && !candidates.length && (
                  <Text size="small" className="text-ui-fg-subtle">
                    Номер не знайдено. Спершу створіть його в каталозі.
                  </Text>
                )}
              </div>
            </>
          )}
        </Field>
      )}
      <Field label="Вердикт застосовності">
        <OptionSelect
          value={verdict}
          onChange={setVerdict}
          options={Object.fromEntries(
            Object.entries(VERDICT_LABELS).map(([key, item]) => [
              key,
              item.label,
            ])
          )}
        />
      </Field>
      <Field label="Причина (обов'язкова для «Відхилено» та «Не підходить до»)">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Field label="Доказ: джерело">
        <OptionSelect
          value={sourceId}
          onChange={setSourceId}
          options={sourceOptions}
          placeholder="Без доказу"
        />
      </Field>
      <Field label="Доказ: дослівне формулювання джерела">
        <Input
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="replaced by, interchangeable, RP…"
        />
      </Field>
      <Field label="Доказ: URL або номер запису">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
    </FormModal>
  )
}

// There are hundreds of brands, so they are found by typing rather than
// scrolled through.
export const BrandPicker = ({
  value,
  onChange,
}: {
  value: Brand | null
  onChange: (brand: Brand | null) => void
}) => {
  const [search, setSearch] = useState("")
  const q = search.trim()
  const { data } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ brands: Brand[] }>("/admin/parts-catalog/brands", {
        query: { q, limit: 8 },
      }),
    queryKey: [CATALOG_QUERY_KEY, "brands", "search", q],
    enabled: !value && q.length >= 2,
  })

  if (value) {
    return (
      <div className="flex items-center justify-between gap-x-3">
        <Text size="small" weight="plus">
          {value.name}
        </Text>
        <Button size="small" variant="secondary" onClick={() => onChange(null)}>
          Змінити
        </Button>
      </div>
    )
  }

  const brands = data?.brands ?? []

  return (
    <div className="flex flex-col gap-y-1">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Почніть вводити назву бренду"
      />
      {brands.map((brand) => (
        <Button
          key={brand.id}
          size="small"
          variant="transparent"
          className="justify-start"
          onClick={() => {
            onChange(brand)
            setSearch("")
          }}
        >
          {brand.name}
        </Button>
      ))}
      {q.length >= 2 && data && !brands.length && (
        <Text size="small" className="text-ui-fg-subtle">
          Бренд не знайдено. Додайте його на сторінці «Каталог номерів».
        </Text>
      )}
    </div>
  )
}

export const EditBrandModal = ({
  brand,
  onOpenChange,
}: {
  brand: Brand
  onOpenChange: (open: boolean) => void
}) => {
  const [name, setName] = useState(brand.name)
  const [kind, setKind] = useState(brand.kind)
  const [aliases, setAliases] = useState(
    (brand.aliases ?? []).map((alias) => alias.alias).join(", ")
  )
  const mutation = useCatalogMutation(
    `/admin/parts-catalog/brands/${brand.id}`,
    "Бренд збережено",
    () => onOpenChange(false)
  )

  return (
    <FormModal
      open
      onOpenChange={onOpenChange}
      title={`Бренд ${brand.name}`}
      description="Аліаси — інші написання тієї самої назви. Джерела, що пишуть бренд інакше, потраплятимуть сюди. Якщо таке написання вже має окремий бренд, об'єднайте бренди."
      isPending={mutation.isPending}
      canSubmit={name.trim().length > 0}
      onSubmit={() =>
        mutation.mutate({
          name,
          kind,
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
      <Field label="Тип">
        <OptionSelect
          value={kind}
          onChange={setKind}
          options={BRAND_KIND_LABELS}
        />
      </Field>
      <Field label="Аліаси через кому">
        <Input
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
          placeholder="VW, V.A.G."
        />
      </Field>
    </FormModal>
  )
}

export const MergeBrandModal = ({
  brand,
  onOpenChange,
}: {
  brand: Brand
  onOpenChange: (open: boolean) => void
}) => {
  const [target, setTarget] = useState<Brand | null>(null)
  const mutation = useCatalogMutation(
    "/admin/parts-catalog/brands/merge",
    "Бренди об'єднано",
    () => onOpenChange(false)
  )

  return (
    <FormModal
      open
      onOpenChange={onOpenChange}
      title={`Об'єднати бренд ${brand.name}`}
      description={`Усі номери бренду «${brand.name}» перейдуть до вибраного бренду. Якщо той самий номер є в обох, їхні кроси, застосовність і характеристики зіллються в один. Назва «${brand.name}» стане аліасом, а сам бренд зникне зі списку.`}
      isPending={mutation.isPending}
      canSubmit={Boolean(target) && target?.id !== brand.id}
      onSubmit={() =>
        mutation.mutate({ source_id: brand.id, target_id: target!.id })
      }
    >
      <Field label="Влити в бренд">
        <BrandPicker value={target} onChange={setTarget} />
      </Field>
      {target?.id === brand.id && (
        <Text size="small" className="text-ui-fg-error">
          Бренд не можна об'єднати із самим собою.
        </Text>
      )}
    </FormModal>
  )
}

export const EditRelationshipModal = ({
  relationship,
  onOpenChange,
}: {
  relationship: Relationship
  onOpenChange: (open: boolean) => void
}) => {
  const [verdict, setVerdict] = useState(relationship.applicability_verdict)
  const [state, setState] = useState(relationship.relationship_state)
  const [reason, setReason] = useState(relationship.reason ?? "")
  const mutation = useCatalogMutation(
    `/admin/parts-catalog/relationships/${relationship.id}`,
    "Зв'язок збережено",
    () => onOpenChange(false)
  )

  return (
    <FormModal
      open
      onOpenChange={onOpenChange}
      title="Вердикт зв'язку"
      description="Вердикт, який поставила людина, нові дані парсерів не перезаписують. «Підтверджено» й «Умовно» можливі лише за наявності доказу з каталогу виробника або ліцензованої бази. Покупці бачать тільки ці два вердикти."
      isPending={mutation.isPending}
      canSubmit
      onSubmit={() =>
        mutation.mutate({
          applicability_verdict: verdict,
          relationship_state: state,
          reason: reason.trim() || null,
        })
      }
    >
      <Field label="Вердикт">
        <OptionSelect
          value={verdict}
          onChange={setVerdict}
          options={Object.fromEntries(
            Object.entries(VERDICT_LABELS).map(([key, item]) => [key, item.label])
          )}
        />
      </Field>
      <Field label="Стан твердження">
        <OptionSelect value={state} onChange={setState} options={STATE_LABELS} />
      </Field>
      <Field label="Причина або умова">
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Наприклад: лише для авто до 05.2009"
        />
      </Field>
    </FormModal>
  )
}
