import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import get from "./get.ts"
import applyRoutes from "./apply/index.ts"
import declineRoutes from "./decline/index.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  applyRoutes(router, deps)
  declineRoutes(router, deps)
}
