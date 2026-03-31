import XLSX from "xlsx";
import AdmZip from "adm-zip";
import Turma from "../models/Turma.js";
import Aluno from "../models/Aluno.js";
import { generateQrDataUrl } from "./qrcode.js";
import { configureCloudinary, isCloudinaryConfigured, uploadAlunoFoto } from "./cloudinary.js";

const MAX_LINHAS = 2000;

export function normKey(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, "_");
}

function parsePlanilha(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const name = wb.SheetNames[0];
  if (!name) return [];
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  return rows.map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[normKey(k)] = v;
    }
    return out;
  });
}

function getField(row, ...aliases) {
  for (const a of aliases) {
    const nk = normKey(a);
    if (row[nk] !== undefined && row[nk] !== "" && row[nk] != null) return row[nk];
  }
  return "";
}

function strCell(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return String(v).trim();
  }
  return String(v).trim();
}

function parseAno(v) {
  const s = strCell(v);
  if (!s) return NaN;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return NaN;
  const y = Math.floor(n);
  if (y >= 2000 && y <= 2100) return y;
  return NaN;
}

export function turmaNomeAuto(curso, anoEntrada) {
  return `${String(curso).trim()} (${anoEntrada})`;
}

function buildZipIndex(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const map = new Map();
  for (const e of entries) {
    if (e.isDirectory) continue;
    const base = e.entryName.split("/").pop().split("\\").pop().toLowerCase();
    if (base) map.set(base, e.getData());
  }
  return map;
}

function findImageBuffer(zipMap, matricula, hintFilename) {
  const m = String(matricula).trim().toLowerCase();
  const exts = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
  if (hintFilename) {
    const h = String(hintFilename).trim().toLowerCase();
    if (h && !h.startsWith("http")) {
      const key = h.includes("/") ? h.split("/").pop() : h.includes("\\") ? h.split("\\").pop() : h;
      if (key && zipMap.has(key)) return zipMap.get(key);
    }
  }
  for (const ext of exts) {
    const key = `${m}${ext}`;
    if (zipMap.has(key)) return zipMap.get(key);
  }
  return null;
}

/**
 * @param {{ planilhaBuffer: Buffer, zipBuffer?: Buffer | null }} opts
 */
export async function runBulkImport({ planilhaBuffer, zipBuffer }) {
  const rows = parsePlanilha(planilhaBuffer);
  if (rows.length > MAX_LINHAS) {
    return {
      ok: false,
      message: `Planilha excede o máximo de ${MAX_LINHAS} linhas.`,
      criados: 0,
      turmasCriadas: 0,
      erros: [],
    };
  }

  const zipMap = zipBuffer ? buildZipIndex(zipBuffer) : null;
  const turmaCache = new Map();
  const criados = [];
  const erros = [];
  let turmasCriadas = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const linha = i + 2;

    const nome = strCell(getField(row, "nome", "name", "aluno"));
    const matricula = strCell(getField(row, "matricula", "matrícula"));
    const curso = strCell(getField(row, "curso", "course"));
    const anoRaw = getField(row, "ano_entrada", "ano_de_entrada", "ano entrada", "ano", "anoentrada");
    const fotoHint = strCell(getField(row, "foto", "foto_url", "url_foto", "url foto"));

    if (!nome && !matricula && !curso && (anoRaw === "" || anoRaw == null)) continue;

    if (!nome || !matricula || !curso) {
      erros.push({ linha, matricula: matricula || "—", erro: "Nome, matrícula e curso são obrigatórios." });
      continue;
    }

    const anoEntrada = parseAno(anoRaw);
    if (!Number.isFinite(anoEntrada)) {
      erros.push({ linha, matricula, erro: "Ano de entrada inválido (informe um ano entre 2000 e 2100)." });
      continue;
    }

    const cursoTrim = curso.trim();
    const cacheKey = `${cursoTrim}|||${anoEntrada}`;
    let turmaId = turmaCache.get(cacheKey);
    if (!turmaId) {
      const nomeTurma = turmaNomeAuto(cursoTrim, anoEntrada);
      let turmaDoc = await Turma.findOne({ curso: cursoTrim, nome: nomeTurma }).lean();
      if (!turmaDoc) {
        const created = await Turma.create({ nome: nomeTurma, curso: cursoTrim });
        turmaDoc = created.toObject();
        turmasCriadas += 1;
      }
      turmaId = turmaDoc._id;
      turmaCache.set(cacheKey, turmaId);
    }

    let fotoUrlHttps = null;
    if (fotoHint.startsWith("https://")) {
      fotoUrlHttps = fotoHint;
    }

    let imageBuffer = null;
    if (!fotoUrlHttps && zipMap) {
      imageBuffer = findImageBuffer(zipMap, matricula, fotoHint || null);
    }

    try {
      const qrCodeDataUrl = await generateQrDataUrl(matricula);
      const payload = {
        nome,
        matricula,
        curso: cursoTrim,
        turma: turmaId,
        anoEntrada,
        qrCodeDataUrl,
      };
      if (fotoUrlHttps) payload.fotoUrl = fotoUrlHttps;

      const a = await Aluno.create(payload);

      if (imageBuffer && imageBuffer.length > 0) {
        if (!isCloudinaryConfigured()) {
          erros.push({
            linha,
            matricula,
            erro: "Aluno criado; foto no ZIP não enviada (Cloudinary não configurado).",
          });
        } else {
          try {
            configureCloudinary();
            const result = await uploadAlunoFoto(imageBuffer, String(a._id));
            a.fotoUrl = result.secure_url;
            await a.save();
          } catch (e) {
            console.error("[bulk import] foto zip:", e);
            erros.push({
              linha,
              matricula,
              erro: "Aluno criado, mas falha ao enviar foto do ZIP para o Cloudinary.",
            });
          }
        }
      }

      criados.push({ linha, matricula, nome, alunoId: String(a._id) });
    } catch (e) {
      if (e.code === 11000) {
        erros.push({ linha, matricula, erro: "Matrícula já cadastrada." });
      } else {
        console.error("[bulk import]", e);
        erros.push({ linha, matricula, erro: e.message || "Erro ao criar aluno." });
      }
    }
  }

  return {
    ok: true,
    criados: criados.length,
    turmasCriadas,
    alunos: criados,
    erros,
  };
}
