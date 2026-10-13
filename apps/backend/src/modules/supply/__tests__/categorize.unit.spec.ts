import { categoryFor, productHandle } from "../utils/categorize"

const name = (description: string | null) => categoryFor(description).name

describe("categories from supplier descriptions", () => {
  it("puts the particular wording before the general one", () => {
    expect(name("Амортизатор газомасляний")).toBe("Амортизатори")
    expect(name("Амортизатор багажника")).toBe("Кузов")
    expect(name("Захисний комплект амортизатора")).toBe("Підвіска")
    expect(name("Щітка склоочисника")).toBe("Склоочисники")
    expect(name("Щітка стартера")).toBe("Стартери і генератори")
  })

  it("sorts common parts", () => {
    expect(name("Колодки гальмівні дискові")).toBe("Гальмівні колодки")
    expect(name("Диск гальмівний")).toBe("Гальмівна система")
    expect(name("Датчик ABS")).toBe("Гальмівна система")
    expect(name("Фільтр масляний")).toBe("Масляні фільтри")
    expect(name("Фільтр салону вугільний")).toBe("Фільтри салону")
    expect(name("Фільтр АКПП")).toBe("Інші фільтри")
    expect(name("Наконечник рульової тяги")).toBe("Рульове керування")
    expect(name("ШРКШ зі змазкою в комплекті")).toBe("Привід")
    expect(name("Прокладка головки блока металева")).toBe("Прокладки і сальники")
    expect(name("Опора двигуна гумометалева")).toBe("Двигун")
    expect(name("Сайлентблок важеля")).toBe("Підвіска")
    expect(name("Помпа водяна")).toBe("Охолодження і клімат")
    expect(name("Ремінь поліклиновий")).toBe("Ремені, ролики, ланцюги")
  })

  it("falls back to a general shelf", () => {
    expect(name("Щось невідоме")).toBe("Інше")
    expect(name(null)).toBe("Інше")
  })

  it("builds a Latin address", () => {
    expect(productHandle("LEMFÖRDER", "12345 01")).toBe("lemforder-12345-01")
    expect(productHandle("555", "SA-3811L")).toBe("555-sa-3811l")
  })
})
