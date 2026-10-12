export type EmailContent = {
  subject: string
  html: string
}

type TemplateData = Record<string, unknown>

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="uk">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;">${title}</h1>
      ${body}
      <p style="margin:24px 0 0;font-size:12px;color:#71717a;">auto-parts.pp.ua</p>
    </div>
  </body>
</html>`
}

function actionEmail(
  title: string,
  intro: string,
  buttonLabel: string,
  url: unknown,
  outro: string
): string {
  const safeUrl = escapeHtml(url)

  return layout(
    title,
    `<p style="margin:0 0 24px;font-size:14px;line-height:22px;">${intro}</p>
      <p style="margin:0 0 24px;">
        <a href="${safeUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:14px;">${buttonLabel}</a>
      </p>
      <p style="margin:0 0 8px;font-size:12px;line-height:18px;color:#52525b;">Якщо кнопка не працює, скопіюйте це посилання у браузер:</p>
      <p style="margin:0 0 24px;font-size:12px;line-height:18px;word-break:break-all;"><a href="${safeUrl}">${safeUrl}</a></p>
      <p style="margin:0;font-size:12px;line-height:18px;color:#52525b;">${outro}</p>`
  )
}

export const EMAIL_TEMPLATES: Record<
  string,
  (data: TemplateData) => EmailContent
> = {
  "password-reset": (data) => ({
    subject: "Скидання пароля",
    html: actionEmail(
      "Скидання пароля",
      "Ми отримали запит на скидання пароля для вашого облікового запису. Щоб задати новий пароль, натисніть кнопку нижче.",
      "Задати новий пароль",
      data.reset_url,
      "Посилання діє обмежений час. Якщо ви не надсилали цей запит, просто проігноруйте лист."
    ),
  }),
  "email-verification": (data) => ({
    subject: "Підтвердіть свою електронну адресу",
    html: actionEmail(
      "Підтвердження електронної адреси",
      "Дякуємо за реєстрацію. Щоб завершити створення облікового запису, підтвердіть свою електронну адресу.",
      "Підтвердити адресу",
      data.verification_url,
      "Посилання діє обмежений час. Якщо ви не реєструвалися на сайті, просто проігноруйте лист."
    ),
  }),
}
