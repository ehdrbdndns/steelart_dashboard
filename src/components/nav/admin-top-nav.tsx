"use client";

import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

function makeTitle(pathname: string) {
  if (pathname.startsWith("/admin/users")) return "사용자";
  if (pathname.startsWith("/admin/artists")) return "작가";
  if (pathname.startsWith("/admin/artworks")) return "작품";
  if (pathname.startsWith("/admin/courses")) return "코스";
  if (pathname.startsWith("/admin/home-banners")) return "홈 배너";
  return "관리자";
}

export function AdminTopNav() {
  const pathname = usePathname();

  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-6">
      <h2 className="text-xl font-semibold">{makeTitle(pathname)}</h2>
      <ThemeToggle />
    </header>
  );
}
