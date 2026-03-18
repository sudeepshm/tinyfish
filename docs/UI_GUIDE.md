# UI/UX Guide: Modern Startup Aesthetic

The TinyFish UI has been overhauled to a premium, data-dense design inspired by the latest modern startup standards. 

## 🎨 Token & Color System

- **Background**: `#080A0F`. A near-black with a subtle blue tint for depth.
- **Card Background**: `#0E1117`. A solid surface for contrast and elevation.
- **Accents**: Dual-tone gradients (`#7C3AED` (Purple) → `#3B82F6` (Blue)).
- **Success/Warning/Error**: Verified green (`#22C55E`), amber warning (`#F59E0B`), and vibrant error (`#EF4444`).

## 🧱 Design Components

### 1. Progress component (`Progress.tsx`)
The progress view provides a real-time status of the 6-stage pipeline.
- **Pulsing Indicator**: The active stage features a 10px pulsing dot (`@keyframes pulse`) for visual engagement.
- **Gradient Progress**: A 2px linear gradient bar transitions below the active stage text.
- **Completion Checkmarks**: Finished stages display a green `✓` dot for instant confirmation.

### 2. Research Report (`ReportView.tsx`)
The final report is designed for maximum clarity and data density.
- **Score Headers**: DM Mono font set at `52px` with a dual-tone gradient fill.
- **Glowing Containers**: Score cards feature a conditional `box-shadow` border glow based on the value:
  - **Green Glow**: >= 70 (Strong)
  - **Yellow border**: 40-69 (Average)
  - **Red border**: < 40 (Weak)
- **Source Citation Chips**: Pill-shaped translucent chips for platform attribution.

### 3. Typography
- **DM Sans**: Used for all body text, UI labels, and large headings.
- **DM Mono**: Reserved for all numeric data, metric values, and timestamps to provide a precise, data-rich feel.

## 🎞 Layout & Textures
- **Body Grid Overlay**: A fixed `40x40` grid texture overlay is applied to the background via CSS pseudo-elements for an ultra-modern, "developer-first" appearance.
- **Data Densisty**: Tables use alternating row backgrounds (`zebra-styling`) at low opacity to maintain high readability without clutter.
