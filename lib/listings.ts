// data/processed/ 안의 여러 JSON 파일(좌표, 신뢰도, Cox 모형, 성북구 평균, 원본 거래)을
// 한 번만 읽어서 메모리에 올려두고, 매물(건물) 하나의 임의 기간(1~12개월) 계약 확률을
// 계산해주는 공통 모듈. /api/listings 와 /api/listings/detail이 함께 사용한다.
// (PLAN.md 11번 작업이 10번에서 만든 로직을 재사용하기 위해 분리)

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  type CoxModel,
  probabilityOfContract,
  districtAverageProbabilityAt,
} from "@/lib/coxProbability";

const DATA_DIR = path.join(process.cwd(), "data", "processed");

export type BuildingKey = { 시군구: string; 번지: string; 건물명: string };

export type Listing = BuildingKey & {
  위도: number;
  경도: number;
  데이터부족여부: boolean;
};

type Reliability = BuildingKey & {
  거래건수: number;
  데이터부족여부: boolean;
  확률_기준: string;
  추이: "상승" | "하락" | "보합";
};

type MonthlyRentRow = BuildingKey & {
  전용면적: number | null;
  건축년도: number | null;
  주택유형: string | null;
  계약년월: string;
  보증금: number | null;
  월세금: number | null;
  단기임대여부: boolean;
};

type DistrictAverage = {
  추이: "상승" | "하락" | "보합";
  확률곡선: { 개월: number; 확률: number }[];
};

type LoadedData = {
  geocoded: (BuildingKey & {
    위도: number | null;
    경도: number | null;
    geocode_성공: boolean;
  })[];
  reliabilityByKey: Map<string, Reliability>;
  coxModel: CoxModel;
  districtAverage: DistrictAverage;
  covariateStatsByKey: Map<
    string,
    {
      areas: number[];
      years: number[];
      housingType: string;
      deposits: number[];
      rents: number[];
      hasShortTerm: boolean;
    }
  >;
  latestYear: number;
};

export function keyOf(row: BuildingKey): string {
  return `${row.시군구}|${row.번지}|${row.건물명}`;
}

