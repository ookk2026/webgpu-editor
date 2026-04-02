/**
 * FEATURE: Responsive Layout System
 * Responsive Layout Manager
 * 
 * Provides VS Code-style responsive layout:
 * - Resizable panels with drag handles
 * - Responsive breakpoints (auto-collapse on small screens)
 * - Collapsible panels (click icon to expand/collapse)
 * - Percentage-based widths that adapt to window size
 * - Min/max width constraints
 */

// ============================================================================
// Types
// ============================================================================

export type PanelSide = 'left' | 'right';

export interface PanelConfig {
  minWidth: number;      // Minimum width in pixels
  maxWidth: number;      // Maximum width in pixels
  defaultWidth: number;  // Default width in pixels
  collapsedWidth: number; // Width when collapsed (icon only)
}

export interface BreakpointConfig {
  sm: number;   // Small: < 768px
  md: number;   // Medium: 768px - 1024px
  lg: number;   // Large: 1024px - 1440px
  xl: number;   // Extra large: > 1440px
}

export interface LayoutState {
  leftPanel: {
    width: number;
    collapsed: boolean;
  };
  rightPanel: {
    width: number;
    collapsed: boolean;
  };
}

// ============================================================================
// Responsive Layout Manager
// ============================================================================

export class ResponsiveLayout {
  // DOM Elements
  private container: HTMLElement;
  private leftPanel: HTMLElement;
  private rightPanel: HTMLElement;
  private centerPanel: HTMLElement;
  private leftSash: HTMLElement | null = null;
  private rightSash: HTMLElement | null = null;

  // Configuration
  private config: Record<PanelSide, PanelConfig> = {
    left: {
      minWidth: 180,
      maxWidth: 400,
      defaultWidth: 220,
      collapsedWidth: 48,
    },
    right: {
      minWidth: 260,
      maxWidth: 450,
      defaultWidth: 280,
      collapsedWidth: 48,
    },
  };

  private breakpoints: BreakpointConfig = {
    sm: 768,
    md: 1024,
    lg: 1440,
    xl: 1920,
  };

  // State
  private leftWidth: number;
  private rightWidth: number;
  private leftCollapsed = false;
  private rightCollapsed = false;
  private isResizing: PanelSide | null = null;
  private startX = 0;
  private startWidth = 0;

  // Storage key
  private storageKey = 'editor-layout-state';

