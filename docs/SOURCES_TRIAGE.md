# Розвідка джерел

Один ввічливий запит до вхідної сторінки кожного з 236 каталогів, зроблений
із сервера магазину 2026-10-12. Класифікація груба: вона каже, з чого
починати, а не чи вдасться написати адаптер. Позначка «відмовляє» інколи
хибна — її дає й сторінка, де слово captcha стосується лише форми зворотного
зв'язку.

Повторити: `apps/parsers/.venv/bin/python tools/triage.py <catalogs.json> <report.json>`.

## Стан роботи (оновлено 2026-10-14)

Перш ніж брати джерело, перевір цей розділ і `git log -- apps/parsers`.
Закінчив джерело чи з'ясував, що воно закрите, — допиши рядок сюди.

**Підключено:**

| Джерело | Спосіб | Що дає |
|---|---|---|
| Bosch (№ 26) | JSON API `ps.emea.dxtservice.com/ps/api/uk/ua` | OE-номери, застосовність, характеристики; пошук за OE-номером. Лише «від номера»: пошуку деталей за автомобілем у відкритому сервісі немає |
| bilstein group: febi, SWAG, Blue Print | JSON API `partsfinder.bilsteingroup.com` | OE-номери, сестринські бренди; пошук за OE-номером. Застосовності у відкритому доступі немає |
| MANN-FILTER (№ 81), FILTRON | сторінка товару + GraphQL `/api/graphql/catalog-prod` | OE-номери, аналоги, застосовність, характеристики; пошук за чужим номером; дерево «марка → модель → деталі» |
| FEBEST (№ 161) | HTML, справжній каталог на `febest.de` | OE-номери, застосовність; пошук за OE-номером і за маркою авто |
| NRF (№ 74) | HTML сторінки товару + JSON API `/rest/V1/products/{номер}/vehicles` | OE-номери, застосовність, характеристики; пошук за OE-номером. Є охолодження для MG та Great Wall; у каталозі також є датчики й електрика |
| NiBK / JNBK (№ 153), гілка `parsers/nibk` | HTML публічної POST-форми й сторінок товарів | Явно підписані OE-кроси й номери конкурентів, характеристики, застосовність; GEELY, HAVAL, MG (SAIC), Chery, BYD та інші китайські марки. Інструмент `nibk_model_numbers.py` збирає номери за маркою. Підготовлено до злиття й деплою; 17 нових тестів. Локально: PN8056, PN6049, Geely 8894490939 |
| Nissens (№ 73), гілка `parsers/nissens` | Публічна HTML POST-форма `Product/Search` і `Product/ProductDetails` | OE-номери з підтвердженням виробника, застосовність, характеристики; сучасні MG та інші китайські марки. Пошук із пагінацією; `nissens_make_numbers.py` збирає номери за маркою (50 для MG). 16 нових тестів. Локально: 607401 → MG 10792284; 941518 → MG 10108310; OE 10792284 → Nissens 607401. Підготовлено до злиття й деплою; гілка включає попередній NiBK і підтримку форм |
| ZF / LEMFÖRDER / SACHS / TRW / BOGE (№ 23), гілка `parsers/zf` | Анонімний JSON API `/api/search`, `/api/articles`; відкритий `/functions/controller/opc` для застосовності | Явно підписані OE-кроси, альтернативи, характеристики, застосовність; заміни й склад комплектів (`CONTAINS`, не аналог). 25 нових тестів, 158 загалом. Локально: TRW GDB1330 — 256 зв'язків / 2018 застосовностей (2 MG) / 17 характеристик; SACHS 3000 951 003 — 4 компоненти, заміна 3000 951 603, 7 застосовностей; TRW GDB1338 → GDB1212; MG OE 10030811 → GDB1330 і GDB1330DTE. `zf_model_numbers.py`: 8 номерів TRW для MG 6. Підготовлено до злиття й деплою; гілка включає попередні NiBK і Nissens, не NRF |
| Geely KSA (нове джерело поза початковими 236), гілка `parsers/geely-ksa` | HTML [офіційної сторінки](https://geelyksa.com/spare-parts/); перемикач моделей без API | Власні номери й опис деталей Geely, часткова застосовність за моделлю; без кросів, років і двигунів. Гальма, електрика, охолодження та інше: 391 рядок / 360 різних номерів для восьми моделей. 16 нових тестів, 183 загалом на оновленому main. Локально: 2069031600 — RADIATOR для MONJARO/STARRAY; 4048104500 — PAD-FRT BRAKE для STARRAY; 4048090200 — FRONT BRAKE FRICTION PAD для NEW EMGRAND, помилок немає. `geely_ksa_model_numbers.py`: 84 номери для MONJARO/STARRAY. Пауза 20 секунд. Нове джерело додається через SourceMeta; статичний JSON реєстру бекенду не змінено |
| Monroe, KYB | PDF, завантажено цілком | застосовність; у KYB — OE-номери монтажних комплектів і заміни знятих номерів |
| GMB (№ 190), гілка `parsers/gmb` | Публічний WooCommerce SKU + власний анонімний `opticat_ajax_lookup` PIES/ACES на gmb.net | Підписані OE, посилання на конкурентів як кандидати, GTIN, характеристики й застосовність. 42 нові тести (34 адаптер / 8 збір номерів), 430 загалом на main efec4a5. Локально: 180-2620 → Volkswagen 079121014M, 29 точних річних ACES-рядків / 74 атрибути; 170-4240 → Toyota 1610025030 / 16100F0010, 20 рядків / 77 атрибутів; 150-0001 → кандидат US Motor Works MCK1066, 19 рядків / 70 атрибутів, без вигаданого складу комплекту/заміни. GTIN окремо, нулі збережено; марку OE не виводять із застосовності Audi. Native пошук OE 079121014M не дав товарів, cross_search=False. Режими php=0/1 явно задекларовані сторінкою, BFBQ — публічний manufacturer ID, не ключ OptiCat; транспортний дефіс не стає номером. HTML Make/Model лише розділяє точні ACES-назви, роки не розширюються до UI-діапазону; умови збережено, довгі тексти фрагментуються без обрізання. `gmb_vehicle_numbers.py`: три номери для Audi S6 2016, перевірений native фільтр, пагінація й обов'язковий сирий sidecar, без імпорту. Усе через PoliteSession, пауза не менше 5 с навіть за bulk pause 2 с; robots явно дозволяє admin-ajax.php. Без входу/captcha/приватних ключів; китайське покриття ще не підтверджене. Версія 1.0.0, код підготовлено до злиття, деплой/завантаження не виконувались |
| CTR (№ 173), гілка `parsers/ctr` | Публічний JSON `/api/v1/catalogue/search/ru` та `search/detail/ru/{seq}` на API-хості, указаному сторінкою | OE, застосовність, характеристики. OE перевіряється в `oeList` і підписаному автомобільному рядку; верхнє `oeNo` — технічний ID, ігнорується. Поточний/попередній власні номери зберігаються без вигаданої дати заміни. 22 нові тести, 228 загалом. Локально: CBKD-8/CB0172 — 3 кроси / 5 застосовностей / 23 атрибути; CB0672 — Haval OE 2904130A-K00, 1 застосовність / 7 атрибутів; Haval 2904130AK00 → CTR CB0672. `ctr_make_numbers.py`: пробний пошук Haval повернув 37 записів, із перших двох перевірених товарів лише CB0672 мав явну застосовність Haval. Security endpoint не використовується; `cnt < 0` зупиняє роботу. Пари/комплекти/списки замін не розбираються як кроси без підтвердженої семантики. Підготовлено до злиття й деплою; гілка включає NiBK/Nissens/ZF/Geely KSA/Metelli, не NRF |
| Metelli Group: Metelli / Cifam / Trusting / Fri.tech. / Graf / KWP (№ 24), гілка `parsers/metelli` | Відкрита HTML POST-форма `Home/PartList`, сторінки товарів і `GetVehiclesByMake` | OE-кроси з явним виробником, номери конкурентів, застосовність з дослівними умовами, характеристики. Видимий номер відрізняється від внутрішнього коду URL для сестринських брендів, тому звіряється окремо. 23 нових тести, 206 загалом. Локально: Metelli 04-1143 — 8 кросів / 59 застосовностей / 7 характеристик; 23-0803C — 67 / 15 / 11, є Chery Tiggo. Skoda OE 1EA 611 053C → Metelli 04-1143, Cifam 101-1143, Trusting/Fri.tech. CF1143. `metelli_model_numbers.py`: три номери Metelli для першого двигуна Chery Tiggo. Підготовлено до злиття й деплою; гілка включає NiBK/Nissens/ZF/Geely KSA, не NRF |
| FACET (№ 39), гілка `parsers/facet` | Анонімний JSON `Home/DettaglioFinale` і HTML callback-и публічного каталогу | Підписані OE/конкуренти, застосовність, характеристики. 30 нових тестів, 258 загалом. Локально: 9.6027 — 6 кросів / 103 застосовності / 5 атрибутів; 9.3001 — 18 / 452 / 5, є MG ZS SUV і MG (SAIC) 550; MG OE NSC90019C → FACET 9.3001. `facet_model_numbers.py`: для першого двигуна MG (SAIC) 550 підтверджено 9.3001, 7.3272, 7.0071 (детонація, температура охолоджувальної рідини, тиск оливи). Lookup: десять сторінок/таблицю, шість чужих товарів, межі явно позначаються; інструмент дерева без пробних меж читає всі сторінки. Пауза 5 секунд, усі запити й сирий архів через PoliteSession. Captcha стосується лише PDF-by-email, не пошуку; PDF/email/history/account endpoint-и не викликали. «Replaced by» стороннього коду не стає заміною FACET; функція/місяці зберігаються, двигун і вісь не вгадуються. Підготовлено до злиття й деплою; включає NiBK/Nissens/ZF/Geely KSA/Metelli/CTR та main cdfecf7, не NRF |
| EPS (№ 40), гілка `parsers/eps` | Власний анонімний JSON і HTML callback-и на `catalogo.eps-autoparts.com/EN` | Підписані OE/конкуренти, застосовність, характеристики. Власний код EPS звіряється з `Cod`; поле `Foto` з кодом FACET не використовується для ідентичності, формул перетворення номерів немає. 12 нових тестів EPS, 293 загалом після інтеграції main 84f3955 (включає NRF і Spareto). Локально: 1.970.127 — 6 кросів / 103 застосовності / 5 атрибутів; 1.957.001 — 18 / 452 / 5, є MG ZS SUV і MG (SAIC) 550; MG NSC90019C → EPS 1.957.001. `eps_model_numbers.py`: для першого двигуна MG (SAIC) 550 підтверджено 1.957.001, 1.830.272, 1.800.071. Пауза 5 секунд, ті самі межі lookup і захисні перевірки, що FACET; тільки власний хост, без captcha/PDF/mail/account/history endpoint-ів. Спільний читач FACET 1.1.0; EPS 1.0.0. SourceMeta.lineage=FACET, бо це бренди одного виробника, не незалежні свідчення; наявний запис EPS зі старим lineage потребує окремого узгодження власником (бекенд/реєстр не змінено). Підготовлено до злиття й деплою |
| KW (Facet) (№ 41), гілка `parsers/kw-facet` | Власний анонімний JSON і HTML callback-и `catalogo.kw-automotive.com/EN` | Підписані OE/конкуренти, застосовність, характеристики електричних деталей; не KW Suspensions. Власний `Cod` зі збереженими пробілами перевіряється окремо від `Foto` FACET. 14 нових тестів KW і один додатковий спільного читача, 308 загалом. Локально: 470 127 — 6 кросів / 103 застосовності / 5 атрибутів; 457 001 — 18 / 452 / 5, зокрема MG ZS SUV та MG (SAIC) 550; MG NSC90019C → KW 457 001. `kw_facet_model_numbers.py`: перший двигун MG (SAIC) 550 — 457 001, 530 272, 500 071 (детонація, температура охолоджувальної рідини, тиск оливи), ідентичність та марка застосовності підтверджені. Пауза 5 секунд, усі запити через PoliteSession. Ті самі межі/перевірки, що FACET/EPS, тільки власний хост; код фото 9.3001 відхилено. Спільне SourceMeta.lineage=FACET; наявний запис зі старим lineage узгоджує власник, реєстр бекенду не змінено. KW 1.1.0 / FACET 1.2.0 / EPS 1.1.0; компактний 470127 підтверджено звичайною native-карткою як 470 127 і повторним JSON, без перетворення за формулою; підготовлено до злиття й деплою |
| MG Egypt (нове джерело поза 236), гілка `parsers/mg-egypt` | Офіційний [Spareparts Catalog](https://www.mgmotor.com.eg/spareparts-catalog/); відкриті POST `get_products_ajax_count` / `get_products_ajax` на власному `admin-ajax.php` | Власні номери MG, опис/категорія, явна модель/модельний рік; без кросів. 150 унікальних карток, з них 143 рядки запчастин / 28 номерів і сім сувенірів без номера. Гальма, електрика, фільтри для MG 5/6/RX5/ZS/HS, роки 2019–2022; охолодження не знайдено. Пагінація накопичувальна: сторінка 7 при розмірі 24 повертає всі 150; кількість і унікальність ID перевіряються, неповна відповідь — помилка. 29 нових тестів, 339 загалом після інтеграції main be68ab3. Локально: MG10767908 — колодки HS, дві застосовності / три атрибути; MG10343249 — ZS, чотири / три; MG10427930 — свічки RX5/HS/MG 6, десять / три, помилок немає. `mg_egypt_model_numbers.py`: сім різних номерів гальм/електрики для HS і ZS. Дослівний префікс MG/суфікси, без припущення еквівалентності bare-номерам; ціни/сувеніри виключено, джерельне «Font Brake Pad» не виправляється. Пауза 5 секунд, PoliteSession; robots явно дозволяє admin-ajax.php, cart/login/contact/account не використовуються. SourceMeta додає нове джерело без змін backend JSON; версія 1.0.0, підготовлено до злиття й деплою |

**Сирі індекси, не підключені:**

| Джерело | Стан |
|---|---|
| Cina Auto Parts (нове джерело поза 236), гілка `parsers/cina-auto-parts` | [Публічний PDF](https://www.cinaautoparts.com/wp-content/uploads/2016/12/geely-chery-lifan-great-wall-byd-parts-catalog-Cinaautoparts.pdf), HTTPS/PoliteSession; robots дозволяє uploads. Власник явно обрав лише сирий індекс без OE-прив'язок. 2746 товарних рядків / 12 групувальних рядків / 42 сторінки; дослівні Car brands, Product Number, Product Name, сторінка, SHA-256. Дата CreationDate 2016-12-17 — metadata, не підтверджене видання. Мітки включають BRILLIANCE/BYD/CHERY/FAW/FOTON/GEELY/GREAT WALL/HAFEI/KORFEL/LIFAN, аксесуари й фільтри; це не підтверджений виробник номера. OE/кроси/застосовність/характеристики не формуються; числові ID груп, дужки й коди в описах не стають номерами/аналогами. Частина описів обрізана в оригіналі, не відновлюється. Збережено весь PDF і сирий response sidecar локально; `fetch_bytes` архівує байти оборотно як data URI без зміни backend. 48 нових тестів (27 індекс / 9 завантаження / 12 binary HTTP), 387 загалом. Перевірено реальні рядки BYD 1205010 (с. 1), CHERY A11-3502031 (с. 3), GEELY 1061001049 (с. 27), плюс візуально крайня с. 42. Адаптера/SourceMeta/імпорту немає; не рахувати як готове OE-джерело. Деплой/завантаження в магазин не виконувались |

**Перевірено й відкладено:**

| Джерело | Причина |
|---|---|
| Каталоги на платформі TecAlliance (26 шт.) | потрібен власний ключ TecDoc; власник магазину питає постачальника |
| SIDEM (№ 171) | пошук закритий захистом від ботів (потрібні JavaScript і cookies) |
| Frenkit (№ 157), гілка `parsers/frenkit` — лише звіт | Офіційний HTTPS-вхід Europe `www.frenkit.es/en/brake-catalogue/online-catalogue/eu` і robots.txt повернули однакову 1476-символьну HTML-заглушку: loading, meta refresh та JavaScript, який встановлює cookie перед повторним завантаженням (2026-10-14). Це не результати каталогу; HTML robots не вважається дозволом на сканування. JavaScript/cookie challenge не виконували, cookie не підставляли; refresh/альтернативні IP/UA/HTTP/TLS обходи не використовували. Два-три номери не перевірені через gate до форми пошуку. Потрібен дозволений API/експорт від виробника; доступність даних і китайське покриття не встановлено. Адаптера/нових тестів немає, всі 436 наявних тестів проходять після інтеграції main 03e2461. OE/кроси/застосовність/характеристики не передані; backend/schema/.cache не змінено, без деплою/імпорту |
| DEPO (№ 224), гілка `parsers/depo` — лише звіт | Головна [офіційного сайту](https://www.depoautolamp.com/index_en.php) доступна, показує пошук за DEPO No. і окрему форму входу з captcha. Native GET `product_en.php` анонімно повернув лише JavaScript `Please Login !` і redirect до index.php (2026-10-14); це підтверджене обмеження самого каталогу, а не припущення за наявністю форми на головній. Логін/паролі/captcha/закриті дані не запитували, не вводили й не обходили. Два-три номери не перевіряли через явний gate до результатів. Robots дозволяє пошук для штатного UA auto-parts.pp.ua, а заборони окремих training bot-ів не переносили на інші агенти; ідентифікацію не змінювали, AI-training не виконується. Адаптера/нових тестів немає; усі 388 наявних тестів проходять після інтеграції main efec4a5; потрібен дозволений експорт/API від виробника. Кроси/застосовність/характеристики до магазину не передані, без деплою/імпорту |
| MEYLE (№ 2), гілка `parsers/meyle` — лише звіт | Офіційна сторінка веде до гостьової DVSE-оболонки `web2.carparts-cat.com/loginh.aspx?SID=348004`. Вона рендерить пошук без обов'язкового входу; наявність необов'язкових полів логіну не означає, що гість заблокований. Але поточний [robots.txt](https://web2.carparts-cat.com/robots.txt) містить `User-agent: *` / `Disallow: /`; пошукові запити/деталі після цього не виконували. Футер також містить TecDoc Copyright Note. Адаптер/архівування даних відкладено до дозволеного каналу й узгоджених умов доступу та копіювання; це не підтверджена captcha або відмова HTTP. Два-три номери не перевіряли через ці обмеження; 0 нових тестів; усі 388 наявних проходять на main 085e81e, OE/кроси/застосовність/характеристики до магазину не передані, без деплою/імпорту |
| Japanparts / Ashika / Japko (№ 3) | Cloudflare відповідає перевіркою |
| LPR / Samko (№ 160), гілка `parsers/lpr` — лише звіт | PoliteSession не зміг перевірити TLS навіть для robots.txt на обох офіційних хостах: `www.lpr.it` — unable to get local issuer certificate; `samko.it` — self-signed certificate in certificate chain (2026-10-13). Каталоги/номери далі не запитували, два-три реальні номери не перевірені. TLS verify не вимикали, HTTP downgrade/чужі проксі не використовували. Це збій перевірки довіри до сертифіката в цьому середовищі, не підтверджена captcha/відмова в даних. Потрібен коректно перевірюваний HTTPS або дозволений файл/API від виробника. Адаптера/нових тестів немає; незмінний код перед розвідкою пройшов 388 тестів. Кроси/застосовність/характеристики не передані; без деплою/імпорту |
| WIX Filters (№ 82) | та сама платформа, що в MANN, але адреси сторінок товарів будуються інакше; потрібно знайти їхній спосіб |
| TMD Friction: Textar / Pagid / Mintex (№ 145), гілка `parsers/textar` — лише звіт | Сторінка Textar доступна та посилається на `https://brakebook.com/bb/textar/en/applicationSearch.xhtml`; каталог 2026-10-13 повернув HTTP 403 і відмовив автоматичному доступу. Подальших спроб чи обходів немає. Адаптер відкладено до дозволеного каналу даних; 0 нових тестів, усі 206 наявних тестів проходять |
| Gates (№ 110), гілка `parsers/gates` — лише звіт | Навігація і конфігурація `navigates.gates.com/emea` доступні. Сторінка використовує `B2v4ApiKey` провайдера для API `api-v3-us.partsb2.com`; ключ не використано й не скопійовано. Анонімний запит `GetProductDetails` для 5419XS повернув HTTP 401 (2026-10-13). Потрібен власний дозволений доступ або інший офіційний канал даних; обходів немає. 0 нових тестів; 206 наявних тестів проходять |
| Motorservice: Kolbenschmidt / Pierburg / BF / TRW Engine Components (№ 113), гілка `parsers/motorservice` — лише звіт | Вхід `catalog.ms-motorservice.com` показує `security query`: форму `captchaform`, картинку `page=createcaptchaimage` та «Enter the characters pictured above» перед гостьовим входом `checkUser`. Це captcha каталогу, не форми зворотного зв'язку (2026-10-13). Форму не надсилали, захист не обходили. Потрібен офіційний дозволений канал даних. 0 нових тестів; 206 наявних тестів проходять |
| Sangsin / Hi-Q (№ 154), гілка `parsers/sangsin` — лише звіт | Публічний [пошук](https://www.e-sangsin.com/eng/search) і власний POST `/module/product/product_list_data_231107.ajax.php` доступні без входу. Анонімно перевірено SP2134 → картки SP2134/SP2134A, SP2126-R → SP2126-R, OE T113502080BA → SP2126-R у групі O.E References Number; видно розміри й FRT/RR, але не таблицю OE з виробником/застосовність. У native `get_product_data_list_more` явно сказано, що non-members не мають доступу, і встановлено redirect до `/eng/member/login`. Закриті деталі/логін не викликали; індексовані PDF не використовували для обходу обмеження. Спільна застосовність або група пошуку без підписаного виробника не є підтвердженням кросу Chery. Robots.txt повернув HTTP 404 — це не захисна відмова. Повний адаптер відкладено до дозволеного експорту/каналу даних від виробника. OE/кроси/застосовність/характеристики до магазину не передані; 0 нових тестів; усі 388 наявних тестів проходять після інтеграції main 7b5c43c, без деплою/імпорту |
| SKF (№ 182), гілка `parsers/skf` — лише звіт | Знайдено відкритий JSON API `search.automotive.skf.com/prod/search-automotive/rest/apps/automotive/searchers/{parts,details,vehicles}`. Анонімно підтверджено VKBA 3660: власний товар, 19 явно підписаних OE (Ford, Ford Changan), п'ять характеристик, склад комплекту; «related products» не вважаються аналогами. Футер нового каталогу містить TecDoc/TecRMI-посилання на [Copyright Note](https://www.tecalliance.net/copyright-note/), яка вимагає попередньої згоди на копіювання даних. Власник пообіцяв точний перелік дозволених каталогів і умови; до уточнення охоплення SKF архівування/масовий збір та адаптер відкладено. Це не технічне блокування; чужі ключі й сигнали аналітики не використовуються. 0 нових тестів; 206 наявних тестів проходять |
| Brembo (№ 143), гілка `parsers/brembo` — лише звіт | Публічний пошук і JSON OE-таблиця технічно доступні без входу; перевірено P 85 020 (є MG, Geely). Однак футер товару прямо обмежує копіювання даних без згоди TecAlliance. Оскільки сервіс архівує сирі відповіді, адаптер і масове збирання відкладено до підтвердження дозволу власником. Це не captcha і не технічна недоступність; обходів немає. 0 нових тестів; після інтеграції оновленого main усі 166 наявних тестів пройшли |

Власник 2026-10-13 підтвердив наявність дозволу Brembo/TecAlliance; очікуються
його умови щодо архівування й масового збирання. Облікові дані не запитуються.

**Додаткові китайські джерела, перевірені й відкладені:**

| Джерело | Причина |
|---|---|
| Chery Saudi Arabia / Sanabel Modern Motors (поза 236), гілка `parsers/chery-ksa` — лише звіт | Офіційна [Spare Parts](https://www.cheryksa.com/en/spareparts) індексується пошуком, але власні HTTPS-запити PoliteSession до robots.txt на `www.cheryksa.com` і `cheryksa.com` завершилися ConnectTimeout (2026-10-13). Сторінку каталогу/файли після невдалого з'єднання не запитували; два-три номери не перевірені. Це поточна недоступність із цього середовища, не доказ captcha/обов'язкового логіну або відсутності запчастин. HTTP downgrade/чужих проксі/підміни IP/TLS не використовували. Потрібен доступний офіційний канал чи дозволений файл від дистриб'ютора; OE/кроси/застосовність/характеристики не встановлено. Адаптера/нових тестів немає; незмінний код перед перевіркою пройшов 388 тестів; без деплою/імпорту |
| SAF AUTO (поза 236), гілка `parsers/safauto` — лише розвідка | [Каталоги постачальника](https://www.safautoparts.com/catalogs) включають термостати, зчеплення/гальмівні диски, котушки, насоси, MG/Haval та інші китайські марки. Переглядач `catalog-viewer.html` завантажує власний `assets/catalog-pages/manifest.json`, а потім JPEG-сторінки; прямого PDF/export-посилання не знайдено. Скрипт явно вимикає contextmenu/drag і Ctrl/Cmd-S/P (збереження/друк). Це не підтверджена captcha чи відмова HTTP: сторінка доступна, але дозволений експорт/умови архівування не встановлено. Обмеження не вимикали, зображення сторінок/приховані PDF не завантажували, OE не копіювали. Потрібен дозволений файл або підтверджені умови постачальника; джерело — постачальник, не каталог автовиробника. 0 нових тестів, адаптера немає; базові 339 тестів проходять |

Під час OE-перевірки Metelli сервіс повернув чотири підтверджені кроси та
штатну діагностику `No adapter covers brand 'Skoda' yet`: власного джерела
Skoda немає. Помилок самого адаптера Metelli не було; робота worker не змінена.
Так само OE-перевірка CTR повернула підтверджений крос і штатну діагностику
`No adapter covers brand 'Haval' yet`; помилок адаптера CTR немає.
OE-перевірка FACET для MG так само повернула підтверджений incoming-крос
і штатну діагностику `No adapter covers brand 'MG' yet`; помилок FACET немає.
Для EPS OE-перевірка MG повернула правильний власний EPS-номер і таку саму
штатну діагностику відсутності адаптера власних номерів MG; помилок EPS немає.
KW (Facet) OE-перевірка теж повернула підтверджений incoming-крос і штатну
діагностику `No adapter covers brand 'MG' yet`; помилок адаптера KW немає.

Bowei / Gaobeidian Bowei Auto Parts (поза 236), гілка `parsers/bowei` —
лише звіт: [сторінка завантажень](https://www.mybeauvais.com/download.html)
індексується зі списками XLSX для MG, Great Wall, BYD, Chery, Geely, Changan
та інших марок. Але власні запити PoliteSession до HTTPS-адрес із `www`
і без нього завершилися SSLCertVerificationError: сертифікат не відповідає
hostname (2026-10-13). Ні `verify=False`, ні HTTP downgrade не використовували;
файлів не завантажували. Це помилка перевірки захищеного з'єднання, а не
підтверджена captcha/відсутність даних. Потрібен виправлений HTTPS або
наданий постачальником дозволений файл; наявність OE/кросів у файлах ще
не перевірено. 0 нових тестів, адаптера немає; 339 базових тестів проходять.

**Розвідано, адаптера ще немає:**

| Джерело | Що відомо |
|---|---|
| Valeo | сайт-застосунок на JavaScript; MIS API використовує ключ провайдера (не використовується), окремий TechAssist API та відкриті списки нових артикулів ще досліджуються |
| TYC (№ 62), гілка `parsers/tyc` — розвідка, адаптера ще немає | [Публічний каталог](https://www.tyceurope.com/ecatalog) використовує власний POST JSON `/ecatalog/get_catalog_data`; без входу/ключа, усі запити PoliteSession. Порожній фільтр показав 8704 групувальних рядки, 20/сторінку, 436 сторінок; це не 8704 підтверджені окремі деталі. Перевірено: точний TYC 20-5437-08 повертає спільний рядок 20-5437-08/20-5438-08 + OEM 60628721/60628720; OEM 60628721 повертає той самий парний рядок; TYC 19-B023-05 має один OEM 50513781. CAR MAKER у цих результатах — лише код AF, без знайденої офіційної легенди; моделі написано як 1-45/1-46, GIULIETA, без виправлення. PDF 2024_AF001.pdf (3 сторінки, SHA-256 964081541e9905df8fb99612a13571ffda4270f5f1443b4e3b2d5d1e23057dd0) завантажено через PoliteSession.fetch_bytes із оборотним сирим sidecar; візуально перевірено всі три сторінки. На с. 3 у блоці SPDER текстовий шар містить коди, яких не видно в рендері; ці дані автоматично не використовуються для фактів. PDF також має код AF і групи RH/LH; пари/скорочення/суфікси не розгортали й не перетворювали на вигадані кроси або марки. Пошук maker_s=MG дав 0 рядків, але через коди марок це не доводить відсутності MG. Robots.txt — HTTP 404, не захисна відмова. Власнику поставлено питання: лише сирий індекс чи відкласти до легенди/точного зіставлення. До відповіді жодних OE-прив'язок/застосовності/імпорту; 0 нових тестів, незмінний код має 388 базових тестів. Джерело доступне, не класифікувати як закрите захистом |
| Haval Saudi Arabia / ADMC (поза 236), гілка `parsers/haval-ksa` — лише розвідка | Офіційний [H7](https://haval.com.sa/car-models/haval-h7) індексується з посиланнями View Spare parts Catalog / View Full Spare parts Catalog. Robots.txt містить лише sitemap, без заборони. Власний PoliteSession на сторінці H7 підняв SourceBlocked з HTTP 200 (2026-10-13): спрацював стандартний HTML-детектор, але конкретну captcha/причину в цій перевірці не підтверджено; можливий false positive, тому не класифікувати як доведено закритий каталог. Повторів/обходів/завантаження прихованих файлів не було; прямі адреси й вміст PDF не встановлено, два-три номери не перевірені. Потрібен підтверджений дозволений публічний файл або подальша діагностика першої відповіді без обходу захисту. OE/кроси/застосовність/характеристики не передані; адаптера/нових тестів немає, незмінний код має 388 перевірених тестів; без деплою/імпорту |
| ASIMCO (нове джерело поза 236), гілка `parsers/asimco` — лише розвідка | Поточний [Find Parts](https://www.asimcoglobal.com/find-parts) використовує публічний POST `/ajax/find-parts/search-number` (`articleNumber`, `numberType=0`, штатний анонімний CSRF). Три відомі власні номери KD0036, KD6022, KD6304 дали `success=true`, `data=[]` (2026-10-13); причина не встановлена, це не доказ відсутності деталей чи захисна відмова. Публічний PDF, який власний переглядач читає з `/catalogue/pdf`, перевищує безпечний ліміт binary archive 4 МБ; файл/sidecar не записані, часткових даних не розбирали. Ліміт відповідає наявному body cap архіву 5,5 МБ після base64; формат/backend не змінювали, межу не підвищували. Окремий Parts Catalogue на `asimco.zhglory.com` використовує API `supply.zhglory.com.cn`, appkey і підпис запиту з вбудованим значенням провайдера: ключ/підпис не використано/не скопійовано, API не викликали. Форма Download Catalogues просить контактні дані; її не надсилали. Robots дозволяє публічні сторінки, забороняє admin/login/storage та деякі параметри; заборонених шляхів не читали. Подальше: з'ясувати порожній результат власного пошуку, дозволений власний API-доступ або погодити канал архівування великого публічного файла без втрати оригіналу. OE/кроси/застосовність/характеристики не передані; адаптера й нових тестів немає. Незмінний код має 387 базових тестів, які пройшли перед розвідкою; лише документація, без деплою/імпорту |
| Ferodo (№ 146), гілка `parsers/ferodo` — розвідка, не готовий адаптер | Поточна сторінка вмикає власний TecAlliance servlet `/bin/fmmp/api`. Публічний POST `/bin/fmmp/api/parts/search` із форматом `SearchMessage.searchRepresentation()` повернув порожній `data` для FDB1083, DDF1486 та запиту одного товару Ferodo без номера. Старий `catalogws.drivparts.com/parts/search` недоступний із цього середовища (ConnectTimeout). Причина порожніх відповідей не встановлена: це не підтверджена captcha/заборона й не доказ відсутності деталей. Потрібна подальша перевірка запиту/даних; адаптер не створено, 0 нових тестів. 206 наявних тестів пройшли після інтеграції main a4e7ec9 |

**Пріоритети власника:** спершу кроси (OE-номери), потім застосовність.
Китайські авто — Chery, Geely, BYD, Great Wall, Haval, Changan, MG, JAC, FAW:
фільтри (MANN, FILTRON) і підвіска (FEBEST) уже покриті; бракує гальм,
зчеплення, електрики, охолодження, а для Haval і MG — майже всього.
Спеціалізованих під китайські авто каталогів у цьому списку немає — їх треба
шукати окремо й додавати в реєстр
`apps/backend/src/modules/parts-catalog/data/manufacturer-catalogs.json`.

## Підсумок

| Група | Каталогів |
|---|---|
| Сторінки з формою пошуку — найпростіші для адаптера | 63 |
| Сторінки віддаються сервером, пошук глибше на сайті | 46 |
| Застосунок на JavaScript — шукати його API | 39 |
| PDF-каталоги | 24 |
| Платформа TecAlliance | 26 |
| Відмовляє автоматичним запитам | 26 |
| Недоступний із сервера | 10 |
| Посилання не працює | 2 |

## Платформа TecAlliance

Ці каталоги працюють через вебсервіс TecDoc (`webservice.tecalliance.services`),
який приймає запити лише з API-ключем постачальника каталогу, а частину
запитів закриває captcha. Ключ, вбудований у чужий вебкаталог, виданий не нам,
тому адаптер на ньому не будується. Шлях до цих даних — власний доступ до
TecDoc API від TecAlliance. До того часу ці бренди заповнюються з інших
джерел або вручну.


## Сторінки з формою пошуку — найпростіші для адаптера (63)

| № | Каталог | Хост | Деталі |
|---|---|---|---|
| 5 | AIC Germany | www.aic-germany.de | oe, sku |
| 15 | CARDONE | www.cardone.com | qty, search_query, sku |
| 17 | Motorcraft / Ford Parts | www.ford.com | f:search, f:searchInputString |
| 19 | URO Parts / Autotecnica (APA) | apaindustries.com | q |
| 24 | Metelli Group: Metelli / Cifam / Trusting / Fri.tech. / Graf / KWP | www.metelligroup.it | searchtext |
| 27 | DENSO | www.denso-am.eu | search |
| 29 | Valeo / SWF | www.valeoservice.co.uk | searchText |
| 37 | Champion | www.championautoparts.com | engine_search, search_type, wildcardspecial-part_number |
| 39 | FACET | catalogo.facet.eu | GVArticoliOE$DXHFP$TPCFCm1$C, GVArticoliOE$DXHFP$TPCFCm1$O, GVArticoli |
| 40 | EPS | catalogo.eps-autoparts.com | GVArticoliOE$DXHFP$TPCFCm1$C, GVArticoliOE$DXHFP$TPCFCm1$O, GVArticoli |
| 41 | KW (Facet) | catalogo.kw-automotive.com | GVArticoliOE$DXHFP$TPCFCm1$C, GVArticoliOE$DXHFP$TPCFCm1$O, GVArticoli |
| 44 | Delphi | www.delphiautoparts.com | searchQuery |
| 46 | SIDAT | www.sidatgroup.it | oem |
| 47 | FISPA | www.fispa.it | oem |
| 55 | Delco Remy | www.delcoremy.com | p$lt$ctl06$pageplaceholder$p$lt$ctl00$ECatalogSearch$btnFamilySearch,  |
| 58 | GEBE / IKA Germany | www.gebe-shop.de | search |
| 62 | TYC | www.tyceurope.com | filter[oem_no_s] |
| 65 | WESEM | www.wesem.com | search |
| 73 | Nissens | catalogue.nissens.com | PageSizeForSearch, SearchID, SearchParameters.AltProductItemNumber, Se |
| 74 | NRF | webshop.nrf.eu | p_oen, q, qty, sku |
| 77 | KRIOS | www.kriosac.it | oem |
| 87 | Purflux | www.purflux.com | q |
| 88 | Sakura | www.sakurafilter.com | keyword, parts-and-references[], search_type |
| 92 | FRAM (Північна Америка) | www.fram.com | q |
| 103 | CoopersFiaam | www.coopersfiaam.com | q |
| 104 | FRAM Europe | www.fram-europe.com | q |
| 106 | Cloyes | cloyes.mycarparts.com | search_pn |
| 112 | Optibelt | web.optibelt.com | number_of_v_shaped_ribs[max], number_of_v_shaped_ribs[min], q |
| 116 | ET ENGINETEAM | www.engineteam.com | formArticleId, questionArticle, questionEmail, questionName, questionP |
| 117 | Continental / ContiTech | www.continental-engineparts.com | p$lt$ctl02$SmartSearchBox3$btnSearch, p$lt$ctl02$SmartSearchBox3$txtWo |
| 130 | Cometic | www.cometic.com | search_text |
| 134 | BorgWarner | catalog.borgwarner.com | __RequestVerificationToken, q |
| 138 | BM Catalysts | bmcats.com | keyword, search, search-location |
| 142 | Dinex | shop.dinex.eu | DinexNumber, OENumber, searchString |
| 143 | Brembo | www.bremboparts.com | __RequestVerificationToken |
| 146 | Ferodo | www.ferodo.com | engine_search, search_type, wildcardspecial-part_number |
| 147 | Jurid | www.jurid.com | engine_search, search_type, wildcardspecial-part_number |
| 153 | NiBK / JNBK | www.nibk.jp | btnAppSearch, btnProductSearch, btnVinSearch |
| 154 | Sangsin / Hi-Q | www.e-sangsin.com | sc_number, search_mode, shoe_outside_radius_max, shoe_outside_radius_m |
| 156 | DBA / Disc Brakes Australia | dba.com.au | _wp_http_referer, part-number_nonce, part_number, submit_xref, xref_no |
| 158 | Budweg Caliper | budweg-catalog.com | OE, Search, article, elqCookieWrite, elqCustomerGUID |
| 159 | A.B.S. / All Brake Systems | www.abs-bv.shop | product_number |
| 165 | MOOG | www.moogparts.com | engine_search, search_type, wildcardspecial-part_number |
| 167 | KONI | shop.koni-na.com | options[prefix], q |
| 169 | Eibach | www.eibach.com | q |
| 171 | SIDEM | catalogue.sidem.eu | OERef, __RequestVerificationToken, otherRef, sidemRef |
| 173 | CTR | aftermarket.ctr.co.kr | qty, searchKeyword |
| 174 | Teknorot | www.teknorot.com | _wp_http_referer |
| 178 | TEDGUM | katalog.tedgum.pl | strictSearchSwitch |
| 180 | DYS | www.dys-sl.com | rfraoem, tipobusqueda |
| 181 | Master-Sport | catalog.master-sport.de | searchScope |
| 184 | NSK | www.nsk.com | keyword |
| 192 | Sonnax | www.sonnax.com | query |
| 194 | TransTec | transtec.com | nav-menu-quick-search, nav-quick-search |
| 200 | WABCO | www.wabco-customercentre.com | HomePage:cc_tmpl_SubscriberTemplate:cc_tmpl_Storefront:phoneLoginForm, |
| 203 | Meritor Parts Xpress | www.meritorpartsxpress.com | isRequestComingFromPrimarySearchBar, isRequestComingFromSecondarySearc |
| 204 | JOST / ROCKINGER | www.jost-world.com | equitystory, tx_indexedsearch_pi2[__referrer][@action], tx_indexedsear |
| 205 | SAF-HOLLAND | www.safholland-benelux.com | referrerurlhash |
| 206 | BPW | www.bpw.de | tx_solr[q] |
| 208 | PE Automotive / Monark | shop.pe.de | cookiePreferences-state, mwExtendedSearchEnabled-state, sSearch, sUniq |
| 219 | Borsehung | www.borsehung.de | q |
| 228 | iwis | www.iwis.com | contactPersonProductInquiryId, query |
| 230 | AUTOFREN SEINSA | autofrenseinsa.com | qr_city, qr_firstname, qr_job_position, qr_kit_model, qr_lastname, qr_ |

## Сторінки віддаються сервером, пошук глибше на сайті (46)

| № | Каталог | Хост | Деталі |
|---|---|---|---|
| 2 | MEYLE | www.meyle.com | server-rendered, no search field on the entry page |
| 3 | Japanparts / Ashika / Japko | japanparts.it | server-rendered, no search field on the entry page |
| 4 | Nipparts | www.nipparts.com | server-rendered, no search field on the entry page |
| 7 | Parts-Mall / PMC | catalog.parts-mall.com | server-rendered, no search field on the entry page |
| 11 | FAST Original | www.fastoriginal.eu | server-rendered, no search field on the entry page |
| 13 | MASUMA | masuma.parts | server-rendered, no search field on the entry page |
| 20 | CRP: Rein / AAE / Pentosin | crpautomotive.com | server-rendered, no search field on the entry page |
| 32 | Herth+Buss / Elparts / Jakoparts | herthundbuss.com | server-rendered, no search field on the entry page |
| 53 | BRISK | www.brisk.eu | server-rendered, no search field on the entry page |
| 56 | AS-PL | www.as-catalog.com | server-rendered, no search field on the entry page |
| 57 | HC-Cargo | hc-cargo.com | server-rendered, no search field on the entry page |
| 61 | OSRAM | www.osram.com | server-rendered, no search field on the entry page |
| 64 | Vignal Group | www.vignal-group.com | server-rendered, no search field on the entry page |
| 66 | Fristom | fristom.com | server-rendered, no search field on the entry page |
| 79 | HEPU | www.hepu.de | server-rendered, no search field on the entry page |
| 81 | MANN-FILTER | www.mann-filter.com | server-rendered, no search field on the entry page |
| 82 | WIX Filters | www.wixfilters.com | server-rendered, no search field on the entry page |
| 83 | FILTRON | filtron.eu | server-rendered, no search field on the entry page |
| 86 | SOFIMA | sofima-aftermarket.com | server-rendered, no search field on the entry page |
| 94 | ALCO Filters | www.alcofilters.co.uk | server-rendered, no search field on the entry page |
| 95 | FIL Filter | catalog.filfilter.com.tr | server-rendered, no search field on the entry page |
| 99 | BMC Air Filters | www.bmcairfilters.com | server-rendered, no search field on the entry page |
| 105 | Melling | specsearch.melling.com | server-rendered, no search field on the entry page |
| 115 | FAI Automotive | www.faiauto.com | server-rendered, no search field on the entry page |
| 137 | HJS | www.hjs.com | server-rendered, no search field on the entry page |
| 145 | TMD Friction: Textar / Pagid / Mintex | textar.com | server-rendered, no search field on the entry page |
| 151 | EBC Brakes | www.ebcbrakes.com | server-rendered, no search field on the entry page |
| 155 | Bendix Australia | www.bendix.com.au | server-rendered, no search field on the entry page |
| 161 | FEBEST | catalog.febest.eu | server-rendered, no search field on the entry page |
| 172 | RTS | www.rts-sa.com | server-rendered, no search field on the entry page |
| 175 | FRAP | www.frap.it | server-rendered, no search field on the entry page |
| 177 | Malò / Akron | malospa.it | server-rendered, no search field on the entry page |
| 182 | SKF | automotive.skf.com | server-rendered, no search field on the entry page |
| 186 | JTEKT / Koyo | partsnavi.jtekt.co.jp | server-rendered, no search field on the entry page |
| 190 | GMB | gmb.net | server-rendered, no search field on the entry page |
| 191 | GSP | gspnorthamerica.com | server-rendered, no search field on the entry page |
| 193 | TransGo | transgo.com | server-rendered, no search field on the entry page |
| 198 | Sampa | www.sampa.com | server-rendered, no search field on the entry page |
| 199 | Auger | www.iamauger.com | server-rendered, no search field on the entry page |
| 216 | NTY | nty.parts | server-rendered, no search field on the entry page |
| 217 | OSSCA | www.ossca.com | server-rendered, no search field on the entry page |
| 222 | Astemo / Hitachi / HÜCO | www.aftermarket.astemo.com | server-rendered, no search field on the entry page |
| 224 | DEPO | www.depoautolamp.com | server-rendered, no search field on the entry page |
| 225 | Saleri / SIL / Saleri Aftermarket | www.saleriaftermarket.com | server-rendered, no search field on the entry page |
| 235 | Klokkerholm | www.klokkerholm.com | server-rendered, no search field on the entry page |
| 236 | Van Wezel | www.vanwezel.de | server-rendered, no search field on the entry page |

## Застосунок на JavaScript — шукати його API (39)

| № | Каталог | Хост | Деталі |
|---|---|---|---|
| 1 | bilstein group: febi / SWAG / Blue Print | partsfinder.bilsteingroup.com | vue |
| 8 | LYNXauto | ecatalogue.lynxauto.jp | little server-rendered text |
| 9 | JP Group | jpgroup.dk | react |
| 16 | ACDelco | parts-catalog.acdelco.com | little server-rendered text |
| 18 | Beck/Arnley | www.beckarnley.com | angular |
| 23 | ZF / LEMFÖRDER / SACHS / TRW / BOGE | aftermarket.zf.com | vue |
| 26 | Bosch | www.boschaftermarket.com | angular |
| 28 | HELLA | cat.hella.com | little server-rendered text |
| 48 | Hoffer | www.hoffer-products.com | little server-rendered text |
| 49 | Meat&Doria | www.meat-doria.com | little server-rendered text |
| 51 | SMPE / Intermotor Group: Intermotor, Lucas, Lemark, FuelParts | intermotorgroup.elcome.co.uk | blazor |
| 52 | ELTA / VXPRO / Lucas | catalogue.eltaeurope.com | blazor |
| 60 | JUBANA | catalog.jubana.com | little server-rendered text |
| 78 | CALORSTAT by Vernet | www.ecalorstat.com | little server-rendered text |
| 90 | SCT-Germany | sct-catalogue.de | vue |
| 93 | MECAFILTER | catalogue.mecafilter.com | angular |
| 96 | MISFAT | catalogue.misfat.com | angular |
| 97 | HIFI FILTER | catalog.hifi-filter.com | little server-rendered text |
| 100 | MFilter / Baltic Filter | catalog.mfilter.lt | angular |
| 110 | Gates | navigates.gates.com | angular |
| 111 | Dayco | www.dayco.com | angular |
| 122 | BGA / BG Automotive | store.bgautomotive.co.uk | vue |
| 123 | Fel-Pro | www.felpro.com | angular |
| 126 | Ajusa | ajusa.online | little server-rendered text |
| 135 | Walker Exhaust | www.walkerexhaust.com | angular |
| 136 | BOSAL | catalogue.bosal.com | little server-rendered text |
| 150 | FTE — North America | fte.mycarparts.net | little server-rendered text |
| 152 | Akebono | akebonobrakes.mypartfinder.com | react |
| 157 | Frenkit | www.frenkit.es | little server-rendered text |
| 168 | OPTIMAL | webcatalog.optimal-germany.com | angular |
| 179 | Impergom / Original Imperium | www.impergom.it | little server-rendered text |
| 183 | NTN / SNR | eshop.ntn-snr.com | angular |
| 201 | Knorr-Bremse TruckServices | mytruckservices.knorr-bremse.com | angular |
| 202 | Haldex | www.haldex.com | little server-rendered text |
| 218 | TOPRAN / Hans Pries | shop.pries.de | little server-rendered text |
| 220 | MaXgear | maxgear.pl | little server-rendered text |
| 221 | NK / BORG Automotive Newman | shop.borgautomotive-newman.com | little server-rendered text |
| 232 | TRISCAN | tricat.triscan.dk | little server-rendered text |
| 233 | SASIC / SOFARE by SASIC | www.sasic-b2b.fr | little server-rendered text |

## PDF-каталоги (24)

| № | Каталог | Хост | Деталі |
|---|---|---|---|
| 10 | BSG | bsgautoparts.com | 10 PDF links |
| 21 | ATP Automotive | www.atpautomotive.com | 6 PDF links |
| 22 | Pioneer Automotive | www.pioneerautoinc.com | 5 PDF links |
| 34 | Wells Vehicle Electronics / WVE | wellsve.com | 3 PDF links |
| 42 | ERA | ecom.eraspares.com | 3 PDF links |
| 45 | BERU / BorgWarner | www.borgwarner.com | 2 PDF links |
| 54 | EFI Automotive / BOUGICORD — проводи для класичних авто | www.efi-service.com | direct PDF |
| 59 | WAI / Transpo | www.waiglobal.com | 0 PDF links |
| 63 | ULO | ulo.de | 4 PDF links |
| 67 | Aspöck | www.aspoeck.com | 4 PDF links |
| 68 | WAŚ | www.was.eu | 57 PDF links |
| 69 | Philips Automotive | www.philips.com | direct PDF |
| 71 | Truck-Lite / Signal-Stat | www.truck-lite.com | 7 PDF links |
| 72 | MotoRad | eu.motorad.com | 4 PDF links |
| 107 | DRiV: Sealed Power / Speed-Pro / National / FP Diesel | www.drivparts.com | 100 PDF links |
| 108 | DRiV: AE / Glyco / Goetze / Nüral / Payen | www.drivparts.com | 55 PDF links |
| 120 | Bando | www.bandoindonesia.com | 0 PDF links |
| 121 | Mitsuboshi / MBL | ecommerce.mblusa.com | 20 PDF links |
| 132 | Hutchinson | automotive.hutchinson.com | 7 PDF links |
| 195 | Precision International | transmissionkits.com | 0 PDF links |
| 207 | Hendrickson | www.hendrickson-intl.com | 0 PDF links |
| 210 | AL-KO Vehicle Technology / Winterhoff / Bradley | www.alko-tech.com | 0 PDF links |
| 211 | KNOTT | www.knott-anhaenger-shop.de | 5 PDF links |
| 229 | Eberspächer — вихлоп | www.eberspaecher.com | direct PDF |

## Платформа TecAlliance (26)

| № | Каталог | Хост | Деталі |
|---|---|---|---|
| 6 | METZGER |  | TecDoc web service behind an API key |
| 31 | Magneti Marelli Parts & Services |  | TecDoc web service behind an API key |
| 35 | Walker Products | www.walkerproducts.com | redirects to or embeds TecAlliance |
| 36 | NGK / NTK / Niterra | www.ngkntk.com | redirects to or embeds TecAlliance |
| 38 | FAE |  | TecDoc web service behind an API key |
| 50 | VDO / AUMOVIO (колишній Continental Automotive) |  | TecDoc web service behind an API key |
| 76 | DOLZ |  | TecDoc web service behind an API key |
| 80 | GEBA |  | TecDoc web service behind an API key |
| 109 | MAHLE / Knecht |  | TecDoc web service behind an API key |
| 124 | Elring |  | TecDoc web service behind an API key |
| 125 | Victor Reinz |  | TecDoc web service behind an API key |
| 127 | Corteco | web.tecalliance.net | redirects to or embeds TecAlliance |
| 128 | Glaser | glaser.es | redirects to or embeds TecAlliance |
| 129 | Elwis Royal | www.elwis.com | redirects to or embeds TecAlliance |
| 133 | Garrett | www.garrettmotion.com | redirects to or embeds TecAlliance |
| 140 | IMASAF | www.imasaf.it | redirects to or embeds TecAlliance |
| 144 | ATE | www.ate-brakes.com | redirects to or embeds TecAlliance |
| 148 | Otto Zimmermann |  | TecDoc web service behind an API key |
| 149 | REMSA |  | TecDoc web service behind an API key |
| 163 | KYB | kyb-europe.com | redirects to or embeds TecAlliance |
| 164 | Monroe | www.monroe.com | redirects to or embeds TecAlliance |
| 170 | Lesjöfors |  | TecDoc web service behind an API key |
| 176 | Original Birth |  | TecDoc web service behind an API key |
| 187 | AISIN / ADVICS | www.aisinaftermarket.eu | redirects to or embeds TecAlliance |
| 189 | GKN Automotive / SPIDAN / LÖBRO | www.gknautomotive.com | redirects to or embeds TecAlliance |
| 223 | BREMI | www.bremi.de | redirects to or embeds TecAlliance |

## Відмовляє автоматичним запитам (26)

| № | Каталог | Хост | Деталі |
|---|---|---|---|
| 12 | SKV / ESEN SKV | www.skv.pl | HTTP 403 |
| 25 | Frasle Mobility / Auto Experts: Fremax / Fras-le / Lonaflex / Controil / Nakata / Master / Jost / Suspensys / Castertech | www.autoexperts.parts | HTTP 403 |
| 30 | VAICO / VEMO / ACKOJA (VIEROL) | www.vierol-shop.de | HTTP 200 |
| 33 | Standard / Intermotor / Blue Streak | www.standardbrand.com | HTTP 403 |
| 43 | Mobiletron | ecat.mobiletron.co.uk | HTTP 200 |
| 70 | NARVA Light | www.narva-light.com | HTTP 200 |
| 84 | Hengst | catalog.hengst.com | HTTP 403 |
| 85 | UFI Filters | shop.ufi-aftermarket.com | HTTP 200 |
| 89 | JS ASAKASHI | www.jsfilter.jp | HTTP 200 |
| 91 | Donaldson | shop.donaldson.com | HTTP 403 |
| 98 | K&N | www.knfilters.com | HTTP 403 |
| 101 | Fleetguard | www.fleetguard.com | HTTP 200 |
| 102 | Baldwin Filters | www.baldwinfilters.com | HTTP 403 |
| 113 | Motorservice: Kolbenschmidt / Pierburg / BF / TRW Engine Components | onlineshop.ms-motorservice.com | HTTP 200 |
| 114 | King Engine Bearings | www.king-catalog.com | HTTP 403 |
| 131 | Athena | www.athena.eu | HTTP 405 |
| 162 | JIKIU | www.jikiu.com | HTTP 200 |
| 166 | BILSTEIN | bilstein.com | HTTP 200 |
| 188 | EXEDY | www3.exedy-aftermarket.com | HTTP 401 |
| 196 | ALKAR | www.alkar.es | HTTP 403 |
| 212 | Toyota Parts Center Online | autoparts.toyota.com | HTTP 403 |
| 213 | Nissan Parts USA | parts.nissanusa.com | HTTP 403 |
| 214 | Infiniti Parts USA | parts.infinitiusa.com | HTTP 403 |
| 215 | Honda DreamShop | dreamshop.honda.com | HTTP 403 |
| 231 | ERT SEINSA | ertseinsa.com | HTTP 200 |
| 234 | Schaeffler / LuK / INA / FAG | www.repxpert.com | HTTP 403 |

## Недоступний із сервера (10)

| № | Каталог | Хост | Деталі |
|---|---|---|---|
| 14 | Dorman |  | TooManyRedirects |
| 75 | AVA Cooling |  | SSLError |
| 118 | Enginetech |  | ConnectTimeout |
| 119 | Hastings Piston Rings |  | ConnectTimeout |
| 139 | Klarius |  | ConnectionError |
| 141 | ERNST |  | ConnectTimeout |
| 160 | LPR / Samko |  | SSLError |
| 185 | Timken |  | ConnectionError |
| 226 | Airtex |  | ConnectionError |
| 227 | Freccia |  | ConnectionError |

## Посилання не працює (2)

| № | Каталог | Хост | Деталі |
|---|---|---|---|
| 197 | DT Spare Parts (Diesel Technic) | www.dieseltechnic.com | HTTP 404 |
| 209 | TRUCKTEC | www.trucktec.de | HTTP 404 |
