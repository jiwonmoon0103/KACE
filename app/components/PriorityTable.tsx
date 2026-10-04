"use client";

// 조건별 가중치로 점수를 매긴 상위 10개 매물을 표로 보여주는 우선순위 표.
// 지도 위 핀에 붙는 순위 숫자 배지와 같은 순서를 공유한다.
// (PLAN.md 7·8번 작업, PRD.md 5-2 "사용자 설정 기준 기반 우선순위 표")

import type { SelectedBuilding } from "./ListingDetailPanel";

export type DistanceEntry =
  | { 분: number | null; 상태: "ok" | "not_found" | "없음" }
  | "loading"
  | "error";

type PriorityListing = {
  시군구: string;
  번지: string;
  건물명: string;
  보증금평균: number | null;
  월세평균: number | null;
  평수: number | null;
  확률: number;
};

function keyOf(l: SelectedBuilding): string {
  return `${l.시군구}|${l.번지}|${l.건물명}`;
}

export default function PriorityTable({
  listings,
  distances,
  school,
  onSelect,
}: {
  listings: PriorityListing[];
  distances: Map<string, DistanceEntry>;
  school: string;
  onSelect: (building: SelectedBuilding) => void;
}) {
  if (listings.length === 0) return null;

  const distanceLabel = school ? "학교까지" : "편의점까지";

  function renderDistance(listing: PriorityListing) {
    const entry = distances.get(keyOf(listing));
    if (!entry) return "-";
    if (entry === "loading") return "계산 중...";
    if (entry === "error") return "오류";
    if (entry.상태 === "not_found") return "위치 못 찾음";
    if (entry.분 == null) return "1km 밖";
    return `${entry.분}분`;
  }

  return (
    <div className="mt-4 rounded-2xl border border-accent-soft bg-background p-4 shadow-md sm:p-5">
      <p className="mb-3 text-sm font-semibold text-foreground">
        우선순위 표 (가중치 기준 상위 {listings.length}개)
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-accent-soft text-zinc-500 dark:text-zinc-400">
              <th className="py-2 pr-3 font-medium">순위</th>
              <th className="py-2 pr-3 font-medium">주소</th>
              <th className="py-2 pr-3 font-medium">보증금</th>
              <th className="py-2 pr-3 font-medium">월세</th>
              <th className="py-2 pr-3 font-medium">평수</th>
              <th className="py-2 pr-3 font-medium">확률</th>
              <th className="py-2 pr-3 font-medium">{distanceLabel}</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((listing, index) => (
              <tr
                key={keyOf(listing)}
                onClick={() => onSelect(listing)}
                className="cursor-pointer border-b border-accent-soft/60 last:border-0 hover:bg-accent-soft/60"
              >
                <td className="py-2 pr-3 font-semibold text-foreground">{index + 1}</td>
                <td className="py-2 pr-3 text-foreground">
                  {listing.건물명}
                  <span className="block text-[11px] text-zinc-500 dark:text-zinc-400">
                    {listing.시군구} {listing.번지}
                  </span>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-foreground">
                  {listing.보증금평균 != null ? `${listing.보증금평균}만원` : "-"}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-foreground">
                  {listing.월세평균 != null ? `${listing.월세평균}만원` : "-"}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-foreground">
                  {listing.평수 != null ? `${listing.평수}평` : "-"}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-foreground">{listing.확률}%</td>
                <td className="py-2 pr-3 whitespace-nowrap text-foreground">
                  {renderDistance(listing)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
