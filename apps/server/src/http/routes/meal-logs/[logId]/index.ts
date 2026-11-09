import type { AppDeps } from "../../../../core/context.ts"
import type { Router } from "../../../router.ts"
import approveRoutes from "./approve/index.ts"
import del from "./delete.ts"
import photoRoutes from "./photo/index.ts"

export default (router: Router, deps: AppDeps) => {
  approveRoutes(router, deps)
  photoRoutes(router, deps)
  del(router, deps)
}
