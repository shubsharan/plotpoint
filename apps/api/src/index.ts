import { Hono } from 'hono';
import { stories } from './routes/stories/route.js';

const createApp = () => {
  const app = new Hono();

  app.route('/stories', stories);

  return app;
};

export const app = createApp();
