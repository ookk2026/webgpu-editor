/**
 * STABLE: 2024-04-02
 * UI Manager - Main UI Framework Controller
 * 
 * Manages the overall UI layout and coordinates between UI components:
 * - Top toolbar
 * - Left scene panel (scene tree)
 * - Center viewport (3D view)
 * - Right properties panel (properties + post-processing)
 * - Bottom status bar
 * - Panel visibility and layout state
 */

import { SceneTree } from './SceneTree';
import { PropertyPanel } from './PropertyPanel';
import { PostProcessingPanel } from './PostProcessingPanel';
import { DraggablePanel } from './DraggablePanel';
import { ResponsiveLayout, PanelSide } from './ResponsiveLayout';

// ============================================================================
// Types
// ============================================================================

export type PanelType = 'scene' | 'properties' | 'viewport' | 'toolbar' | 'statusbar';
export type PropertyTab = 'properties' | 'postprocessing';

export interface UIOptions {
  showScenePanel?: boolean;
  showPropertiesPanel?: boolean;
  showToolbar?: boolean;
  showStatusbar?: boolean;
}

export interface UICallbacks {
  onUndo: () => void;
  onRedo: () => void;
  onAddCube: () => void;
  onAddSphere: () => void;
  onAddPlane: () => void;
  onAddLight: (type: 'ambient' | 'directional' | 'point' | 'spot' | 'hemisphere') => void;
  onImportModel: () => void;
  onDelete: () => void;
  onFocus: () => void;
  onTransformModeChange: (mode: 'translate' | 'rotate' | 'scale') => void;
}

// ============================================================================
// UI Manager
// ============================================================================

export class UIManager {
  // UI Components
  private sceneTree: SceneTree;
  private propertyPanel: PropertyPanel;
  private postProcessingPanel: PostProcessingPanel;

  // Layout Systems
  private responsiveLayout: ResponsiveLayout;
  private draggablePanels: Map<string, DraggablePanel> = new Map();
  private useResponsiveLayout = true; // Default to responsive, not draggable

  // DOM Elements
  private toolbar: HTMLElement;
  private scenePanel: HTMLElement;
  private propertiesPanel: HTMLElement;
  private viewportContainer: HTMLElement;
  private statusbar: HTMLElement;

  // State
  private currentPropertyTab: PropertyTab = 'properties';
  private transformMode: 'translate' | 'rotate' | 'scale' = 'translate';
  private callbacks: UICallbacks;

  constructor(callbacks: UICallbacks) {
    this.callbacks = callbacks;

    // Get main DOM elements
    this.toolbar = document.getElementById('toolbar')!;
    this.scenePanel = document.getElementById('scene-panel')!;
    this.propertiesPanel = document.getElementById('properties-panel')!;
    this.viewportContainer = document.getElementById('viewport-container')!;
    this.statusbar = document.getElementById('statusbar')!;

    // Initialize sub-modules
    this.sceneTree = new SceneTree('scene-tree', {
      onSelect: () => {},
      onToggleVisibility: () => {},
      onToggleExpand: () => {},
    });

    this.propertyPanel = new PropertyPanel({
      onTransformChange: () => {},
      onMaterialChange: () => {},
      onLightChange: () => {},
      onCameraChange: () => {},
    });

    this.postProcessingPanel = new PostProcessingPanel(
      () => {},
      () => {}
    );

    // Setup UI
    this.setupToolbar();
    this.setupPanelTabs();
    this.setupKeyboardShortcuts();
    this.setupStatusBar();

    // Initialize responsive layout (default)
    this.responsiveLayout = new ResponsiveLayout({
      onLayoutChange: () => {
        // Trigger viewport resize when panel layout changes
        window.dispatchEvent(new Event('resize'));
      }
    });
    this.responsiveLayout.setupGlobalEvents();

    // Initialize draggable panels (optional mode)
    this.setupDraggablePanels();
  }

  // -------------------------------------------------------------------------
  // Responsive Layout Feature (Default)
  // -------------------------------------------------------------------------

  getResponsiveLayout(): ResponsiveLayout {
    return this.responsiveLayout;
  }

  collapsePanel(side: PanelSide): void {
    if (this.useResponsiveLayout) {
      this.responsiveLayout.collapsePanel(side);
    }
  }

  expandPanel(side: PanelSide): void {
    if (this.useResponsiveLayout) {
      this.responsiveLayout.expandPanel(side);
    }
  }

  togglePanelCollapse(side: PanelSide): void {
    if (this.useResponsiveLayout) {
      this.responsiveLayout.togglePanel(side);
    }
  }

