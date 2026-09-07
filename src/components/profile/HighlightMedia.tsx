import { cn } from "@/lib/cn";
import { PlayGlyph } from "@/components/profile/glyphs";
import { getYouTubeEmbedUrl, getYouTubeVideoId } from "@/lib/youtube";
import type { HighlightLink } from "@/lib/athlete-profile";

const frameClasses =
  "relative aspect-video overflow-hidden rounded-2xl border border-border bg-linear-to-br from-surface to-background";

type HighlightMediaProps = {
  link: HighlightLink;
  fallbackLabel: string;
  featured?: boolean;
};

/**
 * Renders one highlight slot: a real YouTube embed when the URL is
 * recognized, a polished link-out card when a URL exists but can't be
 * embedded yet, or a decorative placeholder when there's no URL at all.
 * Shared by every profile (Jordan Bell's example included) so future
 * profiles automatically get the same behavior.
 */
export function HighlightMedia({ link, fallbackLabel, featured }: HighlightMediaProps) {
  const label = link.label.trim() || fallbackLabel;
  const videoId = link.url ? getYouTubeVideoId(link.url) : null;
  const iconSize = featured ? 36 : 20;

  if (videoId) {
    return (
      <div className={frameClasses}>
        <iframe
          src={getYouTubeEmbedUrl(videoId)}
          title={label}
          loading="lazy"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
        {featured ? <FeaturedBadge /> : null}
        <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
          {label}
        </span>
      </div>
    );
  }

  if (link.url) {
    return (
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          frameClasses,
          "flex flex-col items-center justify-center gap-2 text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
        )}
      >
        <PlayGlyph size={iconSize} />
        <span className="px-4 text-center text-xs font-medium">{label}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
          Open link ↗
        </span>
        {featured ? <FeaturedBadge /> : null}
      </a>
    );
  }

  return (
    <div
      className={cn(
        frameClasses,
        "flex flex-col items-center justify-center gap-2 text-muted-foreground"
      )}
    >
      <PlayGlyph size={iconSize} />
      <span className="px-4 text-center text-xs font-medium">{label}</span>
      {featured ? <FeaturedBadge /> : null}
    </div>
  );
}

function FeaturedBadge() {
  return (
    <span className="pointer-events-none absolute left-4 top-4 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium text-[var(--athlete-accent-light)] backdrop-blur">
      Featured
    </span>
  );
}
