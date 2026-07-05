class SpeakerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._volumeOpen = false;
    this._seekOpen = false;
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
      volumeLevel: attrs.volume_level ?? null,
      isMuted: attrs.is_volume_muted ?? false,
      entityPicture: attrs.entity_picture ?? null,
      mediaPosition: attrs.media_position ?? null,
      mediaDuration: attrs.media_duration ?? null,
      mediaPositionUpdatedAt: attrs.media_position_updated_at ?? null,
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
    if (!this._config) return;

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
          overflow: hidden;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .art-bg {
          position: absolute;
          inset: 0;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          transition: opacity 0.6s ease;
        }
        .art-overlay {
          position: absolute;
          inset: 0;
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
          transition: color 0.6s ease;
        }
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
        .vol-expand {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
        }
        .vol-track {
          flex: 1;
          padding: 10px 0;
          cursor: pointer;
          box-sizing: content-box;
        }
        .vol-track-inner {
          height: 4px;
          border-radius: 2px;
          background: ${trackBg};
          overflow: hidden;
          pointer-events: none;
          transition: background 0.6s ease;
        }
        .vol-fill {
          height: 100%;
          border-radius: 2px;
          background: ${volumeFill};
          pointer-events: none;
          transition: width 0.3s ease, background 0.6s ease;
        }
        .vol-pct {
          font-size: 13px;
          color: ${textSecondary};
          min-width: 32px;
          text-align: right;
          transition: color 0.6s ease;
        }
        .seek-btn {
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
        .seek-btn:hover { background: ${showArt ? "rgba(255,255,255,0.15)" : "var(--divider-color, #e0e0e0)"}; }
        .progress-wrap {
          margin-top: 10px;
          padding: ${this._seekOpen ? "8px 0" : "4px 0"};
          cursor: ${this._seekOpen ? "pointer" : "default"};
          box-sizing: content-box;
        }
        .progress-track {
          height: 3px;
          border-radius: 2px;
          background: ${trackBg};
          overflow: hidden;
          pointer-events: none;
          transition: background 0.6s ease, height 0.2s ease;
          ${this._seekOpen ? "height: 4px;" : ""}
        }
        .progress-fill {
          height: 100%;
          border-radius: 2px;
          background: ${volumeFill};
          pointer-events: none;
          transition: background 0.6s ease;
        }
      </style>
      <ha-card>
        <div class="card">
          ${showArt ? `
            <div class="art-bg" style="background-image: url('${s.entityPicture}');"></div>
            <div class="art-overlay"></div>
          ` : ""}
          <div class="card-content">
            <div class="header">
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
                ${hasPosition && s.mediaDuration != null ? `
                  <button class="seek-btn" id="seek-btn">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.9L16.2,16.2Z"/>
                    </svg>
                  </button>
                ` : `<div class="left-pad"></div>`}
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
                  <button class="vol-btn" id="vol-btn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      ${volIconPath}
                    </svg>
                  </button>
                ` : `<div class="left-pad"></div>`}
              </div>
              ${progressPct != null && !this._volumeOpen && !this._seekOpen ? `
                <div class="progress-wrap" id="seek-track">
                  <div class="progress-track">
                    <div class="progress-fill" style="width:${progressPct}%;"></div>
                  </div>
                </div>
              ` : ""}
              ${hasPosition && this._seekOpen ? `
                <div class="vol-expand">
                  <div class="vol-track" id="seek-track">
                    <div class="vol-track-inner">
                      <div class="vol-fill" style="width:${progressPct != null ? progressPct : 0}%;"></div>
                    </div>
                  </div>
                </div>
              ` : ""}
              ${volumePct != null && this._volumeOpen ? `
                <div class="vol-expand">
                  <div class="vol-track" id="vol-track">
                    <div class="vol-track-inner">
                      <div class="vol-fill" style="width:${s.isMuted ? 0 : volumePct}%;"></div>
                    </div>
                  </div>
                  <span class="vol-pct">${s.isMuted ? "Muted" : volumePct + "%"}</span>
                </div>
              ` : ""}
            ` : ""}
          </div>
        </div>
      </ha-card>
    `;

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
      const seekBtn = this.shadowRoot.getElementById("seek-btn");
      if (seekBtn) {
        seekBtn.addEventListener("click", () => {
          this._seekOpen = !this._seekOpen;
          if (this._seekOpen) this._volumeOpen = false;
          this._render();
        });
      }
      const seekTrack = this.shadowRoot.getElementById("seek-track");
      if (seekTrack && s.mediaDuration) {
        seekTrack.addEventListener("click", (e) => {
          const rect = seekTrack.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          this._callService("media_seek", { seek_position: pct * s.mediaDuration });
        });
      }
      const volBtn = this.shadowRoot.getElementById("vol-btn");
      if (volBtn) {
        volBtn.addEventListener("click", () => {
          this._volumeOpen = !this._volumeOpen;
          if (this._volumeOpen) this._seekOpen = false;
          this._render();
        });
      }
      const volTrack = this.shadowRoot.getElementById("vol-track");
      if (volTrack) {
        volTrack.addEventListener("click", (e) => {
          const rect = volTrack.getBoundingClientRect();
          const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          this._callService("volume_set", { volume_level: pct });
        });
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
