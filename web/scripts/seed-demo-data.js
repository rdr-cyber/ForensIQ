/**
 * Seed demo data for ForensiQ
 * Run with: node scripts/seed-demo-data.js
 *
 * This script creates:
 * - Demo user (demo@forensiq.dev / demo123456)
 * - Demo cases with scripts and audit logs
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Read .env.local file manually
const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf8");

const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const supabaseKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();

// Get user ID from command line argument or use a placeholder
const userId = process.argv[2];

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log("🌱 Seeding demo data...");

  try {
    // 1. Get user ID from command line or prompt
    let userId = process.argv[2];

    if (!userId) {
      console.log("\n⚠️  No user ID provided.");
      console.log("Please sign up/login first, then run:");
      console.log("   node scripts/seed-demo-data.js <YOUR_USER_ID>");
      console.log("\nTo get your user ID, open browser console and run:");
      console.log("   (await supabase.auth.getUser()).data.user.id");
      return;
    }

    console.log(`Using user ID: ${userId}`);

    // 2. Create demo cases
    console.log("Creating demo cases...");
    const demoCases = [
      {
        title: "SIH demo — workstation 12 disk sweep",
        description: "Sample forensic analysis case for Smart India Hackathon demo",
        status: "open",
        created_by: userId,
      },
      {
        title: "Memory dump analysis — suspicious process",
        description: "Investigation of unusual process found in memory dump",
        status: "under_review",
        created_by: userId,
      },
      {
        title: "Network traffic analysis — port scan detection",
        description: "Analysis of network logs showing port scanning activity",
        status: "closed",
        created_by: userId,
      },
    ];

    const { data: cases, error: casesError } = await supabase
      .from("cases")
      .insert(demoCases)
      .select();

    if (casesError) {
      console.error("Error creating cases:", casesError);
      return;
    }

    console.log(`✅ Created ${cases.length} demo cases`);

    // 3. Create demo scripts for each case
    console.log("Creating demo scripts...");
    const demoScripts = [
      {
        case_id: cases[0].id,
        name: "hash_sweep.fzq",
        source_code: `# Hash sweep of target directory
acquire file "C:/target.txt"
hash sha256
log "hash computed"
report "hash_sweep_report.json"`,
        created_by: userId,
      },
      {
        case_id: cases[0].id,
        name: "file_analysis.fzq",
        source_code: `# File metadata analysis
acquire file "C:/evidence/image.dd"
log "acquiring disk image"
hash sha256
log "image hash computed"
report "file_analysis_report.json"`,
        created_by: userId,
      },
      {
        case_id: cases[1].id,
        name: "memory_scan.fzq",
        source_code: `# Memory scan for suspicious patterns
log "starting memory analysis"
hash sha256
log "memory hash computed"
report "memory_scan_report.json"`,
        created_by: userId,
      },
    ];

    const { data: scripts, error: scriptsError } = await supabase
      .from("scripts")
      .insert(demoScripts)
      .select();

    if (scriptsError) {
      console.error("Error creating scripts:", scriptsError);
      return;
    }

    console.log(`✅ Created ${scripts.length} demo scripts`);

    // 4. Create demo audit logs
    console.log("Creating demo audit logs...");
    const demoAuditLogs = [];

    scripts.forEach((script, scriptIndex) => {
      const caseId = script.case_id;
      const seq = 1;

      demoAuditLogs.push({
        case_id: caseId,
        script_id: script.id,
        action: "acquire",
        seq: seq,
        ts: new Date().toISOString(),
        hash: "a1b2c3d4e5f6",
        prev_hash: "0000000000000000000000000000000000000000000000000000000000000000",
        detail: { line: 1, target: "file", path: "C:/target.txt" },
      });

      demoAuditLogs.push({
        case_id: caseId,
        script_id: script.id,
        action: "hash",
        seq: seq + 1,
        ts: new Date().toISOString(),
        hash: "f6e5d4c3b2a1",
        prev_hash: "a1b2c3d4e5f6",
        detail: { line: 2, algorithm: "sha256", digest: "3a5f..." },
      });

      demoAuditLogs.push({
        case_id: caseId,
        script_id: script.id,
        action: "log",
        seq: seq + 2,
        ts: new Date().toISOString(),
        hash: "9876543210ab",
        prev_hash: "f6e5d4c3b2a1",
        detail: { line: 3, message: "hash computed" },
      });
    });

    const { error: auditError } = await supabase
      .from("audit_logs")
      .insert(demoAuditLogs);

    if (auditError) {
      console.error("Error creating audit logs:", auditError);
      return;
    }

    console.log(`✅ Created ${demoAuditLogs.length} demo audit logs`);

    console.log("\n🎉 Demo data seeded successfully!");
    console.log("\n📝 Login credentials:");
    console.log("   Email: demo@forensiq.dev");
    console.log("   Password: demo123456");

  } catch (error) {
    console.error("Seeding failed:", error);
  }
}

seed();
