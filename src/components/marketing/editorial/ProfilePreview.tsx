import Image from "next/image";
import { exampleAthlete } from "@/lib/example-athlete";
import { LogoMark } from "@/components/ui/Logo";
import s from "./home.module.css";

/** Marketing illustration, not a second profile implementation or live athlete. */
export function ProfilePreview({ device }: { device: "phone" | "laptop" }) {
  return (
    <div className={device === "phone" ? s.phone : s.laptop} aria-hidden="true">
      {device === "phone" && <><span className={s.volume} /><span className={s.power} /></>}
      <div className={s.deviceScreen}>
        <div className={s.deviceBar}>
          {device === "phone" ? <><span>9:41</span><i className={s.island} /><span>▰</span></> : <><span className={s.windowDots}>● ● ●</span><span>athlesite.com/athletes/jordan-bell</span><span>↗</span></>}
        </div>
        <div className={s.profile}>
          <div className={s.profileNav}><LogoMark className={s.miniMark} /><span>EXAMPLE PROFILE</span></div>
          <div className={s.profileCover}>
            <Image src="/marketing/editorial/football-detail.jpg" alt="" fill sizes={device === "phone" ? "260px" : "700px"} className={s.coverImage} />
            <span className={s.sampleTag}>FICTIONAL DEMO</span>
          </div>
          <div className={s.profileBody}>
            <span className={s.profileSport}>{exampleAthlete.sport} / Class of {exampleAthlete.classYear}</span>
            <p className={s.profileName}>{exampleAthlete.name}</p>
            <p className={s.profileLocation}>{exampleAthlete.position} · {exampleAthlete.location}</p>
            <div className={s.profileFacts}><span>{exampleAthlete.heightWeight}</span><span>Open to recruiting</span></div>
            <div className={s.profileBio}><span>THE ATHLETE</span><p>{exampleAthlete.bio}</p></div>
            <div className={s.previewLinks}><span>01 <b>Highlight reel</b> ↗</span><span>02 <b>Game film</b> ↗</span><span>03 <b>Training clips</b> ↗</span></div>
          </div>
        </div>
        {device === "phone" && <div className={s.phoneBottom}><span>athlesite.com</span><i /></div>}
      </div>
      {device === "laptop" && <div className={s.laptopBase} />}
    </div>
  );
}
