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

/**
 * Send the nudge. Never throws: a far end that is down is their problem to
 * fix, and the office just needs to be told what happened.
 */
export async function pingNotifyUrl(
  url: string,
  body: Record<string, unknown>,
): Promise<PingOutcome> {
  const control = new AbortController();
  // Short on purpose. This is a doorbell, not a conversation.
  const timer = setTimeout(() => control.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "PCG-Shift-Care/1.0 (export notification)",
      },
      body: JSON.stringify(body),
      signal: control.signal,
      redirect: "manual",
    });
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
