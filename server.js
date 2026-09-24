const express = require('express');
const jwt = require('jsonwebtoken');
const { pool, waitForDatabase } = require('./db');

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET || 'change-this-secret-in-production';
const dummyOtp = process.env.DUMMY_OTP || '123456';

app.use(express.json());

function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn: '8h' });
}

function requireAuth(request, response, next) {
  const header = request.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return response.status(401).json({ error: 'Authentication required' });

  try {
    request.user = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return response.status(401).json({ error: 'Invalid or expired token' });
  }
}

app.get('/health', async (request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ status: 'ok', database: 'connected' });
  } catch {
    response.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
});

app.post('/api/auth/login', async (request, response) => {
  const email = String(request.body.email || '').trim().toLowerCase();
  const otp = String(request.body.otp || '').trim();

  if (!email || !email.includes('@')) return response.status(400).json({ error: 'A valid email is required' });
  if (otp !== dummyOtp) return response.status(401).json({ error: 'Invalid OTP. Use the configured dummy OTP.' });

  try {
    const [result] = await pool.execute(
      'INSERT INTO users (email) VALUES (?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)',
      [email]
    );
    const user = { id: result.insertId, email };
    return response.json({ token: createToken(user), user });
  } catch (error) {
    console.error(error);
    return response.status(500).json({ error: 'Unable to sign in' });
  }
});

app.get('/api/todos', requireAuth, async (request, response) => {
  const [todos] = await pool.execute(
    'SELECT id, title, completed, created_at, updated_at FROM todos WHERE user_id = ? ORDER BY created_at DESC',
    [request.user.id]
  );
  response.json(todos);
});

app.post('/api/todos', requireAuth, async (request, response) => {
  const title = String(request.body.title || '').trim();
  if (!title) return response.status(400).json({ error: 'Todo title is required' });

  const [result] = await pool.execute('INSERT INTO todos (user_id, title) VALUES (?, ?)', [request.user.id, title]);
  const [todos] = await pool.execute('SELECT id, title, completed, created_at, updated_at FROM todos WHERE id = ?', [result.insertId]);
  response.status(201).json(todos[0]);
});

app.put('/api/todos/:id', requireAuth, async (request, response) => {
  const todoId = Number(request.params.id);
  const title = String(request.body.title || '').trim();
  const completed = Boolean(request.body.completed);
  if (!Number.isInteger(todoId) || !title) return response.status(400).json({ error: 'Valid todo id and title are required' });

  const [result] = await pool.execute(
    'UPDATE todos SET title = ?, completed = ? WHERE id = ? AND user_id = ?',
    [title, completed, todoId, request.user.id]
  );
  if (!result.affectedRows) return response.status(404).json({ error: 'Todo not found' });

  const [todos] = await pool.execute('SELECT id, title, completed, created_at, updated_at FROM todos WHERE id = ?', [todoId]);
  response.json(todos[0]);
});

app.delete('/api/todos/:id', requireAuth, async (request, response) => {
  const todoId = Number(request.params.id);
  const [result] = await pool.execute('DELETE FROM todos WHERE id = ? AND user_id = ?', [todoId, request.user.id]);
  if (!result.affectedRows) return response.status(404).json({ error: 'Todo not found' });
  response.status(204).send();
});

async function start() {
  await waitForDatabase();
  app.listen(port, () => console.log(`Todo app listening on port ${port}`));
}

start().catch((error) => {
  console.error('Unable to start application:', error);
  process.exit(1);
});
