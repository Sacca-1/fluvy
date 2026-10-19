import type { HomeAssistant } from '@fluvy/core';
import { appliancesView } from './appliances.js';
import { buildContext, framed, withCards } from './context.js';
import { roomView } from './rooms.js';
import { HOME_TEMPLATE, templateOf, viewsOf, type Template } from './templates.js';
import type { FluvyStrategyConfig, View } from './types.js';

/** An automatic dashboard: the template its type names, built from the house. Fetched when a dashboard asks. */
export async function generate(
  config: FluvyStrategyConfig,
  hass: HomeAssistant,
): Promise<{ views: View[] }> {
  return generateWith(templateOf(config.type) ?? HOME_TEMPLATE, config, hass);
}

/**
 * A template's dashboard: its views built from the house (the first always, the others when the house has what
 * they show and the configuration keeps them), each framed; then a subview per room the template opens, and the one
 * of every appliance its Home leads to.
 */
export async function generateWith(
  template: Template,
  config: FluvyStrategyConfig,
  hass: HomeAssistant,
  base?: string,
): Promise<{ views: View[] }> {
  const built = await buildContext(config, hass, base);
  // a template without the greeting opens its columns with nothing
  const ctx = template.header === 'hello' ? built : { ...built, header: 0 };
  const hidden = new Set(config.hide ?? []);
  const views = viewsOf(template, ctx)
    .filter((spec, index) => index === 0 || !hidden.has(spec.key))
    .map((spec) => ({ spec, sections: withCards(spec.build(ctx)) }))
    .filter(
      ({ spec, sections }, index) =>
        index === 0 || (spec.when ? spec.when(ctx) : sections.length > 0),
    )
    .map(({ spec, sections }): View => ({
      title: spec.name ?? ctx.t(spec.title),
      icon: spec.icon,
      path: spec.key,
      type: 'sections',
      max_columns: template.columns,
      sections,
    }));
  const framedViews = views.map((view) => framed(view, ctx, views, template));
  // a subview per room: reached from a room's card (never a tab), with the same frame
  const rooms = (
    template.rooms?.(
      ctx,
      views.map((view) => view.path),
    ) ?? []
  ).map(({ area, back }) =>
    framed(roomView(ctx, area, template.columns, back), ctx, views, template),
  );
  const appliances =
    template.appliances && ctx.home.applianceDevices.length
      ? [framed(appliancesView(ctx, template.columns), ctx, views, template)]
      : [];
  return { views: [...framedViews, ...rooms, ...appliances] };
}
