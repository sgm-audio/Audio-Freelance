/**
 * Email send path for SGM Outreach (OUTREACH_BUILD_SPEC §1 / §7 M4).
 * LinkedIn / Upwork queues are owned by sibling packages — not implemented here.
 */
export { appendCaslFooter, buildUnsubscribeUrl, signUnsubToken, verifyUnsubToken } from "./casl.js";
export {
  loadSendConfig,
  SendConfigSchema,
  type SendConfig,
} from "./config.js";
export {
  sendApprovedEmails,
  sendApprovedLead,
  SendOneResultSchema,
  type SendApprovedOptions,
  type SendApprovedResult,
  type SendOneResult,
} from "./email.js";
export {
  createResendTransport,
  ResendSendPayloadSchema,
  ResendSendResultSchema,
  type ResendSendPayload,
  type ResendSendResult,
  type ResendTransport,
} from "./resend.js";
export {
  createUnsubscribeRequestListener,
  startUnsubscribeServer,
  type UnsubscribeServerOptions,
} from "./unsubscribe.js";
