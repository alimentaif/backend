import { Router } from "express";
import multer from "multer";
import mongoose from "mongoose";
import Aluno from "../models/Aluno.js";
import Turma from "../models/Turma.js";
import { authRequired } from "../middleware/auth.js";
import { generateQrDataUrl } from "../utils/qrcode.js";
import {
  configureCloudinary,
  isCloudinaryConfigured,
  uploadAlunoFoto,
  destroyAlunoFoto,
} from "../utils/cloudinary.js";
import { runBulkImport } from "../utils/bulkImportAlunos.js";

const uploadMem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("Envie uma imagem JPEG, PNG, WebP ou GIF."));
  },
});

const uploadImport = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "planilha") {
      const ok =
        file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.mimetype === "application/vnd.ms-excel" ||
        /\.xlsx?$/i.test(file.originalname || "");
      if (ok) cb(null, true);
      else cb(new Error("Envie uma planilha Excel (.xlsx)."));
    } else if (file.fieldname === "fotos") {
      const ok =
        file.mimetype === "application/zip" ||
        file.mimetype === "application/x-zip-compressed" ||
        /\.zip$/i.test(file.originalname || "");
      if (ok) cb(null, true);
      else cb(new Error("O arquivo de fotos deve ser um ZIP."));
    } else cb(null, false);
  },
});

const router = Router();

router.use(authRequired);

function ensureCloudinary(res) {
  if (!isCloudinaryConfigured()) {
    res.status(503).json({
      message:
        "Upload de fotos não configurado. Defina CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no .env do backend.",
    });
    return false;
  }
  configureCloudinary();
  return true;
}

router.get("/", async (req, res) => {
  try {
    const { turma, curso, search, matricula, nome } = req.query;
    const q = {};
    if (turma && mongoose.isValidObjectId(turma)) q.turma = turma;
    if (curso) q.curso = new RegExp(String(curso), "i");
    if (nome) q.nome = new RegExp(String(nome), "i");
    if (matricula) q.matricula = new RegExp(`^${String(matricula).trim()}`, "i");
    if (search) {
      q.$or = [
        { nome: new RegExp(String(search), "i") },
        { matricula: new RegExp(String(search), "i") },
      ];
    }
    const list = await Aluno.find(q).populate("turma", "nome curso").sort({ nome: 1 }).lean();
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro ao listar alunos." });
  }
});

