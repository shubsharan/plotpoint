import { Hono } from "hono";
import { createStoryRoute } from "./create-story.js";
import { deleteStoryRoute } from "./delete-story.js";
import { getStoryRoute } from "./get-story.js";
import { listStoriesRoute } from "./list-stories.js";
import { updateStoryRoute } from "./update-story.js";

export const storyRoutes = new Hono();

storyRoutes.route("/", listStoriesRoute);
storyRoutes.route("/", getStoryRoute);
storyRoutes.route("/", createStoryRoute);
storyRoutes.route("/", updateStoryRoute);
storyRoutes.route("/", deleteStoryRoute);
