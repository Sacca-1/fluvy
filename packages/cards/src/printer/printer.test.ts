import { describe, expect, it } from 'vitest';
import type { HomeAssistant } from '@fluvy/core';
import { entry, PRINTER_HOUSE } from './fixtures.js';
import { printerDevice, printerDevices, printerEntities, printerTrays, roleOf } from './roles.js';
import { busy, printerPhase } from './state.js';

const hass = PRINTER_HOUSE;

describe('a printer’s entities', () => {
  it('finds OctoPrint’s by their ids where it names them without a key, and never its system buttons', () => {
    const found = printerEntities(hass, 'd-octo');
    expect(found).toMatchObject({
      status: 'sensor.octoprint_current_state',
      progress: 'sensor.octoprint_job_percentage',
      finish: 'sensor.octoprint_estimated_finish_time',
      nozzle: 'sensor.octoprint_actual_tool0_temp',
      nozzle_target: 'sensor.octoprint_target_tool0_temp',
      bed: 'sensor.octoprint_actual_bed_temp',
      bed_target: 'sensor.octoprint_target_bed_temp',
      file: 'sensor.octoprint_current_file',
      printing: 'binary_sensor.octoprint_printing',
      camera: 'camera.octoprint_camera',
      pause: 'button.octoprint_pause_job',
      resume: 'button.octoprint_resume_job',
      stop: 'button.octoprint_stop_job',
    });
    expect(Object.values(found)).not.toContain('button.octoprint_shutdown_system');
    expect(Object.values(found)).not.toContain('button.octoprint_restart_octoprint');
  });

  it('finds PrusaLink’s, Bambu Lab’s and Moonraker’s by their translation keys', () => {
    expect(printerEntities(hass, 'd-prusa')).toMatchObject({
      status: 'sensor.mk4',
      progress: 'sensor.mk4_progress',
      finish: 'sensor.mk4_print_finish',
      nozzle: 'sensor.mk4_nozzle_temperature',
      preview: 'camera.mk4_preview',
      stop: 'button.mk4_cancel_job',
    });
    expect(printerEntities(hass, 'd-bambu')).toMatchObject({
      status: 'sensor.p1s_print_status',
      remaining: 'sensor.p1s_remaining_time',
      layer: 'sensor.p1s_current_layer',
      layers: 'sensor.p1s_total_layer_count',
      preview: 'image.p1s_cover_image',
      camera: 'camera.p1s_camera',
      light: 'light.p1s_chamber_light',
    });
    const voron = printerEntities(hass, 'd-voron');
    expect(voron).toMatchObject({
      status: 'sensor.voron_current_print_state',
      stop: 'button.voron_cancel_print',
    });
    expect(Object.values(voron)).not.toContain('button.voron_emergency_stop');
  });

  it('reads the device off any of its entities, and a role named by hand wins', () => {
    expect(printerDevice(hass, undefined, 'sensor.p1s_print_progress')).toBe('d-bambu');
    expect(
      printerEntities(hass, 'd-bambu', [{ role: 'chamber', entity: 'sensor.enclosure' }]).chamber,
    ).toBe('sensor.enclosure');
    expect(
      printerEntities(hass, 'd-bambu', [{ role: 'nonsense', entity: 'sensor.x' }]),
    ).not.toHaveProperty('nonsense');
  });

  it('takes the entity it is given as the status when nothing else is known of it', () => {
    expect(printerEntities(hass, undefined, [], 'sensor.my_printer_state').status).toBe(
      'sensor.my_printer_state',
    );
  });

  it('finds Bambu Lab’s stage, error and filament, Moonraker’s time printed, and the AMS’s trays in order', () => {
    const bambu = printerEntities(hass, 'd-bambu');
    expect(bambu.stage).toBe('sensor.p1s_current_stage');
    expect(bambu.error).toBe('binary_sensor.p1s_print_error');
    expect(bambu.filament).toBe('sensor.p1s_active_tray');
    expect(printerEntities(hass, 'd-voron').elapsed).toBe('sensor.voron_print_duration');
    // the trays of the unit reached through the printer, never its humidity
    expect(printerTrays(hass, 'd-bambu')).toEqual([
      'sensor.p1s_ams_tray_1',
      'sensor.p1s_ams_tray_2',
    ]);
    expect(printerTrays(hass, 'd-prusa')).toEqual([]);
  });

  it('finds Creality’s by its keys — the targets as numbers, the light, the camera and the preview — never its CFS’s own readings, its maxima or its own buttons', () => {
    const k1c = printerEntities(hass, 'd-k1c');
    expect(k1c).toEqual({
      status: 'sensor.k1c_print_status',
      progress: 'sensor.k1c_print_progress',
      remaining: 'sensor.k1c_print_time_left',
      elapsed: 'sensor.k1c_print_job_time',
      layer: 'sensor.k1c_working_layer',
      layers: 'sensor.k1c_total_layers',
      nozzle: 'sensor.k1c_nozzle_temperature',
      nozzle_target: 'number.k1c_nozzle_target',
      bed: 'sensor.k1c_bed_temperature',
      bed_target: 'number.k1c_bed_target',
      chamber: 'sensor.k1c_chamber_temperature',
      speed: 'sensor.k1c_print_speed',
      filament: 'sensor.k1c_active_filament_slot',
      pause: 'button.k1c_pause_print',
      resume: 'button.k1c_resume_print',
      stop: 'button.k1c_stop_print',
      light: 'light.k1c_light',
      camera: 'camera.k1c_printer_camera',
      preview: 'image.k1c_current_print_preview',
    });
  });

  it('finds Elegoo’s by the ends of its ids — milliseconds, a box, a colour — its error by its key, its speed as the sensor over the select, never its stage or the Canvas', () => {
    expect(printerEntities(hass, 'd-elegoo')).toEqual({
      status: 'sensor.centauri_carbon_print_status',
      error: 'sensor.centauri_carbon_print_error',
      progress: 'sensor.centauri_carbon_percent_complete',
      remaining: 'sensor.centauri_carbon_remaining_print_time',
      elapsed: 'sensor.centauri_carbon_current_print_time',
      start: 'sensor.centauri_carbon_begin_time',
      finish: 'sensor.centauri_carbon_end_time',
      file: 'sensor.centauri_carbon_file_name',
      layer: 'sensor.centauri_carbon_current_layer',
      layers: 'sensor.centauri_carbon_total_layers',
      nozzle: 'sensor.centauri_carbon_nozzle_temp',
      nozzle_target: 'sensor.centauri_carbon_target_nozzle_temp',
      bed: 'sensor.centauri_carbon_bed_temp',
      bed_target: 'sensor.centauri_carbon_target_bed_temp',
      chamber: 'sensor.centauri_carbon_box_temp',
      filament: 'sensor.centauri_carbon_active_filament_color',
      speed: 'sensor.centauri_carbon_print_speed',
      pause: 'button.centauri_carbon_pause_print',
      resume: 'button.centauri_carbon_resume_print',
      stop: 'button.centauri_carbon_stop_print',
      light: 'light.centauri_carbon_chamber_light',
      preview: 'image.centauri_carbon_cover_image',
      camera: 'camera.centauri_carbon_camera',
    });
  });

  it('finds Anycubic’s by the shared keys and its own, never its ACE’s own readings, its pause or its top view; its trays are the ACE’s slots, then the spool outside', () => {
    expect(printerEntities(hass, 'd-kobra')).toEqual({
      status: 'sensor.kobra_s1_status',
      progress: 'sensor.kobra_s1_progress',
      remaining: 'sensor.kobra_s1_time_remaining',
      file: 'sensor.kobra_s1_file_name',
      layer: 'sensor.kobra_s1_current_layer',
      layers: 'sensor.kobra_s1_total_layers',
      nozzle: 'sensor.kobra_s1_nozzle_temperature',
      bed: 'sensor.kobra_s1_bed_temperature',
      chamber: 'sensor.kobra_s1_chamber_temperature',
      nozzle_target: 'number.kobra_s1_nozzle_target_temperature',
      bed_target: 'number.kobra_s1_bed_target_temperature',
      printing: 'binary_sensor.kobra_s1_printing',
      pause: 'button.kobra_s1_pause',
      resume: 'button.kobra_s1_resume',
      stop: 'button.kobra_s1_stop',
      camera: 'camera.kobra_s1_camera',
      light: 'light.kobra_s1_chamber_light',
      preview: 'image.kobra_s1_object_thumbnail',
      speed: 'select.kobra_s1_print_speed',
    });
    expect(printerTrays(hass, 'd-kobra')).toEqual([
      'sensor.ace_pro_slot_1',
      'sensor.ace_pro_slot_2',
      'sensor.ace_pro_slot_3',
      'sensor.ace_pro_slot_4',
      'sensor.kobra_s1_external_spool',
    ]);
    expect(printerEntities(hass, 'd-ace')).toEqual({});
  });

  it('finds the Snapmaker U1’s by its keys — its targets as sensors, its work light, its webcam — never its setpoints, its emergency stop or Klipper’s own words', () => {
    expect(printerEntities(hass, 'd-u1')).toEqual({
      status: 'sensor.snapmaker_u1_print_state',
      progress: 'sensor.snapmaker_u1_print_progress',
      remaining: 'sensor.snapmaker_u1_time_remaining',
      finish: 'sensor.snapmaker_u1_print_eta',
      elapsed: 'sensor.snapmaker_u1_print_duration',
      file: 'sensor.snapmaker_u1_filename',
      layer: 'sensor.snapmaker_u1_current_layer',
      layers: 'sensor.snapmaker_u1_total_layers',
      nozzle: 'sensor.snapmaker_u1_nozzle_temperature',
      nozzle_target: 'sensor.snapmaker_u1_nozzle_target',
      bed: 'sensor.snapmaker_u1_bed_temperature',
      bed_target: 'sensor.snapmaker_u1_bed_target',
      chamber: 'sensor.snapmaker_u1_chamber_temperature',
      speed: 'sensor.snapmaker_u1_speed_factor',
      printing: 'binary_sensor.snapmaker_u1_is_printing',
      error: 'binary_sensor.snapmaker_u1_has_error',
      pause: 'button.snapmaker_u1_pause_print',
      resume: 'button.snapmaker_u1_resume_print',
      stop: 'button.snapmaker_u1_cancel_print',
      light: 'switch.snapmaker_u1_work_light',
      camera: 'camera.snapmaker_u1_webcam',
    });
  });

  it('finds the older Snapmaker’s by its fixed names — its first nozzle of two, never its estimate — and nothing to press', () => {
    expect(printerEntities(hass, 'd-a350')).toEqual({
      status: 'sensor.snapmaker_a350_status',
      elapsed: 'sensor.snapmaker_a350_elapsed_time',
      remaining: 'sensor.snapmaker_a350_remaining_time',
      file: 'sensor.snapmaker_a350_file_name',
      progress: 'sensor.snapmaker_a350_progress',
      nozzle: 'sensor.snapmaker_a350_nozzle_1_temperature',
      nozzle_target: 'sensor.snapmaker_a350_nozzle_1_target_temperature',
      bed: 'sensor.snapmaker_a350_bed_temperature',
      bed_target: 'sensor.snapmaker_a350_bed_target_temperature',
    });
  });

  it('finds FlashForge’s by its keys — the job’s thumbnail over an IFS slot’s picture listed first, its LED, its error code — never its camera switch, its flags or its lifetime figures', () => {
    expect(printerEntities(hass, 'd-ad5m')).toEqual({
      status: 'sensor.adventurer_5m_machine_status',
      progress: 'sensor.adventurer_5m_print_progress',
      file: 'sensor.adventurer_5m_current_file',
      preview: 'image.adventurer_5m_current_file_thumbnail',
      layer: 'sensor.adventurer_5m_current_layer',
      layers: 'sensor.adventurer_5m_total_layers',
      elapsed: 'sensor.adventurer_5m_elapsed_time',
      remaining: 'sensor.adventurer_5m_remaining_time',
      finish: 'sensor.adventurer_5m_print_completion_time',
      nozzle: 'sensor.adventurer_5m_nozzle_temperature',
      nozzle_target: 'sensor.adventurer_5m_nozzle_target_temperature',
      bed: 'sensor.adventurer_5m_bed_temperature',
      bed_target: 'sensor.adventurer_5m_bed_target_temperature',
      chamber: 'sensor.adventurer_5m_chamber_temperature',
      speed: 'sensor.adventurer_5m_print_speed',
      filament: 'sensor.adventurer_5m_filament_type',
      error: 'sensor.adventurer_5m_error_code',
      printing: 'binary_sensor.adventurer_5m_is_printing',
      pause: 'button.adventurer_5m_pause_print',
      resume: 'button.adventurer_5m_resume_print',
      stop: 'button.adventurer_5m_cancel_print',
      light: 'switch.adventurer_5m_led',
    });
  });

  it('lists the CFS’s trays in their number, the external filament last', () => {
    expect(printerTrays(hass, 'd-k1c')).toEqual([
      'sensor.k1c_cfs_box_1_slot_1_filament',
      'sensor.k1c_cfs_box_1_slot_2_filament',
      'sensor.k1c_cfs_box_1_slot_3_filament',
      'sensor.k1c_cfs_box_1_slot_4_filament',
      'sensor.k1c_cfs_external_filament',
    ]);
    // the spool outside the unit comes last whatever its id
    const spool = {
      entities: Object.fromEntries(
        [
          entry('sensor.a_external_spool', 'd-x', 'bambu_lab', 'external_spool'),
          entry('sensor.b_tray_10', 'd-x', 'bambu_lab', 'tray_10'),
          entry('sensor.b_tray_2', 'd-x', 'bambu_lab', 'tray_2'),
        ].map((e) => [e.entity_id, e]),
      ),
      devices: {},
    } as unknown as HomeAssistant;
    expect(printerTrays(spool, 'd-x')).toEqual([
      'sensor.b_tray_2',
      'sensor.b_tray_10',
      'sensor.a_external_spool',
    ]);
  });

  it('gives a role to the entity known most surely to play it: a print status over a wifi status, whichever is listed first', () => {
    expect(printerEntities(hass, 'd-bambu').status).toBe('sensor.p1s_print_status');
    expect(printerEntities(hass, 'd-fork').status).toBe('sensor.fork_print_status');
    // on an integration the card knows, a loose "…_status" is never the status
    const alone = {
      entities: { 'sensor.p1s_wifi_status': entry('sensor.p1s_wifi_status', 'd-x', 'bambu_lab') },
    } as unknown as HomeAssistant;
    expect(printerEntities(alone, 'd-x')).toEqual({});
  });

  it('reads an unknown integration leniently for the card and strictly for the house', () => {
    const loose = { id: 'sensor.thing_status', domain: 'sensor', key: undefined, platform: 'x' };
    expect(roleOf(loose)).toBe('status');
    expect(roleOf(loose, 'strict')).toBeUndefined();
    expect(roleOf({ ...loose, platform: 'bambu_lab' })).toBeUndefined();
    const shared = { ...loose, id: 'sensor.thing_print_status', key: 'print_status' };
    expect(roleOf(shared, 'strict')).toBe('status');
    // an integration's own word for nothing wins over any end of an id
    expect(
      roleOf({
        id: 'sensor.k1c_max_nozzle_temperature',
        domain: 'sensor',
        key: 'max_nozzle_temp',
        platform: 'ha_creality_ws',
      }),
    ).toBeUndefined();
    expect(
      roleOf({
        id: 'sensor.k1c_max_nozzle_temperature',
        domain: 'sensor',
        key: 'max_nozzle_temp',
        platform: 'x',
      }),
    ).toBe('nozzle');
  });

  it('lists the house’s printers: the devices of the integrations it knows with a job, and any other with a printer’s signature — never a unit, a washer, a vacuum or a bed', () => {
    expect(printerDevices(hass).sort()).toEqual([
      'd-a350',
      'd-ad5m',
      'd-bambu',
      'd-elegoo',
      'd-fork',
      'd-k1c',
      'd-kobra',
      'd-octo',
      'd-prusa',
      'd-u1',
      'd-voron',
    ]);
  });

  it('never takes a system button for a role', () => {
    expect(
      roleOf({ id: 'button.x_reboot_system', domain: 'button', key: undefined }),
    ).toBeUndefined();
  });
});

