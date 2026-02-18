"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageTitle } from "@/components/admin/page-title";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { Button } from "@/components/ui/button";
import {
  buildQuery,
  requestJson,
  requestJsonWithMeta,
} from "@/lib/client/admin-api";

type User = {
  id: number;
  nickname: string;
  residency: "POHANG" | "NON_POHANG";
  age_group: "TEEN" | "20S" | "30S" | "40S" | "50S" | "60S" | "70_PLUS";
  language: "ko" | "en";
  notifications_enabled: number;
  created_at: string;
};

type UserSummary = {
  totalUsers: number;
  joinedToday: number;
  joinedLast7Days: number;
  joinedLast30Days: number;
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR");
}

export default function UsersPage() {
  const [items, setItems] = useState<User[]>([]);
  const [summary, setSummary] = useState<UserSummary>({
    totalUsers: 0,
    joinedToday: 0,
    joinedLast7Days: 0,
    joinedLast30Days: 0,
  });
  const [query, setQuery] = useState("");
  const [residency, setResidency] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [language, setLanguage] = useState("");
  const [page, setPage] = useState(1);
  const [size] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [totalPages, setTotalPages] = useState(1);

  const queryString = useMemo(
    () =>
      buildQuery({
        query,
        residency,
        ageGroup,
        language,
        page,
        size,
      }),
    [ageGroup, language, page, query, residency, size],
  );

  const fetchSummary = async () => {
    try {
      const response = await requestJson<UserSummary>("/api/admin/users/summary");
      setSummary(response);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "요약 조회 실패");
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await requestJsonWithMeta<User[]>(`/api/admin/users?${queryString}`);
      setItems(response.data);
      setTotalPages(response.meta?.totalPages ?? 1);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSummary();
  }, []);

  useEffect(() => {
    void fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  return (
    <div>
      <PageTitle title="Users" description="가입 사용자 현황과 목록을 조회합니다." />

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">총 가입자</p>
          <p className="text-2xl font-semibold">{summary.totalUsers}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">오늘 가입</p>
          <p className="text-2xl font-semibold">{summary.joinedToday}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">최근 7일 가입</p>
          <p className="text-2xl font-semibold">{summary.joinedLast7Days}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">최근 30일 가입</p>
          <p className="text-2xl font-semibold">{summary.joinedLast30Days}</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-6">
        <input
          value={query}
          onChange={(event) => {
            setPage(1);
            setQuery(event.target.value);
          }}
          className="rounded-md border px-3 py-2"
          placeholder="닉네임 검색"
        />
        <select
          value={residency}
          onChange={(event) => {
            setPage(1);
            setResidency(event.target.value);
          }}
          className="rounded-md border px-3 py-2"
        >
          <option value="">residency 전체</option>
          <option value="POHANG">POHANG</option>
          <option value="NON_POHANG">NON_POHANG</option>
        </select>
        <select
          value={ageGroup}
          onChange={(event) => {
            setPage(1);
            setAgeGroup(event.target.value);
          }}
          className="rounded-md border px-3 py-2"
        >
          <option value="">age_group 전체</option>
          <option value="TEEN">TEEN</option>
          <option value="20S">20S</option>
          <option value="30S">30S</option>
          <option value="40S">40S</option>
          <option value="50S">50S</option>
          <option value="60S">60S</option>
          <option value="70_PLUS">70_PLUS</option>
        </select>
        <select
          value={language}
          onChange={(event) => {
            setPage(1);
            setLanguage(event.target.value);
          }}
          className="rounded-md border px-3 py-2"
        >
          <option value="">language 전체</option>
          <option value="ko">ko</option>
          <option value="en">en</option>
        </select>
        <Button type="button" variant="outline" onClick={() => void fetchUsers()}>
          조회
        </Button>
      </div>

      {error ? <p className="mb-4 text-sm text-red-500">{error}</p> : null}

      <div className="overflow-hidden rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">nickname</th>
              <th className="px-3 py-2 text-left">residency</th>
              <th className="px-3 py-2 text-left">age_group</th>
              <th className="px-3 py-2 text-left">language</th>
              <th className="px-3 py-2 text-left">noti</th>
              <th className="px-3 py-2 text-left">joined_at</th>
              <th className="px-3 py-2 text-left">actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  로딩 중...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              items.map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="px-3 py-2">{user.id}</td>
                  <td className="px-3 py-2">{user.nickname}</td>
                  <td className="px-3 py-2">{user.residency}</td>
                  <td className="px-3 py-2">{user.age_group}</td>
                  <td className="px-3 py-2">{user.language}</td>
                  <td className="px-3 py-2">{user.notifications_enabled ? "Y" : "N"}</td>
                  <td className="px-3 py-2">{formatDateTime(user.created_at)}</td>
                  <td className="px-3 py-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/users/${user.id}`}>상세</Link>
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}
