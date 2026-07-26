"use client"

import * as React from "react"

import type { Id } from "@/convex/_generated/dataModel"

type HouseholdRole = "patient" | "caregiver"
type TomoHousehold = {
  householdId: Id<"households">
  userId: string
  roles: HouseholdRole[]
  displayName: string
}

const Context = React.createContext<TomoHousehold | null>(null)

export function TomoHouseholdProvider({ value, children }: { value: TomoHousehold; children: React.ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useTomoHousehold() {
  const value = React.useContext(Context)
  if (!value) throw new Error("useTomoHousehold must be used after authenticated household selection")
  return value
}
