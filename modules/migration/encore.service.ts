import { Service } from "encore.dev/service";
import { init_tenants_db } from "../../db/db-connection";
import { clone_repo } from "../../utils/clone-repo";
import { LoggingMiddleware } from "../../middleware/app-logging";

init_tenants_db().catch((err) =>
  console.error(":---------DB initialization failed---------:", err)
);
clone_repo().catch((err) =>
  console.error(":---------Repo initialization failed---------:", err)
);

export default new Service("migration", {
  middlewares: [LoggingMiddleware],
});
