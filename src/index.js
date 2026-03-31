import "dotenv/config";
import app from "./app.js";
import { initializeServices } from "./bootstrap.js";

const PORT = Number(process.env.PORT) || 5000;

async function main() {
  await initializeServices();

  app.listen(PORT, () => {
    console.log(`API em http://localhost:${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
