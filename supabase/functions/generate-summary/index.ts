// Deploy this to the EXTERNAL "torah-by-the-table" Supabase project, not Lovable Cloud.
//
// Deploy steps (run locally against the torah-by-the-table project):
//   supabase login
//   supabase link --project-ref <torah-by-the-table-ref>
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy generate-summary --no-verify-jwt
//
// Invoke:
//   POST https://<ref>.supabase.co/functions/v1/generate-summary
//   Authorization: Bearer <SERVICE_ROLE_KEY>
//   Body: { "id": "<pdfs-row-uuid>" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SYSTEM_PROMPT = `REPLACE_ME: paste the exact system prompt you want Claude to use.
It must instruct Claude to respond ONLY with JSON matching:
{ "summary_quick": string, "summary_full": string, "content_type": string }`;

const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const STORAGE_BUCKET = "pdfs"; // change if your bucket is named differently

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { id } = await req.json();
    if (!id) return json({ error: "Missing 'id'" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Load the row
    const { data: row, error: rowErr } = await supabase
      .from("pdfs")
      .select("id, file_path")
      .eq("id", id)
      .single();
    if (rowErr || !row) return json({ error: `pdf row not found: ${rowErr?.message}` }, 404);
    if (!row.file_path) return json({ error: "row has no file_path" }, 400);

    // 2. Download the PDF from Storage
    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(row.file_path);
    if (dlErr || !fileBlob) return json({ error: `download failed: ${dlErr?.message}` }, 500);

    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    const base64Pdf = base64Encode(bytes);

    // 3. Send to Claude with the PDF as a document attachment
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: base64Pdf },
              },
              {
                type: "text",
                text: "Analyze the attached PDF and respond with ONLY the JSON object described in the system prompt. No prose, no code fences.",
              },
            ],
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      return json({ error: `claude error ${claudeRes.status}: ${errText}` }, 502);
    }

    const claudeJson = await claudeRes.json();
    const text: string = claudeJson.content?.[0]?.text ?? "";

    // 4. Parse JSON (strip code fences if Claude included them)
    const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
    let parsed: { summary_quick?: string; summary_full?: string; content_type?: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch (_e) {
      return json({ error: "claude response was not valid JSON", raw: text }, 502);
    }

    // 5. Save back to the row
    const { error: upErr } = await supabase
      .from("pdfs")
      .update({
        summary_quick: parsed.summary_quick ?? null,
        summary_full: parsed.summary_full ?? null,
        content_type: parsed.content_type ?? null,
      })
      .eq("id", id);
    if (upErr) return json({ error: `update failed: ${upErr.message}` }, 500);

    return json({ ok: true, id, saved: parsed });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
