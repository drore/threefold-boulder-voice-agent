import { describe, expect, it, vi } from "vitest";
import type { ReportContext } from "../../src/core/service-report/prepare-service-report.js";
import type {
  TicketOperation,
  TicketOperationOutcome,
  TicketOperationStore,
} from "../../src/core/service-report/ticket-operation.js";
import {
  submitConfirmedTicket,
  type TicketProvider,
} from "../../src/server/workflow/confirmed-ticket.js";

const CONTEXT: ReportContext = {
  conversationId: "conversation-1",
  cityId: "boulder-co",
  admissionId: "admission-1",
};

const READY_OPERATION: TicketOperation = {
  operationId: "operation-1",
  draftId: "draft-1",
  draftRevision: 2,
  policyRevision: 1,
  requestType: "pothole",
  location: "15th and Pine",
  description: "Large pothole in the driving lane",
  state: "ready",
  providerIssueId: null,
  providerTitle: null,
  providerDescription: null,
  providerFetchedAt: null,
  reason: null,
};

/** Input: a ready operation. Output: an in-memory store enforcing one start and a terminal result. */
function operationFixture(initial: TicketOperation = READY_OPERATION) {
  let operation = initial;
  const store: TicketOperationStore = {
    findByDraft: async () => ({ status: "found", operation }),
    authorize: async () => ({ status: "found", operation }),
    start: async () => {
      if (operation.state !== "ready") return { status: "found", operation };
      operation = { ...operation, state: "attempting" };
      return { status: "started", operation };
    },
    finish: async (_context, _id, outcome: TicketOperationOutcome) => {
      if (outcome.state === "created") {
        operation = {
          ...operation,
          state: "created",
          providerIssueId: outcome.providerIssueId,
          providerTitle: outcome.providerTitle,
          providerDescription: outcome.providerDescription,
          providerFetchedAt: outcome.providerFetchedAt,
        };
      } else {
        operation = {
          ...operation,
          state: outcome.state,
          reason: outcome.reason,
          providerIssueId:
            outcome.state === "uncertain"
              ? (outcome.providerIssueId ?? null)
              : null,
        };
      }
      return { status: "found", operation };
    },
  };
  return { store, current: () => operation };
}

/** Input: the issue body passed to create. Output: a matching Linear readback fixture. */
function providerFixture() {
  let createdDescription = "";
  let createdTitle = "";
  const createTicket = vi.fn(
    async (input: { title: string; description: string }) => {
      createdDescription = input.description;
      createdTitle = input.title;
      return {
        status: "created" as const,
        ticket: {
          provider: "linear" as const,
          id: "issue-1",
          title: input.title,
        },
      };
    },
  );
  const readTicket = vi.fn(async (issueId: string) => ({
    status: "found" as const,
    ticket: {
      provider: "linear" as const,
      id: issueId,
      title: createdTitle,
      description: createdDescription,
      fetchedAt: "2026-09-17T00:00:00.000Z",
    },
  }));
  const provider: TicketProvider = { createTicket, readTicket };
  return { provider, createTicket, readTicket };
}

