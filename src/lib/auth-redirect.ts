export const POST_LOGIN_REDIRECT_KEY = "auth:postLoginRedirect";

export function getSafePostLoginRedirect(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value.startsWith("/") && !value.startsWith("//") ? value : null;
  }
}