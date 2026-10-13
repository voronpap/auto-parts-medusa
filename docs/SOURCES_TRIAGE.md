# Розвідка джерел

Один ввічливий запит до вхідної сторінки кожного з 236 каталогів, зроблений
із сервера магазину 2026-10-12. Класифікація груба: вона каже, з чого
починати, а не чи вдасться написати адаптер. Позначка «відмовляє» інколи
хибна — її дає й сторінка, де слово captcha стосується лише форми зворотного
зв'язку.

Повторити: `apps/parsers/.venv/bin/python tools/triage.py <catalogs.json> <report.json>`.

## Стан роботи (оновлено 2026-10-13)

Перш ніж брати джерело, перевір цей розділ і `git log -- apps/parsers`.
Закінчив джерело чи з'ясував, що воно закрите, — допиши рядок сюди.

**Підключено:**

| Джерело | Спосіб | Що дає |
|---|---|---|
| Bosch (№ 26) | JSON API `ps.emea.dxtservice.com/ps/api/uk/ua` | OE-номери, застосовність, характеристики; пошук за OE-номером. Лише «від номера»: пошуку деталей за автомобілем у відкритому сервісі немає |
| bilstein group: febi, SWAG, Blue Print | JSON API `partsfinder.bilsteingroup.com` | OE-номери, сестринські бренди; пошук за OE-номером. Застосовності у відкритому доступі немає |
| MANN-FILTER (№ 81), FILTRON | сторінка товару + GraphQL `/api/graphql/catalog-prod` | OE-номери, аналоги, застосовність, характеристики; пошук за чужим номером; дерево «марка → модель → деталі» |
| FEBEST (№ 161) | HTML, справжній каталог на `febest.de` | OE-номери, застосовність; пошук за OE-номером і за маркою авто |
| NRF (№ 74), гілка `parsers/nrf` | HTML + відкритий JSON API застосовності | OE-кроси, застосовність, характеристики; пошук за OE. Підготовлено до злиття й деплою, версія 1.1.0, останній коміт `a41f849`. Локально: 50539; 50100811 для MG HS; MG OE 10101597 → NRF 50100811. Ця гілка окрема й не входить до гілок NiBK/Nissens/ZF |
| NiBK / JNBK (№ 153), гілка `parsers/nibk` | HTML публічної POST-форми й сторінок товарів | Явно підписані OE-кроси й номери конкурентів, характеристики, застосовність; GEELY, HAVAL, MG (SAIC), Chery, BYD та інші китайські марки. Інструмент `nibk_model_numbers.py` збирає номери за маркою. Підготовлено до злиття й деплою; 17 нових тестів. Локально: PN8056, PN6049, Geely 8894490939 |
| Nissens (№ 73), гілка `parsers/nissens` | Публічна HTML POST-форма `Product/Search` і `Product/ProductDetails` | OE-номери з підтвердженням виробника, застосовність, характеристики; сучасні MG та інші китайські марки. Пошук із пагінацією; `nissens_make_numbers.py` збирає номери за маркою (50 для MG). 16 нових тестів. Локально: 607401 → MG 10792284; 941518 → MG 10108310; OE 10792284 → Nissens 607401. Підготовлено до злиття й деплою; гілка включає попередній NiBK і підтримку форм |
| ZF / LEMFÖRDER / SACHS / TRW / BOGE (№ 23), гілка `parsers/zf` | Анонімний JSON API `/api/search`, `/api/articles`; відкритий `/functions/controller/opc` для застосовності | Явно підписані OE-кроси, альтернативи, характеристики, застосовність; заміни й склад комплектів (`CONTAINS`, не аналог). 25 нових тестів, 158 загалом. Локально: TRW GDB1330 — 256 зв'язків / 2018 застосовностей (2 MG) / 17 характеристик; SACHS 3000 951 003 — 4 компоненти, заміна 3000 951 603, 7 застосовностей; TRW GDB1338 → GDB1212; MG OE 10030811 → GDB1330 і GDB1330DTE. `zf_model_numbers.py`: 8 номерів TRW для MG 6. Підготовлено до злиття й деплою; гілка включає попередні NiBK і Nissens, не NRF |
| Geely KSA (нове джерело поза початковими 236), гілка `parsers/geely-ksa` | HTML [офіційної сторінки](https://geelyksa.com/spare-parts/); перемикач моделей без API | Власні номери й опис деталей Geely, часткова застосовність за моделлю; без кросів, років і двигунів. Гальма, електрика, охолодження та інше: 391 рядок / 360 різних номерів для восьми моделей. 16 нових тестів, 183 загалом на оновленому main. Локально: 2069031600 — RADIATOR для MONJARO/STARRAY; 4048104500 — PAD-FRT BRAKE для STARRAY; 4048090200 — FRONT BRAKE FRICTION PAD для NEW EMGRAND, помилок немає. `geely_ksa_model_numbers.py`: 84 номери для MONJARO/STARRAY. Пауза 20 секунд. Нове джерело додається через SourceMeta; статичний JSON реєстру бекенду не змінено |
| Monroe, KYB | PDF, завантажено цілком | застосовність; у KYB — OE-номери монтажних комплектів і заміни знятих номерів |

**Перевірено й відкладено:**

| Джерело | Причина |
|---|---|
| Каталоги на платформі TecAlliance (26 шт.) | потрібен власний ключ TecDoc; власник магазину питає постачальника |
| SIDEM (№ 171) | пошук закритий захистом від ботів (потрібні JavaScript і cookies) |
| Japanparts / Ashika / Japko (№ 3) | Cloudflare відповідає перевіркою |
| WIX Filters (№ 82) | та сама платформа, що в MANN, але адреси сторінок товарів будуються інакше; потрібно знайти їхній спосіб |
| Brembo (№ 143), гілка `parsers/brembo` — лише звіт | Публічний пошук і JSON OE-таблиця технічно доступні без входу; перевірено P 85 020 (є MG, Geely). Однак футер товару прямо обмежує копіювання даних без згоди TecAlliance. Оскільки сервіс архівує сирі відповіді, адаптер і масове збирання відкладено до підтвердження дозволу власником. Це не captcha і не технічна недоступність; обходів немає. 0 нових тестів; після інтеграції оновленого main усі 166 наявних тестів пройшли |

Власник 2026-10-13 підтвердив наявність дозволу Brembo/TecAlliance; очікуються
його умови щодо архівування й масового збирання. Облікові дані не запитуються.

**Розвідано, адаптера ще немає:**

| Джерело | Що відомо |
|---|---|
| Valeo, Gates | сайти-застосунки на JavaScript; потрібно знайти їхній API в мережевих запитах сторінки |

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
