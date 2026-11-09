import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import exportRoutes from "./export/index.ts"
import get from "./get.ts"
import languageRoutes from "./language/index.ts"
import onboardingRoutes from "./onboarding/index.ts"
import profileRoutes from "./profile/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  languageRoutes(router, deps)
  onboardingRoutes(router, deps)
  profileRoutes(router, deps)
  exportRoutes(router, deps)
}
