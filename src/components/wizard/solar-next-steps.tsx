import type { ReactNode } from "react";

type SolarNextStep = {
  title: string;
  description: string;
};

type SolarNextStepsProps = {
  title: string;
  description: string;
  steps: SolarNextStep[];
  icon?: ReactNode;
};

/** A compact, confidence-building handoff timeline for the quote CTA. */
export function SolarNextSteps({
  title,
  description,
  steps,
  icon,
}: SolarNextStepsProps) {
  return (
    <section
      data-bagui="timeline"
      aria-labelledby="solar-next-steps-title"
      className="solar-next-steps rounded-[24px] border border-[#F7F6F3] bg-[#F0EEE9] p-5 sm:p-6 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#DCE8F5] text-[#4F7FA8]">
          {icon}
        </div>
        <div className="min-w-0">
          <h3
            id="solar-next-steps-title"
            className="text-lg font-black tracking-[-0.025em] text-[#2E2C27]"
          >
            {title}
          </h3>
          <p className="mt-1 text-sm font-medium leading-6 text-[#4E4B44]">
            {description}
          </p>
        </div>
      </div>

      <ol className="mt-5 grid gap-4 md:grid-cols-3 md:gap-3">
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex gap-3 md:block">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#B7D1EA] text-xs font-black text-white md:mb-3 shadow-xs">
              {index + 1}
            </span>
            <div className="min-w-0">
              <h4 className="text-sm font-black text-[#2E2C27]">
                {step.title}
              </h4>
              <p className="mt-1 text-xs font-medium leading-5 text-[#4E4B44]">
                {step.description}
              </p>
            </div>
            {index < steps.length - 1 ? (
              <span
                className="absolute left-4 top-8 h-[calc(100%+0.75rem)] w-px bg-[#F7F6F3] md:left-[calc(100%-0.25rem)] md:top-4 md:h-px md:w-3"
                aria-hidden="true"
              />
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
