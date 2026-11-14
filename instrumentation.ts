export async function register() {
  // Validate required env once when the Next.js server process starts.
  const { assertEnv } = await import("./app/lib/env");
  assertEnv();
}
