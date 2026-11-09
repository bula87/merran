import type { AppDeps } from "../../../../../core/context.ts"
import type { Router } from "../../../../router.ts"
import runRoutes from "./run/index.ts"

export default (router: Router, deps: AppDeps) => {
  runRoutes(router, deps)
}
