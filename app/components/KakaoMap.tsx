"use client";

// 카카오맵 위에 성북구 매물(건물)을 핀으로 표시하는 컴포넌트.
// 핀 색은 계약 확률 수준을 나타낸다 (높을수록 진한 빨강).
// 핀을 클릭하면 ListingDetailPanel이 떠서 기간 선택·상세 확률을 보여준다.
// 위쪽 FilterPanel에서 조건을 걸면 조건에 안 맞는 핀은 지도에서 숨기고,
// 가중치 기준 상위 10개 매물은 숫자 배지가 붙은 큰 핀으로 강조해서 보여준다.
// (PLAN.md 9~13번 작업, DESIGN.md "1.1 홈 페이지 - 지도 영역")

import { useEffect, useMemo, useRef, useState } from "react";
import ListingDetailPanel, {
  type SelectedBuilding,
} from "./ListingDetailPanel";
import FilterPanel, {
  DEFAULT_FILTERS,
  DEFAULT_WEIGHTS,
  type Filters,
  type Weights,
} from "./FilterPanel";
import { rankListings } from "@/lib/scoring";
import SavedListingsPanel from "./SavedListingsPanel";

declare global {
  interface Window {
    // 카카오맵 SDK 타입 패키지를 따로 설치하지 않아서 any로 둔다
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kakao: any;
  }
}

type Listing = {
  시군구: string;
  지역: string;
  번지: string;
  건물명: string;
  위도: number;
  경도: number;
  확률: number; // 0~100
  추이: "상승" | "하락" | "보합";
  데이터부족여부: boolean;
  보증금평균: number | null;
  월세평균: number | null;
  평수: number | null;
  단기임대여부: boolean;
  주택유형: string | null;
};

// 성북구청 부근 좌표 (지도 초기 중심점)
const SEONGBUK_CENTER = { lat: 37.589692, lng: 127.016944 };

/** 계약 확률 수준에 따라 핀 색을 정한다 (높을수록 진하게). */
function colorForProbability(probability: number): string {
  if (probability >= 50) return "#dc2626"; // 빨강: 확률 높음
  if (probability >= 20) return "#f59e0b"; // 주황: 보통
  return "#3b82f6"; // 파랑: 낮음
}

/** 서버의 keyOf와 동일한 방식으로 매물 식별 키를 만든다. */
function keyOf(listing: { 시군구: string; 번지: string; 건물명: string }): string {
  return `${listing.시군구}|${listing.번지}|${listing.건물명}`;
}

/** 필터 조건에 매물이 맞는지 확인한다. */
function matchesFilters(listing: Listing, filters: Filters): boolean {
  if (filters.지역 !== "전체" && listing.지역 !== filters.지역) return false;
  if (
    filters.보증금최대 != null &&
    listing.보증금평균 != null &&
    listing.보증금평균 > filters.보증금최대
  )
    return false;
  if (
    filters.월세최대 != null &&
    listing.월세평균 != null &&
    listing.월세평균 > filters.월세최대
  )
    return false;
  if (filters.평수최소 != null && listing.평수 != null && listing.평수 < filters.평수최소)
    return false;
  if (filters.평수최대 != null && listing.평수 != null && listing.평수 > filters.평수최대)
    return false;
  if (filters.단기임대만 && !listing.단기임대여부) return false;
  if (filters.건물유형 === "연립다세대" && listing.주택유형 === "오피스텔") return false;
  if (filters.건물유형 === "오피스텔" && listing.주택유형 !== "오피스텔") return false;
  return true;
}

