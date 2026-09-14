import Link from "next/link";
import SectionReveal from "../SectionReveal";

type Post = Readonly<{
  id: string;
  title: string;
  coverImage: string | null;
  createdAt: string;
}>;

type BlogSectionProps = Readonly<{
  locale: string;
  latestArticles: readonly Post[];
}>;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

export default function BlogSection({ locale, latestArticles }: BlogSectionProps) {
  const posts = latestArticles.length > 0
    ? latestArticles
    : [
      {
        id: "wizard-guide",
        title: "How to size a home solar system before advisor follow-up",
        coverImage: null,
        createdAt: new Date().toISOString(),
      },
    ];

  return (
    <SectionReveal className="border-t border-[#B7D1EA]/35 bg-[#F0EEE9] py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <h2 className="text-balance text-4xl font-bold tracking-[-0.03em] text-[#0F172A] sm:text-6xl">
          Latest SolarDream guides and updates.
        </h2>
        <div className="mt-12 divide-y divide-[#B7D1EA]/35 border-y border-[#B7D1EA]/35">
          {posts.map((post) => (
            <Link key={post.id} href={`/${locale}/news/${post.id}`} className="group flex flex-col gap-4 py-7 sm:flex-row sm:items-center sm:justify-between">
              <span className="relative w-fit text-xl font-black tracking-[-0.02em] text-[#0F172A] sm:text-2xl">
                {post.title}
                <span className="absolute -bottom-1 left-0 h-px w-0 bg-[#0369a1] transition-all duration-300 group-hover:w-full" />
              </span>
              <span className="text-sm font-bold text-[#475569]">{formatDate(post.createdAt)}</span>
            </Link>
          ))}
        </div>
      </div>
    </SectionReveal>
  );
}
