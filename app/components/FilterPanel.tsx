"use client";

// 홈 화면 지도 위에서 쓰는 조건 필터 + 가중치 조절 + 학교 입력 패널.
// 필터(지역/보증금/월세/평수/단기임대)와 가중치는 지도 핀 표시·강조에 쓰이고,
// 학교 이름은 다음 작업(16번, 거리 계산)에서 쓸 값을 미리 입력받아 둔다.
// (PLAN.md 12·15번 작업, DESIGN.md "1.1 홈 페이지 - 필터 패널")

import SchoolInput from "./SchoolInput";

export type Filters = {
  지역: string; // "전체" 또는 동 이름
  보증금최대: number | null; // 만원
  월세최대: number | null; // 만원
  평수최소: number | null;
  평수최대: number | null;
  단기임대만: boolean;
  건물유형: "전체" | "연립다세대" | "오피스텔";
};

export type Weights = {
  보증금: number;
  월세: number;
  확률: number;
};

export const DEFAULT_FILTERS: Filters = {
  지역: "전체",
  보증금최대: null,
  월세최대: null,
  평수최소: null,
  평수최대: null,
  단기임대만: false,
  건물유형: "전체",
};

export const DEFAULT_WEIGHTS: Weights = { 보증금: 1, 월세: 1, 확률: 1 };

function toNumberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export default function FilterPanel({
  regions,
  filters,
  onFiltersChange,
  weights,
  onWeightsChange,
  matchedCount,
  totalCount,
  school,
  onSchoolChange,
}: {
  regions: string[];
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  weights: Weights;
  onWeightsChange: (weights: Weights) => void;
  matchedCount: number;
  totalCount: number;
  school: string;
  onSchoolChange: (school: string) => void;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-accent-soft bg-background p-4 text-sm text-foreground shadow-md sm:p-5">
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">지역</span>
          <select
            value={filters.지역}
            onChange={(e) => onFiltersChange({ ...filters, 지역: e.target.value })}
            className="w-full rounded-lg border border-accent-soft bg-background px-2.5 py-1.5 text-foreground sm:w-36"
          >
            <option value="전체">전체</option>
            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">보증금 ≤ (만원)</span>
          <input
            type="number"
            min={0}
            placeholder="제한 없음"
            value={filters.보증금최대 ?? ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, 보증금최대: toNumberOrNull(e.target.value) })
            }
            className="w-full rounded-lg border border-accent-soft bg-background px-2.5 py-1.5 text-foreground sm:w-28"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">월세 ≤ (만원)</span>
          <input
            type="number"
            min={0}
            placeholder="제한 없음"
            value={filters.월세최대 ?? ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, 월세최대: toNumberOrNull(e.target.value) })
            }
            className="w-full rounded-lg border border-accent-soft bg-background px-2.5 py-1.5 text-foreground sm:w-24"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">평수 범위</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              placeholder="최소"
              value={filters.평수최소 ?? ""}
              onChange={(e) =>
                onFiltersChange({ ...filters, 평수최소: toNumberOrNull(e.target.value) })
              }
              className="w-full min-w-0 flex-1 rounded-lg border border-accent-soft bg-background px-2.5 py-1.5 text-foreground sm:w-16 sm:flex-none"
            />
            <span className="shrink-0 text-zinc-400">~</span>
            <input
              type="number"
              min={0}
              placeholder="최대"
              value={filters.평수최대 ?? ""}
              onChange={(e) =>
                onFiltersChange({ ...filters, 평수최대: toNumberOrNull(e.target.value) })
              }
              className="w-full min-w-0 flex-1 rounded-lg border border-accent-soft bg-background px-2.5 py-1.5 text-foreground sm:w-16 sm:flex-none"
            />
          </div>
        </label>

        <label className="flex items-center gap-1.5 self-center sm:pb-1.5">
          <input
            type="checkbox"
            checked={filters.단기임대만}
            onChange={(e) =>
              onFiltersChange({ ...filters, 단기임대만: e.target.checked })
            }
          />
          <span className="text-xs text-zinc-600 dark:text-zinc-300">단기임대만 보기</span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">건물 유형</span>
          <select
            value={filters.건물유형}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                건물유형: e.target.value as Filters["건물유형"],
              })
            }
            className="w-full rounded-lg border border-accent-soft bg-background px-2.5 py-1.5 text-foreground sm:w-36"
          >
            <option value="전체">전체</option>
            <option value="연립다세대">연립다세대만</option>
            <option value="오피스텔">오피스텔만</option>
          </select>
        </label>

        <div className="col-span-2 sm:col-span-1">
          <SchoolInput value={school} onChange={onSchoolChange} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-accent-soft/60 pt-3">
        <button
          type="button"
          onClick={() => onFiltersChange(DEFAULT_FILTERS)}
          className="rounded-full px-2.5 py-1 text-xs text-zinc-400 transition hover:bg-accent-soft hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          초기화
        </button>

        <span
          className={`rounded-full px-2.5 py-1 text-xs ${
            matchedCount === 0
              ? "bg-red-50 font-medium text-red-500 dark:bg-red-950/40"
              : "bg-accent-soft/60 text-zinc-600 dark:text-zinc-300"
          }`}
        >
          {matchedCount === 0
            ? "조건에 맞는 매물이 없습니다"
            : `조건에 맞는 매물 ${matchedCount}건 / 전체 ${totalCount}건`}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-accent-soft/60 pt-3">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          가중치 (상위 10개 핀 강조에 사용)
        </span>
        {(["보증금", "월세", "확률"] as const).map((key) => (
          <label key={key} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            {key}
            <input
              type="range"
              min={0}
              max={5}
              step={1}
              value={weights[key]}
              onChange={(e) =>
                onWeightsChange({ ...weights, [key]: Number(e.target.value) })
              }
            />
            <span className="w-4 text-center">{weights[key]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
