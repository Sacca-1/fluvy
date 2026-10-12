import { describe, expect, it } from 'vitest';
import type { HomeAssistant } from '@fluvy/core';
import { printerDevice, printerDevices, printerEntities, printerTrays, roleOf } from './roles.js';
import {
  busy,
  clockSeconds,
  durationSeconds,
  elapsedSeconds,
  finishedAt,
  printerPhase,
  timeLeft,
} from './state.js';

const entry = (
  entity_id: string,
  device_id: string,
  platform: string,
  translation_key?: string,
) => ({
  entity_id,
  device_id,
  platform,
  labels: [],
  ...(translation_key ? { translation_key } : {}),
});

/** A house with one printer of each integration, as their registries name them — and a few things that are not one. */
const hass = {
  entities: Object.fromEntries(
    [
      // OctoPrint: its sensors have no translation key but its status and file
      entry('sensor.octoprint_current_state', 'd-octo', 'octoprint', 'status'),
      entry('sensor.octoprint_job_percentage', 'd-octo', 'octoprint'),
      entry('sensor.octoprint_estimated_finish_time', 'd-octo', 'octoprint'),
      entry('sensor.octoprint_actual_tool0_temp', 'd-octo', 'octoprint'),
      entry('sensor.octoprint_target_tool0_temp', 'd-octo', 'octoprint'),
      entry('sensor.octoprint_actual_bed_temp', 'd-octo', 'octoprint'),
      entry('sensor.octoprint_target_bed_temp', 'd-octo', 'octoprint'),
      entry('sensor.octoprint_current_file', 'd-octo', 'octoprint', 'file_name'),
      entry('binary_sensor.octoprint_printing', 'd-octo', 'octoprint'),
      entry('camera.octoprint_camera', 'd-octo', 'octoprint'),
      entry('button.octoprint_pause_job', 'd-octo', 'octoprint'),
      entry('button.octoprint_resume_job', 'd-octo', 'octoprint'),
      entry('button.octoprint_stop_job', 'd-octo', 'octoprint'),
      entry('button.octoprint_shutdown_system', 'd-octo', 'octoprint'),
      entry('button.octoprint_restart_octoprint', 'd-octo', 'octoprint'),
      // PrusaLink
      entry('sensor.mk4', 'd-prusa', 'prusalink', 'printer_state'),
      entry('sensor.mk4_progress', 'd-prusa', 'prusalink', 'progress'),
      entry('sensor.mk4_print_finish', 'd-prusa', 'prusalink', 'print_finish'),
      entry('sensor.mk4_nozzle_temperature', 'd-prusa', 'prusalink', 'nozzle_temperature'),
      entry('camera.mk4_preview', 'd-prusa', 'prusalink', 'job_preview'),
      entry('button.mk4_cancel_job', 'd-prusa', 'prusalink', 'cancel_job'),
      // Bambu Lab (a wifi status before its print status: never the status)
      entry('sensor.p1s_wifi_status', 'd-bambu', 'bambu_lab'),
      entry('sensor.p1s_print_status', 'd-bambu', 'bambu_lab', 'print_status'),
      entry('sensor.p1s_print_progress', 'd-bambu', 'bambu_lab', 'print_progress'),
      entry('sensor.p1s_remaining_time', 'd-bambu', 'bambu_lab', 'remaining_time'),
      entry('sensor.p1s_current_layer', 'd-bambu', 'bambu_lab', 'current_layer'),
      entry('sensor.p1s_total_layer_count', 'd-bambu', 'bambu_lab', 'total_layers'),
      entry('image.p1s_cover_image', 'd-bambu', 'bambu_lab', 'cover_image'),
      entry('camera.p1s_camera', 'd-bambu', 'bambu_lab', 'camera'),
      entry('light.p1s_chamber_light', 'd-bambu', 'bambu_lab', 'chamber_light'),
      entry('sensor.p1s_current_stage', 'd-bambu', 'bambu_lab', 'stage'),
      entry('binary_sensor.p1s_print_error', 'd-bambu', 'bambu_lab', 'print_error'),
      entry('sensor.p1s_active_tray', 'd-bambu', 'bambu_lab', 'active_tray'),
      // its AMS: a device of its own, reached through the printer
      entry('sensor.p1s_ams_tray_2', 'd-ams', 'bambu_lab', 'tray_2'),
      entry('sensor.p1s_ams_tray_1', 'd-ams', 'bambu_lab', 'tray_1'),
      entry('sensor.p1s_ams_humidity', 'd-ams', 'bambu_lab', 'humidity_index'),
      // Moonraker
      entry('sensor.voron_current_print_state', 'd-voron', 'moonraker', 'current_print_state'),
      entry('sensor.voron_print_eta', 'd-voron', 'moonraker', 'print_eta'),
      entry('button.voron_emergency_stop', 'd-voron', 'moonraker', 'emergency_stop'),
      entry('button.voron_cancel_print', 'd-voron', 'moonraker', 'cancel_print'),
      entry('sensor.voron_print_duration', 'd-voron', 'moonraker', 'print_duration'),
      // Creality (its WebSocket): keyed sensors, numbers for the targets, a CFS on the printer's own device
      entry('sensor.k1c_print_status', 'd-k1c', 'ha_creality_ws', 'print_status'),
      entry('sensor.k1c_print_progress', 'd-k1c', 'ha_creality_ws', 'print_progress'),
      entry('sensor.k1c_print_time_left', 'd-k1c', 'ha_creality_ws', 'print_left_time'),
      entry('sensor.k1c_print_job_time', 'd-k1c', 'ha_creality_ws', 'print_job_time'),
      entry('sensor.k1c_working_layer', 'd-k1c', 'ha_creality_ws', 'current_layer'),
      entry('sensor.k1c_total_layers', 'd-k1c', 'ha_creality_ws', 'total_layers'),
      entry('sensor.k1c_max_nozzle_temperature', 'd-k1c', 'ha_creality_ws', 'max_nozzle_temp'),
      entry('sensor.k1c_nozzle_temperature', 'd-k1c', 'ha_creality_ws', 'nozzle_temperature'),
      entry('sensor.k1c_bed_temperature', 'd-k1c', 'ha_creality_ws', 'bed_temperature'),
      entry('sensor.k1c_chamber_temperature', 'd-k1c', 'ha_creality_ws', 'chamber_temperature'),
      entry('number.k1c_nozzle_target', 'd-k1c', 'ha_creality_ws', 'nozzle_target'),
      entry('number.k1c_bed_target', 'd-k1c', 'ha_creality_ws', 'bed_target'),
      entry('number.k1c_chamber_target', 'd-k1c', 'ha_creality_ws', 'chamber_target'),
      entry('sensor.k1c_print_speed', 'd-k1c', 'ha_creality_ws', 'feedrate_pct'),
      entry('number.k1c_speed_factor', 'd-k1c', 'ha_creality_ws', 'print_tuning_pct'),
      entry('sensor.k1c_active_filament_slot', 'd-k1c', 'ha_creality_ws', 'active_filament_slot'),
      entry('sensor.k1c_filament_status', 'd-k1c', 'ha_creality_ws', 'filament_status'),
      entry('sensor.k1c_current_object', 'd-k1c', 'ha_creality_ws', 'current_object'),
      entry('button.k1c_pause_print', 'd-k1c', 'ha_creality_ws', 'pause_print'),
      entry('button.k1c_resume_print', 'd-k1c', 'ha_creality_ws', 'resume_print'),
      entry('button.k1c_stop_print', 'd-k1c', 'ha_creality_ws', 'stop_print'),
      entry('button.k1c_reconnect', 'd-k1c', 'ha_creality_ws', 'reconnect'),
      entry('button.k1c_home_xy_then_z', 'd-k1c', 'ha_creality_ws', 'home_xyz'),
      entry('light.k1c_light', 'd-k1c', 'ha_creality_ws', 'light'),
      entry('camera.k1c_printer_camera', 'd-k1c', 'ha_creality_ws', 'printer_camera'),
      entry('image.k1c_current_print_preview', 'd-k1c', 'ha_creality_ws', 'current_print_preview'),
      entry('sensor.k1c_cfs_external_filament', 'd-k1c', 'ha_creality_ws', 'cfs_ext_filament'),
      entry('sensor.k1c_cfs_box_1_slot_2_filament', 'd-k1c', 'ha_creality_ws', 'cfs_slot_filament'),
      entry('sensor.k1c_cfs_box_1_slot_1_filament', 'd-k1c', 'ha_creality_ws', 'cfs_slot_filament'),
      entry('sensor.k1c_cfs_box_1_slot_4_filament', 'd-k1c', 'ha_creality_ws', 'cfs_slot_filament'),
      entry('sensor.k1c_cfs_box_1_slot_3_filament', 'd-k1c', 'ha_creality_ws', 'cfs_slot_filament'),
      entry('sensor.k1c_cfs_box_1_slot_1_remaining', 'd-k1c', 'ha_creality_ws', 'cfs_slot_percent'),
      entry('sensor.k1c_cfs_box_1_temperature', 'd-k1c', 'ha_creality_ws', 'cfs_box_temp'),
      // Elegoo: six keys, the rest by the ends of their ids (its durations in milliseconds, its chamber a "box")
      entry('sensor.centauri_carbon_print_status', 'd-elegoo', 'elegoo_printer', 'print_status'),
      entry(
        'sensor.centauri_carbon_current_status',
        'd-elegoo',
        'elegoo_printer',
        'current_status',
      ),
      entry('sensor.centauri_carbon_print_error', 'd-elegoo', 'elegoo_printer', 'print_error'),
      entry(
        'sensor.centauri_carbon_error_status_reason',
        'd-elegoo',
        'elegoo_printer',
        'error_status_reason',
      ),
      entry('sensor.centauri_carbon_percent_complete', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_remaining_print_time', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_current_print_time', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_total_print_time', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_begin_time', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_end_time', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_file_name', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_current_layer', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_total_layers', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_remaining_layers', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_nozzle_temp', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_target_nozzle_temp', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_bed_temp', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_target_bed_temp', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_box_temp', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_active_filament_color', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_active_tray_id', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_a1_color', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_task_id', 'd-elegoo', 'elegoo_printer'),
      entry('select.centauri_carbon_print_speed', 'd-elegoo', 'elegoo_printer'),
      entry('sensor.centauri_carbon_print_speed', 'd-elegoo', 'elegoo_printer'),
      entry('button.centauri_carbon_pause_print', 'd-elegoo', 'elegoo_printer'),
      entry('button.centauri_carbon_resume_print', 'd-elegoo', 'elegoo_printer'),
      entry('button.centauri_carbon_stop_print', 'd-elegoo', 'elegoo_printer'),
      entry('light.centauri_carbon_chamber_light', 'd-elegoo', 'elegoo_printer'),
      entry('image.centauri_carbon_cover_image', 'd-elegoo', 'elegoo_printer'),
      entry('camera.centauri_carbon_camera', 'd-elegoo', 'elegoo_printer'),
      entry('select.centauri_carbon_print_file', 'd-elegoo', 'elegoo_printer', 'print_file'),
      entry(
        'button.centauri_carbon_refresh_file_list',
        'd-elegoo',
        'elegoo_printer',
        'refresh_file_list',
      ),
      // Anycubic (local): shared keys, its ACE a device of its own, the external spool on the printer
      entry('sensor.kobra_s1_status', 'd-kobra', 'anycubic', 'status'),
      entry('sensor.kobra_s1_progress', 'd-kobra', 'anycubic', 'progress'),
      entry('sensor.kobra_s1_time_remaining', 'd-kobra', 'anycubic', 'time_remaining'),
      entry('sensor.kobra_s1_file_name', 'd-kobra', 'anycubic', 'filename'),
      entry('sensor.kobra_s1_current_layer', 'd-kobra', 'anycubic', 'current_layer'),
      entry('sensor.kobra_s1_total_layers', 'd-kobra', 'anycubic', 'total_layers'),
      entry('sensor.kobra_s1_nozzle_temperature', 'd-kobra', 'anycubic', 'nozzle_temperature'),
      entry('sensor.kobra_s1_bed_temperature', 'd-kobra', 'anycubic', 'bed_temperature'),
      entry('sensor.kobra_s1_chamber_temperature', 'd-kobra', 'anycubic', 'chamber_temperature'),
      entry('number.kobra_s1_nozzle_target_temperature', 'd-kobra', 'anycubic', 'nozzle_target'),
      entry('number.kobra_s1_bed_target_temperature', 'd-kobra', 'anycubic', 'bed_target'),
      entry('number.kobra_s1_part_cooling_fan', 'd-kobra', 'anycubic', 'fan_speed'),
      entry('binary_sensor.kobra_s1_printing', 'd-kobra', 'anycubic', 'printing'),
      entry('binary_sensor.kobra_s1_paused', 'd-kobra', 'anycubic', 'paused'),
      entry('button.kobra_s1_pause', 'd-kobra', 'anycubic', 'pause'),
      entry('button.kobra_s1_resume', 'd-kobra', 'anycubic', 'resume'),
      entry('button.kobra_s1_stop', 'd-kobra', 'anycubic', 'stop'),
      entry('camera.kobra_s1_camera', 'd-kobra', 'anycubic', 'camera'),
      entry('light.kobra_s1_chamber_light', 'd-kobra', 'anycubic', 'chamber_light'),
      entry('image.kobra_s1_object_top_view', 'd-kobra', 'anycubic', 'object_top_view'),
      entry('image.kobra_s1_object_thumbnail', 'd-kobra', 'anycubic', 'object_thumbnail'),
      entry('select.kobra_s1_print_speed', 'd-kobra', 'anycubic', 'speed_mode'),
      entry('sensor.kobra_s1_firmware', 'd-kobra', 'anycubic', 'firmware'),
      entry('sensor.kobra_s1_external_spool', 'd-kobra', 'anycubic', 'external_spool'),
      entry('sensor.ace_pro_slot_3', 'd-ace', 'anycubic', 'ace_slot'),
      entry('sensor.ace_pro_slot_1', 'd-ace', 'anycubic', 'ace_slot'),
      entry('sensor.ace_pro_slot_4', 'd-ace', 'anycubic', 'ace_slot'),
      entry('sensor.ace_pro_slot_2', 'd-ace', 'anycubic', 'ace_slot'),
      entry('sensor.ace_pro_loaded_slot', 'd-ace', 'anycubic', 'ace_loaded_slot'),
      entry('sensor.ace_pro_humidity', 'd-ace', 'anycubic', 'ace_humidity'),
      entry('sensor.ace_pro_box_temperature', 'd-ace', 'anycubic', 'ace_box_temperature'),
      entry('switch.ace_pro_drying', 'd-ace', 'anycubic', 'ace_drying'),
      // Snapmaker U1: Klipper's words through its own keys
      entry('sensor.snapmaker_u1_print_state', 'd-u1', 'snapmaker_u1', 'print_state'),
      entry('sensor.snapmaker_u1_print_progress', 'd-u1', 'snapmaker_u1', 'print_progress'),
      entry('sensor.snapmaker_u1_time_remaining', 'd-u1', 'snapmaker_u1', 'time_remaining'),
      entry('sensor.snapmaker_u1_print_eta', 'd-u1', 'snapmaker_u1', 'print_eta'),
      entry('sensor.snapmaker_u1_print_duration', 'd-u1', 'snapmaker_u1', 'print_duration'),
      entry('sensor.snapmaker_u1_total_duration', 'd-u1', 'snapmaker_u1', 'total_duration'),
      entry('sensor.snapmaker_u1_filename', 'd-u1', 'snapmaker_u1', 'filename'),
      entry('sensor.snapmaker_u1_current_layer', 'd-u1', 'snapmaker_u1', 'current_layer'),
      entry('sensor.snapmaker_u1_total_layers', 'd-u1', 'snapmaker_u1', 'total_layers'),
      entry('sensor.snapmaker_u1_nozzle_temperature', 'd-u1', 'snapmaker_u1', 'nozzle_temperature'),
      entry('sensor.snapmaker_u1_nozzle_target', 'd-u1', 'snapmaker_u1', 'nozzle_target'),
      entry('number.snapmaker_u1_nozzle_setpoint', 'd-u1', 'snapmaker_u1', 'nozzle_setpoint'),
      entry('sensor.snapmaker_u1_bed_temperature', 'd-u1', 'snapmaker_u1', 'bed_temperature'),
      entry('sensor.snapmaker_u1_bed_target', 'd-u1', 'snapmaker_u1', 'bed_target'),
      entry('number.snapmaker_u1_bed_setpoint', 'd-u1', 'snapmaker_u1', 'bed_setpoint'),
      entry(
        'sensor.snapmaker_u1_chamber_temperature',
        'd-u1',
        'snapmaker_u1',
        'chamber_temperature',
      ),
      entry('sensor.snapmaker_u1_speed_factor', 'd-u1', 'snapmaker_u1', 'speed_factor'),
      entry('sensor.snapmaker_u1_flow_rate', 'd-u1', 'snapmaker_u1', 'flow_rate'),
      entry('sensor.snapmaker_u1_klipper_state', 'd-u1', 'snapmaker_u1', 'klipper_state'),
      entry('binary_sensor.snapmaker_u1_is_printing', 'd-u1', 'snapmaker_u1', 'is_printing'),
      entry('binary_sensor.snapmaker_u1_is_paused', 'd-u1', 'snapmaker_u1', 'is_paused'),
      entry('binary_sensor.snapmaker_u1_has_error', 'd-u1', 'snapmaker_u1', 'has_error'),
      entry('binary_sensor.snapmaker_u1_printer_ready', 'd-u1', 'snapmaker_u1', 'printer_ready'),
      entry('button.snapmaker_u1_pause_print', 'd-u1', 'snapmaker_u1', 'pause_print'),
      entry('button.snapmaker_u1_resume_print', 'd-u1', 'snapmaker_u1', 'resume_print'),
      entry('button.snapmaker_u1_cancel_print', 'd-u1', 'snapmaker_u1', 'cancel_print'),
      entry('button.snapmaker_u1_emergency_stop', 'd-u1', 'snapmaker_u1', 'emergency_stop'),
      entry('button.snapmaker_u1_restart_klipper', 'd-u1', 'snapmaker_u1', 'restart_klipper'),
      entry('button.snapmaker_u1_home_all', 'd-u1', 'snapmaker_u1', 'home_all'),
      entry('switch.snapmaker_u1_work_light', 'd-u1', 'snapmaker_u1', 'work_light'),
      entry('camera.snapmaker_u1_webcam', 'd-u1', 'snapmaker_u1', 'webcam'),
      entry('select.snapmaker_u1_print_file', 'd-u1', 'snapmaker_u1', 'print_file'),
      // the older Snapmaker line: fixed names, no keys, a dual head
      entry('sensor.snapmaker_a350_status', 'd-a350', 'snapmaker'),
      entry('sensor.snapmaker_a350_elapsed_time', 'd-a350', 'snapmaker'),
      entry('sensor.snapmaker_a350_remaining_time', 'd-a350', 'snapmaker'),
      entry('sensor.snapmaker_a350_estimated_time', 'd-a350', 'snapmaker'),
      entry('sensor.snapmaker_a350_file_name', 'd-a350', 'snapmaker'),
      entry('sensor.snapmaker_a350_progress', 'd-a350', 'snapmaker'),
      entry('sensor.snapmaker_a350_nozzle_1_temperature', 'd-a350', 'snapmaker'),
      entry('sensor.snapmaker_a350_nozzle_1_target_temperature', 'd-a350', 'snapmaker'),
      entry('sensor.snapmaker_a350_nozzle_2_temperature', 'd-a350', 'snapmaker'),
      entry('sensor.snapmaker_a350_nozzle_2_target_temperature', 'd-a350', 'snapmaker'),
      entry('sensor.snapmaker_a350_bed_temperature', 'd-a350', 'snapmaker'),
      entry('sensor.snapmaker_a350_bed_target_temperature', 'd-a350', 'snapmaker'),
      // FlashForge: an IFS slot's picture before the job's thumbnail, a camera that is a switch
      entry('sensor.adventurer_5m_machine_status', 'd-ad5m', 'flashforge', 'machine_status'),
      entry('sensor.adventurer_5m_print_progress', 'd-ad5m', 'flashforge', 'print_progress'),
      entry('sensor.adventurer_5m_current_file', 'd-ad5m', 'flashforge', 'current_file'),
      entry('image.adventurer_5m_ifs_slot_1', 'd-ad5m', 'flashforge', 'ifs_slot_1'),
      entry(
        'image.adventurer_5m_current_file_thumbnail',
        'd-ad5m',
        'flashforge',
        'current_file_thumbnail',
      ),
      entry('sensor.adventurer_5m_current_layer', 'd-ad5m', 'flashforge', 'current_layer'),
      entry('sensor.adventurer_5m_total_layers', 'd-ad5m', 'flashforge', 'total_layers'),
      entry('sensor.adventurer_5m_elapsed_time', 'd-ad5m', 'flashforge', 'elapsed_time'),
      entry('sensor.adventurer_5m_remaining_time', 'd-ad5m', 'flashforge', 'remaining_time'),
      entry(
        'sensor.adventurer_5m_print_completion_time',
        'd-ad5m',
        'flashforge',
        'print_completion_time',
      ),
      entry(
        'sensor.adventurer_5m_nozzle_temperature',
        'd-ad5m',
        'flashforge',
        'nozzle_temperature',
      ),
      entry(
        'sensor.adventurer_5m_nozzle_target_temperature',
        'd-ad5m',
        'flashforge',
        'nozzle_target_temperature',
      ),
      entry('sensor.adventurer_5m_bed_temperature', 'd-ad5m', 'flashforge', 'bed_temperature'),
      entry(
        'sensor.adventurer_5m_bed_target_temperature',
        'd-ad5m',
        'flashforge',
        'bed_target_temperature',
      ),
      entry(
        'sensor.adventurer_5m_chamber_temperature',
        'd-ad5m',
        'flashforge',
        'chamber_temperature',
      ),
      entry(
        'sensor.adventurer_5m_chamber_target_temperature',
        'd-ad5m',
        'flashforge',
        'chamber_target_temperature',
      ),
      entry('sensor.adventurer_5m_print_speed', 'd-ad5m', 'flashforge', 'print_speed'),
      entry('sensor.adventurer_5m_filament_type', 'd-ad5m', 'flashforge', 'filament_type'),
      entry('sensor.adventurer_5m_filament_weight', 'd-ad5m', 'flashforge', 'filament_weight'),
      entry('sensor.adventurer_5m_active_ifs_slot', 'd-ad5m', 'flashforge', 'active_ifs_slot'),
      entry('sensor.adventurer_5m_error_code', 'd-ad5m', 'flashforge', 'error_code'),
      entry('binary_sensor.adventurer_5m_has_error', 'd-ad5m', 'flashforge', 'has_error'),
      entry('binary_sensor.adventurer_5m_is_printing', 'd-ad5m', 'flashforge', 'is_printing'),
      entry('binary_sensor.adventurer_5m_is_paused', 'd-ad5m', 'flashforge', 'is_paused'),
      entry('binary_sensor.adventurer_5m_door_open', 'd-ad5m', 'flashforge', 'door_open'),
      entry('button.adventurer_5m_pause_print', 'd-ad5m', 'flashforge', 'pause_print'),
      entry('button.adventurer_5m_resume_print', 'd-ad5m', 'flashforge', 'resume_print'),
      entry('button.adventurer_5m_cancel_print', 'd-ad5m', 'flashforge', 'cancel_print'),
      entry('button.adventurer_5m_clear_status', 'd-ad5m', 'flashforge', 'clear_status'),
      entry('switch.adventurer_5m_camera', 'd-ad5m', 'flashforge', 'camera'),
      entry('switch.adventurer_5m_led', 'd-ad5m', 'flashforge', 'led'),
      entry('sensor.adventurer_5m_firmware_version', 'd-ad5m', 'flashforge', 'firmware_version'),
      entry(
        'sensor.adventurer_5m_lifetime_print_time',
        'd-ad5m',
        'flashforge',
        'lifetime_print_time',
      ),
      // an integration the card does not know, with a printer's signature (its wifi status listed first)
      entry('sensor.fork_wifi_status', 'd-fork', 'klipper_fork'),
      entry('sensor.fork_print_status', 'd-fork', 'klipper_fork', 'print_status'),
      entry('sensor.fork_nozzle_temperature', 'd-fork', 'klipper_fork', 'nozzle_temperature'),
      entry('sensor.fork_print_progress', 'd-fork', 'klipper_fork', 'print_progress'),
      // not printers: a washer with a state, a progress and a time left; a vacuum with a status and a progress; a
      // smart bed with a bed temperature (and a status read loosely, which the house's search never does)
      entry('sensor.washer_current_state', 'd-washer', 'lg_thinq'),
      entry('sensor.washer_progress', 'd-washer', 'lg_thinq'),
      entry('sensor.washer_remaining_time', 'd-washer', 'lg_thinq'),
      entry('sensor.roborock_s7_status', 'd-vac', 'roborock', 'status'),
      entry('sensor.roborock_s7_cleaning_progress', 'd-vac', 'roborock', 'cleaning_progress'),
      entry('sensor.eight_sleep_bed_temperature', 'd-sleep', 'eight_sleep', 'bed_temperature'),
      entry('sensor.eight_sleep_status', 'd-sleep', 'eight_sleep'),
      entry('sensor.eight_sleep_sleep_stage', 'd-sleep', 'eight_sleep'),
      entry('sensor.kitchen_temperature', 'd-kitchen', 'zha'),
    ].map((e) => [e.entity_id, e]),
  ),
  devices: {
    'd-bambu': { id: 'd-bambu', name: 'P1S', via_device_id: null },
    'd-ams': { id: 'd-ams', name: 'AMS', via_device_id: 'd-bambu' },
    'd-kobra': { id: 'd-kobra', name: 'Kobra S1', via_device_id: null },
    'd-ace': { id: 'd-ace', name: 'ACE Pro', via_device_id: 'd-kobra' },
  },
  states: {},
} as unknown as HomeAssistant;

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

  it('reads a duration in its unit, and the time left from a remaining time or a finish time', () => {
    expect(durationSeconds(72, 'min')).toBe(4320);
    expect(durationSeconds(1.5, 'h')).toBe(5400);
    expect(durationSeconds(90, 's')).toBe(90);
    expect(durationSeconds(5_400_000, 'ms')).toBe(5400);
    expect(durationSeconds(null, 'min')).toBeNull();
    const now = Date.parse('2026-09-17T12:00:00Z');
    expect(timeLeft(3600, null, now)).toEqual({ left: 3600, at: now + 3_600_000 });
    expect(timeLeft(null, now + 1_800_000, now)).toEqual({ left: 1800, at: now + 1_800_000 });
    expect(timeLeft(null, null, now)).toEqual({ left: null, at: null });
    // both known: the integration's finish time says when (it does not drift), its remaining time how long
    expect(timeLeft(3540, now + 3_600_000, now)).toEqual({ left: 3540, at: now + 3_600_000 });
  });

  it('reads a clock’s "HH:MM:SS" as seconds, and nothing shorter', () => {
    expect(clockSeconds('01:02:03')).toBe(3723);
    expect(clockSeconds('1:02:03')).toBe(3723);
    expect(clockSeconds('00:45:10')).toBe(2710);
    expect(clockSeconds('45:10')).toBeNull();
    expect(clockSeconds('01:60:00')).toBeNull();
    expect(clockSeconds('3723')).toBeNull();
    expect(clockSeconds(undefined)).toBeNull();
  });

  it('says when a finished job finished, never now, and how long a job has run', () => {
    const now = Date.parse('2026-09-17T12:00:00Z');
    // the finish time the printer reported; else when its status changed
    expect(finishedAt(now - 1_800_000, now - 60_000, now)).toBe(now - 1_800_000);
    expect(finishedAt(null, now - 60_000, now)).toBe(now - 60_000);
    // a finish time still ahead (an estimate left over) is not when it finished
    expect(finishedAt(now + 3_600_000, now - 60_000, now)).toBe(now - 60_000);
    expect(elapsedSeconds(4200, null, now)).toBe(4200);
    expect(elapsedSeconds(null, now - 5_700_000, now)).toBe(5700);
    expect(elapsedSeconds(null, null, now)).toBeNull();
  });
});
