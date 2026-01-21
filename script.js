"use strict";
console.clear();
//test
// This is a prime example of what starts out as a simple project
// and snowballs way beyond its intended size. It's a little clunky
// reading/working on this single file, but here it is anyways :)

const IS_MOBILE = window.innerWidth <= 640;
const IS_DESKTOP = window.innerWidth > 800;
const IS_HEADER = IS_DESKTOP && window.innerHeight < 300;
// Detect high end devices. This will be a moving target.
const IS_HIGH_END_DEVICE = (() => {
  const hwConcurrency = navigator.hardwareConcurrency;
  if (!hwConcurrency) {
    return false;
  }
  // Large screens indicate a full size computer, which often have hyper threading these days.
  // So a quad core desktop machine has 8 cores. We'll place a higher min threshold there.
  const minCount = window.innerWidth <= 1024 ? 4 : 8;
  return hwConcurrency >= minCount;
})();
// Prevent canvases from getting too large on ridiculous screen sizes.
// 8K - can restrict this if needed
const MAX_WIDTH = 7680;
const MAX_HEIGHT = 4320;
const GRAVITY = 0.9; // Acceleration in px/s
let simSpeed = 1;

function getDefaultScaleFactor() {
  if (IS_MOBILE) return 0.9;
  if (IS_HEADER) return 0.75;
  return 1;
}

// Width/height values that take scale into account.
// USE THESE FOR DRAWING POSITIONS
let stageW, stageH;

// All quality globals will be overwritten and updated via `configDidUpdate`.
let quality = 1;
let isLowQuality = false;
let isNormalQuality = true;
let isHighQuality = false;

const QUALITY_LOW = 1;
const QUALITY_NORMAL = 2;
const QUALITY_HIGH = 3;

const SKY_LIGHT_NONE = 0;
const SKY_LIGHT_DIM = 1;
const SKY_LIGHT_NORMAL = 2;

const COLOR = {
  Red: "#ff0043",
  Green: "#14fc56",
  Blue: "#1e7fff",
  Purple: "#e60aff",
  Gold: "#ffbf36",
  White: "#ffffff",
};

// Special invisible color (not rendered, and therefore not in COLOR map)
const INVISIBLE = "_INVISIBLE_";

const PI_2 = Math.PI * 2;
const PI_HALF = Math.PI * 0.5;

// Stage.disableHighDPI = true;
const trailsStage = new Stage("trails-canvas");
const mainStage = new Stage("main-canvas");
const stages = [trailsStage, mainStage];

// Fullscreen helpers, using Fscreen for prefixes.
function fullscreenEnabled() {
  return fscreen.fullscreenEnabled;
}

// Note that fullscreen state is synced to store, and the store should be the source
// of truth for whether the app is in fullscreen mode or not.
function isFullscreen() {
  return !!fscreen.fullscreenElement;
}

// Attempt to toggle fullscreen mode.
function toggleFullscreen() {
  if (fullscreenEnabled()) {
    if (isFullscreen()) {
      fscreen.exitFullscreen();
    } else {
      fscreen.requestFullscreen(document.documentElement);
    }
  }
}

// Sync fullscreen changes with store. An event listener is necessary because the user can
// toggle fullscreen mode directly through the browser, and we want to react to that.
fscreen.addEventListener("fullscreenchange", () => {
  store.setState({ fullscreen: isFullscreen() });
});

// Simple state container; the source of truth.
const store = {
  _listeners: new Set(),
  _dispatch(prevState) {
    this._listeners.forEach((listener) => listener(this.state, prevState));
  },

  state: {
    // will be unpaused in init()
    paused: true,
    soundEnabled: true,
    menuOpen: false,
    openHelpTopic: null,
    fullscreen: isFullscreen(),
    // Note that config values used for <select>s must be strings, unless manually converting values to strings
    // at render time, and parsing on change.
    config: {
      quality: String(IS_HIGH_END_DEVICE ? QUALITY_HIGH : QUALITY_NORMAL), // will be mirrored to a global variable named `quality` in `configDidUpdate`, for perf.
      shell: "Random",
      size: IS_DESKTOP
        ? "3" // Desktop default
        : IS_HEADER
        ? "1.2" // Profile header default (doesn't need to be an int)
        : "2", // Mobile default
      autoLaunch: true,
      finale: false,
      skyLighting: SKY_LIGHT_NORMAL + "",
      //hideControls: IS_HEADER,
      hideControls: false,
      longExposure: false,
      scaleFactor: getDefaultScaleFactor(),
    },
  },

  setState(nextState) {
    const prevState = this.state;
    this.state = Object.assign({}, this.state, nextState);
    this._dispatch(prevState);
    this.persist();
  },

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.remove(listener);
  },

  // Load / persist select state to localStorage
  // Mutates state because `store.load()` should only be called once immediately after store is created, before any subscriptions.
  load() {
    const serializedData = localStorage.getItem("cm_fireworks_data");
    if (serializedData) {
      const { schemaVersion, data } = JSON.parse(serializedData);

      const config = this.state.config;
      switch (schemaVersion) {
        case "1.1":
          config.quality = data.quality;
          config.size = data.size;
          config.skyLighting = data.skyLighting;
          break;
        case "1.2":
          config.quality = data.quality;
          config.size = data.size;
          config.skyLighting = data.skyLighting;
          config.scaleFactor = data.scaleFactor;
          break;
        default:
          throw new Error("version switch should be exhaustive");
      }
      console.log(`Loaded config (schema version ${schemaVersion})`);
    }
    // Deprecated data format. Checked with care (it's not namespaced).
    else if (localStorage.getItem("schemaVersion") === "1") {
      let size;
      // Attempt to parse data, ignoring if there is an error.
      try {
        const sizeRaw = localStorage.getItem("configSize");
        size = typeof sizeRaw === "string" && JSON.parse(sizeRaw);
      } catch (e) {
        console.log("Recovered from error parsing saved config:");
        console.error(e);
        return;
      }
      // Only restore validated values
      const sizeInt = parseInt(size, 10);
      if (sizeInt >= 0 && sizeInt <= 4) {
        this.state.config.size = String(sizeInt);
      }
    }
  },

  persist() {
    const config = this.state.config;
    localStorage.setItem(
      "cm_fireworks_data",
      JSON.stringify({
        schemaVersion: "1.2",
        data: {
          quality: config.quality,
          size: config.size,
          skyLighting: config.skyLighting,
          scaleFactor: config.scaleFactor,
        },
      })
    );
  },
};

if (!IS_HEADER) {
  store.load();
  applyPresentationDefaults();
}

// Actions
// ---------

function togglePause(toggle) {
  const paused = store.state.paused;
  let newValue;
  if (typeof toggle === "boolean") {
    newValue = toggle;
  } else {
    newValue = !paused;
  }

  if (paused !== newValue) {
    store.setState({ paused: newValue });
  }
}

function toggleSound(toggle) {
  if (typeof toggle === "boolean") {
    store.setState({ soundEnabled: toggle });
  } else {
    store.setState({ soundEnabled: !store.state.soundEnabled });
  }
}

function ensureAudioUnlocked() {
  if (!store.state.soundEnabled) return;
  if (!soundManager || !soundManager.ctx) return;
  if (soundManager.ctx.state === "running") return;

  // Must run inside a real user interaction to work reliably.
  try {
    soundManager.unlock();
  } catch (e) {
    // ignore
  }
}

function handleSoundToggle() {
  const willEnable = !store.state.soundEnabled;
  toggleSound();
  if (willEnable) {
    ensureAudioUnlocked();
  }
}

function toggleMenu(toggle) {
  if (typeof toggle === "boolean") {
    store.setState({ menuOpen: toggle });
  } else {
    store.setState({ menuOpen: !store.state.menuOpen });
  }
}

function updateConfig(nextConfig) {
  nextConfig = nextConfig || getConfigFromDOM();
  const mergedConfig = Object.assign({}, store.state.config, nextConfig);
  // Finale mode implies Auto Fire.
  if (mergedConfig.finale && !mergedConfig.autoLaunch) {
    mergedConfig.autoLaunch = true;
  }
  store.setState({ config: mergedConfig });

  configDidUpdate();
}

// Map config to various properties & apply side effects
function configDidUpdate() {
  const config = store.state.config;

  quality = qualitySelector();
  isLowQuality = quality === QUALITY_LOW;
  isNormalQuality = quality === QUALITY_NORMAL;
  isHighQuality = quality === QUALITY_HIGH;

  if (skyLightingSelector() === SKY_LIGHT_NONE) {
    appNodes.canvasContainer.style.backgroundColor = "#000";
  }

  Spark.drawWidth = quality === QUALITY_HIGH ? 0.75 : 1;
}

// Selectors
// -----------

const isRunning = (state = store.state) => !state.paused && !state.menuOpen;
// Whether user has enabled sound.
const soundEnabledSelector = (state = store.state) => state.soundEnabled;
// Whether any sounds are allowed, taking into account multiple factors.
const canPlaySoundSelector = (state = store.state) =>
  isRunning(state) && soundEnabledSelector(state);
// Convert quality to number.
const qualitySelector = () => +store.state.config.quality;
const shellNameSelector = () => store.state.config.shell;
// Convert shell size to number.
const shellSizeSelector = () => +store.state.config.size;
const finaleSelector = () => store.state.config.finale;
const skyLightingSelector = () => +store.state.config.skyLighting;
const scaleFactorSelector = () => store.state.config.scaleFactor;

// Help Content
const helpContent = {
  shellType: {
    header: "Loại pháo",
    body: 'Loại pháo hoa sẽ được bắn. Chọn "Ngẫu nhiên" để có nhiều kiểu đa dạng.',
  },
  shellSize: {
    header: "Cỡ pháo",
    body: "Kích thước pháo hoa. Cỡ càng lớn thì chùm nổ càng to, nhiều tia hơn và đôi khi hiệu ứng phức tạp hơn. Tuy nhiên cũng tốn hiệu năng hơn và có thể gây giật lag.",
  },
  quality: {
    header: "Chất lượng",
    body: "Chất lượng đồ hoạ tổng thể. Nếu chạy không mượt, hãy giảm chất lượng. Chất lượng cao tăng rất nhiều số lượng tia lửa nên có thể gây lag.",
  },
  skyLighting: {
    header: "Ánh sáng nền",
    body: 'Làm sáng nền khi pháo nổ. Nếu nền quá chói, hãy thử đặt "Mờ" hoặc "Tắt".',
  },
  scaleFactor: {
    header: "Tỉ lệ",
    body: "Điều chỉnh tỉ lệ tổng thể của pháo hoa (như đứng gần/xa hơn). Với cỡ pháo lớn, bạn có thể giảm tỉ lệ một chút, đặc biệt trên điện thoại/máy tính bảng.",
  },
  autoLaunch: {
    header: "Tự bắn",
    body: "Tự động bắn pháo theo chuỗi. Bật để xem trình diễn tự động, hoặc tắt để tự điều khiển.",
  },
  finaleMode: {
    header: "Chế độ cao trào",
    body: 'Bắn dồn dập (có thể gây lag). Chế độ này cần bật "Tự bắn".',
  },
  hideControls: {
    header: "Ẩn điều khiển",
    body: "Ẩn các nút điều khiển ở phía trên. Hữu ích khi trình chiếu/chụp ảnh. Khi đã ẩn, bạn vẫn có thể mở lại menu Cài đặt bằng phím O.",
  },
  lixiRain: {
    header: "Mưa lì xì",
    body: "Bật/tắt hiệu ứng mưa bao lì xì rơi trên màn hình.",
  },
  fullscreen: {
    header: "Toàn màn hình",
    body: "Bật/tắt chế độ toàn màn hình.",
  },
  longExposure: {
    header: "Phơi sáng",
    body: "Hiệu ứng thử nghiệm giữ lại các vệt sáng dài, giống như chụp phơi sáng.",
  },
};

const nodeKeyToHelpKey = {
  shellTypeLabel: "shellType",
  shellSizeLabel: "shellSize",
  qualityLabel: "quality",
  skyLightingLabel: "skyLighting",
  scaleFactorLabel: "scaleFactor",
  autoLaunchLabel: "autoLaunch",
  finaleModeLabel: "finaleMode",
  hideControlsLabel: "hideControls",
  lixiRainLabel: "lixiRain",
  fullscreenLabel: "fullscreen",
  longExposureLabel: "longExposure",
};

// Render app UI / keep in sync with state
const appNodes = {
  stageContainer: ".stage-container",
  canvasContainer: ".canvas-container",
  controls: ".controls",
  menu: ".menu",
  menuInnerWrap: ".menu__inner-wrap",
  pauseBtn: ".pause-btn",
  pauseBtnSVG: ".pause-btn use",
  soundBtn: ".sound-btn",
  soundBtnSVG: ".sound-btn use",
  shellType: ".shell-type",
  shellTypeLabel: ".shell-type-label",
  shellSize: ".shell-size",
  shellSizeLabel: ".shell-size-label",
  quality: ".quality-ui",
  qualityLabel: ".quality-ui-label",
  skyLighting: ".sky-lighting",
  skyLightingLabel: ".sky-lighting-label",
  scaleFactor: ".scaleFactor",
  scaleFactorLabel: ".scaleFactor-label",
  autoLaunch: ".auto-launch",
  autoLaunchLabel: ".auto-launch-label",
  finaleModeFormOption: ".form-option--finale-mode",
  finaleMode: ".finale-mode",
  finaleModeLabel: ".finale-mode-label",
  hideControls: ".hide-controls",
  hideControlsLabel: ".hide-controls-label",
  lixiRainLabel: ".lixi-rain-label",
  fullscreenFormOption: ".form-option--fullscreen",
  fullscreen: ".fullscreen",
  fullscreenLabel: ".fullscreen-label",
  longExposure: ".long-exposure",
  longExposureLabel: ".long-exposure-label",

  // Help UI
  helpModal: ".help-modal",
  helpModalOverlay: ".help-modal__overlay",
  helpModalHeader: ".help-modal__header",
  helpModalBody: ".help-modal__body",
  helpModalCloseBtn: ".help-modal__close-btn",
};

// Convert appNodes selectors to dom nodes
Object.keys(appNodes).forEach((key) => {
  appNodes[key] = document.querySelector(appNodes[key]);
});

// Remove fullscreen control if not supported.
if (!fullscreenEnabled()) {
  appNodes.fullscreenFormOption.classList.add("remove");
}

