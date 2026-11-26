/**
 * Sender.net Vayishlach 5787 bundle email short links.
 * The visible paths stay clean; only the homepage destinations carry UTM tags.
 */
export const SENDER_NET_REDIRECT_TARGETS = {
  "/sn-family":
    "https://torahforthetable.com/?utm_source=sender.net&utm_medium=email&utm_campaign=vayishlach_bundles&utm_content=family",
  "/sn-children":
    "https://torahforthetable.com/?utm_source=sender.net&utm_medium=email&utm_campaign=vayishlach_bundles&utm_content=children",
  "/sn-deeper":
    "https://torahforthetable.com/?utm_source=sender.net&utm_medium=email&utm_campaign=vayishlach_bundles&utm_content=deeper",
  "/sn-main":
    "https://torahforthetable.com/?utm_source=sender.net&utm_medium=email&utm_campaign=vayishlach_bundles&utm_content=main_button",
  "/sn-footer":
    "https://torahforthetable.com/?utm_source=sender.net&utm_medium=email&utm_campaign=vayishlach_bundles&utm_content=footer",
} as const;

export type SenderNetShortPath = keyof typeof SENDER_NET_REDIRECT_TARGETS;

export function getSenderNetRedirectTarget(pathname: string): string | undefined {
  return SENDER_NET_REDIRECT_TARGETS[pathname as SenderNetShortPath];
}