  resetLayout(): void {
    this.responsiveLayout.resetLayout();
  }

  // -------------------------------------------------------------------------
  // Draggable Panels Feature (Alternative Mode)
  // -------------------------------------------------------------------------

  private setupDraggablePanels(): void {
    // Create draggable panels but don't enable them by default
    // Draggable mode is an alternative to responsive layout
    
    const scenePanelDraggable = new DraggablePanel('scene-panel', {
      handle: '#scene-panel-header',
      bounds: '#workspace',
      snapToEdges: true,
      snapThreshold: 20,
      savePosition: true,
      storageKey: 'editor-scene-panel-pos-drag',
    });
    scenePanelDraggable.disable();
    this.draggablePanels.set('scene', scenePanelDraggable);

    const propertiesPanelDraggable = new DraggablePanel('properties-panel', {
      handle: '.panel-tabs',
      bounds: '#workspace',
      snapToEdges: true,
      snapThreshold: 20,
      savePosition: true,
      storageKey: 'editor-properties-panel-pos-drag',
    });
    propertiesPanelDraggable.disable();
    this.draggablePanels.set('properties', propertiesPanelDraggable);

    const toolbarDraggable = new DraggablePanel('toolbar', {
      bounds: 'window',
      snapToEdges: true,
      snapThreshold: 10,
      savePosition: true,
      storageKey: 'editor-toolbar-pos-drag',
    });
    toolbarDraggable.disable();
    this.draggablePanels.set('toolbar', toolbarDraggable);
  }

  /**
   * Enable draggable panel mode (alternative to responsive layout)
   * Panels can be freely dragged to reposition
   */
  enableDraggableMode(): void {
    this.useResponsiveLayout = false;
    
    // Disable responsive layout first
    this.responsiveLayout.resetLayout();
    
    // Enable drag on panels
    this.draggablePanels.forEach(panel => panel.enable());

    // Add visual indicator
    this.scenePanel.classList.add('draggable');
    this.propertiesPanel.classList.add('draggable');
    this.toolbar.classList.add('draggable');

    this.showNotification('拖动模式已启用 - Shift+D 切换回响应式布局');
  }

  /**
   * Disable draggable panel mode, enable responsive layout
   */
  disableDraggableMode(): void {
    this.useResponsiveLayout = true;
    
    // Disable drag
    this.draggablePanels.forEach(panel => panel.disable());

    // Remove visual indicator
    this.scenePanel.classList.remove('draggable');
    this.propertiesPanel.classList.remove('draggable');
    this.toolbar.classList.remove('draggable');

    // Reset positions and restore responsive layout
    this.draggablePanels.forEach(panel => panel.resetPosition());
    this.responsiveLayout.resetLayout();

    this.showNotification('响应式布局已启用');
  }

  /**
   * Toggle between draggable and responsive layout modes
   */
  toggleDraggableMode(): void {
    if (this.useResponsiveLayout) {
      this.enableDraggableMode();
    } else {
      this.disableDraggableMode();
    }
  }

  /**
   * Check if currently using responsive layout
   */
  isResponsiveLayout(): boolean {
    return this.useResponsiveLayout;
  }

