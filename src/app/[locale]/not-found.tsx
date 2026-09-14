"use client";

import NotFoundView from "@/components/ui/NotFoundView";

export default function LocaleNotFound() {
  return <NotFoundView homeUrl="/" autoRedirectSeconds={5} />;
}
