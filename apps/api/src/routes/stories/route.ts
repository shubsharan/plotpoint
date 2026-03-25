import {
  createStory,
  deleteStory,
  getStory,
  listStories,
  patchStory,
  updateStory,
} from '@plotpoint/db';
import { Hono } from 'hono';
import {
  createStoryRequestSchema,
  deleteStoryResponseSchema,
  listStoriesResponseSchema,
  patchStoryRequestSchema,
  putStoryRequestSchema,
  storyResponseSchema,
} from './contracts.js';
import {
  isUniqueViolationError,
  parseJsonBody,
  parseStoryId,
  storyIdConflict,
  storyNotFound,
  toCreateStoryInput,
  toPatchStoryInput,
  toPutStoryInput,
  toStoryResponse,
} from './helpers.js';

export const stories = new Hono();

stories.get('/', async (context) => {
  const storyRows = await listStories();
  const response = storyRows.map(toStoryResponse);

  return context.json(listStoriesResponseSchema.parse(response), 200);
});

stories.get('/:id', async (context) => {
  const path = parseStoryId(context);
  if (!path.success) {
    return path.response;
  }

  const story = await getStory(path.storyId);
  if (!story) {
    return storyNotFound(context, path.storyId);
  }

  return context.json(storyResponseSchema.parse(toStoryResponse(story)), 200);
});

stories.post('/', async (context) => {
  const parsedBody = await parseJsonBody(context, createStoryRequestSchema);
  if (!parsedBody.success) {
    return parsedBody.response;
  }

  try {
    const story = await createStory(toCreateStoryInput(parsedBody.data));

    return context.json(storyResponseSchema.parse(toStoryResponse(story)), 201);
  } catch (error) {
    if (isUniqueViolationError(error)) {
      return storyIdConflict(context, parsedBody.data.id);
    }

    throw error;
  }
});

stories.put('/:id', async (context) => {
  const path = parseStoryId(context);
  if (!path.success) {
    return path.response;
  }

  const parsedBody = await parseJsonBody(context, putStoryRequestSchema);
  if (!parsedBody.success) {
    return parsedBody.response;
  }

  const story = await updateStory(toPutStoryInput(path.storyId, parsedBody.data));
  if (!story) {
    return storyNotFound(context, path.storyId);
  }

  return context.json(storyResponseSchema.parse(toStoryResponse(story)), 200);
});

stories.patch('/:id', async (context) => {
  const path = parseStoryId(context);
  if (!path.success) {
    return path.response;
  }

  const parsedBody = await parseJsonBody(context, patchStoryRequestSchema);
  if (!parsedBody.success) {
    return parsedBody.response;
  }

  const story = await patchStory(toPatchStoryInput(path.storyId, parsedBody.data));
  if (!story) {
    return storyNotFound(context, path.storyId);
  }

  return context.json(storyResponseSchema.parse(toStoryResponse(story)), 200);
});

stories.delete('/:id', async (context) => {
  const path = parseStoryId(context);
  if (!path.success) {
    return path.response;
  }

  const deleted = await deleteStory(path.storyId);
  if (!deleted) {
    return storyNotFound(context, path.storyId);
  }

  return context.json(deleteStoryResponseSchema.parse({ deleted: true }), 200);
});
