import { createHash, createHmac } from "crypto"
import { verifyTelegramLogin } from "../service"

const TOKEN = "123456:TEST-not-a-real-bot-token"
const NOW = 1_800_000_000_000

function signed(fields: Record<string, string>) {
  const check = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n")
  const secret = createHash("sha256").update(TOKEN).digest()

  return { ...fields, hash: createHmac("sha256", secret).update(check).digest("hex") }
}

describe("verifyTelegramLogin", () => {
  const fresh = { id: "42", first_name: "Іван", username: "ivan", auth_date: String(NOW / 1000 - 60) }

  it("accepts data signed by Telegram for this bot", () => {
    expect(verifyTelegramLogin(signed(fresh), TOKEN, 86_400, NOW)).toMatchObject({ id: "42", username: "ivan" })
  })

  it("refuses changed data, another bot's signature and old sign-ins", () => {
    expect(verifyTelegramLogin({ ...signed(fresh), id: "43" }, TOKEN, 86_400, NOW)).toBeNull()
    expect(verifyTelegramLogin(signed(fresh), "999:other", 86_400, NOW)).toBeNull()
    expect(
      verifyTelegramLogin(signed({ ...fresh, auth_date: String(NOW / 1000 - 90_000) }), TOKEN, 86_400, NOW)
    ).toBeNull()
    expect(verifyTelegramLogin({ ...fresh, hash: "nothex" }, TOKEN, 86_400, NOW)).toBeNull()
  })
})
