import { useMemo, useState } from 'react';

import useElementWidth from '../../hooks/useElementWidth.js';
import { formatCurrency } from '../../lib/currency.js';

/**
 * Daily spend over the period.
 *
 * One series, so no legend - the card title names it. Colour carries no meaning here
 * beyond "this is the data", which is why a single hue is right and a categorical
 * palette would be noise.
 */

const HEIGHT = 220;
const PADDING = { top: 16, right: 16, bottom: 26, left: 52 };

function niceCeiling(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalised = value / magnitude;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((candidate) => normalised <= candidate) ?? 10;
  return step * magnitude;
}

export function TrendChart({ data, currency, lastAvailableDate }) {
  const [wrapRef, width] = useElementWidth();
  const [hoverIndex, setHoverIndex] = useState(null);

  const geometry = useMemo(() => {
    if (!width || !data.length) return null;

    const plotWidth = Math.max(width - PADDING.left - PADDING.right, 10);
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const maxCost = Math.max(...data.map((point) => point.cost), 0);
    const yMax = niceCeiling(maxCost * 1.12);

    const x = (index) =>
      PADDING.left + (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
    const y = (value) => PADDING.top + plotHeight - (value / yMax) * plotHeight;

    const points = data.map((point, index) => ({ ...point, cx: x(index), cy: y(point.cost) }));
    const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.cx} ${point.cy}`).join(' ');
    const area = `${line} L${points.at(-1).cx} ${PADDING.top + plotHeight} L${points[0].cx} ${
      PADDING.top + plotHeight
    } Z`;

    const ticks = [0, yMax / 2, yMax].map((value) => ({ value, y: y(value) }));
    const peakIndex = data.reduce((best, point, index) => (point.cost > data[best].cost ? index : best), 0);

    return { points, line, area, ticks, yMax, plotHeight, peakIndex, x };
  }, [data, width]);

  if (!data.length) return null;

  const active = hoverIndex !== null && geometry ? geometry.points[hoverIndex] : null;

  const handlePointer = (event) => {
    if (!geometry) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - bounds.left;
    let nearest = 0;
    let smallest = Infinity;
    geometry.points.forEach((point, index) => {
      const distance = Math.abs(point.cx - offsetX);
      if (distance < smallest) {
        smallest = distance;
        nearest = index;
      }
    });
    setHoverIndex(nearest);
  };

  const labelIndexes = new Set(
    [0, Math.floor(data.length / 2), data.length - 1].filter((index) => index >= 0),
  );

  return (
    <div className="chart" ref={wrapRef}>
      {geometry ? (
        <>
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Daily AWS cost for each of ${data.length} days`}
            onPointerMove={handlePointer}
            onPointerLeave={() => setHoverIndex(null)}
          >
            {/* Recessive grid: enough to read a value against, never competing with the data. */}
            {geometry.ticks.map((tick) => (
              <g key={tick.value}>
                <line
                  className="chart__grid"
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={tick.y}
                  y2={tick.y}
                />
                <text className="chart__axis-label" x={PADDING.left - 8} y={tick.y + 3} textAnchor="end">
                  {formatCurrency(tick.value, currency)}
                </text>
              </g>
            ))}

            <path className="chart__area" d={geometry.area} />
            <path className="chart__line" d={geometry.line} />

            {/* One direct label, on the peak - never a number on every point. */}
            {geometry.points[geometry.peakIndex].cost > 0 ? (
              <text
                className="chart__peak-label"
                x={geometry.points[geometry.peakIndex].cx}
                y={geometry.points[geometry.peakIndex].cy - 10}
                textAnchor={geometry.peakIndex === 0 ? 'start' : 'middle'}
              >
                {formatCurrency(geometry.points[geometry.peakIndex].cost, currency)}
              </text>
            ) : null}

            {data.map((point, index) =>
              labelIndexes.has(index) ? (
                <text
                  key={point.date}
                  className="chart__axis-label"
                  x={geometry.x(index)}
                  y={HEIGHT - 8}
                  textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'}
                >
                  {point.date?.slice(5)}
                </text>
              ) : null,
            )}

            {active ? (
              <>
                <line
                  className="chart__crosshair"
                  x1={active.cx}
                  x2={active.cx}
                  y1={PADDING.top}
                  y2={PADDING.top + geometry.plotHeight}
                />
                <circle className="chart__marker-ring" cx={active.cx} cy={active.cy} r={6} />
                <circle className="chart__marker" cx={active.cx} cy={active.cy} r={4} />
              </>
            ) : null}
          </svg>

          {active ? (
            <div
              className="chart__tooltip"
              style={{
                left: `${Math.min(Math.max(active.cx, 70), width - 70)}px`,
                top: `${Math.max(active.cy - 54, 4)}px`,
              }}
            >
              <span className="chart__tooltip-date">{active.date}</span>
              <span className="chart__tooltip-value">{formatCurrency(active.cost, currency, { precise: true })}</span>
              {active.estimated ? <span className="chart__tooltip-note">estimated</span> : null}
            </div>
          ) : null}
        </>
      ) : null}

      {/* Same numbers, reachable without the chart. */}
      <table className="visually-hidden">
        <caption>Daily AWS usage cost</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Cost</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.date}>
              <th scope="row">{point.date}</th>
              <td>{formatCurrency(point.cost, currency, { precise: true })}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {lastAvailableDate ? (
        <p className="chart__footnote">
          Last day with recorded charges: {lastAvailableDate}. Later days may still be filling in.
        </p>
      ) : null}
    </div>
  );
}

export default TrendChart;