// First render is called in init()
function renderApp(state) {
  const pauseBtnIcon = `#icon-${state.paused ? "play" : "pause"}`;
  const soundBtnIcon = `#icon-sound-${soundEnabledSelector() ? "on" : "off"}`;
  appNodes.pauseBtnSVG.setAttribute("href", pauseBtnIcon);
  appNodes.pauseBtnSVG.setAttribute("xlink:href", pauseBtnIcon);
  appNodes.soundBtnSVG.setAttribute("href", soundBtnIcon);
  appNodes.soundBtnSVG.setAttribute("xlink:href", soundBtnIcon);
  appNodes.controls.classList.toggle(
    "hide",
    state.menuOpen || state.config.hideControls
  );
  appNodes.canvasContainer.classList.toggle("blur", state.menuOpen);
  appNodes.menu.classList.toggle("hide", !state.menuOpen);
  appNodes.finaleModeFormOption.style.opacity = state.config.autoLaunch
    ? 1
    : 0.32;

  appNodes.quality.value = state.config.quality;
  appNodes.shellType.value = state.config.shell;
  appNodes.shellSize.value = state.config.size;
  appNodes.autoLaunch.checked = state.config.autoLaunch;
  appNodes.finaleMode.checked = state.config.finale;
  appNodes.skyLighting.value = state.config.skyLighting;
  appNodes.hideControls.checked = state.config.hideControls;
  appNodes.fullscreen.checked = state.fullscreen;
  appNodes.longExposure.checked = state.config.longExposure;
  appNodes.scaleFactor.value = state.config.scaleFactor.toFixed(2);

  appNodes.menuInnerWrap.style.opacity = state.openHelpTopic ? 0.12 : 1;
  appNodes.helpModal.classList.toggle("active", !!state.openHelpTopic);
  document.body.classList.toggle("menu-open", state.menuOpen);
  if (state.openHelpTopic) {
    const { header, body } = helpContent[state.openHelpTopic];
    appNodes.helpModalHeader.textContent = header;
    appNodes.helpModalBody.textContent = body;
  }
}

store.subscribe(renderApp);

// Perform side effects on state changes
function handleStateChange(state, prevState) {
  const canPlaySound = canPlaySoundSelector(state);
  const canPlaySoundPrev = canPlaySoundSelector(prevState);

  if (canPlaySound !== canPlaySoundPrev) {
    if (canPlaySound) {
      soundManager.resumeAll();
    } else {
      soundManager.pauseAll();
    }
  }
}

store.subscribe(handleStateChange);

function getConfigFromDOM() {
  return {
    quality: appNodes.quality.value,
    shell: appNodes.shellType.value,
    size: appNodes.shellSize.value,
    autoLaunch: appNodes.autoLaunch.checked,
    finale: appNodes.finaleMode.checked,
    skyLighting: appNodes.skyLighting.value,
    longExposure: appNodes.longExposure.checked,
    hideControls: appNodes.hideControls.checked,
    // Store value as number.
    scaleFactor: parseFloat(appNodes.scaleFactor.value),
  };
}

const updateConfigNoEvent = () => updateConfig();
appNodes.quality.addEventListener("input", updateConfigNoEvent);
appNodes.shellType.addEventListener("input", updateConfigNoEvent);
appNodes.shellSize.addEventListener("input", updateConfigNoEvent);
appNodes.autoLaunch.addEventListener("click", () =>
  setTimeout(updateConfig, 0)
);
appNodes.finaleMode.addEventListener("click", () =>
  setTimeout(updateConfig, 0)
);
appNodes.skyLighting.addEventListener("input", updateConfigNoEvent);
appNodes.longExposure.addEventListener("click", () =>
  setTimeout(updateConfig, 0)
);
appNodes.hideControls.addEventListener("click", () =>
  setTimeout(updateConfig, 0)
);
appNodes.fullscreen.addEventListener("click", () =>
  setTimeout(toggleFullscreen, 0)
);
// Changing scaleFactor requires triggering resize handling code as well.
appNodes.scaleFactor.addEventListener("input", () => {
  updateConfig();
  handleResize();
});

Object.keys(nodeKeyToHelpKey).forEach((nodeKey) => {
  const helpKey = nodeKeyToHelpKey[nodeKey];
  appNodes[nodeKey].addEventListener("click", () => {
    store.setState({ openHelpTopic: helpKey });
  });
});

appNodes.helpModalCloseBtn.addEventListener("click", () => {
  store.setState({ openHelpTopic: null });
});

appNodes.helpModalOverlay.addEventListener("click", () => {
  store.setState({ openHelpTopic: null });
});

// Constant derivations
const COLOR_NAMES = Object.keys(COLOR);
const COLOR_CODES = COLOR_NAMES.map((colorName) => COLOR[colorName]);
// Invisible stars need an indentifier, even through they won't be rendered - physics still apply.
const COLOR_CODES_W_INVIS = [...COLOR_CODES, INVISIBLE];
// Map of color codes to their index in the array. Useful for quickly determining if a color has already been updated in a loop.
const COLOR_CODE_INDEXES = COLOR_CODES_W_INVIS.reduce((obj, code, i) => {
  obj[code] = i;
  return obj;
}, {});
// Tuples is a map keys by color codes (hex) with values of { r, g, b } tuples (still just objects).
const COLOR_TUPLES = {};
COLOR_CODES.forEach((hex) => {
  COLOR_TUPLES[hex] = {
    r: parseInt(hex.substr(1, 2), 16),
    g: parseInt(hex.substr(3, 2), 16),
    b: parseInt(hex.substr(5, 2), 16),
  };
});

// Get a random color.
function randomColorSimple() {
  return COLOR_CODES[(Math.random() * COLOR_CODES.length) | 0];
}

// Get a random color, with some customization options available.
let lastColor;
function randomColor(options) {
  const notSame = options && options.notSame;
  const notColor = options && options.notColor;
  const limitWhite = options && options.limitWhite;
  let color = randomColorSimple();

  // limit the amount of white chosen randomly
  if (limitWhite && color === COLOR.White && Math.random() < 0.6) {
    color = randomColorSimple();
  }

  if (notSame) {
    while (color === lastColor) {
      color = randomColorSimple();
    }
  } else if (notColor) {
    while (color === notColor) {
      color = randomColorSimple();
    }
  }

  lastColor = color;
  return color;
}

function whiteOrGold() {
  return Math.random() < 0.5 ? COLOR.Gold : COLOR.White;
}

function randomWarmColor(options) {
  // Bias towards warm/pink tones for blossoms.
  const palette = [COLOR.Gold, COLOR.Red, COLOR.Purple, COLOR.White];
  const notColor = options && options.notColor;
  const limitWhite = options && options.limitWhite;

  let color = palette[(Math.random() * palette.length) | 0];
  if (limitWhite && color === COLOR.White && Math.random() < 0.6) {
    color = palette[(Math.random() * (palette.length - 1)) | 0];
  }
  if (notColor) {
    while (color === notColor) {
      color = palette[(Math.random() * palette.length) | 0];
    }
  }
  return color;
}

// Shell helpers
function makePistilColor(shellColor) {
  return shellColor === COLOR.White || shellColor === COLOR.Gold
    ? randomColor({ notColor: shellColor })
    : whiteOrGold();
}

// Unique shell types
const crysanthemumShell = (size = 1) => {
  const glitter = Math.random() < 0.25;
  const singleColor = Math.random() < 0.72;
  const color = singleColor
    ? randomColor({ limitWhite: true })
    : [randomColor(), randomColor({ notSame: true })];
  const pistil = singleColor && Math.random() < 0.42;
  const pistilColor = pistil && makePistilColor(color);
  const secondColor =
    singleColor && (Math.random() < 0.2 || color === COLOR.White)
      ? pistilColor || randomColor({ notColor: color, limitWhite: true })
      : null;
  const streamers = !pistil && color !== COLOR.White && Math.random() < 0.42;
  let starDensity = glitter ? 1.1 : 1.25;
  if (isLowQuality) starDensity *= 0.8;
  if (isHighQuality) starDensity = 1.2;
  return {
    shellSize: size,
    spreadSize: 300 + size * 100,
    starLife: 900 + size * 200,
    starDensity,
    color,
    secondColor,
    glitter: glitter ? "light" : "",
    glitterColor: whiteOrGold(),
    pistil,
    pistilColor,
    streamers,
  };
};

const ghostShell = (size = 1) => {
  // Extend crysanthemum shell
  const shell = crysanthemumShell(size);
  // Ghost effect can be fast, so extend star life
  shell.starLife *= 1.5;
  // Ensure we always have a single color other than white
  let ghostColor = randomColor({ notColor: COLOR.White });
  // Always use streamers, and sometimes a pistil
  shell.streamers = true;
  const pistil = Math.random() < 0.42;
  const pistilColor = pistil && makePistilColor(ghostColor);
  // Ghost effect - transition from invisible to chosen color
  shell.color = INVISIBLE;
  shell.secondColor = ghostColor;
  // We don't want glitter to be spewed by invisible stars, and we don't currently
  // have a way to transition glitter state. So we'll disable it.
  shell.glitter = "";

  return shell;
};

const strobeShell = (size = 1) => {
  const color = randomColor({ limitWhite: true });
  return {
    shellSize: size,
    spreadSize: 280 + size * 92,
    starLife: 1100 + size * 200,
    starLifeVariation: 0.4,
    starDensity: 1.1,
    color,
    glitter: "light",
    glitterColor: COLOR.White,
    strobe: true,
    strobeColor: Math.random() < 0.5 ? COLOR.White : null,
    pistil: Math.random() < 0.5,
    pistilColor: makePistilColor(color),
  };
};

const palmShell = (size = 1) => {
  const color = randomColor();
  const thick = Math.random() < 0.5;
  return {
    shellSize: size,
    color,
    spreadSize: 250 + size * 75,
    starDensity: thick ? 0.15 : 0.4,
    starLife: 1800 + size * 200,
    starLifeVariation: 0.35,
    glitter: thick ? "thick" : "light",
    glitterColor: color === COLOR.Gold ? COLOR.Gold : COLOR.White,
    streamers: thick,
  };
};

const ringShell = (size = 1) => {
  const color = randomColor({ limitWhite: true });
  const pistil = Math.random() < 0.5;
  return {
    shellSize: size,
    ring: true,
    color,
    spreadSize: 300 + size * 100,
    starLife: 900 + size * 210,
    starLifeVariation: 0.4,
    starCount: Math.floor(2.2 * (size + 3) * 8),
    glitter: "",
    pistil,
    pistilColor: pistil && makePistilColor(color),
  };
};

const crossetteShell = (size = 1) => {
  const color = randomColor({ limitWhite: true });
  return {
    shellSize: size,
    spreadSize: 300 + size * 100,
    starLife: 750 + size * 160,
    starLifeVariation: 0.4,
    starDensity: 0.85,
    color,
    crossette: true,
    pistil: Math.random() < 0.5,
    pistilColor: makePistilColor(color),
  };
};

// New: Hoa mai (burst into many small hoa mai)
const maiBlossomShell = (size = 1) => ({
  shellSize: size,
  spreadSize: 360 + size * 90,
  // Short primary life so it quickly "turns into" many blossoms.
  starLife: 520 + size * 140,
  starLifeVariation: 0.08,
  // Keep seed count modest; each seed can spawn a blossom.
  starCount: Math.max(8, 8 + Math.round(size * 4)),
  color: INVISIBLE,
  maiBlossom: true,
});

// New: Hoa đào (longer glowing)
const peachBlossomShell = (size = 1) => ({
  shellSize: size,
  spreadSize: 320 + size * 110,
  // Long glow
  starLife: 2400 + size * 460,
  starLifeVariation: 0.22,
  // Long-lived stars stack up if autoLaunch is on; keep count low.
  starDensity: isLowQuality ? 0.22 : 0.3,
  // Use warm/pink palette for peach blossom look.
  color: [
    randomWarmColor({ limitWhite: true }),
    randomWarmColor({ limitWhite: true }),
  ],
  glitter: "peach",
  glitterColor: COLOR.White,
  // Pistil adds another sub-shell; only enable on high quality.
  pistil: isHighQuality && Math.random() < 0.5,
  pistilColor: COLOR.White,
});

// New: Vietnam Flag (stylized waving flag + gold star)
const vietnamFlagShell = (size = 1) => ({
  shellSize: size,
  spreadSize: 560 + size * 140,
  starLife: 1900 + size * 320,
  starLifeVariation: 0.12,
  vietnamFlag: true,
  // We'll place stars directly on the shape; keep drift small.
  glitter: "peach",
  glitterColor: COLOR.Gold,
  // Keep burst workload bounded.
  starCount: 1,
  // Visible red lift/comet for a clearer launch.
  color: COLOR.Red,
});

const floralShell = (size = 1) => ({
  shellSize: size,
  spreadSize: 300 + size * 120,
  starDensity: 0.12,
  starLife: 500 + size * 50,
  starLifeVariation: 0.5,
  color:
    Math.random() < 0.65
      ? "random"
      : Math.random() < 0.15
      ? randomColor()
      : [randomColor(), randomColor({ notSame: true })],
  floral: true,
});

const fallingLeavesShell = (size = 1) => ({
  shellSize: size,
  color: INVISIBLE,
  spreadSize: 300 + size * 120,
  starDensity: 0.12,
  starLife: 500 + size * 50,
  starLifeVariation: 0.5,
  glitter: "medium",
  glitterColor: COLOR.Gold,
  fallingLeaves: true,
});

const willowShell = (size = 1) => ({
  shellSize: size,
  spreadSize: 300 + size * 100,
  starDensity: 0.6,
  starLife: 3000 + size * 300,
  glitter: "willow",
  glitterColor: COLOR.Gold,
  color: INVISIBLE,
});

const crackleShell = (size = 1) => {
  // favor gold
  const color = Math.random() < 0.75 ? COLOR.Gold : randomColor();
  return {
    shellSize: size,
    spreadSize: 380 + size * 75,
    starDensity: isLowQuality ? 0.65 : 1,
    starLife: 600 + size * 100,
    starLifeVariation: 0.32,
    glitter: "light",
    glitterColor: COLOR.Gold,
    color,
    crackle: true,
    pistil: Math.random() < 0.65,
    pistilColor: makePistilColor(color),
  };
};

const horsetailShell = (size = 1) => {
  const color = randomColor();
  return {
    shellSize: size,
    horsetail: true,
    color,
    spreadSize: 250 + size * 38,
    starDensity: 0.9,
    starLife: 2500 + size * 300,
    glitter: "medium",
    glitterColor: Math.random() < 0.5 ? whiteOrGold() : color,
    // Add strobe effect to white horsetails, to make them more interesting
    strobe: color === COLOR.White,
  };
};

function randomShellName() {
  return Math.random() < 0.5
    ? "Crysanthemum"
    : shellNames[(Math.random() * (shellNames.length - 1) + 1) | 0];
}

function randomShell(size) {
  // Special selection for codepen header.
  if (IS_HEADER) return randomFastShell()(size);
  // Normal operation
  return shellTypes[randomShellName()](size);
}

function shellFromConfig(size) {
  return shellTypes[shellNameSelector()](size);
}

// Get a random shell, not including processing intensive varients
// Note this is only random when "Random" shell is selected in config.
// Also, this does not create the shell, only returns the factory function.
const fastShellBlacklist = [
  "Falling Leaves",
  "Floral",
  "Willow",
  "Mai Blossom",
  "Peach Blossom",
];
function randomFastShell() {
  const isRandom = shellNameSelector() === "Random";
  let shellName = isRandom ? randomShellName() : shellNameSelector();
  if (isRandom) {
    while (fastShellBlacklist.includes(shellName)) {
      shellName = randomShellName();
    }
  }
  return shellTypes[shellName];
}

