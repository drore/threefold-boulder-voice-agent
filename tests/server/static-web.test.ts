import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fastify from "fastify";
import { afterEach, expect, it } from "vitest";
import { registerStaticWeb } from "../../src/server/static-web.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

it("serves the built page and asset while leaving API paths unavailable", async () => {
  const root = await mkdtemp(join(tmpdir(), "boulder-web-"));
  temporaryDirectories.push(root);
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<h1>Boulder demo</h1>");
  await writeFile(join(root, "assets", "app.js"), "window.demo = true;");

  const app = fastify();
  registerStaticWeb(app, root);
  try {
    const page = await app.inject({ method: "GET", url: "/" });
    const asset = await app.inject({ method: "GET", url: "/assets/app.js" });
    const missingApi = await app.inject({ method: "GET", url: "/api/missing" });

    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("Boulder demo");
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toBe("window.demo = true;");
    expect(missingApi.statusCode).toBe(404);
  } finally {
    await app.close();
  }
});