describe('what a printer is doing', () => {
  it('folds every integration’s states into the card’s phases', () => {
    expect(printerPhase('printing')).toBe('printing');
    expect(printerPhase('running')).toBe('printing');
    expect(printerPhase('printing_sd')).toBe('printing');
    expect(printerPhase('prepare')).toBe('preparing');
    expect(printerPhase('pause')).toBe('paused');
    expect(printerPhase('finish')).toBe('finished');
    expect(printerPhase('complete')).toBe('finished');
    expect(printerPhase('cancelled')).toBe('stopped');
    expect(printerPhase('failed')).toBe('error');
    expect(printerPhase('offline_after_error')).toBe('error');
    expect(printerPhase('operational')).toBe('idle');
    expect(printerPhase('standby')).toBe('idle');
    expect(printerPhase('unavailable')).toBe('offline');
    expect(printerPhase(undefined, true)).toBe('printing');
    expect(busy('paused')).toBe(true);
    expect(busy('finished')).toBe(false);
  });

  it('folds the newer integrations’ states too: Elegoo’s tests and loading, Creality’s stopping and off, the U1’s and FlashForge’s completed', () => {
    for (const state of ['processing', 'printing_recovery', 'dropping', 'lifting'])
      expect(printerPhase(state), state).toBe('printing');
    for (const state of [
      'self_testing',
      'homing',
      'homing_completed',
      'leveling',
      'auto_leveling_completed',
      'preheating',
      'preheating_completed',
      'heating',
      'calibrating',
      'file_checking',
      'printers_checking',
      'devices_testing',
      'exposure_testing',
      'resonance_testing',
      'resonance_testing_completed',
      'input_shaping',
      'pid_tuning',
      'file_transferring',
      'loading',
      'loading_unloading',
      'auto_feeding',
      'filament_unloading',
      'print_started',
      'recovery',
    ])
      expect(printerPhase(state), state).toBe('preparing');
    expect(printerPhase('filament_unload_paused')).toBe('paused');
    expect(printerPhase('completed')).toBe('finished');
    expect(printerPhase('stopping')).toBe('stopped');
    expect(printerPhase('filament_unload_abnormal')).toBe('error');
    expect(printerPhase('off')).toBe('offline');
    for (const state of ['unknown', 'unrecognized', 'standby', 'ready', 'free'])
      expect(printerPhase(state), state).toBe('idle');
  });
});
