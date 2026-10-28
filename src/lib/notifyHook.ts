import "server-only";

/**
 * Knocking on the far end's door when there is new data.
 *
 * Deliberately a nudge and not a delivery. We send a few words saying
 * something changed; the other system then pulls what it wants through the
 * export API, with the key it already holds. That keeps one way in and one
 * set of rules, and means we never have to know the shape of anyone else's
 * database.
 */

/** Addresses we refuse to knock on. */
const BLOCKED_HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal",
];

/**
 * An admin can type this address, and the server is the one that fetches it,
 * so a careless or malicious value could be pointed back inside our own
 * network. Public https addresses only.
 */
export function checkNotifyUrl(raw: string): { url: string } | { error: string } {
  const text = raw.trim();
  if (!text) return { error: "Enter an address, or leave it empty to turn this off." };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { error: "That isn't a web address. It should start with https://" };
  }

  if (url.protocol !== "https:") {
    return { error: "The address has to start with https:// so the nudge can't be read in transit." };
  }

  const host = url.hostname.toLowerCase();
  if (
    BLOCKED_HOSTS.includes(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    // Private and link-local ranges, which would point this server at itself
    // or at something else inside the network.
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return { error: "That address is inside a private network, so it can't be reached from here." };
  }

  return { url: url.toString() };
}

export type PingOutcome = { ok: boolean; detail: string };

/** One attempt. Redirects are returned as-is rather than followed blindly. */
async function knock(
  url: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "PCG-Shift-Care/1.0 (export notification)",
    },
    body: JSON.stringify(body),
    signal,
    // Never automatic: a redirect is a server telling us to send this POST
    // somewhere else, and "somewhere else" is exactly what the address check
    // exists to police.
    redirect: "manual",
  });
}

/**
 * Send the nudge. Never throws: a far end that is down is their problem to
 * fix, and the office just needs to be told what happened.
 *
 * One redirect is followed, because a hosted endpoint answering 307 or 308 to
 * point at its canonical path is ordinary and refusing it just looks broken.
 * The new address is put through the same check as the one an admin typed -
 * a redirect is an untrusted instruction, and following it to a private
 * address is the request forgery the check was written to stop.
 */
export async function pingNotifyUrl(
  url: string,
  body: Record<string, unknown>,
): Promise<PingOutcome> {
  const control = new AbortController();
  // Short on purpose. This is a doorbell, not a conversation.
  const timer = setTimeout(() => control.abort(), 8000);
  try {
    let res = await knock(url, body, control.signal);

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const target = res.headers.get("location");
      if (!target) {
        return { ok: false, detail: `Their server answered ${res.status} with nowhere to go` };
      }
      // Relative redirects are resolved against the address we were given.
      const resolved = new URL(target, url).toString();
      const checked = checkNotifyUrl(resolved);
      if ("error" in checked) {
        return {
          ok: false,
          detail: `Their server redirected somewhere we will not follow (${res.status})`,
        };
      }
      res = await knock(checked.url, body, control.signal);
      return res.ok
        ? { ok: true, detail: `Delivered after a redirect (${res.status})` }
        : { ok: false, detail: `Their server answered ${res.status} after a redirect` };
    }

    return res.ok
      ? { ok: true, detail: `Delivered (${res.status})` }
      : { ok: false, detail: `Their server answered ${res.status}` };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      detail: aborted
        ? "No answer within 8 seconds"
        : "Could not reach that address",
    };
  } finally {
    clearTimeout(timer);
  }
}
