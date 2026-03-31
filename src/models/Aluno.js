import mongoose from "mongoose";

const alunoSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true, trim: true },
    matricula: { type: String, required: true, unique: true, trim: true },
    curso: { type: String, required: true, trim: true },
    turma: { type: mongoose.Schema.Types.ObjectId, ref: "Turma", required: true },
    anoEntrada: { type: Number, required: true, min: 2000, max: 2100 },
    qrCodeDataUrl: { type: String, default: "" },
    /** URL HTTPS da foto no Cloudinary */
    fotoUrl: { type: String, default: "" },
    /** Legado: data URL antiga (carteirinha aceita fotoUrl || fotoDataUrl) */
    fotoDataUrl: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("Aluno", alunoSchema);
