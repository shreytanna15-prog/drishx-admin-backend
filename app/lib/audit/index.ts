export { AuditAction, AuditModule, SecurityAction } from "./event-codes";
export { ReasonCode, actionRequiresReason, validateReason } from "./reason-codes";
export { diffFields, singleChange, type FieldChange } from "./diff";
export { isHighRiskAction } from "./high-risk";
export {
  buildAuditRequestContext,
  actorFromSession,
  systemActor,
  type AuditRequestContext,
  type AuditActor,
} from "./request-context";
export { recordAuditEvent, type RecordAuditEventInput } from "./record-audit-event";
export { recordSecurityEvent } from "./record-security-event";
export { recordSystemError } from "./record-system-error";
export {
  recordStockMovement,
  getLensQuantity,
  buildEmployeeAuditScope,
} from "./stock-movement";
export { logStockDelta } from "./log-stock-change";
