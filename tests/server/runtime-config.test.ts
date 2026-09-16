import { describe, expect, it } from "vitest";
import { readRuntimeConfig } from "../../src/server/runtime-config.js";

const localDatabase = "postgresql://user:password@127.0.0.1:54322/postgres";
const hostedDatabase =
  "postgresql://user:password@db.example.com:5432/postgres";
const reviewerEnvironment = {
  APP_MODE: "reviewer",
  DATABASE_URL: hostedDatabase,
  PUBLIC_ORIGIN: "https://boulder-demo.example.com",
  REVIEWER_ACCESS_CODE: "a-long-fictional-reviewer-code",
  OPENAI_API_KEY: "test-openai-key",
  LINEAR_API_KEY: "test-linear-key",
  LINEAR_TEAM_ID: "test-team",
  LINEAR_PROJECT_ID: "test-project",
  PORT: "10000",
};

describe("runtime configuration", () => {
  it("keeps local development on a loopback database and API port", () => {
    expect(
      readRuntimeConfig({ LOCAL_DATABASE_URL: localDatabase }),
    ).toMatchObject({
      mode: "development",
      host: "127.0.0.1",
      port: 3001,
    });
    expect(() =>
      readRuntimeConfig({ LOCAL_DATABASE_URL: hostedDatabase }),
    ).toThrow("loopback database");
  });

  it("accepts only a complete hosted reviewer configuration", () => {
    expect(readRuntimeConfig(reviewerEnvironment)).toMatchObject({
      mode: "reviewer",
      host: "0.0.0.0",
      port: 10000,
      allowedOrigins: [reviewerEnvironment.PUBLIC_ORIGIN],
      linear: {
        teamId: "test-team",
        projectId: "test-project",
      },
    });
    expect(() =>
      readRuntimeConfig({ ...reviewerEnvironment, LINEAR_API_KEY: undefined }),
    ).toThrow("LINEAR_API_KEY");
  });

  it.each([
    [{ DATABASE_URL: localDatabase }, "hosted database"],
    [{ DATABASE_URL: `${hostedDatabase}?sslmode=require` }, "URL options"],
    [{ PUBLIC_ORIGIN: "http://boulder-demo.example.com" }, "HTTPS origin"],
    [
      { PUBLIC_ORIGIN: "https://boulder-demo.example.com/path" },
      "HTTPS origin",
    ],
    [{ REVIEWER_ACCESS_CODE: "short" }, "at least 20"],
    [{ PORT: "0" }, "valid TCP port"],
  ])("rejects an unsafe reviewer setting", (change, reason) => {
    expect(() =>
      readRuntimeConfig({ ...reviewerEnvironment, ...change }),
    ).toThrow(reason);
  });
});
