import 'dotenv/config';
import { createApp } from './server/app.js';

const { app } = await createApp();
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => console.log(`Reel Engine AI v0.7: http://${host}:${port}`));
