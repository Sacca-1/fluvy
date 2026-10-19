import { css } from 'lit';

/**
 * What the card adds to the approved sheet (`packages/ui/styles/calendar.css`): the fluid geometry
 * (the sheet is drawn at 360), the selection the sheet has no frame for, the tones its five
 * calendars never needed, and the one-liners and skeleton of the states it does not show (loading, and out of reach,
 * where the rows hold still).
 */
export const calendarStyles = css`
  /* the sheet fixes 360; a dashboard column decides here */
  .cd-card {
    width: 100%;
  }

  /* ---------- seven columns, fluid ----------
     The card computes the tracks: 7 × 44 on a 46 pitch at the sheet's 320, wider gaps in a wider
     column, narrower days in a narrower one — every edge on a whole pixel. */
  .cd-card {
    --fv-tracks: var(--cd-tracks, repeat(7, 44px));
    --fv-justify: start;
  }

  .fv-dow > span {
    width: var(--cd-cell, 44px);
  }

  /* A day is always a 44 target. Where seven of them do not fit (under 320), the targets overlap by a
     few px, centred on their columns, and the plate is drawn at the column's width instead. */
  .fv-day {
    --fv-day-inset: 0 calc((44px - var(--cd-cell, 44px)) / 2);
    margin-left: calc((var(--cd-cell, 44px) - 44px) / 2);
  }

  /* ---------- event rows ---------- */
  .cd-event__time {
    flex-basis: var(--cd-time, 40px);
    width: var(--cd-time, 40px);
  }

  .cd-event,
  .cd-up {
    border-radius: var(--fluvy-radius-control);
  }

  /* when, whole, then where: a name */
  .cd-up__sub {
    display: flex;
  }

  .cd-up__sub > :first-child {
    flex: none;
    white-space: pre;
  }

  .cd-up__sub > [data-name] {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ---------- timeline ---------- */
  button.cd-block {
    cursor: pointer;
    transition: opacity var(--fv-base) var(--fv-ease);
  }

  button.cd-block:active {
    opacity: 0.72;
  }

  .cd-block--abuts {
    box-shadow: inset 0 -1px 0 var(--fluvy-card);
  }

  /* ---------- tiles ---------- */
  .cd-tile {
    display: block;
    height: 168px;
    text-align: left;
  }

  /* a state in words ("Aucun événement", "7 prochains jours") takes a second line rather than lose its end: the 168
     tile keeps one line free under its meta for it */
  .cd-tile .fv-tile__state:not(.cd-tile__meta) {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    white-space: normal;
  }

  /* a month's abbreviation too long to stand 8 from its day in a narrow tile ("17 Sept") stands one step closer */
  .cd-tile__date--tight {
    gap: 4px;
  }

  /* a tile whose calendars are out of reach is the live one in the off skin: its name keeps its place under the head */
  .cd-tile.fv-tile--off > .fv-tile__name {
    margin-top: 12px;
  }

  /* ---------- one quiet line instead of an empty box (a sentence: it wraps) ---------- */
  .cd-note {
    margin-top: 16px;
    font-size: 13px;
    font-weight: 500;
    line-height: 20px;
    color: var(--fluvy-text-secondary);
  }

  .cd-note--tight {
    margin-top: 8px;
  }

  .cd-note--off {
    color: var(--fluvy-unavailable);
  }

  /* ---------- loading: the event row's anatomy, without the words ---------- */
  .cd-sk {
    display: block;
  }

  .cd-sk--time {
    align-self: flex-end;
    width: 32px;
    height: 12px;
  }

  .cd-sk--bar {
    background: var(--fluvy-page);
  }

  .cd-sk--title {
    width: 120px;
    height: 16px;
  }

  .cd-sk--sub {
    width: 80px;
    height: 12px;
    margin-top: 8px;
  }

  /* out of reach, the rows hold still, drawn on the page's fill (1.9: a card keeps its size) */
  .is-off .fv-skeleton,
  .is-off .cd-sk--bar {
    animation: none;
    background: var(--fluvy-border);
  }

  /* in a tile each bar sits in its own 20 px line */
  .cd-tile .cd-sk {
    height: 12px;
    margin: 4px 0;
  }

  .cd-tile .cd-sk--title {
    width: 96px;
    max-width: 100%;
  }

  .cd-tile .cd-sk--sub {
    width: 64px;
  }
`;