/** Move vários alunos para outra turma (sem alterar matrícula/QR) */
router.post("/bulk/move", async (req, res) => {
  try {
    const { alunoIds, targetTurma } = req.body;
    if (!Array.isArray(alunoIds) || alunoIds.length === 0) {
      return res.status(400).json({ message: "Selecione ao menos um aluno." });
    }
    if (!targetTurma || !mongoose.isValidObjectId(targetTurma)) {
      return res.status(400).json({ message: "Turma de destino inválida." });
    }
    const idsValidos = alunoIds.filter((id) => mongoose.isValidObjectId(id));
    if (idsValidos.length === 0) {
      return res.status(400).json({ message: "Nenhum ID de aluno válido enviado." });
    }
    const turmaDestino = await Turma.findById(targetTurma).lean();
    if (!turmaDestino) {
      return res.status(404).json({ message: "Turma de destino não encontrada." });
    }
    const op = await Aluno.updateMany(
      { _id: { $in: idsValidos } },
      { $set: { turma: targetTurma, curso: turmaDestino.curso } }
    );
    return res.json({
      message: "Alunos movidos com sucesso.",
      matched: op.matchedCount ?? 0,
      modified: op.modifiedCount ?? 0,
      turmaDestino: { _id: turmaDestino._id, nome: turmaDestino.nome, curso: turmaDestino.curso },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Erro ao mover alunos em lote." });
  }
});

/** Exclui vários alunos de uma vez (ex.: turmas formandas) */
router.post("/bulk/delete", async (req, res) => {
  try {
    const { alunoIds } = req.body;
    if (!Array.isArray(alunoIds) || alunoIds.length === 0) {
      return res.status(400).json({ message: "Selecione ao menos um aluno." });
    }
    const idsValidos = alunoIds.filter((id) => mongoose.isValidObjectId(id));
    if (idsValidos.length === 0) {
      return res.status(400).json({ message: "Nenhum ID de aluno válido enviado." });
    }
    const docs = await Aluno.find({ _id: { $in: idsValidos } }).select("_id fotoUrl").lean();
    const op = await Aluno.deleteMany({ _id: { $in: idsValidos } });

    if (isCloudinaryConfigured()) {
      configureCloudinary();
      const comFoto = docs.filter((d) => d.fotoUrl);
      await Promise.allSettled(comFoto.map((d) => destroyAlunoFoto(String(d._id))));
    }
    return res.json({
      message: "Alunos excluídos com sucesso.",
      requested: idsValidos.length,
      deleted: op.deletedCount ?? 0,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Erro ao excluir alunos em lote." });
  }
});

/**
 * Importação em massa: planilha .xlsx (colunas: nome, matrícula, curso, ano de entrada, foto opcional).
 * Turmas são criadas automaticamente como "Curso (ano)" quando não existirem.
 * Foto: URL https na coluna, ou envie ZIP opcional com arquivos nomeados pela matrícula (ex.: 2024001.jpg).
 */
router.post(
  "/bulk/import",
  (req, res, next) => {
    uploadImport.fields([
      { name: "planilha", maxCount: 1 },
      { name: "fotos", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        const msg = err.message || "Arquivo inválido.";
        return res.status(400).json({
          message: msg.includes("File too large") ? "Arquivo muito grande (máx. 40 MB)." : msg,
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const files = req.files;
      const planilha = files?.planilha?.[0];
      if (!planilha?.buffer) {
        return res.status(400).json({ message: 'Envie a planilha no campo "planilha" (arquivo .xlsx).' });
      }
      const zipFile = files?.fotos?.[0];
      const result = await runBulkImport({
        planilhaBuffer: planilha.buffer,
        zipBuffer: zipFile?.buffer ?? null,
      });
      if (!result.ok) {
        return res.status(400).json({ message: result.message });
      }
      res.status(201).json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Erro ao importar planilha." });
    }
  }
);

/** Upload da foto (Cloudinary) — multipart field "foto" */
router.post(
  "/:id/foto",
  (req, res, next) => {
    uploadMem.single("foto")(req, res, (err) => {
      if (err) {
        const msg = err.message || "Arquivo inválido.";
        return res.status(400).json({ message: msg.includes("File too large") ? "Arquivo muito grande (máx. 5 MB)." : msg });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!ensureCloudinary(res)) return;
      if (!req.file?.buffer) {
        return res.status(400).json({ message: "Nenhum arquivo enviado (campo: foto)." });
      }
      const { id } = req.params;
      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ message: "ID inválido." });
      }
      const a = await Aluno.findById(id);
      if (!a) return res.status(404).json({ message: "Aluno não encontrado." });
      const result = await uploadAlunoFoto(req.file.buffer, id);
      a.fotoUrl = result.secure_url;
      await a.save();
      const populated = await Aluno.findById(a._id).populate("turma", "nome curso").lean();
      res.json({ message: "Foto enviada.", fotoUrl: result.secure_url, aluno: populated });
    } catch (e) {
      console.error(e);
      res.status(500).json({ message: "Erro ao enviar foto para o Cloudinary." });
    }
  }
);

router.delete("/:id/foto", async (req, res) => {
  try {
    if (!ensureCloudinary(res)) return;
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "ID inválido." });
    }
    const a = await Aluno.findById(id);
    if (!a) return res.status(404).json({ message: "Aluno não encontrado." });
    if (a.fotoUrl) {
      try {
        await destroyAlunoFoto(id);
      } catch (e) {
        console.warn("[cloudinary] destroy:", e?.message || e);
      }
    }
    a.fotoUrl = "";
    a.fotoDataUrl = "";
    await a.save();
    const populated = await Aluno.findById(a._id).populate("turma", "nome curso").lean();
    res.json({ message: "Foto removida.", aluno: populated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro ao remover foto." });
  }
});

router.get("/:id/qrcode", async (req, res) => {
  try {
    const a = await Aluno.findById(req.params.id);
    if (!a) return res.status(404).json({ message: "Aluno não encontrado." });
    const qrCodeDataUrl = await generateQrDataUrl(a.matricula);
    a.qrCodeDataUrl = qrCodeDataUrl;
    await a.save();
    res.json({ qrCodeDataUrl });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro ao gerar QR Code." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const a = await Aluno.findById(req.params.id).populate("turma").lean();
    if (!a) return res.status(404).json({ message: "Aluno não encontrado." });
    res.json(a);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro ao buscar aluno." });
  }
});

router.post("/", async (req, res) => {
  try {
    const { nome, matricula, turma, anoEntrada, fotoUrl } = req.body;
    if (!nome || !matricula || !turma || anoEntrada == null) {
      return res.status(400).json({ message: "Campos obrigatórios: nome, matricula, turma, anoEntrada." });
    }
    if (!mongoose.isValidObjectId(turma)) {
      return res.status(400).json({ message: "Turma inválida." });
    }
    const turmaDoc = await Turma.findById(turma).lean();
    if (!turmaDoc) {
      return res.status(400).json({ message: "Turma não encontrada." });
    }
    const qrCodeDataUrl = await generateQrDataUrl(String(matricula).trim());
    const payload = {
      nome,
      matricula: String(matricula).trim(),
      curso: turmaDoc.curso,
      turma,
      anoEntrada: Number(anoEntrada),
      qrCodeDataUrl,
    };
    if (fotoUrl && typeof fotoUrl === "string" && fotoUrl.startsWith("https://")) {
      payload.fotoUrl = fotoUrl;
    }
    const a = await Aluno.create(payload);
    const populated = await Aluno.findById(a._id).populate("turma", "nome curso").lean();
    res.status(201).json(populated);
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ message: "Matrícula já cadastrada." });
    }
    console.error(e);
    res.status(500).json({ message: "Erro ao criar aluno." });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { nome, matricula, turma, anoEntrada } = req.body;
    const a = await Aluno.findById(req.params.id);
    if (!a) return res.status(404).json({ message: "Aluno não encontrado." });
    if (nome != null) a.nome = nome;
    if (turma != null) {
      if (!mongoose.isValidObjectId(turma)) {
        return res.status(400).json({ message: "Turma inválida." });
      }
      const turmaExiste = await Turma.exists({ _id: turma });
      if (!turmaExiste) {
        return res.status(400).json({ message: "Turma não encontrada." });
      }
      a.turma = turma;
    }
    if (anoEntrada != null) a.anoEntrada = Number(anoEntrada);
    if (matricula != null && String(matricula).trim() !== a.matricula) {
      a.matricula = String(matricula).trim();
      a.qrCodeDataUrl = await generateQrDataUrl(a.matricula);
    }
    const turmaAtual = await Turma.findById(a.turma).lean();
    if (!turmaAtual) {
      return res.status(400).json({ message: "Turma não encontrada." });
    }
    a.curso = turmaAtual.curso;
    await a.save();
    const populated = await Aluno.findById(a._id).populate("turma", "nome curso").lean();
    res.json(populated);
  } catch (e) {
    if (e.code === 11000) {
      return res.status(409).json({ message: "Matrícula já cadastrada." });
    }
    console.error(e);
    res.status(500).json({ message: "Erro ao atualizar aluno." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const a = await Aluno.findByIdAndDelete(req.params.id);
    if (!a) return res.status(404).json({ message: "Aluno não encontrado." });
    if (a.fotoUrl && isCloudinaryConfigured()) {
      configureCloudinary();
      try {
        await destroyAlunoFoto(req.params.id);
      } catch (e) {
        console.warn("[cloudinary] destroy aluno:", e?.message || e);
      }
    }
    res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro ao excluir aluno." });
  }
});

export default router;
