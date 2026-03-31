import mongoose from "mongoose";

const daySlotSchema = new mongoose.Schema(
  {
    manha: { type: Boolean, default: false },
    tarde: { type: Boolean, default: false },
  },
  { _id: false }
);

const scheduleSchema = new mongoose.Schema(
  {
    mon: daySlotSchema,
    tue: daySlotSchema,
    wed: daySlotSchema,
    thu: daySlotSchema,
    fri: daySlotSchema,
  },
  { _id: false }
);

const turmaSchema = new mongoose.Schema(
  {
    // nome: { type: String, required: true, trim: true },
    curso: { type: String, required: true, trim: true },
    schedule: {
      type: scheduleSchema,
      default: () => ({
        mon: { manha: false, tarde: false },
        tue: { manha: false, tarde: false },
        wed: { manha: false, tarde: false },
        thu: { manha: false, tarde: false },
        fri: { manha: false, tarde: false },
      }),
    },
  },
  { timestamps: true }
);

export default mongoose.model("Turma", turmaSchema);
