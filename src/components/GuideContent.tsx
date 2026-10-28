import { NOTES_WINDOW_H } from "@/lib/notesDue";
import { MIN_ENGAGEMENT_HOURS } from "@/lib/payroll";

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
  /** 0 = paid to the exact minute. Otherwise each shift rounds UP to a block. */
  payRoundingMin: number;
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

/** The things the terms call out as never acceptable. Same words, same weight. */
function Never({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-red-700">
        <span className="material-symbols-rounded text-[16px]">block</span>
        Never
      </p>
      <p className="text-sm text-red-900">{children}</p>
    </div>
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
          At the participant&apos;s home but it says you&apos;re too far? Phones
          read badly indoors. Step outside or towards the street and tap Start
          again.
        </p>
        <Key>
          Starting somewhere else today, like picking the participant up from
          work? The app asks why and where you are. Pick the reason, type the
          place, and it will clock you in.
        </Key>
        <p className="text-slate-500">
          Neither is a black mark. Your answer and your location are saved with
          the shift so the office can see what happened, which is what protects
          you if anyone asks later.
        </p>
        <p>
          If the app won&apos;t clock you in, call the office straight away.
          They can clock you in from their end, and every failed try is
          recorded, so there&apos;s proof you were trying.
        </p>
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
        <Never>
          Do not clock in before you arrive, clock out after you have left, or
          ask anyone else to clock in or out for you. Deliberately false time
          records are serious misconduct and may also be fraud.
        </Never>
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
          Made a mistake? Change your notes from <strong>Completed Shifts</strong>{" "}
          until your coordinator approves the shift. After that they&apos;re
          locked, because the approval was given to what you wrote.
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
        <Key>
          A shift you turn up to is never paid as less than{" "}
          <strong>{MIN_ENGAGEMENT_HOURS} hours</strong>. If the shift was
          shorter than that, or finished early, your pay is topped up to{" "}
          {MIN_ENGAGEMENT_HOURS} hours. Shifts less than 30 minutes apart count
          as one stretch of work, not two.
        </Key>
        {s.payRoundingMin > 0 && (
          <p>
            Each shift is then rounded <strong>up</strong> to the next{" "}
            {s.payRoundingMin} minutes, so you are never rounded down.
          </p>
        )}
        <p className="text-slate-500">
          Evening, night, Saturday, Sunday and public holiday rates are applied
          automatically from the day and time of the shift.
        </p>
        <p>
          Worked longer than rostered? That has its own rules, below. Do not
          simply stay clocked in.
        </p>
        <Key>
          When the office completes a pay run you get a notification, and your
          hours and pay for it appear under <strong>Menu &gt; My payroll</strong>.
        </Key>
      </Section>

      <Section icon="more_time" title="Staying past your finish time">
        <p>
          Every participant&apos;s supports are funded for a set number of hours
          on their care plan, and we hold a budget for each participant. We can
          only pay you for work done <strong>within those hours</strong>. Time
          outside them is not funded, so it cannot be claimed and cannot be paid.
        </p>
        <Key>
          Plan the shift to fit the hours. Do the things that take longest
          first, and leave yourself enough time at the end.
        </Key>
        <p className="font-semibold text-slate-900">
          If the participant asks for more time
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            It only counts if the <strong>participant, or the person who
            speaks for them, asks for it</strong>. Don&apos;t decide it yourself
            and don&apos;t promise them anything on the spot.
          </li>
          <li>
            <strong>Write it in your shift notes the same day</strong>: who
            asked, what they asked for, and how long it took.
          </li>
          <li>
            The office then checks it with the participant and against their
            plan and budget. If it is approved, the shift is extended and you
            are paid for that time at the correct rate.
          </li>
        </ul>
        <p className="font-semibold text-slate-900">
          If you cannot leave safely
        </p>
        <p>
          Sometimes you cannot leave at the rostered finish, for example when
          someone is unwell, at risk, cannot safely be left alone, or the next
          worker has not arrived.
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Stay only as long as safety requires.</li>
          <li>
            Clock out when you actually leave, and give the reason the app asks
            for.
          </li>
          <li>
            Ring the office the <strong>same day</strong> on 02 9146 6547.
          </li>
        </ol>
        <p className="text-slate-500">
          The office reviews every shift that ran over. Where the extra time was
          asked for by the participant, or was needed to keep someone safe, it
          is approved and paid. Where it was not, for example staying on to
          chat, the shift is paid to the rostered finish and we will tell you.
          If a shift regularly runs over, say so, because the roster or the care
          plan probably needs changing.
        </p>
        <Key>
          Time you are directed or required to work is always paid. If you think
          extra time should have been paid and it was not, raise it before the
          pay run closes.
        </Key>
      </Section>

      <Section icon="event_busy" title="If a shift is cancelled or cut short">
        <p>
          Always <strong>ring the office</strong> when you arrive and the
          participant is not there, is unwell, or turns you away. Don&apos;t
          simply leave.
        </p>
        <p>
          If you are <strong>full time or part time</strong> and a participant
          cancels within 7 days of the shift, PCG will either pay you for the
          rostered hours or give you make-up time. With less than 12
          hours&apos; notice, the shift is paid.
        </p>
        <p className="text-slate-500">
          Casual workers are not covered by that rule, but the office will
          always try to offer you other work.
        </p>
      </Section>

      <Section icon="directions_car" title="Mileage and transport">
        <p>
          Driving the participant somewhere? Tap <strong>Driving</strong> and
          start a trip before you set off, then <strong>End transport</strong>{" "}
          when you arrive.
        </p>
        <Key>
          Keep PCG Shift Care open on your screen for the whole trip. Your phone only
          sends its location while the app is open, so the screen stays on
          while a trip is running.
        </Key>
        <p>
          If the app does get closed or the screen locks, keep going and end the
          trip as normal. The part that wasn&apos;t tracked is worked out along
          the roads between where you were last seen and where you ended.
        </p>
        <p className="text-slate-500">
          Only trips started in the app can be paid. Forgot to start one? Tell
          the office the same day, with where you drove, so they can add it.
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
