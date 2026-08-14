import { createApp } from "./create-app.js";

async function main() {
  const created = await createApp({ runLocalStartupTasks: true });
  const port = Number(process.env.PORT ?? 3000);
  const host = "0.0.0.0";

  process.on("SIGINT", async () => {
    await created.close();
    process.exit(0);
  });

  await created.app.listen({ port, host });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
