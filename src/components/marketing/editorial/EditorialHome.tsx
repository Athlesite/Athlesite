import Image from "next/image";
import Link from "next/link";
import { exampleAthlete } from "@/lib/example-athlete";
import { ProfilePreview } from "./ProfilePreview";
import { FeatureExplorer } from "./FeatureExplorer";
import { Reveal } from "./Reveal";
import s from "./home.module.css";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h15m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const questions = [
  { question: "What is an Athlesite?", answer: "A professional athlete profile that brings your story, media links, recruiting information, and social presence into one shareable digital home." },
  { question: "Do I need to know how to build a website?", answer: "No. The guided setup asks for your athlete information, story, and media. You add the content; Athlesite gives it a consistent structure." },
  { question: "Do I need to be recruited or have an NIL deal?", answer: "No. Start with where you are today. Your profile can introduce your athletic story before a recruiting conversation or business opportunity exists." },
  { question: "Are the athletes shown here Athlesite customers?", answer: "The Jordan Bell profile is a fictional demonstration. The sports photographs are licensed illustrative imagery, not customer endorsements. No recruiting outcomes are implied." },
];

export function EditorialHome() {
  return <div className={s.home}>
    <section className={s.hero} aria-labelledby="home-title">
      <div className={s.heroPhoto}>
        <Image src="/marketing/editorial/football-night.jpg" alt="Football player warming up with stadium lights in the background" fill sizes="(max-width: 700px) 100vw, 65vw" preload className={s.heroImage} />
      </div>
      <div className={`${s.wrap} ${s.heroInner}`}>
        <div className={s.heroCopy}>
          <p className={s.eyebrow}><span className={s.signal} /> Your next chapter starts here</p>
          <h1 id="home-title">Your Name.<br />Your Game.<br /><span>Your Brand.</span></h1>
          <p className={s.heroDescription}>You put in the work.<br />Give it a place to speak for itself.</p>
          <p className={s.heroSupporting}>Your story, highlights, and opportunities.<br />One professional digital home. One link.</p>
          <div className={s.actions}><Link href="/get-started" className={s.primary}>Create Your Athlesite <Arrow /></Link><a href="#for-athletes" className={s.textLink}>Explore the experience <Arrow diagonal /></a></div>
          <div className={s.heroFootnote}><span>Built for athletes.</span><span>Made to be shared.</span></div>
        </div>
        <div className={s.heroDevice}>
          <span className={s.deviceCaption}>YOUR DIGITAL HOME / EVERYWHERE</span>
          <ProfilePreview device="phone" />
          <p className={s.demoNote}>Illustrative profile · fictional sample data</p>
        </div>
      </div>
      <div className={s.heroBottom}><span>THE WORK DESERVES TO BE SEEN.</span><a href="#for-athletes">Discover Athlesite <span aria-hidden="true">↓</span></a></div>
    </section>

    <section id="for-athletes" className={`${s.section} ${s.productSection}`} aria-labelledby="product-title">
      <div className={s.wrap}>
        <Reveal className={s.sectionTop}><p className={s.eyebrow}>01 / The athlete comes first</p><span className={s.sectionAside}>ONE IDENTITY. NOT ANOTHER FEED.</span></Reveal>
        <div className={s.productGrid}>
          <Reveal className={s.productVisual}><span className={s.visualLabel}>A CLOSER LOOK</span><ProfilePreview device="laptop" /><div className={s.previewCaption}><span>Jordan Bell / Fictional example</span><span>Desktop + mobile</span></div></Reveal>
          <Reveal className={s.productCopy}>
            <h2 id="product-title">More than<br />a link.<br /><span>A first<br className={s.desktopBreak} /> impression.</span></h2>
            <p>When someone looks you up, give them the full picture. Not a scattered collection of posts, clips, and contact details.</p>
            <p>Your Athlesite puts the athlete at the center—and the important information within reach.</p>
            <Link href={exampleAthlete.routePath} className={s.textLink}>Open the example profile <Arrow diagonal /></Link>
            <small className={s.productDisclaimer}>Homepage previews illustrate the design direction. The live example shows the current product.</small>
          </Reveal>
        </div>
      </div>
    </section>

    <section id="recruiting" className={s.section} aria-labelledby="identity-title">
      <div className={s.wrap}>
        <Reveal className={s.sectionTop}><p className={s.eyebrow}>02 / Everything connects</p><span className={s.sectionAside}>STORY → VISIBILITY → CONVERSATION</span></Reveal>
        <Reveal className={s.featureHeading}><h2 id="identity-title">Your whole identity.<br /><span>One home.</span></h2><p>The player. The person. The potential.<br />Give every part of your story a place.</p></Reveal>
        <div className={s.featureGrid}>
          <Reveal className={s.editorialPhoto}><Image src="/marketing/editorial/football-team.jpg" alt="Football team lined up together on the field" fill sizes="(max-width: 800px) 100vw, 50vw" /><div className={s.photoCaption}><span>FOR THE MOMENTS THAT MATTER.</span><span>ON AND OFF THE FIELD.</span></div></Reveal>
          <Reveal><FeatureExplorer /><div className={s.featureFootnote}><span aria-hidden="true">↗</span><p>A clear introduction.<br />A better starting point for what comes next.</p></div></Reveal>
        </div>
      </div>
    </section>

    <section className={`${s.section} ${s.storySection}`} aria-labelledby="story-title">
      <div className={s.wrap}>
        <Reveal className={s.storyIntro}><p className={s.eyebrow}>03 / Built around you</p><h2 id="story-title">Same ambition.<br /><span>Your own story.</span></h2><p>You don’t need to look like every other athlete.<br />Your photos, your voice, your journey make it yours.</p></Reveal>
        <div className={s.storyGrid}>
          <Reveal className={s.storyCard}><div className={s.storyImage}><Image src="/marketing/editorial/football-detail.jpg" alt="A well-worn football helmet carried beside a grass field" fill sizes="(max-width: 700px) 100vw, 33vw" /></div><div className={s.storyCardText}><span>01 / THE WORK</span><h3>What gets you here.</h3><p>The training, discipline, and details behind your game.</p></div></Reveal>
          <Reveal className={s.storyCard}><div className={s.storyImage}><Image src="/marketing/editorial/football-night.jpg" alt="Football action under the lights" fill sizes="(max-width: 700px) 100vw, 33vw" /></div><div className={s.storyCardText}><span>02 / THE GAME</span><h3>What you bring.</h3><p>Your best moments, with the story to go with them.</p></div></Reveal>
          <Reveal className={`${s.storyCard} ${s.storyStatement}`}><span className={s.cornerArrow} aria-hidden="true">↗</span><div><span>03 / WHAT’S NEXT</span><h3>Not just<br />where<br />you play.<br /><em>Where<br />you’re going.</em></h3><p>A home for your ambition—on and beyond the field.</p></div></Reveal>
        </div>
      </div>
    </section>

    <section className={`${s.section} ${s.startSection}`} aria-labelledby="start-title"><div className={s.wrap}>
      <Reveal className={s.featureHeading}><div><p className={s.eyebrow}>04 / Make your introduction</p><h2 id="start-title">From athlete.<br /><span>To Athlesite.</span></h2></div><p>No blank canvas. No design skills needed.<br />Just a clear place to start.</p></Reveal>
      <Reveal className={s.steps}>{[
        ["01", "Start with you.", "Add your sport, athlete details, and the story you want to tell."],
        ["02", "Bring your game.", "Choose your photos and add links to the media that represents you."],
        ["03", "Put it out there.", "Review your profile, create your account, and share your Athlesite."],
      ].map(([number, title, copy]) => <div key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></div>)}</Reveal>
    </div></section>

    <section className={`${s.section} ${s.faqSection}`} aria-labelledby="faq-title"><div className={`${s.wrap} ${s.faqGrid}`}>
      <Reveal><p className={s.eyebrow}>Before you step in</p><h2 id="faq-title">Good<br /><span>questions.</span></h2></Reveal>
      <div className={s.faqList}>{questions.map(({ question, answer }) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>
    </div></section>

    <section className={s.closing} aria-labelledby="closing-title"><div className={`${s.wrap} ${s.closingInner}`}><Reveal><p className={s.eyebrow}>Your name belongs out there.</p><h2 id="closing-title">Make your<br />next move.</h2></Reveal><div><Link href="/get-started" className={s.lightButton}>Create Your Athlesite <Arrow diagonal /></Link><p>Your Name. Your Game. Your Brand.</p></div></div></section>
    <div className={`${s.wrap} ${s.credits}`}>Illustrative sports photography: <a href="https://unsplash.com/@rileyhphotos">Riley McCullough</a> and <a href="https://unsplash.com/@benhershey">Ben Hershey</a> / Unsplash. No endorsement implied.</div>
  </div>;
}
