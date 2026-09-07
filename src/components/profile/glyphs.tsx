type SocialIcon = "handle" | "camera" | "mail";

export function SocialGlyph({ icon }: { icon: SocialIcon }) {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground">
      {icon === "handle" ? (
        <AtGlyph />
      ) : icon === "camera" ? (
        <CameraGlyph size={14} />
      ) : (
        <MailGlyph />
      )}
    </span>
  );
}

export function PlayGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8.5 6.75v6.5L13.5 10 8.5 6.75z" fill="currentColor" />
    </svg>
  );
}

export function CameraGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="6" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 6l1.5-2.5h3L13 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10" cy="11.5" r="3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function AtGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M14 10v1.5a2.5 2.5 0 0 0 5 0V10a9 9 0 1 0-3.6 7.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MailGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="4.5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 5.5l7 5.5 7-5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
