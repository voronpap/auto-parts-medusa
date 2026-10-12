import { model } from "@medusajs/framework/utils"
import { APPLICABILITY_VERDICTS } from "../constants"
import Observation from "./observation"
import PartNumber from "./part-number"

// A source's statement that a part fits a vehicle. The vehicle is kept as the
// source described it; mapping to a normalized vehicle directory comes later
// and must not lose these fields.
const PartApplication = model
  .define("part_application", {
    id: model.id({ prefix: "pappl" }).primaryKey(),
    part_number: model.belongsTo(() => PartNumber, {
      mappedBy: "applications",
    }),
    observation: model.belongsTo(() => Observation, {
      mappedBy: "applications",
    }),
    applicability_verdict: model
      .enum([...APPLICABILITY_VERDICTS])
      .default("CANDIDATE"),
    make: model.text(),
    model: model.text().nullable(),
    generation: model.text().nullable(),
    body: model.text().nullable(),
    market: model.text().nullable(),
    year_from: model.number().nullable(),
    year_to: model.number().nullable(),
    engine: model.text().nullable(),
    engine_code: model.text().nullable(),
    power_kw: model.number().nullable(),
    fuel: model.text().nullable(),
    drivetrain: model.text().nullable(),
    transmission: model.text().nullable(),
    position: model.text().nullable(),
    side: model.text().nullable(),
    quantity: model.number().nullable(),
    // VIN ranges, option codes, trim: anything that narrows the fitment.
    constraints: model.json().nullable(),
    raw_text: model.text().nullable(),
  })
  .indexes([
    {
      on: ["part_number_id"],
      where: "deleted_at IS NULL",
    },
    {
      on: ["make", "model"],
      where: "deleted_at IS NULL",
    },
  ])

export default PartApplication
