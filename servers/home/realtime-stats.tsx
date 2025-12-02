// @ts-ignore import React from "react";
declare const React: any;

let nsRef: NS;

function formatMoney(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1e12) return `$${(amount / 1e12).toFixed(2)}t`;
  if (abs >= 1e9) return `$${(amount / 1e9).toFixed(2)}b`;
  if (abs >= 1e6) return `$${(amount / 1e6).toFixed(2)}m`;
  if (abs >= 1e3) return `$${(amount / 1e3).toFixed(2)}k`;
  return `$${Math.round(amount)}`;
}

function RealtimeStats() {
  const [now, setNow] = React.useState(Date.now());
  const [money, setMoney] = React.useState(0);
  const [hacking, setHacking] = React.useState(0);
  const [ramUsed, setRamUsed] = React.useState(0);
  const [ramMax, setRamMax] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      try {
        const player = nsRef.getPlayer();
        const home = nsRef.getServer("home");
        setMoney(player.money);
        // Prefer ns.getHackingLevel() for simplicity/compat
        setHacking(nsRef.getHackingLevel());
        setRamUsed(home.ramUsed);
        setRamMax(home.maxRam);
        setNow(Date.now());
      } catch (e) {
        // swallow to keep UI alive if nsRef not yet set or transient errors occur
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const ramPct = ramMax > 0 ? (ramUsed / ramMax) * 100 : 0;
  const ramColor =
    ramPct < 50 ? "#16a34a" : ramPct < 80 ? "#f59e0b" : "#dc2626";

  const containerStyle: React.CSSProperties = {
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    fontSize: 14,
    lineHeight: 1.4,
    padding: 8,
  };

  const labelStyle: React.CSSProperties = {
    color: "#9ca3af",
    marginRight: "20%",
  };

  return (
    <div style={containerStyle}>
      <div>
        <span style={labelStyle}>Time</span>
        {new Date(now).toLocaleTimeString()}
      </div>
      <div>
        <span style={labelStyle}>Money</span>
        {formatMoney(money)}
      </div>
      <div>
        <span style={labelStyle}>Hacking</span>
        {hacking}
      </div>
      <div>
        <span style={labelStyle}>Home RAM</span>
        <span style={{ color: ramColor }}>
          {ramUsed.toFixed(1)} / {ramMax.toFixed(1)} GB ({ramPct.toFixed(0)}%)
        </span>
      </div>
    </div>
  );
}

export async function main(ns: NS) {
  nsRef = ns;
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.printRaw(<RealtimeStats />);
  while (true) {
    await ns.asleep(60000);
  }
}
