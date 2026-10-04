// 학교 자동완성에 쓸 전체 학교 이름 목록을 내려주는 API.
// 목록은 data/schools.json에 고정되어 있다 (주요 4년제 대학 기준,
// 공공데이터 연동은 이후 필요하면 추가하기로 한다).
// (PLAN.md 15번 작업, PRD.md 5-4 "학교 입력 시 자동완성")

import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export async function GET() {
  const text = await readFile(
    path.join(process.cwd(), "data", "schools.json"),
    "utf-8",
  );
  const schools: string[] = JSON.parse(text);
  return NextResponse.json({ schools: [...schools].sort((a, b) => a.localeCompare(b, "ko")) });
}
