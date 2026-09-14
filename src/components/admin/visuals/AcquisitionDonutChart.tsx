"use client";

import VisxDonut from "@/components/charts/VisxDonut";

export type AcquisitionChartRow = {
  source: string;
  sessions: number;
  color: string;
};

export default function AcquisitionDonutChart({
  data,
}: {
  data: AcquisitionChartRow[];
}) {
  const total = data.reduce((sum, row) => sum + row.sessions, 0);

  if (total === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl bg-[#0B1121] text-sm text-gray-400">
        Acquisition data will appear after the first tracked visit.
      </div>
    );
  }

  const donutData = data.map((row) => ({
    id: row.source,
    label: row.source,
    value: row.sessions,
    color: row.color,
  }));

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
      <div className="relative h-72 min-w-0">
        <VisxDonut
          data={donutData}
          innerRadius={72}
          outerRadius={105}
          ariaLabel="Sessions by acquisition source"
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tracking-tight text-gray-100">
            {total.toLocaleString()}
          </span>
          <span className="text-xs font-medium text-gray-400">sessions</span>
        </div>
      </div>

      <div className="space-y-3">
        {data.map((row) => (
          <div key={row.source} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: row.color }}
              />
              <span className="text-sm font-medium text-gray-300">{row.source}</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-gray-100">
                {Math.round((row.sessions / total) * 100)}%
              </p>
              <p className="text-[11px] text-gray-400">{row.sessions.toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
