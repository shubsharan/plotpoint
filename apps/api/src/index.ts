import { Hono } from 'hono';
import { createStoriesRoutes, type StoriesRouteDeps } from './routes/stories/route.js';

export const createApp = (storiesDeps: StoriesRouteDeps) => {
  const app = new Hono();

  app.route('/stories', createStoriesRoutes(storiesDeps));

  return app;
};
