import { NOTES_WINDOW_H } from "@/lib/notesDue";

/**
 * The worker handbook - how the app behaves and why.
 *
 * Shared between the worker app and the admin side so there is exactly one
 * copy: if an admin is asked "what does it tell them about pay?", they read
 * the same words the worker did. Two copies would drift within a month.
 *
 * The numbers are passed in from the tenant's own settings rather than
 * hardcoded, so this can't quietly go out of date when a threshold changes.
 */

export type GuideSettings = {
  geofenceFt: number;
  lateGraceMin: number;
  earlyFinishGraceMin: number;
  lateFinishGraceMin: number;
  ratingGreenAt: number;
  ratingAmberAt: number;
  lateNoticePenalty: number;
};

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border,#e5e7eb)] bg-white p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-900">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: "var(--brand)" }}
        >
          <span className="material-symbols-rounded text-[18px]">{icon}</span>
        </span>
        {title}
      </h2>
      <div className="space-y-2.5 text-sm leading-relaxed text-slate-700">
        {children}
      </div>
    </section>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">
      {children}
    </p>
  );
}

export function GuideContent({ s }: { s: GuideSettings }) {
  return (
    <div className="space-y-4">
      <Section icon="login" title="Clocking in">
        <p>
          Open the shift and tap <strong>Clock in</strong>. Your phone checks
          you&apos;re at the participant&apos;s address, within{" "}
          <strong>{s.geofenceFt} ft</strong>.
        </p>
        <p>
          If it says you&apos;re too far, it tells you how much closer to get.
          Move nearer and try again.
        </p>
        <Key>
          Already at the door and it still won&apos;t accept? Tap{" "}
          <strong>&ldquo;I&apos;m here, clock me in&rdquo;</strong>. Phones
          read badly inside brick and concrete. You&apos;ll be clocked in, and
          your distance is saved with the shift. That&apos;s normal, not a
          black mark.
        </Key>
        <p className="text-slate-500">
          Clock in when you <em>arrive</em>. Starting early doesn&apos;t earn
          extra pay, and starting late is recorded. See Pay below.
        </p>
      </Section>

      <Section icon="logout" title="Clocking out">
        <p>
          Tap <strong>Clock out</strong> when the shift is done. You can finish
          anywhere. You are never blocked by location at the end of a shift.
        </p>
        <p>
          If you finish away from the participant&apos;s home, say you dropped them
          at a day program or ended at an appointment, you&apos;ll be asked to
          pick a quick reason. That&apos;s all; it takes one tap.
        </p>
        <Key>
          Your clock-out location is always recorded. Make sure it is where you
          genuinely finished, and that it matches what the participant needed
          that day.
        </Key>
        <p>
          Coordinators can and do check. If a clock-out shows you finishing
          somewhere unexpected, the simplest way to confirm it is to ring the
          participant and ask. An accurate finish point and an honest reason
          hold up to that; a rounded-off one does not.
        </p>
        <p>
          So don&apos;t clock out early from the driveway to &ldquo;beat&rdquo;
          the location check, and don&apos;t clock out later from somewhere
          else. Clock out when you actually finish, where you actually are.
          That is what protects you.
        </p>
      </Section>

      <Section icon="edit_note" title="Shift notes">
        <p>
          Every shift needs notes. Write them at clock-out, or afterwards from{" "}
          <strong>Completed Shifts</strong>.
        </p>
        <Key>
          No notes means your coordinator <strong>cannot approve the shift</strong>,
          and a shift that isn&apos;t approved <strong>cannot go into a pay
          run</strong>. That is why it doesn&apos;t get paid.
        </Key>
        <p>
          Writing your notes is what releases the shift to payroll. You have{" "}
          {NOTES_WINDOW_H} hours after clocking out.
        </p>
        <p>
          Leave notes longer than {NOTES_WINDOW_H} hours and you{" "}
          <strong>can&apos;t start a new shift</strong> until they&apos;re
          filled in. The app will keep reminding you before it gets to that.
        </p>
      </Section>

      <Section icon="swap_horiz" title="Handover to the next worker">
        <p>
          At clock-out there&apos;s a box: <em>Pass on to the next worker</em>.
          Optional. Use it when the next person genuinely needs to know
          something.
        </p>
        <p>
          Whoever works with that participant next sees your note the moment
          they clock in, and has to tap <strong>I&apos;ve read this</strong>{" "}
          before they can carry on. Their name and the time are recorded.
        </p>
        <p className="text-slate-500">
          It goes to the next shift for that participant, not to a particular
          person, so it reaches whoever actually turns up.
        </p>
      </Section>

      <Section icon="payments" title="How your pay is worked out">
        <Key>
          Your clock-in is rounded up to your rostered start time.
        </Key>
        <p>
          Arrive a few minutes early and clock in at 8:52 for a 9am shift, and
          you&apos;re paid from 9:00. The same at the end: staying a little past
          the rostered finish is paid to the rostered finish.
        </p>
        <p>
          Start late and pay begins when you clocked in, so 9:15 is paid from
          9:15.
        </p>
        <p>
          Breaks you start in the app are deducted. Mileage is paid separately
          from your hours, at your mileage rate.
        </p>
        <p className="text-slate-500">
          Genuinely worked longer than rostered? Tell your coordinator rather
          than staying clocked in. They can adjust the shift so the extra time
          is actually paid.
        </p>
      </Section>

      <Section icon="directions_car" title="Mileage and transport">
        <p>
          Driving the participant somewhere? Start a trip in the app before you
          set off and end it when you arrive. Distance is tracked along the
          real roads.
        </p>
        <p className="text-slate-500">
          Only trips recorded in the app can be paid. A drive nobody recorded
          isn&apos;t on the shift.
        </p>
      </Section>

      <Section icon="stars" title="Your reliability rating">
        <p>
          Your rating is the share of your shifts with no attendance issues, out
          of 100.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Clocking in more than <strong>{s.lateGraceMin} min</strong> after
            the rostered start counts as a late start.
          </li>
          <li>
            Clocking out more than{" "}
            <strong>{s.earlyFinishGraceMin} min</strong> before the rostered end
            counts as an early finish.
          </li>
          <li>
            Each <em>Running late</em> notice costs{" "}
            <strong>{s.lateNoticePenalty} points</strong>, but sending one is
            still far better than simply turning up late.
          </li>
        </ul>
        <Key>
          Staying <strong>past</strong> the rostered end is never held against
          you. It&apos;s counted separately as going the extra mile.
        </Key>
        <p>
          {s.ratingGreenAt}+ is green, {s.ratingAmberAt} to {s.ratingGreenAt - 1}{" "}
          amber, below {s.ratingAmberAt} red. No completed shifts yet means you
          start at 100, so nothing is held against a new starter.
        </p>
      </Section>

      <Section icon="published_with_changes" title="Swapping a shift">
        <p>
          Can&apos;t make a shift? Open it and request a swap with another
          worker.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Swaps <strong>close 24 hours before</strong> the shift starts.
          </li>
          <li>
            You can only swap with workers already allocated to that
            participant.
          </li>
          <li>
            A coordinator has to approve it. The shift stays yours until they
            do.
          </li>
        </ul>
        <p className="text-slate-500">
          Inside 24 hours, or nobody available? Use{" "}
          <strong>Running late</strong> if you&apos;ll be delayed, or message
          your coordinator.
        </p>
      </Section>

      <Section icon="event_busy" title="Availability and time off">
        <p>
          Set the days you can&apos;t work under <strong>My availability</strong>{" "}
          so you don&apos;t get rostered then. Requests go to a coordinator to
          approve.
        </p>
        <p className="text-slate-500">
          Put leave in as far ahead as you can - once a shift is rostered and
          accepted, undoing it needs a swap.
        </p>
      </Section>

      <Section icon="report" title="Incidents">
        <p>
          Anything that hurt someone, nearly did, or that a manager needs to
          know about goes in as an incident report - the same day where you can.
        </p>
        <p className="text-slate-500">
          Report it even if you&apos;re not sure it counts. An unnecessary
          report costs nothing; a missing one is an NDIS problem.
        </p>
      </Section>

      <Section icon="notifications" title="Getting notified">
        <p>
          Install the app to your home screen and allow notifications, and
          you&apos;ll get new shifts, reminders and messages as they happen. Not
          installed means no notifications.
        </p>
      </Section>
    </div>
  );
}
