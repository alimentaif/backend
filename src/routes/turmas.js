import { Router } from "express";
import Turma from "../models/Turma.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();

router.use(authRequired);

router.get("/", async (req, res) => {
  try {
    const { curso, search } = req.query;
    const q = {};
    if (curso) q.curso = new RegExp(String(curso), "i");
    if (search) q.nome = new RegExp(String(search), "i");
    const list = await Turma.find(q).sort({ nome: 1 }).lean();
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro ao listar turmas." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const t = await Turma.findById(req.params.id).lean();
    if (!t) return res.status(404).json({ message: "Turma não encontrada." });
    res.json(t);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro ao buscar turma." });
  }
});

router.post("/", async (req, res) => {
  try {
    const { nome, curso, schedule } = req.body;
    if (!nome || !curso) {
      return res.status(400).json({ message: "Nome e curso são obrigatórios." });
    }
    const t = await Turma.create({ nome, curso, schedule });
    res.status(201).json(t);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro ao criar turma." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { nome, curso, schedule } = req.body;
    const t = await Turma.findByIdAndUpdate(
      req.params.id,
      { ...(nome != null && { nome }), ...(curso != null && { curso }), ...(schedule != null && { schedule }) },
      { new: true, runValidators: true }
    );
    if (!t) return res.status(404).json({ message: "Turma não encontrada." });
    res.json(t);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro ao atualizar turma." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const t = await Turma.findByIdAndDelete(req.params.id);
    if (!t) return res.status(404).json({ message: "Turma não encontrada." });
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro ao excluir turma." });
  }
});

export default router;
