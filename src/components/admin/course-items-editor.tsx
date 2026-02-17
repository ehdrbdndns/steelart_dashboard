"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildQuery,
  requestJson,
  requestJsonWithMeta,
} from "@/lib/client/admin-api";

type CourseItem = {
  id: number;
  course_id: number;
  artwork_id: number;
  seq: number;
  title_ko: string;
  title_en: string;
  photo_day_url: string;
};

type ArtworkOption = {
  id: number;
  title_ko: string;
  title_en: string;
};

function SortableRow({
  item,
  onDelete,
}: {
  item: CourseItem;
  onDelete: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className="flex items-center justify-between rounded-md border bg-white px-3 py-2 dark:bg-slate-900"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <div>
          <p className="text-sm font-medium">
            {item.seq}. {item.title_ko}
          </p>
          <p className="text-xs text-muted-foreground">course_item_id: {item.id}</p>
        </div>
      </div>
      <Button type="button" size="sm" variant="destructive" onClick={() => onDelete(item.id)}>
        삭제
      </Button>
    </li>
  );
}

export function CourseItemsEditor({ courseId }: { courseId: number }) {
  const [items, setItems] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");
  const [artworks, setArtworks] = useState<ArtworkOption[]>([]);
  const [selectedArtworkId, setSelectedArtworkId] = useState("");
  const [insertSeq, setInsertSeq] = useState("");
  const sensors = useSensors(useSensor(PointerSensor));

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.seq - b.seq),
    [items],
  );

  const fetchItems = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await requestJson<CourseItem[]>(`/api/admin/courses/${courseId}/items`);
      setItems(response);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  };

  const fetchArtworks = async () => {
    try {
      const qs = buildQuery({
        query: search,
        deleted: "exclude",
        page: 1,
        size: 20,
      });
      const response = await requestJsonWithMeta<ArtworkOption[]>(
        `/api/admin/artworks?${qs}`,
      );
      setArtworks(response.data);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "작품 조회 실패");
    }
  };

  useEffect(() => {
    void fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  useEffect(() => {
    void fetchArtworks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const saveReorder = async (nextItems: CourseItem[]) => {
    setActionError("");

    try {
      await requestJson(`/api/admin/courses/${courseId}/items/reorder`, {
        method: "PATCH",
        body: JSON.stringify({
          items: nextItems.map((item, index) => ({
            id: item.id,
            seq: index + 1,
          })),
        }),
      });

      setItems(
        nextItems.map((item, index) => ({
          ...item,
          seq: index + 1,
        })),
      );
    } catch (reorderError) {
      setActionError(
        reorderError instanceof Error ? reorderError.message : "재정렬 실패",
      );
      await fetchItems();
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = sortedItems.findIndex((item) => item.id === Number(active.id));
    const newIndex = sortedItems.findIndex((item) => item.id === Number(over.id));

    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const moved = arrayMove(sortedItems, oldIndex, newIndex);
    await saveReorder(moved);
  };

  const handleAdd = async () => {
    if (!selectedArtworkId) {
      setActionError("작품을 선택하세요.");
      return;
    }

    setActionError("");

    try {
      await requestJson(`/api/admin/courses/${courseId}/items`, {
        method: "POST",
        body: JSON.stringify({
          artwork_id: Number(selectedArtworkId),
          seq: insertSeq ? Number(insertSeq) : undefined,
        }),
      });

      setSelectedArtworkId("");
      setInsertSeq("");
      await fetchItems();
    } catch (addError) {
      setActionError(addError instanceof Error ? addError.message : "추가 실패");
    }
  };

  const handleDelete = async (itemId: number) => {
    setActionError("");

    try {
      await requestJson(`/api/admin/courses/${courseId}/items/${itemId}`, {
        method: "DELETE",
      });

      await fetchItems();
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "삭제 실패");
    }
  };

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div>
        <h3 className="text-lg font-semibold">Course Items</h3>
        <p className="text-sm text-muted-foreground">
          Drag & drop으로 순서를 변경하면 기존 course_item_id를 유지한 채 seq만 업데이트됩니다.
        </p>
        <p className="text-sm text-muted-foreground">
          seq를 비워두면 마지막 순서에 추가됩니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
        <input
          className="rounded-md border px-3 py-2"
          placeholder="작품 검색"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="rounded-md border px-3 py-2"
          value={selectedArtworkId}
          onChange={(event) => setSelectedArtworkId(event.target.value)}
        >
          <option value="">작품 선택</option>
          {artworks.map((artwork) => (
            <option key={artwork.id} value={artwork.id}>
              {artwork.title_ko}
            </option>
          ))}
        </select>
        <input
          type="number"
          className="rounded-md border px-3 py-2"
          placeholder="삽입 seq(선택)"
          value={insertSeq}
          onChange={(event) => setInsertSeq(event.target.value)}
        />
        <Button type="button" onClick={() => void handleAdd()}>
          아이템 추가
        </Button>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {actionError ? <p className="text-sm text-red-500">{actionError}</p> : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">로딩 중...</p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => {
            void onDragEnd(event);
          }}
        >
          <SortableContext
            items={sortedItems.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {sortedItems.map((item) => (
                <SortableRow key={item.id} item={item} onDelete={handleDelete} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
