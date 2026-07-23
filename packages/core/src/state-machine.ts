import type { LeadState } from "./schemas.js";

/** Terminal states — never re-contact (spec §2). */
export const TERMINAL_STATES: ReadonlySet<LeadState> = new Set([
    "REJECTED",
    "BOUNCED",
    "UNSUBSCRIBED",
]);
/**
 * Allowed transitions. Key = from state (null = create).
 * REPLIED → HUMAN stops pipeline touching the lead.
 */
const TRANSITIONS = new Map<LeadState | null, ReadonlySet<LeadState>>([
    [null, new Set(["NEW"])],
    ["NEW", new Set(["ENRICHED", "REJECTED", "BOUNCED", "UNSUBSCRIBED"])],
    ["ENRICHED", new Set(["SCORED", "REJECTED", "BOUNCED", "UNSUBSCRIBED"])],
    ["SCORED", new Set(["DRAFTED", "REJECTED", "BOUNCED", "UNSUBSCRIBED"])],
    ["DRAFTED", new Set(["PENDING_APPROVAL", "REJECTED", "BOUNCED", "UNSUBSCRIBED"])],
    [
        "PENDING_APPROVAL",
        new Set(["APPROVED", "REJECTED", "DRAFTED", "BOUNCED", "UNSUBSCRIBED"]),
    ],
    [
        "APPROVED",
        new Set([
            "SENT",
            "FOLLOWUP_1",
            "FOLLOWUP_2",
            "NURTURE",
            "REJECTED",
            "BOUNCED",
            "UNSUBSCRIBED",
        ]),
    ],
    ["SENT", new Set(["REPLIED", "NO_REPLY", "BOUNCED", "UNSUBSCRIBED", "REJECTED"])],
    [
        "NO_REPLY",
        new Set([
            "FOLLOWUP_1",
            "DRAFTED",
            "REPLIED",
            "REJECTED",
            "BOUNCED",
            "UNSUBSCRIBED",
        ]),
    ],
    [
        "FOLLOWUP_1",
        new Set([
            "FOLLOWUP_2",
            "DRAFTED",
            "REPLIED",
            "REJECTED",
            "BOUNCED",
            "UNSUBSCRIBED",
        ]),
    ],
    [
        "FOLLOWUP_2",
        new Set([
            "NURTURE",
            "DRAFTED",
            "REPLIED",
            "REJECTED",
            "BOUNCED",
            "UNSUBSCRIBED",
        ]),
    ],
    ["NURTURE", new Set(["DRAFTED", "REPLIED", "REJECTED", "BOUNCED", "UNSUBSCRIBED"])],
    ["REPLIED", new Set(["HUMAN"])],
    ["HUMAN", new Set(["REJECTED", "UNSUBSCRIBED"])],
]);
export class IllegalTransitionError extends Error {
    readonly from: LeadState | null;
    readonly to: LeadState;
    constructor(from: LeadState | null, to: LeadState) {
        super(`Illegal lead transition: ${from ?? "(create)"} → ${to}`);
        this.from = from;
        this.to = to;
        this.name = "IllegalTransitionError";
    }
}
export function canTransition(from: LeadState | null, to: LeadState): boolean {
    const allowed = TRANSITIONS.get(from);
    return allowed?.has(to) ?? false;
}
export function assertTransition(from: LeadState | null, to: LeadState): void {
    if (!canTransition(from, to)) {
        throw new IllegalTransitionError(from, to);
    }
}
export function isTerminal(state: LeadState): boolean {
    return TERMINAL_STATES.has(state);
}
//# sourceMappingURL=state-machine.js.map