import { z } from "@hono/zod-openapi"

export const USER_MEAL_SLOTS = [
  "breakfast",
  "morning-snack",
  "lunch",
  "afternoon-snack",
  "dinner",
] as const

export const USER_COOKING_DEVICES = ["mixer-thermomix", "air-fryer"] as const

export const USER_GOALS = [
  "weight-loss",
  "more-energy",
  "better-eating-habits",
] as const

const foodList = z
  .array(z.string().trim().min(1).max(80))
  .max(50)
  .transform((items) => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const item of items) {
      const key = item.toLocaleLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(item)
    }
    return out
  })

export const UserProfileSchema = z
  .object({
    age: z.number().int().min(1).max(130).nullable(),
    weightKg: z.number().finite().min(1).max(500).nullable(),
    heightCm: z.number().finite().min(30).max(300).nullable(),
    allergies: foodList,
    favoriteFoods: foodList,
    dislikedFoods: foodList,
    mealsPerDay: z.array(z.enum(USER_MEAL_SLOTS)).max(5),
    cookingDevices: z.array(z.enum(USER_COOKING_DEVICES)).max(10),
    goal: z.enum(USER_GOALS).nullable(),
  })
  .openapi("UserProfile")

export type UserProfile = z.infer<typeof UserProfileSchema>

export const emptyUserProfile: UserProfile = {
  age: null,
  weightKg: null,
  heightCm: null,
  allergies: [],
  favoriteFoods: [],
  dislikedFoods: [],
  mealsPerDay: [],
  cookingDevices: [],
  goal: null,
}

export function normalizeUserProfile(value: unknown): UserProfile {
  const parsed = UserProfileSchema.safeParse(value ?? {})
  if (parsed.success) {
    return {
      ...parsed.data,
      mealsPerDay: [...new Set(parsed.data.mealsPerDay)],
      cookingDevices: [...new Set(parsed.data.cookingDevices)],
    }
  }
  return emptyUserProfile
}
