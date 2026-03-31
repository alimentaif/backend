import "dotenv/config";
import app from "../src/app.js";
import { initializeServices } from "../src/bootstrap.js";

export default async function handler(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    await initializeServices();
    return app(req, res);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Falha ao iniciar API." });
  }
}
