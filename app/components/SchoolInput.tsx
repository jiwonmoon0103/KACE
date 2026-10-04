"use client";

// 학교 이름 입력 + 자동완성 (입력한 글자로 시작하는 학교명을 가나다순으로 최대 5개 추천).
// 입력창이 비어 있을 때 포커스하면 전체 학교 목록을 드롭다운으로 보여줘서,
// 글자를 치지 않고 목록에서 클릭만으로도 고를 수 있게 한다.
// 추천 목록에 없는 이름을 그대로 두고 포커스를 벗어나면 안내 문구를 보여준다.
// (PLAN.md 15번 작업, PRD.md 5-4 "학교 입력 시 자동완성")

import { useEffect, useMemo, useState } from "react";

const MAX_SUGGESTIONS = 5;
const MAX_FULL_LIST = 20;

export default function SchoolInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (school: string) => void;
}) {
  const [schools, setSchools] = useState<string[]>([]);
  const [inputText, setInputText] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const [showInvalidNotice, setShowInvalidNotice] = useState(false);
  // 부모가 value를 바꾸면(예: 필터 초기화) 입력창도 따라가야 하는데,
  // useEffect 대신 렌더링 중에 바로 맞춰주는 React 권장 패턴을 쓴다
  const [lastSyncedValue, setLastSyncedValue] = useState(value);
  if (value !== lastSyncedValue) {
    setLastSyncedValue(value);
    setInputText(value);
  }

  useEffect(() => {
    fetch("/api/schools")
      .then((res) => res.json())
      .then((data: { schools: string[] }) => setSchools(data.schools))
      .catch(() => {
        // 학교 목록을 못 받아와도 나머지 화면은 그대로 쓸 수 있게 둔다
      });
  }, []);

  const suggestions = useMemo(() => {
    const query = inputText.trim();
    const sorted = [...schools].sort((a, b) => a.localeCompare(b, "ko"));
    // 아직 글자를 입력하지 않았으면, 드롭다운 클릭만으로 고를 수 있도록 전체 목록을 보여준다
    if (!query) return sorted.slice(0, MAX_FULL_LIST);
    return sorted.filter((name) => name.startsWith(query)).slice(0, MAX_SUGGESTIONS);
  }, [inputText, schools]);

  function selectSchool(name: string) {
    setInputText(name);
    onChange(name);
    setShowInvalidNotice(false);
    setIsFocused(false);
  }

  function handleBlur() {
    // 드롭다운 클릭이 blur보다 먼저 처리되도록 살짝 지연
    setTimeout(() => {
      setIsFocused(false);
      const trimmed = inputText.trim();
      if (trimmed === "") {
        setShowInvalidNotice(false);
        onChange("");
        return;
      }
      const isValid = schools.includes(trimmed);
      setShowInvalidNotice(!isValid);
      onChange(isValid ? trimmed : "");
    }, 150);
  }

  return (
    <div className="relative flex w-full flex-col gap-1 sm:w-auto">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">다니는 학교</span>
      <input
        type="text"
        value={inputText}
        placeholder="학교 이름 입력"
        onChange={(e) => {
          setInputText(e.target.value);
          setShowInvalidNotice(false);
        }}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        className="w-full rounded-lg border border-accent-soft bg-background px-2.5 py-1.5 text-sm text-foreground sm:w-40"
      />
      {isFocused && suggestions.length > 0 && (
        <ul className="absolute top-full z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-accent-soft bg-background text-foreground shadow-lg sm:w-40">
          {suggestions.map((name) => (
            <li key={name}>
              <button
                type="button"
                // mousedown 시점에 input이 먼저 blur되면 클릭보다 blur 처리가
                // 앞서면서 방금 고른 값을 지워버리므로, blur 자체를 막는다
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSchool(name)}
                className="block w-full px-2 py-1 text-left text-sm hover:bg-accent-soft"
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {showInvalidNotice && (
        <p className="text-[11px] text-red-500">학교명을 정확히 입력해주세요</p>
      )}
    </div>
  );
}
