/**
 * FEATURE: Draggable Panel System
 * Draggable Panel Component
 * 
 * Makes any panel draggable within the workspace.
 * Supports:
 * - Drag by header/handle
 * - Boundary constraints (keeps panel within viewport)
 * - Position persistence (localStorage)
 * - Snap to edges
 */

// ============================================================================
// Types
// ============================================================================

export interface DraggablePanelOptions {
  handle?: string;           // CSS selector for drag handle (default: panel itself)
  bounds?: string;           // CSS selector for boundary container (default: window)
  snapToEdges?: boolean;     // Snap to edges when close (default: true)
  snapThreshold?: number;    // Snap distance in pixels (default: 20)
  savePosition?: boolean;    // Save position to localStorage (default: true)
  storageKey?: string;       // localStorage key (default: panel ID)
}

export interface PanelPosition {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

// ============================================================================
// Draggable Panel
// ============================================================================

export class DraggablePanel {
  private element: HTMLElement;
  private handle: HTMLElement;
  private bounds: HTMLElement | Window;
  private options: Required<DraggablePanelOptions>;
  
  private isDragging = false;
  private startPos = { x: 0, y: 0 };
  private startMouse = { x: 0, y: 0 };
  private currentPos = { x: 0, y: 0 };

  constructor(
    elementId: string,
    options: DraggablePanelOptions = {}
  ) {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`DraggablePanel: Element #${elementId} not found`);
    }

    this.element = element;
    this.options = {
      handle: options.handle || elementId,
      bounds: options.bounds || 'window',
      snapToEdges: options.snapToEdges ?? true,
      snapThreshold: options.snapThreshold ?? 20,
      savePosition: options.savePosition ?? true,
      storageKey: options.storageKey || `panel-pos-${elementId}`,
    };

    // Get handle element
    const handle = this.options.handle === elementId 
      ? element 
      : element.querySelector(this.options.handle) as HTMLElement;
    
    if (!handle) {
      throw new Error(`DraggablePanel: Handle ${this.options.handle} not found`);
    }
    this.handle = handle;

    // Get bounds element
    this.bounds = this.options.bounds === 'window' 
      ? window 
      : document.querySelector(this.options.bounds) as HTMLElement;

    this.init();
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  private init(): void {
    // Make panel position absolute/fixed for dragging
    const currentPosition = window.getComputedStyle(this.element).position;
    if (currentPosition === 'static') {
      this.element.style.position = 'absolute';
    }

    // Add drag handle cursor
    this.handle.style.cursor = 'move';
    this.handle.style.userSelect = 'none';

    // Setup event listeners
    this.handle.addEventListener('mousedown', this.onMouseDown.bind(this));
    document.addEventListener('mousemove', this.onMouseMove.bind(this));
    document.addEventListener('mouseup', this.onMouseUp.bind(this));

    // Touch events for mobile
    this.handle.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    document.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.onMouseUp.bind(this));

    // Load saved position
    if (this.options.savePosition) {
      this.loadPosition();
    }

