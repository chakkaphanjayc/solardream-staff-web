import TestimonialCard, { type TestimonialCardProps } from "../TestimonialCard";
import SectionReveal from "../SectionReveal";

const testimonials: readonly TestimonialCardProps[] = [
  {
    quote: "The wizard made the first conversation much easier. I understood system size, savings, and the next step before speaking with an advisor.",
    author: "Homeowner",
    company: "Chiang Mai consultation",
  },
  {
    quote: "The quotation handoff is cleaner now. Leads, ERPNext references, signing links, and follow-up context sit in one flow.",
    author: "SolarDream staff",
    company: "Operations console",
  },
  {
    quote: "Seeing live weather output makes solar feel real, not abstract. It turns sunlight into a number people can act on.",
    author: "Advisor",
    company: "Residential solar planning",
  },
];

const sliderItems = [...testimonials, ...testimonials];

export default function TestimonialsSection() {
  return (
    <SectionReveal className="overflow-hidden bg-[#F0EEE9] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-3xl">
          <h2 className="text-balance text-4xl font-bold tracking-[-0.03em] text-[#0F172A] sm:text-6xl">
            Built around the way Thai homeowners actually decide.
          </h2>
        </div>
      </div>
      <div className="mt-12 overflow-hidden">
        <div className="agency-marquee flex w-max gap-5 px-5">
          {sliderItems.map((testimonial, index) => (
            <TestimonialCard key={`${testimonial.author}-${index}`} {...testimonial} />
          ))}
        </div>
      </div>
    </SectionReveal>
  );
}
