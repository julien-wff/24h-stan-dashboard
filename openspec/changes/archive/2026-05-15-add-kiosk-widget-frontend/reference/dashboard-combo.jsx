// Dashboard D — Combined: F1 aesthetic + Map from #1 + graphs from #2
// Sized up for legibility from across the room.

const cmbStyle = {
  font: '"Titillium Web", "Roboto Condensed", system-ui, sans-serif',
  mono: '"JetBrains Mono", "IBM Plex Mono", monospace',
  bg: "#0a0a0a",
  panel: "#13130f",
  panel2: "#181813",
  border: "rgba(255,255,255,.09)",
  yellow: "#ffd60a",
  text: "#fff",
  textDim: "rgba(255,255,255,.7)",
  textDimmer: "rgba(255,255,255,.45)",
  green: "#00d97e",
  red: "#ff3b3b",
  amber: "#ffb000",
  purple: "#bf5af2",
  ground: "#1c1d1a",
  building: "#332e26",
  park: "#252e20",
  road: "#3d3a35",
  trackArea: "#88795c",
};

function ComboDashboard({ width = 1920, height = 1080, accent }) {
  const r = useRaceState();
  const yellow = accent || cmbStyle.yellow;
  return (
    <div
      style={{
        width,
        height,
        background: cmbStyle.bg,
        color: cmbStyle.text,
        fontFamily: cmbStyle.font,
        position: "relative",
        overflow: "hidden",
        display: "grid",
        gridTemplateRows: "128px 1fr",
      }}
    >
      <CmbTopBar r={r} yellow={yellow} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "440px 1fr 440px",
          gap: 16,
          padding: 16,
          overflow: "hidden",
        }}
      >
        <CmbLeft r={r} yellow={yellow} />
        <CmbCenter r={r} yellow={yellow} />
        <CmbRight r={r} yellow={yellow} />
      </div>
    </div>
  );
}

function CmbTopBar({ r, yellow }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "520px 1fr 520px",
        borderBottom: `1px solid ${cmbStyle.border}`,
        background: cmbStyle.panel,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "0 36px",
          background: yellow,
          color: "#000",
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 4,
            background: "#000",
            color: yellow,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            fontSize: 34,
            fontStyle: "italic",
          }}
        >
          CE
        </div>
        <div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.3, lineHeight: 1 }}>
            CESI · ÉCOLE D'INGÉNIEURS
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              opacity: 0.75,
              marginTop: 6,
              letterSpacing: 1.5,
            }}
          >
            CAR #42 · TEAM NANCY
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 36 }}>
        <div style={{ fontSize: 19, letterSpacing: 4, color: cmbStyle.textDim, fontWeight: 700 }}>
          24H DE STAN · LIVE
        </div>
        <div
          style={{
            fontFamily: cmbStyle.mono,
            fontSize: 76,
            fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: -1,
            lineHeight: 1,
          }}
        >
          {fmt.time(r.elapsed)}
        </div>
        <div style={{ fontSize: 19, letterSpacing: 4, color: yellow, fontWeight: 800 }}>
          · ELAPSED ·
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "0 36px",
          gap: 28,
        }}
      >
        <CmbSensor r={r} />
        <div style={{ width: 1, height: 80, background: cmbStyle.border }} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 20, color: cmbStyle.textDim, letterSpacing: 3, fontWeight: 700 }}>
            LAP
          </div>
          <div
            style={{
              fontFamily: cmbStyle.mono,
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1,
              color: yellow,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {String(r.lap).padStart(3, "0")}
          </div>
        </div>
      </div>
    </div>
  );
}

