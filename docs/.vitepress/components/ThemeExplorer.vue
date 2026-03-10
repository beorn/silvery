<script setup>
import { ref, computed, watch } from "vue"

// ── Palette data (extracted from @silvery/theme built-in palettes) ──────
const palettes = [
  {
    name: "catppuccin-mocha",
    dark: true,
    background: "#1E1E2E",
    foreground: "#CDD6F4",
    black: "#11111B",
    red: "#F38BA8",
    green: "#A6E3A1",
    yellow: "#F9E2AF",
    blue: "#89B4FA",
    magenta: "#CBA6F7",
    cyan: "#94E2D5",
    white: "#A6ADC8",
    brightBlack: "#313244",
    brightRed: "#FAB387",
    brightGreen: "#B3E7AF",
    brightYellow: "#FAE6BB",
    brightBlue: "#9BBFFB",
    brightMagenta: "#F5C2E7",
    brightCyan: "#A4E6DB",
    brightWhite: "#CDD6F4",
    cursorColor: "#CDD6F4",
    cursorText: "#1E1E2E",
    selectionBackground: "#6C7086",
    selectionForeground: "#CDD6F4",
  },
  {
    name: "catppuccin-frappe",
    dark: true,
    background: "#303446",
    foreground: "#C6D0F5",
    black: "#232634",
    red: "#E78284",
    green: "#A6D189",
    yellow: "#E5C890",
    blue: "#8CAAEE",
    magenta: "#CA9EE6",
    cyan: "#81C8BE",
    white: "#A5ADCE",
    brightBlack: "#414559",
    brightRed: "#EF9F76",
    brightGreen: "#B3D89B",
    brightYellow: "#E9D0A1",
    brightBlue: "#9DB7F1",
    brightMagenta: "#F4B8E4",
    brightCyan: "#94D0C8",
    brightWhite: "#C6D0F5",
    cursorColor: "#C6D0F5",
    cursorText: "#303446",
    selectionBackground: "#737994",
    selectionForeground: "#C6D0F5",
  },
  {
    name: "catppuccin-macchiato",
    dark: true,
    background: "#24273A",
    foreground: "#CAD3F5",
    black: "#181926",
    red: "#ED8796",
    green: "#A6DA95",
    yellow: "#EED49F",
    blue: "#8AADF4",
    magenta: "#C6A0F6",
    cyan: "#8BD5CA",
    white: "#A5ADCB",
    brightBlack: "#363A4F",
    brightRed: "#F5A97F",
    brightGreen: "#B3E0A5",
    brightYellow: "#F1DAAD",
    brightBlue: "#9CB9F6",
    brightMagenta: "#F5BDE6",
    brightCyan: "#9CDBD2",
    brightWhite: "#CAD3F5",
    cursorColor: "#CAD3F5",
    cursorText: "#24273A",
    selectionBackground: "#6E738D",
    selectionForeground: "#CAD3F5",
  },
  {
    name: "catppuccin-latte",
    dark: false,
    background: "#EFF1F5",
    foreground: "#4C4F69",
    black: "#DCE0E8",
    red: "#D20F39",
    green: "#40A02B",
    yellow: "#DF8E1D",
    blue: "#1E66F5",
    magenta: "#8839EF",
    cyan: "#179299",
    white: "#6C6F85",
    brightBlack: "#CCD0DA",
    brightRed: "#FE640B",
    brightGreen: "#5DAE4B",
    brightYellow: "#E49F3F",
    brightBlue: "#407DF7",
    brightMagenta: "#EA76CB",
    brightCyan: "#3AA2A8",
    brightWhite: "#4C4F69",
    cursorColor: "#4C4F69",
    cursorText: "#EFF1F5",
    selectionBackground: "#9CA0B0",
    selectionForeground: "#4C4F69",
  },
  {
    name: "nord",
    dark: true,
    background: "#2E3440",
    foreground: "#ECEFF4",
    black: "#2E3440",
    red: "#BF616A",
    green: "#A3BE8C",
    yellow: "#EBCB8B",
    blue: "#5E81AC",
    magenta: "#B48EAD",
    cyan: "#8FBCBB",
    white: "#D8DEE9",
    brightBlack: "#3B4252",
    brightRed: "#D08770",
    brightGreen: "#B1C89D",
    brightYellow: "#EED39C",
    brightBlue: "#7694B8",
    brightMagenta: "#B48EAD",
    brightCyan: "#A0C6C5",
    brightWhite: "#ECEFF4",
    cursorColor: "#ECEFF4",
    cursorText: "#2E3440",
    selectionBackground: "#4C566A",
    selectionForeground: "#ECEFF4",
  },
  {
    name: "dracula",
    dark: true,
    background: "#282A36",
    foreground: "#F8F8F2",
    black: "#21222C",
    red: "#FF5555",
    green: "#50FA7B",
    yellow: "#F1FA8C",
    blue: "#BD93F9",
    magenta: "#BD93F9",
    cyan: "#8BE9FD",
    white: "#6272A4",
    brightBlack: "#44475A",
    brightRed: "#FFB86C",
    brightGreen: "#6AFB8F",
    brightYellow: "#F3FB9D",
    brightBlue: "#C7A3FA",
    brightMagenta: "#FF79C6",
    brightCyan: "#9CECFD",
    brightWhite: "#F8F8F2",
    cursorColor: "#F8F8F2",
    cursorText: "#282A36",
    selectionBackground: "#6272A4",
    selectionForeground: "#F8F8F2",
  },
  {
    name: "solarized-dark",
    dark: true,
    background: "#073642",
    foreground: "#FDF6E3",
    black: "#002B36",
    red: "#DC322F",
    green: "#859900",
    yellow: "#B58900",
    blue: "#268BD2",
    magenta: "#6C71C4",
    cyan: "#2AA198",
    white: "#839496",
    brightBlack: "#586E75",
    brightRed: "#CB4B16",
    brightGreen: "#97A826",
    brightYellow: "#C09B26",
    brightBlue: "#479CD9",
    brightMagenta: "#D33682",
    brightCyan: "#4AAFA7",
    brightWhite: "#FDF6E3",
    cursorColor: "#FDF6E3",
    cursorText: "#073642",
    selectionBackground: "#586E75",
    selectionForeground: "#FDF6E3",
  },
  {
    name: "solarized-light",
    dark: false,
    background: "#EEE8D5",
    foreground: "#073642",
    black: "#FDF6E3",
    red: "#DC322F",
    green: "#859900",
    yellow: "#B58900",
    blue: "#268BD2",
    magenta: "#6C71C4",
    cyan: "#2AA198",
    white: "#657B83",
    brightBlack: "#DDD6C1",
    brightRed: "#CB4B16",
    brightGreen: "#97A826",
    brightYellow: "#C09B26",
    brightBlue: "#479CD9",
    brightMagenta: "#D33682",
    brightCyan: "#4AAFA7",
    brightWhite: "#073642",
    cursorColor: "#073642",
    cursorText: "#EEE8D5",
    selectionBackground: "#839496",
    selectionForeground: "#073642",
  },
  {
    name: "tokyo-night",
    dark: true,
    background: "#24283B",
    foreground: "#C0CAF5",
    black: "#1A1B26",
    red: "#F7768E",
    green: "#9ECE6A",
    yellow: "#E0AF68",
    blue: "#7AA2F7",
    magenta: "#BB9AF7",
    cyan: "#73DACA",
    white: "#A9B1D6",
    brightBlack: "#292E42",
    brightRed: "#FF9E64",
    brightGreen: "#ADD580",
    brightYellow: "#E5BB7F",
    brightBlue: "#8EB0F8",
    brightMagenta: "#FF007C",
    brightCyan: "#88E0D2",
    brightWhite: "#C0CAF5",
    cursorColor: "#C0CAF5",
    cursorText: "#24283B",
    selectionBackground: "#515C7E",
    selectionForeground: "#C0CAF5",
  },
  {
    name: "tokyo-night-storm",
    dark: true,
    background: "#24283B",
    foreground: "#C0CAF5",
    black: "#1F2335",
    red: "#F7768E",
    green: "#9ECE6A",
    yellow: "#E0AF68",
    blue: "#7AA2F7",
    magenta: "#BB9AF7",
    cyan: "#73DACA",
    white: "#A9B1D6",
    brightBlack: "#292E42",
    brightRed: "#FF9E64",
    brightGreen: "#ADD580",
    brightYellow: "#E5BB7F",
    brightBlue: "#8EB0F8",
    brightMagenta: "#FF007C",
    brightCyan: "#88E0D2",
    brightWhite: "#C0CAF5",
    cursorColor: "#C0CAF5",
    cursorText: "#24283B",
    selectionBackground: "#515C7E",
    selectionForeground: "#C0CAF5",
  },
  {
    name: "tokyo-night-day",
    dark: false,
    background: "#D5D6DB",
    foreground: "#3760BF",
    black: "#E1E2E7",
    red: "#F52A65",
    green: "#587539",
    yellow: "#8C6C3E",
    blue: "#2E7DE9",
    magenta: "#9854F1",
    cyan: "#118C74",
    white: "#6172B0",
    brightBlack: "#C4C5CB",
    brightRed: "#B15C00",
    brightGreen: "#718A57",
    brightYellow: "#9D825B",
    brightBlue: "#4D91EC",
    brightMagenta: "#F52A65",
    brightCyan: "#359D89",
    brightWhite: "#3760BF",
    cursorColor: "#3760BF",
    cursorText: "#D5D6DB",
    selectionBackground: "#99A7DF",
    selectionForeground: "#3760BF",
  },
  {
    name: "one-dark",
    dark: true,
    background: "#282C34",
    foreground: "#ABB2BF",
    black: "#21252B",
    red: "#E06C75",
    green: "#98C379",
    yellow: "#E5C07B",
    blue: "#61AFEF",
    magenta: "#C678DD",
    cyan: "#56B6C2",
    white: "#ABB2BF",
    brightBlack: "#2C313A",
    brightRed: "#D19A66",
    brightGreen: "#A7CC8D",
    brightYellow: "#E9C98F",
    brightBlue: "#79BBF1",
    brightMagenta: "#E06C75",
    brightCyan: "#6FC1CB",
    brightWhite: "#ABB2BF",
    cursorColor: "#ABB2BF",
    cursorText: "#282C34",
    selectionBackground: "#3E4451",
    selectionForeground: "#ABB2BF",
  },
  {
    name: "gruvbox-dark",
    dark: true,
    background: "#282828",
    foreground: "#EBDBB2",
    black: "#1D2021",
    red: "#FB4934",
    green: "#B8BB26",
    yellow: "#FABD2F",
    blue: "#83A598",
    magenta: "#D3869B",
    cyan: "#8EC07C",
    white: "#BDAE93",
    brightBlack: "#3C3836",
    brightRed: "#FE8019",
    brightGreen: "#C3C547",
    brightYellow: "#FBC74E",
    brightBlue: "#96B3A7",
    brightMagenta: "#D3869B",
    brightCyan: "#9FC990",
    brightWhite: "#EBDBB2",
    cursorColor: "#EBDBB2",
    cursorText: "#282828",
    selectionBackground: "#504945",
    selectionForeground: "#EBDBB2",
  },
  {
    name: "gruvbox-light",
    dark: false,
    background: "#FBF1C7",
    foreground: "#3C3836",
    black: "#F9F5D7",
    red: "#CC241D",
    green: "#98971A",
    yellow: "#D79921",
    blue: "#458588",
    magenta: "#B16286",
    cyan: "#689D6A",
    white: "#665C54",
    brightBlack: "#EBDBB2",
    brightRed: "#D65D0E",
    brightGreen: "#A7A73C",
    brightYellow: "#DDA842",
    brightBlue: "#61979A",
    brightMagenta: "#B16286",
    brightCyan: "#7FAC80",
    brightWhite: "#3C3836",
    cursorColor: "#3C3836",
    cursorText: "#FBF1C7",
    selectionBackground: "#D5C4A1",
    selectionForeground: "#3C3836",
  },
  {
    name: "rose-pine",
    dark: true,
    background: "#1F1D2E",
    foreground: "#E0DEF4",
    black: "#191724",
    red: "#EB6F92",
    green: "#31748F",
    yellow: "#F6C177",
    blue: "#3E8FB0",
    magenta: "#C4A7E7",
    cyan: "#9CCFD8",
    white: "#908CAA",
    brightBlack: "#26233A",
    brightRed: "#EA9A97",
    brightGreen: "#5089A0",
    brightYellow: "#F7CA8B",
    brightBlue: "#5BA0BC",
    brightMagenta: "#EBBCBA",
    brightCyan: "#ABD6DE",
    brightWhite: "#E0DEF4",
    cursorColor: "#E0DEF4",
    cursorText: "#1F1D2E",
    selectionBackground: "#524F67",
    selectionForeground: "#E0DEF4",
  },
  {
    name: "rose-pine-moon",
    dark: true,
    background: "#2A273F",
    foreground: "#E0DEF4",
    black: "#232136",
    red: "#EB6F92",
    green: "#3E8FB0",
    yellow: "#F6C177",
    blue: "#3E8FB0",
    magenta: "#C4A7E7",
    cyan: "#9CCFD8",
    white: "#908CAA",
    brightBlack: "#393552",
    brightRed: "#EA9A97",
    brightGreen: "#5BA0BC",
    brightYellow: "#F7CA8B",
    brightBlue: "#5BA0BC",
    brightMagenta: "#EA9A97",
    brightCyan: "#ABD6DE",
    brightWhite: "#E0DEF4",
    cursorColor: "#E0DEF4",
    cursorText: "#2A273F",
    selectionBackground: "#56526E",
    selectionForeground: "#E0DEF4",
  },
  {
    name: "rose-pine-dawn",
    dark: false,
    background: "#FFFAF3",
    foreground: "#575279",
    black: "#FAF4ED",
    red: "#B4637A",
    green: "#286983",
    yellow: "#EA9D34",
    blue: "#286983",
    magenta: "#907AA9",
    cyan: "#56949F",
    white: "#797593",
    brightBlack: "#F2E9E1",
    brightRed: "#D7827E",
    brightGreen: "#488096",
    brightYellow: "#EDAC52",
    brightBlue: "#488096",
    brightMagenta: "#D7827E",
    brightCyan: "#6FA4AD",
    brightWhite: "#575279",
    cursorColor: "#575279",
    cursorText: "#FFFAF3",
    selectionBackground: "#CECACD",
    selectionForeground: "#575279",
  },
  {
    name: "kanagawa-wave",
    dark: true,
    background: "#1F1F28",
    foreground: "#DCD7BA",
    black: "#16161D",
    red: "#C34043",
    green: "#98BB6C",
    yellow: "#E6C384",
    blue: "#7E9CD8",
    magenta: "#957FB8",
    cyan: "#6A9589",
    white: "#727169",
    brightBlack: "#2A2A37",
    brightRed: "#FFA066",
    brightGreen: "#A7C582",
    brightYellow: "#EACC96",
    brightBlue: "#91ABDE",
    brightMagenta: "#D27E99",
    brightCyan: "#80A59B",
    brightWhite: "#DCD7BA",
    cursorColor: "#DCD7BA",
    cursorText: "#1F1F28",
    selectionBackground: "#54546D",
    selectionForeground: "#DCD7BA",
  },
  {
    name: "kanagawa-dragon",
    dark: true,
    background: "#181616",
    foreground: "#C5C9C5",
    black: "#0D0C0C",
    red: "#C4746E",
    green: "#87A987",
    yellow: "#C4B28A",
    blue: "#8BA4B0",
    magenta: "#8992A7",
    cyan: "#8EA4A2",
    white: "#737C73",
    brightBlack: "#282727",
    brightRed: "#B6927B",
    brightGreen: "#99B699",
    brightYellow: "#CDBE9C",
    brightBlue: "#9CB2BC",
    brightMagenta: "#A292A3",
    brightCyan: "#9FB2B0",
    brightWhite: "#C5C9C5",
    cursorColor: "#C5C9C5",
    cursorText: "#181616",
    selectionBackground: "#49443C",
    selectionForeground: "#C5C9C5",
  },
  {
    name: "kanagawa-lotus",
    dark: false,
    background: "#F2ECBC",
    foreground: "#545464",
    black: "#E5DDB0",
    red: "#C84053",
    green: "#6F894E",
    yellow: "#DE9800",
    blue: "#4D699B",
    magenta: "#624C83",
    cyan: "#597B75",
    white: "#716E61",
    brightBlack: "#DCD5AC",
    brightRed: "#CC6D00",
    brightGreen: "#859B69",
    brightYellow: "#E3A726",
    brightBlue: "#6880AA",
    brightMagenta: "#B35B79",
    brightCyan: "#728F8A",
    brightWhite: "#545464",
    cursorColor: "#545464",
    cursorText: "#F2ECBC",
    selectionBackground: "#C9CBD1",
    selectionForeground: "#545464",
  },
  {
    name: "everforest-dark",
    dark: true,
    background: "#2D353B",
    foreground: "#D3C6AA",
    black: "#232A2E",
    red: "#E67E80",
    green: "#A7C080",
    yellow: "#DBBC7F",
    blue: "#7FBBB3",
    magenta: "#D699B6",
    cyan: "#83C092",
    white: "#859289",
    brightBlack: "#343F44",
    brightRed: "#E69875",
    brightGreen: "#B4C993",
    brightYellow: "#E0C692",
    brightBlue: "#92C5BE",
    brightMagenta: "#E67E80",
    brightCyan: "#96C9A2",
    brightWhite: "#D3C6AA",
    cursorColor: "#D3C6AA",
    cursorText: "#2D353B",
    selectionBackground: "#543A48",
    selectionForeground: "#D3C6AA",
  },
  {
    name: "everforest-light",
    dark: false,
    background: "#FDF6E3",
    foreground: "#5C6A72",
    black: "#EFEBD4",
    red: "#F85552",
    green: "#8DA101",
    yellow: "#DFA000",
    blue: "#3A94C5",
    magenta: "#DF69BA",
    cyan: "#35A77C",
    white: "#939F91",
    brightBlack: "#F4F0D9",
    brightRed: "#F57D26",
    brightGreen: "#9EAF27",
    brightYellow: "#E4AE26",
    brightBlue: "#58A4CE",
    brightMagenta: "#F85552",
    brightCyan: "#53B490",
    brightWhite: "#5C6A72",
    cursorColor: "#5C6A72",
    cursorText: "#FDF6E3",
    selectionBackground: "#E0DCC7",
    selectionForeground: "#5C6A72",
  },
  {
    name: "monokai",
    dark: true,
    background: "#272822",
    foreground: "#F8F8F2",
    black: "#1A1A1A",
    red: "#F92672",
    green: "#A6E22E",
    yellow: "#E6DB74",
    blue: "#66D9EF",
    magenta: "#AE81FF",
    cyan: "#66D9EF",
    white: "#A59F85",
    brightBlack: "#3E3D32",
    brightRed: "#FD971F",
    brightGreen: "#B3E64D",
    brightYellow: "#EAE089",
    brightBlue: "#7DDFF1",
    brightMagenta: "#F92672",
    brightCyan: "#7DDFF1",
    brightWhite: "#F8F8F2",
    cursorColor: "#F8F8F2",
    cursorText: "#272822",
    selectionBackground: "#575B4F",
    selectionForeground: "#F8F8F2",
  },
  {
    name: "monokai-pro",
    dark: true,
    background: "#2D2A2E",
    foreground: "#FCFCFA",
    black: "#221F22",
    red: "#FF6188",
    green: "#A9DC76",
    yellow: "#FFD866",
    blue: "#78DCE8",
    magenta: "#AB9DF2",
    cyan: "#78DCE8",
    white: "#939293",
    brightBlack: "#403E41",
    brightRed: "#FC9867",
    brightGreen: "#B6E18B",
    brightYellow: "#FFDE7D",
    brightBlue: "#8CE1EB",
    brightMagenta: "#FF6188",
    brightCyan: "#8CE1EB",
    brightWhite: "#FCFCFA",
    cursorColor: "#FCFCFA",
    cursorText: "#2D2A2E",
    selectionBackground: "#5B595C",
    selectionForeground: "#FCFCFA",
  },
  {
    name: "snazzy",
    dark: true,
    background: "#282A36",
    foreground: "#EFF0EB",
    black: "#222430",
    red: "#FF5C57",
    green: "#5AF78E",
    yellow: "#F3F99D",
    blue: "#57C7FF",
    magenta: "#B267E6",
    cyan: "#9AEDFE",
    white: "#97979B",
    brightBlack: "#34353E",
    brightRed: "#FF9F43",
    brightGreen: "#73F89F",
    brightYellow: "#F5FAAC",
    brightBlue: "#70CFFF",
    brightMagenta: "#FF6AC1",
    brightCyan: "#A9F0FE",
    brightWhite: "#EFF0EB",
    cursorColor: "#EFF0EB",
    cursorText: "#282A36",
    selectionBackground: "#525566",
    selectionForeground: "#EFF0EB",
  },
  {
    name: "material-dark",
    dark: true,
    background: "#212121",
    foreground: "#EEFFFF",
    black: "#171717",
    red: "#FF5370",
    green: "#C3E88D",
    yellow: "#FFCB6B",
    blue: "#82AAFF",
    magenta: "#C792EA",
    cyan: "#89DDFF",
    white: "#545454",
    brightBlack: "#2C2C2C",
    brightRed: "#F78C6C",
    brightGreen: "#CCEB9E",
    brightYellow: "#FFD381",
    brightBlue: "#95B7FF",
    brightMagenta: "#F07178",
    brightCyan: "#9BE2FF",
    brightWhite: "#EEFFFF",
    cursorColor: "#EEFFFF",
    cursorText: "#212121",
    selectionBackground: "#404040",
    selectionForeground: "#EEFFFF",
  },
  {
    name: "material-light",
    dark: false,
    background: "#FAFAFA",
    foreground: "#546E7A",
    black: "#ECF0F1",
    red: "#E53935",
    green: "#91B859",
    yellow: "#FFB62C",
    blue: "#6182B8",
    magenta: "#7C4DFF",
    cyan: "#39ADB5",
    white: "#90A4AE",
    brightBlack: "#EBF4F3",
    brightRed: "#F76D47",
    brightGreen: "#A2C372",
    brightYellow: "#FFC14C",
    brightBlue: "#7995C3",
    brightMagenta: "#FF5370",
    brightCyan: "#57B9C0",
    brightWhite: "#546E7A",
    cursorColor: "#546E7A",
    cursorText: "#FAFAFA",
    selectionBackground: "#C3CEE3",
    selectionForeground: "#546E7A",
  },
  {
    name: "palenight",
    dark: true,
    background: "#292D3E",
    foreground: "#A6ACCD",
    black: "#1C1F2B",
    red: "#F07178",
    green: "#C3E88D",
    yellow: "#FFCB6B",
    blue: "#82AAFF",
    magenta: "#C792EA",
    cyan: "#89DDFF",
    white: "#676E95",
    brightBlack: "#343B51",
    brightRed: "#F78C6C",
    brightGreen: "#CCEB9E",
    brightYellow: "#FFD381",
    brightBlue: "#95B7FF",
    brightMagenta: "#FF5370",
    brightCyan: "#9BE2FF",
    brightWhite: "#A6ACCD",
    cursorColor: "#A6ACCD",
    cursorText: "#292D3E",
    selectionBackground: "#525975",
    selectionForeground: "#A6ACCD",
  },
  {
    name: "ayu-dark",
    dark: true,
    background: "#0B0E14",
    foreground: "#BFBDB6",
    black: "#05070A",
    red: "#D95757",
    green: "#AAD94C",
    yellow: "#E6B450",
    blue: "#59C2FF",
    magenta: "#D2A6FF",
    cyan: "#95E6CB",
    white: "#636A72",
    brightBlack: "#11151C",
    brightRed: "#F29668",
    brightGreen: "#B7DF67",
    brightYellow: "#EABF6A",
    brightBlue: "#72CBFF",
    brightMagenta: "#F07178",
    brightCyan: "#A5EAD3",
    brightWhite: "#BFBDB6",
    cursorColor: "#BFBDB6",
    cursorText: "#0B0E14",
    selectionBackground: "#3D424D",
    selectionForeground: "#BFBDB6",
  },
  {
    name: "ayu-mirage",
    dark: true,
    background: "#1F2430",
    foreground: "#CCCAC2",
    black: "#101521",
    red: "#FF6666",
    green: "#D5FF80",
    yellow: "#FFCC66",
    blue: "#73D0FF",
    magenta: "#DFBFFF",
    cyan: "#95E6CB",
    white: "#6C7A8B",
    brightBlack: "#171B24",
    brightRed: "#F29E74",
    brightGreen: "#DBFF93",
    brightYellow: "#FFD47D",
    brightBlue: "#88D7FF",
    brightMagenta: "#F28779",
    brightCyan: "#A5EAD3",
    brightWhite: "#CCCAC2",
    cursorColor: "#CCCAC2",
    cursorText: "#1F2430",
    selectionBackground: "#4A5167",
    selectionForeground: "#CCCAC2",
  },
  {
    name: "ayu-light",
    dark: false,
    background: "#F8F9FA",
    foreground: "#5C6166",
    black: "#E7EAED",
    red: "#E65050",
    green: "#86B300",
    yellow: "#FFAA33",
    blue: "#399EE6",
    magenta: "#A37ACC",
    cyan: "#4CBF99",
    white: "#ABADB1",
    brightBlack: "#F3F4F5",
    brightRed: "#ED9366",
    brightGreen: "#98BE26",
    brightYellow: "#FFB752",
    brightBlue: "#57ADEA",
    brightMagenta: "#F07171",
    brightCyan: "#67C9A8",
    brightWhite: "#5C6166",
    cursorColor: "#5C6166",
    cursorText: "#F8F9FA",
    selectionBackground: "#D1D5DA",
    selectionForeground: "#5C6166",
  },
  {
    name: "nightfox",
    dark: true,
    background: "#192330",
    foreground: "#CDCECF",
    black: "#131A24",
    red: "#C94F6D",
    green: "#81B29A",
    yellow: "#DBC074",
    blue: "#719CD6",
    magenta: "#9D79D6",
    cyan: "#63CDCF",
    white: "#71839B",
    brightBlack: "#212E3F",
    brightRed: "#F4A261",
    brightGreen: "#94BEA9",
    brightYellow: "#E0C989",
    brightBlue: "#86ABDC",
    brightMagenta: "#D67AD2",
    brightCyan: "#7AD5D6",
    brightWhite: "#CDCECF",
    cursorColor: "#CDCECF",
    cursorText: "#192330",
    selectionBackground: "#3D5171",
    selectionForeground: "#CDCECF",
  },
  {
    name: "dawnfox",
    dark: false,
    background: "#FAF4ED",
    foreground: "#575279",
    black: "#EBE5DF",
    red: "#B4637A",
    green: "#618774",
    yellow: "#EA9D34",
    blue: "#286983",
    magenta: "#907AA9",
    cyan: "#56949F",
    white: "#A8A3B3",
    brightBlack: "#EBE0DF",
    brightRed: "#D7827E",
    brightGreen: "#799989",
    brightYellow: "#EDAC52",
    brightBlue: "#488096",
    brightMagenta: "#D685AF",
    brightCyan: "#6FA4AD",
    brightWhite: "#575279",
    cursorColor: "#575279",
    cursorText: "#FAF4ED",
    selectionBackground: "#D4CFC9",
    selectionForeground: "#575279",
  },
  {
    name: "horizon",
    dark: true,
    background: "#1C1E26",
    foreground: "#D5D8DA",
    black: "#16161C",
    red: "#E95678",
    green: "#29D398",
    yellow: "#FAC29A",
    blue: "#26BBD9",
    magenta: "#B877DB",
    cyan: "#59E1E3",
    white: "#6C6F93",
    brightBlack: "#232530",
    brightRed: "#FAB795",
    brightGreen: "#49DAA7",
    brightYellow: "#FBCBA9",
    brightBlue: "#47C5DF",
    brightMagenta: "#EE64AC",
    brightCyan: "#72E6E7",
    brightWhite: "#D5D8DA",
    cursorColor: "#D5D8DA",
    cursorText: "#1C1E26",
    selectionBackground: "#474B61",
    selectionForeground: "#D5D8DA",
  },
  {
    name: "moonfly",
    dark: true,
    background: "#080808",
    foreground: "#C6C6C6",
    black: "#121212",
    red: "#FF5D5D",
    green: "#8CC85F",
    yellow: "#E3C78A",
    blue: "#80A0FF",
    magenta: "#AE81FF",
    cyan: "#79DAC8",
    white: "#808080",
    brightBlack: "#1C1C1C",
    brightRed: "#DE935F",
    brightGreen: "#9DD077",
    brightYellow: "#E7CF9C",
    brightBlue: "#93AEFF",
    brightMagenta: "#FF5189",
    brightCyan: "#8DE0D0",
    brightWhite: "#C6C6C6",
    cursorColor: "#C6C6C6",
    cursorText: "#080808",
    selectionBackground: "#3A3A3A",
    selectionForeground: "#C6C6C6",
  },
  {
    name: "nightfly",
    dark: true,
    background: "#011627",
    foreground: "#C3CCDC",
    black: "#081E2F",
    red: "#FC514E",
    green: "#A1CD5E",
    yellow: "#E3D18A",
    blue: "#82AAFF",
    magenta: "#C792EA",
    cyan: "#7FDBCA",
    white: "#7C8F8F",
    brightBlack: "#0E293F",
    brightRed: "#F78C6C",
    brightGreen: "#AFD576",
    brightYellow: "#E7D89C",
    brightBlue: "#95B7FF",
    brightMagenta: "#FF5874",
    brightCyan: "#92E0D2",
    brightWhite: "#C3CCDC",
    cursorColor: "#C3CCDC",
    cursorText: "#011627",
    selectionBackground: "#1D3B53",
    selectionForeground: "#C3CCDC",
  },
  {
    name: "oxocarbon-dark",
    dark: true,
    background: "#161616",
    foreground: "#F3F3F3",
    black: "#131313",
    red: "#EE5396",
    green: "#42BE65",
    yellow: "#82CFFF",
    blue: "#78A9FF",
    magenta: "#BE95FF",
    cyan: "#08BDBA",
    white: "#5C5C5C",
    brightBlack: "#2A2A2A",
    brightRed: "#FF7EB6",
    brightGreen: "#5EC87C",
    brightYellow: "#95D6FF",
    brightBlue: "#8CB6FF",
    brightMagenta: "#FF7EB6",
    brightCyan: "#2DC7C4",
    brightWhite: "#F3F3F3",
    cursorColor: "#F3F3F3",
    cursorText: "#161616",
    selectionBackground: "#3D3D3D",
    selectionForeground: "#F3F3F3",
  },
  {
    name: "oxocarbon-light",
    dark: false,
    background: "#FFFFFF",
    foreground: "#37474F",
    black: "#F3F3F3",
    red: "#EE5396",
    green: "#42BE65",
    yellow: "#FFAB91",
    blue: "#0F62FE",
    magenta: "#BE95FF",
    cyan: "#08BDBA",
    white: "#90A4AE",
    brightBlack: "#D5D5D5",
    brightRed: "#FF6F00",
    brightGreen: "#5EC87C",
    brightYellow: "#FFB8A2",
    brightBlue: "#337AFE",
    brightMagenta: "#FF7EB6",
    brightCyan: "#2DC7C4",
    brightWhite: "#37474F",
    cursorColor: "#37474F",
    cursorText: "#FFFFFF",
    selectionBackground: "#C3CEE3",
    selectionForeground: "#37474F",
  },
  {
    name: "sonokai",
    dark: true,
    background: "#2C2E34",
    foreground: "#E2E2E3",
    black: "#181819",
    red: "#FC5D7C",
    green: "#9ED072",
    yellow: "#E7C664",
    blue: "#76CCE0",
    magenta: "#B39DF3",
    cyan: "#76CCE0",
    white: "#7F8490",
    brightBlack: "#33353F",
    brightRed: "#F39660",
    brightGreen: "#ADD787",
    brightYellow: "#EBCF7B",
    brightBlue: "#8BD4E5",
    brightMagenta: "#FC5D7C",
    brightCyan: "#8BD4E5",
    brightWhite: "#E2E2E3",
    cursorColor: "#E2E2E3",
    cursorText: "#2C2E34",
    selectionBackground: "#4A4C53",
    selectionForeground: "#E2E2E3",
  },
  {
    name: "edge-dark",
    dark: true,
    background: "#2C2E34",
    foreground: "#C5CDD9",
    black: "#202023",
    red: "#EC7279",
    green: "#A0C980",
    yellow: "#DEB974",
    blue: "#6CB6EB",
    magenta: "#D38AEA",
    cyan: "#5DBBC1",
    white: "#758094",
    brightBlack: "#33353F",
    brightRed: "#DEB974",
    brightGreen: "#AED193",
    brightYellow: "#E3C489",
    brightBlue: "#82C1EE",
    brightMagenta: "#EC7279",
    brightCyan: "#75C5CA",
    brightWhite: "#C5CDD9",
    cursorColor: "#C5CDD9",
    cursorText: "#2C2E34",
    selectionBackground: "#4A4D55",
    selectionForeground: "#C5CDD9",
  },
  {
    name: "edge-light",
    dark: false,
    background: "#FAFAFA",
    foreground: "#4B505B",
    black: "#DDE2E7",
    red: "#D05858",
    green: "#608E32",
    yellow: "#BE7E05",
    blue: "#5079BE",
    magenta: "#B05CCC",
    cyan: "#3A8B84",
    white: "#8790A0",
    brightBlack: "#EEF1F4",
    brightRed: "#BE7E05",
    brightGreen: "#789F51",
    brightYellow: "#C8912B",
    brightBlue: "#6A8DC8",
    brightMagenta: "#D05858",
    brightCyan: "#589C96",
    brightWhite: "#4B505B",
    cursorColor: "#4B505B",
    cursorText: "#FAFAFA",
    selectionBackground: "#C3CEE3",
    selectionForeground: "#4B505B",
  },
  {
    name: "modus-vivendi",
    dark: true,
    background: "#000000",
    foreground: "#FFFFFF",
    black: "#000000",
    red: "#FF5F59",
    green: "#44BC44",
    yellow: "#D0BC00",
    blue: "#2FAFFF",
    magenta: "#B6A0FF",
    cyan: "#00D3D0",
    white: "#989898",
    brightBlack: "#1E1E1E",
    brightRed: "#FEC43F",
    brightGreen: "#60C660",
    brightYellow: "#D7C626",
    brightBlue: "#4EBBFF",
    brightMagenta: "#FEACD0",
    brightCyan: "#26DAD7",
    brightWhite: "#FFFFFF",
    cursorColor: "#FFFFFF",
    cursorText: "#000000",
    selectionBackground: "#3F3F3F",
    selectionForeground: "#FFFFFF",
  },
  {
    name: "modus-operandi",
    dark: false,
    background: "#FFFFFF",
    foreground: "#000000",
    black: "#E0E0E0",
    red: "#A60000",
    green: "#006800",
    yellow: "#6F5500",
    blue: "#0031A9",
    magenta: "#531AB6",
    cyan: "#005E8B",
    white: "#595959",
    brightBlack: "#F2F2F2",
    brightRed: "#884900",
    brightGreen: "#267F26",
    brightYellow: "#856F26",
    brightBlue: "#2650B6",
    brightMagenta: "#721045",
    brightCyan: "#26769C",
    brightWhite: "#000000",
    cursorColor: "#000000",
    cursorText: "#FFFFFF",
    selectionBackground: "#C4C4C4",
    selectionForeground: "#000000",
  },
]