    // Initial boundary check
    this.constrainToBounds();
  }

  // -------------------------------------------------------------------------
  // Event Handlers
  // -------------------------------------------------------------------------

  private onMouseDown(e: MouseEvent): void {
    // Don't drag if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || 
        target.tagName === 'INPUT' || 
        target.tagName === 'SELECT' ||
        target.closest('button')) {
      return;
    }

    this.isDragging = true;
    this.startMouse = { x: e.clientX, y: e.clientY };
    this.startPos = this.getPosition();

    this.element.style.zIndex = '1000';
    this.element.classList.add('dragging');

    e.preventDefault();
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;

    const dx = e.clientX - this.startMouse.x;
    const dy = e.clientY - this.startMouse.y;

    this.currentPos = {
      x: this.startPos.x + dx,
      y: this.startPos.y + dy,
    };

    this.applyPosition(this.currentPos);
  }

  private onMouseUp(): void {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.element.classList.remove('dragging');
    this.element.style.zIndex = '';

    // Snap to edges if enabled
    if (this.options.snapToEdges) {
      this.snapToEdges();
    }

    // Constrain to bounds
    this.constrainToBounds();

    // Save position
    if (this.options.savePosition) {
      this.savePosition();
    }
  }

  private onTouchStart(e: TouchEvent): void {
    if (e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    this.onMouseDown(new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY,
    }));
  }

  private onTouchMove(e: TouchEvent): void {
    if (!this.isDragging || e.touches.length !== 1) return;
    
    const touch = e.touches[0];
    this.onMouseMove(new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY,
    }));
    
    e.preventDefault();
  }

  // -------------------------------------------------------------------------
  // Position Management
  // -------------------------------------------------------------------------

  private getPosition(): PanelPosition {
    const rect = this.element.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  private applyPosition(pos: PanelPosition): void {
    this.element.style.left = `${pos.x}px`;
    this.element.style.top = `${pos.y}px`;
    this.element.style.right = 'auto';
    this.element.style.bottom = 'auto';
  }

  private constrainToBounds(): void {
    const rect = this.element.getBoundingClientRect();
    const boundsRect = this.getBoundsRect();

    let x = rect.left;
    let y = rect.top;

    // Constrain X
    if (x < boundsRect.left) x = boundsRect.left;
    if (x + rect.width > boundsRect.right) {
      x = boundsRect.right - rect.width;
    }

    // Constrain Y
    if (y < boundsRect.top) y = boundsRect.top;
    if (y + rect.height > boundsRect.bottom) {
      y = boundsRect.bottom - rect.height;
    }

    this.applyPosition({ x, y });
  }

  private snapToEdges(): void {
    const rect = this.element.getBoundingClientRect();
    const boundsRect = this.getBoundsRect();
    const threshold = this.options.snapThreshold;

    let x = rect.left;
    let y = rect.top;

    // Snap X
    if (Math.abs(x - boundsRect.left) < threshold) {
      x = boundsRect.left;
    } else if (Math.abs(x + rect.width - boundsRect.right) < threshold) {
      x = boundsRect.right - rect.width;
    }

    // Snap Y
    if (Math.abs(y - boundsRect.top) < threshold) {
      y = boundsRect.top;
    } else if (Math.abs(y + rect.height - boundsRect.bottom) < threshold) {
      y = boundsRect.bottom - rect.height;
    }

    this.applyPosition({ x, y });
  }

  private getBoundsRect(): DOMRect {
    if (this.bounds === window) {
      return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    }
    return (this.bounds as HTMLElement).getBoundingClientRect();
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  private savePosition(): void {
    try {
      const pos = this.getPosition();
      localStorage.setItem(this.options.storageKey, JSON.stringify(pos));
    } catch (e) {
      console.warn('Failed to save panel position:', e);
    }
  }

  private loadPosition(): void {
    try {
      const saved = localStorage.getItem(this.options.storageKey);
      if (saved) {
        const pos = JSON.parse(saved) as PanelPosition;
        this.applyPosition(pos);
      }
    } catch (e) {
      console.warn('Failed to load panel position:', e);
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  setPosition(x: number, y: number): void {
    this.applyPosition({ x, y });
    this.constrainToBounds();
    if (this.options.savePosition) {
      this.savePosition();
    }
  }

  resetPosition(): void {
    this.element.style.left = '';
    this.element.style.top = '';
    this.element.style.right = '';
    this.element.style.bottom = '';
    
    if (this.options.savePosition) {
      localStorage.removeItem(this.options.storageKey);
    }
  }

  enable(): void {
    this.handle.style.cursor = 'move';
  }

  disable(): void {
    this.handle.style.cursor = '';
    this.isDragging = false;
  }

  destroy(): void {
    this.disable();
    // Event listeners are automatically cleaned up when element is removed
  }
}