  private showNotification(message: string): void {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 50px;
      left: 50%;
      transform: translateX(-50%);
      background: #0e639c;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 10000;
      pointer-events: none;
      animation: fadeInOut 2s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.remove(), 2000);
  }

  // -------------------------------------------------------------------------
  // Getters for UI Components
  // -------------------------------------------------------------------------

  getSceneTree(): SceneTree {
    return this.sceneTree;
  }

  getPropertyPanel(): PropertyPanel {
    return this.propertyPanel;
  }

  getPostProcessingPanel(): PostProcessingPanel {
    return this.postProcessingPanel;
  }

  // -------------------------------------------------------------------------
  // Toolbar
  // -------------------------------------------------------------------------

  private setupToolbar(): void {
    // Transform mode buttons
    document.getElementById('tool-translate')?.addEventListener('click', () => {
      this.setTransformMode('translate');
    });
    document.getElementById('tool-rotate')?.addEventListener('click', () => {
      this.setTransformMode('rotate');
    });
    document.getElementById('tool-scale')?.addEventListener('click', () => {
      this.setTransformMode('scale');
    });

    // Undo/Redo
    document.getElementById('btn-undo')?.addEventListener('click', () => this.callbacks.onUndo());
    document.getElementById('btn-redo')?.addEventListener('click', () => this.callbacks.onRedo());

    // Object creation - will be handled by dropdown setup
    this.setupModelDropdown();

    // Light buttons
    document.getElementById('btn-add-ambient')?.addEventListener('click', () =>
      this.callbacks.onAddLight('ambient')
    );
    document.getElementById('btn-add-directional')?.addEventListener('click', () =>
      this.callbacks.onAddLight('directional')
    );
    document.getElementById('btn-add-point')?.addEventListener('click', () =>
      this.callbacks.onAddLight('point')
    );

    // Import
    const importBtn = document.getElementById('btn-import-model');
    importBtn?.addEventListener('click', () => this.callbacks.onImportModel());
  }

  private setupModelDropdown(): void {
    const cubeBtn = document.getElementById('btn-add-cube');
    const sphereBtn = document.getElementById('btn-add-sphere');

    if (!cubeBtn || !cubeBtn.parentElement) return;

    const parent = cubeBtn.parentElement;

    // Create dropdown
    const dropdown = document.createElement('div');
    dropdown.style.cssText = 'position: relative; display: inline-block;';
    dropdown.innerHTML = `
      <button id="btn-create-model" class="primary" style="padding: 6px 12px; background: #0e639c; color: #e0e0e0; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">+ 创建模型 ▼</button>
      <div id="model-dropdown-menu" style="display: none; position: absolute; top: 100%; left: 0; background: #3c3c3c; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); z-index: 1000; min-width: 120px; margin-top: 4px;">
        <div class="dropdown-model-item" data-type="cube" style="padding: 8px 12px; cursor: pointer; color: #e0e0e0; font-size: 12px; border-radius: 4px 4px 0 0;">□ 立方体</div>
        <div class="dropdown-model-item" data-type="sphere" style="padding: 8px 12px; cursor: pointer; color: #e0e0e0; font-size: 12px;">○ 球体</div>
        <div class="dropdown-model-item" data-type="plane" style="padding: 8px 12px; cursor: pointer; color: #e0e0e0; font-size: 12px; border-radius: 0 0 4px 4px;">▭ 平面</div>
      </div>
    `;

    // Hide original buttons
    cubeBtn.style.display = 'none';
    if (sphereBtn) sphereBtn.style.display = 'none';

    parent.insertBefore(dropdown, cubeBtn);

    // Setup dropdown behavior
    const btn = dropdown.querySelector('#btn-create-model');
    const menu = dropdown.querySelector('#model-dropdown-menu') as HTMLElement;

    btn?.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });

    document.addEventListener('click', () => {
      menu.style.display = 'none';
    });

    dropdown.querySelectorAll('.dropdown-model-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = (e.currentTarget as HTMLElement).dataset.type;
        if (type === 'cube') this.callbacks.onAddCube();
        else if (type === 'sphere') this.callbacks.onAddSphere();
        else if (type === 'plane') this.callbacks.onAddPlane();
        menu.style.display = 'none';
      });

      item.addEventListener('mouseenter', () => {
        (item as HTMLElement).style.background = '#4c4c4c';
      });
      item.addEventListener('mouseleave', () => {
        (item as HTMLElement).style.background = 'transparent';
      });
    });
  }

  setTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
    this.transformMode = mode;
    this.callbacks.onTransformModeChange(mode);

    // Update toolbar UI
    document.getElementById('tool-translate')?.classList.toggle('active', mode === 'translate');
    document.getElementById('tool-rotate')?.classList.toggle('active', mode === 'rotate');
    document.getElementById('tool-scale')?.classList.toggle('active', mode === 'scale');
  }

  getTransformMode(): 'translate' | 'rotate' | 'scale' {
    return this.transformMode;
  }

  // -------------------------------------------------------------------------
  // Panel Tabs
  // -------------------------------------------------------------------------

  private setupPanelTabs(): void {
    const tabs = document.querySelectorAll('.panel-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabName = tab.getAttribute('data-tab') as PropertyTab;
        this.switchPropertyTab(tabName);
      });
    });
  }

  switchPropertyTab(tab: PropertyTab): void {
    this.currentPropertyTab = tab;

    // Update tab buttons
    document.querySelectorAll('.panel-tab').forEach((t) => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tab);
    });

    // Update panels
    const propertiesPanel = document.getElementById('properties');
    const postprocessingPanel = document.getElementById('postprocessing-panel');

    if (tab === 'properties') {
      propertiesPanel?.classList.add('active');
      postprocessingPanel?.classList.remove('active');
    } else {
      propertiesPanel?.classList.remove('active');
      postprocessingPanel?.classList.add('active');
    }
  }

  getCurrentPropertyTab(): PropertyTab {
    return this.currentPropertyTab;
  }

  // -------------------------------------------------------------------------
  // Panel Visibility
  // -------------------------------------------------------------------------

  setPanelVisibility(options: UIOptions): void {
    if (options.showScenePanel !== undefined) {
      this.scenePanel.style.display = options.showScenePanel ? 'flex' : 'none';
    }
    if (options.showPropertiesPanel !== undefined) {
      this.propertiesPanel.style.display = options.showPropertiesPanel ? 'flex' : 'none';
    }
    if (options.showToolbar !== undefined) {
      this.toolbar.style.display = options.showToolbar ? 'flex' : 'none';
    }
    if (options.showStatusbar !== undefined) {
      this.statusbar.style.display = options.showStatusbar ? 'flex' : 'none';
    }
  }

  toggleScenePanel(): void {
    const isVisible = this.scenePanel.style.display !== 'none';
    this.scenePanel.style.display = isVisible ? 'none' : 'flex';
  }

  togglePropertiesPanel(): void {
    const isVisible = this.propertiesPanel.style.display !== 'none';
    this.propertiesPanel.style.display = isVisible ? 'none' : 'flex';
  }

  // -------------------------------------------------------------------------
  // Status Bar
  // -------------------------------------------------------------------------

  private setupStatusBar(): void {
    // Initial state
    this.updateStatusMode('就绪');
    this.updateStatusObjects(0);
  }

  updateStatusMode(mode: string): void {
    const el = document.getElementById('status-mode');
    if (el) el.textContent = mode;
  }

  updateStatusObjects(count: number): void {
    const el = document.getElementById('status-objects');
    if (el) el.textContent = `${count} 个对象`;
  }

  updateStatusRender(type: string): void {
    const el = document.getElementById('status-render');
    if (el) el.textContent = type;
  }

  updateStatusFPS(fps: number): void {
    const el = document.getElementById('status-fps');
    if (el) el.textContent = `${fps} FPS`;
  }

  // -------------------------------------------------------------------------
  // Keyboard Shortcuts
  // -------------------------------------------------------------------------

  private setupKeyboardShortcuts(): void {
    // Use window.addEventListener with capture phase to ensure we get all keyboard events
    window.addEventListener('keydown', (e) => {
      // Skip if user is typing in an input field
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      const key = e.key.toLowerCase();
      console.log('[Keyboard] Key pressed:', key, 'Shift:', e.shiftKey, 'Ctrl:', e.ctrlKey);

      // Transform mode shortcuts
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        switch (key) {
          case 't':
            e.preventDefault();
            this.setTransformMode('translate');
            return;
          case 'r':
            e.preventDefault();
            this.setTransformMode('rotate');
            return;
          case 's':
            e.preventDefault();
            this.setTransformMode('scale');
            return;
          case 'f':
            e.preventDefault();
            this.callbacks.onFocus();
            return;
          case 'delete':
          case 'backspace':
            e.preventDefault();
            this.callbacks.onDelete();
            return;
        }
      }

      // Shift + Key shortcuts for panels
      if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
        switch (key) {
          case 'd':
            e.preventDefault();
            this.toggleDraggableMode();
            return;
          case 'b':
            e.preventDefault();
            this.togglePanelCollapse('left');
            return;
          case 'p':
            e.preventDefault();
            this.togglePanelCollapse('right');
            return;
        }
      }

      // Ctrl/Cmd shortcuts
      if (e.ctrlKey || e.metaKey) {
        switch (key) {
          case 'z':
            e.preventDefault();
            e.shiftKey ? this.callbacks.onRedo() : this.callbacks.onUndo();
            return;
          case 'y':
            e.preventDefault();
            this.callbacks.onRedo();
            return;
        }
      }
    }, true); // Use capture phase
  }

  // -------------------------------------------------------------------------
  // Loading Overlay
  // -------------------------------------------------------------------------

  showLoading(message: string = '初始化编辑器...'): void {
    const overlay = document.getElementById('overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      (overlay as HTMLElement).style.display = 'flex';
      const content = overlay.querySelector('#overlay-content div:last-child');
      if (content) content.textContent = message;
    }
  }

  hideLoading(): void {
    document.querySelectorAll('#overlay').forEach((el) => {
      el.classList.add('hidden');
      (el as HTMLElement).style.display = 'none';
    });
  }

  // -------------------------------------------------------------------------
  // Layout Utilities
  // -------------------------------------------------------------------------

  getViewportSize(): { width: number; height: number } {
    return {
      width: this.viewportContainer.clientWidth,
      height: this.viewportContainer.clientHeight,
    };
  }

  onResize(callback: () => void): void {
    window.addEventListener('resize', callback);
  }
}