const shellTypes = {
  Random: randomShell,
  Crackle: crackleShell,
  Crossette: crossetteShell,
  Crysanthemum: crysanthemumShell,
  "Falling Leaves": fallingLeavesShell,
  Floral: floralShell,
  Ghost: ghostShell,
  "Horse Tail": horsetailShell,
  "Mai Blossom": maiBlossomShell,
  Palm: palmShell,
  "Peach Blossom": peachBlossomShell,
  "Vietnam Flag": vietnamFlagShell,
  Ring: ringShell,
  Strobe: strobeShell,
  Willow: willowShell,
};

const shellNames = Object.keys(shellTypes);

function init() {
  // Remove loading state
  document.querySelector(".loading-init").remove();
  appNodes.stageContainer.classList.remove("remove");

  // Populate dropdowns
  function setOptionsForSelect(node, options) {
    node.innerHTML = options.reduce(
      (acc, opt) =>
        (acc += `<option value="${opt.value}">${opt.label}</option>`),
      ""
    );
  }

  // shell type (labels in Vietnamese, values stay the same for logic)
  const shellTypeLabels = {
    Random: "Ngẫu nhiên",
    Crackle: "Nổ lách tách",
    Crossette: "Chẻ nhánh",
    Crysanthemum: "Cúc",
    "Falling Leaves": "Lá rơi",
    Floral: "Hoa",
    Ghost: "Ảo ảnh",
    "Horse Tail": "Đuôi ngựa",
    "Mai Blossom": "Hoa mai",
    Palm: "Cọ",
    "Peach Blossom": "Hoa đào",
    "Vietnam Flag": "Cờ Việt Nam",
    Ring: "Vòng",
    Strobe: "Chớp nháy",
    Willow: "Liễu rủ",
  };
  setOptionsForSelect(
    appNodes.shellType,
    shellNames.map((value) => ({
      value,
      label: shellTypeLabels[value] || value,
    }))
  );
  // shell size
  let options = "";
  ['3"', '4"', '6"', '8"', '12"', '16"'].forEach(
    (opt, i) => (options += `<option value="${i}">${opt}</option>`)
  );
  appNodes.shellSize.innerHTML = options;

  setOptionsForSelect(appNodes.quality, [
    { label: "Thấp", value: QUALITY_LOW },
    { label: "Trung bình", value: QUALITY_NORMAL },
    { label: "Cao", value: QUALITY_HIGH },
  ]);

  setOptionsForSelect(appNodes.skyLighting, [
    { label: "Tắt", value: SKY_LIGHT_NONE },
    { label: "Mờ", value: SKY_LIGHT_DIM },
    { label: "Vừa", value: SKY_LIGHT_NORMAL },
  ]);

  // 0.9 is mobile default
  setOptionsForSelect(
    appNodes.scaleFactor,
    [0.5, 0.62, 0.75, 0.9, 1.0, 1.5, 2.0].map((value) => ({
      value: value.toFixed(2),
      label: `${value * 100}%`,
    }))
  );

  // Begin simulation
  togglePause(false);

  // initial render
  renderApp(store.state);

  // Apply initial config
  configDidUpdate();
}

function applyPresentationDefaults() {
  // Defaults on page load:
  // - Hide controls
  // - Disable extra effects
  // - Sound enabled
  store.state.soundEnabled = true;
  store.state.config.autoLaunch = false;
  store.state.config.finale = false;
  store.state.config.skyLighting = String(SKY_LIGHT_NONE);
  store.state.config.longExposure = false;
  store.state.config.hideControls = true;
}

function fitShellPositionInBoundsH(position) {
  const edge = 0.18;
  return (1 - edge * 2) * position + edge;
}

function fitShellPositionInBoundsV(position) {
  return position * 0.75;
}

function getRandomShellPositionH() {
  return fitShellPositionInBoundsH(Math.random());
}

function getRandomShellPositionV() {
  return fitShellPositionInBoundsV(Math.random());
}

function getRandomShellSize() {
  const baseSize = shellSizeSelector();
  const maxVariance = Math.min(2.5, baseSize);
  const variance = Math.random() * maxVariance;
  const size = baseSize - variance;
  const height = maxVariance === 0 ? Math.random() : 1 - variance / maxVariance;
  const centerOffset = Math.random() * (1 - height * 0.65) * 0.5;
  const x = Math.random() < 0.5 ? 0.5 - centerOffset : 0.5 + centerOffset;
  return {
    size,
    x: fitShellPositionInBoundsH(x),
    height: fitShellPositionInBoundsV(height),
  };
}

// Launches a shell from a user pointer event, based on state.config
function launchShellFromConfig(event) {
  const shell = new Shell(shellFromConfig(shellSizeSelector()));
  const w = mainStage.width;
  const h = mainStage.height;

  shell.launch(
    event ? event.x / w : getRandomShellPositionH(),
    event ? 1 - event.y / h : getRandomShellPositionV()
  );
}

// Sequences
// -----------

function seqRandomShell() {
  const size = getRandomShellSize();
  const shell = new Shell(shellFromConfig(size.size));
  shell.launch(size.x, size.height);

  let extraDelay = shell.starLife;
  if (shell.fallingLeaves) {
    extraDelay = 4600;
  }

  return 900 + Math.random() * 600 + extraDelay;
}

function seqRandomFastShell() {
  const shellType = randomFastShell();
  const size = getRandomShellSize();
  const shell = new Shell(shellType(size.size));
  shell.launch(size.x, size.height);

  let extraDelay = shell.starLife;

  return 900 + Math.random() * 600 + extraDelay;
}

function seqTwoRandom() {
  const size1 = getRandomShellSize();
  const size2 = getRandomShellSize();
  const shell1 = new Shell(shellFromConfig(size1.size));
  const shell2 = new Shell(shellFromConfig(size2.size));
  const leftOffset = Math.random() * 0.2 - 0.1;
  const rightOffset = Math.random() * 0.2 - 0.1;
  shell1.launch(0.3 + leftOffset, size1.height);
  setTimeout(() => {
    shell2.launch(0.7 + rightOffset, size2.height);
  }, 100);

  let extraDelay = Math.max(shell1.starLife, shell2.starLife);
  if (shell1.fallingLeaves || shell2.fallingLeaves) {
    extraDelay = 4600;
  }

  return 900 + Math.random() * 600 + extraDelay;
}

function seqTriple() {
  const shellType = randomFastShell();
  const baseSize = shellSizeSelector();
  const smallSize = Math.max(0, baseSize - 1.25);

  const offset = Math.random() * 0.08 - 0.04;
  const shell1 = new Shell(shellType(baseSize));
  shell1.launch(0.5 + offset, 0.7);

  const leftDelay = 1000 + Math.random() * 400;
  const rightDelay = 1000 + Math.random() * 400;

  setTimeout(() => {
    const offset = Math.random() * 0.08 - 0.04;
    const shell2 = new Shell(shellType(smallSize));
    shell2.launch(0.2 + offset, 0.1);
  }, leftDelay);

  setTimeout(() => {
    const offset = Math.random() * 0.08 - 0.04;
    const shell3 = new Shell(shellType(smallSize));
    shell3.launch(0.8 + offset, 0.1);
  }, rightDelay);

  return 4000;
}

function seqPyramid() {
  const barrageCountHalf = IS_DESKTOP ? 7 : 4;
  const largeSize = shellSizeSelector();
  const smallSize = Math.max(0, largeSize - 3);
  const randomMainShell = Math.random() < 0.78 ? crysanthemumShell : ringShell;
  const randomSpecialShell = randomShell;

  function launchShell(x, useSpecial) {
    const isRandom = shellNameSelector() === "Random";
    let shellType = isRandom
      ? useSpecial
        ? randomSpecialShell
        : randomMainShell
      : shellTypes[shellNameSelector()];
    const shell = new Shell(shellType(useSpecial ? largeSize : smallSize));
    const height = x <= 0.5 ? x / 0.5 : (1 - x) / 0.5;
    shell.launch(x, useSpecial ? 0.75 : height * 0.42);
  }

  let count = 0;
  let delay = 0;
  while (count <= barrageCountHalf) {
    if (count === barrageCountHalf) {
      setTimeout(() => {
        launchShell(0.5, true);
      }, delay);
    } else {
      const offset = (count / barrageCountHalf) * 0.5;
      const delayOffset = Math.random() * 30 + 30;
      setTimeout(() => {
        launchShell(offset, false);
      }, delay);
      setTimeout(() => {
        launchShell(1 - offset, false);
      }, delay + delayOffset);
    }

    count++;
    delay += 200;
  }

  return 3400 + barrageCountHalf * 250;
}

function seqSmallBarrage() {
  seqSmallBarrage.lastCalled = Date.now();
  const barrageCount = IS_DESKTOP ? 11 : 5;
  const specialIndex = IS_DESKTOP ? 3 : 1;
  const shellSize = Math.max(0, shellSizeSelector() - 2);
  const randomMainShell = Math.random() < 0.78 ? crysanthemumShell : ringShell;
  const randomSpecialShell = randomFastShell();

  // (cos(x*5π+0.5π)+1)/2 is a custom wave bounded by 0 and 1 used to set varying launch heights
  function launchShell(x, useSpecial) {
    const isRandom = shellNameSelector() === "Random";
    let shellType = isRandom
      ? useSpecial
        ? randomSpecialShell
        : randomMainShell
      : shellTypes[shellNameSelector()];
    const shell = new Shell(shellType(shellSize));
    const height = (Math.cos(x * 5 * Math.PI + PI_HALF) + 1) / 2;
    shell.launch(x, height * 0.75);
  }

  let count = 0;
  let delay = 0;
  while (count < barrageCount) {
    if (count === 0) {
      launchShell(0.5, false);
      count += 1;
    } else {
      const offset = (count + 1) / barrageCount / 2;
      const delayOffset = Math.random() * 30 + 30;
      const useSpecial = count === specialIndex;
      setTimeout(() => {
        launchShell(0.5 + offset, useSpecial);
      }, delay);
      setTimeout(() => {
        launchShell(0.5 - offset, useSpecial);
      }, delay + delayOffset);
      count += 2;
    }
    delay += 200;
  }

  return 3400 + barrageCount * 120;
}
seqSmallBarrage.cooldown = 15000;
seqSmallBarrage.lastCalled = Date.now();

