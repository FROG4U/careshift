"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  INCIDENT_TYPES,
  INCIDENT_SEVERITIES,
  INCIDENT_SEVERITY_LABELS,
  isReportableIncident,
  type IncidentSeverity,
} from "@/lib/constants";
import { createIncident, type IncidentResult } from "@/app/my-shifts/incidents/actions";

type Option = { id: string; name: string };

/** One picked photo: the file, a thumbnail to look at, and its caption. */
type Shot = { file: File; preview: string; caption: string };

const field =
  "w-full rounded-xl border border-slate-300 px-3.5 py-3 text-base outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/15";
const label = "mb-1.5 block text-sm font-semibold text-slate-700";

/** Shrink phone photos before upload — a raw camera shot is 3–5MB. */
async function compress(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ?? file),
      "image/jpeg",
      0.75,
    );
  });
}

export function IncidentForm({
  participants,
  shifts,
}: {
  participants: Option[];
  shifts: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [type, setType] = useState("");
  // A picture and the sentence that explains it travel together. A bare
  // photograph in an incident file is evidence of very little.
  const [photos, setPhotos] = useState<Shot[]>([]);
  const [medical, setMedical] = useState(false);
  const [police, setPolice] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [state, formAction] = useActionState<IncidentResult | undefined, FormData>(
    async (prev, fd) => {
      setSubmitting(true);
      // Replace the raw files with compressed versions.
      fd.delete("photos");
      fd.delete("photoCaptions");
      for (const shot of photos) {
        const blob = await compress(shot.file);
        fd.append(
          "photos",
          new File([blob], shot.file.name.replace(/\.\w+$/, ".jpg"), {
            type: "image/jpeg",
          }),
        );
        // Appended in step with the file above, so the server can pair them
        // by position. An empty string keeps the two lists the same length.
        fd.append("photoCaptions", shot.caption.trim());
      }
      const res = await createIncident(prev, fd);
      setSubmitting(false);
      if (res.ok) router.push("/my-shifts/incidents?filed=1");
      return res;
    },
    undefined,
  );

  const addPhotos = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    setPhotos((prev) =>
      [
        ...prev,
        ...picked.map((file) => ({
          file,
          preview: URL.createObjectURL(file),
          caption: "",
        })),
      ].slice(0, 6),
    );
  };

  const removePhoto = (index: number) =>
    setPhotos((prev) => {
      // Let go of the thumbnail's memory; the browser will not do it for us.
      URL.revokeObjectURL(prev[index]?.preview ?? "");
      return prev.filter((_, j) => j !== index);
    });

  const setCaption = (index: number, caption: string) =>
    setPhotos((prev) =>
      prev.map((shot, j) => (j === index ? { ...shot, caption } : shot)),
    );

  const reportable = type ? isReportableIncident(type) : false;

  // Default the date/time box to now, in the browser's local clock.
  const nowLocal = (() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  })();

  return (
    <form action={formAction} className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className={label}>What kind of incident was it? *</label>
        <select
          name="type"
          required
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={field}
        >
          <option value="">Choose…</option>
          <optgroup label="Must be reported to the NDIS Commission">
            {INCIDENT_TYPES.filter((t) => t.reportable).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Other incidents">
            {INCIDENT_TYPES.filter((t) => !t.reportable).map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </optgroup>
        </select>

        {reportable && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
            <span className="material-symbols-rounded text-[20px] text-red-600">
              priority_high
            </span>
            <p className="text-sm text-red-700">
              <strong>This is a reportable incident.</strong> Your managers are
              notified the moment you submit, and the office must notify the
              NDIS Commission. Fill in as much as you can, and tell your
              manager directly as well.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className={label}>When did it happen? *</label>
          <input
            type="datetime-local"
            name="occurredAt"
            required
            defaultValue={nowLocal}
            className={field}
          />
        </div>

        <div>
          <label className={label}>Where did it happen?</label>
          <input
            name="location"
            placeholder="e.g. participant's kitchen, in the car"
            className={field}
          />
        </div>

        {participants.length > 0 && (
          <div>
            <label className={label}>Which participant was involved?</label>
            <select name="clientId" className={field} defaultValue="">
              <option value="">Not about a participant</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {shifts.length > 0 && (
          <div>
            <label className={label}>Was it during one of your shifts?</label>
            <select name="shiftId" className={field} defaultValue="">
              <option value="">Not during a shift</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={label}>How serious was it?</label>
          <select name="severity" defaultValue="MEDIUM" className={field}>
            {INCIDENT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {INCIDENT_SEVERITY_LABELS[s as IncidentSeverity]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className={label}>What happened? *</label>
          <textarea
            name="description"
            required
            rows={5}
            placeholder="Describe it in your own words — what led up to it, what happened, and who was there."
            className={field}
          />
        </div>

        <div>
          <label className={label}>What did you do straight away?</label>
          <textarea
            name="immediateAction"
            rows={3}
            placeholder="e.g. sat them down, checked for injury, called the office"
            className={field}
          />
        </div>

        <div>
          <label className={label}>Any injuries?</label>
          <textarea
            name="injuries"
            rows={2}
            placeholder="Describe any injury, or leave blank if none"
            className={field}
          />
        </div>

        <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="medicalTreatment"
            checked={medical}
            onChange={(e) => setMedical(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300"
          />
          Medical treatment was needed
        </label>
        {medical && (
          <textarea
            name="medicalDetail"
            rows={2}
            placeholder="Who treated them — ambulance, GP, hospital?"
            className={field}
          />
        )}

        <div>
          <label className={label}>Witnesses</label>
          <input
            name="witnesses"
            placeholder="Names of anyone who saw it"
            className={field}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="policeNotified"
            checked={police}
            onChange={(e) => setPolice(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300"
          />
          Police were called
        </label>
        {police && (
          <input
            name="policeReference"
            placeholder="Police reference number (if you have one)"
            className={field}
          />
        )}

        <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            name="familyNotified"
            className="h-5 w-5 rounded border-slate-300"
          />
          Family / guardian has been told
        </label>
      </div>

      {/* Photos */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className={label}>Photos</label>
        <p className="mb-3 text-xs text-slate-500">
          Add photos if they help show what happened (up to 6), then say what
          each one shows. Only take photos where it&apos;s appropriate and the
          participant has consented.
        </p>

        {/* Two ways in, said plainly. The phone's own sheet offers both, but
            a worker in a hurry reads buttons, not sheets - and "capture"
            opens the camera straight away. */}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 px-3 py-5 text-sm font-semibold text-slate-600">
            <span className="material-symbols-rounded text-[26px] text-[var(--brand)]">
              photo_camera
            </span>
            Take a photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => addPhotos(e.target.files)}
            />
          </label>
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 px-3 py-5 text-sm font-semibold text-slate-600">
            <span className="material-symbols-rounded text-[26px] text-[var(--brand)]">
              attach_file
            </span>
            Attach a photo
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addPhotos(e.target.files)}
            />
          </label>
        </div>

        {photos.length > 0 && (
          <ul className="mt-3 space-y-3">
            {photos.map((shot, i) => (
              <li
                key={shot.preview}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a
                      local blob: preview, never a remote image */}
                  <img
                    src={shot.preview}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-500">
                        Photo {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="text-xs font-semibold text-red-500"
                      >
                        Remove
                      </button>
                    </div>
                    <textarea
                      value={shot.caption}
                      onChange={(e) => setCaption(i, e.target.value)}
                      rows={2}
                      maxLength={300}
                      placeholder="What does this photo show? (optional)"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-[var(--brand)]"
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {state?.error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.error}
        </p>
      )}

      <button
        disabled={submitting}
        className="w-full rounded-2xl bg-[var(--brand)] px-4 py-4 text-base font-bold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
      >
        {submitting ? "Sending…" : "Submit incident report"}
      </button>

      <p className="pb-2 text-center text-xs text-slate-400">
        Once submitted this report can&apos;t be edited — the office will follow
        up with you if anything needs adding.
      </p>
    </form>
  );
}
