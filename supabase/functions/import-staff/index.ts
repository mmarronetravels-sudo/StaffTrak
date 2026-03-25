import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StaffRow {
  full_name: string;
  email: string;
  role: string;
  staff_type: string;
  position_type: string;
  hire_date: string | null;
  years_at_school: number;
  is_evaluator: boolean;
}

interface ImportResult {
  success: number;
  skipped: number;
  errors: { name: string; error: string }[];
}

// Validation helpers
const MAX_ROWS = 2000;
const MAX_FIELD_LENGTH = 255;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const VALID_ROLES = ["licensed_staff", "classified_staff"];
const VALID_STAFF_TYPES = ["licensed", "classified"];

function sanitizeString(value: string): string {
  if (!value) return "";
  return value.trim().slice(0, MAX_FIELD_LENGTH);
}

function validateRow(row: StaffRow, index: number): string | null {
  if (!row.full_name?.trim()) {
    return `Row ${index}: Missing full_name`;
  }
  if (!row.email?.trim()) {
    return `Row ${index}: Missing email`;
  }
  if (!EMAIL_REGEX.test(row.email)) {
    return `Row ${index}: Invalid email format`;
  }
  if (row.role && !VALID_ROLES.includes(row.role)) {
    return `Row ${index}: Invalid role '${row.role}'`;
  }
  if (row.staff_type && !VALID_STAFF_TYPES.includes(row.staff_type)) {
    return `Row ${index}: Invalid staff_type '${row.staff_type}'`;
  }
  if (row.hire_date && !/^\d{4}-\d{2}-\d{2}$/.test(row.hire_date)) {
    return `Row ${index}: Invalid hire_date format (expected YYYY-MM-DD)`;
  }
  return null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with the user's JWT
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the user's profile to check role and tenant_id
    const { data: callerProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, tenant_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !callerProfile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only district admins can import staff
    if (callerProfile.role !== "district_admin") {
      return new Response(
        JSON.stringify({ error: "Only district admins can import staff" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantId = callerProfile.tenant_id;

    // Parse the request body
    const { rows } = await req.json() as { rows: StaffRow[] };

    if (!Array.isArray(rows) || rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "No rows provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (rows.length > MAX_ROWS) {
      return new Response(
        JSON.stringify({ error: `Too many rows (${rows.length}). Maximum is ${MAX_ROWS}.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate and sanitize all rows
    const result: ImportResult = { success: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Validate
      const validationError = validateRow(row, i + 1);
      if (validationError) {
        result.errors.push({ name: row.full_name || `Row ${i + 1}`, error: validationError });
        continue;
      }

      // Sanitize
      const sanitized = {
        full_name: sanitizeString(row.full_name),
        email: sanitizeString(row.email).toLowerCase(),
        role: VALID_ROLES.includes(row.role) ? row.role : "classified_staff",
        staff_type: VALID_STAFF_TYPES.includes(row.staff_type) ? row.staff_type : "classified",
        position_type: sanitizeString(row.position_type) || "advisor",
        hire_date: row.hire_date || null,
        years_at_school: Math.max(1, Math.min(99, Number(row.years_at_school) || 1)),
        is_evaluator: row.is_evaluator === true,
        tenant_id: tenantId,
        is_active: true,
      };

      // Insert
      const { error: insertError } = await supabase
        .from("profiles")
        .insert([sanitized]);

      if (insertError) {
        if (insertError.message?.includes("duplicate") || insertError.message?.includes("unique")) {
          result.skipped++;
          result.errors.push({ name: sanitized.full_name, error: "Already exists (duplicate email)" });
        } else {
          result.errors.push({ name: sanitized.full_name, error: "Insert failed" });
        }
      } else {
        result.success++;
      }
    }

    // Audit log (no PII — just counts and who did it)
    console.log(JSON.stringify({
      action: "staff_import",
      tenant_id: tenantId,
      user_id: user.id,
      total_rows: rows.length,
      success: result.success,
      skipped: result.skipped,
      errors: result.errors.length - result.skipped,
      timestamp: new Date().toISOString(),
    }));

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Import function error:", err.message);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
