// 지도에 찍을 매물(건물) 핀 전체 목록을 반환하는 API.
// 실제 계산은 lib/listings.ts가 담당한다 (상세 조회 API와 로직을 공유하기 위함).
// (PLAN.md 10번 작업, DESIGN.md "2.2 홈 화면(지도) 이용 흐름")

import { NextResponse } from "next/server";
import { listAllListings } from "@/lib/listings";

const DEFAULT_MONTHS = 6;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const months = Number(searchParams.get("months")) || DEFAULT_MONTHS;

  const listings = await listAllListings(months);
  return NextResponse.json({ 기준_개월: months, 매물: listings });
}
