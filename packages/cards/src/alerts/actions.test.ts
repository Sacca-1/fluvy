import { describe, expect, it } from 'vitest';
import { bindAction } from './actions.js';

const matched = ['lock.front', 'lock.back'];

describe('an alert’s action, bound', () => {
  it('turns `matched` and `row` into ids, as a target or inside one', () => {
    expect(
      bindAction(
        { action: 'perform-action', perform_action: 'lock.lock', target: 'matched' },
        { matched },
      ),
    ).toEqual({
      action: 'perform-action',
      perform_action: 'lock.lock',
      target: { entity_id: matched },
    });
    expect(
      bindAction(
        {
          action: 'perform-action',
          perform_action: 'light.turn_off',
          target: { entity_id: ['matched', 'light.porch'], area_id: 'hall' },
        },
        { matched: ['light.a', 'light.porch'] },
      ),
    ).toEqual({
      action: 'perform-action',
      perform_action: 'light.turn_off',
      target: { entity_id: ['light.a', 'light.porch'], area_id: 'hall' },
    });
    expect(
      bindAction({ action: 'more-info', entity: 'row' }, { matched, row: 'lock.back' }),
    ).toEqual({
      action: 'more-info',
      entity: 'lock.back',
    });
  });

  it('leaves an action that names neither as it is', () => {
    const navigate = { action: 'navigate' as const, navigation_path: '/config/repairs' };
    expect(bindAction(navigate, { matched })).toEqual(navigate);
    const fixed = {
      action: 'perform-action' as const,
      perform_action: 'script.night',
      target: { entity_id: 'script.night' },
    };
    expect(bindAction(fixed, { matched })).toEqual(fixed);
  });

  it('is nothing to run when it names a row there is not, or every match of none', () => {
    expect(
      bindAction(
        { action: 'perform-action', perform_action: 'lock.lock', target: 'row' },
        { matched },
      ),
    ).toBeUndefined();
    expect(
      bindAction(
        { action: 'perform-action', perform_action: 'lock.lock', target: 'matched' },
        { matched: [] },
      ),
    ).toBeUndefined();
    expect(bindAction({ action: 'more-info', entity: 'row' }, { matched })).toBeUndefined();
  });
});
