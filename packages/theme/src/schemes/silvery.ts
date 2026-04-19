/**
 * Silvery's signature color schemes.
 *
 * `silvery-dark` is the default when no terminal theme is detected and the
 * background is dark; `silvery-light` is the light counterpart. Designed
 * around a cool, low-saturation palette with a silver accent — legible on
 * every terminal we test, plays well with the 38+ third-party schemes we
 * ship alongside it.
 *
 * Attribution: Bjørn Stabell (silvery project). License: MIT.
 */

import type { ColorScheme } from "@silvery/ansi"

/** Silvery Dark — the flagship dark scheme. Cool, low-saturation, silver accent. */
export const silveryDark: ColorScheme = {
  name: "silvery-dark",
  dark: true,
  primary: "#9FB7C9", // silver-blue
  black: "#1A1D23",
  red: "#D28078",
  green: "#9FB8A3",
  yellow: "#C79A58",
  blue: "#7A9BC0",
  magenta: "#B498BD",
  cyan: "#88B8C0",
  white: "#B8BEC9",
  brightBlack: "#3A3F4A",
  brightRed: "#E09389",
  brightGreen: "#B5CCB9",
  brightYellow: "#D8B074",
  brightBlue: "#9FB7C9",
  brightMagenta: "#CCB3D4",
  brightCyan: "#A0CBD4",
  brightWhite: "#E4E8EF",
  foreground: "#D8DCE3",
  background: "#1E2128",
  cursorColor: "#9FB7C9",
  cursorText: "#1E2128",
  selectionBackground: "#3A4350",
  selectionForeground: "#E4E8EF",
}

/** Silvery Light — companion light scheme. High legibility, subtle tint. */
export const silveryLight: ColorScheme = {
  name: "silvery-light",
  dark: false,
  primary: "#4A6580", // darker silver-blue for light bg
  black: "#2C3038",
  red: "#B4614A",
  green: "#5C7D60",
  yellow: "#9A7030",
  blue: "#4A6B94",
  magenta: "#845D92",
  cyan: "#4A8894",
  white: "#6A7080",
  brightBlack: "#454A55",
  brightRed: "#C07760",
  brightGreen: "#759378",
  brightYellow: "#B48845",
  brightBlue: "#5F7FA4",
  brightMagenta: "#96759E",
  brightCyan: "#5F9CA4",
  brightWhite: "#2C3038",
  foreground: "#2C3038",
  background: "#F5F6F8",
  cursorColor: "#4A6580",
  cursorText: "#F5F6F8",
  selectionBackground: "#D8DCE3",
  selectionForeground: "#2C3038",
}
