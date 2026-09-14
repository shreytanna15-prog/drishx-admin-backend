import { AuditAction } from "./event-codes";

const HIGH_RISK = new Set<string>([
  AuditAction.STOCK_ADJUSTED,
  AuditAction.PAYMENT_REVERSED,
  AuditAction.TRANSACTION_VOIDED,
  AuditAction.EXPENSE_VOIDED,
  AuditAction.PRICE_CHANGED,
  AuditAction.ROLE_CHANGED,
  AuditAction.PRESCRIPTION_CHANGED,
  AuditAction.ORDER_ARCHIVED,
  AuditAction.ORDER_CANCELLED,
]);

export function isHighRiskAction(action: string): boolean {
  return HIGH_RISK.has(action);
}