function CmbSensor({ r }) {
  const battPct = Math.round(r.battery * 100);
  const sigBars = Math.max(1, Math.min(4, Math.ceil(r.signal * 4)));
  const battColor = battPct > 40 ? cmbStyle.green : battPct > 20 ? cmbStyle.amber : cmbStyle.red;
  const sats = r.satellites;
  const satColor = sats >= 8 ? cmbStyle.green : sats >= 5 ? cmbStyle.amber : cmbStyle.red;
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 16, color: cmbStyle.textDimmer, letterSpacing: 2, fontWeight: 700 }}>
        SENSOR
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          justifyContent: "flex-end",
          marginTop: 6,
        }}
      >
        <svg width="32" height="17">
          <rect x="0.5" y="0.5" width="27" height="16" rx="1.5" fill="none" stroke={battColor} />
          <rect x="28" y="5" width="3" height="7" fill={battColor} />
          <rect x="2" y="2" width={Math.max(2, 24 * r.battery)} height="13" fill={battColor} />
        </svg>
        <span
          style={{ fontFamily: cmbStyle.mono, fontWeight: 700, color: battColor, fontSize: 22 }}
        >
          {battPct}%
        </span>
        <span style={{ color: cmbStyle.textDimmer }}>·</span>
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke={satColor}
          strokeWidth="1.6"
        >
          <ellipse cx="10" cy="10" rx="8" ry="3" transform="rotate(-30 10 10)" />
          <circle cx="10" cy="10" r="1.6" fill={satColor} />
        </svg>
        <span style={{ fontFamily: cmbStyle.mono, fontWeight: 700, color: satColor, fontSize: 22 }}>
          {sats}
        </span>
        <span style={{ color: cmbStyle.textDimmer }}>·</span>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 5 + i * 4,
                background: i <= sigBars ? cmbStyle.green : "rgba(255,255,255,.2)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const WX_ICONS = {
  sun: (c) => (
    <g>
      <circle cx="12" cy="12" r="5" fill={c} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line
          key={a}
          x1="12"
          y1="12"
          x2={12 + 9 * Math.cos((a * Math.PI) / 180)}
          y2={12 + 9 * Math.sin((a * Math.PI) / 180)}
          stroke={c}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ))}
    </g>
  ),
  partly: (c) => (
    <g>
      <circle cx="9" cy="10" r="4" fill={c} />
      <path
        d="M 7 16 Q 7 12 11 12 Q 13 9 16 11 Q 20 11 20 15 Q 20 18 17 18 L 9 18 Q 7 18 7 16 Z"
        fill="#cfd6dc"
      />
    </g>
  ),
  cloudy: (c) => (
    <path
      d="M 5 16 Q 5 12 9 12 Q 11 8 14 11 Q 19 10 19 15 Q 19 18 16 18 L 8 18 Q 5 18 5 16 Z"
      fill="#9aa3ab"
    />
  ),
  shower: (c) => (
    <g>
      <path
        d="M 5 13 Q 5 9 9 9 Q 11 6 14 8 Q 19 8 19 12 Q 19 15 16 15 L 8 15 Q 5 15 5 13 Z"
        fill="#9aa3ab"
      />
      <line
        x1="9"
        y1="17"
        x2="8"
        y2="20"
        stroke="#5fb6ff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line
        x1="13"
        y1="17"
        x2="12"
        y2="20"
        stroke="#5fb6ff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </g>
  ),
  rain: (c) => (
    <g>
      <path
        d="M 5 12 Q 5 8 9 8 Q 11 5 14 7 Q 19 7 19 11 Q 19 14 16 14 L 8 14 Q 5 14 5 12 Z"
        fill="#7a8088"
      />
      <line
        x1="8"
        y1="16"
        x2="7"
        y2="20"
        stroke="#5fb6ff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line
        x1="12"
        y1="16"
        x2="11"
        y2="20"
        stroke="#5fb6ff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line
        x1="16"
        y1="16"
        x2="15"
        y2="20"
        stroke="#5fb6ff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </g>
  ),
};
function WxIcon({ c, color = "#ffd60a", size = 36 }) {
  const draw = WX_ICONS[c] || WX_ICONS.cloudy;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {draw(color)}
    </svg>
  );
}