// ============================================
// HỆ THỐNG SHOW PATTERNS - Màn trình diễn có kịch bản
// ============================================
const showPatterns = {
  // Pattern 1: Quét đối xứng trái-phải với Vietnam Flag ở giữa
  mirrorSweep: {
    name: "Mirror Sweep",
    duration: 10000,
    timeline: [
      { t: 0, x: 0.2, h: 0.7, shell: "Crysanthemum", size: 3 },
      { t: 150, x: 0.8, h: 0.7, shell: "Crysanthemum", size: 3 },
      { t: 500, x: 0.15, h: 0.6, shell: "Crossette", size: 2.5 },
      { t: 650, x: 0.85, h: 0.6, shell: "Crossette", size: 2.5 },
      { t: 1000, x: 0.3, h: 0.75, shell: "Palm", size: 3.5 },
      { t: 1150, x: 0.7, h: 0.75, shell: "Palm", size: 3.5 },
      { t: 1500, x: 0.25, h: 0.65, shell: "Ring", size: 3 },
      { t: 1650, x: 0.75, h: 0.65, shell: "Ring", size: 3 },
      { t: 2000, x: 0.5, h: 0.8, shell: "Vietnam Flag", size: 4 },
      { t: 2500, x: 0.35, h: 0.7, shell: "Strobe", size: 2.5 },
      { t: 2650, x: 0.65, h: 0.7, shell: "Strobe", size: 2.5 },
      { t: 3000, x: 0.4, h: 0.6, shell: "Willow", size: 3 },
      { t: 3150, x: 0.6, h: 0.6, shell: "Willow", size: 3 },
    ]
  },

  // Pattern 2: Vòng tròn màu sắc với VN Flag
  colorRings: {
    name: "Color Rings",
    duration: 12000,
    timeline: [
      { t: 0, x: 0.5, h: 0.7, shell: "Ring", size: 4 },
      { t: 600, x: 0.3, h: 0.65, shell: "Crysanthemum", size: 3 },
      { t: 750, x: 0.7, h: 0.65, shell: "Crysanthemum", size: 3 },
      { t: 1200, x: 0.2, h: 0.6, shell: "Crossette", size: 2.5 },
      { t: 1350, x: 0.8, h: 0.6, shell: "Crossette", size: 2.5 },
      { t: 1800, x: 0.5, h: 0.75, shell: "Vietnam Flag", size: 4.5 },
      { t: 2400, x: 0.25, h: 0.7, shell: "Palm", size: 3.5 },
      { t: 2550, x: 0.75, h: 0.7, shell: "Palm", size: 3.5 },
      { t: 3000, x: 0.35, h: 0.65, shell: "Ring", size: 3 },
      { t: 3150, x: 0.65, h: 0.65, shell: "Ring", size: 3 },
      { t: 3600, x: 0.5, h: 0.8, shell: "Crysanthemum", size: 4 },
    ]
  },

  // Pattern 3: Lớp từ thấp đến cao - kim tự tháp
  layeredFan: {
    name: "Layered Fan",
    duration: 8000,
    timeline: [
      // Lớp 1: Thấp, 5 viên
      { t: 0, x: 0.2, h: 0.4, shell: "Crackle", size: 2 },
      { t: 100, x: 0.35, h: 0.4, shell: "Crackle", size: 2 },
      { t: 200, x: 0.5, h: 0.4, shell: "Crackle", size: 2 },
      { t: 300, x: 0.65, h: 0.4, shell: "Crackle", size: 2 },
      { t: 400, x: 0.8, h: 0.4, shell: "Crackle", size: 2 },
      // Lớp 2: Trung bình, 4 viên
      { t: 1000, x: 0.25, h: 0.6, shell: "Crossette", size: 2.5 },
      { t: 1100, x: 0.42, h: 0.6, shell: "Crossette", size: 2.5 },
      { t: 1200, x: 0.58, h: 0.6, shell: "Crossette", size: 2.5 },
      { t: 1300, x: 0.75, h: 0.6, shell: "Crossette", size: 2.5 },
      // Lớp 3: Cao, 3 viên + VN Flag
      { t: 2000, x: 0.3, h: 0.75, shell: "Palm", size: 3.5 },
      { t: 2100, x: 0.5, h: 0.8, shell: "Vietnam Flag", size: 4.5 },
      { t: 2200, x: 0.7, h: 0.75, shell: "Palm", size: 3.5 },
      // Lớp 4: Đỉnh cao
      { t: 3000, x: 0.5, h: 0.85, shell: "Crysanthemum", size: 5 },
    ]
  },

  // Pattern 4: Finale dày đặc
  grandFinale: {
    name: "Grand Finale",
    duration: 7000,
    timeline: [
      // Mở màn
      { t: 0, x: 0.2, h: 0.7, shell: "Crysanthemum", size: 3.5 },
      { t: 0, x: 0.5, h: 0.75, shell: "Vietnam Flag", size: 4.5 },
      { t: 0, x: 0.8, h: 0.7, shell: "Crysanthemum", size: 3.5 },
      // Sóng 1
      { t: 400, x: 0.3, h: 0.65, shell: "Crossette", size: 3 },
      { t: 400, x: 0.7, h: 0.65, shell: "Crossette", size: 3 },
      { t: 500, x: 0.15, h: 0.6, shell: "Crackle", size: 2.5 },
      { t: 500, x: 0.85, h: 0.6, shell: "Crackle", size: 2.5 },
      // Sóng 2
      { t: 1000, x: 0.25, h: 0.75, shell: "Palm", size: 3.5 },
      { t: 1000, x: 0.5, h: 0.8, shell: "Ring", size: 4 },
      { t: 1000, x: 0.75, h: 0.75, shell: "Palm", size: 3.5 },
      { t: 1200, x: 0.35, h: 0.7, shell: "Strobe", size: 3 },
      { t: 1200, x: 0.65, h: 0.7, shell: "Strobe", size: 3 },
      // VN Flag chính giữa
      { t: 1600, x: 0.5, h: 0.85, shell: "Vietnam Flag", size: 5 },
      // Bùng nổ cuối
      { t: 2000, x: 0.2, h: 0.7, shell: "Crysanthemum", size: 3.5 },
      { t: 2000, x: 0.4, h: 0.7, shell: "Crossette", size: 3 },
      { t: 2000, x: 0.6, h: 0.7, shell: "Crossette", size: 3 },
      { t: 2000, x: 0.8, h: 0.7, shell: "Crysanthemum", size: 3.5 },
      { t: 2200, x: 0.3, h: 0.75, shell: "Ring", size: 3.5 },
      { t: 2200, x: 0.7, h: 0.75, shell: "Ring", size: 3.5 },
      { t: 2400, x: 0.5, h: 0.8, shell: "Vietnam Flag", size: 4.5 },
    ]
  },

  // Pattern 5: Lễ hội Việt Nam - nhiều VN Flag
  vietnamCelebration: {
    name: "Vietnam Celebration",
    duration: 10000,
    timeline: [
      { t: 0, x: 0.5, h: 0.75, shell: "Vietnam Flag", size: 4.5 },
      { t: 800, x: 0.3, h: 0.7, shell: "Crysanthemum", size: 3 },
      { t: 950, x: 0.7, h: 0.7, shell: "Crysanthemum", size: 3 },
      { t: 1600, x: 0.5, h: 0.8, shell: "Vietnam Flag", size: 5 },
      { t: 2400, x: 0.2, h: 0.65, shell: "Palm", size: 3 },
      { t: 2550, x: 0.8, h: 0.65, shell: "Palm", size: 3 },
      { t: 3200, x: 0.3, h: 0.75, shell: "Vietnam Flag", size: 4 },
      { t: 3600, x: 0.7, h: 0.8, shell: "Vietnam Flag", size: 4 },
      { t: 4200, x: 0.5, h: 0.7, shell: "Ring", size: 4 },
      { t: 4800, x: 0.25, h: 0.7, shell: "Crossette", size: 3 },
      { t: 4950, x: 0.75, h: 0.7, shell: "Crossette", size: 3 },
      { t: 5600, x: 0.5, h: 0.85, shell: "Vietnam Flag", size: 5.5 },
    ]
  },

  // Pattern 6: Wave - sóng liên tiếp
  wave: {
    name: "Wave",
    duration: 9000,
    timeline: [
      { t: 0, x: 0.1, h: 0.6, shell: "Crysanthemum", size: 2.5 },
      { t: 200, x: 0.2, h: 0.65, shell: "Crysanthemum", size: 2.5 },
      { t: 400, x: 0.3, h: 0.7, shell: "Crysanthemum", size: 2.5 },
      { t: 600, x: 0.4, h: 0.73, shell: "Crysanthemum", size: 2.5 },
      { t: 800, x: 0.5, h: 0.75, shell: "Vietnam Flag", size: 4 },
      { t: 1000, x: 0.6, h: 0.73, shell: "Crysanthemum", size: 2.5 },
      { t: 1200, x: 0.7, h: 0.7, shell: "Crysanthemum", size: 2.5 },
      { t: 1400, x: 0.8, h: 0.65, shell: "Crysanthemum", size: 2.5 },
      { t: 1600, x: 0.9, h: 0.6, shell: "Crysanthemum", size: 2.5 },
      // Sóng ngược
      { t: 2400, x: 0.9, h: 0.6, shell: "Palm", size: 3 },
      { t: 2600, x: 0.8, h: 0.65, shell: "Palm", size: 3 },
      { t: 2800, x: 0.7, h: 0.7, shell: "Palm", size: 3 },
      { t: 3000, x: 0.6, h: 0.73, shell: "Palm", size: 3 },
      { t: 3200, x: 0.5, h: 0.75, shell: "Vietnam Flag", size: 4.5 },
      { t: 3400, x: 0.4, h: 0.73, shell: "Palm", size: 3 },
      { t: 3600, x: 0.3, h: 0.7, shell: "Palm", size: 3 },
      { t: 3800, x: 0.2, h: 0.65, shell: "Palm", size: 3 },
      { t: 4000, x: 0.1, h: 0.6, shell: "Palm", size: 3 },
    ]
  }
};

const showPatternNames = Object.keys(showPatterns);
let currentShowPattern = null;
let showStartTime = 0;
let nextShowEventIndex = 0;

// Hàm thực thi show pattern
function seqShowPattern() {
  // Chọn show ngẫu nhiên nếu chưa có
  if (!currentShowPattern) {
    const randomShow = showPatternNames[Math.floor(Math.random() * showPatternNames.length)];
    currentShowPattern = showPatterns[randomShow];
    showStartTime = Date.now();
    nextShowEventIndex = 0;
    console.log(`🎆 Bắt đầu màn: ${currentShowPattern.name}`);
  }

  const elapsed = Date.now() - showStartTime;
  const timeline = currentShowPattern.timeline;

  // Bắn các pháo theo timeline
  while (nextShowEventIndex < timeline.length && elapsed >= timeline[nextShowEventIndex].t) {
    const event = timeline[nextShowEventIndex];
    const size = getRandomShellSize();
    
    // Ghi đè vị trí và chiều cao từ timeline
    size.x = event.x;
    size.height = event.h;
    size.size = event.size || size.size;

    // Chọn loại pháo
    let shellType;
    if (event.shell === "Vietnam Flag") {
      shellType = vietnamFlagShell;
    } else if (shellTypes[event.shell]) {
      shellType = shellTypes[event.shell];
    } else {
      shellType = randomShell;
    }

    const shell = new Shell(shellType(size.size));
    shell.launch(size.x, size.height);
    
    nextShowEventIndex++;
  }

  // Kết thúc show
  if (elapsed >= currentShowPattern.duration) {
    console.log(`✅ Kết thúc màn: ${currentShowPattern.name}`);
    currentShowPattern = null;
    nextShowEventIndex = 0;
    // Trả về thời gian chờ trước show tiếp theo
    return 3000;
  }

  // Tiếp tục kiểm tra timeline
  return 50;
}
seqShowPattern.isShow = true;

const sequences = [
  seqRandomShell,
  seqTwoRandom,
  seqTriple,
  seqPyramid,
  seqSmallBarrage,
  seqShowPattern, // Thêm show pattern vào sequences
];

let isFirstSeq = true;
const finaleCount = 32;
let currentFinaleCount = 0;
function startSequence() {
  if (isFirstSeq) {
    isFirstSeq = false;
    if (IS_HEADER) {
      return seqTwoRandom();
    } else {
      const shell = new Shell(crysanthemumShell(shellSizeSelector()));
      shell.launch(0.5, 0.5);
      return 2400;
    }
  }

  if (finaleSelector()) {
    seqRandomFastShell();
    if (currentFinaleCount < finaleCount) {
      currentFinaleCount++;
      return 170;
    } else {
      currentFinaleCount = 0;
      return 6000;
    }
  }

  const rand = Math.random();

  // Tăng tỷ lệ xuất hiện show patterns (25% cơ hội)
  if (rand < 0.25 && !IS_HEADER) {
    return seqShowPattern();
  }

  if (
    rand < 0.33 &&
    Date.now() - seqSmallBarrage.lastCalled > seqSmallBarrage.cooldown
  ) {
    return seqSmallBarrage();
  }

  if (rand < 0.4) {
    return seqPyramid();
  }

  if (rand < 0.7 && !IS_HEADER) {
    return seqRandomShell();
  } else if (rand < 0.85) {
    return seqTwoRandom();
  } else if (rand < 1) {
    return seqTriple();
  }
}

let activePointerCount = 0;
let isUpdatingSpeed = false;

function handlePointerStart(event) {
  ensureAudioUnlocked();
  activePointerCount++;
  const btnSize = 50;

  // Top-edge quick controls only when HUD is hidden or menu is open.
  if (
    event.y < btnSize &&
    (store.state.menuOpen ||
      document.body.classList.contains("hud-hidden") ||
      (store.state.config.hideControls &&
        (!appNodes.controls || !appNodes.controls.matches(":hover"))))
  ) {
    // If the pointer is actually over UI controls/menu, don't also trigger quick-controls.
    try {
      const el = document.elementFromPoint(event.x, event.y);
      if (el && el.closest && el.closest(".controls, .menu, .help-modal")) {
        return;
      }
    } catch (e) {
      // ignore
    }

    const w = mainStage.width;
    const q = w / 4;
    if (event.x < q) {
      togglePause();
      return;
    }
    if (event.x < q * 2) {
      handleSoundToggle();
      return;
    }
    if (event.x < q * 3) {
      toggleLixiRain();
      return;
    }
    toggleMenu();
    return;
  }

  if (!isRunning()) return;

  if (updateSpeedFromEvent(event)) {
    isUpdatingSpeed = true;
  } else if (event.onCanvas) {
    launchShellFromConfig(event);
  }
}

function handlePointerEnd(event) {
  activePointerCount--;
  isUpdatingSpeed = false;
}

function handlePointerMove(event) {
  if (!isRunning()) return;

  if (isUpdatingSpeed) {
    updateSpeedFromEvent(event);
  }
}

function handleKeydown(event) {
  ensureAudioUnlocked();
  // Ignore hotkeys while typing/selecting.
  const targetTag = event.target && event.target.tagName;
  if (targetTag === "INPUT" || targetTag === "SELECT" || targetTag === "TEXTAREA") {
    return;
  }

  // P
  if (event.keyCode === 80) {
    togglePause();
  }
  // O
  else if (event.keyCode === 79) {
    toggleMenu();
  }
  // H (hide/show HUD)
  else if (event.keyCode === 72) {
    document.body.classList.toggle("hud-hidden");
  }
  // L (toggle lì xì rain)
  else if (event.keyCode === 76) {
    toggleLixiRain();
  }
  // A (toggle Auto Fire)
  else if (event.keyCode === 65) {
    try {
      updateConfig({ autoLaunch: !store.state.config.autoLaunch });
    } catch (e) {
      // ignore
    }
  }
  // F (toggle Finale Mode)
  else if (event.keyCode === 70) {
    try {
      const nextFinale = !store.state.config.finale;
      // Finale mode is only meaningful with auto fire enabled.
      updateConfig({
        autoLaunch: nextFinale ? true : store.state.config.autoLaunch,
        finale: nextFinale,
      });
    } catch (e) {
      // ignore
    }
  }
  // Esc
  else if (event.keyCode === 27) {
    toggleMenu(false);
  }
}

// Presentation extras: Lì xì rain + HUD controls
const lixiRainEl = document.getElementById("lixi-rain");
const lixiBtn = document.querySelector(".lixi-btn");
const lixiToggle = document.querySelector(".lixi-rain-toggle");
const chucMungCloseBtn = document.querySelector("#chucMung .panel-close");

const prefersReducedMotion =
  window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let lixiEnabled = false;
let lixiAnimId = 0;
let lixiLastTs = 0;
let lixiSpawnAcc = 0;
const lixiItems = [];

function readLixiEnabled() {
  try {
    return localStorage.getItem("cm_lixi_rain") === "1";
  } catch (e) {
    return false;
  }
}

function persistLixiEnabled(enabled) {
  try {
    localStorage.setItem("cm_lixi_rain", enabled ? "1" : "0");
  } catch (e) {
    // ignore
  }
}

function setLixiRainEnabled(enabled) {
  if (!lixiRainEl) return;
  if (prefersReducedMotion) enabled = false;

  lixiEnabled = !!enabled;
  lixiRainEl.classList.toggle("hidden", !lixiEnabled);
  lixiRainEl.setAttribute("aria-hidden", lixiEnabled ? "false" : "true");
  if (lixiToggle) lixiToggle.checked = lixiEnabled;
  persistLixiEnabled(lixiEnabled);

  if (lixiEnabled) {
    startLixiRain();
  } else {
    stopLixiRain();
  }
}

function toggleLixiRain() {
  setLixiRainEnabled(!lixiEnabled);
}

function spawnLixiItem() {
  if (!lixiRainEl) return;
  const el = document.createElement("img");
  el.className = "lixi-item";
  el.alt = "";
  el.setAttribute("aria-hidden", "true");
  el.draggable = false;
  el.decoding = "async";
  el.src = "./assets/lixi.svg";
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = Math.random() * w;
  const y = -40 - Math.random() * 120;
  const size = 18 + Math.random() * 18;
  const speed = 110 + Math.random() * 220;
  const drift = (Math.random() - 0.5) * 40;
  const rot = (Math.random() - 0.5) * 0.8;
  el.style.width = size + "px";
  el.style.height = size + "px";
  el.style.opacity = String(0.75 + Math.random() * 0.25);
  lixiRainEl.appendChild(el);

  lixiItems.push({
    el,
    x,
    y,
    vx: drift,
    vy: speed,
    r: Math.random() * Math.PI * 2,
    vr: rot,
    h,
  });
}

function startLixiRain() {
  if (!lixiRainEl || lixiAnimId) return;
  lixiLastTs = performance.now();
  lixiSpawnAcc = 0;
  lixiAnimId = requestAnimationFrame(tickLixiRain);
}

function stopLixiRain() {
  if (lixiAnimId) {
    cancelAnimationFrame(lixiAnimId);
    lixiAnimId = 0;
  }
  if (!lixiRainEl) return;

  // Cleanup DOM nodes
  while (lixiItems.length) {
    const item = lixiItems.pop();
    if (item && item.el && item.el.parentNode) item.el.parentNode.removeChild(item.el);
  }
}

function tickLixiRain(ts) {
  if (!lixiEnabled || !lixiRainEl) {
    lixiAnimId = 0;
    return;
  }

  const dt = Math.min(0.05, (ts - lixiLastTs) / 1000);
  lixiLastTs = ts;

  // Spawn rate: ~10 items/second
  lixiSpawnAcc += dt;
  const spawnEvery = 0.10;
  while (lixiSpawnAcc >= spawnEvery) {
    lixiSpawnAcc -= spawnEvery;
    if (lixiItems.length < 90) spawnLixiItem();
  }

  const w = window.innerWidth;
  const h = window.innerHeight;

  for (let i = lixiItems.length - 1; i >= 0; i--) {
    const it = lixiItems[i];
    it.y += it.vy * dt;
    it.x += it.vx * dt;
    it.r += it.vr;

    // wrap slightly
    if (it.x < -60) it.x = w + 60;
    if (it.x > w + 60) it.x = -60;

    it.el.style.transform = `translate3d(${it.x}px, ${it.y}px, 0) rotate(${it.r}rad)`;

    if (it.y > h + 80) {
      if (it.el.parentNode) it.el.parentNode.removeChild(it.el);
      lixiItems.splice(i, 1);
    }
  }

  lixiAnimId = requestAnimationFrame(tickLixiRain);
}

