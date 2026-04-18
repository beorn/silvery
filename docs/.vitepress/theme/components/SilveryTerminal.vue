<!--
  SilveryTerminal — hero image slot component for silvery.dev

  Box-border color hierarchy:
    t-box         — very dim gray, for past-turn boxes (user/assistant)
    t-input-frame — bright silver-blue accent, for the ACTIVE input box

  Block cursor sits at the beginning of the input (after `❯ `), blinks.
  Input prompt `❯` is silver-blue to match the input frame.
-->

<template>
  <div class="silvery-terminal-wrap">
    <div class="silvery-terminal">
      <div class="silvery-terminal__titlebar">
        <div class="silvery-terminal__dots">
          <span class="silvery-terminal__dot silvery-terminal__dot--red"></span>
          <span class="silvery-terminal__dot silvery-terminal__dot--yellow"></span>
          <span class="silvery-terminal__dot silvery-terminal__dot--green"></span>
        </div>
        <div class="silvery-terminal__title">silvery-agent — ~/silvery</div>
      </div>

      <pre class="silvery-terminal__body"><span class="t-box">╭─ </span><span class="t-label">User</span><span class="t-box"> ─────────────────────────────────────────────────────╮</span>
<span class="t-box">│</span> <span class="t-command">add a blinking cursor after the tagline</span>                    <span class="t-box">│</span>
<span class="t-box">╰────────────────────────────────────────────────────────────╯</span>

<span class="t-tool">●</span> <span class="t-fg">Read</span> <span class="t-path">.vitepress/theme/custom.css</span>
  <span class="t-ok">✓</span> <span class="t-dim">found </span><span class="t-path">.VPHero .tagline</span><span class="t-dim"> selector at line 148</span>

<span class="t-tool">●</span> <span class="t-fg">Edit</span> <span class="t-path">.vitepress/theme/custom.css</span>
  <span class="t-dim">+ tagline::after blink animation (1Hz steps(1))</span>
  <span class="t-ok">✓</span> <span class="t-dim">applied · 12 insertions · 0 deletions</span>

<span class="t-box">╭─ </span><span class="t-label">Assistant</span><span class="t-box"> ────────────────────────────────────────────────╮</span>
<span class="t-box">│</span> <span class="t-fg">Blink lands at end of tagline.</span>                             <span class="t-box">│</span>
<span class="t-box">│</span> <span class="t-dim">One cursor per page · matches the design doc.</span>              <span class="t-box">│</span>
<span class="t-box">╰────────────────────────────────────────────────────────────╯</span>

<span class="t-input-frame">╭─ </span><span class="t-label">Input</span><span class="t-input-frame"> ────────────────────────────────────────────────────╮</span>
<span class="t-input-frame">│</span> <span class="t-prompt">❯</span> <span class="t-cursor">█</span>                                                        <span class="t-input-frame">│</span>
<span class="t-input-frame">╰────────────────────────────────────────────────────────────╯</span></pre>
    </div>
  </div>
</template>

<style scoped>
/* Chrome bezel wrapper styling lives in custom.css (global) so the
 * page-wide `silvery-page-gleam` animation and the `.dark .silvery-
 * terminal-wrap` dark-mode selector work without scoped-CSS quirks.
 * Scoped styles below are for the terminal interior only. */

/* ----- Inner terminal ----- */
.silvery-terminal {
  background: #0f1419;
  color: #d6d9e0;
  border-radius: 9px;

  font-family: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.15;
  overflow: hidden;
}

/* ----- Title bar ----- */
.silvery-terminal__titlebar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #1a1f27;
  border-bottom: 1px solid #3a4050;
}

.silvery-terminal__dots {
  display: flex;
  gap: 7px;
  flex-shrink: 0;
}

.silvery-terminal__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}

.silvery-terminal__dot--red    { background: #ff5f57; }
.silvery-terminal__dot--yellow { background: #febc2e; }
.silvery-terminal__dot--green  { background: #28c840; }

.silvery-terminal__title {
  font-size: 12px;
  color: #e6e9ef;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.01em;
}

/* ----- Body ----- */
.silvery-terminal__body {
  margin: 0;
  padding: 14px 18px 16px;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  color: inherit;
  background: transparent;
  white-space: pre;
  overflow-x: auto;

  font-feature-settings: "liga" 0, "calt" 0;
  font-variant-ligatures: none;
  font-kerning: none;
}

/* ----- Token colors ----- */
.t-label       { color: #e6b872; font-weight: 600; }   /* section labels */
.t-fg          { color: #e6e9ef; font-weight: 500; }
.t-command     { color: #ffffff; font-weight: 500; }
.t-tool        { color: #7dd3c0; font-weight: 600; }
.t-ok          { color: #8bc79a; font-weight: 600; }
.t-path        { color: #8ea4c8; font-weight: 500; }
.t-dim         { color: #6a7080; }                     /* dim text content */

/* Box border hierarchy
 * t-box         — very dim past-turn borders (user + assistant)
 * t-input-frame — bright silver-blue active input border */
.t-box         { color: #2f343d; }                     /* much dimmer than t-dim */
.t-input-frame { color: #9fb3d8; font-weight: 600; }

/* Input prompt glyph — silver-blue to match input frame */
.t-prompt { color: #9fb3d8; font-weight: 700; }

/* Static block cursor at start of input field (no blink — it's a mockup,
 * a blinking cursor falsely implies the input is interactive). */
.t-cursor {
  color: #e6e9ef;
}

/* Responsive */
@media (max-width: 820px) {
  .silvery-terminal-wrap {
    max-width: 100%;
    margin-top: 1em;
    padding: 4px;
    border-radius: 12px;
  }
  .silvery-terminal {
    font-size: 11px;
    border-radius: 8px;
  }
  .silvery-terminal__body {
    padding: 12px 14px 14px;
  }
}
</style>
