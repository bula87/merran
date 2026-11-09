import { defineEntity, p, type InferEntity } from "@mikro-orm/core"
import { createdAt, id, updatedAt } from "./base.ts"

export type UserMealSlot =
  "breakfast" | "morning-snack" | "lunch" | "afternoon-snack" | "dinner"

export type UserCookingDevice = "mixer-thermomix" | "air-fryer"

export type UserGoal = "weight-loss" | "more-energy" | "better-eating-habits"

export type UserProfilePreferences = {
  age?: number | null
  /** Kilograms. */
  weightKg?: number | null
  /** Centimeters. */
  heightCm?: number | null
  allergies?: string[]
  favoriteFoods?: string[]
  dislikedFoods?: string[]
  mealsPerDay?: UserMealSlot[]
  cookingDevices?: UserCookingDevice[]
  goal?: UserGoal | null
}

/** Each person's own choices, the same in every household they're in. */
export type UserPreferences = {
  appearance?: { mode: "light" | "dark" | "system"; palette: string }
  language?: string
  units?: "as-written" | "us" | "metric"
  /** Guided tours seen, by tour id, at the version seen. */
  tours?: Record<string, number>
  onboarding?: { dismissed?: boolean; toursDisabled?: boolean }
  profile?: UserProfilePreferences
}

/**
 * A person: Better Auth's user, with its username and admin plugins. Better
 * Auth doesn't fill in Merran's own columns, so they allow null.
 */
export const User = defineEntity({
  name: "User",
  tableName: "users",
  properties: {
    id: id(),
    name: p.string(),
    email: p.string().unique(),
    emailVerified: p.boolean().default(false),
    twoFactorEnabled: p.boolean().default(false),
    image: p.string().nullable(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    // Better Auth's username plugin
    username: p.string().unique().nullable(),
    displayUsername: p.string().nullable(),
    // Better Auth's admin plugin: "admin" is the server admin
    role: p.string().nullable(),
    banned: p.boolean().nullable().default(false),
    banReason: p.string().nullable(),
    banExpires: p.datetime().nullable(),
    // Merran's
    preferences: p.json<UserPreferences>().nullable(),
  },
})
export type User = InferEntity<typeof User>
