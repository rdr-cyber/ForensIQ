import { NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase-route";

/**
 * Issues a short-lived signed download URL for an evidence bundle.
 * The caller's own bearer is used, so storage RLS (can_access_case on the
 * first path segment) decides — outsiders get the same 404 Storage returns
 * for objects they cannot see.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const supabase = createRouteClient(auth);
  if (!supabase) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let path: string;
  try {
    const body = await req.json();
    path = body.path;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof path !== "string" || !path.includes("/")) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  const { data, error } = await supabase.storage
    .from("evidence-bundles")
    .createSignedUrl(path, 300); // 5 minutes
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "signed URL failed" },
      { status: 404 },
    );
  }
  return NextResponse.json({ url: data.signedUrl });
}