// ───── LEFT ─────
function CmbLeft({ r, yellow }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
      <CmbPanel title="SPEED">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div
            style={{
              fontFamily: cmbStyle.mono,
              fontSize: 138,
              fontWeight: 800,
              color: yellow,
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
              letterSpacing: -5,
            }}
          >
            {fmt.dec(r.speed, 0)}
          </div>
          <div style={{ fontSize: 28, color: cmbStyle.textDim, fontWeight: 700 }}>km/h</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 44, marginTop: 12 }}>
          {r.speedHistory.slice(-50).map((p, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${(p.v / 30) * 100}%`,
                background: yellow,
                opacity: 0.3 + 0.7 * (i / 50),
              }}
            />
          ))}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 10,
            fontSize: 17,
            color: cmbStyle.textDim,
            fontFamily: cmbStyle.mono,
            fontWeight: 600,
          }}
        >
          <span>TOP {fmt.dec(r.topSpeed, 0)}</span>
          <span>AVG {fmt.dec(r.avgSpeed, 0)}</span>
        </div>
      </CmbPanel>

      <CmbPanel title="VELOCITY · 240s" right="dT 1s">
        <div style={{ height: 160, position: "relative", background: "#070706" }}>
          <CmbWaveform data={r.speedHistory} color={yellow} />
          <div
            style={{
              position: "absolute",
              top: 6,
              left: 8,
              fontSize: 13,
              color: cmbStyle.textDimmer,
              fontFamily: cmbStyle.mono,
            }}
          >
            30 ━
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 6,
              left: 8,
              fontSize: 13,
              color: cmbStyle.textDimmer,
              fontFamily: cmbStyle.mono,
            }}
          >
            0 ━
          </div>
        </div>
      </CmbPanel>

      <CmbPanel title="STATS" style={{ flex: 1 }}>
        <CmbKV label="DISTANCE" value={`${fmt.dec(r.distanceKm, 1)} km`} />
        <CmbKV label="AVG SPEED" value={`${fmt.dec(r.avgSpeed, 1)} km/h`} />
        <CmbKV label="TOP SPEED" value={`${fmt.dec(r.topSpeed, 1)} km/h`} color={cmbStyle.green} />
        <CmbKV
          label="CALORIES"
          value={`${fmt.int(r.calories)} kcal`}
          sub="2 PEDALERS"
          color={cmbStyle.amber}
        />
        <CmbKV label="PIT STOPS" value={`${r.pitStops} · ${fmt.time(r.pitDuration)}`} />
      </CmbPanel>
    </div>
  );
}

// ───── CENTER ─────
function CmbCenter({ r, yellow }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
      <CmbPanel
        title="PLACE DE LA CARRIÈRE · NANCY"
        right="● LIVE"
        rightColor={yellow}
        style={{ flex: 1, padding: 0 }}
        bodyStyle={{ padding: 0, position: "relative", overflow: "hidden" }}
      >
        <CmbSatMap r={r} yellow={yellow} />
      </CmbPanel>
      <div
        style={{
          background: cmbStyle.panel,
          border: `1px solid ${cmbStyle.border}`,
          padding: "18px 26px",
          display: "flex",
          alignItems: "center",
          gap: 22,
        }}
      >
        <div style={{ fontSize: 17, color: cmbStyle.textDim, letterSpacing: 2.5, fontWeight: 700 }}>
          LAP PROGRESS
        </div>
        <div style={{ flex: 1, height: 16, background: "#1f1f1a", position: "relative" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${r.s * 100}%`,
              background: yellow,
            }}
          />
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${sectorBoundaryS(i) * 100}%`,
                top: -3,
                bottom: -3,
                width: 1,
                background: "rgba(255,255,255,.4)",
              }}
            />
          ))}
        </div>
        <div
          style={{
            fontFamily: cmbStyle.mono,
            fontSize: 24,
            color: cmbStyle.text,
            fontVariantNumeric: "tabular-nums",
            fontWeight: 700,
          }}
        >
          {(r.s * 100).toFixed(1)}%
        </div>
        <div
          style={{
            fontFamily: cmbStyle.mono,
            fontSize: 24,
            color: yellow,
            fontVariantNumeric: "tabular-nums",
            fontWeight: 700,
          }}
        >
          {fmt.lap(r.currentLapTime)}
        </div>
      </div>
    </div>
  );
}

function CmbSatMap({ r, yellow }) {
  const W = 1100,
    H = 820;
  const cx = W / 2,
    cy = H / 2;
  const halfLen = 360,
    radius = 110;
  const t = buildTrack({ cx, cy, halfLen, radius });
  const car = t.pointAt(r.s);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <defs>
        <pattern
          id="cmb-bldg"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(20)"
        >
          <rect width="20" height="20" fill={cmbStyle.building} />
          <line x1="0" y1="10" x2="20" y2="10" stroke="#221d16" strokeWidth="0.5" />
          <line x1="10" y1="0" x2="10" y2="20" stroke="#221d16" strokeWidth="0.5" />
        </pattern>
        <pattern id="cmb-park" width="14" height="14" patternUnits="userSpaceOnUse">
          <rect width="14" height="14" fill={cmbStyle.park} />
          <circle cx="3" cy="3" r="2.5" fill="#2f3a25" opacity="0.7" />
          <circle cx="9" cy="9" r="2" fill="#1a2415" opacity="0.7" />
          <circle cx="11" cy="3" r="1.8" fill="#37452b" opacity="0.7" />
        </pattern>
        <radialGradient id="cmb-vig" cx="50%" cy="50%" r="70%">
          <stop offset="60%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,.55)" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={cmbStyle.ground} />
      <path
        d={`M ${cx + halfLen + radius + 40} 0 L ${W} 0 L ${W} ${H} L ${cx + halfLen + radius + 60} ${H} L ${cx + halfLen + radius + 40} ${cy + 200} L ${cx + halfLen + radius + 60} 0 Z`}
        fill="url(#cmb-park)"
      />
      <CmbBlock x={0} y={0} w={cx - halfLen - radius - 30} h={H} />
      <CmbBlock x={cx - halfLen} y={0} w={halfLen * 2} h={cy - radius - 110} />
      <CmbBlock
        x={cx - halfLen - 100}
        y={cy + radius + 90}
        w={halfLen * 2 + 200}
        h={H - (cy + radius + 90)}
      />
      <rect
        x={cx - halfLen - radius - 30}
        y={cy - radius - 50}
        width={(halfLen + radius) * 2 + 60}
        height={(radius + 50) * 2}
        fill={cmbStyle.trackArea}
        opacity="0.85"
      />
      <rect
        x={cx - halfLen - radius + 20}
        y={cy - 14}
        width={(halfLen + radius - 20) * 2}
        height={28}
        fill="url(#cmb-park)"
      />
      <path d={t.d} fill="none" stroke="#4d4640" strokeWidth="44" />
      <path d={t.d} fill="none" stroke={cmbStyle.road} strokeWidth="38" />
      <path
        d={t.d}
        fill="none"
        stroke={yellow}
        strokeWidth="1.5"
        strokeDasharray="6 10"
        opacity="0.7"
      />
      {r.heatmap.map((v, i) => {
        const p = t.pointAt(i / 120);
        const intensity = Math.min(1, v / 25);
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3.5"
            fill={`hsl(${(1 - intensity) * 45}, 100%, 55%)`}
            opacity={0.6}
          />
        );
      })}
      {[0, 1, 2, 3].map((i) => {
        const s = sectorBoundaryS(i);
        const p = t.pointAt(s);
        const active = r.sector === i;
        return (
          <g key={i} transform={`translate(${p.x},${p.y})`}>
            <circle r="24" fill="rgba(0,0,0,.65)" />
            <circle
              r="20"
              fill={active ? yellow : "#2a2620"}
              stroke={active ? "#000" : "#555"}
              strokeWidth="2"
            />
            <text
              y="6"
              textAnchor="middle"
              fill={active ? "#000" : "#999"}
              fontFamily={cmbStyle.mono}
              fontSize="17"
              fontWeight="800"
            >
              S{i + 1}
            </text>
          </g>
        );
      })}
      <g transform={`translate(${t.pointAt(0).x + 28},${t.pointAt(0).y - radius - 14})`}>
        <rect x="0" y="0" width="64" height="8" fill="#fff" />
        <rect x="0" y="0" width="11" height="8" fill="#000" />
        <rect x="22" y="0" width="11" height="8" fill="#000" />
        <rect x="44" y="0" width="11" height="8" fill="#000" />
        <text
          x="32"
          y="-8"
          textAnchor="middle"
          fill={yellow}
          fontFamily={cmbStyle.mono}
          fontSize="14"
          fontWeight="700"
        >
          START · PIT
        </text>
      </g>
      <g transform={`translate(${car.x},${car.y})`}>
        <circle r="34" fill={yellow} opacity="0.18">
          <animate attributeName="r" values="22;42;22" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite" />
        </circle>
        <g transform={`rotate(${(car.heading * 180) / Math.PI})`}>
          <path d="M 0 -30 L -6 -20 L 6 -20 Z" fill={yellow} />
        </g>
        <circle r="24" fill="#000" />
        <circle r="20" fill={yellow} />
        <text
          y="7"
          textAnchor="middle"
          fill="#000"
          fontFamily={cmbStyle.mono}
          fontSize="18"
          fontWeight="800"
        >
          42
        </text>
      </g>
      <text
        x={cx}
        y={cy - radius - 80}
        textAnchor="middle"
        fill="#aaa"
        fontFamily={cmbStyle.font}
        fontSize="17"
        fontWeight="700"
        letterSpacing="3"
        opacity="0.8"
      >
        PLACE DE LA CARRIÈRE
      </text>
      <text
        x={W - 200}
        y={cy - 30}
        fill="#7a8a6a"
        fontFamily={cmbStyle.font}
        fontSize="15"
        fontWeight="700"
        letterSpacing="2"
        opacity="0.8"
      >
        PARC PÉPINIÈRE
      </text>
      <text
        x={70}
        y={cy + 10}
        fill="#9a8a72"
        fontFamily={cmbStyle.font}
        fontSize="13"
        fontWeight="600"
        letterSpacing="2"
        opacity="0.6"
      >
        VIEILLE-VILLE
      </text>
      <rect width={W} height={H} fill="url(#cmb-vig)" pointerEvents="none" />
      <g transform={`translate(${W - 60}, 50)`}>
        <circle r="26" fill="rgba(0,0,0,.6)" stroke={cmbStyle.border} />
        <path d="M 0 -16 L -6 6 L 0 1 L 6 6 Z" fill={yellow} />
        <text
          y="22"
          textAnchor="middle"
          fill={cmbStyle.text}
          fontFamily={cmbStyle.mono}
          fontSize="13"
          fontWeight="700"
        >
          N
        </text>
      </g>
      <g transform={`translate(24, ${H - 28})`}>
        <rect x="0" y="0" width="120" height="6" fill="#fff" opacity="0.7" />
        <rect x="0" y="0" width="60" height="6" fill="#000" opacity="0.7" />
        <text x="0" y="-5" fill={cmbStyle.textDim} fontFamily={cmbStyle.mono} fontSize="13">
          100m
        </text>
      </g>
    </svg>
  );
}

function CmbBlock({ x, y, w, h }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={cmbStyle.building} />
      <rect x={x} y={y} width={w} height={h} fill="url(#cmb-bldg)" opacity="0.4" />
      <line
        x1={x + w * 0.3}
        y1={y}
        x2={x + w * 0.3}
        y2={y + h}
        stroke={cmbStyle.road}
        strokeWidth="5"
      />
      <line
        x1={x + w * 0.65}
        y1={y}
        x2={x + w * 0.65}
        y2={y + h}
        stroke={cmbStyle.road}
        strokeWidth="5"
      />
      <line
        x1={x}
        y1={y + h * 0.4}
        x2={x + w}
        y2={y + h * 0.4}
        stroke={cmbStyle.road}
        strokeWidth="5"
      />
      <line
        x1={x}
        y1={y + h * 0.7}
        x2={x + w}
        y2={y + h * 0.7}
        stroke={cmbStyle.road}
        strokeWidth="5"
      />
    </g>
  );
}

// ───── RIGHT ─────
function CmbRight({ r, yellow }) {
  const lastLap = r.lapTimes[r.lapTimes.length - 1];
  const bestLapNum = r.lapTimes.indexOf(r.bestLap) + 1 || "—";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
      <CmbPanel title="SECTORS">
        {SECTOR_NAMES.map((name, i) => {
          const times = r.sectorTimes[i];
          const last = times[times.length - 1];
          const best = times.length ? Math.min(...times) : null;
          const isBest = last && best && Math.abs(last - best) < 0.05;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                padding: "11px 0",
                borderTop: i ? `1px solid ${cmbStyle.border}` : "none",
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  background: r.sector === i ? yellow : "#333",
                  borderRadius: 2,
                }}
              />
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 700,
                  color: r.sector === i ? cmbStyle.text : cmbStyle.textDim,
                  flex: 1,
                }}
              >
                {name}
              </div>
              <div
                style={{
                  fontFamily: cmbStyle.mono,
                  fontSize: 21,
                  fontWeight: 800,
                  color: isBest ? cmbStyle.purple : last ? cmbStyle.text : cmbStyle.textDimmer,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {last ? fmt.lap(last) : "—:——"}
              </div>
            </div>
          );
        })}
      </CmbPanel>

      <CmbPanel
        title="LAP TIMES"
        right={`L${r.lap}`}
        rightColor={yellow}
        style={{ flex: 1 }}
        bodyStyle={{ padding: 0, display: "flex", flexDirection: "column" }}
      >
        {/* Best + Last summary */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            borderBottom: `1px solid ${cmbStyle.border}`,
          }}
        >
          <div style={{ padding: "14px 18px", borderRight: `1px solid ${cmbStyle.border}` }}>
            <div
              style={{ fontSize: 14, color: cmbStyle.textDim, letterSpacing: 2.5, fontWeight: 700 }}
            >
              BEST LAP
            </div>
            <div
              style={{
                fontFamily: cmbStyle.mono,
                fontSize: 36,
                fontWeight: 800,
                color: cmbStyle.purple,
                lineHeight: 1.05,
                marginTop: 4,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: -1,
              }}
            >
              {fmt.lap(r.bestLap)}
            </div>
            <div
              style={{
                fontSize: 13,
                color: cmbStyle.textDim,
                marginTop: 3,
                letterSpacing: 1,
                fontWeight: 600,
              }}
            >
              LAP {bestLapNum}
            </div>
          </div>
          <div style={{ padding: "14px 18px" }}>
            <div
              style={{ fontSize: 14, color: cmbStyle.textDim, letterSpacing: 2.5, fontWeight: 700 }}
            >
              LAST LAP
            </div>
            <div
              style={{
                fontFamily: cmbStyle.mono,
                fontSize: 36,
                fontWeight: 800,
                color: yellow,
                lineHeight: 1.05,
                marginTop: 4,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: -1,
              }}
            >
              {fmt.lap(lastLap)}
            </div>
            <div
              style={{
                fontSize: 13,
                color: cmbStyle.textDim,
                marginTop: 3,
                letterSpacing: 1,
                fontWeight: 600,
              }}
            >
              Δ {fmt.delta(r.ghostDelta)}
            </div>
          </div>
        </div>
        {/* Recent laps list */}
        <div style={{ padding: "4px 18px 8px", flex: 1 }}>
          {[...r.lapTimes]
            .reverse()
            .slice(0, 8)
            .map((t, i) => {
              const lapNum = r.lap - 1 - i;
              const isBest = Math.abs(t - r.bestLap) < 0.05;
              const delta = t - r.bestLap;
              return (
                <div
                  key={lapNum}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "54px 1fr 86px",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 0",
                    borderTop: i ? "1px solid rgba(255,255,255,.05)" : "none",
                  }}
                >
                  <span
                    style={{
                      color: cmbStyle.textDim,
                      fontFamily: cmbStyle.mono,
                      fontSize: 15,
                      fontWeight: 700,
                    }}
                  >
                    L{lapNum}
                  </span>
                  <span
                    style={{
                      fontFamily: cmbStyle.mono,
                      fontSize: 19,
                      fontWeight: 800,
                      color: isBest ? cmbStyle.purple : cmbStyle.text,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmt.lap(t)}
                  </span>
                  <span
                    style={{
                      fontFamily: cmbStyle.mono,
                      fontSize: 14,
                      color: isBest
                        ? cmbStyle.purple
                        : delta < r.bestLap * 0.05
                          ? cmbStyle.green
                          : cmbStyle.textDim,
                      textAlign: "right",
                      fontWeight: 700,
                    }}
                  >
                    {isBest ? "BEST" : `+${delta.toFixed(2)}`}
                  </span>
                </div>
              );
            })}
        </div>
      </CmbPanel>

      <CmbWeather wx={r.weather} yellow={yellow} />

      <CmbPanel title="LATEST EVENTS">
        <CmbEvent
          icon="🟣"
          t={r.elapsed - 12}
          text={`New best lap! ${fmt.lap(r.bestLap)}`}
          highlight
        />
        <CmbEvent
          icon="⛽"
          t={r.elapsed - 240}
          text={`Pit stop #${r.pitStops}: 0:38 — clean swap`}
        />
        <CmbEvent
          icon="⚡"
          t={r.elapsed - 820}
          text={`Top speed: ${fmt.dec(r.topSpeed, 1)} km/h`}
        />
      </CmbPanel>
    </div>
  );
}

