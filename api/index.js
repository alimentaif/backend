import "dotenv/config";
import app from "../src/app.js";
import { initializeServices } from "../src/bootstrap.js";

export default async function handler(req, res) {
  try {
    await initializeServices();
    return app(req, res);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Falha ao iniciar API." });
  }
}
