/**
 * Linear TicketProvider adapter.
 * Sends the narrow GraphQL create/read operations this app consumes to the
 * Linear API and classifies created, rejected, and uncertain outcomes so the
 * core can reconcile without blind retries. Provider SDK shapes stay here.
 */
const LINEAR_GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_LINEAR_TITLE_LENGTH = 250;
const MAX_LINEAR_DESCRIPTION_LENGTH = 5000;

export const LINEAR_CREATE_ISSUE_MUTATION = `
mutation CreateIssue($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      title
    }
  }
}
`;

export const LINEAR_READ_ISSUE_QUERY = `
query ReadIssue($id: String!) {
  issue(id: $id) {
    id
    title
    description
    team { id }
    project { id }
  }
}
`;

export type LinearTicketInput = Readonly<{
  title: string;
  description: string;
}>;

export type LinearCreatedTicket = Readonly<{
  provider: "linear";
  id: string;
  title: string;
}>;

export type LinearTicketSnapshot = Readonly<{
  provider: "linear";
  id: string;
  title: string;
  description: string | null;
  fetchedAt: string;
}>;

export type LinearCreateTicketResult =
  | { status: "created"; ticket: LinearCreatedTicket }
  | { status: "rejected"; reason: string }
  | { status: "uncertain"; reason: string }
  | { status: "unavailable"; reason: string };

export type LinearReadTicketResult =
  | { status: "found"; ticket: LinearTicketSnapshot }
  | { status: "not_found" }
  | { status: "rejected"; reason: string }
  | { status: "unavailable"; reason: string };

export type LinearTicketProviderOptions = Readonly<{
  apiKey: string;
  teamId: string;
  projectId: string;
  endpoint?: string;
  timeoutMs?: number;
}>;

type GraphQlEnvelope = {
  data?: unknown;
  errors?: unknown;
};

type GraphQlResponse =
  | { status: "ok"; envelope: GraphQlEnvelope }
  | { status: "rejected"; reason: string }
  | { status: "ambiguous"; reason: string }
  | { status: "unavailable"; reason: string };

/**
 * Creates and reads city service tickets through the narrow Linear GraphQL API.
 * Input: `{apiKey: "lin_api_...", teamId: "team-uuid", projectId: "project-uuid"}`. Output: adapter with server-held credentials.
 */
