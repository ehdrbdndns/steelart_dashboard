"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminNavigations } from "@/config/site";
import { confirmAction } from "@/lib/client/confirm-action";
import { cn } from "@/lib/utils";

export function AdminSideNav() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-slate-50/80 p-4 dark:bg-slate-900/40">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">SteelArt Admin</h1>
        <p className="text-sm text-muted-foreground">콘텐츠 백오피스</p>
      </div>
      <nav className="flex flex-col gap-1">
        {adminNavigations.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                pathname === item.href
                  ? "bg-slate-200 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
              )}
            >
              <Icon size={16} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <Button
        className="mt-8 w-full"
        variant="outline"
        onClick={() => {
          if (!confirmAction("로그아웃하시겠습니까?")) {
            return;
          }

          void signOut({ callbackUrl: "/admin/login" });
        }}
      >
        <LogOut size={16} />
        로그아웃
      </Button>
    </aside>
  );
}
