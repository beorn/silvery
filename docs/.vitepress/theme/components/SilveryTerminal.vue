<!--
  SilveryTerminal — hero image slot component for silvery.dev

  All box-drawing lines exactly 62 chars wide (verified via Python
  HTML-strip + length check). Continuous gleam drift on chrome bezel.
  Agent-style input box at the bottom as the final "awaiting input"
  affordance.
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

      <pre class="silvery-terminal__body"><span class="t-dim">╭─ </span><span class="t-accent">user</span><span class="t-dim"> ─────────────────────────────────────────────────────╮</span>
<span class="t-dim">│</span> <span class="t-command">add a blinking cursor after the tagline</span>                    <span class="t-dim">│</span>
<span class="t-dim">╰────────────────────────────────────────────────────────────╯</span>

<span class="t-tool">●</span> Read <span class="t-path">.vitepress/theme/custom.css</span>
  <span class="t-ok">✓</span> <span class="t-dim">found </span><span class="t-path">.VPHero .tagline</span><span class="t-dim"> selector at line 148</span>

<span class="t-tool">●</span> Edit <span class="t-path">.vitepress/theme/custom.css</span>
  <span class="t-dim">+ tagline::after blink animation (1Hz steps(1))</span>
  <span class="t-ok">✓</span> <span class="t-dim">applied · 12 insertions · 0 deletions</span>

<span class="t-dim">╭─ </span><span class="t-accent">assistant</span><span class="t-dim"> ────────────────────────────────────────────────╮</span>
<span class="t-dim">│</span> <span class="t-fg">Blink lands at end of tagline.</span>                             <span class="t-dim">│</span>
<span class="t-dim">│</span> <span class="t-dim">One cursor per page · matches the design doc.</span>              <span class="t-dim">│</span>
<span class="t-dim">╰────────────────────────────────────────────────────────────╯</span>

<span class="t-accent">╭────────────────────────────────────────────────────────────╮</span>
<span class="t-accent">│</span> <span class="t-prompt">❯</span> <span class="t-dim">ask anything about silvery</span>                               <span class="t-accent">│</span>
<span class="t-accent">╰────────────────────────────────────────────────────────────╯</span></pre>
    </div>
  </div>
</template>

<style scoped>
/* ----- Chrome bezel wrapper — continuous gleam drift ----- */
.silvery-terminal-wrap {
  padding: 5px;
  border-radius: 14px;
  margin: 1.5em auto 0;      /* pushed up 1 line */
  max-width: 760px;
  overflow: hidden;

  background: linear-gradient(
    110deg,
    #9aa1b0 0%,
    #9aa1b0 42%,
    #f0f3f8 50%,
    #9aa1b0 58%,
    #9aa1b0 100%
  );
  background-size: 300% 100%;
  background-position: 150% 0;
  animation: silvery-chrome-drift 9s linear infinite;   /* 2x faster: 18 → 9s */

  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

.dark .silvery-terminal-wrap {
  background: linear-gradient(
    110deg,
    #b0b6c4 0%,
    #b0b6c4 42%,
    #ffffff 50%,
    #b0b6c4 58%,
    #b0b6c4 100%
  );
  background-size: 300% 100%;
  background-position: 150% 0;
  animation: silvery-chrome-drift 9s linear infinite;
}

@keyframes silvery-chrome-drift {
  0%   { background-position: 150% 0; }
  100% { background-position: -150% 0; }
}

/* ----- Inner terminal ----- */
.silvery-terminal {
  background: #0f1419;
  color: #d6d9e0;
  border-radius: 9px;

  font-family: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
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
  padding: 12px 18px 14px;
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
.t-accent  { color: #8ea4c8; font-weight: 500; }
.t-fg      { color: #e6e9ef; }
.t-command { color: #f1f3f7; font-weight: 500; }
.t-prompt  { color: #f1f3f7; font-weight: 600; }
.t-tool    { color: #7dd3c0; }
.t-ok      { color: #8bc79a; }
.t-path    { color: #e6b872; }
.t-dim     { color: #6a7080; }

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
    padding: 10px 14px 12px;
  }
}
</style>
