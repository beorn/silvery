<!--
  SilveryTerminal — hero image slot component for silvery.dev

  A macOS-Terminal.app-fidelity mockup showing a silvery coding agent mid-task.
  Renders into VitePress's built-in `home-hero-image` slot.

  Design constraints (from hub/silvery/design/silvery-dev-design-system.md):
  - Chrome bezel: thin, uniform on all sides
  - Title bar: macOS traffic lights + left-aligned title
  - Interior: ANSI-fidelity only (no gradients, shadows, rounded highlights)
  - All interior text in JetBrains Mono
  - Interior stays dark in both site light/dark modes
  - No cursor inside the terminal (tagline cursor is the only one)
-->

<template>
  <div class="silvery-terminal">
    <div class="silvery-terminal__titlebar">
      <div class="silvery-terminal__dots">
        <span class="silvery-terminal__dot silvery-terminal__dot--red"></span>
        <span class="silvery-terminal__dot silvery-terminal__dot--yellow"></span>
        <span class="silvery-terminal__dot silvery-terminal__dot--green"></span>
      </div>
      <div class="silvery-terminal__title">silvery-agent — ~/app</div>
    </div>
    <div class="silvery-terminal__body">
      <div class="silvery-terminal__line">
        <span class="silvery-terminal__prompt">&gt;</span>
        <span class="silvery-terminal__command"> build me a landing page for silvery</span>
      </div>
      <div class="silvery-terminal__line">
        <span class="silvery-terminal__check">✓</span>
        <span> reading docs/index.md</span>
      </div>
      <div class="silvery-terminal__line">
        <span class="silvery-terminal__check">✓</span>
        <span> drafting hero copy</span>
      </div>
      <div class="silvery-terminal__line">
        <span class="silvery-terminal__check">✓</span>
        <span> generating feature card grid</span>
      </div>
      <div class="silvery-terminal__line">
        <span class="silvery-terminal__pending">⏳</span>
        <span> rendering typography tokens</span>
      </div>
      <div class="silvery-terminal__line">
        <span class="silvery-terminal__pending">⏳</span>
        <span> applying chrome bezel gleam</span>
      </div>
      <div class="silvery-terminal__line silvery-terminal__line--muted">
        <span>→ compiled 12 components in 340ms</span>
      </div>
      <div class="silvery-terminal__line silvery-terminal__line--muted">
        <span>→ dev server ready · http://localhost:3000</span>
      </div>
      <div class="silvery-terminal__line">
        <span class="silvery-terminal__prompt">❯</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Terminal wrapper */
.silvery-terminal {
  /* Stays dark in both light and dark site modes */
  background: #1a1d24;
  color: #c9ccd4;

  /* Thin uniform chrome bezel */
  border: 3px solid #3a3f4a;
  border-radius: 10px;

  /* Subtle lift — one single-px hairline for depth, no drop shadow */
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04) inset,
    0 4px 20px rgba(0, 0, 0, 0.25);

  font-family: var(--silvery-font-mono, "JetBrains Mono", ui-monospace, monospace);
  font-size: 14px;
  line-height: 1.2; /* tight, terminal-native */

  overflow: hidden;
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
}

/* Title bar — macOS Terminal.app style */
.silvery-terminal__titlebar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #252830;
  border-bottom: 1px solid #3a3f4a;
}

.silvery-terminal__dots {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.silvery-terminal__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}

.silvery-terminal__dot--red {
  background: #ff5f57;
}
.silvery-terminal__dot--yellow {
  background: #febc2e;
}
.silvery-terminal__dot--green {
  background: #28c840;
}

/* Title left-aligned after traffic lights (newer Terminal.app) */
.silvery-terminal__title {
  font-size: 12px;
  color: #7a8090;
  font-weight: 400;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Body — interior buffer */
.silvery-terminal__body {
  padding: 14px 16px;
  /* NO rounded corners, NO gradients inside. ANSI-fidelity. */
}

.silvery-terminal__line {
  display: block;
  white-space: pre;
}

.silvery-terminal__line--muted {
  color: #7a8090;
}

.silvery-terminal__prompt {
  color: #7a8090;
}

.silvery-terminal__command {
  color: #c9ccd4;
}

.silvery-terminal__check {
  color: #6a9b7a; /* terminal-green success */
}

.silvery-terminal__pending {
  color: #c9ccd4;
}

/* Responsive — shrink on narrower viewports */
@media (max-width: 640px) {
  .silvery-terminal {
    font-size: 12px;
    max-width: 100%;
  }
  .silvery-terminal__body {
    padding: 10px 12px;
  }
}
</style>
