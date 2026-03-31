import { Router } from "express";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import Retirada from "../models/Retirada.js";
import Aluno from "../models/Aluno.js";
import Turma from "../models/Turma.js";
import { authRequired } from "../middleware/auth.js";
import { nowSaoPaulo, getCurrentTurn, turmaAllowsTurnOnDate } from "../utils/turno.js";

const router = Router();
const TZ = "America/Sao_Paulo";

function startOfDaySP(dt) {
  return dt.startOf("day").toJSDate();
}

/** POST /validar — sem JWT para uso no ponto de retirada (pode proteger depois com API key) */
router.post("/validar", async (req, res) => {
  try {
    const { matricula } = req.body;
    if (!matricula || typeof matricula !== "string") {
      return res.status(400).json({ message: "Matrícula é obrigatória." });
    }
    const m = matricula.trim();
    const aluno = await Aluno.findOne({ matricula: m }).populate("turma");
    if (!aluno) {
      return res.status(404).json({ message: "Aluno não encontrado." });
    }
    const turma = aluno.turma;
    if (!turma) {
      return res.status(400).json({ message: "Aluno sem turma vinculada." });
    }
    const sp = nowSaoPaulo();
    const turno = getCurrentTurn();
    const check = turmaAllowsTurnOnDate(turma, turno, sp);
    if (!check.allowed) {
      return res.status(403).json({ message: check.reason, turno, aluno: { nome: aluno.nome, matricula: aluno.matricula } });
    }
    const dataDia = startOfDaySP(sp);
    const dup = await Retirada.findOne({ aluno: aluno._id, data: dataDia, turno });
    if (dup) {
      return res.status(409).json({
        message: "Retirada já registrada neste turno hoje.",
        turno,
        aluno: { nome: aluno.nome, matricula: aluno.matricula },
      });
    }
    const hora = sp.toJSDate();
    const r = await Retirada.create({
      aluno: aluno._id,
      data: dataDia,
      hora,
      turno,
    });
    const populated = await Retirada.findById(r._id).populate("aluno", "nome matricula curso").lean();
    res.status(201).json({
      message: "Retirada registrada com sucesso.",
      retirada: populated,
    });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ message: "Retirada já registrada neste turno hoje." });
    }
    console.error(e);
    res.status(500).json({ message: "Erro ao validar retirada." });
  }
});

router.use(authRequired);

router.get("/", async (req, res) => {
  try {
    const { aluno, turma, curso, turno, dataInicio, dataFim, matricula } = req.query;
    const match = {};
    if (turno && ["manha", "tarde"].includes(turno)) match.turno = turno;
    if (dataInicio || dataFim) {
      match.data = {};
      if (dataInicio) match.data.$gte = DateTime.fromISO(String(dataInicio), { zone: TZ }).startOf("day").toJSDate();
      if (dataFim) match.data.$lte = DateTime.fromISO(String(dataFim), { zone: TZ }).endOf("day").toJSDate();
    }
    if (aluno && mongoose.isValidObjectId(aluno)) match.aluno = new mongoose.Types.ObjectId(aluno);

    const pipeline = [{ $match: match }];
    pipeline.push({
      $lookup: {
        from: "alunos",
        localField: "aluno",
        foreignField: "_id",
        as: "alunoDoc",
      },
    });
    pipeline.push({ $unwind: "$alunoDoc" });

    if (matricula) {
      pipeline.push({
        $match: { "alunoDoc.matricula": new RegExp(`^${String(matricula).trim()}`, "i") },
      });
    }
    if (curso) {
      pipeline.push({
        $match: { "alunoDoc.curso": new RegExp(String(curso), "i") },
      });
    }
    if (turma && mongoose.isValidObjectId(turma)) {
      pipeline.push({
        $match: { "alunoDoc.turma": new mongoose.Types.ObjectId(turma) },
      });
    }

    pipeline.push({ $sort: { hora: -1 } });
    pipeline.push({
      $lookup: {
        from: "turmas",
        localField: "alunoDoc.turma",
        foreignField: "_id",
        as: "turmaDoc",
      },
    });
    pipeline.push({ $unwind: { path: "$turmaDoc", preserveNullAndEmptyArrays: true } });
    pipeline.push({
      $project: {
        _id: 1,
        data: 1,
        hora: 1,
        turno: 1,
        createdAt: 1,
        aluno: {
          _id: "$alunoDoc._id",
          nome: "$alunoDoc.nome",
          matricula: "$alunoDoc.matricula",
          curso: "$alunoDoc.curso",
        },
        turma: { nome: "$turmaDoc.nome", curso: "$turmaDoc.curso" },
      },
    });

    const list = await Retirada.aggregate(pipeline);
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro ao listar retiradas." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const r = await Retirada.findById(req.params.id).populate("aluno", "nome matricula curso turma").lean();
    if (!r) return res.status(404).json({ message: "Retirada não encontrada." });
    res.json(r);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro ao buscar retirada." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const r = await Retirada.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ message: "Retirada não encontrada." });
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro ao excluir retirada." });
  }
});

export default router;