function handleBtnLikeClick(el, handler) {
  if (!el) return;
  el.addEventListener("click", (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    handler();
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      handler();
    }
  });
}

handleBtnLikeClick(appNodes.pauseBtn, () => togglePause());
handleBtnLikeClick(appNodes.soundBtn, handleSoundToggle);
handleBtnLikeClick(document.querySelector(".settings-btn"), () => toggleMenu(true));
handleBtnLikeClick(document.querySelector(".close-menu-btn"), () => toggleMenu(false));

// Prevent UI interactions from also triggering stage pointer handlers.
if (appNodes.controls) {
  ["pointerdown", "pointerup", "pointermove"].forEach((type) => {
    appNodes.controls.addEventListener(type, (e) => e.stopPropagation(), true);
  });
}

handleBtnLikeClick(lixiBtn, toggleLixiRain);
if (lixiToggle) {
  lixiToggle.addEventListener("click", () => setLixiRainEnabled(lixiToggle.checked));
}
if (chucMungCloseBtn) {
  chucMungCloseBtn.addEventListener("click", () => {
    const chucMung = document.getElementById("chucMung");
    if (chucMung) chucMung.classList.add("hidden");
  });
}

// Presentation default: start with lixi rain OFF
setLixiRainEnabled(false);

mainStage.addEventListener("pointerstart", handlePointerStart);
mainStage.addEventListener("pointerend", handlePointerEnd);
mainStage.addEventListener("pointermove", handlePointerMove);
window.addEventListener("keydown", handleKeydown);

// Unlock audio on the first user interaction anywhere.
window.addEventListener(
  "pointerdown",
  () => {
    ensureAudioUnlocked();
  },
  { once: true, passive: true }
);

// Account for window resize and custom scale changes.
function handleResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // Try to adopt screen size, heeding maximum sizes specified
  const containerW = Math.min(w, MAX_WIDTH);
  // On small screens, use full device height
  const containerH = w <= 420 ? h : Math.min(h, MAX_HEIGHT);
  appNodes.stageContainer.style.width = containerW + "px";
  appNodes.stageContainer.style.height = containerH + "px";
  stages.forEach((stage) => stage.resize(containerW, containerH));
  // Account for scale
  const scaleFactor = scaleFactorSelector();
  stageW = containerW / scaleFactor;
  stageH = containerH / scaleFactor;
}

// Compute initial dimensions
handleResize();

window.addEventListener("resize", handleResize);

// Dynamic globals
let currentFrame = 0;
let speedBarOpacity = 0;
let autoLaunchTime = 0;

function updateSpeedFromEvent(event) {
  if (isUpdatingSpeed || event.y >= mainStage.height - 44) {
    // On phones it's hard to hit the edge pixels in order to set speed at 0 or 1, so some padding is provided to make that easier.
    const edge = 16;
    const newSpeed = (event.x - edge) / (mainStage.width - edge * 2);
    simSpeed = Math.min(Math.max(newSpeed, 0), 1);
    // show speed bar after an update
    speedBarOpacity = 1;
    // If we updated the speed, return true
    return true;
  }
  // Return false if the speed wasn't updated
  return false;
}

// Extracted function to keep `update()` optimized
function updateGlobals(timeStep, lag) {
  currentFrame++;

  // Always try to fade out speed bar
  if (!isUpdatingSpeed) {
    speedBarOpacity -= lag / 30; // half a second
    if (speedBarOpacity < 0) {
      speedBarOpacity = 0;
    }
  }

  // auto launch shells
  if (store.state.config.autoLaunch) {
    autoLaunchTime -= timeStep;
    if (autoLaunchTime <= 0) {
      autoLaunchTime = startSequence() * 1.25;
    }
  }
}

function update(frameTime, lag) {
  if (!isRunning()) return;

  const width = stageW;
  const height = stageH;
  const timeStep = frameTime * simSpeed;
  const speed = simSpeed * lag;

  updateGlobals(timeStep, lag);

  const starDrag = 1 - (1 - Star.airDrag) * speed;
  const starDragHeavy = 1 - (1 - Star.airDragHeavy) * speed;
  const sparkDrag = 1 - (1 - Spark.airDrag) * speed;
  const gAcc = (timeStep / 1000) * GRAVITY;
  COLOR_CODES_W_INVIS.forEach((color) => {
    // Stars
    const stars = Star.active[color];
    for (let i = stars.length - 1; i >= 0; i = i - 1) {
      const star = stars[i];
      // Only update each star once per frame. Since color can change, it's possible a star could update twice without this, leading to a "jump".
      if (star.updateFrame === currentFrame) {
        continue;
      }
      star.updateFrame = currentFrame;

      star.life -= timeStep;
      if (star.life <= 0) {
        stars.splice(i, 1);
        Star.returnInstance(star);
      } else {
        const burnRate = Math.pow(star.life / star.fullLife, 0.5);
        const burnRateInverse = 1 - burnRate;

        star.prevX = star.x;
        star.prevY = star.y;
        star.x += star.speedX * speed;
        star.y += star.speedY * speed;
        // Apply air drag if star isn't "heavy". The heavy property is used for the shell comets.
        if (!star.heavy) {
          star.speedX *= starDrag;
          star.speedY *= starDrag;
        } else {
          star.speedX *= starDragHeavy;
          star.speedY *= starDragHeavy;
        }
        star.speedY += gAcc;

        if (star.spinRadius) {
          star.spinAngle += star.spinSpeed * speed;
          star.x += Math.sin(star.spinAngle) * star.spinRadius * speed;
          star.y += Math.cos(star.spinAngle) * star.spinRadius * speed;
        }

        if (star.sparkFreq) {
          star.sparkTimer -= timeStep;
          while (star.sparkTimer < 0) {
            star.sparkTimer +=
              star.sparkFreq * 0.75 + star.sparkFreq * burnRateInverse * 4;
            Spark.add(
              star.x,
              star.y,
              star.sparkColor,
              Math.random() * PI_2,
              Math.random() * star.sparkSpeed * burnRate,
              star.sparkLife * 0.8 +
                Math.random() * star.sparkLifeVariation * star.sparkLife
            );
          }
        }

        // Handle star transitions
        if (star.life < star.transitionTime) {
          if (star.secondColor && !star.colorChanged) {
            star.colorChanged = true;
            star.color = star.secondColor;
            stars.splice(i, 1);
            Star.active[star.secondColor].push(star);
            if (star.secondColor === INVISIBLE) {
              star.sparkFreq = 0;
            }
          }

          if (star.strobe) {
            // Strobes in the following pattern: on:off:off:on:off:off in increments of `strobeFreq` ms.
            star.visible = Math.floor(star.life / star.strobeFreq) % 3 === 0;
          }
        }
      }
    }

    // Sparks
    const sparks = Spark.active[color];
    for (let i = sparks.length - 1; i >= 0; i = i - 1) {
      const spark = sparks[i];
      spark.life -= timeStep;
      if (spark.life <= 0) {
        sparks.splice(i, 1);
        Spark.returnInstance(spark);
      } else {
        spark.prevX = spark.x;
        spark.prevY = spark.y;
        spark.x += spark.speedX * speed;
        spark.y += spark.speedY * speed;
        spark.speedX *= sparkDrag;
        spark.speedY *= sparkDrag;
        spark.speedY += gAcc;
      }
    }
  });

  render(speed);
}

function render(speed) {
  const { dpr } = mainStage;
  const width = stageW;
  const height = stageH;
  const trailsCtx = trailsStage.ctx;
  const mainCtx = mainStage.ctx;

  if (skyLightingSelector() !== SKY_LIGHT_NONE) {
    colorSky(speed);
  }

  // Account for high DPI screens, and custom scale factor.
  const scaleFactor = scaleFactorSelector();
  trailsCtx.scale(dpr * scaleFactor, dpr * scaleFactor);
  mainCtx.scale(dpr * scaleFactor, dpr * scaleFactor);

  trailsCtx.globalCompositeOperation = "source-over";
  trailsCtx.fillStyle = `rgba(0, 0, 0, ${
    store.state.config.longExposure ? 0.0025 : 0.175 * speed
  })`;
  trailsCtx.fillRect(0, 0, width, height);

  mainCtx.clearRect(0, 0, width, height);

  // Draw queued burst flashes
  // These must also be drawn using source-over due to Safari. Seems rendering the gradients using lighten draws large black boxes instead.
  // Thankfully, these burst flashes look pretty much the same either way.
  while (BurstFlash.active.length) {
    const bf = BurstFlash.active.pop();

    const burstGradient = trailsCtx.createRadialGradient(
      bf.x,
      bf.y,
      0,
      bf.x,
      bf.y,
      bf.radius
    );
    burstGradient.addColorStop(0.024, "rgba(255, 255, 255, 1)");
    burstGradient.addColorStop(0.125, "rgba(255, 160, 20, 0.2)");
    burstGradient.addColorStop(0.32, "rgba(255, 140, 20, 0.11)");
    burstGradient.addColorStop(1, "rgba(255, 120, 20, 0)");
    trailsCtx.fillStyle = burstGradient;
    trailsCtx.fillRect(
      bf.x - bf.radius,
      bf.y - bf.radius,
      bf.radius * 2,
      bf.radius * 2
    );

    BurstFlash.returnInstance(bf);
  }

  // Remaining drawing on trails canvas will use 'lighten' blend mode
  trailsCtx.globalCompositeOperation = "lighten";

  // Draw stars
  trailsCtx.lineWidth = Star.drawWidth;
  trailsCtx.lineCap = isLowQuality ? "square" : "round";
  mainCtx.strokeStyle = "#fff";
  mainCtx.lineWidth = 1;
  mainCtx.beginPath();
  COLOR_CODES.forEach((color) => {
    const stars = Star.active[color];
    trailsCtx.strokeStyle = color;
    trailsCtx.beginPath();
    stars.forEach((star) => {
      if (star.visible) {
        trailsCtx.moveTo(star.x, star.y);
        trailsCtx.lineTo(star.prevX, star.prevY);
        mainCtx.moveTo(star.x, star.y);
        mainCtx.lineTo(star.x - star.speedX * 1.6, star.y - star.speedY * 1.6);
      }
    });
    trailsCtx.stroke();
  });
  mainCtx.stroke();

  // Draw sparks
  trailsCtx.lineWidth = Spark.drawWidth;
  trailsCtx.lineCap = "butt";
  COLOR_CODES.forEach((color) => {
    const sparks = Spark.active[color];
    trailsCtx.strokeStyle = color;
    trailsCtx.beginPath();
    sparks.forEach((spark) => {
      trailsCtx.moveTo(spark.x, spark.y);
      trailsCtx.lineTo(spark.prevX, spark.prevY);
    });
    trailsCtx.stroke();
  });

  // Render speed bar if visible
  if (speedBarOpacity) {
    const speedBarHeight = 6;
    mainCtx.globalAlpha = speedBarOpacity;
    mainCtx.fillStyle = COLOR.Blue;
    mainCtx.fillRect(
      0,
      height - speedBarHeight,
      width * simSpeed,
      speedBarHeight
    );
    mainCtx.globalAlpha = 1;
  }

  trailsCtx.setTransform(1, 0, 0, 1, 0, 0);
  mainCtx.setTransform(1, 0, 0, 1, 0, 0);
}

// Draw colored overlay based on combined brightness of stars (light up the sky!)
// Note: this is applied to the canvas container's background-color, so it's behind the particles
const currentSkyColor = { r: 0, g: 0, b: 0 };
const targetSkyColor = { r: 0, g: 0, b: 0 };
function colorSky(speed) {
  // The maximum r, g, or b value that will be used (255 would represent no maximum)
  const maxSkySaturation = skyLightingSelector() * 15;
  // How many stars are required in total to reach maximum sky brightness
  const maxStarCount = 500;
  let totalStarCount = 0;
  // Initialize sky as black
  targetSkyColor.r = 0;
  targetSkyColor.g = 0;
  targetSkyColor.b = 0;
  // Add each known color to sky, multiplied by particle count of that color. This will put RGB values wildly out of bounds, but we'll scale them back later.
  // Also add up total star count.
  COLOR_CODES.forEach((color) => {
    const tuple = COLOR_TUPLES[color];
    const count = Star.active[color].length;
    totalStarCount += count;
    targetSkyColor.r += tuple.r * count;
    targetSkyColor.g += tuple.g * count;
    targetSkyColor.b += tuple.b * count;
  });

  // Clamp intensity at 1.0, and map to a custom non-linear curve. This allows few stars to perceivably light up the sky, while more stars continue to increase the brightness but at a lesser rate. This is more inline with humans' non-linear brightness perception.
  const intensity = Math.pow(Math.min(1, totalStarCount / maxStarCount), 0.3);
  // Figure out which color component has the highest value, so we can scale them without affecting the ratios.
  // Prevent 0 from being used, so we don't divide by zero in the next step.
  const maxColorComponent = Math.max(
    1,
    targetSkyColor.r,
    targetSkyColor.g,
    targetSkyColor.b
  );
  // Scale all color components to a max of `maxSkySaturation`, and apply intensity.
  targetSkyColor.r =
    (targetSkyColor.r / maxColorComponent) * maxSkySaturation * intensity;
  targetSkyColor.g =
    (targetSkyColor.g / maxColorComponent) * maxSkySaturation * intensity;
  targetSkyColor.b =
    (targetSkyColor.b / maxColorComponent) * maxSkySaturation * intensity;

  // Animate changes to color to smooth out transitions.
  const colorChange = 10;
  currentSkyColor.r +=
    ((targetSkyColor.r - currentSkyColor.r) / colorChange) * speed;
  currentSkyColor.g +=
    ((targetSkyColor.g - currentSkyColor.g) / colorChange) * speed;
  currentSkyColor.b +=
    ((targetSkyColor.b - currentSkyColor.b) / colorChange) * speed;

  appNodes.canvasContainer.style.backgroundColor = `rgb(${
    currentSkyColor.r | 0
  }, ${currentSkyColor.g | 0}, ${currentSkyColor.b | 0})`;
}

mainStage.addEventListener("ticker", update);

// Helper used to semi-randomly spread particles over an arc
// Values are flexible - `start` and `arcLength` can be negative, and `randomness` is simply a multiplier for random addition.
function createParticleArc(
  start,
  arcLength,
  count,
  randomness,
  particleFactory
) {
  const angleDelta = arcLength / count;
  // Sometimes there is an extra particle at the end, too close to the start. Subtracting half the angleDelta ensures that is skipped.
  // Would be nice to fix this a better way.
  const end = start + arcLength - angleDelta * 0.5;

  if (end > start) {
    // Optimization: `angle=angle+angleDelta` vs. angle+=angleDelta
    // V8 deoptimises with let compound assignment
    for (let angle = start; angle < end; angle = angle + angleDelta) {
      particleFactory(angle + Math.random() * angleDelta * randomness);
    }
  } else {
    for (let angle = start; angle > end; angle = angle + angleDelta) {
      particleFactory(angle + Math.random() * angleDelta * randomness);
    }
  }
}