export default function KakaoMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // 핀 하나당 오버레이 인스턴스 + 매물 정보를 같이 들고 있어야
  // 필터가 바뀔 때마다 다시 fetch하지 않고 보이기/숨기기만 할 수 있다
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const overlaysRef = useRef<{ overlay: any; listing: Listing; content: HTMLDivElement }[]>(
    [],
  );

  const [status, setStatus] = useState<"loading" | "ready" | "error">(() =>
    process.env.NEXT_PUBLIC_KAKAO_JS_KEY ? "loading" : "error",
  );
  const [allListings, setAllListings] = useState<Listing[]>([]);
  // 매물 데이터(2천 건 이상)를 받아오는 동안 빈 지도만 보이지 않도록 로딩 상태를 따로 추적한다
  const [listingsLoading, setListingsLoading] = useState(true);
  const [selected, setSelected] = useState<SelectedBuilding | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  // 관심 주소: 메모리 상태로만 들고 있어서 새로고침하면 자동으로 사라진다 (DB 없음)
  const [savedBuildings, setSavedBuildings] = useState<SelectedBuilding[]>([]);
  // 사용자가 다니는 학교 (다음 작업인 거리 계산에서 사용할 예정, 지금은 입력만 받아둔다)
  const [school, setSchool] = useState("");

  function toggleSaved(building: SelectedBuilding) {
    setSavedBuildings((prev) => {
      const exists = prev.some((b) => keyOf(b) === keyOf(building));
      return exists
        ? prev.filter((b) => keyOf(b) !== keyOf(building))
        : [...prev, building];
    });
  }

  // 1) 지도 SDK 로드 + 지도 생성
  useEffect(() => {
    const jsKey = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!jsKey) return; // 키 없음은 위 useState 초기값에서 이미 처리함

    function initMap() {
      if (!mapContainerRef.current) return;
      const center = new window.kakao.maps.LatLng(
        SEONGBUK_CENTER.lat,
        SEONGBUK_CENTER.lng,
      );
      mapInstanceRef.current = new window.kakao.maps.Map(mapContainerRef.current, {
        center,
        level: 6, // 성북구 전체가 보이는 정도의 확대 수준
      });
      setStatus("ready");
    }

    if (window.kakao?.maps) {
      window.kakao.maps.load(initMap);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${jsKey}&autoload=false`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(initMap);
    script.onerror = () => setStatus("error");
    document.head.appendChild(script);
  }, []);

  // 2) 지도 준비되면 매물 목록을 한 번만 받아와 핀(오버레이)을 만들어둔다
  useEffect(() => {
    if (status !== "ready" || !mapInstanceRef.current) return;

    let cancelled = false;

    fetch("/api/listings")
      .then((res) => res.json())
      .then((data: { 매물: Listing[] }) => {
        if (cancelled) return;

        const created = data.매물.map((listing) => {
          const position = new window.kakao.maps.LatLng(listing.위도, listing.경도);
          const content = document.createElement("div");
          content.style.width = "14px";
          content.style.height = "14px";
          content.style.borderRadius = "9999px";
          content.style.border = "2px solid white";
          content.style.boxShadow = "0 0 2px rgba(0,0,0,0.5)";
          content.style.backgroundColor = colorForProbability(listing.확률);
          content.style.cursor = "pointer";
          content.title = `${listing.시군구} ${listing.번지} · 계약확률 ${listing.확률}% (${listing.추이})`;
          content.addEventListener("click", () => {
            setSelected({
              시군구: listing.시군구,
              번지: listing.번지,
              건물명: listing.건물명,
            });
          });

          const overlay = new window.kakao.maps.CustomOverlay({
            map: mapInstanceRef.current,
            position,
            content,
            yAnchor: 0.5,
          });

          return { overlay, listing, content };
        });

        overlaysRef.current = created;
        setAllListings(data.매물);
      })
      .catch(() => {
        // 핀을 못 불러와도 지도 자체는 계속 보여준다
      })
      .finally(() => {
        if (!cancelled) setListingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  const matchedListings = useMemo(
    () => allListings.filter((l) => matchesFilters(l, filters)),
    [allListings, filters],
  );

  // 조건에 맞는 매물끼리 가중치로 순위를 매겨, 상위 10개의 키만 모아둔다
  const top10Keys = useMemo(() => {
    const ranked = rankListings(matchedListings, weights).slice(0, 10);
    return new Map(ranked.map((listing, index) => [keyOf(listing), index + 1]));
  }, [matchedListings, weights]);

  // 3) 필터·가중치가 바뀔 때마다, 다시 불러오지 않고 핀 표시만 갱신한다
  //    - 조건에 안 맞으면 숨기고, 상위 10위 안에 들면 더 크게 + 순위 숫자를 보여준다
  useEffect(() => {
    const matchedKeySet = new Set(matchedListings.map(keyOf));

    // 카카오맵이 직접 관리하는 평범한 DOM 엘리먼트(content)라서, React 상태가 아니라
    // 여기서 style을 직접 바꿔주는 게 맞는 방식이다 (React가 추적하는 값이 아님)
    /* eslint-disable react-hooks/immutability */
    for (const { overlay, listing, content } of overlaysRef.current) {
      const key = keyOf(listing);
      const visible = matchedKeySet.has(key);
      overlay.setMap(visible ? mapInstanceRef.current : null);
      if (!visible) continue;

      const rank = top10Keys.get(key);
      if (rank) {
        content.style.width = "22px";
        content.style.height = "22px";
        content.style.display = "flex";
        content.style.alignItems = "center";
        content.style.justifyContent = "center";
        content.style.fontSize = "11px";
        content.style.fontWeight = "bold";
        content.style.color = "white";
        content.style.border = "2px solid white";
        content.style.zIndex = "10";
        content.textContent = String(rank);
      } else {
        content.style.width = "14px";
        content.style.height = "14px";
        content.style.display = "block";
        content.style.border = "2px solid white";
        content.style.zIndex = "1";
        content.textContent = "";
      }
    }
    /* eslint-enable react-hooks/immutability */
  }, [matchedListings, top10Keys]);

  const regions = useMemo(
    () => Array.from(new Set(allListings.map((l) => l.지역))).sort(),
    [allListings],
  );
  const matchedCount = matchedListings.length;

  if (status === "error") {
    return (
      <div className="flex h-[500px] w-full items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-900">
        지도를 불러오지 못했습니다. NEXT_PUBLIC_KAKAO_JS_KEY 설정을 확인해주세요.
      </div>
    );
  }

  return (
    <div>
      {allListings.length > 0 && (
        <FilterPanel
          regions={regions}
          filters={filters}
          onFiltersChange={setFilters}
          weights={weights}
          onWeightsChange={setWeights}
          matchedCount={matchedCount}
          totalCount={allListings.length}
          school={school}
          onSchoolChange={setSchool}
        />
      )}
      <div className="relative h-[70vh] min-h-[420px] w-full overflow-hidden rounded-2xl border border-accent-soft shadow-md sm:h-[600px]">
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-100 text-zinc-500 dark:bg-zinc-900">
            지도를 불러오는 중...
          </div>
        )}
        {status === "ready" && listingsLoading && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="flex items-center gap-3 rounded-2xl border border-accent-soft/60 bg-background px-5 py-3 text-sm font-medium text-foreground shadow-lg">
              <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent" />
              매물 불러오는 중...
            </div>
          </div>
        )}
        <SavedListingsPanel
          items={savedBuildings}
          onSelect={setSelected}
          onRemove={toggleSaved}
        />
        {selected && (
          <ListingDetailPanel
            building={selected}
            onClose={() => setSelected(null)}
            isSaved={savedBuildings.some((b) => keyOf(b) === keyOf(selected))}
            onToggleSave={() => toggleSaved(selected)}
            school={school}
          />
        )}
        <div ref={mapContainerRef} className="h-full w-full" />
      </div>
    </div>
  );
}
