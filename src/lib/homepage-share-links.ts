import { SITE_URL } from "@/lib/site-url";
import { withUtm } from "@/lib/utm";

export const homepageWhatsAppUrl = withUtm(`${SITE_URL}/`, {
  source: "whatsapp", medium: "share", campaign: "weekly-share", content: "veahavta-home",
});
export const homepageCopyUrl = withUtm(`${SITE_URL}/`, {
  source: "copy-link", medium: "share", campaign: "weekly-share", content: "friend-home",
});
export const homepageWhatsAppHref = `https://wa.me/?text=${encodeURIComponent(`Help make another Shabbos table better! Explore Torah For The Table's fresh selections every Thursday: ${homepageWhatsAppUrl}`)}`;