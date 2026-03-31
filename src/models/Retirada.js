import mongoose from "mongoose";

const retiradaSchema = new mongoose.Schema(
  {
    aluno: { type: mongoose.Schema.Types.ObjectId, ref: "Aluno", required: true },
    data: { type: Date, required: true },
    hora: { type: Date, required: true },
    turno: { type: String, required: true, enum: ["manha", "tarde"] },
  },
  { timestamps: true }
);

retiradaSchema.index({ aluno: 1, data: 1, turno: 1 }, { unique: true });

export default mongoose.model("Retirada", retiradaSchema);
