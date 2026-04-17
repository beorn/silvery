<!--
  SilveryTerminal — hero image slot component for silvery.dev

  macOS-Terminal.app-fidelity mockup. Interior uses Unicode
  box-drawing characters for panel structure — genuinely ANSI-graphical
  in the lazygit / neovim tradition.

  Design constraints:
  - Thin chrome bezel, lighter color (not near-black)
  - Title bar: macOS traffic lights + bold left-aligned title
  - Smaller font to fit more content
  - ANSI-only interior (box-drawing chars, SGR colors)
  - No cursor inside (and user removed the tagline cursor too)
  - Pushed down 2 lines to vertically balance with hero copy
-->

<template>
  <div class="silvery-terminal">
    <div class="silvery-terminal__titlebar">
      <div class="silvery-terminal__dots">
        <span class="silvery-terminal__dot silvery-terminal__dot--red"></span>
        <span class="silvery-terminal__dot silvery-terminal__dot--yellow"></span>
        <span class="silvery-terminal__dot silvery-terminal__dot--green"></span>
      </div>
      <div class="silvery-terminal__title">silvery-agent — ~/silvery</div>
    </div>

    <div class="silvery-terminal__body">
      <!-- User prompt panel -->
      <div class="silvery-terminal__line t-dim">╭─ <span class="t-accent">user</span> <span class="t-dim">──────────────────────────────╮</span></div>
      <div class="silvery-terminal__line t-dim">│ <span class="t-command">add a blinking cursor after the</span>    <span class="t-dim">│</span></div>
      <div class="silvery-terminal__line t-dim">│ <span class="t-command">tagline</span>                            <span class="t-dim">│</span></div>
      <div class="silvery-terminal__line t-dim">╰────────────────────────────────────╯</div>
      <div class="silvery-terminal__line t-spacer"></div>

      <!-- Agent work -->
      <div class="silvery-terminal__line">
        <span class="t-think">⏺</span> <span class="t-dim">Planning the change...</span>
      </div>
      <div class="silvery-terminal__line t-spacer-sm"></div>

      <div class="silvery-terminal__line">
        <span class="t-tool">●</span> Read <span class="t-path">.vitepress/theme/custom.css</span>
      </div>
      <div class="silvery-terminal__line">
        <span>  </span><span class="t-ok">✓</span> <span class="t-dim">found</span> <span class="t-path">.VPHero .tagline</span>
      </div>
      <div class="silvery-terminal__line t-spacer-sm"></div>

      <div class="silvery-terminal__line">
        <span class="t-tool">●</span> Edit <span class="t-path">.vitepress/theme/custom.css</span>
      </div>
      <div class="silvery-terminal__line">
        <span class="t-dim">  + tagline::after blink animation</span>
      </div>
      <div class="silvery-terminal__line">
        <span class="t-dim">  + 1Hz steps(1), currentColor</span>
      </div>
      <div class="silvery-terminal__line">
        <span>  </span><span class="t-ok">✓</span> <span class="t-dim">applied · 12 insertions</span>
      </div>
      <div class="silvery-terminal__line t-spacer"></div>

      <!-- Assistant reply panel -->
      <div class="silvery-terminal__line t-dim">╭─ <span class="t-accent">assistant</span> <span class="t-dim">──────────────────────╮</span></div>
      <div class="silvery-terminal__line t-dim">│ <span class="t-fg">Blink lands at end of tagline.</span>     <span class="t-dim">│</span></div>
      <div class="silvery-terminal__line t-dim">│ <span class="t-dim">One cursor per page · matches doc.</span> <span class="t-dim">│</span></div>
      <div class="silvery-terminal__line t-dim">╰────────────────────────────────────╯</div>
    </div>
  </div>
</template>

<style scoped>
/* ----- Terminal wrapper ----- */
.silvery-terminal {
  /* Interior stays dark in both site modes */
  background: #0f1419;
  color: #d6d9e0;

  /* Lighter chrome bezel */
  border: 2px solid #5a6272;
  border-radius: 10px;

  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.05) inset,
    0 4px 24px rgba(0, 0, 0, 0.3);

  font-family: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 11px;           /* smaller to fit more */
  line-height: 1.38;

  overflow: hidden;
  width: 100%;
  max-width: 480px;          /* slightly narrower */
  margin: 2.5em auto 0;      /* push down 2 lines */
}

/* ----- Title bar ----- */
.silvery-terminal__titlebar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #1a1f27;
  border-bottom: 1px solid #3a4050;
}

.silvery-terminal__dots {
  display: flex;
  gap: 7px;
  flex-shrink: 0;
}

.silvery-terminal__dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  display: inline-block;
}

.silvery-terminal__dot--red   { background: #ff5f57; }
.silvery-terminal__dot--yellow { background: #febc2e; }
.silvery-terminal__dot--green { background: #28c840; }

/* Title — bold, high-contrast, left-aligned */
.silvery-terminal__title {
  font-size: 11px;
  color: #e6e9ef;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.01em;
}

/* ----- Body ----- */
.silvery-terminal__body {
  padding: 12px 14px 14px;
}

.silvery-terminal__line {
  display: block;
  white-space: pre;
  font-feature-settings: "liga" 0, "calt" 0;  /* preserve box-drawing alignment */
}

.silvery-terminal__line.t-spacer     { height: 0.6em; }
.silvery-terminal__line.t-spacer-sm  { height: 0.2em; }

/* ----- Token colors (ANSI-ish palette) ----- */

.t-accent  { color: #8ea4c8; font-weight: 500; }
.t-fg      { color: #e6e9ef; }
.t-prompt  { color: #7a8090; }
.t-command { color: #f1f3f7; font-weight: 500; }
.t-think   { color: #8ea4c8; }
.t-tool    { color: #7dd3c0; }
.t-ok      { color: #8bc79a; }
.t-path    { color: #e6b872; }
.t-dim     { color: #6a7080; }

/* Responsive */
@media (max-width: 640px) {
  .silvery-terminal {
    font-size: 10px;
    max-width: 100%;
    margin-top: 1.5em;
  }
  .silvery-terminal__body {
    padding: 10px 12px 12px;
  }
}
</style>
