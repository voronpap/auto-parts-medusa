"use server"

import { headers } from "next/headers"

// The reverse proxy sets x-real-ip to the visitor's address.
export async function getClientIpHeader(): Promise<Record<string, string>> {
  const clientIp = (await headers()).get("x-real-ip")

  return clientIp ? { "x-real-ip": clientIp } : {}
}
