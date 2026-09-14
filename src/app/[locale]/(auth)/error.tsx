"use client";

import AuthRouteError from "@/components/auth/AuthRouteError";

export default function AuthError({ reset }: { reset: () => void }) {
  return <AuthRouteError reset={reset} />;
}
