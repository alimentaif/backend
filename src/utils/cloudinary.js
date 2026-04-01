import { v2 as cloudinary } from "cloudinary";

function envTrim(name) {
  return String(process.env[name] ?? "").trim();
}

export function isCloudinaryConfigured() {
  return !!(
    envTrim("CLOUDINARY_CLOUD_NAME") &&
    envTrim("CLOUDINARY_API_KEY") &&
    envTrim("CLOUDINARY_API_SECRET")
  );
}

export function configureCloudinary() {
  cloudinary.config({
    cloud_name: envTrim("CLOUDINARY_CLOUD_NAME"),
    api_key: envTrim("CLOUDINARY_API_KEY"),
    api_secret: envTrim("CLOUDINARY_API_SECRET"),
  });
}

export function cloudinaryErrorMessage(err) {
  if (!err) return "Falha ao enviar foto para o Cloudinary.";
  if (typeof err === "string") return err;
  return (
    err.message ||
    err.error?.message ||
    err.http_code && `Cloudinary HTTP ${err.http_code}` ||
    "Falha ao enviar foto para o Cloudinary."
  );
}

export function cloudinaryEnvSummary() {
  return {
    cloudName: envTrim("CLOUDINARY_CLOUD_NAME"),
    hasApiKey: !!envTrim("CLOUDINARY_API_KEY"),
    hasApiSecret: !!envTrim("CLOUDINARY_API_SECRET"),
    hasUrl: !!envTrim("CLOUDINARY_URL"),
  };
}

/** public_id fixo por aluno: alimentaif/alunos/<mongoId> */
export function publicIdAlunoFoto(alunoId) {
  return `alimentaif/alunos/${alunoId}`;
}

/**
 * @param {Buffer} buffer
 * @param {string} alunoId
 * @returns {Promise<{ secure_url: string, public_id: string }>}
 */
export function uploadAlunoFoto(buffer, alunoId) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicIdAlunoFoto(alunoId),
        overwrite: true,
        invalidate: true,
        resource_type: "image",
        transformation: [{ width: 1200, crop: "limit", fetch_format: "auto", quality: "auto" }],
      },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
}

export async function destroyAlunoFoto(alunoId) {
  const pid = publicIdAlunoFoto(alunoId);
  await cloudinary.uploader.destroy(pid, { resource_type: "image", invalidate: true });
}
