// 확률/추이 숫자를 OpenAI에 보내 사람이 읽기 쉬운 한국어 설명으로 바꿔주는 API
// (PLAN.md 7번 작업, PRD.md 5-1 "OpenAI는 수치를 임의로 만들지 않고 설명만" 규칙)
// 캐싱 없이 호출할 때마다 매번 새로 OpenAI에 요청한다 (DESIGN.md 2.3)

import { NextResponse } from "next/server";

type ExplainRequestBody = {
  probability: number; // 0~100
  trend: "상승" | "하락" | "보합";
  months: number; // 1~12
  insufficientData?: boolean;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<ExplainRequestBody>;
  const { probability, trend, months, insufficientData } = body;

  if (
    typeof probability !== "number" ||
    typeof months !== "number" ||
    (trend !== "상승" && trend !== "하락" && trend !== "보합")
  ) {
    return NextResponse.json(
      { error: "probability, trend, months 값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY가 설정되어 있지 않습니다." },
      { status: 500 },
    );
  }

  const dataNote = insufficientData
    ? "이 매물은 과거 거래가 적어서, 개별 매물이 아니라 성북구 전체 평균값을 기준으로 계산된 숫자다."
    : "이 매물 자체의 과거 거래 데이터를 기반으로 계산된 숫자다.";

  const prompt = `다음은 통계 모델(Kaplan-Meier, Cox 비례위험모형)로 이미 계산된 결과야. 숫자를 새로 만들거나 바꾸지 말고, 아래 숫자만 그대로 사용해서 대학생이 이해하기 쉬운 한국어 1~2문장으로 자연스럽게 설명해줘.

- 향후 ${months}개월 안에 계약될 확률: ${probability}%
- 최근 추이: ${trend}
- 참고: ${dataNote}`;

  const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    }),
  });

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text();
    return NextResponse.json(
      { error: `OpenAI 호출 실패: ${errorText}` },
      { status: 502 },
    );
  }

  const data = await openaiResponse.json();
  const explanation: string = data.choices?.[0]?.message?.content?.trim() ?? "";

  return NextResponse.json({ explanation });
}
