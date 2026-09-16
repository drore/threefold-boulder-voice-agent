import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LinearTicketProvider,
  type LinearTicketProviderOptions,
} from "../../../src/adapters/linear/linear-ticket-provider.js";

type MockRequest = {
  authorization: string | undefined;
  body: {
    operationName?: string;
    query?: string;
    variables?: Record<string, unknown>;
  };
};

type MockServer = {
  endpoint: string;
  requests: MockRequest[];
  close: () => Promise<void>;
};

let activeServer: MockServer | undefined;

afterEach(async () => {
  await activeServer?.close();
  activeServer = undefined;
});

describe("LinearTicketProvider", () => {
  it("creates an issue in the configured team and project without automatic readback", async () => {
    activeServer = await startMockLinearServer((request, response) => {
      expect(request.body.operationName).toBe("CreateIssue");
      respondJson(response, {
        data: {
          issueCreate: {
            success: true,
            issue: { id: "issue-123", title: "Pothole report" },
          },
        },
      });
    });

    const provider = createProvider(activeServer);
    const result = await provider.createTicket({
      title: "Pothole report",
      description: "Location: 13th and Pearl\nDescription: deep pothole",
    });

    expect(result.status).toBe("created");
    expect(result).toMatchObject({
      ticket: {
        id: "issue-123",
        title: "Pothole report",
      },
    });
    expect(activeServer.requests).toHaveLength(1);
    expect(activeServer.requests[0]?.authorization).toBe("linear-test-key");
    expect(activeServer.requests[0]?.body).toMatchObject({
      operationName: "CreateIssue",
      variables: {
        input: {
          title: "Pothole report",
          description: "Location: 13th and Pearl\nDescription: deep pothole",
          teamId: "team-123",
          projectId: "project-123",
        },
      },
    });
  });

  it("treats GraphQL errors in an HTTP 200 create response as uncertain", async () => {
    activeServer = await startMockLinearServer((_request, response) => {
      respondJson(response, {
        data: {
          issueCreate: {
            success: true,
            issue: { id: "issue-should-not-count", title: "Ignored" },
          },
        },
        errors: [{ message: "Validation failed" }],
      });
    });

    const provider = createProvider(activeServer);

    expect(
      await provider.createTicket({
        title: "Pothole report",
        description: "Location: Broadway and Pine",
      }),
    ).toEqual({
      status: "uncertain",
      reason: "linear_graphql_error",
    });
    expect(activeServer.requests).toHaveLength(1);
  });

  it("treats malformed GraphQL errors on create as uncertain", async () => {
    activeServer = await startMockLinearServer((_request, response) => {
      respondJson(response, {
        data: {
          issueCreate: {
            success: true,
            issue: { id: "issue-should-not-count", title: "Ignored" },
          },
        },
        errors: { message: "Unexpected shape" },
      });
    });

    const provider = createProvider(activeServer);

    expect(
      await provider.createTicket({
        title: "Pothole report",
        description: "Location: Broadway and Pine",
      }),
    ).toEqual({
      status: "uncertain",
      reason: "linear_graphql_error",
    });
  });

  it("classifies a known auth rejection without exposing the key", async () => {
    activeServer = await startMockLinearServer((_request, response) => {
      respondJson(response, { error: "denied" }, 401);
    });

    const provider = createProvider(activeServer);

    expect(
      await provider.createTicket({
        title: "Pothole report",
        description: "Location: Broadway and Pine",
      }),
    ).toEqual({
      status: "rejected",
      reason: "linear_auth_rejected",
    });
  });

  it("returns uncertain for a create timeout and does not retry automatically", async () => {
    activeServer = await startMockLinearServer((_request, response) => {
      setTimeout(() => {
        respondJson(response, {
          data: {
            issueCreate: {
              success: true,
              issue: { id: "late-issue", title: "Late issue" },
            },
          },
        });
      }, 1_000);
    });

    const provider = createProvider(activeServer, { timeoutMs: 100 });

    expect(
      await provider.createTicket({
        title: "Pothole report",
        description: "Location: Broadway and Pine",
      }),
    ).toEqual({
      status: "uncertain",
      reason: "linear_request_timeout",
    });
    await vi.waitFor(() => {
      expect(activeServer?.requests).toHaveLength(1);
    });
  });

  it("returns uncertain for a create server error because commit status is unknown", async () => {
    activeServer = await startMockLinearServer((_request, response) => {
      respondJson(response, { error: "server_error" }, 503);
    });

    const provider = createProvider(activeServer);

    expect(
      await provider.createTicket({
        title: "Pothole report",
        description: "Location: Broadway and Pine",
      }),
    ).toEqual({
      status: "uncertain",
      reason: "linear_http_503",
    });
    expect(activeServer.requests).toHaveLength(1);
  });

  it("returns uncertain for a malformed create success shape", async () => {
    activeServer = await startMockLinearServer((_request, response) => {
      respondJson(response, { data: { issueCreate: { success: true } } });
    });

    const provider = createProvider(activeServer);

    expect(
      await provider.createTicket({
        title: "Pothole report",
        description: "Location: Broadway and Pine",
      }),
    ).toEqual({
      status: "uncertain",
      reason: "linear_created_issue_invalid",
    });
  });

  it("reads one issue by ID without issuing a create operation", async () => {
    activeServer = await startMockLinearServer((_request, response) => {
      respondJson(response, {
        data: {
          issue: {
            id: "issue-456",
            title: "Existing ticket",
            description: null,
            team: { id: "team-123" },
            project: { id: "project-123" },
          },
        },
      });
    });

    const provider = createProvider(activeServer);
    const result = await provider.readTicket("issue-456");

    expect(result).toMatchObject({
      status: "found",
      ticket: {
        id: "issue-456",
        title: "Existing ticket",
        description: null,
      },
    });
    expect(activeServer.requests).toHaveLength(1);
    expect(activeServer.requests[0]?.body.operationName).toBe("ReadIssue");
    expect(activeServer.requests[0]?.body.query).toContain("team { id }");
    expect(activeServer.requests[0]?.body.query).toContain("project { id }");
  });

  it("supports explicit create then readback with the returned issue ID", async () => {
    const issues = new Map<
      string,
      {
        id: string;
        title: string;
        description: string;
        team: { id: string };
        project: { id: string };
      }
    >();
    activeServer = await startMockLinearServer((request, response) => {
      if (request.body.operationName === "CreateIssue") {
        const input = request.body.variables?.input;
        if (!isRecord(input)) {
          respondJson(response, { errors: [{ message: "Bad input" }] });
          return;
        }
        const issue = {
          id: "issue-created-1",
          title: String(input.title),
          description: String(input.description),
          team: { id: String(input.teamId) },
          project: { id: String(input.projectId) },
        };
        issues.set(issue.id, issue);
        respondJson(response, {
          data: { issueCreate: { success: true, issue } },
        });
        return;
      }

      const id = request.body.variables?.id;
      const issue = typeof id === "string" ? issues.get(id) : undefined;
      respondJson(response, { data: { issue: issue ?? null } });
    });

    const provider = createProvider(activeServer);
    const created = await provider.createTicket({
      title: "Pothole report",
      description: "Location: 13th and Pearl",
    });

    expect(created.status).toBe("created");
    if (created.status !== "created") return;
    const readBack = await provider.readTicket(created.ticket.id);

    expect(readBack).toMatchObject({
      status: "found",
      ticket: {
        id: "issue-created-1",
        title: "Pothole report",
        description: "Location: 13th and Pearl",
      },
    });
    expect(
      activeServer.requests.map((request) => request.body.operationName),
    ).toEqual(["CreateIssue", "ReadIssue"]);
  });

  it("rejects a read response whose issue ID differs from the requested ID", async () => {
    activeServer = await startMockLinearServer((_request, response) => {
      respondJson(response, {
        data: {
          issue: {
            id: "other-issue",
            title: "Wrong ticket",
            description: "Wrong description",
          },
        },
      });
    });

    const provider = createProvider(activeServer);

    expect(await provider.readTicket("requested-issue")).toEqual({
      status: "unavailable",
      reason: "linear_issue_fields_invalid",
    });
  });

  it.each([
    ["team", "other-team"],
    ["project", "other-project"],
  ])("rejects a ticket outside the configured %s", async (field, id) => {
    activeServer = await startMockLinearServer((_request, response) => {
      respondJson(response, {
        data: {
          issue: {
            id: "issue-456",
            title: "Existing ticket",
            description: "Location: 13th and Pearl",
            team: { id: field === "team" ? id : "team-123" },
            project: { id: field === "project" ? id : "project-123" },
          },
        },
      });
    });

    const provider = createProvider(activeServer);

    expect(await provider.readTicket("issue-456")).toEqual({
      status: "unavailable",
      reason: "linear_issue_scope_mismatch",
    });
  });

  it("rejects unbounded provider text on read", async () => {
    activeServer = await startMockLinearServer((_request, response) => {
      respondJson(response, {
        data: {
          issue: {
            id: "issue-oversized",
            title: "Existing ticket",
            description: "x".repeat(5001),
            team: { id: "team-123" },
            project: { id: "project-123" },
          },
        },
      });
    });

    const provider = createProvider(activeServer);

    expect(await provider.readTicket("issue-oversized")).toEqual({
      status: "unavailable",
      reason: "linear_issue_description_invalid",
    });
  });

  it("returns not_found for a missing issue read", async () => {
    activeServer = await startMockLinearServer((_request, response) => {
      respondJson(response, { data: { issue: null } });
    });

    const provider = createProvider(activeServer);

    expect(await provider.readTicket("missing-issue")).toEqual({
      status: "not_found",
    });
  });
});

