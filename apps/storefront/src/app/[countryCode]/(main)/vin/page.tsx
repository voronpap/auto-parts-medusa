import { Metadata } from "next"
import { notFound } from "next/navigation"

import { lookupVin } from "@lib/data/parts-catalog"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import ProductTable from "@modules/catalog/components/product-table"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export const metadata: Metadata = {
  title: "Підбір запчастин за VIN — Auto Parts",
  description:
    "Введіть VIN-код автомобіля, щоб побачити запчастини, які до нього підходять.",
  robots: { index: false },
}

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/

export default async function VinPage(props: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ vin?: string }>
}) {
  const { countryCode } = await props.params
  const { vin: typed } = await props.searchParams
  const region = await getRegion(countryCode)

  if (!region) {
    notFound()
  }

  const vin = (typed ?? "").replace(/[\s-]+/g, "").toUpperCase()
  const valid = VIN_RE.test(vin)
  const result = valid ? await lookupVin(vin) : null
  const products = result?.products.length
    ? await listProducts({
        countryCode,
        queryParams: {
          id: result.products.map((product) => product.product_id),
          limit: 100,
        },
      })
        .then(({ response }) => response.products)
        .catch(() => [])
    : []
  const vehicle = result?.vehicle
  const years = vehicle?.years ?? []

  return (
    <div className="ap-scope ap-page">
      <div className="ap-shell">
        <section className="ap-vin ap-card">
          <div>
            <div className="ap-eyebrow">Підбір за VIN</div>
            <h1 className="ap-pdp-title">Запчастини для вашого авто</h1>
            <p className="ap-lead">
              VIN — 17 символів із техпаспорта або з таблички під лобовим
              склом. За ним визначимо марку, а для багатьох авто — модель і
              рік, і покажемо деталі з каталогу, які підходять.
            </p>
          </div>
          <form className="ap-vin-form" method="get">
            <input
              name="vin"
              defaultValue={typed ?? ""}
              placeholder="Наприклад: TMBZZZ1Z882123456"
              aria-label="VIN-код"
              maxLength={24}
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit">Підібрати</button>
          </form>
        </section>

        {typed && !valid && (
          <div className="ap-vin-note ap-card">
            <strong>Це не схоже на VIN.</strong> У коді має бути рівно 17
            латинських літер і цифр; літер I, O та Q у VIN не буває. Ви ввели{" "}
            {vin.length} символів.
          </div>
        )}

        {valid && !result && (
          <div className="ap-vin-note ap-card">
            Не вдалося перевірити VIN. Спробуйте ще раз за хвилину.
          </div>
        )}

        {vehicle && (
          <section className="ap-section ap-card">
            <div className="ap-section-head">
              <h2>{vehicle.make ?? "Марку не визначено"}</h2>
              <p>VIN {vehicle.vin}</p>
            </div>
            <dl className="ap-keyfacts ap-vin-facts">
              <div>
                <dt>Марка</dt>
                <dd>{vehicle.make ?? "—"}</dd>
              </div>
              <div>
                <dt>Модельний рік</dt>
                <dd>{years.length ? years.join(" або ") : "у VIN не вказано"}</dd>
              </div>
              <div>
                <dt>Модель</dt>
                <dd>
                  {vehicle.model ??
                    (vehicle.models.length
                      ? vehicle.models[0].replace(/\s*\([^)]*\)/g, "")
                      : "не визначено")}
                </dd>
              </div>
              {vehicle.engine && (
                <div>
                  <dt>Двигун</dt>
                  <dd>{vehicle.engine}</dd>
                </div>
              )}
            </dl>
            {vehicle.models.length > 1 && (
              <p className="ap-vin-models">
                Варіанти моделі в каталозі: {vehicle.models.join(" · ")}
              </p>
            )}
            <p className="ap-vin-models">
              {result!.precision === "model"
                ? "Деталі підібрано за моделлю" +
                  (years.length ? " та роком." : ".") +
                  " Двигун і комплектацію VIN тут не уточнює — звірте номер деталі перед замовленням."
                : result!.precision === "make"
                  ? "Модель за цим VIN визначити не вдалося, тому показано деталі для всієї марки" +
                    (years.length ? " відповідного року." : ".") +
                    " Обов'язково звірте застосовність на сторінці товару."
                  : "Цієї марки ще немає в нашому каталозі застосовності."}
            </p>
          </section>
        )}

        {result && (
          <section className="ap-catalog ap-card">
            <div className="ap-catalog-head">
              <div>
                <h2>Підходить до авто</h2>
                <p>
                  {products.length
                    ? `Знайдено товарів: ${products.length}`
                    : "У каталозі поки немає товарів для цього авто"}
                </p>
              </div>
              <LocalizedClientLink className="ap-all" href="/store">
                Увесь каталог →
              </LocalizedClientLink>
            </div>
            {products.length > 0 && (
              <ProductTable products={products} countryCode={countryCode} />
            )}
          </section>
        )}
      </div>
    </div>
  )
}
