// 매물 핀 하나를 클릭했을 때, 사용자가 고른 희망 거래 기간(1~12개월) 기준으로
// 계약 확률/추이를 다시 계산해주는 API.
// (PLAN.md 11번 작업, DESIGN.md "2.3 매물 상세(핀 클릭) 흐름")

import { NextResponse } from "next/server";
import { getListingProbability } from "@/lib/listings";

export async function POST(request: Request) {
  const body = await request.json();
  const { 시군구, 번지, 건물명, months } = body ?? {};

  if (
    typeof 시군구 !== "string" ||
    typeof 번지 !== "string" ||
    typeof 건물명 !== "string" ||
    typeof months !== "number" ||
    months < 1 ||
    months > 12
  ) {
    return NextResponse.json(
      { error: "시군구/번지/건물명/months(1~12) 값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const result = await getListingProbability({ 시군구, 번지, 건물명 }, months);
  return NextResponse.json(result);
}
