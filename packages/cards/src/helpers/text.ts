import { numberAttr, stateText, type EntityView } from '@fluvy/core';
import { glyph, type GlyphName } from '@fluvy/ui';
import { html, noChange, nothing, type TemplateResult } from 'lit';
import { live } from 'lit/directives/live.js';
import {
  field,
  fieldContext,
  isUnusable,
  nameOf,
  type HelperHost,
  type HelperRowConfig,
} from './context.js';

export interface TextFieldOptions {
  /** Marks the input so the card can tell which field has the focus. */
  readonly id: string;
  /** The value to show while the field is not being edited. */
  readonly value: string;
  readonly label: string;
  readonly placeholder?: string;
  readonly password?: boolean;
  readonly minLength?: number | null;
  readonly maxLength?: number | null;
  readonly pattern?: string | null;
  readonly disabled?: boolean;
  readonly glyph?: GlyphName;
  /** The field has the focus: what is in it is the user's, a state change must not overwrite it. */
  readonly editing: boolean;
  /**
   * `leave`: Enter leaves the field and leaving it commits (a helper's value).
   * `enter`: Enter commits and the field stays for the next entry; leaving it does nothing (a composer).
   */
  readonly commitOn: 'leave' | 'enter';
  /** A valid value was committed. */
  readonly onCommit: (value: string, input: HTMLInputElement) => void;
  /** Escape. */
  readonly onCancel?: () => void;
  /** The field lost the focus (after any commit): time to draw the state again. */
  readonly onLeave?: () => void;
}

/** Fields left with Escape: the blur that follows must not commit them. */
const cancelled = new WeakSet<HTMLInputElement>();

/**
 * The language's text field (`.fv-field`: 44, radius 12, page fill, trailing glyph) as a real `<input>`.
 * Keys typed in it never leave the card: Home Assistant binds single-letter shortcuts on the window
 * (e = entities, c = commands, m = assist…) and cannot see that the focus is inside a shadow root.
 */
export function textField(o: TextFieldOptions): TemplateResult {
  const commit = (input: HTMLInputElement): void => {
    if (input.checkValidity()) o.onCommit(input.value, input);
  };
  const onKeydown = (event: KeyboardEvent): void => {
    event.stopPropagation();
    if (event.isComposing) return; // an IME's Enter confirms the composition, not the field
    const input = event.currentTarget as HTMLInputElement;
    if (event.key === 'Enter') {
      event.preventDefault();
      if (o.commitOn === 'enter') commit(input);
      else input.blur();
    } else if (event.key === 'Escape') {
      cancelled.add(input);
      input.blur();
      o.onCancel?.();
    }
  };
  const onBlur = (event: FocusEvent): void => {
    const input = event.currentTarget as HTMLInputElement;
    const discard = cancelled.delete(input);
    if (!discard && o.commitOn === 'leave') commit(input);
    o.onLeave?.();
  };
  return html`<div class="fv-field in-text ${o.disabled ? 'is-unavailable' : ''}" data-control>
    <input
      class="fv-field__input"
      data-field=${o.id}
      type=${o.password ? 'password' : 'text'}
      .value=${o.editing ? noChange : live(o.value)}
      aria-label=${o.label}
      placeholder=${o.placeholder ?? nothing}
      minlength=${o.minLength ?? nothing}
      maxlength=${o.maxLength ?? nothing}
      pattern=${o.pattern || nothing}
      autocomplete="off"
      autocapitalize=${o.password ? 'off' : nothing}
      spellcheck=${o.password ? 'false' : nothing}
      enterkeyhint="done"
      ?disabled=${o.disabled ?? false}
      @keydown=${onKeydown}
      @blur=${onBlur}
    />
    ${glyph(o.glyph ?? (o.password ? 'lock' : 'text'))}
  </div>`;
}

/** `input_text` / `text`: the label, then the field. Committed on Enter or on leaving it; Escape puts the state back. */
export function textBlocks(
  host: HelperHost,
  view: EntityView,
  row: HelperRowConfig,
): TemplateResult[] {
  const unusable = isUnusable(view);
  const name = nameOf(view, row);
  const state = host.state(view);
  const value = view.status === 'ok' ? state : '';
  const min = numberAttr(view, 'min');
  return [
    field(name, fieldContext(host, view, row), nothing, unusable),
    textField({
      id: view.id,
      value,
      label: name,
      // an empty field out of reach says why
      ...(view.status === 'ok' ? {} : { placeholder: stateText(host.hass, view) }),
      password: view.attr<string>('mode') === 'password',
      minLength: min !== null && min > 0 ? min : null,
      maxLength: numberAttr(view, 'max'),
      pattern: view.attr<string | null>('pattern') ?? null,
      disabled: unusable,
      editing: host.editing(view.id),
      commitOn: 'leave',
      onCommit: (next) => {
        if (next === value) return;
        host.expect(view.id, next);
        host.call(view.domain, 'set_value', { value: next }, view.id);
      },
      onLeave: () => host.refresh(),
    }),
  ];
}