// ── Grouping palettes by family ──────────────────────────────────────
const families = [
  {
    label: "Catppuccin",
    keys: ["catppuccin-mocha", "catppuccin-frappe", "catppuccin-macchiato", "catppuccin-latte"],
  },
  { label: "Nord", keys: ["nord"] },
  { label: "Dracula", keys: ["dracula"] },
  { label: "Solarized", keys: ["solarized-dark", "solarized-light"] },
  { label: "Tokyo Night", keys: ["tokyo-night", "tokyo-night-storm", "tokyo-night-day"] },
  { label: "One Dark", keys: ["one-dark"] },
  { label: "Gruvbox", keys: ["gruvbox-dark", "gruvbox-light"] },
  { label: "Rose Pine", keys: ["rose-pine", "rose-pine-moon", "rose-pine-dawn"] },
  { label: "Kanagawa", keys: ["kanagawa-wave", "kanagawa-dragon", "kanagawa-lotus"] },
  { label: "Everforest", keys: ["everforest-dark", "everforest-light"] },
  { label: "Monokai", keys: ["monokai", "monokai-pro"] },
  { label: "Snazzy", keys: ["snazzy"] },
  { label: "Material", keys: ["material-dark", "material-light"] },
  { label: "Palenight", keys: ["palenight"] },
  { label: "Ayu", keys: ["ayu-dark", "ayu-mirage", "ayu-light"] },
  { label: "Nightfox", keys: ["nightfox", "dawnfox"] },
  { label: "Horizon", keys: ["horizon"] },
  { label: "Moonfly", keys: ["moonfly"] },
  { label: "Nightfly", keys: ["nightfly"] },
  { label: "Oxocarbon", keys: ["oxocarbon-dark", "oxocarbon-light"] },
  { label: "Sonokai", keys: ["sonokai"] },
  { label: "Edge", keys: ["edge-dark", "edge-light"] },
  { label: "Modus", keys: ["modus-vivendi", "modus-operandi"] },
]

