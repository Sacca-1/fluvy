# Sensor band card (Homelab fork)

This fork adds `custom:fluvy-sensor-band-card` to Fluvy 1.9.0. It uses the native
Fluvy ruler, readout, header and palette tones. Values come directly from the
entity, in its displayed unit. There is no history query or averaging.

```yaml
type: custom:fluvy-sensor-band-card
entity: sensor.room_co2
name: CO₂
min: 400
max: 2000
bands:
  - { from: 400, to: 800, tone: presence }
  - { from: 800, to: 1200, tone: warning }
  - { from: 1200, to: 2000, tone: danger }
references:
  - { value: 800 }
  - { value: 1200, label: '1200' }
```

`min` and `max` default to 0 and 100. `bands` and `references` are optional arrays,
also editable as objects in the visual editor. Bands must be ordered, must not
overlap, and must lie inside the scale. Gaps and negative scales are supported.
Reference captions default to the formatted numeric value. All references remain
visible in narrow columns, with crowded captions placed on additional lines.
The current reading retains its actual value outside the scale; its marker stops
at the nearest end. Missing, unavailable and nonnumeric entities show a dash and
no marker. The ruler is read-only and does not call services.

An averaging-period guideline can be shown as a reference alongside an instant
reading, but the caption should name its averaging period (for example
`24h ref. 15` for PM2.5). That comparison does not make an instant reading a daily
exposure measurement. Configure references for your sensor and use case.

Existing `name`, `subtitle`, `icon`, `show_icon`, `tone`, `color`, `card_color`,
`tap_action` and `hold_action` options follow the normal Fluvy card contract.
`label` optionally supplies a small caption above the reading. Colours adapt to
Fluvy's palette and light/dark appearance. No additional custom card is required.
