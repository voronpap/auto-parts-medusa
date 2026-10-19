# Встановлення сайту на сервер (база віддалена)

Так сервер `192.168.1.164` (vrn-serv) встановлено 19.10.2026. Сервер обслуговує
лише сайт: бекенд Medusa з адмінкою та вітрину Next.js. База — Postgres на ПК
власника (`192.168.1.199:5433`, `medusa_store`), Redis локальний.

## Що робить власник (sudo з паролем)

```bash
sudo apt-get install -y redis-server nginx certbot python3-certbot-nginx postgresql-client
sudo systemctl enable --now redis-server
sudo loginctl enable-linger vrn
sudo install -d -o vrn -g vrn /var/www/auto-parts
```

Потім nginx: `deploy/nginx-auto-parts.pp.ua.conf` → `/etc/nginx/sites-available/auto-parts.pp.ua`,
посилання в `sites-enabled`, прибрати `default`, `nginx -t`, `systemctl reload nginx`.
Сертифікат відновлено з резервної копії `/etc/letsencrypt` (дійсний до 09.01.2027,
поновлює certbot.timer). На чистому сервері: `sudo certbot --nginx -d auto-parts.pp.ua`.

## Що робиться без sudo

1. nvm, Node `22.22.3`, `corepack enable`; pnpm береться з `packageManager` (10.11.1).
2. `git clone https://github.com/voronpap/auto-parts-medusa.git ~/medusa-store`, `pnpm install --frozen-lockfile`.
3. `apps/backend/.env` і `apps/storefront/.env.local` (права 600). `DATABASE_URL`
   вказує на базу ПК з `?sslmode=disable`. `JWT_SECRET`, `COOKIE_SECRET` і
   `AUTH_MFA_ENCRYPTION_KEY` мають лишатися тими самими, що були, інакше
   записане в базі не читається. Publishable key вітрини має збігатися з `api_key` у базі.
4. Бекенд: `cd apps/backend && pnpm build` (~6 хв на цьому процесорі). Runtime:
   `cp -a .medusa/server ~/medusa-runtime`, `ln -s ~/medusa-store/apps/backend/node_modules ~/medusa-runtime/node_modules`,
   `mkdir ~/medusa-runtime/static` (там лежать фото товарів, адреси `/static/...` записані в базі).
5. Міграції: лише після дампу бази, `medusa db:migrate --skip-scripts`. Ніколи не
   запускати `seed` чи `db:setup`. Міграції модулів `index`, `rbac` і `locking-postgres`
   у таблиці відсутні: ці модулі не ввімкнені, тому так і має бути.
6. Вітрина: `pnpm exec tsc --noEmit -p .`, потім `pnpm exec next build` (~7 хв).
7. User-юніти `deploy/medusa.service` і `deploy/medusa-storefront.service` →
   `~/.config/systemd/user/`, далі `systemctl --user enable --now medusa medusa-storefront`
   (з `XDG_RUNTIME_DIR=/run/user/$(id -u)`, якщо працюєте через ssh).

## Перевірки

- `curl 127.0.0.1:9000/health` віддає 200.
- `https://auto-parts.pp.ua/ua`, `/ua/cars`, `/ua/store`, `/sitemap.xml`, `/robots.txt` віддають 200.
- `http://` перенаправляє з кодом 301 на `https://`.
- Фото `/static/...` віддають 200.

Middleware вітрини запитує регіони за адресою `https://auto-parts.pp.ua`, тобто через
роутер (hairpin NAT). Поки nginx на 443 не працює, кожна сторінка віддає 500.

Перед збіркою: `ps -eo args | grep -E "next build|medusa build" | grep -v grep`.
