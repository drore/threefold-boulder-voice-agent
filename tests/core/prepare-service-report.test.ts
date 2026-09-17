import { describe, expect, it } from "vitest";
import {
  prepareServiceReport,
  type DraftStore,
  type ReportContext,
  type ReportDraft,
  type ServiceReportData,
} from "../../src/core/service-report/prepare-service-report.js";

const CONTEXT: ReportContext = {
  conversationId: "conversation-1",
  cityId: "boulder-co",
  admissionId: "admission-1",
};

class InMemoryDraftStore implements DraftStore {
  drafts = new Map<string, ReportDraft>();
  saves = 0;

  async load(context: ReportContext, draftId: string | null) {
    if (!this.isAllowed(context)) return { status: "denied" as const };
    const draft = draftId ? this.drafts.get(draftId) : undefined;
    return draft
      ? { status: "found" as const, draft }
      : { status: "empty" as const };
  }

  async save(
    context: ReportContext,
    draftId: string | null,
    expectedRevision: number | null,
    fields: ServiceReportData,
  ) {
    if (!this.isAllowed(context)) return { status: "denied" as const };
    const current = draftId ? this.drafts.get(draftId) : undefined;
    if ((current?.revision ?? null) !== expectedRevision) {
      return { status: "conflict" as const };
    }
    for (const field of [fields.location, fields.description]) {
      if (
        field &&
        !["observation-1", "observation-2"].includes(field.observationId)
      ) {
        return { status: "denied" as const };
      }
    }
    this.saves += 1;
    const saved: ReportDraft = {
      draftId: draftId ?? `draft-${this.drafts.size + 1}`,
      conversationId: context.conversationId,
      cityId: context.cityId,
      revision: (expectedRevision ?? 0) + 1,
      ...fields,
    };
    this.drafts.set(saved.draftId, saved);
    return { status: "saved" as const, draft: saved };
  }

  private isAllowed(context: ReportContext) {
    return (
      context.conversationId === CONTEXT.conversationId &&
      context.cityId === CONTEXT.cityId &&
      context.admissionId === CONTEXT.admissionId
    );
  }
}

