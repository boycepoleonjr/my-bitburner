/**
 * Target Server Monitor (React UI)
 * VERSION: 1.0.0
 * LAST UPDATED: 2025-12-02
 *
 * Monitors detailed server statistics for all current targets being farmed
 * by active modules (XP Farmer, Early Game, etc.)
 *
 * Usage:
 *   run target-monitor.tsx           - Monitor all targets from all modules
 *   run target-monitor.tsx xp        - Monitor XP farmer targets only
 *   run target-monitor.tsx early     - Monitor early game targets only
 */

import React, { useState, useEffect } from "react";
import { readState, formatNumber } from '/ns-utils';

interface TargetStats {
    hostname: string;
    source: string;
    securityLevel: number;
    minSecurityLevel: number;
    securityDelta: number;
    moneyAvailable: number;
    moneyMax: number;
    moneyPercent: number;
    hackTime: number;
    growTime: number;
    weakenTime: number;
    hackChance: number;
    requiredHackLevel: number;
    hackingLevel: number;
    canHack: boolean;
    recommendedAction: string;
    isOptimal: boolean;
}

export async function main(ns: NS): Promise<void> {
    const mode = (ns.args[0] as string || 'all').toLowerCase();

    ns.disableLog('ALL');
    ns.tail();

    ns.printRaw(<TargetMonitorUI ns={ns} mode={mode} />);
}