function CmbBigStat({ label, value, sub, color }) {
  return (
    <div
      style={{
        background: cmbStyle.panel,
        border: `1px solid ${cmbStyle.border}`,
        padding: "16px 20px",
      }}
    >
      <div style={{ fontSize: 17, color: cmbStyle.textDim, letterSpacing: 2.5, fontWeight: 700 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: cmbStyle.mono,
          fontSize: 44,
          fontWeight: 800,
          color,
          lineHeight: 1.05,
          marginTop: 6,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 15,
          color: cmbStyle.textDim,
          marginTop: 4,
          letterSpacing: 1,
          fontWeight: 600,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function CmbKV({ label, value, sub, color }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 0",
        borderTop: `1px solid ${cmbStyle.border}`,
      }}
    >
      <div>
        <div style={{ fontSize: 17, color: cmbStyle.textDim, letterSpacing: 2, fontWeight: 700 }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 13, color: cmbStyle.textDimmer, marginTop: 2, letterSpacing: 1 }}>
            {sub}
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: cmbStyle.mono,
          fontSize: 24,
          fontWeight: 800,
          color: color || cmbStyle.text,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CmbEvent({ icon, t, text, highlight }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        padding: "12px 0",
        opacity: highlight ? 1 : 0.78,
        borderTop: "1px solid rgba(255,255,255,.05)",
      }}
    >
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 17,
            color: highlight ? cmbStyle.text : cmbStyle.textDim,
            fontWeight: highlight ? 700 : 600,
            lineHeight: 1.3,
          }}
        >
          {text}
        </div>
        <div
          style={{
            fontSize: 13,
            color: cmbStyle.textDimmer,
            fontFamily: cmbStyle.mono,
            marginTop: 3,
          }}
        >
          {fmt.time(t)}
        </div>
      </div>
    </div>
  );
}