/** "서울특별시 성북구 장위동"에서 마지막 단어(동 이름)만 뽑아낸다. */
function extractDong(sigungu: string): string {
  const parts = sigungu.trim().split(/\s+/);
  return parts[parts.length - 1] ?? sigungu;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

const SQM_PER_PYEONG = 3.3058;

async function readJson<T>(filename: string): Promise<T> {
  const text = await readFile(path.join(DATA_DIR, filename), "utf-8");
  return JSON.parse(text) as T;
}

let cachedData: Promise<LoadedData> | null = null;

/** 여러 JSON 파일을 한 번만 읽어서 재사용한다 (서버 프로세스가 살아있는 동안 캐시). */
function loadData(): Promise<LoadedData> {
  if (!cachedData) {
    cachedData = (async () => {
      const [geocoded, reliability, coxModel, districtAverage, monthlyRent] =
        await Promise.all([
          readJson<LoadedData["geocoded"]>("geocoded_buildings.json"),
          readJson<Reliability[]>("listing_reliability.json"),
          readJson<CoxModel>("cox_model.json"),
          readJson<DistrictAverage>("district_average.json"),
          readJson<MonthlyRentRow[]>("monthly_rent.json"),
        ]);

      const reliabilityByKey = new Map(reliability.map((r) => [keyOf(r), r]));

      const covariateStatsByKey = new Map<
        string,
        {
          areas: number[];
          years: number[];
          housingType: string;
          deposits: number[];
          rents: number[];
          hasShortTerm: boolean;
        }
      >();
      let latestYear = 0;
      for (const r of monthlyRent) {
        const key = keyOf(r);
        const entry = covariateStatsByKey.get(key) ?? {
          areas: [],
          years: [],
          housingType: r.주택유형 ?? "다세대",
          deposits: [],
          rents: [],
          hasShortTerm: false,
        };
        if (r.전용면적 != null) entry.areas.push(r.전용면적);
        if (r.건축년도 != null) entry.years.push(r.건축년도);
        if (r.보증금 != null) entry.deposits.push(r.보증금);
        if (r.월세금 != null) entry.rents.push(r.월세금);
        if (r.단기임대여부) entry.hasShortTerm = true;
        covariateStatsByKey.set(key, entry);

        const year = Number(String(r.계약년월 ?? "").slice(0, 4));
        if (year > latestYear) latestYear = year;
      }

      return {
        geocoded,
        reliabilityByKey,
        coxModel,
        districtAverage,
        covariateStatsByKey,
        latestYear,
      };
    })();
  }
  return cachedData;
}

/** 지도에 찍을 전체 매물 목록(좌표 + 선택한 기간 기준 확률)을 반환한다. */
export async function listAllListings(months: number) {
  const data = await loadData();
  return data.geocoded
    .filter((g) => g.geocode_성공 && g.위도 != null && g.경도 != null)
    .map((g) => {
      const result = computeProbabilityFromData(data, g, months);
      const stats = data.covariateStatsByKey.get(keyOf(g));
      const areaSqm = stats ? average(stats.areas) : null;
      return {
        시군구: g.시군구,
        지역: extractDong(g.시군구),
        번지: g.번지,
        건물명: g.건물명,
        위도: g.위도 as number,
        경도: g.경도 as number,
        보증금평균: stats ? average(stats.deposits) : null,
        월세평균: stats ? average(stats.rents) : null,
        평수: areaSqm != null ? Math.round((areaSqm / SQM_PER_PYEONG) * 10) / 10 : null,
        ...result,
      };
    });
}

/** 매물 하나의 특정 기간(months) 기준 계약 확률/추이를 계산한다. */
export async function getListingProbability(key: BuildingKey, months: number) {
  const data = await loadData();
  return computeProbabilityFromData(data, key, months);
}

/** 매물 하나의 좌표를 찾는다 (거리 계산용). 못 찾으면 null. */
export async function getListingCoordinates(
  key: BuildingKey,
): Promise<{ lat: number; lng: number } | null> {
  const data = await loadData();
  const keyStr = keyOf(key);
  const g = data.geocoded.find((item) => keyOf(item) === keyStr);
  if (!g || g.위도 == null || g.경도 == null) return null;
  return { lat: g.위도, lng: g.경도 };
}

function computeProbabilityFromData(
  data: LoadedData,
  key: BuildingKey,
  months: number,
) {
  const keyStr = keyOf(key);
  const rel = data.reliabilityByKey.get(keyStr);
  const stats = data.covariateStatsByKey.get(keyStr);
  const 주택유형 = stats?.housingType ?? null;
  const 단기임대여부 = stats?.hasShortTerm ?? false;

  if (!rel || rel.데이터부족여부 || !stats || stats.areas.length === 0) {
    const probability = districtAverageProbabilityAt(
      data.districtAverage.확률곡선,
      months,
    );
    return {
      확률: Math.round(probability * 1000) / 10,
      추이: rel?.추이 ?? data.districtAverage.추이,
      데이터부족여부: true,
      주택유형,
      단기임대여부,
    };
  }

  const areaMean = stats.areas.reduce((a, b) => a + b, 0) / stats.areas.length;
  const sortedYears = [...stats.years].sort((a, b) => a - b);
  const buildingYear = sortedYears[Math.floor(sortedYears.length / 2)] ?? data.latestYear;
  const covariates = {
    전용면적: areaMean,
    건물연식: data.latestYear - buildingYear,
    주택유형_연립: stats.housingType === "연립" ? 1 : 0,
    주택유형_오피스텔: stats.housingType === "오피스텔" ? 1 : 0,
  };
  const probability = probabilityOfContract(data.coxModel, covariates, months);

  return {
    확률: Math.round(probability * 1000) / 10,
    추이: rel.추이,
    데이터부족여부: false,
    주택유형,
    단기임대여부,
  };
}
