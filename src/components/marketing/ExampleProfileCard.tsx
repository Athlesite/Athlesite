import Link from "next/link";
import { exampleAthlete } from "@/lib/example-athlete";
import { ExampleBadge } from "@/components/profile/ExampleBadge";
import { SocialGlyph, PlayGlyph } from "@/components/profile/glyphs";

const recruitingFields = [
  { label: "Position", value: exampleAthlete.positionAbbr },
  { label: "Class", value: exampleAthlete.classYear },
  { label: "Location", value: exampleAthlete.location },
];

export function ExampleProfileCard() {
  return (
    <div>
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-2xl border border-border bg-background"
      >
        <div className="flex items-center gap-2 border-b border-border bg-surface/60 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="ml-3 truncate rounded-full bg-surface px-3 py-1 font-mono text-xs text-muted-foreground">
            {exampleAthlete.displayUrl}
          </span>
          <ExampleBadge className="ml-auto shrink-0" />
        </div>

        <div className="p-6 sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="h-24 w-24 shrink-0 rounded-2xl border border-border bg-linear-to-br from-accent/40 via-accent/10 to-transparent" />
            <div className="flex-1">
              <h3 className="text-2xl font-semibold text-foreground">{exampleAthlete.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {exampleAthlete.position} · Class of {exampleAthlete.classYear} ·{" "}
                {exampleAthlete.location}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{exampleAthlete.heightWeight}</p>
              <div className="mt-4 flex items-center gap-2">
                <SocialGlyph icon="handle" />
                <SocialGlyph icon="camera" />
                <SocialGlyph icon="mail" />
              </div>
            </div>
          </div>

          <div className="mt-8 border-t border-border pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-accent-light">About</p>
            <p className="mt-2 text-sm text-muted-foreground">{exampleAthlete.bio}</p>
          </div>

          <div className="mt-8 border-t border-border pt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-accent-light">
              Highlights
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {exampleAthlete.highlights.map((label) => (
                <div
                  key={label}
                  className="flex aspect-video flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface"
                >
                  <PlayGlyph size={18} />
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-accent-light">
                Recruiting
              </p>
              <dl className="mt-3 space-y-1.5 text-sm">
                {recruitingFields.map((field) => (
                  <div key={field.label} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{field.label}</dt>
                    <dd className="text-foreground">{field.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-accent-light">
                NIL &amp; Business
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Contact for NIL and business inquiries.
              </p>
            </div>
          </div>
        </div>
      </div>

      <p className="sr-only">
        Illustration of an example Athlesite athlete profile, showing identity details, an
        about section, highlight media, recruiting information, and NIL and business
        contact details. Shown with fictional sample data.
      </p>
      <div className="mt-4 flex flex-col items-center gap-2 text-center">
        <p className="text-xs text-muted-foreground">
          Example Athlesite shown with fictional sample information for illustration only.
        </p>
        <Link
          href={exampleAthlete.routePath}
          className="text-sm font-medium text-accent-light underline-offset-4 hover:underline"
        >
          View the full example profile →
        </Link>
      </div>
    </div>
  );
}
