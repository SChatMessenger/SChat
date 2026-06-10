// Public contact-code payload encoded into the shareable QR (verified-contact
// flow). It carries only public routing + identity data — never a secret.
//
// TODO: the canonical encoding belongs in the Rust engine (identity core +
// fingerprint) and should be produced over the FFI. This is a placeholder shape
// good enough to render the QR in the UI build.
export interface ContactCodeInput {
  inboxId: string;
  username?: string;
  identity: { idEdPub: string; authhwPub: string } | { idEdPub: string } | unknown;
}

export function encodeContactCode(input: ContactCodeInput): string {
  const u = input.username ? `&u=${encodeURIComponent(input.username)}` : '';
  return `schat:contact?inbox=${encodeURIComponent(input.inboxId)}${u}`;
}
