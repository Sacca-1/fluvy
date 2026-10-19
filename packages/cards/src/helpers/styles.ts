import { css } from 'lit';

/**
 * Fluid overrides the inputs cards share. The sheet is drawn at one width (a 320 column) with names that
 * fit it; a dashboard column is 260 to 480 wide and a name is whatever its owner typed. Nothing here
 * changes the sheet's geometry at its own width and content.
 */
export const rowStyles = css`
  /* a row keeps its 60; a name too long for the column takes a second line instead of losing its end.
     A row that grows keeps its circle, control and value centred on the whole text block (language rule) */
  .fv-row {
    align-items: center;
    height: auto;
    min-height: 60px;
    padding: 8px 0;
  }

  /* a long state ("Above horizon") or a long value shares the row instead of squeezing the name out of it:
     the name keeps a third of the row, the trailing element what is left after the circle and the gaps (68),
     and a state made of words takes a second line, right-aligned, before it would leave the card */
  .fv-row__text {
    flex-shrink: 1000; /* the name and its context give way first (they may wrap); the state wraps only once they are down to their third */
    min-width: 32%;
  }

  /* …but a figure, a state of one word or an action's word has no second line to take: beside one, the name gives way
     further (two lines, then an ellipsis, as names may) rather than push it out of the row */
  .fv-row:has(
      > .fv-row__value:not(.fv-row__value--words, .fv-row__value--text),
      > .in-value--action
    )
    > .fv-row__text {
    min-width: 0;
  }

  .fv-row__value {
    flex: 0 0 auto;
    min-width: 0;
    text-align: right;
    white-space: nowrap; /* a figure never wraps: the name and its context give way (they may take a second line) */
  }

  /* …and once they are down to their third, a state in words wraps between its words, right-aligned */
  .fv-row__value.fv-row__value--words {
    flex: 0 1 auto;
    min-width: auto;
    white-space: normal;
  }

  /* at its words, never inside one: the rows' rule leaves a name its 96 (or the whole name) beside what ends it */
  .fv-row__title,
  .fv-row__sub {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    white-space: normal;
  }

  .fv-row__sub {
    -webkit-line-clamp: 3;
  }

  /* where even without its circle a row's button would leave the name under its room, the button goes under the name,
     at the words' start, as wide as its words */
  .fv-row--stack {
    flex-wrap: wrap;
    row-gap: 8px;
  }

  .fv-row--stack > .fv-row__text {
    flex-basis: 100%;
  }

  .fv-row--bare.fv-row--stack > .in-value {
    max-width: 100%;
  }

  /* an editable value wears the link-button shape; a very long one gives way to the name, never the reverse — its
     cap on the 4 grid, so a capped button keeps whole pixels */
  .in-value {
    max-width: round(down, calc(68% - 68px), 4px);
  }

  /* a row that gave its circle to its name gives the button the circle's room too */
  .fv-row--bare > .in-value:not(.in-value--action) {
    max-width: round(down, calc(68% - 12px), 4px);
  }

  /* an action's word ("Install", "Run") is never cut: its button keeps its measured width, uncapped */
  .in-value--action {
    flex: none;
    max-width: none;
  }

  .in-value__text {
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }
`;
