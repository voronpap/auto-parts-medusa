export type Category = { name: string; handle: string }

const CATEGORY = {
  shocks: { name: "Амортизатори", handle: "shock-absorbers" },
  suspension: { name: "Підвіска", handle: "suspension" },
  pads: { name: "Гальмівні колодки", handle: "brake-pads" },
  brakes: { name: "Гальмівна система", handle: "brake-system" },
  oil: { name: "Масляні фільтри", handle: "oil-filters" },
  air: { name: "Повітряні фільтри", handle: "air-filters" },
  cabin: { name: "Фільтри салону", handle: "cabin-filters" },
  fuelFilter: { name: "Паливні фільтри", handle: "fuel-filters" },
  filters: { name: "Інші фільтри", handle: "other-filters" },
  steering: { name: "Рульове керування", handle: "steering" },
  drive: { name: "Привід", handle: "drivetrain" },
  clutch: { name: "Зчеплення і трансмісія", handle: "clutch-transmission" },
  belts: { name: "Ремені, ролики, ланцюги", handle: "belts-chains" },
  gaskets: { name: "Прокладки і сальники", handle: "gaskets-seals" },
  engine: { name: "Двигун", handle: "engine" },
  cooling: { name: "Охолодження і клімат", handle: "cooling-climate" },
  starters: { name: "Стартери і генератори", handle: "starters-alternators" },
  ignition: { name: "Запалювання", handle: "ignition" },
  sensors: { name: "Датчики", handle: "sensors" },
  electrics: { name: "Електрика", handle: "electrics" },
  fuel: { name: "Паливна система", handle: "fuel-system" },
  exhaust: { name: "Вихлопна система", handle: "exhaust" },
  wipers: { name: "Склоочисники", handle: "wipers" },
  body: { name: "Кузов", handle: "body" },
  oils: { name: "Оливи та рідини", handle: "oils-fluids" },
  tools: { name: "Інструмент та обладнання", handle: "tools" },
  other: { name: "Інше", handle: "other" },
} satisfies Record<string, Category>

// The first rule that matches a supplier's description wins, so the more
// particular wording stands before the general one.
const RULES: [RegExp, Category][] = [
  [/склоочисник/, CATEGORY.wipers],
  [/амортизатор (багажника|капота)|замок|склопідйомник|кліпса|дзеркал|ручка двер|бампер|крил[оа]|капот/, CATEGORY.body],
  [/захисний комплект амортизатора|опора амортизатора|відбійник|пильник амортизатора/, CATEGORY.suspension],
  [/амортизатор|пружин/, CATEGORY.shocks],
  [/колодк/, CATEGORY.pads],
  [/гальм|супорт|abs\b/, CATEGORY.brakes],
  [/фільтр масл|масляний фільтр/, CATEGORY.oil],
  [/фільтр салон/, CATEGORY.cabin],
  [/фільтр повітр/, CATEGORY.air],
  [/фільтр палив/, CATEGORY.fuelFilter],
  [/фільтр/, CATEGORY.filters],
  [/рульов|кермов|гідропідсилювач/, CATEGORY.steering],
  [/шркш|шрус|піввісь|привід|карданн|трипо[їі]д/, CATEGORY.drive],
  [/зчеплення|маховик|кпп|акпп|вижимн/, CATEGORY.clutch],
  [/ремінь|ремен|ролик|натягувач|ланцюг|шків/, CATEGORY.belts],
  [/стартер|генератор|бендикс|випрямляч|якір|обмотка/, CATEGORY.starters],
  [/запалювання|свічк|розжарювання|високовольтн/, CATEGORY.ignition],
  [/датчик|лямбда|витратомір/, CATEGORY.sensors],
  [/радіатор|термостат|помпа|охолодж|кондиціонер|конденсер|вентилятор|пічк|бачок розширювальний|інтеркулер|наддуву/, CATEGORY.cooling],
  [/паливн|форсунк|бензонасос|дросельн/, CATEGORY.fuel],
  [/вихлоп|глушник|каталізатор|гофра/, CATEGORY.exhaust],
  [/прокладк|сальник|ущільн|кільце гумове/, CATEGORY.gaskets],
  [/сайлентблок|важіль|стабілізатор|кульова|маточин|підшипник|підвіск|втулка|тяга/, CATEGORY.suspension],
  [/двигун|поршень|кільця|клапан|вкладиш|розподільч|колінвал|турбін|гідрокомпенсатор|головк/, CATEGORY.engine],
  [/акумулятор|лампа|реле|запобіжник|перемикач|кабел|дріт|фара|ліхтар|сигнал/, CATEGORY.electrics],
  [/олива|мастило|антифриз|рідина|очисник|присадк/, CATEGORY.oils],
  [/набір|ключ|інструмент|домкрат|знімач|викрутк/, CATEGORY.tools],
]

export const ALL_CATEGORIES: Category[] = Object.values(CATEGORY)

/** Shop category for a part by the supplier's description of it. */
export function categoryFor(description: string | null | undefined): Category {
  const text = (description ?? "").toLowerCase()

  return RULES.find(([pattern]) => pattern.test(text))?.[1] ?? CATEGORY.other
}

/** Address of a product page: brand and number in Latin letters and digits. */
export function productHandle(brand: string, number: string): string {
  return `${brand}-${number}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
