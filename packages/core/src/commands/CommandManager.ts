import type { Command } from './Command';

export interface CommandManagerOptions {
  /** 最大历史记录数 */
  maxHistorySize?: number;
  /** 是否启用调试日志 */
  debug?: boolean;
}

export type CommandEventType = 'execute' | 'undo' | 'redo' | 'clear' | 'change';

export interface CommandEvent {
  type: CommandEventType;
  command?: Command;
  index: number;
  canUndo: boolean;
  canRedo: boolean;
}

export type CommandEventListener = (event: CommandEvent) => void;

/**
 * 命令管理器 - 实现撤销/重做功能
 */
export class CommandManager {
  private history: Command[] = [];
  private currentIndex: number = -1;
  private maxHistorySize: number;
  private debug: boolean;
  private listeners: Map<CommandEventType, CommandEventListener[]> = new Map();
  private isExecuting: boolean = false;
  
  // 用于合并连续命令
  private lastCommandTime: number = 0;
  private mergeThreshold: number = 500; // 500ms 内的命令尝试合并

  constructor(options: CommandManagerOptions = {}) {
    this.maxHistorySize = options.maxHistorySize || 50;
    this.debug = options.debug || false;
  }

  /**
   * 执行命令
   */
  execute(command: Command): void {
    if (this.isExecuting) {
      throw new Error('Cannot execute command while processing another');
    }

    this.isExecuting = true;

    try {
      // 如果当前不在历史末尾，删除当前位置之后的所有历史
      if (this.currentIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.currentIndex + 1);
      }

      // 尝试合并命令（针对连续操作）
      const now = Date.now();
      const shouldMerge = now - this.lastCommandTime < this.mergeThreshold;
      
      if (shouldMerge && this.currentIndex >= 0) {
        const lastCommand = this.history[this.currentIndex];
        if (lastCommand.mergeWith && lastCommand.mergeWith(command)) {
          // 合并成功，直接执行并更新
          command.execute();
          this.lastCommandTime = now;
          this.emit('execute', command);
          return;
        }
      }

      // 执行新命令
      command.execute();
      
      // 添加到历史
      this.history.push(command);
      this.currentIndex++;
      this.lastCommandTime = now;

      // 限制历史大小
      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
        this.currentIndex--;
      }

      if (this.debug) {
        console.log(`[CommandManager] Execute: ${command.name}`);
      }

      this.emit('execute', command);
      this.emit('change', command);
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * 撤销
   */
  undo(): boolean {
    if (!this.canUndo()) return false;

    const command = this.history[this.currentIndex];
    command.undo();
    this.currentIndex--;

    if (this.debug) {
      console.log(`[CommandManager] Undo: ${command.name}`);
    }

    this.emit('undo', command);
    this.emit('change', command);
    return true;
  }

  /**
   * 重做
   */
  redo(): boolean {
    if (!this.canRedo()) return false;

    this.currentIndex++;
    const command = this.history[this.currentIndex];
    command.execute();

    if (this.debug) {
      console.log(`[CommandManager] Redo: ${command.name}`);
    }

    this.emit('redo', command);
    this.emit('change', command);
    return true;
  }

  /**
   * 是否可以撤销
   */
  canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  /**
   * 是否可以重做
   */
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * 获取当前历史索引
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * 获取历史长度
   */
  getHistoryLength(): number {
    return this.history.length;
  }

  /**
   * 获取历史列表
   */
  getHistory(): readonly Command[] {
    return this.history;
  }

  /**
   * 获取指定位置的命令
   */
  getCommand(index: number): Command | undefined {
    return this.history[index];
  }

  /**
   * 清空历史
   */
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
    this.lastCommandTime = 0;

    if (this.debug) {
      console.log('[CommandManager] History cleared');
    }

    this.emit('clear', undefined);
    this.emit('change', undefined);
  }

  /**
   * 获取撤销描述
   */
  getUndoDescription(): string | null {
    if (!this.canUndo()) return null;
    return this.history[this.currentIndex].name;
  }

  /**
   * 获取重做描述
   */
  getRedoDescription(): string | null {
    if (!this.canRedo()) return null;
    return this.history[this.currentIndex + 1].name;
  }

  /**
   * 注册事件监听器
   */
  on(event: CommandEventType, listener: CommandEventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);

    // 返回取消订阅函数
    return () => this.off(event, listener);
  }

  /**
   * 移除事件监听器
   */
  off(event: CommandEventType, listener: CommandEventListener): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * 触发事件
   */
  private emit(type: CommandEventType, command: Command | undefined): void {
    const event: CommandEvent = {
      type,
      command,
      index: this.currentIndex,
      canUndo: this.canUndo(),
      canRedo: this.canRedo()
    };

    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('[CommandManager] Error in listener:', error);
        }
      });
    }
  }

  /**
   * 批量执行命令（作为一个事务）
   */
  batchExecute(commands: Command[], name?: string): void {
    const { CompositeCommand } = require('./Command');
    const batch = new CompositeCommand(commands, name || 'Batch Operation');
    this.execute(batch);
  }

  /**
   * 设置合并阈值（毫秒）
   */
  setMergeThreshold(ms: number): void {
    this.mergeThreshold = ms;
  }

  /**
   * 跳到指定历史位置
   */
  jumpTo(index: number): void {
    if (index < -1 || index >= this.history.length) {
      throw new Error('Invalid history index');
    }

    // 撤销到目标位置
    while (this.currentIndex > index) {
      this.undo();
    }

    // 重做到目标位置
    while (this.currentIndex < index) {
      this.redo();
    }
  }
}

// 单例模式辅助
let globalCommandManager: CommandManager | null = null;

export function getGlobalCommandManager(): CommandManager {
  if (!globalCommandManager) {
    globalCommandManager = new CommandManager();
  }
  return globalCommandManager;
}

export function setGlobalCommandManager(manager: CommandManager): void {
  globalCommandManager = manager;
}