function TargetMonitorUI({ ns, mode }: { ns: NS; mode: string }) {
    const [targets, setTargets] = useState<TargetStats[]>([]);
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    useEffect(() => {
        const updateTargets = () => {
            const allTargets: TargetStats[] = [];

            // Get XP farmer targets
            if (mode === 'all' || mode === 'xp') {
                const xpTargets = getXPFarmerTargets(ns);
                allTargets.push(...xpTargets);
            }

            // Get early game targets
            if (mode === 'all' || mode === 'early') {
                const earlyTargets = getEarlyGameTargets(ns);
                allTargets.push(...earlyTargets);
            }

            setTargets(allTargets);
            setLastUpdate(new Date());
        };

        updateTargets();
        const interval = setInterval(updateTargets, 2000);

        return () => clearInterval(interval);
    }, [ns, mode]);

    // Calculate summary stats
    const totalTargets = targets.length;
    const optimalTargets = targets.filter(t => t.isOptimal).length;
    const weakenNeeded = targets.filter(t => t.recommendedAction === 'WEAKEN').length;
    const growNeeded = targets.filter(t => t.recommendedAction === 'GROW').length;
    const hackReady = targets.filter(t => t.recommendedAction === 'HACK').length;
    const avgMoney = totalTargets > 0 ? targets.reduce((sum, t) => sum + t.moneyPercent, 0) / totalTargets : 0;
    const avgSecurity = totalTargets > 0 ? targets.reduce((sum, t) => sum + t.securityDelta, 0) / totalTargets : 0;

    return (
        <div style={{
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#0f0',
            backgroundColor: '#000',
            padding: '10px',
            width: '100%',
        }}>
            <div style={{
                textAlign: 'center',
                fontSize: '16px',
                fontWeight: 'bold',
                marginBottom: '10px',
                borderBottom: '2px solid #0f0',
                paddingBottom: '5px',
            }}>
                TARGET SERVER MONITOR
            </div>

            <div style={{ marginBottom: '10px', fontSize: '11px', color: '#888' }}>
                Mode: {mode} | Last Update: {lastUpdate.toLocaleTimeString()} | Targets: {totalTargets}
            </div>

            {/* Summary Panel */}
            <div style={{
                border: '1px solid #0f0',
                padding: '10px',
                marginBottom: '15px',
                backgroundColor: '#001100',
            }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>SUMMARY</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                    <div>Optimal: {optimalTargets}/{totalTargets}</div>
                    <div>Avg Money: {avgMoney.toFixed(1)}%</div>
                    <div>Needs Weaken: {weakenNeeded}</div>
                    <div>Avg Security Δ: +{avgSecurity.toFixed(2)}</div>
                    <div>Needs Grow: {growNeeded}</div>
                    <div>Ready to Hack: {hackReady}</div>
                </div>
            </div>

            {/* Target Cards */}
            {targets.length === 0 ? (
                <div style={{
                    border: '1px solid #f80',
                    padding: '20px',
                    textAlign: 'center',
                    color: '#f80',
                }}>
                    No active targets found. Make sure modules are running.
                </div>
            ) : (
                targets.map((target, idx) => (
                    <TargetCard key={`${target.hostname}-${idx}`} target={target} />
                ))
            )}
        </div>
    );
}

function TargetCard({ target }: { target: TargetStats }) {
    const getStatusColor = () => {
        if (target.isOptimal) return '#0f0';
        if (!target.canHack) return '#f00';
        return '#ff0';
    };

    const getActionColor = () => {
        switch (target.recommendedAction) {
            case 'WEAKEN': return '#ff0';
            case 'GROW': return '#0af';
            case 'HACK': return '#0f0';
            default: return '#888';
        }
    };

    const getActionIcon = () => {
        switch (target.recommendedAction) {
            case 'WEAKEN': return '⚠';
            case 'GROW': return '↑';
            case 'HACK': return '→';
            default: return '?';
        }
    };

    return (
        <div style={{
            border: `2px solid ${getStatusColor()}`,
            marginBottom: '15px',
            backgroundColor: '#001100',
        }}>
            {/* Header */}
            <div style={{
                backgroundColor: getStatusColor(),
                color: '#000',
                padding: '5px 10px',
                fontWeight: 'bold',
                display: 'flex',
                justifyContent: 'space-between',
            }}>
                <span>{target.hostname}</span>
                <span style={{ fontSize: '10px' }}>[{target.source}]</span>
            </div>

            <div style={{ padding: '10px' }}>
                {/* Status & Action */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                    paddingBottom: '8px',
                    borderBottom: '1px solid #0f0',
                }}>
                    <div>
                        Status: <span style={{ color: getStatusColor(), fontWeight: 'bold' }}>
                            {target.isOptimal ? '✓ OPTIMAL' : target.canHack ? '○ SUBOPTIMAL' : '✗ CANNOT HACK'}
                        </span>
                    </div>
                    <div>
                        Action: <span style={{ color: getActionColor(), fontWeight: 'bold' }}>
                            {getActionIcon()} {target.recommendedAction}
                        </span>
                    </div>
                </div>

                {/* Security Bar */}
                <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', marginBottom: '3px' }}>
                        Security: {target.securityLevel.toFixed(2)} / {target.minSecurityLevel.toFixed(2)}
                        <span style={{ color: target.securityDelta > 5 ? '#f00' : target.securityDelta > 1 ? '#ff0' : '#0f0' }}>
                            {' '}(+{target.securityDelta.toFixed(2)})
                        </span>
                    </div>
                    <ProgressBar
                        value={target.securityLevel}
                        min={target.minSecurityLevel}
                        max={target.minSecurityLevel + 100}
                        color="#f00"
                    />
                </div>

                {/* Money Bar */}
                <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '11px', marginBottom: '3px' }}>
                        Money: ${formatNumber(target.moneyAvailable)} / ${formatNumber(target.moneyMax)}
                        <span style={{ color: target.moneyPercent > 90 ? '#0f0' : target.moneyPercent > 50 ? '#ff0' : '#f00' }}>
                            {' '}({target.moneyPercent.toFixed(1)}%)
                        </span>
                    </div>
                    <ProgressBar
                        value={target.moneyAvailable}
                        min={0}
                        max={target.moneyMax}
                        color="#0f0"
                    />
                </div>

                {/* Stats Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '5px',
                    fontSize: '11px',
                    marginTop: '10px',
                    paddingTop: '8px',
                    borderTop: '1px solid #0f0',
                }}>
                    <div>Hack Time: {formatTime(target.hackTime)}</div>
                    <div>Hack Chance: {target.hackChance.toFixed(1)}%</div>
                    <div>Grow Time: {formatTime(target.growTime)}</div>
                    <div>Weaken Time: {formatTime(target.weakenTime)}</div>
                    <div>Required Level: {target.requiredHackLevel}</div>
                    <div>
                        Your Level: {target.hackingLevel}
                        <span style={{ color: target.canHack ? '#0f0' : '#f00' }}>
                            {' '}({target.hackingLevel >= target.requiredHackLevel ? '+' : ''}{target.hackingLevel - target.requiredHackLevel})
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ProgressBar({ value, min, max, color }: { value: number; min: number; max: number; color: string }) {
    const range = max - min;
    const percent = range > 0 ? ((value - min) / range) * 100 : 0;
    const clampedPercent = Math.max(0, Math.min(100, percent));

    return (
        <div style={{
            width: '100%',
            height: '12px',
            backgroundColor: '#002200',
            border: '1px solid #0f0',
            position: 'relative',
        }}>
            <div style={{
                width: `${clampedPercent}%`,
                height: '100%',
                backgroundColor: color,
                transition: 'width 0.3s ease',
            }} />
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '9px',
                color: '#fff',
                textShadow: '1px 1px 2px #000',
            }}>
                {clampedPercent.toFixed(1)}%
            </div>
        </div>
    );
}

function getXPFarmerTargets(ns: NS): TargetStats[] {
    const xpState = readState(ns, '/state/module-configs/xp-farmer-state.txt', null);

    if (!xpState || !xpState.isActive || !xpState.activeTargets) {
        return [];
    }

    return xpState.activeTargets.map((target: any) =>
        analyzeTarget(ns, target.hostname, 'XP Farmer')
    ).filter(t => t !== null) as TargetStats[];
}

function getEarlyGameTargets(ns: NS): TargetStats[] {
    const earlyState = readState(ns, '/state/module-configs/early-game-state.txt', null);

    if (!earlyState || !earlyState.isActive || !earlyState.hackingState?.activeTargets) {
        return [];
    }

    return earlyState.hackingState.activeTargets.map((target: any) =>
        analyzeTarget(ns, target.hostname, 'Early Game')
    ).filter(t => t !== null) as TargetStats[];
}

function analyzeTarget(ns: NS, hostname: string, source: string): TargetStats | null {
    try {
        const server = ns.getServer(hostname);
        const player = ns.getPlayer();

        const securityLevel = server.hackDifficulty || server.minDifficulty || 0;
        const minSecurityLevel = server.minDifficulty || 0;
        const securityDelta = securityLevel - minSecurityLevel;

        const moneyAvailable = server.moneyAvailable || 0;
        const moneyMax = server.moneyMax || 0;
        const moneyPercent = moneyMax > 0 ? (moneyAvailable / moneyMax) * 100 : 0;

        const hackTime = ns.getHackTime(hostname) / 1000;
        const growTime = ns.getGrowTime(hostname) / 1000;
        const weakenTime = ns.getWeakenTime(hostname) / 1000;
        const hackChance = ns.hackAnalyzeChance(hostname) * 100;

        const requiredHackLevel = server.requiredHackingSkill || 0;
        const hackingLevel = player.skills.hacking;
        const canHack = hackingLevel >= requiredHackLevel;

        let recommendedAction = 'UNKNOWN';
        let isOptimal = false;

        if (securityDelta > 5) {
            recommendedAction = 'WEAKEN';
        } else if (moneyPercent < 50) {
            recommendedAction = 'GROW';
        } else {
            recommendedAction = 'HACK';
            isOptimal = securityDelta < 1 && moneyPercent > 90;
        }

        return {
            hostname,
            source,
            securityLevel,
            minSecurityLevel,
            securityDelta,
            moneyAvailable,
            moneyMax,
            moneyPercent,
            hackTime,
            growTime,
            weakenTime,
            hackChance,
            requiredHackLevel,
            hackingLevel,
            canHack,
            recommendedAction,
            isOptimal,
        };
    } catch (error) {
        return null;
    }
}

function formatTime(seconds: number): string {
    if (seconds < 60) {
        return `${seconds.toFixed(1)}s`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes}m ${secs.toFixed(0)}s`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }
}

export function autocomplete(): string[][] {
    return [
        ['all', 'xp', 'early']
    ];
}
