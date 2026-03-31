import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import turmasRoutes from "./routes/turmas.js";
import alunosRoutes from "./routes/alunos.js";
import retiradasRoutes from "./routes/retiradas.js";
import dashboardRoutes from "./routes/dashboard.js";

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    name: "AlimentaIF API",
    ok: true,
    docs: "Rotas em /api/* (ex.: GET /api/auth/me com Bearer). Saúde: GET /health",
    frontend: "Interface Next.js",
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

export default app;
