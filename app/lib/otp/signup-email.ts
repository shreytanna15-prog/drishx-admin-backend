/** Placeholder email until real email is attached (DB still requires unique email). */
export function placeholderEmailForMobile(tenDigitMobile: string): string {
  return `m${tenDigitMobile}@otp.drishx.local`;
}

export function isPlaceholderOtpEmail(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith("@otp.drishx.local"));
}
