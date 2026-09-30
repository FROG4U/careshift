/**
 * Show text, turning any web address in it into a link.
 *
 * Meeting details arrive as "Zoom" or a Google Meet URL typed into the
 * location box, and a link nobody can click is a link nobody uses. Only
 * http and https are turned into anchors - anything else stays as text, so a
 * pasted mailto: or a stray word can never become something clickable.
 */
const URL_SPLIT = /(https?:\/\/[^\s<>"']+)/g;
const IS_URL = /^https?:\/\//i;

export function Linkify({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_SPLIT);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        IS_URL.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium underline decoration-dotted underline-offset-2"
            // A long URL must not push the card wide on a phone.
            style={{ wordBreak: "break-all" }}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
