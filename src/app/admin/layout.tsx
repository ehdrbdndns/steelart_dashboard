import { AdminSideNav, AdminTopNav } from "@/components/nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <AdminSideNav />
      <div className="flex flex-1 flex-col">
        <AdminTopNav />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
