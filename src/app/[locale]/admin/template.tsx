import type { ReactNode } from "react";

export default function AdminTemplate({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-none flex-col p-4 sm:p-6 lg:p-8">
      {children}
    </div>
  );
}
