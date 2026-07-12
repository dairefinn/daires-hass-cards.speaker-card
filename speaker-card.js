class SpeakerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._dragging = false;
    this._volDragging = false;
    this._volHovering = false;
    this._optimisticVolume = null;
    this._optimisticMuted = null;
    this._optimisticPosition = null;
    this._optimisticPositionAt = null;
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error("You must define 'entity'");
    }
    this._config = config;
    this._render();
  }

  getCardSize() {
    return 3;
  }

  _getState() {
    const config = this._config;
    const stateObj = this._hass?.states[config.entity];
    const state = stateObj?.state ?? "unavailable";
    const attrs = stateObj?.attributes ?? {};

    const name =
      config.title ||
      attrs.friendly_name ||
      config.entity.split(".").pop().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    const isPlaying = state === "playing";
    const isPaused = state === "paused";
    const isActive = isPlaying || isPaused;
    const isOff = state === "off";
    const isUnavailable = state === "unavailable" || state === "unknown";

    const haVol = attrs.volume_level ?? null;
    const haMuted = attrs.is_volume_muted ?? false;
    const haPos = attrs.media_position ?? null;

    // Clear optimistic state when HA confirms the value
    if (this._optimisticVolume != null && haVol != null && Math.abs(haVol - this._optimisticVolume) < 0.02) {
      this._optimisticVolume = null;
    }
    if (this._optimisticMuted != null && haMuted === this._optimisticMuted) {
      this._optimisticMuted = null;
    }
    if (this._optimisticPosition != null && haPos != null && Math.abs(haPos - this._optimisticPosition) < 2) {
      this._optimisticPosition = null;
      this._optimisticPositionAt = null;
    }

    return {
      name,
      state,
      isPlaying,
      isPaused,
      isActive,
      isOff,
      isUnavailable,
      mediaTitle: attrs.media_title ?? null,
      mediaArtist: attrs.media_artist ?? null,
      volumeLevel: this._optimisticVolume ?? haVol,
      isMuted: this._optimisticMuted ?? haMuted,
      entityPicture: attrs.entity_picture ?? null,
      mediaPosition: this._optimisticPosition ?? haPos,
      mediaDuration: attrs.media_duration ?? null,
      mediaPositionUpdatedAt: this._optimisticPosition != null
        ? this._optimisticPositionAt
        : (attrs.media_position_updated_at ?? null),
    };
  }

  _callService(service, data = {}) {
    if (!this._hass) return;
    this._hass.callService("media_player", service, {
      entity_id: this._config.entity,
      ...data,
    });
  }

  _primaryEntity() {
    return this._config.entity ?? null;
  }

  _handleInteraction(trigger) {
    const interaction = (this._config.interactions ?? []).find(
      (i) => (i.trigger ?? "tap") === trigger
    );
    if (!interaction) return;
    const { action } = interaction;
    if (action === "more-info") {
      const entityId = interaction.entity ?? this._primaryEntity();
      if (!entityId) return;
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        detail: { entityId },
        bubbles: true,
        composed: true,
      }));
    } else if (action === "toggle") {
      const entityId = interaction.entity ?? this._primaryEntity();
      if (!entityId || !this._hass) return;
      this._hass.callService("homeassistant", "toggle", { entity_id: entityId });
    } else if (action === "call-service") {
      if (!interaction.service || !this._hass) return;
      const [domain, service] = interaction.service.split(".");
      this._hass.callService(domain, service, interaction.service_data ?? {});
    } else if (action === "navigate") {
      if (!interaction.path) return;
      try { window.history.pushState(null, "", interaction.path); } catch (_) {}
      this.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
    } else if (action === "url") {
      if (!interaction.url) return;
      window.open(interaction.url, interaction.target ?? "_blank");
    }
  }

  _attachInteractionListeners() {
    const interactions = this._config?.interactions;
    if (!interactions?.length) return;

    if (this._tapTimer) {
      clearTimeout(this._tapTimer);
      this._tapTimer = null;
      this._tapCount = 0;
    }

    const card = this.shadowRoot.querySelector(".card");
    if (!card) return;

    const triggers = new Set(interactions.map((i) => i.trigger ?? "tap"));
    card.style.cursor = "pointer";

    if (triggers.has("tap") || triggers.has("double_tap")) {
      card.addEventListener("click", (e) => {
        if (e.target.closest("button")) return;
        this._tapCount = (this._tapCount ?? 0) + 1;
        if (this._tapCount === 1) {
          this._tapTimer = setTimeout(() => {
            this._tapCount = 0;
            this._tapTimer = null;
            this._handleInteraction("tap");
          }, 250);
        } else {
          clearTimeout(this._tapTimer);
          this._tapTimer = null;
          this._tapCount = 0;
          this._handleInteraction("double_tap");
        }
      });
    }

    if (triggers.has("hold")) {
      let holdTimer;
      const startHold = () => { holdTimer = setTimeout(() => this._handleInteraction("hold"), 500); };
      const cancelHold = () => clearTimeout(holdTimer);
      card.addEventListener("mousedown", startHold);
      card.addEventListener("mouseup", cancelHold);
      card.addEventListener("mouseleave", cancelHold);
      card.addEventListener("touchstart", startHold, { passive: true });
      card.addEventListener("touchend", cancelHold);
      card.addEventListener("touchcancel", cancelHold);
    }
  }

  static getConfigElement() {
    return document.createElement("daires-hass-cards-speaker-card-editor");
  }

  static getStubConfig() {
    return { entity: "media_player.example" };
  }

  _render() {
    if (!this._config || this._dragging || this._volDragging) return;

    const config = this._config;
    const s = this._getState();
    const background = config.background ?? "var(--card-background-color, #fff)";

    const accentColor = s.isUnavailable || s.isOff
      ? "var(--divider-color, #e0e0e0)"
      : "var(--primary-color, #03a9f4)";

    const showArt = s.isActive && !!s.entityPicture;
    const textPrimary = showArt ? "#fff" : "var(--primary-text-color, #212121)";
    const textSecondary = showArt ? "rgba(255,255,255,0.7)" : "var(--secondary-text-color, #727272)";
    const trackBg = showArt ? "rgba(255,255,255,0.25)" : "var(--divider-color, #e0e0e0)";
    const iconFill = showArt ? "rgba(255,255,255,0.85)" : accentColor;

    const volumePct = s.volumeLevel != null ? Math.round(s.volumeLevel * 100) : null;

    let statusText;
    if (s.isUnavailable) statusText = "Unavailable";
    else if (s.isOff) statusText = "Off";
    else if (!s.isActive) statusText = "Idle";
    else if (!s.mediaTitle) statusText = s.isPlaying ? "Playing" : "Paused";
    else statusText = null;

    const playPauseIconPath = s.isPlaying
      ? `<path d="M14,19H18V5H14M6,19H10V5H6V19Z"/>`
      : `<path d="M8,5.14V19.14L19,12.14L8,5.14Z"/>`;

    const volumeFill = showArt ? "rgba(255,255,255,0.9)" : accentColor;

    const fmt = (secs) => {
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60).toString().padStart(2, "0");
      return `${m}:${s}`;
    };

    let progressPct = null;
    let currentPosition = null;
    const hasPosition = s.isActive && s.mediaPosition != null && s.mediaPositionUpdatedAt;
    if (hasPosition) {
      const elapsed = s.isPlaying
        ? (Date.now() - new Date(s.mediaPositionUpdatedAt).getTime()) / 1000
        : 0;
      currentPosition = Math.max(0, s.mediaPosition + elapsed);
      if (s.mediaDuration) {
        progressPct = Math.min(100, (currentPosition / s.mediaDuration) * 100);
      }
    }
    const canSeek = progressPct != null && s.mediaDuration != null;
    const volIconPath = s.isMuted
      ? `<path d="M3,9V15H7L12,20V4L7,9H3M20.17,13.83L18.75,12.42L20.17,11L18.75,9.58L17.33,11L15.92,9.58L14.5,11L15.92,12.42L14.5,13.83L15.92,15.25L17.33,13.83L18.75,15.25L20.17,13.83Z"/>`
      : `<path d="M3,9V15H7L12,20V4L7,9H3M16.5,12C16.5,10.23 15.48,8.71 14,7.97V16C15.48,15.29 16.5,13.77 16.5,12Z"/>`;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; height: 100%; }
        ha-card { height: 100%; }
        .card {
          background: ${background};
          border-radius: 12px;
          padding: 16px;
          box-sizing: border-box;
          position: relative;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .art-bg {
          position: absolute;
          inset: 0;
          border-radius: 12px;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          transition: opacity 0.6s ease;
        }
        .art-overlay {
          position: absolute;
          inset: 0;
          border-radius: 12px;
          background: linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.65));
        }
        .card-content {
          position: relative;
          z-index: 1;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .flex-spacer { flex: 1; }
        .header {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          font-weight: 500;
          color: ${textSecondary};
          transition: color 0.6s ease, opacity 0.2s;
          cursor: pointer;
        }
        .header:hover { opacity: 0.7; }
        .header-status {
          margin-left: auto;
          font-size: 13px;
          font-weight: 400;
          color: ${textSecondary};
          transition: color 0.6s ease;
        }
        .media-info {
          min-width: 0;
          margin-bottom: 8px;
        }
        .media-title {
          font-size: 22px;
          font-weight: 600;
          color: ${textPrimary};
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1.2;
          transition: color 0.6s ease;
        }
        .media-artist-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 2px;
          gap: 8px;
        }
        .media-artist {
          font-size: 13px;
          color: ${textSecondary};
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color 0.6s ease;
          flex: 1;
          min-width: 0;
        }
        .media-timer {
          font-size: 12px;
          color: ${textSecondary};
          white-space: nowrap;
          flex-shrink: 0;
          transition: color 0.6s ease;
        }
        .controls-row {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-top: 12px;
        }
        .left-pad { width: 32px; flex-shrink: 0; }
        .controls {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .ctrl-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${textPrimary};
          transition: background 0.2s;
        }
        .ctrl-btn:hover { background: ${showArt ? "rgba(255,255,255,0.15)" : "var(--divider-color, #e0e0e0)"}; }
        .ctrl-btn:disabled { opacity: 0.3; cursor: default; pointer-events: none; }
        .ctrl-btn.play-pause {
          background: ${accentColor};
          color: #fff;
          transition: background 0.6s ease;
        }
        .ctrl-btn.play-pause:hover { opacity: 0.85; }
        .vol-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: ${textSecondary};
          transition: background 0.2s, color 0.6s ease;
          flex-shrink: 0;
          width: 32px;
          height: 32px;
          box-sizing: border-box;
        }
        .vol-btn:hover { background: ${showArt ? "rgba(255,255,255,0.15)" : "var(--divider-color, #e0e0e0)"}; }
        .vol-container {
          position: relative;
          flex-shrink: 0;
        }
        .vol-popup {
          position: absolute;
          bottom: 100%;
          right: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 8px 6px;
          background: ${showArt ? "rgba(0,0,0,0.6)" : "var(--card-background-color, #fff)"};
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.15s ease;
          z-index: 10;
        }
        .vol-pct-label {
          font-size: 11px;
          font-weight: 500;
          color: ${textSecondary};
          white-space: nowrap;
          transition: color 0.6s ease;
        }
        .vol-vert-track {
          position: relative;
          width: 28px;
          height: 80px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .vol-vert-bar {
          width: 4px;
          height: 100%;
          border-radius: 2px;
          background: ${trackBg};
          position: relative;
          overflow: hidden;
          pointer-events: none;
          transition: background 0.6s ease;
        }
        .vol-vert-fill {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: ${volumeFill};
          pointer-events: none;
          transition: height 0.3s ease, background 0.6s ease;
        }
        .vol-thumb {
          position: absolute;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: ${volumeFill};
          cursor: grab;
          z-index: 2;
          transition: background 0.6s ease;
          pointer-events: auto;
        }
        .vol-thumb:active { cursor: grabbing; }
        .progress-wrap {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 2;
          padding: ${canSeek ? "10px 0 0" : "0"};
          cursor: ${canSeek ? "pointer" : "default"};
          box-sizing: border-box;
        }
        .progress-track-wrap {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 12px;
          overflow: hidden;
          border-radius: 0 0 12px 12px;
          pointer-events: none;
        }
        .progress-track {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          border-radius: 2px;
          background: ${trackBg};
          overflow: hidden;
          pointer-events: none;
          transition: height 0.15s ease, background 0.6s ease;
        }
        ${canSeek ? ".progress-wrap:hover .progress-track { height: 5px; }" : ""}
        .progress-hover-fill {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 0%;
          background: ${showArt ? "rgba(255,255,255,0.35)" : "rgba(3,169,244,0.4)"};
          pointer-events: none;
        }
        .progress-fill {
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          background: ${volumeFill};
          pointer-events: none;
          transition: background 0.6s ease;
        }
        .progress-thumb {
          position: absolute;
          bottom: -4.5px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: ${volumeFill};
          transform: translateX(-50%);
          opacity: 0;
          pointer-events: ${canSeek ? "auto" : "none"};
          transition: opacity 0.15s ease, bottom 0.15s ease, background 0.6s ease;
          z-index: 3;
          cursor: grab;
        }
        ${canSeek ? ".progress-wrap:hover .progress-thumb { opacity: 1; bottom: -3.5px; }" : ""}
        .progress-thumb:active { cursor: grabbing; }
        .progress-tooltip {
          position: absolute;
          bottom: calc(100% + 6px);
          transform: translateX(-50%);
          background: rgba(0,0,0,0.75);
          color: #fff;
          font-size: 11px;
          font-weight: 500;
          padding: 3px 7px;
          border-radius: 4px;
          white-space: nowrap;
          pointer-events: none;
          display: none;
        }
      </style>
      <ha-card>
        <div class="card">
          ${showArt ? `
            <div class="art-bg" style="background-image: url('${s.entityPicture}');"></div>
            <div class="art-overlay"></div>
          ` : ""}
          <div class="card-content">
            <div class="header" id="card-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3,9V15H7L12,20V4L7,9H3M16.5,12C16.5,10.23 15.48,8.71 14,7.97V16C15.48,15.29 16.5,13.77 16.5,12Z"/>
              </svg>
              ${s.name}
              ${statusText ? `<span class="header-status">${statusText}</span>` : ""}
            </div>
            <div class="flex-spacer"></div>
            <div class="media-info">
              ${s.mediaTitle ? `<div class="media-title">${s.mediaTitle}</div>` : ""}
              ${(s.mediaArtist || hasPosition) ? `
                <div class="media-artist-row">
                  <span class="media-artist">${s.mediaArtist ?? ""}</span>
                  ${hasPosition ? `<span class="media-timer">${fmt(currentPosition)}${s.mediaDuration ? " / " + fmt(s.mediaDuration) : ""}</span>` : ""}
                </div>
              ` : ""}
            </div>
            ${!s.isUnavailable ? `
              <div class="controls-row">
                <div class="left-pad"></div>
                <div class="controls">
                  <button class="ctrl-btn" id="prev-btn" ${!s.isActive ? "disabled" : ""}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6,18V6H8V11.5L18.5,5V19L8,12.5V18H6Z"/>
                    </svg>
                  </button>
                  <button class="ctrl-btn play-pause" id="playpause-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      ${playPauseIconPath}
                    </svg>
                  </button>
                  <button class="ctrl-btn" id="next-btn" ${!s.isActive ? "disabled" : ""}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18,18H16V12.5L5.5,19V5L16,11.5V6H18V18Z"/>
                    </svg>
                  </button>
                </div>
                ${volumePct != null ? `
                  <div class="vol-container">
                    <div class="vol-popup">
                      <span class="vol-pct-label">${s.isMuted ? "Muted" : volumePct + "%"}</span>
                      <div class="vol-vert-track" id="vol-track">
                        <div class="vol-vert-bar">
                          <div class="vol-vert-fill" style="height:${s.isMuted ? 0 : volumePct}%;"></div>
                        </div>
                        <div class="vol-thumb" id="vol-thumb" style="top:${s.isMuted ? 100 : (100 - volumePct)}%;"></div>
                      </div>
                    </div>
                    <button class="vol-btn" id="vol-btn">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        ${volIconPath}
                      </svg>
                    </button>
                  </div>
                ` : `<div class="left-pad"></div>`}
              </div>
            ` : ""}
          </div>
          ${progressPct != null ? `
            <div class="progress-wrap" id="progress-bar">
              <div class="progress-track-wrap">
                <div class="progress-track">
                  <div class="progress-hover-fill" id="progress-hover-fill"></div>
                  <div class="progress-fill" style="width:${progressPct}%;"></div>
                </div>
              </div>
              ${canSeek ? `
                <div class="progress-thumb" style="left:${progressPct}%;"></div>
                <div class="progress-tooltip" id="progress-tooltip"></div>
              ` : ""}
            </div>
          ` : ""}
        </div>
      </ha-card>
    `;

    const cardTitle = this.shadowRoot.getElementById("card-title");
    if (cardTitle) {
      cardTitle.addEventListener("click", (e) => {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent("hass-more-info", {
          detail: { entityId: this._config.entity },
          bubbles: true,
          composed: true,
        }));
      });
    }
    if (!s.isUnavailable) {
      this.shadowRoot.getElementById("playpause-btn").addEventListener("click", () => {
        this._callService("media_play_pause");
      });
      if (s.isActive) {
        this.shadowRoot.getElementById("prev-btn").addEventListener("click", () => {
          this._callService("media_previous_track");
        });
        this.shadowRoot.getElementById("next-btn").addEventListener("click", () => {
          this._callService("media_next_track");
        });
      }
      const progressBar = this.shadowRoot.getElementById("progress-bar");
      if (progressBar && canSeek) {
        const tooltip = this.shadowRoot.getElementById("progress-tooltip");
        const thumb = progressBar.querySelector(".progress-thumb");
        const hoverFill = this.shadowRoot.getElementById("progress-hover-fill");

        progressBar.addEventListener("click", (e) => {
          if (this._dragging) return;
          const rect = progressBar.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const position = pct * s.mediaDuration;
          this._optimisticPosition = position;
          this._optimisticPositionAt = new Date().toISOString();
          const capturedPos = position;
          setTimeout(() => {
            if (this._optimisticPosition === capturedPos) {
              this._optimisticPosition = null;
              this._optimisticPositionAt = null;
              this._render();
            }
          }, 3000);
          this._callService("media_seek", { seek_position: position });
          this._render();
        });

        progressBar.addEventListener("mousemove", (e) => {
          const rect = progressBar.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          if (hoverFill) hoverFill.style.width = `${pct * 100}%`;
          if (tooltip) {
            tooltip.style.display = "block";
            tooltip.style.left = `${pct * 100}%`;
            tooltip.textContent = fmt(pct * s.mediaDuration);
          }
        });

        progressBar.addEventListener("mouseleave", () => {
          if (hoverFill) hoverFill.style.width = "0%";
          if (tooltip) tooltip.style.display = "none";
        });

        if (thumb) {
          thumb.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._dragging = true;
            const fill = progressBar.querySelector(".progress-fill");

            const onMove = (e) => {
              const rect = progressBar.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              thumb.style.left = `${pct * 100}%`;
              if (fill) fill.style.width = `${pct * 100}%`;
              if (tooltip) {
                tooltip.style.display = "block";
                tooltip.style.left = `${pct * 100}%`;
                tooltip.textContent = fmt(pct * s.mediaDuration);
              }
            };

            const onUp = (e) => {
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
              const rect = progressBar.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const position = pct * s.mediaDuration;
              this._optimisticPosition = position;
              this._optimisticPositionAt = new Date().toISOString();
              const capturedPos = position;
              setTimeout(() => {
                if (this._optimisticPosition === capturedPos) {
                  this._optimisticPosition = null;
                  this._optimisticPositionAt = null;
                  this._render();
                }
              }, 3000);
              this._dragging = false;
              this._callService("media_seek", { seek_position: position });
              this._render();
            };

            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          });
        }
      }
      const volContainer = this.shadowRoot.querySelector(".vol-container");
      if (volContainer) {
        const popup = volContainer.querySelector(".vol-popup");
        if (this._volHovering && popup) {
          popup.style.opacity = "1";
          popup.style.pointerEvents = "auto";
        }
        volContainer.addEventListener("mouseenter", () => {
          this._volHovering = true;
          const p = volContainer.querySelector(".vol-popup");
          if (p) { p.style.opacity = "1"; p.style.pointerEvents = "auto"; }
        });
        volContainer.addEventListener("mouseleave", () => {
          if (this._volDragging) return;
          this._volHovering = false;
          const p = volContainer.querySelector(".vol-popup");
          if (p) { p.style.opacity = "0"; p.style.pointerEvents = "none"; }
        });
      }
      const volBtn = this.shadowRoot.getElementById("vol-btn");
      if (volBtn) {
        volBtn.addEventListener("click", () => {
          const newMuted = !s.isMuted;
          this._optimisticMuted = newMuted;
          const capturedMuted = newMuted;
          setTimeout(() => {
            if (this._optimisticMuted === capturedMuted) {
              this._optimisticMuted = null;
              this._render();
            }
          }, 3000);
          this._callService("volume_mute", { is_volume_muted: newMuted });
          this._render();
        });
      }
      const volTrack = this.shadowRoot.getElementById("vol-track");
      if (volTrack) {
        volTrack.addEventListener("click", (e) => {
          const rect = volTrack.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
          this._optimisticVolume = pct;
          const capturedVol = pct;
          setTimeout(() => {
            if (this._optimisticVolume === capturedVol) {
              this._optimisticVolume = null;
              this._render();
            }
          }, 3000);
          this._callService("volume_set", { volume_level: pct });
          // Update DOM directly — avoids re-render which would close the popup
          const fill = volTrack.querySelector(".vol-vert-fill");
          if (fill) fill.style.height = `${Math.round(pct * 100)}%`;
          const thumb = volTrack.querySelector(".vol-thumb");
          if (thumb) thumb.style.top = `${Math.round((1 - pct) * 100)}%`;
          const label = volContainer?.querySelector(".vol-pct-label");
          if (label) label.textContent = `${Math.round(pct * 100)}%`;
        });
        const volThumb = this.shadowRoot.getElementById("vol-thumb");
        if (volThumb) {
          volThumb.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._volDragging = true;
            const fill = volTrack.querySelector(".vol-vert-fill");
            const label = volContainer?.querySelector(".vol-pct-label");

            const onMove = (e) => {
              const rect = volTrack.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
              volThumb.style.top = `${(1 - pct) * 100}%`;
              if (fill) fill.style.height = `${Math.round(pct * 100)}%`;
              if (label) label.textContent = `${Math.round(pct * 100)}%`;
            };

            const onUp = (e) => {
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
              const rect = volTrack.getBoundingClientRect();
              const pct = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
              this._optimisticVolume = pct;
              const capturedVol = pct;
              setTimeout(() => {
                if (this._optimisticVolume === capturedVol) {
                  this._optimisticVolume = null;
                  this._render();
                }
              }, 3000);
              this._volDragging = false;
              this._callService("volume_set", { volume_level: pct });
              // Restore popup visibility based on whether mouse is still over container
              if (volContainer) {
                const rect = volContainer.getBoundingClientRect();
                const over = e.clientX >= rect.left && e.clientX <= rect.right &&
                             e.clientY >= rect.top && e.clientY <= rect.bottom;
                if (!over) {
                  this._volHovering = false;
                  const popup = volContainer.querySelector(".vol-popup");
                  if (popup) { popup.style.opacity = "0"; popup.style.pointerEvents = "none"; }
                }
              }
            };

            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          });
          volThumb.addEventListener("click", (e) => e.stopPropagation());
        }
      }
    }
    this._attachInteractionListeners();
  }
}

customElements.define("daires-hass-cards-speaker-card", SpeakerCard);

class SpeakerCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    const p = this.shadowRoot.getElementById("entity");
    if (p) p.hass = hass;
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  _fire() {
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: { ...this._config } },
      bubbles: true,
      composed: true,
    }));
  }

  _set(key, value) {
    if (value === "" || value === undefined || value === null) {
      delete this._config[key];
    } else {
      this._config[key] = value;
    }
    this._fire();
  }

  _render() {
    const c = this._config ?? {};
    this.shadowRoot.innerHTML = `
      <style>
        .form { display: flex; flex-direction: column; gap: 12px; padding: 16px 0; }
        .section { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--secondary-text-color, #727272); padding-bottom: 4px; border-bottom: 1px solid var(--divider-color, #e0e0e0); margin-top: 8px; }
        .row { display: flex; flex-direction: column; gap: 4px; }
        label { font-size: 12px; color: var(--secondary-text-color, #727272); }
        input[type=text] { padding: 8px 10px; border: 1px solid var(--divider-color, #e0e0e0); border-radius: 6px; font-size: 14px; color: var(--primary-text-color, #212121); background: var(--card-background-color, #fff); box-sizing: border-box; width: 100%; }
        ha-entity-picker { display: block; }
      </style>
      <div class="form">
        <div class="section">Entity</div>
        <ha-entity-picker id="entity" allow-custom-entity></ha-entity-picker>

        <div class="section">Display</div>
        <div class="row"><label>Title</label><input id="title" type="text" placeholder="Overrides entity name" /></div>
      </div>
    `;

    const picker = this.shadowRoot.getElementById("entity");
    picker.value = c.entity ?? "";
    picker.includeDomains = ["media_player"];
    if (this._hass) picker.hass = this._hass;
    picker.addEventListener("value-changed", (e) => this._set("entity", e.detail.value));

    const titleEl = this.shadowRoot.getElementById("title");
    titleEl.value = c.title ?? "";
    titleEl.addEventListener("change", (e) => this._set("title", e.target.value));
  }
}

customElements.define("daires-hass-cards-speaker-card-editor", SpeakerCardEditor);
