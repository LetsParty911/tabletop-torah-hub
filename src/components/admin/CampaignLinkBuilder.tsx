import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildTrackingUrl } from "@/lib/admin-analytics-display";

const SITE = "https://torahforthetable.com";

export const CHANNEL_PRESETS: Array<{ label: string; source: string; medium: string }> = [
  { label: "WhatsApp", source: "whatsapp", medium: "message" },
  { label: "Sender.net email", source: "sender", medium: "email" },
  { label: "Email (other)", source: "email", medium: "newsletter" },
  { label: "Facebook", source: "facebook", medium: "social" },
  { label: "Instagram", source: "instagram", medium: "social" },
  { label: "QR / Print", source: "print", medium: "qr" },
];

function field(label: string, value: string, onChange: (value: string) => void, hint?: string) {
  return (
    <label className="text-xs text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
      />
      {hint && <span className="mt-1 block text-[11px]">{hint}</span>}
    </label>
  );
}

/**
 * Builds a tagged campaign link. Existing query parameters and any anchor on
 * the destination are preserved; generated values are normalized.
 */
export default function CampaignLinkBuilder({ defaultCampaign }: { defaultCampaign: string }) {
  const [destination, setDestination] = useState("/");
  const [source, setSource] = useState("whatsapp");
  const [medium, setMedium] = useState("message");
  const [campaign, setCampaign] = useState(defaultCampaign);
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => {
    const path = destination.trim() || "/";
    const base = path.startsWith("http")
      ? path
      : `${SITE}${path.startsWith("/") ? "" : "/"}${path}`;
    return buildTrackingUrl({ baseUrl: base, source, medium, campaign, content });
  }, [destination, source, medium, campaign, content]);

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section>
      <h3 className="font-serif text-lg font-semibold text-primary">Campaign link builder</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Pick a channel, name the campaign, and optionally label the variant so two versions of the
        same campaign can be told apart in reports.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {CHANNEL_PRESETS.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            size="sm"
            variant={source === preset.source && medium === preset.medium ? "default" : "outline"}
            onClick={() => {
              setSource(preset.source);
              setMedium(preset.medium);
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {field("Destination path or URL", destination, setDestination, "e.g. / or /view/abc")}
        {field("Source", source, setSource)}
        {field("Medium", medium, setMedium)}
        {field("Campaign", campaign, setCampaign)}
        {field("Variant (optional)", content, setContent, "e.g. message-a")}
      </div>
      <div className="mt-3 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-muted/40 p-3 text-xs">
          {url ?? "Fill in source, medium and campaign to create a link."}
        </code>
        <Button variant="outline" size="icon" onClick={() => void copy()} disabled={!url} aria-label="Copy campaign link">
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
    </section>
  );
}
