import { fuelName } from "../utils/fuel"

describe("fuelName", () => {
  it("names the fuels the catalogues write", () => {
    expect(fuelName("Diesel")).toBe("Дизель")
    expect(fuelName("Petrol")).toBe("Бензин")
    expect(fuelName("Hybrid-Petrol")).toBe("Гібрид (бензин)")
    expect(fuelName("Hybrid-diesel")).toBe("Гібрид (дизель)")
    expect(fuelName("Electric-petrol")).toBe("Гібрид (бензин)")
    expect(fuelName("Accumulator/Electric")).toBe("Електро")
    expect(fuelName("CNG (with or without Petrol)")).toBe("Газ (метан, CNG)")
    expect(fuelName("LPG (with or without Petrol)")).toBe("Газ (пропан-бутан, LPG)")
    expect(fuelName("Bio (ethanol) petrol or Methanol")).toBe("Біопаливо")
    expect(fuelName("Electric-hydrogen")).toBe("Водень")
  })

  it("drops values that are not a fuel", () => {
    expect(fuelName("False")).toBeNull()
    expect(fuelName("{fuel., en-GB}")).toBeNull()
    expect(fuelName("")).toBeNull()
    expect(fuelName(null)).toBeNull()
  })
})
