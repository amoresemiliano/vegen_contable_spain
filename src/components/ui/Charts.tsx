import React, { useState } from 'react';
import { formatEUR } from '../../domain/formatters';
import { ForecastHorizonPoint } from '../../domain/treasury';
import { FinancialScenario } from '../../types/domain';

export const CashFlowComparisonChart: React.FC<{
  points: ForecastHorizonPoint[];
}> = ({ points }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxVal = Math.max(
    1000,
    ...points.flatMap((p) => [p.projectedInflows, p.projectedOutflows, p.projectedEndingLiquidity])
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-teal-600 dark:bg-teal-400" />
            Entradas previstas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-slate-400 dark:bg-slate-500" />
            Salidas previstas
          </span>
        </div>
        {hoveredIdx !== null && points[hoveredIdx] && (
          <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {points[hoveredIdx].horizonLabel}: Liquidez estimada{' '}
            {formatEUR(points[hoveredIdx].projectedEndingLiquidity)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3 pt-2">
        {points.map((pt, idx) => {
          const inPct = Math.max(6, Math.round((pt.projectedInflows / maxVal) * 100));
          const outPct = Math.max(6, Math.round((pt.projectedOutflows / maxVal) * 100));
          return (
            <div
              key={pt.horizonLabel}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="flex flex-col items-center rounded-lg border border-transparent p-2 transition-colors hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-slate-800/40"
            >
              <div className="flex h-36 w-full items-end justify-center gap-1.5 border-b border-slate-200 pb-2 dark:border-slate-800">
                <div
                  className="w-5 rounded-t bg-teal-600 transition-all dark:bg-teal-500 sm:w-6"
                  style={{ height: `${inPct}%` }}
                  title={`Entradas: ${formatEUR(pt.projectedInflows)}`}
                />
                <div
                  className="w-5 rounded-t bg-slate-300 transition-all dark:bg-slate-600 sm:w-6"
                  style={{ height: `${outPct}%` }}
                  title={`Salidas: ${formatEUR(pt.projectedOutflows)}`}
                />
              </div>
              <div className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                {pt.horizonLabel}
              </div>
              <div className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {formatEUR(pt.projectedEndingLiquidity)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ScenarioComparisonChart: React.FC<{
  baselineLiquidity: number;
  scenarios: FinancialScenario[];
}> = ({ baselineLiquidity, scenarios }) => {
  const width = 560;
  const height = 220;
  const padX = 48;
  const padY = 24;

  const allValues = [
    baselineLiquidity,
    ...scenarios.flatMap((s) => [s.projected12mBalance, s.projected36mBalance, s.projected60mBalance]),
  ];
  const minVal = Math.min(...allValues) * 0.9;
  const maxVal = Math.max(...allValues, minVal + 1000) * 1.05;

  const xCoords = [padX, padX + (width - padX * 2) * 0.33, padX + (width - padX * 2) * 0.66, width - padX];
  const yFor = (val: number) => {
    const ratio = (val - minVal) / (maxVal - minVal || 1);
    return height - padY - ratio * (height - padY * 2);
  };

  const colors: Record<string, string> = {
    CONSERVATIVE: '#64748B',
    BASE: '#0D9488',
    OPTIMISTIC: '#2563EB',
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[360px]"
        role="img"
        aria-label="Gráfico comparativo de escenarios financieros a 12, 36 y 60 meses"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padY + t * (height - padY * 2);
          return (
            <line
              key={t}
              x1={padX}
              x2={width - padX}
              y1={y}
              y2={y}
              stroke="currentColor"
              className="text-slate-200 dark:text-slate-800"
              strokeWidth={1}
            />
          );
        })}

        {scenarios.map((scen) => {
          const pts = [
            { x: xCoords[0], y: yFor(baselineLiquidity) },
            { x: xCoords[1], y: yFor(scen.projected12mBalance) },
            { x: xCoords[2], y: yFor(scen.projected36mBalance) },
            { x: xCoords[3], y: yFor(scen.projected60mBalance) },
          ];
          const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
          const stroke = colors[scen.type] ?? '#0D9488';

          return (
            <g key={scen.id}>
              <path
                d={pathD}
                fill="none"
                stroke={stroke}
                strokeWidth={scen.type === 'BASE' ? 3 : 2}
                strokeDasharray={scen.type === 'CONSERVATIVE' ? '5 4' : undefined}
              />
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4} fill={stroke} />
              ))}
            </g>
          );
        })}

        {['Hoy', '12 meses', '36 meses', '60 meses'].map((lbl, idx) => (
          <text
            key={lbl}
            x={xCoords[idx]}
            y={height - 4}
            textAnchor="middle"
            className="fill-slate-500 text-[11px] dark:fill-slate-400"
          >
            {lbl}
          </text>
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
        {scenarios.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colors[s.type] ?? '#0D9488' }}
            />
            <span className="font-medium text-slate-800 dark:text-slate-200">{s.label}:</span>
            <span className="font-mono tabular-nums">{formatEUR(s.projected60mBalance)} (60m)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const GoalProgressBar: React.FC<{
  evidencePercent: number;
  manualPercent: number;
  totalPercent: number;
}> = ({ evidencePercent, manualPercent, totalPercent }) => (
  <div>
    <div className="mb-1.5 flex items-center justify-between text-xs">
      <span className="text-slate-600 dark:text-slate-400">
        Progreso verificado {evidencePercent.toFixed(0)}%
        {manualPercent > 0 ? ` · Manual ${manualPercent.toFixed(0)}%` : ''}
      </span>
      <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        {totalPercent.toFixed(1).replace('.', ',')}%
      </span>
    </div>
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div
        className="h-full bg-teal-600 transition-all dark:bg-teal-500"
        style={{ width: `${Math.min(100, evidencePercent)}%` }}
        title="Progreso respaldado por evidencia bancaria"
      />
      {manualPercent > 0 && (
        <div
          className="h-full bg-amber-500 transition-all"
          style={{ width: `${Math.min(100 - evidencePercent, manualPercent)}%` }}
          title="Progreso declarado manualmente"
        />
      )}
    </div>
  </div>
);
