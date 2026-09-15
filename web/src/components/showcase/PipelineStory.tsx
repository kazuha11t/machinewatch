import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useReducedMotion } from 'motion/react';
import { cx } from '../ui';

gsap.registerPlugin(ScrollTrigger);

interface Step {
  tag: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    tag: 'Edge',
    title: 'ESP32 node',
    body: 'A DHT22, MPU6050 and ACS712 read temperature, vibration and motor current off the machine. A relay lets the node stop it too.',
  },
  {
    tag: 'Transport',
    title: 'MQTT broker',
    body: 'Every reading is published over MQTT: Mosquitto in production, an embedded Aedes broker for local development.',
  },
  {
    tag: 'Backend',
    title: 'Node.js + AI service',
    body: 'Express and Socket.IO store the reading in SQLite and evaluate threshold rules. A FastAPI service scores it with a per-device Isolation Forest.',
  },
  {
    tag: 'Operator',
    title: 'Dashboard',
    body: 'The health score, anomaly score and vibration forecast reach the web dashboard and the mobile app live, over WebSocket.',
  },
];

/** Horizontal-pan scrollytelling: pins the track, pans it as the user scrolls vertically. GSAP is isolated to this component only. */
export function PipelineStory() {
  const wrap = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || !wrap.current || !track.current) return;
    const ctx = gsap.context(() => {
      const distance = track.current!.scrollWidth - wrap.current!.clientWidth;
      if (distance <= 0) return;
      gsap.to(track.current, {
        x: -distance,
        ease: 'none',
        scrollTrigger: {
          trigger: wrap.current,
          start: 'top top',
          end: () => `+=${distance + window.innerHeight * 0.5}`,
          pin: true,
          scrub: 0.6,
          invalidateOnRefresh: true,
        },
      });
    }, wrap);
    return () => ctx.revert();
  }, [reducedMotion]);

  if (reducedMotion) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-20 sm:px-6">
        <SectionHead />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <StepCard key={step.title} step={step} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section ref={wrap} className="relative overflow-hidden border-y border-line bg-panel">
      <div className="mx-auto max-w-7xl px-4 pt-16 sm:px-6">
        <SectionHead />
      </div>
      <div ref={track} className="flex h-[70vh] min-h-[420px] items-center gap-6 px-4 will-change-transform sm:px-6" style={{ width: 'max-content' }}>
        {STEPS.map((step, index) => (
          <div key={step.title} className="flex items-center gap-6">
            <StepCard step={step} className="w-[min(80vw,26rem)]" />
            {index < STEPS.length - 1 && <span className="label text-2xl text-line" aria-hidden>{'>>>'}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHead() {
  return (
    <div className="border-b border-line pb-4">
      <p className="label text-[10px] text-accent">// How it works</p>
      <h2 className="font-display mt-1 text-3xl sm:text-4xl">Sensor to screen</h2>
    </div>
  );
}

function StepCard({ step, className }: { step: Step; className?: string }) {
  return (
    <div className={cx('relative shrink-0 border border-line bg-surface p-6', className)}>
      <p className="label text-[10px] text-accent">{step.tag}</p>
      <h3 className="font-display mt-2 text-2xl">{step.title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted">{step.body}</p>
    </div>
  );
}
