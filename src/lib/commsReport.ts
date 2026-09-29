import "server-only";
import { prisma } from "./prisma";
import { fmtInTz, tzForState } from "./timezone";

/**
 * The communication record: chats and calls over a period, as one document.
 *
 * A registered provider is asked to show how it communicated about a
 * participant or with a worker - after an incident, at an audit, or when a
 * family disputes what was agreed. This gathers it from the messages already
 * in the app rather than anyone copying screenshots into a Word file.
 */

export type CommsFilters = {
  from?: string;
  to?: string;
  /** User ids: only conversations these people were part of. */
  people?: string[];
  /** One conversation, when the report is about a single thread. */
  conversationId?: string;
  /** Free text, matched against the message body. */
  q?: string;
};

export type CommsMessage = {
  id: string;
  conversationTitle: string;
  senderName: string;
  body: string;
  attachment: boolean;
  deleted: boolean;
  at: Date;
  dateLabel: string;
  timeLabel: string;
  /** Why this line was flagged as a key point, if it was. */
  flags: string[];
};

export type CommsCall = {
  fromName: string;
  toName: string;
  at: Date;
  dateLabel: string;
  timeLabel: string;
  status: string;
  durationSec: number | null;
};

export type CommsReport = {
  rangeLabel: string;
  people: string[];
  messages: CommsMessage[];
  calls: CommsCall[];
  /** Messages per person, most talkative first. */
  perPerson: { name: string; count: number }[];
  threads: string[];
  keyPoints: CommsMessage[];
  firstAt: Date | null;
  lastAt: Date | null;
};

/**
 * What makes a message a key point.
 *
 * Deliberately a plain word list rather than anything clever: an auditor
 * needs to know exactly why a line was pulled out, and "the word medication
 * appears in it" is a reason that can be checked. Anything missed is still in
 * the full transcript underneath.
 */
const FLAGS: { label: string; words: string[] }[] = [
  {
    label: "Incident",
    words: ["incident", "injury", "injured", "fell", "fall", "hospital", "ambulance", "police", "emergency", "unsafe", "abuse", "neglect"],
  },
  {
    label: "Medication",
    words: ["medication", "medicine", "tablet", "dose", "webster", "prescription", "pharmacy"],
  },
  {
    label: "Complaint",
    words: ["complaint", "complain", "unhappy", "not happy", "refused", "refusing", "upset", "angry"],
  },
  {
    label: "Absence",
    words: ["sick", "unwell", "can't make", "cannot make", "not coming", "leave", "annual leave", "covid", "isolat"],
  },
  {
    label: "Running late",
    words: ["running late", "be late", "delayed", "traffic", "stuck"],
  },
  {
    label: "Roster change",
    words: ["roster", "reschedul", "swap", "cover", "shift change", "cancel"],
  },
  {
    label: "Pay",
    words: ["pay", "payroll", "timesheet", "invoice", "hours", "mileage"],
  },
];

function flagsFor(body: string): string[] {
  const text = body.toLowerCase();
  return FLAGS.filter((f) => f.words.some((w) => text.includes(w))).map((f) => f.label);
}

const d = (x: Date) =>
  new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(x);

export async function buildCommsReport(
  tenantId: string,
  f: CommsFilters,
  tz: string = tzForState(null),
): Promise<CommsReport> {
  const start = f.from ? new Date(`${f.from}T00:00:00`) : undefined;
  let end: Date | undefined;
  if (f.to) {
    end = new Date(`${f.to}T00:00:00`);
    end.setDate(end.getDate() + 1);
  }
  const window = start || end ? { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } : undefined;
  const people = (f.people ?? []).filter(Boolean);

  const rows = await prisma.message.findMany({
    where: {
      tenantId,
      ...(window ? { createdAt: window } : {}),
      ...(f.conversationId ? { conversationId: f.conversationId } : {}),
      ...(f.q ? { body: { contains: f.q, mode: "insensitive" as const } } : {}),
      // Every named person has to be in the conversation, so a report about
      // one worker does not sweep in the whole office noticeboard.
      ...(people.length
        ? {
            AND: people.map((id) => ({
              conversation: { members: { some: { userId: id } } },
            })),
          }
        : {}),
    },
    include: {
      sender: { select: { name: true } },
      conversation: {
        select: {
          name: true,
          type: true,
          members: { select: { user: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 5000,
  });

  const messages: CommsMessage[] = rows.map((m) => {
    const title =
      m.conversation.name ??
      (m.conversation.type === "GROUP"
        ? "Group"
        : m.conversation.members.map((x) => x.user.name).join(" and "));
    const body = m.deletedAt ? "(message deleted)" : m.body;
    return {
      id: m.id,
      conversationTitle: title,
      senderName: m.sender.name,
      body,
      attachment: !!m.attachmentUrl,
      deleted: m.deletedAt != null,
      at: m.createdAt,
      dateLabel: fmtInTz(m.createdAt, tz, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      timeLabel: fmtInTz(m.createdAt, tz, { hour: "numeric", minute: "2-digit" }),
      flags: m.deletedAt ? [] : flagsFor(body),
    };
  });

  // Calls over the same period: who rang whom and for how long. No audio is
  // recorded, so this is the record of contact, not of content.
  const callRows = await prisma.call.findMany({
    where: {
      tenantId,
      ...(window ? { createdAt: window } : {}),
      ...(people.length
        ? { OR: [{ fromUserId: { in: people } }, { toUserId: { in: people } }] }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 2000,
  });

  const calls: CommsCall[] = callRows.map((c) => ({
    fromName: c.fromName,
    toName: c.toName,
    at: c.createdAt,
    dateLabel: fmtInTz(c.createdAt, tz, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    timeLabel: fmtInTz(c.createdAt, tz, { hour: "numeric", minute: "2-digit" }),
    status: c.status,
    durationSec: c.durationSec,
  }));

  const counts = new Map<string, number>();
  for (const m of messages) counts.set(m.senderName, (counts.get(m.senderName) ?? 0) + 1);

  return {
    rangeLabel:
      start && end
        ? `${d(start)} - ${d(new Date(end.getTime() - 86_400_000))}`
        : start
          ? `From ${d(start)}`
          : end
            ? `Up to ${d(new Date(end.getTime() - 86_400_000))}`
            : "All dates",
    people: [...new Set(messages.map((m) => m.senderName))].sort(),
    messages,
    calls,
    perPerson: [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    threads: [...new Set(messages.map((m) => m.conversationTitle))].sort(),
    keyPoints: messages.filter((m) => m.flags.length > 0),
    firstAt: messages[0]?.at ?? null,
    lastAt: messages[messages.length - 1]?.at ?? null,
  };
}
