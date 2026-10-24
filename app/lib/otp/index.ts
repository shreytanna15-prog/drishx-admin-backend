export {
  normalizeIndianMobile,
  toTwoFactorMobile,
} from "./mobile-normalize";
export { normalizeEmail } from "./email-otp";
export {
  sendOtpChallenge,
  verifyOtpChallenge,
} from "./otp-challenge";
export {
  OTP_DEV_CODE_DEFAULT,
  OTP_PURPOSES,
  OTP_RATE_LIMIT,
  parseOtpPurpose,
  type OtpChannel,
  type OtpPurpose,
  type OtpSender,
} from "./otp-types";
export { isOtpDevMode, otpDevCode } from "./otp-env";
export { createCustomerFromMobileOtp } from "./signup-from-mobile";
export {
  isPlaceholderOtpEmail,
  placeholderEmailForMobile,
} from "./signup-email";

