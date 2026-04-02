/**
 * STABLE: 2024-04-02
 * Post Processing Panel UI
 * 
 * Manages the post-processing settings panel UI:
 * - Tab switching between properties and post-processing
 * - HDR environment loading
 * - Bloom, SSAO, Tone Mapping, FXAA controls
 * - Color grading controls
 */

import { PostProcessingSettings, ToneMappingType, BackgroundType } from '../post/PostProcessingManager';

// ============================================================================
// Post Processing Panel
// ============================================================================

export class PostProcessingPanel {
  private onSettingsChange: (settings: Partial<PostProcessingSettings>) => void;
  private onHDRLoad: (url: string, filename: string, onLoad?: () => void, onError?: (e: any) => void) => void;

  constructor(
    onSettingsChange: (settings: Partial<PostProcessingSettings>) => void,
    onHDRLoad: (url: string, filename: string, onLoad?: () => void, onError?: (e: any) => void) => void
  ) {
    this.onSettingsChange = onSettingsChange;
    this.onHDRLoad = onHDRLoad;

    this.setupTabs();
    this.setupHDRLoading();
    this.setupControls();
  }

  // -------------------------------------------------------------------------
  // Tab Switching
  // -------------------------------------------------------------------------

  private setupTabs(): void {
    const tabs = document.querySelectorAll('.panel-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab');
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');

        const propertiesPanel = document.getElementById('properties');
        const postprocessingPanel = document.getElementById('postprocessing-panel');

        if (tabName === 'properties') {
          propertiesPanel?.classList.add('active');
          postprocessingPanel?.classList.remove('active');
        } else {
          propertiesPanel?.classList.remove('active');
          postprocessingPanel?.classList.add('active');
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // HDR Loading
  // -------------------------------------------------------------------------

  private setupHDRLoading(): void {
    const hdrLoadBtn = document.getElementById('pp-hdr-load-btn');
    const hdrInput = document.getElementById('pp-hdr-input') as HTMLInputElement;
    const hdrLoading = document.getElementById('pp-hdr-loading');
    const hdrFilename = document.getElementById('pp-hdr-filename');

    hdrLoadBtn?.addEventListener('click', () => hdrInput?.click());

    hdrInput?.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        hdrLoading?.classList.remove('hidden');
        const url = URL.createObjectURL(file);

        this.onHDRLoad(
          url,
          file.name,
          () => {
            hdrLoading?.classList.add('hidden');
            if (hdrFilename) hdrFilename.textContent = file.name;

            // Enable HDR automatically
            const hdrEnabled = document.getElementById('pp-hdr-enabled') as HTMLInputElement;
            if (hdrEnabled && !hdrEnabled.checked) {
              hdrEnabled.checked = true;
              this.onSettingsChange({ hdrEnabled: true });
            }
            URL.revokeObjectURL(url);
          },
          (error) => {
            hdrLoading?.classList.add('hidden');
            console.error('[PostProcessing] Failed to load HDR:', error);
            alert('加载 HDR 文件失败');
          }
        );
      }
    });
  }

  // -------------------------------------------------------------------------
  // Control Setup
  // -------------------------------------------------------------------------

  private setupControls(): void {
    // HDR
    this.setupControl('pp-hdr-enabled', 'checkbox', (v) => ({ hdrEnabled: v }));
    this.setupControl('pp-hdr-intensity', 'range', (v) => ({ hdrIntensity: v }), 'pp-hdr-intensity-slider');
    this.setupControl('pp-hdr-intensity-slider', 'range', (v) => ({ hdrIntensity: v }), 'pp-hdr-intensity');

    // Background
    this.setupControl('pp-bg-type', 'select', (v) => ({ bgType: v as BackgroundType }), undefined, (value) => {
      const colorRow = document.getElementById('pp-bg-color-row');
      const intensityRow = document.getElementById('pp-bg-intensity-row');
      if (value === 'color') {
        if (colorRow) colorRow.style.display = 'flex';
        if (intensityRow) intensityRow.style.display = 'none';
      } else if (value === 'hdr') {
        if (colorRow) colorRow.style.display = 'none';
        if (intensityRow) intensityRow.style.display = 'flex';
      } else {
        if (colorRow) colorRow.style.display = 'none';
        if (intensityRow) intensityRow.style.display = 'none';
      }
    });
    this.setupControl('pp-bg-color', 'color', (v) => ({ bgColor: v }));
    this.setupControl('pp-bg-intensity', 'range', (v) => ({ bgIntensity: v }), 'pp-bg-intensity-slider');
    this.setupControl('pp-bg-intensity-slider', 'range', (v) => ({ bgIntensity: v }), 'pp-bg-intensity');

    // Bloom
    this.setupControl('pp-bloom-enabled', 'checkbox', (v) => ({ bloomEnabled: v }));
    this.setupControl('pp-bloom-threshold', 'range', (v) => ({ bloomThreshold: v }), 'pp-bloom-threshold-slider');
    this.setupControl('pp-bloom-threshold-slider', 'range', (v) => ({ bloomThreshold: v }), 'pp-bloom-threshold');
    this.setupControl('pp-bloom-strength', 'range', (v) => ({ bloomStrength: v }), 'pp-bloom-strength-slider');
    this.setupControl('pp-bloom-strength-slider', 'range', (v) => ({ bloomStrength: v }), 'pp-bloom-strength');
    this.setupControl('pp-bloom-radius', 'range', (v) => ({ bloomRadius: v }), 'pp-bloom-radius-slider');
    this.setupControl('pp-bloom-radius-slider', 'range', (v) => ({ bloomRadius: v }), 'pp-bloom-radius');

    // SSAO
    this.setupControl('pp-ssao-enabled', 'checkbox', (v) => ({ ssaoEnabled: v }));
    this.setupControl('pp-ssao-radius', 'range', (v) => ({ ssaoKernelRadius: v }), 'pp-ssao-radius-slider');
    this.setupControl('pp-ssao-radius-slider', 'range', (v) => ({ ssaoKernelRadius: v }), 'pp-ssao-radius');
    this.setupControl('pp-ssao-intensity', 'range', (v) => ({ ssaoMaxDistance: v }), 'pp-ssao-intensity-slider');
    this.setupControl('pp-ssao-intensity-slider', 'range', (v) => ({ ssaoMaxDistance: v }), 'pp-ssao-intensity');

    // Tone Mapping
    this.setupControl('pp-tone-enabled', 'checkbox', (v) => ({ toneEnabled: v }));
    this.setupControl('pp-tone-type', 'select', (v) => ({ toneType: v as ToneMappingType }));
    this.setupControl('pp-tone-exposure', 'range', (v) => ({ toneExposure: v }), 'pp-tone-exposure-slider');
    this.setupControl('pp-tone-exposure-slider', 'range', (v) => ({ toneExposure: v }), 'pp-tone-exposure');

    // FXAA & Gamma
    this.setupControl('pp-fxaa-enabled', 'checkbox', (v) => ({ fxaaEnabled: v }));
    this.setupControl('pp-gamma-enabled', 'checkbox', (v) => ({ gammaEnabled: v }));

    // Color Grading
    this.setupControl('pp-color-brightness', 'range', (v) => ({ brightness: v }), 'pp-color-brightness-slider');
    this.setupControl('pp-color-brightness-slider', 'range', (v) => ({ brightness: v }), 'pp-color-brightness');
    this.setupControl('pp-color-contrast', 'range', (v) => ({ contrast: v }), 'pp-color-contrast-slider');
    this.setupControl('pp-color-contrast-slider', 'range', (v) => ({ contrast: v }), 'pp-color-contrast');
    this.setupControl('pp-color-saturation', 'range', (v) => ({ saturation: v }), 'pp-color-saturation-slider');
    this.setupControl('pp-color-saturation-slider', 'range', (v) => ({ saturation: v }), 'pp-color-saturation');
  }

  private setupControl(
    id: string,
    type: 'checkbox' | 'range' | 'select' | 'color',
    getSettings: (value: any) => Partial<PostProcessingSettings>,
    syncId?: string,
    onChange?: (value: any) => void
  ): void {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    if (!el) return;

    el.addEventListener('input', () => {
      let value: any;

      if (type === 'checkbox') value = (el as HTMLInputElement).checked;
      else if (type === 'range') value = parseFloat(el.value);
      else if (type === 'color') value = el.value;
      else if (type === 'select') value = el.value;

      // Sync with paired input
      if (syncId) {
        const syncEl = document.getElementById(syncId) as HTMLInputElement;
        if (syncEl) syncEl.value = el.value;
      }

      this.onSettingsChange(getSettings(value));
      onChange?.(value);
    });
  }

  // -------------------------------------------------------------------------
  // Settings Restoration
  // -------------------------------------------------------------------------

  restoreSettings(settings: PostProcessingSettings): void {
    const setValue = (id: string, value: any, type: 'checkbox' | 'range' | 'select' | 'color') => {
      const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
      if (!el) return;
      if (type === 'checkbox') (el as HTMLInputElement).checked = value;
      else el.value = String(value);
    };

    // HDR
    setValue('pp-hdr-enabled', settings.hdrEnabled, 'checkbox');
    setValue('pp-hdr-intensity', settings.hdrIntensity, 'range');
    setValue('pp-hdr-intensity-slider', settings.hdrIntensity, 'range');
    if (settings.hdrFilename) {
      const filenameEl = document.getElementById('pp-hdr-filename');
      if (filenameEl) filenameEl.textContent = settings.hdrFilename;
    }

    // Background
    setValue('pp-bg-type', settings.bgType, 'select');
    setValue('pp-bg-color', settings.bgColor, 'color');
    setValue('pp-bg-intensity', settings.bgIntensity, 'range');
    setValue('pp-bg-intensity-slider', settings.bgIntensity, 'range');

    // Bloom
    setValue('pp-bloom-enabled', settings.bloomEnabled, 'checkbox');
    setValue('pp-bloom-threshold', settings.bloomThreshold, 'range');
    setValue('pp-bloom-threshold-slider', settings.bloomThreshold, 'range');
    setValue('pp-bloom-strength', settings.bloomStrength, 'range');
    setValue('pp-bloom-strength-slider', settings.bloomStrength, 'range');
    setValue('pp-bloom-radius', settings.bloomRadius, 'range');
    setValue('pp-bloom-radius-slider', settings.bloomRadius, 'range');

    // SSAO
    setValue('pp-ssao-enabled', settings.ssaoEnabled, 'checkbox');
    setValue('pp-ssao-radius', settings.ssaoKernelRadius, 'range');
    setValue('pp-ssao-radius-slider', settings.ssaoKernelRadius, 'range');
    setValue('pp-ssao-intensity', settings.ssaoMaxDistance, 'range');
    setValue('pp-ssao-intensity-slider', settings.ssaoMaxDistance, 'range');

    // Tone Mapping
    setValue('pp-tone-enabled', settings.toneEnabled, 'checkbox');
    setValue('pp-tone-type', settings.toneType, 'select');
    setValue('pp-tone-exposure', settings.toneExposure, 'range');
    setValue('pp-tone-exposure-slider', settings.toneExposure, 'range');

    // FXAA & Gamma
    setValue('pp-fxaa-enabled', settings.fxaaEnabled, 'checkbox');
    setValue('pp-gamma-enabled', settings.gammaEnabled, 'checkbox');

    // Color Grading
    setValue('pp-color-brightness', settings.brightness, 'range');
    setValue('pp-color-brightness-slider', settings.brightness, 'range');
    setValue('pp-color-contrast', settings.contrast, 'range');
    setValue('pp-color-contrast-slider', settings.contrast, 'range');
    setValue('pp-color-saturation', settings.saturation, 'range');
    setValue('pp-color-saturation-slider', settings.saturation, 'range');
  }
}
