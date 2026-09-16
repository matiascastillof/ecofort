import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ordersRouter from './routes/orders.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());
app.use(ordersRouter);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
