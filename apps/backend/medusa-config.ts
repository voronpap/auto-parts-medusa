import {
  ContainerRegistrationKeys,
  defineConfig,
  loadEnv,
  Modules,
} from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// Email is optional: without a Resend key the provider is not registered and
// customers are not asked to verify an address nobody could send a link to.
const emailEnabled = Boolean(
  process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL
)

// Sign-in with Google is on only when the owner has put the OAuth client of
// the shop's Google project into .env; without it nothing changes.
const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.STOREFRONT_URL
)

// Sign-in with Telegram is on only when the owner has put the shop's bot
// token into .env.
const telegramEnabled = Boolean(process.env.TELEGRAM_BOT_TOKEN)
const socialEnabled = googleEnabled || telegramEnabled

const ADMIN_MOBILE_CSS = `
@media (max-width: 767px) {
  main .flex.items-center.justify-between.px-6.py-4 {
    flex-wrap: wrap;
    gap: 0.5rem;
    padding-left: 1rem;
    padding-right: 1rem;
  }
  main .flex.items-center.justify-between.px-6.py-4 > div {
    flex-wrap: wrap;
    justify-content: flex-start;
    row-gap: 0.5rem;
    min-width: 0;
  }
  main, main > div {
    min-width: 0;
    max-width: 100vw;
  }
}
`

module.exports = defineConfig({
  featureFlags: {
    translation: true,
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    workerMode: (process.env.MEDUSA_WORKER_MODE || "shared") as "shared" | "worker" | "server",
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
      ...(socialEnabled
        ? {
            authMethodsPerActor: {
              user: ["emailpass"],
              customer: [
                "emailpass",
                ...(googleEnabled ? ["google"] : []),
                ...(telegramEnabled ? ["telegram"] : []),
              ],
            },
          }
        : {}),
      ...(emailEnabled
        ? {
            authVerificationsPerActor: {
              customer: [
                {
                  entity_type: "email",
                  auth_provider: "emailpass",
                },
              ],
            },
          }
        : {}),
    }
  },
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
    backendUrl: process.env.MEDUSA_BACKEND_URL,
    storefrontUrl: process.env.STOREFRONT_URL,
    // The dashboard's page headers keep the title and the buttons on one
    // line. With Ukrainian labels that line is wider than a phone, and the
    // whole page scrolls sideways. On narrow screens the header wraps.
    vite: () => ({
      plugins: [
        {
          name: "auto-parts-admin-mobile",
          transformIndexHtml: () => [
            {
              tag: "style",
              injectTo: "head" as const,
              children: ADMIN_MOBILE_CSS,
            },
          ],
        },
      ],
    }),
  },
  modules: [
    ...(socialEnabled
      ? [
          {
            resolve: "@medusajs/medusa/auth",
            dependencies: [Modules.CACHE, ContainerRegistrationKeys.LOGGER],
            options: {
              providers: [
                { resolve: "@medusajs/medusa/auth-emailpass", id: "emailpass" },
                ...(googleEnabled
                  ? [
                      {
                        resolve: "@medusajs/medusa/auth-google",
                        id: "google",
                        options: {
                          clientId: process.env.GOOGLE_CLIENT_ID,
                          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                          callbackUrl: `${process.env.STOREFRONT_URL}/ua/auth/google`,
                        },
                      },
                    ]
                  : []),
                ...(telegramEnabled
                  ? [
                      {
                        resolve: "./src/modules/telegram-auth",
                        id: "telegram",
                        options: { botToken: process.env.TELEGRAM_BOT_TOKEN },
                      },
                    ]
                  : []),
              ],
            },
          },
        ]
      : []),
    {
      // Files stay on this server (product photos are small); their public
      // address is the shop's own, not the default localhost:9000.
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              upload_dir: "static",
              backend_url: `${process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"}/static`,
            },
          },
        ],
      },
    },
    {
      resolve: "./src/modules/security",
    },
    {
      resolve: "./src/modules/parts-catalog",
    },
    {
      resolve: "./src/modules/supply",
    },
    {
      resolve: "./src/modules/stock",
    },
    {
      resolve: "@medusajs/medusa/translation",
    },
    ...(emailEnabled
      ? [
          {
            resolve: "@medusajs/medusa/notification",
            options: {
              providers: [
                {
                  resolve: "./src/modules/resend",
                  id: "resend",
                  options: {
                    channels: ["email"],
                    api_key: process.env.RESEND_API_KEY,
                    from: process.env.RESEND_FROM_EMAIL,
                  },
                },
              ],
            },
          },
        ]
      : []),
    // Redis carries events, workflows and locks on the server. A machine that
    // only builds the catalog (no REDIS_URL) uses Medusa's in-memory ones.
    ...(process.env.REDIS_URL
      ? [
        {
          resolve: "@medusajs/medusa/event-bus-redis",
          options: {
            redisUrl: process.env.REDIS_URL,
          },
        },
        {
          resolve: "@medusajs/medusa/workflow-engine-redis",
          options: {
            redis: {
              redisUrl: process.env.REDIS_URL,
            },
          },
        },
        {
          resolve: "@medusajs/medusa/locking",
          options: {
            providers: [
              {
                resolve: "@medusajs/medusa/locking-redis",
                id: "locking-redis",
                is_default: true,
                options: {
                  redisUrl: process.env.REDIS_URL,
                },
              },
            ],
          },
        },
        ]
      : []),
  ],
})