// Helper used to create a spherical burst of particles
function createBurst(count, particleFactory, startAngle = 0, arcLength = PI_2) {
  // Assuming sphere with surface area of `count`, calculate various
  // properties of said sphere (unit is stars).
  // Radius
  const R = 0.5 * Math.sqrt(count / Math.PI);
  // Circumference
  const C = 2 * R * Math.PI;
  // Half Circumference
  const C_HALF = C / 2;

  // Make a series of rings, sizing them as if they were spaced evenly
  // along the curved surface of a sphere.
  for (let i = 0; i <= C_HALF; i++) {
    const ringAngle = (i / C_HALF) * PI_HALF;
    const ringSize = Math.cos(ringAngle);
    const partsPerFullRing = C * ringSize;
    const partsPerArc = partsPerFullRing * (arcLength / PI_2);

    const angleInc = PI_2 / partsPerFullRing;
    const angleOffset = Math.random() * angleInc + startAngle;
    // Each particle needs a bit of randomness to improve appearance.
    const maxRandomAngleOffset = angleInc * 0.33;

    for (let i = 0; i < partsPerArc; i++) {
      const randomAngleOffset = Math.random() * maxRandomAngleOffset;
      let angle = angleInc * i + angleOffset + randomAngleOffset;
      particleFactory(angle, ringSize);
    }
  }
}

// Various star effects.
// These are designed to be attached to a star's `onDeath` event.

// Crossette breaks star into four same-color pieces which branch in a cross-like shape.
function crossetteEffect(star) {
  const startAngle = Math.random() * PI_HALF;
  createParticleArc(startAngle, PI_2, 4, 0.5, (angle) => {
    Star.add(
      star.x,
      star.y,
      star.color,
      angle,
      Math.random() * 0.6 + 0.75,
      600
    );
  });
}

// Flower is like a mini shell
function floralEffect(star) {
  const count = 12 + 6 * quality;
  createBurst(count, (angle, speedMult) => {
    Star.add(
      star.x,
      star.y,
      star.color,
      angle,
      speedMult * 2.4,
      1000 + Math.random() * 300,
      star.speedX,
      star.speedY
    );
  });
  // Queue burst flash render
  BurstFlash.add(star.x, star.y, 46);
  soundManager.playSound("burstSmall");
}

// Floral burst with willow stars
function fallingLeavesEffect(star) {
  createBurst(7, (angle, speedMult) => {
    const newStar = Star.add(
      star.x,
      star.y,
      INVISIBLE,
      angle,
      speedMult * 2.4,
      2400 + Math.random() * 600,
      star.speedX,
      star.speedY
    );

    newStar.sparkColor = COLOR.Gold;
    newStar.sparkFreq = 144 / quality;
    newStar.sparkSpeed = 0.28;
    newStar.sparkLife = 750;
    newStar.sparkLifeVariation = 3.2;
  });
  // Queue burst flash render
  BurstFlash.add(star.x, star.y, 46);
  soundManager.playSound("burstSmall");
}

// Crackle pops into a small cloud of golden sparks.
function crackleEffect(star) {
  const count = isHighQuality ? 32 : 16;
  createParticleArc(0, PI_2, count, 1.8, (angle) => {
    Spark.add(
      star.x,
      star.y,
      COLOR.Gold,
      angle,
      // apply near cubic falloff to speed (places more particles towards outside)
      Math.pow(Math.random(), 0.45) * 2.4,
      300 + Math.random() * 200
    );
  });
}

