"use client";

import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";

function makeTitle(pathname: string) {
  if (pathname.startsWith("/admin/artists")) return "Artists";
  if (pathname.startsWith("/admin/artworks")) return "Artworks";
  if (pathname.startsWith("/admin/courses")) return "Courses";
  if (pathname.startsWith("/admin/home-banners")) return "Home Banners";
  return "Admin";
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
