/**
 * STABLE: 2024-04-02
 * Scene Tree UI Component
 * 
 * Manages the scene hierarchy tree view with:
 * - Object listing with icons
 * - Visibility toggle dots
 * - Expand/collapse functionality
 * - Filter buttons
 * - Selection synchronization
 */

import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

export type FilterType = 'lights' | 'models' | 'cameras' | 'helpers';

export interface SceneTreeCallbacks {
  onSelect: (obj: THREE.Object3D) => void;
  onToggleVisibility: (obj: THREE.Object3D) => void;
  onToggleExpand: (uuid: string) => void;
}

// ============================================================================
// Scene Tree Manager
// ============================================================================

export class SceneTree {
  private container: HTMLElement;
  private filters: Record<FilterType, boolean> = {
    lights: true,
    models: true,
    cameras: true,
    helpers: true,
  };
  private expandedItems = new Set<string>();
  private selectedObject: THREE.Object3D | null = null;
  private scene: THREE.Scene | null = null;
  private transformControls: THREE.Object3D | null = null;
  private callbacks: SceneTreeCallbacks;

  constructor(
    containerId: string,
    callbacks: SceneTreeCallbacks,
    options?: {
      transformControls?: THREE.Object3D;
    }
  ) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`SceneTree: Container #${containerId} not found`);
    }
    this.container = container;
    this.callbacks = callbacks;
    this.transformControls = options?.transformControls || null;

    this.setupFilterButtons();
    this.setupTreeActions();
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  private setupFilterButtons(): void {
    const filterTypes: FilterType[] = ['lights', 'models', 'cameras', 'helpers'];
    filterTypes.forEach((type) => {
      const btn = document.getElementById(`btn-filter-${type}`);
      if (btn) {
        btn.addEventListener('click', () => {
          this.filters[type] = !this.filters[type];
          btn.classList.toggle('active', this.filters[type]);
          this.refresh();
        });
        btn.classList.add('active');
      }
    });
  }

  private setupTreeActions(): void {
    const expandBtn = document.getElementById('btn-expand-all');
    const collapseBtn = document.getElementById('btn-collapse-all');

    expandBtn?.addEventListener('click', () => {
      if (this.scene) {
        this.scene.traverse((obj) => {
          if (this.shouldShowInTree(obj) && obj.children.length > 0) {
            this.expandedItems.add(obj.uuid);
          }
        });
        this.refresh();
      }
    });

    collapseBtn?.addEventListener('click', () => {
      this.expandedItems.clear();
      this.refresh();
    });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  setScene(scene: THREE.Scene): void {
    this.scene = scene;
  }

  setTransformControls(controls: THREE.Object3D): void {
    this.transformControls = controls;
  }

  setSelectedObject(obj: THREE.Object3D | null): void {
    this.selectedObject = obj;
    this.updateSelection();
  }

  refresh(): void {
    if (!this.scene) return;

    this.container.innerHTML = '';
    this.scene.children.forEach((child) => {
      if (this.shouldShowInTree(child)) {
        this.renderTreeItem(child, 0);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Tree Rendering
  // -------------------------------------------------------------------------

  private renderTreeItem(obj: THREE.Object3D, depth: number): void {
    const item = document.createElement('div');
    item.className = 'scene-tree-item';
    item.dataset.uuid = obj.uuid;
    item.style.paddingLeft = `${8 + depth * 16}px`;

    const hasChildren = obj.children.length > 0 && obj.children.some((c) => this.shouldShowInTree(c));
    const isExpanded = this.expandedItems.has(obj.uuid);
    const icon = this.getObjectIcon(obj);
    const name = obj.name || obj.type;

    // Expand/collapse toggle
    const expander = hasChildren
      ? isExpanded
        ? '▼'
        : '▶'
      : '<span style="visibility:hidden">▶</span>';

    item.innerHTML = `
      <span class="tree-expander">${expander}</span>
      <span class="tree-icon">${icon}</span>
      <span class="tree-name">${name}</span>
      <span class="tree-visibility ${obj.visible ? 'visible' : 'hidden'}" title="Toggle visibility"></span>
    `;

    // Click handlers
    item.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      // Toggle visibility
      if (target.classList.contains('tree-visibility')) {
        obj.visible = !obj.visible;
        this.callbacks.onToggleVisibility(obj);
        this.refresh();
        return;
      }

      // Toggle expand/collapse
      if (target.classList.contains('tree-expander') && hasChildren) {
        if (isExpanded) {
          this.expandedItems.delete(obj.uuid);
        } else {
          this.expandedItems.add(obj.uuid);
        }
        this.callbacks.onToggleExpand(obj.uuid);
        this.refresh();
        return;
      }

      // Select object
      this.callbacks.onSelect(obj);
    });

    // Update selection state
    if (this.selectedObject && this.selectedObject.uuid === obj.uuid) {
      item.classList.add('selected');
    }

    this.container.appendChild(item);

    // Render children if expanded
    if (isExpanded) {
      obj.children.forEach((child) => {
        if (this.shouldShowInTree(child)) {
          this.renderTreeItem(child, depth + 1);
        }
      });
    }
  }

  private updateSelection(): void {
    this.container.querySelectorAll('.scene-tree-item').forEach((el) => {
      el.classList.remove('selected');
      if (
        this.selectedObject &&
        (el as HTMLElement).dataset.uuid === this.selectedObject.uuid
      ) {
        el.classList.add('selected');
      }
    });
  }

  // -------------------------------------------------------------------------
  // Filtering & Icons
  // -------------------------------------------------------------------------

  private shouldShowInTree(obj: THREE.Object3D): boolean {
    // Exclude internal objects
    if (obj === this.transformControls) return false;
    if (obj instanceof THREE.GridHelper) return false;
    if (obj instanceof THREE.CameraHelper) return false;
    if (obj instanceof THREE.AxesHelper) return false;
    if (obj.name === '摄像机模型') return false;
    if (obj.name?.endsWith('_helper')) return false;
    if (obj.name?.endsWith('_visual')) return false;

    // Apply filters
    if (obj instanceof THREE.Light && !this.filters.lights) return false;
    if (obj instanceof THREE.Mesh && !this.filters.models) return false;
    if (obj instanceof THREE.Camera && !this.filters.cameras) return false;

    // Only show these types
    return (
      obj instanceof THREE.Light ||
      obj instanceof THREE.Mesh ||
      obj instanceof THREE.Group ||
      obj instanceof THREE.Camera
    );
  }

  private getObjectIcon(obj: THREE.Object3D): string {
    // Meshes
    if (obj instanceof THREE.Mesh) {
      if (obj.geometry instanceof THREE.BoxGeometry) return '□';
      if (obj.geometry instanceof THREE.SphereGeometry) return '○';
      if (obj.geometry instanceof THREE.PlaneGeometry) return '▭';
      if (obj.geometry instanceof THREE.CylinderGeometry) return '▲';
      return '◆';
    }

    // Groups
    if (obj instanceof THREE.Group) return '❏';
    if (obj instanceof THREE.Scene) return '◈';

    // Cameras
    if (obj instanceof THREE.PerspectiveCamera || obj instanceof THREE.OrthographicCamera) {
      return '◎';
    }

    // Lights
    if (obj instanceof THREE.DirectionalLight) return '☀';
    if (obj instanceof THREE.PointLight) return '●';
    if (obj instanceof THREE.SpotLight) return '◐';
    if (obj instanceof THREE.AmbientLight) return '○';
    if (obj instanceof THREE.HemisphereLight) return '◑';

    return '◆';
  }

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  getFilters(): Record<FilterType, boolean> {
    return { ...this.filters };
  }

  getExpandedItems(): Set<string> {
    return new Set(this.expandedItems);
  }
}
