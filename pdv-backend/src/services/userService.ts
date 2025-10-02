import db from '../db';
import * as bcrypt from 'bcryptjs';

export const findUserByUsername = (username: string) => {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username);
};

export const validatePassword = (password: string, hashedPasswordFromDb: string) => {
  return bcrypt.compareSync(password, hashedPasswordFromDb);
};