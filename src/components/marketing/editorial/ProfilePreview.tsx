import Image from "next/image";
import { exampleAthlete } from "@/lib/example-athlete";
import { LogoMark } from "@/components/ui/Logo";
import d from "./devices.module.css";

function StatusIcons() {
  return <svg width="38" height="12" viewBox="0 0 38 12" fill="none" aria-hidden="true">
    <path d="M1 9V7m3 2V5m3 4V3m3 6V1" stroke="currentColor" strokeWidth="1.6" />
    <path d="M15 4c2-2 5-2 7 0m-5.5 2c1-1 3-1 4 0m-2 2h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <rect x="26" y="2" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth=".8" />
    <path d="M37 4v3" stroke="currentColor" /><rect x="27.5" y="3.5" width="7" height="4" rx=".5" fill="currentColor" />
  </svg>;
}

function ProfileContent() {
  return <div className={d.profile}>
    <div className={d.profileNav}><LogoMark className={d.miniMark} /><span>ATHLETE PROFILE</span></div>
    <div className={d.cover}>
      <Image src="/marketing/editorial/football-detail.jpg" alt="" fill sizes="(max-width: 600px) 350px, 650px" />
      <span className={d.sampleTag}>FICTIONAL DEMO</span>
      <div className={d.identity}>
        <span className={d.sport}>{exampleAthlete.sport} / Class of {exampleAthlete.classYear}</span>
        <p className={d.name}>{exampleAthlete.name}</p>
        <p className={d.location}>{exampleAthlete.position} · {exampleAthlete.location}</p>
      </div>
    </div>
    <div className={d.facts}><span>{exampleAthlete.heightWeight}</span><span><i />Open to recruiting</span></div>
    <div className={d.content}>
      <div className={d.about}><span className={d.label}>BEHIND THE GAME</span><p>{exampleAthlete.bio}</p></div>
      <div className={d.media}>
        <span className={d.label}>MEDIA & HIGHLIGHTS</span>
        <div className={d.mediaCard}>
          <div className={d.thumbnail}><Image src="/marketing/editorial/football-detail.jpg" alt="" fill sizes="180px" /></div>
          <div><b>Highlight reel</b><small>Sample media placement</small></div>
          <span className={d.mediaArrow}>↗</span>
        </div>
        <div className={d.mediaLink}><span>Game film & training</span><span>↗</span></div>
      </div>
    </div>
  </div>;
}

/** One fictional profile layout, adapted to two correctly proportioned device shells. */
export function ProfilePreview({ device }: { device: "phone" | "laptop" }) {
  const phone = device === "phone";
  return <div className={phone ? d.phone : d.laptop} role="img" aria-label={`${phone ? "Phone" : "Laptop"} design preview of fictional athlete Jordan Bell's profile, with a cover photo, recruiting details, bio, and media placements.`}>
    <div aria-hidden="true" className={phone ? d.phoneHardware : d.laptopPanel}>
      {phone ? <><span className={d.volume} /><span className={d.power} /></> : <span className={d.webcam} />}
      <div className={d.screen}>
        {phone ? <div className={d.status}><span>9:41</span><i className={d.island} /><StatusIcons /></div>
          : <div className={d.browser}><span className={d.windowDots}><i /><i /><i /></span><span className={d.address}>athlesite.com/athletes/jordan-bell</span><span>↗</span></div>}
        <ProfileContent />
        {phone && <div className={d.safari}><span className={d.safariAddress}><span>ᴀA</span><span>athlesite.com</span><span>↻</span></span><i /></div>}
      </div>
    </div>
    {!phone && <div aria-hidden="true" className={d.deck}><span /></div>}
  </div>;
}
