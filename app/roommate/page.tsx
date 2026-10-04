"use client";

// "룸메이트 찾기" 진입 페이지. 이번 사이클엔 실제 매칭 로직 없이,
// 버튼을 누르면 "준비 중입니다" 안내만 보여준다.
// (PLAN.md 18번 작업, PRD.md 5-3 "룸메이트 찾기 버튼/페이지는 제공하되,
//  실제 매칭 로직은 구현하지 않는다", DESIGN.md "1.3 룸메이트 찾기 페이지")

import { useState } from "react";
import Link from "next/link";

export default function RoommatePage() {
  const [clicked, setClicked] = useState(false);

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background font-sans text-foreground">
      <header className="sticky top-0 z-30 grid grid-cols-[auto_1fr_auto] items-center gap-3 bg-background/90 px-4 py-3 shadow-sm backdrop-blur sm:px-6 sm:py-4">
        <span aria-hidden="true" className="invisible shrink-0 rounded-full px-4 py-2 text-sm font-medium">
          ← 홈으로
        </span>
        <h1 className="min-w-0 truncate text-center text-base font-semibold text-foreground sm:text-lg">
          룸메이트 찾기
        </h1>
        <Link
          href="/"
          className="shrink-0 justify-self-end rounded-full bg-accent-soft px-4 py-2 text-sm font-medium text-foreground transition hover:opacity-80"
        >
          ← 홈으로
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-16 sm:px-6">
        <div className="w-full max-w-sm rounded-2xl border border-accent-soft bg-background p-6 text-center shadow-md sm:p-8">
          <p className="text-base text-foreground">
            단기임대 매물을 함께 구할 룸메이트를 찾고 계신가요?
          </p>

          <button
            onClick={() => setClicked(true)}
            className="mt-5 w-full rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground shadow-sm transition hover:opacity-90"
          >
            룸메이트 찾기
          </button>

          {clicked && (
            <p className="mt-4 text-sm text-foreground/70">
              준비 중입니다. 조건 입력과 실제 매칭 기능은 다음 업데이트에서 추가될 예정이에요.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
