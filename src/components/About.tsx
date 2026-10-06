import React, { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { Observer } from "gsap/Observer";

gsap.registerPlugin(Observer);

const About: React.FC = () => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!sectionRef.current || !railRef.current) return;
    let observer: Observer | undefined;

    const ctx = gsap.context(() => {
      const rail = railRef.current!;

      const animation = gsap.to(rail, {
        xPercent: -50,
        duration: 20,
        ease: "none",
        repeat: -1,
      });

      observer = Observer.create({
        target: sectionRef.current,
        type: "wheel,touch,pointer",
        onChangeY(self) {
          let factor = 2.5;

          if (self.deltaY < 0) {
            factor *= -1;
          }

          gsap
            .timeline({
              defaults: {
                ease: "none",
              },
            })
            .to(animation, {
              timeScale: factor,
              duration: 0.2,
              overwrite: true,
            })
            .to(
              animation,
              {
                timeScale: 1,
                duration: 1,
              },
              "+=0.3",
            );
        },
      });
    }, sectionRef);

    return () => {
      observer?.kill();
      ctx.revert();
    };
  }, []);

  return (
    <section
      id="about"
      ref={sectionRef}
      className="relative w-full min-h-screen overflow-hidden flex items-center"
    >
      <div ref={railRef} className="flex w-max whitespace-nowrap">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
            <h1 className="text-8xl md:text-[12vw] font-black leading-none mr-8 text-[#fb4f1f]">
              Under maintenance !
            </h1>
          </div>
        ))}
      </div>
    </section>
  );
};

export default About;
