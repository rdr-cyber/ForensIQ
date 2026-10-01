/**
 * Friendly auth error mapping + OAuth-return error parsing.
 * GoTrue errors leak implementation jargon ("GoTrue", "anon key",
 * "over_email_send_rate_limit"); the UI translates them into actions.
 */
import type { AuthError } from "@supabase/supabase-js";

export function friendlyAuthError(err: AuthError | Error | string): string {
  const raw = typeof err === "string" ? err : err.message;
  const m = raw.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "Wrong email or password. Check for typos, or reset below.";
  }
  if (
    m.includes("rate limit") ||
    m.includes("too many requests") ||
    m.includes("over_email_send_rate_limit")
  ) {
    return "Too many attempts right now. Wait a couple of minutes and try again.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirm your email first — check your inbox (and spam) for the link.";
  }
  if (m.includes("user already registered")) {
    return "An account with this email already exists. Sign in instead.";
  }
  if (m.includes("password should be at least")) {
    return "Password is too short — use at least 8 characters.";
  }
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) {
    return "Google sign-in isn't switched on for this project yet. An admin has to enable it in the Supabase dashboard (Authentication → Providers → Google), then Save.";
  }
  if (m.includes("signup requires a valid password")) {
    return "Enter a password of at least 8 characters.";
  }
  if (m.includes("failed to fetch") || m.includes("network")) {
    return "Can't reach the auth server. Check your connection and try again.";
  }
  return raw;
}

/**
 * After Google redirects back, the SDK's onAuthStateChange can fire while
 * the URL still carries fragments/session data; reading getSession() in
 * that instant can return null and bounce a successful login back to
 * /login. Callers retry a few times before giving up.
 */
export async function getSessionReady(
  client: ReturnType<typeof import("@/lib/supabase").getSupabase>,
  attempts = 10,
  delayMs = 250,
): Promise<Awaited<ReturnType<typeof client.auth.getSession>>["data"]["session"]> {
  for (let i = 0; i < attempts; i++) {
    const { data } = await client.auth.getSession();
    if (data.session) return data.session;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

/** Human message for ?error= / error_description= returned by GoTrue. */
export function describeOAuthReturnError(code: string, description: string | null): string {
  if (code === "access_denied") {
    return "Google consent was cancelled. Nothing was shared — try again when you're ready.";
  }
  if (code === "redirect_uri_mismatch") {
    return "Setup problem: this app's address isn't registered with the Google client. Ask the admin to add it as an authorized redirect URI.";
  }
  if (code === "otp_expired" || code === "invalid_request") {
    return "That sign-in link is no longer valid. Start again from the sign-in page.";
  }
  return description || "Sign-in with Google failed. Please try again.";
}
