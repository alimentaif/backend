import { v2 as cloudinary } from "cloudinary";

export function isCloudinaryConfigured() {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME?.trim() &&
    process.env.CLOUDINARY_API_KEY?.trim() &&
    process.env.CLOUDINARY_API_SECRET?.trim()
  );
}

export function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
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
