export type TestimonialCardProps = Readonly<{
  quote: string;
  author: string;
  company: string;
}>;

export default function TestimonialCard({ quote, author, company }: TestimonialCardProps) {
  return (
    <article className="flex min-h-64 w-[22rem] shrink-0 flex-col justify-between rounded-2xl border border-white/75 bg-white/64 p-6 shadow-sm shadow-[#B7D1EA]/20 sm:w-[28rem]">
      <p className="text-lg font-semibold leading-8 text-[#0F172A]">“{quote}”</p>
      <div className="mt-8">
        <p className="text-sm font-black text-[#0F172A]">{author}</p>
        <p className="mt-1 text-sm font-semibold text-[#475569]">{company}</p>
      </div>
    </article>
  );
}
