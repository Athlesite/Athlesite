import { Container } from "@/components/ui/Container";
import { SocialGlyph, CameraGlyph } from "@/components/profile/glyphs";
import { clampHeroZoom, type AthleteProfileView } from "@/lib/athlete-profile";

type FocalPoint = { x: number; y: number };

const DEFAULT_PHOTO_POSITION: FocalPoint = { x: 0.5, y: 0 };

type ProfileHeroProps = {
  athlete: AthleteProfileView;
  /** Optional real photo URL (e.g. a temporary local preview). Falls back to the abstract placeholder when absent. */
  photoUrl?: string;
  /**
   * Normalized (0-1) focal point for the hero photo, converted to
   * `object-position: x% y%` here. Defaults to top-center — athletes are
   * more likely to stay in frame when the photo is cut from the bottom
   * rather than the center. Kept as plain data (not a CSS string) so it can
   * be persisted and later driven by an athlete-controlled focal-point
   * control without this component's structure changing.
   */
  photoPosition?: FocalPoint;
  /** Zoom multiplier (see clampHeroZoom). Defaults to 1 (no zoom) when omitted. */
  photoZoom?: number;
};

export function ProfileHero({ athlete, photoUrl, photoPosition, photoZoom }: ProfileHeroProps) {
  const position = photoPosition ?? DEFAULT_PHOTO_POSITION;
  const zoom = clampHeroZoom(photoZoom ?? 1);
  const focalPointPercent = `${position.x * 100}% ${position.y * 100}%`;

  return (
    <section className="border-b border-border">
      <div className="relative h-[26rem] w-full overflow-hidden sm:h-[32rem]">
        {photoUrl ? (
          // Temporary local preview (e.g. blob: URL) — not eligible for next/image optimization.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              objectPosition: focalPointPercent,
              // Anchor the zoom at the same focal point used for the crop so
              // scaling grows from the chosen point instead of the image's
              // default center, keeping the athlete in frame while zooming.
              transformOrigin: focalPointPercent,
              transform: `scale(${zoom})`,
            }}
          />
        ) : (
          <>
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-linear-to-br from-[var(--athlete-media-from)] via-surface to-background"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 [background-image:linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] [background-size:56px_56px] opacity-20"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground/50"
            >
              <CameraGlyph size={36} />
              <span className="text-xs font-medium uppercase tracking-[0.2em]">
                Athlete Photo
              </span>
            </div>
          </>
        )}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-background via-background/85 to-transparent"
        />
        <Container className="absolute inset-x-0 bottom-0 pb-8 sm:pb-10">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-6xl md:text-7xl">
            {athlete.name}
          </h1>
          <p className="mt-3 text-lg text-[var(--athlete-accent-light)] sm:text-xl">
            {athlete.sport} · {athlete.position}
          </p>
          <p className="mt-1 text-base text-muted-foreground">
            Class of {athlete.classYear} · {athlete.location}
          </p>
        </Container>
      </div>

      <Container className="flex flex-wrap items-center justify-between gap-4 py-5">
        {athlete.heightWeight ? (
          <p className="text-sm text-muted-foreground">{athlete.heightWeight}</p>
        ) : (
          <span />
        )}
        <div aria-hidden="true" className="flex items-center gap-2">
          <SocialGlyph icon="handle" />
          <SocialGlyph icon="camera" />
          <SocialGlyph icon="mail" />
        </div>
        <p className="sr-only">Social and contact links (sample placeholders).</p>
      </Container>
    </section>
  );
}
