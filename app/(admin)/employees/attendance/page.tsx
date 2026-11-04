"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, RefreshCw, Share2 } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  getAttendanceCalendar,
  getAttendanceDayDetail,
  getAttendanceToday,
  markAttendanceManual,
  refreshAttendanceTodayToken,
  type AttendanceCalendarDay,
  type AttendanceCalendarPayload,
  type AttendanceRecordRow,
  type AttendanceTodayPayload,
  type AttendanceEmployeeBrief,
} from "@/app/lib/admin-attendance";
import { cn } from "@/lib/utils";

type Tab = "today" | "calendar";

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(d);
}

function formatDayLabel(dateKey: string) {
  const d = new Date(`${dateKey}T12:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(d);
}

function employeeLabel(e: { name: string | null; email: string }) {
  return e.name?.trim() || e.email;
}

function secondsUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

export default function AttendancePage() {
  const [tab, setTab] = useState<Tab>("today");
  const [today, setToday] = useState<AttendanceTodayPayload | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [manualEmployeeId, setManualEmployeeId] = useState("");
  const [countdown, setCountdown] = useState(0);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth() + 1);
  const [calEmployeeId, setCalEmployeeId] = useState("");
  const [calendar, setCalendar] = useState<AttendanceCalendarPayload | null>(null);
  const [calLoading, setCalLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<{
    date: string;
    present: AttendanceRecordRow[];
    absent: AttendanceEmployeeBrief[];
  } | null>(null);

  const loadToday = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError("");
    try {
      const data = await getAttendanceToday();
      setToday(data);
      setCountdown(secondsUntil(data.tokenExpiresAt));
      if (
        data.absentEmployees.length > 0 &&
        !data.absentEmployees.some((e) => e.id === manualEmployeeId)
      ) {
        setManualEmployeeId(data.absentEmployees[0]?.id ?? "");
      }
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to load attendance."
      );
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [manualEmployeeId]);

  const loadCalendar = useCallback(async () => {
    setCalLoading(true);
    setError("");
    try {
      const data = await getAttendanceCalendar({
        year: calYear,
        month: calMonth,
        employeeId: calEmployeeId || undefined,
      });
      setCalendar(data);
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to load calendar."
      );
    } finally {
      setCalLoading(false);
    }
  }, [calYear, calMonth, calEmployeeId]);

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  useEffect(() => {
    if (tab === "calendar") void loadCalendar();
  }, [tab, loadCalendar]);

  useEffect(() => {
    if (!today?.qrPayload) {
      setQrDataUrl("");
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(today.qrPayload, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "M",
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [today?.qrPayload]);

  useEffect(() => {
    if (!today?.tokenExpiresAt) return;
    const id = window.setInterval(() => {
      const left = secondsUntil(today.tokenExpiresAt);
      setCountdown(left);
      if (left <= 0) {
        void loadToday({ silent: true });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [today?.tokenExpiresAt, loadToday]);

  // Soft poll so admin roster stays fresh when employees scan
  useEffect(() => {
    if (tab !== "today") return;
    const id = window.setInterval(() => {
      void loadToday({ silent: true });
    }, 20_000);
    return () => window.clearInterval(id);
  }, [tab, loadToday]);

  async function handleRefreshToken() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const data = await refreshAttendanceTodayToken();
      setToday(data);
      setCountdown(secondsUntil(data.tokenExpiresAt));
      setMessage("QR code refreshed.");
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to refresh QR."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleManualMark() {
    if (!manualEmployeeId) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await markAttendanceManual({
        employeeId: manualEmployeeId,
        date: today?.date,
      });
      setMessage(res.message);
      await loadToday({ silent: true });
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to mark present."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadQr() {
    if (!qrDataUrl || !today) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `drishx-attendance-${today.date}.png`;
    a.click();
  }

  async function handleShareQr() {
    if (!qrDataUrl || !today) return;
    try {
      const res = await fetch(qrDataUrl);
      const blob = await res.blob();
      const file = new File([blob], `drishx-attendance-${today.date}.png`, {
        type: "image/png",
      });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "DrishX office attendance QR",
          text: `Office attendance QR for ${today.date} (refreshes every 5 minutes).`,
        });
        return;
      }
      await handleDownloadQr();
      setMessage("Share not supported here — image downloaded instead.");
    } catch {
      await handleDownloadQr();
    }
  }

  async function openDayDetail(dateKey: string) {
    setSelectedDay(dateKey);
    setDayDetail(null);
    try {
      const data = await getAttendanceDayDetail(dateKey);
      setDayDetail(data);
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to load day detail."
      );
    }
  }

  const monthLabel = useMemo(() => {
    const d = new Date(Date.UTC(calYear, calMonth - 1, 1));
    return new Intl.DateTimeFormat("en-IN", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(d);
  }, [calYear, calMonth]);

  const calendarGrid = useMemo(() => {
    if (!calendar) return [];
    const firstWeekday = new Date(Date.UTC(calYear, calMonth - 1, 1)).getUTCDay();
    const cells: Array<AttendanceCalendarDay | null> = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (const day of calendar.days) cells.push(day);
    return cells;
  }, [calendar, calYear, calMonth]);

  function shiftMonth(delta: number) {
    let y = calYear;
    let m = calMonth + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setCalYear(y);
    setCalMonth(m);
    setSelectedDay(null);
    setDayDetail(null);
  }

  if (loading && !today) {
    return (
      <AdminPage title="Attendance" subtitle="Office QR check-in for employees.">
        <DetailSkeleton />
      </AdminPage>
    );
  }

  return (
    <AdminPage
      title="Attendance"
      subtitle="Office QR check-in. Token rotates every 5 minutes (Asia/Kolkata)."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant={tab === "today" ? "default" : "outline"}
          className="rounded-xl"
          onClick={() => setTab("today")}
        >
          Today
        </Button>
        <Button
          type="button"
          variant={tab === "calendar" ? "default" : "outline"}
          className="rounded-xl"
          onClick={() => setTab("calendar")}
        >
          Calendar
        </Button>
      </div>

      {error ? (
        <p className="mb-3 text-sm font-semibold text-(--brand-danger)">{error}</p>
      ) : null}
      {message ? (
        <p className="mb-3 text-sm font-semibold text-(--brand-primary)">{message}</p>
      ) : null}

      {tab === "today" && today ? (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-(--brand-text-muted)">
              Office QR · {formatDayLabel(today.date)}
            </p>
            <p className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-(--brand-text)">
              Code refreshes every 5 minutes. Prefer showing this on an office
              screen — shared WhatsApp images go stale quickly.
            </p>
            <div className="mb-3 flex justify-center rounded-xl bg-white p-3">
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  ref={qrCanvasRef as unknown as React.RefObject<HTMLImageElement>}
                  src={qrDataUrl}
                  alt="Office attendance QR"
                  className="h-64 w-64"
                />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center text-sm text-(--brand-text-muted)">
                  Generating…
                </div>
              )}
            </div>
            <p className="mb-3 text-center text-sm font-semibold text-(--brand-text)">
              Refreshes in {countdown}s
            </p>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                className="w-full rounded-xl"
                disabled={busy}
                onClick={() => void handleRefreshToken()}
              >
                <RefreshCw className="mr-2 size-4" />
                Refresh QR now
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl"
                disabled={!qrDataUrl}
                onClick={() => void handleShareQr()}
              >
                <Share2 className="mr-2 size-4" />
                Share image
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-xl"
                disabled={!qrDataUrl}
                onClick={() => void handleDownloadQr()}
              >
                <Download className="mr-2 size-4" />
                Download PNG
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
              <h3 className="mb-2 text-sm font-extrabold text-(--brand-text)">
                Mark present (admin)
              </h3>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  value={manualEmployeeId || undefined}
                  onValueChange={setManualEmployeeId}
                >
                  <SelectTrigger className="h-10 w-full flex-1 sm:min-w-56">
                    <SelectValue placeholder="Select absent employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {today.absentEmployees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {employeeLabel(e)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={busy || !manualEmployeeId}
                  onClick={() => void handleManualMark()}
                >
                  Mark present
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold text-(--brand-text)">
                  Present today ({today.records.length})
                </h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => void loadToday({ silent: true })}
                >
                  Reload
                </Button>
              </div>
              {today.records.length === 0 ? (
                <p className="text-sm text-(--brand-text-muted)">
                  No one marked present yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {today.records.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          {employeeLabel(r.employee)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {r.method === "QR_SCAN" ? "QR scan" : "By admin"}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatTime(r.markedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {today.absentEmployees.length > 0 ? (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-bold uppercase text-(--brand-text-muted)">
                    Still absent ({today.absentEmployees.length})
                  </p>
                  <ul className="space-y-1 text-sm text-(--brand-text)">
                    {today.absentEmployees.map((e) => (
                      <li key={e.id}>{employeeLabel(e)}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "calendar" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => shiftMonth(-1)}
            >
              Prev
            </Button>
            <p className="min-w-40 text-center text-sm font-extrabold text-(--brand-text)">
              {monthLabel}
            </p>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => shiftMonth(1)}
            >
              Next
            </Button>
            <Select
              value={calEmployeeId || "all"}
              onValueChange={(value) =>
                setCalEmployeeId(value === "all" ? "" : value)
              }
            >
              <SelectTrigger className="ml-auto h-10 w-full min-w-48 sm:w-56">
                <SelectValue placeholder="All employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {(
                  calendar?.employees ??
                  today?.absentEmployees.concat(
                    today.records.map((r) => r.employee)
                  ) ??
                  []
                ).map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {employeeLabel(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {calLoading && !calendar ? (
            <DetailSkeleton />
          ) : calendar ? (
            <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
              <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-bold text-(--brand-text-muted)">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarGrid.map((day, idx) => {
                  if (!day) {
                    return <div key={`empty-${idx}`} className="min-h-16" />;
                  }
                  const dayNum = Number(day.date.slice(-2));
                  const selected = selectedDay === day.date;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => void openDayDetail(day.date)}
                      className={cn(
                        "min-h-16 rounded-xl border p-2 text-left text-xs transition",
                        selected
                          ? "border-(--brand-primary) bg-(--brand-primary)/10"
                          : "border-(--brand-card-border) hover:border-(--brand-primary)/50"
                      )}
                    >
                      <p className="font-bold text-(--brand-text)">{dayNum}</p>
                      <p className="text-(--brand-text-muted)">
                        {calEmployeeId
                          ? day.presentCount > 0
                            ? "Present"
                            : "Absent"
                          : `${day.presentCount} in`}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {selectedDay ? (
            <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4">
              <h3 className="mb-2 text-sm font-extrabold text-(--brand-text)">
                {formatDayLabel(selectedDay)}
              </h3>
              {!dayDetail ? (
                <p className="text-sm text-(--brand-text-muted)">Loading…</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase text-(--brand-text-muted)">
                      Present ({dayDetail.present.length})
                    </p>
                    <ul className="space-y-1 text-sm">
                      {dayDetail.present.map((r) => (
                        <li key={r.id}>
                          {employeeLabel(r.employee)} ·{" "}
                          {r.method === "QR_SCAN" ? "QR" : "Admin"} ·{" "}
                          {formatTime(r.markedAt)}
                        </li>
                      ))}
                      {dayDetail.present.length === 0 ? (
                        <li className="text-(--brand-text-muted)">None</li>
                      ) : null}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-bold uppercase text-(--brand-text-muted)">
                      Absent ({dayDetail.absent.length})
                    </p>
                    <ul className="space-y-1 text-sm">
                      {dayDetail.absent.map((e) => (
                        <li key={e.id}>{employeeLabel(e)}</li>
                      ))}
                      {dayDetail.absent.length === 0 ? (
                        <li className="text-(--brand-text-muted)">None</li>
                      ) : null}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </AdminPage>
  );
}
