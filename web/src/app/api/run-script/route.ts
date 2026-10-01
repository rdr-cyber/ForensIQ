import { NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase-route";
import type { RunScriptResult } from "@/lib/types";

const SERVICE_URL = process.env.FORENSIQ_SERVICE_URL ?? "http://127.0.0.1:8000";

type Body = {
  case_id: string;
  name?: string;
  content: string;
  files?: Record<string, string>; // sandbox input files the script may acquire
};

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

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.case_id || typeof body.content !== "string" || !body.content.trim()) {
    return NextResponse.json(
      { error: "case_id and content are required" },
      { status: 400 },
    );
  }

  // RLS will reject the insert (-> 403) if the case isn't assigned to this user.
  const { data: inserted, error: insertError } = await supabase
    .from("scripts")
    .insert({
      case_id: body.case_id,
      name: body.name?.slice(0, 120) ?? null,
      source_code: body.content,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (insertError) {
    return NextResponse.json(
      { error: `script persistence failed: ${insertError.message}` },
      { status: 403 },
    );
  }

  // Execute via the FastAPI service; the service is stateless and has no
  // Supabase credentials -- persistence happens only here, under RLS.
  let serviceRes: Response;
  try {
    serviceRes = await fetch(`${SERVICE_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: body.content, files: body.files ?? {} }),
    });
  } catch {
    return NextResponse.json(
      { error: `Jocky service unreachable at ${SERVICE_URL}` },
      { status: 502 },
    );
  }
  const result = (await serviceRes.json()) as RunScriptResult;

  // Persist the audit chain rows for this run (RLS: owned case only).
  if (result.audit_entries?.length) {
    const { error: auditError } = await supabase.from("audit_logs").insert(
      result.audit_entries.map((e) => ({
        case_id: body.case_id,
        script_id: inserted.id,
        action: e.action,
        seq: e.seq,
        ts: e.ts,
        hash: e.hash,
        prev_hash: e.prev_hash,
        detail: e.detail,
      })),
    );
    if (auditError) {
      return NextResponse.json(
        {
          ...result,
          script_id: inserted.id,
          error: `audit persistence failed: ${auditError.message}`,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ...result, script_id: inserted.id });
}
