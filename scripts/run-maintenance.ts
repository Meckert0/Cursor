import { createApp } from "../src/create-app.js";
import { runMaintenance } from "../src/services/maintenance.js";

async function main() {
  const created = await createApp({ runLocalStartupTasks: false });
  try {
    const result = await runMaintenance({
      exportQueue: created.exportQueue,
      authStore: created.authStore
    });
    console.log(
      `Maintenance complete: recovered=${result.recovery.recovered} processed=${result.due.processed} retentionDeleted=${result.retention.deleted} adminSync=${result.adminSync}`
    );
  } finally {
    await created.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
