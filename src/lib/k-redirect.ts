/**
 * Short link /k for OurKehilla. One fixed homepage target shared by the
 * request middleware, the server route, and client-side navigation so the
 * attribution (utm_source=ourkehilla) can never drift between them.
 * Inbound query strings on /k are intentionally ignored.
 */
export const K_REDIRECT_TARGET =
  "https://torahforthetable.com/?utm_source=ourkehilla&utm_medium=email&utm_campaign=chayei_sarah_5787&utm_content=announcement";
