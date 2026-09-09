import s from "./home.module.css";

const features = [
  { title: "Your story, beyond the stat line.", label: "Identity", copy: "Introduce the person behind the performance. Bring your bio, sport, position, class year, and location together in one clear profile." },
  { title: "Give your best work a home.", label: "Media", copy: "Organize links to your highlight reel, game film, and training clips. Give someone a clear place to start, instead of another link to hunt down." },
  { title: "Make the next conversation easier.", label: "Recruiting & NIL", copy: "Keep recruiting details, social links, and the business contact information you choose to share alongside your athletic story." },
];

export function FeatureExplorer() {
  return <div className={s.featureList}>{features.map((feature, index) => (
    <details className={s.featureItem} key={feature.label} name="athlesite-features" open={index === 0}>
      <summary><span className={s.featureIndex}>0{index + 1}</span><span><small>{feature.label}</small>{feature.title}</span><span className={s.expandIcon} aria-hidden="true">+</span></summary>
      <p>{feature.copy}</p>
    </details>
  ))}</div>;
}
