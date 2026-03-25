import { describe, expect, it } from "vitest";

const loadDbPackage = async () => {
  process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/postgres";

  return import("../index.js");
};

describe("@plotpoint/db", () => {
  it("exports the draft story database surface", async () => {
    const db = await loadDbPackage();

    expect(typeof db.createStory).toBe("function");
    expect(typeof db.deleteStory).toBe("function");
    expect("db" in db).toBe(true);
    expect(db.storyStatusEnum.enumValues).toEqual(["draft", "published", "archived"]);
  });

  it("does not expose the placeholder db boundary", async () => {
    const db = await loadDbPackage();

    expect("dbBoundary" in db).toBe(false);
    expect("queries" in db).toBe(false);
  });
});
