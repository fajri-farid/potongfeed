"use client";

import { useState, useSyncExternalStore, type CSSProperties } from "react";
import { computeUploadOrder, getSafeAreaBands } from "@/lib/grid-geometry";
import { PRODUCT_FLOW_STEPS } from "@/lib/constants";

const FLOW_STEPS = PRODUCT_FLOW_STEPS;
const PREVIEW_LABELS = ["9 potongan foto", "Atur grid 3×3", "Contoh profil IG"] as const;
const STEP_DURATIONS = [3600, 4200, 5400] as const;
const STEP_HOLD_DURATIONS = [1400, 1400, 1600] as const;

const DEMO_TILES = Array.from({ length: 9 }, (_, index) => {
  const row = Math.floor(index / 3);
  const column = index % 3;
  return {
    order: computeUploadOrder(row + 1, column + 1, 3),
    position: `${column * 50}% ${row * 50}%`,
  };
});

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeToMotionPreference(onChange: () => void) {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const getReducedMotion = () => window.matchMedia(MOTION_QUERY).matches;
const getServerReducedMotion = () => true;

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

const SAFE_AREA = getSafeAreaBands("3:4");
const GUIDE_STYLE = {
  "--demo-safe-margin": `${SAFE_AREA.contentSafeMarginFraction * 100}%`,
  "--demo-crop-margin": `${SAFE_AREA.ratioCropTrimFraction.top * 100}%`,
  "--cut-duration": `${STEP_DURATIONS[1] * 0.14}ms`,
  "--intro-duration": `${STEP_DURATIONS[0]}ms`,
  "--outro-duration": `${STEP_DURATIONS[2]}ms`,
} as CSSProperties;

export function LandingSafeAreaDemo() {
  const [activeStep, setActiveStep] = useState(0);
  const [replayKey, setReplayKey] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackRequested, setPlaybackRequested] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeToMotionPreference,
    getReducedMotion,
    getServerReducedMotion,
  );
  const isPlaying = !isPaused && (!reducedMotion || playbackRequested);
  const isVisible = useSyncExternalStore(subscribeToVisibility, getVisible, getServerVisible);
  const isRunning = isPlaying && isVisible;

  function togglePlayback() {
    setIsPaused(isPlaying);
    setPlaybackRequested(true);
  }

  function selectStep(index: number) {
    setActiveStep(index);
    setReplayKey((key) => key + 1);
    setIsPaused(false);
    setPlaybackRequested(true);
  }

  return (
    <div className="flow-demo" data-step={activeStep} data-running={isRunning} style={GUIDE_STYLE}>
      <div className="flow-demo-header">
        <h2>SIMULASI ALUR POTONGFEED</h2>
        <button
          type="button"
          className="flow-playback"
          onClick={togglePlayback}
          aria-label={isPlaying ? "Jeda simulasi otomatis" : "Putar simulasi otomatis"}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
            {isPlaying ? <path d="M5 3v10M11 3v10" /> : <path d="m6 3 7 5-7 5V3Z" />}
          </svg>
        </button>
      </div>
      <div
        key={replayKey}
        className="flow-demo-visual"
        role="img"
        aria-label="Satu ilustrasi lanskap dibagi menjadi sembilan postingan yang tersambung"
      >
        <div className="flow-source">
          <span className="flow-visual-label">1 foto</span>
          <div className="flow-source-image" />
          <span className="flow-source-caption">
            {activeStep === 2 ? (
              <span className="flow-download-chip">
                <svg aria-hidden="true" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v6m-2-2 2 2 2-2M2 8v3h8V8" />
                </svg>
                9 foto · ZIP
              </span>
            ) : (
              "Mulai dari sini"
            )}
          </span>
        </div>
        <div className="flow-transform" aria-hidden="true">
          <svg viewBox="0 0 32 24" fill="none">
            <path d="M3 12h25M21 5l7 7-7 7" />
          </svg>
        </div>
        <div className="flow-result">
          <span className="flow-visual-label">{PREVIEW_LABELS[activeStep]}</span>
          <div className="flow-profile">
            <div className="flow-preview-head" aria-hidden="true">
              {activeStep === 2 ? (
                <>
                  <div className="flow-profile-header">
                    <span className="flow-profile-username">
                      cerita.sore
                      <svg viewBox="0 0 12 12" fill="none">
                        <path d="m3 5 3 3 3-3" />
                      </svg>
                    </span>
                    <span className="flow-profile-tools">
                      <svg viewBox="0 0 12 12" fill="none">
                        <rect x="1.5" y="1.5" width="9" height="9" rx="2" />
                        <path d="M6 3.5v5M3.5 6h5" />
                      </svg>
                      <svg viewBox="0 0 12 12" fill="none">
                        <path d="M2 3h8M2 6h8M2 9h8" />
                      </svg>
                    </span>
                  </div>
                  <div className="flow-profile-summary">
                    <span className="flow-profile-avatar">
                      <span>+</span>
                    </span>
                    <div className="flow-profile-stats">
                      <span>
                        <strong>9</strong>postingan
                      </span>
                      <span>
                        <strong>248</strong>pengikut
                      </span>
                      <span>
                        <strong>186</strong>mengikuti
                      </span>
                    </div>
                  </div>
                  <div className="flow-profile-bio">
                    <span className="flow-profile-name">Cerita Sore</span>
                    <span>Catatan kecil dari perjalanan.</span>
                  </div>
                  <div className="flow-profile-actions">
                    <span>Edit profil</span>
                    <span>Bagikan profil</span>
                  </div>
                  <div className="flow-profile-highlights">
                    {["Jalan", "Senja", "Cerita"].map((label) => (
                      <span key={label}>
                        <i />
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="flow-profile-tabs">
                    <span data-selected="true">
                      <svg viewBox="0 0 12 12" fill="none">
                        <path d="M1 1h10v10H1zM4.33 1v10M7.67 1v10M1 4.33h10M1 7.67h10" />
                      </svg>
                    </span>
                    <span>
                      <svg viewBox="0 0 12 12" fill="none">
                        <rect x="1" y="1" width="10" height="10" rx="2" />
                        <path d="M1 4h10M4 1l2 3M8 1l2 3m-5 2 3 1.5L5 9V6Z" />
                      </svg>
                    </span>
                    <span>
                      <svg viewBox="0 0 12 12" fill="none">
                        <path d="m4 2 2-1 2 1h3v9H1V2h3Z" />
                        <circle cx="6" cy="5" r="1.5" />
                        <path d="M3.5 10V9a2.5 2.5 0 0 1 5 0v1" />
                      </svg>
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flow-editor-header">
                    <svg viewBox="0 0 16 16" fill="none">
                      <path d="M4 1v11h11M1 4h11v11" />
                    </svg>
                    <span>Editor PotongFeed</span>
                  </div>
                  <div className="flow-editor-settings">
                    <span>Grid 3×3</span>
                    <span>{activeStep === 1 ? "Batas aman aktif" : "9 potongan"}</span>
                  </div>
                </>
              )}
            </div>
            <div className="flow-tile-grid" aria-hidden="true">
              {activeStep === 0 ? (
                <div className="flow-whole-image" />
              ) : (
                DEMO_TILES.map((tile, index) => (
                  <div
                    key={tile.order}
                    className="flow-tile"
                    style={
                      {
                        backgroundPosition: tile.position,
                        // Pemotongan mengisi 4–96% durasi langkah 02.
                        "--cut-delay": `${STEP_DURATIONS[1] * (0.04 + (index / (DEMO_TILES.length - 1)) * 0.78)}ms`,
                        "--post-delay": `${STEP_DURATIONS[2] * (0.26 + ((tile.order - 1) / (DEMO_TILES.length - 1)) * 0.48)}ms`,
                      } as CSSProperties
                    }
                  >
                    <div className="flow-crop-guide" />
                    <div className="flow-safe-guide" />
                    <span className="flow-tile-number" data-first={tile.order === 1}>
                      {tile.order}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <span className="flow-result-caption">
            <span aria-hidden="true" />
            {activeStep === 2 ? "Nomor = urutan posting" : FLOW_STEPS[activeStep].badge}
          </span>
        </div>
      </div>
      <div className="flow-controls">
        <div className="flow-step-list" role="group" aria-label="Pilih langkah simulasi">
          {FLOW_STEPS.map((step, index) => (
            <button
              key={step.label}
              type="button"
              className="flow-step"
              aria-pressed={index === activeStep}
              aria-controls="flow-step-description"
              onClick={() => selectStep(index)}
            >
              <span className="flow-step-number">0{index + 1}</span>
              <span>{step.label}</span>
              <span
                key={replayKey}
                className="flow-step-progress"
                aria-hidden="true"
                style={
                  {
                    "--step-duration": `${STEP_DURATIONS[index]}ms`,
                    "--step-total-duration": `${STEP_DURATIONS[index] + STEP_HOLD_DURATIONS[index]}ms`,
                  } as CSSProperties
                }
              >
                <span className="flow-step-fill" data-complete={index < activeStep} />
                <span
                  className="flow-step-clock"
                  onAnimationEnd={(event) => {
                    if (event.target === event.currentTarget && index === activeStep) {
                      setActiveStep((step) => (step + 1) % FLOW_STEPS.length);
                    }
                  }}
                />
              </span>
            </button>
          ))}
        </div>
        <p id="flow-step-description" className="flow-step-description">
          {FLOW_STEPS[activeStep].description}
        </p>
      </div>
      <div className="flow-demo-footer">
        <span>Ilustrasi alur · Contoh grid 3×3</span>
        <span>{isPlaying ? "Demo otomatis" : "Demo dijeda"}</span>
      </div>
    </div>
  );
}
