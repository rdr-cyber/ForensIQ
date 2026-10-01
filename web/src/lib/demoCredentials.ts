/**
 * Judge-facing demo login — deliberately public.
 *
 * This credential belongs to the seeded analyst account (owner of the demo
 * case). It is printed in the login page's Demo Access box so the credential
 * can never be lost again; the submission builder's secret scanner
 * allowlists exactly this file for this marker — see
 * DEMO_CRED_ALLOWLIST in tools/build_submission.py. Do not move the values
 * elsewhere: any other file containing them fails the build.
 */
export const DEMO_EMAIL = "analyst2@forensiq.dev";
export const DEMO_PASSWORD = "ForensiQ#2026";
