import { Hono } from "hono";
import { storyRoutes } from "./routes/index.js";

export const createApp = () => {
  const app = new Hono();

  app.route("/", storyRoutes);

  return app;
};
