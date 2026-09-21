import { Service } from "encore.dev/service";
import { init_tenants_db } from "../../db/db-connection";
import { clone_repo } from "../../utils/clone-repo";

import { LoggingMiddleware } from "../../middleware/app-logging";
import { TenantMiddleware } from "../../middleware/db-middleware";

// Load-time: connect, detect tenants table once, set IS_TENANT
init_tenants_db()
  .then(() => console.log(":---------DB initialization completed---------:"))
  .catch((err) => console.error(":---------DB initialization failed---------:", err));

clone_repo()
  .then(() => console.log(":---------Repo initialization completed---------:"))
  .catch((err) => console.error(":---------Repo initialization failed---------:", err));

export default new Service("health", {
  middlewares: [LoggingMiddleware, TenantMiddleware],
});
