const run = jest.fn()

jest.mock("../../../../../workflows/parts-catalog", () => ({
  importPartNumberResultWorkflow: () => ({ run }),
}))

import { POST } from "../route"

type Receipt = {
  id: string
  idempotency_key: string
  request_hash: string
  status: "processing" | "completed"
  response: Record<string, unknown> | null
  created_at: Date
  updated_at: Date
}

// Just enough of the receipt table for the route's four statements.
function fakeDatabase() {
  const receipts = new Map<string, Receipt>()

  return {
    receipts,
    raw: async (query: string, bindings: unknown[] = []) => {
      const sql = query.replace(/\s+/g, " ").trim()

      if (sql.startsWith("insert")) {
        const [id, key, hash] = bindings as string[]
        if (receipts.has(key)) {
          return { rows: [] }
        }
        receipts.set(key, {
          id,
          idempotency_key: key,
          request_hash: hash,
          status: "processing",
          response: null,
          created_at: new Date(),
          updated_at: new Date(),
        })
        return { rows: [{ id }] }
      }

      if (sql.startsWith("select")) {
        const receipt = receipts.get(bindings[0] as string)
        return { rows: receipt ? [receipt] : [] }
      }

      if (sql.startsWith("delete")) {
        const receipt = receipts.get(bindings[0] as string)
        if (receipt?.status === "processing") {
          receipts.delete(receipt.idempotency_key)
        }
        return { rows: [] }
      }

      if (sql.includes(`set "status" = 'completed'`)) {
        const [response, key] = bindings as string[]
        const receipt = receipts.get(key)
        if (receipt?.status !== "processing") {
          return { rows: [] }
        }
        receipt.status = "completed"
        receipt.response = JSON.parse(response)
        return { rows: [{ id: receipt.id }] }
      }

      if (sql.startsWith("update")) {
        const [key, seconds] = bindings as [string, number]
        const receipt = receipts.get(key)
        if (
          receipt?.status !== "processing" ||
          receipt.updated_at.getTime() >= Date.now() - seconds * 1000
        ) {
          return { rows: [] }
        }
        receipt.updated_at = new Date()
        return { rows: [{ id: receipt.id }] }
      }

      throw new Error(`Unexpected query: ${sql}`)
    },
  }
}

const body = {
  worker: "bulk",
  number: { brand: "NISSENS", number_type: "aftermarket", number: "60325" },
  result: {
    sources: [],
    relationships: [],
    applications: [],
    attributes: [],
    images: [],
    errors: [],
  },
}

function call(db: ReturnType<typeof fakeDatabase>) {
  const res = {
    statusCode: 0,
    payload: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.payload = payload
      return this
    },
  }
  const req = { scope: { resolve: () => db }, validatedBody: body }

  return POST(req as never, res as never).then(() => res)
}

describe("POST /admin/parts-catalog/import", () => {
  beforeEach(() => run.mockReset())

  it("drops its receipt when the import fails, so the line can be sent again", async () => {
    const db = fakeDatabase()
    run.mockRejectedValueOnce(new Error("database went away"))

    await expect(call(db)).rejects.toThrow("database went away")
    expect(db.receipts.size).toBe(0)

    run.mockResolvedValueOnce({ result: { task_id: "t1", summary: {} } })
    const retry = await call(db)

    expect(retry.statusCode).toBe(200)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("answers a resent line from the receipt without loading it again", async () => {
    const db = fakeDatabase()
    run.mockResolvedValue({ result: { task_id: "t1", summary: { skipped: 0 } } })

    await call(db)
    const resent = await call(db)

    expect(resent.statusCode).toBe(200)
    expect(resent.payload).toEqual({ task_id: "t1", summary: { skipped: 0 } })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("answers 409 while an identical import is still running", async () => {
    const db = fakeDatabase()
    let finish: (value: unknown) => void = () => undefined
    run.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))

    const first = call(db)
    await new Promise((resolve) => setImmediate(resolve))
    const second = await call(db)

    expect(second.statusCode).toBe(409)
    finish({ result: { task_id: "t1", summary: {} } })
    expect((await first).statusCode).toBe(200)
  })

  it("takes over a receipt a stopped backend left processing", async () => {
    const db = fakeDatabase()
    run.mockReturnValueOnce(new Promise(() => undefined))
    void call(db)
    await new Promise((resolve) => setImmediate(resolve))

    const [receipt] = [...db.receipts.values()]
    receipt.updated_at = new Date(Date.now() - 11 * 60 * 1000)
    run.mockResolvedValueOnce({ result: { task_id: "t1", summary: {} } })

    const retry = await call(db)

    expect(retry.statusCode).toBe(200)
    expect(receipt.status).toBe("completed")
  })
})
