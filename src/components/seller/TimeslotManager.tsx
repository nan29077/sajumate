"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, ToggleLeft, ToggleRight, Calendar, List, X } from "lucide-react";

interface TimeSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  reservationId: string | null;
  reservation?: { id: string; customerName: string; status: string } | null;
}

interface DateMap {
  [date: string]: { total: number; available: number };
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
  NO_SHOW: "bg-red-100 text-red-600",
};
const STATUS_LABELS: Record<string, string> = {
  PENDING: "대기",
  CONFIRMED: "확정",
  COMPLETED: "완료",
  CANCELLED: "취소",
  NO_SHOW: "노쇼",
};

export default function TimeslotManager({
  consultantId,
  sellerName,
}: {
  consultantId: string;
  sellerName: string;
}) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dateMap, setDateMap] = useState<DateMap>({});
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);

  // 월별 슬롯 현황 로드
  const loadMonthData = useCallback(async () => {
    const res = await fetch(
      `/api/timeslots?consultantId=${consultantId}&month=${currentYear}-${String(currentMonth).padStart(2, "0")}&all=true`
    );
    if (res.ok) {
      const data = await res.json();
      setDateMap(data.dateMap || {});
    }
  }, [consultantId, currentYear, currentMonth]);

  // 선택된 날짜의 슬롯 로드
  const loadDaySlots = useCallback(async (date: string) => {
    setLoading(true);
    const res = await fetch(`/api/timeslots?consultantId=${consultantId}&date=${date}&all=true`);
    if (res.ok) {
      const data = await res.json();
      setSlots(data.slots || []);
    }
    setLoading(false);
  }, [consultantId]);

  useEffect(() => {
    loadMonthData();
  }, [loadMonthData]);

  useEffect(() => {
    if (selectedDate) loadDaySlots(selectedDate);
  }, [selectedDate, loadDaySlots]);

  const handlePrevMonth = () => {
    if (currentMonth === 1) { setCurrentYear(y => y - 1); setCurrentMonth(12); }
    else setCurrentMonth(m => m - 1);
    setSelectedDate(null);
  };
  const handleNextMonth = () => {
    if (currentMonth === 12) { setCurrentYear(y => y + 1); setCurrentMonth(1); }
    else setCurrentMonth(m => m + 1);
    setSelectedDate(null);
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm("이 시간을 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/timeslots/${slotId}`, { method: "DELETE" });
    if (res.ok) {
      setSlots(prev => prev.filter(s => s.id !== slotId));
      loadMonthData();
    } else {
      const data = await res.json();
      alert(data.error || "삭제에 실패했습니다.");
    }
  };

  const handleToggleSlot = async (slot: TimeSlot) => {
    const res = await fetch(`/api/timeslots/${slot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isAvailable: !slot.isAvailable }),
    });
    if (res.ok) {
      setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, isAvailable: !s.isAvailable } : s));
      loadMonthData();
    } else {
      const data = await res.json();
      alert(data.error || "수정에 실패했습니다.");
    }
  };

  // 달력 날짜 계산
  const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const calendarCells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-gray-900">예약 시간 설정</h1>
        <button
          onClick={() => setShowBulkModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
        >
          <Plus size={15} />
          일괄 생성
        </button>
      </div>

      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={handlePrevMonth} className="p-1.5 rounded hover:bg-gray-100">
          <ChevronLeft size={20} />
        </button>
        <span className="font-semibold text-gray-800">
          {currentYear}년 {currentMonth}월
        </span>
        <button onClick={handleNextMonth} className="p-1.5 rounded hover:bg-gray-100">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 달력 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className={`text-center text-xs font-medium py-2 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"}`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {calendarCells.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} className="h-14 border-r border-b border-gray-100 last:border-r-0" />;
            const dateStr = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const info = dateMap[dateStr];
            const isSelected = selectedDate === dateStr;
            const isToday = dateStr === today.toISOString().slice(0, 10);
            const dow = (firstDay + (day - 1)) % 7;

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`h-14 border-r border-b border-gray-100 last:border-r-0 flex flex-col items-center justify-center gap-0.5 transition-colors
                  ${isSelected ? "bg-indigo-50 ring-2 ring-inset ring-indigo-400" : "hover:bg-gray-50"}
                  ${isToday ? "font-bold" : ""}
                `}
              >
                <span className={`text-sm ${dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-gray-700"}`}>
                  {day}
                </span>
                {info && (
                  <span className={`text-[10px] px-1 rounded-full ${info.available > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                    {info.available}/{info.total}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 선택 날짜 예약 가능 시간 목록 */}
      {selectedDate && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">
              {selectedDate} 예약 가능 시간
            </h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700"
            >
              <Plus size={13} /> 시간 추가
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">로딩 중...</div>
          ) : slots.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">이 날짜에 예약 가능한 시간이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {slots.map((slot) => (
                <div
                  key={slot.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    slot.reservationId
                      ? "border-blue-200 bg-blue-50"
                      : slot.isAvailable
                      ? "border-green-200 bg-green-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">
                      {slot.startTime} ~ {slot.endTime}
                    </span>
                    {slot.reservationId && slot.reservation && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[slot.reservation.status] || "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABELS[slot.reservation.status] || slot.reservation.status} · {slot.reservation.customerName}
                      </span>
                    )}
                    {!slot.reservationId && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${slot.isAvailable ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {slot.isAvailable ? "가용" : "비활성"}
                      </span>
                    )}
                  </div>
                  {!slot.reservationId && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleSlot(slot)}
                        className="p-1.5 text-gray-500 hover:text-indigo-600"
                        title={slot.isAvailable ? "비활성화" : "활성화"}
                      >
                        {slot.isAvailable ? <ToggleRight size={18} className="text-green-500" /> : <ToggleLeft size={18} />}
                      </button>
                      <button
                        onClick={() => handleDeleteSlot(slot.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600"
                        title="삭제"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 시간 추가 모달 */}
      {showAddModal && selectedDate && (
        <AddSlotModal
          date={selectedDate}
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            if (selectedDate) loadDaySlots(selectedDate);
            loadMonthData();
          }}
        />
      )}

      {/* 일괄 생성 모달 */}
      {showBulkModal && (
        <BulkCreateModal
          currentYear={currentYear}
          currentMonth={currentMonth}
          onClose={() => setShowBulkModal(false)}
          onSaved={() => {
            setShowBulkModal(false);
            loadMonthData();
            if (selectedDate) loadDaySlots(selectedDate);
          }}
        />
      )}
    </div>
  );
}

// 단일 시간 추가 모달
function AddSlotModal({
  date,
  onClose,
  onSaved,
}: {
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/timeslots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, startTime, endTime }),
    });
    setSaving(false);
    if (res.ok) {
      onSaved();
    } else {
      const data = await res.json();
      setError(data.error || "시간 추가에 실패했습니다.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">시간 추가 — {date}</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">시작 시간</label>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">종료 시간</label>
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">취소</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50">
              {saving ? "생성 중..." : "시간 추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 일괄 생성 모달
function BulkCreateModal({
  currentYear,
  currentMonth,
  onClose,
  onSaved,
}: {
  currentYear: number;
  currentMonth: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(18);
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const toggleWeekday = (dow: number) => {
    const days: number[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      if (new Date(currentYear, currentMonth - 1, d).getDay() === dow) days.push(d);
    }
    const allSelected = days.every(d => selectedDays.includes(d));
    if (allSelected) {
      setSelectedDays(prev => prev.filter(d => !days.includes(d)));
    } else {
      setSelectedDays(prev => Array.from(new Set([...prev, ...days])));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedDays.length === 0) { setError("날짜를 선택하세요."); return; }
    setSaving(true);
    setError("");

    const dates = selectedDays.sort((a, b) => a - b).map(
      d => `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    );

    const res = await fetch("/api/timeslots/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dates, startHour, endHour, intervalMinutes, durationMinutes }),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      alert(`${data.created}개 시간이 추가되었습니다.`);
      onSaved();
    } else {
      const data = await res.json();
      setError(data.error || "일괄 생성에 실패했습니다.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900">예약 시간 일괄 생성 — {currentYear}년 {currentMonth}월</h3>
          <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 요일별 빠른 선택 */}
          <div>
            <p className="text-xs text-gray-500 mb-2">요일 전체 선택</p>
            <div className="flex gap-1.5">
              {["일", "월", "화", "수", "목", "금", "토"].map((label, dow) => (
                <button
                  key={dow}
                  type="button"
                  onClick={() => toggleWeekday(dow)}
                  className={`flex-1 py-1.5 text-xs rounded-lg border ${
                    dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : ""
                  } border-gray-200 hover:bg-gray-50`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 날짜 선택 */}
          <div>
            <p className="text-xs text-gray-500 mb-2">날짜 선택 ({selectedDays.length}일 선택됨)</p>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const dow = new Date(currentYear, currentMonth - 1, day).getDay();
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`py-1.5 text-xs rounded-lg border transition-colors ${
                      selectedDays.includes(day)
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "border-gray-200 hover:bg-gray-50"
                    } ${dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : ""} ${
                      selectedDays.includes(day) ? "text-white" : ""
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 시간 설정 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">시작 시각 (시)</label>
              <select value={startHour} onChange={e => setStartHour(Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                {Array.from({ length: 24 }, (_, i) => i).map(h => <option key={h} value={h}>{h}시</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">종료 시각 (시)</label>
              <select value={endHour} onChange={e => setEndHour(Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                {Array.from({ length: 24 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{h}시</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">시간 간격 (분)</label>
              <select value={intervalMinutes} onChange={e => setIntervalMinutes(Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                {[30, 60, 90, 120].map(m => <option key={m} value={m}>{m}분</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">상담 시간 (분)</label>
              <select value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                {[30, 60, 90, 120].map(m => <option key={m} value={m}>{m}분</option>)}
              </select>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600">취소</button>
            <button type="submit" disabled={saving} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm disabled:opacity-50">
              {saving ? "생성 중..." : "일괄 생성"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