// ── State ────────────────────────────────────────────────────────────
const activeTab = ref("gallery") // "gallery" | "custom"
const detailTab = ref("terminal") // "terminal" | "tokens" | "palette"
const selectedPalette = ref(palettes[0])
const filterMode = ref("all") // "all" | "dark" | "light"
const customHex = ref("#5E81AC")
const customMode = ref("dark")
const copied = ref(false)
const searchQuery = ref("")

const paletteMap = Object.fromEntries(palettes.map((p) => [p.name, p]))

// When switching to gallery tab, reset detail tab if it's on 'terminal' (gallery has inline preview)
watch(activeTab, (tab) => {
  if (tab === "gallery" && detailTab.value === "terminal") {
    detailTab.value = "tokens"
  }
})

// ── Color utilities (mirrors @silvery/theme/color.ts) ────────────────
function hexToRgb(hex) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) return null
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)]
}

function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`.toUpperCase()
}

function blendColor(a, b, t) {
  const rgbA = hexToRgb(a)
  const rgbB = hexToRgb(b)
  if (!rgbA || !rgbB) return a
  return rgbToHex(
    rgbA[0] + (rgbB[0] - rgbA[0]) * t,
    rgbA[1] + (rgbB[1] - rgbA[1]) * t,
    rgbA[2] + (rgbB[2] - rgbA[2]) * t,
  )
}

function rgbToHsl(r, g, b) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s, l]
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360
  const a = s * Math.min(l, 1 - l)
  const f = (n) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
  }
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255)
}

function hexToHsl(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return rgbToHsl(rgb[0], rgb[1], rgb[2])
}

function contrastFg(bg) {
  const rgb = hexToRgb(bg)
  if (!rgb) return "#FFFFFF"
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.179 ? "#000000" : "#FFFFFF"
}

function desaturateColor(color, amount) {
  const hsl = hexToHsl(color)
  if (!hsl) return color
  const [h, s, l] = hsl
  return hslToHex(h, s * (1 - amount), l)
}

function complementColor(color) {
  const hsl = hexToHsl(color)
  if (!hsl) return color
  const [h, s, l] = hsl
  return hslToHex(h + 180, s, l)
}

// ── Derive theme from palette (mirrors @silvery/theme/derive.ts) ─────
function deriveTheme(p) {
  const dark = p.dark !== false
  const primaryColor = dark ? p.yellow : p.blue
  const bg = p.background
  const fg = p.foreground

  return {
    name: p.name || (dark ? "derived-dark" : "derived-light"),
    bg,
    fg,
    surface: blendColor(bg, fg, 0.05),
    surfacefg: fg,
    popover: blendColor(bg, fg, 0.08),
    popoverfg: fg,
    muted: blendColor(bg, fg, 0.04),
    mutedfg: blendColor(fg, bg, 0.7),
    primary: primaryColor,
    primaryfg: contrastFg(primaryColor),
    secondary: desaturateColor(primaryColor, 0.4),
    secondaryfg: contrastFg(desaturateColor(primaryColor, 0.4)),
    accent: complementColor(primaryColor),
    accentfg: contrastFg(complementColor(primaryColor)),
    error: p.red,
    errorfg: contrastFg(p.red),
    warning: p.yellow,
    warningfg: contrastFg(p.yellow),
    success: p.green,
    successfg: contrastFg(p.green),
    info: p.cyan,
    infofg: contrastFg(p.cyan),
    selection: p.selectionBackground || blendColor(bg, fg, 0.3),
    selectionfg: p.selectionForeground || fg,
    inverse: blendColor(fg, bg, 0.1),
    inversefg: contrastFg(blendColor(fg, bg, 0.1)),
    cursor: p.cursorColor || fg,
    cursorfg: p.cursorText || bg,
    border: blendColor(bg, fg, 0.15),
    inputborder: blendColor(bg, fg, 0.25),
    focusborder: p.blue,
    link: p.blue,
    disabledfg: blendColor(fg, bg, 0.5),
    palette: [
      p.black,
      p.red,
      p.green,
      p.yellow,
      p.blue,
      p.magenta,
      p.cyan,
      p.white,
      p.brightBlack,
      p.brightRed,
      p.brightGreen,
      p.brightYellow,
      p.brightBlue,
      p.brightMagenta,
      p.brightCyan,
      p.brightWhite,
    ],
  }
}

// ── Semantic token groups for the detail view ────────────────────────
const semanticGroups = [
  {
    label: "Core",
    tokens: [
      { key: "bg", label: "bg", desc: "Default background" },
      { key: "fg", label: "fg", desc: "Default text" },
      { key: "surface", label: "surface", desc: "Elevated content area" },
      { key: "surfacefg", label: "surfacefg", desc: "Text on surface" },
      { key: "popover", label: "popover", desc: "Floating content" },
      { key: "popoverfg", label: "popoverfg", desc: "Text on popover" },
      { key: "muted", label: "muted", desc: "Hover state" },
      { key: "mutedfg", label: "mutedfg", desc: "Secondary text" },
    ],
  },
  {
    label: "Accent",
    tokens: [
      { key: "primary", label: "primary", desc: "Brand accent" },
      { key: "primaryfg", label: "primaryfg", desc: "Text on primary" },
      { key: "secondary", label: "secondary", desc: "Alternate accent" },
      { key: "secondaryfg", label: "secondaryfg", desc: "Text on secondary" },
      { key: "accent", label: "accent", desc: "Attention accent" },
      { key: "accentfg", label: "accentfg", desc: "Text on accent" },
    ],
  },
  {
    label: "Status",
    tokens: [
      { key: "error", label: "error", desc: "Error/destructive" },
      { key: "errorfg", label: "errorfg", desc: "Text on error" },
      { key: "warning", label: "warning", desc: "Caution" },
      { key: "warningfg", label: "warningfg", desc: "Text on warning" },
      { key: "success", label: "success", desc: "Positive" },
      { key: "successfg", label: "successfg", desc: "Text on success" },
      { key: "info", label: "info", desc: "Information" },
      { key: "infofg", label: "infofg", desc: "Text on info" },
    ],
  },
  {
    label: "Chrome",
    tokens: [
      { key: "selection", label: "selection", desc: "Selected items" },
      { key: "selectionfg", label: "selectionfg", desc: "Text on selection" },
      { key: "inverse", label: "inverse", desc: "Title/status bars" },
      { key: "inversefg", label: "inversefg", desc: "Text on chrome" },
      { key: "cursor", label: "cursor", desc: "Cursor color" },
      { key: "cursorfg", label: "cursorfg", desc: "Text under cursor" },
    ],
  },
  {
    label: "Borders & Links",
    tokens: [
      { key: "border", label: "border", desc: "Structural dividers" },
      { key: "inputborder", label: "inputborder", desc: "Input borders" },
      { key: "focusborder", label: "focusborder", desc: "Focus ring" },
      { key: "link", label: "link", desc: "Hyperlinks" },
      { key: "disabledfg", label: "disabledfg", desc: "Disabled text" },
    ],
  },
]

// ── ANSI palette fields ─────────────────────────────────────────────
const ansiColors = [
  { key: "black", label: "Black", index: 0 },
  { key: "red", label: "Red", index: 1 },
  { key: "green", label: "Green", index: 2 },
  { key: "yellow", label: "Yellow", index: 3 },
  { key: "blue", label: "Blue", index: 4 },
  { key: "magenta", label: "Magenta", index: 5 },
  { key: "cyan", label: "Cyan", index: 6 },
  { key: "white", label: "White", index: 7 },
  { key: "brightBlack", label: "Bright Black", index: 8 },
  { key: "brightRed", label: "Bright Red", index: 9 },
  { key: "brightGreen", label: "Bright Green", index: 10 },
  { key: "brightYellow", label: "Bright Yellow", index: 11 },
  { key: "brightBlue", label: "Bright Blue", index: 12 },
  { key: "brightMagenta", label: "Bright Magenta", index: 13 },
  { key: "brightCyan", label: "Bright Cyan", index: 14 },
  { key: "brightWhite", label: "Bright White", index: 15 },
]

// ── Filtering ───────────────────────────────────────────────────────
const filteredPalettes = computed(() => {
  let result = palettes
  if (filterMode.value === "dark") result = result.filter((p) => p.dark)
  else if (filterMode.value === "light") result = result.filter((p) => !p.dark)
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter((p) => p.name.includes(q))
  }
  return result
})

// ── Auto-generate theme from custom hex ─────────────────────────────
function generateCustomPalette(primaryColor, mode) {
  const hsl = hexToHsl(primaryColor)
  if (!hsl) return null
  const [h, s] = hsl
  const dark = mode === "dark"
  const bgL = dark ? 0.12 : 0.97
  const fgL = dark ? 0.87 : 0.13
  const bgS = Math.min(s, 0.15)
  const bg = hslToHex(h, bgS, bgL)
  const fg = hslToHex(h, bgS * 0.5, fgL)
  const accentL = dark ? 0.65 : 0.45
  const accentS = Math.max(s, 0.5)
  const brightOffset = dark ? 0.1 : -0.1
  const brightL = accentL + brightOffset
  return {
    name: `custom-${mode}`,
    dark,
    background: bg,
    foreground: fg,
    black: dark ? hslToHex(h, bgS, bgL * 0.7) : hslToHex(h, bgS, bgL * 0.92),
    red: hslToHex(0, accentS, accentL),
    green: hslToHex(130, accentS, accentL),
    yellow: hslToHex(45, accentS, accentL),
    blue: hslToHex(220, accentS, accentL),
    magenta: hslToHex(300, accentS, accentL),
    cyan: hslToHex(185, accentS, accentL),
    white: dark ? hslToHex(h, bgS * 0.3, 0.6) : hslToHex(h, bgS * 0.3, 0.35),
    brightBlack: dark ? hslToHex(h, bgS, bgL + 0.08) : hslToHex(h, bgS, bgL - 0.08),
    brightRed: hslToHex(30, accentS, brightL),
    brightGreen: hslToHex(130, accentS, brightL),
    brightYellow: hslToHex(45, accentS, brightL),
    brightBlue: hslToHex(220, accentS, brightL),
    brightMagenta: hslToHex(330, accentS, brightL),
    brightCyan: hslToHex(185, accentS, brightL),
    brightWhite: dark ? fg : hslToHex(h, bgS * 0.5, fgL - 0.05),
    cursorColor: dark ? fg : hslToHex(h, bgS * 0.5, fgL),
    cursorText: bg,
    selectionBackground: dark ? hslToHex(h, bgS, bgL + 0.15) : hslToHex(h, bgS, bgL - 0.15),
    selectionForeground: dark ? fg : hslToHex(h, bgS * 0.5, fgL),
  }
}

const customPalette = computed(() => {
  if (!/^#[0-9a-f]{6}$/i.test(customHex.value)) return null
  return generateCustomPalette(customHex.value, customMode.value)
})

// ── Active palette and derived theme ────────────────────────────────
const activePalette = computed(() => {
  if (activeTab.value === "custom" && customPalette.value) return customPalette.value
  return selectedPalette.value
})

const activeTheme = computed(() => {
  if (!activePalette.value) return null
  return deriveTheme(activePalette.value)
})

// ── Copy config code ────────────────────────────────────────────────
function getConfigCode() {
  const p = activePalette.value
  if (!p) return ""
  if (activeTab.value === "custom") {
    return `import { autoGenerateTheme } from "@silvery/theme"

