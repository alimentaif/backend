import { Router } from "express";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import Aluno from "../models/Aluno.js";
import Retirada from "../models/Retirada.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();
const TZ = "America/Sao_Paulo";

router.use(authRequired);

function rangeFromQuery({ periodoInicio, periodoFim }) {
  const now = DateTime.now().setZone(TZ);
  let inicio = now.startOf("day");
  let fim = now.endOf("day");
  if (periodoInicio) {
    inicio = DateTime.fromISO(String(periodoInicio), { zone: TZ }).startOf("day");
  }
  if (periodoFim) {
    fim = DateTime.fromISO(String(periodoFim), { zone: TZ }).endOf("day");
  }
  return { inicio: inicio.toJSDate(), fim: fim.toJSDate() };
}

router.get("/", async (req, res) => {
  try {
    const { turma, curso, periodoInicio, periodoFim } = req.query;
    const now = DateTime.now().setZone(TZ);
    const hojeIni = now.startOf("day").toJSDate();
    const hojeFim = now.endOf("day").toJSDate();
    const semIni = now.startOf("week").toJSDate();
    const semFim = now.endOf("week").toJSDate();
    const mesIni = now.startOf("month").toJSDate();
    const mesFim = now.endOf("month").toJSDate();

    const alunoFilter = {};
    if (turma && mongoose.isValidObjectId(turma)) alunoFilter.turma = new mongoose.Types.ObjectId(turma);
    if (curso) alunoFilter.curso = new RegExp(String(curso), "i");

    const totalAlunos = await Aluno.countDocuments(alunoFilter);

    const retiradasMatchBase = {};
    const { inicio: pi, fim: pf } = rangeFromQuery({ periodoInicio, periodoFim });

    const buildRetiradasPipeline = (d0, d1) => {
      const pipeline = [
        { $match: { data: { $gte: d0, $lte: d1 } } },
        {
          $lookup: {
            from: "alunos",
            localField: "aluno",
            foreignField: "_id",
            as: "a",
          },
        },
        { $unwind: "$a" },
      ];
      if (Object.keys(alunoFilter).length) {
        const m = {};
        if (alunoFilter.turma) m["a.turma"] = alunoFilter.turma;
        if (alunoFilter.curso) m["a.curso"] = alunoFilter.curso;
        if (Object.keys(m).length) pipeline.push({ $match: m });
      }
      return pipeline;
    };

    const countRetiradasNoRange = async (d0, d1) => {
      const pipeline = [...buildRetiradasPipeline(d0, d1), { $count: "n" }];
      const r = await Retirada.aggregate(pipeline);
      return r[0]?.n ?? 0;
    };

    /** Quantidade de alunos distintos que retiraram merenda no intervalo */
    const countAlunosDistintosNoRange = async (d0, d1) => {
      const pipeline = [
        ...buildRetiradasPipeline(d0, d1),
        { $group: { _id: "$aluno" } },
        { $count: "n" },
      ];
      const r = await Retirada.aggregate(pipeline);
      return r[0]?.n ?? 0;
    };

    const retiradasHoje = await countRetiradasNoRange(hojeIni, hojeFim);
    const retiradasSemana = await countRetiradasNoRange(semIni, semFim);
    const retiradasMes = await countRetiradasNoRange(mesIni, mesFim);

    const alunosComRetiradaHoje = await countAlunosDistintosNoRange(hojeIni, hojeFim);
    const alunosComRetiradaSemana = await countAlunosDistintosNoRange(semIni, semFim);
    const alunosComRetiradaMes = await countAlunosDistintosNoRange(mesIni, mesFim);

    const alunosIds = await Aluno.find(alunoFilter).distinct("_id");
    const comRetiradaNoPeriodo = await Retirada.distinct("aluno", {
        aluno: { $in: alunosIds },
        data: { $gte: pi, $lte: pf },
      });
    const comSet = new Set(comRetiradaNoPeriodo.map((id) => id.toString()));
    const semRetirada = alunosIds.filter((id) => !comSet.has(id.toString()));

    const alunosSemRetiradaDocs = await Aluno.find({ _id: { $in: semRetirada } })
      .populate("turma", "nome curso")
      .select("nome matricula curso turma")
      .sort({ nome: 1 })
      .lean();

    const freqPipeline = [
      { $match: { data: { $gte: pi, $lte: pf } } },
      {
        $lookup: {
          from: "alunos",
          localField: "aluno",
          foreignField: "_id",
          as: "a",
        },
      },
      { $unwind: "$a" },
    ];
    if (Object.keys(alunoFilter).length) {
      const m = {};
      if (alunoFilter.turma) m["a.turma"] = alunoFilter.turma;
      if (alunoFilter.curso) m["a.curso"] = alunoFilter.curso;
      if (Object.keys(m).length) freqPipeline.push({ $match: m });
    }
    freqPipeline.push(
      { $group: { _id: "$aluno", count: { $sum: 1 }, ultima: { $max: "$hora" } } },
      { $sort: { count: -1 } }
    );
    const freqRaw = await Retirada.aggregate(freqPipeline);
    const alunoIdsFreq = freqRaw.map((x) => x._id);
    const nomes = await Aluno.find({ _id: { $in: alunoIdsFreq } })
      .select("nome matricula")
      .lean();
    const nomeMap = Object.fromEntries(nomes.map((n) => [n._id.toString(), n]));

    const frequenciaPorAluno = freqRaw.map((row) => ({
      alunoId: row._id,
      nome: nomeMap[row._id.toString()]?.nome,
      matricula: nomeMap[row._id.toString()]?.matricula,
      retiradas: row.count,
      ultimaRetirada: row.ultima,
    }));

    res.json({
      totalAlunos,
      retiradasHoje,
      retiradasSemana,
      retiradasMes,
      alunosComRetiradaHoje,
      alunosComRetiradaSemana,
      alunosComRetiradaMes,
      filtros: {
        turma: turma || null,
        curso: curso || null,
        periodoInicio: periodoInicio || DateTime.fromJSDate(pi).setZone(TZ).toISODate(),
        periodoFim: periodoFim || DateTime.fromJSDate(pf).setZone(TZ).toISODate(),
      },
      alunosSemRetiradaNoPeriodo: alunosSemRetiradaDocs,
      frequenciaPorAluno,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Erro ao carregar métricas." });
  }
});

export default router;
