import { Router } from 'express';
import type { AppDeps } from '../app.ts';
import { currentUser, requireAuth, verifyPassword } from '../auth.ts';
import type { User } from '../db.ts';
import { asObject, HttpError, readString } from '../http.ts';

const publicUser = ({ id, email, name }: User) => ({ id, email, name });

export function authRoutes({ store, tokens }: AppDeps): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const body = asObject(req.body);
    const email = readString(body, 'email', { required: true })!;
    const password = body.password;
    if (typeof password !== 'string' || password === '') throw new HttpError(400, '"password" is required');

    const user = store.findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, 'Invalid email or password');
    }
    res.json({ token: await tokens.sign({ userId: user.id, email: user.email }), user: publicUser(user) });
  });

  router.get('/me', requireAuth(tokens), (_req, res) => {
    const user = store.findUserById(currentUser(res).userId);
    if (!user) throw new HttpError(401, 'Account no longer exists');
    res.json({ user: publicUser(user) });
  });

  return router;
}
