import { v2 as cloudinary } from "cloudinary";

function envTrim(name) {
  return String(process.env[name] ?? "").trim();
}

function cloudNameFromUrl(url) {
  const match = String(url).match(/@([^/?#]+)/);
  return match?.[1] || "";
}

function hasCloudinaryUrl() {
  return !!envTrim("CLOUDINARY_URL");
}

export function isCloudinaryConfigured() {
  if (hasCloudinaryUrl()) return true;
  return !!(
    envTrim("CLOUDINARY_CLOUD_NAME") &&
    envTrim("CLOUDINARY_API_KEY") &&
    envTrim("CLOUDINARY_API_SECRET")
  );
}

export function configureCloudinary() {
  const cloudinaryUrl = envTrim("CLOUDINARY_URL");
  if (cloudinaryUrl) {
    cloudinary.config({ cloudinary_url: cloudinaryUrl });
    return;
  }
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
  const cloudinaryUrl = envTrim("CLOUDINARY_URL");
  return {
    cloudName: envTrim("CLOUDINARY_CLOUD_NAME") || cloudNameFromUrl(cloudinaryUrl),
    usingCloudinaryUrl: !!cloudinaryUrl,
    hasApiKey: !!envTrim("CLOUDINARY_API_KEY"),
    hasApiSecret: !!envTrim("CLOUDINARY_API_SECRET"),
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