/**
 * Starts a loopback server that records only the GraphQL requests used by the Linear adapter.
 * Input: handler for each parsed request. Output: endpoint URL plus recorded requests.
 */
async function startMockLinearServer(
  handler: (request: MockRequest, response: ServerResponse) => void,
): Promise<MockServer> {
  const requests: MockRequest[] = [];
  const server = createServer(
    async (message: IncomingMessage, response: ServerResponse) => {
      if (message.method !== "POST" || message.url !== "/graphql") {
        respondJson(response, { error: "not_found" }, 404);
        return;
      }
      const request = {
        authorization: message.headers.authorization,
        body: (await readJsonBody(message)) as MockRequest["body"],
      };
      requests.push(request);
      handler(request, response);
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected loopback TCP server address");
  }
  return {
    endpoint: `http://127.0.0.1:${address.port}/graphql`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/** Input: HTTP request body stream. Output: parsed JSON request body. */
async function readJsonBody(message: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of message) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Input: JSON-like response data and status. Output: completed HTTP JSON response. */
function respondJson(
  response: ServerResponse,
  body: unknown,
  statusCode = 200,
): void {
  if (response.destroyed || response.writableEnded) return;
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

/**
 * Builds the adapter against the loopback mock with server-held config.
 * Input: mock server plus optional timeout. Output: configured LinearTicketProvider.
 */
function createProvider(
  server: MockServer,
  overrides: Partial<LinearTicketProviderOptions> = {},
): LinearTicketProvider {
  return new LinearTicketProvider({
    apiKey: "linear-test-key",
    teamId: "team-123",
    projectId: "project-123",
    endpoint: server.endpoint,
    ...overrides,
  });
}

/** Input: possible JSON object. Output: whether it is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
