# React UI Style Guide for Bitburner Scripts

A comprehensive guide for creating consistent, visually striking React UI scripts with the **Terminal Green** aesthetic.

---

## Table of Contents

1. [Theme Colors](#theme-colors)
2. [Typography](#typography)
3. [Component Patterns](#component-patterns)
4. [Layout Patterns](#layout-patterns)
5. [Visual Effects](#visual-effects)
6. [Script Boilerplate](#script-boilerplate)
7. [Best Practices](#best-practices)

---

## Theme Colors

Use this standardized color palette for all UI components:

```typescript
const THEME = {
  // Backgrounds
  bg: '#000000',           // Pure black background
  bgDark: '#0a0a0a',       // Slightly lighter black for depth
  bgPanel: '#001a00',      // Dark green tinted panels

  // Primary greens (brightest to dimmest)
  primary: '#00ff41',      // Bright terminal green - main text, highlights
  secondary: '#00cc33',    // Medium green - secondary elements
  tertiary: '#008822',     // Darker green - labels, less important
  dim: '#004411',          // Very dim green - disabled, background accents

  // Semantic aliases
  text: '#00ff41',         // Default text color
  textDim: '#00aa2a',      // Muted text
  border: '#00ff41',       // Bright borders
  borderDim: '#004411',    // Subtle borders

  // Status colors (all green variants)
  success: '#00ff41',      // Bright green
  warning: '#33ff33',      // Lighter green
  danger: '#00aa00',       // Muted green (danger is subdued in this theme)

  // Effects
  scanline: 'rgba(0, 255, 65, 0.03)',  // CRT scanline overlay
};
```

### Color Usage Guidelines

| Element | Color |
|---------|-------|
| Headers, important text | `primary` (#00ff41) |
| Secondary information | `secondary` (#00cc33) |
| Labels, field names | `tertiary` (#008822) |
| Disabled, inactive | `dim` (#004411) |
| Dividers, subtle borders | `borderDim` (#004411) |
| Panel backgrounds | `bgPanel` (#001a00) |

---

## Typography

### Font Stack

```typescript
fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", monospace'
```

Alternative minimal stack:
```typescript
fontFamily: 'monospace'
```

### Font Sizes

| Element | Size |
|---------|------|
| ASCII Art Headers | 10px |
| Section Headers | 14px |
| Body Text | 12px |
| Labels/Meta | 11px |
| Footer/Status | 10px |

### Text Effects

**Glowing Text** (for headers and important values):
```typescript
textShadow: `0 0 10px ${THEME.primary}`
```

**Intense Glow** (for ASCII art headers):
```typescript
textShadow: `0 0 20px ${THEME.primary}, 0 0 40px ${THEME.secondary}`
```

**Letter Spacing** (for headers):
```typescript
letterSpacing: '1px'
```

---

## Component Patterns

### Panel/Card Component

```tsx
<div
  style={{
    border: `1px solid ${THEME.borderDim}`,
    backgroundColor: THEME.bgPanel,
    padding: '12px',
    marginBottom: '4px',
    boxShadow: `0 0 8px ${THEME.dim}`,
  }}
>
  {/* Content */}
</div>
```

### Panel Header

```tsx
<div
  style={{
    fontWeight: 'bold',
    fontSize: '14px',
    color: THEME.primary,
    marginBottom: '8px',
    borderBottom: `1px solid ${THEME.borderDim}`,
    paddingBottom: '6px',
    textShadow: `0 0 10px ${THEME.primary}`,
    letterSpacing: '1px',
  }}
>
  {'> '}{title}
</div>
```

### Status Bar

```tsx
<div
  style={{
    marginBottom: '16px',
    padding: '12px',
    border: `1px solid ${THEME.border}`,
    backgroundColor: THEME.bgPanel,
    boxShadow: `0 0 15px ${THEME.dim}, inset 0 0 30px ${THEME.bgDark}`,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
    fontSize: '11px',
  }}
>
  <div>
    <span style={{ color: THEME.tertiary }}>LABEL:</span>{' '}
    <span style={{ color: THEME.primary, textShadow: `0 0 8px ${THEME.primary}` }}>
      {value}
    </span>
  </div>
</div>
```

### Label + Value Pattern

```tsx
<div style={{ color: THEME.textDim }}>
  <span style={{ color: THEME.tertiary }}>FIELD_NAME:</span>{' '}
  <span style={{ color: THEME.primary }}>{value}</span>
</div>
```

### Separator Pattern

```tsx
<span style={{ color: THEME.dim }}>/</span>
```

---

## Layout Patterns

### Main Container

```tsx
<div
  style={{
    fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", monospace',
    fontSize: '12px',
    color: THEME.text,
    backgroundColor: THEME.bg,
    padding: '16px',
    minHeight: '100vh',
    position: 'relative',
    backgroundImage: `
      repeating-linear-gradient(
        0deg,
        ${THEME.scanline} 0px,
        ${THEME.scanline} 1px,
        transparent 1px,
        transparent 2px
      )
    `,
  }}
>
  {/* Content */}
</div>
```

### Grid Layouts

**Auto-fit Grid** (responsive):
```typescript
display: 'grid',
gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
gap: '8px',
```

**Fixed Column Grid**:
```typescript
display: 'grid',
gridTemplateColumns: '1fr 1fr 1fr',
gap: '10px',
```

### Footer

```tsx
<div
  style={{
    marginTop: '16px',
    padding: '8px',
    borderTop: `1px solid ${THEME.borderDim}`,
    fontSize: '10px',
    color: THEME.dim,
    textAlign: 'center',
  }}
>
  [CTRL+C TO TERMINATE] [SCRIPT NAME v1.0]
</div>
```

---

## Visual Effects

### CRT Scanlines

Apply to main container `backgroundImage`:
```typescript
backgroundImage: `
  repeating-linear-gradient(
    0deg,
    ${THEME.scanline} 0px,
    ${THEME.scanline} 1px,
    transparent 1px,
    transparent 2px
  )
`
```

### Glow Effects

**Box glow** (for panels):
```typescript
boxShadow: `0 0 8px ${THEME.dim}`
```

**Intense box glow** (for status bars):
```typescript
boxShadow: `0 0 15px ${THEME.dim}, inset 0 0 30px ${THEME.bgDark}`
```

**Text glow**:
```typescript
textShadow: `0 0 10px ${THEME.primary}`
```

### ASCII Art Headers

```tsx
<div
  style={{
    textAlign: 'center',
    marginBottom: '16px',
    color: THEME.primary,
    textShadow: `0 0 20px ${THEME.primary}, 0 0 40px ${THEME.secondary}`,
    whiteSpace: 'pre',
    fontFamily: 'monospace',
    fontSize: '10px',
    lineHeight: 1.2,
  }}
>
{`
╔═══════════════════════════════════════╗
║   YOUR ASCII ART HERE                 ║
╚═══════════════════════════════════════╝
`}
</div>
```

Generate ASCII art at: https://patorjk.com/software/taag/ (use "ANSI Shadow" font)

---

## Script Boilerplate

```tsx
/**
 * Script Name
 * Description of what this script does
 * 
 * Usage:
 *   run script-name.tsx [args]
 */

// @ts-ignore import React from "react";
declare const React: any;

let nsRef: NS;

// ═══════════════════════════════════════════════════════════════
// THEME COLORS
// ═══════════════════════════════════════════════════════════════
const THEME = {
  bg: '#000000',
  bgDark: '#0a0a0a',
  bgPanel: '#001a00',
  primary: '#00ff41',
  secondary: '#00cc33',
  tertiary: '#008822',
  dim: '#004411',
  text: '#00ff41',
  textDim: '#00aa2a',
  border: '#00ff41',
  borderDim: '#004411',
  success: '#00ff41',
  warning: '#33ff33',
  danger: '#00aa00',
  scanline: 'rgba(0, 255, 65, 0.03)',
};

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function formatMoney(amount: number): string {
  if (amount >= 1e12) return `$${(amount / 1e12).toFixed(2)}T`;
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(2)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(2)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(2)}K`;
  return `$${amount.toFixed(0)}`;
}

// ═══════════════════════════════════════════════════════════════
// REACT COMPONENTS
// ═══════════════════════════════════════════════════════════════

function MainUI() {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    const update = () => {
      try {
        // Fetch data using nsRef
        // setData(...)
      } catch (error) {
        // Silently handle errors to keep UI alive
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        fontFamily: '"Fira Code", "Cascadia Code", "JetBrains Mono", monospace',
        fontSize: '12px',
        color: THEME.text,
        backgroundColor: THEME.bg,
        padding: '16px',
        minHeight: '100vh',
        backgroundImage: `
          repeating-linear-gradient(
            0deg,
            ${THEME.scanline} 0px,
            ${THEME.scanline} 1px,
            transparent 1px,
            transparent 2px
          )
        `,
      }}
    >
      {/* ASCII Header */}
      <div
        style={{
          textAlign: 'center',
          marginBottom: '16px',
          color: THEME.primary,
          textShadow: `0 0 20px ${THEME.primary}, 0 0 40px ${THEME.secondary}`,
          whiteSpace: 'pre',
          fontFamily: 'monospace',
          fontSize: '10px',
          lineHeight: 1.2,
        }}
      >
{`
╔═══════════════════════════════════════╗
║         SCRIPT TITLE                  ║
╚═══════════════════════════════════════╝
`}
      </div>

      {/* Main Content */}
      <div>
        {/* Your content here */}
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: '16px',
          padding: '8px',
          borderTop: `1px solid ${THEME.borderDim}`,
          fontSize: '10px',
          color: THEME.dim,
          textAlign: 'center',
        }}
      >
        [CTRL+C TO TERMINATE] [SCRIPT v1.0]
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

export async function main(ns: NS): Promise<void> {
  nsRef = ns;
  ns.disableLog('ALL');
  ns.clearLog();
  ns.ui.openTail();

  ns.printRaw(<MainUI />);

  // Keep script alive for React component
  while (true) {
    await ns.asleep(60000);
  }
}
```

---

## Best Practices

### 1. Error Handling

Always wrap NS API calls in try-catch within React effects:
```typescript
React.useEffect(() => {
  const update = () => {
    try {
      // NS API calls
    } catch (error) {
      // Silently fail to keep UI alive
    }
  };
  // ...
}, []);
```

### 2. Global NS Reference

Store NS in a module-level variable for React component access:
```typescript
let nsRef: NS;

export async function main(ns: NS) {
  nsRef = ns;
  // ...
}
```

### 3. Keep Script Alive

React components need the script to stay running:
```typescript
while (true) {
  await ns.asleep(60000);
}
```

### 4. Disable Logs

Prevent log spam by disabling all logs:
```typescript
ns.disableLog('ALL');
```

### 5. Consistent Naming

- Use SCREAMING_SNAKE_CASE for labels: `HACK_LVL:`, `SEC:`, `FUNDS:`
- Prefix prompts with `>` or `>>>`
- Use brackets for status: `[ROOT]`, `[LOCKED]`, `[ACTIVE]`

### 6. Color Hierarchy

- **Bright green** (`primary`): Values, important data
- **Medium green** (`secondary`): Secondary values
- **Dark green** (`tertiary`): Labels, field names
- **Dim green** (`dim`): Separators, inactive elements

### 7. Responsive Design

Use `repeat(auto-fit, minmax(Xpx, 1fr))` for grids that adapt to window size.

---

## Reference Files

- `servers/home/net-mon.tsx` - Network monitor (full implementation)
- `servers/home/realtime-stats.tsx` - Simple stats display

---

*Style Guide v1.0 - Terminal Green Aesthetic*

