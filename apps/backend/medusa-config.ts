import { loadEnv, defineConfig } from '@medusajs/framework/utils'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

// Email is optional: without a Resend key the provider is not registered and
// customers are not asked to verify an address nobody could send a link to.
const emailEnabled = Boolean(
  process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL
)

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
