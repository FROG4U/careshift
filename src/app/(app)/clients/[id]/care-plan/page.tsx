import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { saveCarePlan, addGoal, toggleGoal, deleteGoal } from "./actions";

const field =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

function Section({
  name,
  label,
  hint,
  value,
  rows = 3,
}: {
  name: string;
  label: string;
  hint?: string;
  value: string | null;
  rows?: number;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {hint && <span className="ml-1 font-normal text-slate-400">— {hint}</span>}
      <textarea
        name={name}
        rows={rows}
        defaultValue={value ?? ""}
        className={field}
      />
    </label>
  );
}

export default async function CarePlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { tenant } = await requireTenant();

  const client = await prisma.client.findFirst({
    where: { id, tenantId: tenant.id },
    include: {
      carePlan: true,
      careGoals: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!client) notFound();

  const cp = client.carePlan;

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <Link
          href="/clients"
          className="text-sm font-medium text-[var(--brand)]"
        >
          ← Participants
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Care plan · {client.firstName} {client.lastName}
        </h1>
        <p className="text-sm text-slate-500">
          Goals and support information for this participant.
        </p>
      </header>

      {/* Goals */}
      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-900">Goals</h2>

        <ul className="mb-4 space-y-2">
          {client.careGoals.map((g) => (
            <li
              key={g.id}
              className="flex items-start gap-3 rounded-xl border border-slate-200 p-3"
            >
              <form action={toggleGoal}>
                <input type="hidden" name="clientId" value={client.id} />
                <input type="hidden" name="goalId" value={g.id} />
                <button
                  title={g.achieved ? "Mark as active" : "Mark achieved"}
                  className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                    g.achieved
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-slate-300 text-transparent hover:border-emerald-400"
                  }`}
                >
                  ✓
                </button>
              </form>
              <div className="flex-1">
                <div
                  className={`text-sm font-medium ${
                    g.achieved
                      ? "text-slate-400 line-through"
                      : "text-slate-800"
                  }`}
                >
                  {g.title}
                </div>
                {g.detail && (
                  <div className="text-xs text-slate-500">{g.detail}</div>
                )}
              </div>
              <form action={deleteGoal}>
                <input type="hidden" name="clientId" value={client.id} />
                <input type="hidden" name="goalId" value={g.id} />
                <button className="text-slate-300 hover:text-red-600" title="Delete goal">
                  ✕
                </button>
              </form>
            </li>
          ))}
          {client.careGoals.length === 0 && (
            <li className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
              No goals yet. Add the participant&apos;s first goal below.
            </li>
          )}
        </ul>

        <form
          action={addGoal}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="clientId" value={client.id} />
          <label className="flex-1 text-sm font-medium text-slate-700">
            New goal
            <input
              name="title"
              required
              placeholder="e.g. Build confidence using public transport"
              className={field}
            />
          </label>
          <label className="flex-1 text-sm font-medium text-slate-700">
            Detail (optional)
            <input name="detail" className={field} />
          </label>
          <button className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white">
            Add goal
          </button>
        </form>
      </section>

      {/* Support information */}
      <form
        action={saveCarePlan}
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <input type="hidden" name="clientId" value={client.id} />
        <h2 className="font-semibold text-slate-900">Support information</h2>

        <Section
          name="summary"
          label="About the participant"
          hint="overview, who they are"
          value={cp?.summary ?? null}
        />
        <Section
          name="supportNeeds"
          label="Support needs"
          hint="daily support & how to assist"
          value={cp?.supportNeeds ?? null}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Section
            name="medicalConditions"
            label="Medical conditions"
            value={cp?.medicalConditions ?? null}
          />
          <Section
            name="medications"
            label="Medications"
            value={cp?.medications ?? null}
          />
          <Section
            name="allergies"
            label="Allergies"
            rows={2}
            value={cp?.allergies ?? null}
          />
          <Section
            name="risks"
            label="Risks & management"
            value={cp?.risks ?? null}
          />
        </div>

        <Section
          name="preferences"
          label="Preferences & routines"
          hint="likes, dislikes, communication"
          value={cp?.preferences ?? null}
        />

        {/* Emergency contact */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-sm font-semibold text-slate-700">
            Emergency contact
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Name
              <input
                name="emergencyName"
                defaultValue={cp?.emergencyName ?? ""}
                className={field}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Phone
              <input
                name="emergencyPhone"
                defaultValue={cp?.emergencyPhone ?? ""}
                className={field}
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Relationship
              <input
                name="emergencyRelation"
                defaultValue={cp?.emergencyRelation ?? ""}
                className={field}
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between">
          {cp?.updatedAt && (
            <span className="text-xs text-slate-400">
              Last updated {cp.updatedAt.toLocaleDateString("en-AU")}
            </span>
          )}
          <button className="ml-auto rounded-lg bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white">
            Save care plan
          </button>
        </div>
      </form>
    </div>
  );
}
