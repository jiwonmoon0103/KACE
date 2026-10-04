"use client";

// 세션 동안(새로고침하면 사라짐) 저장해 둔 관심 주소 목록을 보여주는 패널.
// 저장소나 쿠키를 쓰지 않고, 부모 컴포넌트가 들고 있는 메모리 상태만 그대로 보여준다.
// (PLAN.md 14번 작업, DESIGN.md "1.2 매물 상세 - 관심 주소 저장")

import type { SelectedBuilding } from "./ListingDetailPanel";

export default function SavedListingsPanel({
  items,
  onSelect,
  onRemove,
}: {
  items: SelectedBuilding[];
  onSelect: (building: SelectedBuilding) => void;
  onRemove: (building: SelectedBuilding) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="absolute left-2 top-2 z-20 w-64 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-accent-soft bg-background p-3.5 text-foreground shadow-lg">
      <p className="mb-2 text-xs font-semibold text-foreground">
        ★ 관심 주소 ({items.length}) · 새로고침하면 사라짐
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {items.map((item) => (
          <li
            key={`${item.시군구}|${item.번지}|${item.건물명}`}
            className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-accent-soft"
          >
            <button
              onClick={() => onSelect(item)}
              className="flex-1 truncate text-left text-foreground"
              title={`${item.시군구} ${item.번지}`}
            >
              {item.건물명}
            </button>
            <button
              onClick={() => onRemove(item)}
              className="text-zinc-400 hover:text-red-500"
              aria-label="관심 주소에서 빼기"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
