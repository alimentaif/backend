import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

/** Primeiro cadastro livre; depois exige admin autenticado */
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "E-mail e senha são obrigatórios." });
    }
    const count = await User.countDocuments();
    if (count > 0) {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        return res.status(403).json({ message: "Cadastro restrito a administradores." });
      }
      const token = header.slice(7);
      let payload;
      try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
      } catch {
        return res.status(401).json({ message: "Token inválido." });
      }
      const admin = await User.findById(payload.sub);
      if (!admin) {
        return res.status(403).json({ message: "Acesso negado." });
      }
    }
    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) {
      return res.status(409).json({ message: "E-mail já cadastrado." });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ email: email.toLowerCase().trim(), password: hash });
    const token = signToken(user);
    return res.status(201).json({
      token,
      user: { id: user._id, email: user.email },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Erro ao registrar." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "E-mail e senha são obrigatórios." });
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Credenciais inválidas." });
    }
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ message: "Credenciais inválidas." });
    }
    const token = signToken(user);
    return res.json({
      token,
      user: { id: user._id, email: user.email },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Erro ao entrar." });
  }
});

/** Confirma sessão */
router.get("/me", authRequired, async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
  res.json({ id: user._id, email: user.email });
});

/** Renovar token (refresh token) */
router.post("/refresh", authRequired, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ message: "Usuário não encontrado." });
    const newToken = signToken(user);
    res.json({ token: newToken, user: { id: user._id, email: user.email } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Erro ao renovar token." });
  }
});

export default router;
