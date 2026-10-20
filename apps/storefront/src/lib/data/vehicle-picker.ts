"use server"

import {
  retrieveVehicleMake,
  searchVehicles,
  VehicleFamily,
  VehicleMatch,
} from "./parts-catalog"
import {
  retrieveTecdocMake,
  retrieveTecdocModel,
  TecdocModel,
  TecdocVehicle,
} from "./catalog"

// What the vehicle picker in the header asks for while the shopper chooses.

export async function pickerFamilies(makeId: string): Promise<VehicleFamily[]> {
  return (await retrieveVehicleMake(makeId))?.families ?? []
}

export async function pickerSearch(q: string): Promise<VehicleMatch[]> {
  return q.trim().length >= 2 ? searchVehicles({ q: q.trim() }) : []
}

export async function pickerEngine(code: string): Promise<VehicleMatch[]> {
  const clean = code.replace(/\s+/g, "")

  return clean.length >= 3 ? searchVehicles({ engine: clean }) : []
}

export async function pickerTecdocModels(makeId: number): Promise<TecdocModel[]> {
  return (await retrieveTecdocMake(makeId))?.models ?? []
}

export async function pickerTecdocVehicles(modelId: number): Promise<TecdocVehicle[]> {
  return (await retrieveTecdocModel(modelId))?.vehicles ?? []
}
