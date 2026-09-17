/**
 * Service-report intake use case.
 * Validates untrusted location/description against server-owned observations,
 * merges them into a revisioned draft, and returns missing fields or a
 * confirmation summary. It never submits a ticket or routes a call.
 */
/** Scope resolved by the server, never copied from a model tool argument. */
export type ReportContext = Readonly<{
  conversationId: string;
  cityId: string;
  admissionId: string;
}>;

/** Text and its server-issued caller observation reference. */
export type ObservedReportField = Readonly<{
  text: string;
  observationId: string;
}>;

export type ReportFields = Readonly<{
  location?: ObservedReportField;
  description?: ObservedReportField;
}>;

export type SupportedReportType = "pothole" | "park_maintenance";

export type ServiceReportData = ReportFields &
  Readonly<{ requestType: SupportedReportType }>;

export type ReportDraft = ServiceReportData &
  Readonly<{
    draftId: string;
    conversationId: string;
    cityId: string;
    revision: number;
  }>;

type DraftRead =
  | { status: "empty" }
  | { status: "found"; draft: ReportDraft }
  | { status: "denied" }
  | { status: "unavailable" };

type DraftWrite =
  | { status: "saved"; draft: ReportDraft }
  | { status: "conflict" }
  | { status: "denied" }
  | { status: "unavailable" };

/**
 * The adapter must scope both calls to the admission, verify each observation
 * belongs to that scope, and compare the revision atomically when saving.
 */
export interface DraftStore {
  load(context: ReportContext, draftId: string | null): Promise<DraftRead>;
  save(
    context: ReportContext,
    draftId: string | null,
    expectedRevision: number | null,
    fields: ServiceReportData,
  ): Promise<DraftWrite>;
}

export type PrepareReportInput = ReportFields &
  Readonly<{
    requestType: SupportedReportType;
    draftId: string | null;
    expectedRevision: number | null;
  }>;

export type PrepareReportResult =
  | {
      status: "needs_input";
      draftId: string;
      revision: number;
      requestType: SupportedReportType;
      fields: ("location" | "description")[];
    }
  | {
      status: "needs_confirmation";
      draftId: string;
      revision: number;
      summary: {
        requestType: SupportedReportType;
        location: string;
        description: string;
      };
    }
  | {
      status: "blocked";
      code:
        | "invalid_input"
        | "unsupported_request_type"
        | "scope_mismatch"
        | "revision_conflict"
        | "store_unavailable";
    };

const MAX_FIELD_LENGTH = 500;
const SUPPORTED_REPORT_TYPES: readonly SupportedReportType[] = [
  "pothole",
  "park_maintenance",
];

/**
 * Saves a scoped service-report draft and reports which details or confirmation it needs.
 * Input: `{requestType: "pothole", draftId: null, expectedRevision: null, location: {text: "15th and Pine", observationId: "turn-1"}}`.
 * Output: `needs_input` for its description, or `needs_confirmation` once complete.
 */
export async function prepareServiceReport(
  context: ReportContext,
  input: PrepareReportInput,
  store: DraftStore,
): Promise<PrepareReportResult> {
  if (!SUPPORTED_REPORT_TYPES.includes(input.requestType)) {
    return { status: "blocked", code: "unsupported_request_type" };
  }
  if (
    !context.conversationId ||
    !context.cityId ||
    !context.admissionId ||
    (input.draftId !== null && input.draftId.trim().length === 0) ||
    (input.draftId === null) !== (input.expectedRevision === null) ||
    (input.expectedRevision !== null &&
      (!Number.isInteger(input.expectedRevision) ||
        input.expectedRevision < 1)) ||
    !isValidField(input.location) ||
    !isValidField(input.description)
  ) {
    return { status: "blocked", code: "invalid_input" };
  }

  const read = await store.load(context, input.draftId);
  if (read.status === "denied") {
    return { status: "blocked", code: "scope_mismatch" };
  }
  if (read.status === "unavailable") {
    return { status: "blocked", code: "store_unavailable" };
  }

  const current = read.status === "found" ? read.draft : undefined;
  if (
    current &&
    (current.draftId !== input.draftId ||
      current.conversationId !== context.conversationId ||
      current.cityId !== context.cityId)
  ) {
    return { status: "blocked", code: "scope_mismatch" };
  }
  if ((current?.revision ?? null) !== input.expectedRevision) {
    return { status: "blocked", code: "revision_conflict" };
  }
  if (current && current.requestType !== input.requestType) {
    return { status: "blocked", code: "revision_conflict" };
  }

  const location = input.location
    ? { ...input.location, text: input.location.text.trim() }
    : current?.location;
  const description = input.description
    ? { ...input.description, text: input.description.text.trim() }
    : current?.description;
  const fields: ServiceReportData = {
    requestType: input.requestType,
    ...(location ? { location } : {}),
    ...(description ? { description } : {}),
  };
  if (current && !input.location && !input.description) {
    return nextStepForDraft(current);
  }

  const saved = await store.save(
    context,
    input.draftId,
    input.expectedRevision,
    fields,
  );
  if (saved.status === "denied") {
    return { status: "blocked", code: "scope_mismatch" };
  }
  if (saved.status === "conflict") {
    return { status: "blocked", code: "revision_conflict" };
  }
  if (saved.status === "unavailable") {
    return { status: "blocked", code: "store_unavailable" };
  }
  return nextStepForDraft(saved.draft);
}

/** Input: a saved draft with both fields at revision 2. Output: a confirmation summary for revision 2. */
function nextStepForDraft(draft: ReportDraft): PrepareReportResult {
  if (!draft.location || !draft.description) {
    const missing: ("location" | "description")[] = [];
    if (!draft.location) missing.push("location");
    if (!draft.description) missing.push("description");
    return {
      status: "needs_input",
      draftId: draft.draftId,
      revision: draft.revision,
      requestType: draft.requestType,
      fields: missing,
    };
  }
  return {
    status: "needs_confirmation",
    draftId: draft.draftId,
    revision: draft.revision,
    summary: {
      requestType: draft.requestType,
      location: draft.location.text,
      description: draft.description.text,
    },
  };
}

/** Input: `{text: "15th and Pine", observationId: "turn-1"}`. Output: `true`; blank text yields `false`. */
function isValidField(field: ObservedReportField | undefined): boolean {
  return (
    field === undefined ||
    (field.text.trim().length > 0 &&
      field.text.length <= MAX_FIELD_LENGTH &&
      field.observationId.trim().length > 0)
  );
}