  constructor() {
    // Get DOM elements
    this.container = document.getElementById('workspace')!;
    this.leftPanel = document.getElementById('scene-panel')!;
    this.rightPanel = document.getElementById('properties-panel')!;
    this.centerPanel = document.getElementById('viewport-container')!;

    // Load saved state or use defaults
    const savedState = this.loadState();
    this.leftWidth = savedState?.leftPanel?.width || this.config.left.defaultWidth;
    this.rightWidth = savedState?.rightPanel?.width || this.config.right.defaultWidth;
    this.leftCollapsed = savedState?.leftPanel?.collapsed || false;
    this.rightCollapsed = savedState?.rightPanel?.collapsed || false;

    this.init();
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

  private init(): void {
    // Setup container
    this.container.style.display = 'flex';
    this.container.style.overflow = 'hidden';

    // Setup panels
    this.setupPanel(this.leftPanel, 'left');
    this.setupPanel(this.rightPanel, 'right');
    this.setupCenterPanel();

    // Create resize sashes
    this.createSashes();

    // Apply initial layout
    this.applyLayout();

    // Listen for window resize
    window.addEventListener('resize', () => this.handleResize());

    // Initial responsive check
    this.handleResize();
  }

  private setupPanel(panel: HTMLElement, side: PanelSide): void {
    panel.style.flexShrink = '0';
    panel.style.position = 'relative';
    panel.style.transition = 'width 0.2s ease';

    // Add collapse button to panel header
    const header = side === 'left' 
      ? panel.querySelector('#scene-panel-header')
      : panel.querySelector('.panel-tabs');
    
    if (header) {
      const collapseBtn = document.createElement('button');
      collapseBtn.className = `panel-collapse-btn ${side}`;
      collapseBtn.innerHTML = side === 'left' ? '◀' : '▶';
      collapseBtn.title = side === 'left' ? '折叠面板' : '折叠面板';
      collapseBtn.style.cssText = `
        position: absolute;
        ${side === 'left' ? 'right' : 'left'}: 4px;
        top: 50%;
        transform: translateY(-50%);
        width: 20px;
        height: 20px;
        background: transparent;
        border: none;
        color: #e0e0e0;
        cursor: pointer;
        font-size: 10px;
        opacity: 0.6;
        transition: opacity 0.2s;
        z-index: 10;
      `;
      collapseBtn.addEventListener('mouseenter', () => collapseBtn.style.opacity = '1');
      collapseBtn.addEventListener('mouseleave', () => collapseBtn.style.opacity = '0.6');
      collapseBtn.addEventListener('click', () => this.togglePanel(side));
      
      (header as HTMLElement).style.position = 'relative';
      header.appendChild(collapseBtn);
    }
  }

  private setupCenterPanel(): void {
    this.centerPanel.style.flex = '1';
    this.centerPanel.style.minWidth = '300px';
    this.centerPanel.style.overflow = 'hidden';
  }

  private createSashes(): void {
    // Left sash (between left panel and center)
    this.leftSash = this.createSashElement('left');
    this.container.insertBefore(this.leftSash, this.centerPanel);

    // Right sash (between center and right panel)
    this.rightSash = this.createSashElement('right');
    this.container.appendChild(this.rightSash);

    // Setup drag events
    this.setupSashEvents(this.leftSash, 'left');
    this.setupSashEvents(this.rightSash, 'right');
  }

  private createSashElement(side: PanelSide): HTMLElement {
    const sash = document.createElement('div');
    sash.className = `sash ${side}`;
    sash.style.cssText = `
      width: 4px;
      background: transparent;
      cursor: ${side === 'left' ? 'ew-resize' : 'ew-resize'};
      flexShrink: 0;
      position: relative;
      z-index: 100;
      transition: background 0.2s;
    `;

    // Visual indicator on hover
    const indicator = document.createElement('div');
    indicator.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 2px;
      height: 40px;
      background: #555;
      border-radius: 1px;
      opacity: 0;
      transition: opacity 0.2s;
    `;
    sash.appendChild(indicator);

    sash.addEventListener('mouseenter', () => {
      sash.style.background = '#0e639c';
      indicator.style.opacity = '1';
    });
    sash.addEventListener('mouseleave', () => {
      if (!this.isResizing) {
        sash.style.background = 'transparent';
        indicator.style.opacity = '0';
      }
    });

    return sash;
  }

  private setupSashEvents(sash: HTMLElement, side: PanelSide): void {
    sash.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.isResizing = side;
      this.startX = e.clientX;
      this.startWidth = side === 'left' ? this.leftWidth : this.rightWidth;
      
      document.body.style.cursor = side === 'left' ? 'ew-resize' : 'ew-resize';
      document.body.style.userSelect = 'none';
    });

    // Touch events for mobile
    sash.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      this.isResizing = side;
      this.startX = touch.clientX;
      this.startWidth = side === 'left' ? this.leftWidth : this.rightWidth;
    }, { passive: false });
  }

  // -------------------------------------------------------------------------
  // Resize Handling
  // -------------------------------------------------------------------------

  private handleResize(): void {
    const width = window.innerWidth;
    const { sm, md } = this.breakpoints;

    // Auto-collapse on small screens
    if (width < sm) {
      // Mobile: collapse both panels
      if (!this.leftCollapsed) this.collapsePanel('left', false);
      if (!this.rightCollapsed) this.collapsePanel('right', false);
    } else if (width < md) {
      // Tablet: collapse one panel based on which is less used
      if (!this.leftCollapsed && !this.rightCollapsed) {
        this.collapsePanel('right', false);
      }
    } else {
      // Desktop: restore collapsed panels if there's space
      if (width > md + this.config.left.defaultWidth + this.config.right.defaultWidth + 400) {
        if (this.leftCollapsed) this.expandPanel('left', false);
        if (this.rightCollapsed) this.expandPanel('right', false);
      }
    }

    // Ensure panels don't exceed window width
    const maxAvailable = width - 300; // Reserve at least 300px for viewport
    const halfAvailable = maxAvailable / 2;
    
    if (this.leftWidth + this.rightWidth > maxAvailable) {
      this.leftWidth = Math.min(this.leftWidth, halfAvailable);
      this.rightWidth = Math.min(this.rightWidth, halfAvailable);
      this.applyLayout();
    }

    this.saveState();
  }

  setupGlobalEvents(): void {
    document.addEventListener('mousemove', (e) => {
      if (!this.isResizing) return;

      const delta = this.isResizing === 'left' 
        ? e.clientX - this.startX 
        : this.startX - e.clientX;
      
      const newWidth = this.startWidth + delta;
      const config = this.config[this.isResizing];

      // Apply constraints
      const clampedWidth = Math.max(config.minWidth, Math.min(config.maxWidth, newWidth));

      if (this.isResizing === 'left') {
        this.leftWidth = clampedWidth;
        this.leftCollapsed = false;
      } else {
        this.rightWidth = clampedWidth;
        this.rightCollapsed = false;
      }

      this.applyLayout();
    });

    document.addEventListener('mouseup', () => {
      if (this.isResizing) {
        this.isResizing = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // Reset sash styles
        this.leftSash!.style.background = 'transparent';
        this.rightSash!.style.background = 'transparent';
        
        this.saveState();
      }
    });

    // Touch events
    document.addEventListener('touchmove', (e) => {
      if (!this.isResizing || e.touches.length !== 1) return;
      const touch = e.touches[0];
      
      const delta = this.isResizing === 'left' 
        ? touch.clientX - this.startX 
        : this.startX - touch.clientX;
      
      const newWidth = this.startWidth + delta;
      const config = this.config[this.isResizing];
      const clampedWidth = Math.max(config.minWidth, Math.min(config.maxWidth, newWidth));

      if (this.isResizing === 'left') {
        this.leftWidth = clampedWidth;
      } else {
        this.rightWidth = clampedWidth;
      }

      this.applyLayout();
    }, { passive: false });

    document.addEventListener('touchend', () => {
      if (this.isResizing) {
        this.isResizing = null;
        this.saveState();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Layout Application
  // -------------------------------------------------------------------------

  private applyLayout(): void {
    // Left panel
    if (this.leftCollapsed) {
      this.leftPanel.style.width = `${this.config.left.collapsedWidth}px`;
      this.leftPanel.classList.add('collapsed');
    } else {
      this.leftPanel.style.width = `${this.leftWidth}px`;
      this.leftPanel.classList.remove('collapsed');
    }

    // Right panel
    if (this.rightCollapsed) {
      this.rightPanel.style.width = `${this.config.right.collapsedWidth}px`;
      this.rightPanel.classList.add('collapsed');
    } else {
      this.rightPanel.style.width = `${this.rightWidth}px`;
      this.rightPanel.classList.remove('collapsed');
    }

    // Update collapse button icons
    const leftBtn = this.leftPanel.querySelector('.panel-collapse-btn') as HTMLElement;
    const rightBtn = this.rightPanel.querySelector('.panel-collapse-btn') as HTMLElement;
    
    if (leftBtn) leftBtn.innerHTML = this.leftCollapsed ? '▶' : '◀';
    if (rightBtn) rightBtn.innerHTML = this.rightCollapsed ? '◀' : '▶';
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  collapsePanel(side: PanelSide, save = true): void {
    if (side === 'left') {
      this.leftCollapsed = true;
    } else {
      this.rightCollapsed = true;
    }
    this.applyLayout();
    if (save) this.saveState();
  }

  expandPanel(side: PanelSide, save = true): void {
    if (side === 'left') {
      this.leftCollapsed = false;
    } else {
      this.rightCollapsed = false;
    }
    this.applyLayout();
    if (save) this.saveState();
  }

  togglePanel(side: PanelSide): void {
    if (side === 'left') {
      this.leftCollapsed ? this.expandPanel('left') : this.collapsePanel('left');
    } else {
      this.rightCollapsed ? this.expandPanel('right') : this.collapsePanel('right');
    }
  }

  setPanelWidth(side: PanelSide, width: number): void {
    const config = this.config[side];
    const clamped = Math.max(config.minWidth, Math.min(config.maxWidth, width));
    
    if (side === 'left') {
      this.leftWidth = clamped;
    } else {
      this.rightWidth = clamped;
    }
    
    this.applyLayout();
    this.saveState();
  }

  getPanelWidth(side: PanelSide): number {
    return side === 'left' ? this.leftWidth : this.rightWidth;
  }

  isCollapsed(side: PanelSide): boolean {
    return side === 'left' ? this.leftCollapsed : this.rightCollapsed;
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  private saveState(): void {
    try {
      const state: LayoutState = {
        leftPanel: {
          width: this.leftWidth,
          collapsed: this.leftCollapsed,
        },
        rightPanel: {
          width: this.rightWidth,
          collapsed: this.rightCollapsed,
        },
      };
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save layout state:', e);
    }
  }

  private loadState(): LayoutState | null {
    try {
      const saved = localStorage.getItem(this.storageKey);
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  }

  resetLayout(): void {
    this.leftWidth = this.config.left.defaultWidth;
    this.rightWidth = this.config.right.defaultWidth;
    this.leftCollapsed = false;
    this.rightCollapsed = false;
    this.applyLayout();
    localStorage.removeItem(this.storageKey);
  }
}
