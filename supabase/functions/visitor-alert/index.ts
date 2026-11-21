import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const pushoverUser = Deno.env.get("PUSHOVER_USER_KEY");
  const pushoverToken = Deno.env.get("PUSHOVER_APP_TOKEN");

  if (!pushoverUser || !pushoverToken) {
    return new Response("Pushover secrets missing", { status: 500 });
  }

  const body = await req.json();
  const event = body?.record ?? body;

  const city = event.city || "Unknown city";
  const region = event.region ? `, ${event.region}` : "";
  const country = event.country || "Unknown country";
  const visitorType = event.is_new_visitor ? "New browser ID (unverified)" : "Returning browser ID (unverified)";
  const device = event.device_type || "Unknown device";
  const source = event.source_group || "Direct / Unknown";
  const page = event.path || "/";
  const time = event.occurred_at || new Date().toISOString();

  const message =
    `${visitorType}\n` +
    `${city}${region} · ${country} — approximate network location\n` +
    `${device} · Source: ${source}\n` +
    `Page: ${page}\n` +
    `Human readership not confirmed at first page load.\n` +
    `${time}`;

  const form = new URLSearchParams();
  form.set("token", pushoverToken);
  form.set("user", pushoverUser);
  form.set("title", "Torah For The Table — Unverified Visit");
  form.set("message", message);
  form.set("priority", "0");
  form.set("sound", "pushover");

  const response = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const result = await response.text();

  return new Response(result, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
});