export class LinearTicketProvider {
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  /** Input: Linear key/team/project configuration. Output: provider ready for explicit create/read calls. */
  constructor(private readonly options: LinearTicketProviderOptions) {
    this.endpoint = options.endpoint ?? LINEAR_GRAPHQL_ENDPOINT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Creates one Linear issue without performing readback or retries.
   * Input: `{title: "Pothole report", description: "Location: ..."}`
   * Output: `{status: "created", ticket: {id: "..."}}` or a classified write result.
   */
  async createTicket(
    input: LinearTicketInput,
  ): Promise<LinearCreateTicketResult> {
    if (!isUsableText(input.title) || !isUsableText(input.description)) {
      return { status: "rejected", reason: "invalid_ticket_input" };
    }

    const response = await this.postGraphQl({
      operationName: "CreateIssue",
      query: LINEAR_CREATE_ISSUE_MUTATION,
      variables: {
        input: {
          title: input.title,
          description: input.description,
          teamId: this.options.teamId,
          projectId: this.options.projectId,
        },
      },
    });
    if (response.status !== "ok") return classifyCreateFailure(response);

    return parseCreateEnvelope(response.envelope);
  }

  /**
   * Reads one Linear issue by ID and accepts only the configured team and project.
   * Input: `"issue-uuid"`. Output: scoped ticket snapshot, `not_found`, or a classified failure.
   */
  async readTicket(issueId: string): Promise<LinearReadTicketResult> {
    if (!isUsableText(issueId)) {
      return { status: "rejected", reason: "invalid_issue_id" };
    }

    const response = await this.postGraphQl({
      operationName: "ReadIssue",
      query: LINEAR_READ_ISSUE_QUERY,
      variables: { id: issueId },
    });
    if (response.status === "ambiguous") {
      return { status: "unavailable", reason: response.reason };
    }
    if (response.status !== "ok") return response;

    return parseReadEnvelope(
      response.envelope,
      issueId,
      this.options.teamId,
      this.options.projectId,
      new Date(),
    );
  }

  /**
   * Sends one GraphQL operation with server-held authentication.
   * Input: `{operationName: "ReadIssue", variables: {id: "..."}}`. Output: parsed envelope or classified transport result.
   */
  private async postGraphQl(body: {
    operationName: "CreateIssue" | "ReadIssue";
    query: string;
    variables: Record<string, unknown>;
  }): Promise<GraphQlResponse> {
    if (
      !isUsableText(this.options.apiKey) ||
      !isUsableText(this.options.teamId) ||
      !isUsableText(this.options.projectId)
    ) {
      return { status: "rejected", reason: "missing_linear_configuration" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: this.options.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        return { status: "rejected", reason: "linear_auth_rejected" };
      }
      if (!response.ok) {
        return {
          status: response.status >= 500 ? "unavailable" : "rejected",
          reason: `linear_http_${response.status}`,
        };
      }

      const envelope = (await response.json()) as GraphQlEnvelope;
      if (hasGraphQlErrors(envelope)) {
        return { status: "ambiguous", reason: "linear_graphql_error" };
      }
      return { status: "ok", envelope };
    } catch (error) {
      return isAbortError(error)
        ? { status: "ambiguous", reason: "linear_request_timeout" }
        : { status: "unavailable", reason: "linear_network_error" };
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Input: GraphQL create envelope. Output: created ticket or provider rejection. */
function parseCreateEnvelope(
  envelope: GraphQlEnvelope,
): LinearCreateTicketResult {
  const data = envelope.data;
  if (!isRecord(data) || !isRecord(data.issueCreate)) {
    return { status: "uncertain", reason: "linear_create_shape_invalid" };
  }
  if (data.issueCreate.success !== true) {
    return { status: "rejected", reason: "linear_create_not_successful" };
  }
  const issue = data.issueCreate.issue;
  if (
    !isRecord(issue) ||
    !isUsableText(issue.id) ||
    !isUsableText(issue.title)
  ) {
    return { status: "uncertain", reason: "linear_created_issue_invalid" };
  }
  return {
    status: "created",
    ticket: { provider: "linear", id: issue.id, title: issue.title },
  };
}

/** Input: classified transport result from create. Output: create-safe failure outcome. */
function classifyCreateFailure(
  response: Exclude<GraphQlResponse, { status: "ok" }>,
): Exclude<LinearCreateTicketResult, { status: "created" }> {
  if (response.status === "rejected") return response;
  return { status: "uncertain", reason: response.reason };
}

/** Input: GraphQL issue and expected ID/team/project. Output: scoped snapshot or a classified failure. */
function parseReadEnvelope(
  envelope: GraphQlEnvelope,
  expectedIssueId: string,
  expectedTeamId: string,
  expectedProjectId: string,
  fetchedAt: Date,
): LinearReadTicketResult {
  const data = envelope.data;
  if (!isRecord(data)) {
    return { status: "unavailable", reason: "linear_read_shape_invalid" };
  }
  if (data.issue === null) return { status: "not_found" };
  if (!isRecord(data.issue)) {
    return { status: "unavailable", reason: "linear_issue_shape_invalid" };
  }
  if (
    !isUsableText(data.issue.id) ||
    data.issue.id !== expectedIssueId ||
    !isBoundedText(data.issue.title, MAX_LINEAR_TITLE_LENGTH)
  ) {
    return { status: "unavailable", reason: "linear_issue_fields_invalid" };
  }
  const team = data.issue.team;
  const project = data.issue.project;
  if (
    !isRecord(team) ||
    team.id !== expectedTeamId ||
    !isRecord(project) ||
    project.id !== expectedProjectId
  ) {
    return { status: "unavailable", reason: "linear_issue_scope_mismatch" };
  }
  if (
    data.issue.description !== null &&
    !isBoundedProviderText(
      data.issue.description,
      MAX_LINEAR_DESCRIPTION_LENGTH,
    )
  ) {
    return {
      status: "unavailable",
      reason: "linear_issue_description_invalid",
    };
  }

  return {
    status: "found",
    ticket: {
      provider: "linear",
      id: data.issue.id,
      title: data.issue.title,
      description: data.issue.description,
      fetchedAt: fetchedAt.toISOString(),
    },
  };
}

/** Input: GraphQL envelope. Output: whether provider reported operation-level errors. */
function hasGraphQlErrors(envelope: GraphQlEnvelope): boolean {
  if (envelope.errors === undefined) return false;
  return !Array.isArray(envelope.errors) || envelope.errors.length > 0;
}

/** Input: user or provider text. Output: whether it contains non-whitespace content. */
function isUsableText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Input: provider text plus max length. Output: whether it is useful and bounded. */
function isBoundedText(value: unknown, maxLength: number): value is string {
  return isUsableText(value) && value.length <= maxLength;
}

/** Input: provider text plus max length. Output: whether it is a bounded string. */
function isBoundedProviderText(
  value: unknown,
  maxLength: number,
): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

/** Input: possible JSON object. Output: whether it is a non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Input: thrown fetch error. Output: whether it came from the request deadline. */
function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}
