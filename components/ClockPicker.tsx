'use client';

import { useState, useRef, useEffect } from 'react';

export interface ClockPickerProps {
  value: string | null;        // "HH:MM" 24-hr for storage
  onChange: (time: string) => void;
  onClose: () => void;
}

const SIZE = 220;
const CX = SIZE / 2;
const CY = SIZE / 2;
const HOUR_R = 78;
const MIN_R = 78;

function toDisplayHour(h24: number): number {
  const h = h24 % 12;
  return h === 0 ? 12 : h;
}

function polarToXY(angleDeg: number, r: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function angleFromXY(x: number, y: number, rect: DOMRect) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  if (angle < 0) angle += 360;
  return angle;
}

export default function ClockPicker({ value, onChange, onClose }: ClockPickerProps) {
  const [phase, setPhase] = useState<'hour' | 'minute'>('hour');

  const parsed = value ? value.split(':').map(Number) : [9, 0];
  const [hour24, setHour24] = useState(parsed[0] ?? 9);
  const [minute, setMinute] = useState(parsed[1] ?? 0);
  const [ampm, setAmpm] = useState<'AM' | 'PM'>(hour24 >= 12 ? 'PM' : 'AM');

  const svgRef = useRef<SVGSVGElement>(null);

  const displayHour = toDisplayHour(hour24);
  const displayTime = `${displayHour}:${String(minute).padStart(2, '0')} ${ampm}`;

  function confirmTime() {
    let h = displayHour;
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    onChange(`${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    onClose();
  }

  function handleAmPmSwitch(newAmPm: 'AM' | 'PM') {
    setAmpm(newAmPm);
    if (newAmPm === 'PM' && hour24 < 12) setHour24(h => h + 12);
    if (newAmPm === 'AM' && hour24 >= 12) setHour24(h => h - 12);
  }

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const angle = angleFromXY(e.clientX, e.clientY, rect);

    if (phase === 'hour') {
      const rawHour = Math.round(angle / 30) % 12;
      const h12 = rawHour === 0 ? 12 : rawHour;
      let h24: number;
      if (ampm === 'AM') h24 = h12 === 12 ? 0 : h12;
      else h24 = h12 === 12 ? 12 : h12 + 12;
      setHour24(h24);
      setPhase('minute');
    } else {
      const rawMin = Math.round(angle / 6) % 60;
      setMinute(rawMin < 0 ? rawMin + 60 : rawMin);
    }
  }

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);

  const hourAngle = (displayHour % 12) * 30;
  const minAngle = minute * 6;
  const handPos = phase === 'hour' ? polarToXY(hourAngle, HOUR_R - 10) : polarToXY(minAngle, MIN_R - 10);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(43,40,35,0.35)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          backgroundColor: '#f6f1e6',
          border: '1px solid #cdc6b6',
          borderRadius: '16px',
          padding: '24px',
          width: '280px',
          boxShadow: '0 8px 32px rgba(43,40,35,0.18)',
        }}
      >
        {/* Current time display */}
        <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '28px', color: '#2b2823', textAlign: 'center', marginBottom: '16px', letterSpacing: '0.02em' }}>
          {displayTime}
        </p>

        {/* Phase tabs */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '12px' }}>
          {(['hour', 'minute'] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPhase(p)}
              style={{
                fontSize: '11px',
                fontWeight: 500,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '4px 12px',
                borderRadius: '100px',
                border: '1px solid #cdc6b6',
                backgroundColor: phase === p ? '#2b2823' : 'transparent',
                color: phase === p ? '#efe9dd' : '#6b665e',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {p === 'hour' ? 'Hour' : 'Min'}
            </button>
          ))}
        </div>

        {/* Clock face */}
        <svg
          ref={svgRef}
          width={SIZE}
          height={SIZE}
          onClick={handleSvgClick}
          style={{ display: 'block', margin: '0 auto', cursor: 'pointer', userSelect: 'none' }}
        >
          {/* Outer ring */}
          <circle cx={CX} cy={CY} r={SIZE / 2 - 4} fill="#ede8df" stroke="#cdc6b6" strokeWidth="1" />

          {/* Hand */}
          <line
            x1={CX} y1={CY}
            x2={handPos.x} y2={handPos.y}
            stroke="#8ea394" strokeWidth="2" strokeLinecap="round"
          />
          <circle cx={CX} cy={CY} r={3} fill="#8ea394" />
          <circle cx={handPos.x} cy={handPos.y} r={10} fill="#8ea394" opacity="0.25" />
          <circle cx={handPos.x} cy={handPos.y} r={4} fill="#8ea394" />

          {/* Hour / minute markers */}
          {phase === 'hour'
            ? hours.map(h => {
                const angle = h * 30;
                const pos = polarToXY(angle, HOUR_R);
                const isSelected = h === displayHour;
                return (
                  <g key={h}>
                    {isSelected && <circle cx={pos.x} cy={pos.y} r={12} fill="#8ea394" opacity="0.2" />}
                    <text
                      x={pos.x} y={pos.y}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize="12" fill={isSelected ? '#2b2823' : '#6b665e'}
                      fontWeight={isSelected ? '600' : '400'}
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      {h}
                    </text>
                  </g>
                );
              })
            : minutes.map(m => {
                const angle = m * 6;
                const pos = polarToXY(angle, MIN_R);
                const isSelected = m === minute || (minute >= m && minute < m + 5 && m === Math.floor(minute / 5) * 5);
                const label = m === 0 ? '00' : String(m);
                return (
                  <g key={m}>
                    {isSelected && <circle cx={pos.x} cy={pos.y} r={12} fill="#8ea394" opacity="0.2" />}
                    <text
                      x={pos.x} y={pos.y}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize="12" fill={isSelected ? '#2b2823' : '#6b665e'}
                      fontWeight={isSelected ? '600' : '400'}
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      {label}
                    </text>
                  </g>
                );
              })
          }
        </svg>

        {/* AM / PM toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
          {(['AM', 'PM'] as const).map(period => (
            <button
              key={period}
              type="button"
              onClick={() => handleAmPmSwitch(period)}
              style={{
                width: '64px',
                padding: '6px 0',
                borderRadius: '100px',
                border: '1px solid #cdc6b6',
                backgroundColor: ampm === period ? '#2b2823' : 'transparent',
                color: ampm === period ? '#efe9dd' : '#6b665e',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {period}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '20px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ fontSize: '13px', color: '#a8a297', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmTime}
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#2b2823',
              border: '1px solid #2b2823',
              backgroundColor: 'transparent',
              borderRadius: '100px',
              padding: '7px 20px',
              cursor: 'pointer',
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