const theme = autoGenerateTheme("${customHex.value}", "${customMode.value}")`
  }
  return `import { createTheme } from "@silvery/theme"

const theme = createTheme().preset("${p.name}").build()`
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(getConfigCode())
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    // Fallback
  }
}

function selectPalette(name) {
  const p = paletteMap[name]
  if (p) {
    selectedPalette.value = p
    activeTab.value = "gallery"
  }
}
</script>

<template>
  <div class="theme-explorer">
    <!-- Tab bar -->
    <div class="tabs">
      <button :class="['tab', { active: activeTab === 'gallery' }]" @click="activeTab = 'gallery'">
        Built-in Palettes
      </button>
      <button :class="['tab', { active: activeTab === 'custom' }]" @click="activeTab = 'custom'">
        Custom Generator
      </button>
    </div>

    <!-- Gallery tab -->
    <div v-if="activeTab === 'gallery'" class="gallery-panel">
      <!-- Filters -->
      <div class="filter-bar">
        <input v-model="searchQuery" type="text" placeholder="Search palettes..." class="search-input" />
        <div class="filter-buttons">
          <button :class="['filter-btn', { active: filterMode === 'all' }]" @click="filterMode = 'all'">All</button>
          <button :class="['filter-btn', { active: filterMode === 'dark' }]" @click="filterMode = 'dark'">Dark</button>
          <button :class="['filter-btn', { active: filterMode === 'light' }]" @click="filterMode = 'light'">
            Light
          </button>
        </div>
      </div>

      <!-- Two-column layout: palette list + preview side by side -->
      <div class="gallery-columns">
        <!-- Palette list (scrollable) -->
        <div class="palette-list">
          <button
            v-for="p in filteredPalettes"
            :key="p.name"
            :class="['palette-list-item', { selected: selectedPalette.name === p.name }]"
            @click="selectPalette(p.name)"
          >
            <div class="palette-list-swatches" :style="{ background: p.background }">
              <span class="swatch-mini" :style="{ background: p.red }"></span>
              <span class="swatch-mini" :style="{ background: p.green }"></span>
              <span class="swatch-mini" :style="{ background: p.yellow }"></span>
              <span class="swatch-mini" :style="{ background: p.blue }"></span>
              <span class="swatch-mini" :style="{ background: p.magenta }"></span>
              <span class="swatch-mini" :style="{ background: p.cyan }"></span>
            </div>
            <span class="palette-list-name">{{ p.name }}</span>
            <span :class="['mode-badge', p.dark ? 'dark' : 'light']">
              {{ p.dark ? "dark" : "light" }}
            </span>
          </button>
        </div>

        <!-- Inline preview (visible alongside palette list) -->
        <div v-if="activePalette && activeTheme" class="gallery-preview">
          <div class="preview-container">
            <div
              class="preview-titlebar"
              :style="{
                background: activeTheme.inverse,
                color: activeTheme.inversefg,
              }"
            >
              <span class="preview-dots">
                <span class="dot" :style="{ background: activeTheme.error }"></span>
                <span class="dot" :style="{ background: activeTheme.warning }"></span>
                <span class="dot" :style="{ background: activeTheme.success }"></span>
              </span>
              <span class="preview-title">{{ activePalette.name }}</span>
            </div>
            <div
              class="preview-terminal"
              :style="{
                background: activeTheme.bg,
                color: activeTheme.fg,
              }"
            >
              <div
                class="preview-statusbar"
                :style="{
                  background: activeTheme.surface,
                  borderBottom: '1px solid ' + activeTheme.border,
                }"
              >
                <span :style="{ color: activeTheme.primary }">Tasks</span>
                <span :style="{ color: activeTheme.mutedfg }"> | </span>
                <span :style="{ color: activeTheme.fg }">Notes</span>
                <span :style="{ color: activeTheme.mutedfg }"> | </span>
                <span :style="{ color: activeTheme.fg }">Calendar</span>
              </div>
              <div class="preview-content">
                <div class="preview-line">
                  <span :style="{ color: activeTheme.success }">&#10003;</span>
                  <span :style="{ color: activeTheme.disabledfg, textDecoration: 'line-through' }">
                    Set up dev environment</span
                  >
                </div>
                <div
                  class="preview-line preview-selected"
                  :style="{
                    background: activeTheme.selection,
                    color: activeTheme.selectionfg,
                  }"
                >
                  <span :style="{ color: activeTheme.primary }">&#9679;</span>
                  <span> Build theme explorer</span>
                  <span
                    class="preview-tag"
                    :style="{
                      background: activeTheme.accent,
                      color: activeTheme.accentfg,
                    }"
                    >in-progress</span
                  >
                </div>
                <div class="preview-line">
                  <span :style="{ color: activeTheme.mutedfg }">&#9675;</span>
                  <span :style="{ color: activeTheme.fg }"> Write documentation</span>
                </div>
                <div class="preview-line">
                  <span :style="{ color: activeTheme.error }">&#9679;</span>
                  <span :style="{ color: activeTheme.fg }"> Fix rendering bug</span>
                  <span
                    class="preview-tag"
                    :style="{
                      background: activeTheme.error,
                      color: activeTheme.errorfg,
                    }"
                    >P1</span
                  >
                </div>
                <div class="preview-line">
                  <span :style="{ color: activeTheme.warning }">&#9679;</span>
                  <span :style="{ color: activeTheme.fg }"> Review pull request</span>
                </div>
                <div class="preview-line">
                  <span :style="{ color: activeTheme.info }">&#9679;</span>
                  <span :style="{ color: activeTheme.fg }"> Deploy to staging</span>
                </div>
                <div
                  class="preview-input"
                  :style="{
                    borderTop: '1px solid ' + activeTheme.border,
                  }"
                >
                  <span :style="{ color: activeTheme.mutedfg }">Search: </span>
                  <span
                    :style="{
                      borderBottom: '1px solid ' + activeTheme.inputborder,
                      color: activeTheme.fg,
                    }"
                    >theme ex</span
                  ><!--
                  --><span
                    class="cursor-block"
                    :style="{
                      background: activeTheme.cursor,
                      color: activeTheme.cursorfg,
                    }"
                    >&nbsp;</span
                  >
                </div>
              </div>
              <div
                class="preview-footer"
                :style="{
                  background: activeTheme.surface,
                  borderTop: '1px solid ' + activeTheme.border,
                  color: activeTheme.mutedfg,
                }"
              >
                <span :style="{ color: activeTheme.link }">silvery.dev</span>
                <span> &mdash; 6 items</span>
                <span :style="{ color: activeTheme.success }"> &#10003; synced</span>
              </div>
            </div>
          </div>

          <!-- Token strip -->
          <div class="token-strip">
            <div class="strip-group">
              <div class="strip-item" v-for="tok in ['primary', 'secondary', 'accent']" :key="tok">
                <span class="strip-swatch" :style="{ background: activeTheme[tok] }"></span>
                <span class="strip-label">{{ "$" + tok }}</span>
              </div>
            </div>
            <div class="strip-group">
              <div class="strip-item" v-for="tok in ['error', 'warning', 'success', 'info']" :key="tok">
                <span class="strip-swatch" :style="{ background: activeTheme[tok] }"></span>
                <span class="strip-label">{{ "$" + tok }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Custom tab -->
    <div v-if="activeTab === 'custom'" class="custom-panel">
      <div class="custom-controls">
        <div class="control-group">
          <label class="control-label">Primary Color</label>
          <div class="color-input-row">
            <input type="color" v-model="customHex" class="color-picker" />
            <input type="text" v-model="customHex" class="hex-input" placeholder="#5E81AC" maxlength="7" />
          </div>
        </div>
        <div class="control-group">
          <label class="control-label">Mode</label>
          <div class="filter-buttons">
            <button :class="['filter-btn', { active: customMode === 'dark' }]" @click="customMode = 'dark'">
              Dark
            </button>
            <button :class="['filter-btn', { active: customMode === 'light' }]" @click="customMode = 'light'">
              Light
            </button>
          </div>
        </div>
      </div>
      <p class="custom-description">
        Enter any hex color to auto-generate a complete theme. The system derives all 22 palette colors using HSL color
        manipulation &mdash; background, foreground, accents, and status colors all flow from your single input.
      </p>
    </div>

    <!-- Detail section (shown for both tabs) -->
    <div v-if="activePalette && activeTheme" class="detail-section">
      <!-- Detail tab bar -->
      <div class="detail-tabs">
        <button v-if="activeTab === 'custom'" :class="['detail-tab', { active: detailTab === 'terminal' }]" @click="detailTab = 'terminal'">
          Preview
        </button>
        <button :class="['detail-tab', { active: detailTab === 'tokens' }]" @click="detailTab = 'tokens'">
          Design Tokens
        </button>
        <button :class="['detail-tab', { active: detailTab === 'palette' }]" @click="detailTab = 'palette'">
          Palette Colors
        </button>
      </div>

      <!-- Terminal preview (custom tab only — gallery has inline preview) -->
      <div v-if="detailTab === 'terminal' && activeTab === 'custom'" class="preview-pane">
        <div class="preview-container">
          <div
            class="preview-titlebar"
            :style="{
              background: activeTheme.inverse,
              color: activeTheme.inversefg,
            }"
          >
            <span class="preview-dots">
              <span class="dot" :style="{ background: activeTheme.error }"></span>
              <span class="dot" :style="{ background: activeTheme.warning }"></span>
              <span class="dot" :style="{ background: activeTheme.success }"></span>
            </span>
            <span class="preview-title">{{ activePalette.name }}</span>
          </div>
          <div
            class="preview-terminal"
            :style="{
              background: activeTheme.bg,
              color: activeTheme.fg,
            }"
          >
            <!-- Status bar -->
            <div
              class="preview-statusbar"
              :style="{
                background: activeTheme.surface,
                borderBottom: '1px solid ' + activeTheme.border,
              }"
            >
              <span :style="{ color: activeTheme.primary }">Tasks</span>
              <span :style="{ color: activeTheme.mutedfg }"> | </span>
              <span :style="{ color: activeTheme.fg }">Notes</span>
              <span :style="{ color: activeTheme.mutedfg }"> | </span>
              <span :style="{ color: activeTheme.fg }">Calendar</span>
            </div>
            <!-- Content lines -->
            <div class="preview-content">
              <div class="preview-line">
                <span :style="{ color: activeTheme.success }">&#10003;</span>
                <span :style="{ color: activeTheme.disabledfg, textDecoration: 'line-through' }">
                  Set up dev environment</span
                >
              </div>
              <div
                class="preview-line preview-selected"
                :style="{
                  background: activeTheme.selection,
                  color: activeTheme.selectionfg,
                }"
              >
                <span :style="{ color: activeTheme.primary }">&#9679;</span>
                <span> Build theme explorer</span>
                <span
                  class="preview-tag"
                  :style="{
                    background: activeTheme.accent,
                    color: activeTheme.accentfg,
                  }"
                  >in-progress</span
                >
              </div>
              <div class="preview-line">
                <span :style="{ color: activeTheme.mutedfg }">&#9675;</span>
                <span :style="{ color: activeTheme.fg }"> Write documentation</span>
              </div>
              <div class="preview-line">
                <span :style="{ color: activeTheme.error }">&#9679;</span>
                <span :style="{ color: activeTheme.fg }"> Fix rendering bug</span>
                <span
                  class="preview-tag"
                  :style="{
                    background: activeTheme.error,
                    color: activeTheme.errorfg,
                  }"
                  >P1</span
                >
              </div>
              <div class="preview-line">
                <span :style="{ color: activeTheme.warning }">&#9679;</span>
                <span :style="{ color: activeTheme.fg }"> Review pull request</span>
              </div>
              <div class="preview-line">
                <span :style="{ color: activeTheme.info }">&#9679;</span>
                <span :style="{ color: activeTheme.fg }"> Deploy to staging</span>
              </div>
              <!-- Input area -->
              <div
                class="preview-input"
                :style="{
                  borderTop: '1px solid ' + activeTheme.border,
                }"
              >
                <span :style="{ color: activeTheme.mutedfg }">Search: </span>
                <span
                  :style="{
                    borderBottom: '1px solid ' + activeTheme.inputborder,
                    color: activeTheme.fg,
                  }"
                  >theme ex</span
                ><!--
                --><span
                  class="cursor-block"
                  :style="{
                    background: activeTheme.cursor,
                    color: activeTheme.cursorfg,
                  }"
                  >&nbsp;</span
                >
              </div>
            </div>
            <!-- Footer -->
            <div
              class="preview-footer"
              :style="{
                background: activeTheme.surface,
                borderTop: '1px solid ' + activeTheme.border,
                color: activeTheme.mutedfg,
              }"
            >
              <span :style="{ color: activeTheme.link }">silvery.dev</span>
              <span> &mdash; 6 items</span>
              <span :style="{ color: activeTheme.success }"> &#10003; synced</span>
            </div>
          </div>
        </div>

        <!-- Semantic token summary strip -->
        <div class="token-strip">
          <div class="strip-group">
            <div class="strip-item" v-for="tok in ['primary', 'secondary', 'accent']" :key="tok">
              <span class="strip-swatch" :style="{ background: activeTheme[tok] }"></span>
              <span class="strip-label">{{ "$" + tok }}</span>
            </div>
          </div>
          <div class="strip-group">
            <div class="strip-item" v-for="tok in ['error', 'warning', 'success', 'info']" :key="tok">
              <span class="strip-swatch" :style="{ background: activeTheme[tok] }"></span>
              <span class="strip-label">{{ "$" + tok }}</span>
            </div>
          </div>
          <div class="strip-group">
            <div class="strip-item" v-for="tok in ['border', 'link', 'cursor']" :key="tok">
              <span class="strip-swatch" :style="{ background: activeTheme[tok] }"></span>
              <span class="strip-label">{{ "$" + tok }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Semantic tokens detail -->
      <div v-if="detailTab === 'tokens'" class="tokens-pane">
        <p class="tokens-intro">
          These 33 design tokens are derived from the palette via <code>deriveTheme()</code>. Components reference
          them with a <code>$</code> prefix (e.g. <code>color="$primary"</code>).
        </p>
        <div v-for="group in semanticGroups" :key="group.label" class="token-group">
          <h4 class="token-group-heading">{{ group.label }}</h4>
          <div class="token-group-grid">
            <div v-for="tok in group.tokens" :key="tok.key" class="token-card">
              <div class="token-card-swatch-area">
                <!-- For paired tokens, show bg+fg combo -->
                <div
                  v-if="tok.key.endsWith('fg')"
                  class="token-card-swatch token-card-swatch-text"
                  :style="{
                    background: activeTheme[tok.key.replace(/fg$/, '')] || activeTheme.bg,
                    color: activeTheme[tok.key],
                  }"
                >
                  Aa
                </div>
                <div v-else class="token-card-swatch" :style="{ background: activeTheme[tok.key] }">
                  <span
                    v-if="activeTheme[tok.key + 'fg']"
                    :style="{ color: activeTheme[tok.key + 'fg'] }"
                    class="token-card-swatch-text-overlay"
                    >Aa</span
                  >
                </div>
              </div>
              <div class="token-card-info">
                <code class="token-card-name">${{ tok.label }}</code>
                <span class="token-card-hex">{{ activeTheme[tok.key] }}</span>
                <span class="token-card-desc">{{ tok.desc }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Palette colors detail -->
      <div v-if="detailTab === 'palette'" class="palette-pane">
        <p class="tokens-intro">
          The 22 colors in the <code>ColorPalette</code>: 16 ANSI colors + 6 special colors. These are the raw inputs
          that <code>deriveTheme()</code> transforms into semantic tokens.
        </p>

        <h4 class="token-group-heading">Special Colors</h4>
        <div class="palette-special-grid">
          <div
            class="palette-detail-item"
            v-for="f in [
              { key: 'background', label: 'Background' },
              { key: 'foreground', label: 'Foreground' },
              { key: 'cursorColor', label: 'Cursor' },
              { key: 'cursorText', label: 'Cursor Text' },
              { key: 'selectionBackground', label: 'Selection BG' },
              { key: 'selectionForeground', label: 'Selection FG' },
            ]"
            :key="f.key"
          >
            <span class="palette-detail-swatch" :style="{ background: activePalette[f.key] }"></span>
            <span class="palette-detail-label">{{ f.label }}</span>
            <code class="palette-detail-hex">{{ activePalette[f.key] }}</code>
          </div>
        </div>

        <h4 class="token-group-heading">ANSI 16 Colors</h4>
        <div class="ansi-grid">
          <div v-for="c in ansiColors" :key="c.key" class="ansi-cell">
            <div class="ansi-swatch" :style="{ background: activePalette[c.key] }">
              <span :style="{ color: contrastFg(activePalette[c.key]) }">{{ c.index }}</span>
            </div>
            <span class="ansi-label">{{ c.label }}</span>
            <code class="ansi-hex">{{ activePalette[c.key] }}</code>
          </div>
        </div>
      </div>

      <!-- Code + copy -->
      <div class="code-section">
        <div class="code-header">
          <span class="code-label">Usage</span>
          <button class="copy-btn" @click="copyCode">
            {{ copied ? "Copied!" : "Copy" }}
          </button>
        </div>
        <pre class="code-block"><code>{{ getConfigCode() }}</code></pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.theme-explorer {
  margin: 1.5rem 0;
}

/* ── Tabs ──────────────────────────────────────────────────────────── */
.tabs {
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--vp-c-divider);
  margin-bottom: 1.25rem;
}

.tab {
  padding: 0.6rem 1.25rem;
  border: none;
  background: none;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition:
    color 0.2s,
    border-color 0.2s;
}

.tab:hover {
  color: var(--vp-c-text-1);
}

.tab.active {
  color: var(--vp-c-brand-1);
  border-bottom-color: var(--vp-c-brand-1);
}

/* ── Detail tabs ─────────────────────────────────────────────────── */
.detail-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--vp-c-divider);
  margin-bottom: 1rem;
}

.detail-tab {
  padding: 0.45rem 1rem;
  border: none;
  background: none;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--vp-c-text-3);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition:
    color 0.2s,
    border-color 0.2s;
}

.detail-tab:hover {
  color: var(--vp-c-text-1);
}

.detail-tab.active {
  color: var(--vp-c-text-1);
  border-bottom-color: var(--vp-c-brand-1);
}

/* ── Filter bar ───────────────────────────────────────────────────── */
.filter-bar {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 180px;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--vp-c-brand-1);
}

.filter-buttons {
  display: flex;
  gap: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
}

.filter-btn {
  padding: 0.35rem 0.75rem;
  border: none;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  font-size: 0.8rem;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}

.filter-btn:not(:last-child) {
  border-right: 1px solid var(--vp-c-divider);
}

.filter-btn.active {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-weight: 500;
}

.filter-btn:hover:not(.active) {
  background: var(--vp-c-bg-elv);
}

/* ── Gallery two-column layout ────────────────────────────────────── */
.gallery-columns {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 1.25rem;
  align-items: start;
}

.palette-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 420px;
  overflow-y: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 4px;
}

.palette-list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 2px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  background: none;
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
  width: 100%;
}

.palette-list-item:hover {
  background: var(--vp-c-bg-soft);
}

.palette-list-item.selected {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.palette-list-swatches {
  display: flex;
  gap: 2px;
  padding: 3px 4px;
  border-radius: 4px;
  flex-shrink: 0;
}

.swatch-mini {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.palette-list-name {
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.gallery-preview {
  position: sticky;
  top: 80px;
}

.mode-badge {
  font-size: 0.6rem;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  flex-shrink: 0;
}

.mode-badge.dark {
  background: #2a2a2e;
  color: #b0b0b4;
}

.mode-badge.light {
  background: #f0f0f2;
  color: #555;
}

/* ── Custom panel ─────────────────────────────────────────────────── */
.custom-panel {
  margin-bottom: 1.25rem;
}

.custom-controls {
  display: flex;
  gap: 1.5rem;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.control-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
}

.color-input-row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.color-picker {
  width: 40px;
  height: 34px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 2px;
  cursor: pointer;
  background: var(--vp-c-bg-soft);
}

.hex-input {
  width: 100px;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
  font-size: 0.85rem;
  outline: none;
}

.hex-input:focus {
  border-color: var(--vp-c-brand-1);
}

.custom-description {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
  margin: 0;
}

/* ── Terminal preview ─────────────────────────────────────────────── */
.detail-section {
  margin-top: 0.5rem;
}

.preview-container {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
}

.preview-titlebar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 8px 12px;
  font-size: 0.8rem;
  font-weight: 500;
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", monospace;
}

.preview-dots {
  display: flex;
  gap: 5px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.preview-title {
  opacity: 0.8;
}

.preview-terminal {
  font-family: "SF Mono", "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
  font-size: 0.82rem;
  line-height: 1.55;
}

.preview-statusbar {
  padding: 4px 14px;
  font-size: 0.78rem;
  letter-spacing: 0.02em;
}

.preview-content {
  padding: 8px 0;
}

.preview-line {
  padding: 2px 14px;
  white-space: pre;
}

.preview-selected {
  margin: 0;
}

.preview-tag {
  font-size: 0.65rem;
  padding: 1px 5px;
  border-radius: 3px;
  margin-left: 6px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  vertical-align: middle;
}

.preview-input {
  padding: 6px 14px;
  margin-top: 4px;
}

.preview-footer {
  padding: 4px 14px;
  font-size: 0.72rem;
}

.cursor-block {
  display: inline-block;
  width: 0.6em;
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% {
    opacity: 0;
  }
}

/* ── Token strip (below terminal preview) ────────────────────────── */
.token-strip {
  display: flex;
  gap: 1.25rem;
  flex-wrap: wrap;
  padding: 0.75rem 0;
  margin-top: 0.75rem;
}

.strip-group {
  display: flex;
  gap: 0.75rem;
}

.strip-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.strip-swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  flex-shrink: 0;
}

.strip-label {
  font-size: 0.72rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-3);
}

/* ── Semantic tokens pane ────────────────────────────────────────── */
.tokens-pane {
  margin-bottom: 1.25rem;
}

.tokens-intro {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  line-height: 1.55;
  margin: 0 0 1rem 0;
}

.tokens-intro code {
  font-size: 0.8rem;
  background: var(--vp-c-bg-soft);
  padding: 1px 5px;
  border-radius: 3px;
}

.token-group {
  margin-bottom: 1.25rem;
}

.token-group-heading {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  margin: 0 0 0.5rem 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.token-group-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.5rem;
}

.token-card {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  transition: background 0.15s;
}

.token-card:hover {
  background: var(--vp-c-bg-elv);
}

.token-card-swatch-area {
  flex-shrink: 0;
}

.token-card-swatch {
  width: 32px;
  height: 32px;
  border-radius: 5px;
  border: 1px solid rgba(128, 128, 128, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

.token-card-swatch-text {
  font-size: 0.75rem;
  font-weight: 700;
  font-family: var(--vp-font-family-mono);
}

.token-card-swatch-text-overlay {
  font-size: 0.7rem;
  font-weight: 700;
  font-family: var(--vp-font-family-mono);
}

.token-card-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.token-card-name {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  background: none;
  padding: 0;
}

.token-card-hex {
  font-size: 0.68rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-3);
}

.token-card-desc {
  font-size: 0.68rem;
  color: var(--vp-c-text-3);
}

/* ── Palette detail pane ─────────────────────────────────────────── */
.palette-pane {
  margin-bottom: 1.25rem;
}

.palette-special-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.4rem;
  margin-bottom: 1rem;
}

.palette-detail-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0;
}

.palette-detail-swatch {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid rgba(128, 128, 128, 0.2);
  flex-shrink: 0;
}

.palette-detail-label {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  min-width: 90px;
}

.palette-detail-hex {
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg-soft);
  padding: 1px 5px;
  border-radius: 3px;
}

.ansi-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.ansi-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.ansi-swatch {
  width: 100%;
  aspect-ratio: 1.4;
  border-radius: 5px;
  border: 1px solid rgba(128, 128, 128, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-family: var(--vp-font-family-mono);
  font-weight: 600;
}

.ansi-label {
  font-size: 0.62rem;
  color: var(--vp-c-text-3);
  text-align: center;
  white-space: nowrap;
}

.ansi-hex {
  font-size: 0.58rem;
  color: var(--vp-c-text-3);
  background: none;
  padding: 0;
}

/* ── Code section ─────────────────────────────────────────────────── */
.code-section {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  margin-top: 1rem;
}

.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.75rem;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
}

.code-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
}

.copy-btn {
  padding: 0.25rem 0.6rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 0.75rem;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}

.copy-btn:hover {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.code-block {
  margin: 0;
  padding: 0.75rem 1rem;
  background: var(--vp-code-block-bg);
  font-size: 0.82rem;
  line-height: 1.6;
  overflow-x: auto;
}

.code-block code {
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
}

/* ── Responsive ───────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .gallery-columns {
    grid-template-columns: 1fr;
  }
  .palette-list {
    max-height: 200px;
  }
  .token-group-grid {
    grid-template-columns: 1fr;
  }
  .ansi-grid {
    grid-template-columns: repeat(4, 1fr);
  }
  .custom-controls {
    flex-direction: column;
    align-items: stretch;
  }
  .token-strip {
    flex-direction: column;
    gap: 0.5rem;
  }
}

@media (max-width: 480px) {
  .ansi-grid {
    grid-template-columns: repeat(4, 1fr);
  }
  .palette-special-grid {
    grid-template-columns: 1fr;
  }
  .detail-tabs {
    overflow-x: auto;
  }
}
</style>
