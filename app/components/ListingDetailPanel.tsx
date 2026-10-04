"use client";

// 매물 핀을 클릭했을 때 뜨는 상세 패널.
// 희망 거래 기간(1~12개월)을 고르면 그 기간 기준 확률을 다시 계산하고,
// OpenAI로 풀어 쓴 설명까지 보여준다.
// (PLAN.md 11번 작업, DESIGN.md "1.2 매물 상세" / "2.3 매물 상세(핀 클릭) 흐름")

import { useEffect, useState } from "react";

export type SelectedBuilding = {
  시군구: string;
  번지: string;
  건물명: string;
};

type DetailResult = {
  확률: number;
  추이: "상승" | "하락" | "보합";
  데이터부족여부: boolean;
  주택유형: string | null;
  단기임대여부: boolean;
};

type DistanceResult = {
  학교: { 분: number | null; 상태: "ok" | "not_found" | "없음" };
  편의점_분: number | null;
  카페_분: number | null;
};

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function ListingDetailPanel({
  building,
  onClose,
  isSaved,
  onToggleSave,
  school,
}: {
  building: SelectedBuilding;
  onClose: () => void;
  isSaved: boolean;
  onToggleSave: () => void;
  school: string;
}) {
  const [months, setMonths] = useState(6);
  const [detail, setDetail] = useState<DetailResult | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [distance, setDistance] = useState<DistanceResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    // 건물/기간이 바뀔 때마다 이전 결과를 지우고 로딩 상태로 표시한다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setExplanation(null);

    fetch("/api/listings/detail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...building, months }),
    })
      .then((res) => res.json())
      .then((data: DetailResult) => {
        if (cancelled) return;
        setDetail(data);
        return fetch("/api/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            probability: data.확률,
            trend: data.추이,
            months,
            insufficientData: data.데이터부족여부,
          }),
        });
      })
      .then((res) => res?.json())
      .then((data: { explanation?: string } | undefined) => {
        if (cancelled || !data) return;
        setExplanation(data.explanation ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [building, months]);

  // 거리 계산은 기간(months)과 무관하므로 건물·학교가 바뀔 때만 다시 불러온다
  useEffect(() => {
    let cancelled = false;
    // 건물/학교가 바뀔 때마다 이전 거리 결과를 지운다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDistance(null);

    fetch("/api/listings/distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...building, school }),
    })
      .then((res) => res.json())
      .then((data: DistanceResult) => {
        if (!cancelled) setDistance(data);
      })
      .catch(() => {
        // 거리 계산이 실패해도 확률 정보는 그대로 보여준다
      });

    return () => {
      cancelled = true;
    };
  }, [building, school]);

  return (
    <div className="absolute inset-x-2 bottom-2 z-20 max-h-[70vh] overflow-y-auto rounded-2xl border border-accent-soft bg-background p-5 text-foreground shadow-xl sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:max-h-[calc(100%-1.5rem)] sm:w-80">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            {building.건물명}
            {detail?.단기임대여부 && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-foreground">
                단기임대
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {building.시군구} {building.번지}
            {detail?.주택유형 && ` · ${detail.주택유형}`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-full p-1 text-zinc-400 hover:bg-accent-soft hover:text-zinc-600 dark:hover:text-zinc-200"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      <label className="mb-3 block text-xs text-zinc-600 dark:text-zinc-300">
        희망 거래 기간
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-accent-soft bg-background px-2.5 py-1.5 text-sm text-foreground"
        >
          {MONTH_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}개월
            </option>
          ))}
        </select>
      </label>

      {loading && !detail && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">계산 중...</p>
      )}

      {detail && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-accent-soft/60 px-4 py-3">
            <span className="text-3xl font-bold text-foreground">
              {detail.확률}%
            </span>
            <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-sm">
              추이: {detail.추이}
            </span>
          </div>
          {detail.데이터부족여부 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              ⚠ 데이터 부족, 성북구 평균 기준 추정치
            </p>
          )}
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {explanation ?? (loading ? "설명을 불러오는 중..." : "")}
          </p>
        </div>
      )}

      <div className="mt-4 space-y-1.5 rounded-xl border border-accent-soft/60 p-3 text-xs text-foreground/80">
        {school && (
          <p className="flex items-center justify-between gap-2">
            <span className="text-foreground/60">입력한 학교까지</span>
            <span className="font-medium">
              {distance?.학교.상태 === "ok" && `${distance.학교.분}분 (도보)`}
              {distance?.학교.상태 === "not_found" && "위치를 찾을 수 없음"}
              {!distance && "계산 중..."}
            </span>
          </p>
        )}
        <p className="flex items-center justify-between gap-2">
          <span className="text-foreground/60">가장 가까운 편의점</span>
          <span className="font-medium">
            {distance
              ? distance.편의점_분 != null
                ? `${distance.편의점_분}분 (도보)`
                : "1km 밖"
              : "계산 중..."}
          </span>
        </p>
        <p className="flex items-center justify-between gap-2">
          <span className="text-foreground/60">가장 가까운 카페</span>
          <span className="font-medium">
            {distance
              ? distance.카페_분 != null
                ? `${distance.카페_분}분 (도보)`
                : "1km 밖"
              : "계산 중..."}
          </span>
        </p>
      </div>

      <button
        onClick={onToggleSave}
        className={`mt-4 w-full rounded-xl px-3 py-2 text-sm font-medium transition ${
          isSaved
            ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300"
            : "bg-accent text-accent-foreground hover:opacity-90"
        }`}
      >
        {isSaved ? "★ 관심 주소에서 빼기" : "☆ 관심 주소로 저장"}
      </button>
      <p className="mt-1.5 text-center text-[11px] text-foreground/50">
        새로고침하면 사라지는 임시 저장입니다.
      </p>
    </div>
  );
}
