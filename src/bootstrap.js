import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./models/User.js";
import { configureCloudinary } from "./utils/cloudinary.js";

let initPromise;

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

export function initializeServices() {
  if (!initPromise) {
    initPromise = (async () => {
      if (!process.env.MONGODB_URI) {
        throw new Error("Defina MONGODB_URI no ambiente.");
      }
      if (!process.env.JWT_SECRET) {
        throw new Error("Defina JWT_SECRET no ambiente.");
      }

      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI, {
          // Evita estourar o tempo máximo da função serverless quando o cluster está inacessível.
          serverSelectionTimeoutMS: 8000,
          connectTimeoutMS: 8000,
        });
        console.log("MongoDB conectado");
      }

      await seedAdminOptional();

      if (
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
      ) {
        configureCloudinary();
        console.log("Cloudinary configurado");
      } else {
        console.log("[aviso] Cloudinary não configurado — upload de fotos desativado.");
      }
    })();
  }

  return initPromise;
}
