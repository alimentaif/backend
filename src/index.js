import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./models/User.js";
import authRoutes from "./routes/auth.js";
import turmasRoutes from "./routes/turmas.js";
import alunosRoutes from "./routes/alunos.js";
import retiradasRoutes from "./routes/retiradas.js";
import dashboardRoutes from "./routes/dashboard.js";

const PORT = Number(process.env.PORT) || 5000;

async function seedAdminOptional() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return;
  const exists = await User.findOne({ email });
  if (exists) return;
  const hash = await bcrypt.hash(password, 10);
  await User.create({ email, password: hash });
  console.log("[seed] Administrador criado:", email);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("Defina MONGODB_URI no .env");
    process.exit(1);
  }
  if (!process.env.JWT_SECRET) {
    console.error("Defina JWT_SECRET no .env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB conectado");
  await seedAdminOptional();

  if (
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  ) {
    const { configureCloudinary } = await import("./utils/cloudinary.js");
    configureCloudinary();
    console.log("Cloudinary configurado");
  } else {
    console.log("[aviso] Cloudinary não configurado — upload de fotos desativado até definir variáveis no .env");
  }

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({
      name: "AlimentaIF API",
      ok: true,
      docs: "Rotas em /api/* (ex.: GET /api/auth/me com Bearer). Saúde: GET /health",
      frontend: "Interface Next.js: http://localhost:3000",
    });
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRoutes);
  app.use("/api/turmas", turmasRoutes);
  app.use("/api/alunos", alunosRoutes);
  app.use("/api/retiradas", retiradasRoutes);
  app.use("/api/dashboard", dashboardRoutes);

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ message: "Erro interno." });
  });

  app.listen(PORT, () => {
    console.log(`API em http://localhost:${PORT}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
