import type { AppDeps } from "../../../core/context.ts"
import type { Router } from "../../router.ts"
import logIdRoutes from "./[logId]/index.ts"
import get from "./get.ts"
import post from "./post.ts"

export default (router: Router, deps: AppDeps) => {
  get(router, deps)
  post(router, deps)
  logIdRoutes(router, deps)
}