// Cached point cloud for a stylized Vietnam flag (waving rectangle + gold star).
let _vietnamFlagPoints = null;
function getVietnamFlagPointCloud() {
  if (_vietnamFlagPoints) return _vietnamFlagPoints;

  const pts = [];
  const add = (x, y, c, k) => pts.push({ x, y, c, k });

  const pointInPoly = (px, py, poly) => {
    // Ray-casting algorithm.
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;
      const intersect =
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Flag bounds in normalized space.
  const w = 1.8;
  const h = 1.15;
  const x0 = -w / 2;
  const x1 = w / 2;
  const y0 = -h / 2;
  const y1 = h / 2;

  // Softer flag silhouette
  const waveAmp = 0.075;
  const waveFreq = 0.95;
  const topWave = (x) => -waveAmp * Math.sin((x + 0.2) * Math.PI * waveFreq);
  const botWave = (x) => waveAmp * Math.sin((x - 0.15) * Math.PI * waveFreq);

  // Border path (used for polygon only; we don't render a border)
  const borderStep = 0.022;
  const topY = (x) => y0 + topWave(x);
  const botY = (x) => y1 + botWave(x);
  const yTL = topY(x0);
  const yTR = topY(x1);
  const yBL = botY(x0);
  const yBR = botY(x1);

  const flagPoly = [];

  const sideAmp = 0.045;
  const sideFreq = 0.8;
  const sideWobble = (t, phase) =>
    sideAmp * Math.sin(Math.PI * t) * Math.sin((t * sideFreq + phase) * PI_2);
  const leftX = (t) => x0 + sideWobble(t, 0.15);
  const rightX = (t) => x1 + sideWobble(t, -0.05);

  // Top
  for (let x = x0; x <= x1; x += borderStep) {
    const y = topY(x);
    flagPoly.push({ x, y });
  }
  // Right
  for (let y = yTR; y <= yBR; y += borderStep) {
    const t = (y - yTR) / (yBR - yTR + 1e-9);
    const x = rightX(t);
    flagPoly.push({ x, y });
  }
  // Bottom
  for (let x = x1; x >= x0; x -= borderStep) {
    const y = botY(x);
    flagPoly.push({ x, y });
  }
  // Left
  for (let y = yBL; y >= yTL; y -= borderStep) {
    const t = (y - yTL) / (yBL - yTL + 1e-9);
    const x = leftX(t);
    flagPoly.push({ x, y });
  }

  // Outline-only: render the silhouette itself (no interior fill).
  for (let i = 0; i < flagPoly.length; i += 1) {
    const p = flagPoly[i];
    add(p.x, p.y, COLOR.Red, "edge");
  }

  // Center star (gold). Build polygon early so we can keep the flag fill from bleeding into it.
  const starR = 0.30;
  const starr = 0.13;
  const starVerts = [];
  for (let i = 0; i < 10; i += 1) {
    const rr = i % 2 === 0 ? starR : starr;
    const ang = -Math.PI / 2 + (i / 10) * PI_2;
    starVerts.push({ x: Math.cos(ang) * rr, y: Math.sin(ang) * rr });
  }
  // Outline-only: no star fill, only star edge points.

  // Softer star outline: more edge points, but no heavy fill increase.
  const edgeSamples = 10;
  for (let i = 0; i < starVerts.length; i += 1) {
    const a = starVerts[i];
    const b = starVerts[(i + 1) % starVerts.length];
    for (let t = 0; t <= edgeSamples; t += 1) {
      const u = t / edgeSamples;
      add(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, COLOR.Gold, "starEdge");
    }
  }

  _vietnamFlagPoints = pts;
  return pts;
}

// Mai blossom: 5-petal small flower burst.
// Designed to be light enough for autoLaunch without freezing.
function maiBlossomEffect(star) {
  const petals = 5;
  const petalStars = isLowQuality ? 1 : isHighQuality ? 2 : 1;
  const baseSpeed = 0.95;
  const life = 560 + Math.random() * 180;
  const petalAngleOffset = Math.random() * (Math.PI / petals);
  const baseColor =
    star._maiColor ||
    (Math.random() < 0.55 ? COLOR.Gold : randomWarmColor({ limitWhite: true }));
  const accentColor =
    star._maiAccent ||
    (Math.random() < 0.7
      ? COLOR.White
      : randomWarmColor({ limitWhite: true, notColor: baseColor }));

  for (let i = 0; i < petals; i += 1) {
    const a = (i / petals) * PI_2 + petalAngleOffset;
    for (let j = 0; j < petalStars; j += 1) {
      const aj = a + (Math.random() - 0.5) * 0.14;
      const s = baseSpeed + Math.random() * 0.55;
      const c = !isLowQuality && Math.random() < 0.22 ? accentColor : baseColor;
      const p = Star.add(star.x, star.y, c, aj, s, life);
      // Keep sparks minimal to prevent frame drops when many blossoms spawn.
      if (isHighQuality) {
        p.sparkFreq = 520;
        p.sparkSpeed = 0.2;
        p.sparkLife = 420;
        p.sparkLifeVariation = 1.8;
        p.sparkColor = COLOR.Gold;
      }
    }
  }
}

/**
 * Shell can be constructed with options:
 *
 * spreadSize:      Size of the burst.
 * starCount: Number of stars to create. This is optional, and will be set to a reasonable quantity for size if omitted.
 * starLife:
 * starLifeVariation:
 * color:
 * glitterColor:
 * glitter: One of: 'light', 'medium', 'heavy', 'streamer', 'willow'
 * pistil:
 * pistilColor:
 * streamers:
 * crossette:
 * floral:
 * crackle:
 */
class Shell {
  constructor(options) {
    Object.assign(this, options);
    this.starLifeVariation = options.starLifeVariation || 0.125;
    this.color = options.color || randomColor();
    this.glitterColor = options.glitterColor || this.color;

    // Set default starCount if needed, will be based on shell size and scale exponentially, like a sphere's surface area.
    if (!this.starCount) {
      const density = options.starDensity || 1;
      const scaledSize = this.spreadSize / 54;
      this.starCount = Math.max(6, scaledSize * scaledSize * density);
    }
  }

  launch(position, launchHeight) {
    const width = stageW;
    const height = stageH;
    // Distance from sides of screen to keep shells.
    const hpad = 60;
    // Distance from top of screen to keep shell bursts.
    const vpad = 50;
    // Minimum burst height, as a percentage of stage height
    const minHeightPercent = 0.45;
    // Minimum burst height in px
    const minHeight = height - height * minHeightPercent;

    const launchX = position * (width - hpad * 2) + hpad;
    const launchY = height;
    const burstY = minHeight - launchHeight * (minHeight - vpad);

    const launchDistance = launchY - burstY;
    // Using a custom power curve to approximate Vi needed to reach launchDistance under gravity and air drag.
    // Magic numbers came from testing.
    const launchVelocity = Math.pow(launchDistance * 0.04, 0.64);

    const comet = (this.comet = Star.add(
      launchX,
      launchY,
      typeof this.color === "string" && this.color !== "random"
        ? this.color
        : COLOR.White,
      Math.PI,
      launchVelocity * (this.horsetail ? 1.2 : 1),
      // Hang time is derived linearly from Vi; exact number came from testing
      launchVelocity * (this.horsetail ? 100 : 400)
    ));

    // making comet "heavy" limits air drag
    comet.heavy = true;
    // comet spark trail
    comet.spinRadius = MyMath.random(0.32, 0.85);
    comet.sparkFreq = 32 / quality;
    if (isHighQuality) comet.sparkFreq = 8;
    comet.sparkLife = 320;
    comet.sparkLifeVariation = 3;
    if (this.glitter === "willow" || this.fallingLeaves) {
      comet.sparkFreq = 20 / quality;
      comet.sparkSpeed = 0.5;
      comet.sparkLife = 500;
    }
    if (this.color === INVISIBLE) {
      comet.sparkColor = COLOR.Gold;
    }

    if (this.vietnamFlag) {
      comet.sparkColor = COLOR.Gold;
      comet.sparkSpeed = 0.55;
      comet.sparkLife = 520;
      comet.sparkLifeVariation = 2.2;
      comet.sparkFreq = isHighQuality ? 6 : 14 / quality;
    }

    // Randomly make comet "burn out" a bit early.
    // This is disabled for horsetail shells, due to their very short airtime.
    if (Math.random() > 0.4 && !this.horsetail) {
      comet.secondColor = INVISIBLE;
      comet.transitionTime = Math.pow(Math.random(), 1.5) * 700 + 500;
    }

    comet.onDeath = (comet) => this.burst(comet.x, comet.y);

    soundManager.playSound("lift");
  }

  burst(x, y) {
    // Set burst speed so overall burst grows to set size. This specific formula was derived from testing, and is affected by simulated air drag.
    const speed = this.spreadSize / 96;

    let color, onDeath, sparkFreq, sparkSpeed, sparkLife;
    let sparkLifeVariation = 0.25;
    // Some death effects, like crackle, play a sound, but should only be played once.
    let playedDeathSound = false;

    if (this.crossette)
      onDeath = (star) => {
        if (!playedDeathSound) {
          soundManager.playSound("crackleSmall");
          playedDeathSound = true;
        }
        crossetteEffect(star);
      };
    if (this.crackle)
      onDeath = (star) => {
        if (!playedDeathSound) {
          soundManager.playSound("crackle");
          playedDeathSound = true;
        }
        crackleEffect(star);
      };
    if (this.floral) onDeath = floralEffect;
    if (this.fallingLeaves) onDeath = fallingLeavesEffect;
    if (this.maiBlossom) {
      // Each seed star can spawn a small blossom; keep this bounded for performance.
      const spawnChance = isLowQuality ? 0.6 : isHighQuality ? 0.85 : 0.72;
      onDeath = (star) => {
        if (Math.random() < spawnChance) maiBlossomEffect(star);
      };
    }

    if (this.glitter === "light") {
      sparkFreq = 400;
      sparkSpeed = 0.3;
      sparkLife = 300;
      sparkLifeVariation = 2;
    } else if (this.glitter === "medium") {
      sparkFreq = 200;
      sparkSpeed = 0.44;
      sparkLife = 700;
      sparkLifeVariation = 2;
    } else if (this.glitter === "peach") {
      // Long glow but fewer sparks to avoid accumulating workload.
      sparkFreq = 900;
      sparkSpeed = 0.26;
      sparkLife = 520;
      sparkLifeVariation = 1.8;
    } else if (this.glitter === "heavy") {
      sparkFreq = 80;
      sparkSpeed = 0.8;
      sparkLife = 1400;
      sparkLifeVariation = 2;
    } else if (this.glitter === "thick") {
      sparkFreq = 16;
      sparkSpeed = isHighQuality ? 1.65 : 1.5;
      sparkLife = 1400;
      sparkLifeVariation = 3;
    } else if (this.glitter === "streamer") {
      sparkFreq = 32;
      sparkSpeed = 1.05;
      sparkLife = 620;
      sparkLifeVariation = 2;
    } else if (this.glitter === "willow") {
      sparkFreq = 120;
      sparkSpeed = 0.34;
      sparkLife = 1400;
      sparkLifeVariation = 3.8;
    }

    // Apply quality to spark count
    sparkFreq = sparkFreq / quality;

    // Custom: Vietnam Flag (stylized). Place stars directly onto the flag shape.
    if (this.vietnamFlag) {
      const points = getVietnamFlagPointCloud();
      const maxPoints = isLowQuality ? 1200 : isHighQuality ? 2800 : 1800;
      const redEdgePoints = [];
      const goldEdgePoints = [];
      for (let i = 0; i < points.length; i += 1) {
        const p = points[i];
        if (p.c === COLOR.Gold) {
          if (p.k === "starEdge") goldEdgePoints.push(p);
        } else {
          if (p.k === "edge") redEdgePoints.push(p);
        }
      }

      // Smaller flag (keep form tighter).
      const radius = this.spreadSize * 0.32;
      // Keep form: give the entire shape a tiny shared drift (no outward expansion).
      const sharedSpeedX = 0;
      const sharedSpeedY = -speed * 0.085;

      // Outline-only budgets
      const goldBudget = Math.max(60, Math.floor(maxPoints * (isLowQuality ? 0.22 : 0.26)));
      const redBudget = Math.max(220, maxPoints - goldBudget);
      const redEdgeBudget = Math.min(redEdgePoints.length, redBudget);
      const goldEdgeBudget = Math.min(goldEdgePoints.length, goldBudget);

      const hash01 = (a, b, seed) => {
        const v = Math.sin(a * 12.9898 + b * 78.233 + seed * 37.719) * 43758.5453;
        return v - Math.floor(v);
      };

      const spawnFromList = (list, budget, isGold) => {
        const stride = Math.max(1, Math.ceil(list.length / budget));
        for (let i = 0; i < list.length; i += stride) {
          const p = list[i];
          // Keep dots aligned (uniform look). Randomness comes from optional glints, not position jitter.
          let px = x + p.x * radius;
          let py = y + p.y * radius;
          // Micro-jitter only on edge/outline points to soften the silhouette.
          if (p.k === "edge" || p.k === "starEdge") {
            const jx = (hash01(p.x, p.y, 5) - 0.5) * 0.85;
            const jy = (hash01(p.x, p.y, 6) - 0.5) * 0.85;
            px += jx;
            py += jy;
          }
          const ang = MyMath.pointAngle(x, y, px, py);

          // Very gentle flutter: stronger toward the free end (right side).
          const t = (p.x + 0.9) / 1.8;
          const flutter = Math.max(0, Math.min(1, t));
          const baseFlutter = isLowQuality ? 0.08 : 0.12;
          const flutterAmp = baseFlutter + flutter * (isLowQuality ? 0.14 : 0.22);
          const flutterSpeed = (isLowQuality ? 0.1 : 0.13) + flutter * 0.16;

          const star = Star.add(
            px,
            py,
            p.c,
            ang,
            0,
            this.starLife +
              Math.random() * this.starLife * this.starLifeVariation,
            sharedSpeedX,
            sharedSpeedY
          );

          // Keep the gold star steadier than the red field.
          const isGoldStar = p.c === COLOR.Gold;
          const amp = isGoldStar ? flutterAmp * 0.14 : flutterAmp;
          const spd = isGoldStar ? flutterSpeed * 0.22 : flutterSpeed;
          // Prevent edge dots from drifting outside the flag silhouette.
          const isEdgePoint = p.k === "edge";
          const isStarEdgePoint = p.k === "starEdge";
          star.spinRadius = isEdgePoint ? amp * 0.42 : isStarEdgePoint ? amp * 0.65 : amp;
          star.spinSpeed = isEdgePoint ? spd * 0.55 : isStarEdgePoint ? spd * 0.75 : spd;
          star.spinAngle = flutter * PI_2 + Math.random() * 0.6;

          // Outline-only: no extra sparkle layer.
        }
      };

      // Render edge highlights first so they read as a soft outline.
      spawnFromList(redEdgePoints, redEdgeBudget || redEdgePoints.length, false);
      spawnFromList(goldEdgePoints, goldEdgeBudget || goldEdgePoints.length, true);

      BurstFlash.add(x, y, this.spreadSize / 4);
      if (this.comet) {
        soundManager.playSound("burst", 0.9);
      }
      return;
    }

    // Star factory for primary burst, pistils, and streamers.
    let firstStar = true;
    const starFactory = (angle, speedMult) => {
      // For non-horsetail shells, compute an initial vertical speed to add to star burst.
      // The magic number comes from testing what looks best. The ideal is that all shell
      // bursts appear visually centered for the majority of the star life (excl. willows etc.)
      const standardInitialSpeed = this.spreadSize / 1800;

      const star = Star.add(
        x,
        y,
        color || randomColor(),
        angle,
        speedMult * speed,
        // add minor variation to star life
        this.starLife + Math.random() * this.starLife * this.starLifeVariation,
        this.horsetail ? this.comet && this.comet.speedX : 0,
        this.horsetail ? this.comet && this.comet.speedY : -standardInitialSpeed
      );

      if (this.maiBlossom) {
        // Choose colors once per seed star, so each small blossom has a coherent look.
        const base = Math.random() < 0.6 ? COLOR.Gold : randomWarmColor({ limitWhite: true });
        star._maiColor = base;
        star._maiAccent =
          Math.random() < 0.7
            ? COLOR.White
            : randomWarmColor({ limitWhite: true, notColor: base });
      }

      if (this.secondColor) {
        star.transitionTime = this.starLife * (Math.random() * 0.05 + 0.32);
        star.secondColor = this.secondColor;
      }

      if (this.strobe) {
        star.transitionTime = this.starLife * (Math.random() * 0.08 + 0.46);
        star.strobe = true;
        // How many milliseconds between switch of strobe state "tick". Note that the strobe pattern
        // is on:off:off, so this is the "on" duration, while the "off" duration is twice as long.
        star.strobeFreq = Math.random() * 20 + 40;
        if (this.strobeColor) {
          star.secondColor = this.strobeColor;
        }
      }

      star.onDeath = onDeath;

      if (this.glitter) {
        star.sparkFreq = sparkFreq;
        star.sparkSpeed = sparkSpeed;
        star.sparkLife = sparkLife;
        star.sparkLifeVariation = sparkLifeVariation;
        star.sparkColor = this.glitterColor;
        star.sparkTimer = Math.random() * star.sparkFreq;
      }
    };

    if (typeof this.color === "string") {
      if (this.color === "random") {
        color = null; // falsey value creates random color in starFactory
      } else {
        color = this.color;
      }

      // Rings have positional randomness, but are rotated randomly
      if (this.ring) {
        const ringStartAngle = Math.random() * Math.PI;
        const ringSquash = Math.pow(Math.random(), 2) * 0.85 + 0.15;

        createParticleArc(0, PI_2, this.starCount, 0, (angle) => {
          // Create a ring, squashed horizontally
          const initSpeedX = Math.sin(angle) * speed * ringSquash;
          const initSpeedY = Math.cos(angle) * speed;
          // Rotate ring
          const newSpeed = MyMath.pointDist(0, 0, initSpeedX, initSpeedY);
          const newAngle =
            MyMath.pointAngle(0, 0, initSpeedX, initSpeedY) + ringStartAngle;
          const star = Star.add(
            x,
            y,
            color,
            newAngle,
            // apply near cubic falloff to speed (places more particles towards outside)
            newSpeed, //speed,
            // add minor variation to star life
            this.starLife +
              Math.random() * this.starLife * this.starLifeVariation
          );

          if (this.glitter) {
            star.sparkFreq = sparkFreq;
            star.sparkSpeed = sparkSpeed;
            star.sparkLife = sparkLife;
            star.sparkLifeVariation = sparkLifeVariation;
            star.sparkColor = this.glitterColor;
            star.sparkTimer = Math.random() * star.sparkFreq;
          }
        });
      }
      // Normal burst
      else {
        createBurst(this.starCount, starFactory);
      }
    } else if (Array.isArray(this.color)) {
      if (Math.random() < 0.5) {
        const start = Math.random() * Math.PI;
        const start2 = start + Math.PI;
        const arc = Math.PI;
        color = this.color[0];
        // Not creating a full arc automatically reduces star count.
        createBurst(this.starCount, starFactory, start, arc);
        color = this.color[1];
        createBurst(this.starCount, starFactory, start2, arc);
      } else {
        color = this.color[0];
        createBurst(this.starCount / 2, starFactory);
        color = this.color[1];
        createBurst(this.starCount / 2, starFactory);
      }
    } else {
      throw new Error(
        "Invalid shell color. Expected string or array of strings, but got: " +
          this.color
      );
    }

    if (this.pistil) {
      const innerShell = new Shell({
        spreadSize: this.spreadSize * 0.5,
        starLife: this.starLife * 0.6,
        starLifeVariation: this.starLifeVariation,
        starDensity: 1.4,
        color: this.pistilColor,
        glitter: "light",
        glitterColor:
          this.pistilColor === COLOR.Gold ? COLOR.Gold : COLOR.White,
      });
      innerShell.burst(x, y);
    }

    if (this.streamers) {
      const innerShell = new Shell({
        spreadSize: this.spreadSize * 0.9,
        starLife: this.starLife * 0.8,
        starLifeVariation: this.starLifeVariation,
        starCount: Math.floor(Math.max(6, this.spreadSize / 45)),
        color: COLOR.White,
        glitter: "streamer",
      });
      innerShell.burst(x, y);
    }

    // Queue burst flash render
    BurstFlash.add(x, y, this.spreadSize / 4);

    // Play sound, but only for "original" shell, the one that was launched.
    // We don't want multiple sounds from pistil or streamer "sub-shells".
    // This can be detected by the presence of a comet.
    if (this.comet) {
      // Scale explosion sound based on current shell size and selected (max) shell size.
      // Shooting selected shell size will always sound the same no matter the selected size,
      // but when smaller shells are auto-fired, they will sound smaller. It doesn't sound great
      // when a value too small is given though, so instead of basing it on proportions, we just
      // look at the difference in size and map it to a range known to sound good.
      const maxDiff = 2;
      const sizeDifferenceFromMaxSize = Math.min(
        maxDiff,
        shellSizeSelector() - this.shellSize
      );
      const soundScale = (1 - sizeDifferenceFromMaxSize / maxDiff) * 0.3 + 0.7;
      soundManager.playSound("burst", soundScale);
    }
  }
}

const BurstFlash = {
  active: [],
  _pool: [],

  _new() {
    return {};
  },

  add(x, y, radius) {
    const instance = this._pool.pop() || this._new();

    instance.x = x;
    instance.y = y;
    instance.radius = radius;

    this.active.push(instance);
    return instance;
  },

  returnInstance(instance) {
    this._pool.push(instance);
  },
};

// Helper to generate objects for storing active particles.
// Particles are stored in arrays keyed by color (code, not name) for improved rendering performance.
function createParticleCollection() {
  const collection = {};
  COLOR_CODES_W_INVIS.forEach((color) => {
    collection[color] = [];
  });
  return collection;
}

// Star properties (WIP)
// -----------------------
// transitionTime - how close to end of life that star transition happens

const Star = {
  // Visual properties
  drawWidth: 3,
  airDrag: 0.98,
  airDragHeavy: 0.992,

  // Star particles will be keyed by color
  active: createParticleCollection(),
  _pool: [],

  _new() {
    return {};
  },

  add(x, y, color, angle, speed, life, speedOffX, speedOffY) {
    const instance = this._pool.pop() || this._new();

    instance.visible = true;
    instance.heavy = false;
    instance.x = x;
    instance.y = y;
    instance.prevX = x;
    instance.prevY = y;
    instance.color = color;
    instance.speedX = Math.sin(angle) * speed + (speedOffX || 0);
    instance.speedY = Math.cos(angle) * speed + (speedOffY || 0);
    instance.life = life;
    instance.fullLife = life;
    instance.spinAngle = Math.random() * PI_2;
    instance.spinSpeed = 0.8;
    instance.spinRadius = 0;
    instance.sparkFreq = 0; // ms between spark emissions
    instance.sparkSpeed = 1;
    instance.sparkTimer = 0;
    instance.sparkColor = color;
    instance.sparkLife = 750;
    instance.sparkLifeVariation = 0.25;
    instance.strobe = false;

    this.active[color].push(instance);
    return instance;
  },

  // Public method for cleaning up and returning an instance back to the pool.
  returnInstance(instance) {
    // Call onDeath handler if available (and pass it current star instance)
    instance.onDeath && instance.onDeath(instance);
    // Clean up
    instance.onDeath = null;
    instance.secondColor = null;
    instance.transitionTime = 0;
    instance.colorChanged = false;
    // Add back to the pool.
    this._pool.push(instance);
  },
};

const Spark = {
  // Visual properties
  drawWidth: 0, // set in `configDidUpdate()`
  airDrag: 0.9,

  // Star particles will be keyed by color
  active: createParticleCollection(),
  _pool: [],

  _new() {
    return {};
  },

  add(x, y, color, angle, speed, life) {
    const instance = this._pool.pop() || this._new();

    instance.x = x;
    instance.y = y;
    instance.prevX = x;
    instance.prevY = y;
    instance.color = color;
    instance.speedX = Math.sin(angle) * speed;
    instance.speedY = Math.cos(angle) * speed;
    instance.life = life;

    this.active[color].push(instance);
    return instance;
  },

  // Public method for cleaning up and returning an instance back to the pool.
  returnInstance(instance) {
    // Add back to the pool.
    this._pool.push(instance);
  },
};

const soundManager = {
  baseURL: "https://s3-us-west-2.amazonaws.com/s.cdpn.io/329180/",
  ctx: new (window.AudioContext || window.webkitAudioContext)(),
  sources: {
    lift: {
      volume: 1,
      playbackRateMin: 0.85,
      playbackRateMax: 0.95,
      fileNames: ["lift1.mp3", "lift2.mp3", "lift3.mp3"],
    },
    burst: {
      volume: 1,
      playbackRateMin: 0.8,
      playbackRateMax: 0.9,
      fileNames: ["burst1.mp3", "burst2.mp3"],
    },
    burstSmall: {
      volume: 0.25,
      playbackRateMin: 0.8,
      playbackRateMax: 1,
      fileNames: ["burst-sm-1.mp3", "burst-sm-2.mp3"],
    },
    crackle: {
      volume: 0.2,
      playbackRateMin: 1,
      playbackRateMax: 1,
      fileNames: ["crackle1.mp3"],
    },
    crackleSmall: {
      volume: 0.3,
      playbackRateMin: 1,
      playbackRateMax: 1,
      fileNames: ["crackle-sm-1.mp3"],
    },
  },

  preload() {
    const allFilePromises = [];

    function checkStatus(response) {
      if (response.status >= 200 && response.status < 300) {
        return response;
      }
      const customError = new Error(response.statusText);
      customError.response = response;
      throw customError;
    }

    const types = Object.keys(this.sources);
    types.forEach((type) => {
      const source = this.sources[type];
      const { fileNames } = source;
      const filePromises = [];
      fileNames.forEach((fileName) => {
        const fileURL = this.baseURL + fileName;
        // Promise will resolve with decoded audio buffer.
        const promise = fetch(fileURL)
          .then(checkStatus)
          .then((response) => response.arrayBuffer())
          .then(
            (data) =>
              new Promise((resolve) => {
                this.ctx.decodeAudioData(data, resolve);
              })
          );

        filePromises.push(promise);
        allFilePromises.push(promise);
      });

      Promise.all(filePromises).then((buffers) => {
        source.buffers = buffers;
      });
    });

    return Promise.all(allFilePromises);
  },

  pauseAll() {
    this.ctx.suspend();
  },

  // Unlock audio on browsers that require a user gesture.
  // Safe to call repeatedly.
  unlock() {
    const ctx = this.ctx;
    if (!ctx) return;

    // Resume immediately; calling inside user gesture is key.
    try {
      const p = ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (e) {
      // ignore
    }

    // Silent blip helps "unlock" on iOS.
    try {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.frequency.value = 220;
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);
    } catch (e) {
      // ignore
    }
  },

  resumeAll() {
    // Try to resume; may still require user gesture (handled by ensureAudioUnlocked()).
    this.unlock();
    setTimeout(() => {
      try {
        this.ctx.resume();
      } catch (e) {
        // ignore
      }
    }, 250);
  },

  // Private property used to throttle small burst sounds.
  _lastSmallBurstTime: 0,

  /**
   * Play a sound of `type`. Will randomly pick a file associated with type, and play it at the specified volume
   * and play speed, with a bit of random variance in play speed. This is all based on `sources` config.
   *
   * @param  {string} type - The type of sound to play.
   * @param  {?number} scale=1 - Value between 0 and 1 (values outside range will be clamped). Scales less than one
   *                             descrease volume and increase playback speed. This is because large explosions are
   *                             louder, deeper, and reverberate longer than small explosions.
   *                             Note that a scale of 0 will mute the sound.
   */
  playSound(type, scale = 1) {
    // Ensure `scale` is within valid range.
    scale = MyMath.clamp(scale, 0, 1);

    // Disallow starting new sounds if sound is disabled, app is running in slow motion, or paused.
    // Slow motion check has some wiggle room in case user doesn't finish dragging the speed bar
    // *all* the way back.
    if (!canPlaySoundSelector() || simSpeed < 0.95) {
      return;
    }

    // Throttle small bursts, since floral/falling leaves shells have a lot of them.
    if (type === "burstSmall") {
      const now = Date.now();
      if (now - this._lastSmallBurstTime < 20) {
        return;
      }
      this._lastSmallBurstTime = now;
    }

    const source = this.sources[type];

    if (!source) {
      throw new Error(`Sound of type "${type}" doesn't exist.`);
    }

    const initialVolume = source.volume;
    const initialPlaybackRate = MyMath.random(
      source.playbackRateMin,
      source.playbackRateMax
    );

    // Volume descreases with scale.
    const scaledVolume = initialVolume * scale;
    // Playback rate increases with scale. For this, we map the scale of 0-1 to a scale of 2-1.
    // So at a scale of 1, sound plays normally, but as scale approaches 0 speed approaches double.
    const scaledPlaybackRate = initialPlaybackRate * (2 - scale);

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = scaledVolume;

    const buffer = MyMath.randomChoice(source.buffers);
    const bufferSource = this.ctx.createBufferSource();
    bufferSource.playbackRate.value = scaledPlaybackRate;
    bufferSource.buffer = buffer;
    bufferSource.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    bufferSource.start(0);
  },
};

// Kick things off.

function setLoadingStatus(status) {
  document.querySelector(".loading-init__status").textContent = status;
}

// CodePen profile header doesn't need audio, just initialize.
if (IS_HEADER) {
  init();
} else {
  // Allow status to render, then preload assets and start app.
  setLoadingStatus("Lighting Fuses");
  setTimeout(() => {
    soundManager.preload().then(init, (reason) => {
      // Codepen preview doesn't like to load the audio, so just init to fix the preview for now.
      init();
      // setLoadingStatus('Error Loading Audio');
      return Promise.reject(reason);
    });
  }, 0);
}

// Set the date we're counting down to: Tết Âm lịch (Lunar New Year)
// Uses a small lookup table for upcoming years (local time).
function getNextLunarNewYearDate() {
  const now = new Date();
  const table = {
    // month is 0-based (Jan = 0)
    2025: [0, 29],
    2026: [1, 17],
    2027: [1, 6],
    2028: [0, 26],
    2029: [1, 13],
    2030: [1, 3],
    2031: [0, 23],
    2032: [1, 11],
    2033: [0, 31],
    2034: [1, 19],
    2035: [1, 8],
  };

  const startYear = now.getFullYear();
  for (let y = startYear; y <= startYear + 10; y += 1) {
    const entry = table[y];
    if (!entry) continue;
    const [m, d] = entry;
    const dt = new Date(y, m, d, 0, 0, 0, 0);
    if (dt.getTime() >= now.getTime()) return dt;
  }

  // Fallback: next Jan 1
  const nextYear = startYear + 1;
  return new Date(nextYear, 0, 1, 0, 0, 0, 0);
}

const countdownTargetDate = getNextLunarNewYearDate();
var countDownDate = countdownTargetDate.getTime();

const chucMungYearEl = document.getElementById("chucMungYear");
if (chucMungYearEl) {
  chucMungYearEl.textContent = String(countdownTargetDate.getFullYear());
}

const countdownTitleEl = document.getElementById("title");
if (countdownTitleEl) {
  countdownTitleEl.textContent = `Countdown đến Tết Âm Lịch ${countdownTargetDate.getFullYear()}`;
}

// Countdown widget behavior: show big on load, then dock to corner.
const countdownEl = document.getElementById("countdown");
let countdownDockTimer = 0;
const COUNTDOWN_DOCK_MARGIN = 12;
const COUNTDOWN_DOCK_SCALE = 0.60;
let countdownExpandedSize = null;
let countdownDockedSize = null;
let countdownHasPositionedOnce = false;

function setCountdownDocked(docked) {
  if (!countdownEl) return;

  if (docked) {
    countdownEl.classList.add("countdown-docked");
    countdownEl.classList.remove("countdown-expanded");
    // Let docked styles apply first (they change size), then measure + position.
    requestAnimationFrame(() => {
      measureCountdownDockedSize(true);
      applyCountdownDockPosition();

      if (!countdownHasPositionedOnce) {
        countdownHasPositionedOnce = true;
        // Reveal after we have a real dock position.
        countdownEl.classList.remove("countdown-init");
      }
    });
  } else {
    countdownEl.classList.remove("countdown-docked");
    countdownEl.classList.add("countdown-expanded");
    countdownEl.style.top = "50%";
    countdownEl.style.left = "50%";
    countdownEl.style.setProperty("--countdown-tx", "-50%");
    countdownEl.style.setProperty("--countdown-ty", "-50%");
    countdownEl.style.setProperty("--dock-scale", "1");
    // Re-measure once it has expanded.
    requestAnimationFrame(() => measureCountdownExpandedSize(false));
  }
}

function measureCountdownExpandedSize(force = false) {
  if (!countdownEl) return;
  if (!force && countdownEl.classList.contains("countdown-docked")) return;
  const rect = countdownEl.getBoundingClientRect();
  countdownExpandedSize = { width: rect.width, height: rect.height };
}

function measureCountdownDockedSize(force = false) {
  if (!countdownEl) return;
  if (!countdownEl.classList.contains("countdown-docked")) return;
  if (!force && countdownDockedSize) return;

  // Measure at scale 1 so we can compute a stable dock scale/position.
  const prevScale = countdownEl.style.getPropertyValue("--dock-scale");
  countdownEl.style.setProperty("--dock-scale", "1");
  const rect = countdownEl.getBoundingClientRect();
  countdownDockedSize = { width: rect.width, height: rect.height };
  if (prevScale) {
    countdownEl.style.setProperty("--dock-scale", prevScale);
  } else {
    countdownEl.style.removeProperty("--dock-scale");
  }
}

function applyCountdownDockPosition() {
  if (!countdownEl) return;

  // Docked mode uses a different layout (time-only), so base sizing must come
  // from the docked layout rather than the expanded layout.
  if (countdownEl.classList.contains("countdown-docked")) {
    measureCountdownDockedSize();
  }

  const rect = countdownDockedSize || countdownExpandedSize || countdownEl.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  const maxScaleX = (window.innerWidth - COUNTDOWN_DOCK_MARGIN * 2) / w;
  const maxScaleY = (window.innerHeight - COUNTDOWN_DOCK_MARGIN * 2) / h;
  // Allow smaller scaling so docked time stays on one line on small screens.
  const scale = Math.max(0.25, Math.min(COUNTDOWN_DOCK_SCALE, maxScaleX, maxScaleY, 1));

  // Place the element by top/left in px, and remove the -50% centering translate.
  // Keep it fully visible by clamping.
  const scaledW = w * scale;
  const scaledH = h * scale;
  const targetLeft = Math.max(
    COUNTDOWN_DOCK_MARGIN,
    Math.round(window.innerWidth - COUNTDOWN_DOCK_MARGIN - scaledW)
  );
  const targetTop = Math.max(
    COUNTDOWN_DOCK_MARGIN,
    Math.round(window.innerHeight - COUNTDOWN_DOCK_MARGIN - scaledH)
  );

  countdownEl.style.left = targetLeft + "px";
  countdownEl.style.top = targetTop + "px";
  countdownEl.style.right = "auto";
  countdownEl.style.bottom = "auto";
  countdownEl.style.setProperty("--countdown-tx", "0px");
  countdownEl.style.setProperty("--countdown-ty", "0px");
  countdownEl.style.setProperty("--dock-scale", String(scale));

  // Snap fully into viewport after transforms apply.
  requestAnimationFrame(() => clampCountdownIntoViewport());
  // And once more after the transition finishes (handles slow fonts/layout shifts).
  window.setTimeout(() => clampCountdownIntoViewport(), 720);
}

function clampCountdownIntoViewport() {
  if (!countdownEl) return;
  if (!countdownEl.classList.contains("countdown-docked")) return;

  const r = countdownEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = parseFloat(countdownEl.style.left || "0");
  let top = parseFloat(countdownEl.style.top || "0");

  // If any side is out of bounds, adjust.
  const overflowRight = r.right - (vw - COUNTDOWN_DOCK_MARGIN);
  const overflowBottom = r.bottom - (vh - COUNTDOWN_DOCK_MARGIN);
  const overflowLeft = COUNTDOWN_DOCK_MARGIN - r.left;
  const overflowTop = COUNTDOWN_DOCK_MARGIN - r.top;

  if (overflowRight > 0) left -= overflowRight;
  if (overflowBottom > 0) top -= overflowBottom;
  if (overflowLeft > 0) left += overflowLeft;
  if (overflowTop > 0) top += overflowTop;

  // Final clamp on numeric left/top.
  left = Math.max(COUNTDOWN_DOCK_MARGIN, Math.min(left, vw - COUNTDOWN_DOCK_MARGIN));
  top = Math.max(COUNTDOWN_DOCK_MARGIN, Math.min(top, vh - COUNTDOWN_DOCK_MARGIN));

  countdownEl.style.left = Math.round(left) + "px";
  countdownEl.style.top = Math.round(top) + "px";
}

function scheduleCountdownAutoDock() {
  if (!countdownEl) return;
  if (countdownDockTimer) window.clearTimeout(countdownDockTimer);
  // Give a short "intro" moment, then dock so fireworks stay prominent.
  countdownDockTimer = window.setTimeout(() => setCountdownDocked(true), 5000);
}

function toggleCountdownDock() {
  if (!countdownEl) return;
  const docked = countdownEl.classList.contains("countdown-docked");
  setCountdownDocked(!docked);
}

if (countdownEl) {
  // Hide until we compute the initial dock position to avoid visible jumping.
  countdownEl.classList.add("countdown-init");

  // Start docked by default (presentation-first).
  // Measure after first paint so the card size is known.
  requestAnimationFrame(() => {
    setCountdownDocked(true);
  });

  // Click the card to toggle dock/expand.
  countdownEl.addEventListener("click", () => {
    toggleCountdownDock();
  });
}

// If fonts load after initial paint, re-apply docking to prevent subtle drift.
if (countdownEl && document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    if (countdownEl.classList.contains("countdown-docked")) {
      countdownEl.classList.add("countdown-no-transition");
      measureCountdownDockedSize(true);
      applyCountdownDockPosition();
      window.setTimeout(() => {
        countdownEl.classList.remove("countdown-no-transition");
      }, 800);
    }
  });
}