describe("prepareServiceReport", () => {
  it("asks for both required pothole details when neither was observed", async () => {
    const store = new InMemoryDraftStore();

    expect(
      await prepareServiceReport(
        CONTEXT,
        { requestType: "pothole", draftId: null, expectedRevision: null },
        store,
      ),
    ).toEqual({
      status: "needs_input",
      draftId: "draft-1",
      revision: 1,
      requestType: "pothole",
      fields: ["location", "description"],
    });
    expect(store.saves).toBe(1);
  });

  it("keeps observed description while asking for location", async () => {
    const store = new InMemoryDraftStore();

    expect(
      await prepareServiceReport(
        CONTEXT,
        {
          requestType: "pothole",
          draftId: null,
          expectedRevision: null,
          description: {
            text: "Large pothole in the driving lane",
            observationId: "observation-1",
          },
        },
        store,
      ),
    ).toEqual({
      status: "needs_input",
      draftId: "draft-1",
      revision: 1,
      requestType: "pothole",
      fields: ["location"],
    });
    expect(store.drafts.get("draft-1")?.description?.text).toBe(
      "Large pothole in the driving lane",
    );
  });

  it("returns a revision-bound summary once the pothole report is complete", async () => {
    const store = new InMemoryDraftStore();
    await prepareServiceReport(
      CONTEXT,
      {
        requestType: "pothole",
        draftId: null,
        expectedRevision: null,
        description: {
          text: "Large pothole in the driving lane",
          observationId: "observation-1",
        },
      },
      store,
    );

    expect(
      await prepareServiceReport(
        CONTEXT,
        {
          requestType: "pothole",
          draftId: "draft-1",
          expectedRevision: 1,
          location: {
            text: "  15th and Pine  ",
            observationId: "observation-2",
          },
        },
        store,
      ),
    ).toEqual({
      status: "needs_confirmation",
      draftId: "draft-1",
      revision: 2,
      summary: {
        requestType: "pothole",
        location: "15th and Pine",
        description: "Large pothole in the driving lane",
      },
    });
    expect(store.saves).toBe(2);
  });

  it("binds a correction to a new revision and rejects a stale update", async () => {
    const store = new InMemoryDraftStore();
    const initial = await prepareServiceReport(
      CONTEXT,
      {
        requestType: "pothole",
        draftId: null,
        expectedRevision: null,
        location: { text: "15th and Pine", observationId: "observation-1" },
        description: { text: "Pothole", observationId: "observation-1" },
      },
      store,
    );
    expect(initial.status).toBe("needs_confirmation");

    const correction = await prepareServiceReport(
      CONTEXT,
      {
        requestType: "pothole",
        draftId: "draft-1",
        expectedRevision: 1,
        location: { text: "15th and Pearl", observationId: "observation-2" },
      },
      store,
    );
    expect(correction).toEqual({
      status: "needs_confirmation",
      draftId: "draft-1",
      revision: 2,
      summary: {
        requestType: "pothole",
        location: "15th and Pearl",
        description: "Pothole",
      },
    });
    expect(
      await prepareServiceReport(
        CONTEXT,
        { requestType: "pothole", draftId: "draft-1", expectedRevision: 1 },
        store,
      ),
    ).toEqual({ status: "blocked", code: "revision_conflict" });
    expect(store.saves).toBe(2);
  });

  it("does not invalidate a complete draft when no new details are proposed", async () => {
    const store = new InMemoryDraftStore();
    const input = {
      requestType: "pothole" as const,
      draftId: null,
      expectedRevision: null,
      location: { text: "15th and Pine", observationId: "observation-1" },
      description: { text: "Pothole", observationId: "observation-1" },
    };
    const first = await prepareServiceReport(CONTEXT, input, store);

    const repeated = await prepareServiceReport(
      CONTEXT,
      {
        requestType: "pothole",
        draftId: "draft-1",
        expectedRevision: 1,
      },
      store,
    );

    expect(repeated).toEqual(first);
    expect(store.saves).toBe(1);
  });

  it("uses a server-selected draft ID without imposing a one-draft limit", async () => {
    const store = new InMemoryDraftStore();

    const first = await prepareServiceReport(
      CONTEXT,
      { requestType: "pothole", draftId: null, expectedRevision: null },
      store,
    );
    const second = await prepareServiceReport(
      CONTEXT,
      { requestType: "pothole", draftId: null, expectedRevision: null },
      store,
    );

    expect(first).toMatchObject({ draftId: "draft-1", revision: 1 });
    expect(second).toMatchObject({ draftId: "draft-2", revision: 1 });
    expect(store.drafts.size).toBe(2);
  });

  it("rejects mismatched draft ID and revision", async () => {
    const store = new InMemoryDraftStore();

    expect(
      await prepareServiceReport(
        CONTEXT,
        { requestType: "pothole", draftId: "draft-1", expectedRevision: null },
        store,
      ),
    ).toEqual({ status: "blocked", code: "invalid_input" });
    expect(store.saves).toBe(0);
  });

  it("denies a different conversation or admission before writing", async () => {
    const store = new InMemoryDraftStore();
    const wrongConversation = { ...CONTEXT, conversationId: "conversation-2" };
    const wrongAdmission = { ...CONTEXT, admissionId: "admission-2" };

    for (const context of [wrongConversation, wrongAdmission]) {
      expect(
        await prepareServiceReport(
          context,
          { requestType: "pothole", draftId: null, expectedRevision: null },
          store,
        ),
      ).toEqual({ status: "blocked", code: "scope_mismatch" });
    }
    expect(store.saves).toBe(0);
  });

  it("rejects an observation that is not in the scoped store", async () => {
    const store = new InMemoryDraftStore();

    expect(
      await prepareServiceReport(
        CONTEXT,
        {
          requestType: "pothole",
          draftId: null,
          expectedRevision: null,
          location: { text: "15th and Pine", observationId: "other-session" },
        },
        store,
      ),
    ).toEqual({ status: "blocked", code: "scope_mismatch" });
    expect(store.saves).toBe(0);
  });

  it("collects a park location and issue without using pothole-specific logic", async () => {
    const store = new InMemoryDraftStore();

    const first = await prepareServiceReport(
      CONTEXT,
      {
        requestType: "park_maintenance",
        draftId: null,
        expectedRevision: null,
        description: {
          text: "Broken swing",
          observationId: "observation-1",
        },
      },
      store,
    );
    expect(first).toEqual({
      status: "needs_input",
      draftId: "draft-1",
      revision: 1,
      requestType: "park_maintenance",
      fields: ["location"],
    });

    expect(
      await prepareServiceReport(
        CONTEXT,
        {
          requestType: "park_maintenance",
          draftId: "draft-1",
          expectedRevision: 1,
          location: {
            text: "North Boulder Park, west playground",
            observationId: "observation-2",
          },
        },
        store,
      ),
    ).toEqual({
      status: "needs_confirmation",
      draftId: "draft-1",
      revision: 2,
      summary: {
        requestType: "park_maintenance",
        location: "North Boulder Park, west playground",
        description: "Broken swing",
      },
    });
    expect(store.saves).toBe(2);
  });

  it("does not change an existing draft to a different report type", async () => {
    const store = new InMemoryDraftStore();
    await prepareServiceReport(
      CONTEXT,
      { requestType: "pothole", draftId: null, expectedRevision: null },
      store,
    );

    expect(
      await prepareServiceReport(
        CONTEXT,
        {
          requestType: "park_maintenance",
          draftId: "draft-1",
          expectedRevision: 1,
        },
        store,
      ),
    ).toEqual({ status: "blocked", code: "revision_conflict" });
    expect(store.drafts.get("draft-1")?.requestType).toBe("pothole");
    expect(store.saves).toBe(1);
  });
});
