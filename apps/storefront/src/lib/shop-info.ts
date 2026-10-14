/**
 * Who sells in this shop. The law requires these details on the site
 * (Закон України «Про електронну комерцію», законодавство про захист прав
 * споживачів). Fill in the empty values; an empty value is shown as
 * "уточнюється".
 */
export const SHOP = {
  /** Shop name for shoppers. */
  name: "Auto Parts",
  site: "auto-parts.pp.ua",
  /** ФОП Прізвище Ім'я По батькові, or ТОВ «…». */
  seller: "",
  /** РНОКПП (ІПН) for a ФОП, or код ЄДРПОУ for a company. */
  sellerCode: "",
  /** Address the seller is registered at. */
  legalAddress: "",
  /** Where goods are handed over or returns are taken, if anywhere. */
  pickupAddress: "",
  phone: "",
  email: "",
  /** Messengers: Telegram, Viber. */
  messengers: "",
  hours: "",
  /** Whether the seller pays VAT. */
  vatPayer: "",
}

export const orUnknown = (value: string) => value.trim() || "уточнюється"
