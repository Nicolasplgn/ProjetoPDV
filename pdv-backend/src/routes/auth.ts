import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { loginSchema } from '../utils/zodSchemas';
import { findUserByUsername, validatePassword } from '../services/userService';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

router.post('/login', (req: Request, res: Response) => {
  try {
    const { username, password } = loginSchema.parse({ body: req.body }).body;

    const user: any = findUserByUsername(username);

    if (!user || !validatePassword(password, user.password)) {
      return res.status(401).json({ message: 'Credenciais inválidas.' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' } // Token de 8 horas de duração
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role }
    });

  } catch (error) {
    if (error instanceof ZodError) {
      // Retorna os erros de validação de uma forma mais limpa
      return res.status(400).json({ message: "Dados inválidos", errors: error.issues });
    }
    console.error('Login error:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
});

export default router;