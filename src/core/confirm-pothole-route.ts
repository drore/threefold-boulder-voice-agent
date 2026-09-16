import {
  decideBusinessHoursAction,
  isWithinBusinessHours,
  type OfficeSchedule,
} from "./business-hours.js";
import type { DraftStore, ReportContext } from "./prepare-service-report.js";

type RouteDestination = Readonly<{
  name: string;
  mockDestination: string;
}>;

type RoutePolicy = Readonly<{
  cityId: string;
  revision: number;
  schedule: OfficeSchedule;
  requestTypes: Readonly<{ pothole: string }>;
  departments: Readonly<Record<string, RouteDestination | undefined>>;
}>;

export interface CityPolicyReader {
  /** Input: server-owned city ID `"boulder-co"`. Output: validated policy or `unavailable`. */
  load(
    cityId: string,
  ): Promise<
    { status: "available"; policy: RoutePolicy } | { status: "unavailable" }
  >;
}

export type ConfirmPotholeDecision =
  | {
      status: "simulated_route";
      draftId: string;
      revision: number;
      policyRevision: number;
      department: RouteDestination;
    }
  | {
      status: "ticket_required";
      draftId: string;
      revision: number;
      policyRevision: number;
    }
  | {
      status: "blocked";
      code:
        | "missing_draft"
        | "revision_conflict"
        | "incomplete_draft"
        | "scope_mismatch"
        | "store_unavailable"
        | "policy_unavailable";
    };

/**
 * Chooses the local demo outcome from a freshly loaded draft and DB policy.
 * Input: a scoped draft ID, revision 2, and a server clock returning an open-hours time.
 * Output: an honestly simulated route when open, or a ticket decision when closed.
 */
export async function confirmPotholeRoute(
  context: ReportContext,
  draftId: string | null,
  expectedRevision: number,
  draftStore: Pick<DraftStore, "load">,
  policyStore: CityPolicyReader,
  clock: () => Date,
): Promise<ConfirmPotholeDecision> {
  if (!draftId) return { status: "blocked", code: "missing_draft" };

  const loaded = await draftStore.load(context, draftId);
  if (loaded.status === "denied") {
    return { status: "blocked", code: "scope_mismatch" };
  }
  if (loaded.status === "unavailable") {
    return { status: "blocked", code: "store_unavailable" };
  }
  if (loaded.status === "empty") {
    return { status: "blocked", code: "missing_draft" };
  }

  const draft = loaded.draft;
  if (
    draft.draftId !== draftId ||
    draft.conversationId !== context.conversationId ||
    draft.cityId !== context.cityId
  ) {
    return { status: "blocked", code: "scope_mismatch" };
  }
  if (draft.revision !== expectedRevision) {
    return { status: "blocked", code: "revision_conflict" };
  }
  if (!draft.location?.text.trim() || !draft.description?.text.trim()) {
    return { status: "blocked", code: "incomplete_draft" };
  }

  const loadedPolicy = await policyStore.load(context.cityId);
  if (loadedPolicy.status !== "available") {
    return { status: "blocked", code: "policy_unavailable" };
  }
  const policy = loadedPolicy.policy;
  const department = policy.departments[policy.requestTypes.pothole];
  if (policy.cityId !== context.cityId || !department) {
    return { status: "blocked", code: "policy_unavailable" };
  }

  const action = decideBusinessHoursAction(
    isWithinBusinessHours(policy.schedule, clock()),
  );
  if (action === "route") {
    return {
      status: "simulated_route",
      draftId: draft.draftId,
      revision: draft.revision,
      policyRevision: policy.revision,
      department: {
        name: department.name,
        mockDestination: department.mockDestination,
      },
    };
  }
  if (action === "create_ticket") {
    return {
      status: "ticket_required",
      draftId: draft.draftId,
      revision: draft.revision,
      policyRevision: policy.revision,
    };
  }
  return { status: "blocked", code: "policy_unavailable" };
}