describe("confirmed closed-hours ticket", () => {
  it("labels a park maintenance issue with its verified report type", async () => {
    const operations = operationFixture({
      ...READY_OPERATION,
      requestType: "park_maintenance",
      location: "North Boulder Park",
      description: "Broken swing",
    });
    const linear = providerFixture();

    const result = await submitConfirmedTicket(
      CONTEXT,
      "draft-1",
      2,
      1,
      operations.store,
      linear.provider,
      "Testville",
    );

    expect(result).toMatchObject({ status: "linear_ticket_created" });
    expect(linear.createTicket).toHaveBeenCalledWith({
      title: "Testville demo: park maintenance report",
      description: expect.stringContaining("Request type: park_maintenance"),
    });
  });

  it("creates and reads back one ticket, then only re-reads on repeat confirmation", async () => {
    const operations = operationFixture();
    const linear = providerFixture();

    const first = await submitConfirmedTicket(
      CONTEXT,
      "draft-1",
      2,
      1,
      operations.store,
      linear.provider,
      "Testville",
    );
    expect(first).toMatchObject({
      status: "linear_ticket_created",
      operationId: "operation-1",
      issueId: "issue-1",
      currentDetails: "fresh",
    });
    expect(linear.createTicket).toHaveBeenCalledTimes(1);
    expect(linear.createTicket.mock.calls[0]?.[0].description).toContain(
      "Demo operation: operation-1",
    );
    expect(linear.createTicket.mock.calls[0]?.[0].description).toContain(
      "Location: 15th and Pine",
    );
    expect(linear.createTicket.mock.calls[0]?.[0].description).toContain(
      "Issue: Large pothole in the driving lane",
    );

    const repeated = await submitConfirmedTicket(
      CONTEXT,
      "draft-1",
      2,
      1,
      operations.store,
      linear.provider,
      "Testville",
    );
    expect(repeated).toMatchObject({
      status: "linear_ticket_created",
      currentDetails: "fresh",
    });
    expect(linear.createTicket).toHaveBeenCalledTimes(1);
    expect(linear.readTicket).toHaveBeenCalledTimes(2);
  });

  it("records a timeout as uncertain and never blindly creates again", async () => {
    const operations = operationFixture();
    const createTicket = vi.fn(async () => ({
      status: "uncertain" as const,
      reason: "linear_request_timeout",
    }));
    const readTicket = vi.fn(async () => ({ status: "not_found" as const }));
    const provider: TicketProvider = { createTicket, readTicket };

    const first = await submitConfirmedTicket(
      CONTEXT,
      "draft-1",
      2,
      1,
      operations.store,
      provider,
      "Testville",
    );
    expect(first).toMatchObject({
      status: "ticket_uncertain",
      reason: "linear_request_timeout",
    });
    const repeated = await submitConfirmedTicket(
      CONTEXT,
      "draft-1",
      2,
      1,
      operations.store,
      provider,
      "Testville",
    );
    expect(repeated.status).toBe("ticket_uncertain");
    expect(createTicket).toHaveBeenCalledTimes(1);
    expect(readTicket).not.toHaveBeenCalled();
  });

  it("does not claim creation when Linear readback differs", async () => {
    const operations = operationFixture();
    const linear = providerFixture();
    const provider: TicketProvider = {
      createTicket: linear.createTicket,
      readTicket: async () => ({ status: "not_found" }),
    };

    const result = await submitConfirmedTicket(
      CONTEXT,
      "draft-1",
      2,
      1,
      operations.store,
      provider,
      "Testville",
    );
    expect(result).toMatchObject({
      status: "ticket_uncertain",
      reason: "linear_readback_unverified",
    });
    expect(operations.current()).toMatchObject({
      state: "uncertain",
      providerIssueId: "issue-1",
    });
  });

  it("reconciles a known issue ID by reading Linear without creating twice", async () => {
    const operations = operationFixture();
    const linear = providerFixture();
    let firstRead = true;
    const provider: TicketProvider = {
      createTicket: linear.createTicket,
      readTicket: async (issueId) => {
        if (firstRead) {
          firstRead = false;
          return { status: "unavailable", reason: "temporary" };
        }
        return linear.provider.readTicket(issueId);
      },
    };

    expect(
      (
        await submitConfirmedTicket(
          CONTEXT,
          "draft-1",
          2,
          1,
          operations.store,
          provider,
          "Testville",
        )
      ).status,
    ).toBe("ticket_uncertain");
    const repeated = await submitConfirmedTicket(
      CONTEXT,
      "draft-1",
      2,
      1,
      operations.store,
      provider,
      "Testville",
    );
    expect(repeated).toMatchObject({
      status: "linear_ticket_created",
      issueId: "issue-1",
    });
    expect(operations.current().state).toBe("created");
    expect(linear.createTicket).toHaveBeenCalledTimes(1);
  });

  it("shows a fetched issue as changed after a Linear staff edit", async () => {
    const operations = operationFixture();
    const linear = providerFixture();
    await submitConfirmedTicket(
      CONTEXT,
      "draft-1",
      2,
      1,
      operations.store,
      linear.provider,
      "Testville",
    );
    const editedProvider: TicketProvider = {
      ...linear.provider,
      readTicket: async (issueId) => ({
        status: "found",
        ticket: {
          provider: "linear",
          id: issueId,
          title: "Pothole report assigned",
          description: "Staff added the repair date",
          fetchedAt: "2026-09-17T01:00:00.000Z",
        },
      }),
    };

    expect(
      await submitConfirmedTicket(
        CONTEXT,
        "draft-1",
        2,
        1,
        operations.store,
        editedProvider,
        "Testville",
      ),
    ).toMatchObject({
      status: "linear_ticket_created",
      title: "Pothole report assigned",
      currentDetails: "changed",
    });
  });

  it("does not call Linear when operation authorization blocks a stale revision", async () => {
    const operations = operationFixture();
    const blocked: TicketOperationStore = {
      ...operations.store,
      authorize: async () => ({
        status: "blocked",
        code: "revision_conflict",
      }),
    };
    const linear = providerFixture();

    const result = await submitConfirmedTicket(
      CONTEXT,
      "draft-1",
      1,
      1,
      blocked,
      linear.provider,
      "Testville",
    );
    expect(result).toEqual({ status: "blocked", code: "revision_conflict" });
    expect(linear.createTicket).not.toHaveBeenCalled();
    expect(linear.readTicket).not.toHaveBeenCalled();
  });
});