function CmbPanel({ title, right, rightColor, children, style, bodyStyle }) {
  return (
    <div
      style={{
        background: cmbStyle.panel,
        border: `1px solid ${cmbStyle.border}`,
        display: "flex",
        flexDirection: "column",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 18px",
          borderBottom: `1px solid ${cmbStyle.border}`,
        }}
      >
        <div style={{ fontSize: 17, color: cmbStyle.textDim, letterSpacing: 3, fontWeight: 700 }}>
          {title}
        </div>
        {right && (
          <div
            style={{
              fontSize: 15,
              color: rightColor || cmbStyle.textDim,
              letterSpacing: 2,
              fontWeight: 800,
            }}
          >
            {right}
          </div>
        )}
      </div>
      <div style={{ padding: "14px 18px", flex: 1, ...bodyStyle }}>{children}</div>
    </div>
  );
}

function CmbWaveform({ data, color }) {
  const max = 30;
  const pts = data
    .slice(-200)
    .map((p, i) => `${(i / 199) * 100},${100 - (p.v / max) * 100}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      {[0, 25, 50, 75, 100].map((y) => (
        <line
          key={y}
          x1="0"
          y1={y}
          x2="100"
          y2={y}
          stroke="rgba(255,214,10,.06)"
          strokeWidth=".3"
        />
      ))}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="0.7" />
      <polyline points={`${pts} 100,100 0,100`} fill={color} opacity="0.12" />
    </svg>
  );
}

function CmbWeather({ wx, yellow }) {
  const startHour = 12;
  const fmtHour = (h) => `${String(h % 24).padStart(2, "0")}:00`;
  return (
    <div
      style={{
        background: cmbStyle.panel,
        border: `1px solid ${cmbStyle.border}`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 18px",
          borderBottom: `1px solid ${cmbStyle.border}`,
        }}
      >
        <div style={{ fontSize: 17, color: cmbStyle.textDim, letterSpacing: 3, fontWeight: 700 }}>
          WEATHER · NANCY
        </div>
        <div
          style={{
            fontSize: 13,
            color: cmbStyle.textDimmer,
            fontFamily: cmbStyle.mono,
            fontWeight: 700,
          }}
        >
          METEO-FRANCE
        </div>
      </div>
      <div
        style={{
          padding: "14px 18px",
          display: "grid",
          gridTemplateColumns: "1fr 1px 1fr 1fr 1fr",
          gap: 14,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <WxIcon c={wx.now.c} color={yellow} size={48} />
          <div>
            <div
              style={{
                fontFamily: cmbStyle.mono,
                fontSize: 32,
                fontWeight: 800,
                color: cmbStyle.text,
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {wx.now.t}°
            </div>
            <div
              style={{
                fontSize: 12,
                color: cmbStyle.textDim,
                fontFamily: cmbStyle.mono,
                marginTop: 4,
                letterSpacing: 1,
              }}
            >
              {wx.now.w} km/h
            </div>
            <div
              style={{
                fontSize: 11,
                color: yellow,
                fontWeight: 700,
                letterSpacing: 1.5,
                marginTop: 2,
              }}
            >
              NOW
            </div>
          </div>
        </div>
        <div style={{ width: 1, height: 56, background: cmbStyle.border }} />
        {wx.next.map((h, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 11,
                color: cmbStyle.textDimmer,
                fontFamily: cmbStyle.mono,
                fontWeight: 700,
                letterSpacing: 1,
              }}
            >
              +{i + 1}h
            </div>
            <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
              <WxIcon c={h.c} color={cmbStyle.textDim} size={28} />
            </div>
            <div
              style={{
                fontFamily: cmbStyle.mono,
                fontSize: 18,
                fontWeight: 700,
                color: cmbStyle.text,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {h.t}°
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { ComboDashboard });
