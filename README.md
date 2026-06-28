# Speaker card

A media player card for Home Assistant. Shows the currently playing track, artist, and volume level with play/pause, previous, and next controls.

## Installation

### HACS (recommended)

1. In Home Assistant, go to **HACS → Frontend → ⋮ → Custom repositories**
2. Add this repository URL and set the category to **Lovelace**
3. Click **Download** on the speaker-card entry
4. Restart Home Assistant

### Manual

1. Copy `speaker-card.js` to your Home Assistant `config/www/` folder.
2. Add the resource in your Lovelace dashboard:
   - **Settings → Dashboards → Resources → Add Resource**
   - URL: `/local/speaker-card.js`
   - Type: `JavaScript module`

## Configuration

`entity` is required.

| Option | Type | Default | Description |
|---|---|---|---|
| `entity` | string | — | A `media_player.*` entity ID |
| `title` | string | entity name | Card title / speaker name |
| `background` | string | `var(--card-background-color)` | Card background color |
| `interactions` | list | — | Tap/hold/double-tap actions (see below) |

## Interactions

Attach actions to `tap`, `hold` (500 ms), or `double_tap` events by adding an `interactions` list. Clicks on the built-in playback controls (play/pause, previous, next) are excluded from card-level interaction handling so they continue to work normally.

```yaml
interactions:
  - trigger: tap        # tap | hold | double_tap  (default: tap)
    action: more-info   # see action reference below
```

| Action | Extra fields | Description |
|---|---|---|
| `more-info` | `entity` (optional) | Open the HA more-info dialog. Defaults to the card's entity. |
| `toggle` | `entity` (optional) | Toggle the entity. |
| `call-service` | `service`, `service_data` | Call any HA service. `service` is `domain.service` format. |
| `navigate` | `path` | Navigate to a Lovelace path. |
| `url` | `url`, `target` | Open a URL. `target` defaults to `_blank`. |
| `none` | — | Explicit no-op. |

## Examples

**Basic:**
```yaml
type: custom:daires-hass-cards-speaker-card
entity: media_player.kitchen
```

**With name override:**
```yaml
type: custom:daires-hass-cards-speaker-card
entity: media_player.kitchen
title: Sonos — Kitchen
```

**Tap for more-info, hold to navigate:**
```yaml
type: custom:daires-hass-cards-speaker-card
entity: media_player.kitchen
interactions:
  - trigger: tap
    action: more-info
  - trigger: hold
    action: navigate
    path: /lovelace/media
```

## Demo

Open `demo.html` in a browser to preview the card without Home Assistant.