window.addEventListener("resize", () => {
  if (countdownEl && countdownEl.classList.contains("countdown-docked")) {
    countdownDockedSize = null;
    measureCountdownDockedSize(true);
    applyCountdownDockPosition();
  } else {
    measureCountdownExpandedSize();
  }
});

function showChucMung() {
  var chucMung = document.getElementById("chucMung");
  chucMung.classList.remove("hidden");
  chucMung.classList.add("fadeIn");
}
// Update the countdown every 1 second
var x = setInterval(function () {
  // Get the current date and time
  var now = new Date().getTime();

  // Calculate the distance between now and the countdown date
  var distance = countDownDate - now;

  // Calculate days, hours, minutes and seconds
  var days = Math.floor(distance / (1000 * 60 * 60 * 24));
  var hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
  var seconds = Math.floor((distance % (1000 * 60)) / 1000);

  document.getElementById("days").innerHTML = days < 10 ? "0" + days : days;
  document.getElementById("hours").innerHTML = hours < 10 ? "0" + hours : hours;
  document.getElementById("minutes").innerHTML =
    minutes < 10 ? "0" + minutes : minutes;
  document.getElementById("seconds").innerHTML =
    seconds < 10 ? "0" + seconds : seconds;
  // If the countdown is over, display a message
  if (distance <= 0) {
    clearInterval(x);
    const countdownEl2 = document.getElementById("countdown");
    if (countdownEl2) countdownEl2.classList.add("hidden");

    // Finale moment: turn on finale + auto fire, and start lì xì rain.
    try {
      updateConfig({ autoLaunch: true, finale: true });
    } catch (e) {
      // ignore
    }
    try {
      setLixiRainEnabled(true);
    } catch (e) {
      // ignore
    }

    showChucMung();
  }
}, 1000);

function LiXi() {
  const swalWithBootstrapButtons = Swal.mixin({
    customClass: {
      confirmButton: "btn-success",
      cancelButton: "btn-danger",
    },
    buttonsStyling: false,
  });
  swalWithBootstrapButtons
    .fire({
      title: "Bạn chắc chắn chọn lì xì?",
      text: "Bạn sẽ không thể nhận được lời chúc!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Chọn lại >_<",
      cancelButtonText: "Chắc chắn !",
      reverseButtons: true,
    })
    .then((result) => {
      if (result.isConfirmed) {
        // swalWithBootstrapButtons.fire({
        //   title: "Yeah!",
        //   text: "Hãy chọn lời chúc nhé",
        //   icon: "success",
        // });
      } else if (
        /* Read more about handling dismissals below */
        result.dismiss === Swal.DismissReason.cancel
      ) {
        // swalWithBootstrapButtons.fire({
        //   title: "No no no",
        //   text: "Bạn không có quyền lựa chọn",
        //   icon: "error",
        // });
        LiXi();
      }
    });
}
